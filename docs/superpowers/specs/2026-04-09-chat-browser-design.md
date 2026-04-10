# chat-browser — Design Spec

**Date:** 2026-04-09
**Status:** Draft

## Overview

`chat-browser` is an npm-installable local webapp that discovers, indexes, and provides rich search/analytics over CLI chat sessions from Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI. A single `npx chat-browser` command launches an Express server that serves a React SPA and REST API on one port.

## Goals

1. **Search & recall** — instant full-text search across all CLI chat sessions with structured filters (tool, project, branch, date, role)
2. **Audit & analytics** — deep analytics dashboard with session counts over time, token usage estimates, tool usage breakdown, most active projects, conversation length distributions
3. **Export & archive** — export sessions as Markdown, JSON, or CSV (analytics data)

## Architecture

Monolith SPA: Express backend + React/Vite frontend bundled together in a single npm package.

```
npx chat-browser [--port 3000] [--open] [--reindex] [--data-dir config.json]
```

### Single Process

Express serves:
- Pre-built React/Vite SPA as static assets at `/`
- REST API at `/api/*`

The SPA is built at npm publish time — no build step on install.

### Components

```
┌──────────────────────────────────────────────┐
│              Express Server                   │
│                                              │
│  ┌─────────────┐   ┌──────────────────────┐  │
│  │ Static SPA  │   │     REST API         │  │
│  │ (pre-built  │   │                      │  │
│  │  React/Vite)│   │  GET /api/sessions   │  │
│  │             │   │  GET /api/search     │  │
│  │  served at  │   │  GET /api/analytics  │  │
│  │  /          │   │  GET /api/export     │  │
│  │             │   │  POST /api/reindex   │  │
│  └─────────────┘   └──────────────────────┘  │
│                          │                    │
│            ┌─────────────┴──────────────┐     │
│            │      Service Layer         │     │
│            │                            │     │
│            │  SessionDiscovery          │     │
│            │  SessionParser             │     │
│            │  SearchIndex               │     │
│            │  AnalyticsEngine           │     │
│            │  ExportService             │     │
│            └─────────────┬──────────────┘     │
│                          │                    │
│  ┌──────────────┐  ┌────┴─────┐  ┌────────┐  │
│  │   Chokidar   │  │  SQLite  │  │  JSONL  │  │
│  │ File Watcher │─▶│   Index  │◀─│ Parser  │  │
│  └──────────────┘  └──────────┘  └────────┘  │
└──────────────────────────────────────────────┘
```

### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--port` | Server port | `3000` |
| `--open` | Auto-open browser on start | `false` |
| `--reindex` | Drop and rebuild entire SQLite database | `false` |
| `--data-dir` | Path to JSON config file with custom session directories (see format below) | Auto-detect |

**`--data-dir` config format:**
```json
{
  "claude": ["/custom/path/to/claude/projects"],
  "copilot": ["/custom/path/to/copilot/session-state"],
  "codex": ["/custom/path/to/codex/sessions"]
}
```
Each key is optional. Arrays allow multiple directories per tool. Paths provided here are used *in addition to* auto-detected defaults. To disable auto-detection entirely, pass `--no-auto-detect`.

## Data Model

SQLite database stored at `~/.chat-browser/index.db` (or `$XDG_DATA_HOME/chat-browser/index.db`).

### sessions

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Session UUID |
| tool | TEXT | "claude" \| "copilot" \| "codex" |
| project | TEXT | Project path / name |
| cwd | TEXT | Working directory |
| git_branch | TEXT | Branch at time of session |
| started_at | INTEGER | Epoch ms |
| ended_at | INTEGER | Epoch ms (last message timestamp) |
| message_count | INTEGER | Total messages |
| source_file | TEXT | Path to original JSONL file |
| file_mtime | INTEGER | For change detection |
| file_size | INTEGER | For change detection |

### messages

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| session_id | TEXT FK | References sessions.id |
| uuid | TEXT | Message UUID |
| parent_uuid | TEXT | For conversation threading |
| role | TEXT | "user" \| "assistant" \| "system" |
| content | TEXT | Message text (markdown stripped for search) |
| type | TEXT | "text" \| "tool_use" \| "tool_result" |
| timestamp | INTEGER | Epoch ms |
| token_estimate | INTEGER | Rough token count (chars / 4) |

### messages_fts (FTS5 virtual table)

| Column | Type | Description |
|--------|------|-------------|
| content | TEXT | Full-text indexed message content |
| role | TEXT | Filterable |
| session_id | TEXT | For join back to sessions |

