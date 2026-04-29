import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createSchema } from "../src/server/db/schema.js";
import { getWatcherState, resetWatcherState } from "../src/server/services/indexer.js";

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
});
