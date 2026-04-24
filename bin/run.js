#!/usr/bin/env node

// Re-exec with required Node flags if not already set.
// node:sqlite requires --experimental-sqlite on Node < 23.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const flags = ["--experimental-sqlite", "--no-warnings"];
const missing = flags.some(f => !process.execArgv.includes(f));

if (missing) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const cli = join(__dirname, "cli.js");
  const result = spawnSync(
    process.execPath,
    [...flags, cli, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
} else {
  await import("./cli.js");
}
