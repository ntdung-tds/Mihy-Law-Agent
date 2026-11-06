"""R74 UC03 scoped source-to-translation review draft, NOT user-facing E2E.

Works only on actual validated DOCX/text-PDF bytes through R68–R70 source guards.
The caller MUST verify identity, active tenant/MatterACL, file ownership and
Google Drive integrity before supplying bytes. This module has no storage or auth.
Generated DOCX is a bilingual REVIEW COPY, not a layout-preserving approved
translation of the original. No real customer data/production use.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
import re
from typing import Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler

from docx import Document

from .document_intake import inspect_document
from .source_segments import SourceDocumentError

MAX_SEGMENTS = 60
MAX_SEGMENT_CHARS = 1800
MAX_TOTAL_CHARS = 24000
SUPPORTED_LANGUAGES = {("english", "vietnamese"), ("vietnamese", "english")}
ACCOUNT = re.compile(r"^[0-9a-f]{32}$")
MODEL = "@cf/meta/m2m100-1.2b"


class UC03DraftError(ValueError):
    """Source/translation is incomplete or review export cannot be trusted."""


class SegmentTranslator(Protocol):
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        ...


@dataclass(frozen=True, slots=True)
class TranslationRow:
    ordinal: int
    source_id: str
    location: str
    original: str
    draft: str
    warnings: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TranslationReview:
    source_sha256: str
    source_format: str
    source_scope: str
    source_lang: str
    target_lang: str
    provider: str
    rows: tuple[TranslationRow, ...]
    status: str = "draft_requires_human_review"


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl):
        return None


class CloudflareM2MProvider:
    """Real Cloudflare Workers AI REST adapter with strict fixed-host/token boundary.

    A credential (never from ChatGPT Drive, GitHub, QA browser or customer data)
    must be supplied privately by an authorized deployment operator. No logging.
    """
    def __init__(self, account_id: str, token: str, *, opener=None):
        if not ACCOUNT.fullmatch(account_id) or not isinstance(token, str) or len(token) < 20:
            raise UC03DraftError("Cloudflare account or private token is not configured")
        self._url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{MODEL}"
        self._token = token
        self._opener = opener or build_opener(_NoRedirect())

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        if (source_lang, target_lang) not in SUPPORTED_LANGUAGES:
            raise UC03DraftError("Unsupported translation direction")
        if not 1 <= len(text) <= MAX_SEGMENT_CHARS:
            raise UC03DraftError("Translation segment outside bounded size")
        request = Request(self._url,
            data=json.dumps({"text": text, "source_lang": source_lang,
                             "target_lang": target_lang}, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + self._token,
                     "Content-Type": "application/json", "Accept": "application/json"},
            method="POST")
        try:
            with self._opener.open(request, timeout=20) as response:
                if response.status != 200:
                    raise UC03DraftError("Translation provider refused the request")
                raw = response.read(128_001)
                if len(raw) > 128_000:
                    raise UC03DraftError("Oversized translation response")
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise UC03DraftError("Translation provider unavailable") from exc
        try:
            data = json.loads(raw)
            translated = data["result"]["translated_text"]
        except (ValueError, KeyError, TypeError) as exc:
            raise UC03DraftError("Translation response malformed") from exc
        if data.get("success") is not True or not isinstance(translated, str):
            raise UC03DraftError("Translation provider failed")
        return translated


def prepare_translation_review(
    blob: bytes, *, filename: str, translator: SegmentTranslator,
    source_lang: str, target_lang: str, glossary: Mapping[str, str] | None = None,
) -> TranslationReview:
    """Translate EVERY source-anchored segment, all or nothing.

    Does not authorize MatterACL or certify legal accuracy. Fails closed on
    unsupported PDF/Word, source loss and suspicious provider output.
    """
    if (source_lang, target_lang) not in SUPPORTED_LANGUAGES:
        raise UC03DraftError("Unsupported translation direction")
    src = inspect_document(blob, filename=filename, source_scope="document_only")
    if len(src.segments) > MAX_SEGMENTS or sum(len(s.text) for s in src.segments) > MAX_TOTAL_CHARS:
        raise UC03DraftError("UC03 QA draft size cap exceeded")
    terms = glossary or {}
    if len(terms) > 30 or any(
        not isinstance(k, str) or not isinstance(v, str) or
        not 1 <= len(k) <= 70 or not 1 <= len(v) <= 70
        for k, v in terms.items()
    ):
        raise UC03DraftError("Invalid approved terminology input")
    rows = []
    for s in src.segments:
        if len(s.text) > MAX_SEGMENT_CHARS:
            raise UC03DraftError("Single source segment exceeds QA bound")
        result = translator.translate(s.text, source_lang, target_lang)
        if (not isinstance(result, str) or not result.strip() or
                len(result) > MAX_SEGMENT_CHARS * 4 or
                any(ord(ch) < 32 and ch not in "\n\t" for ch in result)):
            raise UC03DraftError("Provider returned missing/unsafe translation")
        warnings = tuple(
            f"Terminology review: {source!r} → {target!r}"
            for source, target in terms.items()
            if source.casefold() in s.text.casefold() and
            target.casefold() not in result.casefold()
        )
        rows.append(TranslationRow(s.ordinal, s.source_id, s.location,
                                   s.text, result, warnings))
    if [r.ordinal for r in rows] != list(range(len(src.segments))):
        raise UC03DraftError("Source anchor order mismatch")
    return TranslationReview(src.sha256, src.format, src.source_scope,
                             source_lang, target_lang,
                             type(translator).__name__, tuple(rows))


def export_review_docx(draft: TranslationReview) -> bytes:
    """Produce a REAL DOCX bilingual review sheet with anchors, not original layout.

    All human review/approval, original-file fidelity and UC03 final output
    remain separate acceptance gates.
    """
    if (draft.status != "draft_requires_human_review" or
            not draft.rows or len(draft.rows) > MAX_SEGMENTS or
            [r.ordinal for r in draft.rows] != list(range(len(draft.rows))) or
            not re.fullmatch(r"[0-9a-f]{64}", draft.source_sha256)):
        raise UC03DraftError("Untrusted or incomplete review")
    doc = Document()
    doc.add_heading("AI Law · UC03 — Translation Review Draft", 0)
    doc.add_paragraph(
        "QA REVIEW COPY — NOT an approved legal translation. "
        "Original formatting is NOT reproduced; compare every source anchor "
        "and original document before use."
    )
    doc.add_paragraph(f"Source SHA-256: {draft.source_sha256}")
    doc.add_paragraph(f"Direction: {draft.source_lang} → {draft.target_lang}")
    doc.add_paragraph(f"Source: {draft.source_format} · {draft.source_scope}")
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    for cell, title in zip(table.rows[0].cells, ("Source anchor", "Original", "Draft translation")):
        cell.text = title
    for row in draft.rows:
        cells = table.add_row().cells
        cells[0].text = row.source_id + " · " + row.location
        cells[1].text = row.original
        cells[2].text = row.draft
        if row.warnings:
            cells[2].text += "\nREVIEW FLAG: " + " | ".join(row.warnings)
    out = BytesIO()
    doc.save(out)
    return out.getvalue()
