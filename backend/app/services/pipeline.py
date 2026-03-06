from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.models.presentation import PresentationContent
from app.models.template import TemplateManifest
from app.services.content_generator import generate_outline, generate_slide_content
from app.services.slide_assembler import assemble_presentation
from app.services.template_parser import parse_template


def _load_manifest(template_id: str) -> TemplateManifest:
    """Load a stored template manifest from JSON."""
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Template manifest not found: {template_id}")
    return TemplateManifest.model_validate_json(manifest_path.read_text())


def run_pipeline(template_id: str, topic: str, num_slides: int) -> dict:
    """Orchestrate the full presentation generation pipeline."""
    manifest = _load_manifest(template_id)
    template_path = str(Path(settings.TEMPLATES_DIR) / manifest.filename)

    # Generate outline
    outline = generate_outline(topic, manifest, num_slides)

    # Generate detailed content
    content = generate_slide_content(topic, outline, manifest)

    # Assemble the presentation
    presentation_id = uuid4().hex[:12]
    filename = f"{presentation_id}.pptx"
    output_path = str(Path(settings.OUTPUT_DIR) / filename)

    assemble_presentation(template_path, content, output_path)

    return {"presentation_id": presentation_id, "filename": filename}


def run_pipeline_from_outline(
    template_id: str, outline: PresentationContent
) -> dict:
    """Run the pipeline starting from a provided outline (skip outline generation)."""
    manifest = _load_manifest(template_id)
    template_path = str(Path(settings.TEMPLATES_DIR) / manifest.filename)

    # Generate detailed content from the outline
    content = generate_slide_content(outline.title, outline, manifest)

    # Assemble the presentation
    presentation_id = uuid4().hex[:12]
    filename = f"{presentation_id}.pptx"
    output_path = str(Path(settings.OUTPUT_DIR) / filename)

    assemble_presentation(template_path, content, output_path)

    return {"presentation_id": presentation_id, "filename": filename}
