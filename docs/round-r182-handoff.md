# Round R179–R182 Handoff

> Session 2026-05-18 → 2026-05-19. Builds on R175–R178 (paper pipeline live, 6-tier AI, async Pub/Sub).

**Branch**: `main` (synced both `labyra-app` + `labyra-spectra-worker`)
**Commits app**: 8eee48f, 4c4a35b, 9738467
**Commits worker**: 12894a5, c214281, 4cb373a

---

## 1. Shipped

### R179 — Layer 2 data integrity + journal extract + react-pdf viewer

- **R179-1**: Cloud Function `auditOrphansWeekly` (Sunday 04:00 UTC) — scans Firestore for spectra/papers/references whose parent docs were deleted. Writes to `_orphan_audit/{date}`. See ADR-026.
- **R179-2**: Worker Step 1e journal resolver — Crossref + OpenAlex lookup by DOI, ISSN fallback. UI: `PaperFilterPanel` exposes journal filter. See ADR-027.
- **R179-3**: Soft archive papers — `POST /api/papers/{id}/deprecate` sets `lifecycleStatus='deprecated'` without delete.
- **R179-4/4b**: Gemini 3 Flash `thinking_level` adapter (replaces deprecated `thinking_budget`). All worker AI calls migrated.
- **R179-5**: Critical orchestrator.py indent fix — Step 1d/1e were dedented to function level, causing SyntaxError after recent changes. Re-indented INSIDE try block.
- **R179-6**: Step 1b error logging — write `metadataExtractError` field to Firestore on failure.
- **R179-7**: react-pdf v10 viewer — custom toolbar, page navigation, fuzzy title search via fuse.js. Replaces previous viewer. Rejected `react-pdf-viewer.dev` and `@react-pdf-kit/viewer` due to commercial licensing.

### R180 — Cancel UX + Cmd+K

- **R180-1**: Cancel endpoint sets `status='cancelled'` directly (skip transient `cancelling`). Fixes stuck cancelling when worker scales to zero.
- **R180-2**: kbar Cmd+K paper search — `usePaperActions` hook fetches top 30 recent active papers as dynamic actions under "Papers" section.

### R181 — OCR cache + classify v1.1 + citation sort + spectra path fix

- **R181-1**: OCR cache via GCS + SHA256 content hash. Stored at `gs://{bucket}/ocr-cache/{sha256}.json`, lifecycle 365-day delete. Estimated ~$0.001/page saved on reprocess.
- **R181-2 to R181-8**: PDF viewer rewrite (300 LOC) — decoupled ResizeObserver from page rendering, fixed infinite re-render loop, fullscreen race fix, container width lock, scrollbar-gutter stable.
- **R181-9**: Classify prompt v1.1 — added 5 new rules (7–11) preventing passing-reference false positives. Input window 3000 → 5000 chars. `PROMPT_VERSION` bumped to `v1.1`.
- **R181-10**: Citation sort by confidence priority: `doi-exact → manual → title-fuzzy → unverified`. Stable sort within same confidence.
- **R181-11**: Critical Firestore path bug fix — R164-phase-5b-2 renamed URLs `spectra→measurements` but actual Firestore collection + GCS storage still at `/spectra`. Reverted all query paths back to `spectra`. URL endpoints stay `/api/measurements`. Future R183+ should do proper Firestore migration.
- **R181-skill**: `.claude/skills/labyra-patch-workflow.md` — codifies session bootstrap, patch conventions, 10 recurring bug patterns.

### R182 — FTIR reference library seed

- 29 FTIR functional group reference cards seeded into `tenants/tenant-dev-001/references`.
- Sources: NIST WebBook + Coates IR Table (DOI: 10.1002/9780470027318.a5606).
- Hotfixes during seed: wrong collection (`referenceCards` → `references`), Zod validation (missing lifecycleStatus, version), FormulaSchema requires capital letter (rejected `R-OH`, `C=O`, `M-OH` etc.).
- See `docs/scientific-methods/ftir-reference-library.md`.

---

## 2. Bugs deferred

1. **FTIR FWHM negative** — R165-phase-3 attempted fix for PerkinElmer ASC descending x-array. Some files still produce negative FWHM. Suspect: descending detection logic, not all branches reverse y_abs. R183 task.
2. **API `/api/references` returns 500** intermittently when 0 docs exist in tenant. Reproducible on fresh tenants. R183 task.
3. **Tenant migration** — `spectra` collection should rename to `measurements` to match URL convention. Requires Firestore migration script + downtime window. R190+ scope.

---

## 3. Architecture notes

- AI_ARCHITECTURE bumped v3.1 → v3.2 (R182).
- New ADRs proposed: ADR-028 (architecture upgrade + Mozilla 100/100 security headers) and ADR-029 (graduated 5-level security testing). Both Status: Proposed — implement in R183–R187.
- 6-tier AI stack locked. Gemini Flash for T0–T2 (router + classify + spectrum analysis), Claude Sonnet 4.6 for T3–T4 (lab ops + theory chat), Claude Opus 4 for T5 (complex reasoning).

---

## 4. Open R183+ tasks

1. **FWHM negative fix** (R165-residual)
2. **Raman reference library seed** (~25 cards: G/D-band, T2g modes, phonon modes)
3. **UV-Vis reference library seed** (~20 cards: d-d transitions, plasmons, MLCT)
4. **ADR-028 Phase 1**: ship security headers + Idempotency Key + Feature Flags (R183 batch)
5. **ADR-028 Phase 2**: tenant isolation test suite (R184)
6. **ADR-029 Level 1+2**: static audit + automated vuln scan in CI (R184)
7. **MCP server MVP**: 3 tools (listChemicals, searchPapers, recentExperiments) — strategic pitch differentiator
8. **Spectra → Measurements Firestore migration** (R190+)

---

## 5. Memory state

- Memory entry #11 consolidated R179-R182 ship.
- Skill `labyra-patch-workflow.md` ensures next session bootstrap with `git status -sb` on both repos before any work.

---

*Last updated: 2026-05-19 by Claude session.*
