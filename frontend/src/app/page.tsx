"use client";
import { useState, useEffect, useCallback } from "react";
import TemplatePicker from "@/components/TemplatePicker";
import TopicInput from "@/components/TopicInput";
import OutlineEditor from "@/components/OutlineEditor";
import QualityReportComponent from "@/components/QualityReport";
import { TemplateManifest, PresentationContent, QualityReport, GeneratePresentationResponse } from "@/types";
import { generateOutline, generatePresentation, getDownloadUrl, listPresentations, deletePresentation } from "@/lib/api";

type Step = "template" | "topic" | "outline" | "generating" | "done";

export default function Home() {
  const [step, setStep] = useState<Step>("template");
  const [template, setTemplate] = useState<TemplateManifest | null>(null);
  const [outline, setOutline] = useState<PresentationContent | null>(null);
  const [presentationId, setPresentationId] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [repairedId, setRepairedId] = useState<string | null>(null);
  const [repairedQualityReport, setRepairedQualityReport] = useState<QualityReport | null>(null);
  const [referenceText, setReferenceText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFiles, setSavedFiles] = useState<{ presentation_id: string; filename: string }[]>([]);
  const [showFiles, setShowFiles] = useState(false);

  const refreshFiles = useCallback(async () => {
    try {
      const result = await listPresentations();
      setSavedFiles(result.presentations);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (showFiles) refreshFiles();
  }, [showFiles, refreshFiles]);

  const handleDeleteFile = async (id: string) => {
    await deletePresentation(id);
    setSavedFiles((prev) => prev.filter((f) => f.presentation_id !== id));
  };

  const handleDeleteAll = async () => {
    await Promise.all(savedFiles.map((f) => deletePresentation(f.presentation_id)));
    setSavedFiles([]);
  };

  const handleTemplateReady = (manifest: TemplateManifest) => {
    setTemplate(manifest);
    setStep("topic");
  };

  const handleGenerateOutline = async (topic: string, numSlides: number, refText: string | null) => {
    if (!template) return;
    setReferenceText(refText);
    setLoading(true);
    setError(null);
    try {
      const result = await generateOutline(template.template_id, topic, numSlides, refText);
      setOutline(result.outline);
      setStep("outline");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate outline");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!template || !outline) return;
    setStep("generating");
    setError(null);
    try {
      const result = await generatePresentation(template.template_id, outline, referenceText);
      setPresentationId(result.presentation_id);
      setQualityReport(result.quality_report ?? null);
      setRepairedId(result.repaired_id ?? null);
      setRepairedQualityReport(result.repaired_quality_report ?? null);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate presentation");
      setStep("outline");
    }
  };

  const handleReset = () => {
    setStep("template");
    setTemplate(null);
    setOutline(null);
    setReferenceText(null);
    setPresentationId(null);
    setQualityReport(null);
    setRepairedId(null);
    setRepairedQualityReport(null);
    setError(null);
  };

  const handleNewPresentation = () => {
    setStep("topic");
    setOutline(null);
    setReferenceText(null);
    setPresentationId(null);
    setQualityReport(null);
    setRepairedId(null);
    setRepairedQualityReport(null);
    setError(null);
  };

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        {["Choose Template", "Enter Topic", "Edit Outline", "Download"].map((label, i) => {
          const steps: Step[] = ["template", "topic", "outline", "done"];
          const stepIndex = steps.indexOf(step === "generating" ? "outline" : step);
          const isActive = i <= stepIndex;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${isActive ? "bg-blue-500" : "bg-gray-300"}`} />}
              <span className={isActive ? "text-blue-600 font-medium" : "text-gray-400"}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Step: Template */}
      {step === "template" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Choose Your Template</h2>
          <TemplatePicker onTemplateReady={handleTemplateReady} />
        </div>
      )}

      {/* Step: Topic */}
      {step === "topic" && template && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">What&apos;s your presentation about?</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Template: {template.filename}</span>
              <button
                onClick={() => setStep("template")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Change
              </button>
            </div>
          </div>
          <TopicInput onSubmit={handleGenerateOutline} loading={loading} />
        </div>
      )}

      {/* Step: Outline Review */}
      {step === "outline" && outline && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Edit Outline</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setStep("topic")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
              <button
                onClick={handleGenerate}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Generate Presentation
              </button>
            </div>
          </div>
          <OutlineEditor
            outline={outline}
            onChange={setOutline}
            layouts={template?.masters.flatMap(m => m.layouts) ?? []}
            slideWidth={template?.slide_width_emu ?? 12192000}
            slideHeight={template?.slide_height_emu ?? 6858000}
          />
        </div>
      )}

      {/* Step: Generating */}
      {step === "generating" && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Generating your presentation...</p>
          <p className="text-gray-400 text-sm mt-1">This may take a minute</p>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && presentationId && (
        <div className="text-center py-12">
          <div className="text-green-500 text-4xl mb-4">&#10003;</div>
          <h2 className="text-lg font-semibold mb-2">Presentation Ready!</h2>
          <div className="flex justify-center gap-4 mt-6">
            {repairedId ? (
              <>
                <a
                  href={getDownloadUrl(repairedId)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download Repaired .pptx
                </a>
                <a
                  href={getDownloadUrl(presentationId)}
                  className="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download Original .pptx
                </a>
              </>
            ) : (
              <a
                href={getDownloadUrl(presentationId)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Download .pptx
              </a>
            )}
            <button
              onClick={handleNewPresentation}
              className="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              New Presentation
            </button>
            <button
              onClick={handleReset}
              className="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Change Template
            </button>
          </div>
          {repairedId && qualityReport && repairedQualityReport ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
              <QualityReportComponent report={qualityReport} label="Original" />
              <QualityReportComponent report={repairedQualityReport} label="Repaired" />
            </div>
          ) : (
            qualityReport && <QualityReportComponent report={qualityReport} />
          )}
        </div>
      )}
      {/* File Manager */}
      <div className="border-t border-gray-200 pt-6">
        <button
          onClick={() => setShowFiles(!showFiles)}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          {showFiles ? "Hide saved files" : "Manage saved files"}
        </button>
        {showFiles && (
          <div className="mt-3 space-y-2">
            {savedFiles.length === 0 ? (
              <p className="text-sm text-gray-400">No saved presentations on server.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{savedFiles.length} file{savedFiles.length !== 1 ? "s" : ""} on server</p>
                  <button
                    onClick={handleDeleteAll}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete all
                  </button>
                </div>
                {savedFiles.map((f) => (
                  <div key={f.presentation_id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <span className="text-sm text-gray-600 font-mono">{f.presentation_id}</span>
                    <div className="flex gap-3">
                      <a
                        href={getDownloadUrl(f.presentation_id)}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        Download
                      </a>
                      <button
                        onClick={() => handleDeleteFile(f.presentation_id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
