# PowerPoint Builder

AI-powered web app: upload a .pptx or .potx template, enter a topic, get a generated presentation.

## Architecture

- **Frontend**: Next.js 15 (App Router, TypeScript, Tailwind) — hosted on Vercel
- **Backend**: FastAPI (Python) — hosted on Railway
- **AI**: OpenAI GPT-4o via JSON mode for structured slide content
- **PPTX Engine**: python-pptx for template parsing and slide assembly

## Project Structure

```
backend/
  app/
    config.py              # Pydantic Settings (OPENAI_API_KEY, dirs)
    main.py                # FastAPI app, CORS, lifespan, health endpoint
    models/
      template.py          # TemplateManifest, PlaceholderInfo, LayoutInfo
      presentation.py      # PresentationContent, SlideContent, PlaceholderContent
      schemas.py           # API request/response schemas
    routers/
      templates.py         # POST upload, GET list, GET by id, DELETE
      generate.py          # POST outline, POST presentation
      presentations.py     # GET list, GET download, DELETE
    services/
      template_parser.py   # .pptx -> TemplateManifest (layouts, placeholders, theme colors)
      content_generator.py # OpenAI GPT-4o: outline + per-slide content via JSON mode
      slide_assembler.py   # python-pptx: fill placeholders, preserve formatting
      pipeline.py          # Orchestrates: parse -> outline -> content -> assemble
  .env                     # OPENAI_API_KEY (not committed)

frontend/
  src/
    app/page.tsx           # Main wizard: upload -> topic -> outline -> generate -> download
    components/
      TemplateUploader.tsx  # Drag-and-drop .pptx/.potx upload
      TopicInput.tsx        # Topic + slide count input
      OutlineEditor.tsx     # Read-only outline display (editable in future)
    lib/api.ts             # API client (uses NEXT_PUBLIC_API_URL)
    types/index.ts         # TypeScript types matching backend schemas
```

## Generation Pipeline (4 stages)

1. **Template Introspection** — parse .pptx into manifest (layouts, placeholders with idx/type/dimensions)
2. **Outline Generation** — GPT-4o picks layouts, generates titles + key points
3. **Content Generation** — GPT-4o expands outline into full placeholder content with speaker notes
4. **PPTX Assembly** — python-pptx loads template, removes existing slides, creates new ones from layouts, fills placeholders preserving run-level formatting

## Key Technical Decisions

- **OpenAI JSON mode** over function calling — GPT-4o doesn't reliably handle `additionalProperties` schemas in function calling. JSON mode with a concrete example in the prompt is more reliable.
- **Placeholder types filtered** — DATE, FOOTER, SLIDE_NUMBER, HEADER placeholders are excluded from AI prompts (auto-filled by PowerPoint).
- **Formatting preservation** — Slide assembler reuses existing paragraph runs (font, size, color) and removes extras via XML manipulation rather than using `.text =` which destroys formatting.
- **Existing slides removed** — Template slides are deleted before adding generated ones, preserving only layouts/masters.
- **Path traversal protection** — All user-supplied IDs validated with regex `^[a-zA-Z0-9_-]+$`.
- **Async thread offloading** — Blocking OpenAI calls wrapped in `asyncio.to_thread()` to avoid blocking the event loop.
- **.potx conversion** — python-pptx can't open `.potx` files (different content type in `[Content_Types].xml`). On upload, `.potx` files are converted by patching the content type from `template.main+xml` to `presentation.main+xml` inside the zip, then saved as `.pptx`.

## Deployment

- **Frontend**: Vercel (auto-deploys from GitHub not set up — use `vercel --prod`)
  - Env: `NEXT_PUBLIC_API_URL=https://power-point-builder-production.up.railway.app`
- **Backend**: Railway (auto-deploys from GitHub, root directory: `backend`)
  - Env: `OPENAI_API_KEY`, `TEMPLATES_DIR=/tmp/templates`, `OUTPUT_DIR=/tmp/output`
  - CORS: Currently `allow_origins=["*"]` (POC)

## Local Development

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Add OPENAI_API_KEY to backend/.env
uvicorn app.main:app --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

## Implementation Phases

- [x] Phase 1: Core pipeline (template upload -> AI content -> .pptx download)
- [ ] Phase 2: Image generation (Ideogram AI, Mermaid diagrams, QuickChart)
- [ ] Phase 3: Two-phase generation + UX (outline editing, SSE progress, PDF preview)
- [ ] Phase 4: Polish (template management UI, history, error handling, Docker Compose)

## Conventions

- Backend IDs: `uuid4().hex[:12]`
- Templates stored as `{id}.pptx` + `{id}.json` (manifest) in TEMPLATES_DIR (`.potx` uploads converted to `.pptx` on ingest)
- Generated files stored as `{id}.pptx` in OUTPUT_DIR
- All API routes prefixed with `/api/`
- Frontend uses `@/` path alias mapping to `src/`
