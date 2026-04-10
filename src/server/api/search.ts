import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { searchMessages } from "../services/search.js";

export const searchRouter = Router();

searchRouter.get("/", (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;

  if (!q) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }

  const db = getDb();

  const result = searchMessages(db, {
    q,
    tool: req.query.tool as string | undefined,
    project: req.query.project as string | undefined,
    branch: req.query.branch as string | undefined,
    after: req.query.after ? Number(req.query.after) : undefined,
    before: req.query.before ? Number(req.query.before) : undefined,
    role: req.query.role as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });

  res.json(result);
});
