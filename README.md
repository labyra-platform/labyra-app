# Labyra

**AI-native international SaaS platform for materials science lab management.**
Multi-tenant, multi-technique spectroscopy + sample workflow + deviation analysis +
AI-assisted interpretation. Built for nano-materials researchers, but applicable
across solid-state chemistry, semiconductors, catalysis, and energy materials.

> **PROPRIETARY SOFTWARE — All Rights Reserved.**
> See [`LICENSE`](./LICENSE) for terms. This repository is not open source.
> Materials Project, pymatgen, lmfit, and other dependencies retain their
> respective licenses (see [`docs/algorithm-attributions.md`](./docs/algorithm-attributions.md)).

> **For developers**: start with [`AGENTS.md`](./AGENTS.md), then read
> [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md),
> [`docs/WORKFLOW.md`](./docs/WORKFLOW.md), and [`CLAUDE.md`](./CLAUDE.md).
>
> First tenant: **Lab Vat lieu BKU** (HCMC University of Technology).
> Legacy codebase: labbook-bku (private archive) — superseded.

## What Labyra does

- **Multi-technique spectroscopy** — XRD, Raman, FTIR, UV-Vis, PL, TGA, with vendor-aware parsers
- **Sample lineage (PROV-O)** — Material → Sample → Experiment → DataAsset, end-to-end traceable
- **Multi-phase deviation analysis** — declare composite composition, get per-phase match + intent reconciliation
- **Quantitative phase analysis** — RIR (Chung), Direct Comparison (Klug-Alexander), Rietveld refinement
- **Crystallinity auto-classification** — bulk / nanocrystalline / amorphous, with adaptive tolerance
- **Physics rules engine** — 15 rules (R1-R15) detecting strain, phonon confinement, charge transfer,
  vdW stacking, defects, etc. — each with verified DOI citation
- **Cross-spectrum inference** — fuse evidence from Raman + XRD + UV-Vis + PL on same sample (R185-8, planned)
- **Citation-grounded hypotheses** — every claim links to peer-reviewed source
- **AI interpretation** — 6-tier model stack (Gemini Flash to Claude Sonnet 4.6 to Opus 4)
- **Reference library** — 29 FTIR + 25 Raman cards, 20 curated Materials Project structures
- **Paper RAG (planned)** — OpenAlex sync + Pinecone semantic search

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript strict
- **UI**: shadcn/ui (Radix + Tailwind v4 + CSS Variables), Tabler icons
- **State**: Zustand (UI) + TanStack Query v5 (server state)
- **Forms**: React Hook Form + Zod (mandatory shadcn Form pattern)
- **Auth**: Firebase Auth (Google + Email/Password) + custom claims (tenantId, role)
- **Backend**:
  - Firestore (multi-tenant `/tenants/{tenantId}/...`, global `/materialProfiles/{formula}`)
  - Realtime Database (chat streaming, presence)
  - Cloud Storage (papers, spectra files)
  - Pub/Sub (`paper-processing`, `spectra-analysis` queues)
  - Firebase Functions (Node 24, asia-southeast1) — cron jobs, lightweight async
  - Cloud Run Python worker — heavy spectra analysis, AI orchestration, Rietveld
- **Charts**: recharts (dashboard) + Plotly.js (scientific) + Three.js (3D) + D3.js (lineage)
- **AI 6-tier stack** (ADR-019):
  - T0-T2: Gemini Flash-Lite / Flash (dispatch, classify, summarize)
  - T3-T4: Claude Sonnet 4.6 (tool calling, structured analysis)
  - T5: Claude Opus 4 (audit, deep reasoning)
- **Embeddings**: Voyage embed-3-large + rerank-2.5
- **Scientific**: pymatgen + lmfit + scipy (Rietveld, profile fitting); NIST XCOM (MAC tables)
- **i18n**: next-intl (path-based `/en`, `/vi`)
- **Lint**: oxlint + oxfmt + Husky + lint-staged
- **Tests**: Vitest (unit) + Playwright (E2E, planned)
- **Deploy**: Vercel (frontend) + Firebase (functions, hosting) + Cloud Run (Python worker)

## Repos

