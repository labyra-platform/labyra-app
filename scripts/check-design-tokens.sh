#!/usr/bin/env bash
#
# Design rules §12 — make the rules fail the build instead of failing review.
#
# Two things the rules doc asks for don't survive contact with the codebase,
# so this is what's actually enforceable instead:
#
#   §12 tier 2 "delete the default spacing scale, expose only the seven values"
#     — src/ uses 3235 spacing classes, and gap-1 / gap-1.5 / px-2 / py-1 /
#       space-y-1 aren't among the seven. Deleting the scale doesn't fail a
#       wrong class; it unstyles the app. Spacing needs migrating before it can
#       be locked, so it isn't checked here yet.
#
#   §12 tier 3 "blocked via oxlint"
#     — oxlint lints the JS/TS AST. Tailwind classes are opaque strings to it,
#       and it ships no Tailwind rule. This repo already solves that shape of
#       problem with a guard script in the same pre-push hook
#       (check-firestore-guards.sh), so this follows that precedent.
#
# A ratchet, not a wall. There are hundreds of existing violations; blocking
# every push until they're all gone gets the hook deleted, not the debt paid.
# The count may fall, never rise. Fix some → lower the number in
# scripts/design-baseline.txt in the same commit. New code cannot add to it.
#
set -uo pipefail
cd "$(dirname "$0")/.."

BASELINE_FILE='scripts/design-baseline.txt'
FAILED=0

count() {
  # shellcheck disable=SC2126
  grep -rhoE "$1" src --include='*.tsx' 2>/dev/null | wc -l | tr -d ' '
}

baseline() {
  grep -E "^$1=" "$BASELINE_FILE" | cut -d= -f2 | tr -d ' '
}

check() {
  local key="$1" pattern="$2" rule="$3" hint="$4"
  local now base
  now=$(count "$pattern")
  base=$(baseline "$key")
  if [ "$now" -gt "$base" ]; then
    echo "✗ $key: $now (baseline $base) — $rule"
    echo "    $hint"
    # Only the files being pushed. Listing every file that matches would point
    # at pre-existing debt and send the reader to a file they never touched.
    local changed
    changed=$(git diff --name-only origin/main...HEAD -- 'src/***.tsx' 2>/dev/null || true)
    if [ -n "$changed" ]; then
      echo "    in your changes:"
      # shellcheck disable=SC2086
      grep -lE "$pattern" $changed 2>/dev/null | sed 's/^/      /'
    else
      echo "    (couldn't resolve origin/main — grep for: $pattern)"
    fi
    FAILED=1
  elif [ "$now" -lt "$base" ]; then
    echo "↓ $key: $now < baseline $base — lower it in $BASELINE_FILE (same commit)"
    FAILED=1
  fi
}

check arbitrary_text_size 'text-\[[0-9]+px\]' \
  '§2: six sizes, no exceptions' \
  'use the named tokens: text-meta 11 / text-caption 12 / text-body 13 / text-heading 14 / text-stat 16 / text-title 18'

# R515: the check above only ever saw arbitrary values, so text-2xl walked
# straight past it. §2's six sizes stop at 18px (text-title, the page
# greeting) — xl/2xl/3xl are the seventh, eighth and ninth. xs/sm/base/lg are
# left alone: they land on 12/14/16/18, which the scale already contains.
check off_scale_size '\btext-([2-9]xl|xl)\b' \
  '§2: the scale stops at 18px' \
  'text-xl is 20px, text-2xl is 24px — use text-title (18) or text-stat (16)'

check off_scale_weight '\bfont-(semibold|bold)\b' \
  '§2: weight is 400 or 500' \
  '600/700 read heavy against the surrounding UI — use font-medium'

check hardcoded_color '\b(bg-white|text-gray-[0-9]+|border-gray-[0-9]+)\b|text-\[#' \
  '§5: no hardcoded colors' \
  'bg-card / text-muted-foreground / border-border — would this survive a near-black background?'

if [ "$FAILED" -eq 0 ]; then
  echo '✓ Design-token check passed.'
fi
exit "$FAILED"
