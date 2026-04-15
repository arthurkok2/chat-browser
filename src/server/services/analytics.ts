import { DatabaseSync } from "node:sqlite";
import type { AnalyticsData } from "../types.js";
import { decodeProject } from "./projectDecoder.js";

export interface AnalyticsParams {
  period: "7d" | "30d" | "90d" | "all";
  project?: string;   // optional project filter (encoded name)
  now?: number;       // override current time (ms), used in tests
}

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function periodDays(period: string): number {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  return -1; // all time
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function getAnalytics(db: DatabaseSync, params: AnalyticsParams): AnalyticsData {
  const now = params.now ?? Date.now();
  const days = periodDays(params.period);

  const thisStart = days === -1 ? 0 : now - days * 86_400_000;
  const prevStart = days === -1 ? 0 : now - 2 * days * 86_400_000;
  const prevEnd   = days === -1 ? 0 : thisStart;

  const projectFilter = params.project ? "AND s.project = ?" : "";
  const projectArg = params.project ?? null;

  // ── Pulse ────────────────────────────────────────────────────────────────

  const sessionsThis = (db.prepare(
    `SELECT id, started_at, ended_at FROM sessions s
     WHERE s.is_subagent = 0 AND s.ended_at >= ? ${projectFilter}`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { id: string; started_at: number; ended_at: number }[]);

  const sessionsPrev = days === -1 ? [] : (db.prepare(
    `SELECT id, started_at, ended_at FROM sessions s
     WHERE s.is_subagent = 0 AND s.ended_at >= ? AND s.ended_at < ? ${projectFilter}`
  ).all(...([prevStart, prevEnd, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { id: string; started_at: number; ended_at: number }[]);

  const hoursThis = sessionsThis.reduce((sum, s) => {
    if (s.ended_at && s.started_at) return sum + (s.ended_at - s.started_at);
    return sum;
  }, 0) / 3_600_000;

  const hoursPrev = sessionsPrev.reduce((sum, s) => {
    if (s.ended_at && s.started_at) return sum + (s.ended_at - s.started_at);
    return sum;
  }, 0) / 3_600_000;

  const avgPerDayThis = days === -1 ? sessionsThis.length : sessionsThis.length / days;
  const avgPerDayPrev = days === -1 ? sessionsPrev.length : sessionsPrev.length / days;

  const dailyThisRows = (db.prepare(
    `SELECT date(s.ended_at / 1000, 'unixepoch') AS date, COUNT(*) AS count
     FROM sessions s WHERE s.is_subagent = 0 AND s.ended_at >= ? ${projectFilter}
     GROUP BY date ORDER BY date`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { date: string; count: number }[]);

  const dailyPrevRows = days === -1 ? [] : (db.prepare(
    `SELECT date(s.ended_at / 1000, 'unixepoch') AS date, COUNT(*) AS count
     FROM sessions s WHERE s.is_subagent = 0 AND s.ended_at >= ? AND s.ended_at < ? ${projectFilter}
     GROUP BY date ORDER BY date`
  ).all(...([prevStart, prevEnd, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { date: string; count: number }[]);

  const dowCounts = (db.prepare(
    `SELECT strftime('%w', ended_at / 1000, 'unixepoch') AS dow, COUNT(*) AS count
     FROM sessions WHERE is_subagent = 0 AND ended_at IS NOT NULL
     GROUP BY dow ORDER BY count DESC LIMIT 1`
  ).get() as { dow: string; count: number } | undefined);
  const mostActiveDow = dowCounts ? DOW_LABELS[Number(dowCounts.dow)] : "N/A";

  // ── Breakdown ─────────────────────────────────────────────────────────────

  const projectRows = (db.prepare(
    `SELECT s.project, COUNT(*) AS sessions,
            SUM(CASE WHEN s.ended_at IS NOT NULL AND s.started_at IS NOT NULL THEN (s.ended_at - s.started_at) ELSE 0 END) AS duration_ms
     FROM sessions s
     WHERE s.is_subagent = 0 AND s.project IS NOT NULL AND s.ended_at >= ? ${projectFilter}
     GROUP BY s.project ORDER BY sessions DESC LIMIT 10`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { project: string; sessions: number; duration_ms: number }[]);

  const branchRows = (db.prepare(
    `SELECT s.git_branch AS branch, COUNT(*) AS sessions
     FROM sessions s
     WHERE s.is_subagent = 0 AND s.git_branch IS NOT NULL AND s.ended_at >= ? ${projectFilter}
     GROUP BY s.git_branch ORDER BY sessions DESC LIMIT 10`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { branch: string; sessions: number }[]);

  const toolSplitRows = (db.prepare(
    `SELECT s.tool, COUNT(*) AS sessions
     FROM sessions s WHERE s.is_subagent = 0 AND s.ended_at >= ? ${projectFilter}
     GROUP BY s.tool ORDER BY sessions DESC`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as (string | number)[])) as { tool: string; sessions: number }[]);

  // ── Behavior ──────────────────────────────────────────────────────────────

  const durationValues: number[] = [];
  const autonomyValues: number[] = [];
  const depthValues: number[] = [];

  if (sessionsThis.length > 0) {
    for (const session of sessionsThis) {
      if (session.ended_at && session.started_at) {
        durationValues.push(session.ended_at - session.started_at);
      }
      const msgRow = (db.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN type IN ('tool_use', 'tool_result') THEN 1 ELSE 0 END) AS tool_msgs,
           SUM(CASE WHEN role = 'user' AND type = 'text' THEN 1 ELSE 0 END) AS user_msgs
         FROM messages WHERE session_id = ?`
      ).get(session.id) as unknown as { total: number; tool_msgs: number; user_msgs: number } | undefined);

      if (msgRow && msgRow.total > 0) {
        autonomyValues.push((msgRow.tool_msgs / msgRow.total) * 100);
        depthValues.push(msgRow.user_msgs);
      }
    }
  }

  const avgDurationMs = median(durationValues);
  const avgAutonomyPct = autonomyValues.length > 0
    ? autonomyValues.reduce((a, b) => a + b, 0) / autonomyValues.length
    : 0;
  const avgDepth = median(depthValues);

  const durationHist = [
    { bucket: "<5m",    min: 0,          max: 5 * 60_000 },
    { bucket: "5–15m",  min: 5 * 60_000,  max: 15 * 60_000 },
    { bucket: "15–30m", min: 15 * 60_000, max: 30 * 60_000 },
    { bucket: "30–60m", min: 30 * 60_000, max: 60 * 60_000 },
    { bucket: "60m+",   min: 60 * 60_000, max: Infinity },
  ].map(b => ({ bucket: b.bucket, count: durationValues.filter(d => d >= b.min && d < b.max).length }));

  const autonomyHist = [
    { bucket: "0–20%",   min: 0,  max: 20 },
    { bucket: "20–40%",  min: 20, max: 40 },
    { bucket: "40–60%",  min: 40, max: 60 },
    { bucket: "60–80%",  min: 60, max: 80 },
    { bucket: "80–100%", min: 80, max: 101 },
  ].map(b => ({ bucket: b.bucket, count: autonomyValues.filter(v => v >= b.min && v < b.max).length }));

  const depthHist = [
    { bucket: "1–10",   min: 1,   max: 11 },
    { bucket: "11–25",  min: 11,  max: 26 },
    { bucket: "26–50",  min: 26,  max: 51 },
    { bucket: "51–100", min: 51,  max: 101 },
    { bucket: "100+",   min: 101, max: Infinity },
  ].map(b => ({ bucket: b.bucket, count: depthValues.filter(v => v >= b.min && v < b.max).length }));

  // ── Temporal ──────────────────────────────────────────────────────────────

  const hourRows = (db.prepare(
    `SELECT CAST(strftime('%H', ended_at / 1000, 'unixepoch') AS INTEGER) AS hour,
            COUNT(*) AS count, tool
     FROM sessions WHERE is_subagent = 0 AND ended_at IS NOT NULL
     GROUP BY hour, tool`
  ).all() as { hour: number; count: number; tool: string }[]);

  const byHour: { hour: number; count: number; dominant_tool: string }[] = [];
  for (let h = 0; h < 24; h++) {
    const rows = hourRows.filter(r => r.hour === h);
    const total = rows.reduce((s, r) => s + r.count, 0);
    const dominant = [...rows].sort((a, b) => b.count - a.count)[0]?.tool ?? "claude";
    byHour.push({ hour: h, count: total, dominant_tool: dominant });
  }

  const dowRows = (db.prepare(
    `SELECT CAST(strftime('%w', ended_at / 1000, 'unixepoch') AS INTEGER) AS dow,
            COUNT(*) AS count
     FROM sessions WHERE is_subagent = 0 AND ended_at IS NOT NULL
     GROUP BY dow`
  ).all() as { dow: number; count: number }[]);

  const byDow = Array.from({ length: 7 }, (_, i) => ({
    dow: i,
    label: DOW_LABELS[i],
    count: dowRows.find(r => r.dow === i)?.count ?? 0,
  }));

  const heatmapStart = now - 364 * 86_400_000;
  const heatmapRows = (db.prepare(
    `SELECT date(ended_at / 1000, 'unixepoch') AS date, COUNT(*) AS count
     FROM sessions WHERE is_subagent = 0 AND ended_at >= ?
     GROUP BY date`
  ).all(heatmapStart) as { date: string; count: number }[]);

  const heatmapMap = new Map(heatmapRows.map(r => [r.date, r.count]));
  const heatmap: { date: string; count: number }[] = [];
  for (let i = 363; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    heatmap.push({ date: dateStr, count: heatmapMap.get(dateStr) ?? 0 });
  }

  return {
    pulse: {
      period_days: days,
      sessions_this: sessionsThis.length,
      sessions_prev: sessionsPrev.length,
      avg_per_day_this: avgPerDayThis,
      avg_per_day_prev: avgPerDayPrev,
      hours_this: hoursThis,
      hours_prev: hoursPrev,
      most_active_dow: mostActiveDow,
      daily_counts: dailyThisRows,
      daily_counts_prev: dailyPrevRows,
    },
    breakdown: {
      projects: projectRows.map(r => ({
        project: r.project,
        decoded: decodeProject(r.project) ?? r.project,
        sessions: r.sessions,
        hours: r.duration_ms / 3_600_000,
      })),
      branches: branchRows,
      tool_split: toolSplitRows,
    },
    behavior: {
      avg_duration_ms: avgDurationMs,
      avg_autonomy_pct: avgAutonomyPct,
      avg_depth: avgDepth,
      duration_hist: durationHist,
      autonomy_hist: autonomyHist,
      depth_hist: depthHist,
    },
    temporal: {
      by_hour: byHour,
      by_dow: byDow,
      heatmap,
    },
  };
}
