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
import re
from pathlib import Path
from typing import Any
from lxml import etree as ET
from zipfile import BadZipFile, ZipFile

# XML revision w:date requires a date-time value, not every ISO string Python parses.
_REVISION_DATE = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]+)?(?:[Zz]|[+-][0-9]{2}:[0-9]{2})\Z",
    re.ASCII,
)
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
    # A Word line break/tab is a separate w:br/w:tab, not a character inside w:t.
    # The whole-run POC cannot encode structured control runs safely.
    if any(character in text for text in (old, new) for character in "\t\r\n"):
        raise EditError("Whole-run replacement contains unsupported control characters")
    author = edit.get("author", "AI Law POC")
    if not isinstance(author, str) or not author.strip() or len(author) > 100:
        raise EditError("author must be a non-empty string of at most 100 characters")
    stamp = edit.get("changed_at")
    if not isinstance(stamp, str) or not _REVISION_DATE.fullmatch(stamp):
        raise EditError("changed_at must be RFC 3339 date-time with timezone")
    try:
        normalized = stamp[:-1] + "+00:00" if stamp.endswith(("Z", "z")) else stamp
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("timezone is required")
    except ValueError as exc:
        raise EditError("changed_at must be valid RFC 3339 date-time") from exc
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


def _check_existing_revisions(root: ET.Element) -> None:
    """Fail closed on unsupported Word revision kinds and invalid insert/delete IDs."""
    unsupported = {
        w(tag) for tag in (
            "rPrChange", "pPrChange", "tblPrChange", "trPrChange",
            "tcPrChange", "sectPrChange", "numberingChange",
            "moveFrom", "moveTo", "moveFromRangeStart", "moveFromRangeEnd",
            "moveToRangeStart", "moveToRangeEnd",
            "cellIns", "cellDel", "cellMerge",
            "customXmlInsRangeStart", "customXmlInsRangeEnd",
            "customXmlDelRangeStart", "customXmlDelRangeEnd",
            "customXmlMoveFromRangeStart", "customXmlMoveFromRangeEnd",
            "customXmlMoveToRangeStart", "customXmlMoveToRangeEnd",
        )
    }
    seen: set[int] = set()
    for element in root.iter():
        if element.tag in unsupported:
            raise EditError("Document contains unsupported tracked revision kind")
        if element.tag not in {w("ins"), w("del")}:
            continue
        identifier = element.get(w("id"))
        if identifier is None or not identifier.isascii() or not identifier.isdecimal():
            raise EditError("Existing tracked revision has missing/invalid w:id")
        number = int(identifier)
        if number in seen:
            raise EditError("Existing tracked revision has duplicate w:id")
        seen.add(number)


def _check_other_story_revisions(archive: ZipFile, names: list[str]) -> None:
    """Fail closed if any other Word story/definition contains pending changes.

    This POC edits only a whole run in document.xml. Preserving existing tracked
    revisions in headers, footers, notes or definitions would make the resulting
    package impossible to fully accept/reject using the scoped static gate.
    """
    tracked_names = {
        "ins", "del", "moveFrom", "moveTo", "rPrChange", "pPrChange",
        "tblPrChange", "trPrChange", "tcPrChange", "sectPrChange",
        "numberingChange", "cellIns", "cellDel", "cellMerge",
        "moveFromRangeStart", "moveFromRangeEnd", "moveToRangeStart",
        "moveToRangeEnd", "customXmlInsRangeStart", "customXmlInsRangeEnd",
        "customXmlDelRangeStart", "customXmlDelRangeEnd",
        "customXmlMoveFromRangeStart", "customXmlMoveFromRangeEnd",
        "customXmlMoveToRangeStart", "customXmlMoveToRangeEnd",
    }
    tracked_tags = {w(name) for name in tracked_names}
    parser = ET.XMLParser(resolve_entities=False, no_network=True)
    for name in names:
        if not (name.startswith("word/") and name.endswith(".xml")) or name == DOC_PART:
            continue
        root = ET.fromstring(archive.read(name), parser=parser)
        if any(node.tag in tracked_tags for node in root.iter()):
            raise EditError(f"Existing unsupported tracked revision outside main document: {name}")


