#!/bin/bash
# Runs the core agent once. Used by launchd on a schedule, or by hand for a supervised run.
#
# Stops without doing anything if:
#   - a PAUSE file exists in the repo root
#   - another run still holds the lock
#   - the working tree has uncommitted changes (so nothing the owner is editing gets touched)
# When origin/dev has no runnable task, it creates PAUSE, sends a macOS notification, and exits 0.
# "scripts/agent-run.sh --check-queue FILE" only prints the first runnable task ID (no side effects).
#
# Output: logs/run-<timestamp>.log (summary lines) and logs/run-<timestamp>.jsonl (agent stream).
# If DISCORD_WEBHOOK_URL is set, posts a message when a run ends or is skipped for a dirty tree.

set -u

# Prints the ID of the first runnable task in the TASKS.md table at path $1 and returns 0, or
# prints nothing and returns 1 when none is runnable. A row is runnable when its Owner column
# contains "developer" or "tester" and its Status column is exactly "todo". Splitting a table row
# on "|" gives: field 2 = ID, field 3 = Task, field 4 = Owner, field 5 = Status. Only the Owner
# and Status fields are checked, so words in a task description never match.
runnable_task_id() {
  local id
  id="$(awk -F'|' '
    {
      owner = $4; status = $5
      gsub(/^ +| +$/, "", status)
      if (status == "todo" && (index(owner, "developer") > 0 || index(owner, "tester") > 0)) {
        id = $2
        gsub(/^ +| +$/, "", id)
        print id
        exit
      }
    }' "$1" 2>/dev/null)"
  if [ -z "$id" ]; then
    return 1
  fi
  printf '%s\n' "$id"
}

# Side-effect-free mode for tests: print the first runnable ID, exit 0 if any, 1 if none.
if [ "${1:-}" = "--check-queue" ]; then
  runnable_task_id "${2:-/nonexistent}"
  exit $?
fi

# Runs back to back. After a run exits cleanly, the script starts another run in the same chain,
# until the queue is empty, a run fails, or MAX_CHAIN runs have happened. The argument is the
# position in the chain; launchd starts it at position 1.
MAX_CHAIN=12
CHAIN_POS="${1:-1}"
# Absolute path to this script, recorded before the script changes directory.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1

mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/run-$STAMP.log"
JSONL="logs/run-$STAMP.jsonl"
LOCK="logs/run.lock"
QUEUE_FILE="logs/queue-$STAMP.md"

log() {
  echo "[$(date '+%F %T')] $*" | tee -a "$LOG"
}

# Posts a message to the Discord webhook in DISCORD_WEBHOOK_URL. Does nothing if the variable is
# unset. The URL is never written to the log. A failed post is logged but never stops the run.
notify() {
  if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
    return 0
  fi
  # If DISCORD_USER_ID is set, the message starts with a mention of that user, and only that user
  # may be pinged. Without it, no one is pinged.
  local mention=""
  if [ -n "${DISCORD_USER_ID:-}" ]; then
    mention="<@${DISCORD_USER_ID}> "
  fi
  local body
  body=$(printf '%s%s' "$mention" "$1" | python3 -c '
import json, os, sys
uid = os.environ.get("DISCORD_USER_ID", "")
payload = {"content": sys.stdin.read(), "allowed_mentions": {"users": [uid] if uid else []}}
print(json.dumps(payload))
') || return 0
  curl -fsS -m 15 -H 'Content-Type: application/json' -d "$body" "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 \
    || log "Discord notification failed."
}

if [ -f PAUSE ]; then
  log "PAUSE file present. Exiting without changes."
  exit 0
fi

if ! mkdir "$LOCK" 2>/dev/null; then
  log "Another run holds the lock ($LOCK). Exiting."
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null; rm -f "$QUEUE_FILE"' EXIT

if [ -n "$(git status --porcelain)" ]; then
  log "Working tree has uncommitted changes. Exiting so nothing is lost."
  notify "Artifact runner ${STAMP}: skipped. The working tree has uncommitted changes."
  exit 1
fi

if ! git fetch origin dev >>"$LOG" 2>&1; then
  log "git fetch origin dev failed. Exiting."
  exit 1
fi

# Work from the latest dev, so the agent reads the current TASKS.md, not whatever branch
# happens to be checked out.
if ! git checkout -q --detach origin/dev >>"$LOG" 2>&1; then
  log "Could not check out origin/dev. Exiting."
  exit 1
fi

if ! git show origin/dev:TASKS.md >"$QUEUE_FILE" 2>>"$LOG"; then
  log "Could not read TASKS.md from origin/dev. Exiting."
  exit 1
fi

# When no developer or tester task is todo, stop the queue visibly: create PAUSE, notify, exit 0
# (exit 0 so launchd does not count it as a failure). An empty queue costs no agent run.
# The first developer or tester task in table order is the one the agent will take.
if ! NEXT_TASK="$(runnable_task_id "$QUEUE_FILE")"; then
  log "No runnable developer or tester task on origin/dev (no row with Owner developer or tester and Status todo). Created PAUSE. Remove PAUSE after adding a task."
  if ! printf '%s\nNo runnable developer or tester task on origin/dev.\n' "$(date)" >PAUSE 2>/dev/null; then
    log "Could not create the PAUSE file."
  fi
  # Fixed text only: nothing from TASKS.md goes into the AppleScript.
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'display notification "No runnable task on origin/dev. Runner paused." with title "Claude Code Artifact Extension"' >/dev/null 2>&1 \
      || log "osascript notification failed."
  else
    log "osascript not found. Skipping the macOS notification."
  fi
  notify "Artifact runner ${STAMP}: no runnable task on origin/dev. Runner paused."
  exit 0
fi

log "Starting core agent run. Stream: $JSONL"
notify "Artifact runner ${STAMP}: run started. Next task: ${NEXT_TASK:-unknown}."
# acceptEdits lets file writes and edits proceed without a prompt. Shell commands are still
# governed by the allow and deny rules in .claude/settings.json. Do not use bypassPermissions.
claude -p "$(cat scripts/core-prompt.md)" --permission-mode acceptEdits --output-format stream-json --verbose >"$JSONL" 2>>"$LOG"
STATUS=$?
log "Core agent exited with status $STATUS."
# Latest PR link in the agent's stream, if the run mentioned one.
PR_URL="$(grep -o 'https://github.com/[^" \\]*/pull/[0-9]*' "$JSONL" 2>/dev/null | tail -1)"
notify "Artifact runner ${STAMP}: agent exited with status ${STATUS}.${PR_URL:+ ${PR_URL}}"

if [ "$STATUS" -eq 0 ]; then
  if [ "$CHAIN_POS" -lt "$MAX_CHAIN" ]; then
    # Release the lock before starting the next run in the chain, because exec skips the EXIT trap.
    rmdir "$LOCK" 2>/dev/null
    rm -f "$QUEUE_FILE"
    trap - EXIT
    log "Starting run $((CHAIN_POS + 1)) of the chain."
    exec "$SELF" "$((CHAIN_POS + 1))"
  fi
  log "Reached the chain limit of $MAX_CHAIN runs. The next scheduled tick continues."
  notify "Artifact runner ${STAMP}: reached the limit of ${MAX_CHAIN} runs in one chain. The next scheduled tick continues."
fi
exit "$STATUS"
