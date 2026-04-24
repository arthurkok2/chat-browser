# chat-browser

Browse, search, and analyze your CLI chat sessions from Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI.

![Node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)

## What it does

chat-browser indexes your local AI chat sessions into a SQLite database and serves a React web app to explore them. Sessions are auto-detected from their default locations and kept up-to-date via a file watcher.

**Supported tools:**
- **Claude Code** — `~/.claude/projects/`
- **GitHub Copilot CLI** — `~/.copilot/session-state/`
- **OpenAI Codex CLI** — `~/.codex/sessions/` and `~/.codex/archived_sessions/`

**Features:**
- Full-text search across all messages (FTS5 with porter stemming)
- Filter by tool, project, branch, date range, and role
- Filters persist in the URL — back navigation restores your exact state
- Sessions sorted by most recent activity
- Subagent sessions excluded by default (Claude Code only), toggleable
- Session detail view with collapsed non-text message groups (tool calls, tool results, thinking)
- Expand/collapse all groups with one click
- Markdown rendered in message bubbles when detected
- Tool call inputs shown as expandable JSON tags
- Analytics dashboard (sessions over time, tool breakdown, project breakdown, token estimates)
- Export sessions as Markdown or JSON
- Live re-indexing as new sessions are written

## Requirements

- Node.js 22+

## Usage

```bash
npx chat-browser
```

Options:

```
--port <number>      Port to listen on (default: 3000)
--open               Open browser automatically
--reindex            Drop and rebuild the index on start
--data-dir <path>    Path to JSON config with custom session directories
```

## Development

```bash
npm install

# Start the dev server (API + file watcher)
npm run dev:server

# Start the Vite dev server (UI with HMR)
npm run dev:client

# Build everything
npm run build

# Run tests
npm test
```

## Data

The index is stored at `~/.chat-browser/index.db` (SQLite). It is rebuilt automatically when session files change. To force a full rebuild:

```bash
npx chat-browser --reindex
```

## Architecture

```
src/
  server/
    api/          Express route handlers (sessions, search, analytics, export)
    db/           SQLite schema and connection (node:sqlite)
    services/
      parsers/    Per-tool JSONL parsers (claude, copilot, codex)
      indexer.ts  Batch indexer + chokidar file watcher
      discovery.ts  Auto-detect session directories
  client/
    pages/        Search, SessionDetail, Analytics
    components/   MessageBubble, FilterBar, SessionCard, ToolCallItem, ...
    hooks/        useSessions, useSearch
```

Each parser reads the tool's native JSONL format and produces a normalized `ParsedSession` with typed messages (`text`, `tool_use`, `tool_result`, `thinking`) and tool call inputs stored as JSON.
