#!/bin/bash
# Runs the core agent once. Used by launchd on a schedule, or by hand for a supervised run.
#
# Stops without doing anything if:
#   - a PAUSE file exists in the repo root
#   - another run still holds the lock
#   - the working tree has uncommitted changes (so nothing the owner is editing gets touched)
#
# Output: logs/run-<timestamp>.log (summary lines) and logs/run-<timestamp>.jsonl (agent stream).

set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1

mkdir -p logs
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="logs/run-$STAMP.log"
JSONL="logs/run-$STAMP.jsonl"
LOCK="logs/run.lock"

log() {
  echo "[$(date '+%F %T')] $*" | tee -a "$LOG"
}

if [ -f PAUSE ]; then
  log "PAUSE file present. Exiting without changes."
  exit 0
fi

if ! mkdir "$LOCK" 2>/dev/null; then
  log "Another run holds the lock ($LOCK). Exiting."
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

if [ -n "$(git status --porcelain)" ]; then
  log "Working tree has uncommitted changes. Exiting so nothing is lost."
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

# Skip the run entirely when no developer or tester task is todo, so an empty queue costs nothing.
if ! git show origin/dev:TASKS.md | grep -E '\| todo \|' | grep -q -E 'developer|tester'; then
  log "No todo task for developer or tester in TASKS.md. Exiting without calling Claude."
  exit 0
fi

log "Starting core agent run. Stream: $JSONL"
# acceptEdits lets file writes and edits proceed without a prompt. Shell commands are still
# governed by the allow and deny rules in .claude/settings.json. Do not use bypassPermissions.
claude -p "$(cat scripts/core-prompt.md)" --permission-mode acceptEdits --output-format stream-json --verbose >"$JSONL" 2>>"$LOG"
STATUS=$?
log "Core agent exited with status $STATUS."
exit "$STATUS"
