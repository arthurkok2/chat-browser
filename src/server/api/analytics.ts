import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { getAnalytics } from "../services/analytics.js";

export const analyticsRouter = Router();

analyticsRouter.get("/", (req: Request, res: Response) => {
  const db = getDb();

  const result = getAnalytics(db, {
    after: req.query.after ? Number(req.query.after) : undefined,
    before: req.query.before ? Number(req.query.before) : undefined,
  });

  res.json(result);
});
