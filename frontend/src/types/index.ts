export interface PlaceholderInfo {
  idx: number;
  name: string | null;
  type: string;
  left: number | null;
  top: number | null;
  width: number | null;
  height: number | null;
}

export interface LayoutInfo {
  index: number;
  name: string;
  placeholders: PlaceholderInfo[];
}

export interface MasterInfo {
  index: number;
  name: string;
  layouts: LayoutInfo[];
}

export interface TemplateManifest {
  template_id: string;
  filename: string;
  slide_width_emu: number;
  slide_height_emu: number;
  theme_colors: Record<string, string>;
  masters: MasterInfo[];
}

export interface ParagraphContent {
  text: string;
  level?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface PlaceholderContent {
  type: "text" | "image";
  paragraphs?: ParagraphContent[];
  image_prompt?: string;
}

export interface SlideContent {
  layout_index: number;
  layout_name: string;
  placeholders: Record<string, PlaceholderContent>;
  speaker_notes?: string;
}

export interface PresentationContent {
  title: string;
  slides: SlideContent[];
}

export interface TemplateListItem {
  template_id: string;
  filename: string;
}

export interface GeneratePresentationResponse {
  presentation_id: string;
  filename: string;
}
