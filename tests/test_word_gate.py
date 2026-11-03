"""Synthetic-only offline contract checks; not Microsoft Word UI test evidence."""
from __future__ import annotations

from io import BytesIO
import unittest
from zipfile import ZipFile

from lxml import etree as ET
from docx import Document

from poc_docx.track_changes import apply_edit, w
from tools.verify_word_review import ReviewError, check_results

EDIT = {"operation": "replace", "paragraph_index": 0, "old_text": "Original", "new_text": "Updated",
        "author": "Synthetic POC", "changed_at": "2026-11-03T01:00:00Z"}


def _make_source():
    d = Document()
    d.add_paragraph("Original")
    d.add_paragraph("Retained paragraph", style="List Number")
    d.add_table(rows=1, cols=1).cell(0, 0).text = "Table retained"
    d.sections[0].header.paragraphs[0].text = "Synthetic header"
    d.sections[0].footer.paragraphs[0].text = "Synthetic footer"
    f = BytesIO()
    d.save(f)
    return apply_edit(f.getvalue(), EDIT)


def _review_xml(data: bytes, accepted: bool, *, alter=None) -> bytes:
    src, dst = BytesIO(data), BytesIO()
    with ZipFile(src) as original, ZipFile(dst, "w") as output:
        for item in original.infolist():
            content = original.read(item)
            if item.filename == "word/document.xml":
                root = ET.fromstring(content)
                for paragraph in root.iter(w("p")):
                    for rev in list(paragraph):
                        if rev.tag not in {w("ins"), w("del")}:
                            continue
                        keep = (rev.tag == w("ins")) == accepted
                        pos = list(paragraph).index(rev)
                        paragraph.remove(rev)
                        if keep:
                            for run in list(rev):
                                for text in run.iter(w("delText")):
                                    text.tag = w("t")
                                paragraph.insert(pos, run)
                                pos += 1
                if alter:
                    alter(root)
                content = ET.tostring(root, xml_declaration=True, encoding="utf-8")
            output.writestr(item, content)
    return dst.getvalue()


