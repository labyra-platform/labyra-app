# Project page · states (empty / loading / error)

**Status:** implementation spec, reconciled against the repo R573. Uses existing
primitives — no new deps.
**Depends on:** `src/components/ui-extra/panel.tsx`, `src/components/ui/list-skeleton.tsx`, `docs/design/design-rules.md` §7, `docs/design/project-page-spec.md`
**Suggested path:** `docs/design/project-page-states.md`

This is **part 1 of 3**. Part 3 (interaction flows) is `project-page-interactions.md`.

> **R573 reconciliation.** The first draft of this spec was written against a
> Panel API that does not exist (`PanelSkeleton`, `PanelError`, `PanelHeader`,
> `<Panel span>`) and at the wrong path (`ui/panel.tsx` — it lives in
> `ui-extra/`). It also assumed `projects/[id]/page.tsx` renders only a data
> state; it already renders three. Every code block below now matches what is
> actually in the tree. Where a component the spec wants does not exist, that is
> called out as *build*, not quietly assumed.

---

## 0. Why this exists

Design-rules §7 requires four states per data surface. `projects/[id]/page.tsx`
today has three — loading (`ListSkeleton`), data (`ProjectOverview`), and a
not-found block — and is missing the **error** state and a real per-card
boundary. The empty state every user hits on day one (a freshly created project
with a title and nothing else) is handled at the page level but not yet per
card, because the cards themselves are not built.

Not vaporware: the missing pieces fall out of the `Panel`/`PanelEmpty` family
and `ListSkeleton`, both already written. This spec says which component, which
real props, which copy.

---

## 1. What already exists (measured, not assumed)

Before specifying, the current state of the tree R573:

| Thing | Reality |
|---|---|
| `projects/[id]/page.tsx` | 40 lines. Resolves project client-side from `useProjects()`; renders `ListSkeleton rows={4}` / `ProjectOverview` / not-found block |
| Panel family | `Panel`, `PanelList`, `PanelRow`, `PanelFooter`, `PanelEmpty`, `PanelHeaderExtra` — in `src/components/ui-extra/panel.tsx` |
| `Panel` props | `title` (string, required), `description?`, `titleHref?`, `icon?`, `action?`, `count?` — **no `span`, no separate `PanelHeader`** |
| `PanelEmpty` props | `title` (string), `description?`, `action?` — centered, ~2 rows |
| Skeleton | `ListSkeleton({ rows })` in `ui/list-skeleton.tsx` — **there is no `PanelSkeleton`** |
| Error component | **none exists** — must be built, or use an inline `PanelEmpty`-shaped block |
| Project reads | `useProjects()` → `useTenantCollection<Project>({ collection: 'projects' })` — **tenant-scoped, not group-scoped** |
| Project writes | rules require `isWriter` = role in admin/superadmin/member — **viewer is already blocked** |

Two consequences that rewrite the original blocks:

- **404-vs-403 is moot as written.** `firestore.rules` gates project reads on
  `belongsToTenant` alone (line 249), and `useProjects` does not filter by
  `groupId`. Every member of the tenant can already read every project. There is
  no cross-group case to return a code for — a member of another *group* in the
  same tenant reads the project outright. The real question is whether projects
  *should* be group-isolated (as papers were in R566); that is a rules + query
  change, not a loader return value. See §2.2.
- **Viewer state needs no guard here.** Project writes go through `isWriter`,
  which excludes viewer at the rules layer, so a viewer already cannot create or
  edit. No viewer-specific empty state is needed to paper over an unenforced
  tier — the tier is enforced.

---

## 2. Page-level states

The page owns: project-loading / not-found / project-error / ready. (Not
forbidden — see §2.2.)

### 2.1 project-loading
The page already does this with `ListSkeleton rows={4}`. A richer skeleton that
preserves the eventual header + card grid is a nice-to-have, not a fix; the
current one does not blank the page. If upgraded, keep it a skeleton that mirrors
the real grid (`items-start`, same columns) so nothing reflows when data lands —
never a full-page spinner, which discards the layout about to appear.

```tsx
// current, and adequate:
if (isLoading) return <ListSkeleton rows={4} />
```

### 2.2 not-found — and the group-isolation decision that replaces 404-vs-403

The current not-found block (project id resolves to nothing in `useProjects`)
is correct for a genuinely missing project. What the original spec framed as
"404 vs 403 for another group's project" does not arise: there is no group
isolation on projects, so another group's project in the same tenant simply
*loads*. 

The decision to actually make is upstream of any status code:

> **Should projects be group-isolated the way papers are (R566)?**

- **If no** (current behaviour): every tenant member sees every project. Fine for
  a single-lab tenant; a leak the moment a tenant holds two groups with
  unpublished work. The not-found block only ever means "deleted or bad id".
- **If yes**: add a `groupId` filter to `useProjects` and a group check to the
  rules, exactly as R566 did for RAG. *Then* the 404-vs-403 question becomes
  real, and the same posture applies — **return not-found for a project the
  viewer's group cannot read**, so the UI does not confirm existence to someone
  who cannot see it.

Until that decision is made, do not build a `ProjectForbidden` — there is
nothing to forbid. The existing not-found block stands.

```tsx
// current — resolves missing id to not-found:
) : project ? (
  <ProjectOverview project={project} />
) : (
  <NotFoundBlock title={t('notFound')} hint={t('notFoundHint')} />
)
```

### 2.3 project-error — the one page-level state genuinely missing

`useProjects` can fail (network, rules). Today a failure surfaces as
`isLoading: false, projects: []` → the not-found block, which is wrong: it tells
the user the project was deleted when the query merely failed. The fix is to
distinguish the two.

