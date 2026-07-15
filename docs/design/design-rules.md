# Design rules

**Status:** adopted for the dashboard (R510). The token table in §1–§6 still needs lifting into `ADR-044-design-tokens.md`.

**Encoded so far** — §0 says a rule living only in this file has already failed, so:
- §2 type scale → named tokens in `src/styles/globals.css` (`text-meta` … `text-title`). 11px and 13px are reachable by name, so nobody needs an arbitrary value.
- §1 + §4 + §10 → `src/components/ui-extra/panel.tsx`. Callers pick a component, not a spacing value.
- §2 + §5 → `scripts/check-design-tokens.sh`, in the pre-push hook. A **ratchet**: the violation counts in `scripts/design-baseline.txt` may fall, never rise. New code cannot add debt; existing debt is paid down by lowering the number in the commit that fixes it.

**Two rules in §12 don't survive contact with the codebase, and are amended here rather than left as fiction:**

- *"Delete the default spacing scale; expose only the seven values"* — `src/` carries 3235 spacing classes, and `gap-1`, `gap-1.5`, `px-2`, `py-1`, `space-y-1` are not among the seven. Deleting the scale does not fail a wrong class; it unstyles the application. Spacing has to be migrated before it can be locked. Not currently checked.
- *"Blocked via oxlint"* — oxlint lints the JS/TS AST; Tailwind classes are opaque strings to it and it ships no Tailwind rule. The guard script above follows the precedent this repo already set with `check-firestore-guards.sh` in the same hook.

**Current debt** (see `scripts/design-baseline.txt`): 101 arbitrary type sizes, 127 off-scale weights, 4 hardcoded colors, 23 files still on shadcn `Card`, and `aria-labelledby` on 6 files. The Card→Panel migration retires the last two together.
**Scope:** every surface in `labyra-app`. Dashboard is the first consumer, not the only one.
**Suggested path:** `docs/design/design-rules.md`

---

## 0. Why this exists

Consistency does not come from reviewers catching drift. It comes from removing the choice. Every rule below should end up encoded in a component, a Tailwind config, or a lint rule — never in a table nobody reopens.

A rule that lives only in this file has already failed. See §12.

---

## 1. Spacing

**Exactly seven values. Anything outside this list is a bug.**

| Level | px | Tailwind | Used for |
|---|---|---|---|
| inline | 8 | `gap-2` | icon ↔ text, chip ↔ chip, avatar ↔ name |
| row | 10 | `py-2.5` | vertical padding of one list row |
| section | 12 | `gap-3` | card header ↔ card body |
| grid | 16 | `gap-4` | between cards — **horizontal must equal vertical** |
| card | 20 | `p-5` | padding inside a card |

Radius and icon sizes are in §3 and §6.

### The governing rule

> **Outer padding > inner gap.**

Spacing encodes relationship. When the gap between a card's children equals the card's own padding, the eye cannot tell "inside this group" from "outside this group" — the card loses its structure. Target ratio ≈ **20 : 12 : 8**.

### Anti-pattern found in the codebase

shadcn's default `Card` is `flex flex-col gap-6 rounded-xl border py-6 shadow-sm`:

- `py-6` → `padding: 24px 0` — **zero horizontal padding**. shadcn expects `CardHeader`/`CardContent` to supply `px-6`. Write children directly into `Card` and text sits flush against the border.
- `gap-6` → 24px between children — equal to the outer padding. Ratio 24:24 = no hierarchy.

Result on the members card: 24px padding + 24px gap + 24px gap = 72px of chrome around a single row of data.

### Correct

```tsx
<section
  aria-labelledby="members-h"
  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
>
  <div className="flex items-baseline justify-between">
    <h2 id="members-h" className="text-sm font-medium">Team members</h2>
    <span className="text-xs tabular-nums text-muted-foreground">3</span>
  </div>

  <ul className="divide-y divide-border">
    <li className="flex items-center gap-2 py-2.5">…</li>
  </ul>

  <Button variant="outline" size="sm" className="mt-auto w-full">Invite</Button>
</section>
```

**Separate rows with `divide-y`, not gap.** A hairline separates better than whitespace and costs 0px.

> **Amended R518** — this example carried `h-full`, and it was copied into the `Panel` primitive from here. It is redundant: `align-items: stretch` is the grid default, so cards in a dashboard row already end on the same line without it. As a primitive default it is worse than redundant — a `Panel` rendered as a block child of a plain stack resolved `height: 100%` against the `flex-1` chain above it and took the full frame height, which is what broke every settings page. A card that must fill asks for it at the call site.

---

## 2. Typography

