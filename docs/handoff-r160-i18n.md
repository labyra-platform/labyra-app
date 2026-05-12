# Labyra App — Handoff R160 Progress

**Last updated**: May 11, 2026
**Branch**: main
**Commits this session**: 9 (R160 series)
**Status**: Foundation complete, i18n infrastructure working

## Quick Context

Labyra Platform = AI-native lab management for materials science.
Rewrite from labbook-bku (Vite + vanilla TS) → Next.js 16 + shadcn + Tremor + Firebase.

## R160 9 commits done

1. R160-setup: clone Kiranism/next-shadcn-dashboard-starter template
2. R160-setup-2: cleanup template (removed clerk/kanban/chat/sentry/examples)
3. R160-firebase: install Firebase SDKs + lib/firebase/ (client+admin)
4. R160-auth: lib/auth/ + sign-in/up pages + proxy.ts, Google login works
5. R160-shell-1: branding metadata Labyra + remove emoji
6. R160-i18n-1: next-intl path-based routing, folder restructure app/[locale]/*
7. R160-i18n-2: string migration (auth pages + welcome), 13 Link imports, LocaleSwitcher component

## Current state

Working:
- Firebase Auth Google sign-in end-to-end
- Path-based i18n routing /en /vi
- /vi/dashboard/overview shows "Chào mừng trở lại"
- All builds passing

NOT migrated yet:
- Sidebar nav labels (Dashboard/Product/Users/Account/Notifications/Login)
- Breadcrumb segments
- KPI card labels (Total Revenue/New Customers/etc.)
- "Recent Sales" section
- LocaleSwitcher created but NOT mounted in UI

## R160-i18n-3 Plan (next sub-phases)

- 3a: Mount LocaleSwitcher into header (~15 min)
- 3b: Sidebar nav migration via nav-config.ts (~30 min)
- 3c: Dashboard KPI cards migration (~20 min)
- 3d: Breadcrumb i18n (~20 min)

## Verification commands on session start

```bash
cd ~/LAB-MANAGER/labyra-app
git status                    # clean
rm -rf .next && pnpm build    # all 17 routes generate
grep -c "^[A-Z_]\+=" .env.local  # 13+ vars
grep -rn "👋\|🔬\|🧪" src/ --include="*.tsx"  # no output (emoji rule)
```

## R160 Future phases (after i18n complete)

- R160-shell-2: Sidebar nav rewrite cho LabBook domains
- R160-dashboard: Tremor KPI + charts + Firebase data
- R160-materials/samples/experiments/data-assets: domain pages
- R160-lineage: D3 force-directed graph
- R160-inventory/bookings: CRUD + calendar
- R160-ai-chat: AI sidetab + RAG + tool calling
- R160-tests: Vitest + Playwright
- R160-deploy: Vercel CI/CD

Total realistic: 8-12 weeks.

## Recovery

Backup: ~/LAB-MANAGER/labyra-app.bak-pre-i18n/

Reset if broken:
```bash
git log --oneline -10
git reset --hard <good-commit>
rm -rf node_modules .next && pnpm install && pnpm build
```

End of handoff. Next: R160-i18n-3a mount LocaleSwitcher.
