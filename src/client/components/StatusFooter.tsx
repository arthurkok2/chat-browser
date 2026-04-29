import { useStatus } from "../hooks/useStatus";
import { formatRelativeTime } from "../utils/time";

const DOT: Record<string, string> = {
  active:     "bg-emerald-500",
  recovering: "bg-amber-400",
  dead:       "bg-red-500",
};

const LABEL: Record<string, string> = {
  active:     "Watcher active",
  recovering: "Watcher recovering…",
  dead:       "Watcher stopped — restart app to resume live updates",
};

export default function StatusFooter() {
  const { data } = useStatus();

  if (!data) return null;

  return (
    <footer className="border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3 text-xs text-slate-400">
        <span>Indexed {data.sessions.toLocaleString()} sessions</span>
        <span className="text-slate-600">·</span>
        <span>{data.messages.toLocaleString()} messages</span>
        {data.last_indexed_at !== null && (
          <>
            <span className="text-slate-600">·</span>
            <span>Last updated {formatRelativeTime(data.last_indexed_at)}</span>
          </>
        )}
        <span className="text-slate-600">·</span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${DOT[data.watcher] ?? DOT.active}`} />
          {LABEL[data.watcher] ?? LABEL.active}
        </span>
      </div>
    </footer>
  );
}
