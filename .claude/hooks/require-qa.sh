#!/bin/bash
# Blocks the session from stopping while any file exists under .pending-qa/ --
# one file per implementer run, created with `mktemp` (atomic, unlike the old
# read-modify-write counter Codex proved loses updates under 100 parallel
# increments: 23/100 survived in our own re-test). Incremented via
# product-engineer's SubagentStop hook, decremented (one file) by
# check-qa-result.sh only on a validated "pass".

INPUT=$(cat)
PENDING_DIR="$CLAUDE_PROJECT_DIR/.claude/.pending-qa"
BLOCK_COUNT_FILE="$CLAUDE_PROJECT_DIR/.claude/.stop-block-count"

PENDING=0
if [ -d "$PENDING_DIR" ] && [ -n "$(ls -A "$PENDING_DIR" 2>/dev/null)" ]; then
  PENDING=1
fi

if [ "$PENDING" -eq 0 ]; then
  rm -f "$BLOCK_COUNT_FILE"
  exit 0
fi

# Claude Code's own anti-loop design lets a Stop hook force at most 8
# consecutive continuations before overriding it -- see "Stop hook hits the
# block cap" in the hooks guide. We don't get to block forever either way, so
# rather than giving up on the very first stop_hook_active=true (which made
# our earlier "Stop will keep blocking" claim false), we track our own count
# and keep blocking up to a smaller budget before conceding. This narrows the
# escape window; it does not close it -- Codex is right that no hook-level
# design can force this to zero without breaking loop protection.
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  BLOCKS=$(cat "$BLOCK_COUNT_FILE" 2>/dev/null || echo 0)
  if [ "$BLOCKS" -lt 3 ] 2>/dev/null; then
    echo $((BLOCKS + 1)) > "$BLOCK_COUNT_FILE"
    echo "qa still pending after a forced continuation ($((BLOCKS + 1))/3 retries) -- invoke qa, don't just retry Stop." >&2
    exit 2
  fi
  # Budget exhausted -- concede rather than risk hitting Claude Code's own
  # 8-block override, which would end the turn with a warning instead of
  # our message. Known, accepted gap: this is where the gate can be evaded.
  rm -f "$BLOCK_COUNT_FILE"
  exit 0
fi

echo "product-engineer made changes this session that qa hasn't independently verified (pass) yet. Invoke qa before finishing -- do not mark this done on the implementer's own report." >&2
exit 2
