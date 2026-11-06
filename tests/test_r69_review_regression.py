"""R70 review regressions: refuse source maps with invisible or omitted legal text."""
from io import BytesIO
import unittest

from docx import Document
from reportlab.pdfgen.canvas import Canvas

from poc_docx.document_intake import inspect_document
from poc_docx.source_segments import SourceDocumentError


def render_pdf(draw):
    stream = BytesIO()
    canvas = Canvas(stream, pagesize=(612, 792))
    draw(canvas)
    canvas.showPage()
    canvas.save()
    return stream.getvalue()


def pdf_source(draw):
    return inspect_document(render_pdf(draw), filename="synthetic.pdf", source_scope="document_only")


def docx_source(doc):
    stream = BytesIO()
    doc.save(stream)
    return inspect_document(stream.getvalue(), filename="synthetic.docx", source_scope="document_only")


class SourceDisplayReviewTest(unittest.TestCase):
    def test_plain_pdf_remains_accepted(self):
        result = pdf_source(lambda c: c.drawString(40, 700, "Article 7 visible"))
        self.assertEqual([s.text.strip() for s in result.segments], ["Article 7 visible"])

    def test_text_outside_pdf_crop_rejected(self):
        def draw(c):
            c.drawString(40, 700, "Clause one")
            c.drawString(1200, 2500, "INVISIBLE OUTSIDE PAGE")
        with self.assertRaisesRegex(SourceDocumentError, "outside visible crop"):
            pdf_source(draw)

    def test_invisible_pdf_render_mode_rejected(self):
        def draw(c):
            c.drawString(40, 700, "Clause one")
            t = c.beginText(40, 670)
            t.setTextRenderMode(3)
            t.textOut("INVISIBLE ADDED OBLIGATION")
            c.drawText(t)
        with self.assertRaisesRegex(SourceDocumentError, "invisible"):
            pdf_source(draw)

    def test_rotated_visible_pdf_text_rejected_instead_of_silently_dropped(self):
        def draw(c):
            c.drawString(40, 700, "Clause one")
            c.saveState()
            c.translate(120, 440)
            c.rotate(90)
            c.drawString(0, 0, "VISIBLE ROTATED NOTICE")
            c.restoreState()
        with self.assertRaisesRegex(SourceDocumentError, "rotated"):
            pdf_source(draw)

    def test_alpha_zero_pdf_text_rejected(self):
        def draw(c):
            c.drawString(40, 700, "Clause one")
            c.saveState()
            c.setFillAlpha(0)
            c.drawString(40, 670, "TRANSPARENT ADDED OBLIGATION")
            c.restoreState()
        with self.assertRaisesRegex(SourceDocumentError, "opacity"):
            pdf_source(draw)

    def test_inline_hidden_docx_text_rejected(self):
        doc = Document()
        p = doc.add_paragraph("Clause visible")
        p.add_run(" SECRET MODIFICATION").font.hidden = True
        with self.assertRaisesRegex(SourceDocumentError, "hidden"):
            docx_source(doc)

    def test_hidden_normal_docx_style_rejected(self):
        doc = Document()
        doc.add_paragraph("Visible-looking clause")
        doc.styles["Normal"].font.hidden = True
        with self.assertRaisesRegex(SourceDocumentError, "hidden text style"):
            docx_source(doc)

    def test_docx_header_rejected_if_contains_real_text(self):
        doc = Document()
        doc.add_paragraph("Main body clause")
        doc.sections[0].header.paragraphs[0].text = "CONTRACT REFERENCE"
        with self.assertRaisesRegex(SourceDocumentError, "header/footer"):
            docx_source(doc)

    def test_docx_footer_rejected_if_contains_real_text(self):
        doc = Document()
        doc.add_paragraph("Main body clause")
        doc.sections[0].footer.paragraphs[0].text = "CONFIDENTIAL FOOTER"
        with self.assertRaisesRegex(SourceDocumentError, "header/footer"):
            docx_source(doc)

    def test_empty_docx_header_does_not_reject_normal_document(self):
        doc = Document()
        doc.add_paragraph("Main body clause")
        _ = doc.sections[0].header.paragraphs
        result = docx_source(doc)
        self.assertEqual([x.text for x in result.segments], ["Main body clause"])


if __name__ == "__main__":
    unittest.main()
