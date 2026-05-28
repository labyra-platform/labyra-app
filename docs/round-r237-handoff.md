# Round R237 Handoff — Papers Polish + Group Quota Foundation

**Date:** 2026-05-28
**Scope:** R232g → R237a. Crash fixes, CLS, group-scoped KB, pricing ADRs, tab UI (in progress).

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

## IN PROGRESS — Tab Edge-style UI (NOT done)

**Files:** `paper-tabs-bar.tsx`, `tab-group-colors.ts`, `icons.tsx`

User wants tabs identical to Microsoft Edge:
- Vertical separators between tabs
- Group tabs: 2px group-color bar on TOP spanning the group
- Group chip: solid group-color bg + white text, no dot, no border, full tab height
- Active tab: must POP — bright bg, top rounded, shadow, seamless with content below
  (hide border-bottom, -mb-px, z-10). Like Edge "floating tab sheet".
- Icon: `PdfFileIcon` original SVG (sheet + red "PDF" label, Zotero-style) — DONE in
  icons.tsx as `Icons.pdfFile`. NOT Adobe logo (copyright).

**Status:** tried step1→1d. User still says active tab doesn't pop like Edge. Latest:
`z-10 -mb-px rounded-t-lg border border-b-0 shadow-[0_-2px_6px...]`. Needs precise Edge
CSS reference (inspect a real Edge tab's computed style) rather than describing in words.

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
5. R237b — UI: Info "this paper's DOI" verified + citations numbered + outbound/inbound split.
6. R236b — Cost Guard group.plan refactor + Pinecone groupId metadata (TEAM-5).
7. costUsd security — move from client snapshot to papers/{id}/private/cost admin-only.
   BLOCKER before SaaS.
8. ADR-044 Legal/Copyright — PDF storage ToS, DMCA takedown (access_status), safe harbor.

---

## Pricing model (locked)
Tenant (billing) > Group (quota+cap) > Seat (access). Hybrid base seat + AI usage +
overage. Per-group quota+cap. Paper default group + 'lab-shared'. Member 1 group (later 2).
Tiers Starter/Pro/Lab TBD. Cap soft 2x/hard 3x + per-user 100/hr. Superadmin = nAM.

## Perf invariants (consider adding to CLAUDE.md)
I1 render O(viewport); I2 per-tab ≤50MB; I3 no realtime loop full collection; I4 heavy
deps dynamic-import; I5 self-host assets; I6 lite/advanced toggle; I7 workbench OR ext-tab.
