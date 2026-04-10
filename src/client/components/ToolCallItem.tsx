import { useState } from "react";

interface ToolCallItemProps {
  toolName: string;
  filePath: string | null;
}

export default function ToolCallItem({ toolName, filePath }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border border-slate-600/50 rounded-lg bg-slate-700/30 text-xs cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setExpanded(!expanded);
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <svg
          className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-violet-300">{toolName}</span>
        {filePath && (
          <span className="text-slate-400 truncate">{filePath}</span>
        )}
      </div>
      {expanded && filePath && (
        <div className="px-3 pb-2 pt-0">
          <span className="font-mono text-slate-300 break-all">{filePath}</span>
        </div>
      )}
    </div>
  );
}
