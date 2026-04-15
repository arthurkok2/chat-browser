# Analytics Redesign

**Date:** 2026-04-14
**Status:** Approved

## Goal

Replace the current analytics page (raw session counts, tool call histogram, project breakdown, conversation length buckets) with a dashboard that answers "how am I using AI tools?" across four dimensions: activity pace, work breakdown, conversation behavior, and temporal patterns.

---

## Layout

Single scrollable page, top to bottom. A period selector in the header scopes all sections. One interactive element: clicking a project in the Work Breakdown filters the Conversation Behavior and Temporal Patterns sections below.

---

## Section 1: Activity Pulse

**Header controls:** Period selector — 7d / 30d / 90d / all time. Replaces the existing free-form date pickers. The selected window defines "this period"; the equal-length window immediately before it is "previous period".

**Four stat cards (horizontal row):**

| Card | Value | Δ indicator |
|---|---|---|
| Sessions | Count this period | % change vs previous period |
| Avg sessions/day | Smoothed daily rate | trend arrow (up/down/flat) |
| Estimated hours | Sum of (ended_at − started_at) across sessions | % change vs previous |
| Most active day | Day-of-week name with highest session count | — |

**Sparkline:** Daily session count as a bar chart for the selected window. Previous period overlaid as a lighter line. Gives immediate "more or less active than before?" answer.

---

## Section 2: Work Breakdown

**Top Projects (60% width, horizontal bar chart)**
- Project names decoded: strip leading path, replace `--` separators with `/` (e.g. `C--Dayforce-tip` → `Dayforce/tip`, `c--Dayforce-candidate-common-ui` → `candidate-common-ui`)
- Top 10 by session count
- Each bar labelled with session count; secondary label shows estimated hours
- Clicking a bar filters Sections 3 and 4 to that project

**Top Branches (40% width, horizontal bar chart)**
- Top 10 branches by session count, names shown as-is
- Same bar + count treatment as projects

**Tool split row (full width)**
- Single stacked horizontal bar: Claude / Copilot / Codex proportions
- Each segment labelled with tool name and session count

---

## Section 3: Conversation Behavior

**Three avg stat cards:**

| Card | Metric | Note |
|---|---|---|
| Avg session duration | Median of (ended_at − started_at) | Formatted as "14m", "1h 2m" |
| Avg autonomy ratio | % of messages with type tool_use or tool_result | High = delegating; low = chatting |
| Avg depth | Median user-message count per session | Exchanges, not total messages |

**Three histograms (side by side):**

- **Session duration:** buckets <5m, 5–15m, 15–30m, 30–60m, 60m+
- **Autonomy ratio:** buckets 0–20%, 20–40%, 40–60%, 60–80%, 80–100%
- **Session depth:** buckets 1–10, 11–25, 26–50, 51–100, 100+ messages

No interactions. Pure read — shows shape of usage.

---

## Section 4: Temporal Patterns

**Hour of day (left panel, bar chart)**
- 24 bars, one per hour (0–23)
- Y-axis: session count
- Bars colored by dominant tool at that hour (violet = Claude, green = Copilot, blue = Codex)

**Day of week (right panel, bar chart)**
- 7 bars, Mon–Sun
- Y-axis: session count

**Activity heatmap (full width, below both panels)**
- GitHub-style grid: columns = weeks (last 52 weeks), rows = days (Mon–Sun)
- Cell color: empty for 0 sessions; light → dark violet for increasing counts
- Tooltip on hover: date + session count
- Shows 12 months of history regardless of period selector

---

## Data / API changes

All new metrics are computable from existing DB columns. New queries needed:

- **Session duration:** `ended_at - started_at` per session (already stored)
- **Autonomy ratio:** `COUNT(*) WHERE type IN ('tool_use','tool_result') / COUNT(*)` per session, then median across sessions
- **Depth:** `COUNT(*) WHERE role = 'user' AND type = 'text'` per session, then median
- **Heatmap:** `SELECT date(ended_at/1000,'unixepoch'), COUNT(*) FROM sessions GROUP BY date` — always last 52 weeks, unaffected by period selector
- **Hour/day of week:** `strftime('%H', ended_at/1000, 'unixepoch')` and `strftime('%w', ...)`
- **Estimated hours:** `SUM(ended_at - started_at)` in ms, converted to hours

The analytics API endpoint (`GET /api/analytics`) returns a new response shape. The old shape is replaced entirely — no backwards compatibility needed (internal use only).

### New response shape (abbreviated)

```typescript
{
  pulse: {
    sessions_this: number;
    sessions_prev: number;
    avg_per_day_this: number;
    avg_per_day_prev: number;
    hours_this: number;
    hours_prev: number;
    most_active_dow: string;         // "Monday"
    daily_counts: { date: string; count: number }[];
    daily_counts_prev: { date: string; count: number }[];
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
    heatmap: { date: string; count: number }[];
  };
}
```

---

## Project name decoding

```
C--Dayforce-tip               → Dayforce/tip
c--Dayforce-candidate-common-ui → candidate-common-ui
C--Users-P11F8A4-...          → (last meaningful segment)
```

Rules:
1. Split on `--` to get path segments
2. Drop leading drive/user segments (single letter, or `Users-<name>-...`)
3. Join remaining segments with `/`
4. If only one segment remains, use it as-is

---

## Out of scope

- Per-session detail in analytics (covered by session detail page)
- Exporting the new analytics shape as CSV (can be added later)
- Comparing two different projects side by side
