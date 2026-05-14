# Changelog

## [R162] - 2026-05-14

### Added
- **Demo dataset** for spectra: real W18O49 rod XRD data at `/public/demos/spectra/`, dropdown UI on experiment page reduces time-to-first-analysis to <2 min for new users
- **Internal reference card citation** (spectra-4b + ai-5c): tenant-uploaded ICDD/JCPDS reference cards now appear as citation candidates alongside COD/MP, ranked by `matchScore` (R161 algorithm). Threshold 0.3 (Trust > Coverage).
- **Reference cards library page** `/dashboard/reference-cards`: browse all tenant cards + detail view `/dashboard/reference-cards/[id]` with peak table
- **Stage 1 security** (per `labyra-strategy.md`):
  - Firestore-based rate limit (`src/lib/security/rate-limit.ts`) — 5/min reanalyze, 30/min uploads/cards. Atomic via Firestore tx, TTL on `expiresAt` field, interface stable for Stage 2 Upstash migration
  - Origin header check (`src/lib/security/origin.ts`) — CSRF defense via allowlist (prod + Vercel preview regex + localhost). Merged into existing `src/proxy.ts` (Next 16 middleware).
- **Type-safe tenantId helper** `getTenantIdFromToken(decoded)` in `src/lib/auth/token.ts` — replaces `as string | undefined` cast across 22 API routes
- **Server-side tenantId helper** `getCurrentTenantId()` in `src/lib/auth/server.ts` — cookie-based for Server Components
- **Scientific docs**: `docs/scientific-methods/xrd-analysis.md` §16 (demo dataset rationale) + §17 (internal library matching algorithm + Stage 2 trigger)
- **Security docs**: `docs/security/rate-limiting.md` + `docs/security/csrf.md` + ADR-015

### Changed
- **Rebrand** Labrya → Labyra across 13 files (53 brand strings + 21 identifiers `labrya.experiments.*` → `labyra.experiments.*`). User-facing impact zero (i18n already clean).
- **XRD prompt grounding** (worker): replaced loose "best match based on (a/b/c)" criteria with 5 strict rules. `candidates[0]` is authoritative — AI cannot re-rank. Includes Vietnamese version + tagged `rank`/`is_top` in user prompt for explicit visibility.
- **CitationChip + XRDPhaseSummary**: branch rendering for internal source (peak preview chips instead of lattice grid, Library badge with phaseName not UUID, internal `<Link>` route vs external `<a target=_blank>`)
- **i18n cleanup**: materials/samples edit pages + reference-card detail page now respect locale (previously hardcoded Vietnamese on edit pages, hardcoded English on reference-card detail)
- **Subscript formulas** on reference-card detail page via `formatSciText()` server-side pre-processing
- Worker `analysis_version` unchanged (spectra-4b-1.4.0) — grounding fix is prompt-only, no schema change

### Fixed
- **R161 hidden bug**: `XRDPhaseSummary` component existed but was never mounted in `spectrum-analysis-section.tsx` → user never saw COD/MP candidate cards. Fixed by mounting + merging with internal candidates.
- **React Rules of Hooks violation**: `useMemo` for `mergedCandidates` was placed AFTER conditional early returns in `spectrum-analysis-section.tsx` → runtime crash "Rendered more hooks than during the previous render" on prod spectrum detail page. Hoisted above all returns with null-safe deps.
- **Next.js 16 conflict**: created `src/middleware.ts` when repo already has `src/proxy.ts` (Next 16 renamed middleware → proxy) → build error "Both middleware file and proxy file detected". Merged Origin check logic into proxy.ts.
- **Client/server boundary**: `internal-candidates.ts` imported `matchScore` from a `firebase-admin`-importing service module → would bundle Admin SDK into client. Extracted `matchScore` to pure module `src/lib/spectra/match-score.ts`.
- **Lint**: 84 → 69 warnings, 0 errors. Removed unused `Timestamp` imports (3 routes), unused `useEffect` import, unused `confidenceVariant` function, `t` variable. Replaced `Array.sort()` with `.toSorted()` (4 sites). Wrapped debug `console.log` with `NODE_ENV` guard. Fixed `\/` regex escape in rate-limit.ts.

