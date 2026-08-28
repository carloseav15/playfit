#!/bin/bash
# Runs when the qa subagent finishes (SubagentStop, matcher "qa"). Removes
# every file under .pending-qa/ whose content is exactly PASS.
#
# No shared .qa-result file anymore -- Codex proved that design had its own
# race: 100 parallel qa passes against 100 pending files left 92-97 pending
# instead of 0, because every qa wrote the same shared result file and every
# check-qa-result.sh picked "the oldest" pending file, so concurrent runs
# raced to read/select/delete the same targets. Reproduced here too: 94/100
# survived before this fix.
#
# The fix: qa writes its verdict INTO the specific pending file it was told
# to verify (see .claude/agents/qa.md), so there's no shared mutable state
# between concurrent qa runs -- each writes to its own file. This hook just
# sweeps for anything marked PASS.
#
# Still true, and NOT fixed by this: a qa run still isn't forced to target
# the *correct* pending file for the diff it actually reviewed -- that
# requires whoever invokes qa to tell it which pending file to write to.
# This closes the concurrency race; it does not add task/diff verification.

PENDING_DIR="$CLAUDE_PROJECT_DIR/.claude/.pending-qa"

if [ -d "$PENDING_DIR" ]; then
  for f in "$PENDING_DIR"/*; do
    [ -f "$f" ] || continue
    if [ "$(cat "$f" 2>/dev/null)" = "PASS" ]; then
      rm -f "$f"
    fi
  done
fi

exit 0
