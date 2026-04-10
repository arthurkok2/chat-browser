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

// Every entry in the JSONL has these top-level fields.
// Only "user" and "assistant" typed entries have a `message` field.
interface ClaudeLine {
  type?: string;
  // present on all meaningful entries
  uuid?: string;
  parentUuid?: string;
  isSidechain?: boolean;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  // present only on "user" and "assistant" entries
  message?: {
    id?: string;       // Anthropic API message ID (msg_bdrk_...), NOT the conversation uuid
    role?: string;
    content?: ClaudeContentBlock[] | string;
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
  let gitBranch: string | null = null;
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

    // sessionId, cwd, gitBranch and isSidechain are on every entry — grab on first occurrence
    if (!sessionId && parsed.sessionId) sessionId = parsed.sessionId;
    if (!cwd && parsed.cwd) cwd = parsed.cwd;
    if (!gitBranch && parsed.gitBranch) gitBranch = parsed.gitBranch;
    if (parsed.isSidechain === true) isSubagent = true;

    // Only "user" and "assistant" entries carry a message
    const msg = parsed.message;
    if (!msg) continue;

    const role = msg.role;
    if (role !== "user" && role !== "assistant") continue;

    const contentBlocks = Array.isArray(msg.content) ? msg.content : [];
    const timestamp = toEpochMs(parsed.timestamp);

    // Extract content blocks by type
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

    // Fallback: message.content is a plain string (user messages sometimes are)
    if (typeof msg.content === "string" && msg.content) {
      textParts.push(msg.content);
      hasPlainTextBlock = true;
    }

    // Determine message type
    let type: "text" | "tool_use" | "tool_result" | "thinking";
    if (hasToolResultBlock && !hasPlainTextBlock) {
      // Content came exclusively from tool_result blocks
      type = "tool_result";
    } else if (role === "assistant" && toolUses.length > 0 && textParts.length === 0 && thinkingParts.length === 0) {
      // Pure tool dispatch with no accompanying text or thinking
      type = "tool_use";
    } else if (role === "assistant" && toolUses.length > 0) {
      // Tool dispatch that also has text or thinking content
      type = "tool_use";
    } else if (thinkingParts.length > 0 && textParts.length === 0 && toolUses.length === 0) {
      // Pure thinking, no visible output
      type = "thinking";
    } else {
      type = "text";
    }

    // Determine content to store:
    // - For tool_result / text / tool_use: use extracted text
    // - For thinking-only: surface the thinking so the bubble isn't blank
    let content: string | null;
    if (textParts.length > 0) {
      content = textParts.join("\n");
    } else if (thinkingParts.length > 0) {
      content = thinkingParts.join("\n");
    } else {
      content = null;
    }

    // Skip completely empty entries (no content, no tool calls)
    if (!content && toolUses.length === 0) continue;

    messages.push({
      // uuid is the conversation entry UUID (parsed.uuid), NOT msg.id (which is the API message ID)
      uuid: parsed.uuid || null,
      parent_uuid: parsed.parentUuid || null,
      role: role as "user" | "assistant",
      content,
      type,
      timestamp,
      tool_uses: toolUses,
    });
  }

  if (messages.length === 0) return null;

  // Fallback: derive sessionId from filename if not found in entries
  if (!sessionId) {
    sessionId = path.basename(filePath, path.extname(filePath));
  }

  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is number => t !== null);
  const startedAt = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const endedAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

  for (const m of messages) {
    (m as ParsedMessage & { token_estimate?: number | null }).token_estimate =
      estimateTokens(m.content);
  }

  return {
    id: sessionId,
    tool: "claude",
    project,
    cwd,
    git_branch: gitBranch,
    started_at: startedAt,
    ended_at: endedAt,
    source_file: filePath,
    is_subagent: isSubagent,
    messages,
  };
}
