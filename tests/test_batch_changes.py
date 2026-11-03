"""Synthetic POC1 selected Track Changes; not a Microsoft Word GUI test."""
from __future__ import annotations

from io import BytesIO
import unittest
from zipfile import ZipFile

from docx import Document
from lxml import etree as ET

from poc_docx.batch_changes import apply_batch
from poc_docx.track_changes import EditError, w

STAMP = "2026-11-03T05:20:00Z"


def proposals():
    return [
        {"operation": "replace", "paragraph_index": index, "old_text": old,
         "new_text": new, "author": "Synthetic QA", "changed_at": STAMP}
        for index, old, new in [(0, "15 ngày", "30 ngày"), (1, "A", "B"), (2, "C", "D")]
    ]


def source_docx():
    d = Document()
    d.add_paragraph("15 ngày")
    d.add_paragraph("A")
    d.add_paragraph("C")
    d.add_paragraph("Unchanged", style="List Number")
    t = d.add_table(rows=1, cols=1)
    t.cell(0, 0).text = "Unchanged table"
    d.sections[0].header.paragraphs[0].text = "Safe header"
    stream = BytesIO()
    d.save(stream)
    return stream.getvalue()


def zip_parts(blob):
    with ZipFile(BytesIO(blob)) as z:
        assert z.testzip() is None
        return {name: z.read(name) for name in z.namelist()}


def review_selected(document_xml, accepted_edit_indices):
    """Offline XML simulation only; cannot prove Microsoft Word behavior."""
    root = ET.fromstring(document_xml)
    for index, para in enumerate(root.iter(w("p"))):
        if index >= 3:
            break
        for rev in list(para):
            if rev.tag not in {w("ins"), w("del")}:
                continue
            accepted = index in accepted_edit_indices
            keep = (rev.tag == w("ins")) == accepted
            pos = para.index(rev)
            para.remove(rev)
            if keep:
                for run in list(rev):
                    for node in run.iter(w("delText")):
                        node.tag = w("t")
                    para.insert(pos, run)
                    pos += 1
    return ["".join(t.text or "" for t in p.iter(w("t")))
            for p in list(root.iter(w("p")))[:4]]


