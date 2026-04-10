import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { dropSchema, createSchema } from "../db/schema.js";
import { indexAllSessions } from "../services/indexer.js";
import { discoverSessions } from "../services/discovery.js";

export const reindexRouter = Router();

reindexRouter.post("/", (req: Request, res: Response) => {
  const start = Date.now();
  const db = getDb();

  dropSchema(db);
  createSchema(db);

  const sources = discoverSessions();
  const { sessions, messages } = indexAllSessions(db, sources);

  res.json({
    sessions_indexed: sessions,
    messages_indexed: messages,
    duration_ms: Date.now() - start,
  });
});
