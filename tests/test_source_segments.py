"""R68-01 synthetic local DOCX byte-level verification; no legal customer data."""
from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
import unittest
from docx import Document
from docx.oxml import OxmlElement

from poc_docx.source_segments import extract_docx_segments, SourceDocumentError


def fixture():
    doc = Document()
    doc.add_paragraph("Điều 1. Quyền và nghĩa vụ")
    doc.add_paragraph("Điều 2. Không thay đổi số 15,5%")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Số tiền"
    table.cell(0, 1).text = "100.000 VND"
    table.cell(1, 0).text = "Ngày"
    table.cell(1, 1).text = "06/11/2026"
    doc.add_paragraph("Kết thúc")
    out = BytesIO()
    doc.save(out)
    return out.getvalue()


def mutate(blob, name, change):
    src, dst = BytesIO(blob), BytesIO()
    with ZipFile(src) as zip_in, ZipFile(dst, "w", ZIP_DEFLATED) as zip_out:
        for item in zip_in.infolist():
            data = zip_in.read(item.filename)
            if item.filename == name:
                data = change(data)
            zip_out.writestr(item, data)
    return dst.getvalue()


class SourceSegmentsTest(unittest.TestCase):
    def test_real_docx_paragraph_table_order_and_reproducible_anchors(self):
        blob = fixture()
        first = extract_docx_segments(blob, source_scope="document_only")
        self.assertEqual(first, extract_docx_segments(blob, source_scope="document_only"))
        self.assertEqual([s.text for s in first], [
            "Điều 1. Quyền và nghĩa vụ", "Điều 2. Không thay đổi số 15,5%",
            "Số tiền", "100.000 VND", "Ngày", "06/11/2026", "Kết thúc",
        ])
        self.assertEqual([s.ordinal for s in first], list(range(7)))
        self.assertEqual([s.source_id for s in first], [
            "b0:p", "b1:p", "b2:r0:c0:p0", "b2:r0:c1:p0",
            "b2:r1:c0:p0", "b2:r1:c1:p0", "b3:p",
        ])
        self.assertEqual([s.location for s in first],
                         ["paragraph", "paragraph"] + ["table_cell"] * 4 + ["paragraph"])

    def test_no_implicit_approved_corpus_or_missing_scope(self):
        blob = fixture()
        for source in ("approved", "all", "", None, "document_only,approved"):
            with self.subTest(source=source), self.assertRaises(SourceDocumentError):
                extract_docx_segments(blob, source_scope=source)
        with self.assertRaises(TypeError):
            extract_docx_segments(blob)

    def test_no_document_or_docx_type_spoofing(self):
        for blob in (b"not zip", b"", b"%PDF-1.4", b"PK\x03\x04"):
            with self.subTest(blob=blob), self.assertRaises(SourceDocumentError):
                extract_docx_segments(blob, source_scope="document_only")
        blob = mutate(fixture(), "[Content_Types].xml",
                      lambda d: d.replace(b"wordprocessingml.document.main+xml", b"wordprocessingml.not-docx.main+xml"))
        with self.assertRaises(SourceDocumentError):
            extract_docx_segments(blob, source_scope="document_only")

    def test_reject_tracked_revision_not_silently_approve(self):
        doc = Document()
        p = doc.add_paragraph("Trước ")
        ins = OxmlElement("w:ins")
        run = OxmlElement("w:r")
        t = OxmlElement("w:t")
        t.text = "đã sửa"
        run.append(t)
        ins.append(run)
        p._p.append(ins)
        buffer = BytesIO()
        doc.save(buffer)
        with self.assertRaisesRegex(SourceDocumentError, "unsupported"):
            extract_docx_segments(buffer.getvalue(), source_scope="document_only")

    def test_reject_field_and_unreadable_image(self):
        for tag in ("w:fldChar", "w:drawing", "w:sdt", "w:footnoteReference", "w:sym"):
            doc = Document()
            p = doc.add_paragraph("Trước")
            p._p.append(OxmlElement(tag))
            data = BytesIO()
            doc.save(data)
            with self.subTest(tag=tag), self.assertRaises(SourceDocumentError):
                extract_docx_segments(data.getvalue(), source_scope="document_only")

    def test_reject_xml_dtd(self):
        blob = mutate(fixture(), "word/document.xml",
                      lambda d: b'<!DOCTYPE a [<!ENTITY x "unsafe">]>' + d)
        with self.assertRaisesRegex(SourceDocumentError, "DTD"):
            extract_docx_segments(blob, source_scope="document_only")

    def test_bounded_input_and_decompression(self):
        with self.assertRaises(SourceDocumentError):
            extract_docx_segments(b"X" * (12 * 1024 * 1024 + 1), source_scope="document_only")
        with self.assertRaises(SourceDocumentError):
            extract_docx_segments(bytearray(fixture()), source_scope="document_only")
        bomb = mutate(fixture(), "word/document.xml", lambda d: d + b" " * (5 * 1024 * 1024))
        with self.assertRaises(SourceDocumentError):
            extract_docx_segments(bomb, source_scope="document_only")

    def test_reject_duplicate_zip_paths(self):
        import warnings
        data, dup = BytesIO(fixture()), BytesIO()
        with ZipFile(data) as original, ZipFile(dup, "w", ZIP_DEFLATED) as out:
            for name in original.namelist():
                out.writestr(name, original.read(name))
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                out.writestr("word/document.xml", original.read("word/document.xml"))
        with self.assertRaisesRegex(SourceDocumentError, "duplicate"):
            extract_docx_segments(dup.getvalue(), source_scope="document_only")

    def test_hyperlinks_are_text_only_not_fetched(self):
        doc = Document()
        para = doc.add_paragraph('Link: ')
        h = OxmlElement('w:hyperlink')
        r = OxmlElement('w:r')
        t = OxmlElement('w:t')
        t.text = 'hợp đồng'
        r.append(t)
        h.append(r)
        para._p.append(h)
        b = BytesIO()
        doc.save(b)
        got = extract_docx_segments(b.getvalue(), source_scope="document_only")
        self.assertEqual([x.text for x in got], ['Link: hợp đồng'])

    def test_reject_table_level_revisions_not_just_paragraph_revisions(self):
        doc = Document()
        table = doc.add_table(rows=1, cols=1)
        table.cell(0, 0).text = "Dữ liệu"
        review = OxmlElement("w:ins")
        table.rows[0]._tr.append(review)
        buf = BytesIO()
        doc.save(buf)
        with self.assertRaises(SourceDocumentError):
            extract_docx_segments(buf.getvalue(), source_scope="document_only")

    def test_blank_document_is_rejected(self):
        b = BytesIO()
        Document().save(b)
        with self.assertRaisesRegex(SourceDocumentError, "no extractable"):
            extract_docx_segments(b.getvalue(), source_scope="document_only")


if __name__ == '__main__':
    unittest.main()
