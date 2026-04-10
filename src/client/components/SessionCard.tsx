import { useNavigate } from "react-router-dom";
import ToolBadge from "./ToolBadge";
import { formatRelativeTime } from "../utils/time";

interface Session {
  id: string;
  tool: "claude" | "copilot" | "codex";
  project: string | null;
  git_branch: string | null;
  started_at: number | null;
  message_count: number;
}

interface SessionCardProps {
  session: Session;
  snippet?: string;
}

export default function SessionCard({ session, snippet }: SessionCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/session/${session.id}`)}
      className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-500 hover:bg-slate-750 cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ToolBadge tool={session.tool} />
          {session.project && (
            <span className="text-sm font-medium text-slate-200">
              {session.project}
            </span>
          )}
          {session.git_branch && (
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md font-mono">
              {session.git_branch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
          <span>{session.message_count} msgs</span>
          {session.started_at && (
            <span>{formatRelativeTime(session.started_at)}</span>
          )}
        </div>
      </div>

      {snippet && (
        <div
          className="text-sm text-slate-300 line-clamp-2 mt-2"
          dangerouslySetInnerHTML={{ __html: snippet }}
        />
      )}
    </div>
  );
}
