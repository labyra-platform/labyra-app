# Round R237 Handoff — Papers Polish + Group Quota Foundation

**Date:** 2026-05-28 (updated 2026-05-30)
**Scope:** R232g → R237cp. Crash fixes, CLS, group-scoped KB, pricing ADRs, tab UI,
DOI/citation quality, OpenAlex classification, library dashboard, cost reporting,
citation panel redesign + publisher/Open-Access filter.

---

## Shipped (committed + pushed)

### R232g — Detached ArrayBuffer crash fix (FINAL)
- **Problem:** PDF.js transfers/detaches ArrayBuffer when `<Document file={{data}}>`
  receives it. Re-renders between loads reused the detached buffer → crash at
  `pdf-viewer.tsx` `<Document>`.
- **Fix:** hand `<Document>` a **Blob URL** (`URL.createObjectURL`) instead of raw
  ArrayBuffer. PDF.js fetches Blob URL like a file — no transfer/detach. Revoke on
  paper change/unmount. Cache still holds master ArrayBuffer.
- Supersedes the failed R232a–f attempts (all kept feeding ArrayBuffer).

### R235 — CLS fix (1.197 → 0.085)
- **Problem:** placeholder height = `pageWidth * Math.SQRT2` (assumed A4). Real pages
  differ → layout shift on each page render.
- **Fix:** measure real aspect via `Page onLoadSuccess` → `getViewport({scale:1})` →
  `pageAspects` map. Placeholder uses real aspect (first known page as default).

### R235b — Page-shaped PDF skeleton
- Replaced flat grey box with a paper-shaped skeleton (title + author + paragraph
  blocks on white) while PDF loads. Reserves aspect 1/1.414 to keep CLS low.

### R236a — Group-scoped paper KB (ADR-034 TEAM-4)
- Client filter in `usePapers()`: `!groupId || groupId==='lab-shared' || groupId===userGroupId`.
- Migration `round-236a-migration.mjs`: creates `groups/default-group` (plan='pro'),
  backfills `paper.groupId` + member `groupId` claim. Idempotent, dry-run default.
- Firestore rules TEAM-4a already present (group-scoped read). Tested: 24 papers,
  flip 1 to other-group → 23 (filter works), restore → 24.

### R234 — Pricing + Observability ADRs (design-only)
- **ADR-042:** Pricing + Quota. 3-tier Tenant(billing) > Group(quota+cap) > Seat(access).
  Hybrid: base seat + AI usage + overage. Per-group quota+cap. Paper default group +
  'lab-shared' share. 3 tiers Starter/Pro/Lab (numbers TBD market survey).
- **ADR-043:** Superadmin observability. Same-app `/dashboard/superadmin/*`, role gate,
  Tremor, 3 MVP widgets (cost timeline, volume+error, group leaderboard).

### R237a — Kebab menu (reprocess/archive)
- Gathered cancel/reprocess/archive into shadcn DropdownMenu in paper-detail. Kept
  "View PDF" as primary. Archive = destructive style.

### P-5 — Self-host PDF.js assets
- Copied `pdfjs-dist/cmaps` + `standard_fonts` to `public/pdf-worker/`. PDF_OPTIONS
  already pointed there (R231). Fixes Vietnamese/CJK glyphs + no CDN refetch.

---

## Shipped R237br → R237cp (2026-05-29/30) — DOI/citation quality, dashboards, cost, filter

### DOI quality (worker)
- **R237br** — KaTeX/title NFC normalization (combining marks broke
  `no-misleading-character-class`; normalize to NFC before render).
- **R237cc/cd** — DOI **verify**: each extracted main-paper DOI is confirmed against
  Crossref/OpenAlex; UI shows an "unverified" warning when it cannot be confirmed.
- **R237cg** — **reverse DOI lookup**: when no DOI is in the PDF, query Crossref
  `query.bibliographic` (title + first-author + year) and accept the candidate only
  if its title token-set Jaccard ≥ 0.70 (a wrong DOI is worse than none). Recovered
  the surfactant review → `10.1039/d0nr07339c`. Non-book DOI coverage → 25/25.

