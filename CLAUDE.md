# Labyra Platform — Coding Rules & Conventions


## Required reading

**Before making architectural decisions**, read:
- `docs/labyra-strategy.md` — Strategic guidance (positioning, stages, risks)
- `docs/architecture-decisions.md` — ADR log (past decisions with rationale)
- `docs/ai/ai-5b-pipeline.md` — Paper pipeline design (if working on RAG)
- `docs/uiux-international-standards.md` — UI/UX standards (WCAG 2.2 AA, ISO 9241, Nielsen, Gestalt, Tufte data viz)
- `docs/strategy/INSIGHTS.md` — strategic actionable (pricing, trust, onboarding, VN context)
- `docs/strategy/market-research.md` — TAM/SAM/SOM, LIMS competitive analysis
- `docs/strategy/consumer-psychology.md` — UTAUT/TAM/Fogg model application
- `docs/scientific-methods/xrd-analysis.md` — XRD algorithms & formulas reference
- `docs/labyra-experiment-database-report.md` — Database architecture for experiment data (storage tier per data type)
- `docs/database-stage-2-plan.md` — Stage 2 migration roadmap (GCS + BigQuery + spectra pipeline)
- `docs/accessibility-audit.md` — WCAG 2.2 AA checklist
- `docs/handoff-r160-spectra.md` — Latest session handoff (Phase 1 spectra shipped)

> This file is read by AI agents (Claude, Copilot, Cursor) before making any changes.
> Follow ALL rules below strictly. No exceptions unless explicitly noted.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript strict (no `any`, no `@ts-nocheck`) |
| Styling | Tailwind 4 + CSS Variables |
| UI Kit | shadcn/ui |
| State | Zustand |
| Data fetching | TanStack Query v5 |
| Auth | Firebase Auth (Google + email/password) |
| Backend | Firebase Admin SDK (server) + Client SDK (browser) |
| Database | Firestore + RTDB |
| Storage | Firebase Storage |
| Cloud Functions | 11 functions, asia-southeast1, giữ nguyên |
| Charts | recharts (dashboard) + Plotly (scientific) + D3 (graph) |
| Icons | @tabler/icons-react via `src/components/icons.tsx` — NO emoji in UI |
| Deploy | Vercel + Firebase backend |
| Monorepo | pnpm workspaces |

---

## TypeScript Rules

```typescript
// ❌ NEVER
const data: any = response;
// @ts-nocheck
const user = data as User;

// ✅ ALWAYS
const data: unknown = response;
if (isUser(data)) { ... }  // type guard
const user = data satisfies User;
```

- Strict mode ON — `tsconfig.json` phải có `"strict": true`
- Explicit return types cho tất cả public functions và API handlers
- Dùng `unknown` thay `any`, narrow type trước khi dùng
- Dùng `satisfies` operator thay type assertion khi có thể
- Interface cho object shapes, type cho unions/primitives
- Không dùng `namespace`, không dùng `enum` — dùng `const` object thay

---

## Naming Conventions

```
Components:     PascalCase        ExperimentTable, ChemicalCard
Hooks:          use prefix        useExperiments, useLabStore, useAuth
Stores:         use prefix        useLabStore, useUIStore
Constants:      UPPER_SNAKE       MAX_RETRY_COUNT, DEFAULT_PAGE_SIZE
Files:          kebab-case        experiment-table.tsx, use-experiments.ts
Types:          PascalCase        ExperimentRow, ChemicalStatus
Enums (const):  UPPER_SNAKE keys  STATUS.ACTIVE, STATUS.PENDING
```

**Không abbreviate:**
- `exp` → `experiment`
- `chem` → `chemical`
- `eq` → `equipment`
- `cb` → `callback`
- `btn` → `button`
- `idx` → `index`

---

## File Structure Rules

### Component file order:
```tsx
// 1. React imports
// 2. Next.js imports
// 3. Third-party imports (alphabetical)
// 4. Internal imports — absolute (@/components/...)
// 5. Internal imports — relative (./utils)
// 6. Type imports (import type)
// 7. Constants
// 8. Types/interfaces local to file
// 9. Component (default export last)
// 10. Subcomponents
// 11. Helper functions
```

### File size limits:
- Component file: tối đa **200 lines** — split nếu lớn hơn
- Hook file: tối đa **150 lines**
- Utility file: tối đa **100 lines**
- KHÔNG có file `utils.ts` chứa mọi thứ — split theo domain

