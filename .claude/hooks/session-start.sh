#!/bin/bash
set -euo pipefail

# Claude Code on the web clones a fresh container per session, so $HOME/.claude
# (where marketplace registration and plugin installs live) starts empty every
# time. Re-run these on every remote session start to keep the superpowers
# plugin (subagent-driven-development, executing-plans, etc.) available for the
# spec-driven-development workflow documented in CLAUDE.md. Both commands are
# idempotent — a no-op with exit 0 when already present — so this is safe to
# run unconditionally.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! claude plugin marketplace add obra/superpowers-marketplace; then
  echo "session-start: failed to add superpowers-marketplace (network?)" >&2
  exit 0
fi

if ! claude plugin install superpowers@superpowers-marketplace --scope project; then
  echo "session-start: failed to install superpowers plugin" >&2
  exit 0
fi
