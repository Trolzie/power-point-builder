"use client";
import { useState, useEffect, useCallback } from "react";
import { uploadTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate, getTemplateDownloadUrl } from "@/lib/api";
import { TemplateManifest, TemplateListItem, LayoutInfo, LayoutConfig } from "@/types";
import LayoutPreview from "@/components/LayoutPreview";

const FILTERED_TYPES = ["DATE", "FOOTER", "SLIDE_NUMBER", "HEADER", "CHART", "TABLE", "VERTICAL_OBJECT", "VERTICAL_BODY"];

const ROLE_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "section_break", label: "Section Break" },
  { value: "content", label: "Content" },
  { value: "content_with_image", label: "Content + Image" },
  { value: "comparison", label: "Comparison" },
  { value: "closing", label: "Closing" },
  { value: "blank", label: "Blank" },
  { value: "other", label: "Other" },
];

const ROLE_COLORS: Record<string, string> = {
  title: "bg-purple-100 text-purple-700",
  section_break: "bg-orange-100 text-orange-700",
  content: "bg-blue-100 text-blue-700",
  content_with_image: "bg-teal-100 text-teal-700",
  comparison: "bg-indigo-100 text-indigo-700",
  closing: "bg-pink-100 text-pink-700",
  blank: "bg-gray-100 text-gray-500",
  other: "bg-gray-100 text-gray-600",
};

function autoDetectRole(layout: LayoutInfo): string {
  const contentPhs = layout.placeholders.filter((p) => !FILTERED_TYPES.includes(p.type));
  const types = new Set(contentPhs.map((p) => p.type));

  if (contentPhs.length === 0) return "blank";
  if ((types.has("CENTER_TITLE") || types.has("TITLE")) && types.has("SUBTITLE") && !types.has("BODY") && !types.has("OBJECT")) return "title";
  if (types.has("TITLE") && !types.has("BODY") && !types.has("OBJECT") && !types.has("PICTURE")) return "section_break";
  if (types.has("PICTURE")) return "content_with_image";
  if (contentPhs.length >= 4) return "comparison";
  return "content";
}

function buildInitialConfigs(manifest: TemplateManifest): Record<string, LayoutConfig> {
  if (manifest.layout_configs) return { ...manifest.layout_configs };

  const allLayouts = manifest.masters.flatMap((m) => m.layouts);
  const configs: Record<string, LayoutConfig> = {};

  for (const layout of allLayouts) {
    const role = autoDetectRole(layout);
    const contentPhs = layout.placeholders.filter((p) => !FILTERED_TYPES.includes(p.type));
    const enabled = role === "blank" ? false : (manifest.default_layouts ? manifest.default_layouts.includes(layout.index) : layout.recommended);

    configs[String(layout.index)] = {
      role,
      usage_hint: null,
      style_notes: null,
      max_uses: role === "title" || role === "closing" ? 1 : null,
      enabled: enabled || contentPhs.length === 0 ? enabled : enabled,
    };
  }
  return configs;
}

interface Props {
  onTemplateReady: (manifest: TemplateManifest) => void;
}

