# Design rules

**Status:** adopted. §1–§12 are the spec; where reality contradicted a rule, the rule is amended in place rather than footnoted, and the reason is kept — a rule whose reason is lost gets re-broken.

**Encoded, not remembered** — §0 says a rule living only in this file has already failed:

| Rule | Where it lives now |
|---|---|
| §2 type scale | named tokens in `src/styles/globals.css`, **and registered with tailwind-merge in `src/lib/utils.ts`** (see §2 — without the second half the first half is decorative) |
| §1 + §4 + §7 + §10 | `src/components/ui-extra/panel.tsx`. Callers pick a component, not a spacing value |
| §8 quantities | `src/types/units.ts`. Cross-dimension arithmetic does not compile |
| §2 + §5 | `scripts/check-design-tokens.sh`, in the pre-push hook |

**The guard is a ratchet, not a wall.** Counts in `scripts/design-baseline.txt` may fall, never rise. New code cannot add debt; old debt is paid by lowering the number in the commit that fixes it. Blocking every push until a codebase is clean does not get the debt paid — it gets the hook deleted.

**Migrating in bulk is not the same as fixing.** Several hundred visual changes that no reviewer can verify is organised hope. The type scale still carries ~100 arbitrary sizes and ~32 off-scale ones; they were frozen, not migrated, and the number has only fallen since — because files get fixed when they are opened for some other reason. Do the same with spacing.

**Scope:** every surface in `labyra-app`. The dashboard was the first consumer, not the only one.

---

## 0. Why this exists

Consistency does not come from reviewers catching drift. It comes from removing the choice. Every rule below should end up encoded in a component, a Tailwind config, or a lint rule — never in a table nobody reopens.

A rule that lives only in this file has already failed. See §12.

---

## 1. Spacing

**A closed set of values. Anything outside it is a bug.**

> **Open — needs the owner.** This section says seven values and lists five. `src/` carries 3237 spacing classes and the five cover 54.9% of them. The two biggest gaps are not noise, they are relationships the table has no name for:
>
> | | uses | what it is |
> |---|---|---|
> | **4px** | 609 | tighter than inline — icon ↔ text inside a chip, label ↔ value stacked |
> | **24px** | 108 (+94 at 32, +57 at 48) | wider than card — between page-level bands |
>
> Adding those two gives seven and covers 77%. Adding 4 and 6 instead covers 84%, but 6px is not a relationship — it is "8 but slightly less", which is the wrong reason to put a value on a scale.

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

**No `h-full`.** This example used to carry it. It is redundant — `align-items: stretch` is the grid default, so cards in a row already end on the same line — and as a primitive default it was worse than redundant: a `Panel` rendered as a block child of a plain stack resolved `height: 100%` against the `flex-1` chain above it and took the full frame height. Three settings panels, ~900px each. A card that must fill asks at the call site.

---

## 2. Typography

**Six sizes. Two weights. No exceptions.**

| Token | px | Used for |
|---|---|---|
| meta | 11 | timestamps, secondary metadata, legends |
| caption | 12 | chips, counts, helper text |
| body | 14 | list rows, names, table cells, default UI text |
| heading | 16 | card titles |
| stat | 16 | numbers in the stat strip |
| title | 18 | section headings |
| display | 24 | page greeting |

**The scale is closed but not frozen.** It has changed twice — body 13→14 and heading 14→16, and a `display` 24 for the page greeting — each time by amending the table, never by smuggling a `text-2xl` into one file. That distinction is the whole point: changing a rule keeps the scale enforceable, breaking it does not. Six distinct sizes remain (11 / 12 / 14 / 16 / 18 / 24); `stat` and `heading` name the same 16 for different jobs, which is a synonym, not a seventh size.

### A token scale must be registered with tailwind-merge

Non-negotiable, and the most expensive thing this document has learned.

`@theme` declares the tokens to Tailwind. **tailwind-merge never sees `@theme`.** Given `text-meta` it recognises only the shape `text-<something>`, files it under text-*colour*, and drops it the moment a colour follows:

