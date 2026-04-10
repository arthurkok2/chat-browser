import fs from "fs";
import path from "path";
import type { ParsedSession, ParsedMessage, ParsedToolUse } from "../../types.js";

interface ToolRequest {
  toolCallId?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  intentionSummary?: string;
}

interface CopilotEvent {
  type?: string;
  id?: string;
  timestamp?: string;
  data?: {
    // session.start
    sessionId?: string;
    context?: {
      cwd?: string;
      branch?: string;
    };
    // user.message
    content?: string;
    // assistant.message
    messageId?: string;
    toolRequests?: ToolRequest[];
    // tool.execution_start / complete
    toolCallId?: string;
    toolName?: string;
    // legacy (older format fallback)
    workspace?: string;
    branch?: string;
  };
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

function deriveProject(workspace: string | null): string | null {
  if (!workspace) return null;
  const normalized = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/");
  if (segments.length >= 2) {
    return segments.slice(-2).join("/");
  }
  return segments[segments.length - 1] || null;
}

export function parseCopilotSession(dirPath: string): ParsedSession | null {
  const eventsFile = path.join(dirPath, "events.jsonl");
  let raw: string;
  try {
    raw = fs.readFileSync(eventsFile, "utf-8");
  } catch {
    console.warn(`Failed to read Copilot events file: ${eventsFile}`);
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const sessionId = path.basename(dirPath);
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  const messages: ParsedMessage[] = [];

  for (const line of lines) {
    let event: CopilotEvent;
    try {
      event = JSON.parse(line);
    } catch {
      console.warn(`Malformed JSONL line in ${eventsFile}`);
      continue;
    }

    const timestamp = toEpochMs(event.timestamp);

    if (event.type === "session.start") {
      // New format: context.cwd / context.branch
      if (event.data?.context?.cwd) cwd = event.data.context.cwd;
      else if (event.data?.workspace) cwd = event.data.workspace;

      if (event.data?.context?.branch) gitBranch = event.data.context.branch;
      else if (event.data?.branch) gitBranch = event.data.branch;
      continue;
    }

    if (event.type === "user.message") {
      const content = event.data?.content || null;
      messages.push({
        uuid: event.id || null,
        parent_uuid: null,
        role: "user",
        content,
        type: "text",
        timestamp,
        tool_uses: [],
      });
      continue;
    }

    // assistant.message contains the real content and tool calls
    if (event.type === "assistant.message") {
      const content = event.data?.content || null;
      const toolUses: ParsedToolUse[] = (event.data?.toolRequests ?? []).map((tr) => ({
        tool_name: tr.name || "unknown",
        file_path:
          typeof tr.arguments?.file_path === "string"
            ? tr.arguments.file_path
            : typeof tr.arguments?.path === "string"
            ? tr.arguments.path
            : null,
        timestamp,
      }));

      // Only push if there's content or tool uses
      if (content || toolUses.length > 0) {
        messages.push({
          uuid: event.id || null,
          parent_uuid: null,
          role: "assistant",
          content,
          type: toolUses.length > 0 ? "tool_use" : "text",
          timestamp,
          tool_uses: toolUses,
        });
      }
      continue;
    }

    // tool.execution_complete can carry result content — represent as tool_result
    if (event.type === "tool.execution_complete") {
      const resultData = event.data as Record<string, unknown> | undefined;
      const result = resultData?.result as Record<string, unknown> | undefined;
      const resultContent =
        typeof result?.content === "string" ? result.content : null;
      if (resultContent) {
        messages.push({
          uuid: event.id || null,
          parent_uuid: null,
          role: "user",
          content: resultContent,
          type: "tool_result",
          timestamp,
          tool_uses: [],
        });
      }
      continue;
    }
  }

  if (messages.length === 0) return null;

  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is number => t !== null);
  const startedAt = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const endedAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

  const project = deriveProject(cwd);

  // Compute token estimates
  for (const msg of messages) {
    if (msg.content) {
      (msg as { token_estimate?: number | null }).token_estimate = estimateTokens(msg.content);
    }
  }

  return {
    id: sessionId,
    tool: "copilot",
    project,
    cwd,
    git_branch: gitBranch,
    started_at: startedAt,
    ended_at: endedAt,
    source_file: eventsFile,
    messages,
  };
}
