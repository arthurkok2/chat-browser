import { describe, it, expect } from "vitest";
import path from "path";
import { parseClaudeSession } from "../../src/server/services/parsers/claude.js";

const fixturePath = path.resolve(__dirname, "../fixtures/claude-session.jsonl");

describe("parseClaudeSession", () => {
  it("returns a parsed session with correct metadata", () => {
    const session = parseClaudeSession(fixturePath);
    expect(session).not.toBeNull();
    expect(session!.id).toBe("claude-test-001");
    expect(session!.tool).toBe("claude");
    expect(session!.cwd).toBe("/home/user/projects/myapp");
    expect(session!.source_file).toBe(fixturePath);
  });

  it("parses messages with correct roles and content", () => {
    const session = parseClaudeSession(fixturePath);
    expect(session).not.toBeNull();

    // 3 messages: user text, assistant tool_use, tool_result
    expect(session!.messages).toHaveLength(3);

    const userMsg = session!.messages[0];
    expect(userMsg.role).toBe("user");
    expect(userMsg.type).toBe("text");
    expect(userMsg.content).toBe("Show me the contents of package.json");
    expect(userMsg.uuid).toBe("msg-001");

    const assistantMsg = session!.messages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.type).toBe("tool_use");
    expect(assistantMsg.content).toBe("I'll read the file for you.");
    expect(assistantMsg.uuid).toBe("msg-002");
    expect(assistantMsg.parent_uuid).toBe("msg-001");

    const toolResultMsg = session!.messages[2];
    expect(toolResultMsg.role).toBe("user");
    expect(toolResultMsg.type).toBe("tool_result");
  });

  it("extracts tool uses from assistant messages", () => {
    const session = parseClaudeSession(fixturePath);
    const assistantMsg = session!.messages[1];

    expect(assistantMsg.tool_uses).toHaveLength(1);
    expect(assistantMsg.tool_uses[0].tool_name).toBe("Read");
    expect(assistantMsg.tool_uses[0].file_path).toBe(
      "/home/user/projects/myapp/package.json",
    );
  });

  it("computes started_at and ended_at from message timestamps", () => {
    const session = parseClaudeSession(fixturePath);
    expect(session!.started_at).toBe(
      new Date("2025-03-15T10:00:00.000Z").getTime(),
    );
    expect(session!.ended_at).toBe(
      new Date("2025-03-15T10:00:06.000Z").getTime(),
    );
  });

  it("handles malformed JSONL lines gracefully", () => {
    // The fixture has a malformed line; parsing should still succeed
    const session = parseClaudeSession(fixturePath);
    expect(session).not.toBeNull();
    expect(session!.messages).toHaveLength(3);
  });

  it("returns null for non-existent file", () => {
    const result = parseClaudeSession("/nonexistent/path.jsonl");
    expect(result).toBeNull();
  });

  it("adds token estimates to messages", () => {
    const session = parseClaudeSession(fixturePath);
    const userMsg = session!.messages[0] as any;
    expect(userMsg.token_estimate).toBeGreaterThan(0);
    // "Show me the contents of package.json" is 38 chars => ceil(38/4) = 10
    expect(userMsg.token_estimate).toBe(
      Math.ceil("Show me the contents of package.json".length / 4),
    );
  });
});