class OfflineWordGateTests(unittest.TestCase):
    def setUp(self):
        self.tracked = _make_source()
        self.accepted = _review_xml(self.tracked, True)
        self.rejected = _review_xml(self.tracked, False)

    def test_valid_synthetic_review_passes_static_only(self):
        result = check_results(self.tracked, self.accepted, self.rejected, EDIT)
        self.assertEqual(result["static_docx_content"], "PASS")
        self.assertEqual(result["word_ui_accept_reject"], "NOT_VERIFIED_BY_THIS_TOOL")
        self.assertEqual(result["checked_tables"], 1)
        self.assertEqual(set(result["sha256"]), {"tracked", "accepted", "rejected"})

    def test_reversed_outcomes_rejected(self):
        with self.assertRaisesRegex(ReviewError, "differs"):
            check_results(self.tracked, self.rejected, self.accepted, EDIT)

    def test_unaccepted_revisions_rejected(self):
        with self.assertRaisesRegex(ReviewError, "revisions remain"):
            check_results(self.tracked, self.tracked, self.rejected, EDIT)

    def test_unrelated_paragraph_changed_rejected(self):
        def alter(root):
            list(root.iter(w("p")))[1].find(".//" + w("t")).text = "Tampered"
        tampered = _review_xml(self.tracked, True, alter=alter)
        with self.assertRaisesRegex(ReviewError, "paragraph 1"):
            check_results(self.tracked, tampered, self.rejected, EDIT)

    def test_table_structure_changed_rejected(self):
        def alter(root):
            row = next(root.iter(w("tr")))
            extra_cell = ET.Element(w("tc"))
            row.append(extra_cell)
        tampered = _review_xml(self.tracked, True, alter=alter)
        with self.assertRaisesRegex(ReviewError, "table structure changed"):
            check_results(self.tracked, tampered, self.rejected, EDIT)

    def test_numbering_removed_rejected(self):
        def alter(root):
            para = list(root.iter(w("p")))[1]
            style = para.find(f"{w('pPr')}/{w('pStyle')}")
            style.getparent().remove(style)
        tampered = _review_xml(self.tracked, True, alter=alter)
        with self.assertRaisesRegex(ReviewError, "numbering changed"):
            check_results(self.tracked, tampered, self.rejected, EDIT)

    def test_header_changed_rejected(self):
        target = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as original, ZipFile(target, "w") as output:
            for info in original.infolist():
                content = original.read(info)
                if info.filename.startswith("word/header") and info.filename.endswith(".xml"):
                    content = content.replace(b"Synthetic header", b"Modified header")
                output.writestr(info, content)
        with self.assertRaisesRegex(ReviewError, "header story XML changed"):
            check_results(self.tracked, target.getvalue(), self.rejected, EDIT)

    def test_changed_style_definition_rejected(self):
        def alter(data):
            root = ET.fromstring(data)
            next(root.iter(w("style"))).set(w("customStyle"), "1")
            return ET.tostring(root)
        with ZipFile(BytesIO(self.accepted)) as src:
            dst = BytesIO()
            with ZipFile(dst, "w") as output:
                for info in src.infolist():
                    content = alter(src.read(info)) if info.filename == "word/styles.xml" else src.read(info)
                    output.writestr(info, content)
        with self.assertRaisesRegex(ReviewError, "protected package definition changed"):
            check_results(self.tracked, dst.getvalue(), self.rejected, EDIT)

    def test_non_target_run_formatting_rejected(self):
        def alter(root):
            p = list(root.iter(w("p")))[1]
            run = p.find(w("r"))
            props = ET.Element(w("rPr"))
            props.append(ET.Element(w("b")))
            run.insert(0, props)
        changed = _review_xml(self.tracked, True, alter=alter)
        with self.assertRaisesRegex(ReviewError, "formatting changed"):
            check_results(self.tracked, changed, self.rejected, EDIT)

    def test_reindented_style_xml_is_not_a_semantic_mutation(self):
        dst = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as src, ZipFile(dst, "w") as output:
            for info in src.infolist():
                content = src.read(info)
                if info.filename == "word/styles.xml":
                    parser = ET.XMLParser(remove_blank_text=True)
                    content = ET.tostring(ET.fromstring(content, parser), pretty_print=True)
                output.writestr(info, content)
        self.assertEqual(check_results(self.tracked, dst.getvalue(), self.rejected, EDIT)["static_docx_content"], "PASS")

    def test_theme_change_rejected(self):
        dst = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as src, ZipFile(dst, "w") as output:
            for info in src.infolist():
                data = src.read(info)
                if info.filename.startswith("word/theme/") and info.filename.endswith(".xml"):
                    root = ET.fromstring(data)
                    root.set("injected", "1")
                    data = ET.tostring(root)
                output.writestr(info, data)
        with self.assertRaisesRegex(ReviewError, "protected package definition changed"):
            check_results(self.tracked, dst.getvalue(), self.rejected, EDIT)

    def test_non_target_tab_mutation_rejected(self):
        def alter(root):
            list(root.iter(w("p")))[1].find(w("r")).append(ET.Element(w("tab")))
        changed = _review_xml(self.tracked, True, alter=alter)
        with self.assertRaisesRegex(ReviewError, "non-text structure changed"):
            check_results(self.tracked, changed, self.rejected, EDIT)

    def test_relationship_target_change_rejected(self):
        dst = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as src, ZipFile(dst, "w") as output:
            for info in src.infolist():
                data = src.read(info)
                if info.filename == "word/_rels/document.xml.rels":
                    root = ET.fromstring(data)
                    next(iter(root)).set("Target", "malicious-target")
                    data = ET.tostring(root)
                output.writestr(info, data)
        with self.assertRaisesRegex(ReviewError, "protected package definition changed"):
            check_results(self.tracked, dst.getvalue(), self.rejected, EDIT)

    def test_header_format_mutation_rejected(self):
        def change(data):
            root = ET.fromstring(data)
            run = next(root.iter(w("r")))
            props = ET.Element(w("rPr"))
            props.append(ET.Element(w("b")))
            run.insert(0, props)
            return ET.tostring(root, encoding="utf-8", xml_declaration=True)

        result = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as source, ZipFile(result, "w") as out:
            for item in source.infolist():
                data = source.read(item)
                if item.filename == "word/header1.xml":
                    data = change(data)
                out.writestr(item, data)
        with self.assertRaisesRegex(ReviewError, "header .*changed"):
            check_results(self.tracked, result.getvalue(), self.rejected, EDIT)

    def test_table_width_mutation_rejected(self):
        def change(root):
            table = next(root.iter(w("tbl")))
            table.find(w("tblPr")).find(w("tblW")).set(w("w"), "9999")

        altered = _review_xml(self.tracked, True, alter=change)
        with self.assertRaisesRegex(ReviewError, "table structure changed"):
            check_results(self.tracked, altered, self.rejected, EDIT)

    def test_section_page_setup_changed_rejected(self):
        def alter(root):
            section = next(root.iter(w("sectPr")))
            width = section.find(w("pgSz"))
            if width is None:
                width = ET.SubElement(section, w("pgSz"))
            width.set(w("w"), "10000")
        altered = _review_xml(self.tracked, True, alter=alter)
        with self.assertRaisesRegex(ReviewError, "document envelope changed"):
            check_results(self.tracked, altered, self.rejected, EDIT)

    def test_settings_protection_changed_rejected(self):
        result = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as source, ZipFile(result, "w") as out:
            for item in source.infolist():
                data = source.read(item)
                if item.filename == "word/settings.xml":
                    root = ET.fromstring(data)
                    ET.SubElement(root, w("documentProtection"), {
                        w("enforcement"): "1", w("edit"): "readOnly"})
                    data = ET.tostring(root)
                out.writestr(item, data)
        with self.assertRaisesRegex(ReviewError, "protected package part changed"):
            check_results(self.tracked, result.getvalue(), self.rejected, EDIT)

    def test_metadata_modified_rejected(self):
        result = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as source, ZipFile(result, "w") as out:
            for item in source.infolist():
                data = source.read(item)
                if item.filename == "docProps/core.xml":
                    root = ET.fromstring(data)
                    root.set("tampered", "1")
                    data = ET.tostring(root)
                out.writestr(item, data)
        with self.assertRaisesRegex(ReviewError, "protected package part changed"):
            check_results(self.tracked, result.getvalue(), self.rejected, EDIT)

    def test_added_untracked_package_part_rejected(self):
        result = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as source, ZipFile(result, "w") as out:
            for item in source.infolist():
                out.writestr(item, source.read(item))
            out.writestr("customXml/extra.xml", "<extra>unexpected content</extra>")
        with self.assertRaisesRegex(ReviewError, "protected package part missing/added"):
            check_results(self.tracked, result.getvalue(), self.rejected, EDIT)

    def test_metadata_reindent_is_accepted(self):
        result = BytesIO()
        with ZipFile(BytesIO(self.accepted)) as source, ZipFile(result, "w") as out:
            for item in source.infolist():
                data = source.read(item)
                if item.filename == "docProps/core.xml":
                    parser = ET.XMLParser(remove_blank_text=True)
                    data = ET.tostring(ET.fromstring(data, parser), pretty_print=True)
                out.writestr(item, data)
        self.assertEqual(check_results(self.tracked, result.getvalue(), self.rejected, EDIT)["static_docx_content"], "PASS")

    def test_corrupt_package_rejected(self):
        with self.assertRaisesRegex(ReviewError, "DOCX ZIP"):
            check_results(self.tracked, b"not ZIP", self.rejected, EDIT)

    def test_wrong_spec_rejected(self):
        with self.assertRaisesRegex(ReviewError, "Source revision text"):
            check_results(self.tracked, self.accepted, self.rejected, {**EDIT, "new_text": "Wrong"})


if __name__ == "__main__":
    unittest.main()
