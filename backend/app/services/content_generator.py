import json
import logging

from openai import OpenAI

from app.config import settings
from app.models.presentation import (
    ParagraphContent,
    PlaceholderContent,
    PresentationContent,
    SlideContent,
)
from app.models.template import TemplateManifest

logger = logging.getLogger(__name__)

MODEL = "gpt-4o"

_SKIP_PLACEHOLDER_TYPES = {"DATE", "FOOTER", "SLIDE_NUMBER", "HEADER"}


EMU_PER_INCH = 914400


def _emu_to_inches(emu: int | None) -> str:
    """Convert EMU to a readable inches string."""
    if emu is None:
        return "?"
    return f"{emu / EMU_PER_INCH:.1f}\""


def _build_layout_description(manifest: TemplateManifest) -> str:
    """Build a human-readable description of available layouts with spatial and capacity info."""
    lines = []
    for master in manifest.masters:
        for layout in master.layouts:
            content_phs = [
                ph for ph in layout.placeholders
                if ph.type not in _SKIP_PLACEHOLDER_TYPES
            ]
            if not content_phs:
                continue
            ph_desc = []
            for ph in content_phs:
                size_str = f"{_emu_to_inches(ph.width)} x {_emu_to_inches(ph.height)}"
                parts = [
                    f"idx={ph.idx}",
                    f"name=\"{ph.name}\"",
                    f"type={ph.type}",
                    f"size={size_str}",
                ]
                if ph.estimated_max_words:
                    parts.append(f"max_words={ph.estimated_max_words}")
                if ph.estimated_max_lines:
                    parts.append(f"max_lines={ph.estimated_max_lines}")
                if ph.default_font_name:
                    parts.append(f"font=\"{ph.default_font_name}\"")
                if ph.default_font_size_pt:
                    parts.append(f"font_size={ph.default_font_size_pt:.0f}pt")
                ph_desc.append(f"  - {', '.join(parts)}")
            lines.append(
                f"Layout index {layout.index}: \"{layout.name}\"\n"
                f"  Placeholders:\n" + "\n".join(ph_desc)
            )
    return "\n\n".join(lines)


def _build_design_context(manifest: TemplateManifest) -> str:
    """Build a design context string from template metadata."""
    parts = []

    # Slide dimensions
    w = manifest.slide_width_emu / EMU_PER_INCH
    h = manifest.slide_height_emu / EMU_PER_INCH
    ratio = "16:9" if abs(w / h - 16 / 9) < 0.1 else "4:3" if abs(w / h - 4 / 3) < 0.1 else f"{w:.1f}:{h:.1f}"
    parts.append(f"Slide dimensions: {w:.1f}\" x {h:.1f}\" ({ratio})")

    # Collect fonts and sizes from placeholders
    fonts = set()
    title_size = None
    body_size = None
    for master in manifest.masters:
        for layout in master.layouts:
            for ph in layout.placeholders:
                if ph.default_font_name:
                    fonts.add(ph.default_font_name)
                if ph.default_font_size_pt:
                    if ph.type in ("TITLE", "CENTER_TITLE"):
                        title_size = ph.default_font_size_pt
                    elif ph.type in ("BODY", "OBJECT", "SUBTITLE"):
                        body_size = ph.default_font_size_pt

    if fonts:
        parts.append(f"Fonts: {', '.join(sorted(fonts))}")
    if title_size:
        parts.append(f"Title size: {title_size:.0f}pt")
    if body_size:
        parts.append(f"Body size: {body_size:.0f}pt")

    # Theme colors
    if manifest.theme_colors:
        color_samples = []
        for key in ("dk1", "accent1", "accent2", "lt1"):
            if key in manifest.theme_colors:
                color_samples.append(f"{key}=#{manifest.theme_colors[key]}")
        if color_samples:
            parts.append(f"Theme colors: {', '.join(color_samples)}")

    return "\n".join(parts)


