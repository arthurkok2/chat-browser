import fs from "fs";
import path from "path";
import type { ParsedSession, ParsedMessage, ParsedToolUse } from "../../types.js";

interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ClaudeLine {
  type?: string;
  sessionId?: string;
  cwd?: string;
  version?: string;
  isSidechain?: boolean;
  parentMessageId?: string;
  message?: {
    id?: string;
    role?: string;
    content?: ClaudeContentBlock[] | string;
  };
  timestamp?: string;
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

export function parseClaudeSession(filePath: string): ParsedSession | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    console.warn(`Failed to read Claude session file: ${filePath}`);
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let isSubagent = false;
  const messages: ParsedMessage[] = [];

  // Derive project from directory structure: ~/.claude/projects/{project-path-encoded}/
  let project: string | null = null;
  const projectsIdx = filePath.replace(/\\/g, "/").indexOf("/.claude/projects/");
  if (projectsIdx !== -1) {
    const afterProjects = filePath
      .replace(/\\/g, "/")
      .slice(projectsIdx + "/.claude/projects/".length);
    const slashIdx = afterProjects.indexOf("/");
    if (slashIdx !== -1) {
      project = afterProjects.slice(0, slashIdx);
    }
  }

  for (const line of lines) {
    let parsed: ClaudeLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn(`Malformed JSONL line in ${filePath}`);
      continue;
    }

    // isSidechain is on the first line (no type field) or any line
    if (parsed.isSidechain === true) isSubagent = true;

    // Summary / metadata line
    if (parsed.type === "summary") {
      if (parsed.sessionId) sessionId = parsed.sessionId;
      if (parsed.cwd) cwd = parsed.cwd;
      continue;
    }

    const msg = parsed.message;
    if (!msg) continue;

    const contentBlocks = Array.isArray(msg.content) ? msg.content : [];
    const timestamp = toEpochMs(parsed.timestamp);

    // Determine role and type
    let role: "user" | "assistant" | "system";
    let type: "text" | "tool_use" | "tool_result";

    if (parsed.type === "tool_result") {
      role = "user";
      type = "tool_result";
    } else if (msg.role === "assistant") {
      role = "assistant";
      type = "text";
    } else if (msg.role === "user") {
      role = "user";
      type = "text";
    } else {
      role = "system";
      type = "text";
    }

    // Extract text content
    const textParts: string[] = [];
    const toolUses: ParsedToolUse[] = [];

    for (const block of contentBlocks) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUses.push({
          tool_name: block.name || "unknown",
          file_path: (block.input?.file_path as string) || null,
          timestamp,
        });
      } else if (block.type === "tool_result" && typeof block.content === "string") {
        textParts.push(block.content);
      }
    }

    // If content is a plain string (fallback)
    if (typeof msg.content === "string") {
      textParts.push(msg.content);
    }

    const content = textParts.length > 0 ? textParts.join("\n") : null;

    // If there are tool_use blocks in an assistant message, mark as tool_use type
    if (role === "assistant" && toolUses.length > 0 && type === "text") {
      type = "tool_use";
    }

    messages.push({
      uuid: msg.id || null,
      parent_uuid: parsed.parentMessageId || null,
      role,
      content,
      type,
      timestamp,
      tool_uses: toolUses,
    });
  }

  if (messages.length === 0) return null;

  // Derive sessionId from filename if not found in summary
  if (!sessionId) {
    sessionId = path.basename(filePath, path.extname(filePath));
  }

  // Compute started_at / ended_at from message timestamps
  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is number => t !== null);
  const startedAt = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const endedAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

  // Estimate tokens on messages
  for (const m of messages) {
    (m as ParsedMessage & { token_estimate?: number | null }).token_estimate =
      estimateTokens(m.content);
  }

  return {
    id: sessionId,
    tool: "claude",
    project,
    cwd,
    git_branch: null,
    started_at: startedAt,
    ended_at: endedAt,
    source_file: filePath,
    is_subagent: isSubagent,
    messages,
  };
}
