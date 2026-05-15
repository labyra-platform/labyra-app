# Context Snapshot
> Generated 2026-05-12 05:47 — gitignored, regenerate with `pnpm snapshot`.
> Read this first when starting a new agent session.

## Project
- **Name**: Labyra Platform
- **Vision**: AI-native lab management SaaS for materials science research
- **Stack**: Next.js 16 (App Router) + TypeScript strict + Firebase + multi-tenant
- **Tenant model**: `/tenants/{tenantId}/...` sub-collection
- **Deploy target**: Vercel (frontend) + Firebase (backend) + Cloud Run (Python, future)

## Required reading (in order)
1. **CLAUDE.md** — coding rules (non-negotiable)
2. **docs/ARCHITECTURE.md** — system overview
3. **docs/ai/AI_ARCHITECTURE.md** — AI layer detail (inherited from labbook-bku)
4. **ROADMAP.md** — phases + progress
5. **docs/WORKFLOW.md** — dev process
6. **docs/handoff.md** — last session state
7. **This file** — current snapshot

## Progress
- **Phase progress**: 18/32 checkpoints done (~56%)
- **Current phase**: (not marked)

## Git state
- **HEAD**: 2d1c587
- **Branch**: main
- **Working tree**: ⚠ dirty (uncommitted changes)

### Recent commits
```
  2d1c587 docs(workflow): add dev vs prod performance note [R160-workflow-perf]
  daf8807 chore(cleanup): remove Kiranism template residue [R160-cleanup-1]
  3e5ac16 chore: replace template AGENTS.md with Labyra-specific bootstrap doc
  5f89e95 chore(firebase): add .firebaserc with project alias [dev]
  bea533a docs: ARCHITECTURE + WORKFLOW + README refresh + handoff template [R160-meta-2]
```

### Files changed in last commit
```
  A	docs/WORKFLOW.md
```

## Stack versions
```
  next: 16.2.1
  react: 19.2.4
  firebase: ^12.13.0
  firebase-admin: ^13.9.0
  next-intl: ^4.11.1
  @tanstack/react-query: ^5.95.2
  tailwindcss: ^4.2.2
  typescript: 5.7.2
```

## Codebase structure (key paths)

### src/app/[locale]/
  src/app/[locale]/(auth)/layout.tsx  (0.4KB)
  src/app/[locale]/(auth)/sign-in/page.tsx  (3.4KB)
  src/app/[locale]/(auth)/sign-up/page.tsx  (3.5KB)
  src/app/[locale]/dashboard/ai-assistant/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/bookings/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/chemicals/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/data-assets/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/debug-auth/page.tsx  (3.4KB)
  src/app/[locale]/dashboard/equipment/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/experiments/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/layout.tsx  (1.2KB)
  src/app/[locale]/dashboard/lineage/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/materials/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/members/page.tsx  (0.5KB)
  src/app/[locale]/dashboard/notifications/page.tsx  (0.2KB)
  src/app/[locale]/dashboard/overview/@area_stats/default.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@area_stats/error.tsx  (0.4KB)
  src/app/[locale]/dashboard/overview/@area_stats/loading.tsx  (0.2KB)
  src/app/[locale]/dashboard/overview/@area_stats/page.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@bar_stats/default.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@bar_stats/error.tsx  (1.8KB)
  src/app/[locale]/dashboard/overview/@bar_stats/loading.tsx  (0.2KB)
  src/app/[locale]/dashboard/overview/@bar_stats/page.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@pie_stats/default.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@pie_stats/error.tsx  (0.4KB)
  src/app/[locale]/dashboard/overview/@pie_stats/loading.tsx  (0.2KB)
  src/app/[locale]/dashboard/overview/@pie_stats/page.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@sales/default.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/@sales/error.tsx  (0.4KB)
  src/app/[locale]/dashboard/overview/@sales/loading.tsx  (0.2KB)
  src/app/[locale]/dashboard/overview/@sales/page.tsx  (0.1KB)
  src/app/[locale]/dashboard/overview/error.tsx  (0.4KB)
  src/app/[locale]/dashboard/overview/layout.tsx  (1.4KB)
  src/app/[locale]/dashboard/page.tsx  (0.1KB)
  src/app/[locale]/dashboard/samples/page.tsx  (0.5KB)
  src/app/[locale]/global-error.tsx  (0.3KB)
  src/app/[locale]/layout.tsx  (0.8KB)
  src/app/[locale]/not-found.tsx  (1.0KB)
  src/app/[locale]/page.tsx  (0.1KB)