### OpenAlex authoritative classification (app + worker)
- **R237bz/ca/cb** — field classification from OpenAlex `primary_topic` →
  `PaperDomainBadge` (authoritative) + a field filter on the library. OpenAlex topic
  is preferred over the Gemini domain guess where present.

### Publisher normalization (app)
- **R237ch/ck** — `normalizePublisher()` in `journal-stats.ts`: strips trailing
  parenthetical org tags ("(ACS)"), legal suffixes (BV/Ltd/GmbH/Press…), and applies a
  PUBLISHER_ALIASES map (e.g. all Springer variants → "Springer Nature"). Display-only,
  no reprocess. Drives the publisher tree + the Overview chart.

### Library Overview dashboard (app)
- **R237cl** — `papers-landscape.tsx`: a "List | Overview" toggle on the Papers page.
  Overview shows stat tiles (papers/fields/publishers/year-span) + an OpenAlex-field
  pie + a publisher bar + a year histogram. Built on recharts + the shadcn
  `ChartContainer` (CSS `var(--chart-1..5)`); zero extra OpenAlex/Firestore calls.
- **R237cm** — click-to-filter: clicking a pie field or a bar publisher sets the
  library filter (`openalexFields` / `publishers` dims) and switches to the list view,
  with removable quick-filter chips.

### Cost reporting (standalone scripts, not in repo `src/`)
- `report-status.mjs` — full Papers snapshot (status / DOI-verified / OpenAlex field /
  Gemini domain / publisher raw→normalized / citation totals).
- `report-cost.mjs` — reads the self-tracked `paper.costUsd {ocr,enrichment,embedding,
  total}`. (Enrichment is $0 by design — `ENABLE_ENRICHMENT=false`.)
- `anthropic-cost.mjs` — pulls the Anthropic **Admin** `cost_report` / `usage_report`
  (needs an `sk-ant-admin…` key + an org account). Utility `.mjs` MUST live under
  `scripts/` (repo-root `.mjs` gets linted → `no-console` pre-push fail).

### Pricing refresh + Opus 4.8 (app + worker)
- **R237ci** — prices re-verified against anthropic.com 2026-05-30 (no numeric change):
  Opus 4.8/4.7 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5; cache-read 90% off; Opus
  tokenizer +35%. Added a `claude-opus-4-8` PRICING entry. (Opus 4.8 fast-mode $10/$50
  is NOT modelled.)
- **R237cj** — Tier-5 model promoted `claude-opus-4-7` → `claude-opus-4-8` (same price,
  stronger). Kept the 4.7 PRICING entry for historical cost rows. See ADR-019.

### Citation panel redesign + filter (app + worker)
- **R237cn** — panel redesign: removed the whole-section collapse (only one section);
  each reference now shows the cited paper's **title** (2-line clamp) + one muted line
  "first-author et al · year · journal"; the DOI is no longer shown as text and is
  **never** run through `formatSciNode` (it was subscripting DOI digits like "s43586");
  the paper's own DOI is filtered out of its own reference list; show-more/less moved
  onto the REFERENCES header. Cards ≈ ⅓ the previous height. Also moved the active-tab
  "lift" shadow into `.edge-tab-active` CSS using `color-mix(--foreground …)` so it
  works in dark mode (was hardcoded black).
- **R237co** (worker) — citations now store `targetPublisher` + `targetIsOpenAccess`.
  Crossref → publisher; **OpenAlex → `open_access.is_oa`** (+ publisher). Because the
  primary Crossref-`reference[]` branch carries neither, one batched OpenAlex call
  (`filter=doi:A|B|…`, ~50 DOI/call, free) fills both for every reference in both
  branches; `create_citation` backfills them on trusted existing docs during reprocess.
  See `docs/scientific-methods/citation-matching.md`.
