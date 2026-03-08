"""Extract text content from uploaded documents (PDF, DOCX, TXT)."""

import logging
from io import BytesIO

logger = logging.getLogger(__name__)

MAX_CHARS = 80_000  # ~20k tokens — enough context without blowing up GPT prompt


def extract_text(data: bytes, filename: str) -> str:
    """Extract text from a document. Returns plain text content."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _extract_pdf(data)
    elif lower.endswith(".docx"):
        return _extract_docx(data)
    elif lower.endswith(".txt") or lower.endswith(".md"):
        return _extract_plain(data)
    else:
        raise ValueError(f"Unsupported file type: {filename}")


def _extract_pdf(data: bytes) -> str:
    import pdfplumber

    text_parts = []
    with pdfplumber.open(BytesIO(data)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
            if len("\n\n".join(text_parts)) > MAX_CHARS:
                break
    result = "\n\n".join(text_parts)
    if len(result) > MAX_CHARS:
        result = result[:MAX_CHARS] + "\n\n[... document truncated ...]"
    logger.info("Extracted %d chars from PDF (%d pages)", len(result), len(text_parts))
    return result


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(BytesIO(data))
    text_parts = []
    total = 0
    for para in doc.paragraphs:
        if para.text.strip():
            text_parts.append(para.text)
            total += len(para.text)
            if total > MAX_CHARS:
                break
    result = "\n\n".join(text_parts)
    if len(result) > MAX_CHARS:
        result = result[:MAX_CHARS] + "\n\n[... document truncated ...]"
    logger.info("Extracted %d chars from DOCX", len(result))
    return result


def _extract_plain(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "\n\n[... document truncated ...]"
    return text
