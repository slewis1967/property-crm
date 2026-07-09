# shellcheck shell=bash
# guard-git.sh — refuse destructive git commands in a PROTECTED (shared) checkout.
#
# WHY A SHELL SHIM AND NOT A GIT HOOK:
#   Git has no pre-stash / pre-reset / pre-checkout hook. The only hook that
#   fires for these ops is `reference-transaction`, and it fires AFTER git has
#   already mutated the working tree — aborting it during `git stash` LOSES the
#   stashed content instead of preventing the command (verified empirically,
#   git 2.51). So the only place to stop the damage is BEFORE git runs. This
#   function shadows `git` in every shell that sources it and vetoes the
#   dangerous subcommands when a marker file is present in the repo root.
#
# ACTIVATION: run scripts/install-guard.sh. It wires this file into BASH_ENV
# (so NON-interactive agent `bash -c` shells auto-source it) and ~/.bashrc (for
# interactive Git Bash). Sourcing it only defines a function — no side effects.
# The guard is a no-op in any repo that does NOT contain the marker file
# `.shared-checkout-guard` in its top level — so throwaway agent worktrees
# (which never have the marker) are completely unaffected.
#
# ESCAPE HATCH: prefix the command with ALLOW_DESTRUCTIVE=1, e.g.
#   ALLOW_DESTRUCTIVE=1 git reset --hard origin/main
# It runs the command and records who/why/when to .git/guard-overrides.log.

GUARD_MARKER_NAME=".shared-checkout-guard"

git() {
    # `command git` bypasses this function (no recursion).
    local top
    top="$(command git rev-parse --show-toplevel 2>/dev/null)"

    # Not in a repo, or repo is not marked protected -> pass straight through.
    if [ -z "$top" ] || [ ! -f "$top/$GUARD_MARKER_NAME" ]; then
        command git "$@"
        return $?
    fi

    if _guard_is_destructive "$@"; then
        if [ -n "$ALLOW_DESTRUCTIVE" ]; then
            printf '\n\033[1;33m########################################################\n' >&2
            printf '#  ALLOW_DESTRUCTIVE=1 — running a GUARDED git command  #\n' >&2
            printf '#  in the SHARED checkout. This can destroy another\n' >&2
            printf '#  agent session'"'"'s uncommitted work. Logged.\n' >&2
            printf '########################################################\033[0m\n\n' >&2
            printf '%s\tPID:%s\tALLOW_DESTRUCTIVE\tgit %s\n' \
                "$(date -Is)" "$$" "$*" >> "$top/.git/guard-overrides.log" 2>/dev/null
            command git "$@"
            return $?
        fi
        printf '\n\033[1;31m==============================================================\n' >&2
        printf '  BLOCKED: `git %s`\n' "$1" >&2
        printf '  This is the SHARED checkout:\n    %s\n' "$top" >&2
        printf '  Destructive git commands (stash / reset --hard / checkout /\n' >&2
        printf '  switch / restore / clean) are refused here because other\n' >&2
        printf '  Claude sessions share this working tree and one has already\n' >&2
        printf '  lost uncommitted work this way.\n\n' >&2
        printf '  DO INSTEAD: work in your own throwaway worktree:\n' >&2
        printf '    bash scripts/agent-worktree.sh\n\n' >&2
        printf '  Real emergency? Opt in, loudly and logged:\n' >&2
        printf '    ALLOW_DESTRUCTIVE=1 git %s\n' "$*" >&2
        printf '==============================================================\033[0m\n\n' >&2
        return 97
    fi

    command git "$@"
    return $?
}

# Returns 0 (true) when the git argument list is a destructive operation.
_guard_is_destructive() {
    local sub="$1"; shift
    case "$sub" in
        stash)
            # read-only subcommands are fine; everything else touches the tree.
            case "$1" in
                list|show) return 1 ;;
            esac
            return 0 ;;
        checkout|switch|restore)
            return 0 ;;
        reset)
            local a
            for a in "$@"; do
                case "$a" in
                    --hard|--merge|--keep) return 0 ;;
                esac
            done
            return 1 ;;
        clean)
            local a
            for a in "$@"; do
                case "$a" in
                    -*f*|--force) return 0 ;;
                esac
            done
            return 1 ;;
        branch)
            local a
            for a in "$@"; do
                case "$a" in
                    -D|-d|--delete) return 0 ;;
                esac
            done
            return 1 ;;
        *) return 1 ;;
    esac
}
