import fs from "fs";
import path from "path";
import type { ParsedSession, ParsedMessage, ParsedToolUse } from "../../types.js";

interface ClaudeContentBlock {
  type: string;
  // text blocks
  text?: string;
  // thinking blocks
  thinking?: string;
  // tool_use blocks
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result blocks
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  // tool_reference blocks (inside tool_result content arrays)
  tool_name?: string;
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
    let type: "text" | "tool_use" | "tool_result" | "thinking";

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

    // Extract content
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const toolUses: ParsedToolUse[] = [];
    let hasToolResultBlock = false;
    let hasPlainTextBlock = false;

    for (const block of contentBlocks) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
        hasPlainTextBlock = true;
      } else if (block.type === "thinking" && block.thinking) {
        thinkingParts.push(block.thinking);
      } else if (block.type === "tool_use") {
        toolUses.push({
          tool_name: block.name || "unknown",
          file_path:
            (block.input?.file_path as string) ||
            (block.input?.path as string) ||
            null,
          timestamp,
          input_json: block.input ? JSON.stringify(block.input) : null,
        });
      } else if (block.type === "tool_result") {
        hasToolResultBlock = true;
        if (typeof block.content === "string") {
          textParts.push(block.content);
        } else if (Array.isArray(block.content)) {
          const toolRefs: string[] = [];
          for (const inner of block.content) {
            if (inner.type === "text" && typeof inner.text === "string") {
              textParts.push(inner.text);
            } else if (inner.type === "tool_reference" && inner.tool_name) {
              toolRefs.push(inner.tool_name as string);
            }
          }
          if (toolRefs.length > 0) {
            textParts.push(`[Tool dispatched: ${toolRefs.join(", ")}]`);
          }
        }
      }
    }

    // If content came exclusively from tool_result blocks, mark the message accordingly
    if (hasToolResultBlock && !hasPlainTextBlock) {
      type = "tool_result";
    }

    // If content is a plain string (fallback)
    if (typeof msg.content === "string") {
      textParts.push(msg.content);
    }

    // Determine final content and type:
    // - prefer visible text over thinking-only content
    // - if only thinking, surface it so bubbles aren't blank (type="thinking")
    let content: string | null;
    if (textParts.length > 0) {
      content = textParts.join("\n");
    } else if (thinkingParts.length > 0) {
      content = thinkingParts.join("\n");
      if (toolUses.length === 0) type = "thinking";
    } else {
      content = null;
    }

    // Mark as tool_use when assistant has tool calls (and not already typing/thinking-only)
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
