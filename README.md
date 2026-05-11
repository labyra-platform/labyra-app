# Labyra App

AI-native lab management platform for materials science research.

Forked architecture from [next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) with Firebase backend.

## Stack

- **Framework**: Next.js 16 App Router + TypeScript strict
- **UI**: shadcn/ui + Tremor (dashboard analytics)
- **Styling**: Tailwind CSS v4 + CSS Variables
- **State**: Zustand + TanStack Query v5
- **Auth**: Firebase Auth (Google + Email/Password)
- **Backend**: Firebase Firestore + RTDB + Storage + Cloud Functions (asia-southeast1)
- **Charts**:
  - Tremor (KPI, sparkline, simple)
  - Plotly.js (scientific spectra — dynamic import)
  - Three.js (3D viz — Phase D)
  - D3.js (lineage graph)
- **Tests**: Vitest (unit) + Playwright (e2e)
- **Lint**: ESLint Strict + Prettier + Husky + lint-staged
- **Deploy**: Vercel (hosting) + Firebase (backend services)

## Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000

## Migration from labbook-bku

This is the React/Next.js rewrite of the Vite + vanilla TS application
at `github.com/emnam009009/labbook-bku`. See `docs/MIGRATION.md` for
domain mapping and migration progress tracking.

## License

UNLICENSED — proprietary commercial product (Labyra Platform).