def _build_example() -> str:
    """Build a concrete JSON example for the LLM."""
    return json.dumps({
        "title": "Example Presentation",
        "slides": [
            {
                "layout_index": 0,
                "layout_name": "Title Slide",
                "placeholders": {
                    "0": {
                        "type": "text",
                        "paragraphs": [{"text": "Main Title", "level": 0, "bold": True}]
                    },
                    "1": {
                        "type": "text",
                        "paragraphs": [{"text": "Subtitle text", "level": 0}]
                    }
                },
                "speaker_notes": "Welcome everyone."
            },
            {
                "layout_index": 1,
                "layout_name": "Title and Content",
                "placeholders": {
                    "0": {
                        "type": "text",
                        "paragraphs": [{"text": "Slide Title", "level": 0}]
                    },
                    "1": {
                        "type": "text",
                        "paragraphs": [
                            {"text": "First bullet point", "level": 0},
                            {"text": "Sub-point detail", "level": 1},
                            {"text": "Second bullet point", "level": 0}
                        ]
                    }
                },
                "speaker_notes": "Key talking points here."
            }
        ]
    }, indent=2)


def _parse_json_response(content: str) -> PresentationContent:
    """Parse JSON from the LLM response into PresentationContent."""
    # Strip markdown code fences if present
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [l for l in lines[1:] if not l.strip() == "```"]
        text = "\n".join(lines)

    data = json.loads(text)
    slides = []
    for slide_data in data["slides"]:
        placeholders = {}
        raw_phs = slide_data.get("placeholders", {})
        for key, ph_data in raw_phs.items():
            # Handle case where ph_data is a string instead of object
            if isinstance(ph_data, str):
                placeholders[key] = PlaceholderContent(
                    type="text",
                    paragraphs=[ParagraphContent(text=ph_data, level=0)],
                )
                continue

            paragraphs = None
            if ph_data.get("paragraphs"):
                paragraphs = [
                    ParagraphContent(
                        text=p["text"] if isinstance(p, dict) else str(p),
                        level=p.get("level", 0) if isinstance(p, dict) else 0,
                        bold=p.get("bold") if isinstance(p, dict) else None,
                        italic=p.get("italic") if isinstance(p, dict) else None,
                    )
                    for p in ph_data["paragraphs"]
                ]
            placeholders[key] = PlaceholderContent(
                type=ph_data.get("type", "text"),
                paragraphs=paragraphs,
                image_prompt=ph_data.get("image_prompt"),
            )
        slides.append(
            SlideContent(
                layout_index=slide_data["layout_index"],
                layout_name=slide_data.get("layout_name", ""),
                placeholders=placeholders,
                speaker_notes=slide_data.get("speaker_notes"),
            )
        )
    return PresentationContent(title=data["title"], slides=slides)


