#!/usr/bin/env node --experimental-sqlite --no-warnings

import { Command } from "commander";
import { startServer } from "../lib/index.js";

const program = new Command();

program
  .name("chat-browser")
  .description(
    "Browse, search, and analyze CLI chat sessions from Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI",
  )
  .option("--port <number>", "Port to listen on", "3000")
  .option("--open", "Open browser on start", false)
  .option("--reindex", "Drop and rebuild the index on start", false)
  .option("--data-dir <path>", "Path to JSON config with custom data directories")
  .action((opts) => {
    startServer({
      port: Number(opts.port),
      open: opts.open,
      reindex: opts.reindex,
      dataDir: opts.dataDir,
    });
  });

program.parse();
