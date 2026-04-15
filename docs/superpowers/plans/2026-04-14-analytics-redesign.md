# Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current analytics page with a four-section dashboard covering activity pulse, work breakdown, conversation behavior, and temporal patterns.

**Architecture:** New `getAnalytics()` service returns a fully restructured response keyed by dashboard section. A `decodeProject()` utility converts encoded directory names to readable paths. Four new chart components replace the three old ones and are wired together in a rewritten `Analytics.tsx`.

**Tech Stack:** Node.js 22+ / node:sqlite, Express 5, React 19, Recharts 2, Tailwind CSS 4, Vitest.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/server/types.ts` | Replace `AnalyticsData` interface |
| Create | `src/server/services/projectDecoder.ts` | Decode encoded project names |
| Modify | `src/server/services/analytics.ts` | All new queries, new response shape |
| Modify | `src/server/api/analytics.ts` | Accept `period` param (7d/30d/90d/all) |
| Modify | `src/client/hooks/useAnalytics.ts` | New response types, period param |
| Create | `src/client/components/charts/ActivityPulse.tsx` | Stat cards + sparkline |
| Create | `src/client/components/charts/WorkBreakdown.tsx` | Projects, branches, tool split |
| Create | `src/client/components/charts/BehaviorStats.tsx` | Avg cards + histograms |
| Create | `src/client/components/charts/TemporalPatterns.tsx` | Hour/dow charts + heatmap |
| Modify | `src/client/pages/Analytics.tsx` | Wire all sections together |
| Delete | `src/client/components/charts/SessionsOverTime.tsx` | Replaced by ActivityPulse |
| Delete | `src/client/components/charts/ToolUsage.tsx` | Replaced by WorkBreakdown |
| Delete | `src/client/components/charts/ProjectBreakdown.tsx` | Replaced by WorkBreakdown |
| Modify | `test/api.test.ts` | Fix better-sqlite3 → node:sqlite, add new analytics tests |
| Create | `test/projectDecoder.test.ts` | Unit tests for name decoder |

---

## Task 1: Fix test infrastructure (better-sqlite3 → node:sqlite)

The existing test file imports `better-sqlite3` which was removed from the project. Fix it before adding new tests.

**Files:**
- Modify: `test/api.test.ts`

- [ ] **Step 1: Replace the import and db setup**

Open `test/api.test.ts`. Replace the top of the file:

```typescript
// OLD:
import Database from "better-sqlite3";
// ...
let db: Database.Database;
// ...
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createSchema(db);
});
afterEach(() => {
  db.close();
});
```

```typescript
// NEW:
import { DatabaseSync } from "node:sqlite";
// ...
let db: DatabaseSync;
// ...
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
});
afterEach(() => {
  db.close();
});
```

- [ ] **Step 2: Fix helper functions to use node:sqlite syntax**

In `test/api.test.ts`, change every `.run({...named...})` in `insertSession`, `insertMessage`, `insertToolUse` to use positional `?` params with `.run(val1, val2, ...)`, and cast `.get()` results with `as unknown as T`:

```typescript
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSchema } from "../src/server/db/schema.js";
import { getAnalytics } from "../src/server/services/analytics.js";
import { exportSession, exportSessions, exportAnalytics } from "../src/server/services/export.js";

let db: DatabaseSync;

function insertSession(
  id: string, tool: string, project: string | null, branch: string | null,
  startedAt: number | null, messageCount: number, endedAt?: number | null
) {
  db.prepare(
    `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file, is_subagent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(id, tool, project, "/test", branch, startedAt, endedAt ?? (startedAt ? startedAt + 60000 : null), messageCount, `/test/${id}.jsonl`);
}

function insertMessage(
  sessionId: string, role: string, content: string,
  type: string = "text", tokenEstimate: number | null = null
) {
  const estimate = tokenEstimate ?? Math.ceil(content.length / 4);
  db.prepare(
    `INSERT INTO messages (session_id, role, content, type, token_estimate) VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, role, content, type, estimate);
}