### Folder structure:
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Auth group
│   ├── (dashboard)/        # Dashboard group
│   └── api/                # API routes
├── components/
│   ├── ui/                 # shadcn/ui primitives (auto-generated)
│   ├── shared/             # Shared components across domains
│   └── [domain]/           # Domain-specific components
│       ├── experiments/
│       ├── chemicals/
│       ├── equipment/
│       ├── ai/
│       └── members/
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities, configs
│   ├── firebase.ts         # Firebase client init
│   ├── firebase-admin.ts   # Firebase Admin (server only)
│   └── utils.ts            # cn() và shadcn utilities ONLY
├── stores/                 # Zustand stores
├── types/                  # Global TypeScript types
└── constants/              # App-wide constants
```

---

## React / Next.js Rules

### Components:
```tsx
// ❌ Inline object/array trong JSX
<Component style={{ color: "red" }} items={[1, 2, 3]} />

// ✅ Extract ra ngoài
const style = { color: "red" } as const;
const items = [1, 2, 3] as const;
<Component style={style} items={items} />
```

- Không dùng `React.FC` — dùng function declaration
- Props interface đặt tên `[ComponentName]Props`
- Không dùng `index` làm `key` prop — dùng unique ID
- `useMemo`/`useCallback` chỉ khi profiling confirm cần — không premature optimize
- Server Components by default, chỉ thêm `"use client"` khi cần

### Server vs Client:
```tsx
// Server Component (default) — data fetching, no interactivity
export default async function ExperimentPage() {
  const data = await getExperiments();
  return <ExperimentTable data={data} />;
}

// Client Component — interactivity, hooks, browser APIs
"use client";
export function ExperimentTable({ data }: ExperimentTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  ...
}
```

---

## Styling Rules

```tsx
// ❌ Inline styles — NEVER
<div style={{ backgroundColor: "#06B6D4" }}>

// ❌ Hardcode color — NEVER
<div className="bg-[#06B6D4]">

// ✅ CSS variables + Tailwind
<div className="bg-accent">

// ✅ cn() cho conditional classes
import { cn } from "@/lib/utils";
<div className={cn("base-class", isActive && "active-class")}>
```

### CSS Variables (dark mode default):
```css
/* Dùng đúng token, không tự đặt màu mới */
--background, --foreground
--accent, --accent-foreground
--muted, --muted-foreground
--border, --input, --ring
--destructive, --warning, --success
```

---

## Icons Rules

Codebase uses **`@tabler/icons-react`** as the canonical icon library
(decided R160). Centralized in `src/components/icons.tsx`.

```tsx
// ✅ Tabler icons cho tất cả UI icons
import { IconFlask, IconTestTube, IconAtom, IconSparkles } from "@tabler/icons-react";
<IconFlask className="size-4" />

// ✅ Or use the centralized Icons object (preferred for shared icons)
import { Icons } from '@/components/icons';
<Icons.papers className="size-4" />

// ✅ Inline SVG CHỈ cho logo và brand icons
export function LabyraLogo({ className }: { className?: string }) {
  return <svg className={className}>...</svg>;
}

// ❌ NEVER dùng emoji trong UI
<span>🔬 Experiments</span>  // NO
<span>⚠️ Warning</span>      // NO

// ❌ NEVER import other icon libraries (Lucide, Heroicons, FontAwesome, etc.)
```

### Icon sizes (dùng đúng, không tự đặt):
```
h-3 w-3   — inline với text-xs
h-4 w-4   — default UI (nav, buttons)
h-5 w-5   — primary actions
h-6 w-6   — page headers
h-8 w-8   — feature highlights
```

---

## State Management Rules

### Zustand stores:
```typescript
// ❌ NEVER dùng window.* globals
window.cache = data;
window.currentAuth = user;

// ✅ Zustand store
import { useLabStore } from "@/stores/lab.store";
const { chemicals, setChemicals } = useLabStore();
```

### Store structure:
```typescript
// stores/lab.store.ts
interface LabStore {
  // State
  chemicals: Record<string, Chemical>;
  experiments: Record<string, Experiment>;

