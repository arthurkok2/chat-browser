export interface Session {
  id: string;
  tool: "claude" | "copilot" | "codex";
  project: string | null;
  cwd: string | null;
  git_branch: string | null;
  started_at: number | null;
  ended_at: number | null;
  message_count: number;
  source_file: string;
  file_mtime: number | null;
  file_size: number | null;
  is_subagent: number; // 0 or 1
}

export interface Message {
  id: number;
  session_id: string;
  uuid: string | null;
  parent_uuid: string | null;
  role: "user" | "assistant" | "system";
  content: string | null;
  type: "text" | "tool_use" | "tool_result" | "thinking";
  timestamp: number | null;
  token_estimate: number | null;
}

export interface ToolUse {
  id: number;
  message_id: number;
  session_id: string;
  tool_name: string;
  file_path: string | null;
  timestamp: number | null;
  input_json: string | null;
}

export interface ParsedSession {
  id: string;
  tool: Session["tool"];
  project: string | null;
  cwd: string | null;
  git_branch: string | null;
  started_at: number | null;
  ended_at: number | null;
  source_file: string;
  is_subagent: boolean;
  messages: ParsedMessage[];
}

export interface ParsedMessage {
  uuid: string | null;
  parent_uuid: string | null;
  role: Message["role"];
  content: string | null;
  type: Message["type"];
  timestamp: number | null;
  tool_uses: ParsedToolUse[];
}

export type MessageType = Message["type"];

export interface ParsedToolUse {
  tool_name: string;
  file_path: string | null;
  timestamp: number | null;
  input_json: string | null;
}

export interface SearchResult {
  session: Session;
  message_id: number;
  snippet: string;
  role: string;
  rank: number;
}

export interface AnalyticsData {
  pulse: {
    period_days: number;                              // 7, 30, 90, or -1 for all
    sessions_this: number;
    sessions_prev: number;
    avg_per_day_this: number;
    avg_per_day_prev: number;
    hours_this: number;
    hours_prev: number;
    most_active_dow: string;                          // e.g. "Monday"
    daily_counts: { date: string; count: number }[];  // this period
    daily_counts_prev: { date: string; count: number }[]; // previous period
  };
  breakdown: {
    projects: { project: string; decoded: string; sessions: number; hours: number }[];
    branches: { branch: string; sessions: number }[];
    tool_split: { tool: string; sessions: number }[];
  };
  behavior: {
    avg_duration_ms: number;
    avg_autonomy_pct: number;
    avg_depth: number;
    duration_hist: { bucket: string; count: number }[];
    autonomy_hist: { bucket: string; count: number }[];
    depth_hist: { bucket: string; count: number }[];
  };
  temporal: {
    by_hour: { hour: number; count: number; dominant_tool: string }[];
    by_dow: { dow: number; label: string; count: number }[];
    heatmap: { date: string; count: number }[];       // always last 52 weeks
  };
}
