import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createSchema } from "../src/server/db/schema.js";
import { indexSession, getWatcherState, resetWatcherState } from "../src/server/services/indexer.js";
import type { ParsedSession } from "../src/server/types.js";

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