**Six sizes. Two weights. No exceptions.**

| Token | px | Used for |
|---|---|---|
| meta | 11 | timestamps, secondary metadata, legends |
| caption | 12 | chips, counts, helper text |
| body | 13 | list rows, table cells, default UI text |
| heading | 14 | card titles |
| stat | 16 | numbers in the stat strip |
| title | 18 | page greeting |

Weight is **400 or 500**. Never 600/700 — they read heavy against the surrounding UI and are the fastest way to make a page look like a template.

Sentence case everywhere. Never Title Case, never ALL CAPS.

### tabular-nums is mandatory

Every number that reaches the screen gets `tabular-nums`. Not a preference — with lab data (masses, volumes, hours, core-hours) proportional digits make columns jitter and make two quantities visually incomparable.

---

## 3. Radius

| Token | px | Used for |
|---|---|---|
| `rounded-xl` | 12 | cards, panels |
| `rounded-lg` | 8 | controls — buttons, inputs, selects |
| `rounded-full` | — | pills, chips, avatars, status dots |

**No rounded corners on single-sided borders.** Using `border-l` or `border-t` as an accent → radius must be 0.

---

## 4. Elevation

**One tier.** A card is `border` **or** `shadow-sm`, never both, never a third variant.

The old dashboard had three surface treatments (white / gray gradient / white+border) because this rule did not exist. Pick border; drop `shadow-sm`.

Floating layers (dialog, popover) are the only exception and are not cards.

---

## 5. Color

### Never hardcode

`border-gray-800` breaks light mode. Every color goes through a semantic token that flips automatically:

| Wrong | Right |
|---|---|
| `border-gray-800` | `border-border` |
| `text-[#666]` | `text-muted-foreground` |
| `bg-white` | `bg-card` |

Mental test: **if the background were near-black, would this still be readable?**

### Two palettes. Never mixed.

**Status** — encodes state, fixed meaning across the whole app:

| State | Color |
|---|---|
| running | blue |
| queued | amber |
| done | green |
| failed / alert | red |
| neutral / inactive | gray |

**Category** — encodes identity, assigned per entity (project chips, hazard groups): purple, teal, coral, pink.

A blue project chip next to a blue "running" dot means two different things in the same row. Keep the palettes in separate files and never let a category value resolve to a status hue.

### Color encodes risk, not distance

For anything with a deadline: red means **the calculation says late**, not "the date is near". On track with 2 weeks left → green. Behind by 10 weeks with 6 months left → red today.

---

## 6. Icons

`@tabler/icons-react` only. Three sizes: **14 / 16 / 20**. Nothing else.

Decorative icons get `aria-hidden="true"`. Icon-only buttons get `aria-label`.

---

## 7. Component states

**Every data-bound card ships four states. Not one.**

| State | Requirement |
|---|---|
| `loading` | Skeleton at the **exact height** of the loaded content. Wrong height = layout shift = the thing skeletons exist to prevent. |
| `empty` | Designed, not defaulted. See below. |
| `error` | **Per-card error boundary.** One failed query must never blank the page. |
| `data` | The state everyone designs first and only. |

### Empty is the most important one

Self-serve SaaS: **day one for every paying customer is a completely empty dashboard.** That is the first impression, and it is currently unspecified.

Empty state is an invitation, not an apology:

- headline names the space — "Start your first project", not "Nothing here yet"
- one line of body explains it
- CTA is a verb

Where a card is `h-full` and stretched by a taller sibling, fill the gap with the empty-state copy instead of leaving 100px of void. The void is not a spacing problem; shrinking padding from 24 to 20 recovers 8px of it.

Alternative: `items-start` on the parent grid so cards size to content. Slight height mismatch reads more natural than a hole.

---

## 8. Numbers and units

### Significant figures are not a formatting concern

A balance reading of 0.0501 g:

- displayed as `0.05 g` → a real digit was thrown away
- displayed as `0.050100 g` → **precision was invented**

Band gap `2.6 eV` ≠ `2.60 eV` scientifically. `Math.round()` catches float garbage; it does not catch this.

Precision travels with the **measurement source**, and is never decided in the view layer:

```ts
type Quantity = {
  value: number
  unit: Unit
  sigFigs: number
  source: 'balance' | 'dft' | 'manual'
}
```

Balance with 4 decimals → fixed sigFigs. DFT → derived from convergence threshold. This is the no-hallucination standard applied to digits — and it is what a reviewer catches in a manuscript.

### Units are first-class

Never store a bare `number` for a physical quantity. Store `{ value, unit }`, convert through one converter, and **forbid addition across dimensions**. Without this, 120 mL will eventually be summed with 0.12 L. Any "total estimate" panel is a sum, so it is where this fails first.

