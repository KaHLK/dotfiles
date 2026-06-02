#!/usr/bin/env bash
# Notification hook: macOS notification tagged with the triggering session's
# tmux window, so it's clear which session is waiting for input.
set -euo pipefail

input=$(cat)
msg=$(printf '%s' "$input" | jq -r '.message // "Claude needs input"')

# Prefer the live tmux window name of the pane Claude runs in.
win=""
if [ -n "${TMUX:-}" ] && command -v tmux >/dev/null 2>&1; then
  if [ -n "${TMUX_PANE:-}" ]; then
    win=$(tmux display-message -t "$TMUX_PANE" -p '#W' 2>/dev/null || true)
  else
    win=$(tmux display-message -p '#W' 2>/dev/null || true)
  fi
fi
# Fallback: basename of the session's cwd.
if [ -z "$win" ]; then
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
  win=$(basename "${cwd:-?}")
fi

# argv passing → no AppleScript string escaping needed (window/message are untrusted).
osascript - "$msg" "$win" <<'OSA'
on run argv
  display notification (item 1 of argv) with title "Claude Code" subtitle (item 2 of argv) sound name "Glass"
end run
OSA

printf '\a'
