# Slide Assembly Audit

## File: `backend/app/services/slide_assembler.py` (89 lines)

## Overview

The slide assembler is the final pipeline stage — it takes generated `PresentationContent` and a template `.pptx`, removes existing slides, creates new ones from layouts, and fills placeholders with AI-generated content. Its primary challenge is preserving template formatting while injecting dynamic text.

## Complete Function Analysis

### `assemble_presentation(template_path, content, output_path)` — lines 43-88

#### Step 1: Load Template (line 47)
```python
prs = Presentation(template_path)
```
- Opens the .pptx as a python-pptx `Presentation` object
- All layouts, masters, themes, and fonts are available

#### Step 2: Remove Existing Slides (lines 49-59)
```python
for slide in list(prs.slides):
    rId = slide.part.partname          # unused variable (line 51)
    for rel_key, rel in prs.part.rels.items():
        if rel.target_part is slide.part:
            prs.part.drop_rel(rel_key)
            break
    sldId_list = prs.slides._sldIdLst
    for sldId in list(sldId_list):
        sldId_list.remove(sldId)
```

**Strategy**: Two-pronged removal:
1. Drop the relationship between the presentation part and each slide part
2. Clear all slide ID entries from the slide ID list XML

**Issue**: `rId = slide.part.partname` on line 51 is assigned but never used (dead code).

**Issue**: The inner loop at lines 57-59 removes ALL sldId entries on EVERY iteration of the outer loop. After the first slide is processed, all sldId entries are already removed, so subsequent iterations of lines 57-59 are no-ops. This works but is inefficient — the sldId clearing should happen once after the relationship loop.

**Result**: Template becomes an empty shell with only layouts/masters preserved.

#### Step 3: Create Slides from Layouts (lines 61-63)
```python
for slide_content in content.slides:
    layout = prs.slide_layouts[slide_content.layout_index]
    slide = prs.slides.add_slide(layout)
```

- Looks up layout by integer index from `prs.slide_layouts`
- `add_slide()` creates a new slide inheriting the layout's structure
- New slide gets all placeholders defined in the layout

**Risk**: If `layout_index` is out of bounds, this throws an `IndexError` — no validation or error handling.

#### Step 4: Fill Placeholders (lines 65-81)
```python
for ph_key, ph_content in slide_content.placeholders.items():
    ph_idx = int(ph_key)
    target_ph = None
    for ph in slide.placeholders:
        if ph.placeholder_format.idx == ph_idx:
            target_ph = ph
            break
    if target_ph is not None:
        _fill_placeholder(target_ph, ph_content)
    else:
        logger.warning("Placeholder idx=%s not found...", ph_idx, ...)
```

- Converts string key to int for matching
- Linear scan through slide placeholders to find matching idx
- Calls `_fill_placeholder()` if found, warns if not

**Risk**: `int(ph_key)` will throw `ValueError` if AI generates non-numeric keys — no try/except.

#### Step 5: Add Speaker Notes (lines 83-84)
```python
if slide_content.speaker_notes:
    slide.notes_slide.notes_text_frame.text = slide_content.speaker_notes
```