class SelectedTrackChangesTest(unittest.TestCase):
    def setUp(self):
        self.source = source_docx()
        self.selected = proposals()

    def test_three_selected_replacements_are_distinct_and_preserve_other_parts(self):
        before = zip_parts(self.source)
        after = zip_parts(apply_batch(self.source, self.selected))
        self.assertEqual(set(before), set(after))
        self.assertEqual({p for p in before if before[p] != after[p]},
                         {"word/document.xml", "word/settings.xml"})
        root = ET.fromstring(after["word/document.xml"])
        inserts, deletes = list(root.iter(w("ins"))), list(root.iter(w("del")))
        self.assertEqual((len(inserts), len(deletes)), (3, 3))
        ids = [e.get(w("id")) for e in inserts + deletes]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual([next(d.iter(w("delText"))).text for d in deletes], ["15 ngày", "A", "C"])
        self.assertEqual([next(d.iter(w("t"))).text for d in inserts], ["30 ngày", "B", "D"])
        settings = ET.fromstring(after["word/settings.xml"])
        self.assertIsNotNone(settings.find(w("trackRevisions")))

    def test_two_accept_one_reject_simulation(self):
        changed = zip_parts(apply_batch(self.source, self.selected))["word/document.xml"]
        self.assertEqual(review_selected(changed, {0, 1}), ["30 ngày", "B", "C", "Unchanged"])
        self.assertEqual(review_selected(changed, set()), ["15 ngày", "A", "C", "Unchanged"])

    def test_unselected_proposals_do_not_appear(self):
        changed = zip_parts(apply_batch(self.source, self.selected[:2]))["word/document.xml"]
        self.assertEqual(len(list(ET.fromstring(changed).iter(w("ins")))), 2)
        self.assertEqual(review_selected(changed, {0, 1})[2], "C")

    def test_atomic_rejection_for_missing_later_target(self):
        bad = [self.selected[0], {**self.selected[1], "old_text": "Missing"}]
        with self.assertRaisesRegex(EditError, "whole-run match"):
            apply_batch(self.source, bad)
        self.assertEqual(zip_parts(self.source)["word/document.xml"],
                         zip_parts(source_docx())["word/document.xml"])

    def test_duplicate_selected_run_is_rejected(self):
        with self.assertRaisesRegex(EditError, "same run"):
            apply_batch(self.source, [self.selected[0], self.selected[0]])

    def test_max_five_and_no_empty_batch(self):
        for bad in [[], self.selected * 2, "edits", [self.selected[0], 3]]:
            with self.subTest(bad=bad), self.assertRaises((EditError, TypeError)):
                apply_batch(self.source, bad)

    def test_two_distinct_runs_in_one_paragraph(self):
        d = Document()
        p = d.add_paragraph()
        p.add_run("one")
        p.add_run("two")
        out = BytesIO(); d.save(out)
        e = [dict(self.selected[0], paragraph_index=0, old_text="one", new_text="ONE"),
             dict(self.selected[1], paragraph_index=0, old_text="two", new_text="TWO")]
        updated = zip_parts(apply_batch(out.getvalue(), e))["word/document.xml"]
        self.assertEqual(len(list(ET.fromstring(updated).iter(w("ins")))), 2)

    def test_five_distinct_selected_edits_and_existing_revision_id_allocation(self):
        d = Document()
        for n in range(5):
            d.add_paragraph(f"old-{n}")
        stream = BytesIO(); d.save(stream)
        five = [dict(self.selected[0], paragraph_index=i,
                     old_text=f"old-{i}", new_text=f"new-{i}") for i in range(5)]
        result = zip_parts(apply_batch(stream.getvalue(), five))["word/document.xml"]
        root = ET.fromstring(result)
        self.assertEqual(len(list(root.iter(w("ins")))), 5)
        self.assertEqual(len(list(root.iter(w("del")))), 5)
        self.assertEqual(len({node.get(w("id")) for node in root.iter()
                              if node.tag in {w("ins"), w("del")}}), 10)

    def test_enforced_protection_blocks_entire_batch(self):
        d = zip_parts(self.source)
        settings = ET.fromstring(d["word/settings.xml"])
        ET.SubElement(settings, w("documentProtection"), {w("enforcement"): "1"})
        dst = BytesIO()
        with ZipFile(dst, "w") as archive:
            for name, data in d.items():
                archive.writestr(name, ET.tostring(settings) if name == "word/settings.xml" else data)
        with self.assertRaisesRegex(EditError, "protection"):
            apply_batch(dst.getvalue(), self.selected)

    def test_field_context_fails_closed_for_selected_target(self):
        d = zip_parts(self.source)
        root = ET.fromstring(d["word/document.xml"])
        paragraph = next(root.iter(w("p")))
        paragraph.insert(0, ET.Element(w("fldSimple"), {w("instr"): "DATE"}))
        dst = BytesIO()
        with ZipFile(dst, "w") as archive:
            for name, data in d.items():
                archive.writestr(name, ET.tostring(root) if name == "word/document.xml" else data)
        with self.assertRaisesRegex(EditError, "field context"):
            apply_batch(dst.getvalue(), self.selected)

    def test_missing_content_types_rejected_before_write(self):
        original = zip_parts(self.source)
        invalid = BytesIO()
        with ZipFile(invalid, "w") as archive:
            for part, data in original.items():
                if part != "[Content_Types].xml":
                    archive.writestr(part, data)
        with self.assertRaisesRegex(EditError, "required package part"):
            apply_batch(invalid.getvalue(), self.selected)

    def test_wrong_content_types_root_rejected(self):
        original = zip_parts(self.source)
        invalid = BytesIO()
        with ZipFile(invalid, "w") as archive:
            for part, data in original.items():
                if part == "[Content_Types].xml":
                    data = b"<not-types/>"
                archive.writestr(part, data)
        with self.assertRaisesRegex(EditError, "content-type or relationship root"):
            apply_batch(invalid.getvalue(), self.selected)

    def test_root_office_document_relationship_must_be_valid(self):
        rel_type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
        original = zip_parts(self.source)
        for mode in ("missing", "wrong_target", "external"):
            root = ET.fromstring(original["_rels/.rels"])
            matches = [x for x in root if x.get("Type") == rel_type]
            self.assertEqual(len(matches), 1)
            if mode == "missing":
                root.remove(matches[0])
            elif mode == "wrong_target":
                matches[0].set("Target", "word/does-not-exist.xml")
            else:
                matches[0].set("Target", "https://example.invalid/remote.docx")
                matches[0].set("TargetMode", "External")
            invalid = BytesIO()
            with ZipFile(invalid, "w") as archive:
                for part, data in original.items():
                    archive.writestr(part, ET.tostring(root) if part == "_rels/.rels" else data)
            with self.subTest(mode=mode), self.assertRaisesRegex(EditError, "officeDocument relationship"):
                apply_batch(invalid.getvalue(), self.selected)

    def test_settings_relationship_and_content_type_required(self):
        original = zip_parts(self.source)
        for mode in ("missing_settings_rel", "wrong_settings_target", "missing_settings_type"):
            parts = dict(original)
            if mode == "missing_settings_type":
                root = ET.fromstring(parts["[Content_Types].xml"])
                matching = [node for node in root if node.get("PartName") == "/word/settings.xml"]
                self.assertEqual(len(matching), 1)
                root.remove(matching[0])
                parts["[Content_Types].xml"] = ET.tostring(root)
            else:
                root = ET.fromstring(parts["word/_rels/document.xml.rels"])
                matching = [node for node in root if (node.get("Type") or "").endswith("/settings")]
                self.assertEqual(len(matching), 1)
                if mode == "missing_settings_rel":
                    root.remove(matching[0])
                else:
                    matching[0].set("Target", "missing.xml")
                parts["word/_rels/document.xml.rels"] = ET.tostring(root)
            output = BytesIO()
            with ZipFile(output, "w") as zipfile:
                for part, data in parts.items():
                    zipfile.writestr(part, data)
            with self.subTest(mode=mode), self.assertRaisesRegex(EditError, "settings"):
                apply_batch(output.getvalue(), self.selected)

    def test_duplicate_conflicting_content_types_rejected(self):
        original = zip_parts(self.source)
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
                apply_batch(blob, self.selected)

    def test_selected_batch_rejects_non_rfc3339_revision_timestamp(self):
        for stamp in ("2026-W45-2T10:00:00Z", "2026-11-03 10:00:00Z"):
            with self.subTest(stamp=stamp), self.assertRaisesRegex(EditError, "RFC 3339"):
                apply_batch(self.source, [{**self.selected[0], "changed_at": stamp}])

    def test_malformed_package_rejected(self):
        with self.assertRaises(EditError):
            apply_batch(b"junk", self.selected[:1])


if __name__ == "__main__":
    unittest.main()
