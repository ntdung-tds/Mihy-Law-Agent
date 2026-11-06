"""R69: bounded text-only PDF extraction with original-page line anchors.

Image/scanned/encrypted/interactive PDFs are rejected, not misrepresented as
fully extracted. This is local document processing, NOT OCR or AI review.
Callers MUST authorize tenant, matter, provenance and storage before reading.
"""
from __future__ import annotations

from io import BytesIO
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .source_segments import SourceDocumentError, SourceSegment, MAX_TEXT_CHARS, MAX_SEGMENTS

MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_PAGES = 50
MAX_PAGE_CHARS = 60_000


def _unsafe_catalog(catalog) -> bool:
    """Reject dynamic/active PDF content rather than pretending it is source text."""
    if any(k in catalog for k in ("/OpenAction", "/AA", "/AcroForm")):
        return True
    names = catalog.get("/Names")
    if names is not None:
        name_tree = names.get_object()
        if any(k in name_tree for k in ("/EmbeddedFiles", "/JavaScript")):
            return True
    return False


def extract_pdf_segments(blob: bytes, *, source_scope: str) -> tuple[SourceSegment, ...]:
    """Extract visible text-only pages; `p{page}:l{line}` anchors are 1-based.

    Plain PDF text has no guaranteed reading order or DOCX-like table structure.
    Downstream translation requires review of page layout and source integrity.
    """
    if source_scope != "document_only":
        raise SourceDocumentError("Explicit document_only source scope is required")
    if not isinstance(blob, bytes) or not blob or len(blob) > MAX_PDF_BYTES:
        raise SourceDocumentError("Expected bounded PDF bytes")
    if not re.match(br"\A%PDF-1\.[0-7]|\A%PDF-2\.0", blob[:8]):
        raise SourceDocumentError("Invalid PDF signature")
    if b"%%EOF" not in blob[-256:]:
        raise SourceDocumentError("Missing PDF end marker")
    try:
        reader = PdfReader(BytesIO(blob), strict=True)
        if reader.is_encrypted:
            raise SourceDocumentError("Encrypted PDF requires a separate approved workflow")
        if _unsafe_catalog(reader.trailer["/Root"].get_object()):
            raise SourceDocumentError("Interactive PDF and embedded files are unsupported")
        pages = reader.pages
        if not 1 <= len(pages) <= MAX_PAGES:
            raise SourceDocumentError("Unsupported PDF page count")
        result: list[SourceSegment] = []
        chars = 0
        for page_index, page in enumerate(pages, 1):
            if page.get("/Annots") or page.get("/AA"):
                raise SourceDocumentError("PDF with annotations is unsupported")
            # Includes inline images and images nested inside Form XObjects.
            if list(page.images):
                raise SourceDocumentError("Image or scanned PDF needs OCR and human verification")
            raw = page.extract_text(extraction_mode="layout")
            if not isinstance(raw, str) or not raw.strip():
                raise SourceDocumentError("PDF page lacks extractable text; OCR needed")
            if len(raw) > MAX_PAGE_CHARS:
                raise SourceDocumentError("PDF page has excessive text")
            # Keep meaningful layout, including indentation; remove only blank rows.
            for line_index, line in enumerate(raw.splitlines(), 1):
                if not line.strip():
                    continue
                if "\ufffd" in line or any((ord(ch) < 32 and ch not in "\t") for ch in line):
                    raise SourceDocumentError("PDF has undecodable or control characters")
                chars += len(line)
                if chars > MAX_TEXT_CHARS or len(result) >= MAX_SEGMENTS:
                    raise SourceDocumentError("PDF extracted text exceeds limits")
                result.append(SourceSegment(len(result), f"p{page_index}:l{line_index}", line, "pdf_page_line"))
        if not result:
            raise SourceDocumentError("PDF has no extractable text")
        return tuple(result)
    except SourceDocumentError:
        raise
    except (PdfReadError, ValueError, TypeError, KeyError, IndexError, RecursionError, OSError) as exc:
        raise SourceDocumentError("PDF cannot be parsed safely") from exc
