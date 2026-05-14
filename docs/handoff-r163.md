# Handoff R163 — Labyra App

> **From:** R162 (2026-05-14) — ALL DONE
> **Date:** 2026-05-14 end of session
> **Status:** Production stable, prod smoke verified

## R162 Summary

19 patches shipped across 5 batches + Firestore TTL manual setup.

### What shipped

| Area | Patches | Outcome |
|---|---|---|
| Stage 1 security | 8, 14, 17 | 19/22 mutation routes rate-limited (Firestore counter), CSRF Origin check in proxy.ts, ADR-015 |
| Internal refcard citation | 4, 4-polish, 9, 10, 17 | spectra-4b+ai-5c live, refcard PATCH endpoint, edit/delete UI |
| Worker grounding | (worker repo) | XRD strict 5 rules, candidates[0] authoritative, v=spectra-4b-1.5.0 |
| Demo dataset | 8, 18 | W18O49 (real) + TiO2 anatase + ZnO wurtzite (simulated) |
| Rebrand | 3 | Labrya → Labyra (13 files, 74 strings) |
| Lint | 6, 19 | 84 → 51 warnings |
| i18n | 11, 12 | Materials/samples edit + refcard detail respect locale |
| Docs | 13, 16 | CHANGELOG R162 + xrd-analysis §18 + citation-matching.md |
| Quick wins | 15, 15b | parseHkl unicode, CLAUDE.md icons, breadcrumb |

### Production verified

- Rate limit: 6th `/api/spectra/[id]/reanalyze` returns 429 + `Retry-After: 22`
- CSRF: cross-origin POST returns 403 `forbidden_origin`
- UI: edit/delete refcard works on prod
- AI grounding: W18O49 picks `mp-559122` (top score 0.432) correctly, no more `mp-733506` selection
- Firestore TTL on `_rate_limits.expiresAt` enabled via Firebase Console

---

## R163 Priorities

Ordered by ROI. Pick one path:

### Path A — Spectra coverage expansion (~2-3h)

**Phase 4c — FTIR/Raman/UV-Vis citation via web_search**
- Extend worker citation logic beyond XRD (currently COD/MP only)
- For FTIR/Raman/UV-Vis: no public structured DB exists at COD/MP scale
- Use AI web_search tool to find peer-reviewed wavenumber assignments
- Citation chip badge: "web_search · <paper title>" with DOI when extractable
- Risk: hallucination of DOI — mitigate with Crossref verification step
- Files to touch: `labyra-spectra-worker/src/citation/`, `src/types/spectra.ts` (CitationSource enum), `src/features/spectra/components/citation-chip.tsx`

**Phase 3d — PL/EDS/BET (~1-2h)**
- Add 3 more spectrum types to worker pipeline (currently 8 types live)
- PL: photoluminescence, simple peak detection + emission wavelength reporting
- EDS: energy-dispersive X-ray, element ID + composition % from line ratios
- BET: surface area calc from N2 adsorption isotherm (Brunauer-Emmett-Teller multipoint fit)
- Each type needs: parser, peak detection, AI prompt, scientific docs section

### Path B — Quality (~2h)

**Oxlint manual audit (51 warnings)**
- `typescript(no-explicit-any) × 21` — case-by-case typing, mostly Firestore query results + API responses
- `eslint(no-unused-vars) × 20` — audit + remove/prefix `_`, some legitimate (unused tuple destructure)
- `eslint(no-console) × 5` — wrap NODE_ENV or use `console.warn` (allowed)
- `unicorn(prefer-add-event-listener) × 3` — XHR refactor in `spectrum-upload-dropzone.tsx`
- `unicorn(consistent-function-scoping) × 2` — move `safe()` out of component in `equipment-table.tsx`
- Target: ≤ 20 warnings post-audit

**Read tier rate limit (GET endpoints)**
- 5 GET routes uncovered: `reference-cards/`, `reference-cards/[id]`, `spectra/[id]/analysis`, `spectra/[id]/signed-download`, etc.
- Tier: 100/min/tenant (read-cheap)
- ~30p effort

**7+ Server Components casting decoded.tenantId**
- Audit: `grep -rn "decoded.tenantId" src/app/[locale]`
- Refactor to use `getCurrentTenantId()` helper (cookie-based, R162 created)
- Type-safe + DRY

### Path C — UX polish (~1h)

**Reference card breadcrumb**
- Currently only "Back to spectra" link, no full breadcrumb chain
- Need to add to detail page header: Dashboard / Reference cards / {phaseName}
- Reference card listing page already has nav.referenceCards key (R162-batch1)
- ~20p

**Subscript on listing page**
- Listing table `/dashboard/reference-cards` shows "WO3" not "WO₃" in Formula column
- Apply `formatSciText` server-side or use `<SciText>` client wrapper
- ~10p

**Demo loading UX**
- Currently demo selection dropdown shows file names. Should show formula + label_vi/label_en + synthetic badge
- ~15p

### Path D — Security hardening Stage 2 (~3-4h, defer trigger)

**Only when:**
- 20+ active tenants on prod
- Documented abuse incident
- Firestore tx latency > 200ms p95

**Then:**
- Migrate `checkRateLimit` from Firestore counter → Upstash Redis
- Same interface `checkRateLimit(key, limit, windowSec)` — no route changes needed
- ADR-016 to document

**Per-IP rate limit for auth endpoints (Stage 3)**
- Login/signup brute force protection
- Cloudflare Turnstile integration
- Defer until enterprise launch

---

## Tech debt deferred (not blocking)

| # | Item | Reason deferred |
|---|---|---|
| 15 | `computeInternalCandidates` pagination | Scale > 100 cards/tenant trigger |
| 16 | AnalysisResult dead link when card deleted | Stage 2 migration window |
| 17 | Patch 4d band-aid commit `a34c6c6` | History rewrite risky |
| 18 | `_seconds`/`_nanoseconds` underscore | Firestore convention, allowed via config |

---

## Memory snapshot (R162 final state)

5 entries updated this session (3, 4, 5, 16, 22), 1 added (no-array convention). Memory at 30/30 — well-organized after rebrand cleanup.

Key insights:
- Next.js 16: `proxy.ts` not `middleware.ts` (memory #3)
- React Rules of Hooks: hooks before early return (memory #4)
- Stage 1 security pattern (memory #5)
- Client/server boundary (memory #16)

---

## Workflow reminders for R163

```bash
cd ~/LAB-MANAGER/labyra-app
# Patch file convention: round-r163-N-<name>.py
python3 /mnt/d/labbook-patches/round-r163-N-<name>.py
pnpm exec tsc --noEmit  # local pre-push hook validates
pnpm exec oxlint 2>&1 | tail -2
git add -A
git commit -m "<type>(<scope>): <summary> [R163-<phase>]"
git push  # husky hook runs tsc + oxlint
```

Worker repo: `~/LAB-MANAGER/labyra-spectra-worker`, deploy `bash deploy.sh`.

---

**End of handoff.** Next session: pick a Path (A, B, C, or D-defer), start with smallest patch first to warm up context.