export default function TemplatePicker({ onTemplateReady }: Props) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedManifest, setSelectedManifest] = useState<TemplateManifest | null>(null);
  const [layoutConfigs, setLayoutConfigs] = useState<Record<string, LayoutConfig>>({});
  const [uploading, setUploading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refreshTemplates = useCallback(async () => {
    try {
      const res = await listTemplates();
      setTemplates(res.templates);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pptx") && !file.name.endsWith(".potx")) {
      setError("Please upload a .pptx or .potx file");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const manifest = await uploadTemplate(file);
      await refreshTemplates();
      selectManifest(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [refreshTemplates]);

  const selectManifest = (manifest: TemplateManifest) => {
    setSelectedManifest(manifest);
    setLayoutConfigs(buildInitialConfigs(manifest));
  };

  const handleSelectTemplate = async (t: TemplateListItem) => {
    setLoadingId(t.template_id);
    setError(null);
    try {
      const manifest = await getTemplate(t.template_id);
      selectManifest(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.template_id !== id));
      if (selectedManifest?.template_id === id) {
        setSelectedManifest(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete template");
    }
  };

  const updateConfig = (index: string, patch: Partial<LayoutConfig>) => {
    setLayoutConfigs((prev) => ({
      ...prev,
      [index]: { ...prev[index], ...patch },
    }));
  };

  const enabledCount = Object.values(layoutConfigs).filter((c) => c.enabled).length;

  const handleUseTemplate = async () => {
    if (!selectedManifest) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTemplate(selectedManifest.template_id, {
        layout_configs: layoutConfigs,
      });
      onTemplateReady(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const allLayouts = selectedManifest?.masters.flatMap((m) => m.layouts) ?? [];

  // Layout browser view
  if (selectedManifest) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{selectedManifest.filename}</h2>
            <p className="text-sm text-gray-500">
              {allLayouts.length} layouts &middot; {enabledCount} enabled
            </p>
          </div>
          <button
            onClick={() => setSelectedManifest(null)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Back to templates
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              Configure layouts for generation
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const next = { ...layoutConfigs };
                  for (const l of allLayouts) {
                    if (next[String(l.index)]) next[String(l.index)] = { ...next[String(l.index)], enabled: l.recommended };
                  }
                  setLayoutConfigs(next);
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Select recommended
              </button>
              <button
                onClick={() => {
                  const next = { ...layoutConfigs };
                  for (const k of Object.keys(next)) next[k] = { ...next[k], enabled: true };
                  setLayoutConfigs(next);
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Select all
              </button>
              <button
                onClick={() => {
                  const next = { ...layoutConfigs };
                  for (const k of Object.keys(next)) next[k] = { ...next[k], enabled: false };
                  setLayoutConfigs(next);
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          </div>

          {allLayouts.map((layout) => (
            <LayoutConfigCard
              key={layout.index}
              layout={layout}
              config={layoutConfigs[String(layout.index)] || { role: "content", usage_hint: null, style_notes: null, max_uses: null, enabled: false }}
              slideWidth={selectedManifest.slide_width_emu}
              slideHeight={selectedManifest.slide_height_emu}
              onChange={(patch) => updateConfig(String(layout.index), patch)}
            />
          ))}
        </div>

        <button
          onClick={handleUseTemplate}
          disabled={enabledCount === 0 || saving}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {saving ? "Saving..." : `Use Template (${enabledCount} layouts enabled)`}
        </button>
      </div>
    );
  }

  // Template list view
  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        {uploading ? (
          <p className="text-gray-500">Uploading & analyzing template...</p>
        ) : (
          <>
            <p className="text-gray-600 mb-2">Drag & drop a .pptx or .potx template here</p>
            <p className="text-gray-400 text-sm mb-4">or</p>
            <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
              Choose File
              <input
                type="file"
                accept=".pptx,.potx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          </>
        )}
      </div>

      {/* Saved templates */}
      {templates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Saved templates</h3>
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.template_id}
                className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <button
                  onClick={() => handleSelectTemplate(t)}
                  disabled={loadingId !== null}
                  className="text-left flex-1 disabled:opacity-50"
                >
                  <span className="text-gray-700">{t.filename}</span>
                  {loadingId === t.template_id && (
                    <span className="text-sm text-gray-400 ml-2">Loading...</span>
                  )}
                </button>
                <a
                  href={getTemplateDownloadUrl(t.template_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-400 hover:text-blue-600 ml-3"
                  download
                >
                  Download
                </a>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.template_id); }}
                  className="text-xs text-red-400 hover:text-red-600 ml-3"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LayoutConfigCard({
  layout,
  config,
  slideWidth,
  slideHeight,
  onChange,
}: {
  layout: LayoutInfo;
  config: LayoutConfig;
  slideWidth: number;
  slideHeight: number;
  onChange: (patch: Partial<LayoutConfig>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const roleLabel = ROLE_OPTIONS.find((r) => r.value === config.role)?.label || config.role;
  const roleColorClass = ROLE_COLORS[config.role] || ROLE_COLORS.other;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        config.enabled
          ? "border-blue-300 bg-blue-50/50"
          : "border-gray-200 bg-white"
      }`}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={() => onChange({ enabled: !config.enabled })}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
        />

        <LayoutPreview
          placeholders={layout.placeholders}
          slideWidth={slideWidth}
          slideHeight={slideHeight}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-800 truncate">
              {layout.name}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${roleColorClass}`}>
              {roleLabel}
            </span>
            <span className="text-xs text-gray-400">
              #{layout.index}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {layout.preview_description || "No content placeholders"}
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 flex-shrink-0"
        >
          {expanded ? "Collapse" : "Configure"}
        </button>
      </div>

      {/* Expanded config form */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={config.role}
                onChange={(e) => {
                  const role = e.target.value;
                  const patch: Partial<LayoutConfig> = { role };
                  if (role === "title" || role === "closing") patch.max_uses = 1;
                  onChange(patch);
                }}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max uses</label>
              <input
                type="number"
                min={1}
                value={config.max_uses ?? ""}
                onChange={(e) => onChange({ max_uses: e.target.value ? Number(e.target.value) : null })}
                placeholder="Unlimited"
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Usage hint</label>
            <input
              type="text"
              value={config.usage_hint ?? ""}
              onChange={(e) => onChange({ usage_hint: e.target.value || null })}
              placeholder="When should this layout be used?"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Style notes</label>
            <input
              type="text"
              value={config.style_notes ?? ""}
              onChange={(e) => onChange({ style_notes: e.target.value || null })}
              placeholder="Style preferences for content..."
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
