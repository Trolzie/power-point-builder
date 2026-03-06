import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(prefix="/api/presentations", tags=["presentations"])


def _validate_id(id_str: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_-]+$', id_str):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    return id_str


@router.get("")
async def list_presentations():
    """List all generated presentations."""
    output_dir = Path(settings.OUTPUT_DIR)
    presentations = []
    for pptx_file in sorted(output_dir.glob("*.pptx")):
        presentations.append({
            "presentation_id": pptx_file.stem,
            "filename": pptx_file.name,
        })
    return {"presentations": presentations}


@router.get("/{presentation_id}/download")
async def download_presentation(presentation_id: str):
    """Download a generated presentation."""
    _validate_id(presentation_id)
    file_path = Path(settings.OUTPUT_DIR) / f"{presentation_id}.pptx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Presentation not found")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@router.delete("/{presentation_id}")
async def delete_presentation(presentation_id: str):
    """Delete a generated presentation."""
    _validate_id(presentation_id)
    file_path = Path(settings.OUTPUT_DIR) / f"{presentation_id}.pptx"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Presentation not found")

    file_path.unlink()
    return {"detail": "Presentation deleted"}
