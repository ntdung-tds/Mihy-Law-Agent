"""Offline integrity check for two DOCX files reviewed in Microsoft Word.

This is NOT a substitute for actual Word UI action or screenshot evidence.
It only verifies resulting OOXML content for the single-replacement POC1 fixture.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile, BadZipFile

from lxml import etree as ET

from poc_docx.track_changes import DOC_PART, w

REVISIONS = {w("ins"), w("del"), w("moveFrom"), w("moveTo")}


class ReviewError(ValueError):
    """Invalid or unexpected output: do not claim the static review gate passed."""


def _parts(blob: bytes) -> dict[str, bytes]:
    try:
        with ZipFile(BytesIO(blob)) as doc:
            names = doc.namelist()
            if len(names) != len(set(names)):
                raise ReviewError("DOCX contains duplicate ZIP parts")
            if DOC_PART not in names or "[Content_Types].xml" not in names:
                raise ReviewError("Missing essential DOCX parts")
            return {name: doc.read(name) for name in names}
    except (BadZipFile, KeyError, RuntimeError) as exc:
        raise ReviewError("Invalid DOCX ZIP package") from exc


def _xml(data: bytes) -> ET.Element:
    try:
        return ET.fromstring(data, parser=ET.XMLParser(resolve_entities=False, no_network=True))
    except ET.XMLSyntaxError as exc:
        raise ReviewError("Invalid OOXML content") from exc


def _paragraphs(root: ET.Element) -> list[ET.Element]:
    body = root.find(w("body"))
    if body is None:
        raise ReviewError("Missing DOCX body")
    return list(body.iter(w("p")))


def _paragraph_text(paragraph: ET.Element, *, accept: bool | None = None) -> str:
    """Read visible paragraphs, choosing original/new tracked content only in source."""
    tokens = []

    def visit(node: ET.Element) -> None:
        if node.tag == w("del") and accept is not False:
            return
        if node.tag == w("ins") and accept is not True:
            return
        if node.tag in {w("t"), w("delText")}:
            tokens.append(node.text or "")
            return
        for child in node:
            visit(child)

    visit(paragraph)
    return "".join(tokens)


def _other_story_text(parts: dict[str, bytes], kind: str) -> list[str]:
    result = []
    for name in sorted(parts):
        if name.startswith("word/" + kind) and name.endswith(".xml"):
            result.append("".join(node.text or "" for node in _xml(parts[name]).iter(w("t"))))
    return result


def _structure_signature(root: ET.Element) -> list[tuple[tuple[int, ...], ...]]:
    """Table rows/cells/paragraph counts; compare structure, not Word's layout metrics."""
    return [tuple(tuple(len(list(cell.iter(w("p")))) for cell in row.findall(w("tc")))
                  for row in table.findall(w("tr")))
            for table in root.iter(w("tbl"))]


def _numbering_signature(paragraphs: list[ET.Element]) -> list[tuple[str | None, str | None, str | None]]:
    result = []
    for p in paragraphs:
        style = p.find(f"{w('pPr')}/{w('pStyle')}")
        num_id = p.find(f"{w('pPr')}/{w('numPr')}/{w('numId')}")
        level = p.find(f"{w('pPr')}/{w('numPr')}/{w('ilvl')}")
        result.append((style.get(w("val")) if style is not None else None,
                       num_id.get(w("val")) if num_id is not None else None,
                       level.get(w("val")) if level is not None else None))
    return result


def _assert_only_one_pair(source: ET.Element, paragraphs: list[ET.Element], index: int,
                          old: str, new: str) -> None:
    revs = [e for e in source.iter() if e.tag in REVISIONS]
    if len(revs) != 2 or {e.tag for e in revs} != {w("ins"), w("del")}:
        raise ReviewError("Source must contain precisely one insertion/deletion pair")
    target = paragraphs[index]
    revisions_in_target = [e for e in target.iter() if e.tag in REVISIONS]
    if len(revisions_in_target) != 2:
        raise ReviewError("Source replacement pair is outside the target paragraph")
    deletion = next(e for e in revisions_in_target if e.tag == w("del"))
    insertion = next(e for e in revisions_in_target if e.tag == w("ins"))
    if ("".join(e.text or "" for e in deletion.iter(w("delText"))) != old or
            "".join(e.text or "" for e in insertion.iter(w("t"))) != new):
        raise ReviewError("Source revision text differs from edit specification")
    ids = (deletion.get(w("id")), insertion.get(w("id")))
    if not all(s is not None and s.isascii() and s.isdecimal() for s in ids) or ids[0] == ids[1]:
        raise ReviewError("Invalid revision IDs in source")


