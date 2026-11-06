"""R69 integration: real generated PDF/DOCX, source references and denial cases."""
from __future__ import annotations

from io import BytesIO
import unittest

from docx import Document
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

from poc_docx.source_segments import SourceDocumentError
from poc_docx.document_intake import inspect_document
from poc_docx.pdf_segments import extract_pdf_segments


def pdf_text(*, pages=2):
    b = BytesIO()
    c = Canvas(b, pagesize=(612, 792), pageCompression=1)
    for i in range(pages):
        c.drawString(50, 720, f"Article {i + 1}: total 15.5 pct")
        c.drawString(50, 700, f"Not payable for case {i + 1}")
        c.showPage()
    c.save()
    return b.getvalue()


def docx_text():
    b = BytesIO()
    doc = Document()
    doc.add_paragraph("Điều khoản 1")
    doc.add_table(rows=1, cols=1).cell(0, 0).text = "100.000 VND"
    doc.save(b)
    return b.getvalue()


class DocumentIntakeTest(unittest.TestCase):
    def test_pdf_pages_and_original_line_positions(self):
        data = pdf_text()
        got = inspect_document(data, filename="case.PDF", source_scope="document_only")
        self.assertEqual(got.format, "pdf")
        self.assertEqual(got.byte_size, len(data))
        self.assertEqual(len(got.sha256), 64)
        self.assertEqual([s.ordinal for s in got.segments], list(range(len(got.segments))))
        self.assertEqual({s.source_id.split(":")[0] for s in got.segments}, {"p1", "p2"})
        self.assertTrue(any("Article 1" in s.text for s in got.segments))
        self.assertTrue(any("Not payable" in s.text for s in got.segments))
        self.assertTrue(all(s.location == "pdf_page_line" for s in got.segments))
        self.assertEqual(got, inspect_document(data, filename="case.PDF", source_scope="document_only"))

    def test_docx_common_manifest_uses_previous_real_extractor(self):
        data = docx_text()
        got = inspect_document(data, filename="legal.docx", source_scope="document_only")
        self.assertEqual(got.format, "docx")
        self.assertEqual([s.text for s in got.segments], ["Điều khoản 1", "100.000 VND"])
        self.assertEqual(got.segments[1].location, "table_cell")

    def test_extension_mismatch_fail_closed(self):
        for payload, name in ((pdf_text(), "not-really.docx"), (docx_text(), "not-really.pdf")):
            with self.subTest(name=name), self.assertRaises(SourceDocumentError):
                inspect_document(payload, filename=name, source_scope="document_only")

    def test_no_implicit_source_scope(self):
        with self.assertRaises(TypeError):
            inspect_document(docx_text(), filename="test.docx")
        for scope in ("", "approved", None, "all"):
            with self.subTest(scope=scope), self.assertRaises(SourceDocumentError):
                inspect_document(pdf_text(), filename="test.pdf", source_scope=scope)

    def test_filename_validation(self):
        for name in ("../test.pdf", "/test.pdf", "x\\test.pdf", "bad\nname.pdf", "test.txt", "..", ""):
            with self.subTest(name=name), self.assertRaises(SourceDocumentError):
                inspect_document(pdf_text(pages=1), filename=name, source_scope="document_only")

    def test_blank_pdf_requires_ocr_or_source_review(self):
        b = BytesIO()
        c = Canvas(b)
        c.showPage()
        c.save()
        with self.assertRaisesRegex(SourceDocumentError, "OCR"):
            extract_pdf_segments(b.getvalue(), source_scope="document_only")

    def test_pdf_raster_image_rejected_even_if_text_is_present(self):
        b = BytesIO()
        c = Canvas(b, pagesize=(612, 792))
        c.drawString(50, 730, "Scanned page wrapper text")
        im = Image.new("RGB", (30, 30), "black")
        c.drawImage(ImageReader(im), 50, 500, width=30, height=30)
        c.showPage()
        c.save()
        with self.assertRaisesRegex(SourceDocumentError, "OCR"):
            extract_pdf_segments(b.getvalue(), source_scope="document_only")

    def test_encrypted_pdf_rejected(self):
        writer = PdfWriter()
        writer.append(PdfReader(BytesIO(pdf_text(pages=1))))
        writer.encrypt("synthetic-only")
        b = BytesIO()
        writer.write(b)
        with self.assertRaisesRegex(SourceDocumentError, "Encrypted"):
            extract_pdf_segments(b.getvalue(), source_scope="document_only")

    def test_embedded_attachment_rejected(self):
        writer = PdfWriter()
        writer.append(PdfReader(BytesIO(pdf_text(pages=1))))
        writer.add_attachment(filename="fixture.txt", data=b"synthetic fixture")
        b = BytesIO()
        writer.write(b)
        with self.assertRaisesRegex(SourceDocumentError, "Interactive"):
            extract_pdf_segments(b.getvalue(), source_scope="document_only")

    def test_broken_and_oversize_pdf_rejected(self):
        data = pdf_text(pages=1)
        for b in (b"%PDF-bad", data[:100], b"<!DOCTYPE pdf>", b"", data+b"X"*(12*1024*1024)):
            with self.subTest(data_length=len(b)), self.assertRaises(SourceDocumentError):
                extract_pdf_segments(b, source_scope="document_only")

    def test_too_many_pages_rejected(self):
        b = BytesIO()
        c = Canvas(b)
        for _ in range(51):
            c.drawString(20, 500, "Safe text")
            c.showPage()
        c.save()
        with self.assertRaisesRegex(SourceDocumentError, "page count"):
            extract_pdf_segments(b.getvalue(), source_scope="document_only")

    def test_cross_page_ocr_absence_not_silent(self):
        b = BytesIO()
        c = Canvas(b)
        c.drawString(40, 400, "Page one valid text")
        c.showPage()
        c.showPage()
        c.save()
        with self.assertRaisesRegex(SourceDocumentError, "OCR"):
            extract_pdf_segments(b.getvalue(), source_scope="document_only")


if __name__ == "__main__":
    unittest.main()
