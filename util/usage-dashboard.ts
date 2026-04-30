#!/usr/bin/env bun
/// <reference types="bun-types" />

import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DB_PATH = join(homedir(), ".claude", "usage-log", "usage.db");
const HTML_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    "usage-dashboard.html",
);
const PORT = 7878;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

type UsageEvent = {
    id: number;
    ts: string;
    kind: "main" | "subagent";
    session_id: string;
    parent_session_id: string | null;
    agent_id: string | null;
    agent_type: string | null;
    request_id: string | null;
    message_id: string | null;
    model: string | null;
    service_tier: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cache_read_tokens: number | null;
    cache_create_5m_tokens: number | null;
    cache_create_1h_tokens: number | null;
    web_search_requests: number | null;
    web_fetch_requests: number | null;
    stop_reason: string | null;
    cwd: string | null;
    git_branch: string | null;
    version: string | null;
    raw_usage_json: string | null;
};

type RateLimitSample = {
    id: number;
    ts: string;
    session_id: string | null;
    session_name: string | null;
    transcript_path: string | null;
    cwd: string | null;
    project_dir: string | null;
    cc_version: string | null;
    model_id: string | null;
    model_display: string | null;
    effort_level: string | null;
    thinking_enabled: 0 | 1 | null;
    output_style: string | null;
    fast_mode: 0 | 1 | null;
    exceeds_200k: 0 | 1 | null;
    five_h_pct: number | null;
    five_h_resets_at: number | null;
    seven_day_pct: number | null;
    seven_day_resets_at: number | null;
    context_used_pct: number | null;
    ctx_window_size: number | null;
    ctx_total_input_tokens: number | null;
    ctx_total_output_tokens: number | null;
    ctx_cur_input: number | null;
    ctx_cur_output: number | null;
    ctx_cur_cache_create: number | null;
    ctx_cur_cache_read: number | null;
    cost_total_usd: number | null;
    cost_duration_ms: number | null;
    cost_api_duration_ms: number | null;
    cost_lines_added: number | null;
    cost_lines_removed: number | null;
    raw_json: string | null;
};

type SessionEvent = {
    id: number;
    ts: string;
    kind: "SessionStart" | "SessionEnd" | "PostCompact";
    session_id: string | null;
    source: string | null;
    cwd: string | null;
    raw_json: string | null;
};

type TableRowMap = {
    usage_events: UsageEvent;
    rate_limit_samples: RateLimitSample;
    session_events: SessionEvent;
};

type TableName = keyof TableRowMap;

type FilterMap = {
    [K in TableName]: ReadonlyArray<keyof TableRowMap[K] & string>;
};

const FILTERS: FilterMap = {
    usage_events: ["session_id", "kind", "model"],
    rate_limit_samples: ["session_id", "project_dir", "model_id", "effort_level"],
    session_events: ["session_id", "kind"],
};

type ApiResponse<T> = {
    rows: T[];
    hasMore: boolean;
    offset: number;
    limit: number;
};

class HttpError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

function parseInt1(value: string | null, fallback: number, name: string, min: number, max: number): number {
    if (value == null) return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new HttpError(400, `${name} must be an integer in [${min}, ${max}]`);
    }
    return n;
}

function queryTable<K extends TableName>(
    table: K,
    params: URLSearchParams,
): ApiResponse<TableRowMap[K]> {
    const limit = parseInt1(params.get("limit"), DEFAULT_LIMIT, "limit", 1, MAX_LIMIT);
    const offset = parseInt1(params.get("offset"), 0, "offset", 0, Number.MAX_SAFE_INTEGER);
    const since = params.get("since");
    const order = (params.get("order") ?? "desc").toLowerCase();
    if (order !== "asc" && order !== "desc") {
        throw new HttpError(400, "order must be 'asc' or 'desc'");
    }

    const filters: { col: string; val: string }[] = [];
    for (const col of FILTERS[table]) {
        const v = params.get(col);
        if (v != null) filters.push({ col, val: v });
    }

    const whereSince = since ? "AND datetime(ts) > datetime('now', ?)" : "";
    const whereFilters = filters.map((f) => `AND ${f.col} = ?`).join(" ");
    const sql = `SELECT * FROM ${table} WHERE 1=1 ${whereSince} ${whereFilters} ORDER BY ts ${order} LIMIT ? OFFSET ?`;

    const args: (string | number)[] = [];
    if (since) args.push(since);
    for (const f of filters) args.push(f.val);
    args.push(limit + 1, offset);

    const db = new Database(DB_PATH, { readonly: true, create: false });
    try {
        const rows = db.prepare(sql).all(...args) as TableRowMap[K][];
        const hasMore = rows.length > limit;
        return {
            rows: hasMore ? rows.slice(0, limit) : rows,
            hasMore,
            offset,
            limit,
        };
    } finally {
        db.close();
    }
}

function handleTable<K extends TableName>(table: K) {
    return (req: Request): Response => {
        try {
            const params = new URL(req.url).searchParams;
            return Response.json(queryTable(table, params));
        } catch (e) {
            if (e instanceof HttpError) {
                return new Response(e.message, { status: e.status });
            }
            return new Response((e as Error).message, { status: 500 });
        }
    };
}

const server = Bun.serve({
    hostname: "127.0.0.1",
    port: PORT,
    routes: {
        "/": () => new Response(Bun.file(HTML_PATH)),
        "/api/usage_events": handleTable("usage_events"),
        "/api/rate_limit_samples": handleTable("rate_limit_samples"),
        "/api/session_events": handleTable("session_events"),
    },
});

console.log(`Listening on http://${server.hostname}:${server.port}`);
