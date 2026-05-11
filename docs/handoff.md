# Labyra App — Handoff R160 Progress

**Last updated**: May 11, 2026 (end of mega-session)
**Branch**: main
**Commits this session**: 9 (R160 series)
**Status**: Foundation complete, i18n infrastructure working

---

## Quick Context

**Project**: Labyra Platform — AI-native lab management for materials science.
**Repo**: github.com/labyra-platform/labyra-app (private)
**Stack rewrite from**: github.com/emnam009009/labbook-bku (Vite + vanilla TS)

**Why rewrite**: User decided template-based shadcn/ui + Tremor approach for SaaS-grade UI/UX. R158 Carbon Design System effort on labbook-bku merged but deferred for full Next.js rewrite.

---

## Stack (final, confirmed)

| Layer | Tech |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript strict |
| Styling | Tailwind v4 + CSS Vars |
| UI Kit | shadcn/ui + Tremor |
| State | Zustand + TanStack Query v5 |
| Auth | Firebase Auth (Google + Email/Password) |
| Backend | Firebase Admin (server) + Client (browser) split |
| Database | Firestore + RTDB (giữ schema cũ) |
| Charts | Tremor (dashboard) + Plotly.js (scientific) + Three.js (3D Phase D) + D3 (lineage) |
| i18n | next-intl 4.x, path-based routing, locales: en + vi |
| Tests | Vitest (TBD) + Playwright (TBD) |
| Lint | ESLint Strict + Prettier + Husky + lint-staged (fixed pnpm not bun) |
| Monorepo | pnpm workspaces |
| Hosting | Vercel (frontend) + Firebase (backend services) |
| Cloud Functions | Giữ nguyên 11 functions asia-southeast1 |

---

## Codebase rules (CLAUDE.md root 619 LOC)

**Read CLAUDE.md FIRST** mọi session. Highlights:
- TS strict, no `any`, no `@ts-nocheck`
- kebab-case files, PascalCase components
- Max 200 LOC per component, 150 hook, 100 utility
- **Icons: ONLY Lucide React** (no heroicons/tabler/phosphor/material)
- **NO emoji in UI** (strict rule, user enforces)
- Tailwind CSS vars only (no hardcode colors)
- Zustand + TanStack Query (no `window.*` globals)
- Multi-tenant: every Firestore query MUST have tenantId filter
- WCAG 2.1 AA accessibility
- Every page: metadata + loading.tsx + error.tsx

---

## R160 Progress (9 commits)

### ✅ R160-setup (initial template clone)
- Cloned `Kiranism/next-shadcn-dashboard-starter` (6k+ stars Next.js 16 + shadcn)
- Removed template `.git`, customized `package.json` (name=labyra-app)
- Pre-existing dev tooling kept (Husky, lint-staged, oxlint, oxfmt)

### ✅ R160-setup-2 (cleanup template features)
- Removed via `node scripts/cleanup.js --interactive`:
  - **clerk** (replaced by Firebase Auth in R160-auth)
  - **kanban** (LabBook không cần)
  - **chat** (LabBook có AI sidetab riêng)
  - **sentry** (defer error tracking)
  - **examples** (Forms/React Query/Icons demo pages)
- Kept: notifications, themes
- Fixed: form-context.tsx import @tanstack/form-core → @tanstack/react-form
- Fixed: nav-config.ts dangling comma `items: [,`
- Fixed: .husky hooks bun → pnpm

### ✅ R160-firebase (Firebase SDKs setup)
- `pnpm add firebase firebase-admin`
- Created `src/lib/firebase/`:
  - `config.ts` — typed env vars + validation
  - `client.ts` — browser SDK singleton (Auth/Firestore/RTDB/Storage)
  - `admin.ts` — server SDK với `server-only` package
    - Helpers: verifyIdToken, getUserById, setUserClaims (tenantId)
  - `index.ts` — barrel (client only, admin explicit import)
- Updated `.env.example` template
- **Multi-tenant ready**: setUserClaims supports custom claims

### ✅ R160-auth (Firebase Auth foundation)
- Created `src/lib/auth/`:
  - `auth-provider.tsx` — AuthContext + cookie sync (`__session` cookie for server)
  - `use-auth.ts` — useAuth() hook
  - `server.ts` — getCurrentUser, requireAuth, requireRole
  - `actions.ts` — signIn/Up/Out with Google + email/password
  - `index.ts` — barrel
- Created `src/app/[locale]/(auth)/`:
  - `layout.tsx` — centered auth layout
  - `sign-in/page.tsx` — login form
  - `sign-up/page.tsx` — signup form
- Created `src/proxy.ts` (Next.js 16 renamed from middleware):
  - Edge-safe cookie check
  - Protect `/dashboard/*` → redirect `/sign-in`
