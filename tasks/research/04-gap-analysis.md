# Gap Analysis — Verified Findings

## Methodology

Each gap was identified during initial exploration, then verified by reading the actual source code line-by-line. The "Verified" column indicates the specific code location that confirms the gap.

## Critical Gaps (Must Fix for Quality)

### GAP-01: AI has no placeholder dimension awareness
- **Stage**: Content Generation
- **Impact**: Content length is unpredictable — text overflows or leaves empty space
- **Verified**: `content_generator.py:34-35` — only `idx`, `name`, `type` passed; `width`/`height` available in manifest but ignored
- **Severity**: CRITICAL
- **Fix**: Pass placeholder dimensions and estimated word capacity to AI prompts

### GAP-02: No content capacity estimation
- **Stage**: Template Parsing → Content Generation
- **Impact**: AI guesses content length with no constraints
- **Verified**: `content_generator.py:210` — only guidance is "Keep text concise"
- **Severity**: CRITICAL
- **Fix**: Calculate max words/lines per placeholder based on dimensions + font size, pass as constraints

### GAP-03: Added paragraphs may lose template formatting
- **Stage**: Slide Assembly
- **Impact**: Bullet points 2+ may render in wrong font/size/color
- **Verified**: `slide_assembler.py:22` — `tf.add_paragraph()` with no explicit formatting
- **Severity**: HIGH
- **Root cause**: New paragraphs rely on python-pptx inheritance chain; works for well-structured templates but fails for templates with slide-level formatting
- **Fix**: Copy paragraph XML properties (`<a:pPr>`) from template paragraph to new paragraphs

## High-Impact Gaps (Significant Quality Improvement)

### GAP-04: No default font extraction from template
- **Stage**: Template Parsing
- **Impact**: AI can't match template typography; can't estimate content capacity
- **Verified**: `template_parser.py:67-77` — only structural properties extracted, no font access
- **Severity**: HIGH
- **Fix**: Extract `placeholder.text_frame.paragraphs[0].runs[0].font.*` during parsing

### GAP-05: Theme colors extracted but never used
- **Stage**: Template Parsing → Content Generation
- **Impact**: Wasted information; AI can't suggest color-appropriate emphasis
- **Verified**: `template_parser.py:94` extracts them; `content_generator.py` never references `manifest.theme_colors`
- **Severity**: MEDIUM
- **Fix**: Include theme color palette in AI system prompt

### GAP-06: No content overflow detection
- **Stage**: Slide Assembly
- **Impact**: Text silently overflows placeholder bounds; may cause auto-shrink or clipping
- **Verified**: `slide_assembler.py:18-40` — no size checking anywhere in `_fill_placeholder`
- **Severity**: HIGH
- **Fix**: Estimate rendered text height post-fill; warn or truncate if overflow

### GAP-07: Multi-run formatting destroyed
- **Stage**: Slide Assembly
- **Impact**: Templates with mixed formatting in one placeholder (e.g., "Key Term: description") lose the pattern
- **Verified**: `slide_assembler.py:31-32` — all runs after first are removed via XML
- **Severity**: MEDIUM
- **Fix**: Support run-level formatting patterns in content model and assembly

## Medium-Impact Gaps (Quality Polish)

### GAP-08: No image placeholder support
- **Stage**: Content Generation + Slide Assembly
- **Impact**: PICTURE placeholders left empty; templates with image slots are underutilized
- **Verified**: `slide_assembler.py:13-14` — returns silently for non-text content; `content_generator.py:124` — `image_prompt` parsed but never used
- **Severity**: MEDIUM
- **Fix**: Implement image generation (Phase 2 roadmap item)

### GAP-09: Outline is read-only
- **Stage**: Frontend
- **Impact**: Users can't refine AI choices before generation; stuck with first attempt
- **Verified**: `frontend/src/components/OutlineEditor.tsx` — display only, no edit handlers
- **Severity**: MEDIUM
- **Fix**: Make outline editable (slide reorder, text edit, layout change)

### GAP-10: No progress feedback during generation
- **Stage**: Frontend + Backend
- **Impact**: Users wait 30-60s with only a spinner; no indication of what's happening
- **Verified**: `frontend/src/app/page.tsx:130-136` — static "Generating..." message
- **Severity**: LOW
- **Fix**: SSE streaming from backend with stage progress

### GAP-11: Speaker notes lose formatting
- **Stage**: Slide Assembly
- **Impact**: Notes template formatting is destroyed
- **Verified**: `slide_assembler.py:84` — `.text =` replaces all notes content
- **Severity**: LOW
- **Fix**: Use paragraph/run approach for notes (same as placeholder filling)

### GAP-12: Slide removal has dead code and inefficiency
- **Stage**: Slide Assembly
- **Impact**: None (functional but code quality)
- **Verified**: `slide_assembler.py:51` — `rId = slide.part.partname` is unused; lines 57-59 over-iterate
- **Severity**: LOW
- **Fix**: Clean up: remove unused variable, move sldId clearing outside loop

### GAP-13: No layout index validation
- **Stage**: Slide Assembly
- **Impact**: Out-of-bounds layout index causes unhandled `IndexError`
- **Verified**: `slide_assembler.py:62` — direct index into `prs.slide_layouts` with no bounds check
- **Severity**: LOW (AI rarely generates invalid indices)
- **Fix**: Add bounds check with meaningful error message

### GAP-14: Model hardcoded to gpt-4o
- **Stage**: Content Generation
- **Impact**: Can't easily try newer/different models
- **Verified**: `content_generator.py:17` — `MODEL = "gpt-4o"`
- **Severity**: LOW
- **Fix**: Move to `config.py` settings

## Gap Dependency Map

```
GAP-04 (font extraction)
  └─> GAP-02 (capacity estimation) — needs font size to calculate capacity
       └─> GAP-01 (dimension awareness) — capacity = dimensions + font
            └─> GAP-06 (overflow detection) — needs capacity to detect overflow

GAP-05 (theme colors) ─> standalone prompt improvement

GAP-03 (paragraph formatting) ─> standalone assembly fix

GAP-07 (multi-run) ─> requires content model changes + assembly changes

GAP-08 (images) ─> requires image generation service (Phase 2)
```

## Priority Matrix

```
                    HIGH IMPACT
                        │
    GAP-01, GAP-02  ────┼──── GAP-04
    (dimensions +       │     (font extraction)
     capacity)          │
                        │
  LOW EFFORT ───────────┼─────────── HIGH EFFORT
                        │
    GAP-05, GAP-12  ────┼──── GAP-08, GAP-09
    (theme colors,      │     (images, outline
     cleanup)           │      editing)
                        │
                    LOW IMPACT
```

## Recommended Execution Order

1. **GAP-04** → Extract fonts (foundation for capacity)
2. **GAP-02 + GAP-01** → Calculate capacity + pass dimensions to AI
3. **GAP-03** → Fix paragraph formatting inheritance
4. **GAP-05** → Pass theme colors to AI
5. **GAP-06** → Add overflow detection
6. **GAP-07** → Multi-run formatting support
7. **GAP-09** → Outline editing
8. **GAP-08** → Image generation
9. **GAP-10** → SSE progress
