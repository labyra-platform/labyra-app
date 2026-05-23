# ADR-035 — AI Long-Term Memory Architecture

**Status:** Accepted (M0 foundation shipped R192)
**Date:** 2026-05-23
**Supersedes:** none. **Related:** ADR-019 (6-tier), ADR-020 (cost), ADR-016 (PROV-O), ADR-033 (RAG prereq).
**Source design:** `docs/ai/aimemoryarchitecture.md` (proposal, 5-layer).

> ADRs are immutable — append, do not overwrite. Decisions below are locked.

## Context

The AI assistant has short-term (within-conversation) memory only. New chats lose
all prior context; the assistant re-asks "what do you research?" and users
re-explain preferences (language, verbosity) every conversation. The proposal in
`aimemoryarchitecture.md` defines a 5-layer system (L1 episodic, L2 semantic facts,
L3 procedural prefs, L4 tenant-shared context, L5 working scratchpad), shipped in
phases M0→M4.

Two design questions were left open in the proposal (Part 7) and are decided here,
under the project criteria: **Trust > Coverage → professional → durable**, systems
thinking, long-term.

## Decision 1 — L3 preferences live at TOP-LEVEL `users/{uid}/aiPreferences`

Preferences (language, math notation, verbosity, tone, preferred tier, references,
enableMemory) are attributes of the **human**, not the lab. A researcher belonging
to two tenants (e.g. PhD lab + consulting) is one person who wants one style.
Forcing prefs under `tenants/{tid}/` would re-introduce the exact pain the feature
removes (re-config per lab).

This is the **single intentional exception** to the invariant "all data under
`tenants/{tid}` with a tenantId filter." The exception is justified because:
- Preferences hold **personal settings, never scientific data**. The tenantId
  invariant exists to isolate scientific/research data across tenants; prefs are
  outside that category.
- Industry norm (ChatGPT memory, Claude) keeps user-style memory global per-user.

**Boundary — only L3 is global.** L1 (episodic) and L2 (semantic facts) remain
tenant-scoped under `tenants/{tid}/userMemories/{uid}/`, because research knowledge
("user studies WO₃ supercapacitors") is lab-bound and MUST NOT cross-pollinate
between tenants (Part 7 Q2: recommend NO). Split rule: **personal style = global,
research knowledge = tenant-scoped.**

Firestore rules: a new root-level `match /users/{uid}/aiPreferences/{settingsId}`
placed before the root default-deny, granting access only when
`request.auth.uid == uid`. Superadmin does NOT get an override — personal prefs are
not platform-operational data.

## Decision 2 — Memory is OPT-IN (default OFF)

`AiPreferences.enableMemory` defaults to `false` (`MEMORY_DEFAULT_ENABLED = false`).
L1+L2 extraction does not run until the user opts in.

