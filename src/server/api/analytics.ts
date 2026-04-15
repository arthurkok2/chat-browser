import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { getAnalytics } from "../services/analytics.js";

export const analyticsRouter = Router();

analyticsRouter.get("/", (req: Request, res: Response) => {
  const db = getDb();

  const periodParam = req.query.period as string;
  const period =
    periodParam === "7d" || periodParam === "30d" || periodParam === "90d" || periodParam === "all"
      ? periodParam
      : "30d";

  const project = req.query.project as string | undefined;

  const result = getAnalytics(db, { period, project });
  res.json(result);
});