- Accesses the notes slide (creates one if it doesn't exist)
- Sets text via `.text =` which **destroys any existing formatting** in the notes template
- Only plain text — no bullet structure, bold, or formatting in notes

#### Step 6: Save (lines 86-88)
```python
Path(output_path).parent.mkdir(parents=True, exist_ok=True)
prs.save(output_path)
return output_path
```

- Creates output directory if needed
- Saves the assembled presentation

### `_fill_placeholder(placeholder, content)` — lines 11-40

This is the core formatting-preservation logic.

#### Guard Clause (lines 13-14)
```python
if content.type != "text" or not content.paragraphs:
    return
```
- Silently skips non-text content (images) and empty paragraphs
- PICTURE placeholders are never filled — this is where image support would go

#### Paragraph Iteration (lines 18-24)
```python
for i, para_content in enumerate(content.paragraphs):
    if i == 0:
        para = tf.paragraphs[0]    # Reuse first existing paragraph
    else:
        para = tf.add_paragraph()  # Add new paragraphs
    para.level = para_content.level
```

**First paragraph**: Reuses the template's existing first paragraph object. This is key — it inherits the paragraph's XML properties including default formatting.

**Subsequent paragraphs**: Uses `tf.add_paragraph()` which creates a minimal `<a:p>` element. This new paragraph:
- Has NO explicit font properties (inherits from... somewhere)
- May or may not match the template's default body text formatting
- Gets `level` set explicitly

**This is a critical gap** — paragraphs 2+ may render differently from paragraph 1 if the template relies on explicit paragraph-level formatting rather than layout/master defaults.

#### Run Handling (lines 26-35)
```python
if para.runs:
    run = para.runs[0]
    run.text = para_content.text
    for extra_run in para.runs[1:]:
        extra_run._r.getparent().remove(extra_run._r)
else:
    run = para.add_run()
    run.text = para_content.text
```

**If paragraph has existing runs** (i.e., first paragraph from template):
1. Takes the first run — preserves its font name, size, color, bold, italic
2. Sets new text content on it
3. Removes all extra runs via XML DOM manipulation (`._r.getparent().remove()`)

**If no existing runs** (i.e., newly added paragraphs):
1. Creates a new run with `para.add_run()`
2. New run has NO formatting — relies on inheritance from layout/master

**XML manipulation**: `extra_run._r` accesses the underlying `<a:r>` XML element. `.getparent().remove()` uses lxml to remove it from the paragraph's XML tree. This is more reliable than python-pptx's API which doesn't support run removal.

#### Bold/Italic Override (lines 37-40)
```python
if para_content.bold is not None:
    run.font.bold = para_content.bold
if para_content.italic is not None:
    run.font.italic = para_content.italic
```

- Only applied when explicitly set by the AI (not None)
- Overrides template defaults when applied
- Other font properties (size, color, name) are NEVER set — they come from the template run or inheritance

## Formatting Preservation Analysis

### What IS Preserved
| Property | How | Reliability |
|----------|-----|-------------|
| Font name | First run reuse | High (paragraph 1 only) |
| Font size | First run reuse | High (paragraph 1 only) |
| Font color | First run reuse | High (paragraph 1 only) |
| Bold/Italic (template) | First run reuse | High (paragraph 1 only) |
| Placeholder position | Layout inheritance | High |
| Placeholder dimensions | Layout inheritance | High |
| Master backgrounds | Not touched | High |
| Layout decorative elements | Not touched | High |

### What is LOST or At Risk
| Property | Why | Impact |
|----------|-----|--------|
| Multi-run formatting | Extra runs deleted (line 31-32) | High — templates with mixed formatting in one placeholder lose it |
| Paragraph 2+ fonts | `add_paragraph()` has no explicit format | High — may default to Calibri/black instead of template font |
| Paragraph 2+ colors | Same as above | High |
| Paragraph spacing | Not copied from template paragraph | Medium |
| Bullet styles | Not explicitly set (relies on level + inheritance) | Medium — may work if master defines bullet styles per level |
| Text alignment | Not copied or set | Medium — defaults to layout/master setting |
| Notes formatting | `.text =` destroys all formatting | Low — notes are secondary |
| Hyperlinks | No hyperlink support | Low |

### Paragraph Formatting Inheritance Chain (python-pptx)
When a new paragraph is added with `tf.add_paragraph()`:
1. Checks paragraph's own `<a:pPr>` — usually empty for new paragraphs
2. Falls back to placeholder's `<p:txBody><a:lstStyle>` — the placeholder's text style
3. Falls back to layout's placeholder definition
4. Falls back to master's placeholder definition
5. Falls back to theme defaults

**Whether paragraphs 2+ look correct depends entirely on how the template designer defined formatting.** If formatting is on the master/layout level (typical for professional templates), new paragraphs inherit correctly. If formatting is defined at the slide level (common in manually-edited templates), it's lost.

## Edge Cases and Risks

### 1. Content Overflow
No detection of whether text exceeds placeholder bounds. A placeholder that's 2 inches tall with 10 bullet points will overflow with no warning. PowerPoint may auto-shrink text, but this can make content unreadable.

### 2. Empty Placeholders
If a placeholder has content in the layout but the AI doesn't generate content for it, the layout's default text (e.g., "Click to add text") remains visible. This looks unprofessional.

### 3. Layout Index Out of Bounds
No validation that `slide_content.layout_index` is within `prs.slide_layouts` range. Invalid index throws unhandled `IndexError`.

### 4. Placeholder Index Mismatch
If the AI generates content for a placeholder idx that doesn't exist on the layout, it's logged as a warning but the content is silently dropped.

### 5. Non-Text Placeholder Types
PICTURE, TABLE, CHART placeholders are silently skipped. If the AI assigns text content to a PICTURE placeholder, nothing happens.

## Recommendations

See `05-improvement-plan.md` Phase C for specific improvements:
- C1: Fix paragraph formatting inheritance
- C2: Add content overflow detection
- C3: Preserve multi-run formatting
- C4: Support image placeholders