- Updated root `src/app/layout.tsx` wrap với AuthProvider (later moved to `[locale]/layout.tsx` ở R160-i18n)
- Fixed: `JSX.Element` deprecated React 19 → `React.ReactElement`
- Firebase Console: Google + Email/Password providers enabled, project name "Labyra"
- **Tested working end-to-end**: Google login → cookie set → dashboard accessible

### ✅ R160-shell-1 (branding minimal)
- Renamed metadata: "Next Shadcn" → "Labyra"
- Description: "AI-native lab management for materials science"
- Removed emoji 👋 từ 2 files (CLAUDE.md rule):
  - `src/features/overview/components/overview.tsx`
  - `src/app/[locale]/dashboard/overview/layout.tsx`

### ✅ R160-i18n-1 (next-intl infrastructure)
- `pnpm add next-intl@4.11`
- Created `src/i18n/`:
  - `routing.ts` — locales ['en', 'vi'], default 'en', localePrefix 'always'
  - `request.ts` — getRequestConfig server-side message loading
  - `navigation.ts` — Link/redirect/useRouter wrappers
- Created `messages/en.json` + `messages/vi.json` (common/nav/auth/dashboard/locale)
- **Folder restructure**: `src/app/*` → `src/app/[locale]/*`
  - Moved: (auth), about, api, dashboard, favicon.ico, global-error.tsx, not-found.tsx, page.tsx, privacy-policy, terms-of-service
- Created `src/app/[locale]/layout.tsx` (NextIntlClientProvider + AuthProvider)
- Updated `src/proxy.ts`: combined next-intl middleware + auth checks (strip locale prefix logic)
- Updated `next.config.ts`: wrapped with `withNextIntl('./src/i18n/request.ts')`
- Removed AuthProvider từ root layout (moved to [locale] layout)
- **Tested**: `/` → `/en`, `/vi/dashboard/overview` shows Vietnamese URL

### ✅ R160-i18n-2 (string migration + LocaleSwitcher)
- Migrated sign-in/page.tsx + sign-up/page.tsx hardcoded strings → `useTranslations('auth')`
- Migrated overview/layout.tsx: 'Welcome back' → `getTranslations('common').t('welcomeBack')`
  - Server Component, async function pattern
- Updated 13 files: `import Link from 'next/link'` → `import { Link } from '@/i18n/navigation'`
- Created `src/components/locale-switcher.tsx`:
  - DropdownMenu với Globe icon (Lucide)
  - English + Tiếng Việt options
  - useTransition for smooth locale change