  // Actions — luôn đặt tên set/update/clear
  setChemicals: (data: Record<string, Chemical>) => void;
  updateExperiment: (id: string, data: Partial<Experiment>) => void;
  clearAll: () => void;
}
```

### TanStack Query cho server state:
```typescript
// Firebase data fetching qua TanStack Query
const { data: experiments, isLoading } = useQuery({
  queryKey: ["experiments", tenantId],
  queryFn: () => fetchExperiments(tenantId),
  staleTime: 30_000,  // 30s
});
```

---

## Error Handling Rules

```typescript
// ❌ Silent catch
try { ... } catch (e) { console.log(e); }

// ❌ Catch everything
try { ... } catch (error) { /* ignore */ }

// ✅ Typed error handling
try {
  await updateChemical(id, data);
} catch (error) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      toast.error("Bạn không có quyền thực hiện thao tác này");
      return;
    }
  }
  logger.error("updateChemical failed", { error, id });
  toast.error("Có lỗi xảy ra, vui lòng thử lại");
}
```

- Không để empty catch blocks
- Log error với context (function name, relevant IDs)
- Show user-friendly message, không expose technical details
- Sử dụng Error Boundary cho React component errors

---

## Comments Rules

```typescript
// ❌ Comment giải thích WHAT (code đã nói rõ rồi)
const activeChemicals = chemicals.filter(c => c.active); // filter active chemicals

// ✅ Comment giải thích WHY
// Firebase RTDB limitToLast 500 — tránh load toàn bộ collection
// Xem listeners.ts discussion R128 để hiểu trade-off
const recentExperiments = experiments.slice(-500);

// ✅ TODO với context
// TODO(R155): Remove after B.5 schema migration complete
const legacyData = transformLegacySchema(raw);
```

- Comment bằng tiếng Việt hoặc tiếng Anh đều OK — nhất quán trong cùng file
- JSDoc cho public API functions và hooks
- Không commit commented-out code

---

## Git / PR Rules

- Conventional Commits bắt buộc (đã có commitlint)
- Mỗi PR tối đa **400 lines diff** — split nếu lớn hơn
- Mỗi commit một việc — không gom unrelated changes
- Không commit: `.env`, `service-account.json`, `node_modules`, `dist`
- Branch naming: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`

---

## Performance Rules

- Images: dùng `next/image` — không dùng `<img>` tag
- Fonts: dùng `next/font` — không load từ Google Fonts URL
- Dynamic import cho heavy components (Plotly, D3, Three.js):
```typescript
const PlotlyChart = dynamic(() => import("@/components/charts/plotly-chart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
```
- Không fetch data trong Client Components nếu có thể làm ở Server Component
- Bundle size: không install library nếu có thể implement < 20 lines

---

## Security Rules

- KHÔNG hardcode API keys, secrets, Firebase config trong code
- Tất cả secrets qua environment variables
- Server-side: verify Firebase ID token trước mọi API route
- Client-side: không expose Admin SDK credentials
- Firestore data PHẢI nằm dưới path `/tenants/{tenantId}/...` (sub-collection model)
- Cross-tenant queries (super-admin) dùng `collectionGroup()` — không phải code path thông thường
- Firebase Auth custom claims: `tenantId` (required), `role` (admin/superadmin/member/viewer)

```typescript
// ❌ NEVER — top-level collection
db.collection("experiments").get()

// ❌ NEVER — top-level với tenantId filter (security rules đơn giản hơn nhiều với sub-collection)
db.collection("experiments")
  .where("tenantId", "==", currentTenantId)
  .get()

// ✅ ALWAYS — sub-collection scoped
db.collection(`tenants/${currentTenantId}/experiments`).get()

// ✅ Cross-tenant (super-admin only)
db.collectionGroup("experiments").get()
```

---

## Domain Rules (Labyra specific)

- Chemical formulas: subscript đúng cách — `WO₃` không phải `WO3` trong display
- Đơn vị luôn đi kèm giá trị: `180 °C`, `2.8 eV`, `50 mV/s`
- Tenant isolation: mọi Firestore query phải có `tenantId` filter

---

## Current Phase Status (R160)

**Latest shipped:** R160-spectra-2 (May 13, 2026)

