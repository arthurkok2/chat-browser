import fs from "fs";
import path from "path";
import os from "os";

export interface DiscoveredSources {
  claude: string[];
  copilot: string[];
  codex: string[];
}

/**
 * Recursively collect files matching a test function.
 */
function walkDir(dir: string, test: (filePath: string) => boolean): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, test));
    } else if (entry.isFile() && test(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * List immediate subdirectories of a directory.
 */
function listSubDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

export function discoverSessions(
  customDirs?: Record<string, string[]>
): DiscoveredSources {
  const home = os.homedir();
  const result: DiscoveredSources = {
    claude: [],
    copilot: [],
    codex: [],
  };

  // Claude: ~/.claude/projects/**/*.jsonl
  const claudeBase = path.join(home, ".claude", "projects");
  result.claude.push(
    ...walkDir(claudeBase, (f) => f.endsWith(".jsonl"))
  );

  // Copilot: ~/.copilot/session-state/*/ (dirs containing events.jsonl)
  const copilotBase = path.join(home, ".copilot", "session-state");
  for (const dir of listSubDirs(copilotBase)) {
    const eventsFile = path.join(dir, "events.jsonl");
    try {
      if (fs.existsSync(eventsFile)) {
        result.copilot.push(dir);
      }
    } catch {
      // skip
    }
  }

  // Codex: ~/.codex/sessions/**/*.jsonl + ~/.codex/archived_sessions/**/*.jsonl
  const codexSessions = path.join(home, ".codex", "sessions");
  const codexArchived = path.join(home, ".codex", "archived_sessions");
  result.codex.push(
    ...walkDir(codexSessions, (f) => f.endsWith(".jsonl")),
    ...walkDir(codexArchived, (f) => f.endsWith(".jsonl"))
  );

  // Add custom directories
  if (customDirs) {
    for (const [tool, dirs] of Object.entries(customDirs)) {
      if (!(tool in result)) continue;
      const key = tool as keyof DiscoveredSources;
      for (const dir of dirs) {
        if (key === "copilot") {
          // For copilot custom dirs, look for session subdirs
          for (const subDir of listSubDirs(dir)) {
            const eventsFile = path.join(subDir, "events.jsonl");
            try {
              if (fs.existsSync(eventsFile)) {
                result.copilot.push(subDir);
              }
            } catch {
              // skip
            }
          }
        } else {
          result[key].push(
            ...walkDir(dir, (f) => f.endsWith(".jsonl"))
          );
        }
      }
    }
  }

  return result;
}
