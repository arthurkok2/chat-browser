import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatTimestamp } from "../utils/time";
import ToolCallItem from "./ToolCallItem";

interface ToolUse {
  id: number;
  message_id: number;
  tool_name: string;
  file_path: string | null;
  input_json: string | null;
}

interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  type?: "text" | "tool_use" | "tool_result" | "thinking";
  content: string | null;
  timestamp: number | null;
  toolUses?: ToolUse[];
  globalExpanded?: boolean | null;
}

const TYPE_STYLES: Record<string, string> = {
  text:        "bg-slate-700 text-slate-300 border-slate-600",
  tool_use:    "bg-violet-900/50 text-violet-300 border-violet-700/50",
  tool_result: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  thinking:    "bg-amber-900/30 text-amber-300 border-amber-700/50",
};

const TYPE_LABELS: Record<string, string> = {
  text:        "text",
  tool_use:    "tool_use",
  tool_result: "tool_result",
  thinking:    "thinking",
};

/** Heuristic: does this string look like it contains markdown? */
function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6} /m.test(text)           // headings
    || /\*\*.+?\*\*/.test(text)            // bold
    || /\*.+?\*/.test(text)               // italic
    || /`[^`]+`/.test(text)               // inline code
    || /^```/m.test(text)                 // fenced code block
    || /^\s*[-*+] /m.test(text)           // unordered list
    || /^\s*\d+\. /m.test(text)           // ordered list
    || /\[.+?\]\(.+?\)/.test(text)        // link
    || /^\|.+\|/m.test(text)              // table
    || /^> /m.test(text);                 // blockquote
}

function MarkdownContent({ text, muted }: { text: string; muted?: boolean }) {
  const baseText = muted ? "text-slate-400" : "text-slate-200";
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:          ({ children }) => <p className={`mb-2 last:mb-0 ${baseText}`}>{children}</p>,
        h1:         ({ children }) => <h1 className="text-lg font-bold text-slate-100 mb-2 mt-3 first:mt-0">{children}</h1>,
        h2:         ({ children }) => <h2 className="text-base font-bold text-slate-100 mb-2 mt-3 first:mt-0">{children}</h2>,
        h3:         ({ children }) => <h3 className="text-sm font-bold text-slate-200 mb-1 mt-2 first:mt-0">{children}</h3>,
        h4:         ({ children }) => <h4 className="text-sm font-semibold text-slate-200 mb-1 mt-2 first:mt-0">{children}</h4>,
        ul:         ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 pl-2">{children}</ul>,
        ol:         ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 pl-2">{children}</ol>,
        li:         ({ children }) => <li className={`${baseText}`}>{children}</li>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-500 pl-3 my-2 text-slate-400 italic">{children}</blockquote>,
        code:       ({ className, children, ...props }) => {
          const isBlock = !!className;
          return isBlock
            ? <code className="block bg-slate-900 rounded px-3 py-2 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre">{children}</code>
            : <code className="bg-slate-900 rounded px-1 py-0.5 text-xs font-mono text-violet-300" {...props}>{children}</code>;
        },
        pre:        ({ children }) => <pre className="mb-2 overflow-x-auto">{children}</pre>,
        a:          ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">{children}</a>,
        strong:     ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
        em:         ({ children }) => <em className="italic text-slate-300">{children}</em>,
        hr:         () => <hr className="border-slate-600 my-3" />,
        table:      ({ children }) => <div className="overflow-x-auto mb-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
        th:         ({ children }) => <th className="border border-slate-600 px-2 py-1 bg-slate-700 text-slate-200 font-medium text-left">{children}</th>,
        td:         ({ children }) => <td className="border border-slate-600 px-2 py-1 text-slate-300">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default function MessageBubble({ role, type = "text", content, timestamp, toolUses, globalExpanded = null }: MessageBubbleProps) {
  const collapsible = type !== "text";
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (collapsible && globalExpanded !== null) setExpanded(globalExpanded);
  }, [globalExpanded, collapsible]);

  const isThinking = type === "thinking";
  const typeStyle = TYPE_STYLES[type] ?? TYPE_STYLES.text;
  const renderAsMarkdown = !!content && looksLikeMarkdown(content);

  const bubbleClass =
    role === "user"
      ? "bubble-user"
      : role === "assistant"
        ? "bubble-assistant"
        : "bubble-system";

  const alignClass = role === "user" ? "ml-auto" : "mr-auto";

  return (
    <div className={`max-w-[85%] ${alignClass} mb-4`}>
      {/* Header row */}
      <div
        className={`flex items-center gap-2 mb-1 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setExpanded((v) => !v) : undefined}
      >
        <span className="text-xs font-medium text-slate-400 capitalize">{role}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${typeStyle}`}>
          {collapsible && (
            <svg
              className={`w-2.5 h-2.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {TYPE_LABELS[type]}
        </span>
        {timestamp && (
          <span className="text-xs text-slate-500">{formatTimestamp(timestamp)}</span>
        )}
      </div>

      {/* Body */}
      {(!collapsible || expanded) && (
        <div className={`${bubbleClass} px-4 py-3 ${isThinking ? "opacity-60 border border-dashed border-slate-600" : ""}`}>
          {content && (
            <div className={`message-content text-sm ${isThinking ? "italic" : ""}`}>
              {renderAsMarkdown
                ? <MarkdownContent text={content} muted={isThinking} />
                : <span className={isThinking ? "text-slate-400" : "text-slate-200"}>{content}</span>
              }
            </div>
          )}
          {toolUses && toolUses.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {toolUses.map((tu) => (
                <ToolCallItem
                  key={tu.id}
                  toolName={tu.tool_name}
                  filePath={tu.file_path}
                  inputJson={tu.input_json}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
