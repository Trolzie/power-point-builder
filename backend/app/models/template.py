from pydantic import BaseModel


class PlaceholderInfo(BaseModel):
    idx: int
    name: str | None = None
    type: str  # TITLE, BODY, PICTURE, SUBTITLE, etc.
    left: int | None = None
    top: int | None = None
    width: int | None = None
    height: int | None = None
    # Default formatting extracted from template
    default_font_name: str | None = None
    default_font_size_pt: float | None = None
    default_font_color: str | None = None
    default_font_bold: bool | None = None
    default_alignment: str | None = None
    # Estimated content capacity
    estimated_max_lines: int | None = None
    estimated_max_words: int | None = None


class LayoutInfo(BaseModel):
    index: int
    name: str
    placeholders: list[PlaceholderInfo]


class MasterInfo(BaseModel):
    index: int
    name: str
    layouts: list[LayoutInfo]


class TemplateManifest(BaseModel):
    template_id: str
    filename: str
    slide_width_emu: int
    slide_height_emu: int
    theme_colors: dict[str, str]
    masters: list[MasterInfo]
