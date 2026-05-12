# Labyra App

AI-native lab management platform for materials science research. Multi-tenant SaaS rebuild
of [labbook-bku](https://github.com/emnam009009/labbook-bku) on Next.js 16 + Firebase.

> **For developers**: start with [`AGENTS.md`](./AGENTS.md) to bootstrap your understanding.
> Then read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/WORKFLOW.md`](./docs/WORKFLOW.md), and
> [`CLAUDE.md`](./CLAUDE.md).

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript strict
- **UI**: shadcn/ui (Radix + Tailwind v4 + CSS Variables)
- **State**: Zustand (UI) + TanStack Query v5 (server state)
- **Auth**: Firebase Auth (Google + Email/Password) + custom claims (tenantId, role)
- **Backend**:
  - Firestore (multi-tenant `/tenants/{tenantId}/...` model)
  - Realtime Database (chat streaming, presence)
  - Storage (papers, spectra files)
  - Cloud Functions (asia-southeast1) — async pipelines
  - Next.js Route Handlers — synchronous AI proxies
- **Charts**: recharts (dashboard) + Plotly.js (scientific) + Three.js (3D, Phase D) + D3.js (lineage)
- **AI**: Anthropic Claude (Tier 2-3 + Haiku dispatcher) + Gemini (Tier 1) + Voyage embed/rerank
- **i18n**: next-intl (path-based `/en`, `/vi`)
- **Lint**: oxlint + oxfmt + Husky + lint-staged
- **Tests**: Vitest (unit) + Playwright (E2E, Phase 6)
- **Deploy**: Vercel (frontend) + Firebase (backend) + Cloud Run (Python, future)

## Development

```bash
pnpm install
cp env.example.txt .env.local             # then fill Firebase creds
pnpm snapshot                             # generate agent context
pnpm dev                                  # localhost:3000
```

See [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) for full setup, patch workflow, and troubleshooting.

## Status

R160 frontend rebuild in progress. Track phase progress in [`ROADMAP.md`](./ROADMAP.md)
or run `pnpm snapshot && cat .claude/snapshot.md`.