Rationale under the project criteria:
- **Trust (#1 criterion).** Silently storing extracted facts about a user without
  consent is the single most trust-corrosive default for a scientific product.
  Opt-in keeps the user in control from turn one.
- **GDPR-safe for launch.** Opt-in satisfies Art. 6.1(a) consent; avoids a consent
  retrofit when entering EU. Aligns with the active launch-hardening track.
- **Professional / durable.** Transparent, user-controlled, no rework later.

Trade-off accepted: some users never enable memory → less delight. This is the
literal meaning of Trust > Coverage.

## Scope shipped in M0 (R192)

Data shapes + security boundary only. NO chat-pipeline integration (that is M1+).

- `src/types/memory.ts` — `AiPreferences` (L3), `TenantAiContext` (L4), `UserFact`
  (L2), `Episode` (L1); `MEMORY_DEFAULT_ENABLED = false`.
- `firestore.rules` — three new match blocks:
  - `tenants/{tid}/aiContext/{contextId}` — read tenant member, write admin (L4).
  - `tenants/{tid}/userMemories/{ownerUid}/{document=**}` — own-user within tenant
    only; no cross-user, no cross-tenant, no admin override (L1/L2).
  - `users/{uid}/aiPreferences/{settingsId}` — top-level, own-user only (L3).
- `tests/firestore-rules.test.ts` — extended with own/cross-user, cross-tenant,
  admin-cannot-read-private, superadmin-cannot-read-prefs, unauth-deny cases.

## Open questions still pending (block M1 sprint)

From proposal Part 7 — answer before M1:
- Q3 retention free vs paid tier (cost-control + upsell).
- Q4 allow user to manually add facts via UI form.
- Q5 log fact-extractor output to `aiProvenance` audit chain (recommend yes).
- G-3 prompt caching (Gemini SDK) must be verified working — M1 cost model depends
  on L3+L4 static segments being cached.

## Verification

Rules tests MUST be run on the Firestore emulator via `pnpm test:rules` (the
sandbox that authored M0 cannot download the emulator JAR — host not in network
allowlist). All new POSITIVE cases must SUCCEED and all NEGATIVE cases must be
DENIED before this is considered verified.

---

## M2 — Semantic fact extraction (shipped R193)

### Decisions (Part 7 resolved)

**Q3 — Retention cap → hard technical cap now, billing-tier deferred.**
`MAX_FACTS_PER_USER = 200` (fact-store.ts). This is NOT a billing-tier gate; it
prevents unbounded Firestore growth + injection cost. A researcher has ~20-50
meaningful facts, so 200 only triggers on anomaly (loop/spam/extraction bug).
Tier-based caps (free vs paid) layer on top in the billing phase — one constant.

Eviction is **NOT FIFO**. `selectEvictions()` protects: (a) user-verified facts
(verifiedAt != null), (b) HIGH_VALUE_SUBJECTS (research_focus, material_systems,
expertise_level). It evicts lowest-confidence, then oldest, among unverified
non-high-value facts. Rationale: the oldest fact is often the most important
("user studies WO₃" — stated once, true forever); FIFO would delete core identity.

**Q4 — Manual fact-add → deferred. Xem+xóa NOT deferred.**
M2 ships auto-extraction + a UI to VIEW + DELETE facts (trust/GDPR, non-negotiable:
`/dashboard/settings/ai-preferences` renders `RememberedFacts`; GET/DELETE
`/api/me/facts`). Letting users TYPE new facts is a nice-to-have deferred (it needs
a different provenance model — manual facts have no sourceQuote).

**Q5 — Audit fact writes → YES.**
Every fact write (`memory.fact_extracted`) and delete (`memory.fact_deleted`) is
appended to `tenants/{tid}/auditLogs/` via Admin SDK, carrying factId + subject +
confidence + sourceMessageId. Provenance is Labyra's trust backbone (ADR-016); fact
extraction is no exception.

### Async architecture — Next.js `after()`, NOT fire-and-forget, NOT Pub/Sub

Extraction runs via `after(() => extractFactsAsync(...))` in the chat route (after
the response is sent). Rejected alternatives:
- **Bare fire-and-forget** (`void (async()=>{})()`, as the proposal wrote): on
  Vercel serverless (sin1) the function is frozen/killed once the response stream
  closes; an un-awaited promise is cut mid-flight → facts silently lost. Worst
  failure mode (no error, just missing data). The route already `await`s all
  post-stream work, confirming they avoid this.
- **Pub/Sub → worker** (ADR-018 pattern): correct for heavy paper OCR/embedding
  (~16s), over-engineered for a ~1s extraction call. Adds a topic, worker handler,
  deploy, eventarc — touches the worker repo, more failure surface.
- **`after()`** (Next.js 16): guaranteed to complete within `maxDuration=60`, does
  not delay chat, no extra infra. Upgrade path to Pub/Sub later is local (swap the
  callback body) — choosing `after()` now does not lock the door.

### Opt-in (unchanged from M0/M1)
`extractFactsAsync` first loads prefs and returns immediately unless
`enableMemory === true`. Memory stays OFF by default.

### Cost
Per-turn extraction = 1 Gemini 3.1 Flash-Lite call (~$0.001/turn), recorded under
feature `fact_extraction`. L2 injection adds ~300 tokens (cache:false — facts change
per turn). Only incurred when the user opts in.

### Files
New: fact-taxonomy.ts, fact-extractor.ts, fact-store.ts, extract-orchestrator.ts;
api/me/facts/route.ts; features/settings/components/remembered-facts.tsx;
tests/unit/{fact-store,fact-extractor}.test.ts.
Edited: system-prompt-builder.ts (renderSemanticMemory + L2 injection), chat/route.ts
(after() wire), settings/ai-preferences/page.tsx (RememberedFacts), types/cost.ts
('fact_extraction' feature), messages/{en,vi}.json (settings.memory).
