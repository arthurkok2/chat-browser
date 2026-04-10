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
}

export interface SearchResult {
  session: Session;
  message_id: number;
  snippet: string;
  role: string;
  rank: number;
}

export interface AnalyticsData {
  summary: {
    total_sessions: number;
    total_messages: number;
    estimated_tokens: number;
    project_count: number;
  };
  sessions_over_time: { date: string; count: number }[];
  tool_breakdown: { tool: string; count: number }[];
  project_breakdown: { project: string; count: number }[];
  tool_usage: { tool_name: string; count: number }[];
  conversation_lengths: { bucket: string; count: number }[];
  branch_breakdown: { branch: string; count: number }[];
}