### tool_uses

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| message_id | INTEGER FK | References messages.id |
| session_id | TEXT FK | References sessions.id |
| tool_name | TEXT | "Read", "Edit", "Bash", etc. |
| file_path | TEXT | Target file if applicable |
| timestamp | INTEGER | Epoch ms |

## Session Discovery & Parsing

### Auto-Detection

On startup, the tool scans default locations for each CLI. Missing directories are silently skipped.

| CLI | Session Path | Format | Organization |
|-----|-------------|--------|-------------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | JSONL messages | By project folder |
| Copilot CLI | `~/.copilot/session-state/*/events.jsonl` | JSONL events | By session UUID folder |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` + `~/.codex/archived_sessions/**/*.jsonl` | JSONL rollout events | By date (YYYY/MM/DD) |

### Parser Details

**Claude Code Parser**
- Each `.jsonl` file in `~/.claude/projects/{project}/` is one session
- Lines contain message objects with `type`, `message.role`, `message.content`, `timestamp`, `sessionId`
- Metadata extracted from first line: `sessionId`, `cwd`, `gitBranch`, `version`
- Tool calls embedded in assistant messages as `tool_use` content blocks
- `~/.claude/sessions/*.json` maps pids to session IDs (supplementary)

**Copilot CLI Parser**
- Each `~/.copilot/session-state/{uuid}/events.jsonl` is one session
- Event types: `session.start` (metadata), `user.message` (user input), `assistant.turn_start` (assistant response), `hook.start`/`hook.end`
- Session UUID derived from folder name
- `workspace.yaml` in each session folder provides additional context

**Codex CLI Parser**
- Files at `~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{uuid}.jsonl`
- First line is `session_meta` with session ID, CLI version, model provider
- Subsequent lines are conversation messages
- `~/.codex/history.jsonl` provides a command-level index (session_id + text + timestamp)
- `~/.codex/archived_sessions/` contains older sessions in the same format

### Incremental Indexing

- Chokidar watches all discovered session directories
- On file change: compare `mtime` and `size` against stored values in `sessions` table
- Only re-parse files where mtime or size differs
- New files are parsed and inserted
- Deleted source files: session remains in index (data preservation)

### Manual Rebuild

`POST /api/reindex` or `--reindex` CLI flag:
1. Drop all tables
2. Recreate schema
3. Full scan and parse of all discovered directories
4. Respond with session count and duration

### Error Tolerance

- Malformed JSONL lines are skipped with a warning logged to console
- Missing or unreadable files are skipped
- Parser errors for individual sessions do not block indexing of other sessions

## REST API

### GET /api/sessions

List sessions with optional filters.

Query params: `tool`, `project`, `branch`, `after` (epoch ms), `before` (epoch ms), `sort` (started_at, message_count), `order` (asc, desc), `limit`, `offset`

Returns: `{ sessions: Session[], total: number }`

### GET /api/sessions/:id

Get a single session with all messages.

Returns: `{ session: Session, messages: Message[] }`

### GET /api/search

Full-text search across messages with structured filters.

Query params: `q` (search text), `tool`, `project`, `branch`, `after`, `before`, `role`, `limit`, `offset`

Returns: `{ results: SearchResult[], total: number, duration_ms: number }`

Each `SearchResult` contains: session metadata, matched message snippet with highlights, FTS5 rank score.

### GET /api/analytics

Aggregated analytics data.

Query params: `after`, `before` (date range filter)

Returns:
```json
{
  "summary": { "total_sessions": 281, "total_messages": 12400, "estimated_tokens": 1200000, "project_count": 12 },
  "sessions_over_time": [{ "date": "2026-03-01", "count": 14 }, ...],
  "tool_breakdown": [{ "tool": "claude", "count": 220 }, ...],
  "project_breakdown": [{ "project": "Dayforce/tip", "count": 89 }, ...],
  "tool_usage": [{ "tool_name": "Edit", "count": 340 }, ...],
  "conversation_lengths": [{ "bucket": "1-10", "count": 80 }, ...],
  "branch_breakdown": [{ "branch": "main", "count": 45 }, ...]
}
```

### GET /api/export

Export sessions or analytics data.

Query params: `format` (md, json, csv), `session_id` (single session) or same filters as `/api/sessions` (bulk), `type` (sessions, analytics)

Returns: file download with appropriate Content-Type and Content-Disposition headers.

### POST /api/reindex

Trigger a full re-index.

Returns: `{ sessions_indexed: number, messages_indexed: number, duration_ms: number }`

## UI Design

React SPA with three main views, using React Router for navigation.

### Search View (Home — `/`)

- Full-width search bar with instant results (debounced 200ms)
- Filter bar below search: Tool, Project, Branch, Date Range, Role — all as dropdown selects populated from indexed data
- Results list showing:
  - Tool badge (color-coded: purple for Claude, green for Copilot, teal for Codex)
  - Project name and branch
  - Relative timestamp and message count
  - Matched snippet with search term highlighting
- Click result → navigate to session detail
- Result count and query duration shown

### Session Detail View (`/session/:id`)

- Header: tool badge, project, branch, timestamps, message count, token estimate
- Export buttons: Markdown, JSON
- Conversation rendered as chat bubbles:
  - User messages: plain bubble
  - Assistant messages: accent-bordered bubble
  - Tool calls: collapsible sub-items showing tool name and file path
- In-session search (Ctrl+F style filter within the conversation)

### Analytics Dashboard (`/analytics`)

- Summary cards row: Total Sessions, Estimated Tokens, Projects, Tool Split %
- Charts (using Chart.js or Recharts):
  - Sessions over time (bar chart, weekly buckets)
  - Tool usage breakdown (horizontal bar chart)
  - Most active projects (horizontal bar chart)
  - Conversation length distribution (histogram)
- Date range picker to filter all charts
- CSV export button for underlying data

### Shared

- Dark theme by default (respects `prefers-color-scheme`)
- Nav bar: app name, Search / Analytics links, index status indicator (session count, "watching" badge)
- Responsive layout (works on smaller screens but optimized for desktop)

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Backend framework | Express | Widely known, simple, serves both API and static files |
| Database | better-sqlite3 | Synchronous, fast, no native build issues on most platforms, FTS5 support |
| File watching | chokidar | Cross-platform, mature, handles recursive watching |
| Frontend framework | React 18+ | Rich ecosystem, good for interactive search/filter UX |
| Frontend build | Vite | Fast builds, simple config, good React support |
| Charts | Recharts | React-native charting, good defaults, lightweight |
| CSS | CSS Modules or Tailwind CSS | Scoped styles, no runtime overhead |
| CLI entry point | commander | Standard Node.js CLI arg parsing |

## Package Structure

```
chat-browser/
├── package.json
├── bin/
│   └── cli.js              # CLI entry point (commander)
├── src/
│   ├── server/
│   │   ├── index.ts         # Express setup, static serving, API mounting
│   │   ├── api/
│   │   │   ├── sessions.ts
│   │   │   ├── search.ts
│   │   │   ├── analytics.ts
│   │   │   ├── export.ts
│   │   │   └── reindex.ts
│   │   ├── services/
│   │   │   ├── discovery.ts      # Auto-detect session directories
│   │   │   ├── parsers/
│   │   │   │   ├── claude.ts
│   │   │   │   ├── copilot.ts
│   │   │   │   └── codex.ts
│   │   │   ├── indexer.ts        # SQLite indexing + chokidar watcher
│   │   │   ├── search.ts        # FTS5 query builder
│   │   │   ├── analytics.ts     # Aggregation queries
│   │   │   └── export.ts        # MD/JSON/CSV formatters
│   │   └── db/
│   │       ├── schema.ts        # Table creation, migrations
│   │       └── connection.ts    # better-sqlite3 setup
│   └── client/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── Search.tsx
│       │   ├── SessionDetail.tsx
│       │   └── Analytics.tsx
│       ├── components/
│       │   ├── SearchBar.tsx
│       │   ├── FilterBar.tsx
│       │   ├── SessionCard.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── ToolCallItem.tsx
│       │   └── charts/
│       │       ├── SessionsOverTime.tsx
│       │       ├── ToolUsage.tsx
│       │       └── ProjectBreakdown.tsx
│       └── hooks/
│           ├── useSearch.ts
│           ├── useSessions.ts
│           └── useAnalytics.ts
├── dist/                    # Pre-built SPA (generated at publish time)
└── test/
    ├── parsers/
    │   ├── claude.test.ts
    │   ├── copilot.test.ts
    │   └── codex.test.ts
    ├── search.test.ts
    └── api.test.ts
```

## npm Package & Distribution

- Package name: `chat-browser` (or scoped `@user/chat-browser`)
- `bin` field in package.json points to `bin/cli.js`
- `prepublishOnly` script runs `vite build` to generate `dist/`
- `files` field includes: `bin/`, `lib/` (compiled server TS → JS), `dist/` (pre-built SPA)
- Usage: `npx chat-browser` or `npm install -g chat-browser && chat-browser`

## Non-Goals (Explicit Exclusions)

- No cloud sync or remote storage
- No multi-user support
- No editing or deleting of source session files
- No real-time streaming of active sessions
- No authentication (local-only tool)
