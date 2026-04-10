import { describe, it, expect } from "vitest";
import path from "path";
import { parseCopilotSession } from "../../src/server/services/parsers/copilot.js";

const fixtureDir = path.resolve(__dirname, "../fixtures/copilot-session");

describe("parseCopilotSession", () => {
  it("returns a parsed session with correct metadata", () => {
    const session = parseCopilotSession(fixtureDir);
    expect(session).not.toBeNull();
    expect(session!.id).toBe("copilot-session");
    expect(session!.tool).toBe("copilot");
    expect(session!.cwd).toBe("/home/user/projects/webapp");
    expect(session!.git_branch).toBe("feature/auth");
  });

  it("derives project from workspace path", () => {
    const session = parseCopilotSession(fixtureDir);
    // deriveProject takes last 2 segments: "projects/webapp"
    expect(session!.project).toBe("projects/webapp");
  });

  it("parses user and assistant messages", () => {
    const session = parseCopilotSession(fixtureDir);
    expect(session!.messages).toHaveLength(2);

    const userMsg = session!.messages[0];
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toBe("How do I add authentication?");

    const assistantMsg = session!.messages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toBe(
      "You can use passport.js for authentication.",
    );
  });

  it("computes timestamps correctly", () => {
    const session = parseCopilotSession(fixtureDir);
    expect(session!.started_at).toBe(
      new Date("2025-03-15T11:00:10.000Z").getTime(),
    );
    expect(session!.ended_at).toBe(
      new Date("2025-03-15T11:00:15.000Z").getTime(),
    );
  });

  it("handles malformed JSONL lines gracefully", () => {
    const session = parseCopilotSession(fixtureDir);
    expect(session).not.toBeNull();
    expect(session!.messages).toHaveLength(2);
  });

  it("returns null for non-existent directory", () => {
    const result = parseCopilotSession("/nonexistent/dir");
    expect(result).toBeNull();
  });
});
