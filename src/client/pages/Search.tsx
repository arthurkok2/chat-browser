import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import FilterBar from "../components/FilterBar";
import SessionCard from "../components/SessionCard";
import { useSearch } from "../hooks/useSearch";
import { useSessions } from "../hooks/useSessions";

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query           = searchParams.get("q") ?? "";
  const tool            = searchParams.get("tool") ?? "";
  const project         = searchParams.get("project") ?? "";
  const branch          = searchParams.get("branch") ?? "";
  const after           = searchParams.get("after") ?? "";
  const before          = searchParams.get("before") ?? "";
  const role            = searchParams.get("role") ?? "";
  const includeSubagents = searchParams.get("subagents") === "1";
  const offset          = Number(searchParams.get("offset") ?? "0");
  const limit           = 20;

  function set(updates: Record<string, string | null>, resetOffset = true) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "" || v === "0" || (k === "subagents" && v === "0")) {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      }
      if (resetOffset) next.delete("offset");
      return next;
    }, { replace: true });
  }

  const isSearching = !!query.trim();

  const searchApiParams = useMemo(
    () => ({ q: query, tool, project, branch, after, before, role, limit, offset }),
    [query, tool, project, branch, after, before, role, offset]
  );

  const sessionsParams = useMemo(
    () => ({
      tool, project, branch, after, before,
      sort: "ended_at", order: "desc" as const,
      limit, offset,
      include_subagents: includeSubagents,
    }),
    [tool, project, branch, after, before, offset, includeSubagents]
  );

  const search   = useSearch(searchApiParams);
  const sessions = useSessions(sessionsParams);

  const loading = isSearching ? search.loading : sessions.loading;
  const total   = isSearching ? search.total   : sessions.total;

  const projectList = useMemo(() => {
    const s = new Set<string>();
    sessions.sessions.forEach((sess) => { if (sess.project) s.add(sess.project); });
    return Array.from(s).sort();
  }, [sessions.sessions]);

  const branchList = useMemo(() => {
    const s = new Set<string>();
    sessions.sessions.forEach((sess) => { if (sess.git_branch) s.add(sess.git_branch); });
    return Array.from(s).sort();
  }, [sessions.sessions]);

  const handlePageChange = (newOffset: number) => {
    set({ offset: newOffset === 0 ? null : String(newOffset) }, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalPages   = Math.ceil(total / limit);
  const currentPage  = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <SearchBar value={query} onChange={(v) => set({ q: v })} />

      <FilterBar
        tool={tool}
        onToolChange={(v) => set({ tool: v })}
        project={project}
        onProjectChange={(v) => set({ project: v })}
        branch={branch}
        onBranchChange={(v) => set({ branch: v })}
        after={after}
        onAfterChange={(v) => set({ after: v })}
        before={before}
        onBeforeChange={(v) => set({ before: v })}
        role={role}
        onRoleChange={(v) => set({ role: v })}
        includeSubagents={includeSubagents}
        onIncludeSubagentsChange={(v) => set({ subagents: v ? "1" : null })}
        projects={projectList}
        branches={branchList}
      />

      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {loading ? "Loading..." : (
            <>
              {total} {isSearching ? "results" : "sessions"}
              {isSearching && search.duration_ms > 0 && (
                <span className="ml-1">in {search.duration_ms}ms</span>
              )}
            </>
          )}
        </span>
        {!isSearching && <span className="text-xs">Showing recent sessions</span>}
      </div>

      <div className="space-y-2">
        {isSearching
          ? search.results.map((r) => (
              <SessionCard key={`${r.session.id}-${r.message_id}`} session={r.session} snippet={r.snippet} />
            ))
          : sessions.sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
      </div>

      {!loading && total === 0 && (
        <div className="text-center py-16 text-slate-500">
          {isSearching ? "No results found. Try a different search query." : "No sessions found."}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(offset - limit)}
            disabled={offset === 0}
            className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => handlePageChange(offset + limit)}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