- Installed `lucide-react` (template didn't ship by default)
- Fixed broken `'{t('signingIn')}'` in JSX strings → `t('signingIn')` expression
- **Tested**: `/vi/dashboard/overview` shows "Chào mừng trở lại" ✓

---

## Current state breakdown

### Working
- ✅ Repo on GitHub: github.com/labyra-platform/labyra-app
- ✅ Firebase Auth (Google sign-in works end-to-end)
- ✅ Path-based i18n routing (/en, /vi)
- ✅ Vietnamese welcome message ("Chào mừng trở lại")
- ✅ English welcome message ("Welcome back")
- ✅ All routes protected (`/dashboard/*` → `/sign-in` if no session)
- ✅ Build pass (17 routes total)
- ✅ Husky pre-push hook runs `pnpm build`

### Not yet migrated (still English, even on /vi route)
- ❌ Sidebar nav labels: Dashboard, Product, Users, Elements, Account, Notifications, Login
- ❌ Breadcrumb segments: "Dashboard", "Overview" (and raw "Vi" locale shows)
- ❌ KPI card labels: Total Revenue, New Customers, Active Accounts, Growth Rate
- ❌ KPI descriptions: "Trending up this month", "Down 20% this period"
- ❌ Recent Sales section: "Recent Sales", "You made 265 sales this month"
- ❌ User dropdown: account menu items

### LocaleSwitcher status
- ✅ Component created at `src/components/locale-switcher.tsx`
- ❌ **NOT mounted** anywhere — user can't toggle EN ↔ VI yet
- TODO R160-i18n-3a: Add `<LocaleSwitcher />` vào header (cạnh ThemeSelector hoặc trong user-nav)

---

## Critical: Things to verify on session start

```bash
cd ~/LAB-MANAGER/labyra-app

# 1. Verify clean git state
git status
# Expected: clean

# 2. Verify build still passes
rm -rf .next
pnpm build 2>&1 | tail -10
# Expected: all 17 routes generated

# 3. Verify environment variables present
grep -c "^[A-Z_]\+=" .env.local
# Expected: 13+ (firebase client 7 + admin 3 + app 3+)

# 4. Verify .env.local NOT in git (sensitive)
git check-ignore .env.local
# Expected: .env.local (means ignored)

# 5. Quick scan for issues:
# - Look for emojis in UI (rule violation)
grep -rn "👋\|🔬\|🧪" src/ --include="*.tsx" 2>/dev/null
# Expected: no output

# - Look for hardcoded strings still pending migration
grep -rln "Welcome back\|Recent Sales\|Total Revenue" src/ --include="*.tsx" 2>/dev/null
```

---

## R160-i18n-3 Plan (next session)

Split into sub-phases để safe:

### R160-i18n-3a (~15 min): Mount LocaleSwitcher
- Inventory: `cat src/components/layout/header.tsx`
- Add `<LocaleSwitcher />` next to existing ThemeSelector or in user-nav menu

### R160-i18n-3b (~30 min): Sidebar nav migration
- File: `src/config/nav-config.ts`
- Pattern: titles → translation keys, render time `t(item.titleKey)`
- Or: pass `t` to sidebar component, lookup at render
- Files affected: nav-config.ts, app-sidebar.tsx, info-sidebar.tsx

### R160-i18n-3c (~20 min): Dashboard KPI cards
- File: `src/app/[locale]/dashboard/overview/layout.tsx`
- Migrate 4 cards × 3 strings each (label + delta + description)
- Use `t('dashboard.totalRevenue')` etc. (keys already in messages/*.json)

### R160-i18n-3d (~20 min): Breadcrumb i18n
- File: `src/hooks/use-breadcrumbs.tsx`
- Map URL segments → translated labels
- Hide locale segment ("Vi", "En") or display localized name

### R160-i18n-3e (defer): Migrate remaining features
- Notifications page
- Product → Materials rename
- Users → Members rename
- Settings page

---

## R160 Future Phases (after i18n complete)

| Phase | Scope | Effort |
|---|---|---|
| R160-shell-2 | Sidebar nav rewrite cho LabBook domains (Materials, Samples, Experiments, DataAssets, Lineage, Chemicals, Equipment, Bookings, Members, AI Assistant) | 1.5h |
| R160-dashboard | Tremor KPI cards + charts + Firebase data integration | 5-7 days |
| R160-materials | Materials list + CRUD | 3-5 days |
| R160-samples | Samples + lineage links | 3-5 days |
| R160-experiments | Experiments unified | 5-7 days |
| R160-data-assets | DataAssets + Plotly analyzers integration | 5-7 days |
| R160-lineage | D3 force-directed graph port từ R154 | 3-5 days |
| R160-inventory | Chemicals + Equipment + Ink CRUD | 3-5 days |
| R160-bookings | Equipment booking calendar | 3-5 days |
| R160-ai-chat | AI sidetab + RAG + tool calling rewrite | 7-10 days |
| R160-members | User management + role admin | 2-3 days |
| R160-tests | Port 219 Vitest tests + new Playwright e2e | 5-7 days |
| R160-deploy | Vercel CI/CD setup, env vars, preview deployments | 2-3 days |

Total: 8-12 weeks realistic for full R160 completion.

---

## Important context for AI agent (new session)

1. **Read CLAUDE.md root first** — 619 LOC coding rules, strict TypeScript, no any, Lucide only, no emoji, kebab-case files, max 200 LOC components
2. **User prefers Vietnamese chat** but English code/commits
3. **User is concise**: short direct answers, no preamble, no extensive trade-off analysis unless asked
4. **Patch convention**: filename includes round (vd `r160-i18n-3a-mount.py`)
5. **WSL Ubuntu** working dir: `~/LAB-MANAGER/labyra-app/`
6. **Patch staging**: `cp` (not `mv`) from `/mnt/c/Users/LEGION/Downloads/` to `/mnt/d/labbook-patches/`
7. **Long files**: prefer `cat > path << 'EOF'` heredoc commands
8. **Firebase project**: `lab-manager-268a6` (shared với labbook-bku cũ, multi-tenant strategy planned)
9. **Branch strategy**: work on main, no PRs needed (single dev)
10. **Pre-commit hook**: `pnpm build` must pass — broken build will block push

---

## Recovery commands nếu broken

```bash
# Backup pre-i18n exists
ls -la ~/LAB-MANAGER/labyra-app.bak-pre-i18n/ 2>/dev/null

# Reset to last known good commit
cd ~/LAB-MANAGER/labyra-app
git log --oneline -10
git reset --hard <commit-hash>

# Re-install deps clean
rm -rf node_modules .next
pnpm install
pnpm build
```

---

**End of handoff. Next session: continue R160-i18n-3 (Mount LocaleSwitcher first, then sidebar migration).**
