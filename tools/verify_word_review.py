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

from poc_docx.track_changes import DOC_PART, w, _validate_edit, _validate_package_basics, EditError

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


def _checked_parts(blob: bytes) -> dict[str, bytes]:
    """Validate each standalone DOCX before comparing it to any other file."""
    found = _parts(blob)
    try:
        with ZipFile(BytesIO(blob)) as archive:
            _validate_package_basics(archive, list(found))
    except (EditError, ET.XMLSyntaxError) as exc:
        raise ReviewError("Invalid DOCX package contract: missing/invalid Office parts or relationships") from exc
    return found


def _paragraph_identity_signature(paragraph: ET.Element) -> tuple:
    """Guard stable paragraph attributes including paraId; allow Word rsid noise."""
    return tuple(sorted((key, value) for key, value in paragraph.attrib.items()
                        if not key.startswith(w("rsid"))))


def _visible_space_stream(paragraph: ET.Element) -> str:
    """Normalize w:t as Word displays spaces when xml:space=preserve is absent."""
    xml_space = "{http://www.w3.org/XML/1998/namespace}space"
    result: list[str] = []
    for node in paragraph.iter(w("t")):
        value = node.text or ""
        result.append(value if node.get(xml_space) == "preserve" else value.strip())
    return "".join(result)


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


def _other_story_signature(parts: dict[str, bytes], kind: str) -> dict[str, tuple | None]:
    """Check the complete OOXML of related stories, not only their visible text."""
    return {name: _normalized_xml(_xml(data)) for name, data in parts.items()
            if name.startswith("word/" + kind) and name.endswith(".xml")}


def _structure_signature(root: ET.Element) -> list[tuple]:
    """Compare table topology *and* styling/layout; a width change is not harmless."""
    return [
        (
            tuple(tuple(len(list(cell.iter(w("p")))) for cell in row.findall(w("tc")))
                  for row in table.findall(w("tr"))),
            _normalized_xml(table.find(w("tblPr"))),
            _normalized_xml(table.find(w("tblGrid"))),
            tuple((_normalized_xml(row.find(w("trPr"))),
                   tuple(_normalized_xml(cell.find(w("tcPr"))) for cell in row.findall(w("tc"))))
                  for row in table.findall(w("tr"))),
        )
        for table in root.iter(w("tbl"))
    ]


def _document_envelope_signature(root: ET.Element) -> tuple:
    """Protect section/page setup and other content outside paragraph/table bodies."""
    outer = []
    for child in root:
        if child.tag != w("body"):
            outer.append(_normalized_xml(child))
            continue
        body_attrs = tuple(sorted((key, value) for key, value in child.attrib.items()
                                  if not key.startswith(w("rsid"))))
        extras = tuple(_normalized_xml(node) for node in child
                       if node.tag not in {w("p"), w("tbl")})
        outer.append((w("body"), body_attrs, extras))
    root_attrs = tuple(sorted((key, value) for key, value in root.attrib.items()
                              if not key.startswith(w("rsid"))))
    return (root.tag, root_attrs, tuple(outer))


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


def _normalized_xml(node: ET.Element | None) -> tuple | None:
    """Prefix-independent signature; ignore serializer-only indentation and Word rsid."""
    if node is None:
        return None
    attrs = tuple(sorted((key, value) for key, value in node.attrib.items()
                         if not key.startswith(w("rsid"))))
    raw_text = node.text or ""
    if not raw_text.strip() and node.tag not in {w("t"), w("delText"), w("instrText")}:
        raw_text = ""
    return (node.tag, attrs, raw_text, tuple(_normalized_xml(child) for child in node))


def _run_format_signature(paragraph: ET.Element, accept: bool | None = None) -> tuple:
    """Compare run formatting even when Word splits/merges same-format runs."""
    segments: list[tuple[str, tuple | None]] = []

    def visit(node: ET.Element) -> None:
        if node.tag == w("del") and accept is not False:
            return
        if node.tag == w("ins") and accept is not True:
            return
        if node.tag == w("r"):
            text = "".join(n.text or "" for n in node if n.tag in {w("t"), w("delText")})
            if text:
                signature = _normalized_xml(node.find(w("rPr")))
                if segments and segments[-1][1] == signature:
                    previous, fmt = segments[-1]
                    segments[-1] = (previous + text, fmt)
                else:
                    segments.append((text, signature))
            return
        for child in node:
            visit(child)

    visit(paragraph)
    return (_normalized_xml(paragraph.find(w("pPr"))), tuple(segments))


def _paragraph_nontext_signature(paragraph: ET.Element, accept: bool | None = None) -> tuple:
    """Preserve tab/break/drawing/bookmark/hyperlink markers and their text offsets."""
    markers: list[tuple] = []
    offset = 0

    def visit(node: ET.Element) -> None:
        nonlocal offset
        if node.tag == w("del") and accept is not False:
            return
        if node.tag == w("ins") and accept is not True:
            return
        if node.tag in {w("t"), w("delText")}:
            offset += len(node.text or "")
            return
        if node.tag in {w("pPr"), w("rPr")}:
            return
        if node.tag in {w("p"), w("r"), w("ins"), w("del")}:
            for child in node:
                visit(child)
            return
        if node.tag in {w("hyperlink"), w("sdtContent")}:
            markers.append((offset, node.tag, tuple(sorted(node.attrib.items()))))
            for child in node:
                visit(child)
            return
        markers.append((offset, _normalized_xml(node)))

    visit(paragraph)
    return tuple(markers)


