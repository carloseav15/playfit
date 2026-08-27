#!/bin/bash
# Blocks the session from stopping if product-engineer made changes this session
# that qa hasn't verified yet. The marker is set/cleared by SubagentStop hooks in
# .claude/settings.json — see product/AGENTS.md's "Review Discipline" for why this
# exists: self-reported "done" has been wrong here before, more than once.

INPUT=$(cat)

# Avoid looping forever if the hook already forced a continuation this turn.
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

MARKER="$CLAUDE_PROJECT_DIR/.claude/.pending-qa"
if [ -f "$MARKER" ]; then
  echo "product-engineer made changes this session that the qa subagent hasn't independently verified yet. Invoke qa before finishing — do not mark this done on the implementer's own report." >&2
  exit 2
fi

exit 0
