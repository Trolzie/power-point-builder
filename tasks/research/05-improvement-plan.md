# Improvement Plan

## Goal

Make generated presentations visually faithful to the template and appropriately sized for each placeholder. The output should look like a human created it using the template, not like an AI dumped text into random boxes.

## Phase A: Enrich Template Understanding

### A1. Extract Default Formatting Per Placeholder
**File**: `backend/app/services/template_parser.py`
**Model**: `backend/app/models/template.py`

Add to `PlaceholderInfo`:
```python
default_font_name: str | None = None      # e.g., "Calibri"
default_font_size_pt: float | None = None  # e.g., 28.0
default_font_color: str | None = None      # e.g., "2F2F2F" (hex RGB)
default_font_bold: bool | None = None
default_font_italic: bool | None = None
default_alignment: str | None = None       # "LEFT", "CENTER", "RIGHT"
default_line_spacing: float | None = None  # multiplier, e.g., 1.15
```

Implementation:
```python
# In parse_template(), after getting placeholder ph:
tf = ph.text_frame
if tf.paragraphs:
    first_para = tf.paragraphs[0]
    # Alignment
    alignment = str(first_para.alignment) if first_para.alignment else None
    # Line spacing
    line_spacing = None
    if first_para.line_spacing:
        line_spacing = first_para.line_spacing  # Might be Pt or proportion

    if first_para.runs:
        first_run = first_para.runs[0]
        font = first_run.font
        # Font properties (may be None if inherited from theme)
        font_name = font.name
        font_size_pt = font.size.pt if font.size else None
        font_color = None
        if font.color and font.color.rgb:
            font_color = str(font.color.rgb)
        font_bold = font.bold
        font_italic = font.italic
```

**Note**: Many properties may be `None` because they inherit from the layout/master/theme. We need a fallback chain:
1. Check placeholder's run font
2. If None, check layout's placeholder definition
3. If None, check master's placeholder definition
4. If None, use theme defaults

This is complex with python-pptx. A pragmatic approach: read the effective font by examining the XML hierarchy, or accept None and use reasonable defaults for capacity estimation.

### A2. Calculate Content Capacity Per Placeholder
**File**: `backend/app/services/template_parser.py`

Add to `PlaceholderInfo`:
```python
estimated_max_lines: int | None = None
estimated_max_words: int | None = None
```

Calculation:
```python
EMU_PER_INCH = 914400
EMU_PER_PT = 12700
AVG_CHARS_PER_WORD = 5.5

def _estimate_capacity(width_emu, height_emu, font_size_pt, line_spacing=1.15):
    if not all([width_emu, height_emu, font_size_pt]):
        return None, None

    font_size_emu = font_size_pt * EMU_PER_PT
    line_height = font_size_emu * line_spacing

    max_lines = int(height_emu / line_height)

    # Average character width ~60% of font size for proportional fonts
    avg_char_width = font_size_emu * 0.6
    chars_per_line = int(width_emu / avg_char_width) if avg_char_width > 0 else 50

    max_chars = max_lines * chars_per_line
    max_words = int(max_chars / AVG_CHARS_PER_WORD)

    return max_lines, max_words
```

**Accuracy**: This is an estimate. Actual capacity depends on exact characters, kerning, word wrapping. But even a rough estimate (within 30%) is vastly better than no estimate.

### A3. Extract Template Sample Content
**File**: `backend/app/services/template_parser.py`

Before slides are removed in assembly, capture the default text from template placeholders:
```python
sample_text: str | None = None  # Add to PlaceholderInfo
```

Read from the template's actual slides (not layouts) during parsing. This shows what the designer intended as example content.

### A4. Extract Background and Visual Inventory
**File**: `backend/app/services/template_parser.py`

Per layout, add:
```python
has_picture_placeholder: bool = False
non_placeholder_shape_count: int = 0
visual_density: str = "sparse"  # sparse, moderate, dense
```

This tells the AI: "This layout already has decorative elements, so keep text minimal" or "This is a text-heavy layout, you have room for detail."

---

## Phase B: Improve AI Prompts

