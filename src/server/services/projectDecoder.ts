/**
 * Decodes a Claude project directory name (encoded path) into a readable string.
 *
 * Encoding scheme used by Claude:
 *   - Drive colon becomes "--":  C:  →  C--
 *   - Path separators become "-": \  →  -
 *
 * Examples:
 *   C:\Dayforce\tip                    →  C--Dayforce-tip
 *   C:\Users\P11F8A4\Documents\foo     →  C--Users-P11F8A4-Documents-foo
 *
 * Decoding rules:
 * 1. Split on "--" to separate the drive letter from the rest of the path.
 * 2. Drop the drive letter segment (single character, e.g. "C" or "c").
 * 3. The remainder is a "-"-joined path string.
 * 4. If the remainder starts with "Users", strip "Users", the username, and any
 *    intermediate system folders (e.g. "Documents"), leaving just the project name.
 * 5. Otherwise split on the first "-" to get <org>/<project>. If the drive letter
 *    was uppercase, return "<org>/<project>"; if lowercase, return just "<project>".
 * 6. If there is no drive letter, return the input as-is.
 */
export function decodeProject(encoded: string | null): string | null {
  if (!encoded) return null;

  const parts = encoded.split("--");

  // No drive separator found — return as-is
  if (parts.length < 2 || parts[0].length !== 1) return encoded;

  const driveLetter = parts[0]; // e.g. "C" or "c"
  const rest = parts.slice(1).join("--"); // everything after the drive separator

  // Handle Users paths: strip "Users-<username>-<...folders...>-<project>"
  // Keep only the last segment (the actual project folder).
  const restLower = rest.toLowerCase();
  if (restLower.startsWith("users-")) {
    // segments: ["Users", "<username>", ...intermediates, "<project>"]
    const segments = rest.split("-");
    // Drop "Users" (index 0) + username (index 1) + any known system folders
    const systemFolders = new Set(["documents", "desktop", "downloads", "onedrive"]);
    let i = 2;
    while (i < segments.length - 1 && systemFolders.has(segments[i].toLowerCase())) {
      i++;
    }
    // The remainder from index i onward is the project name (may contain hyphens)
    return segments.slice(i).join("-");
  }

  // Standard path: first "-" separates <org> from <project>
  const dashIdx = rest.indexOf("-");
  if (dashIdx === -1) return rest; // single segment, no separator

  const org = rest.slice(0, dashIdx);
  const project = rest.slice(dashIdx + 1);

  // Uppercase drive letter → include org prefix; lowercase → project only
  if (driveLetter === driveLetter.toUpperCase()) {
    return `${org}/${project}`;
  } else {
    return project;
  }
}
