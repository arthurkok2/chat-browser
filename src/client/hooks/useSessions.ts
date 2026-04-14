import { useState, useEffect, useRef } from "react";

interface Session {
  id: string;
  tool: "claude" | "copilot" | "codex";
  project: string | null;
  cwd: string | null;
  git_branch: string | null;
  started_at: number | null;
  ended_at: number | null;
  message_count: number;
  source_file: string;
  is_subagent: number;
}

interface Message {
  id: number;
  session_id: string;
  uuid: string | null;
  parent_uuid: string | null;
  role: "user" | "assistant" | "system";
  content: string | null;
  type: "text" | "tool_use" | "tool_result";
  timestamp: number | null;
  token_estimate: number | null;
}

interface ToolUse {
  id: number;
  message_id: number;
  session_id: string;
  tool_name: string;
  file_path: string | null;
  timestamp: number | null;
  input_json: string | null;
}

interface SessionsParams {
  tool?: string;
  project?: string;
  branch?: string;
  after?: string;
  before?: string;
  sort?: string;
  order?: string;
  limit?: number;
  offset?: number;
  include_subagents?: boolean;
}

interface SessionsState {
  sessions: Session[];
  total: number;
  loading: boolean;
}

export function useSessions(params: SessionsParams): SessionsState {
  const [state, setState] = useState<SessionsState>({
    sessions: [],
    total: 0,
    loading: true,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true }));

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "" && value !== null) {
        searchParams.set(key, String(value));
      }
    }

    fetch(`/api/sessions?${searchParams}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch sessions");
        return res.json();
      })
      .then((data) => {
        setState({ sessions: data.sessions, total: data.total, loading: false });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((prev) => ({ ...prev, loading: false }));
      });

    return () => controller.abort();
  }, [params.tool, params.project, params.branch, params.after, params.before, params.sort, params.order, params.limit, params.offset, params.include_subagents]);


  return state;
}

interface SessionDetailState {
  session: Session | null;
  messages: Message[];
  tool_uses: ToolUse[];
  loading: boolean;
}

export function useSession(id: string | undefined): SessionDetailState {
  const [state, setState] = useState<SessionDetailState>({
    session: null,
    messages: [],
    tool_uses: [],
    loading: true,
  });

  useEffect(() => {
    if (!id) return;

    setState((prev) => ({ ...prev, loading: true }));

    fetch(`/api/sessions/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch session");
        return res.json();
      })
      .then((data) => {
        setState({
          session: data.session,
          messages: data.messages,
          tool_uses: data.tool_uses,
          loading: false,
        });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });
  }, [id]);

  return state;
}
