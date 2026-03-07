import asyncio
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.schemas import (
    GenerateOutlineRequest,
    GenerateOutlineResponse,
    GeneratePresentationRequest,
    GeneratePresentationResponse,
)
from app.models.template import TemplateManifest
from app.services.content_generator import generate_outline
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


@router.post("/outline", response_model=GenerateOutlineResponse)
async def create_outline(request: GenerateOutlineRequest):
    """Generate a presentation outline using AI."""
    _validate_id(request.template_id)
    manifest = _load_manifest(request.template_id)

    try:
        outline = await asyncio.to_thread(
            generate_outline, request.topic, manifest, request.num_slides
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
            request.template_id, request.outline
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate presentation: {e}"
        )

    return GeneratePresentationResponse(
        presentation_id=result["presentation_id"],
        filename=result["filename"],
    )