def check_results(tracked: bytes, accepted: bytes, rejected: bytes, edit: dict) -> dict:
    """Return static-content QA result; never claim Microsoft Word UI passed."""
    if not isinstance(edit, dict) or edit.get("operation") != "replace":
        raise ReviewError("Expected single replace specification")
    index, old, new = edit.get("paragraph_index"), edit.get("old_text"), edit.get("new_text")
    if type(index) is not int or index < 0 or not all(isinstance(v, str) and v for v in (old, new)):
        raise ReviewError("Invalid edit specification")
    blobs = {"tracked": tracked, "accepted": accepted, "rejected": rejected}
    file_parts = {name: _parts(value) for name, value in blobs.items()}
    roots = {name: _xml(parts[DOC_PART]) for name, parts in file_parts.items()}
    paragraphs = {name: _paragraphs(root) for name, root in roots.items()}
    source = paragraphs["tracked"]
    if index >= len(source):
        raise ReviewError("Target paragraph outside source document")
    _assert_only_one_pair(roots["tracked"], source, index, old, new)
    for outcome, accept in (("accepted", True), ("rejected", False)):
        target = paragraphs[outcome]
        if len(source) != len(target):
            raise ReviewError(f"{outcome}: paragraph count changed")
        if any(element.tag in REVISIONS for element in roots[outcome].iter()):
            raise ReviewError(f"{outcome}: unresolved tracked revisions remain")
        for para_index, (source_p, output_p) in enumerate(zip(source, target)):
            expected = _paragraph_text(source_p, accept=accept)
            actual = _paragraph_text(output_p)
            if actual != expected:
                raise ReviewError(f"{outcome}: paragraph {para_index} differs from expected content")
        for kind in ("header", "footer"):
            if _other_story_text(file_parts["tracked"], kind) != _other_story_text(file_parts[outcome], kind):
                raise ReviewError(f"{outcome}: {kind} text changed")
        if _structure_signature(roots["tracked"]) != _structure_signature(roots[outcome]):
            raise ReviewError(f"{outcome}: table structure changed")
        if _numbering_signature(source) != _numbering_signature(target):
            raise ReviewError(f"{outcome}: paragraph style or numbering changed")
    return {
        "static_docx_content": "PASS",
        "word_ui_accept_reject": "NOT_VERIFIED_BY_THIS_TOOL",
        "screenshot_evidence": "REQUIRED_SEPARATELY",
        "sha256": {name: sha256(blob).hexdigest() for name, blob in blobs.items()},
        "target_paragraph_index": index,
        "checked_paragraphs": len(source),
        "checked_tables": len(list(roots["tracked"].iter(w("tbl")))),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline QA of Word Accept/Reject outputs; NOT a Word UI test")
    parser.add_argument("tracked", type=Path)
    parser.add_argument("accepted", type=Path)
    parser.add_argument("rejected", type=Path)
    parser.add_argument("edit_json", type=Path)
    parser.add_argument("--report", type=Path, help="Optional local JSON report path")
    args = parser.parse_args()
    try:
        result = check_results(args.tracked.read_bytes(), args.accepted.read_bytes(),
                               args.rejected.read_bytes(), json.loads(args.edit_json.read_text(encoding="utf-8")))
        report = {"status": "STATIC_PASS", **result}
        if args.report:
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (ReviewError, OSError, ValueError) as exc:
        parser.exit(status=2, message=f"STATIC_FAIL: {exc}\n")


if __name__ == "__main__":
    main()
