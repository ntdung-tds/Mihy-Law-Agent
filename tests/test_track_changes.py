"""Isolated OOXML regression cases; not Microsoft Word acceptance evidence."""
from __future__ import annotations

from io import BytesIO
import unittest
from lxml import etree as ET
from zipfile import ZipFile
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

from docx import Document
from poc_docx.track_changes import EditError, apply_edit, w


EDIT = {
    "operation": "replace",
    "paragraph_index": 0,
    "old_text": "Original",
    "new_text": "Updated",
    "author": "QA POC",
    "changed_at": "2026-11-03T01:40:00Z",
}


def fixture(*, ambiguous: bool = False, split: bool = False) -> bytes:
    doc = Document()
    para = doc.add_paragraph()
    run = para.add_run("Original")
    run.bold = True
    if ambiguous:
        para.add_run("Original")
    if split:
        run.text = "Orig"
        para.add_run("inal")
    doc.add_paragraph("Numbered list", style="List Number")
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Left"
    table.cell(0, 1).text = "Right"
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def parts(blob: bytes) -> dict[str, bytes]:
    with ZipFile(BytesIO(blob)) as archive:
        assert archive.testzip() is None
        return {name: archive.read(name) for name in archive.namelist()}


def simulate_review(docxml: bytes, accept: bool) -> ET.Element:
    """Independent XML simplification, not an MS Word test."""
    root = ET.fromstring(docxml)
    for para in root.iter(w("p")):
        for node in list(para):
            if node.tag not in {w("ins"), w("del")}:
                continue
            keep = (node.tag == w("ins")) == accept
            position = list(para).index(node)
            para.remove(node)
            if keep:
                for subrun in list(node):
                    if subrun.find(w("delText")) is not None:
                        subrun.find(w("delText")).tag = w("t")
                    para.insert(position, subrun)
                    position += 1
    return root