function insertToolUse(messageId: number, sessionId: string, toolName: string, filePath: string | null = null) {
  db.prepare(
    `INSERT INTO tool_uses (message_id, session_id, tool_name, file_path) VALUES (?, ?, ?, ?)`
  ).run(messageId, sessionId, toolName, filePath);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
});

afterEach(() => {
  db.close();
});
```

- [ ] **Step 3: Run tests to verify they still pass**

```bash
npm test
```

Expected: all existing tests pass (they may have been skipped before due to the import error).

- [ ] **Step 4: Commit**

```bash
git add test/api.test.ts
git commit -m "fix: migrate test helpers from better-sqlite3 to node:sqlite"
```

---

## Task 2: Project name decoder utility

**Files:**
- Create: `src/server/services/projectDecoder.ts`
- Create: `test/projectDecoder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/projectDecoder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { decodeProject } from "../src/server/services/projectDecoder.js";

describe("decodeProject", () => {
  it("decodes a simple two-segment path", () => {
    expect(decodeProject("C--Dayforce-tip")).toBe("Dayforce/tip");
  });

  it("decodes a deeper path", () => {
    expect(decodeProject("C--Dayforce-ideal-ic-webapp-dayforce")).toBe("Dayforce/ideal-ic-webapp-dayforce");
  });

  it("strips leading user path segments", () => {
    expect(decodeProject("C--Users-P11F8A4-Documents-myproject")).toBe("myproject");
  });

  it("decodes lowercase drive letter", () => {
    expect(decodeProject("c--Dayforce-candidate-common-ui")).toBe("candidate-common-ui");
  });

  it("returns single segment as-is", () => {
    expect(decodeProject("myrepo")).toBe("myrepo");
  });

  it("returns null input as null", () => {
    expect(decodeProject(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test test/projectDecoder.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement decoder**

Create `src/server/services/projectDecoder.ts`:

```typescript
/**
 * Decodes a Claude project directory name (encoded path) into a readable string.
 *
 * Encoding scheme: path separators become "--", e.g.
 *   C:\Dayforce\tip  →  C--Dayforce-tip
 *   C:\Users\P11F8A4\Documents\myproject  →  C--Users-P11F8A4-Documents-myproject
 *
 * Decoding rules:
 * 1. Split on "--" to get path segments
 * 2. Drop the drive letter segment (single character)
 * 3. Drop "Users" + username segments if present
 * 4. Join remaining segments with "/"
 */
export function decodeProject(encoded: string | null): string | null {
  if (!encoded) return null;

  const segments = encoded.split("--");

  // Drop single-char drive letter (C, c, D, etc.)
  const withoutDrive = segments[0].length <= 1 ? segments.slice(1) : segments;

  // Drop leading "Users/<name>/..." pattern (first segment is "Users")
  const normalized =
    withoutDrive[0]?.toLowerCase() === "users"
      ? withoutDrive.slice(2) // drop "Users" and the username
      : withoutDrive;

  if (normalized.length === 0) return encoded;
  if (normalized.length === 1) return normalized[0];

  // First segment is the top-level dir (e.g. "Dayforce"), rest is the project name
  return normalized.join("/");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test test/projectDecoder.test.ts
```

Expected: 6 passing

- [ ] **Step 5: Commit**

```bash
git add src/server/services/projectDecoder.ts test/projectDecoder.test.ts
git commit -m "feat: add project name decoder utility"
```

---

## Task 3: New AnalyticsData type

**Files:**
- Modify: `src/server/types.ts`

- [ ] **Step 1: Replace the AnalyticsData interface**

In `src/server/types.ts`, replace the existing `AnalyticsData` interface:

```typescript
export interface AnalyticsData {
  pulse: {
    period_days: number;                              // 7, 30, 90, or -1 for all
    sessions_this: number;
    sessions_prev: number;
    avg_per_day_this: number;
    avg_per_day_prev: number;
    hours_this: number;
    hours_prev: number;
    most_active_dow: string;                          // e.g. "Monday"
    daily_counts: { date: string; count: number }[];  // this period
    daily_counts_prev: { date: string; count: number }[]; // previous period
  };
  breakdown: {
    projects: { project: string; decoded: string; sessions: number; hours: number }[];
    branches: { branch: string; sessions: number }[];
    tool_split: { tool: string; sessions: number }[];
  };
  behavior: {
    avg_duration_ms: number;
    avg_autonomy_pct: number;
    avg_depth: number;
    duration_hist: { bucket: string; count: number }[];
    autonomy_hist: { bucket: string; count: number }[];
    depth_hist: { bucket: string; count: number }[];
  };
  temporal: {
    by_hour: { hour: number; count: number; dominant_tool: string }[];
    by_dow: { dow: number; label: string; count: number }[];
    heatmap: { date: string; count: number }[];       // always last 52 weeks
  };
}
```

- [ ] **Step 2: Remove the now-unused `AnalyticsParams` export from `analytics.ts`**

The `AnalyticsParams` interface in `src/server/services/analytics.ts` will be replaced in Task 4. No separate commit needed — this will be committed with Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/server/types.ts
git commit -m "feat: define new AnalyticsData type for redesigned dashboard"
```

---

## Task 4: New analytics service

**Files:**
- Modify: `src/server/services/analytics.ts`
- Modify: `test/api.test.ts` (add new analytics tests)

- [ ] **Step 1: Write failing tests for new getAnalytics**

Add to `test/api.test.ts` after the existing `describe("getAnalytics", ...)` block:

```typescript
describe("getAnalytics (new)", () => {
  const NOW = 1744000000000; // fixed "now" for deterministic tests

  it("pulse: sessions_this counts sessions in period", () => {
    // 3 sessions within last 7 days, 1 outside
    insertSession("s1", "claude", "P", null, NOW - 1 * 86400_000, 5, NOW - 1 * 86400_000 + 300_000);
    insertSession("s2", "claude", "P", null, NOW - 3 * 86400_000, 3, NOW - 3 * 86400_000 + 120_000);
    insertSession("s3", "copilot", "P", null, NOW - 6 * 86400_000, 2, NOW - 6 * 86400_000 + 60_000);
    insertSession("s4", "claude", "P", null, NOW - 10 * 86400_000, 1, NOW - 10 * 86400_000 + 30_000);

    const result = getAnalytics(db, { period: "7d", now: NOW });
    expect(result.pulse.sessions_this).toBe(3);
    expect(result.pulse.sessions_prev).toBe(1); // s4 falls in prev 7d window
  });

  it("pulse: hours_this sums session durations", () => {
    // session lasting exactly 1 hour
    insertSession("s1", "claude", "P", null, NOW - 1 * 86400_000, 5, NOW - 1 * 86400_000 + 3_600_000);
    const result = getAnalytics(db, { period: "7d", now: NOW });
    expect(result.pulse.hours_this).toBeCloseTo(1, 1);
  });

  it("breakdown: decodes project names", () => {
    insertSession("s1", "claude", "C--Dayforce-tip", null, NOW - 1 * 86400_000, 3, NOW - 1 * 86400_000 + 60_000);
    const result = getAnalytics(db, { period: "7d", now: NOW });
    expect(result.breakdown.projects[0].decoded).toBe("Dayforce/tip");
  });

  it("behavior: autonomy_pct is ratio of tool messages", () => {
    insertSession("s1", "claude", "P", null, NOW - 1 * 86400_000, 6, NOW - 1 * 86400_000 + 60_000);
    // 3 text, 3 tool_use = 50% autonomy
    insertMessage("s1", "user", "hello", "text");
    insertMessage("s1", "assistant", "thinking", "text");
    insertMessage("s1", "assistant", "", "tool_use");
    insertMessage("s1", "user", "", "tool_result");
    insertMessage("s1", "assistant", "", "tool_use");
    insertMessage("s1", "user", "", "tool_result");

    const result = getAnalytics(db, { period: "7d", now: NOW });
    expect(result.behavior.avg_autonomy_pct).toBeCloseTo(66.67, 0);
  });

  it("temporal: by_hour has 24 entries", () => {
    const result = getAnalytics(db, { period: "7d", now: NOW });
    expect(result.temporal.by_hour).toHaveLength(24);
  });

  it("temporal: heatmap has 364 entries (52 weeks)", () => {
    const result = getAnalytics(db, { period: "7d", now: NOW });
    expect(result.temporal.heatmap).toHaveLength(364);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test test/api.test.ts
```

Expected: new tests FAIL ("getAnalytics does not accept period/now params")

- [ ] **Step 3: Rewrite the analytics service**

Replace the entire contents of `src/server/services/analytics.ts`:

```typescript
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
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as unknown[])) as { id: string; started_at: number; ended_at: number }[]);

  const sessionsPrev = days === -1 ? [] : (db.prepare(
    `SELECT id, started_at, ended_at FROM sessions s
     WHERE s.is_subagent = 0 AND s.ended_at >= ? AND s.ended_at < ? ${projectFilter}`
  ).all(...([prevStart, prevEnd, ...(projectArg ? [projectArg] : [])] as unknown[])) as { id: string; started_at: number; ended_at: number }[]);

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

  // Daily counts — this period
  const dailyThisRows = (db.prepare(
    `SELECT date(s.ended_at / 1000, 'unixepoch') AS date, COUNT(*) AS count
     FROM sessions s WHERE s.is_subagent = 0 AND s.ended_at >= ? ${projectFilter}
     GROUP BY date ORDER BY date`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as unknown[])) as { date: string; count: number }[]);

  const dailyPrevRows = days === -1 ? [] : (db.prepare(
    `SELECT date(s.ended_at / 1000, 'unixepoch') AS date, COUNT(*) AS count
     FROM sessions s WHERE s.is_subagent = 0 AND s.ended_at >= ? AND s.ended_at < ? ${projectFilter}
     GROUP BY date ORDER BY date`
  ).all(...([prevStart, prevEnd, ...(projectArg ? [projectArg] : [])] as unknown[])) as { date: string; count: number }[]);

  // Most active day of week (all time, unaffected by period)
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
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as unknown[])) as { project: string; sessions: number; duration_ms: number }[]);

  const branchRows = (db.prepare(
    `SELECT s.git_branch AS branch, COUNT(*) AS sessions
     FROM sessions s
     WHERE s.is_subagent = 0 AND s.git_branch IS NOT NULL AND s.ended_at >= ? ${projectFilter}
     GROUP BY s.git_branch ORDER BY sessions DESC LIMIT 10`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as unknown[])) as { branch: string; sessions: number }[]);

  const toolSplitRows = (db.prepare(
    `SELECT s.tool, COUNT(*) AS sessions
     FROM sessions s WHERE s.is_subagent = 0 AND s.ended_at >= ? ${projectFilter}
     GROUP BY s.tool ORDER BY sessions DESC`
  ).all(...([thisStart, ...(projectArg ? [projectArg] : [])] as unknown[])) as { tool: string; sessions: number }[]);

  // ── Behavior ──────────────────────────────────────────────────────────────

  // Per-session: duration, depth (user text messages), autonomy (tool msg %)
  const sessionIds = sessionsThis.map(s => s.id);

  let avgDurationMs = 0;
  let avgAutonomyPct = 0;
  let avgDepth = 0;
  const durationValues: number[] = [];
  const autonomyValues: number[] = [];
  const depthValues: number[] = [];

  if (sessionIds.length > 0) {
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
    avgDurationMs = median(durationValues);
    avgAutonomyPct = autonomyValues.length > 0
      ? autonomyValues.reduce((a, b) => a + b, 0) / autonomyValues.length
      : 0;
    avgDepth = median(depthValues);
  }

  // Duration histogram
  const durationHist = [
    { bucket: "<5m",    min: 0,         max: 5 * 60_000 },
    { bucket: "5–15m",  min: 5 * 60_000, max: 15 * 60_000 },
    { bucket: "15–30m", min: 15 * 60_000, max: 30 * 60_000 },
    { bucket: "30–60m", min: 30 * 60_000, max: 60 * 60_000 },
    { bucket: "60m+",   min: 60 * 60_000, max: Infinity },
  ].map(b => ({
    bucket: b.bucket,
    count: durationValues.filter(d => d >= b.min && d < b.max).length,
  }));

  // Autonomy histogram
  const autonomyHist = [
    { bucket: "0–20%",   min: 0,  max: 20 },
    { bucket: "20–40%",  min: 20, max: 40 },
    { bucket: "40–60%",  min: 40, max: 60 },
    { bucket: "60–80%",  min: 60, max: 80 },
    { bucket: "80–100%", min: 80, max: 101 },
  ].map(b => ({
    bucket: b.bucket,
    count: autonomyValues.filter(v => v >= b.min && v < b.max).length,
  }));

  // Depth histogram
  const depthHist = [
    { bucket: "1–10",   min: 1,   max: 11 },
    { bucket: "11–25",  min: 11,  max: 26 },
    { bucket: "26–50",  min: 26,  max: 51 },
    { bucket: "51–100", min: 51,  max: 101 },
    { bucket: "100+",   min: 101, max: Infinity },
  ].map(b => ({
    bucket: b.bucket,
    count: depthValues.filter(v => v >= b.min && v < b.max).length,
  }));

  // ── Temporal ──────────────────────────────────────────────────────────────

  // Hour of day (0–23) with dominant tool
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
    const dominant = rows.sort((a, b) => b.count - a.count)[0]?.tool ?? "claude";
    byHour.push({ hour: h, count: total, dominant_tool: dominant });
  }

  // Day of week (0=Sun, 6=Sat)
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

  // Heatmap: last 364 days (52 weeks), always full range regardless of period
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
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all new analytics tests pass

- [ ] **Step 5: Commit**

```bash
git add src/server/services/analytics.ts test/api.test.ts
git commit -m "feat: rewrite analytics service with pulse/breakdown/behavior/temporal sections"
```

---

## Task 5: Update analytics API handler

**Files:**
- Modify: `src/server/api/analytics.ts`

- [ ] **Step 1: Update the handler to accept `period` and `project` params**

Replace `src/server/api/analytics.ts`:

```typescript
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
```

- [ ] **Step 2: Verify server starts without errors**

```bash
npm test
```

Expected: all tests still pass

- [ ] **Step 3: Commit**

```bash
git add src/server/api/analytics.ts
git commit -m "feat: update analytics API to accept period and project params"
```

---

## Task 6: Update useAnalytics hook

**Files:**
- Modify: `src/client/hooks/useAnalytics.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useState, useEffect } from "react";
import type { AnalyticsData } from "../../server/types.js";

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

interface AnalyticsParams {
  period: AnalyticsPeriod;
  project?: string;
}

interface AnalyticsState {
  data: AnalyticsData | null;
  loading: boolean;
}

export function useAnalytics(params: AnalyticsParams): AnalyticsState {
  const [state, setState] = useState<AnalyticsState>({ data: null, loading: true });

  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));
    const sp = new URLSearchParams({ period: params.period });
    if (params.project) sp.set("project", params.project);

    fetch(`/api/analytics?${sp}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch analytics");
        return res.json();
      })
      .then((data: AnalyticsData) => setState({ data, loading: false }))
      .catch(() => setState((prev) => ({ ...prev, loading: false })));
  }, [params.period, params.project]);

  return state;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/hooks/useAnalytics.ts
