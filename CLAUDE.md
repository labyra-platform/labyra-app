# CLAUDE.md — Labyra App Coding Rules

> Read FIRST before any architectural decision or code change.
> Update sau mỗi round có lesson mới.

<!-- R187-docs-update-2026-05-21 -->

**Repo**: `github.com/labyra-platform/labyra-app` (Next.js 16 main app)
**Worker repo**: `github.com/emnam009009/labyra-spectra-worker` (Python Cloud Run)
**User GitHub**: `emnam009009` (NOT `emnam009`)

---

## 1. Core stack rules

### Language

- TypeScript strict mode, no `any`, no `@ts-nocheck`
- Use `unknown` + type guards
- `satisfies` operator for type-safe object literals
- ESM only (`"type": "module"`)

### File naming

- **kebab-case** for files: `cost-guard.ts`, `tier-badge.tsx`
- **PascalCase** for components: `TierBadge`, `MessageList`
- **camelCase** for functions/vars: `getTenantId`, `recordCost`
- **UPPER_SNAKE** for constants: `MAX_TOOL_ROUNDS`, `FALLBACK_TIER`

### Size limits

- Max 200 LOC per component file
- Max 150 LOC per hook
- Max 100 LOC per utility function
- Split larger files into focused modules

### React patterns

- Server Components default; `'use client'` only when needed (state, effects, refs)
- React Hook Form + Zod for ALL forms
- TanStack Query for server state, Zustand for client state
- No `window`/`document` in Server Components
- Hooks (`useMemo`/`useState`/`useEffect`) MUST be called before any conditional early return. Violations = runtime crash on prod ("Rendered more hooks than during the previous render"). Audit hook order before every patch touching components with hooks.

### Lint conventions (oxlint — `.oxlintrc.json`, R195 cleanup 90 -> 0)

`pnpm lint:strict` (= `oxlint --deny-warnings`) must stay at 0 warnings; the
pre-push hook enforces it. Three deliberate rule decisions — do NOT undo them:

1. **`_`-prefix = intentionally unused.** Enforced via `no-unused-vars`
   `argsIgnorePattern`/`varsIgnorePattern: "^_"`. `no-underscore-dangle` is set
   `"off"` (it conflicts with the `^_` convention) — **do not re-enable it**.
   To rename an unused destructured field, use an alias: `const { locale: _locale }`
   (the key must still match the source type).
2. **`react/no-unstable-nested-components` is `"off"`.** All hits were
   false-positives: library render-props, not nested components — data-table column
   `cell: (r) => <.../>`, react-markdown `components={{...}}`, react-day-picker
   `components={{ Chevron }}`, kbar `onRender`. **Do not refactor these.**
3. **`logger.ts` is the only file allowed to call `console`** (via
   `// eslint-disable-next-line no-console`). Everywhere else, use the `logger`.

To silence an oxlint rule, set it to `"off"` in `.oxlintrc.json`. **Never delete
its `rules{}` block** — a block there usually *softens* a category-enabled rule
(e.g. via an `allow` list); deleting it removes the softening and the rule fires
*harder*.

### Forms (mandatory shadcn pattern)

```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="fieldName"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Label</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

No custom HTML `<label>`/`<input>` — always shadcn Form/FormField/FormItem/FormLabel/FormControl/FormMessage.

### Tables (shadcn Table)

Use `<Table>`, `<TableHeader>`, `<TableRow>`, `<TableCell>` from `@/components/ui/table`. Do NOT recreate Carbon design system styles from labbook-bku.

---

## 2. Styling

### Tailwind tokens ONLY

Use CSS variables, no hardcoded colors:
- `bg-background`, `text-foreground`, `border-border`
- `bg-muted`, `text-muted-foreground`
- `bg-accent`, `bg-primary`, `bg-destructive`
- `bg-card`, `border-input`

No hex colors (`#3b82f6`) or named colors (`bg-blue-500`) except in tier-specific palettes (e.g., TIER_COLORS in message-bubble.tsx where each tier has assigned semantic color).

### Brand theme + fonts (R187)

SINGLE brand theme (theme key `vercel` = Labyra; 9 other themes cut). Keep dark/light mode only. Brand fonts: Inter (--font-sans, body), Plus Jakarta Sans (--font-display, headings — defined but NOT yet applied to h1-h4, pending), JetBrains Mono (--font-mono). All animations MUST respect prefers-reduced-motion (global block in globals.css).

