#!/usr/bin/env bash
# check-firestore-guards.sh — R242 / audit Option A (pragmatic, zero-dependency)
#
# Static guard against the dominant crash class from logicbugaudit20260520.md:
# unguarded `.length` / `.map` / `.filter` / `.forEach` / `.toFixed` on a
# discriminated-union or optional Firestore-derived field.
#
# WHY grep and not an oxlint/ESLint rule:
#   A precise rule needs TYPE information to tell "Firestore-derived optional
#   field" from an ordinary always-present array — without it a pure-AST rule
#   floods false positives on every legit `arr.map`. oxlint JS plugins exist
#   (1.57) but are ALPHA; wiring an alpha feature into the --deny-warnings
#   push hook risks breaking prod builds on oxlint upgrades. This script targets
#   only the NARROW high-signal patterns that actually caused crashes, so it
#   stays accurate without type info and adds zero runtime/dep surface.
#
# It flags (HIGH-SIGNAL ONLY — narrowed to avoid false positives on typed lib code):
#   1. `(x as XxxReferenceCard).peaks.<method>`  — cast-then-access in ANY file.
#      A cast bypasses the compiler's narrowing, so this is always suspect (C1).
#   2. `.peaks.length` / `.peaks.map(` without `?.` in *.tsx RENDER files only.
#      That is where an undefined-field crash actually surfaces to the user
#      (R192/R239). Pure-.ts lib code is excluded: there the discriminant is
#      narrowed by typed params / type-guards (e.g. internal-candidates.ts),
#      so flagging it is noise the compiler already covers.
#
# Exit non-zero on any hit. Wire into husky pre-commit. Override a verified-safe
# line with a trailing `// fs-guard-ok` comment.
#
# Usage: bash scripts/check-firestore-guards.sh

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

violations=0

scan() {
  local label="$1" pattern="$2" globs="$3"
  local hits
  # grep with -B1 so we can honour a `// fs-guard-ok` marker on the matching
  # line OR the line immediately above it (some matches open an object literal
  # and cannot carry a trailing comment). Output is `file:line:code`.
  # shellcheck disable=SC2086
  hits=$(grep -rnP $globs "$pattern" src 2>/dev/null \
    | while IFS= read -r line; do
        # line = path:lineno:code
        local f n
        f=${line%%:*}
        n=$(printf '%s' "$line" | cut -d: -f2)
        # skip if this line or the preceding line opts out
        if printf '%s' "$line" | grep -q 'fs-guard-ok'; then continue; fi
        if [ "$n" -gt 1 ] && sed -n "$((n - 1))p" "$f" 2>/dev/null | grep -q 'fs-guard-ok'; then continue; fi
        printf '%s\n' "$line"
      done)
  if [ -n "$hits" ]; then
    echo "✗ $label"
    echo "$hits" | sed 's/^/    /'
    echo ""
    violations=$((violations + 1))
  fi
}

# 1. cast-then-access on a *ReferenceCard union member (ANY .ts/.tsx).
#    Cast bypasses narrowing -> always verify discriminant + Array.isArray.
scan "cast-then-unguarded peaks access (narrow discriminant, do not cast)" \
  '\)\s*as\s+\w*ReferenceCard\w*\)\.\w+\.(length|map|filter|forEach|reduce)\b' \
  "--include=*.ts --include=*.tsx"

# 2. .peaks.<method> WITHOUT optional chaining, in RENDER (.tsx) files only.
scan "unguarded .peaks access in render (use ?. / ?? [] — see CLAUDE.md 11.1)" \
  '(?<!\?)\.peaks\.(length|map|filter|forEach|reduce)\b' \
  "--include=*.tsx"

if [ "$violations" -gt 0 ]; then
  echo "Firestore-field guard check: $violations pattern(s) flagged above."
  echo "Fix with ?. / ?? [] / discriminant narrowing, or append // fs-guard-ok if verified safe."
  exit 1
fi

echo "✓ Firestore-field guard check passed."
exit 0
