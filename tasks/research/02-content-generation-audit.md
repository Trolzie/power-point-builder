# Content Generation Audit

## File: `backend/app/services/content_generator.py` (235 lines)

## Overview

Content generation uses OpenAI GPT-4o in JSON mode across two stages: outline generation (pick layouts, generate titles + key points) and content expansion (flesh out bullets, add speaker notes). The quality of output is directly constrained by what information the AI receives about the template.

## Architecture: Two-Stage Generation

### Stage 1: Outline Generation (`generate_outline`, lines 137-183)
- **Input**: topic string, `TemplateManifest`, num_slides
- **Output**: `PresentationContent` (layout choices, titles, key bullet points)
- **Purpose**: Structural decisions — which layout for each slide, high-level content

### Stage 2: Content Expansion (`generate_slide_content`, lines 186-234)
- **Input**: topic string, outline `PresentationContent`, `TemplateManifest`
- **Output**: `PresentationContent` (expanded content, speaker notes)
- **Purpose**: Flesh out outlines into presentation-ready text

Both stages use `response_format={"type": "json_object"}` (OpenAI JSON mode).

## What the AI Receives

### Layout Description (`_build_layout_description`, lines 22-40)

For each layout, the AI gets:
```
Layout index 1: "Title and Content"
  Placeholders:
  - idx=0, name="Title 1", type=TITLE
  - idx=1, name="Content Placeholder 2", type=BODY
```

**Included**: layout index, layout name, placeholder idx, name, type
**Excluded**: placeholder width, height, left, top, font info, capacity

### Placeholder Filtering (line 19, 27-29)
Auto-fill types are excluded: `DATE`, `FOOTER`, `SLIDE_NUMBER`, `HEADER`
This is correct — these are populated by PowerPoint automatically.

Layouts with ONLY auto-fill placeholders are skipped entirely (line 31).

### JSON Example (`_build_example`, lines 43-83)
A hardcoded 2-slide example showing:
- Title Slide: placeholder "0" (title) + "1" (subtitle)
- Title and Content: placeholder "0" (title) + "1" (body with 3 bullets at levels 0 and 1)
- Speaker notes on both slides
- Bold flag on title

**Problem**: This example is minimal — the AI may generate similarly sparse content. The body shows only 3 short bullet points with no variation in density.

## What the AI Does NOT Receive (Gaps)

### 1. Placeholder Dimensions (CRITICAL)
The AI has zero spatial awareness. It doesn't know if a content placeholder is:
- A tiny 2-inch box (fits ~20 words)
- A full-slide 8x5 inch area (fits ~150 words)

Result: Content length is unpredictable. Too much text overflows; too little leaves empty space.

### 2. Placeholder Positions
No spatial relationship information. The AI can't reason about:
- Which placeholder is the "main" content area vs a sidebar
- Whether placeholders are stacked vertically or side-by-side
- Relative size comparisons between placeholders on the same layout

### 3. Slide Dimensions
`slide_width_emu` and `slide_height_emu` are in the manifest but not passed to the prompt. The AI can't calibrate content for widescreen (16:9) vs standard (4:3).

### 4. Theme Colors
Extracted and stored in manifest but completely ignored by `content_generator.py`. The AI can't match the template's color palette or suggest color-appropriate content.

### 5. Font Information
No font names, sizes, or styles from the template. The AI can't:
- Match the template's typographic language
- Calibrate word count to font size (28pt title vs 12pt body)
- Know if the template uses a compact or spacious font

### 6. Content Capacity
No guidance on how many words/lines/characters fit in each placeholder. The only density hint is `"Keep text concise"` (line 210).

### 7. Template Design Intent
No visual context — the AI doesn't know if this is:
- A corporate quarterly review template
- A creative pitch deck
- An educational lecture template
- A minimalist design with lots of whitespace

## Prompt Analysis

