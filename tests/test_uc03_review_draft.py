"""R74 synthetic real bytes: source maps, translation segments and Word review export."""
from io import BytesIO
import json
import unittest

from docx import Document
from docx.oxml import OxmlElement
from reportlab.pdfgen.canvas import Canvas

from poc_docx.uc03_review_draft import (
    UC03DraftError, CloudflareM2MProvider,
    prepare_translation_review, export_review_docx,
)
from poc_docx.source_segments import SourceDocumentError


class FixtureTranslator:
    def __init__(self, *, mode="valid"):
        self.mode = mode
        self.calls = []
    def translate(self, text, source_lang, target_lang):
        self.calls.append((text, source_lang, target_lang))
        if self.mode == "empty":
            return ""
        return "Bản dịch kiểm thử: " + text


def docx_fixture(*, hidden=False):
    b = BytesIO()
    d = Document()
    p = d.add_paragraph("Agreement shall take effect on signing.")
    if hidden:
        el = OxmlElement("w:vanish")
        p.runs[0]._r.get_or_add_rPr().append(el)
    d.add_table(rows=1, cols=1).cell(0, 0).text = "Payment is due in 30 days."
    d.save(b)
    return b.getvalue()


def pdf_fixture():
    b = BytesIO()
    c = Canvas(b, pagesize=(612, 792))
    c.drawString(50, 700, "Agreement shall take effect on signing.")
    c.drawString(50, 670, "Payment is due in 30 days.")
    c.save()
    return b.getvalue()


class UC03ReviewDraftTests(unittest.TestCase):
    def test_real_docx_source_anchors_and_human_review_docx_export(self):
        provider = FixtureTranslator()
        draft = prepare_translation_review(
            docx_fixture(), filename="synthetic.docx", translator=provider,
            source_lang="english", target_lang="vietnamese",
            glossary={"Agreement": "Thỏa thuận"}
        )
        self.assertEqual(draft.status, "draft_requires_human_review")
        self.assertEqual(draft.source_format, "docx")
        self.assertEqual(len(draft.rows), 2)
        self.assertEqual(draft.rows[0].source_id, "b0:p")
        self.assertEqual(draft.rows[1].location, "table_cell")
        self.assertTrue(draft.rows[0].warnings)
        self.assertEqual(len(provider.calls), 2)
        result = export_review_docx(draft)
        self.assertTrue(result[:4] == b"PK\x03\x04")
        opened = Document(BytesIO(result))
        self.assertIn("NOT an approved legal translation", opened.paragraphs[1].text)
        self.assertEqual(len(opened.tables[0].rows), 3)
        self.assertIn("Agreement", opened.tables[0].cell(1,1).text)
        self.assertIn("REVIEW FLAG", opened.tables[0].cell(1,2).text)
        self.assertIn(draft.source_sha256, opened.paragraphs[2].text)

    def test_real_text_only_pdf_review_copy_preserves_original_page_line_source(self):
        draft = prepare_translation_review(
            pdf_fixture(), filename="synthetic.pdf",translator=FixtureTranslator(),
            source_lang="english",target_lang="vietnamese"
        )
        self.assertEqual(draft.source_format, "pdf")
        self.assertEqual(len(draft.rows), 2)
        self.assertTrue(all(s.source_id.startswith("p1:") for s in draft.rows))
        self.assertEqual(len(Document(BytesIO(export_review_docx(draft))).tables[0].rows),3)

    def test_fail_closed_on_hidden_docx_unsupported_format_and_invalid_direction(self):
        for data,name in ((docx_fixture(hidden=True),"hidden.docx"),
                          (pdf_fixture(),"bad.docx")):
            with self.subTest(name=name), self.assertRaises(SourceDocumentError):
                prepare_translation_review(
                    data,filename=name,translator=FixtureTranslator(),
                    source_lang="english",target_lang="vietnamese"
                )
        with self.assertRaises(UC03DraftError):
            prepare_translation_review(
                docx_fixture(),filename="synthetic.docx",translator=FixtureTranslator(),
                source_lang="english",target_lang="russian"
            )

    def test_empty_provider_result_aborts_draft_atomically(self):
        t = FixtureTranslator(mode="empty")
        with self.assertRaisesRegex(UC03DraftError,"missing/unsafe"):
            prepare_translation_review(
                docx_fixture(),filename="synthetic.docx",translator=t,
                source_lang="english",target_lang="vietnamese"
            )
        self.assertEqual(len(t.calls),1)

    def test_glossary_input_rejected_when_unbounded(self):
        with self.assertRaises(UC03DraftError):
            prepare_translation_review(
                docx_fixture(),filename="synthetic.docx",translator=FixtureTranslator(),
                source_lang="english",target_lang="vietnamese",
                glossary={"a"*71:"b"}
            )


class MockResponse:
    def __init__(self, body, status=200):
        self.status = status
        self.body = body
    def __enter__(self):return self
    def __exit__(self,*_):return False
    def read(self, maximum):return self.body[:maximum]


class MockOpener:
    def __init__(self, body):
        self.body=body
        self.requests=[]
    def open(self, req, timeout):
        self.requests.append((req,timeout))
        return MockResponse(self.body)


class CloudflareM2MContractTests(unittest.TestCase):
    def test_true_provider_contract_has_fixed_destination_and_private_bearer(self):
        response=json.dumps({"success":True,"result":{"translated_text":"Thỏa thuận có hiệu lực."}}).encode()
        op=MockOpener(response)
        svc=CloudflareM2MProvider("a"*32,"synthetic-private-token-1234567",opener=op)
        result=svc.translate("The agreement becomes effective.","english","vietnamese")
        self.assertEqual(result,"Thỏa thuận có hiệu lực.")
        self.assertEqual(len(op.requests),1)
        req,timeout=op.requests[0]
        self.assertEqual(req.full_url,
            "https://api.cloudflare.com/client/v4/accounts/"+"a"*32+
            "/ai/run/@cf/meta/m2m100-1.2b")
        self.assertEqual(timeout,20)
        self.assertIn("synthetic-private-token",req.get_header("Authorization"))
        self.assertEqual(json.loads(req.data)["target_lang"],"vietnamese")

    def test_invalid_token_and_malformed_provider_output_rejected(self):
        with self.assertRaises(UC03DraftError):
            CloudflareM2MProvider("bad","short")
        svc=CloudflareM2MProvider("a"*32,"synthetic-private-token-1234567",
            opener=MockOpener(b'{"success":true,"result":{}}'))
        with self.assertRaisesRegex(UC03DraftError,"malformed"):
            svc.translate("Test","english","vietnamese")


if __name__=="__main__":
    unittest.main()
