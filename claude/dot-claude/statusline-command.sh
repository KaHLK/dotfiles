#!/usr/bin/env bash
# Claude Code status line — mirrors starship prompt style

input=$(cat)

# --- Usage logger (background, never blocks render) ---
( printf '%s' "$input" | bun ~/.claude/hooks/usage-log/log-statusline.ts ) >/dev/null 2>&1 &
disown

# --- Working directory ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
home="$HOME"

# --- Git branch (no lock contention, read-only) ---
branch=""
repo_root=""
if git -C "$cwd" rev-parse --is-inside-work-tree --no-optional-locks >/dev/null 2>&1; then
  repo_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
  # Truncate to 16 chars like starship
  if [ ${#branch} -gt 16 ]; then
    branch="${branch:0:16}…"
  fi
fi

# --- Truncate directory (repo-root relative if in a git repo) ---
if [ -n "$repo_root" ]; then
  repo_name=$(basename "$repo_root")
  rel="${cwd#"$repo_root"}"
  rel="${rel#/}"
  if [ -n "$rel" ]; then
    truncated="${repo_name}/${rel}"
  else
    truncated="$repo_name"
  fi
else
  cwd_display="${cwd/#$home/\~}"
  truncated=$(echo "$cwd_display" | awk -F'/' '{
    n = NF
    if (n <= 2) { print $0 }
    else { print $(n-1) "/" $n }
  }')
fi

# --- Assemble ---
line="$(printf '\033[0;32m%s\033[0m' "$truncated")"

# Git branch in blue with nerd font icon in green
if [ -n "$branch" ]; then
  line+=" $(printf '\033[0;32m\033[0m\033[0;34m[%s]\033[0m' "$branch")"
fi

printf '%s\n' "$line"
