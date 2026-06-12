/// <reference types="bun-types" />
import { Database } from "bun:sqlite";
import { mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".claude", "usage-log");
mkdirSync(DIR, { recursive: true });

export const DB_PATH = join(DIR, "usage.db");
export const ERR_LOG = join(DIR, "errors.log");

export function logError(where: string, err: unknown): void {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  try {
    appendFileSync(ERR_LOG, `${new Date().toISOString()} [${where}] ${msg}\n`);
  } catch {}
}

export const db = new Database(DB_PATH);
// Every hook event + the statusline opens this DB in its own process; without a
// busy timeout, concurrent access (or post-crash WAL recovery) fails instantly
// with SQLITE_BUSY. Set it before any statement that takes a lock so the WAL
// pragma, schema setup, and all inserts wait out contention instead of throwing.
db.exec("PRAGMA busy_timeout = 5000");
try {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    session_id TEXT NOT NULL,
    parent_session_id TEXT,
    agent_id TEXT,
    agent_type TEXT,
    request_id TEXT UNIQUE,
    message_id TEXT,
    model TEXT,
    service_tier TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_create_5m_tokens INTEGER,
    cache_create_1h_tokens INTEGER,
    web_search_requests INTEGER,
    web_fetch_requests INTEGER,
    stop_reason TEXT,
    cwd TEXT,
    git_branch TEXT,
    version TEXT,
    raw_usage_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_events(ts);
  CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_events(session_id);

  CREATE TABLE IF NOT EXISTS rate_limit_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id TEXT,
    session_name TEXT,
    transcript_path TEXT,
    cwd TEXT,
    project_dir TEXT,
    cc_version TEXT,
    model_id TEXT,
    model_display TEXT,
    effort_level TEXT,
    thinking_enabled INTEGER,
    output_style TEXT,
    fast_mode INTEGER,
    exceeds_200k INTEGER,
    five_h_pct REAL,
    five_h_resets_at INTEGER,
    seven_day_pct REAL,
    seven_day_resets_at INTEGER,
    context_used_pct REAL,
    ctx_window_size INTEGER,
    ctx_total_input_tokens INTEGER,
    ctx_total_output_tokens INTEGER,
    ctx_cur_input INTEGER,
    ctx_cur_output INTEGER,
    ctx_cur_cache_create INTEGER,
    ctx_cur_cache_read INTEGER,
    cost_total_usd REAL,
    cost_duration_ms INTEGER,
    cost_api_duration_ms INTEGER,
    cost_lines_added INTEGER,
    cost_lines_removed INTEGER,
    raw_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rl_ts ON rate_limit_samples(ts);
  CREATE INDEX IF NOT EXISTS idx_rl_session ON rate_limit_samples(session_id);

  CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    session_id TEXT,
    source TEXT,
    cwd TEXT,
    raw_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_se_ts ON session_events(ts);
`);
} catch (e) {
  logError("db-init", e);
}
