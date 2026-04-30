#!/usr/bin/env bun
/// <reference types="bun-types" />
import { db, logError } from "./db";

const DEDUP_WINDOW_MS = 60_000;

type StatuslineInput = {
  session_id?: string;
  session_name?: string;
  transcript_path?: string;
  cwd?: string;
  workspace?: { current_dir?: string; project_dir?: string };
  version?: string;
  model?: { id?: string; display_name?: string };
  output_style?: { name?: string };
  effort?: { level?: string };
  thinking?: { enabled?: boolean };
  fast_mode?: boolean;
  exceeds_200k_tokens?: boolean;
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_api_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  context_window?: {
    used_percentage?: number;
    context_window_size?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
};

type LastRow = {
  ts: string;
  five_h_pct: number | null;
  seven_day_pct: number | null;
  context_used_pct: number | null;
  cost_total_usd: number | null;
};

function bool(v: boolean | undefined): number | null {
  return v == null ? null : v ? 1 : 0;
}

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  const input: StatuslineInput = JSON.parse(raw);

  const rl = input.rate_limits ?? {};
  const cw = input.context_window ?? {};
  const cu = cw.current_usage ?? {};
  const cost = input.cost ?? {};
  const ws = input.workspace ?? {};

  const five_h_pct = rl.five_hour?.used_percentage ?? null;
  const seven_day_pct = rl.seven_day?.used_percentage ?? null;
  const context_used_pct = cw.used_percentage ?? null;
  const cost_total_usd = cost.total_cost_usd ?? null;

  if (
    five_h_pct == null &&
    seven_day_pct == null &&
    context_used_pct == null &&
    cost_total_usd == null
  ) {
    return;
  }

  const last = db
    .prepare(
      `SELECT ts, five_h_pct, seven_day_pct, context_used_pct, cost_total_usd
       FROM rate_limit_samples ORDER BY id DESC LIMIT 1`,
    )
    .get() as LastRow | null;

  const now = Date.now();
  const same =
    last &&
    last.five_h_pct === five_h_pct &&
    last.seven_day_pct === seven_day_pct &&
    last.context_used_pct === context_used_pct &&
    last.cost_total_usd === cost_total_usd;
  const recent = last && now - new Date(last.ts).getTime() < DEDUP_WINDOW_MS;
  if (same && recent) return;

  db.prepare(
    `INSERT INTO rate_limit_samples (
      ts, session_id, session_name, transcript_path,
      cwd, project_dir, cc_version,
      model_id, model_display,
      effort_level, thinking_enabled, output_style, fast_mode, exceeds_200k,
      five_h_pct, five_h_resets_at, seven_day_pct, seven_day_resets_at,
      context_used_pct, ctx_window_size, ctx_total_input_tokens, ctx_total_output_tokens,
      ctx_cur_input, ctx_cur_output, ctx_cur_cache_create, ctx_cur_cache_read,
      cost_total_usd, cost_duration_ms, cost_api_duration_ms,
      cost_lines_added, cost_lines_removed, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    input.session_id ?? null,
    input.session_name ?? null,
    input.transcript_path ?? null,
    ws.current_dir ?? input.cwd ?? null,
    ws.project_dir ?? null,
    input.version ?? null,
    input.model?.id ?? null,
    input.model?.display_name ?? null,
    input.effort?.level ?? null,
    bool(input.thinking?.enabled),
    input.output_style?.name ?? null,
    bool(input.fast_mode),
    bool(input.exceeds_200k_tokens),
    five_h_pct,
    rl.five_hour?.resets_at ?? null,
    seven_day_pct,
    rl.seven_day?.resets_at ?? null,
    context_used_pct,
    cw.context_window_size ?? null,
    cw.total_input_tokens ?? null,
    cw.total_output_tokens ?? null,
    cu.input_tokens ?? null,
    cu.output_tokens ?? null,
    cu.cache_creation_input_tokens ?? null,
    cu.cache_read_input_tokens ?? null,
    cost_total_usd,
    cost.total_duration_ms ?? null,
    cost.total_api_duration_ms ?? null,
    cost.total_lines_added ?? null,
    cost.total_lines_removed ?? null,
    raw,
  );
}

try {
  await main();
} catch (e) {
  logError("log-statusline", e);
}
