# Health Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/api/status` health endpoint, graceful watcher restart with exponential backoff, and a footer UI indicator that polls the endpoint every 10 seconds.

**Architecture:** A `WatcherState` singleton in `indexer.ts` tracks watcher status and last-indexed timestamp; `startWatcher` returns a `WatcherHandle` with `stop()` instead of a raw `FSWatcher`; the new status route reads that singleton and DB counts; a `useStatus` hook polls it; `StatusFooter` renders the result in `App.tsx`.

**Tech Stack:** Node.js `node:sqlite`, Express 5, React 19, Tailwind CSS 4, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/server/services/indexer.ts` | Modify | Add `WatcherState` singleton, retry logic, `WatcherHandle` type, update `indexSession` to set `lastIndexedAt` |
| `src/server/api/status.ts` | Create | Express route handler for `GET /api/status` |
| `src/server/index.ts` | Modify | Register `/api/status` route; use `WatcherHandle` instead of raw watcher return |
| `src/client/hooks/useStatus.ts` | Create | Polling hook — fetches `/api/status` every 10s, cleans up on unmount |
| `src/client/components/StatusFooter.tsx` | Create | Footer bar showing session count, message count, last indexed time, watcher state dot |
| `src/client/App.tsx` | Modify | Render `<StatusFooter />` below `<main>` |
| `test/status.test.ts` | Create | Unit tests for `WatcherState` transitions and `/api/status` response shape |

---

## Task 1: Add `WatcherState` singleton and `WatcherHandle` type to `indexer.ts`

**Files:**
- Modify: `src/server/services/indexer.ts`

- [ ] **Step 1: Write failing test for `WatcherState` initial state**

Create `test/status.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createSchema } from "../src/server/db/schema.js";
import { getWatcherState, resetWatcherState } from "../src/server/services/indexer.js";

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
  resetWatcherState();
});

