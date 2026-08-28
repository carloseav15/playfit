#!/bin/bash
# Runs when the qa subagent finishes (SubagentStop, matcher "qa"). Removes one
# file from .pending-qa/ only if qa wrote a well-formed {"result":"pass"} --
# validated with jq. Does not associate the removal with a specific diff/task
# (Codex flagged this as a real remaining gap) -- it removes the oldest
# pending file, which is correct for sequential work and only approximate
# under true concurrency. See product/.claude/agents/qa.md.

RESULT_FILE="$CLAUDE_PROJECT_DIR/.claude/.qa-result"
PENDING_DIR="$CLAUDE_PROJECT_DIR/.claude/.pending-qa"

PASSED=false
if [ -f "$RESULT_FILE" ]; then
  RESULT=$(jq -r '.result // empty' "$RESULT_FILE" 2>/dev/null)
  if [ "$RESULT" = "pass" ]; then
    PASSED=true
  fi
fi

if [ "$PASSED" = true ]; then
  OLDEST=$(ls -tr "$PENDING_DIR" 2>/dev/null | head -1)
  if [ -n "$OLDEST" ]; then
    rm -f "$PENDING_DIR/$OLDEST"
  fi
else
  echo "qa finished without a validated pass result -- pending work is not cleared." >&2
fi

rm -f "$RESULT_FILE"
exit 0
