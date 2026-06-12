#!/usr/bin/env bash
#
# version_bump.sh — keep the application version in sync across files.
#
# Tracked files (kept in lockstep):
#   - package.json          top-level "version"
#   - electrobun.config.ts  app.version
#
# CHANGELOG.md is NOT auto-edited; `check` requires its top `## [X.Y.Z]`
# entry to match the current version so a human writes the actual notes.
#
# Usage:
#   scripts/version_bump.sh current            # print current version
#   scripts/version_bump.sh check              # verify files agree (CI gate)
#   scripts/version_bump.sh set <X.Y.Z>        # set explicit version
#   scripts/version_bump.sh major|minor|patch  # bump from current

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACKAGE_JSON="${REPO_ROOT}/package.json"
ELECTROBUN_CONFIG="${REPO_ROOT}/electrobun.config.ts"
CHANGELOG="${REPO_ROOT}/CHANGELOG.md"

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'

die() { echo "error: $*" >&2; exit 1; }

require_file() { [[ -f "$1" ]] || die "missing file: $1"; }

# Portable in-place edit: BSD/macOS and GNU sed both work via tmpfile.
inplace_sed() {
  local expr="$1" file="$2"
  local tmp
  tmp="$(mktemp)"
  sed -E "$expr" "$file" > "$tmp"
  mv "$tmp" "$file"
}

# Top-level "version": "X" in package.json (exactly one match in this repo).
read_package_json() {
  awk -F'"' '/^[[:space:]]*"version":/ {print $4; exit}' "$PACKAGE_JSON"
}

# app.version in electrobun.config.ts: an unquoted `version:` key, so the first
# quoted token on the line is the value. Comments use `//`, never match this.
read_electrobun_config() {
  awk -F'"' '/^[[:space:]]*version:[[:space:]]*"/ {print $2; exit}' "$ELECTROBUN_CONFIG"
}

# First `## [X.Y.Z]` heading in CHANGELOG.md (top-most release entry).
# Portable: works with BSD/macOS and gawk.
read_changelog() {
  grep -m1 -Eo '^##[[:space:]]+\[[0-9]+\.[0-9]+\.[0-9]+\]' "$CHANGELOG" \
    | sed -E 's/^##[[:space:]]+\[([0-9]+\.[0-9]+\.[0-9]+)\].*/\1/'
}

write_package_json() {
  awk -v new="$1" '
    !done && /^[[:space:]]*"version":/ {
      sub(/"version":[[:space:]]*"[^"]*"/, "\"version\": \"" new "\"")
      done=1
    }
    { print }
  ' "$PACKAGE_JSON" > "${PACKAGE_JSON}.tmp" && mv "${PACKAGE_JSON}.tmp" "$PACKAGE_JSON"
}

write_electrobun_config() {
  # Rewrite only the first `version: "..."` (app.version); preserves indent + comma.
  awk -v new="$1" '
    !done && /^[[:space:]]*version:[[:space:]]*"/ {
      sub(/"[^"]*"/, "\"" new "\"")
      done=1
    }
    { print }
  ' "$ELECTROBUN_CONFIG" > "${ELECTROBUN_CONFIG}.tmp" && mv "${ELECTROBUN_CONFIG}.tmp" "$ELECTROBUN_CONFIG"
}

cmd_current() {
  read_package_json
}

cmd_check() {
  local pj eb cl
  pj="$(read_package_json)"
  eb="$(read_electrobun_config)"
  cl="$(read_changelog)"

  printf '%-24s %s\n' "package.json:"           "${pj:-<none>}"
  printf '%-24s %s\n' "electrobun.config.ts:"   "${eb:-<none>}"
  printf '%-24s %s\n' "CHANGELOG.md (top):"      "${cl:-<none>}"

  local ok=1
  if [[ -z "$pj" || "$pj" != "$eb" ]]; then
    echo "error: version drift between package.json ($pj) and electrobun.config.ts ($eb)" >&2
    ok=0
  fi
  if [[ -z "$cl" ]]; then
    echo "error: CHANGELOG.md has no '## [X.Y.Z]' release heading" >&2
    ok=0
  elif [[ "$cl" != "$pj" ]]; then
    echo "error: CHANGELOG.md top entry ($cl) does not match version ($pj)" >&2
    echo "       add a '## [$pj] - YYYY-MM-DD' section above the previous one" >&2
    ok=0
  fi

  (( ok )) || exit 1
  echo "ok: versions match ($pj) and CHANGELOG.md is current"
}

cmd_set() {
  local new="$1"
  [[ "$new" =~ $SEMVER_RE ]] || die "version must be X.Y.Z, got: $new"

  write_package_json      "$new"
  write_electrobun_config "$new"

  echo "bumped to $new"
  cmd_check
}

cmd_bump() {
  local part="$1" cur major minor patch
  cur="$(read_package_json)"
  [[ "$cur" =~ $SEMVER_RE ]] || die "current version is not semver: $cur"
  IFS='.' read -r major minor patch <<<"$cur"
  case "$part" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
    *) die "unknown bump: $part" ;;
  esac
  cmd_set "${major}.${minor}.${patch}"
}

main() {
  require_file "$PACKAGE_JSON"
  require_file "$ELECTROBUN_CONFIG"
  require_file "$CHANGELOG"

  local cmd="${1:-}"
  case "$cmd" in
    current)           cmd_current ;;
    check)             cmd_check ;;
    set)               [[ $# -ge 2 ]] || die "set requires <X.Y.Z>"; cmd_set "$2" ;;
    major|minor|patch) cmd_bump "$cmd" ;;
    -h|--help|help|"")
      sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
      ;;
    *) die "unknown command: $cmd (try: current | check | set | major | minor | patch)" ;;
  esac
}

main "$@"