```
twMerge('text-meta', 'text-foreground')  ->  'text-foreground'   ← size gone
twMerge('text-sm',   'text-foreground')  ->  'text-sm text-foreground'
```

The second line works only because tailwind-merge ships knowing `text-sm`. So every `cn('text-meta …', 'text-foreground …')` rendered at the inherited size, and a role label written as 11px reached the screen at 16.

Nothing catches this. The class is valid. tsc and oxlint see strings. The build compiles. `check-design-tokens.sh` counts the class as present and passes. It survived four rounds and was found by a person looking at the screen.

Registered in `src/lib/utils.ts` via `extendTailwindMerge`. **Any new token group needs the same treatment or it is decoration.**

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

### Precision is data, not formatting

A balance reading of 0.0501 g:

- displayed as `0.05 g` → a real digit was thrown away
- displayed as `0.050100 g` → **precision was invented**

Band gap `2.6 eV` ≠ `2.60 eV` scientifically. `Math.round()` catches float garbage; it does not catch this.

Both failures are easy to make while fixing the other. R510 removed a `toFixed(2)` that was padding digits and left a `toFixed(2)` two files away that was discarding them.

Precision travels with the **measurement source**:

```ts
type Quantity<D extends Dimension> = {
  dimension: D
  value: number
  unit: Unit<D>
  decimals: number                    // absolute precision the source resolves
  source: 'balance' | 'dft' | 'instrument' | 'manual'
  kind?: 'point' | 'interval'         // temperature only — see below
}
```

**`decimals`, not `sigFigs`.** This document originally said sigFigs, and both sources it named constrain *absolute* precision, which significant figures cannot express:

| reading | decimals | sig figs |
|---|---|---|
| 0.0501 g | 4 | **3** |
| 12.3456 g | 4 | **6** |

One balance, one readability, two different sigFigs. Sig figs are a property of each reading, not of the source — storing them per-source is wrong for every reading but one. Conflating relative and absolute precision is the error this section exists to prevent. Sig figs still matter for multiplication and division; that belongs in a converter, and there is no quantity arithmetic yet.

**DFT precision is not the convergence threshold.** This document said it was. A `conv_thr` of 1e-8 Ry is ~1.4e-7 eV — six orders tighter than the printed digits. Quantum ESPRESSO prints HOMO/LUMO to four decimals, so their difference is known to four, which is exactly what `qe_parser.py` already encodes with `round(lumo_ev - homo_ev, 4)`. The output format binds first. The worker had made the decision correctly all along; the view was throwing it away.

**Precision converts with the value.** Four decimals in eV is 1e-4 eV, which is 7.3e-6 Ry — five decimals there, not four. Carrying `decimals` across a conversion unchanged invents or discards digits every time.

**Known limit, stated rather than papered over.** Converting to a finer unit than the source resolves, decimal notation runs out of ways to tell the truth: 1.32 g is 1320 mg, and nothing in "1320" says the last zero was never measured. Significant figures exist as a concept for this reason.

### Units are first-class, and dimensions are types

Never store a bare `number` for a physical quantity. Store `{ value, unit }`, convert through one converter, and **forbid addition across dimensions** — without it, 120 mL is eventually summed with 0.12 L, and any "total" panel is a sum, so it is where this fails first.

"Forbid" means the type system, not a runtime guard: `add(mass, volume)` must not compile. A check that fires in production has already shown someone the wrong number. `src/types/units.ts` carries the dimension as a type parameter; verified with `@ts-expect-error`.

**Store the source's unit, not SI.** SI storage round-trips fine numerically, and erases which instrument said what — which is provenance, not presentation (ADR-016). QE reports eV; a balance reports grams. Rewriting those as 4.3551e-19 J and 1.32e-3 kg keeps the number and discards the sentence "QE said this". A display preference must never reach the record.

