# Labyra App — Roadmap

> Long-term planning. Update sau mỗi phase complete.
> See CLAUDE.md cho coding rules.

## Vision

Labyra Platform = AI-native lab management SaaS for materials science research.
Multi-tenant từ đầu (user's lab = tenant #1, commercial scale sau).

## Stack

Next.js 16 + TypeScript strict + shadcn/ui + Tremor + Firebase + next-intl + Vercel.
Charts: recharts (dashboard) + Plotly.js (scientific) + Three.js (3D Phase D) + D3 (lineage).

## Round 160 — Foundation (in progress)

### Phase 1: Infrastructure ✅

- [x] R160-setup — Clone Kiranism template
- [x] R160-setup-2 — Cleanup template (removed clerk/kanban/chat/sentry/examples)
- [x] R160-firebase — Firebase SDKs (lib/firebase client + admin)
- [x] R160-auth — Firebase Auth foundation (lib/auth + sign-in/up + proxy)
- [x] R160-shell-1 — Branding metadata + remove emoji
- [x] R160-i18n-1 — next-intl path-based routing + folder restructure
- [x] R160-i18n-2 — String migration auth + LocaleSwitcher component

### Phase 2: i18n completion

- [x] R160-i18n-3a — Mount LocaleSwitcher into header
- [x] R160-i18n-3b — Sidebar nav migration via nav-config.ts
- [x] R160-i18n-3c — Dashboard KPI cards migration
- [ ] R160-i18n-3d — Breadcrumb i18n (next, ~20 min)
- [x] R160-i18n-3d — Breadcrumb i18n
- [x] R160-i18n-3e — Fix proxy.ts redirect loop

### Phase 3: Shell + Dashboard

- [ ] R160-shell-2 — Sidebar nav rewrite cho LabBook domains
-  Replace template's Product/Users with: Materials, Samples, Experiments,
-  DataAssets, Lineage, Chemicals, Equipment, Bookings, Members, AI Assistant
- [x] R160-shell-2 — Sidebar nav rewrite cho LabBook domains
  4 groups (Workspace / Lab Resources / AI / Admin), 10 stub pages
- [ ] R160-dashboard — KPI cards + charts + Firebase data integration
  - [x] R160-dashboard-1 — Foundation: CLAUDE.md update + firestore.rules + firebase.json
  - [x] R160-dashboard-2 — Seed mock data (5 collections × 10 records under /tenants/{id}/)
  - [x] R160-dashboard-3 — Wire Firebase Auth custom claims (tenantId, role)
  - [x] R160-dashboard-4 — Replace KPI mock + charts with Firestore queries via TanStack Query

### Phase 4: Core domain pages

- [ ] R160-materials — Materials list + CRUD
- [ ] R160-samples — Samples + lineage links
- [ ] R160-experiments — Experiments unified
- [ ] R160-data-assets — Gallery + classifier + Plotly analyzers
- [ ] R160-lineage — D3 force-directed graph port từ labbook-bku R154
- [ ] R160-inventory — Chemicals + Equipment + Ink CRUD
- [ ] R160-bookings — Equipment booking calendar
- [ ] R160-members — User management + role admin

### Phase 5: AI features

- [ ] R160-ai-chat — AI sidetab + RAG + tool calling
  Port từ labbook-bku R130-R142 (paper RAG, searchPapers tool, citation chips)

### Phase 6: Quality + Deploy

- [ ] R160-tests — Vitest unit + Playwright e2e
- [ ] R160-deploy — Vercel CI/CD + env vars + preview deployments

## Timeline

Current: 14/25 sub-rounds done (~56%).
Realistic full R160: 8-12 weeks.

## Post-R160 (future phases)

### Phase D — Advanced scientific viz

- 3D crystal structure viewer (Three.js)
- Band structure plots
- Phase diagrams interactive
- DOS/PDOS plots

### Phase E — Commercial readiness

- Multi-tenant data migration (lab-manager-268a6 → labyra-app-prod)
- Billing integration (Stripe)
- Tenant signup flow + email verification
- Super-admin dashboard (manage tenants + analytics)
- Re-enable Sentry error tracking
- Custom domain per-tenant

### Phase F — Enterprise features

- SSO/SAML integration
- Audit logs
- Data export (CSV/Excel/PDF)
- Public API access
- Integrations (Benchling, ELN tools, etc.)

## Behavior conventions

Sau khi complete bất kỳ sub-round nào:
1. Run `pnpm build` + tests
2. Commit + push (Conventional Commits, max 400 LOC diff)
3. **Auto-suggest next sub-round** (don't wait for user instruct)
4. Update ROADMAP.md checkbox tương ứng

Reference materials:
- CLAUDE.md — coding rules (read FIRST)
- package.json — dependencies
- .env.example — env vars template
- messages/en.json, messages/vi.json — i18n translations

Source repos cũ (reference only, không port code):
- github.com/emnam009009/labbook-bku — Vite + vanilla TS legacy
- github.com/emnam009009/labyra-landing — Astro marketing site

## R160 Cleanup phases

- [x] R160-cleanup-1 — Template residue (marketing routes, sample API, overview.tsx dead code, mock-api, bun.lock)

## R160 AI phases

- [x] R160-ai-1 — Chat foundation: Anthropic SDK, Route Handler, streaming SSE, basic chat UI (no tools/RAG/history yet)
- [x] R160-ai-2a — Persist conversations + provenance writes + auto-title (Haiku 4.5)
- [x] R160-ai-2b — Conversation history panel (time-grouped, collapsible)
- [x] R160-ai-3a — Provider abstraction (LLMProvider interface, Anthropic + Gemini implementations, cost calculator)
- [x] R160-ai-3b — Tier dispatcher (Haiku 4.5 intent classifier, balanced 20/60/20 distribution, tier badge UI)
- [x] R160-ai-3c1 — Tool calling foundation (Anthropic + Gemini, 3 read-only lab tools)
- [x] R160-ai-5a — RAG foundation: Voyage embedding + Pinecone vector store + Mistral OCR (with provider abstraction)
- [x] R160-ai-5b-1 — Foundation: papers types + governance (quota/tiers) + JobQueue interface + Storage rules + upload UI/endpoint
- [x] R160-ai-5b-2 — Processing pipeline (OCR/chunk/enrich/embed/index) + paper list/detail UI + cancel/reprocess endpoints
- [x] R160-ai-5b-3 — Bug fixes: indexed timeline ✓ icon, Firestore Timestamp handling, silence expected Pinecone 404
- [x] R160-ai-5d-1 — Retrieval backend: Voyage rerank-2.5 provider + searchPapers() cascade (vector top-20 → rerank top-5)
- [x] R160-ai-5d-2 — BM25 hybrid retrieval: wink-nlp + hybrid VI/EN tokenizer + RRF fusion + daily cron refit
- [x] R160-ai-5d-3 — searchPapers tool + citation UI (chips inline, sources panel auto-expanded)
- [x] R160-ai-5d-3b — Citation UI: click chip → modal popover (replaced inline sources panel)
- [x] R160-ai-5d-3d — Copy-as-LaTeX: Ctrl+C on equations → clipboard receives LaTeX source for Word Equation paste
- [x] R160-ai-5d-4 — Polish: LaTeX delim strict, metadata extract from OCR, Toaster mount check, Word dotted minus fix
- [x] R160-ai-5e-1 — Anti-hallucination L2+L3+L4: citation enforcement, numerical guard, rerank score threshold
