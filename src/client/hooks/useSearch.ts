import { useState, useEffect, useRef } from "react";

interface SearchParams {
  q?: string;
  tool?: string;
  project?: string;
  branch?: string;
  after?: string;
  before?: string;
  role?: string;
  limit?: number;
  offset?: number;
}

interface SearchResult {
  session: {
    id: string;
    tool: "claude" | "copilot" | "codex";
    project: string | null;
    cwd: string | null;
    git_branch: string | null;
    started_at: number | null;
    ended_at: number | null;
    message_count: number;
    source_file: string;
  };
  message_id: number;
  snippet: string;
  role: string;
  rank: number;
}

interface SearchState {
  results: SearchResult[];
  total: number;
  duration_ms: number;
  loading: boolean;
}

export function useSearch(params: SearchParams): SearchState {
  const [state, setState] = useState<SearchState>({
    results: [],
    total: 0,
    duration_ms: 0,
    loading: false,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!params.q?.trim()) {
      setState({ results: [], total: 0, duration_ms: 0, loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "" && value !== null) {
          searchParams.set(key, String(value));
        }
      }

      try {
        const res = await fetch(`/api/search?${searchParams}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setState({
          results: data.results,
          total: data.total,
          duration_ms: data.duration_ms,
          loading: false,
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [params.q, params.tool, params.project, params.branch, params.after, params.before, params.role, params.limit, params.offset]);

  return state;
}