| Repo | Role | Visibility |
|------|------|------------|
| labyra-platform/labyra-app | Frontend + API routes (this repo) | private |
| emnam009009/labyra-spectra-worker | Cloud Run Python worker | private |
| labyra-landing | Marketing site, [labyra-landing.web.app](https://labyra-landing.web.app) | public |
| emnam009009/labbook-bku | Legacy v1 codebase (superseded) | archived |

## Development

```bash
pnpm install
cp env.example.txt .env.local             # fill Firebase creds + NEXT_PUBLIC_WORKER_URL
pnpm snapshot                             # generate agent context
pnpm dev                                  # localhost:3000
```

See [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) for full setup, patch workflow, and troubleshooting.

## Status

**Current**: R185 deviation analysis suite complete (May 2026)

### R185 — Multi-phase deviation analysis engine

| Phase | Capability | Status |
|-------|------------|--------|
| R185-1 | Hungarian peak matching | done |
| R185-2 | 10 single-phase physics rules (R1-R10) | done |
| R185-4 | Multi-phase greedy matcher + composition UI | done |
| R185-5 | Crystallinity classifier + adaptive tolerance | done |
| R185-6 | 5 composite physics rules (R11-R15) | done |
| R185-7/7b | Fraction estimation: RIR + Direct Comparison (Klug-Alexander) | done |
| R185-7c-1/2 | Rietveld refinement (Caglioti UVW + Pseudo-Voigt + Chebyshev) | done |
| R185-7c-3 | Full R-factors + difference plots | with R185-10 UI |
| R185-8 | Cross-Spectrum Inference Engine (CSIE) | next |
| R185-9 | Ambiguous hypothesis handler | pending |
| R185-10 | DeviationPanel UI | pending |

### Earlier milestones

- **R184** (May 18) — Materials Project structure sync (20 curated polymorphs)
- **R183** (May 18-19) — Raman + FTIR reference libraries (54 ref cards total)
- **R179-R182** (May 18-19) — Orphan audit cron, journal extract, soft archive,
  Gemini 3 Flash thinking adapter, react-pdf v10 viewer with fuzzy search
- **R178** (May 18) — Auto-classify paper domain taxonomy v1 (36 categories)
- **R177** (May 17) — Paper processing migration to Gemini 3 Flash + Google Books resolver
- **R167** (May 15) — Async Pub/Sub end-to-end for paper processing (ADR-018)
- **R161-R166** (May 14-15) — XRD Tier 1+2 metrics, profile fitting, Lineage Explorer
- **R160** (May 12-13) — Foundation: Next.js 16 + Firebase Auth + shadcn + Tabler icons

Detailed log: see commit history.

## Scientific documentation

Every algorithm in Labyra is documented at
[`docs/scientific-methods/`](./docs/scientific-methods/) with formula,
physical meaning, DOI citations, parameters, edge cases, and implementation path.

Coverage:
- [Peak matching](docs/scientific-methods/deviation-peak-matching.md) (Hungarian algorithm)
- [Single-phase rules R1-R10](docs/scientific-methods/physics-rules-single-phase.md)
- [Composite rules R11-R15](docs/scientific-methods/physics-rules-composite.md)
- [Multi-phase matching](docs/scientific-methods/multi-phase-matching.md)
- [Crystallinity classification](docs/scientific-methods/crystallinity-classification.md)
- [Phase fraction estimation](docs/scientific-methods/phase-fraction-estimation.md)
- [Rietveld refinement](docs/scientific-methods/rietveld-refinement.md)
- [XRD analysis](docs/scientific-methods/xrd-analysis.md)
- [Raman reference library](docs/scientific-methods/raman-reference-library.md)
- [FTIR reference library](docs/scientific-methods/ftir-reference-library.md)
- [Citation matching](docs/scientific-methods/citation-matching.md)
- [Journal extraction](docs/scientific-methods/journal-extraction.md)
- [Paper domain classification](docs/scientific-methods/paper-domain-classification.md)

## Architecture decisions

ADRs at [`docs/adr/`](./docs/adr/) — read 015 through 027 before architectural decisions.

Key ADRs:
- **ADR-015** — Stage 1 security model (Firestore rate limiting, CSRF in proxy.ts, no Redis)
- **ADR-016** — PROV-O entity model for materials/samples/experiments
- **ADR-018** — Pub/Sub cutover for paper processing
- **ADR-019** — 6-tier capability abstraction for AI models
- **ADR-020** — Cost controls + Cost Guard v2
- **ADR-021** — Inter-tier protocols
- **ADR-025** — Auto-classify paper domain taxonomy
- **ADR-026/027** — Layer 2 orphan audit + soft archive

## License

PROPRIETARY — All Rights Reserved. See [`LICENSE`](./LICENSE).

Third-party dependencies retain their respective licenses; see
[`docs/algorithm-attributions.md`](./docs/algorithm-attributions.md) for the
full audit.

Labyra's own algorithms (Rietveld refinement, multi-phase matcher, peak
matching, profile fitting, etc.) are self-implemented under proprietary
license — no GPL/AGPL/BGMN/GSAS-II dependencies. Algorithm inspiration is
acknowledged in algorithm-attributions.md but code is original.

## Contributing

Closed contribution model. Pre-launch phase, single-tenant deployment.
Future contribution policy TBD post-launch.
