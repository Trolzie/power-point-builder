import {
  TemplateManifest,
  TemplateListItem,
  PresentationContent,
  GeneratePresentationResponse,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function uploadTemplate(file: File): Promise<TemplateManifest> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/templates/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listTemplates(): Promise<{ templates: TemplateListItem[] }> {
  const res = await fetch(`${API_BASE}/api/templates`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTemplate(id: string): Promise<TemplateManifest> {
  const res = await fetch(`${API_BASE}/api/templates/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function generateOutline(
  templateId: string,
  topic: string,
  numSlides: number = 8
): Promise<{ outline: PresentationContent; template_id: string }> {
  const res = await fetch(`${API_BASE}/api/generate/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId, topic, num_slides: numSlides }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function generatePresentation(
  templateId: string,
  outline: PresentationContent
): Promise<GeneratePresentationResponse> {
  const res = await fetch(`${API_BASE}/api/generate/presentation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId, outline }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getDownloadUrl(presentationId: string): string {
  return `${API_BASE}/api/presentations/${presentationId}/download`;
}

export async function listPresentations(): Promise<{ presentations: { presentation_id: string; filename: string }[] }> {
  const res = await fetch(`${API_BASE}/api/presentations`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePresentation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/presentations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
