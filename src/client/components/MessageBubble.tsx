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

export default function MessageBubble({ role, type = "text", content, timestamp, toolUses }: MessageBubbleProps) {
  const isThinking = type === "thinking";
  const typeStyle = TYPE_STYLES[type] ?? TYPE_STYLES.text;

  const bubbleClass =
    role === "user"
      ? "bubble-user"
      : role === "assistant"
        ? "bubble-assistant"
        : "bubble-system";

  const alignClass = role === "user" ? "ml-auto" : "mr-auto";

  return (
    <div className={`max-w-[85%] ${alignClass} mb-4`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-slate-400 capitalize">{role}</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${typeStyle}`}>
          {TYPE_LABELS[type]}
        </span>
        {timestamp && (
          <span className="text-xs text-slate-500">{formatTimestamp(timestamp)}</span>
        )}
      </div>
      <div className={`${bubbleClass} px-4 py-3 ${isThinking ? "opacity-60 border border-dashed border-slate-600" : ""}`}>
        {content && (
          <div className={`message-content text-sm ${isThinking ? "text-slate-400 italic" : "text-slate-200"}`}>
            {content}
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
    </div>
  );
}