- **R237cp** (app) — citation filter rebuilt as **Open-Access toggle + publisher
  multi-select** (replaces the old confidence chips). The filter bar only appears once
  enrichment has populated publisher/OA (hidden pre-reprocess to avoid an empty filter).

**Deploy order for the filter to work:** R237co (worker) → `./deploy.sh` →
`node scripts/reprocess-all.mjs` (backfills publisher/OA) → R237cp app.

---



**Files:** `paper-tabs-bar.tsx`, `tab-group-colors.ts`, `icons.tsx`

User wants tabs identical to Microsoft Edge:
- Vertical separators between tabs
- Group tabs: 2px group-color bar on TOP spanning the group
- Group chip: solid group-color bg + white text, no dot, no border, full tab height
- Active tab: must POP — bright bg, top rounded, shadow, seamless with content below
  (hide border-bottom, -mb-px, z-10). Like Edge "floating tab sheet".
- Icon: `PdfFileIcon` original SVG (sheet + red "PDF" label, Zotero-style) — DONE in
  icons.tsx as `Icons.pdfFile`. NOT Adobe logo (copyright).

**Status:** tried step1→1d. **R237cn** moved the active-tab shadow into
`.edge-tab-active` CSS using `color-mix(in srgb, var(--foreground) …)` (dark-mode safe;
was hardcoded black). The full Edge "pop" (precise computed CSS from a real Edge tab)
is still open. Needs an Edge tab's inspected computed style rather than word-descriptions.

**Gotchas hit (avoid repeating):**
- JSX comment `{/* */}` cannot sit between `return (` and `<div>` → syntax error.
- Variable name clash: `const url` (Blob) vs `let url` (signed) → use `objectUrl`.

---

## Pending (next sessions)

1. Tab Edge UI — finish/polish (priority 1)
2. Drag dnd-kit — reorder + drag in/out of group. Store has `reorderTabs(fromId,toId)`
   + `addTabToGroup` + `removeTabFromGroup`. Have @dnd-kit/core; add sortable+utilities.
3. R177-2 DOI resolver (worker) — main-paper DOI currently from Gemini OCR (metadata.py)
   → wrong "Phage→Please". Need B0-B5 module: embedded meta → regex pages 1-3 → Crossref
   validate (override title) → OpenAlex fallback → reverse title lookup → null+HITL.
   references_parser.py (citations) OK, just lacks numbering.
4. R177-3 — citations `referenceNumber` per paper + entry-based parser.
5. ~~R237b — UI: Info "this paper's DOI" verified + citations numbered + outbound/inbound
   split.~~ **DONE** (R237cd verify warning, R237cn panel redesign, R237cp filter).
6. R236b — Cost Guard group.plan refactor + Pinecone groupId metadata (TEAM-5).
7. costUsd security — move from client snapshot to papers/{id}/private/cost admin-only.
   BLOCKER before SaaS. (Security debt B — deferred until explicitly asked.)
8. ADR-044 Legal/Copyright — PDF storage ToS, DMCA takedown (access_status), safe harbor.
9. **Citation network / related works** (ADR-017) — OpenAlex `related_works` + `cited_by`
   → similar-paper suggestions + graph. Large; needs its own design pass.
10. **AI Science** (ADR-041) v0 — thin route on T4 Writer + `searchPapers` RAG
    (paper-writing assistant).
11. **Spectra worker R220+** — PEC Mott-Schottky, chopped chronoamperometry, GCD,
    Figure Builder.

---

## Pricing model (locked)
Tenant (billing) > Group (quota+cap) > Seat (access). Hybrid base seat + AI usage +
overage. Per-group quota+cap. Paper default group + 'lab-shared'. Member 1 group (later 2).
Tiers Starter/Pro/Lab TBD. Cap soft 2x/hard 3x + per-user 100/hr. Superadmin = nAM.

## Perf invariants (consider adding to CLAUDE.md)
I1 render O(viewport); I2 per-tab ≤50MB; I3 no realtime loop full collection; I4 heavy
deps dynamic-import; I5 self-host assets; I6 lite/advanced toggle; I7 workbench OR ext-tab.
