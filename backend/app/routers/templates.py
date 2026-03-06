import asyncio
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import settings
from app.models.schemas import TemplateListItem, TemplateListResponse
from app.models.template import TemplateManifest
from app.services.template_parser import parse_template

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _validate_id(id_str: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_-]+$', id_str):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    return id_str


@router.post("/upload", response_model=TemplateManifest)
async def upload_template(file: UploadFile):
    """Upload a .pptx template, parse it, and return its manifest."""
    if not file.filename or not (file.filename.endswith(".pptx") or file.filename.endswith(".potx")):
        raise HTTPException(status_code=400, detail="File must be a .pptx or .potx file")

    template_id = uuid4().hex[:12]
    ext = Path(file.filename).suffix  # .pptx or .potx
    templates_dir = Path(settings.TEMPLATES_DIR)
    template_path = templates_dir / f"{template_id}{ext}"

    content = await file.read()
    template_path.write_bytes(content)

    try:
        manifest = await asyncio.to_thread(
            parse_template, str(template_path), template_id
        )
    except Exception as e:
        template_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Failed to parse template: {e}")

    # Store manifest as JSON
    manifest_path = templates_dir / f"{template_id}.json"
    manifest_path.write_text(manifest.model_dump_json(indent=2))

    return manifest


@router.get("", response_model=TemplateListResponse)
async def list_templates():
    """List all uploaded templates."""
    templates_dir = Path(settings.TEMPLATES_DIR)
    items = []
    for pptx_file in sorted(
        list(templates_dir.glob("*.pptx")) + list(templates_dir.glob("*.potx"))
    ):
        template_id = pptx_file.stem
        items.append(TemplateListItem(template_id=template_id, filename=pptx_file.name))
    return TemplateListResponse(templates=items)


@router.get("/{template_id}", response_model=TemplateManifest)
async def get_template(template_id: str):
    """Get the manifest for a specific template."""
    _validate_id(template_id)
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateManifest.model_validate_json(manifest_path.read_text())


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    """Delete a template and its manifest."""
    _validate_id(template_id)
    templates_dir = Path(settings.TEMPLATES_DIR)
    pptx_path = templates_dir / f"{template_id}.pptx"
    potx_path = templates_dir / f"{template_id}.potx"
    manifest_path = templates_dir / f"{template_id}.json"

    if not pptx_path.exists() and not potx_path.exists() and not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    pptx_path.unlink(missing_ok=True)
    potx_path.unlink(missing_ok=True)
    manifest_path.unlink(missing_ok=True)

    return {"detail": "Template deleted"}
