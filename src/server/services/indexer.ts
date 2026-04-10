import fs from "fs";
import path from "path";
import os from "os";
import { DatabaseSync } from "node:sqlite";
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { ParsedSession, ParsedMessage } from "../types.js";
import { parseClaudeSession } from "./parsers/claude.js";
import { parseCopilotSession } from "./parsers/copilot.js";
import { parseCodexSession } from "./parsers/codex.js";
import {
  discoverSessions,
  type DiscoveredSources,
} from "./discovery.js";

/**
 * Increment this whenever a parser changes significantly so existing indexed
 * sessions are automatically re-parsed even if the source file hasn't changed.
 */
const PARSER_VERSION = 5;

/**
 * Check whether a session file has changed since last index.
 */
function isStale(
  db: DatabaseSync,
  sourceFile: string,
  mtime: number,
  size: number
): boolean {
  const row = db
    .prepare(
      "SELECT file_mtime, file_size, parser_version FROM sessions WHERE source_file = ? LIMIT 1"
    )
    .get(sourceFile) as { file_mtime: number | null; file_size: number | null; parser_version: number | null } | undefined;

  if (!row) return true;
  if (row.parser_version !== PARSER_VERSION) return true;
  return row.file_mtime !== mtime || row.file_size !== size;
}

function getFileStat(filePath: string): { mtime: number; size: number } | null {
  try {
    const stat = fs.statSync(filePath);
    return { mtime: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

/**
 * Insert a parsed session and all its messages/tool_uses into the database.
 * Runs inside a transaction.
 */
export function indexSession(
  db: DatabaseSync,
  parsed: ParsedSession
): void {
  const sourceFile = parsed.source_file;
  const stat = getFileStat(sourceFile);

  db.exec("BEGIN");
  try {
    // Delete existing data for this session (cascades to messages, tool_uses)
    db.prepare("DELETE FROM sessions WHERE id = ?").run(parsed.id);

    // Insert session row
    db.prepare(
      `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file, file_mtime, file_size, parser_version, is_subagent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      parsed.id,
      parsed.tool,
      parsed.project,
      parsed.cwd,
      parsed.git_branch,
      parsed.started_at,
      parsed.ended_at,
      parsed.messages.length,
      sourceFile,
      stat?.mtime ?? null,
      stat?.size ?? null,
      PARSER_VERSION,
      parsed.is_subagent ? 1 : 0
    );

    // Prepare statements for messages and tool_uses
    const insertMsg = db.prepare(
      `INSERT INTO messages (session_id, uuid, parent_uuid, role, content, type, timestamp, token_estimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertTool = db.prepare(
      `INSERT INTO tool_uses (message_id, session_id, tool_name, file_path, timestamp, input_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const msg of parsed.messages) {
      const tokenEstimate = msg.content
        ? Math.ceil(msg.content.length / 4)
        : null;

      const result = insertMsg.run(
        parsed.id,
        msg.uuid,
        msg.parent_uuid,
        msg.role,
        msg.content,
        msg.type,
        msg.timestamp,
        tokenEstimate
      );

      const messageId = result.lastInsertRowid;

      for (const tu of msg.tool_uses) {
        insertTool.run(
          messageId,
          parsed.id,
          tu.tool_name,
          tu.file_path,
          tu.timestamp,
          tu.input_json
        );
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Index all discovered sessions. Skips files that haven't changed.
 * Returns counts of newly indexed sessions and messages.
 */
export function indexAllSessions(
  db: DatabaseSync,
  sources: DiscoveredSources
): { sessions: number; messages: number } {
  let sessionCount = 0;
  let messageCount = 0;

  // Claude sessions
  for (const filePath of sources.claude) {
    const stat = getFileStat(filePath);
    if (!stat) continue;
    if (!isStale(db, filePath, stat.mtime, stat.size)) continue;

    const parsed = parseClaudeSession(filePath);
    if (!parsed) continue;

    indexSession(db, parsed);
    sessionCount++;
    messageCount += parsed.messages.length;
  }

  // Copilot sessions
  for (const dirPath of sources.copilot) {
    const eventsFile = path.join(dirPath, "events.jsonl");
    const stat = getFileStat(eventsFile);
    if (!stat) continue;
    if (!isStale(db, eventsFile, stat.mtime, stat.size)) continue;

    const parsed = parseCopilotSession(dirPath);
    if (!parsed) continue;

    indexSession(db, parsed);
    sessionCount++;
    messageCount += parsed.messages.length;
  }

  // Codex sessions
  for (const filePath of sources.codex) {
    const stat = getFileStat(filePath);
    if (!stat) continue;
    if (!isStale(db, filePath, stat.mtime, stat.size)) continue;

    const parsed = parseCodexSession(filePath);
    if (!parsed) continue;

    indexSession(db, parsed);
    sessionCount++;
    messageCount += parsed.messages.length;
  }

  return { sessions: sessionCount, messages: messageCount };
}

/**
 * Determine which parser to use based on file path, parse, and index.
 */
function parseAndIndex(db: DatabaseSync, filePath: string): void {
  const normalized = filePath.replace(/\\/g, "/");

  let parsed: ParsedSession | null = null;

  if (normalized.includes("/.claude/projects/") || normalized.includes("/.claude\\projects\\")) {
    parsed = parseClaudeSession(filePath);
  } else if (
    normalized.includes("/.copilot/session-state/") ||
    normalized.includes("/.copilot\\session-state\\")
  ) {
    // For copilot, we need the directory, not the events.jsonl file
    const dir = path.dirname(filePath);
    parsed = parseCopilotSession(dir);
  } else if (
    normalized.includes("/.codex/sessions/") ||
    normalized.includes("/.codex/archived_sessions/") ||
    normalized.includes("/.codex\\sessions\\") ||
    normalized.includes("/.codex\\archived_sessions\\")
  ) {
    parsed = parseCodexSession(filePath);
  }

  if (parsed) {
    indexSession(db, parsed);
  }
}

/**
 * Start watching session directories for changes. Re-indexes on add/change.
 */
export function startWatcher(
  db: DatabaseSync,
  customDirs?: Record<string, string[]>
): FSWatcher {
  const home = os.homedir();

  const watchPaths: string[] = [
    path.join(home, ".claude", "projects"),
    path.join(home, ".copilot", "session-state"),
    path.join(home, ".codex", "sessions"),
    path.join(home, ".codex", "archived_sessions"),
  ];

  // Add custom dirs
  if (customDirs) {
    for (const dirs of Object.values(customDirs)) {
      watchPaths.push(...dirs);
    }
  }

  // Filter to paths that exist
  const existingPaths = watchPaths.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const watcher = chokidar.watch(existingPaths, {
    ignoreInitial: true,
    persistent: true,
    depth: 10,
  });

  const handleChange = (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;

    // Debounce per file
    const existing = debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    debounceTimers.set(
      filePath,
      setTimeout(() => {
        debounceTimers.delete(filePath);
        try {
          parseAndIndex(db, filePath);
        } catch (err) {
          console.warn(`Error indexing ${filePath}:`, err);
        }
      }, 100)
    );
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);

  return watcher;
}
