import { useState } from "react";

interface ToolCallItemProps {
  toolName: string;
  filePath: string | null;
  inputJson: string | null;
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function ToolCallItem({ toolName, inputJson }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasInput = !!inputJson;

  return (
    <span className="inline-flex flex-col">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasInput) setExpanded(!expanded);
        }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors
          bg-slate-700 border border-slate-600 text-violet-300
          ${hasInput ? "cursor-pointer hover:bg-slate-600 hover:border-violet-500/50" : "cursor-default"}`}
      >
        {hasInput && (
          <svg
            className={`w-2.5 h-2.5 text-slate-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        {toolName}
      </button>
      {expanded && hasInput && (
        <div className="mt-1 ml-1 rounded-md bg-slate-900 border border-slate-700 overflow-auto max-h-64">
          <pre className="text-xs text-slate-300 p-3 font-mono whitespace-pre-wrap break-all">
            {formatJson(inputJson!)}
          </pre>
        </div>
      )}
    </span>
  );
}
