"""QA checks for mixed decisions over a synthetic batch (no Word Desktop)."""
from __future__ import annotations
from io import BytesIO
import unittest
from zipfile import ZipFile

from lxml import etree as ET

from poc_docx.batch_changes import apply_batch
from poc_docx.track_changes import w
from tests.test_batch_changes import source_docx, proposals
from tools.verify_word_review import ReviewError
from tools.verify_selected_review import check_selected_review


def simulate(tracked: bytes, accepted: set[int], alter=None) -> bytes:
    dest = BytesIO()
    with ZipFile(BytesIO(tracked)) as src, ZipFile(dest, "w") as out:
        for item in src.infolist():
            part = src.read(item)
            if item.filename == "word/document.xml":
                root = ET.fromstring(part)
                for paragraph_index, paragraph in enumerate(root.iter(w("p"))):
                    for node in list(paragraph):
                        if node.tag != w("del"):
                            continue
                        insertion = node.getnext()
                        if insertion is None or insertion.tag != w("ins"):
                            raise AssertionError("Unexpected fixture layout")
                        chosen = insertion if paragraph_index in accepted else node
                        run = chosen[0]
                        for t in run.iter(w("delText")):
                            t.tag = w("t")
                        pos = paragraph.index(node)
                        paragraph.remove(insertion)
                        paragraph.remove(node)
                        paragraph.insert(pos, run)
                if alter:
                    alter(root)
                part = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            out.writestr(item, part)
    return dest.getvalue()


class MixedReviewGateTests(unittest.TestCase):
    def setUp(self):
        self.edits = proposals()
        self.tracked = apply_batch(source_docx(), self.edits)
        self.reviewed = simulate(self.tracked, {0, 1})

    def test_valid_mixed_two_accept_one_reject(self):
        result = check_selected_review(self.tracked, self.reviewed, self.edits, [0, 1])
        self.assertEqual(result["static_docx_content"], "PASS")
        self.assertEqual(result["microsoft_word_ui"], "NOT_VERIFIED_BY_THIS_TOOL")
        self.assertEqual(result["checked_edits"], 3)
        self.assertEqual(result["rejected_indices"], [2])

    def test_wrong_decision_claim_rejected(self):
        with self.assertRaisesRegex(ReviewError, "differs from selected decisions"):
            check_selected_review(self.tracked, self.reviewed, self.edits, [0, 2])

    def test_all_accept_instead_of_mixed_rejected(self):
        wrong = simulate(self.tracked, {0, 1, 2})
        with self.assertRaisesRegex(ReviewError, "differs from selected decisions"):
            check_selected_review(self.tracked, wrong, self.edits, [0, 1])

    def test_unresolved_revision_rejected(self):
        with self.assertRaisesRegex(ReviewError, "unresolved revisions"):
            check_selected_review(self.tracked, self.tracked, self.edits, [0, 1])

    def test_undeclared_extra_tracked_revision_rejected(self):
        with self.assertRaisesRegex(ReviewError, "unexpected revision count"):
            check_selected_review(self.tracked, self.reviewed, self.edits[:2], [0])

    def test_duplicate_and_boolean_decisions_rejected(self):
        for values in ([0, 0], [True], [-1], [3], "0,1"):
            with self.subTest(values=values), self.assertRaisesRegex(ReviewError, "accepted_indices"):
                check_selected_review(self.tracked, self.reviewed, self.edits, values)

    def test_changed_unrelated_paragraph_rejected(self):
        def alter(root):
            list(root.iter(w("p")))[3].find(w("r")).find(w("t")).text = "MUTATED"
        with self.assertRaisesRegex(ReviewError, "paragraph 3 differs"):
            check_selected_review(self.tracked, simulate(self.tracked, {0,1}, alter), self.edits, [0,1])

    def test_mixed_in_same_paragraph(self):
        from docx import Document
        d = Document()
        p = d.add_paragraph()
        p.add_run("one")
        p.add_run("two")
        f=BytesIO();d.save(f)
        e = [dict(self.edits[0],paragraph_index=0,old_text="one",new_text="ONE"),
             dict(self.edits[1],paragraph_index=0,old_text="two",new_text="TWO")]
        tracked = apply_batch(f.getvalue(),e)
        # Use run order, not paragraph index, for mixed decisions.
        result = BytesIO()
        with ZipFile(BytesIO(tracked)) as src, ZipFile(result,"w") as out:
            for item in src.infolist():
                data=src.read(item)
                if item.filename=="word/document.xml":
                    root=ET.fromstring(data)
                    para=next(root.iter(w("p")))
                    for idx, node in enumerate(list(para)):
                        if node.tag != w("del"):
                            continue
                        insertion=node.getnext()
                        keep = insertion if next(node.iter(w("delText"))).text=="one" else node
                        run=keep[0]
                        for text in run.iter(w("delText")):text.tag=w("t")
                        pos=para.index(node);para.remove(insertion);para.remove(node);para.insert(pos,run)
                    data=ET.tostring(root)
                out.writestr(item,data)
        self.assertEqual(check_selected_review(tracked,result.getvalue(),e,[0])["static_docx_content"],"PASS")


if __name__ == "__main__": unittest.main()
