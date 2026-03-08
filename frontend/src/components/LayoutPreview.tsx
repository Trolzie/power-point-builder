import { PlaceholderInfo } from "@/types";

const FILTERED_TYPES = ["DATE", "FOOTER", "SLIDE_NUMBER", "HEADER", "CHART", "TABLE", "VERTICAL_OBJECT", "VERTICAL_BODY"];

function phColor(type: string) {
  if (["TITLE", "CENTER_TITLE", "SUBTITLE"].includes(type)) return "bg-blue-300/70";
  if (type === "PICTURE") return "bg-green-300/70";
  return "bg-gray-300/70";
}

export default function LayoutPreview({
  placeholders,
  slideWidth,
  slideHeight,
  width = 120,
}: {
  placeholders: PlaceholderInfo[];
  slideWidth: number;
  slideHeight: number;
  width?: number;
}) {
  const contentPhs = placeholders.filter((p) => !FILTERED_TYPES.includes(p.type));

  return (
    <div
      className="relative bg-white border border-gray-200 rounded overflow-hidden flex-shrink-0"
      style={{ width, height: width * (slideHeight / slideWidth) }}
    >
      {contentPhs.map((ph, i) => {
        if (ph.left == null || ph.top == null || ph.width == null || ph.height == null) return null;
        return (
          <div
            key={i}
            className={`absolute rounded-sm ${phColor(ph.type)}`}
            style={{
              left: `${(ph.left / slideWidth) * 100}%`,
              top: `${(ph.top / slideHeight) * 100}%`,
              width: `${(ph.width / slideWidth) * 100}%`,
              height: `${(ph.height / slideHeight) * 100}%`,
            }}
          />
        );
      })}
      {contentPhs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
          Empty
        </div>
      )}
    </div>
  );
}