class TrackedChangesTest(unittest.TestCase):
    def test_replacement_is_real_revisions_with_unchanged_table_numbering_and_styles(self):
        before = parts(fixture())
        after = parts(apply_edit(fixture(), EDIT))
        self.assertEqual(set(before), set(after))
        changed = {name for name in before if before[name] != after[name]}
        self.assertEqual(changed, {"word/document.xml", "word/settings.xml"})

        root = ET.fromstring(after["word/document.xml"])
        para = next(root.iter(w("p")))
        deleted, inserted = list(para)
        self.assertEqual((deleted.tag, inserted.tag), (w("del"), w("ins")))
        self.assertEqual(deleted[0].find(w("delText")).text, "Original")
        self.assertEqual(inserted[0].find(w("t")).text, "Updated")
        self.assertIsNotNone(deleted[0].find(w("rPr")))
        self.assertIsNotNone(inserted[0].find(w("rPr")))
        self.assertNotEqual(deleted.get(w("id")), inserted.get(w("id")))
        self.assertEqual(deleted.get(w("author")), EDIT["author"])
        self.assertEqual(inserted.get(w("date")), EDIT["changed_at"])

        settings = ET.fromstring(after["word/settings.xml"])
        self.assertIsNotNone(settings.find(w("trackRevisions")))
        original_root = ET.fromstring(before["word/document.xml"])
        self.assertEqual(ET.tostring(next(original_root.iter(w("tbl")))),
                         ET.tostring(next(root.iter(w("tbl")))))
        self.assertEqual(ET.tostring(list(original_root.iter(w("p")))[1]),
                         ET.tostring(list(root.iter(w("p")))[1]))

    def test_mc_ignorable_namespaces_are_preserved(self):
        before = parts(fixture())["word/document.xml"]
        after = parts(apply_edit(fixture(), EDIT))["word/document.xml"]
        original, updated = ET.fromstring(before), ET.fromstring(after)
        ns = "{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable"
        self.assertEqual(original.attrib.get(ns), updated.attrib.get(ns))
        for prefix in (updated.attrib.get(ns) or "").split():
            self.assertIn(prefix, updated.nsmap)
            self.assertEqual(original.nsmap[prefix], updated.nsmap[prefix])

    def test_whitespace_preserved_in_inserted_run(self):
        changed = parts(apply_edit(fixture(), {**EDIT, "new_text": " Updated "}))["word/document.xml"]
        root = ET.fromstring(changed)
        inserted = next(root.iter(w("ins")))
        text = inserted[0].find(w("t"))
        self.assertEqual(text.text, " Updated ")
        self.assertEqual(text.attrib.get("{http://www.w3.org/XML/1998/namespace}space"), "preserve")

    def test_accept_and_reject_have_expected_content(self):
        changed = parts(apply_edit(fixture(), EDIT))["word/document.xml"]
        for accept, expected in [(True, "Updated"), (False, "Original")]:
            root = simulate_review(changed, accept)
            first_p = next(root.iter(w("p")))
            self.assertEqual("".join(t.text or "" for t in first_p.iter(w("t"))), expected)

    def test_ambiguous_and_split_run_fail_closed(self):
        for blob in [fixture(ambiguous=True), fixture(split=True)]:
            with self.assertRaises(EditError):
                apply_edit(blob, EDIT)

    def test_invalid_edit_and_missing_target_fail_closed(self):
        blob = fixture()
        samples = [
            {**EDIT, "operation": "insert"},
            {**EDIT, "paragraph_index": -1},
            {**EDIT, "paragraph_index": True},
            {**EDIT, "paragraph_index": 500},
            {**EDIT, "new_text": "Original"},
            {**EDIT, "old_text": "Missing"},
            {**EDIT, "changed_at": "2026-11-03"},
        ]
        for sample in samples:
            with self.subTest(sample=sample), self.assertRaises(EditError):
                apply_edit(blob, sample)

    def test_enforced_document_protection_fails_closed(self):
        # POC_PROTOCOL.md negative case: locked document must not be altered.
        for enforcement in ("1", "true", "on"):
            with self.subTest(enforcement=enforcement):
                doc = Document()
                doc.add_paragraph("Original")
                protection = OxmlElement("w:documentProtection")
                protection.set(qn("w:edit"), "readOnly")
                protection.set(qn("w:enforcement"), enforcement)
                doc.settings._element.append(protection)
                buffer = BytesIO()
                doc.save(buffer)
                with self.assertRaisesRegex(EditError, "document protection"):
                    apply_edit(buffer.getvalue(), EDIT)

    def test_non_enforced_document_protection_is_not_a_lock(self):
        doc = Document()
        doc.add_paragraph("Original")
        protection = OxmlElement("w:documentProtection")
        protection.set(qn("w:edit"), "readOnly")
        protection.set(qn("w:enforcement"), "0")
        doc.settings._element.append(protection)
        buffer = BytesIO()
        doc.save(buffer)
        self.assertIn(b"word/document.xml", apply_edit(buffer.getvalue(), EDIT))

    def test_malformed_document_xml_fails_closed(self):
        source = fixture()
        buf = BytesIO()
        with ZipFile(BytesIO(source)) as archive, ZipFile(buf, "w") as modified:
            for info in archive.infolist():
                data = b"<invalid" if info.filename == "word/document.xml" else archive.read(info)
                modified.writestr(info, data)
        with self.assertRaises(EditError):
            apply_edit(buf.getvalue(), EDIT)

    def test_missing_content_types_rejected_in_single_edit(self):
        original = parts(fixture())
        invalid = BytesIO()
        with ZipFile(invalid, "w") as archive:
            for part, data in original.items():
                if part != "[Content_Types].xml":
                    archive.writestr(part, data)
        with self.assertRaisesRegex(EditError, "required package part"):
            apply_edit(invalid.getvalue(), EDIT)

    def test_root_office_document_relationship_must_be_valid_single_edit(self):
        original = parts(fixture())
        rel_type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
        for mode in ("missing", "wrong_target", "external"):
            root = ET.fromstring(original["_rels/.rels"])
            rel = next(x for x in root if x.get("Type") == rel_type)
            if mode == "missing":
                root.remove(rel)
            elif mode == "wrong_target":
                rel.set("Target", "word/missing.xml")
            else:
                rel.set("Target", "https://example.invalid/remote.docx")
                rel.set("TargetMode", "External")
            buf = BytesIO()
            with ZipFile(buf, "w") as archive:
                for name, data in original.items():
                    archive.writestr(name, ET.tostring(root) if name == "_rels/.rels" else data)
            with self.subTest(mode=mode), self.assertRaisesRegex(EditError, "officeDocument relationship"):
                apply_edit(buf.getvalue(), EDIT)

    def test_settings_relationship_and_content_type_required_in_single_edit(self):
        original = parts(fixture())
        for mode in ("missing_settings_rel", "wrong_settings_target", "missing_settings_type"):
            doc = dict(original)
            if mode == "missing_settings_type":
                root = ET.fromstring(doc["[Content_Types].xml"])
                target = next(node for node in root if node.get("PartName") == "/word/settings.xml")
                root.remove(target)
                doc["[Content_Types].xml"] = ET.tostring(root)
            else:
                root = ET.fromstring(doc["word/_rels/document.xml.rels"])
                target = next(node for node in root if (node.get("Type") or "").endswith("/settings"))
                if mode == "missing_settings_rel":
                    root.remove(target)
                else:
                    target.set("Target", "missing.xml")
                doc["word/_rels/document.xml.rels"] = ET.tostring(root)
            output = BytesIO()
            with ZipFile(output, "w") as zipfile:
                for name, data in doc.items():
                    zipfile.writestr(name, data)
            with self.subTest(mode=mode), self.assertRaisesRegex(EditError, "settings"):
                apply_edit(output.getvalue(), EDIT)

    def test_duplicate_conflicting_content_types_rejected(self):
        original = parts(fixture())
        for part_name in ("/word/document.xml", "/word/settings.xml"):
            types = ET.fromstring(original["[Content_Types].xml"])
            ns = "{http://schemas.openxmlformats.org/package/2006/content-types}Override"
            ET.SubElement(types, ns, {"PartName": part_name, "ContentType": "text/plain"})
            output = BytesIO()
            with ZipFile(output, "w") as archive:
                for name, data in original.items():
                    archive.writestr(name, ET.tostring(types) if name == "[Content_Types].xml" else data)
            blob = output.getvalue()
            with self.subTest(part_name=part_name), self.assertRaisesRegex(EditError, "content type"):
                apply_edit(blob, EDIT)

    def test_invalid_non_rfc3339_tracked_timestamp_rejected(self):
        for stamp in ("2026-W45-2T10:00:00Z", "2026-11-03 10:00:00Z",
                      "2026-11-03T10:00:00+07:00:30"):
            with self.subTest(stamp=stamp), self.assertRaisesRegex(EditError, "RFC 3339"):
                apply_edit(fixture(), {**EDIT, "changed_at": stamp})

    def test_bad_zip_fails_closed(self):
        with self.assertRaises(EditError):
            apply_edit(b"not a docx", EDIT)

    def test_complex_field_result_is_not_silently_overwritten(self):
        # A field result is a cached view, not editable source text.
        doc = Document()
        para = doc.add_paragraph()
        begin = OxmlElement("w:r")
        fld = OxmlElement("w:fldChar")
        fld.set(qn("w:fldCharType"), "begin")
        begin.append(fld)
        para._p.append(begin)
        inst = OxmlElement("w:r")
        instr = OxmlElement("w:instrText")
        instr.text = " DATE "
        inst.append(instr)
        para._p.append(inst)
        sep = OxmlElement("w:r")
        sepchar = OxmlElement("w:fldChar")
        sepchar.set(qn("w:fldCharType"), "separate")
        sep.append(sepchar)
        para._p.append(sep)
        para.add_run("Original")
        end = OxmlElement("w:r")
        endchar = OxmlElement("w:fldChar")
        endchar.set(qn("w:fldCharType"), "end")
        end.append(endchar)
        para._p.append(end)
        buf = BytesIO()
        doc.save(buf)
        with self.assertRaisesRegex(EditError, "field"):
            apply_edit(buf.getvalue(), EDIT)

    def test_cross_paragraph_field_result_rejected(self):
        doc = Document()
        first = doc.add_paragraph()
        begin = OxmlElement("w:r")
        fld = OxmlElement("w:fldChar")
        fld.set(qn("w:fldCharType"), "begin")
        begin.append(fld)
        first._p.append(begin)
        second = doc.add_paragraph("Original")
        end = OxmlElement("w:r")
        endchar = OxmlElement("w:fldChar")
        endchar.set(qn("w:fldCharType"), "end")
        end.append(endchar)
        doc.add_paragraph()._p.append(end)
        buf = BytesIO()
        doc.save(buf)
        edit = {**EDIT, "paragraph_index": 1}
        with self.assertRaisesRegex(EditError, "field"):
            apply_edit(buf.getvalue(), edit)

    def test_unrelated_field_does_not_block_safe_paragraph(self):
        doc = Document()
        first = doc.add_paragraph()
        field = OxmlElement("w:fldSimple")
        field.set(qn("w:instr"), "DATE")
        first._p.append(field)
        doc.add_paragraph("Original")
        buf = BytesIO()
        doc.save(buf)
        edited = apply_edit(buf.getvalue(), {**EDIT, "paragraph_index": 1})
        paragraph = list(ET.fromstring(parts(edited)["word/document.xml"]).iter(w("p")))[1]
        self.assertEqual(next(paragraph.iter(w("ins"))).find(w("r")).find(w("t")).text, "Updated")

    def test_simple_field_in_target_paragraph_rejected(self):
        doc = Document()
        para = doc.add_paragraph("Original")
        simple = OxmlElement("w:fldSimple")
        simple.set(qn("w:instr"), "PAGE")
        para._p.append(simple)
        buf = BytesIO()
        doc.save(buf)
        with self.assertRaisesRegex(EditError, "field"):
            apply_edit(buf.getvalue(), EDIT)

    def test_header_footer_and_untouched_parts_are_identical(self):
        doc = Document()
        doc.add_paragraph("Original")
        doc.sections[0].header.paragraphs[0].text = "HEADER — SYNTHETIC"
        doc.sections[0].footer.paragraphs[0].text = "FOOTER — SYNTHETIC"
        buf = BytesIO()
        doc.save(buf)
        before = parts(buf.getvalue())
        after = parts(apply_edit(buf.getvalue(), EDIT))
        for name in before:
            if name not in {"word/document.xml", "word/settings.xml"}:
                self.assertEqual(before[name], after[name], name)
        self.assertTrue(any("word/header" in x for x in before))
        self.assertTrue(any("word/footer" in x for x in before))

    def test_malformed_existing_revision_id_rejected(self):
        # Existing tracked revisions lacking an ID must not be silently propagated.
        doc = Document()
        para = doc.add_paragraph("Original")
        insertion = OxmlElement("w:ins")
        insertion.set(qn("w:author"), "Reviewer")
        rev_run = OxmlElement("w:r")
        rev_text = OxmlElement("w:t")
        rev_text.text = "review"
        rev_run.append(rev_text)
        insertion.append(rev_run)
        para._p.append(insertion)
        buf = BytesIO()
        doc.save(buf)
        with self.assertRaisesRegex(EditError, "revision"):
            apply_edit(buf.getvalue(), EDIT)



if __name__ == "__main__":
    unittest.main()
