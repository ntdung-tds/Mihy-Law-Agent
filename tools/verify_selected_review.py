"""Offline integrity gate for a 1..5-edit DOCX with mixed Accept/Reject.

This verifies the RESULTING OOXML only. It does not prove Microsoft Word was used.
A genuine Word resave may change metadata and require manual adjudication.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile

from lxml import etree as ET

from poc_docx.track_changes import _validate_edit, _validate_package_basics, EditError, w, DOC_PART
from tools.verify_word_review import (
    REVISIONS, ReviewError, _parts, _xml, _paragraphs, _paragraph_text,
    _run_format_signature, _paragraph_nontext_signature, _numbering_signature,
    _document_envelope_signature, _other_story_signature,
    _assert_nontext_content_safe, _structure_signature, _normalized_xml,
)


def _pair_text(node: ET.Element, tag: str) -> str:
    return "".join(text.text or "" for text in node.iter(w(tag)))


def _checked_parts(blob: bytes) -> dict[str, bytes]:
    """Fail closed if either supplied DOCX is missing required Office structure.

    Result comparison against an equally damaged source must not earn PASS.
    This reuses the package contract of the controlled POC1 generator.
    """
    found = _parts(blob)
    try:
        with ZipFile(BytesIO(blob)) as archive:
            _validate_package_basics(archive, list(found))
    except (EditError, ET.XMLSyntaxError) as exc:
        raise ReviewError("Malformed DOCX package: missing or invalid Office relationships/types") from exc
    return found


def _paragraph_identity_signature(paragraph: ET.Element) -> tuple:
    """Protect nonvolatile paragraph attributes, such as Word paragraph IDs."""
    return tuple(sorted((key, value) for key, value in paragraph.attrib.items()
                        if not key.startswith(w("rsid"))))


def _display_text_with_xml_space(paragraph: ET.Element) -> str:
    """Compare the visible space semantics of w:t, not only raw text strings.

    A leading/trailing space in a w:t is preserved only with xml:space="preserve".
    Word may split or merge runs, so compare the effective stream, not runs.
    """
    xml_space = "{http://www.w3.org/XML/1998/namespace}space"
    pieces: list[str] = []
    for node in paragraph.iter(w("t")):
        value = node.text or ""
        pieces.append(value if node.get(xml_space) == "preserve" else value.strip())
    return "".join(pieces)


def check_selected_review(tracked: bytes, reviewed: bytes,
                          edits: list[dict[str, Any]], accepted_indices: list[int]) -> dict:
    """Require an exact mixed review of every selected edit; no implicit UI PASS."""
    if not isinstance(edits, list) or not 1 <= len(edits) <= 5:
        raise ReviewError("Expected 1..5 selected replacements")
    try:
        specs = [_validate_edit(edit) for edit in edits]
    except (ValueError, TypeError) as exc:
        raise ReviewError("Invalid selected edit specification") from exc
    if (not isinstance(accepted_indices, list) or
            any(type(i) is not int or not 0 <= i < len(specs) for i in accepted_indices) or
            len(set(accepted_indices)) != len(accepted_indices)):
        raise ReviewError("accepted_indices must be unique, valid zero-based edit indices")
    accepted = set(accepted_indices)
    blobs = {"tracked": tracked, "reviewed": reviewed}
    parts = {key: _checked_parts(value) for key, value in blobs.items()}
    tracked_root = _xml(parts["tracked"][DOC_PART])
    reviewed_root = _xml(parts["reviewed"][DOC_PART])
    tracked_paragraphs = _paragraphs(tracked_root)
    revs = [node for node in tracked_root.iter() if node.tag in REVISIONS]
    if len(revs) != 2 * len(specs):
        raise ReviewError("Tracked DOCX contains unexpected revision count")
    seen_ids: set[int] = set()
    for node in revs:
        identity = node.get(w("id"))
        if identity is None or not identity.isascii() or not identity.isdecimal():
            raise ReviewError("Tracked DOCX has invalid revision ID")
        number = int(identity)
        if number in seen_ids:
            raise ReviewError("Tracked DOCX has duplicate revision ID")
        seen_ids.add(number)
    # Validate every revision pair before using its content as the expected answer.
    occupied: set[str] = set()
    pairs: list[tuple[str, str, bool]] = []
    for selected_index, (index, old, new, author, stamp) in enumerate(specs):
        if index >= len(tracked_paragraphs):
            raise ReviewError("Selected paragraph outside tracked DOCX")
        children = list(tracked_paragraphs[index])
        matches: list[tuple[ET.Element, ET.Element]] = []
        for pos in range(len(children) - 1):
            deletion, insertion = children[pos], children[pos + 1]
            if deletion.tag != w("del") or insertion.tag != w("ins"):
                continue
            if _pair_text(deletion, "delText") == old and _pair_text(insertion, "t") == new:
                if (deletion.get(w("author")) != author or insertion.get(w("author")) != author or
                        deletion.get(w("date")) != stamp or insertion.get(w("date")) != stamp):
                    raise ReviewError("Revision author/date differs from selected edit")
                if (len(deletion) != 1 or len(insertion) != 1 or
                        deletion[0].tag != w("r") or insertion[0].tag != w("r")):
                    raise ReviewError("Unsupported tracked revision body")
                # The scoped generator changes only the text of one run. A
                # different insertion style or hidden extra nodes in a source
                # revision must not be accepted as part of a trustworthy edit.
                for revision, text_tag in ((deletion, w("delText")),
                                           (insertion, w("t"))):
                    child_tags = [child.tag for child in revision[0]]
                    if child_tags not in ([text_tag], [w("rPr"), text_tag]):
                        raise ReviewError("Tracked revision run contains unsupported content")
                if _normalized_xml(deletion[0].find(w("rPr"))) != _normalized_xml(insertion[0].find(w("rPr"))):
                    raise ReviewError("Tracked revision pair run formatting differs")
                matches.append((deletion, insertion))
        if len(matches) != 1:
            raise ReviewError("Expected one adjacent tracked pair per selected edit")
        deletion, insertion = matches[0]
        del_id, ins_id = deletion.get(w("id")), insertion.get(w("id"))
        if del_id in occupied or ins_id in occupied:
            raise ReviewError("Duplicate selected revision target")
        occupied.update((del_id, ins_id))
        pairs.append((del_id, ins_id, selected_index in accepted))
    if len(occupied) != len(revs):
        raise ReviewError("Tracked DOCX has unselected or unsupported revisions")
    # Check all Word story parts, not just document.xml: an unresolved
    # insertion in a header must not be silently labelled fully reviewed.
    for part_name, raw in parts["reviewed"].items():
        if part_name.startswith("word/") and part_name.endswith(".xml"):
            if any(node.tag in REVISIONS for node in _xml(raw).iter()):
                raise ReviewError(f"Reviewed DOCX contains unresolved revisions in {part_name}")
    expected_root = deepcopy(tracked_root)
    # Construct the expected mixed outcome independently, preserving formatting.
    for del_id, ins_id, keep_insertion in pairs:
        deletion = next(node for node in expected_root.iter(w("del"))
                        if node.get(w("id")) == del_id)
        insertion = next(node for node in expected_root.iter(w("ins"))
                         if node.get(w("id")) == ins_id)
        paragraph = deletion.getparent()
        if paragraph is None or paragraph is not insertion.getparent():
            raise ReviewError("Tracked pair is no longer in one paragraph")
        position = paragraph.index(deletion)
        chosen = insertion if keep_insertion else deletion
        run = deepcopy(chosen[0])
        for text in run.iter(w("delText")):
            text.tag = w("t")
        run.tail = insertion.tail
        paragraph.remove(insertion)
        paragraph.remove(deletion)
        paragraph.insert(position, run)
    expected = _paragraphs(expected_root)
    actual = _paragraphs(reviewed_root)
    if len(expected) != len(actual):
        raise ReviewError("Reviewed DOCX paragraph count changed")
    for index, (left, right) in enumerate(zip(expected, actual)):
        if _paragraph_text(left) != _paragraph_text(right):
            raise ReviewError(f"Reviewed paragraph {index} differs from selected decisions")
        if _paragraph_identity_signature(left) != _paragraph_identity_signature(right):
            raise ReviewError(f"Reviewed paragraph {index} identity attributes changed")
        if _display_text_with_xml_space(left) != _display_text_with_xml_space(right):
            raise ReviewError(f"Reviewed paragraph {index} whitespace preservation changed")
        if _run_format_signature(left) != _run_format_signature(right):
            raise ReviewError(f"Reviewed paragraph {index} formatting changed")
        if _paragraph_nontext_signature(left) != _paragraph_nontext_signature(right):
            raise ReviewError(f"Reviewed paragraph {index} non-text structure changed")
    if _numbering_signature(expected) != _numbering_signature(actual):
        raise ReviewError("Reviewed DOCX numbering changed")
    if _document_envelope_signature(expected_root) != _document_envelope_signature(reviewed_root):
        raise ReviewError("Reviewed DOCX page/section setup changed")
    if _structure_signature(expected_root) != _structure_signature(reviewed_root):
        raise ReviewError("Reviewed DOCX table layout or structure changed")
    for kind in ("header", "footer", "footnotes", "endnotes", "comments"):
        if _other_story_signature(parts["tracked"], kind) != _other_story_signature(parts["reviewed"], kind):
            raise ReviewError(f"Reviewed DOCX {kind} story changed")
    _assert_nontext_content_safe(parts["tracked"], parts["reviewed"], "reviewed")
    return {
        "static_docx_content": "PASS",
        "microsoft_word_ui": "NOT_VERIFIED_BY_THIS_TOOL",
        "accepted_indices": sorted(accepted),
        "rejected_indices": [i for i in range(len(specs)) if i not in accepted],
        "checked_edits": len(specs),
        "checked_paragraphs": len(expected),
        "sha256": {name: sha256(blob).hexdigest() for name, blob in blobs.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Static mixed Word review QA; does NOT run Word UI")
    parser.add_argument("tracked", type=Path)
    parser.add_argument("reviewed", type=Path)
    parser.add_argument("selected_edits", type=Path, help="JSON with exactly an edits array")
    parser.add_argument("decisions", type=Path, help="JSON with accepted_indices array")
    args = parser.parse_args()
    try:
        edits_data = json.loads(args.selected_edits.read_text(encoding="utf-8"))
        decisions = json.loads(args.decisions.read_text(encoding="utf-8"))
        if not isinstance(edits_data, dict) or set(edits_data) != {"edits"}:
            raise ReviewError("selected_edits JSON requires exactly 'edits'")
        if not isinstance(decisions, dict) or set(decisions) != {"accepted_indices"}:
            raise ReviewError("decisions JSON requires exactly 'accepted_indices'")
        result = check_selected_review(args.tracked.read_bytes(), args.reviewed.read_bytes(),
                                       edits_data["edits"], decisions["accepted_indices"])
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, TypeError) as exc:
        parser.exit(status=2, message=f"STATIC_FAIL: {exc}\n")


if __name__ == "__main__":
    main()
