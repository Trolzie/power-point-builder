"use client";
import { useState, useCallback } from "react";
import { extractDocument } from "@/lib/api";

interface Props {
  onSubmit: (topic: string, numSlides: number, referenceText: string | null) => void;
  loading: boolean;
}

export default function TopicInput({ onSubmit, loading }: Props) {
  const [topic, setTopic] = useState("");
  const [numSlides, setNumSlides] = useState(8);
  const [docFile, setDocFile] = useState<{ name: string; text: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleDocUpload = useCallback(async (file: File) => {
    setExtracting(true);
    setDocError(null);
    try {
      const result = await extractDocument(file);
      setDocFile({ name: result.filename, text: result.text });
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "Failed to extract document");
    } finally {
      setExtracting(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Presentation Topic / Instructions
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., Here is our quarterly expense report. Create a presentation highlighting the good and bad parts, with an executive summary on the final slide."
          className="w-full border rounded-lg p-3 h-24 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Document upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reference Document <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        {docFile ? (
          <div className="border rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{docFile.name}</span>
                <span className="text-xs text-gray-400">
                  {(docFile.text.length / 1000).toFixed(1)}k chars
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {showPreview ? "Hide" : "Preview"}
                </button>
                <button
                  onClick={() => { setDocFile(null); setShowPreview(false); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
            {showPreview && (
              <pre className="mt-2 text-xs text-gray-600 max-h-48 overflow-y-auto whitespace-pre-wrap border-t pt-2">
                {docFile.text.slice(0, 3000)}
                {docFile.text.length > 3000 && "\n\n... (preview truncated)"}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <label className={`cursor-pointer border border-dashed rounded-lg px-4 py-2 text-sm transition-colors ${
              extracting ? "border-gray-300 text-gray-400" : "border-gray-300 hover:border-blue-400 text-gray-600 hover:text-blue-600"
            }`}>
              {extracting ? "Extracting text..." : "Upload PDF, DOCX, or TXT"}
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                disabled={extracting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {docError && (
              <span className="text-xs text-red-500">{docError}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Slides
          </label>
          <input
            type="number"
            value={numSlides}
            onChange={(e) => setNumSlides(parseInt(e.target.value) || 8)}
            min={3}
            max={20}
            className="border rounded-lg p-2 w-20 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => onSubmit(topic, numSlides, docFile?.text ?? null)}
          disabled={!topic.trim() || loading || extracting}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Generating..." : "Generate Outline"}
        </button>
      </div>
    </div>
  );
}
