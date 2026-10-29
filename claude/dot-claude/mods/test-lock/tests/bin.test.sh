#!/usr/bin/env bash
# Tests bin/test-lock against real flock/lockf. Run: tests/bin.test.sh
set -u

BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/test-lock"
TMP=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$TMP"' EXIT
export TEST_LOCK_FILE="$TMP/env.lock"
LOCK="$TMP/test.lock"
failed=0

check() {
  local name=$1
  shift
  if "$@"; then
    echo "(pass) $name"
  else
    echo "(fail) $name"
    failed=1
  fi
}

# Holds $LOCK from another process until $TMP/release exists
hold() {
  rm -f "$TMP/release" "$TMP/held"
  "$BIN" --file "$LOCK" --label holder -- bash -c "touch '$TMP/held'; while ! [ -e '$TMP/release' ]; do sleep 0.1; done" &
  for _ in $(seq 50); do
    [ -e "$TMP/held" ] && return
    sleep 0.1
  done
  echo "hold: lock never taken" >&2
}

release() {
  touch "$TMP/release"
  wait
}

# A PATH with the tools the script needs, plus the given lockers
path_with() {
  local dir="$TMP/path-${1:-none}"
  mkdir -p "$dir"
  for tool in bash cat date dirname jq mkdir sleep "$@"; do
    local found
    found=$(command -v "$tool") && ln -sf "$found" "$dir/$tool"
  done
  echo "$dir"
}

check '--path prints TEST_LOCK_FILE' test "$("$BIN" --path)" = "$TMP/env.lock"
check '--file overrides TEST_LOCK_FILE' test "$("$BIN" --file "$LOCK" --path)" = "$LOCK"
check 'default lock file is under ~/.cache' test "$(env -u TEST_LOCK_FILE "$BIN" --path)" = "$HOME/.cache/pluto-test.lock"

check 'runs the command, passing its exit status' bash -c "'$BIN' --file '$LOCK' -- sh -c 'exit 3'; test \$? = 3"
check 'runs a command whose args look like options' test "$("$BIN" --file "$LOCK" -- echo --kind x)" = '--kind x'

"$BIN" --file "$LOCK" --kind build --label term -- true
check 'run writes the sidecar' test "$(jq -r '"\(.kind)|\(.label)|\(.command)"' "$LOCK.json")" = 'build|term|true'

check '--probe succeeds while free' "$BIN" --file "$LOCK" --probe

hold
check '--probe fails while held' bash -c "! '$BIN' --file '$LOCK' --probe"
check '--probe --wait fails when still held' bash -c "! '$BIN' --file '$LOCK' --wait 1 --probe"
check 'run with --wait exits 75 when still held, without running' bash -c "'$BIN' --file '$LOCK' --wait 1 -- touch '$TMP/ran' 2>/dev/null; test \$? = 75 && ! [ -e '$TMP/ran' ]"
check 'run names the holder while waiting' bash -c "'$BIN' --file '$LOCK' --wait 1 -- true 2>&1 | grep -q 'tests running in holder'"
( sleep 1; touch "$TMP/release" ) &
check 'run waits for the holder, then runs' "$BIN" --file "$LOCK" -- touch "$TMP/ran-after"
wait
check '...after the holder released' test -e "$TMP/ran-after"

COMMAND=$'cargo test "a\\b"\n\tdone'
exec 9>>"$LOCK"
"$BIN" --file "$LOCK" --fd 9 --wait 1 --kind benchmark --label 'stack (abcd1234)' --command "$COMMAND"
check '--fd leaves the lock held by the fd' bash -c "! '$BIN' --file '$LOCK' --probe"
check '--fd writes the sidecar, escaping the command' test "$(jq -r .command "$LOCK.json")" = "$COMMAND"
check '--fd sidecar has kind and label' test "$(jq -r '"\(.kind)|\(.label)"' "$LOCK.json")" = 'benchmark|stack (abcd1234)'
check '--fd sidecar has startedAt in ms' bash -c "test \$(jq .startedAt '$LOCK.json') -gt 1000000000000"
check '--fd exits 75 when another fd holds the lock' bash -c "exec 8>>'$LOCK'; '$BIN' --file '$LOCK' --fd 8 --wait 1 2>/dev/null; test \$? = 75"
exec 9>&-
check 'closing the fd frees the lock' "$BIN" --file "$LOCK" --probe

if command -v lockf >/dev/null; then
  LOCKF_PATH=$(path_with lockf)
  check 'lockf: runs the command' env PATH="$LOCKF_PATH" "$BIN" --file "$LOCK" -- true
  hold
  check 'lockf: --probe fails while held' bash -c "! PATH='$LOCKF_PATH' '$BIN' --file '$LOCK' --probe"
  release
  check 'lockf: --probe succeeds while free' env PATH="$LOCKF_PATH" "$BIN" --file "$LOCK" --probe
fi

check 'exits 69 without flock or lockf' bash -c "PATH='$(path_with)' '$BIN' --path 2>/dev/null; test \$? = 69"

exit $failed