### Outline System Prompt (lines 146-163)
```
Role: "presentation design expert"
Format: "ONLY valid JSON matching the exact format"
Rules:
  - layout_index must match available layouts
  - Placeholder keys must be string idx values
  - Each placeholder must have type + paragraphs
  - Each paragraph must have text + level
  - Include speaker_notes
  - Choose layouts that best fit content
```

**Strengths**: Clear structure rules, concrete example
**Weaknesses**: No content density guidance, no design context, no audience/tone

### Content System Prompt (lines 196-212)
```
Role: "presentation content expert"
Rules:
  - Keep same layout_index choices
  - Expand bullet points into clear, concise content
  - Add speaker_notes with talking points
  - Use bold: true for key terms
  - "Keep text concise" ← only density guidance
  - Use paragraph levels for hierarchy
```

**Strengths**: Builds on outline, preserves structure
**Weaknesses**: "Keep text concise" is vague — concise for a title placeholder is 5 words, concise for a body placeholder is 100 words

### User Prompts
- Outline: `"Create a {num_slides}-slide presentation outline about: {topic}"`
- Content: `"Topic: {topic}\n\nHere is the outline to expand..."`

**Missing**: audience, tone, formality level, industry context

## JSON Response Parsing (`_parse_json_response`, lines 86-134)

### Robustness Features
- Strips markdown code fences (`\`\`\`json ... \`\`\``) — lines 89-94
- Handles placeholder data as string instead of object — lines 102-108
- Handles paragraph data as string instead of dict — line 114
- Defaults: level=0, bold=None, italic=None

### Data Flow
```
LLM JSON string
  → strip code fences
  → json.loads()
  → iterate slides
    → iterate placeholders
      → handle string vs object
      → parse paragraphs (string vs dict)
      → create PlaceholderContent (type, paragraphs, image_prompt)
    → create SlideContent (layout_index, layout_name, placeholders, speaker_notes)
  → PresentationContent(title, slides)
```

### Image Support (Partial)
- `image_prompt` field is read from JSON (line 124)
- Stored in `PlaceholderContent` model
- But **never acted on** in `slide_assembler.py` — PICTURE placeholders stay empty

## Data Model: Content

```python
# models/presentation.py
class ParagraphContent(BaseModel):
    text: str
    level: int = 0              # 0=main, 1=sub-point
    bold: bool | None = None    # Explicit override only
    italic: bool | None = None  # Explicit override only

class PlaceholderContent(BaseModel):
    type: str                              # "text" or "image"
    paragraphs: list[ParagraphContent] | None = None
    image_prompt: str | None = None        # Unused downstream

class SlideContent(BaseModel):
    layout_index: int
    layout_name: str
    placeholders: dict[str, PlaceholderContent]  # Key = string idx
    speaker_notes: str | None = None

class PresentationContent(BaseModel):
    title: str
    slides: list[SlideContent]
```

## Key Observations

1. **The AI is flying blind on content density** — without placeholder dimensions or capacity estimates, every slide is a gamble on whether text fits.

2. **Two AI calls = two chances for drift** — the content expansion stage could change structure, layout choices, or placeholder keys. The prompt says "keep the same layout_index" but there's no validation.

3. **The example is too simple** — a 2-slide example with 3 short bullets sets a low bar. More realistic examples with varied content density would improve output.

4. **No feedback loop** — the AI can't see the result. If content overflows or looks sparse, there's no retry or adjustment mechanism.

5. **Theme colors are wasted** — extracted in parsing, available in manifest, but never mentioned in prompts. These could guide the AI to suggest color-appropriate content emphasis.

6. **Model is hardcoded** — `MODEL = "gpt-4o"` (line 17). No configuration to try newer models or adjust for cost/quality tradeoffs.

## Recommendations

See `05-improvement-plan.md` Phase B for specific improvements:
- B1: Pass spatial and capacity info to AI
- B2: Pass design context to AI
- B3: Add content density rules per placeholder type
- B4: Improve example quality
- B5: Add audience/tone parameter
