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

# --- 5h rate limit ---
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
[ -n "$FIVE_H" ] && FIVE_H=$(printf '%.0f' "$FIVE_H")
FIVE_H_RESETS=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
FIVE_H_REMAINING=""
if [ -n "$FIVE_H_RESETS" ]; then
  now=$(date +%s)
  diff=$((FIVE_H_RESETS - now))
  if [ "$diff" -gt 0 ]; then
    hours=$((diff / 3600))
    mins=$(( (diff % 3600) / 60 ))
    if [ "$hours" -gt 0 ]; then
      FIVE_H_REMAINING="${hours}h ${mins}m"
    else
      FIVE_H_REMAINING="${mins}m"
    fi
  fi
fi

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
left_parts=()
right_parts=()

# Left: directory in green
left_parts+=("$(printf '\033[0;32m%s\033[0m' "$truncated")")

# Left: git branch in blue with nerd font icon in green
if [ -n "$branch" ]; then
  left_parts+=("$(printf '\033[0;32m\033[0m\033[0;34m[%s]\033[0m' "$branch")")
fi

# Right: model in dim white
if [ -n "$model" ]; then
  right_parts+=("$(printf '\033[2;37m%s\033[0m' "$model")")
fi

# Right: context usage bar
right_parts+=("$(printf "${bar_color}%s %d%%\033[0m" "$BAR" "$PCT")")

# Right: 5h rate limit
if [ -n "$FIVE_H" ]; then
  if [ "$FIVE_H" -ge 80 ]; then
    limit_color='\033[0;31m'   # red
  elif [ "$FIVE_H" -ge 60 ]; then
    limit_color='\033[0;33m'   # yellow
  else
    limit_color='\033[2;37m'   # dim white
  fi
  if [ -n "$FIVE_H_REMAINING" ]; then
    right_parts+=("$(printf "\033[2;37m|\033[0m ${limit_color}5h: %d%% (%s)\033[0m" "$FIVE_H" "$FIVE_H_REMAINING")")
  else
    right_parts+=("$(printf "\033[2;37m|\033[0m ${limit_color}5h: %d%%\033[0m" "$FIVE_H")")
  fi
fi

# Build left and right strings
left=""
left="${left_parts[0]}"
for ((i=1; i<${#left_parts[@]}; i++)); do
  left+=" ${left_parts[$i]}"
done

right=""
right="${right_parts[0]}"
for ((i=1; i<${#right_parts[@]}; i++)); do
  right+=" ${right_parts[$i]}"
done

# Strip ANSI codes to measure visible width
strip_ansi() { printf '%s' "$1" | sed $'s/\033\\[[0-9;]*m//g'; }
left_plain=$(strip_ansi "$left")
right_plain=$(strip_ansi "$right")
left_len=${#left_plain}
right_len=${#right_plain}

# Get terminal width (read from /dev/tty since stdin is piped)
cols=$(stty size < /dev/tty 2>/dev/null | awk '{print $2}')
[ -z "$cols" ] && cols=$(tput cols 2>/dev/null || echo 80)
padding=$((cols - left_len - right_len - 5))
[ "$padding" -lt 1 ] && padding=1

printf '%s%*s%s\n' "$left" "$padding" "" "$right"