`useProjects` must expose an error, and the page must branch on it *before*
not-found:

```tsx
const { projects, isLoading, isError, refetch } = useProjects();
// order matters — see §4
if (isLoading) return <ListSkeleton rows={4} />;
if (isError) return <ProjectLoadError onRetry={refetch} />;
const project = projects.find((p) => p.id === id);
if (!project) return <NotFoundBlock .../>;
```

`ProjectLoadError` does not exist yet — **build it**: centered, muted
`IconAlertTriangle`, "Không tải được đề tài", body "Có lỗi khi tải. Thử lại
hoặc quay về danh sách.", "Thử lại" (primary) + "Về danh sách". In-flow
`min-h-[400px]`, never `position:fixed`.

---

## 3. Card-level states (for the cards that do not exist yet)

The Overview cards (Nội dung / Lịch trình / Cần chú ý) are **not built** —
`ProjectOverview` currently renders linked entities, not these three cards.
When they are built, each uses the real Panel family, and the rule that makes it
feel professional holds: **skeleton and empty occupy one or two real rows'
height, never the full data height.** This is the "empty holds height" bug fixed
on the dashboard; it must not return.

### 3.1 Loading — with the real skeleton primitive

There is no `PanelSkeleton`. Compose `Panel` + `ListSkeleton`:

```tsx
<Panel title="Nội dung nghiên cứu">
  <ListSkeleton rows={3} />
</Panel>
```

`rows={3}`, not five — a skeleton is a placeholder, not a promise of an exact
count. `ListSkeleton` row height should match a real `PanelRow` so there is zero
reflow when data lands; if it does not, that is a `ListSkeleton` fix, not a
reason to invent a new component.

### 3.2 Empty — the day-one state, with real `PanelEmpty`

`PanelEmpty` exists and takes `title` / `description` / `action` — use it
directly.

| Card | `title` | `description` | `action` |
|---|---|---|---|
| **Nội dung nghiên cứu** | "Chưa có nội dung nào" | "Chia đề tài thành các nội dung nghiên cứu (ND1, ND2…) để lập kế hoạch." | button "Thêm nội dung đầu tiên" → Add dialog (part 3) |
| **Lịch trình** | "Chưa đặt ngày bảo vệ" | "Đặt ngày bảo vệ để Labyra tính lịch ngược từ đó." | button "Đặt ngày bảo vệ" → header edit |
| **Cần chú ý** | *no empty card* — omit the section entirely | — | — |

```tsx
<Panel title="Nội dung nghiên cứu">
  <PanelEmpty
    title={t('wp.emptyTitle')}
    description={t('wp.emptyHint')}
    action={<Button size="sm" onClick={openAdd}>{t('wp.addFirst')}</Button>}
  />
</Panel>
```

"Cần chú ý" stays an exception surface: when the flag list is empty the card
**does not render**. An empty "không có gì cần chú ý" card is visual noise —
same test that killed the GHS card. Absence is the signal.

```tsx
{needsAttention.length > 0 && (
  <Panel title="Cần chú ý">
    <PanelList>{/* … */}</PanelList>
  </Panel>
)}
```

### 3.3 Error — per-card boundary, with a built component

One card's query failing must not blank the page. Wrap each card body in an
error boundary. There is no `PanelError` — **build one** (or reuse the
`PanelEmpty` shape with an error copy + retry): muted `IconAlertTriangle` (not
red — a load failure is not a hazard), "Không tải được", "Thử lại". Sized to ~2
rows like empty, so a failed card collapses rather than sprawls.

```tsx
<Panel title="Nội dung nghiên cứu">
  <ErrorBoundary fallback={<PanelErrorState onRetry={refetch} />}>
    {/* card body */}
  </ErrorBoundary>
</Panel>
```

---

## 4. State-decision order (put this in the component)

Every surface resolves in this fixed order. Wrong order shows a spinner over
stale data, or an empty state mid-load.

```
1. isLoading         → skeleton (ListSkeleton)
2. isError           → error    (ProjectLoadError / PanelErrorState)
3. data.length === 0 → empty    (PanelEmpty, or omit for Cần chú ý)
4. else              → data     (PanelList / ProjectOverview)
```

Same order as `activity-chart.md` §4: loading beats error beats empty beats data.
The page-level version of this (§2.3) is the one genuinely missing piece today —
the page currently skips step 2 and lets a failed query fall through to
not-found.

---

## 5. What NOT to build

- **No full-page spinner.** The skeleton preserves layout; a spinner discards it.
- **No global error toast for a single card.** The card owns its failure.
- **No "retry all" button.** Each card retries itself.
- **No empty "Cần chú ý".** Absence is the signal.
- **No skeleton taller than the data.** Placeholder, not billboard.
- **No `ProjectForbidden`.** Nothing is forbidden until projects are group-isolated (§2.2).
- **Do not import `PanelSkeleton` / `PanelError` / `PanelHeader` / `<Panel span>`.** They do not exist. Compose from `Panel` + `ListSkeleton` + `PanelEmpty`.

---

## 6. Blocks — reconciled

The original two blocks are resolved by reading the repo:

- ~~**404 vs 403**~~ → **moot.** No group isolation on projects; the real
  decision is whether to add it (§2.2), and it is not a prerequisite for the
  error/empty work here.
- ~~**Viewer role: denied or unimplemented?**~~ → **denied.** `isWriter` blocks
  viewer writes at the rules layer. No viewer-specific state needed.

One genuine prerequisite remains, and it is small:

- **`useProjects` must expose `isError` + `refetch`** for §2.3. Without it the
  page cannot tell a failed load from a missing project. This is the one change
  that gates the error state.
