import { DatabaseSync } from "node:sqlite";
import path from "path";
import os from "os";
import fs from "fs";
import { createSchema } from "./schema.js";

function getDefaultDbPath(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  const base = xdgData || path.join(os.homedir(), ".chat-browser");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "index.db");
}

let db: DatabaseSync | null = null;

export function getDb(dbPath?: string): DatabaseSync {
  if (db) return db;
  const resolvedPath = dbPath || getDefaultDbPath();
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  db = new DatabaseSync(resolvedPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
