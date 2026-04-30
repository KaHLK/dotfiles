#!/usr/bin/env bun
/// <reference types="bun-types" />
import { readFileSync } from "node:fs";
import { db, logError } from "./db";

type HookInput = {
  hook_event_name: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  agent_id?: string;
  agent_type?: string;
  source?: string;
};

type AssistantLine = {
  type: string;
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  message?: {
    id?: string;
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      service_tier?: string;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
      server_tool_use?: {
        web_search_requests?: number;
        web_fetch_requests?: number;
      };
    };
  };
};

function ingestTranscript(input: HookInput): void {
  if (!input.transcript_path) return;

  const content = readFileSync(input.transcript_path, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const kind = input.hook_event_name === "SubagentStop" ? "subagent" : "main";
  const parentSessionId = kind === "subagent" ? (input.session_id ?? null) : null;
  const agentId = input.agent_id ?? null;
  const agentType = input.agent_type ?? null;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO usage_events (
      ts, kind, session_id, parent_session_id, agent_id, agent_type,
      request_id, message_id, model, service_tier,
      input_tokens, output_tokens, cache_read_tokens,
      cache_create_5m_tokens, cache_create_1h_tokens,
      web_search_requests, web_fetch_requests,
      stop_reason, cwd, git_branch, version, raw_usage_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const tx = db.transaction((rows: AssistantLine[]) => {
    for (const m of rows) {
      const u = m.message?.usage;
      if (!u || !m.requestId) continue;
      insert.run(
        m.timestamp ?? new Date().toISOString(),
        kind,
        m.sessionId ?? input.session_id ?? "unknown",
        parentSessionId,
        agentId,
        agentType,
        m.requestId,
        m.message?.id ?? null,
        m.message?.model ?? null,
        u.service_tier ?? null,
        u.input_tokens ?? 0,
        u.output_tokens ?? 0,
        u.cache_read_input_tokens ?? 0,
        u.cache_creation?.ephemeral_5m_input_tokens ?? 0,
        u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
        u.server_tool_use?.web_search_requests ?? 0,
        u.server_tool_use?.web_fetch_requests ?? 0,
        m.message?.stop_reason ?? null,
        m.cwd ?? input.cwd ?? null,
        m.gitBranch ?? null,
        m.version ?? null,
        JSON.stringify(u),
      );
    }
  });

  const parsed: AssistantLine[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj?.type === "assistant") parsed.push(obj);
    } catch {}
  }
  tx(parsed);
}

function logSessionEvent(input: HookInput, raw: string): void {
  db.prepare(`
    INSERT INTO session_events (ts, kind, session_id, source, cwd, raw_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    input.hook_event_name,
    input.session_id ?? null,
    input.source ?? null,
    input.cwd ?? null,
    raw,
  );
}

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  const input: HookInput = JSON.parse(raw);
  const event = input.hook_event_name;

  if (event === "Stop" || event === "SubagentStop") {
    ingestTranscript(input);
  } else if (event === "SessionStart" || event === "SessionEnd" || event === "PostCompact") {
    logSessionEvent(input, raw);
  }
}

try {
  await main();
} catch (e) {
  logError("log-usage", e);
}
