import { DatabaseSync } from "node:sqlite";

export function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      project TEXT,
      cwd TEXT,
      git_branch TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      message_count INTEGER DEFAULT 0,
      source_file TEXT NOT NULL,
      file_mtime INTEGER,
      file_size INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      uuid TEXT,
      parent_uuid TEXT,
      role TEXT NOT NULL,
      content TEXT,
      type TEXT DEFAULT 'text',
      timestamp INTEGER,
      token_estimate INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      role,
      session_id,
      content='messages',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, role, session_id)
      VALUES (new.id, new.content, new.role, new.session_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, role, session_id)
      VALUES ('delete', old.id, old.content, old.role, old.session_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, role, session_id)
      VALUES ('delete', old.id, old.content, old.role, old.session_id);
      INSERT INTO messages_fts(rowid, content, role, session_id)
      VALUES (new.id, new.content, new.role, new.session_id);
    END;

    CREATE TABLE IF NOT EXISTS tool_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      file_path TEXT,
      timestamp INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_tool ON tool_uses(tool_name);
  `);
}

export function dropSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS tool_uses;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TABLE IF EXISTS messages_fts;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS sessions;
  `);
}
