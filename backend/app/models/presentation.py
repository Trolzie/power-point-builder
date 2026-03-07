from pydantic import BaseModel, Field


class ParagraphContent(BaseModel):
    text: str
    level: int = 0
    bold: bool | None = None
    italic: bool | None = None


class PlaceholderContent(BaseModel):
    type: str  # "text" or "image"
    paragraphs: list[ParagraphContent] | None = None
    image_prompt: str | None = None
    image_path: str | None = Field(default=None, exclude=True)


class SlideContent(BaseModel):
    layout_index: int
    layout_name: str
    placeholders: dict[str, PlaceholderContent]
    speaker_notes: str | None = None


class PresentationContent(BaseModel):
    title: str
    slides: list[SlideContent]
