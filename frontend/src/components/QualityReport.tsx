"use client";
import { useState } from "react";
import { QualityReport as QualityReportType, QualityIssue, SlideQuality } from "@/types";

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-800 border-green-300"
      : score >= 50
        ? "bg-yellow-100 text-yellow-800 border-yellow-300"
        : "bg-red-100 text-red-800 border-red-300";

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${color}`}>
      {Math.round(score)}/100
    </span>
  );
}

function IssueBadge({ severity }: { severity: QualityIssue["severity"] }) {
  const styles = {
    error: "bg-red-100 text-red-700",
    warning: "bg-yellow-100 text-yellow-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[severity]}`}>
      {severity}
    </span>
  );
}

function UtilizationBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500">{Math.round(pct)}%</span>
    </div>
  );
}

function SlideSection({ slide }: { slide: SlideQuality }) {
  const [open, setOpen] = useState(false);
  const hasIssues = slide.issues.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            Slide {slide.slide_index + 1}
          </span>
          <span className="text-xs text-gray-500">{slide.layout_name}</span>
          {hasIssues && (
            <span className="text-xs text-gray-400">
              {slide.issues.length} issue{slide.issues.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <UtilizationBar pct={slide.utilization_pct} />
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && hasIssues && (
        <div className="border-t border-gray-200 px-4 py-3 space-y-2">
          {slide.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2">
              <IssueBadge severity={issue.severity} />
              <div className="text-sm">
                <span className="text-gray-700">{issue.message}</span>
                {issue.suggestion && (
                  <span className="text-gray-400 ml-1">— {issue.suggestion}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && !hasIssues && (
        <div className="border-t border-gray-200 px-4 py-3 text-sm text-gray-500">
          No issues found
        </div>
      )}
    </div>
  );
}

export default function QualityReport({ report, label }: { report: QualityReportType; label?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{label || "Quality Analysis"}</h3>
            <p className="text-sm text-gray-500 mt-1">{report.summary}</p>
          </div>
          <ScoreBadge score={report.overall_score} />
        </div>

        {report.total_issues > 0 && (
          <div className="flex gap-4 text-xs text-gray-500">
            {report.issues_by_severity.error > 0 && (
              <span className="text-red-600">{report.issues_by_severity.error} errors</span>
            )}
            {report.issues_by_severity.warning > 0 && (
              <span className="text-yellow-600">{report.issues_by_severity.warning} warnings</span>
            )}
            {report.issues_by_severity.info > 0 && (
              <span className="text-blue-600">{report.issues_by_severity.info} info</span>
            )}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {expanded ? "Hide details" : "Show slide details"}
        </button>

        {expanded && (
          <div className="space-y-2">
            {report.slides.map((slide) => (
              <SlideSection key={slide.slide_index} slide={slide} />
            ))}
          </div>
        )}

        {report.llm_analysis && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">AI Analysis</h4>
            <p className="text-sm text-gray-700 whitespace-pre-line">{report.llm_analysis}</p>
          </div>
        )}
      </div>
    </div>
  );
}