### B1. Pass Spatial and Capacity Info to AI
**File**: `backend/app/services/content_generator.py`

Update `_build_layout_description()` to include:
```
Layout index 1: "Title and Content"
  Placeholders:
  - idx=0, name="Title 1", type=TITLE, size=9.1"x0.8", capacity=~8 words
  - idx=1, name="Content", type=BODY, size=8.5"x4.2", capacity=~120 words, ~15 lines
```

Convert EMU to inches for readability. Include capacity as explicit constraints.

### B2. Pass Design Context to AI
**File**: `backend/app/services/content_generator.py`

Add to system prompt:
```
TEMPLATE DESIGN CONTEXT:
- Slide dimensions: 13.33" x 7.5" (widescreen 16:9)
- Primary font: Montserrat
- Title size: 28pt, Body size: 16pt
- Color palette: dark blue (#1B3A5C), light gray (#F0F0F0), accent orange (#E87722)
- Style: Corporate, clean, professional
```

This shapes the AI's content decisions — formal language for corporate templates, creative language for pitch decks.

### B3. Add Content Density Rules
**File**: `backend/app/services/content_generator.py`

Replace `"Keep text concise"` with specific per-type rules:
```
CONTENT DENSITY RULES:
- TITLE placeholders: 1-8 words. Short, punchy, no periods.
- SUBTITLE placeholders: 5-20 words. One sentence max.
- BODY placeholders: Respect the word capacity shown for each placeholder.
  - Each bullet point: 1-2 lines maximum
  - Use level 0 for main points, level 1 for supporting details
  - Aim for 60-80% of max capacity (leave breathing room)
- Never exceed the stated word capacity for any placeholder.
```

### B4. Improve Example Quality
**File**: `backend/app/services/content_generator.py`

Replace the minimal 2-slide example with a more realistic example showing:
- Title slide with appropriately short title
- Content slide with 4-5 bullets at mixed levels
- Two-column layout (if template has one) with balanced content
- Section header slide with minimal text
- Include word count comments: `"text": "Quarterly Revenue Growth" // 3 words, fits TITLE`

### B5. Add Audience/Tone Parameter
**Files**: `content_generator.py`, `models/schemas.py`, frontend

New parameters:
```python
audience: str = "general"    # "executive", "technical", "educational", "sales"
tone: str = "professional"   # "formal", "casual", "inspirational", "analytical"
```

Include in system prompt: `"Write for a {audience} audience in a {tone} tone."`

---

## Phase C: Improve Slide Assembly

### C1. Fix Paragraph Formatting Inheritance
**File**: `backend/app/services/slide_assembler.py`

When adding paragraphs 2+, copy formatting from the template's first paragraph:

```python
import copy
from lxml import etree

def _fill_placeholder(placeholder, content: PlaceholderContent) -> None:
    if content.type != "text" or not content.paragraphs:
        return

    tf = placeholder.text_frame
    template_para = tf.paragraphs[0]

    # Capture template paragraph properties XML
    template_pPr = template_para._p.find(qn('a:pPr'))
    template_rPr = None
    if template_para.runs:
        template_rPr = template_para.runs[0]._r.find(qn('a:rPr'))

    for i, para_content in enumerate(content.paragraphs):
        if i == 0:
            para = tf.paragraphs[0]
        else:
            para = tf.add_paragraph()
            # Copy paragraph properties from template
            if template_pPr is not None:
                new_pPr = copy.deepcopy(template_pPr)
                para._p.insert(0, new_pPr)

        para.level = para_content.level

        if para.runs:
            run = para.runs[0]
            run.text = para_content.text
            for extra_run in para.runs[1:]:
                extra_run._r.getparent().remove(extra_run._r)
        else:
            run = para.add_run()
            run.text = para_content.text
            # Copy run properties from template
            if template_rPr is not None:
                new_rPr = copy.deepcopy(template_rPr)
                run._r.insert(0, new_rPr)

        if para_content.bold is not None:
            run.font.bold = para_content.bold
        if para_content.italic is not None:
            run.font.italic = para_content.italic
```

This ensures all paragraphs inherit the template's font, size, and color.

