#!/usr/bin/env bash
# agent-worktree.sh — create a correctly-named throwaway git worktree for one
# agent session, so the SAFE path (never touch the shared checkout) is also the
# EASY path.
#
#   bash scripts/agent-worktree.sh [<name>] [<base-ref>]
#
#   <name>      short label for the branch/dir (default: timestamp).
#   <base-ref>  what to branch from (default: current HEAD).
#
# Prints the `cd` command to run. The worktree lives OUTSIDE the shared checkout
# (in your session scratchpad if $CLAUDE_SCRATCHPAD is set, else ./.worktrees),
# on a fresh branch `agent/<name>`, and does NOT carry the shared-checkout
# guard marker — so you can reset/stash/checkout freely inside it.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
name="${1:-$(date +%Y%m%d-%H%M%S)}"
base="${2:-HEAD}"
# sanitise name -> branch/dir safe
slug="$(printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '-' )"
branch="agent/${slug}"

# Where to put worktrees: prefer the session scratchpad, else a repo-local dir
# that is git-ignored.
base_dir="${CLAUDE_SCRATCHPAD:-$repo_root/.worktrees}"
mkdir -p "$base_dir"
dest="$base_dir/wt-${slug}"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "Branch ${branch} already exists — reusing it." >&2
    git worktree add "$dest" "$branch" >&2
else
    git worktree add -b "$branch" "$dest" "$base" >&2
fi

# Belt-and-braces: make sure the guard marker is NOT present in the worktree
# (it is untracked in the shared checkout, so it normally won't be — but if it
# ever gets committed by mistake, strip it here so agents aren't locked out).
rm -f "$dest/.shared-checkout-guard" 2>/dev/null || true

echo >&2
echo "Worktree ready on branch ${branch}. Run:" >&2
# stdout: the one thing a caller may want to capture/eval
printf 'cd %q\n' "$dest"
