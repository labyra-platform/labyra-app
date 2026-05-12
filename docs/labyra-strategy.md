# Labyra Platform — Strategic Architecture Guidance

> **Required reading for all contributors (human or AI agents).**
> This document defines Labyra's long-term direction and prevents architectural drift.
> Originally derived from internal risk-and-scaling assessment (May 12, 2026).

---

## Position statement

Labyra is an **AI-native operating system for materials science research**.

It is NOT:
- A generic CRUD admin dashboard
- A simple lab inventory tool
- An LLM chat wrapper
- A clone of NotebookLM / Elicit / SciSpace

It IS:
- A research workflow platform with AI-native primitives
- A scientific knowledge infrastructure with provenance integrity
- A multi-tenant SaaS optimized for reproducibility and defensibility
- A platform that grows into experiment automation, collaboration, and scientific compute

This positioning shapes every architectural decision.

---

## Current stage (as of May 2026)

**Pre-PMF**:
- 20+ planned/interested labs (not active yet)
- Pre-revenue (pricing planned: $0 / $29 / $99 tiers)
- Internal dev usage primary
- < 10 papers/day across all tenants

**Implication**: prioritize UX, retention, and workflow validation over infrastructure sophistication.

---

## Architectural pillars (DO NOT compromise)

### 1. Tenant boundaries are sacred

All tenant data lives under `/tenants/{tenantId}/...`.

Never introduce:
- Shared mutable tenant state
- Global collections without strong justification
- Implicit tenant context that can leak across boundaries

Every Firestore query must include `tenantId` filter.
Every Pinecone operation must specify `namespace = tenantId`.
Every Storage path must include `{tenantId}` prefix.

### 2. Synchronous vs asynchronous separation

| Workload type | Where |
|---|---|
| User-facing API (chat, status fetch) | Route handler, synchronous |
| Light AI routing (intent classification) | Route handler, in-line |
| OCR, embedding, indexing | Background async (in-process or queue) |
| Long simulations, batch jobs | Future: dedicated compute |

Long-running operations NEVER block user-facing APIs.

### 3. Provenance integrity (differentiator)

The provenance system is one of Labyra's strongest commercial differentiators.

Every AI interaction must produce a provenance record:
- Tool calls
- Retrieval (chunks used)
- Model routing decisions
- Generated outputs
- Reflection iterations

Never bypass provenance writing — even for "cheap" operations.

Future: provenance UI is a public-facing trust feature ("How was this answer generated?").

### 4. AI economics first-class

Cost is an architectural concern, not an afterthought.

Every code path that calls an LLM must:
- Track cost (input/output tokens + USD)
- Respect tenant quotas
- Prefer cheaper models when sufficient (T1 Flash > T2 Sonnet > T3 Opus)
- Use prompt caching when prompt is reusable
- Use semantic caching when query is repeated

Optimize for: **"good-enough intelligence at sustainable cost"**.
Not: **"maximum intelligence everywhere"**.

### 5. Extensibility over feature delivery

Labyra is a platform, not a feature set.

Prefer:
- Reusable primitives (provider abstractions, capability interfaces)
- Composable workflows
- Schema versioning from day one
- Interface-driven design

Avoid:
- One-off feature hacks
- Hard-coded vendor-specific code paths
- Schema without `schemaVersion: N` field

---

## Major risks & mitigation

### Risk: Overengineering before PMF [CRITICAL]

**Pattern to avoid**: building hyperscale infrastructure for users who don't exist yet.