def _check_field_context(paragraphs: list[ET.Element], target: ET.Element) -> None:
    """Reject field results/instructions, including fields spanning paragraphs.

    Editing the cached display text of a field may be overwritten on recalculation.
    This narrow POC cannot reliably rewrite field semantics, so it fails closed.
    """
    field_depth = 0
    for paragraph in paragraphs:
        # A field that begins/ends in the selected paragraph, or a simple field
        # next to the selected run, is unsupported even if the run is outside it.
        if paragraph is target:
            if field_depth or any(
                child.tag in {w("fldChar"), w("instrText"), w("fldSimple")}
                for child in paragraph.iter()
            ):
                raise EditError("Cannot edit a paragraph in Word field context")
            return
        for node in paragraph.iter(w("fldChar")):
            kind = node.get(w("fldCharType"))
            if kind == "begin":
                field_depth += 1
            elif kind == "end":
                field_depth = max(0, field_depth - 1)


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
    _check_existing_revisions(root)
    _check_field_context(paragraphs, paragraph)
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


def _validate_package_basics(archive: ZipFile, names: list[str]) -> None:
    """Reject incomplete or falsely labelled OOXML containers before patching."""
    required = {DOC_PART, SETTINGS_PART, "[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels"}
    missing = sorted(required.difference(names))
    if missing:
        raise EditError("DOCX missing required package part(s): " + ", ".join(missing))
    content_ns = "http://schemas.openxmlformats.org/package/2006/content-types"
    relation_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    parser = ET.XMLParser(resolve_entities=False, no_network=True)
    types = ET.fromstring(archive.read("[Content_Types].xml"), parser=parser)
    rels = ET.fromstring(archive.read("_rels/.rels"), parser=parser)
    if types.tag != f"{{{content_ns}}}Types" or rels.tag != f"{{{relation_ns}}}Relationships":
        raise EditError("DOCX package has invalid content-type or relationship root")
    office_rel_type = (
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    )
    main_links = [
        link for link in rels
        if link.tag == f"{{{relation_ns}}}Relationship"
        and link.get("Type") == office_rel_type
    ]
    if (len(main_links) != 1
            or main_links[0].get("Target") not in {"word/document.xml", "/word/document.xml"}
            or main_links[0].get("TargetMode", "Internal") != "Internal"):
        raise EditError("DOCX must have one internal officeDocument relationship to word/document.xml")
    document_rels = ET.fromstring(archive.read("word/_rels/document.xml.rels"), parser=parser)
    if document_rels.tag != f"{{{relation_ns}}}Relationships":
        raise EditError("DOCX has invalid document.xml relationship root")
    settings_rel_type = (
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"
    )
    settings_links = [link for link in document_rels
                      if link.tag == f"{{{relation_ns}}}Relationship"
                      and link.get("Type") == settings_rel_type]
    if (len(settings_links) != 1
            or settings_links[0].get("Target") not in {"settings.xml", "/word/settings.xml"}
            or settings_links[0].get("TargetMode", "Internal") != "Internal"):
        raise EditError("DOCX must have one internal settings relationship")
    def require_unique_type(part_name: str, content_type: str) -> None:
        declarations = [node for node in types
                        if node.tag == f"{{{content_ns}}}Override"
                        and node.get("PartName") == part_name]
        if len(declarations) != 1 or declarations[0].get("ContentType") != content_type:
            raise EditError(f"DOCX must have one correct content type for {part_name}")

    require_unique_type(
        "/word/document.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    )
    require_unique_type(
        "/word/settings.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
    )


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
            _validate_package_basics(source, names)
            _check_other_story_revisions(source, names)
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
