import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import generate, presentations, templates

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.TEMPLATES_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    # Re-generate manifests to fix stale placeholder type data
    from app.services.template_parser import parse_template

    for pptx_file in Path(settings.TEMPLATES_DIR).glob("*.pptx"):
        template_id = pptx_file.stem
        try:
            manifest = parse_template(str(pptx_file), template_id)
            manifest_path = pptx_file.with_suffix(".json")
            manifest_path.write_text(manifest.model_dump_json(indent=2))
            logger.info("Re-generated manifest for template %s", template_id)
        except Exception:
            logger.exception("Failed to re-generate manifest for %s", template_id)

    yield


app = FastAPI(title="PowerPoint Builder API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(templates.router)
app.include_router(generate.router)
app.include_router(presentations.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2"}
