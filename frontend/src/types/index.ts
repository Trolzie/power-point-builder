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
  content_placeholder_count: number;
  recommended: boolean;
  preview_description: string | null;
}

export interface MasterInfo {
  index: number;
  name: string;
  layouts: LayoutInfo[];
}

export interface LayoutConfig {
  role: string;
  usage_hint: string | null;
  style_notes: string | null;
  max_uses: number | null;
  enabled: boolean;
}

export interface TemplateManifest {
  template_id: string;
  filename: string;
  slide_width_emu: number;
  slide_height_emu: number;
  theme_colors: Record<string, string>;
  masters: MasterInfo[];
  default_layouts: number[] | null;
  layout_configs: Record<string, LayoutConfig> | null;
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

export interface QualityIssue {
  severity: "info" | "warning" | "error";
  category: string;
  message: string;
  suggestion: string | null;
  slide_index: number | null;
  placeholder_idx: number | null;
}

export interface SlideQuality {
  slide_index: number;
  layout_name: string;
  utilization_pct: number;
  issues: QualityIssue[];
}

export interface QualityReport {
  overall_score: number;
  summary: string;
  total_issues: number;
  issues_by_severity: Record<string, number>;
  slides: SlideQuality[];
  llm_analysis: string | null;
}

export interface GeneratePresentationResponse {
  presentation_id: string;
  filename: string;
  quality_report: QualityReport | null;
  repaired_id: string | null;
  repaired_filename: string | null;
  repaired_quality_report: QualityReport | null;
}