def _assert_nontext_content_safe(source_parts: dict[str, bytes], result_parts: dict[str, bytes],
                                 outcome: str) -> None:
    """Strictly guard every non-document part, including metadata and app settings.

    Word may legitimately update metadata on save. In that case the result needs
    manual review; an unexplained changed ZIP part must never earn STATIC_PASS.
    """
    known_definitions = lambda name: (
        name in {"word/styles.xml", "word/numbering.xml", "word/fontTable.xml", "[Content_Types].xml"}
        or name.startswith("word/theme/")
        or name.startswith("word/media/")
        or (name.startswith("word/") and name.endswith(".rels"))
    )
    for part in sorted(set(source_parts) | set(result_parts)):
        if part == DOC_PART:
            continue  # DOC_PART is verified by the paragraph and envelope checks.
        if part not in source_parts or part not in result_parts:
            raise ReviewError(f"{outcome}: protected package part missing/added: {part}")
        old, new = source_parts[part], result_parts[part]
        if old == new:
            continue
        if part.endswith((".xml", ".rels")):
            changed = _normalized_xml(_xml(old)) != _normalized_xml(_xml(new))
        else:
            changed = old != new
        if changed:
            reason = ("protected package definition changed" if known_definitions(part)
                      else "protected package part changed")
            raise ReviewError(f"{outcome}: {reason}: {part}")


def _assert_only_one_pair(source: ET.Element, paragraphs: list[ET.Element], index: int,
                          old: str, new: str, author: str, stamp: str) -> None:
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
    if (deletion.getparent() is not target or insertion.getparent() is not target
            or target.index(insertion) != target.index(deletion) + 1):
        raise ReviewError("Source revision pair must be adjacent direct paragraph children")
    if (deletion.get(w("author")) != author or insertion.get(w("author")) != author
            or deletion.get(w("date")) != stamp or insertion.get(w("date")) != stamp):
        raise ReviewError("Source revision author/date differs from edit specification")
    for revision, text_tag in ((deletion, w("delText")), (insertion, w("t"))):
        if len(revision) != 1 or revision[0].tag != w("r"):
            raise ReviewError("Source unsupported revision run content")
        tags = [node.tag for node in revision[0]]
        if tags not in ([text_tag], [w("rPr"), text_tag]):
            raise ReviewError("Source unsupported revision run content")
    if _normalized_xml(deletion[0].find(w("rPr"))) != _normalized_xml(insertion[0].find(w("rPr"))):
        raise ReviewError("Source revision insertion/deletion formatting mismatch")
    ids = (deletion.get(w("id")), insertion.get(w("id")))
    if not all(s is not None and s.isascii() and s.isdecimal() for s in ids) or ids[0] == ids[1]:
        raise ReviewError("Invalid revision IDs in source")


def check_results(tracked: bytes, accepted: bytes, rejected: bytes, edit: dict) -> dict:
    """Return static-content QA result; never claim Microsoft Word UI passed."""
    try:
        index, old, new, author, stamp = _validate_edit(edit)
    except (EditError, TypeError) as exc:
        raise ReviewError("Invalid edit specification") from exc
    blobs = {"tracked": tracked, "accepted": accepted, "rejected": rejected}
    file_parts = {name: _checked_parts(value) for name, value in blobs.items()}
    roots = {name: _xml(parts[DOC_PART]) for name, parts in file_parts.items()}
    paragraphs = {name: _paragraphs(root) for name, root in roots.items()}
    source = paragraphs["tracked"]
    if index >= len(source):
        raise ReviewError("Target paragraph outside source document")
    _assert_only_one_pair(roots["tracked"], source, index, old, new, author, stamp)
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
            if _paragraph_identity_signature(source_p) != _paragraph_identity_signature(output_p):
                raise ReviewError(f"{outcome}: paragraph {para_index} identity attributes changed")
            # For the targeted paragraph, resolve source revisions to the chosen
            # text before checking rendered leading/trailing whitespace semantics.
            if para_index == index:
                expected_root = ET.fromstring(ET.tostring(source_p))
                for rev in list(expected_root):
                    if rev.tag not in {w("ins"), w("del")}:
                        continue
                    keep = (rev.tag == w("ins")) == accept
                    position = expected_root.index(rev)
                    expected_root.remove(rev)
                    if keep:
                        chosen_run = rev[0]
                        for node in chosen_run.iter(w("delText")):
                            node.tag = w("t")
                        expected_root.insert(position, chosen_run)
                expected_para = expected_root
            else:
                expected_para = source_p
            if _visible_space_stream(expected_para) != _visible_space_stream(output_p):
                raise ReviewError(f"{outcome}: paragraph {para_index} whitespace preservation changed")
        if _document_envelope_signature(roots["tracked"]) != _document_envelope_signature(roots[outcome]):
            raise ReviewError(f"{outcome}: document envelope changed (section/page setup)")
        if _numbering_signature(source) != _numbering_signature(target):
            raise ReviewError(f"{outcome}: paragraph style or numbering changed")
        for para_index, (source_p, output_p) in enumerate(zip(source, target)):
            if _run_format_signature(source_p, accept=accept) != _run_format_signature(output_p):
                raise ReviewError(f"{outcome}: paragraph {para_index} run/paragraph formatting changed")
            if _paragraph_nontext_signature(source_p, accept=accept) != _paragraph_nontext_signature(output_p):
                raise ReviewError(f"{outcome}: paragraph {para_index} non-text structure changed")
        for kind in ("header", "footer", "footnotes", "endnotes", "comments"):
            if _other_story_signature(file_parts["tracked"], kind) != _other_story_signature(file_parts[outcome], kind):
                raise ReviewError(f"{outcome}: {kind} story XML changed (text or formatting)")
        _assert_nontext_content_safe(file_parts["tracked"], file_parts[outcome], outcome)
        if _structure_signature(roots["tracked"]) != _structure_signature(roots[outcome]):
            raise ReviewError(f"{outcome}: table structure changed")
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