### Completed phases
- **AI Foundation:** ai-3 (provider abstraction), ai-4 (tool calling), ai-5a (RAG foundation), ai-5b (paper pipeline)
- **Anti-hallucination:** ai-5e-1/1b/1c (grounding L2+L3+L4), ai-5e-2 (L6 OOD + L7 empty guard)
- **Lab data CRUD:** data-1 (Materials/Samples/Experiments), data-2 (Equipment/Bookings) + composite indexes
- **UI polish:** data-1b (i18n + layout), data-1c (shadcn Form/Table refactor), ui-1 (PageContainer + reduced-motion)
- **Stage 2 Phase 1:** spectra-1 (24 spectrum types, signed URL upload, SHA-256), spectra-2 (experiment Tabs + standalone /spectra page)

### Database state
- **Firestore:** materials, samples, experiments, equipment, bookings, papers, spectra (all tenant-scoped, multi-tenant rules in place)
- **Storage (Firebase Storage / GCS):** `papers/{tenantId}/...` and `tenants/{tenantId}/spectra/{spectrumId}/raw/...`
- **Pinecone:** namespace-per-tenant for paper RAG (index `labyra-papers`, 1024-dim cosine)
- **Composite indexes deployed:** materials (category+updatedAt), experiments (status+updatedAt), samples (status+preparedAt), equipment (status+updatedAt, category+updatedAt), bookings (equipmentId+startAt, userId+startAt, status+startAt), spectra (experimentId+measuredAt, sampleId+spectrumType, spectrumType+createdAt, status+createdAt)

### Next phases (planned)
- **Stage 2 Phase 2:** Python worker (Cloud Run + Pub/Sub) for spectrum parsing + AI analysis
  - See `docs/database-stage-2-plan.md` for full roadmap
- **Stage 2 Phase 3:** BigQuery time-series for GCD/CA traces
- **Dashboard widgets:** KPI cards + recent activity (deferred per session decision)
- **Lineage graph:** Material → Sample → Experiment D3 visualization
- **Members + RBAC:** invite flow + role assignment
- **Settings page:** tenant config + AI preferences

### Critical patterns learned this round
1. **shadcn UI mandatory:** All forms use Form/FormField/FormItem/FormLabel/FormControl/FormMessage. Tables use shadcn Table/TableHeader/TableBody. Buttons use `Button asChild` when wrapping Link.
2. **Backward-compat tables:** Legacy data (pre-data-1 schema) handled with `data.experimentCode ?? doc.id`, `data.experimentType ?? data.type`. Use `t.has(key) ? t(key) : key` for missing i18n entries.
3. **Doc ID injection:** Always `{ ...d.data(), id: d.id }` when mapping Firestore snapshots — legacy docs missing `id` field break React keys.
4. **Breadcrumbs t.has() guard:** Dynamic route segments (e.g. `/experiments/exp-001`) try `t('nav.exp-001')` which throws MISSING_MESSAGE. Use `t.has()` not try/catch (next-intl emits error events on missing keys regardless of try/catch).
5. **Vietnamese-$ stripping:** `$word$` in AI responses triggers KaTeX math render. System prompt + `stripVietnameseDollar` post-process in chat route.
6. **Gemini multi-turn:** Convert Anthropic-style content blocks (text/tool_use/tool_result) to Gemini parts (text/functionCall/functionResponse) in `toGeminiHistory` AND `sendMessageStream` payload conversion.
7. **shadcn install pattern:** `pnpm dlx shadcn@latest add <component>` — choose N when prompted to overwrite `button.tsx` (custom with Spinner integration). Form, Table, Tabs, Card, Dialog, Sheet, Separator all installed.

---

## Anti-patterns — NEVER DO

```
❌ window.* globals
❌ any type
❌ @ts-nocheck
❌ Inline styles
❌ Hardcode colors
❌ Emoji trong UI
❌ index làm key prop
❌ Empty catch blocks
❌ Commit secrets/credentials
❌ fetch data trong useEffect khi có thể dùng Server Component
❌ Firestore query không có tenantId filter
❌ Import icon library ngoài @tabler/icons-react (centralized in src/components/icons.tsx)
❌ Console.log trong production code (dùng logger)
```

---

## Accessibility — WCAG 2.1 AA (International Standard)

- Tất cả interactive elements phải keyboard accessible (Tab, Enter, Space, Escape)
- Focus ring visible — không `outline: none` mà không có replacement
- Color contrast tối thiểu 4.5:1 cho text, 3:1 cho UI components
- Icon-only buttons phải có `aria-label`
- Images phải có `alt` text — decorative images dùng `alt=""`
- Form fields phải có `<label>` associated
- Error messages phải được announce qua `aria-live`
- Không dùng color làm phương tiện duy nhất truyền thông tin

