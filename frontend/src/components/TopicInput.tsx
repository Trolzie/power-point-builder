"use client";
import { useState } from "react";

interface Props {
  onSubmit: (topic: string, numSlides: number) => void;
  loading: boolean;
}

export default function TopicInput({ onSubmit, loading }: Props) {
  const [topic, setTopic] = useState("");
  const [numSlides, setNumSlides] = useState(8);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Presentation Topic
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., AI in Healthcare: Current Trends and Future Opportunities"
          className="w-full border rounded-lg p-3 h-24 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
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
          onClick={() => onSubmit(topic, numSlides)}
          disabled={!topic.trim() || loading}
          className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Generating..." : "Generate Presentation"}
        </button>
      </div>
    </div>
  );
}
