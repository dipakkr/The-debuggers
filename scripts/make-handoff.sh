#!/bin/sh
set -eu

output=${1:-CLAUDE_RESUME.md}
branch=$(git branch --show-current)
commit=$(git rev-parse HEAD)

{
  echo "# Claude Resume"
  echo
  echo "Objective: Complete the Adversarial Fraud Arena submission."
  echo "Branch: $branch"
  echo "Commit: $commit"
  echo
  echo "## Worktree"
  git status --short --branch
  echo
  echo "## Recent commits"
  git log -5 --oneline
  echo
  echo "## Recovery files"
  echo "- docs/superpowers/specs/2026-08-22-adversarial-fraud-arena-design.md"
  echo "- docs/superpowers/plans/2026-08-22-submission-completion.md"
  echo "- .codex-checkpoint.md"
  echo
  echo "Next command: npm run selfcheck"
} > "$output"

echo "wrote $output"
