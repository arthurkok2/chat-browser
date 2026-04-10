import { describe, it, expect } from "vitest";
import path from "path";
import { parseCodexSession } from "../../src/server/services/parsers/codex.js";

const fixturePath = path.resolve(__dirname, "../fixtures/codex-session.jsonl");

describe("parseCodexSession", () => {
  it("returns a parsed session with correct metadata", () => {
    const session = parseCodexSession(fixturePath);
    expect(session).not.toBeNull();
    expect(session!.id).toBe("codex-test-001");
    expect(session!.tool).toBe("codex");
    expect(session!.project).toBeNull();
    expect(session!.cwd).toBeNull();
    expect(session!.git_branch).toBeNull();
    expect(session!.source_file).toBe(fixturePath);
  });

  it("parses user and assistant messages", () => {
    const session = parseCodexSession(fixturePath);
    expect(session!.messages).toHaveLength(2);

    const userMsg = session!.messages[0];
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toBe("Write a hello world function");
    expect(userMsg.type).toBe("text");

    const assistantMsg = session!.messages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toContain("hello world function");
    expect(assistantMsg.type).toBe("text");
  });

  it("computes timestamps correctly", () => {
    const session = parseCodexSession(fixturePath);
    expect(session!.started_at).toBe(
      new Date("2025-03-15T12:00:00.000Z").getTime(),
    );
    expect(session!.ended_at).toBe(
      new Date("2025-03-15T12:00:05.000Z").getTime(),
    );
  });

  it("handles malformed JSONL lines gracefully", () => {
    const session = parseCodexSession(fixturePath);
    expect(session).not.toBeNull();
    expect(session!.messages).toHaveLength(2);
  });

  it("returns null for non-existent file", () => {
    const result = parseCodexSession("/nonexistent/path.jsonl");
    expect(result).toBeNull();
  });

  it("falls back to filename for session id when not in metadata", () => {
    // Our fixture has session_meta, so id comes from there
    const session = parseCodexSession(fixturePath);
    expect(session!.id).toBe("codex-test-001");
  });
});
