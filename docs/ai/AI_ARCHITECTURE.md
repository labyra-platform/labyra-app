# Labyra AI Architecture

**Version**: 3.0 — Stage 1 Production
**Last updated**: 2026-05-16 (R168-3.13a)
**Status**: Active. Supersedes v2.0 (labbook-bku inherited 2046 LOC).
**Owner**: nAM (superadmin)

> **⚠ Major revision from v2.0:**
> - Three-Tier → **6-Tier** architecture (Shield+Router/LabManager/Librarian/Engineer/Writer/Auditor)
> - Cost numbers recalculated with verified 2026 pricing (Anthropic + Google official)
> - Capability abstraction replaces hardcoded model strings
> - Cost controls (estimator, drift detection, quota guard v2) integrated
> - 9 inter-tier protocol techniques specified
>
> For detailed decision rationale, see:
> - `docs/adr/ADR-019-ai-tier-architecture.md`
> - `docs/adr/ADR-020-ai-cost-controls.md`
> - `docs/adr/ADR-021-inter-tier-protocols.md`

---

## Table of Contents

1. [Vision](#1-vision)
2. [6-Tier Architecture](#2-6-tier-architecture)
3. [Capability Abstraction](#3-capability-abstraction)
4. [Model Stack — Stage 1](#4-model-stack--stage-1)
5. [Cost Model — Verified 2026](#5-cost-model--verified-2026)
6. [Inter-Tier Protocols](#6-inter-tier-protocols)
7. [Cost Controls](#7-cost-controls)
8. [Anti-Hallucination — 9 Layers](#8-anti-hallucination--9-layers)
9. [Plan Tiers](#9-plan-tiers)
10. [Migration Path](#10-migration-path)
11. [Decision Log](#11-decision-log)

---

## 1. Vision

Labyra AI là hệ sinh thái 6-tier cho lab vật liệu, ưu tiên:

1. **Uy tín**: mọi claim có audit trail (PROV-O), citations verified.
2. **Bền vững**: gross margin ≥60% mọi plan tier, không VC subsidy.
3. **Trust > Coverage**: thà thiếu data còn hơn bịa.

---

## 2. 6-Tier Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User Query (Vietnamese / English)                       │
└─────────────────────────┬───────────────────────────────┘
                          ▼
              ┌─────────────────────────┐
              │  Tier 0: Shield+Router  │ ← ALWAYS RUNS
              │  Gemini 3.1 Flash-Lite  │   ~$0.00025/query
              └────────┬──────────┬─────┘
                       │          │
       ┌───────────────┘          └───────────────┐
       ▼                                          ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Tier 1       │  │ Tier 2       │  │ Tier 3       │  │ Tier 4       │
│ Lab Manager  │  │ Librarian    │  │ Engineer     │  │ Writer       │
│ Gemini 3.1FL │  │ Gemini 3F    │  │ Sonnet 4.6   │  │ Sonnet 4.6   │
│ ~$0.002      │  │ ~$0.018      │  │ ~$0.10       │  │ ~$0.18       │
└──────────────┘  └──────────────┘  └──────────────┘  └──────┬───────┘
   lab_ops          theory            spectrum            writing
                                                              │
                                                              │ (background async)
                                                              ▼
                                                  ┌──────────────────┐
                                                  │ Tier 5: Auditor  │
                                                  │ Opus 4.7         │
                                                  │ ~$0.40/audit     │
                                                  │ (trigger ~25%)   │
                                                  └──────────────────┘
```

### Tier responsibilities

| Tier | Vai trò | Khi nào chạy | Trigger source |
|---|---|---|---|
| **0** | Security shield + intent router | 100% queries | Always — first gate |
| **1** | Lab ops (chemicals, equipment, booking, compliance) | ~45% queries | Router: intent=`lab_ops` |
| **2** | Paper RAG (theory, mechanisms, comparisons) | ~25% queries | Router: intent=`theory` |
| **3** | Spectrum analysis + Python worker interpret | ~20% queries | Router: intent=`spectrum_analysis` |
| **4** | Draft writing (Results/Discussion/Methods) | ~10% queries | User explicit "Write [section]" |
| **5** | Peer review audit (background async) | ~25% of T4 calls | Triggered by T4 output (selective) |

---

## 3. Capability Abstraction

**Anti-pattern**: hardcode `claude-opus-4-7` everywhere → đổi model = sửa nhiều chỗ.

**Pattern**: tier maps to **capability**, capability maps to **model profile**.

```typescript
// src/lib/ai/config/capabilities.ts

export type Capability =
  | 'security-router'    // T0
  | 'tool-calling-cheap' // T1
  | 'rag-balanced'       // T2
  | 'reasoning-balanced' // T3, T4
  | 'reasoning-frontier' // T5
  | 'embedding'          // RAG indexing
  | 'rerank'             // Retrieval post-processing
  | 'ocr';               // Paper upload

export const TIER_CAPABILITY: Record<TierNumber, Capability> = {
  0: 'security-router',
  1: 'tool-calling-cheap',
  2: 'rag-balanced',
  3: 'reasoning-balanced',
  4: 'reasoning-balanced',
  5: 'reasoning-frontier',
};
```

**Lợi ích**:
- Đổi model (vd Opus 4.7 → 4.8) = sửa 1 chỗ.
- A/B test = đổi `TIER_CAPABILITY[5]` từ frontier xuống balanced để đo quality.
- Cost data co-located với model string trong `CAPABILITY_MAP`.

---

## 4. Model Stack — Stage 1

Verified Anthropic + Google official pricing 2026-05.

| Capability | Provider | Model | Input $/MTok | Output $/MTok | Cache hit | Notes |
|---|---|---|---|---|---|---|
| security-router | Google | `gemini-3.1-flash-lite-preview` | 0.25 | 1.50 | 0.025 | Preview, AI Studio quota 4K RPM |
| tool-calling-cheap | Google | `gemini-3.1-flash-lite-preview` | 0.25 | 1.50 | 0.025 | Share singleton with T0 |
| rag-balanced | Google | `gemini-3-flash-preview` | 0.50 | 3.00 | 0.05 | Preview, monitor GA pricing |
| reasoning-balanced | Anthropic | `claude-sonnet-4-6` | 3.00 | 15.00 | 0.30 | Stable, 1M context |
| reasoning-frontier | Anthropic | `claude-opus-4-7` | 5.00 | 25.00 | 0.50 | **+35% tokenizer inflation vs 4.6** |
| embedding | Voyage | `voyage-3-large` | 0.18 | — | — | 1024-dim, paired with rerank-2.5 |
| rerank | Voyage | `rerank-2.5` | — | — | — | Designed pair with voyage-3-large |
| ocr | Mistral | `mistral-ocr` | ~$1/1000 pages | — | — | Paper upload one-time |

### Why these choices?

- **Tier 0+1 Gemini 3.1 Flash-Lite**: cheapest reasoning model with strict JSON mode + adequate quality. Share singleton between T0 (router) + T1 (lab ops) for cache reuse.
- **Tier 2 Gemini 3 Flash**: balance cost ($0.50/MTok) and reasoning for RAG. Long context (1M) eliminates chunking concerns.
- **Tier 3+4 Sonnet 4.6**: Anthropic's reasoning + tool calling are best-in-class for scientific interpretation. Cache hit -90% makes prompt reuse cheap.
- **Tier 5 Opus 4.7**: peer review needs highest quality. Tokenizer inflation factor 1.35 modeled in cost estimator. Always background, never blocks UI.
- **Voyage embedding kept**: Pinecone index already 1024-dim. Voyage rerank-2.5 is designed pair. Migration to Gemini Embedding 1 deferred to R175+ (saving $3-5/year not worth re-indexing cost).
- **No Haiku in tiers**: not needed. Gemini 3.1 Flash-Lite is 4× cheaper for T0 task. Haiku may join later as failover only.

---

## 5. Cost Model — Verified 2026

### Per-query cost (realistic, including hidden cost)

| Query type | % traffic | Tiers used | Cost/query |
|---|---|---|---|
| Lab ops (chemical inventory, booking) | 45% | T0+T1 | ~$0.002 |
| Theory chat (RAG paper) | 25% | T0+T2 | ~$0.018 |
| Spectrum analysis | 20% | T0+T3 | ~$0.10 |
| Paper writing draft | 10% | T0+T2+T3+T4 | ~$0.20 |
| Audit (background, ~25% of writing) | 2.5% effective | T5 | ~$0.40 |

**Weighted average**: ~$0.054/query (vs report claim $0.018 — corrected 3×).

### Infrastructure baseline (não AI)

| Service | Monthly cost @ 1K queries |
|---|---|
| Cloud Run (Python worker, asia-southeast1) | $30-50 (min-instance) |
| Vercel functions | $5-15 |
| Firestore reads/writes | $5-10 |
| Firebase Storage | $1-3 |
| Pinecone serverless | $0.50-2 |
| Voyage embedding | $0.50 (re-embedding new papers) |
| Mistral OCR | $1.50 (10 papers/mo × 15 pages) |
| **Infra subtotal** | **~$45-80/month baseline** |

### Sensitivity scenarios

| Scenario | Volume/mo | AI cost | Infra | TCO | Per-paying-user revenue for 60% margin |
|---|---|---|---|---|---|
| Conservative (Lab BKU only) | 500 q | ~$27 | $50 | $77 | ≥ $193 |
| Realistic (10 labs Pro) | 5,000 q | ~$270 | $80 | $350 | ≥ $35/lab |
| Aggressive (50 labs scale) | 50,000 q | ~$2,700 | $200 | $2,900 | ≥ $58/lab |

→ **Pro plan $30/mo gives ~62% margin at realistic scale.** Stable.

---

## 6. Inter-Tier Protocols

9 techniques formalized in `docs/adr/ADR-021-inter-tier-protocols.md`. Summary:

| # | Technique | Stage 1 | Cost impact |
|---|---|---|---|
| 1 | Parallel T2+T3 (Promise.all) | ✅ | 0% cost, -40% latency |
| 2 | TierContext shared state | ✅ | Eliminates redundant fetches |
| 3 | Streaming SSE | ✅ | 0% cost, UX win |
| 4 | Zod JSON schema strict | ✅ | -90% retry rate |
| 5 | Prompt caching | ✅ | -90% input cost (cached) |
| 6 | Speculative decoding | ❌ defer R175+ | High risk of wasted cost |
| 7 | Result memoization (Tier 2 theory) | ✅ | -30% Tier 2 cost (cache hit rate) |
| 8 | Adaptive tier downgrade | ❌ defer R170+ | Requires Cost Guard v2 |
| 9 | Cross-tier dedup (T4 sources → T5) | ✅ | -$0.13/1K queries |
| A | Circuit breaker fallback | ❌ defer R170+ | Premature for 1 tenant |
| B | Token budget per request | ✅ | Defense in depth |
| C | Async batching (-50%) | ✅ | For paper OCR, Ragas eval |

---

## 7. Cost Controls

5 fixes shipped in Phase 1 (see `docs/adr/ADR-020-ai-cost-controls.md`):

1. **Capability abstraction** — model swap = 1 file change.
2. **Cost estimator** — `src/lib/ai/cost/estimator.ts` per-token calculation with tokenizer inflation.
3. **Tier 5 trigger refinement** — critical/standard/skip 3 levels (instead of always-on).
4. **Quota guard v2** — daily + monthly + per-feature caps.
5. **Drift detection cron** — reconcile estimate vs actual billing, alert ±20% drift.

---

## 8. Anti-Hallucination — 9 Layers

Integrated across tiers (see `docs/ai/AI_ARCHITECTURE.md` Section 13 legacy for L1-L9 detail):

| Layer | Tier | Status |
|---|---|---|
| L1 System prompt constraints | T0 | Shipped R162 |
| L2 Citation enforcement | T2 + T5 | R166-6b UI shipped, R166-6c next |
| L3 Numerical verification (Python ground truth) | T3 | Shipped R161 XRD |
| L4 CRAG rerank threshold | T2 | Shipped R160 Voyage rerank-2.5 |
| L5 Reflection loop | T5 | Defer R170+ (after Ragas eval) |
| L6 OOD detection | T0 Shield | Shipped R162 |
| L7 Empty result guard | T1/T2/T3 | Partial ship |
| **L8 Ragas eval** | Offline cron | **R169 priority** |
| L9 Human verify UI badge | UI | Defer R170+ |

---

## 9. Plan Tiers

Aligned with existing `src/lib/ai/governance/tiers.ts` naming.

| Plan | Price | Daily cap | Monthly cap | Opus quota | Use case |
|---|---|---|---|---|---|
| Free | $0 | $0.50 | $5 | **0.10/day (1 audit)** | Demo + small labs |
| Starter | $15/mo | $2 | $50 | $0.50/day (~3 audits) | Solo researchers |
| Pro | $30/mo | $5 | $100 | $1.50/day (~3 audits) | Active labs |
| Enterprise | custom | ∞ | ∞ | ∞ | Multi-lab orgs |

**Free tier strategy**: 1 Opus audit/day enables "Verified by Auditor" badge demo → drive upgrade.

---

## 10. Migration Path

### From current state (May 2026)

| Component | Current | Target | Migration effort |
|---|---|---|---|
| Cost calculator pricing | Has wrong `gemini-2.5-flash` $0.075/$0.30 | $0.30/$2.50 + add 3.1 Flash-Lite + 3 Flash | **R168-3.13b code fix** |
| Tier governance | `free/starter/pro/enterprise` ✅ aligned | Same | None |
| Model strings hardcoded | Scattered | Capability map | R169 refactor |
| Cost estimator | Partial (`cost-calculator.ts`) | Full with telemetry | R169 |
| Tier 5 trigger logic | Not implemented | 3-level decision | R170+ |
| Quota guard v2 | v1 only | Monthly + per-feature | R170+ |
| Drift detection cron | None | Daily reconcile | R171+ |

### Roadmap

| Round | Phase | Deliverables |
|---|---|---|
| R169 | Capability + cost refactor | Capability map, estimator complete, telemetry to Firestore |
| R170 | Cost controls | Trigger refinement, quota v2, basic Sentry alerts |
| R171 | Drift detection | Cron + Anthropic + Google billing reconciliation |
| R172-175 | Feature scaling | A/B framework, free tier Opus demo, etc. |

---

## 11. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-16 | Adopt 6-tier from 3-tier | Cost separation by value tier |
| 2026-05-16 | No Haiku in tiers | Gemini 3.1 Flash-Lite 4× cheaper, sufficient for T0 task |
| 2026-05-16 | Keep Voyage embedding | Pinecone 1024-dim already indexed, switch saves only $3-5/yr |
| 2026-05-16 | Defer speculative/adaptive/circuit-breaker | Premature optimization for 1 tenant |
| 2026-05-16 | Tier 5 ~25% trigger (not always) | Original 100% trigger inflates cost 3-5× |
| 2026-05-16 | Capability abstraction | Single point of change for model swap |
| 2026-05-16 | Cost estimator with tokenizer inflation | Opus 4.7 has +35% same text vs 4.6 |
| 2026-05-16 | Free tier 1 Opus audit/day | Break catch-22, demo value-add |

---

*Living document. Update khi ADR-019/020/021 thay đổi.*
*Mọi deviation từ design ở đây phải tạo ADR mới.*

@phase R168-3.13a
