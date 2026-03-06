"use client";
import { useState, useCallback } from "react";
import { uploadTemplate } from "@/lib/api";
import { TemplateManifest } from "@/types";

interface Props {
  onUploaded: (manifest: TemplateManifest) => void;
}

export default function TemplateUploader({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  return (
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
      {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
    </div>
  );
}