```tsx
// ❌
<button onClick={handleDelete}>
  <Trash2 className="h-4 w-4" />
</button>

// ✅
<button onClick={handleDelete} aria-label="Xóa thí nghiệm">
  <Trash2 className="h-4 w-4" />
</button>
```

---

## Web Vitals — Core Web Vitals Targets

| Metric | Target | Đo bằng |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | Vercel Analytics |
| CLS (Cumulative Layout Shift) | < 0.1 | Vercel Analytics |
| INP (Interaction to Next Paint) | < 200ms | Chrome DevTools |
| TTFB (Time to First Byte) | < 800ms | Vercel Analytics |

**Rules để đạt target:**
- Không layout shift — luôn set width và height cho images
- Preload critical fonts với `next/font`
- Không blocking scripts trong `<head>`
- Dynamic import cho components không critical (Plotly, D3, Three.js)
- Server Components cho above-the-fold content

---

## Next.js Official Conventions

### Data fetching:
```tsx
// ✅ Server Component
async function ExperimentPage({ params }: { params: { id: string } }) {
  const experiment = await getExperiment(params.id);
  return <ExperimentDetail experiment={experiment} />;
}

// ✅ Client Component — TanStack Query
"use client";
function ChemicalList() {
  const { data } = useQuery({ queryKey: ["chemicals"], queryFn: fetchChemicals });
}

// ❌ NEVER — fetch trong useEffect
useEffect(() => { fetch("/api/chemicals").then(...) }, []);
```

### Loading & Error UI — bắt buộc:
```
app/(dashboard)/experiments/
├── page.tsx
├── loading.tsx    ← Skeleton UI
└── error.tsx      ← Error boundary
```

### Metadata — mỗi page bắt buộc:
```typescript
export const metadata: Metadata = {
  title: "Experiments | Labyra",
  description: "Manage lab experiments",
};
```

---

## React Best Practices

### Hooks:
- Chỉ gọi ở top level — không trong conditions, loops
- Custom hook bắt đầu bằng `use`
- Cleanup side effects trong useEffect return

```typescript
// ✅ Cleanup Firebase listener
useEffect(() => {
  const unsubscribe = onSnapshot(query, callback);
  return () => unsubscribe();
}, []);
```

### Forms — React Hook Form + Zod:
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  temperature: z.number().min(0).max(1000),
  material: z.string().min(1),
});
```

---

## TypeScript Strict Standards

```json
// tsconfig.json bắt buộc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

```typescript
// ✅ Exhaustive switch
function getStatusLabel(status: ExperimentStatus): string {
  switch (status) {
    case "running": return "Đang thực hiện";
    case "completed": return "Hoàn thành";
    default:
      const _exhaustive: never = status;
      throw new Error(`Unknown: ${_exhaustive}`);
  }
}
```

---

## REST API Design Standards

```
GET    /api/experiments        → List
GET    /api/experiments/:id    → Get one
POST   /api/experiments        → Create (201)
PATCH  /api/experiments/:id    → Update
DELETE /api/experiments/:id    → Delete (204)
```

### Response format:
```typescript
// Success list
{ "data": [...], "meta": { "total": 100, "page": 1 } }

// Error
{ "error": { "code": "NOT_FOUND", "message": "Experiment not found" } }
```

### HTTP Status codes:
```
200 OK          — GET, PATCH
201 Created     — POST
204 No Content  — DELETE
400 Bad Request — Validation error
401 Unauthorized
403 Forbidden
404 Not Found
500 Internal Error
```

---

## Testing Standards

### Coverage targets:
```
Unit tests:   > 80% business logic (hooks, utils, stores)
Integration:  > 60% API routes
E2E:          Critical paths (login, create experiment, AI query)
```

### Naming — AAA pattern:
```typescript
describe("useExperiments", () => {
  it("returns empty array when no experiments exist", () => {
    // Arrange
    const store = createEmptyStore();
    // Act
    const result = store.getExperiments();
    // Assert
    expect(result).toHaveLength(0);
  });
});
```