### Icons

- **`@tabler/icons-react`** ONLY (NOT Lucide — historical decision R162)
- Centralized in `src/components/icons.tsx`:
  ```tsx
  import { IconChemistry, IconBeaker } from '@tabler/icons-react';
  export const Icons = { chemicals: IconChemistry, samples: IconBeaker, ... };
  ```
- Pattern: `<Icons.chemicals className="h-4 w-4" />`

### No emoji in code

Emojis OK in user-facing messages (i18n) but NOT in code comments, commit messages, or function names.

---

## 3. Multi-tenant rules

Every Firestore query MUST have `tenantId` filter:

```ts
// ✅ Correct
const samples = await db
  .collection(`tenants/${tenantId}/samples`)
  .get();

// ❌ Wrong — cross-tenant leak
const samples = await db
  .collection('samples')
  .get();
```

Server-side: extract tenantId via `getTenantIdFromToken(decoded)` from `@/lib/auth/token` (22+ routes use this).

Client-side: `useTenantId()` from `@/lib/auth/use-claims`.

Custom claims pattern: each user has SINGLE `tenantId`. No cross-tenant superadmin in runtime — those operations use service account via admin SDK scripts.

### Collection naming (R186/R187 — CRITICAL)

Spectra collection = **`spectra`** (worker source of truth: notify-complete writes `tenants/{tid}/spectra/{id}`, storage path spectra/.../raw, indexes use spectra). URL routes `/api/measurements/*` are fine but their backend reads collection `spectra`. TS type name = `Measurement`/`SpectrumMetadata`; COLLECTION constant = `spectra`. DO NOT rename spectra→measurements (breaks worker). R187 fixed DELETE route that wrongly targeted `measurements`.

### Soft-delete (R187 — CRITICAL)

Delete = deprecate/retract (set `lifecycleStatus`), NOT hard delete (ADR-016 immutability). Therefore EVERY client list hook MUST filter out `deprecated` + `retracted`:
```ts
.filter((x) => x.lifecycleStatus !== 'deprecated' && x.lifecycleStatus !== 'retracted')
```
R187 fixed all 3 spectra hooks (rows stayed visible after delete). Apply to any new entity.

**Superadmin role (R172)**: separate from tenant. Stored in custom claims `role: 'superadmin'`. Cross-tenant access via `requireSuperadmin()` guard. Cron jobs use service account `cron-runner@labyra-app-dev.iam.gserviceaccount.com`.

---

## 4. Next.js 16 middleware convention

File is `src/proxy.ts` (default export `proxy`), NOT `middleware.ts`. If both exist → build fails:
> Both middleware file and proxy file are detected

Labyra-app `proxy.ts` handles:
- i18n routing (next-intl)
- Auth check + session refresh
- CSRF check + Origin allowlist (R162 Stage 1 Security)
- Rate limit (Firestore-based, R162)

Matcher pattern: `/((?!_next|_vercel|.*\\..*).*)` includes /api routes.

When adding middleware logic (rate limit, CSRF, headers), MERGE into proxy.ts, do NOT create new middleware file.

---

## 5. Firebase + Admin SDK

### Client SDK (`firebase/auth`, `firebase/firestore`)

Use in client components only. Wrap in custom hooks like `useTenantId`, `useUser`.

### Admin SDK (server-only)

Files with `firebase-admin` imports → MUST have `'server-only'` directive at top:

```ts
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
```

**`'server-only'` package rules** (R165 lesson):
- USE only for modules with firebase-admin / fs / Node-only API
- Do NOT use for modules shared with edge runtime (proxy.ts / middleware) or client components
- Pure business logic (e.g., `match-score.ts`, scoring algorithms) MUST be separated from admin SDK imports — extract pure file so client components can import

### Admin SDK initialization (R172 lesson)

Do NOT use raw `getAuth()` from `firebase-admin/auth` — default app may not be initialized in dev/test:

```ts
// ❌ Wrong — may throw "default Firebase app does not exist"
import { getAuth } from 'firebase-admin/auth';
const decoded = await getAuth().verifyIdToken(token);

// ✅ Correct — use Labyra wrapper
import { getAdminAuthService } from '@/lib/firebase/admin';
const decoded = await getAdminAuthService().verifyIdToken(token);
```

