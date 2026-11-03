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

    def test_bad_zip_fails_closed(self):
        with self.assertRaises(EditError):
            apply_edit(b"not a docx", EDIT)


if __name__ == "__main__":
    unittest.main()
