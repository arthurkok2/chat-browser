import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import {
  exportSession,
  exportSessions,
  exportAnalytics,
  type ExportFormat,
} from "../services/export.js";

export const exportRouter = Router();

exportRouter.get("/", (req: Request, res: Response) => {
  const db = getDb();

  const format = (req.query.format as ExportFormat) || "json";
  const sessionId = req.query.session_id as string | undefined;
  const type = (req.query.type as string) || "sessions";

  if (!["md", "json", "csv"].includes(format)) {
    res.status(400).json({ error: "Invalid format. Use md, json, or csv." });
    return;
  }

  try {
    let result;

    if (sessionId) {
      result = exportSession(db, sessionId, format);
    } else if (type === "analytics") {
      result = exportAnalytics(db, {
        after: req.query.after ? Number(req.query.after) : undefined,
        before: req.query.before ? Number(req.query.before) : undefined,
      });
    } else {
      result = exportSessions(
        db,
        {
          tool: req.query.tool as string | undefined,
          project: req.query.project as string | undefined,
          branch: req.query.branch as string | undefined,
          after: req.query.after ? Number(req.query.after) : undefined,
          before: req.query.before ? Number(req.query.before) : undefined,
        },
        format,
      );
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.content);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    res.status(404).json({ error: message });
  }
});
