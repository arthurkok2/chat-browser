import { Router } from "express";
import type { Request, Response } from "express";
import { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/connection.js";
import { getWatcherState } from "../services/indexer.js";

export interface StatusResponse {
  sessions: number;
  messages: number;
  watcher: "active" | "recovering" | "dead";
  last_indexed_at: number | null;
}

export function getStatusResponse(db: DatabaseSync): StatusResponse {
  const { sessions } = db.prepare("SELECT COUNT(*) AS sessions FROM sessions").get() as { sessions: number };
  const { messages } = db.prepare("SELECT COUNT(*) AS messages FROM messages").get() as { messages: number };
  const state = getWatcherState();
  return {
    sessions,
    messages,
    watcher: state.status,
    last_indexed_at: state.lastIndexedAt,
  };
}

export const statusRouter = Router();

statusRouter.get("/", (_req: Request, res: Response) => {
  try {
    const db = getDb();
    res.json(getStatusResponse(db));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
