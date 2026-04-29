import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createSchema } from "../src/server/db/schema.js";
import { indexSession, getWatcherState, resetWatcherState, simulateWatcherError } from "../src/server/services/indexer.js";
import type { ParsedSession } from "../src/server/types.js";
import { getStatusResponse } from "../src/server/api/status.js";

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
  resetWatcherState();
});

describe("WatcherState", () => {
  it("starts as active with null lastIndexedAt", () => {
    const state = getWatcherState();
    expect(state.status).toBe("active");
    expect(state.lastIndexedAt).toBeNull();
  });

  it("indexSession updates lastIndexedAt", () => {
    const before = Date.now();
    const parsed: ParsedSession = {
      id: "s-test",
      tool: "claude",
      project: null,
      cwd: "/test",
      git_branch: null,
      started_at: null,
      ended_at: null,
      source_file: "/test/s-test.jsonl",
      is_subagent: false,
      messages: [],
    };
    indexSession(db, parsed);
    const state = getWatcherState();
    expect(state.lastIndexedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("watcher restart", () => {
  it("sets status to recovering when watcher errors", () => {
    simulateWatcherError(db);
    const state = getWatcherState();
    expect(state.status).toBe("recovering");
  });

  it("sets status to dead after 5 failed retries", async () => {
    vi.useFakeTimers();
    // Trigger error + exhaust all retries
    for (let i = 0; i < 6; i++) {
      simulateWatcherError(db);
      await vi.runAllTimersAsync();
    }
    const state = getWatcherState();
    expect(state.status).toBe("dead");
    vi.useRealTimers();
  });
});

describe("getStatusResponse", () => {
  it("returns correct shape with zero sessions", () => {
    resetWatcherState();
    const result = getStatusResponse(db);
    expect(result).toEqual({
      sessions: 0,
      messages: 0,
      watcher: "active",
      last_indexed_at: null,
    });
  });

  it("returns correct counts after inserting data", () => {
    db.prepare(
      `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file, is_subagent)
       VALUES ('s1', 'claude', null, '/test', null, null, null, 0, '/test/s1.jsonl', 0)`
    ).run();
    db.prepare(
      `INSERT INTO messages (session_id, role, content, type) VALUES ('s1', 'user', 'hi', 'text')`
    ).run();
    const result = getStatusResponse(db);
    expect(result.sessions).toBe(1);
    expect(result.messages).toBe(1);
  });

  it("reflects watcher state", () => {
    simulateWatcherError(db);
    const result = getStatusResponse(db);
    expect(result.watcher).toBe("recovering");
  });
});
