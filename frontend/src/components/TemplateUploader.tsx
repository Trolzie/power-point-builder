"use client";
import { useState, useCallback, useEffect } from "react";
import { uploadTemplate, listTemplates, getTemplate } from "@/lib/api";
import { TemplateManifest, TemplateListItem } from "@/types";

interface Props {
  onUploaded: (manifest: TemplateManifest) => void;
}

export default function TemplateUploader({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then((res) => setTemplates(res.templates))
      .catch(() => {});
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pptx") && !file.name.endsWith(".potx")) {
      setError("Please upload a .pptx or .potx file");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const manifest = await uploadTemplate(file);
      onUploaded(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onUploaded]);

  const handleSelectTemplate = async (t: TemplateListItem) => {
    setLoadingTemplate(t.template_id);
    setError(null);
    try {
      const manifest = await getTemplate(t.template_id);
      onUploaded(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setLoadingTemplate(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload new template */}
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
          <p className="text-gray-500">Uploading...</p>
        ) : (
          <>
            <p className="text-gray-600 mb-2">Drag & drop a .pptx or .potx template here</p>
            <p className="text-gray-400 text-sm mb-4">or</p>
            <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
              Choose File
              <input
                type="file"
                accept=".pptx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.template"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          </>
        )}
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      </div>

      {/* Previously uploaded templates */}
      {templates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Or use a previously uploaded template</h3>
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.template_id}
                onClick={() => handleSelectTemplate(t)}
                disabled={loadingTemplate !== null}
                className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center justify-between"
              >
                <span className="text-gray-700">{t.filename}</span>
                {loadingTemplate === t.template_id && (
                  <span className="text-sm text-gray-400">Loading...</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
