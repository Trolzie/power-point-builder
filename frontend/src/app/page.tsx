"use client";
import { useState } from "react";
import TemplateUploader from "@/components/TemplateUploader";
import TopicInput from "@/components/TopicInput";
import OutlineEditor from "@/components/OutlineEditor";
import { TemplateManifest, PresentationContent } from "@/types";
import { generateOutline, generatePresentation, getDownloadUrl } from "@/lib/api";

type Step = "upload" | "topic" | "outline" | "generating" | "done";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [template, setTemplate] = useState<TemplateManifest | null>(null);
  const [outline, setOutline] = useState<PresentationContent | null>(null);
  const [presentationId, setPresentationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTemplateUploaded = (manifest: TemplateManifest) => {
    setTemplate(manifest);
    setStep("topic");
  };

  const handleGenerateOutline = async (topic: string, numSlides: number) => {
    if (!template) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateOutline(template.template_id, topic, numSlides);
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
      const result = await generatePresentation(template.template_id, outline);
      setPresentationId(result.presentation_id);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate presentation");
      setStep("outline");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setTemplate(null);
    setOutline(null);
    setPresentationId(null);
    setError(null);
  };

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        {["Upload Template", "Enter Topic", "Edit Outline", "Download"].map((label, i) => {
          const steps: Step[] = ["upload", "topic", "outline", "done"];
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

      {/* Step: Upload */}
      {step === "upload" && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Upload Your Template</h2>
          <TemplateUploader onUploaded={handleTemplateUploaded} />
        </div>
      )}

      {/* Step: Topic */}
      {step === "topic" && template && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">What&apos;s your presentation about?</h2>
            <span className="text-sm text-gray-500">Template: {template.filename}</span>
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
            <a
              href={getDownloadUrl(presentationId)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Download .pptx
            </a>
            <button
              onClick={handleReset}
              className="border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
