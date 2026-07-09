#!/usr/bin/env bash
# install-guard.sh — activate the shared-checkout destructive-command guard.
#
# Run ONCE per machine that opens the shared checkout:
#   bash scripts/install-guard.sh
#
# WHY BASH_ENV (not just ~/.bashrc): the sessions that actually clobber each
# other are Claude agent shells, and those run NON-INTERACTIVE `bash -c`.
# Non-interactive bash ignores ~/.bashrc; it only auto-sources the file named by
# $BASH_ENV. So we set BASH_ENV (for agent + scripted shells) AND append to
# ~/.bashrc (for humans in interactive Git Bash). Both point at the same shim.
#
# All actions are non-destructive: it copies one file, writes a marker, sets a
# user env var, and appends to ~/.bashrc. It never runs a destructive git op.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
# Stable, branch-independent home for the shim so BASH_ENV never breaks on a
# branch switch and never collides with the tracked copy at checkout/merge.
git_dir="$(git rev-parse --git-common-dir)"
[ "${git_dir:0:1}" = "/" ] || git_dir="$repo_root/$git_dir"
shim_dst="$git_dir/guard-git.sh"
marker="$repo_root/.shared-checkout-guard"
bashrc="${HOME}/.bashrc"

cp "$repo_root/scripts/guard-git.sh" "$shim_dst"
echo "Installed shim: $shim_dst"

# 1. marker (untracked, git-ignored) — scopes the guard to THIS checkout only.
if [ ! -f "$marker" ]; then
    cat > "$marker" <<EOF
This file marks $repo_root as a SHARED, MULTI-SESSION checkout.
While it exists, the guard shim refuses destructive git commands here.
Do NOT commit this file (it is git-ignored). Delete it to disable the guard.
EOF
    echo "Created marker: $marker"
else
    echo "Marker already present: $marker"
fi

# 2. BASH_ENV for non-interactive (agent / scripted) shells — persisted as a
#    Windows user env var so every future `bash -c` inherits it.
if command -v cmd.exe >/dev/null 2>&1; then
    # Store a forward-slash path; Git Bash's bash reads BASH_ENV fine that way.
    win_shim="$shim_dst"
    cmd.exe /c "setx BASH_ENV \"$win_shim\"" >/dev/null 2>&1 \
        && echo "Set user env var BASH_ENV=$win_shim (takes effect in NEW processes)." \
        || echo "WARN: could not setx BASH_ENV — set it manually to $win_shim"
else
    echo "WARN: cmd.exe not found; set BASH_ENV=$shim_dst yourself for agent shells."
fi

# 3. ~/.bashrc for interactive Git Bash.
line="source \"$shim_dst\"  # shared-checkout destructive-git guard"
if [ -f "$bashrc" ] && grep -Fq "$shim_dst" "$bashrc"; then
    echo "~/.bashrc already sources the guard."
else
    printf '\n# --- property-crm shared-checkout guard (auto-added) ---\n%s\n' "$line" >> "$bashrc"
    echo "Added guard source line to $bashrc"
fi

echo
echo "Done."
echo "  * Interactive Git Bash: open a new shell (or: source \"$shim_dst\")."
echo "  * Claude Code / agent shells: RESTART Claude Code so the Bash tool"
echo "    inherits the new BASH_ENV."
echo "Verify:  cd \"$repo_root\" && git stash   # should be BLOCKED"
