from pydantic import BaseModel

from app.models.presentation import PresentationContent


class GenerateOutlineRequest(BaseModel):
    template_id: str
    topic: str
    num_slides: int = 8


class GenerateOutlineResponse(BaseModel):
    outline: PresentationContent
    template_id: str


class GeneratePresentationRequest(BaseModel):
    template_id: str
    outline: PresentationContent


class GeneratePresentationResponse(BaseModel):
    presentation_id: str
    filename: str


class TemplateListItem(BaseModel):
    template_id: str
    filename: str


class TemplateListResponse(BaseModel):
    templates: list[TemplateListItem]
