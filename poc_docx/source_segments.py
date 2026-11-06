"""Bounded, deterministic DOCX source segmentation for UC03/UC04/UC07 groundwork.

This is *not* a legal AI workflow, OCR engine, or proof of SRS acceptance.
It never fetches a link or executes macros. Unsupported semantics fail closed.
Callers must still enforce verified user/tenant/MatterACL and file provenance.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from lxml import etree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
CT = "{http://schemas.openxmlformats.org/package/2006/content-types}"
DOCUMENT_PART = "word/document.xml"
MAIN_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
MAX_INPUT = 12 * 1024 * 1024
MAX_UNPACKED = 32 * 1024 * 1024
MAX_DOCUMENT_XML = 4 * 1024 * 1024
MAX_ZIP_ENTRIES = 512
MAX_SEGMENTS = 20000
MAX_TEXT_CHARS = 1_000_000


class SourceDocumentError(ValueError):
    """No trustworthy source map can be returned for this DOCX."""


@dataclass(frozen=True, slots=True)
class SourceSegment:
    ordinal: int
    source_id: str
    text: str
    location: str  # 'paragraph' or 'table_cell'


def _parse_xml(raw: bytes):
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise SourceDocumentError("DOCX XML with a DTD/entity is unsupported")
    try:
        return ET.fromstring(raw, parser=ET.XMLParser(
            resolve_entities=False, no_network=True, load_dtd=False,
            huge_tree=False, remove_comments=True,
        ))
    except ET.XMLSyntaxError as exc:
        raise SourceDocumentError("Malformed DOCX XML") from exc


def _safe_zip(blob: bytes) -> tuple[bytes, bytes]:
    if not isinstance(blob, bytes) or not blob or len(blob) > MAX_INPUT:
        raise SourceDocumentError("Expected non-empty DOCX bytes within size limit")
    try:
        with ZipFile(BytesIO(blob)) as package:
            infos = package.infolist()
            if len(infos) > MAX_ZIP_ENTRIES or not infos:
                raise SourceDocumentError("DOCX contains too many package entries")
            names = set()
            total = 0
            for info in infos:
                name = info.filename
                parts = name.replace("\\", "/").split("/")
                if (name.startswith("/") or "\\" in name or
                        any(part in ("", ".", "..") for part in parts if not (info.is_dir() and part == parts[-1])) or
                        name in names):
                    raise SourceDocumentError("DOCX has unsafe/duplicate part paths")
                if ((info.external_attr >> 16) & 0o170000) == 0o120000:
                    raise SourceDocumentError("DOCX contains a symbolic link")
                names.add(name)
                total += info.file_size
                if total > MAX_UNPACKED or (info.file_size > 100_000 and
                        info.file_size > 500 * max(1, info.compress_size)):
                    raise SourceDocumentError("DOCX package exceeds decompression limits")
                if "vbaproject" in name.casefold() or name.casefold().endswith(".bin"):
                    raise SourceDocumentError("DOCX contains an unsupported binary/macro part")
            if DOCUMENT_PART not in names or "[Content_Types].xml" not in names:
                raise SourceDocumentError("Missing required DOCX package parts")
            if package.getinfo(DOCUMENT_PART).file_size > MAX_DOCUMENT_XML:
                raise SourceDocumentError("DOCX body exceeds XML limit")
            if package.testzip() is not None:
                raise SourceDocumentError("DOCX package integrity check failed")
            return package.read(DOCUMENT_PART), package.read("[Content_Types].xml")
    except (BadZipFile, EOFError, OSError, RuntimeError) as exc:
        raise SourceDocumentError("Invalid or damaged DOCX archive") from exc


def _paragraph_text(paragraph) -> str:
    unsafe = {W + tag for tag in (
        "ins", "del", "moveFrom", "moveTo", "fldChar", "instrText",
        "altChunk", "drawing", "pict", "object", "sdt", "txbxContent",
        "delText", "sym", "ptab", "footnoteReference", "endnoteReference",
        "commentReference", "hyperlinkRangeStart", "hyperlinkRangeEnd",
    )}
    pieces = []
    for node in paragraph.iter():
        if node.tag in unsafe:
            raise SourceDocumentError("DOCX contains tracked edits, fields or unextracted content")
        if node.tag == W + "t":
            pieces.append(node.text or "")
        elif node.tag == W + "tab":
            pieces.append("\t")
        elif node.tag in (W + "br", W + "cr"):
            pieces.append("\n")
        elif node.tag == W + "noBreakHyphen":
            pieces.append("\u2011")
    return "".join(pieces)


def extract_docx_segments(blob: bytes, *, source_scope: str) -> tuple[SourceSegment, ...]:
    """Read DOCX paragraph/table text with source paths local to this revision.

    The explicit source_scope=document_only does not grant permission to read
    outside the document and does not replace tenant/MatterACL verification.
    """
    if source_scope != "document_only":
        raise SourceDocumentError("Explicit document_only source scope is required")
    document_xml, types_xml = _safe_zip(blob)
    types = _parse_xml(types_xml)
    if types.tag != CT + "Types" or not any(
        child.tag == CT + "Override" and
        child.get("PartName") == "/" + DOCUMENT_PART and
        child.get("ContentType") == MAIN_TYPE for child in types
    ):
        raise SourceDocumentError("DOCX content type is not valid")
    root = _parse_xml(document_xml)
    body = root.find(W + "body")
    if root.tag != W + "document" or body is None:
        raise SourceDocumentError("DOCX document body missing")
    unsupported = {W + tag for tag in (
        "ins", "del", "moveFrom", "moveTo", "moveFromRangeStart",
        "moveToRangeStart", "fldChar", "instrText", "altChunk",
        "drawing", "pict", "object", "sdt", "txbxContent",
        "delText", "sym", "footnoteReference", "endnoteReference",
        "commentReference", "ptab",
    )}
    if any(element.tag in unsupported for element in body.iter()):
        raise SourceDocumentError("DOCX has unreviewed or unsupported content")
    collected = []
    chars = 0

    def emit(node, source_id: str, location: str):
        nonlocal chars
        text = _paragraph_text(node)
        if not text.strip():
            return
        chars += len(text)
        if chars > MAX_TEXT_CHARS or len(collected) >= MAX_SEGMENTS:
            raise SourceDocumentError("DOCX has too much extracted text")
        collected.append(SourceSegment(len(collected), source_id, text, location))

    def walk_table(table, path: str):
        for row_index, row in enumerate(table.findall(W + "tr")):
            for cell_index, cell in enumerate(row.findall(W + "tc")):
                p_index, nested_table_index = 0, 0
                for child in cell:
                    where = f"{path}:r{row_index}:c{cell_index}"
                    if child.tag == W + "p":
                        emit(child, f"{where}:p{p_index}", "table_cell")
                        p_index += 1
                    elif child.tag == W + "tbl":
                        walk_table(child, f"{where}:t{nested_table_index}")
                        nested_table_index += 1
                    elif child.tag == W + "tcPr":
                        continue
                    else:
                        raise SourceDocumentError("Unsupported table cell structure")

    for body_index, child in enumerate(body):
        if child.tag == W + "p":
            emit(child, f"b{body_index}:p", "paragraph")
        elif child.tag == W + "tbl":
            walk_table(child, f"b{body_index}")
        elif child.tag == W + "sectPr":
            continue
        else:
            raise SourceDocumentError("Unsupported document body structure")
    if not collected:
        raise SourceDocumentError("Document has no extractable text")
    return tuple(collected)
