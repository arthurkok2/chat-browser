import { DatabaseSync } from "node:sqlite";
import { marked } from "marked";
import type { Session, Message, ToolUse } from "../types.js";
import { getAnalytics } from "./analytics.js";

export type ExportFormat = "md" | "json" | "csv" | "html";

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
    case "md":   return "text/markdown";
    case "json": return "application/json";
    case "csv":  return "text/csv";
    case "html": return "text/html; charset=utf-8";
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderContent(content: string): string {
  // Use marked for markdown, fall back to escaped plain text wrapped in <pre>
  try {
    const html = marked.parse(content, { async: false }) as string;
    return html;
  } catch {
    return `<pre>${escapeHtml(content)}</pre>`;
  }
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  text:        { label: "text",        color: "#64748b" },
  tool_use:    { label: "tool_use",    color: "#7c3aed" },
  tool_result: { label: "tool_result", color: "#065f46" },
  thinking:    { label: "thinking",    color: "#92400e" },
};

function sessionToHtml(
  session: Session,
  messages: Message[],
  toolUses: ToolUse[],
): string {
  const toolUsesByMessage = new Map<number, ToolUse[]>();
  for (const tu of toolUses) {
    const list = toolUsesByMessage.get(tu.message_id) ?? [];
    list.push(tu);
    toolUsesByMessage.set(tu.message_id, list);
  }

  const messagesHtml = messages.map((msg) => {
    const isUser = msg.role === "user";
    const badge = TYPE_BADGE[msg.type] ?? TYPE_BADGE.text;
    const msgTools = toolUsesByMessage.get(msg.id) ?? [];

    const toolsHtml = msgTools.length > 0
      ? `<div class="tools">${msgTools.map((tu) => {
          let input = "";
          if (tu.input_json) {
            try { input = JSON.stringify(JSON.parse(tu.input_json), null, 2); }
            catch { input = tu.input_json; }
          }
          return `<details class="tool-call">
            <summary><code>${escapeHtml(tu.tool_name)}</code>${tu.file_path ? ` <span class="filepath">${escapeHtml(tu.file_path)}</span>` : ""}</summary>
            ${input ? `<pre class="tool-input">${escapeHtml(input)}</pre>` : ""}
          </details>`;
        }).join("")}</div>`
      : "";

    const contentHtml = msg.content
      ? `<div class="content">${msg.type === "thinking" ? `<em>${renderContent(msg.content)}</em>` : renderContent(msg.content)}</div>`
      : "";

    return `<div class="message ${isUser ? "user" : "assistant"}">
      <div class="meta">
        <span class="role">${escapeHtml(msg.role)}</span>
        <span class="badge" style="background:${badge.color}">${badge.label}</span>
        ${msg.timestamp ? `<span class="ts">${new Date(msg.timestamp).toLocaleString()}</span>` : ""}
      </div>
      ${contentHtml}
      ${toolsHtml}
    </div>`;
  }).join("\n");

  const title = [session.project, session.git_branch].filter(Boolean).join(" · ") || session.id;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 2rem; line-height: 1.6; }
  .container { max-width: 860px; margin: 0 auto; }
  .header { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 2rem; }
  .header h1 { margin: 0 0 .5rem; font-size: 1.25rem; color: #f1f5f9; }
  .header-meta { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; font-size: .8rem; color: #94a3b8; }
  .header-meta span b { color: #cbd5e1; }
  .tool-badge { display: inline-block; padding: .2rem .6rem; border-radius: 999px; font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  .tool-claude  { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
  .tool-copilot { background: #05966922; color: #34d399; border: 1px solid #05966944; }
  .tool-codex   { background: #0284c722; color: #38bdf8; border: 1px solid #0284c744; }
  .message { margin-bottom: 1.25rem; }
  .message.user  .bubble { background: #1e293b; border: 1px solid #334155; border-radius: 12px 12px 12px 2px; margin-right: 15%; }
  .message.assistant .bubble { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px 12px 2px 12px; margin-left: 15%; }
  .bubble { padding: .875rem 1.125rem; }
  .meta { display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem; font-size: .75rem; }
  .role { font-weight: 600; color: #94a3b8; text-transform: capitalize; }
  .badge { display: inline-block; padding: .1rem .45rem; border-radius: 4px; font-size: .65rem; font-family: monospace; color: #fff; }
  .ts { color: #475569; }
  .content { font-size: .9rem; }
  .content p { margin: 0 0 .5rem; }
  .content p:last-child { margin: 0; }
  .content h1,.content h2,.content h3,.content h4 { color: #f1f5f9; margin: .75rem 0 .25rem; }
  .content ul,.content ol { padding-left: 1.25rem; margin: .25rem 0 .5rem; }
  .content code { background: #0f172a; border-radius: 4px; padding: .1rem .3rem; font-size: .82rem; color: #a78bfa; font-family: monospace; }
  .content pre { background: #0f172a; border-radius: 8px; padding: .75rem 1rem; overflow-x: auto; margin: .5rem 0; }
  .content pre code { background: none; padding: 0; color: #94a3b8; }
  .content a { color: #a78bfa; }
  .content blockquote { border-left: 3px solid #334155; margin: .5rem 0; padding-left: .75rem; color: #94a3b8; }
  .content table { border-collapse: collapse; font-size: .8rem; margin: .5rem 0; }
  .content th,.content td { border: 1px solid #334155; padding: .3rem .6rem; }
  .content th { background: #1e293b; }
  .tools { margin-top: .5rem; display: flex; flex-wrap: wrap; gap: .4rem; }
  .tool-call { background: #1e293b; border: 1px solid #334155; border-radius: 6px; font-size: .78rem; }
  .tool-call summary { padding: .3rem .6rem; cursor: pointer; user-select: none; display: flex; align-items: center; gap: .4rem; }
  .tool-call summary code { color: #a78bfa; background: none; }
  .filepath { color: #64748b; font-size: .7rem; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
  .tool-input { margin: 0; padding: .6rem .8rem; background: #0f172a; color: #94a3b8; font-size: .75rem; border-top: 1px solid #334155; border-radius: 0 0 6px 6px; overflow-x: auto; white-space: pre; }
  em { color: #78716c; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="header-meta">
      <span><span class="tool-badge tool-${escapeHtml(session.tool)}">${escapeHtml(session.tool)}</span></span>
      ${session.project ? `<span><b>Project:</b> ${escapeHtml(session.project)}</span>` : ""}
      ${session.git_branch ? `<span><b>Branch:</b> <code>${escapeHtml(session.git_branch)}</code></span>` : ""}
      ${session.cwd ? `<span><b>CWD:</b> <code>${escapeHtml(session.cwd)}</code></span>` : ""}
      <span><b>Messages:</b> ${session.message_count}</span>
      ${session.started_at ? `<span><b>Started:</b> ${new Date(session.started_at).toLocaleString()}</span>` : ""}
      ${session.ended_at ? `<span><b>Ended:</b> ${new Date(session.ended_at).toLocaleString()}</span>` : ""}
    </div>
  </div>
  <div class="messages">
    ${messagesHtml}
  </div>
</div>
</body>
</html>`;
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
    case "html":
      content = sessionToHtml(session, messages, toolUses);
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
    filename: `session-${sessionId}.${format === "html" ? "html" : format}`,
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
