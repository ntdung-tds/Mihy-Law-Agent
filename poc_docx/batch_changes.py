"""Small atomic multi-replacement Track Changes POC for synthetic Word fixtures.

A selected edit must identify exactly one direct whole-run text node. At most five
selected replacements are supported in one DOCX; unsupported edits fail closed.
This is NOT the full TC02C application workflow or a Microsoft Word UI test.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
from typing import Any
from zipfile import BadZipFile, ZipFile

from lxml import etree as ET

from poc_docx.track_changes import (
    DOC_PART,
    SETTINGS_PART,
    EditError,
    _check_existing_revisions,
    _check_field_context,
    _next_id,
    _patch_settings,
    _validate_edit,
    w,
)

_MAX_EDITS = 5


def _patch_document_batch(data: bytes, specs: list[tuple[int, str, str, str, str]]) -> bytes:
    root = ET.fromstring(data, parser=ET.XMLParser(resolve_entities=False, no_network=True))
    body = root.find(w("body"))
    if body is None:
        raise EditError("No WordprocessingML document body")
    paragraphs = list(body.iter(w("p")))
    _check_existing_revisions(root)

    # Resolve *every* target against the original document before mutating it.
    selected: list[tuple[ET.Element, ET.Element, str, str, str]] = []
    occupied: set[tuple[int, int]] = set()
    for index, old, new, author, stamp in specs:
        if index >= len(paragraphs):
            raise EditError("paragraph_index is outside the document")
        paragraph = paragraphs[index]
        _check_field_context(paragraphs, paragraph)
        matches: list[tuple[int, ET.Element]] = []
        for position, run in enumerate(paragraph):
            if run.tag != w("r"):
                continue
            texts = [child for child in run if child.tag == w("t")]
            if len(texts) == 1 and texts[0].text == old:
                if any(child.tag not in {w("rPr"), w("t")} for child in run):
                    raise EditError("Target run contains unsupported content")
                matches.append((position, run))
        if len(matches) != 1:
            raise EditError(f"Expected exactly one whole-run match, found {len(matches)}")
        position, run = matches[0]
        key = (index, position)
        if key in occupied:
            raise EditError("Multiple selected edits target the same run")
        occupied.add(key)
        selected.append((paragraph, run, new, author, stamp))

    next_id = _next_id(root)
    for j, (paragraph, source, new, author, stamp) in enumerate(selected):
        position = paragraph.index(source)
        deletion = ET.Element(w("del"), {
            w("id"): str(next_id + 2 * j), w("author"): author, w("date"): stamp,
        })
        deletion_run = deepcopy(source)
        old_text = deletion_run.find(w("t"))
        assert old_text is not None  # established by the validated whole-run selection
        old_text.tag = w("delText")
        deletion.append(deletion_run)

        insertion = ET.Element(w("ins"), {
            w("id"): str(next_id + 2 * j + 1), w("author"): author, w("date"): stamp,
        })
        insertion_run = deepcopy(source)
        new_text = insertion_run.find(w("t"))
        assert new_text is not None
        new_text.text = new
        if new[0].isspace() or new[-1].isspace():
            new_text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        insertion.append(insertion_run)

        # Preserve the original run's inter-element whitespace/tail placement.
        insertion.tail = source.tail
        paragraph.remove(source)
        paragraph.insert(position, deletion)
        paragraph.insert(position + 1, insertion)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def apply_batch(source_docx: bytes, edits: list[dict[str, Any]]) -> bytes:
    """Apply 1..5 distinct selected tracked replacements atomically to a DOCX.

    Every target is checked before the output ZIP is created. Input bytes remain
    unchanged even when a later edit is invalid; no partial result is returned.
    """
    if not isinstance(edits, list) or not 1 <= len(edits) <= _MAX_EDITS:
        raise EditError(f"edits must contain 1..{_MAX_EDITS} selected replacements")
    specs = [_validate_edit(edit) for edit in edits]
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
            new_settings = _patch_settings(source.read(SETTINGS_PART))
            new_document = _patch_document_batch(source.read(DOC_PART), specs)
            output = BytesIO()
            with ZipFile(output, "w") as archive:
                for item in items:
                    data = (new_document if item.filename == DOC_PART else
                            new_settings if item.filename == SETTINGS_PART else source.read(item))
                    archive.writestr(item, data)
            return output.getvalue()
    except (BadZipFile, KeyError, ET.XMLSyntaxError) as exc:
        raise EditError("Source is not a valid DOCX package with supported XML") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="POC1 selected DOCX Track Changes (1..5 edits)")
    parser.add_argument("input", type=Path)
    parser.add_argument("edits_json", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Output must differ from input")
    try:
        payload = json.loads(args.edits_json.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or set(payload) != {"edits"}:
            raise EditError("Expected a JSON object with only the 'edits' array")
        result = apply_batch(args.input.read_bytes(), payload["edits"])
        args.output.write_bytes(result)
    except (OSError, ValueError) as exc:
        parser.exit(status=2, message=f"Error: {exc}\n")


if __name__ == "__main__":
    main()