**Examples of premature optimization** (don't do these pre-PMF):
- Multi-region deployment
- Cloud Tasks / PubSub queues
- Service mesh
- OpenTelemetry full stack
- Event sourcing
- Microservices split

**Until PMF (defined as: 20+ active paying labs)**: keep architecture simple. Single Vercel deployment + Firebase. In-process async. Direct service calls.

**Migration triggers** (only then introduce complexity):
- Real Vercel timeouts on legitimate jobs
- Cost shape changes measurably
- Tenants complain about specific bottleneck
- Compliance requirement from enterprise customer

### Risk: Firebase vendor lock-in [HIGH]

Firebase is the operational layer. Acceptable for current stage.

Long-term decoupling plan (NOT to be done pre-PMF):

| Workload | Future system |
|---|---|
| Analytics | BigQuery (export Firestore → BQ) |
| Vector search | Pinecone (already done in ai-5a) |
| Full-text search | OpenSearch (when Firestore inverted index hits limits) |
| Streaming | Pub/Sub / Kafka |
| Relational analytics | PostgreSQL via Hasura or direct |

Never migrate prematurely. Only when real bottlenecks appear.

### Risk: AI cost explosion [CRITICAL]

Single bad tenant can destroy unit economics.

**Required (must build before launch)**:
- Per-tenant monthly quotas (papers, embedding tokens, reasoning tokens, storage)
- Cost tracking per tenant per operation
- Hard caps with HTTP 429 response
- Soft caps with grace period

**Built into ai-5b foundation, not as later add-on.**

### Risk: Python compute bottlenecks [HIGH]

Scientific Python (pymatgen, ASE, lmfit) is unpredictable.

Mitigation: don't put scientific compute on user-facing path. Future: dedicated compute workers via Cloud Run with appropriate memory limits.

### Risk: Multi-tenant enterprise gaps [MEDIUM]

Current security strong for SaaS, weak for enterprise.

Defer until enterprise customer ask:
- SAML SSO
- Immutable audit logs
- Data residency (multi-region)
- Document-level encryption

---

## Evolution stages (clear triggers)

### Stage 1: Pre-PMF (CURRENT)

**Triggers**: < 20 active labs, pre-revenue, internal dev primary.

**Philosophy**: "Simple systems that work."

**Allowed**:
- Firebase-heavy architecture
- Vercel monolith deployment
- In-process async (no queue)
- Direct service-to-service calls
- Console JSON logs (no observability tools)

**Forbidden**:
- Cloud Tasks / PubSub
- Cloud Run worker split
- Multi-region replication
- Distributed tracing infrastructure
- Custom observability tooling

### Stage 2: Growth

**Triggers** (all of):
- 20-50 active labs
- Significant AI traffic measurable
- Specific infrastructure bottleneck identified

**Introduce**:
- Job queue (PubSub or Cloud Tasks)
- Cloud Run worker for heavy processing
- Basic observability (Cloud Logging structured + Cloud Monitoring metrics)
- Caching layer (Redis / Upstash for hot paths)

### Stage 3: Platform

**Triggers** (all of):
- 50+ active labs
- 1+ enterprise customer signed
- Compliance requirement (SAML / audit / data residency)

**Introduce**:
- Multi-region deployment
- OpenTelemetry tracing
- Workflow engine (Temporal or Trigger.dev)
- Dedicated scientific compute orchestration
- Advanced compliance systems

---

## Decision principles

When deciding architecture, ask in order:

1. **Does this preserve tenant isolation?** (Sacred — never compromise)
2. **Does this improve workflow usefulness today?** (User-facing value)
3. **Is this justified by real usage?** (Not speculative)
4. **Can this evolve incrementally later?** (Future-proof but not future-built)
5. **Will this hurt AI economics?** (Cost is first-class)
6. **Does this preserve provenance?** (Differentiator)
7. **Does this increase operational complexity unnecessarily?** (Simplicity bias)

When unsure: prefer **simpler systems**, **modular boundaries**, **reversible decisions** over premature abstraction or speculative infrastructure.

---

## Scientific-native concerns (Labyra-specific)

Beyond standard SaaS, these are unique to research platform:

| Capability | Priority | Why |
|---|---|---|
| DOI/Crossref enrichment | High | Verified metadata, anti-hallucination |
| Citation graph | High | Build moat vs generic RAG (NotebookLM doesn't have this) |
| Equation indexing | Medium | LaTeX-aware retrieval, search by formula |
| Figure/table extraction | Medium | Multimodal RAG future |
| Paper version tracking | High | preprint v1 vs v2 vs published — scientific accuracy |
| Retraction detection | Medium | Auto-flag via Retraction Watch API |
| Replication linking | High | Link experiments to source papers |
| Reproducibility audit | High | Pipeline params version for replay |

These differentiate Labyra from generic AI research assistants.

---

## Session decisions log (May 12, 2026)

### Decision: ai-5b paper pipeline — Stage 1 monolith

**Context**: Originally considered jumping to Phase 3 enterprise infrastructure (Cloud Run + PubSub + observability stack) for paper pipeline implementation.

**Reality check**: Pre-PMF stage with < 10 papers/day. This strategy document's guidance flagged this as the "single biggest strategic danger" (overengineering before PMF).

**Decision**: Stage 1 simple monolith with future-proof interfaces.
- In-process async processing
- `JobQueue` interface with `InProcessQueue` impl (scaffold for future `PubSubQueue` swap)
- Built-in governance layer (quotas, cost tracking) — cheap to add now, critical for sustainable economics
- Single Vercel deployment, no Cloud Run yet

**Migration trigger to Stage 2**: real Vercel timeouts on legitimate jobs, OR > 50 papers/day total, OR specific tenant complaint.

**Effort comparison**:
- Stage 1: 2 sessions (~2500 LOC)
- Stage 3 jump: 6-7 sessions (~5000 LOC)
- Saved: 4-5 sessions until justified

### Decision: Pricing tiers (initial)

| Tier | Price | Papers/m | Embed tokens/m | Reasoning tokens/m | Storage |
|---|---|---|---|---|---|
| Free | $0 | 10 | 1M | 100K | 1 GB |
| Starter | $29/m | 100 | 10M | 1M | 10 GB |
| Pro | $99/m | 1000 | 100M | 10M | 100 GB |
| Enterprise | custom | custom | custom | custom | custom |

Quotas enforced via `governance/quota.ts`. Hard caps return HTTP 429.

---

## References

- `docs/ai/ai-5b-pipeline.md` — Paper pipeline implementation spec
- `docs/architecture-decisions.md` — ADR log
- `docs/ai/AI_ARCHITECTURE.md` — AI subsystems overview
- `CLAUDE.md` — Coding rules for AI agents
