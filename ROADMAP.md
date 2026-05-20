# Labyra App — Roadmap

> Long-term planning. Update sau mỗi phase complete.
> See CLAUDE.md cho coding rules, AI_ARCHITECTURE.md cho system design.

<!-- R175-docs-update-2026-05-16 -->

**Last updated**: 2026-05-16
**Current state**: R175-1 Writer citation format SHIPPED. 6-tier AI production live. Cost controls + Cloud Functions cron + Founder dashboard all operational. Next: R176 paper metadata backfill OR BigQuery drift integration.

---

## Vision

Labyra Platform = AI-native lab management SaaS cho materials science research.
Multi-tenant từ đầu (Lab Vật liệu BKU = tenant #1, commercial scale sau).

---

## Stack

Next.js 16 + TypeScript strict + shadcn/ui + Tremor + Firebase + next-intl + Vercel.
Charts: recharts (dashboard) + Plotly.js (scientific) + Three.js (3D Phase D) + D3 (lineage + citation network).
AI: Anthropic Claude (Sonnet 4.6 + Opus 4.7) + Google Gemini Flash 2.5 + Voyage embed + Pinecone serverless + Mistral OCR.
Async pipeline: Vercel publisher → Cloud Pub/Sub → Cloud Run Python worker (R167).
Cron infra: Firebase Functions Gen 2 asia-southeast1 (R171).

---

## 🔐 Commercial launch track (ACTIVE — priority #1)

Goal: full paid commercial launch. Gated on security + RBAC + onboarding + billing.
Reference: `securityaudit20260520.md` (current — supersedes LABYRA-SECURITY-FINAL-REPORT.md).

### Security criticals
- [x] **C1 — Firestore rules catch-all** — FIXED + tested (33/33) + DEPLOYED (R183-1)
- [x] **H3 — audit endpoint IDOR** — verified already correct (loads via Firestore path with conversationId, not collection-group)
- [x] **C2 — `__Host-session` cookie** — DONE. `/api/auth/session` POST/DELETE, HttpOnly/Secure, proxy.ts + server.ts read `__Host-session`, auth-provider fetch instead of document.cookie.
- [x] **C3 — signed-download tenant-prefix** — DONE. Prefix guard on measurements + papers + Cache-Control: no-store.

### Security highs + mediums
- [x] H1 preview origin; H2 chat length cap + metadata sanitize; H4 Zod (upload-complete+audit);
      H5 cron timingSafeEqual; M1/M2/M3/M5/M6/M7/M8/M9 done (M4 N/A — Pub/Sub). Headers shipped
      (CSP Report-Only burn-in → flip to enforce after 7d; COOP same-origin-allow-popups; CORP).
      Mozilla ~70 (report-only). L1-L4, F1 done; F2 no-action, F3 deferred.

### RBAC API enforcement (ADR-030 — BLOCKING)
- [x] API role enforcement DONE. getRoleFromToken + authenticateWriter/authenticateAdmin.
      ~45 routes swept (writer-gated mutations; viewer read-only). Anti-escalation in invite create.

### Onboarding backend (ADR-031 — invite-only phase 1)
- [x] VERIFIED: Members page = mockup. No Cloud Function — claims via API routes + Admin SDK.
- [x] BACKEND DONE (ONBOARD-1): invite data layer + API routes (/api/invites,
      /api/onboarding/pending+accept), email-match, anti-escalation, rules client-deny + index.
- [ ] FRONTEND (ONBOARD-2): orphan guard in dashboard layout → /onboarding page;
      Members UI (list + create-invite form) replacing mockup.
- [ ] Tenant-create flow + self-serve: deferred to billing phase.

### Then (post-security)
- [ ] Chemicals/Equipment/Bookings (port LabBook; Experiment=Activity hub)
- [ ] Billing/Stripe + trial/paywall + email + Legal (Privacy/ToS, GDPR export/delete)
- [ ] Dashboard KPI + Spectra Comparison view

---

## ✅ Completed Rounds

### R160 — Foundation + AI (April–May 2026)

- Infrastructure: Next.js 16, Firebase multi-tenant auth, i18n vi+en, Dashboard, Core domains
- AI Phase ai-3/ai-4/ai-5: Provider abstraction, Haiku tier dispatcher, T3 Opus reflection, RAG (Voyage + Pinecone + Mistral)

### R161 — XRD scientific upgrade (May 14)

XRD Tier 1+2 analysis, hkl wire, Cloud Run concurrency, per-phase summary.

### R162 — Stage 1 Security (May 14, [ADR-015](adr/ADR-015-stage-1-security.md))

Firestore rate limit + Origin allowlist + CSRF in `proxy.ts`. Stage 2 trigger = 20+ labs.

### R163 — Spectra multi-type refcards (May 14)

FTIR/Raman/UV-Vis reference cards.

### R164 — PROV-O ELN (May 14–15, [ADR-016](adr/ADR-016-prov-o-eln-architecture.md))

7 entities, PROV-O base fields, lifecycle, versioning, D3 lineage graph, 30 REST endpoints, migrations.

### R165 — Cleanup + Polish (May 15)

Oxlint cleanup, worker grounding parity, Reference UI port, ai-5b processor wire, samples migration.

### R166 — ai-6 GraphRAG Phase 6a (May 15, [ADR-017](adr/ADR-017-citation-network.md))

Citation extraction data layer: Citation types, service, Crossref+OpenAlex clients, references parser, orchestrator wire.

### R167 — Async Pub/Sub paper pipeline (May 15, [ADR-018](adr/ADR-018-async-worker-architecture.md))

Vercel publisher → topic `paper-processing` → `spectra-worker` Cloud Run. 16-page paper 16s vs 60s timeout. Sub-rounds A through C2 E2E verified.

### R168→R175 — Full 6-tier AI production (May 16) ← NEW

#### R168-3.13 (commits `ddb83dd`, `f9481ff`)
- AI architecture doc refresh v3.0 (303 LOC, replaced 2046 LOC outdated)
- `.claude/skills/labyra-economics` skill
- Whitelist `.claude/skills/` for repo tracking

#### R169 (commit `ea20db8`) — Capability abstraction + cost telemetry
- 6-tier abstraction: `Capability` type, `CAPABILITY_MAP`, `TIER_CAPABILITY`
- AiTier expanded `0|1|2|3` → `0|1|2|3|4|5`
- Cost telemetry per tenant per day with breakdowns
- [ADR-019](adr/ADR-019-ai-tier-architecture.md)

#### R170 (commit `c1aff61`) — Cost Guard v2 + dry-run
- 4-gate pre-check (per-call, daily, monthly, feature quota)
- Cost estimator before LLM call
- Dry-run mode `?dry_run=1`
- [ADR-020](adr/ADR-020-cost-controls.md)

#### R171 + R172 (commit `a91a9c2`) — Cloud Functions + Superadmin dashboard
- 3 cron functions live asia-southeast1:
  - `backupCostsDaily` 02:00 UTC
  - `reconcileCostDrift` 02:30 UTC
  - `ragasEvalWeekly` 03:00 UTC Sunday (11 metrics via Opus 4.7)
- Founder dashboard `/dashboard/superadmin/{costs,evals,drift}`
- Cost Guard structured logging in Vercel
- CLI: `set-tenant-tier`, `cost-query`, `set-superadmin`

#### R173-4 + R173-5 (commit `5da428c`) — T4 Writer + T5 Auditor orchestrators
- T4 Writer: `runWriter()` with section-specific prompts (methods/results/discussion/intro), RAG context, citation extraction
- T5 Auditor: `runAuditor()` with claim extraction, Opus 4.7 evaluator, 4-verdict scoring
- POST `/api/messages/[id]/audit` endpoint (Option B explicit trigger)

#### R173-hotfix4 (commit `9fda56c`) — Vercel build fix
- tsconfig exclude `functions/` directory

#### R174 (commit `fd304fd`) — UX polish + T4 routing + Gemini stability
- Gemini 3 series rolled back to 2.5-flash (SDK signature gap)
- Tier badge realtime via `message_start.tier` event
- Thinking indicator (Gemini-style animated dots)
- Wide chat container `max-w-5xl`
- Gemini functionResponse role split (role='function')
- T4 keyword override (classifier unreliable for tier=4)
- Writer prompt strict no-questions
- Tier labels T1 Flash / T2 Sonnet / T3 Opus / T4 Writer / T5 Auditor

#### R175-1 (commit `9f834a2`) — Writer citation format `[authorYear]`
- `citation-loader.ts`: batched paper metadata read
- `buildCitationKey()`: authorSurname + year with collision suffix
- Vietnamese name handling (Nguyen/Tran/Le/Pham heuristic)
- Fallback `unknown<hash>` when metadata absent

---

## 🚧 Active: R176 — Paper metadata backfill + BigQuery completion + UX edge cases

### R176-1 (HIGH) — Paper metadata backfill

**Issue**: Papers in `tenants/{tid}/papers/` lack `authors` + `year` fields. R175-1 citation-loader falls back to `unknown<hash>` keys. Need backfill to enable clean `[authorYear]` citations across all T4 Writer outputs.

**Approach**:

1. Iterate `tenants/{tid}/papers/` where `authors == null OR year == null`
2. If `doi` extracted (from worker `metadata.py`), query Crossref API → fill authors/year/title
3. Else, LLM extract from first chunk text (Haiku 4.5 — fix year=0 bug noted in R167 handoff §3.4 first)
4. Update Firestore doc

**Estimated**: 3-4h

**Files**:
- NEW `src/lib/ai/tier4-writer/metadata-backfill.ts`
- NEW `scripts/backfill-paper-metadata.mjs`
- FIX worker `src/papers/metadata.py` `_parse_metadata_json()` year coercion

### R176-2 (MEDIUM) — BigQuery cost-drift integration

**Status**: BigQuery billing export enabled May 16, initial sync ~24h. Data available May 17+ in table:
```
labyra-app-dev.gcp_billing_export.gcp_billing_export_v1_01545E_FF945F_4AF504
```

**Task**: Update `functions/src/scheduled/cost-drift.ts` `fetchGoogleActual()` from placeholder `return 0` to BigQuery query:

```sql
SELECT SUM(cost) AS total_cost
FROM `labyra-app-dev.gcp_billing_export.gcp_billing_export_v1_01545E_FF945F_4AF504`
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
  AND service.description IN ('Gemini API', 'Cloud Functions', 'Cloud Run', 'Pub/Sub')
```

Per-tenant attribution via share ratio (no native Google tenant breakdown).

**Estimated**: 1.5h

### R176-3 (MEDIUM) — T2 empty response bug

**Reproducible**: T1 tool call returns result → T2 Sonnet response → `...` empty bubble. ~10-15% of multi-turn conversations.

**Investigate**:
- Enable streaming debug logs in `src/lib/ai/providers/anthropic.ts`
- Check if `text_delta` events emit or response suppressed
- Test direct API call vs through Labyra route

**Estimated**: 2h

### R176-4 (MEDIUM) — Long-conversation Writer prompt drift

After 2-3 turns, T4 Writer starts asking follow-up questions despite "DO NOT ask" rule. Context dilutes attention.

**Mitigation**: Inject reminder instruction in user-turn message just before generation:
```ts
const reinforcedMessage = `${userMessage}\n\n[System reminder: Output draft only. No questions.]`;
```

**Estimated**: 1h

### R176-5 (LOW) — Audit findings UI

T5 Auditor saves `tenants/{tid}/aiAudits/{auditId}` but no UI display. Need "Audit" button on assistant message + findings cards inline.

**Estimated**: 3h

---

## 🗺️ Roadmap thereafter

### R177-R179 — Domain expansion

- **Spectra 3d**: PL / EDS / BET parsers (~3h/method)
- **Spectra 3e**: CV / LSV / EIS electrochemistry (~3h/method)
- **Domain content docs deep**:
  - UV-Vis Tauc bandgap full Kubelka-Munk derivation
  - FTIR ATR vs KBr sample prep
  - Raman laser wavelength selection
  - TGA gas atmosphere effects
  - Materials science plausibility rules for Ragas eval

### R180+ — Forms + onboarding hardening

- Material form PROV-O upgrade (`derivedFrom`, `parentMaterialIds`)
- Form validation strengthen (chemical formula regex)
- Multi-select sampleIds in Experiment form

### R185+ — Citation network UI (R166 Phase 6b deferred)

- D3 force-directed graph on paper detail page
- "Cited by" section + filter by confidence
- AI tool `searchCitations` + dispatcher integration

### R190+ — Phase D advanced scientific viz

- 3D crystal structure viewer (Three.js)
- BZ Brillouin zone visualization
- DFT band structure plotting

### R195+ — Gemini 3 re-adoption

- Monitor `@google/generative-ai` SDK for `thought_signature` support
- Re-test multi-turn tool calling
- Restore T0+T1+T2 to gemini-3.x-* when stable

### R200+ — Commercial scale

- Stage 2 security (Upstash Redis rate limiting at 20+ labs)
- Self-serve tenant onboarding
- Billing + plan management
- Multi-region deployment

### Parallel — labyra-landing marketing

L8 VN copy review, L9 Preact swap, L10 Accessibility 100, L11 Analytics, L12 Custom domain, L13 Email signup.

### Deferred / legacy

- Bug #11 notifications (deferred from R116-R126)
- labbook-bku R157a PDF export (legacy maintenance)
- labbook-bku merge `ai-assistant` → main (legacy housekeeping)
- T5 auto-trigger after T3 (need baseline data first)
- Citation export BibTeX / CSL JSON

---

## Phase markers convention

`@phase R{NUM}{-suffix}` in code comments (e.g., `@phase R175-1`).
Each architectural change deserves an ADR (`docs/adr/ADR-{NUM}-{slug}.md`).

Active ADRs:
- ADR-015 Stage 1 Security (R162)
- ADR-016 PROV-O ELN (R164)
- ADR-017 Citation Network (R166)
- ADR-018 Async Worker Architecture (R167)
- ADR-019 AI Tier Architecture (R169)
- ADR-020 Cost Controls (R170)
- ADR-021 Inter-tier Protocols (R169-R170 deferred parts)

---

## Timeline reality check

- **R160–R175 elapsed**: ~32 days
- **Velocity**: ~5–8 phases / week (R168→R175 in single day was exceptional)
- **Code growth**: ~50k+ LOC TypeScript, 12k+ LOC docs (24% doc ratio)
- **Doc/Code ratio**: 24% (industry standard 10–15%) — high trust, sustainable

Production state May 16:
- ✅ 6-tier AI production fully wired (T0-T5)
- ✅ Cost controls + telemetry + cron infrastructure
- ✅ Founder dashboard
- ✅ Lab BKU ready for survey deployment

Next critical: paper metadata backfill (R176-1) unblocks clean academic citations across all Writer outputs.
