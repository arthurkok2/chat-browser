import { DatabaseSync } from "node:sqlite";
import type { SearchResult, Session } from "../types.js";

export interface SearchParams {
  q: string;
  tool?: string;
  project?: string;
  branch?: string;
  after?: number;
  before?: number;
  role?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  duration_ms: number;
}

export function searchMessages(
  db: DatabaseSync,
  params: SearchParams,
): SearchResponse {
  const start = Date.now();

  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  const conditions: string[] = ["messages_fts MATCH @q"];
  const bindings: Record<string, string | number | null> = { q: params.q };

  if (params.role) {
    conditions.push("messages_fts.role = @role");
    bindings.role = params.role;
  }

  if (params.tool) {
    conditions.push("s.tool = @tool");
    bindings.tool = params.tool;
  }

  if (params.project) {
    conditions.push("s.project = @project");
    bindings.project = params.project;
  }

  if (params.branch) {
    conditions.push("s.git_branch = @branch");
    bindings.branch = params.branch;
  }

  if (params.after != null) {
    conditions.push("s.started_at >= @after");
    bindings.after = params.after;
  }

  if (params.before != null) {
    conditions.push("s.started_at <= @before");
    bindings.before = params.before;
  }

  const whereClause = conditions.join(" AND ");

  const countRow = db
    .prepare(
      `SELECT COUNT(*) as total
       FROM messages_fts
       JOIN sessions s ON s.id = messages_fts.session_id
       WHERE ${whereClause}`,
    )
    .get(bindings) as unknown as { total: number };

  const total = countRow.total;

  const rows = db
    .prepare(
      `SELECT
         s.id, s.tool, s.project, s.cwd, s.git_branch, s.started_at,
         s.ended_at, s.message_count, s.source_file, s.file_mtime, s.file_size,
         messages_fts.rowid AS message_id,
         snippet(messages_fts, 0, '<mark>', '</mark>', '...', 40) AS snippet,
         messages_fts.role,
         rank
       FROM messages_fts
       JOIN sessions s ON s.id = messages_fts.session_id
       WHERE ${whereClause}
       ORDER BY rank
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...bindings, limit, offset }) as unknown as Array<
    Session & { message_id: number; snippet: string; role: string; rank: number }
  >;

  const results: SearchResult[] = rows.map((row) => ({
    session: {
      id: row.id,
      tool: row.tool,
      project: row.project,
      cwd: row.cwd,
      git_branch: row.git_branch,
      started_at: row.started_at,
      ended_at: row.ended_at,
      message_count: row.message_count,
      source_file: row.source_file,
      file_mtime: row.file_mtime,
      file_size: row.file_size,
    },
    message_id: row.message_id,
    snippet: row.snippet,
    role: row.role,
    rank: row.rank,
  }));

  return {
    results,
    total,
    duration_ms: Date.now() - start,
  };
}
