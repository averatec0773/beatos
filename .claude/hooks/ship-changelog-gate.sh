#!/usr/bin/env bash
# PreToolUse hook: deny `git tag -a vX.Y.Z` and `git push ... vX.Y.Z`
# when CHANGELOG.md lacks an entry for that version.
#
# Fail-open philosophy: any unexpected error in this script → exit 0 (allow).
# A buggy hook should never block ordinary git operations.

set +e

input=$(cat)

# Need jq to parse hook input. If absent, fail open.
command -v jq >/dev/null 2>&1 || exit 0

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# Only inspect git tag / git push commands. Bail on everything else.
case "$cmd" in
  *"git tag"*|*"git push"*) ;;
  *) exit 0 ;;
esac

# Extract the first vX.Y.Z (or vX.Y.Z.W) in the command. No version → not a
# versioned tag/push (e.g. `git tag -l`, `git push origin main`) → allow.
version=$(printf '%s' "$cmd" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
[ -z "$version" ] && exit 0

version_num="${version#v}"

changelog="${CLAUDE_PROJECT_DIR:-$(pwd)}/CHANGELOG.md"
[ -f "$changelog" ] || exit 0

# Keep-a-Changelog header: `## [X.Y.Z] - YYYY-MM-DD …`
if grep -qE "^## \[${version_num}\]" "$changelog" 2>/dev/null; then
  exit 0
fi

# Missing entry — block and tell the agent why.
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Ship gate: CHANGELOG.md has no '## [${version_num}]' entry. Invoke the harness skill (.claude/skills/harness/SKILL.md) to add the changelog entry, prune ROADMAP.md, and review conventions/ before tagging or pushing ${version}."
  }
}
EOF
exit 0
