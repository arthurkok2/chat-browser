import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./db/connection.js";
import { dropSchema, createSchema } from "./db/schema.js";
import { indexAllSessions, startWatcher } from "./services/indexer.js";
import { discoverSessions } from "./services/discovery.js";
import { sessionsRouter } from "./api/sessions.js";
import { searchRouter } from "./api/search.js";
import { analyticsRouter } from "./api/analytics.js";
import { exportRouter } from "./api/export.js";
import { reindexRouter } from "./api/reindex.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  port: number;
  open: boolean;
  reindex: boolean;
  dataDir?: string;
}

export function startServer(options: ServerOptions): void {
  const { port, open: openBrowser, reindex, dataDir } = options;

  const app = express();
  app.use(express.json());

  // Mount API routes
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/reindex", reindexRouter);

  // Serve static files from the built SPA
  const distDir = path.resolve(__dirname, "..", "..", "dist");
  app.use(express.static(distDir));

  // SPA fallback: serve index.html for any non-API GET request
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });

  // Initialize database
  const db = getDb();

  // Reindex if requested
  if (reindex) {
    dropSchema(db);
    createSchema(db);
  }

  // Load custom dirs from dataDir config if provided
  let customDirs: Record<string, string[]> | undefined;
  if (dataDir) {
    try {
      const raw = fs.readFileSync(dataDir, "utf-8");
      customDirs = JSON.parse(raw);
    } catch {
      // ignore invalid config
    }
  }

  // Run initial index
  const sources = discoverSessions(customDirs);
  const { sessions, messages } = indexAllSessions(db, sources);

  // Start file watcher
  startWatcher(db, customDirs);

  // Start listening
  app.listen(port, () => {
    console.log(`chat-browser running at http://localhost:${port}`);
    console.log(`Indexed ${sessions} sessions (${messages} messages)`);

    if (openBrowser) {
      import("open").then((openModule) => {
        openModule.default(`http://localhost:${port}`);
      });
    }
  });
}