### Locale

Use `Intl.NumberFormat` / `Intl.DateTimeFormat`. Never hand-format.

- `1.240` (vi) vs `1,240` (en) **invert in meaning**
- `07/15` vs `15/07` is a bug waiting for the first non-US customer

---

## 9. Charts

Labyra charts are not dashboard decoration. Band structure, DOS/PDOS, and convergence plots (R288–R300b) export to SVG and go **straight into manuscripts**. Palette is chosen against journal standards, not taste.

- **viridis / cividis.** Never jet/rainbow — jet manufactures a false bright band in the middle and has been rejected by journals.
- Must survive **black-and-white printing** → color always paired with marker or line style.
- ~8% of men have deuteranopia. Some of them are reviewers.
- **Chart palette ≠ status palette.** The blue that means "running" on the dashboard must not become a band color in a plot. Two files, no overlap.

Chart type follows the data, not the layout. Counts-per-day is a bar chart. A line through zeros is a design failure, not a dataset.

---

## 10. Accessibility

Currently every card is a bare `div` — DevTools reports `Role: generic`, `Name: (empty)`. Screen readers see no landmarks.

Minimum bar:

```tsx
<section aria-labelledby="x-h">
  <h2 id="x-h">…</h2>
</section>
```

WCAG is what international enterprise and public-sector procurement (EU, US) ask for. Fixing 7 cards is cheap. Fixing 70 is not.

---

## 11. Layout

- **Dense lists → bordered rows, not nested cards.** Never card-inside-card.
- One column ratio per page, repeated. The dashboard uses `1.75fr / 1fr` with full-width bands between. Mixing ratios per row is what "not harmonious" actually means.
- `grid-template-columns: 1fr` defaults to `min-width: auto` — children with large min-content overflow. Use `minmax(0, 1fr)`.
- Breakpoints are not optional: a tablet next to an instrument is a real lab scenario, and `1.75fr / 1fr` collapses badly at 768px.

### When *not* to use a card

Static counts do not belong on a dashboard at all. If a number does not **change day to day** and does not **click through to work**, it belongs in the header of its own list page.

Counting chemicals in stock fails both tests, and duplicates the hazard card's source. Counting equipment by type fails both. Neither earns a card.

---

## 12. Enforcement

**Do not ship a table. Ship a component.**

```tsx
<Panel>                    {/* p-5 gap-3 rounded-xl border */}
  <PanelHeader title="Team members" count={3} />
  <PanelList>              {/* divide-y divide-border */}
    <PanelRow />           {/* py-2.5 gap-2 */}
  </PanelList>
  <PanelFooter />          {/* mt-auto */}
</Panel>
```

Developers stop choosing spacing and start choosing components. This is the only mechanism that survives 50 cards. shadcn already moved this way with `CardHeader`/`CardContent`; go further.

Three enforcement layers:

1. **`ADR-044-design-tokens.md`** — same family as ADR-016 / 030 / 034 / 042 / 043.
2. **Lock the Tailwind scale.** Delete the default spacing scale; expose only the seven values in §1. A wrong class fails the build instead of failing review.
3. **Lint arbitrary values.** `p-[13px]`, `text-[15px]`, `border-gray-800` → blocked via oxlint + the existing Husky pre-push hook.

---

## Review checklist

Before any UI patch:

- [ ] Spacing values are from §1 only. No arbitrary values.
- [ ] Outer padding > inner gap.
- [ ] Rows separated by `divide-y`, not gap.
- [ ] Font sizes from §2. Weight is 400 or 500.
- [ ] Every number has `tabular-nums`.
- [ ] Numbers go through `Intl`; quantities carry units and sigFigs.
- [ ] No hardcoded colors. Readable if the background were near-black.
- [ ] Status colors and category colors not mixed.
- [ ] Card has border **or** shadow, not both.
- [ ] `loading` / `empty` / `error` states all implemented; skeleton height matches.
- [ ] Error boundary is per-card.
- [ ] `<section aria-labelledby>` + `<h2>`, not a bare `div`.
- [ ] Hooks called before any conditional early return.

---

## Open questions

- Grid gap (16) sits below card padding (20). Deliberate — border does the separating — but worth revisiting if cards read as merged.
- Type scale needs semantic names in the Tailwind config; 11px and 13px are not in the default scale and must not be added as arbitrary values.
- Where does the chart palette live? It must be importable by both the DFT workspace and any future export path, but unreachable from status-color code.

---

## Non-goals

This file governs how surfaces look and behave. It does not govern what gets built or in what order.
