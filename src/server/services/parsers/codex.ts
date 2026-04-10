import fs from "fs";
import path from "path";
import os from "os";
import type { ParsedSession, ParsedMessage, ParsedToolUse } from "../../types.js";

// ─── Payload shapes ────────────────────────────────────────────────────────

interface ContentBlock {
  type?: string;
  text?: string;
}

interface SessionMetaPayload {
  id?: string;
  cwd?: string;
  cli_version?: string;
  git?: { branch?: string };
}

// response_item payloads
interface MessagePayload {
  type: "message";
  role?: string; // "user" | "assistant" | "developer"
  content?: ContentBlock[];
}

interface ReasoningPayload {
  type: "reasoning";
  // encrypted, nothing useful to extract
}

interface FunctionCallPayload {
  type: "function_call";
  name?: string;
  arguments?: string; // JSON string
  call_id?: string;
}

interface FunctionCallOutputPayload {
  type: "function_call_output";
  call_id?: string;
  output?: string; // JSON string — either [{type,text}] array or {output:...} object
}

interface CustomToolCallPayload {
  type: "custom_tool_call";
  name?: string;
  input?: string; // raw string input
  call_id?: string;
  status?: string;
}

interface CustomToolCallOutputPayload {
  type: "custom_tool_call_output";
  call_id?: string;
  output?: string; // JSON string: {output: "...", metadata: {...}}
}

type ResponseItemPayload =
  | MessagePayload
  | ReasoningPayload
  | FunctionCallPayload
  | FunctionCallOutputPayload
  | CustomToolCallPayload
  | CustomToolCallOutputPayload
  | { type: string };

// event_msg payloads
interface UserMessagePayload {
  type: "user_message";
  message?: string;
}

interface AgentMessagePayload {
  type: "agent_message";
  message?: string;
}

type EventMsgPayload =
  | UserMessagePayload
  | AgentMessagePayload
  | { type: string };

interface CodexLine {
  type?: string;
  timestamp?: string;
  payload?: SessionMetaPayload | ResponseItemPayload | EventMsgPayload | Record<string, unknown>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toEpochMs(ts: string | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function estimateTokens(text: string | null): number | null {
  if (!text) return null;
  return Math.ceil(text.length / 4);
}

function deriveProject(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || null;
}

/**
 * Extract text from a function_call_output or custom_tool_call_output `output` string.
 * The output field is a JSON string that may be:
 *   - An array of content blocks: [{type:"text", text:"..."}]
 *   - An object with an output field: {output: "...", metadata: {...}}
 *   - A plain string
 */
function extractOutputText(output: string | undefined): string | null {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      const parts = parsed
        .filter((b: ContentBlock) => b.type === "text" && b.text)
        .map((b: ContentBlock) => b.text!);
      return parts.length > 0 ? parts.join("\n") : null;
    }
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.output === "string") return parsed.output || null;
      if (typeof parsed.text === "string") return parsed.text || null;
    }
    return null;
  } catch {
    // Not JSON — use as-is
    return output || null;
  }
}