### C2. Add Content Overflow Detection
**File**: `backend/app/services/slide_assembler.py`

After filling a placeholder, estimate if content exceeds bounds:

```python
def _check_overflow(placeholder, content: PlaceholderContent, font_size_pt: float = 18.0):
    """Warn if content likely overflows placeholder bounds."""
    if not content.paragraphs or not placeholder.width or not placeholder.height:
        return

    EMU_PER_PT = 12700
    font_size_emu = font_size_pt * EMU_PER_PT
    line_height = font_size_emu * 1.15

    total_lines = len(content.paragraphs)  # Rough: 1 line per paragraph
    content_height = total_lines * line_height

    if content_height > placeholder.height:
        logger.warning(
            "Content overflow detected: %d lines (~%.1f\") in placeholder "
            "with %.1f\" height",
            total_lines,
            content_height / 914400,
            placeholder.height / 914400,
        )
```

Start with logging; later, auto-truncate or reduce font size.

### C3. Preserve Multi-Run Formatting
**File**: `slide_assembler.py` + `models/presentation.py`

Support formatting patterns within a paragraph. Extend `ParagraphContent`:
```python
class RunContent(BaseModel):
    text: str
    bold: bool | None = None
    italic: bool | None = None

class ParagraphContent(BaseModel):
    text: str              # Kept for backward compat
    runs: list[RunContent] | None = None  # Optional: multiple formatted runs
    level: int = 0
    bold: bool | None = None
    italic: bool | None = None
```

This enables: `[{"text": "Revenue: ", "bold": True}, {"text": "$4.2M (+12%)", "bold": False}]`

### C4. Support Image Placeholders
Deferred to Phase 2 of the project roadmap (image generation with Ideogram AI).

---

## Phase D: Frontend & UX

### D1. Outline Editing
Make `OutlineEditor.tsx` editable:
- Inline text editing for titles and bullets
- Drag-and-drop slide reordering
- Layout picker dropdown per slide
- Add/remove slides and bullet points

### D2. Progress Feedback (SSE)
- Backend: `StreamingResponse` with stage updates
- Frontend: Replace spinner with progress bar showing current stage

### D3. Preview Before Download
- Generate slide thumbnails server-side (python-pptx + Pillow or LibreOffice)
- Show grid of slide previews before download

---

## Execution Order (Recommended)

| Priority | Gap(s) | Phase | Effort | Impact |
|----------|--------|-------|--------|--------|
| 1 | GAP-04 | A1 | Medium | High — enables capacity estimation |
| 2 | GAP-01, GAP-02 | A2 + B1 | Medium | Critical — AI gets spatial awareness |
| 3 | GAP-03 | C1 | Low | High — fixes bullet formatting |
| 4 | B3 | B3 | Low | High — density rules per placeholder |
| 5 | GAP-05 | B2 | Low | Medium — design context in prompts |
| 6 | B4 | B4 | Low | Medium — better examples |
| 7 | GAP-06 | C2 | Medium | High — overflow safety net |
| 8 | GAP-09 | D1 | High | Medium — user control |
| 9 | B5 | B5 | Low | Medium — audience/tone |
| 10 | GAP-08 | C4 | High | Medium — image support |
| 11 | GAP-10 | D2 | Medium | Low — UX polish |
| 12 | GAP-07 | C3 | High | Medium — multi-run formatting |

## Success Metrics

After implementing priorities 1-4:
- Text should fit within placeholder bounds on 90%+ of generated slides
- Font, size, and color should match template on all paragraphs (not just the first)
- Bullet point count should be appropriate for placeholder size
- Title length should be 1-8 words consistently

## Verification Strategy

1. **Reference template**: Use a template with known formatting (specific fonts, colors, bullet styles)
2. **Generate test presentations**: Same topic, compare before/after each phase
3. **Visual diff**: Open in PowerPoint, check:
   - Text fits in all placeholders (no overflow, no excessive whitespace)
   - Fonts match template on all bullets
   - Colors are consistent
   - Bullet hierarchy renders correctly
4. **Automated checks**: Unit tests for capacity estimation accuracy, formatting extraction completeness
