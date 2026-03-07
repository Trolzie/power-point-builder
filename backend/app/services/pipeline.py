import asyncio
import logging
import tempfile
from pathlib import Path
from uuid import uuid4

import httpx
from openai import OpenAI

from app.config import settings
from app.models.presentation import PresentationContent
from app.models.template import TemplateManifest
from app.services.content_generator import generate_outline, generate_slide_content
from app.services.slide_assembler import assemble_presentation

logger = logging.getLogger(__name__)


def _load_manifest(template_id: str) -> TemplateManifest:
    """Load a stored template manifest from JSON."""
    manifest_path = Path(settings.TEMPLATES_DIR) / f"{template_id}.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Template manifest not found: {template_id}")
    return TemplateManifest.model_validate_json(manifest_path.read_text())


def _generate_single_image(prompt: str) -> str:
    """Generate a single image via DALL-E 3 and download to a temp file."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )
    image_url = response.data[0].url

    # Download to temp file
    with httpx.Client() as http_client:
        img_response = http_client.get(image_url, timeout=60)
        img_response.raise_for_status()

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.write(img_response.content)
    tmp.close()
    logger.info("Downloaded DALL-E image to %s", tmp.name)
    return tmp.name


async def _generate_images(content: PresentationContent) -> list[str]:
    """Generate images for all image placeholders. Returns list of temp file paths for cleanup."""
    tasks = []
    placeholder_refs = []  # (slide_idx, ph_key) to map results back

    for slide_idx, slide in enumerate(content.slides):
        for ph_key, ph_content in slide.placeholders.items():
            if ph_content.type == "image" and ph_content.image_prompt:
                tasks.append(
                    asyncio.to_thread(_generate_single_image, ph_content.image_prompt)
                )
                placeholder_refs.append((slide_idx, ph_key))

    if not tasks:
        return []

    logger.info("Generating %d images via DALL-E 3...", len(tasks))
    results = await asyncio.gather(*tasks, return_exceptions=True)

    temp_paths = []
    for (slide_idx, ph_key), result in zip(placeholder_refs, results):
        if isinstance(result, Exception):
            logger.error(
                "Image generation failed for slide %d, placeholder %s: %s",
                slide_idx, ph_key, result,
            )
            continue
        content.slides[slide_idx].placeholders[ph_key].image_path = result
        temp_paths.append(result)

    return temp_paths


def _cleanup_temp_images(temp_paths: list[str]) -> None:
    """Delete temporary image files."""
    for path in temp_paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError as e:
            logger.warning("Failed to clean up temp image %s: %s", path, e)


async def run_pipeline(template_id: str, topic: str, num_slides: int) -> dict:
    """Orchestrate the full presentation generation pipeline."""
    manifest = _load_manifest(template_id)
    template_path = str(Path(settings.TEMPLATES_DIR) / manifest.filename)

    # Generate outline
    outline = await asyncio.to_thread(generate_outline, topic, manifest, num_slides)

    # Generate detailed content
    content = await asyncio.to_thread(generate_slide_content, topic, outline, manifest)

    # Generate images for PICTURE placeholders
    temp_paths = await _generate_images(content)

    # Assemble the presentation
    presentation_id = uuid4().hex[:12]
    filename = f"{presentation_id}.pptx"
    output_path = str(Path(settings.OUTPUT_DIR) / filename)

    try:
        assemble_presentation(template_path, content, output_path)
    finally:
        _cleanup_temp_images(temp_paths)

    return {"presentation_id": presentation_id, "filename": filename}


async def run_pipeline_from_outline(
    template_id: str, outline: PresentationContent
) -> dict:
    """Run the pipeline starting from a provided outline (skip outline generation)."""
    manifest = _load_manifest(template_id)
    template_path = str(Path(settings.TEMPLATES_DIR) / manifest.filename)

    # Generate detailed content from the outline
    content = await asyncio.to_thread(
        generate_slide_content, outline.title, outline, manifest
    )

    # Generate images for PICTURE placeholders
    temp_paths = await _generate_images(content)

    # Assemble the presentation
    presentation_id = uuid4().hex[:12]
    filename = f"{presentation_id}.pptx"
    output_path = str(Path(settings.OUTPUT_DIR) / filename)

    try:
        assemble_presentation(template_path, content, output_path)
    finally:
        _cleanup_temp_images(temp_paths)

    return {"presentation_id": presentation_id, "filename": filename}
