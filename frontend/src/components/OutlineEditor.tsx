"use client";
import { PresentationContent } from "@/types";

interface Props {
  outline: PresentationContent;
}

export default function OutlineEditor({ outline }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-lg">{outline.title}</h3>
      {outline.slides.map((slide, i) => (
        <div key={i} className="border rounded-lg p-3 bg-gray-50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              {slide.layout_name}
            </span>
            <span className="text-xs text-gray-400">Slide {i + 1}</span>
          </div>
          {Object.entries(slide.placeholders).map(([idx, ph]) => (
            <div key={idx} className="ml-2">
              {ph.paragraphs?.map((p, j) => (
                <p key={j} className={`text-sm ${p.level && p.level > 0 ? "ml-4 text-gray-500" : "text-gray-700"} ${p.bold ? "font-semibold" : ""}`}>
                  {p.level && p.level > 0 ? "- " : ""}{p.text}
                </p>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