**Temperature points and intervals convert differently.** 25 °C is 298.15 K, but a *rise* of 25 °C is a rise of 25 K. Nothing about the stored number says which was meant, so it is asked for, not guessed. Get it wrong and "the sample warmed by 25 degrees" becomes "warmed by 298".

**Sums take the coarsest term's precision.** 1.3240 g + 0.5 g is 1.8 g. The second measurement never had those digits.

### Locale

`Intl`, never hand-formatted — but *what* locale depends on what the number is.

| | Follows | Because |
|---|---|---|
| UI prose, dates, counts | the reader's language | "6 ngày trước" is written for a reader |
| **physical quantities** | **SI (ISO 80000), always** | `2.7183 eV` is written for a reviewer |

`1.240` (vi) and `1,240` (en) invert in meaning — and that is precisely why SI fixes the decimal marker for physical quantities instead of deferring to locale: a comma is never a thousands separator, because it is a decimal marker elsewhere. A band gap rendered `2,7183 eV` is correct Vietnamese and wrong physics; `12.345,6789` cannot be read at all. Grouping off: SI groups with a thin space, never a comma, and no grouping is unambiguous everywhere.

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

Three enforcement layers. Two of them were written as fiction and are corrected here:

1. **`ADR-044-design-tokens.md`** — same family as ADR-016 / 030 / 034 / 042 / 043. Still unwritten.

2. ~~**Lock the Tailwind scale.** Delete the default spacing scale.~~ **Ratchet it.** Deleting the scale does not fail a wrong class — it unstyles the application: `gap-1`, `gap-1.5`, `px-2` and `py-1` are 1100+ live classes and none are among the five. Spacing has to be migrated before it can be locked, and migrating it in bulk is a bet against a reviewer who cannot verify the result. Freeze the count instead, and let it fall.

3. ~~**Lint arbitrary values via oxlint.**~~ oxlint lints the JS/TS AST; Tailwind classes are opaque strings to it and it ships no Tailwind rule. `scripts/check-design-tokens.sh` follows the precedent this repo already set with `check-firestore-guards.sh` in the same hook.

**The guard's reach is the guard's honesty.** `check-design-tokens.sh` counts classes present in source. It cannot see what tailwind-merge does at runtime (§2), what a grid does to a stretched sibling (§13), or whether a class ever reached the DOM. Anything that needs a browser to observe is not enforced here, and this document should stop implying otherwise.

---

## 13. Failure modes that pass every check

Everything below shipped green: tsc clean, oxlint clean, build clean, guard clean. Each was found by a person looking at a screen. They are here because §0's promise — encode the rule and stop relying on reviewers — is only half true: some things no build can see.

### Spacing that encodes nothing

- **`h-full` on a card primitive.** Redundant in a grid, catastrophic in a block stack (§1).
- **Two helpings of the same padding.** `pt-6` on a `CardContent` inside a `Card`'s own `py-6` is 48px above the first label. Nobody chose 48; two people each chose 24.
- **A page-level top gap.** `pt-2` on every page under a header that already ends with a border. Spacing that encodes no relationship is the one thing §1 forbids.
- **Two hand-written constants for one measurement.** The header's height was written in the header and the sidebar's sticky offset was written in the sidebar. They drifted the first time either changed. One variable, or they will drift again.

### Layout that depends on the data

**A card's height is a property of the card, not of what it happens to contain.**

- A members list that grows and shrinks with the group reflows the page every time you switch groups.
- A chart with a fixed height inside a grid row stretched by a taller sibling leaves the difference as dead space.
- A filter that returns nothing removes the scrollbar, which changes the page width, which moves everything sideways. `scrollbar-gutter: stable` — the layout must not depend on how many rows survived.

Give the panel a viewport, derive it from the row height, and let the content scroll inside it.

### Alignment that is a coincidence

