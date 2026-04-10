import { useParams, Link } from "react-router-dom";
import { useMemo } from "react";
import { useSession } from "../hooks/useSessions";
import ToolBadge from "../components/ToolBadge";
import MessageBubble from "../components/MessageBubble";
import { formatTimestamp, formatRelativeTime } from "../utils/time";

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, messages, tool_uses, loading } = useSession(id);

  // Group tool_uses by message_id
  const toolUsesByMessage = useMemo(() => {
    const map = new Map<number, typeof tool_uses>();
    tool_uses.forEach((tu) => {
      const list = map.get(tu.message_id) || [];
      list.push(tu);
      map.set(tu.message_id, list);
    });
    return map;
  }, [tool_uses]);

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
        {messages
          .filter((m) => m.type === "text")
          .map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              toolUses={toolUsesByMessage.get(msg.id)}
            />
          ))}
      </div>

      {messages.length === 0 && (
        <div className="text-center py-10 text-slate-500">
          No messages in this session.
        </div>
      )}
    </div>
  );
}
