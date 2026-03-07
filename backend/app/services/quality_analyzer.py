import logging

from app.models.presentation import PresentationContent, SlideContent
from app.models.quality import IssueSeverity, QualityIssue, QualityReport, SlideQuality
from app.models.template import LayoutInfo, PlaceholderInfo, TemplateManifest

logger = logging.getLogger(__name__)

_SKIP_PLACEHOLDER_TYPES = {"DATE", "FOOTER", "SLIDE_NUMBER", "HEADER"}


def _build_layout_map(manifest: TemplateManifest) -> dict[int, LayoutInfo]:
    """Build a lookup from layout index to LayoutInfo."""
    layout_map: dict[int, LayoutInfo] = {}
    for master in manifest.masters:
        for layout in master.layouts:
            layout_map[layout.index] = layout
    return layout_map


def _content_placeholders(layout: LayoutInfo) -> list[PlaceholderInfo]:
    """Return only content-relevant placeholders (skip DATE, FOOTER, etc.)."""
    return [ph for ph in layout.placeholders if ph.type not in _SKIP_PLACEHOLDER_TYPES]


def _word_count(text: str) -> int:
    return len(text.split()) if text.strip() else 0


def _placeholder_word_count(slide: SlideContent, ph_key: str) -> int:
    """Get total word count for a placeholder's content."""
    ph = slide.placeholders.get(ph_key)
    if not ph or not ph.paragraphs:
        return 0
    return sum(_word_count(p.text) for p in ph.paragraphs)


def _analyze_slide(
    slide_index: int,
    slide: SlideContent,
    layout: LayoutInfo | None,
) -> SlideQuality:
    """Analyze a single slide and return quality metrics."""
    issues: list[QualityIssue] = []

    if layout is None:
        issues.append(QualityIssue(
            severity=IssueSeverity.warning,
            category="unknown_layout",
            message=f"Layout '{slide.layout_name}' (index {slide.layout_index}) not found in manifest",
            slide_index=slide_index,
        ))
        return SlideQuality(
            slide_index=slide_index,
            layout_name=slide.layout_name,
            utilization_pct=0.0,
            issues=issues,
        )

    content_phs = _content_placeholders(layout)
    if not content_phs:
        return SlideQuality(
            slide_index=slide_index,
            layout_name=slide.layout_name,
            utilization_pct=100.0,
            issues=issues,
        )

    filled = 0
    for ph_info in content_phs:
        ph_key = str(ph_info.idx)
        ph_content = slide.placeholders.get(ph_key)
        wc = _placeholder_word_count(slide, ph_key)
        has_content = wc > 0
        is_image = ph_info.type == "PICTURE"
        has_image_prompt = ph_content is not None and bool(ph_content.image_prompt)

        # Empty placeholder check
        if ph_content is None or (not has_content and not has_image_prompt):
            if ph_info.type == "BODY":
                severity = IssueSeverity.error
            elif ph_info.type == "PICTURE":
                severity = IssueSeverity.warning
            elif ph_info.type == "SUBTITLE":
                severity = IssueSeverity.info
            else:
                severity = IssueSeverity.warning

            ph_label = ph_info.name or f"placeholder {ph_info.idx}"
            issues.append(QualityIssue(
                severity=severity,
                category="empty_placeholder",
                message=f"'{ph_label}' ({ph_info.type}) is empty",
                suggestion="Add content to fill this placeholder or consider a simpler layout",
                slide_index=slide_index,
                placeholder_idx=ph_info.idx,
            ))
            continue

        filled += 1

        # Image without prompt
        if is_image and not has_image_prompt:
            issues.append(QualityIssue(
                severity=IssueSeverity.warning,
                category="image_without_prompt",
                message=f"PICTURE placeholder '{ph_info.name or ph_info.idx}' has no image_prompt",
                suggestion="Add a descriptive image prompt for visual content",
                slide_index=slide_index,
                placeholder_idx=ph_info.idx,
            ))
            continue

        # Skip word-count checks for image placeholders
        if is_image:
            continue

        max_words = ph_info.estimated_max_words

        # Content overflow
        if max_words and wc > max_words:
            issues.append(QualityIssue(
                severity=IssueSeverity.warning,
                category="overflow",
                message=f"'{ph_info.name or ph_info.idx}' has {wc} words (max ~{max_words})",
                suggestion="Shorten the text to avoid overflow or clipping",
                slide_index=slide_index,
                placeholder_idx=ph_info.idx,
            ))

        # Sparse content
        if max_words and wc < max_words * 0.3:
            issues.append(QualityIssue(
                severity=IssueSeverity.info,
                category="sparse_content",
                message=f"'{ph_info.name or ph_info.idx}' has {wc} words (could fit ~{max_words})",
                suggestion="Expand with more detail, examples, or supporting points",
                slide_index=slide_index,
                placeholder_idx=ph_info.idx,
            ))

        # Title length check
        if ph_info.type == "TITLE":
            if wc > 10:
                issues.append(QualityIssue(
                    severity=IssueSeverity.warning,
                    category="title_too_long",
                    message=f"Title has {wc} words - keep titles concise",
                    suggestion="Shorten to 6-8 words for readability",
                    slide_index=slide_index,
                    placeholder_idx=ph_info.idx,
                ))

    # Missing speaker notes
    notes_wc = _word_count(slide.speaker_notes or "")
    if notes_wc < 10:
        issues.append(QualityIssue(
            severity=IssueSeverity.info,
            category="missing_speaker_notes",
            message="Missing or minimal speaker notes",
            suggestion="Add speaker notes to guide the presenter",
            slide_index=slide_index,
        ))

    utilization = (filled / len(content_phs)) * 100 if content_phs else 100.0

    return SlideQuality(
        slide_index=slide_index,
        layout_name=slide.layout_name,
        utilization_pct=round(utilization, 1),
        issues=issues,
    )


def analyze_quality(
    content: PresentationContent,
    manifest: TemplateManifest,
) -> QualityReport:
    """Analyze presentation quality and return a report with issues and score."""
    layout_map = _build_layout_map(manifest)

    slides: list[SlideQuality] = []
    for i, slide in enumerate(content.slides):
        layout = layout_map.get(slide.layout_index)
        slides.append(_analyze_slide(i, slide, layout))

    # Aggregate issues
    all_issues = [issue for sq in slides for issue in sq.issues]
    by_severity = {"error": 0, "warning": 0, "info": 0}
    for issue in all_issues:
        by_severity[issue.severity.value] += 1

    # Score: average utilization minus penalty for issues
    if slides:
        avg_util = sum(sq.utilization_pct for sq in slides) / len(slides)
    else:
        avg_util = 100.0

    penalty = 5 * by_severity["error"] + 2 * by_severity["warning"] + 0.5 * by_severity["info"]
    score = max(0.0, min(100.0, avg_util - penalty))

    # Summary
    slides_with_issues = sum(1 for sq in slides if sq.issues)
    total = len(slides)
    summary = f"{slides_with_issues} of {total} slides have issues" if slides_with_issues else "All slides look good"

    return QualityReport(
        overall_score=round(score, 1),
        summary=summary,
        total_issues=len(all_issues),
        issues_by_severity=by_severity,
        slides=slides,
    )