### Vitest coverage config:
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
```

---

## Current Phase Status (R160)

**Latest shipped:** R160-spectra-2 (May 13, 2026)

### Completed phases
- **AI Foundation:** ai-3 (provider abstraction), ai-4 (tool calling), ai-5a (RAG foundation), ai-5b (paper pipeline)
- **Anti-hallucination:** ai-5e-1/1b/1c (grounding L2+L3+L4), ai-5e-2 (L6 OOD + L7 empty guard)
- **Lab data CRUD:** data-1 (Materials/Samples/Experiments), data-2 (Equipment/Bookings) + composite indexes
- **UI polish:** data-1b (i18n + layout), data-1c (shadcn Form/Table refactor), ui-1 (PageContainer + reduced-motion)
- **Stage 2 Phase 1:** spectra-1 (24 spectrum types, signed URL upload, SHA-256), spectra-2 (experiment Tabs + standalone /spectra page)

### Database state
- **Firestore:** materials, samples, experiments, equipment, bookings, papers, spectra (all tenant-scoped, multi-tenant rules in place)
- **Storage (Firebase Storage / GCS):** `papers/{tenantId}/...` and `tenants/{tenantId}/spectra/{spectrumId}/raw/...`
- **Pinecone:** namespace-per-tenant for paper RAG (index `labyra-papers`, 1024-dim cosine)
- **Composite indexes deployed:** materials (category+updatedAt), experiments (status+updatedAt), samples (status+preparedAt), equipment (status+updatedAt, category+updatedAt), bookings (equipmentId+startAt, userId+startAt, status+startAt), spectra (experimentId+measuredAt, sampleId+spectrumType, spectrumType+createdAt, status+createdAt)

### Next phases (planned)
- **Stage 2 Phase 2:** Python worker (Cloud Run + Pub/Sub) for spectrum parsing + AI analysis
  - See `docs/database-stage-2-plan.md` for full roadmap
- **Stage 2 Phase 3:** BigQuery time-series for GCD/CA traces
- **Dashboard widgets:** KPI cards + recent activity (deferred per session decision)
- **Lineage graph:** Material → Sample → Experiment D3 visualization
- **Members + RBAC:** invite flow + role assignment
- **Settings page:** tenant config + AI preferences

### Critical patterns learned this round
1. **shadcn UI mandatory:** All forms use Form/FormField/FormItem/FormLabel/FormControl/FormMessage. Tables use shadcn Table/TableHeader/TableBody. Buttons use `Button asChild` when wrapping Link.
2. **Backward-compat tables:** Legacy data (pre-data-1 schema) handled with `data.experimentCode ?? doc.id`, `data.experimentType ?? data.type`. Use `t.has(key) ? t(key) : key` for missing i18n entries.
3. **Doc ID injection:** Always `{ ...d.data(), id: d.id }` when mapping Firestore snapshots — legacy docs missing `id` field break React keys.
4. **Breadcrumbs t.has() guard:** Dynamic route segments (e.g. `/experiments/exp-001`) try `t('nav.exp-001')` which throws MISSING_MESSAGE. Use `t.has()` not try/catch (next-intl emits error events on missing keys regardless of try/catch).
5. **Vietnamese-$ stripping:** `$word$` in AI responses triggers KaTeX math render. System prompt + `stripVietnameseDollar` post-process in chat route.
6. **Gemini multi-turn:** Convert Anthropic-style content blocks (text/tool_use/tool_result) to Gemini parts (text/functionCall/functionResponse) in `toGeminiHistory` AND `sendMessageStream` payload conversion.
7. **shadcn install pattern:** `pnpm dlx shadcn@latest add <component>` — choose N when prompted to overwrite `button.tsx` (custom with Spinner integration). Form, Table, Tabs, Card, Dialog, Sheet, Separator all installed.

---

## Anti-patterns — NEVER DO

```
❌ window.* globals
❌ any type / @ts-nocheck
❌ Inline styles / hardcode colors
❌ Emoji trong UI
❌ index làm key prop
❌ Empty catch blocks
❌ Commit secrets/credentials
❌ fetch data trong useEffect
❌ Firestore query không có tenantId filter
❌ Import icon library ngoài @tabler/icons-react (centralized in src/components/icons.tsx)
❌ console.log trong production (dùng logger)
❌ outline: none mà không có focus replacement
❌ <img> tag — dùng next/image
❌ Mutate state/props trực tiếp
❌ Props drilling > 2 levels
❌ HTTP verb sai trong API routes
❌ Missing loading.tsx hoặc error.tsx
❌ Missing metadata export trong page
```
