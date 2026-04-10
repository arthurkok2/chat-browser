import { useState, useMemo } from "react";
import SearchBar from "../components/SearchBar";
import FilterBar from "../components/FilterBar";
import SessionCard from "../components/SessionCard";
import { useSearch } from "../hooks/useSearch";
import { useSessions } from "../hooks/useSessions";

export default function Search() {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [project, setProject] = useState("");
  const [branch, setBranch] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [role, setRole] = useState("");
  const [includeSubagents, setIncludeSubagents] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const isSearching = !!query.trim();

  const searchParams = useMemo(
    () => ({
      q: query,
      tool,
      project,
      branch,
      after,
      before,
      role,
      limit,
      offset,
    }),
    [query, tool, project, branch, after, before, role, offset]
  );

  const sessionsParams = useMemo(
    () => ({
      tool,
      project,
      branch,
      after,
      before,
      sort: "started_at",
      order: "desc" as const,
      limit,
      offset,
      include_subagents: includeSubagents,
    }),
    [tool, project, branch, after, before, offset, includeSubagents]
  );

  const search = useSearch(searchParams);
  const sessions = useSessions(sessionsParams);

  const loading = isSearching ? search.loading : sessions.loading;
  const total = isSearching ? search.total : sessions.total;

  // Extract unique projects and branches from sessions for filter dropdowns
  const projectList = useMemo(() => {
    const set = new Set<string>();
    sessions.sessions.forEach((s) => {
      if (s.project) set.add(s.project);
    });
    return Array.from(set).sort();
  }, [sessions.sessions]);

  const branchList = useMemo(() => {
    const set = new Set<string>();
    sessions.sessions.forEach((s) => {
      if (s.git_branch) set.add(s.git_branch);
    });
    return Array.from(set).sort();
  }, [sessions.sessions]);

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <SearchBar value={query} onChange={(v) => { setQuery(v); setOffset(0); }} />

      <FilterBar
        tool={tool}
        onToolChange={(v) => { setTool(v); setOffset(0); }}
        project={project}
        onProjectChange={(v) => { setProject(v); setOffset(0); }}
        branch={branch}
        onBranchChange={(v) => { setBranch(v); setOffset(0); }}
        after={after}
        onAfterChange={(v) => { setAfter(v); setOffset(0); }}
        before={before}
        onBeforeChange={(v) => { setBefore(v); setOffset(0); }}
        role={role}
        onRoleChange={(v) => { setRole(v); setOffset(0); }}
        includeSubagents={includeSubagents}
        onIncludeSubagentsChange={(v) => { setIncludeSubagents(v); setOffset(0); }}
        projects={projectList}
        branches={branchList}
      />

      {/* Result info */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {loading ? (
            "Loading..."
          ) : (
            <>
              {total} {isSearching ? "results" : "sessions"}
              {isSearching && search.duration_ms > 0 && (
                <span className="ml-1">in {search.duration_ms}ms</span>
              )}
            </>
          )}
        </span>
        {!isSearching && (
          <span className="text-xs">Showing recent sessions</span>
        )}
      </div>

      {/* Results */}
      <div className="space-y-2">
        {isSearching
          ? search.results.map((r) => (
              <SessionCard
                key={`${r.session.id}-${r.message_id}`}
                session={r.session}
                snippet={r.snippet}
              />
            ))
          : sessions.sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
      </div>

      {/* Empty state */}
      {!loading && total === 0 && (
        <div className="text-center py-16 text-slate-500">
          {isSearching
            ? "No results found. Try a different search query."
            : "No sessions found."}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(offset - limit)}
            disabled={offset === 0}
            className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">
            Page {currentPage} of {totalPages}
          </span>
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
