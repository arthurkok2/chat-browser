import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSchema } from "../src/server/db/schema.js";
import { getAnalytics } from "../src/server/services/analytics.js";
import {
  exportSession,
  exportSessions,
  exportAnalytics,
} from "../src/server/services/export.js";

let db: DatabaseSync;

function insertSession(
  id: string,
  tool: string,
  project: string | null,
  branch: string | null,
  startedAt: number | null,
  messageCount: number,
  endedAt?: number | null,
) {
  db.prepare(
    `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file, is_subagent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    id,
    tool,
    project,
    "/test",
    branch,
    startedAt,
    endedAt ?? (startedAt ? startedAt + 60000 : null),
    messageCount,
    `/test/${id}.jsonl`,
  );
}

function insertMessage(
  sessionId: string,
  role: string,
  content: string,
  type: string = "text",
  tokenEstimate: number | null = null,
) {
  const estimate = tokenEstimate ?? Math.ceil(content.length / 4);
  db.prepare(
    `INSERT INTO messages (session_id, role, content, type, token_estimate)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, role, content, type, estimate);
}

function insertToolUse(
  messageId: number,
  sessionId: string,
  toolName: string,
  filePath: string | null = null,
) {
  db.prepare(
    `INSERT INTO tool_uses (message_id, session_id, tool_name, file_path)
     VALUES (?, ?, ?, ?)`,
  ).run(messageId, sessionId, toolName, filePath);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
});

afterEach(() => {
  db.close();
});

describe("getAnalytics", () => {
  it("returns correct summary counts", () => {
    insertSession("s1", "claude", "proj-a", "main", 1700000000000, 3);
    insertSession("s2", "copilot", "proj-b", "dev", 1700100000000, 2);
    insertMessage("s1", "user", "hello world");
    insertMessage("s1", "assistant", "hi there, how can I help?");
    insertMessage("s1", "user", "thanks");
    insertMessage("s2", "user", "question about code");
    insertMessage("s2", "assistant", "here is the answer");

    const analytics = getAnalytics(db, {});
    expect(analytics.summary.total_sessions).toBe(2);
    expect(analytics.summary.total_messages).toBe(5);
    expect(analytics.summary.project_count).toBe(2);
    expect(analytics.summary.estimated_tokens).toBeGreaterThan(0);
  });

  it("returns tool breakdown", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertSession("s2", "claude", null, null, 1700000000000, 1);
    insertSession("s3", "copilot", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "a");
    insertMessage("s2", "user", "b");
    insertMessage("s3", "user", "c");

    const analytics = getAnalytics(db, {});
    expect(analytics.tool_breakdown).toHaveLength(2);
    const claudeEntry = analytics.tool_breakdown.find(
      (t) => t.tool === "claude",
    );
    expect(claudeEntry!.count).toBe(2);
  });

  it("returns project breakdown excluding nulls", () => {
    insertSession("s1", "claude", "proj-a", null, 1700000000000, 1);
    insertSession("s2", "claude", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "a");
    insertMessage("s2", "user", "b");

    const analytics = getAnalytics(db, {});
    expect(analytics.project_breakdown).toHaveLength(1);
    expect(analytics.project_breakdown[0].project).toBe("proj-a");
  });

  it("returns conversation length buckets", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 5);
    insertSession("s2", "claude", null, null, 1700000000000, 15);
    insertSession("s3", "claude", null, null, 1700000000000, 75);

    const analytics = getAnalytics(db, {});
    expect(analytics.conversation_lengths.length).toBeGreaterThan(0);
    const bucket1 = analytics.conversation_lengths.find(
      (b) => b.bucket === "1-10",
    );
    expect(bucket1!.count).toBe(1);
  });

  it("returns tool usage from tool_uses table", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertMessage("s1", "assistant", "reading file");
    // Get the message id
    const msgId = (
      db.prepare("SELECT id FROM messages LIMIT 1").get() as unknown as { id: number }
    ).id;
    insertToolUse(msgId, "s1", "Read", "/test/file.ts");
    insertToolUse(msgId, "s1", "Read", "/test/other.ts");
    insertToolUse(msgId, "s1", "Edit", "/test/file.ts");

    const analytics = getAnalytics(db, {});
    expect(analytics.tool_usage.length).toBeGreaterThan(0);
    const readEntry = analytics.tool_usage.find((t) => t.tool_name === "Read");
    expect(readEntry!.count).toBe(2);
  });

  it("filters by date range", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertSession("s2", "claude", null, null, 1800000000000, 1);
    insertMessage("s1", "user", "old session");
    insertMessage("s2", "user", "new session");

    const analytics = getAnalytics(db, { after: 1750000000000 });
    expect(analytics.summary.total_sessions).toBe(1);
  });

  it("returns branch breakdown excluding nulls", () => {
    insertSession("s1", "copilot", null, "main", 1700000000000, 1);
    insertSession("s2", "copilot", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "a");
    insertMessage("s2", "user", "b");

    const analytics = getAnalytics(db, {});
    expect(analytics.branch_breakdown).toHaveLength(1);
    expect(analytics.branch_breakdown[0].branch).toBe("main");
  });
});

