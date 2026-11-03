"""Single-run replacement with genuine OOXML tracked changes.

Deliberately limited POC: one uniquely identified direct paragraph run, exact whole
w:t match, one replace operation. Splits, headers/footers, hyperlinks and nested
revisions are outside this task and must fail closed rather than silently edit.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime
from io import BytesIO
import json
from pathlib import Path
from typing import Any
from lxml import etree as ET
from zipfile import BadZipFile, ZipFile

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
DOC_PART = "word/document.xml"
SETTINGS_PART = "word/settings.xml"


def w(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"



class EditError(ValueError):
    """An unsupported or ambiguous edit must not modify the DOCX."""


def _validate_edit(edit: dict[str, Any]) -> tuple[int, str, str, str, str]:
    if not isinstance(edit, dict) or edit.get("operation") != "replace":
        raise EditError("Only the 'replace' operation is implemented")
    idx = edit.get("paragraph_index")
    if type(idx) is not int or idx < 0:
        raise EditError("paragraph_index must be a non-negative integer")
    old, new = edit.get("old_text"), edit.get("new_text")
    if not isinstance(old, str) or not old or not isinstance(new, str) or not new or old == new:
        raise EditError("old_text and new_text must be different non-empty strings")
    author = edit.get("author", "AI Law POC")
    if not isinstance(author, str) or not author.strip() or len(author) > 100:
        raise EditError("author must be a non-empty string of at most 100 characters")
    stamp = edit.get("changed_at")
    if not isinstance(stamp, str):
        raise EditError("changed_at must be an explicit ISO 8601 timestamp")
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("timezone is required")
    except ValueError as exc:
        raise EditError("changed_at must include a timezone") from exc
    return idx, old, new, author.strip(), stamp


def _next_id(root: ET.Element) -> int:
    # Over-allocating from unrelated w:id values is safer than collisions.
    ids = []
    for el in root.iter():
        if w("id") in el.attrib:
            try:
                ids.append(int(el.attrib[w("id")]))
            except ValueError:
                pass
    return max(ids, default=0) + 1


def _patch_document(data: bytes, index: int, old: str, new: str, author: str, stamp: str) -> bytes:
    root = ET.fromstring(data, parser=ET.XMLParser(resolve_entities=False, no_network=True))
    body = root.find(w("body"))
    if body is None:
        raise EditError("No WordprocessingML document body")
    # XML document order includes paragraphs inside tables, as documented.
    paragraphs = list(body.iter(w("p")))
    if index >= len(paragraphs):
        raise EditError("paragraph_index is outside the document")
    paragraph = paragraphs[index]
    matches: list[tuple[int, ET.Element]] = []
    for run_index, run in enumerate(list(paragraph)):
        if run.tag != w("r"):
            continue
        texts = [e for e in run if e.tag == w("t")]
        if len(texts) == 1 and texts[0].text == old:
            # Do not drop breaks, images, bookmarks etc from complex runs.
            if any(child.tag not in {w("rPr"), w("t")} for child in run):
                raise EditError("Target run contains unsupported content")
            matches.append((run_index, run))
    if len(matches) != 1:
        raise EditError(f"Expected exactly one whole-run match, found {len(matches)}")

    position, source = matches[0]
    start_id = _next_id(root)
    deletion = ET.Element(w("del"), {w("id"): str(start_id), w("author"): author, w("date"): stamp})
    deletion_run = deepcopy(source)
    deletion_run.find(w("t")).tag = w("delText")  # type: ignore[union-attr]
    deletion.append(deletion_run)
    insertion = ET.Element(w("ins"), {w("id"): str(start_id + 1), w("author"): author, w("date"): stamp})
    insertion_run = deepcopy(source)
    inserted_text = insertion_run.find(w("t"))
    inserted_text.text = new  # type: ignore[union-attr]
    if new[0].isspace() or new[-1].isspace():
        inserted_text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    insertion.append(insertion_run)
    paragraph.remove(source)
    paragraph.insert(position, deletion)
    paragraph.insert(position + 1, insertion)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _patch_settings(data: bytes) -> bytes:
    root = ET.fromstring(data, parser=ET.XMLParser(resolve_entities=False, no_network=True))
    if root.tag != w("settings"):
        raise EditError("Invalid settings.xml")
    # POC1 negative case (locked edits): never bypass document protection.
    # Even protection modes that permit certain Word UI actions are outside
    # this narrow patcher's supported authorisation contract.
    for protection in root.iter(w("documentProtection")):
        enforcement = protection.get(w("enforcement"), "0").strip().lower()
        if enforcement in {"1", "true", "on"}:
            raise EditError("Enforced document protection: edit is blocked")
        if enforcement not in {"0", "false", "off"}:
            raise EditError("Unknown document protection enforcement value")
    existing = root.find(w("trackRevisions"))
    if existing is None:
        root.insert(0, ET.Element(w("trackRevisions")))
    else:
        existing.attrib.pop(w("val"), None)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def apply_edit(source_docx: bytes, edit: dict[str, Any]) -> bytes:
    """Return a DOCX with one exact whole-run replacement tracked in OOXML.

    Fails with EditError on unsupported edits; input bytes are never mutated.
    """
    index, old, new, author, stamp = _validate_edit(edit)
    if not isinstance(source_docx, bytes):
        raise EditError("source_docx must be bytes")
    try:
        with ZipFile(BytesIO(source_docx), "r") as source:
            items = source.infolist()
            names = [item.filename for item in items]
            if len(set(names)) != len(names):
                raise EditError("DOCX has duplicate ZIP entries")
            if DOC_PART not in names or SETTINGS_PART not in names:
                raise EditError("DOCX must contain document.xml and settings.xml")
            # Validate protection and XML before any output is written.
            new_settings = _patch_settings(source.read(SETTINGS_PART))
            new_document = _patch_document(source.read(DOC_PART), index, old, new, author, stamp)
            dest = BytesIO()
            with ZipFile(dest, "w") as output:
                for item in items:
                    content = (new_document if item.filename == DOC_PART else
                               new_settings if item.filename == SETTINGS_PART else source.read(item))
                    output.writestr(item, content)
            return dest.getvalue()
    except (BadZipFile, KeyError, ET.XMLSyntaxError) as exc:
        raise EditError("Source is not a valid DOCX package with supported XML") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply one JSON DOCX tracked replacement (POC only)")
    parser.add_argument("input", type=Path)
    parser.add_argument("edit_json", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Output must differ from input")
    try:
        payload = json.loads(args.edit_json.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise EditError("Edit JSON must contain an object")
        changed = apply_edit(args.input.read_bytes(), payload)
        args.output.write_bytes(changed)
    except (ValueError, OSError) as exc:
        parser.exit(status=2, message=f"Error: {exc}\n")


if __name__ == "__main__":
    main()