### src/lib/auth/
  src/lib/auth/actions.ts  (1.4KB)
  src/lib/auth/auth-provider.tsx  (2.4KB)
  src/lib/auth/index.ts  (0.8KB)
  src/lib/auth/refresh-claims.ts  (0.9KB)
  src/lib/auth/server.ts  (1.5KB)
  src/lib/auth/use-auth.ts  (0.4KB)
  src/lib/auth/use-claims.ts  (1.7KB)

### src/lib/firebase/
  src/lib/firebase/admin.ts  (3.0KB)
  src/lib/firebase/client.ts  (1.6KB)
  src/lib/firebase/config.ts  (2.1KB)
  src/lib/firebase/index.ts  (0.6KB)

### src/lib/firestore/
  src/lib/firestore/queries/dashboard.ts  (6.2KB)
  src/lib/firestore/use-tenant-collection.ts  (1.8KB)

### src/components/layout/
  src/components/layout/app-sidebar.tsx  (5.6KB)
  src/components/layout/cta-github.tsx  (0.6KB)
  src/components/layout/header.tsx  (1.2KB)
  src/components/layout/info-sidebar.tsx  (3.3KB)
  src/components/layout/page-container.tsx  (1.9KB)
  src/components/layout/providers.tsx  (0.4KB)
  src/components/layout/query-provider.tsx  (0.5KB)
  src/components/layout/user-nav.tsx  (0.1KB)

### src/features/
  src/features/notifications/components/notification-center.tsx  (3.9KB)
  src/features/notifications/components/notifications-page.tsx  (3.1KB)
  src/features/notifications/utils/store.ts  (3.5KB)
  src/features/overview/components/area-graph-skeleton.tsx  (0.8KB)
  src/features/overview/components/area-graph.tsx  (2.3KB)
  src/features/overview/components/bar-graph-skeleton.tsx  (0.9KB)
  src/features/overview/components/bar-graph.tsx  (2.9KB)
  src/features/overview/components/kpi-cards.tsx  (2.5KB)
  src/features/overview/components/pie-graph-skeleton.tsx  (0.7KB)
  src/features/overview/components/pie-graph.tsx  (2.0KB)
  src/features/overview/components/recent-sales-skeleton.tsx  (1.0KB)
  src/features/overview/components/recent-sales.tsx  (1.7KB)

### src/config/
  src/config/data-table.ts  (2.6KB)
  src/config/infoconfig.ts  (2.7KB)
  src/config/nav-config.ts  (3.6KB)

### scripts/
  scripts/generate-context-snapshot.mjs  (8.6KB)
  scripts/seed-dev-tenant.mjs  (7.8KB)

### messages/
  messages/en.json  (3.4KB)
  messages/vi.json  (3.9KB)

### config
  next.config.ts  (0.7KB)
  firestore.rules  (2.9KB)
  firebase.json  (0.3KB)
  firestore.indexes.json  (0.0KB)
  src/proxy.ts  (3.0KB)
  src/i18n/routing.ts  (0.4KB)

## Conventions reminder
- **Patches**: Python idempotent scripts → `/mnt/d/labbook-patches/` → user runs
- **Commits**: Conventional Commits + `[R###-phase-X]` tag
- **Diff limit**: 400 LOC per commit
- **i18n**: `messages/{en,vi}.json` — `nav.*`, `dashboard.*`, `auth.*` namespaces
- **Auth claims**: `tenantId` + `role` (admin/superadmin/member/viewer)
- **Firestore**: scope under `/tenants/{tenantId}/...` (rules enforce)
- **Icons**: Tabler (current); CLAUDE.md says Lucide (tech debt, deferred)
- **Charts**: recharts (was Tremor, migrated R160-dashboard-1)

## Anti-patterns to watch
- Top-level Firestore collections with `tenantId` field → use sub-collection
- `index` as React `key` prop → use stable id
- Inline styles or hardcoded colors → CSS variables + Tailwind
- `console.log` in production → use logger
- `any` type / `@ts-nocheck` → `unknown` + type guard

## Quick verification commands
```bash
git status                       # working tree state
rm -rf .next && pnpm build       # full build, ~30s
pnpm dev                         # localhost:3000
```