// ─── Parser ────────────────────────────────────────────────────────────────

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

  // The user_message event carries the clean user prompt.
  // It arrives just before the response_item message/user entry for the same turn.
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
    const p = entry.payload as Record<string, unknown> | undefined;

    // ── session_meta ──────────────────────────────────────────────────────
    if (entry.type === "session_meta" && p) {
      if (p.id) sessionId = p.id as string;
      if (p.cwd) cwd = p.cwd as string;
      const git = p.git as { branch?: string } | undefined;
      if (git?.branch) gitBranch = git.branch;
      continue;
    }

    // ── event_msg ─────────────────────────────────────────────────────────
    if (entry.type === "event_msg" && p) {
      const evType = p.type as string | undefined;
      if (evType === "user_message" && p.message) {
        pendingUserText = p.message as string;
      }
      // agent_message is a mirror of the response_item assistant message — skip to avoid duplication
      continue;
    }

    // ── response_item ─────────────────────────────────────────────────────
    if (entry.type !== "response_item" || !p) continue;

    const pType = p.type as string | undefined;

    // message: user or assistant text
    if (pType === "message") {
      const role = p.role as string | undefined;

      // Skip developer/system injected messages
      if (role !== "user" && role !== "assistant") continue;

      const contentBlocks = (p.content as ContentBlock[] | undefined) ?? [];
      const timestamp_ms = timestamp;

      if (role === "user") {
        // Use the clean user prompt from event_msg if we have one
        if (pendingUserText) {
          messages.push({
            uuid: null, parent_uuid: null,
            role: "user", content: pendingUserText,
            type: "text", timestamp: timestamp_ms, tool_uses: [],
          });
          pendingUserText = null;
        } else {
          // Fallback: extract input_text blocks, but skip system-injected context
          const textParts = contentBlocks
            .filter((b) => b.type === "input_text" && b.text)
            .map((b) => b.text!);
          const content = textParts.join("\n") || null;
          if (!content || content.includes("<environment_context>")) continue;
          messages.push({
            uuid: null, parent_uuid: null,
            role: "user", content,
            type: "text", timestamp: timestamp_ms, tool_uses: [],
          });
        }
        continue;
      }

      if (role === "assistant") {
        const textParts = contentBlocks
          .filter((b) => b.type === "output_text" && b.text)
          .map((b) => b.text!);
        const content = textParts.join("\n") || null;
        if (!content) continue; // blank assistant messages add no value
        messages.push({
          uuid: null, parent_uuid: null,
          role: "assistant", content,
          type: "text", timestamp: timestamp_ms, tool_uses: [],
        });
        continue;
      }
    }

    // reasoning: encrypted internal reasoning — skip
    if (pType === "reasoning") continue;

    // function_call: MCP / external tool invocation
    if (pType === "function_call") {
      const name = (p.name as string | undefined) || "unknown";
      let args: Record<string, unknown> | null = null;
      try { args = JSON.parse(p.arguments as string); } catch { /* leave null */ }
      const filePath_ =
        (args?.file_path as string | undefined) ||
        (args?.path as string | undefined) ||
        null;
      const toolUse: ParsedToolUse = {
        tool_name: name,
        file_path: filePath_,
        timestamp,
        input_json: p.arguments as string | null ?? null,
      };
      messages.push({
        uuid: null, parent_uuid: null,
        role: "assistant", content: null,
        type: "tool_use", timestamp, tool_uses: [toolUse],
      });
      continue;
    }

    // function_call_output: result of an MCP / external tool call
    if (pType === "function_call_output") {
      const content = extractOutputText(p.output as string | undefined);
      if (!content) continue;
      messages.push({
        uuid: null, parent_uuid: null,
        role: "user", content,
        type: "tool_result", timestamp, tool_uses: [],
      });
      continue;
    }

    // custom_tool_call: built-in Codex tools (shell, apply_patch, etc.)
    if (pType === "custom_tool_call") {
      const name = (p.name as string | undefined) || "unknown";
      const input = p.input as string | undefined;
      const toolUse: ParsedToolUse = {
        tool_name: name,
        file_path: null,
        timestamp,
        input_json: input ? JSON.stringify({ input }) : null,
      };
      messages.push({
        uuid: null, parent_uuid: null,
        role: "assistant", content: null,
        type: "tool_use", timestamp, tool_uses: [toolUse],
      });
      continue;
    }

    // custom_tool_call_output: result of a built-in Codex tool
    if (pType === "custom_tool_call_output") {
      const content = extractOutputText(p.output as string | undefined);
      if (!content) continue;
      messages.push({
        uuid: null, parent_uuid: null,
        role: "user", content,
        type: "tool_result", timestamp, tool_uses: [],
      });
      continue;
    }
  }

  if (messages.length === 0) return null;

  // Derive sessionId from filename if not in metadata
  if (!sessionId) {
    const base = path.basename(filePath, ".jsonl");
    const parts = base.split("-");
    sessionId = parts.length >= 6 ? parts.slice(-5).join("-") : base;
  }

  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is number => t !== null);
  const startedAt = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const endedAt   = timestamps.length > 0 ? Math.max(...timestamps) : null;

  for (const m of messages) {
    (m as ParsedMessage & { token_estimate?: number | null }).token_estimate =
      estimateTokens(m.content);
  }

  return {
    id: sessionId,
    tool: "codex",
    project: deriveProject(cwd),
    cwd,
    git_branch: gitBranch,
    started_at: startedAt,
    ended_at: endedAt,
    source_file: filePath,
    is_subagent: false,
    messages,
  };
}
