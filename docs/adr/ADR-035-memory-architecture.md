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