git commit -m "feat: update useAnalytics hook for new period-based API"
```

---

## Task 7: ActivityPulse component

**Files:**
- Create: `src/client/components/charts/ActivityPulse.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { AnalyticsData, AnalyticsPeriod } from "../../hooks/useAnalytics.js";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  pulse: AnalyticsData["pulse"];
  period: AnalyticsPeriod;
  onPeriodChange: (p: AnalyticsPeriod) => void;
}

function delta(current: number, prev: number): { label: string; positive: boolean } | null {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: { label: string; positive: boolean } | null }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${sub.positive ? "text-emerald-400" : "text-rose-400"}`}>
          {sub.label} vs prev period
        </div>
      )}
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

export default function ActivityPulse({ pulse, period, onPeriodChange }: Props) {
  const PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d", "all"];

  // Merge this + prev daily counts for sparkline
  const prevMap = new Map(pulse.daily_counts_prev.map(d => [d.date, d.count]));
  const chartData = pulse.daily_counts.map(d => ({
    date: d.date,
    this: d.count,
    prev: prevMap.get(d.date) ?? 0,
  }));

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              period === p
                ? "bg-violet-700 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
            }`}
          >
            {p === "all" ? "All time" : p}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Sessions"
          value={String(pulse.sessions_this)}
          sub={delta(pulse.sessions_this, pulse.sessions_prev)}
        />
        <StatCard
          label="Avg / day"
          value={pulse.avg_per_day_this.toFixed(1)}
          sub={delta(pulse.avg_per_day_this, pulse.avg_per_day_prev)}
        />
        <StatCard
          label="Estimated hours"
          value={formatHours(pulse.hours_this)}
          sub={delta(pulse.hours_this, pulse.hours_prev)}
        />
        <StatCard
          label="Most active day"
          value={pulse.most_active_dow}
        />
      </div>

      {/* Sparkline */}
      {chartData.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Daily sessions</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="this" fill="#7c3aed" radius={[3, 3, 0, 0]} name="This period" />
              <Line dataKey="prev" stroke="#475569" strokeWidth={1.5} dot={false} name="Prev period" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/charts/ActivityPulse.tsx
git commit -m "feat: add ActivityPulse chart component"
```

---

## Task 8: WorkBreakdown component

**Files:**
- Create: `src/client/components/charts/WorkBreakdown.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { AnalyticsData } from "../../hooks/useAnalytics.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

interface Props {
  breakdown: AnalyticsData["breakdown"];
  onProjectClick?: (project: string) => void;
}

const TOOL_COLORS: Record<string, string> = {
  claude:  "#7c3aed",
  copilot: "#059669",
  codex:   "#0284c7",
};

export default function WorkBreakdown({ breakdown, onProjectClick }: Props) {
  const projectData = breakdown.projects.map(p => ({
    name: p.decoded,
    encoded: p.project,
    sessions: p.sessions,
    hours: Number(p.hours.toFixed(1)),
  }));

  const branchData = breakdown.branches.map(b => ({
    name: b.branch,
    sessions: b.sessions,
  }));

  const totalSessions = breakdown.tool_split.reduce((s, t) => s + t.sessions, 0);

  return (
    <div className="space-y-4">
      {/* Projects + Branches side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Projects — 3/5 width */}
        <div className="lg:col-span-3 bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Top projects</h3>
          {projectData.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, projectData.length * 32)}>
              <BarChart data={projectData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category" dataKey="name" width={140}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={v => v.length > 20 ? v.slice(0, 19) + "…" : v}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(value, name) => [value, name === "sessions" ? "Sessions" : "Hours"]}
                />
                <Bar
                  dataKey="sessions" fill="#7c3aed" radius={[0, 4, 4, 0]}
                  cursor={onProjectClick ? "pointer" : "default"}
                  onClick={(d) => onProjectClick?.(d.encoded)}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Branches — 2/5 width */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Top branches</h3>
          {branchData.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, branchData.length * 32)}>
              <BarChart data={branchData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category" dataKey="name" width={120}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={v => v.length > 18 ? v.slice(0, 17) + "…" : v}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Bar dataKey="sessions" fill="#0284c7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tool split stacked bar */}
      {breakdown.tool_split.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Tool split</h3>
          <div className="flex rounded-lg overflow-hidden h-8">
            {breakdown.tool_split.map(t => (
              <div
                key={t.tool}
                style={{
                  width: `${(t.sessions / totalSessions) * 100}%`,
                  backgroundColor: TOOL_COLORS[t.tool] ?? "#475569",
                }}
                className="flex items-center justify-center text-xs font-medium text-white whitespace-nowrap px-2 overflow-hidden"
                title={`${t.tool}: ${t.sessions} sessions`}
              >
                {(t.sessions / totalSessions) * 100 > 12 ? `${t.tool} · ${t.sessions}` : ""}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2">
            {breakdown.tool_split.map(t => (
              <div key={t.tool} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TOOL_COLORS[t.tool] ?? "#475569" }} />
                {t.tool} · {t.sessions}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/charts/WorkBreakdown.tsx
git commit -m "feat: add WorkBreakdown chart component"
```

---

## Task 9: BehaviorStats component

**Files:**
- Create: `src/client/components/charts/BehaviorStats.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { AnalyticsData } from "../../hooks/useAnalytics.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  behavior: AnalyticsData["behavior"];
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function AvgCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function MiniHistogram({ data, color }: { data: { bucket: string; count: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 10 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
          labelStyle={{ color: "#e2e8f0" }}
          itemStyle={{ color: "#e2e8f0" }}
        />
        <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function BehaviorStats({ behavior }: Props) {
  return (
    <div className="space-y-4">
      {/* Avg stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <AvgCard
          label="Avg session duration"
          value={formatDuration(behavior.avg_duration_ms)}
          sub="Median across sessions"
        />
        <AvgCard
          label="Avg autonomy ratio"
          value={`${behavior.avg_autonomy_pct.toFixed(0)}%`}
          sub="Tool msgs / total msgs"
        />
        <AvgCard
          label="Avg depth"
          value={String(Math.round(behavior.avg_depth))}
          sub="Median user messages / session"
        />
      </div>

      {/* Histograms */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Session duration</h3>
          <MiniHistogram data={behavior.duration_hist} color="#7c3aed" />
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Autonomy ratio</h3>
          <MiniHistogram data={behavior.autonomy_hist} color="#0284c7" />
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Session depth</h3>
          <MiniHistogram data={behavior.depth_hist} color="#059669" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/charts/BehaviorStats.tsx
git commit -m "feat: add BehaviorStats chart component"
```

---

## Task 10: TemporalPatterns component

**Files:**
- Create: `src/client/components/charts/TemporalPatterns.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { AnalyticsData } from "../../hooks/useAnalytics.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { useState } from "react";

interface Props {
  temporal: AnalyticsData["temporal"];
}

const TOOL_COLORS: Record<string, string> = {
  claude:  "#7c3aed",
  copilot: "#059669",
  codex:   "#0284c7",
};

// Heatmap: 52 weeks × 7 days grid using divs
function ActivityHeatmap({ heatmap }: { heatmap: { date: string; count: number }[] }) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  // Find max count for color scaling
  const maxCount = Math.max(...heatmap.map(d => d.count), 1);

  function cellColor(count: number): string {
    if (count === 0) return "#1e293b";
    const intensity = count / maxCount;
    if (intensity < 0.25) return "#4c1d95";
    if (intensity < 0.5)  return "#6d28d9";
    if (intensity < 0.75) return "#7c3aed";
    return "#a78bfa";
  }

  // Group into weeks (columns of 7)
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < heatmap.length; i += 7) {
    weeks.push(heatmap.slice(i, i + 7));
  }

  const DOW_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="relative">
      <div className="flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          {DOW_ABBR.map((d, i) => (
            <div key={i} className="h-3 w-5 text-[9px] text-slate-500 flex items-center">{d}</div>
          ))}
        </div>
        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day, di) => (
              <div
                key={di}
                className="w-3 h-3 rounded-sm cursor-default"
                style={{ backgroundColor: cellColor(day.count) }}
                onMouseEnter={(e) => {
                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                  setTooltip({ date: day.date, count: day.count, x: rect.left, y: rect.top });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ))}
      </div>
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 pointer-events-none"
          style={{ left: tooltip.x + 16, top: tooltip.y - 8 }}
        >
          {tooltip.date} · {tooltip.count} session{tooltip.count !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

export default function TemporalPatterns({ temporal }: Props) {
  return (
    <div className="space-y-4">
      {/* Hour + DoW side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Hour of day</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={temporal.by_hour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }}
                tickFormatter={h => `${h}h`} interval={3} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
                labelFormatter={h => `${h}:00`}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {temporal.by_hour.map((entry, i) => (
                  <Cell key={i} fill={TOOL_COLORS[entry.dominant_tool] ?? "#7c3aed"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Day of week</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={temporal.by_dow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={l => l.slice(0, 3)} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity heatmap */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Activity — last 52 weeks</h3>
        <ActivityHeatmap heatmap={temporal.heatmap} />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-slate-500">Less</span>
          {["#1e293b", "#4c1d95", "#6d28d9", "#7c3aed", "#a78bfa"].map(c => (
            <div key={c} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span className="text-xs text-slate-500">More</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/charts/TemporalPatterns.tsx
git commit -m "feat: add TemporalPatterns component with heatmap"
```

---

## Task 11: Wire up Analytics page

**Files:**
- Modify: `src/client/pages/Analytics.tsx`
- Delete: `src/client/components/charts/SessionsOverTime.tsx`
- Delete: `src/client/components/charts/ToolUsage.tsx`
- Delete: `src/client/components/charts/ProjectBreakdown.tsx`

- [ ] **Step 1: Replace Analytics.tsx**

```typescript
import { useState } from "react";
import { useAnalytics, type AnalyticsPeriod } from "../hooks/useAnalytics";
import ActivityPulse from "../components/charts/ActivityPulse";
import WorkBreakdown from "../components/charts/WorkBreakdown";
import BehaviorStats from "../components/charts/BehaviorStats";
import TemporalPatterns from "../components/charts/TemporalPatterns";

export default function Analytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);

  const { data, loading } = useAnalytics({ period, project: projectFilter });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading analytics...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-20 text-slate-500">Failed to load analytics.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Active project filter banner */}
      {projectFilter && (
        <div className="flex items-center gap-3 px-4 py-2 bg-violet-900/30 border border-violet-700/50 rounded-lg text-sm">
          <span className="text-violet-300">Filtered to project: <strong>{projectFilter}</strong></span>
          <button
            onClick={() => setProjectFilter(undefined)}
            className="text-violet-400 hover:text-violet-200 underline text-xs"
          >
            Clear
          </button>
        </div>
      )}

      {/* Section 1: Activity Pulse */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Activity pulse</h2>
        <ActivityPulse
          pulse={data.pulse}
          period={period}
          onPeriodChange={(p) => { setPeriod(p); setProjectFilter(undefined); }}
        />
      </section>

      {/* Section 2: Work Breakdown */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Work breakdown</h2>
        <WorkBreakdown
          breakdown={data.breakdown}
          onProjectClick={(p) => setProjectFilter(prev => prev === p ? undefined : p)}
        />
      </section>

      {/* Section 3: Conversation Behavior */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Conversation behavior</h2>
        <BehaviorStats behavior={data.behavior} />
      </section>

      {/* Section 4: Temporal Patterns */}
      <section>
        <h2 className="text-base font-semibold text-slate-200 mb-4">Temporal patterns</h2>
        <TemporalPatterns temporal={data.temporal} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Delete old chart components**

```bash
rm src/client/components/charts/SessionsOverTime.tsx
rm src/client/components/charts/ToolUsage.tsx
rm src/client/components/charts/ProjectBreakdown.tsx
```

- [ ] **Step 3: Build client and verify no TypeScript errors**

```bash
NODE_OPTIONS="--no-warnings" node node_modules/vite/bin/vite.js build 2>&1 | tail -5
```

Expected: `✓ built in X.XXs`

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/Analytics.tsx
git rm src/client/components/charts/SessionsOverTime.tsx src/client/components/charts/ToolUsage.tsx src/client/components/charts/ProjectBreakdown.tsx
git commit -m "feat: complete analytics dashboard redesign"
```

- [ ] **Step 6: Push**

```bash
git push
```
