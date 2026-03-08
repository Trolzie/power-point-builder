"use client";
import { useState } from "react";
import { PresentationContent, LayoutInfo, SlideContent } from "@/types";
import LayoutPreview from "@/components/LayoutPreview";

const FILTERED_TYPES = ["DATE", "FOOTER", "SLIDE_NUMBER", "HEADER", "CHART", "TABLE", "VERTICAL_OBJECT", "VERTICAL_BODY"];

interface Props {
  outline: PresentationContent;
  onChange: (updated: PresentationContent) => void;
  layouts: LayoutInfo[];
  slideWidth: number;
  slideHeight: number;
}

function moveSlide(outline: PresentationContent, from: number, to: number): PresentationContent {
  const slides = [...outline.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  return { ...outline, slides };
}

function deleteSlide(outline: PresentationContent, index: number): PresentationContent {
  return { ...outline, slides: outline.slides.filter((_, i) => i !== index) };
}

function addSlide(outline: PresentationContent, layout: LayoutInfo): PresentationContent {
  const placeholders: Record<string, import("@/types").PlaceholderContent> = {};
  for (const ph of layout.placeholders) {
    if (FILTERED_TYPES.includes(ph.type)) continue;
    if (ph.type === "PICTURE") {
      placeholders[String(ph.idx)] = {
        type: "image",
        image_prompt: "",
      };
    } else {
      placeholders[String(ph.idx)] = {
        type: "text",
        paragraphs: [{ text: "" }],
      };
    }
  }
  const newSlide: SlideContent = {
    layout_index: layout.index,
    layout_name: layout.name,
    placeholders,
  };
  return { ...outline, slides: [...outline.slides, newSlide] };
}

export default function OutlineEditor({ outline, onChange, layouts, slideWidth, slideHeight }: Props) {
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);

  const updateParagraphText = (slideIndex: number, phIdx: string, paraIndex: number, text: string) => {
    const updated = structuredClone(outline);
    updated.slides[slideIndex].placeholders[phIdx].paragraphs![paraIndex].text = text;
    onChange(updated);
  };

  const updateImagePrompt = (slideIndex: number, phIdx: string, prompt: string) => {
    const updated = structuredClone(outline);
    updated.slides[slideIndex].placeholders[phIdx].image_prompt = prompt;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={outline.title}
        onChange={(e) => onChange({ ...outline, title: e.target.value })}
        className="font-semibold text-lg w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none rounded px-2 py-1 -ml-2 transition-colors"
      />
      {outline.slides.map((slide, i) => {
        const layout = layouts.find((l) => l.index === slide.layout_index);
        return (
        <div key={i} className="border rounded-lg p-3 bg-gray-50">
          <div className="flex items-start gap-3 mb-1">
            {layout && (
              <LayoutPreview
                placeholders={layout.placeholders}
                slideWidth={slideWidth}
                slideHeight={slideHeight}
                width={80}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {slide.layout_name}
                </span>
                <span className="text-xs text-gray-400">Slide {i + 1}</span>
                <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onChange(moveSlide(outline, i, i - 1))}
                disabled={i === 0}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => onChange(moveSlide(outline, i, i + 1))}
                disabled={i === outline.slides.length - 1}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move down"
              >
                ▼
              </button>
              <button
                onClick={() => onChange(deleteSlide(outline, i))}
                disabled={outline.slides.length <= 1}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-red-100 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Delete slide"
              >
                ✕
              </button>
            </div>
          </div>
          {Object.entries(slide.placeholders).map(([idx, ph]) => (
            <div key={idx} className="ml-2">
              {ph.type === "image" ? (
                <div className="flex items-start gap-2">
                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mt-1 shrink-0">
                    Image
                  </span>
                  <textarea
                    value={ph.image_prompt ?? ""}
                    onChange={(e) => updateImagePrompt(i, idx, e.target.value)}
                    rows={2}
                    className="text-sm w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none rounded px-1 py-0.5 transition-colors text-gray-700 resize-none"
                    placeholder="Describe the image..."
                  />
                </div>
              ) : (
                ph.paragraphs?.map((p, j) => (
                  <input
                    key={j}
                    type="text"
                    value={p.text}
                    onChange={(e) => updateParagraphText(i, idx, j, e.target.value)}
                    className={`text-sm w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none rounded px-1 py-0.5 transition-colors ${p.level && p.level > 0 ? "ml-4 text-gray-500" : "text-gray-700"} ${p.bold ? "font-semibold" : ""}`}
                    placeholder="Enter text..."
                  />
                ))
              )}
            </div>
          ))}
            </div>
          </div>
        </div>
      );
      })}

      {/* Add Slide */}
      <div className="relative">
        <button
          onClick={() => setShowLayoutPicker(!showLayoutPicker)}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Slide
        </button>
        {showLayoutPicker && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {layouts.map((layout) => (
              <button
                key={`${layout.index}-${layout.name}`}
                onClick={() => {
                  onChange(addSlide(outline, layout));
                  setShowLayoutPicker(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
              >
                <span>{layout.name}</span>
                <span className="text-xs text-gray-400">
                  {layout.placeholders.filter((p) => !FILTERED_TYPES.includes(p.type)).length} placeholders
                </span>
              </button>
            ))}
            {layouts.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">No layouts available</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
