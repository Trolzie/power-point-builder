import asyncio
import logging
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import httpx
from openai import OpenAI

from app.config import settings
from app.models.presentation import PresentationContent
from app.models.template import TemplateManifest
from app.services.content_generator import generate_outline, generate_slide_content, repair_slide_content
from app.services.quality_analyzer import analyze_quality
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


_STALE_AGE_SECONDS = 600  # 10 minutes


def _purge_stale_outputs() -> None:
    """Delete output .pptx files older than the stale threshold to free disk space."""
    output_dir = Path(settings.OUTPUT_DIR)
    if not output_dir.exists():
        return
    cutoff = time.time() - _STALE_AGE_SECONDS
    for f in output_dir.glob("*.pptx"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                logger.info("Purged stale output: %s", f.name)
        except OSError:
            pass


def _has_fixable_issues(report) -> bool:
    """Check if a quality report has error or warning level issues."""
    return (report.issues_by_severity.get("error", 0) + report.issues_by_severity.get("warning", 0)) > 0


async def _build_and_assemble(
    template_path: str, content: PresentationContent, presentation_id: str
) -> None:
    """Generate images and assemble a presentation file."""
    filename = f"{presentation_id}.pptx"
    output_path = str(Path(settings.OUTPUT_DIR) / filename)
    temp_paths = await _generate_images(content)
    try:
        assemble_presentation(template_path, content, output_path)
    finally:
        _cleanup_temp_images(temp_paths)


async def run_pipeline(template_id: str, topic: str, num_slides: int) -> dict:
    """Orchestrate the full presentation generation pipeline."""
    _purge_stale_outputs()
    manifest = _load_manifest(template_id)
    template_path = str(Path(settings.TEMPLATES_DIR) / manifest.filename)

    # Generate outline
    outline = await asyncio.to_thread(generate_outline, topic, manifest, num_slides)

    # Generate detailed content
    content = await asyncio.to_thread(generate_slide_content, topic, outline, manifest)

    # Analyze quality before assembly
    initial_report = analyze_quality(content, manifest)
    logger.info("Initial quality score: %.1f (%d issues)", initial_report.overall_score, initial_report.total_issues)

    # Always build the original version
    original_id = uuid4().hex[:12]
    await _build_and_assemble(template_path, content, original_id)

    # Repair pass if there are fixable issues
    repaired_id = None
    repaired_report = None
    if _has_fixable_issues(initial_report):
        logger.info("Repairing content (%d errors, %d warnings)...",
                     initial_report.issues_by_severity.get("error", 0),
                     initial_report.issues_by_severity.get("warning", 0))
        repaired_content = await asyncio.to_thread(
            repair_slide_content, topic, content, initial_report, manifest
        )
        repaired_report = analyze_quality(repaired_content, manifest)
        logger.info("Repaired quality score: %.1f (%d issues)", repaired_report.overall_score, repaired_report.total_issues)
        repaired_id = uuid4().hex[:12]
        await _build_and_assemble(template_path, repaired_content, repaired_id)

    return {
        "presentation_id": original_id,
        "filename": f"{original_id}.pptx",
        "quality_report": initial_report,
        "repaired_id": repaired_id,
        "repaired_filename": f"{repaired_id}.pptx" if repaired_id else None,
        "repaired_quality_report": repaired_report,
    }


async def run_pipeline_from_outline(
    template_id: str, outline: PresentationContent,
    reference_text: str | None = None,
) -> dict:
    """Run the pipeline starting from a provided outline (skip outline generation)."""
    _purge_stale_outputs()
    manifest = _load_manifest(template_id)
    template_path = str(Path(settings.TEMPLATES_DIR) / manifest.filename)
    topic = outline.title

    # Generate detailed content from the outline
    content = await asyncio.to_thread(
        generate_slide_content, topic, outline, manifest,
        reference_text=reference_text,
    )

    # Analyze quality before assembly
    initial_report = analyze_quality(content, manifest)
    logger.info("Initial quality score: %.1f (%d issues)", initial_report.overall_score, initial_report.total_issues)

    # Always build the original version
    original_id = uuid4().hex[:12]
    await _build_and_assemble(template_path, content, original_id)

    # Repair pass if there are fixable issues
    repaired_id = None
    repaired_report = None
    if _has_fixable_issues(initial_report):
        logger.info("Repairing content (%d errors, %d warnings)...",
                     initial_report.issues_by_severity.get("error", 0),
                     initial_report.issues_by_severity.get("warning", 0))
        repaired_content = await asyncio.to_thread(
            repair_slide_content, topic, content, initial_report, manifest
        )
        repaired_report = analyze_quality(repaired_content, manifest)
        logger.info("Repaired quality score: %.1f (%d issues)", repaired_report.overall_score, repaired_report.total_issues)
        repaired_id = uuid4().hex[:12]
        await _build_and_assemble(template_path, repaired_content, repaired_id)

    return {
        "presentation_id": original_id,
        "filename": f"{original_id}.pptx",
        "quality_report": initial_report,
        "repaired_id": repaired_id,
        "repaired_filename": f"{repaired_id}.pptx" if repaired_id else None,
        "repaired_quality_report": repaired_report,
    }
