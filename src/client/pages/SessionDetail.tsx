import { useParams, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useSession } from "../hooks/useSessions";
import ToolBadge from "../components/ToolBadge";
import MessageBubble from "../components/MessageBubble";
import { formatTimestamp, formatRelativeTime } from "../utils/time";

type MessageType = "text" | "tool_use" | "tool_result" | "thinking";

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  type: MessageType;
  content: string | null;
  timestamp: number | null;
}

type RenderItem =
  | { kind: "message"; msg: Message }
  | { kind: "group"; messages: Message[]; counts: Record<string, number> };

const TYPE_STYLES: Record<string, string> = {
  tool_use:    "bg-violet-900/50 text-violet-300 border-violet-700/50",
  tool_result: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  thinking:    "bg-amber-900/30 text-amber-300 border-amber-700/50",
};

function GroupSummary({ item, toolUsesByMessage }: {
  item: Extract<RenderItem, { kind: "group" }>;
  toolUsesByMessage: Map<number, unknown[]>;
}) {
  const [expanded, setExpanded] = useState(false);

  const parts = Object.entries(item.counts).map(([type, count]) => ({ type, count }));

  return (
    <div className="my-1">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors w-full text-left"
      >
        <svg
          className={`w-3 h-3 text-slate-500 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex items-center gap-1.5 flex-wrap">
          {parts.map(({ type, count }) => (
            <span
              key={type}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${TYPE_STYLES[type] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}
            >
              {count}× {type}
            </span>
          ))}
        </div>
      </button>

      {/* Expanded individual messages */}
      {expanded && (
        <div className="mt-1 pl-4 space-y-1 border-l-2 border-slate-700">
          {item.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              type={msg.type}
              content={msg.content}
              timestamp={msg.timestamp}
              toolUses={(toolUsesByMessage.get(msg.id) as Parameters<typeof MessageBubble>[0]["toolUses"])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, messages, tool_uses, loading } = useSession(id);

  const toolUsesByMessage = useMemo(() => {
    const map = new Map<number, typeof tool_uses>();
    tool_uses.forEach((tu) => {
      const list = map.get(tu.message_id) || [];
      list.push(tu);
      map.set(tu.message_id, list);
    });
    return map;
  }, [tool_uses]);

  // Group consecutive non-text messages between text messages
  const renderItems = useMemo((): RenderItem[] => {
    const visible = messages.filter(
      (m) => m.content !== null || (toolUsesByMessage.get(m.id)?.length ?? 0) > 0
    ) as Message[];

    const items: RenderItem[] = [];
    let groupBuf: Message[] = [];

    const flushGroup = () => {
      if (groupBuf.length === 0) return;
      const counts: Record<string, number> = {};
      for (const m of groupBuf) counts[m.type] = (counts[m.type] ?? 0) + 1;
      items.push({ kind: "group", messages: groupBuf, counts });
      groupBuf = [];
    };

    for (const msg of visible) {
      if (msg.type === "text") {
        flushGroup();
        items.push({ kind: "message", msg });
      } else {
        groupBuf.push(msg);
      }
    }
    flushGroup();

    return items;
  }, [messages, toolUsesByMessage]);

  const handleExport = (format: "md" | "json") => {
    window.open(`/api/export?session_id=${id}&format=${format}&type=sessions`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <div className="text-slate-400 mb-4">Session not found</div>
        <Link to="/" className="text-violet-400 hover:text-violet-300">
          Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      {/* Session header */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <ToolBadge tool={session.tool} size="md" />
              {session.project && (
                <span className="text-lg font-medium text-slate-100">
                  {session.project}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              {session.git_branch && (
                <span className="font-mono bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                  {session.git_branch}
                </span>
              )}
              <span>{session.message_count} messages</span>
              {session.started_at && (
                <span title={formatTimestamp(session.started_at)}>
                  Started {formatRelativeTime(session.started_at)}
                </span>
              )}
              {session.ended_at && (
                <span title={formatTimestamp(session.ended_at)}>
                  Ended {formatRelativeTime(session.ended_at)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("md")}
              className="px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Export MD
            </button>
            <button
              onClick={() => handleExport("json")}
              className="px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2">
        {renderItems.map((item, i) =>
          item.kind === "message" ? (
            <MessageBubble
              key={item.msg.id}
              role={item.msg.role}
              type={item.msg.type}
              content={item.msg.content}
              timestamp={item.msg.timestamp}
              toolUses={toolUsesByMessage.get(item.msg.id)}
            />
          ) : (
            <GroupSummary key={i} item={item} toolUsesByMessage={toolUsesByMessage} />
          )
        )}
      </div>

      {messages.length === 0 && (
        <div className="text-center py-10 text-slate-500">
          No messages in this session.
        </div>
      )}
    </div>
  );
}
