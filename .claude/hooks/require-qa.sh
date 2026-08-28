#!/bin/bash
# Blocks the session from stopping while pending-qa-count > 0. A counter, not a
# boolean, so two implementer runs in the same session don't let one qa pass
# clear both (Codex found this race with the old boolean marker). Incremented
# by product-engineer's SubagentStop hook, decremented by check-qa-result.sh
# only on a validated "pass". See product/AGENTS.md's "Review Discipline".

INPUT=$(cat)

# Avoid looping forever if the hook already forced a continuation this turn.
# Known limitation: this also means a second Stop attempt right after a block
# can slip through without qa actually running again -- Claude Code's own
# anti-loop design requires this check, and there's no way to close that gap
# without breaking loop protection. Don't treat this gate as unconditional.
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

COUNT_FILE="$CLAUDE_PROJECT_DIR/.claude/.pending-qa-count"
COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)

if [ "$COUNT" -gt 0 ] 2>/dev/null; then
  echo "product-engineer made $COUNT change(s) this session that qa hasn't independently verified (pass) yet. Invoke qa before finishing -- do not mark this done on the implementer's own report." >&2
  exit 2
fi

exit 0
