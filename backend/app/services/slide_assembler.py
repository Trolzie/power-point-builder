import logging
from pathlib import Path

from pptx import Presentation

from app.models.presentation import PlaceholderContent, PresentationContent

logger = logging.getLogger(__name__)


def _fill_placeholder(placeholder, content: PlaceholderContent) -> None:
    """Fill a placeholder with content while preserving formatting."""
    if content.type != "text" or not content.paragraphs:
        return

    tf = placeholder.text_frame

    for i, para_content in enumerate(content.paragraphs):
        if i == 0:
            para = tf.paragraphs[0]
        else:
            para = tf.add_paragraph()

        para.level = para_content.level

        # Reuse existing run if available, otherwise add new one
        if para.runs:
            run = para.runs[0]
            run.text = para_content.text
            # Remove extra runs from paragraph XML
            for extra_run in para.runs[1:]:
                extra_run._r.getparent().remove(extra_run._r)
        else:
            run = para.add_run()
            run.text = para_content.text

        if para_content.bold is not None:
            run.font.bold = para_content.bold
        if para_content.italic is not None:
            run.font.italic = para_content.italic


def assemble_presentation(
    template_path: str, content: PresentationContent, output_path: str
) -> str:
    """Assemble a .pptx from a template and generated content."""
    prs = Presentation(template_path)

    # Remove any existing slides from the template
    for slide in list(prs.slides):
        rId = slide.part.partname
        # Find the relationship ID for this slide
        for rel_key, rel in prs.part.rels.items():
            if rel.target_part is slide.part:
                prs.part.drop_rel(rel_key)
                break
        sldId_list = prs.slides._sldIdLst
        for sldId in list(sldId_list):
            sldId_list.remove(sldId)

    for slide_content in content.slides:
        layout = prs.slide_layouts[slide_content.layout_index]
        slide = prs.slides.add_slide(layout)

        for ph_key, ph_content in slide_content.placeholders.items():
            ph_idx = int(ph_key)
            # Find the placeholder on the slide by idx
            target_ph = None
            for ph in slide.placeholders:
                if ph.placeholder_format.idx == ph_idx:
                    target_ph = ph
                    break

            if target_ph is not None:
                _fill_placeholder(target_ph, ph_content)
            else:
                logger.warning(
                    "Placeholder idx=%s not found on slide layout '%s'",
                    ph_idx,
                    slide_content.layout_name,
                )

        if slide_content.speaker_notes:
            slide.notes_slide.notes_text_frame.text = slide_content.speaker_notes

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    prs.save(output_path)
    return output_path
