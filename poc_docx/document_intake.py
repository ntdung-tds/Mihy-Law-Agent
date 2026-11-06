"""R69 local-only common source map for DOCX/PDF, no uploads or network.

An output digest identifies input *bytes*, not an authorization grant; never
use it as a public identifier or substitute for MatterACL. No source bytes,
filenames or extracted text are logged/persisted by this helper.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import PurePath

from .source_segments import SourceDocumentError, SourceSegment, extract_docx_segments
from .pdf_segments import extract_pdf_segments


@dataclass(frozen=True, slots=True)
class DocumentSourceMap:
    format: str
    sha256: str
    byte_size: int
    source_scope: str
    segments: tuple[SourceSegment, ...]


def inspect_document(blob: bytes, *, filename: str, source_scope: str) -> DocumentSourceMap:
    """Extract bounded local source anchors with strict extension/content gate.

    Approval/tenant/MatterACL and long-lived storage remain caller obligations.
    No OCR, format conversion, AI provider, document upload or export.
    """
    if source_scope != "document_only":
        raise SourceDocumentError("Explicit document_only source scope is required")
    if (not isinstance(filename, str) or not filename or len(filename) > 255 or
            any(x in filename for x in ("/", "\\", "\x00", "\r", "\n")) or
            filename in (".", "..")):
        raise SourceDocumentError("Invalid original filename")
    kind = PurePath(filename).suffix.lower()
    if kind == ".docx":
        segments = extract_docx_segments(blob, source_scope=source_scope)
        format_name = "docx"
    elif kind == ".pdf":
        segments = extract_pdf_segments(blob, source_scope=source_scope)
        format_name = "pdf"
    else:
        raise SourceDocumentError("Only PDF and DOCX text sources are supported")
    return DocumentSourceMap(format_name, sha256(blob).hexdigest(), len(blob), source_scope, segments)