describe("WatcherState", () => {
  it("starts as active with null lastIndexedAt", () => {
    const state = getWatcherState();
    expect(state.status).toBe("active");
    expect(state.lastIndexedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd C:/Dayforce/chat-browser && npm test -- --reporter=verbose test/status.test.ts
```

Expected: FAIL — `getWatcherState` not exported.

- [ ] **Step 3: Add `WatcherState` singleton and exports to `indexer.ts`**

Add after the `PARSER_VERSION` constant (line 20) in `src/server/services/indexer.ts`:

```typescript
export interface WatcherState {
  status: "active" | "recovering" | "dead";
  lastIndexedAt: number | null;
}

export interface WatcherHandle {
  stop(): void;
}

let watcherState: WatcherState = { status: "active", lastIndexedAt: null };

export function getWatcherState(): WatcherState {
  return { ...watcherState };
}

export function resetWatcherState(): void {
  watcherState = { status: "active", lastIndexedAt: null };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- --reporter=verbose test/status.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Dayforce/chat-browser && rtk git add src/server/services/indexer.ts test/status.test.ts && rtk git commit -m "feat: add WatcherState singleton and WatcherHandle types to indexer"
```

---

## Task 2: Update `indexSession` to set `lastIndexedAt`

**Files:**
- Modify: `src/server/services/indexer.ts`
- Test: `test/status.test.ts`

- [ ] **Step 1: Write failing test**

Add to `test/status.test.ts` inside the `describe("WatcherState")` block:

```typescript
it("indexSession updates lastIndexedAt", () => {
  const before = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file, is_subagent)
     VALUES ('s1', 'claude', null, '/test', null, null, null, 0, '/test/s1.jsonl', 0)`
  ).run();
  // Simulate what indexSession does: set lastIndexedAt
  const { setLastIndexedAt } = await import("../src/server/services/indexer.js");
  setLastIndexedAt(Date.now());
  const state = getWatcherState();
  expect(state.lastIndexedAt).toBeGreaterThanOrEqual(before);
});
```

Wait — `indexSession` takes a `ParsedSession`, not raw SQL. The test should call `indexSession` directly.

Replace the test above with:

```typescript
import { indexSession, getWatcherState, resetWatcherState } from "../src/server/services/indexer.js";
import type { ParsedSession } from "../src/server/types.js";

it("indexSession updates lastIndexedAt", () => {
  const before = Date.now();
  const parsed: ParsedSession = {
    id: "s-test",
    tool: "claude",
    project: null,
    cwd: "/test",
    git_branch: null,
    started_at: null,
    ended_at: null,
    source_file: "/test/s-test.jsonl",
    is_subagent: false,
    messages: [],
  };
  indexSession(db, parsed);
  const state = getWatcherState();
  expect(state.lastIndexedAt).toBeGreaterThanOrEqual(before);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose test/status.test.ts
```

Expected: FAIL — `lastIndexedAt` is still `null`.

- [ ] **Step 3: Update `indexSession` to set `lastIndexedAt` on success**

In `src/server/services/indexer.ts`, inside `indexSession`, after `db.exec("COMMIT")` (currently line 126), add:

```typescript
    db.exec("COMMIT");
    watcherState.lastIndexedAt = Date.now();
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- --reporter=verbose test/status.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
rtk git add src/server/services/indexer.ts test/status.test.ts && rtk git commit -m "feat: track lastIndexedAt in WatcherState after each successful index"
```

---

## Task 3: Implement graceful watcher restart with exponential backoff

**Files:**
- Modify: `src/server/services/indexer.ts`
- Test: `test/status.test.ts`

- [ ] **Step 1: Write failing tests for retry state transitions**

Add to `test/status.test.ts` — new `describe` block after the existing one:

```typescript
import { startWatcher } from "../src/server/services/indexer.js";
import { vi } from "vitest";

describe("watcher restart", () => {
  it("sets status to recovering when watcher errors", async () => {
    // We test the state machine logic directly via a helper, not chokidar
    const { simulateWatcherError } = await import("../src/server/services/indexer.js");
    simulateWatcherError(db);
    const state = getWatcherState();
    expect(state.status).toBe("recovering");
  });

  it("sets status to dead after 5 failed retries", async () => {
    vi.useFakeTimers();
    const { simulateWatcherError } = await import("../src/server/services/indexer.js");
    // Trigger error + exhaust all retries
    for (let i = 0; i < 6; i++) {
      simulateWatcherError(db);
      await vi.runAllTimersAsync();
    }
    const state = getWatcherState();
    expect(state.status).toBe("dead");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose test/status.test.ts
```

Expected: FAIL — `simulateWatcherError` not exported.

- [ ] **Step 3: Refactor `startWatcher` with retry logic and `WatcherHandle`**

Replace the entire `startWatcher` function in `src/server/services/indexer.ts` with:

```typescript
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;

let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let activeWatcher: FSWatcher | null = null;
let watchDb: DatabaseSync | null = null;
let watchCustomDirs: Record<string, string[]> | undefined;

function scheduleRetry(): void {
  if (retryCount >= MAX_RETRIES) {
    watcherState.status = "dead";
    return;
  }
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (watchDb) spawnWatcher(watchDb, watchCustomDirs);
  }, delay);
}

function spawnWatcher(db: DatabaseSync, customDirs?: Record<string, string[]>): void {
  const home = os.homedir();
  const watchPaths: string[] = [
    path.join(home, ".claude", "projects"),
    path.join(home, ".copilot", "session-state"),
    path.join(home, ".codex", "sessions"),
    path.join(home, ".codex", "archived_sessions"),
  ];
  if (customDirs) {
    for (const dirs of Object.values(customDirs)) watchPaths.push(...dirs);
  }
  const existingPaths = watchPaths.filter((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const watcher = chokidar.watch(existingPaths, {
    ignoreInitial: true,
    persistent: true,
    depth: 10,
  });

  const handleChange = (filePath: string) => {
    if (!filePath.endsWith(".jsonl")) return;
    const existing = debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    debounceTimers.set(filePath, setTimeout(() => {
      debounceTimers.delete(filePath);
      try { parseAndIndex(db, filePath); } catch (err) {
        console.warn(`Error indexing ${filePath}:`, err);
      }
    }, 100));
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("error", (err) => {
    console.warn("Watcher error, scheduling restart:", err);
    watcher.close().catch(() => {});
    activeWatcher = null;
    watcherState.status = "recovering";
    scheduleRetry();
  });
  watcher.on("ready", () => {
    watcherState.status = "active";
    retryCount = 0;
  });

  activeWatcher = watcher;
}

export function simulateWatcherError(db: DatabaseSync): void {
  watchDb = db;
  watcherState.status = "recovering";
  scheduleRetry();
}

export function startWatcher(
  db: DatabaseSync,
  customDirs?: Record<string, string[]>
): WatcherHandle {
  watchDb = db;
  watchCustomDirs = customDirs;
  spawnWatcher(db, customDirs);

  return {
    stop() {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (activeWatcher) { activeWatcher.close().catch(() => {}); activeWatcher = null; }
    },
  };
}
```

Also update `resetWatcherState` to reset retry counters:

```typescript
export function resetWatcherState(): void {
  watcherState = { status: "active", lastIndexedAt: null };
  retryCount = 0;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass including the new watcher restart tests.

- [ ] **Step 5: Commit**

```bash
rtk git add src/server/services/indexer.ts test/status.test.ts && rtk git commit -m "feat: graceful watcher restart with exponential backoff"
```

---

## Task 4: Create `/api/status` route

**Files:**
- Create: `src/server/api/status.ts`
- Modify: `src/server/index.ts`
- Test: `test/status.test.ts`

- [ ] **Step 1: Write failing test**

Add to `test/status.test.ts`:

```typescript
import { getStatusResponse } from "../src/server/api/status.js";

describe("getStatusResponse", () => {
  it("returns correct shape with zero sessions", () => {
    resetWatcherState();
    const result = getStatusResponse(db);
    expect(result).toEqual({
      sessions: 0,
      messages: 0,
      watcher: "active",
      last_indexed_at: null,
    });
  });

  it("returns correct counts after inserting data", () => {
    db.prepare(
      `INSERT INTO sessions (id, tool, project, cwd, git_branch, started_at, ended_at, message_count, source_file, is_subagent)
       VALUES ('s1', 'claude', null, '/test', null, null, null, 0, '/test/s1.jsonl', 0)`
    ).run();
    db.prepare(
      `INSERT INTO messages (session_id, role, content, type) VALUES ('s1', 'user', 'hi', 'text')`
    ).run();
    const result = getStatusResponse(db);
    expect(result.sessions).toBe(1);
    expect(result.messages).toBe(1);
  });

  it("reflects watcher state", () => {
    const { simulateWatcherError } = await import("../src/server/services/indexer.js");
    simulateWatcherError(db);
    const result = getStatusResponse(db);
    expect(result.watcher).toBe("recovering");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --reporter=verbose test/status.test.ts
```

Expected: FAIL — `getStatusResponse` not found.

- [ ] **Step 3: Create `src/server/api/status.ts`**

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/connection.js";
import { getWatcherState } from "../services/indexer.js";

export interface StatusResponse {
  sessions: number;
  messages: number;
  watcher: "active" | "recovering" | "dead";
  last_indexed_at: number | null;
}

export function getStatusResponse(db: DatabaseSync): StatusResponse {
  const { sessions } = db.prepare("SELECT COUNT(*) AS sessions FROM sessions").get() as { sessions: number };
  const { messages } = db.prepare("SELECT COUNT(*) AS messages FROM messages").get() as { messages: number };
  const state = getWatcherState();
  return {
    sessions,
    messages,
    watcher: state.status,
    last_indexed_at: state.lastIndexedAt,
  };
}

export const statusRouter = Router();

statusRouter.get("/", (_req: Request, res: Response) => {
  try {
    const db = getDb();
    res.json(getStatusResponse(db));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Register route in `src/server/index.ts`**

Add import after existing router imports (around line 13):

```typescript
import { statusRouter } from "./api/status.js";
```

Add route mount after `reindexRouter` line (around line 36):

```typescript
  app.use("/api/status", statusRouter);
```

Also update the `startWatcher` call to use `WatcherHandle` (the return type changed — store the handle even if unused, to allow clean shutdown):

```typescript
  const _watcherHandle = startWatcher(db, customDirs);
```

- [ ] **Step 5: Run all tests**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
rtk git add src/server/api/status.ts src/server/index.ts test/status.test.ts && rtk git commit -m "feat: add /api/status health endpoint"
```

---

## Task 5: Create `useStatus` hook

**Files:**
- Create: `src/client/hooks/useStatus.ts`

- [ ] **Step 1: Create `src/client/hooks/useStatus.ts`**

No unit test needed here — this is a thin fetch wrapper; it will be verified through manual UI testing in Task 6.

```typescript
import { useState, useEffect } from "react";

export interface StatusData {
  sessions: number;
  messages: number;
  watcher: "active" | "recovering" | "dead";
  last_indexed_at: number | null;
}

interface StatusState {
  data: StatusData | null;
  loading: boolean;
}

const POLL_INTERVAL_MS = 10_000;

export function useStatus(): StatusState {
  const [state, setState] = useState<StatusState>({ data: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    function fetchStatus() {
      fetch("/api/status")
        .then((res) => {
          if (!res.ok) throw new Error("status fetch failed");
          return res.json() as Promise<StatusData>;
        })
        .then((data) => {
          if (!cancelled) setState({ data, loading: false });
        })
        .catch(() => {
          if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
        });
    }

    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add src/client/hooks/useStatus.ts && rtk git commit -m "feat: add useStatus polling hook"
```

---

## Task 6: Create `StatusFooter` component and wire into `App.tsx`

**Files:**
- Create: `src/client/components/StatusFooter.tsx`
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Create `src/client/components/StatusFooter.tsx`**

```typescript
import { useStatus } from "../hooks/useStatus";
import { formatRelativeTime } from "../utils/time";

const DOT: Record<string, string> = {
  active:     "bg-emerald-500",
  recovering: "bg-amber-400",
  dead:       "bg-red-500",
};

const LABEL: Record<string, string> = {
  active:     "Watcher active",
  recovering: "Watcher recovering…",
  dead:       "Watcher stopped — restart app to resume live updates",
};

export default function StatusFooter() {
  const { data } = useStatus();

  if (!data) return null;

  return (
    <footer className="border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3 text-xs text-slate-400">
        <span>Indexed {data.sessions.toLocaleString()} sessions</span>
        <span className="text-slate-600">·</span>
        <span>{data.messages.toLocaleString()} messages</span>
        {data.last_indexed_at !== null && (
          <>
            <span className="text-slate-600">·</span>
            <span>Last updated {formatRelativeTime(data.last_indexed_at)}</span>
          </>
        )}
        <span className="text-slate-600">·</span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${DOT[data.watcher] ?? DOT.active}`} />
          {LABEL[data.watcher] ?? LABEL.active}
        </span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Wire `StatusFooter` into `App.tsx`**

Replace the entire `App.tsx` with:

```typescript
import { Routes, Route, Link, useLocation } from "react-router-dom";
import Search from "./pages/Search";
import SessionDetail from "./pages/SessionDetail";
import Analytics from "./pages/Analytics";
import StatusFooter from "./components/StatusFooter";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-slate-700 text-white"
          : "text-slate-300 hover:text-white hover:bg-slate-700/50"
      }`}
    >
      {children}
    </Link>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">
                chat-browser
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <NavLink to="/">Search</NavLink>
              <NavLink to="/analytics">Analytics</NavLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </main>

      <StatusFooter />
    </div>
  );
}
```

- [ ] **Step 3: Build and verify UI**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

Start the server and open the app:

```bash
npm start
```

Open `http://localhost:3000`. Verify:
- Footer appears at bottom of every page
- Shows session count, message count, "Last updated Xm ago" (or omitted if null), green dot + "Watcher active"
- Counts match what you'd expect from your local index

- [ ] **Step 4: Commit**

```bash
rtk git add src/client/components/StatusFooter.tsx src/client/App.tsx && rtk git commit -m "feat: add StatusFooter component with watcher health indicator"
```

---

## Task 7: Run full test suite and verify

**Files:** none new

- [ ] **Step 1: Run all tests**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 2: Verify TypeScript across both tsconfigs**

```bash
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.server.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Final build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit if any fixes were needed**

Only commit if the above steps required changes. Use:

```bash
rtk git add <changed files> && rtk git commit -m "fix: <describe fix>"
```