Same pattern for Firestore: `getAdminFirestoreService()` instead of `getFirestore()`.

### Client SDK auth (R187 lesson — CRITICAL)

Client components / hooks MUST use `getFirebaseAuth()` from `@/lib/firebase/client`, NOT bare `getAuth()` from `firebase/auth`. Bare `getAuth()` throws "No Firebase App '[DEFAULT]'" on early mount (crashed Lineage Explorer; forms only worked by luck in event handlers). R187 fixed 17 files.

### Firestore Database

Project: `labyra-app-dev`
Database: `(default)`
Region: `asia-southeast1` for nested resources

For migration scripts, set env:
```bash
FIRESTORE_DATABASE_ID="(default)"
```

---

## 6. AI tier rules (R168→R175)

### 6-tier production stack

| Tier | Model (R176-2bc, verified R187) | Capability | Trigger |
|---|---|---|---|
| T0 | gemini-3.1-flash-lite | security-router | Mọi chat (intent classifier) |
| T1 | gemini-3-flash-preview | tool-calling-cheap | `feature: 'lab_ops'` |
| T2 | gemini-3-flash-preview | rag-balanced | `feature: 'theory'` (default) |
| T3 | claude-sonnet-4-6 | reasoning-balanced | `feature: 'spectrum_analysis'` |
| T4 | claude-sonnet-4-6 | reasoning-balanced | `feature: 'paper_writing'` (keyword override) |
| T5 | claude-opus-4-7 | reasoning-frontier | `POST /api/messages/[id]/audit` (explicit) |

UI labels (decoupled from model): T1 Lab Manager, T2 Librarian, T3 Engineer,
T4 Writer, T5 Auditor. Gemini 3.5 Flash adoption DEFERRED (ADR-032 — 3x cost,
3-flash works; wait for GA on Gemini API).

### Capability abstraction (single source of truth)

Edit `src/lib/ai/config/capabilities.ts` to swap models. Tier→Capability→Model mapping via `TIER_CAPABILITY[tier]` and `CAPABILITY_MAP[capability]`. Do NOT hardcode model strings in tier handlers.

### Gemini provider lessons

1. **`thought_signature` requirement (R174-1 → RESOLVED R176-2a)**: Gemini 3 requires `thought_signature` in multi-turn function calls. Fixed by migrating SDK `@google/generative-ai` → `@google/genai` 2.3.0 (auto-handles it). Gemini 3 re-adopted for T0-T2 (R176-2bc). Worker uses Python `google-genai` (pin too loose `>=0.10.0` — tighten to `>=2.3.0,<3.0.0`).

2. **`functionResponse` role split (R174-5)**: Gemini 2.5+ rejects `functionResponse` parts on role='user'. Must split message history:
   - text + functionCall → role='model'
   - functionResponse → role='function'

3. **Tool descriptions need imperative triggers** (R162 lesson): Gemini Flash needs "CALL THIS whenever..." + Vietnamese phrases + synonyms. Sonnet 4.6 matches semantically without this.

### Cost telemetry (mandatory for all LLM calls)

```ts
await recordCost({
  tenantId,
  tier,
  capability: getCapabilityForTier(tier),
  feature: intentDecision.feature,
  costUsd: totalUsage.usd,
  inputTokens: totalUsage.inputTokens,
  outputTokens: totalUsage.outputTokens,
  latencyMs: Date.now() - startedAt
});
```

Aggregated in `tenants/{tid}/_costs/{date}` with breakdowns by tier+feature.

### Cost Guard 4-gate pre-check (mandatory for non-T0 calls)

```ts
const estimated = estimateCost(tier, feature);
const costCheck = await checkCostGuard(tenantId, tier, feature, estimated);
if (!costCheck.allowed) {
  return new Response(JSON.stringify({ error: 'quota_exceeded', reason: costCheck.reason }), { status: 429 });
}
```

### Citation strategy (R166 + R175-1)

- Citations are GROUND TRUTH (Trust > Coverage principle)
- DOI ground truth via Crossref/OpenAlex (R166)
- T4 Writer uses `[authorYear]` format via `citation-loader.ts` (R175-1)
- NEVER let LLM hallucinate citations — always verify against RAG hits + paper metadata
- Defer until paper metadata complete (R176 backfill)

### Route maxDuration (R187 lesson)