- **`items-center` against a taller sibling** centres a 36px control in a 40px row and puts its top edge 2px below everything else's. `items-stretch` makes the row one height, and the alignment stops being luck.
- **A sticky offset is a claim about what is above.** The header is `sticky top-0` *and in flow* — it already occupies its 56px. Adding that height again to a sibling's `top` counts it twice. Guessing `top-4` counts it at zero. Neither is a number; both are hopes.

### States that lie

- **Never skeleton static text.** A heading is not loading — it is in hand. Skeletoning it makes the panel change height when data lands, which is the shift skeletons exist to prevent.
- **A skeleton must match the loaded frame**, not just the loaded rows. Four states in four differently-sized cards is four layouts.
- **`flex-1` needs a flex parent.** An empty state told to grow inside a block wrapper sticks to the top of a 264px box and looks broken.

### Words that were never wired

- **Check `messages/*.json` before hardcoding English.** The deviation panel was fully translated and never called `t()`; `panel.emptyState` matched the hardcoded paragraph word for word. Vietnamese users read English there for months.
- **A `//` comment inside JSX children is a text node.** It renders. `{/* */}` outside the root element is a parse error. Only the second one fails the build.

### Hierarchy that isn't

- **Rank, not arrival order.** A list rendered in API order buries the group lead at position five — the one person most likely being looked for.
- **Four roles in one shade of grey say nothing.** The reason to show a role is that some carry more weight than others; identical styling flattens exactly the difference being scanned for.
- **A heading is a name, not a status bar.** Badges, versions, refresh buttons and run states packed into an `<h2>` become the landmark's accessible name: "Rietveld refinement good not converged". They belong in a trailing slot.
- **`role='button'` on a div** with a hand-rolled Enter/Space handler is a button someone rewrote by hand, worse. Use `<button>`.

### Numbers that look measured

`2.7183` was used as a sample band gap. It is Euler's number. oxlint caught it — a value that looks like a measurement, isn't, and got there without anyone noticing, inside the very file that exists to stop that.

---

## Review checklist

Before any UI patch:

- [ ] Spacing values are from §1 only. No arbitrary values.
- [ ] Outer padding > inner gap.
- [ ] Rows separated by `divide-y`, not gap.
- [ ] Font sizes from §2. Weight is 400 or 500.
- [ ] Every number has `tabular-nums`.
- [ ] Prose and dates go through `Intl` with the reader's locale; **physical quantities go through `formatQuantity` and are SI-formatted regardless of locale**.
- [ ] Quantities are `Quantity<D>` — never a bare number beside a unit string.
- [ ] No hardcoded colors. Readable if the background were near-black.
- [ ] Status colors and category colors not mixed.
- [ ] Card has border **or** shadow, not both.
- [ ] `loading` / `empty` / `error` states all implemented; skeleton height matches.
- [ ] Error boundary is per-card.
- [ ] `<section aria-labelledby>` + `<h2>`, not a bare `div`.
- [ ] Hooks called before any conditional early return.
- [ ] Any new token group is registered with tailwind-merge (§2), or it does nothing.
- [ ] Card height comes from the card, not from how many rows the data has (§13).
- [ ] No skeleton over text that is already in hand (§13).
- [ ] Strings come from `messages/*.json` — grep the namespace before writing English (§13).

---

## Open questions

- **§1's two missing values.** The section says seven and lists five; the data says 4px and 24px are the two relationships without names. Needs the owner's call, then a `off_scale_spacing` ratchet baselined at today's count — not a migration.
- **ADR-044.** §1–§6 tokens still need lifting out of this file into an ADR. Until then this document is both the spec and the record, which §0 warns against.
- Grid gap (16) sits below card padding (20). Deliberate — the border does the separating — but worth revisiting if cards read as merged.
- Where does the chart palette live? Importable by the DFT workspace and any export path, unreachable from status-color code.
- **§8 beyond band gaps.** `Quantity` covers DFT energies. Chemical masses, volumes and temperatures are still bare numbers in forms, so "forbid addition across dimensions" is true of the type and not yet of the app.

---

## Non-goals

This file governs how surfaces look and behave. It does not govern what gets built or in what order.
