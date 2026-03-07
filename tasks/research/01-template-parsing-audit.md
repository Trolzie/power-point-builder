# Template Parsing Audit

## File: `backend/app/services/template_parser.py` (104 lines)

## Overview

The template parser extracts structural information from a .pptx file and produces a `TemplateManifest` — the contract between template understanding and content generation. Everything downstream depends on the richness of this manifest.

## What IS Extracted

### Slide Dimensions (lines 99-100)
- `slide_width_emu` and `slide_height_emu` from `prs.slide_width` / `prs.slide_height`
- Stored in EMU (English Metric Units; 914400 EMU = 1 inch)
- Available in manifest but **never passed to AI prompts**

### Master/Layout/Placeholder Hierarchy (lines 62-92)
- Iterates all slide masters → all layouts per master → all placeholders per layout
- Builds `MasterInfo` → `LayoutInfo` → `PlaceholderInfo` tree
- Master names are auto-generated (`"Master 0"`, `"Master 1"`) — not extracted from the file

### Placeholder Properties (lines 67-77)
Each placeholder extracts:
- `idx` — placeholder format index (used to match content to placeholders)
- `name` — display name (e.g., "Title 1", "Content Placeholder 2")
- `type` — enum string via `_placeholder_type_str()` (TITLE, BODY, PICTURE, SUBTITLE, etc.)
- `left`, `top`, `width`, `height` — position and size in EMU

### Theme Colors (lines 22-51, `_extract_theme_colors()`)
- Navigates XML: first slide master → theme element → `a:clrScheme`
- Extracts 12 standard Office colors: dk1, dk2, lt1, lt2, accent1-6, hlink, folHlink
- Handles both `srgbClr` (hex RGB) and `sysClr` (Windows system color with `lastClr` fallback)
- Silently catches all exceptions (line 49-50) — errors here are invisible

### Placeholder Type Resolution (lines 12-19, `_placeholder_type_str()`)
- Converts python-pptx enum to string via `.name` property
- Returns `"UNKNOWN"` if type is None
- Falls back to `str(ph_type)` if no `.name`

## What is NOT Extracted (Gaps)

### 1. Default Text Formatting (CRITICAL)
The parser does not extract any formatting from placeholder text runs:
- **Font name** (e.g., Calibri, Arial, Montserrat)
- **Font size** (e.g., 28pt for titles, 18pt for body)
- **Font color** (direct RGB or theme color reference)
- **Bold/italic/underline defaults**
- **Text alignment** (left, center, right, justified)
- **Line spacing** (single, 1.5, double, exact points)

This is accessible via: `placeholder.text_frame.paragraphs[0].runs[0].font.*`

### 2. Paragraph-Level Formatting
- **Bullet style** (filled circle, dash, numbered, custom character)
- **Bullet color and size**
- **Indentation** per level (hanging indent, left margin)
- **Space before/after** paragraphs
- **Default paragraph count** and level structure

### 3. Placeholder Default Content
- Template placeholders often contain sample text (e.g., "Click to add title")
- This text reveals the **designer's intent** for content type, length, and style
- Not extracted — lost when slides are removed during assembly

### 4. Background and Visual Properties
- **Slide background fills** (solid, gradient, pattern, image)
- **Layout-specific backgrounds** vs master backgrounds
- **Decorative shapes** on layouts (lines, rectangles, images outside placeholders)

### 5. Non-Placeholder Shapes
- Logos, icons, decorative elements on masters/layouts
- Tables, charts, SmartArt shapes
- These affect available space and visual balance

### 6. Slide-Level Properties
- Transitions and animations
- Follow master/layout settings

## Data Model: `TemplateManifest`

```python
# models/template.py
class PlaceholderInfo(BaseModel):
    idx: int
    name: str | None = None
    type: str                    # TITLE, BODY, PICTURE, SUBTITLE, etc.
    left: int | None = None      # EMU
    top: int | None = None       # EMU
    width: int | None = None     # EMU
    height: int | None = None    # EMU

class LayoutInfo(BaseModel):
    index: int
    name: str
    placeholders: list[PlaceholderInfo]

class MasterInfo(BaseModel):
    index: int
    name: str                    # Auto-generated "Master N"
    layouts: list[LayoutInfo]

class TemplateManifest(BaseModel):
    template_id: str
    filename: str
    slide_width_emu: int
    slide_height_emu: int
    theme_colors: dict[str, str]
    masters: list[MasterInfo]
```

## Key Observations

1. **Theme colors are extracted but never used** — they're stored in the manifest but `content_generator.py` ignores them completely.

2. **Placeholder dimensions are available but not leveraged** — `width` and `height` are stored but never passed to the AI, so content length is unguided.

3. **Silent exception handling** on theme color extraction means failures are invisible — could lead to empty theme colors without any diagnostic.

4. **Master names are meaningless** — `"Master 0"` provides no useful context. The actual master name from the file would be more informative.

5. **Layout filtering happens downstream** — layouts with only auto-fill placeholders (DATE, FOOTER, etc.) are filtered in `content_generator.py`, not here. The manifest contains all layouts even if they're unusable for content.

## Recommendations

See `05-improvement-plan.md` Phase A for specific improvements:
- A1: Extract default formatting per placeholder
- A2: Calculate content capacity per placeholder
- A3: Extract template sample content
- A4: Extract background and visual inventory