### Security
- **Origin CSRF check** verified on prod: cross-origin POST returns 403 `forbidden_origin`
- **Rate limit** verified on prod: 6th `/api/spectra/[id]/reanalyze` within 60s returns 429 with `Retry-After: <seconds>` header
- Manual one-time setup required: Firestore TTL policy on `_rate_limits.expiresAt` (Firebase Console → Indexes → TTL)

### Tech debt deferred to R163+
- 19 of 22 API routes still lack rate limit (only 3 expensive endpoints covered)
- No per-IP rate limit on auth endpoints (Stage 3 enterprise)
- 7+ Server Components still cast `decoded.tenantId` (refactor to use `getCurrentTenantId()`)
- `parseHkl` doesn't handle Unicode overline notation `1̄ 0 0`
- Reference card detail page is read-only (no edit/delete UI; CRUD only via dialog manager)
- CLAUDE.md says "Lucide only" but codebase uses `@tabler/icons-react` — doc update needed

## [R161] - 2026-05-14

### Added
- **XRD Tier 1+2 metrics** (per-peak): d-spacing (Bragg), Scherrer crystallite size D (nm), integral breadth β, dislocation density δ (1/D²), microstrain ε (β·cosθ/4), hkl from citation match
- **XRD quality metrics card**: scan range, step size, λ effective, SNR, smallest FWHM, crystallinity %
- **Per-phase summary card**: lattice params (a/b/c/α/β/γ), space group, crystal system, citation chip with View source link
- **Profile function fitting**: Gaussian, Lorentzian, Pseudo-Voigt (default) via scipy.optimize.curve_fit with R² goodness gate
- **Zero shift correction**: manual 2θ offset input (instrument calibration)
- **Citation cache**: Protocol pattern abstraction (FirestoreCitationCache + NoOpCitationCache), migration-safe for future Redis/Postgres
- **Re-analyze button** on spectrum detail page (Pub/Sub republish for backfilling new fields)
- **NavBack** universal component (window.history aware, fallback to URL)
- **DataTable** generic sortable + collapsible + Excel export
- **Reference card overlay** (4a-pdf): manual paste XRD reference cards from HighScore Plus / ICDD format, vertical sticks on chart, legal-safe (user-provided data only)
- **Subscript rendering** for chemical formulas with variables: W₁₈O₄₉, WₙO₃ₙ₋ₓ, Fe₁₋ₓCoₓO₃
- **AI determinism**: temperature=0 for reproducible phase identification
- **MP formula capitalize**: periodic table tokenizer (WO3 not wo3)
- **Scientific methods documentation**: `docs/scientific-methods/xrd-analysis.md` (15 sections)

### Changed
- Migrated 4 tables (Materials, Samples, Experiments, Spectra) to DataTable component
- Cloud Run worker scaled: concurrency 5→10, RAM 2→4Gi
- Gemini config: gemini-3-flash-preview model (single-turn safe; multi-turn deferred for thought_signature handling)
- Worker analysis_version: spectra-4a-1.0.0 → spectra-4b-1.4.0

### Fixed
- Lint cleanup: 12 errors → 0 (no-useless-escape, prefer-string-starts-ends-with, jsx-a11y, no-new-array, no-useless-fallback-in-spread, next/no-html-link-for-pages)
- Pre-push hook: 60s → 6s (tsc --noEmit only)
- MP API 400 Bad Request (formula case sensitivity)

### Performance
- Citation lookup cache hit rate: cold start ~25-30s → warm ~5-10s (3-5x speedup)
- Cloud Run throughput: 2x with concurrency=10

### Security
- All new endpoints (reference-cards CRUD, reanalyze) require Firebase auth + tenantId claim
- Zod validation with strict length/range limits (max 50KB pasted text, 3-200 peaks, etc.)
- Tenant isolation via Firestore path scoping

