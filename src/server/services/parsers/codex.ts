import fs from "fs";
import path from "path";
import os from "os";
import type { ParsedSession, ParsedMessage, ParsedToolUse } from "../../types.js";

interface ContentBlock {
  type?: string;
  text?: string;
  // tool_call blocks
  name?: string;
  input?: Record<string, unknown>;
  call_id?: string;
  // tool_result blocks
  output?: string;
}

interface CodexPayload {
  // session_meta
  id?: string;
  cwd?: string;
  cli_version?: string;
  git?: { branch?: string };
  // response_item message
  type?: string;
  role?: string;
  content?: ContentBlock[];
  // event_msg
  message?: string;
}

interface CodexLine {
  type?: string;
  timestamp?: string;
  payload?: CodexPayload;
}

function toEpochMs(ts: string | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function estimateTokens(text: string | null): number | null {
  if (!text) return null;
  return Math.ceil(text.length / 4);
}

function extractText(content: ContentBlock[] | undefined): string | null {
  if (!content) return null;
  const parts = content
    .filter((b) => b.type === "input_text" || b.type === "output_text")
    .map((b) => b.text || "")
    .filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function extractToolUses(
  content: ContentBlock[] | undefined,
  timestamp: number | null
): ParsedToolUse[] {
  if (!content) return [];
  return content
    .filter((b) => b.type === "tool_call" || b.type === "function_call")
    .map((b) => {
      const filePath =
        typeof b.input?.file_path === "string"
          ? b.input.file_path
          : typeof b.input?.path === "string"
          ? b.input.path
          : null;
      return {
        tool_name: b.name || "unknown",
        file_path: filePath,
        timestamp,
      };
    });
}

function deriveProject(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || null;
}

export function parseCodexSession(filePath: string): ParsedSession | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    console.warn(`Failed to read Codex session file: ${filePath}`);
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  const messages: ParsedMessage[] = [];

  // Track the last user event_msg to merge with the next user response_item
  let pendingUserText: string | null = null;

  for (const line of lines) {
    let entry: CodexLine;
    try {
      entry = JSON.parse(line);
    } catch {
      console.warn(`Malformed JSONL line in ${filePath}`);
      continue;
    }

    const timestamp = toEpochMs(entry.timestamp);
    const p = entry.payload;

    if (entry.type === "session_meta" && p) {
      if (p.id) sessionId = p.id;
      if (p.cwd) cwd = p.cwd;
      if (p.git?.branch) gitBranch = p.git.branch;
      continue;
    }

    // event_msg carries the actual user-visible prompt text
    if (entry.type === "event_msg" && p?.type === "user_message" && p.message) {
      pendingUserText = p.message;
      continue;
    }

    if (entry.type === "response_item" && p?.type === "message") {
      const role = p.role;
      if (role !== "user" && role !== "assistant") continue;

      let content = extractText(p.content);
      const toolUses = extractToolUses(p.content, timestamp);

      // For user messages: prefer event_msg text (it's the raw user prompt without system context)
      if (role === "user" && pendingUserText) {
        content = pendingUserText;
        pendingUserText = null;
      } else if (role === "user") {
        // Skip system-injected context messages (no pending user text)
        if (!content || content.includes("<environment_context>")) continue;
      }

      // Skip empty messages with no tool uses
      if (!content && toolUses.length === 0) continue;

      messages.push({
        uuid: null,
        parent_uuid: null,
        role: role as "user" | "assistant",
        content,
        type: toolUses.length > 0 ? "tool_use" : "text",
        timestamp,
        tool_uses: toolUses,
      });
    }
  }

  if (messages.length === 0) return null;

  // Derive sessionId from filename if not in metadata
  if (!sessionId) {
    // filename: rollout-{timestamp}-{uuid}.jsonl
    const base = path.basename(filePath, ".jsonl");
    const parts = base.split("-");
    // last 5 parts form the UUID
    if (parts.length >= 6) {
      sessionId = parts.slice(-5).join("-");
    } else {
      sessionId = base;
    }
  }

  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is number => t !== null);
  const startedAt = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const endedAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

  return {
    id: sessionId,
    tool: "codex",
    project: deriveProject(cwd),
    cwd,
    git_branch: gitBranch,
    started_at: startedAt,
    ended_at: endedAt,
    source_file: filePath,
    messages,
  };
}
