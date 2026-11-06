"""R69: bounded text-only PDF extraction with original-page line anchors.

Image/scanned/encrypted/interactive PDFs are rejected, not misrepresented as
fully extracted. This is local document processing, NOT OCR or AI review.
Callers MUST authorize tenant, matter, provenance and storage before reading.
"""
from __future__ import annotations

from io import BytesIO
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .source_segments import SourceDocumentError, SourceSegment, MAX_TEXT_CHARS, MAX_SEGMENTS

MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_PAGES = 50
MAX_PAGE_CHARS = 60_000


def _unsafe_catalog(catalog) -> bool:
    """Reject dynamic/active PDF content rather than pretending it is source text."""
    if any(k in catalog for k in ("/OpenAction", "/AA", "/AcroForm")):
        return True
    names = catalog.get("/Names")
    if names is not None:
        name_tree = names.get_object()
        if any(k in name_tree for k in ("/EmbeddedFiles", "/JavaScript")):
            return True
    return False


def _check_text_display_safety(page) -> None:
    """Conservatively reject PDF text not faithfully represented by layout mode.

    This is NOT visual-fidelity proof. Overlay painting, custom font maps and
    unusual PDF constructs can still differ from the rendered page; downstream
    users must visually verify source content before relying on legal results.
    """
    rect = page.cropbox
    xmin, ymin = float(rect.left), float(rect.bottom)
    xmax, ymax = float(rect.right), float(rect.top)
    if not all(abs(v) < 1e9 for v in (xmin, ymin, xmax, ymax)) or xmin >= xmax or ymin >= ymax:
        raise SourceDocumentError("Invalid PDF crop box")
    problems = []

    def before(operator, arguments, _ctm, _text_matrix):
        if operator == b"Tr" and arguments:
            if int(arguments[0]) in (3, 7):
                problems.append("invisible/clip-only text render mode")
        if operator == b"gs" and arguments:
            resource = page.get("/Resources")
            resource = resource.get_object() if resource else {}
            states = resource.get("/ExtGState", {})
            states = states.get_object() if hasattr(states, "get_object") else states
            key = arguments[0]
            state = states.get(key) if states else None
            state = state.get_object() if hasattr(state, "get_object") else state
            if state and (float(state.get("/ca", 1)) == 0 or float(state.get("/CA", 1)) == 0):
                problems.append("zero-opacity graphics state")

    def visible_text(text, ctm, tm, _font, size):
        if not text.strip():
            return
        # pypdf's layout-mode extraction silently discards rotated text.
        a = ctm[0] * tm[0] + ctm[2] * tm[1]
        b = ctm[1] * tm[0] + ctm[3] * tm[1]
        c = ctm[0] * tm[2] + ctm[2] * tm[3]
        d = ctm[1] * tm[2] + ctm[3] * tm[3]
        x = ctm[0] * tm[4] + ctm[2] * tm[5] + ctm[4]
        y = ctm[1] * tm[4] + ctm[3] * tm[5] + ctm[5]
        scale = max(abs(a), abs(b), abs(c), abs(d), 1e-12)
        if abs(b) > scale * .001 or abs(c) > scale * .001:
            problems.append("rotated/skewed text omitted by PDF layout extraction")
        margin = max(12., abs(float(size)) * 2.)
        if not xmin-margin <= x <= xmax+margin or not ymin-margin <= y <= ymax+margin:
            problems.append("text begins outside visible crop area")

    # In contrast to layout mode, plain mode supplies visitor positions and
    # PDF graphics operators. Reject known invisible/missing text BEFORE
    # creating a numbered source map; do not silently discard legal clauses.
    page.extract_text(extraction_mode="plain",
                      visitor_operand_before=before, visitor_text=visible_text)
    if problems:
        raise SourceDocumentError("PDF display cannot be trusted: " + problems[0])


def extract_pdf_segments(blob: bytes, *, source_scope: str) -> tuple[SourceSegment, ...]:
    """Extract bounded text streams; `p{page}:l{line}` anchors are 1-based.

    Plain PDF text has no guaranteed reading order or DOCX-like table structure.
    Downstream translation requires review of page layout and source integrity.
    """
    if source_scope != "document_only":
        raise SourceDocumentError("Explicit document_only source scope is required")
    if not isinstance(blob, bytes) or not blob or len(blob) > MAX_PDF_BYTES:
        raise SourceDocumentError("Expected bounded PDF bytes")
    if not re.match(br"\A%PDF-1\.[0-7]|\A%PDF-2\.0", blob[:8]):
        raise SourceDocumentError("Invalid PDF signature")
    if b"%%EOF" not in blob[-256:]:
        raise SourceDocumentError("Missing PDF end marker")
    try:
        reader = PdfReader(BytesIO(blob), strict=True)
        if reader.is_encrypted:
            raise SourceDocumentError("Encrypted PDF requires a separate approved workflow")
        if _unsafe_catalog(reader.trailer["/Root"].get_object()):
            raise SourceDocumentError("Interactive PDF and embedded files are unsupported")
        pages = reader.pages
        if not 1 <= len(pages) <= MAX_PAGES:
            raise SourceDocumentError("Unsupported PDF page count")
        result: list[SourceSegment] = []
        chars = 0
        for page_index, page in enumerate(pages, 1):
            if page.get("/Annots") or page.get("/AA"):
                raise SourceDocumentError("PDF with annotations is unsupported")
            # Includes inline images and images nested inside Form XObjects.
            if list(page.images):
                raise SourceDocumentError("Image or scanned PDF needs OCR and human verification")
            _check_text_display_safety(page)
            raw = page.extract_text(extraction_mode="layout")
            if not isinstance(raw, str) or not raw.strip():
                raise SourceDocumentError("PDF page lacks extractable text; OCR needed")
            if len(raw) > MAX_PAGE_CHARS:
                raise SourceDocumentError("PDF page has excessive text")
            # Keep meaningful layout, including indentation; remove only blank rows.
            for line_index, line in enumerate(raw.splitlines(), 1):
                if not line.strip():
                    continue
                if "\ufffd" in line or any((ord(ch) < 32 and ch not in "\t") for ch in line):
                    raise SourceDocumentError("PDF has undecodable or control characters")
                chars += len(line)
                if chars > MAX_TEXT_CHARS or len(result) >= MAX_SEGMENTS:
                    raise SourceDocumentError("PDF extracted text exceeds limits")
                result.append(SourceSegment(len(result), f"p{page_index}:l{line_index}", line, "pdf_page_line"))
        if not result:
            raise SourceDocumentError("PDF has no extractable text")
        return tuple(result)
    except SourceDocumentError:
        raise
    except (PdfReadError, ValueError, TypeError, KeyError, IndexError, RecursionError, OSError) as exc:
        raise SourceDocumentError("PDF cannot be parsed safely") from exc
