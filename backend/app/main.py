from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import generate, presentations, templates


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.TEMPLATES_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="PowerPoint Builder API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(templates.router)
app.include_router(generate.router)
app.include_router(presentations.router)