describe("exportSession", () => {
  it("exports a session as markdown", () => {
    insertSession("s1", "claude", "myproj", "main", 1700000000000, 2);
    insertMessage("s1", "user", "Hello");
    insertMessage("s1", "assistant", "Hi there!");

    const result = exportSession(db, "s1", "md");
    expect(result.contentType).toBe("text/markdown");
    expect(result.filename).toBe("session-s1.md");
    expect(result.content).toContain("# Session s1");
    expect(result.content).toContain("**Tool:** claude");
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("Hi there!");
  });

  it("exports a session as JSON", () => {
    insertSession("s1", "claude", "myproj", null, 1700000000000, 1);
    insertMessage("s1", "user", "Hello");

    const result = exportSession(db, "s1", "json");
    expect(result.contentType).toBe("application/json");
    const parsed = JSON.parse(result.content);
    expect(parsed.session.id).toBe("s1");
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.tool_uses).toEqual([]);
  });

  it("exports a session as CSV", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "Hello");

    const result = exportSession(db, "s1", "csv");
    expect(result.contentType).toBe("text/csv");
    const lines = result.content.split("\n");
    expect(lines[0]).toBe("message_id,role,type,timestamp,content");
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("user");
    expect(lines[1]).toContain("Hello");
  });

  it("throws for non-existent session", () => {
    expect(() => exportSession(db, "nonexistent", "json")).toThrowError(
      "Session not found",
    );
  });

  it("includes tool uses in markdown export", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertMessage("s1", "assistant", "Reading the file");
    const msgId = (
      db.prepare("SELECT id FROM messages LIMIT 1").get() as unknown as { id: number }
    ).id;
    insertToolUse(msgId, "s1", "Read", "/src/index.ts");

    const result = exportSession(db, "s1", "md");
    expect(result.content).toContain("### Tool: Read");
    expect(result.content).toContain("`/src/index.ts`");
  });
});

describe("exportSessions", () => {
  it("exports multiple sessions as CSV with filters", () => {
    insertSession("s1", "claude", "proj-a", null, 1700000000000, 1);
    insertSession("s2", "copilot", "proj-b", null, 1700000000000, 1);
    insertMessage("s1", "user", "a");
    insertMessage("s2", "user", "b");

    const result = exportSessions(db, { tool: "claude" }, "csv");
    expect(result.contentType).toBe("text/csv");
    const lines = result.content.split("\n");
    // header + 1 session
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("claude");
  });

  it("exports multiple sessions as JSON", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertSession("s2", "claude", null, null, 1700100000000, 1);
    insertMessage("s1", "user", "first");
    insertMessage("s2", "user", "second");

    const result = exportSessions(db, {}, "json");
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].session).toBeDefined();
    expect(parsed[0].messages).toBeDefined();
  });
});

describe("exportAnalytics", () => {
  it("returns analytics as CSV", () => {
    insertSession("s1", "claude", "proj-a", "main", 1700000000000, 2);
    insertMessage("s1", "user", "hello world", "text", 3);
    insertMessage("s1", "assistant", "response here", "text", 4);

    const result = exportAnalytics(db, {});
    expect(result.contentType).toBe("text/csv");
    expect(result.content).toContain("summary,total_sessions,1");
    expect(result.content).toContain("summary,total_messages,2");
    expect(result.content).toContain("summary,estimated_tokens,7");
    expect(result.content).toContain("tool_breakdown,claude,1");
  });
});
