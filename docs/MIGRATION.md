# Migration Plan: labbook-bku → labyra-app

## Status: R160 in progress (Setup phase)

## Domain mapping

| Old (labbook-bku) | New (labyra-app) | Status |
|---|---|---|
| `src/ts/main.ts` (entry) | `app/layout.tsx` + `app/(dashboard)/layout.tsx` | TODO |
| `src/ts/auth.ts` | `lib/firebase/auth.ts` + Next.js middleware | TODO |
| `src/ts/firebase.ts` | `lib/firebase/client.ts` + `lib/firebase/admin.ts` | TODO |
| `src/ts/state.ts` | `lib/store/` (Zustand) | TODO |
| `src/ts/domains/dashboard/page.ts` | `app/(dashboard)/page.tsx` | TODO |
| `src/ts/domains/materials/` | `app/(dashboard)/materials/` | TODO |
| `src/ts/domains/samples/` | `app/(dashboard)/samples/` | TODO |
| `src/ts/domains/experiments/` | `app/(dashboard)/experiments/` | TODO |
| `src/ts/domains/data-assets/` | `app/(dashboard)/data-assets/` | TODO |
| `src/ts/domains/lineage/` | `app/(dashboard)/lineage/` | TODO |
| `src/ts/domains/inventory/chemicals/` | `app/(dashboard)/chemicals/` | TODO |
| `src/ts/domains/inventory/equipment/` | `app/(dashboard)/equipment/` | TODO |
| `src/ts/domains/bookings/` | `app/(dashboard)/bookings/` | TODO |
| `src/ts/domains/members/` | `app/(dashboard)/members/` | TODO |
| `src/ts/domains/users/` | `app/(dashboard)/account/` | TODO |
| `src/ts/domains/dashboard/overview.ts` (data-assets) | `app/(dashboard)/data-assets/overview/page.tsx` | TODO |
| `src/ts/domains/ai/` | `components/ai/` + `lib/ai/` | TODO |
| `src/ts/domains/notifications/` | `components/notifications/` + `lib/notifications/` | TODO |
| `src/css/main.css` (3406 LOC) | `app/globals.css` + Tailwind v4 + shadcn theme | TODO |
| `src/css/carbon-tokens.css` (R158b) | `app/globals.css` color palette reference | TODO |
| 219 Vitest tests | `tests/` (Vitest) + `e2e/` (Playwright) | TODO |
| 11 Cloud Functions | KHÔNG ĐỤNG — giữ nguyên backend | OK |
| Firebase RTDB/Firestore data | KHÔNG ĐỤNG — giữ nguyên schema | OK |

## Phase plan (R160 sub-rounds)

- **R160-setup** ✅ Repo + template clone (THIS PHASE)
- **R160-firebase** — Firebase admin/client split + env vars + middleware
- **R160-auth** — Firebase Auth swap (replace Clerk)
- **R160-shell** — App layout + sidebar customize Labyra brand
- **R160-dashboard** — Tremor KPI cards + charts + Firebase data
- **R160-materials** — Materials list + CRUD
- **R160-samples** — Samples + lineage links
- **R160-experiments** — Experiments unified
- **R160-data-assets** — DataAssets + Plotly analyzers
- **R160-lineage** — D3 force-directed graph
- **R160-inventory** — Chemicals + Equipment + Ink
- **R160-bookings** — Equipment booking calendar
- **R160-ai-chat** — AI sidetab + RAG + tool calling
- **R160-members** — User management
- **R160-tests** — Port 219 Vitest tests
- **R160-deploy** — Vercel CI/CD

Total: 14 sub-rounds. Realistic: 8-12 weeks.

## Design tokens (from R158 Carbon foundation)

- **Primary**: Electric Cyan `#0EA5E9` (sky-500)
- **Sidebar**: Slate 900 `#0F172A`
- **Status**: Emerald/Amber/Red/Cyan (Carbon-aligned)

(Adjustments may apply per shadcn theme system + Tweakcn presets)
