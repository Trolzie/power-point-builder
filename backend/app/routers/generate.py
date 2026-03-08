import asyncio
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import settings
from app.models.schemas import (
    GenerateOutlineRequest,
    GenerateOutlineResponse,
    GeneratePresentationRequest,
    GeneratePresentationResponse,
)
from app.models.template import TemplateManifest
from app.services.content_generator import generate_outline
from app.services.document_extractor import extract_text
from app.services.pipeline import run_pipeline_from_outline

router = APIRouter(prefix="/api/generate", tags=["generate"])


def _validate_id(id_str: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_-]+$', id_str):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    return id_str


def _load_manifest(template_id: str) -> TemplateManifest:
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateManifest.model_validate_json(manifest_path.read_text())


@router.post("/documents/extract")
async def extract_document(file: UploadFile):
    """Extract text content from an uploaded document (PDF, DOCX, TXT)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    allowed = (".pdf", ".docx", ".txt", ".md")
    if not any(file.filename.lower().endswith(ext) for ext in allowed):
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(allowed)}")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    try:
        text = await asyncio.to_thread(extract_text, data, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract text: {e}")

    return {"filename": file.filename, "text": text, "char_count": len(text)}


@router.post("/outline", response_model=GenerateOutlineResponse)
async def create_outline(request: GenerateOutlineRequest):
    """Generate a presentation outline using AI."""
    _validate_id(request.template_id)
    manifest = _load_manifest(request.template_id)

    try:
        outline = await asyncio.to_thread(
            generate_outline, request.topic, manifest, request.num_slides,
            reference_text=request.reference_text,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate outline: {e}")

    return GenerateOutlineResponse(outline=outline, template_id=request.template_id)


@router.post("/presentation", response_model=GeneratePresentationResponse)
async def create_presentation(request: GeneratePresentationRequest):
    """Generate a full presentation from an outline."""
    _validate_id(request.template_id)
    # Verify template exists
    _load_manifest(request.template_id)

    try:
        result = await run_pipeline_from_outline(
            request.template_id, request.outline,
            reference_text=request.reference_text,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate presentation: {e}"
        )

    return GeneratePresentationResponse(
        presentation_id=result["presentation_id"],
        filename=result["filename"],
        quality_report=result.get("quality_report"),
        repaired_id=result.get("repaired_id"),
        repaired_filename=result.get("repaired_filename"),
        repaired_quality_report=result.get("repaired_quality_report"),
    )
