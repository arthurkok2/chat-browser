# Health Status: Index Endpoint + Footer Indicator + Graceful Watcher Restart

## Overview

Three coordinated changes: a `/api/status` endpoint exposing index health, a footer UI component that polls it, and a self-healing watcher with exponential backoff retry.

---

## 1. `/api/status` Endpoint

**Route:** `GET /api/status`

**Response shape:**
```json
{
  "sessions": 1234,
  "messages": 56789,
  "watcher": "active",
  "last_indexed_at": 1714392000000
}
```

`watcher` is one of `"active"` | `"recovering"` | `"dead"`.  
`last_indexed_at` is epoch ms of the most recent successful `indexSession` call, or `null` if nothing has been indexed since startup.

**Implementation:**
- `WatcherState` singleton object exported from `src/server/services/indexer.ts`
- Shape: `{ status: "active" | "recovering" | "dead"; lastIndexedAt: number | null }`
- Updated by `indexSession` (sets `lastIndexedAt`) and the watcher restart logic (sets `status`)
- New route file `src/server/api/status.ts` reads session/message counts from DB + `WatcherState`, returns combined response
- Registered in `src/server/index.ts` alongside existing routes

---

## 2. Graceful Watcher Restart

**Current behavior:** chokidar `error` events are unhandled; watcher silently dies.

**New behavior:**

1. On `error` event → set `WatcherState.status = "recovering"`, close current watcher, schedule retry after 5s
2. Each retry doubles the delay: 5s → 10s → 20s → 40s → 60s (cap)
3. On successful restart → set `status = "active"`, reset backoff counter
4. After 5 consecutive failed retries → set `status = "dead"`, stop retrying

**API change:** `startWatcher` returns a `WatcherHandle` instead of raw `FSWatcher`:
```ts
interface WatcherHandle {
  stop(): void;
}
```

`stop()` cancels any pending retry timer and closes the active watcher. Callers (`src/server/index.ts`) updated to use `WatcherHandle`.

The `WatcherState` singleton is module-level in `indexer.ts` — no new files needed.

---

## 3. Footer UI Indicator

**Component:** `src/client/components/StatusFooter.tsx`  
**Hook:** `src/client/hooks/useStatus.ts`

**Hook behavior:**
- Calls `GET /api/status` on mount, then every 10s via `setInterval`
- Clears interval on unmount (no leak)
- Returns `{ data: StatusResponse | null; loading: boolean }`

**Footer display:**
```
Indexed 1,234 sessions · 56,789 messages · Last updated 2m ago · ● Watcher active
```

Watcher state → visual:
| State | Dot color | Text |
|-------|-----------|------|
| `active` | green | "Watcher active" |
| `recovering` | amber | "Watcher recovering…" |
| `dead` | red | "Watcher stopped — restart app to resume live updates" |

`last_indexed_at` formatted with existing `formatRelativeTime` util from `src/client/utils/time.ts`. If `null`, the "Last updated" segment is omitted entirely.

**Placement:** `App.tsx` renders `<StatusFooter />` below the `<Outlet />` / main content, outside the scrollable area.

---

## Files Changed

| File | Change |
|------|--------|
| `src/server/services/indexer.ts` | Add `WatcherState` singleton, retry logic, `WatcherHandle`, update `indexSession` to set `lastIndexedAt` |
| `src/server/api/status.ts` | New route handler |
| `src/server/index.ts` | Register `/api/status` route, update watcher handle usage |
| `src/client/hooks/useStatus.ts` | New polling hook |
| `src/client/components/StatusFooter.tsx` | New footer component |
| `src/client/App.tsx` | Render `<StatusFooter />` |

---

## Error Handling

- `/api/status` never throws — DB count queries are read-only and fast; on any error returns `500` with `{ error: "..." }`
- Footer shows nothing (empty) if status fetch fails — no error state shown to user for a non-critical indicator
- Watcher "dead" state is informational only; the app continues serving the existing index

## Testing

- Unit test for retry logic: mock chokidar, trigger `error`, assert backoff delays and state transitions
- Unit test for `/api/status`: assert correct counts and watcher state reflected in response
- Existing watcher/indexer tests must still pass
