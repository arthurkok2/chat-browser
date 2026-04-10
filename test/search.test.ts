import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createSchema } from "../src/server/db/schema.js";
import { searchMessages } from "../src/server/services/search.js";

let db: Database.Database;

function insertSession(
  id: string,
  tool: string,
  project: string | null,
  branch: string | null,
  startedAt: number | null,
  messageCount: number,
) {
  db.prepare(
    `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file)
     VALUES (@id, @tool, @project, @cwd, @branch, @startedAt, @endedAt, @messageCount, @sourceFile)`,
  ).run({
    id,
    tool,
    project,
    cwd: "/test",
    branch,
    startedAt,
    endedAt: startedAt ? startedAt + 60000 : null,
    messageCount,
    sourceFile: `/test/${id}.jsonl`,
  });
}

function insertMessage(
  sessionId: string,
  role: string,
  content: string,
  type: string = "text",
  timestamp: number | null = null,
) {
  db.prepare(
    `INSERT INTO messages (session_id, role, content, type, timestamp, token_estimate)
     VALUES (@sessionId, @role, @content, @type, @timestamp, @tokenEstimate)`,
  ).run({
    sessionId,
    role,
    content,
    type,
    timestamp,
    tokenEstimate: content ? Math.ceil(content.length / 4) : null,
  });
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createSchema(db);
});

afterEach(() => {
  db.close();
});

describe("searchMessages", () => {
  it("finds messages using FTS5 full-text search", () => {
    insertSession("s1", "claude", "myproject", null, 1700000000000, 1);
    insertMessage("s1", "user", "How do I implement authentication in React?");

    const result = searchMessages(db, { q: "authentication" });
    expect(result.total).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].session.id).toBe("s1");
    expect(result.results[0].role).toBe("user");
  });

  it("returns snippet with highlighting", () => {
    insertSession("s1", "claude", "myproject", null, 1700000000000, 1);
    insertMessage("s1", "user", "How do I implement authentication in React?");

    const result = searchMessages(db, { q: "authentication" });
    expect(result.results[0].snippet).toContain("<mark>");
    expect(result.results[0].snippet).toContain("</mark>");
    expect(result.results[0].snippet).toContain("authentication");
  });

  it("filters by tool", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertSession("s2", "copilot", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "testing search functionality");
    insertMessage("s2", "user", "testing search functionality");

    const result = searchMessages(db, { q: "search", tool: "claude" });
    expect(result.total).toBe(1);
    expect(result.results[0].session.tool).toBe("claude");
  });

  it("filters by project", () => {
    insertSession("s1", "claude", "project-a", null, 1700000000000, 1);
    insertSession("s2", "claude", "project-b", null, 1700000000000, 1);
    insertMessage("s1", "user", "building the frontend");
    insertMessage("s2", "user", "building the frontend");

    const result = searchMessages(db, {
      q: "building",
      project: "project-a",
    });
    expect(result.total).toBe(1);
    expect(result.results[0].session.project).toBe("project-a");
  });

  it("filters by role", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 2);
    insertMessage("s1", "user", "explain database indexing");
    insertMessage("s1", "assistant", "database indexing improves query speed");

    const result = searchMessages(db, { q: "database", role: "assistant" });
    expect(result.total).toBe(1);
    expect(result.results[0].role).toBe("assistant");
  });

  it("filters by branch", () => {
    insertSession("s1", "copilot", null, "main", 1700000000000, 1);
    insertSession("s2", "copilot", null, "feature/x", 1700000000000, 1);
    insertMessage("s1", "user", "deploy to production");
    insertMessage("s2", "user", "deploy to production");

    const result = searchMessages(db, {
      q: "deploy",
      branch: "feature/x",
    });
    expect(result.total).toBe(1);
    expect(result.results[0].session.git_branch).toBe("feature/x");
  });

  it("supports pagination with limit and offset", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 3);
    insertMessage("s1", "user", "alpha query test");
    insertMessage("s1", "assistant", "beta query test");
    insertMessage("s1", "user", "gamma query test");

    const page1 = searchMessages(db, { q: "query", limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.results).toHaveLength(2);

    const page2 = searchMessages(db, { q: "query", limit: 2, offset: 2 });
    expect(page2.total).toBe(3);
    expect(page2.results).toHaveLength(1);
  });

  it("returns duration_ms in the response", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "performance timing test");

    const result = searchMessages(db, { q: "performance" });
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("returns empty results for unmatched queries", () => {
    insertSession("s1", "claude", null, null, 1700000000000, 1);
    insertMessage("s1", "user", "hello world");

    const result = searchMessages(db, { q: "zzzznonexistent" });
    expect(result.total).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
