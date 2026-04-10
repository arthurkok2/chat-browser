import { DatabaseSync } from "node:sqlite";
import type { Session, Message, ToolUse } from "../types.js";
import { getAnalytics } from "./analytics.js";

export type ExportFormat = "md" | "json" | "csv";

interface ExportResult {
  content: string;
  contentType: string;
  filename: string;
}

interface SessionFilterParams {
  tool?: string;
  project?: string;
  branch?: string;
  after?: number;
  before?: number;
}

function getContentType(format: ExportFormat): string {
  switch (format) {
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
  }
}

function formatDate(epochMs: number | null): string {
  if (epochMs == null) return "unknown";
  return new Date(epochMs).toISOString();
}

function escapeCsv(value: string | null | number): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function getSessionWithMessages(
  db: DatabaseSync,
  sessionId: string,
): { session: Session; messages: Message[]; toolUses: ToolUse[] } | null {
  const session = db
    .prepare("SELECT * FROM sessions WHERE id = @id")
    .get({ id: sessionId }) as Session | undefined;

  if (!session) return null;

  const messages = db
    .prepare(
      "SELECT * FROM messages WHERE session_id = @sessionId ORDER BY id",
    )
    .all({ sessionId }) as unknown as Message[];

  const toolUses = db
    .prepare(
      "SELECT * FROM tool_uses WHERE session_id = @sessionId ORDER BY id",
    )
    .all({ sessionId }) as unknown as ToolUse[];

  return { session, messages, toolUses };
}

function sessionToMarkdown(
  session: Session,
  messages: Message[],
  toolUses: ToolUse[],
): string {
  const lines: string[] = [];

  lines.push(`# Session ${session.id}`);
  lines.push(
    `**Tool:** ${session.tool} | **Project:** ${session.project ?? "N/A"} | **Branch:** ${session.git_branch ?? "N/A"}`,
  );
  lines.push(
    `**Started:** ${formatDate(session.started_at)} | **Messages:** ${session.message_count}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  const toolUsesByMessage = new Map<number, ToolUse[]>();
  for (const tu of toolUses) {
    const existing = toolUsesByMessage.get(tu.message_id) ?? [];
    existing.push(tu);
    toolUsesByMessage.set(tu.message_id, existing);
  }

  for (const msg of messages) {
    const roleLabel =
      msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    lines.push(`## ${roleLabel}`);

    if (msg.content) {
      lines.push(msg.content);
    }

    const msgToolUses = toolUsesByMessage.get(msg.id);
    if (msgToolUses) {
      for (const tu of msgToolUses) {
        lines.push("");
        lines.push(
          `### Tool: ${tu.tool_name}${tu.file_path ? " `" + tu.file_path + "`" : ""}`,
        );
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function sessionToJson(
  session: Session,
  messages: Message[],
  toolUses: ToolUse[],
): string {
  return JSON.stringify({ session, messages, tool_uses: toolUses }, null, 2);
}

export function exportSession(
  db: DatabaseSync,
  sessionId: string,
  format: ExportFormat,
): ExportResult {
  const data = getSessionWithMessages(db, sessionId);
  if (!data) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const { session, messages, toolUses } = data;
  let content: string;

  switch (format) {
    case "md":
      content = sessionToMarkdown(session, messages, toolUses);
      break;
    case "json":
      content = sessionToJson(session, messages, toolUses);
      break;
    case "csv": {
      const header = "message_id,role,type,timestamp,content";
      const rows = messages.map(
        (m) =>
          `${m.id},${escapeCsv(m.role)},${escapeCsv(m.type)},${escapeCsv(m.timestamp)},${escapeCsv(m.content)}`,
      );
      content = [header, ...rows].join("\n");
      break;
    }
  }

  return {
    content,
    contentType: getContentType(format),
    filename: `session-${sessionId}.${format}`,
  };
}

export function exportSessions(
  db: DatabaseSync,
  params: SessionFilterParams,
  format: ExportFormat,
): ExportResult {
  const conditions: string[] = [];
  const bindings: Record<string, string | number | null> = {};

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

  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const sessions = db
    .prepare(
      `SELECT * FROM sessions s ${whereClause} ORDER BY s.started_at DESC`,
    )
    .all(bindings) as unknown as Session[];

  let content: string;
  const timestamp = new Date().toISOString().slice(0, 10);

  switch (format) {
    case "md": {
      const parts: string[] = [`# Sessions Export (${timestamp})`, ""];
      for (const session of sessions) {
        const data = getSessionWithMessages(db, session.id);
        if (data) {
          parts.push(sessionToMarkdown(data.session, data.messages, data.toolUses));
          parts.push("---");
          parts.push("");
        }
      }
      content = parts.join("\n");
      break;
    }
    case "json":
      content = JSON.stringify(
        sessions.map((s) => {
          const data = getSessionWithMessages(db, s.id);
          return data
            ? { session: data.session, messages: data.messages, tool_uses: data.toolUses }
            : { session: s, messages: [], tool_uses: [] };
        }),
        null,
        2,
      );
      break;
    case "csv": {
      const header = "id,tool,project,branch,started_at,message_count";
      const rows = sessions.map(
        (s) =>
          `${escapeCsv(s.id)},${escapeCsv(s.tool)},${escapeCsv(s.project)},${escapeCsv(s.git_branch)},${escapeCsv(s.started_at)},${s.message_count}`,
      );
      content = [header, ...rows].join("\n");
      break;
    }
  }

  return {
    content,
    contentType: getContentType(format),
    filename: `sessions-${timestamp}.${format}`,
  };
}

export function exportAnalytics(
  db: DatabaseSync,
  params: { after?: number; before?: number },
): ExportResult {
  const analytics = getAnalytics(db, params);
  const timestamp = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];

  // Summary
  lines.push("section,key,value");
  lines.push(`summary,total_sessions,${analytics.summary.total_sessions}`);
  lines.push(`summary,total_messages,${analytics.summary.total_messages}`);
  lines.push(`summary,estimated_tokens,${analytics.summary.estimated_tokens}`);
  lines.push(`summary,project_count,${analytics.summary.project_count}`);

  // Sessions over time
  for (const row of analytics.sessions_over_time) {
    lines.push(`sessions_over_time,${escapeCsv(row.date)},${row.count}`);
  }

  // Tool breakdown
  for (const row of analytics.tool_breakdown) {
    lines.push(`tool_breakdown,${escapeCsv(row.tool)},${row.count}`);
  }

  // Project breakdown
  for (const row of analytics.project_breakdown) {
    lines.push(`project_breakdown,${escapeCsv(row.project)},${row.count}`);
  }

  // Tool usage
  for (const row of analytics.tool_usage) {
    lines.push(`tool_usage,${escapeCsv(row.tool_name)},${row.count}`);
  }

  // Conversation lengths
  for (const row of analytics.conversation_lengths) {
    lines.push(`conversation_lengths,${escapeCsv(row.bucket)},${row.count}`);
  }

  // Branch breakdown
  for (const row of analytics.branch_breakdown) {
    lines.push(`branch_breakdown,${escapeCsv(row.branch)},${row.count}`);
  }

  return {
    content: lines.join("\n"),
    contentType: "text/csv",
    filename: `analytics-${timestamp}.csv`,
  };
}
