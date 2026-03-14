import asyncio
import zipfile
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.models.schemas import TemplateListItem, TemplateListResponse
from app.models.template import LayoutConfig, TemplateManifest


class UpdateTemplateRequest(BaseModel):
    default_layouts: list[int] | None = None
    layout_configs: dict[str, LayoutConfig] | None = None


from app.services.template_parser import parse_template
from app.utils import validate_id

router = APIRouter(prefix="/api/templates", tags=["templates"])

_POTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"
_PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"


def _convert_potx_to_pptx(data: bytes) -> bytes:
    """Convert a .potx file to .pptx by patching the content type."""
    src = BytesIO(data)
    dst = BytesIO()
    with zipfile.ZipFile(src, "r") as zin, zipfile.ZipFile(dst, "w") as zout:
        for item in zin.infolist():
            content = zin.read(item.filename)
            if item.filename == "[Content_Types].xml":
                content = content.replace(
                    _POTX_CONTENT_TYPE.encode(),
                    _PPTX_CONTENT_TYPE.encode(),
                )
            zout.writestr(item, content)
    return dst.getvalue()


@router.post("/upload", response_model=TemplateManifest)
async def upload_template(file: UploadFile):
    """Upload a .pptx template, parse it, and return its manifest."""
    if not file.filename or not (file.filename.endswith(".pptx") or file.filename.endswith(".potx")):
        raise HTTPException(status_code=400, detail="File must be a .pptx or .potx file")

    template_id = uuid4().hex[:12]
    templates_dir = Path(settings.TEMPLATES_DIR)
    # Always save as .pptx — python-pptx can't open .potx content type
    template_path = templates_dir / f"{template_id}.pptx"

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50 MB
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")

    # Convert .potx to .pptx by patching the content type in [Content_Types].xml
    # python-pptx rejects .potx because it has a different main content type
    if file.filename.endswith(".potx"):
        content = _convert_potx_to_pptx(content)

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
    for pptx_file in sorted(templates_dir.glob("*.pptx")):
        template_id = pptx_file.stem
        items.append(TemplateListItem(template_id=template_id, filename=pptx_file.name))
    return TemplateListResponse(templates=items)


@router.get("/{template_id}", response_model=TemplateManifest)
async def get_template(template_id: str):
    """Get the manifest for a specific template."""
    validate_id(template_id)
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateManifest.model_validate_json(manifest_path.read_text())


@router.patch("/{template_id}", response_model=TemplateManifest)
async def update_template(template_id: str, body: UpdateTemplateRequest):
    """Update template preferences (e.g. default_layouts)."""
    validate_id(template_id)
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    manifest = TemplateManifest.model_validate_json(manifest_path.read_text())
    if body.layout_configs is not None:
        manifest.layout_configs = body.layout_configs
        # Sync default_layouts from layout_configs for backward compat
        manifest.default_layouts = [
            int(idx) for idx, cfg in body.layout_configs.items() if cfg.enabled
        ]
    elif body.default_layouts is not None:
        manifest.default_layouts = body.default_layouts
    manifest_path.write_text(manifest.model_dump_json(indent=2))
    return manifest


@router.get("/{template_id}/download")
async def download_template(template_id: str):
    """Download the original .pptx template file."""
    validate_id(template_id)
    template_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.pptx"
    if not template_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    # Use the original filename from the manifest if available
    filename = f"{template_id}.pptx"
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if manifest_path.exists():
        manifest = TemplateManifest.model_validate_json(manifest_path.read_text())
        if manifest.filename:
            filename = manifest.filename
            if not filename.endswith(".pptx"):
                filename = filename.rsplit(".", 1)[0] + ".pptx"

    return FileResponse(
        path=template_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    """Delete a template and its manifest."""
    validate_id(template_id)
    templates_dir = Path(settings.TEMPLATES_DIR)
    template_path = templates_dir / f"{template_id}.pptx"
    manifest_path = templates_dir / f"{template_id}.json"

    if not template_path.exists() and not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    template_path.unlink(missing_ok=True)
    manifest_path.unlink(missing_ok=True)

    return {"detail": "Template deleted"}
