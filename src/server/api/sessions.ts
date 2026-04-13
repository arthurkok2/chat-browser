import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import type { Session, Message, ToolUse } from "../types.js";

export const sessionsRouter = Router();

sessionsRouter.get("/", (req: Request, res: Response) => {
  const db = getDb();

  const tool = req.query.tool as string | undefined;
  const project = req.query.project as string | undefined;
  const branch = req.query.branch as string | undefined;
  const after = req.query.after ? Number(req.query.after) : undefined;
  const before = req.query.before ? Number(req.query.before) : undefined;
  const sortParam = req.query.sort as string;
  const sort = sortParam === "message_count" ? "message_count" : sortParam === "started_at" ? "started_at" : "ended_at";
  const order = (req.query.order as string) === "asc" ? "ASC" : "DESC";
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;
  const includeSubagents = req.query.include_subagents === "true";

  const conditions: string[] = [];
  const bindings: Record<string, string | number | null> = {};

  if (tool) {
    conditions.push("s.tool = @tool");
    bindings.tool = tool;
  }
  if (project) {
    conditions.push("s.project = @project");
    bindings.project = project;
  }
  if (branch) {
    conditions.push("s.git_branch = @branch");
    bindings.branch = branch;
  }
  if (after != null) {
    conditions.push("s.started_at >= @after");
    bindings.after = after;
  }
  if (before != null) {
    conditions.push("s.started_at <= @before");
    bindings.before = before;
  }
  if (!includeSubagents) {
    conditions.push("s.is_subagent = 0");
  }

  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM sessions s ${whereClause}`)
    .get(bindings) as unknown as { total: number };

  const sessions = db
    .prepare(
      `SELECT * FROM sessions s ${whereClause} ORDER BY s.${sort} ${order} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...bindings, limit, offset }) as unknown as Session[];

  res.json({ sessions, total: countRow.total });
});

sessionsRouter.get("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;

  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as unknown as Session | undefined;

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const messages = db
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id")
    .all(id) as unknown as Message[];

  const tool_uses = db
    .prepare("SELECT * FROM tool_uses WHERE session_id = ? ORDER BY id")
    .all(id) as unknown as ToolUse[];

  res.json({ session, messages, tool_uses });
});
