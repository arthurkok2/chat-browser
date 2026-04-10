import { DatabaseSync } from "node:sqlite";
import type { AnalyticsData } from "../types.js";

export interface AnalyticsParams {
  after?: number;
  before?: number;
}

export function getAnalytics(
  db: DatabaseSync,
  params: AnalyticsParams,
): AnalyticsData {
  const dateConditions: string[] = [];
  const bindings: Record<string, string | number | null> = {};

  if (params.after != null) {
    dateConditions.push("s.started_at >= @after");
    bindings.after = params.after;
  }

  if (params.before != null) {
    dateConditions.push("s.started_at <= @before");
    bindings.before = params.before;
  }

  const whereClause =
    dateConditions.length > 0 ? "WHERE " + dateConditions.join(" AND ") : "";

  // Summary
  const summaryRow = db
    .prepare(
      `SELECT
         COUNT(*) AS total_sessions,
         COALESCE(SUM(s.message_count), 0) AS total_messages,
         COUNT(DISTINCT s.project) AS project_count
       FROM sessions s
       ${whereClause}`,
    )
    .get(bindings) as {
    total_sessions: number;
    total_messages: number;
    project_count: number;
  };

  const tokenRow = db
    .prepare(
      `SELECT COALESCE(SUM(m.token_estimate), 0) AS estimated_tokens
       FROM messages m
       JOIN sessions s ON m.session_id = s.id
       ${whereClause}`,
    )
    .get(bindings) as unknown as { estimated_tokens: number };

  const summary = {
    ...summaryRow,
    estimated_tokens: tokenRow.estimated_tokens,
  };

  // Sessions over time
  const sessionsOverTime = db
    .prepare(
      `SELECT
         date(s.started_at / 1000, 'unixepoch') AS date,
         COUNT(*) AS count
       FROM sessions s
       ${whereClause}
       GROUP BY date(s.started_at / 1000, 'unixepoch')
       ORDER BY date`,
    )
    .all(bindings) as { date: string; count: number }[];

  // Tool breakdown
  const toolBreakdown = db
    .prepare(
      `SELECT s.tool, COUNT(*) AS count
       FROM sessions s
       ${whereClause}
       GROUP BY s.tool
       ORDER BY count DESC`,
    )
    .all(bindings) as { tool: string; count: number }[];

  // Project breakdown
  const projectBreakdown = db
    .prepare(
      `SELECT s.project, COUNT(*) AS count
       FROM sessions s
       ${whereClause.length > 0 ? whereClause + " AND s.project IS NOT NULL" : "WHERE s.project IS NOT NULL"}
       GROUP BY s.project
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(bindings) as { project: string; count: number }[];

  // Tool usage (from tool_uses table)
  const toolUsage = db
    .prepare(
      `SELECT tu.tool_name, COUNT(*) AS count
       FROM tool_uses tu
       ${dateConditions.length > 0 ? "JOIN sessions s ON tu.session_id = s.id " + whereClause : ""}
       GROUP BY tu.tool_name
       ORDER BY count DESC`,
    )
    .all(bindings) as { tool_name: string; count: number }[];

  // Conversation lengths
  const conversationLengths = db
    .prepare(
      `SELECT
         CASE
           WHEN s.message_count <= 10 THEN '1-10'
           WHEN s.message_count <= 25 THEN '11-25'
           WHEN s.message_count <= 50 THEN '26-50'
           WHEN s.message_count <= 100 THEN '51-100'
           ELSE '100+'
         END AS bucket,
         COUNT(*) AS count
       FROM sessions s
       ${whereClause}
       GROUP BY bucket
       ORDER BY MIN(s.message_count)`,
    )
    .all(bindings) as { bucket: string; count: number }[];

  // Branch breakdown
  const branchBreakdown = db
    .prepare(
      `SELECT s.git_branch AS branch, COUNT(*) AS count
       FROM sessions s
       ${whereClause.length > 0 ? whereClause + " AND s.git_branch IS NOT NULL" : "WHERE s.git_branch IS NOT NULL"}
       GROUP BY s.git_branch
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(bindings) as { branch: string; count: number }[];

  return {
    summary,
    sessions_over_time: sessionsOverTime,
    tool_breakdown: toolBreakdown,
    project_breakdown: projectBreakdown,
    tool_usage: toolUsage,
    conversation_lengths: conversationLengths,
    branch_breakdown: branchBreakdown,
  };
}