RAG chat route (`/api/chat`) needs `export const maxDuration = 60` — multi-tier + up to 3 tool rounds + Pinecone hybrid search + Voyage rerank exceeds Vercel Pro's default 15s, causing `tool_timeout` on broad queries. Any long-running route: set maxDuration explicitly (Vercel Pro allows up to 300s; cron bm25-refit uses 300).

---

## 7. Patch + commit conventions

### Patch script naming

`round-NNNx-{slug}.py` or `.sh` — filename MUST include round number.

Example:
- `round-175-1-writer-citation-format.py`
- `round-174-hotfix7-t4-keyword-override.py`
- `round-173-deploy.sh`

### Patch execution

User runs:
```bash
python /mnt/d/labbook-patches/round-NNNx-{slug}.py
# or
bash /mnt/d/labbook-patches/round-NNNx-{slug}.sh
```

Do NOT include `cp` commands or manual file moves — user downloads patch script directly to `/mnt/d/labbook-patches/` from outputs.

### Patch script rules

- Idempotent (skip marker check at start)
- Backup `.bakNNN` per file modified (e.g., `.bak175-1`)
- Verify TS/Python compile xanh trước commit
- Output `/mnt/user-data/outputs/`

### Commits

- Conventional Commits format: `feat(scope): description`
- Max 400 LOC per commit (split if larger)
- Phase markers: `@phase R{NUM}{-suffix}` in code comments
- Each architectural change → ADR in `docs/adr/ADR-{NUM}-{slug}.md`

### Husky pre-push

Runs `rm -rf .next/dev/types` (clear stale route types), then
`pnpm exec tsc --noEmit` + `pnpm lint:strict` (oxlint --deny-warnings). Blocks the
push on any TS error OR any lint warning — this is what keeps lint debt at zero.

Use `--no-verify` only when you are certain the push is safe.

---

## 8. Session workflow

### Session-start MANDATORY sync check

```bash
# In BOTH repos
cd ~/LAB-MANAGER/labyra-app
git status -sb && git log --oneline origin/main..HEAD

cd ~/LAB-MANAGER/labyra-spectra-worker
git status -sb && git log --oneline origin/main..HEAD
```

Uncommitted code OR unpushed commits → sync (commit + push) BEFORE new work. No drift across sessions.

### Working dirs

- `~/LAB-MANAGER/labyra-app/` — Next.js Vercel
- `~/LAB-MANAGER/labyra-spectra-worker/` — Python Cloud Run
- `/mnt/d/labbook-patches/` — patch scripts
- `/mnt/d/labyra-newchat-context/` — context pack
- `/mnt/d/labyra-hand-tracking-stash/` — paused experimental feature (Vercel build blocker)

### Tech debt strategy

Surface tech debt items inline as they appear; integrate into next relevant patch instead of separate cleanup phase.

---

## 9. Scientific documentation rule

Every feature using algorithms, mathematical/physical/chemical methods MUST document at:
```
docs/scientific-methods/{topic}.md
```

Sections:
- Method name + brief description
- Formula (LaTeX)
- Physics/chemistry meaning
- References (DOI if available)
- Parameters / edge cases
- Implementation file path

Existing:
- `xrd-analysis.md` (R161)
- `citation-matching.md` (R166)

R176+ to add: `uv-vis-tauc-bandgap.md`, `ftir-sample-prep.md`, `raman-laser-selection.md`, `tga-atmosphere-effects.md`.

---

## 10. ADR conventions

Architecture Decision Records in `docs/adr/ADR-{NUM}-{slug}.md`.

Read in order before architectural decisions:
1. **ADR-015** Stage 1 Security (R162) — rate limit, CSRF, origin allowlist
2. **ADR-016** PROV-O ELN (R164) — entity model, lifecycle, versioning
3. **ADR-017** Citation Network (R166) — DOI ground truth strategy
4. **ADR-018** Async Worker Architecture (R167) — Pub/Sub paper pipeline
5. **ADR-019** AI Tier Architecture (R169) — capability abstraction, 6-tier
6. **ADR-020** Cost Controls (R170) — 4-gate Cost Guard, dry-run
7. **ADR-021** Inter-tier Protocols (R169-R170, partially deferred)
8. **ADR-022** Worker LLM Provider Strategy · **ADR-023** PDF Viewer/multi-paper RAG
9. **ADR-024/026** Data Integrity (L1/L2) · **ADR-025** Paper Domain Classify · **ADR-027** Journal Extraction
10. **ADR-028** Arch Upgrade+Security · **ADR-029** Graduated Security Testing
11. **ADR-030** RBAC & Onboarding (invite-only, member=CRUD, viewer=read-only, anti-escalation)
12. **ADR-032** AI Scaling + Rate-limit + v3.5 Eval (no per-tenant API split; defer 3.5 Flash; reject Managed Sandbox auto-code)

