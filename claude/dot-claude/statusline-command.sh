#!/usr/bin/env bash
# Claude Code status line — mirrors starship prompt style

input=$(cat)

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

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // ""')

# --- Context used (progress bar) ---
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)

BAR_WIDTH=10
FILLED=$((PCT * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))
BAR=""
[ "$FILLED" -gt 0 ] && printf -v FILL "%${FILLED}s" && BAR="${FILL// /▓}"
[ "$EMPTY" -gt 0 ] && printf -v PAD "%${EMPTY}s" && BAR="${BAR}${PAD// /░}"

if [ "$PCT" -ge 80 ]; then
  bar_color='\033[0;31m'   # red — critical
elif [ "$PCT" -ge 60 ]; then
  bar_color='\033[0;33m'   # yellow — warning
else
  bar_color='\033[2;37m'   # dim white — normal
fi

# --- Assemble ---
parts=()

# Directory in green
parts+=("$(printf '\033[0;32m%s\033[0m' "$truncated")")

# Git branch in blue with nerd font icon in green
if [ -n "$branch" ]; then
  parts+=("$(printf '\033[0;32m\033[0m\033[0;34m[%s]\033[0m' "$branch")")
fi

# Model in dim white
if [ -n "$model" ]; then
  parts+=("$(printf '\033[2;37m%s\033[0m' "$model")")
fi

# Context usage bar
parts+=("$(printf "${bar_color}%s %d%%\033[0m" "$BAR" "$PCT")")

printf '%s' "${parts[0]}"
for ((i=1; i<${#parts[@]}; i++)); do
  printf ' %s' "${parts[$i]}"
done
printf '\n'