def generate_outline(
    topic: str, manifest: TemplateManifest, num_slides: int
) -> PresentationContent:
    """Generate a presentation outline using OpenAI."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    layout_desc = _build_layout_description(manifest)
    design_ctx = _build_design_context(manifest)
    example = _build_example()

    system_prompt = (
        "You are a presentation design expert. You create well-structured, "
        "professional presentations that respect template constraints.\n\n"
        "You MUST respond with ONLY valid JSON matching the exact format shown in the example below. "
        "No markdown, no explanation, just JSON.\n\n"
        f"TEMPLATE DESIGN CONTEXT:\n{design_ctx}\n\n"
        "AVAILABLE LAYOUTS AND THEIR PLACEHOLDERS:\n"
        f"{layout_desc}\n\n"
        "RULES:\n"
        "- layout_index values MUST match one of the available layout indices above.\n"
        "- Placeholder keys in the 'placeholders' dict MUST be string versions of the idx values "
        "from that layout's placeholders (e.g., \"0\", \"1\").\n"
        "- Each placeholder value MUST be an object with 'type' (always \"text\") and 'paragraphs' (array).\n"
        "- Each paragraph MUST have 'text' (string) and 'level' (integer, 0=main, 1=sub-point).\n"
        "- Only use placeholder idx values that exist in the chosen layout.\n"
        "- Include 'speaker_notes' for each slide.\n"
        "- Choose layouts that best fit the content.\n\n"
        "CONTENT DENSITY RULES:\n"
        "- TITLE/CENTER_TITLE placeholders: 1-8 words. Short and punchy, no periods.\n"
        "- SUBTITLE placeholders: 5-20 words. One sentence max.\n"
        "- BODY/OBJECT placeholders: NEVER exceed the max_words shown for that placeholder.\n"
        "  - Each bullet point: 1-2 lines max.\n"
        "  - Aim for 60-80% of the max_words capacity.\n"
        "  - Use level 0 for main points, level 1 for supporting details.\n"
        "- If a placeholder has a small max_words (under 30), use very concise text.\n\n"
        f"EXAMPLE OUTPUT FORMAT:\n{example}"
    )

    user_prompt = (
        f"Create a {num_slides}-slide presentation outline about: {topic}\n\n"
        "Generate an outline with appropriate titles and key points for each slide. "
        "Pick the most suitable layout for each slide's content. "
        "Respect the max_words capacity of each placeholder. "
        "Respond with ONLY the JSON."
    )

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    logger.info("Outline response: %s", content[:500])
    return _parse_json_response(content)


def generate_slide_content(
    topic: str, outline: PresentationContent, manifest: TemplateManifest
) -> PresentationContent:
    """Generate detailed slide content from an outline using OpenAI."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    layout_desc = _build_layout_description(manifest)
    design_ctx = _build_design_context(manifest)
    outline_json = outline.model_dump_json(indent=2)
    example = _build_example()

    system_prompt = (
        "You are a presentation content expert. You take outlines and create "
        "detailed, engaging slide content that fits within template constraints.\n\n"
        "You MUST respond with ONLY valid JSON matching the exact format shown in the example below. "
        "No markdown, no explanation, just JSON.\n\n"
        f"TEMPLATE DESIGN CONTEXT:\n{design_ctx}\n\n"
        "AVAILABLE LAYOUTS AND THEIR PLACEHOLDERS:\n"
        f"{layout_desc}\n\n"
        "RULES:\n"
        "- Keep the same layout_index choices from the outline.\n"
        "- Placeholder keys MUST be string versions of the idx values (e.g., \"0\", \"1\").\n"
        "- Each placeholder value MUST be an object with 'type' and 'paragraphs'.\n"
        "- Expand bullet points into clear, engaging content.\n"
        "- Add speaker_notes for each slide with talking points.\n"
        "- Use bold: true for emphasis on key terms.\n"
        "- Use paragraph levels (0 = main point, 1 = sub-point) for hierarchy.\n\n"
        "CONTENT DENSITY RULES (CRITICAL):\n"
        "- TITLE/CENTER_TITLE placeholders: 1-8 words. Short and punchy, no periods.\n"
        "- SUBTITLE placeholders: 5-20 words. One sentence max.\n"
        "- BODY/OBJECT placeholders: NEVER exceed the max_words shown for that placeholder.\n"
        "  - Each bullet point: 1-2 lines max.\n"
        "  - Aim for 60-80% of the max_words capacity.\n"
        "  - Use level 0 for main points, level 1 for supporting details.\n"
        "- If a placeholder has a small max_words (under 30), use very concise text.\n"
        "- Text that overflows a placeholder looks broken. Always stay within capacity.\n\n"
        f"EXAMPLE OUTPUT FORMAT:\n{example}"
    )

    user_prompt = (
        f"Topic: {topic}\n\n"
        f"Here is the outline to expand into full slide content:\n{outline_json}\n\n"
        "Generate detailed content for every slide, filling all placeholders with "
        "engaging, professional content. Respect the max_words capacity of each placeholder. "
        "Include speaker_notes. Respond with ONLY the JSON."
    )

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    logger.info("Content response: %s", content[:500])
    return _parse_json_response(content)