---

## 11. Anti-patterns to avoid

| Anti-pattern | Why avoid | Correct pattern |
|---|---|---|
| Carbon design system styles | Legacy from labbook-bku | shadcn/ui only |
| Lucide icons | Inconsistent with codebase | `@tabler/icons-react` |
| Custom HTML `<label>`/`<input>` | Loses accessibility, validation | shadcn Form/FormField |
| `any` type | Bypasses TS safety | `unknown` + type guards |
| `getAuth()` raw | May fail in dev | `getAdminAuthService()` |
| Hardcoded model strings | Painful vendor swap | `CAPABILITY_MAP` + `TIER_CAPABILITY` |
| LLM-generated DOIs | Hallucination risk | Crossref/OpenAlex ground truth |
| Hooks after conditional return | Runtime crash | Hoist hooks to top |
| `console.log` debug in prod | Pollution | Remove before commit |
| Unguarded Firestore field access | `undefined.length/.map` crashes whole page (R192) | `card.peaks?.length ?? 0`; `setState(apiData ?? [])` at the hook |
| Inline styles | Bypasses design system | Tailwind tokens only |
| Cross-tenant Firestore queries | Data leak | Always `tenantId` filter |
| `middleware.ts` in Next.js 16 | Conflicts with `proxy.ts` | Merge into `src/proxy.ts` |
| Bare `getAuth()` client-side | 'No Firebase App' crash | `getFirebaseAuth()` from @/lib/firebase/client |
| List hook without lifecycle filter | Deprecated rows stay visible | filter deprecated+retracted |
| Long route without maxDuration | Vercel 15s cut → tool_timeout | `export const maxDuration` |
| Per-tenant API key/project split | Quota shared per project; ops nightmare | Tier 2 + app rate-limit + Cost Guard (ADR-032) |
| Agent auto-writes scientific code | Non-reproducible, unverified | Deterministic documented worker (ADR-032) |
| Multiple themes / theme switcher | Template cruft, not a product feature | Single brand theme + dark/light |

---

## 12. Tech-stack-specific gotchas

### Vite 8 + Tailwind 3 (legacy labbook-bku)

- `type="module"` scripts: functions for inline handlers MUST be assigned to `window` explicitly
- Tailwind 3 not auto-purging dev → manual content config

### Next.js 16 + Turbopack (labyra-app)

- App Router server/client component boundary critical
- Use `'use client'` minimally
- Server actions experimental — prefer route handlers

### Firebase Functions Gen 2 (R171)

- `setGlobalOptions({ region: 'asia-southeast1', memory: '512MiB', timeout: 540 })` at top of `index.ts`
- Secrets via Secret Manager + `defineSecret()` (not env vars)
- Service account = `cron-runner@labyra-app-dev.iam.gserviceaccount.com`
- Cron via `onSchedule()` with cron expression (UTC)

### BigQuery export (R173-3)

- Billing export needs `bq mk` dataset first, then enable via Cloud Console
- Initial sync ~24h before data appears in table
- Table name: `gcp_billing_export_v1_<BILLING_ACCOUNT_ID_with_underscores>`

### Mistral SDK (worker)

- Pinned `mistralai==2.4.5`
- Internal import path: `from mistralai.client.sdk import Mistral`
- Top-level `from mistralai import Mistral` not exposed in 2.4.5
- Upgrade carefully — may break import

---

## 13. User communication preferences

- **Vietnamese** language
- **Concise** responses, no preamble or extensive trade-off analysis
- **Verify codebase** trước khi assert (no hallucinated state)
- Direct, no excessive politeness
- Numeric questions get numeric answers + brief context
- Don't ask "would you like me to..." — just do it or ask short specific question

---

## 14. End of rules

Code wins over documentation if conflicts. This file is a living snapshot, evolves with project.

Last major update: R187 (2026-05-21). Next update trigger: dashboard redesign OR billing phase OR Gemini 3.5 adoption (when GA).