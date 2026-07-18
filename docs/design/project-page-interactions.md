# Project page · interaction flows

**Status:** implementation spec, reconciled against the repo R573. Uses
shadcn/ui primitives — all present, no new deps.
**Depends on:** `docs/design/project-page-spec.md`, `docs/design/project-page-states.md`, ADR-034, `src/proxy.ts`
**Suggested path:** `docs/design/project-page-interactions.md`

This is **part 3 of 3** (the states doc is part 1). Everything the Overview
mockup renders is currently inert — this makes it work.

> **R573 reconciliation.** Verified against the tree: every shadcn primitive this
> spec relies on (`Dialog`, `Form`, `DropdownMenu`, `Collapsible`,
> `AlertDialog`, `Tabs`) exists under `src/components/ui/`. Two of the six
> original blocks are resolved by reading the repo (viewer, 404-vs-403); a third
> (the error state) reduces to a two-line change in `useProjects`. Those are
> marked resolved below rather than left open.

---

## 0. Inventory of dead clicks

The mockup has nothing wired. Each must do something:

| Element | Currently | Should |
|---|---|---|
| Tab bar | static | route change, keeps scroll |
| Row in "Nội dung" | static | navigate (§6) |
| "Thêm" (nội dung) | static | open Add dialog |
| "Sửa" (header) | static | open Edit dialog |
| "Thuyết minh" | static | preview, then export (§7) |
| Status chip | static | change project status |
| Row action buttons | static | navigate to target |

---

## 1. Stack — all shadcn, all verified present R573

| Flow | Component | In tree? |
|---|---|---|
| Add / Edit dialogs | `Dialog` + `Form` (`FormField`/`FormItem`/`FormMessage`) | ✓ |
| Status change | `DropdownMenu` on the chip | ✓ |
| Tab routing | Next.js route + `Tabs` | ✓ |
| Row expand (if chosen) | `Collapsible` | ✓ |
| Confirm destructive | `AlertDialog` | ✓ |
| Toast | existing toast | ✓ |

Form pattern is mandatory per stack rules: `Form` → `FormField` → `FormItem` →
`FormControl` → `FormMessage`. No bare inputs, no manual `useState` per field.

**Hook-order rule (repo invariant, bit us repeatedly):** all hooks before any
conditional early return. These dialogs early-return on `!open` — every
`useForm`, `useMutation`, `useState` goes *above* that return. Audit before
shipping; this is the single most common cause of a broken component patch in
this codebase.

---

## 2. Add work package (the primary action, never mocked)

Trigger: "Thêm" / "Thêm nội dung đầu tiên" (empty state). Both open the same
`Dialog`.

### 2.1 Fields — minimum, per "don't block creation"

```tsx
type AddWorkPackageForm = {
  title: string           // required
  kind: 'synthesis' | 'characterization' | 'computation'   // required, default synthesis
  estimateWeeks?: number  // optional
  dependsOn?: string[]    // optional — other WPs in this project
}
```

Only **title + kind** required. `order` (ND number) is assigned server-side =
`max(order)+1`, never asked. Chemicals/equipment/deliverables come later on the
WP detail — asking here rebuilds the wizard that kills project creation.

> Note: there is no `WorkPackage` collection in the tree yet. This dialog and
> its schema are net-new; the `Project` type exists (`useProjects` reads it) but
> `WorkPackage` does not. Building this means adding the collection, the rules
> (mirror `projects`: `isWriter` to create), and the type — not just a dialog.

### 2.2 The estimate-unit block surfaces here

`estimateWeeks` — **project-page-spec §6 has not resolved weeks vs
person-days**, and the field label depends on it:

- weeks → "Ước lượng (tuần)"
- person-days → "Ước lượng (ngày công)"

Do not ship a number field labelled "Ước lượng" with no unit — the number is
meaningless without it, and changing the unit later re-interprets every value
already entered. **Pick the unit before this dialog ships.** Recommendation:
weeks, matching how the schedule card and defense deadline are already
expressed; mixing units across the page is worse than either choice.

### 2.3 dependsOn — only same-project WPs, with a cycle guard

The multiselect lists **only work packages already in this project** (same
`projectId`), excludes the current WP (on Add there is none, so this bites only
on Edit), and must reject an edge that creates a cycle: ND1→ND2→ND1 makes the
backward-pass schedule loop forever. Validate on submit, not only in the UI.

### 2.4 Layout

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>Thêm nội dung nghiên cứu</DialogTitle></DialogHeader>
    <Form {...form}>
      <FormField name="title" .../>          {/* Input */}
      <FormField name="kind" .../>            {/* Select: 3 options */}
      <FormField name="estimateWeeks" .../>   {/* Input type=number, unit in label */}
      <FormField name="dependsOn" .../>       {/* Multiselect, same-project WPs */}
      <DialogFooter>
        <Button variant="ghost" onClick={close}>Hủy</Button>
        <Button type="submit">Thêm</Button>
      </DialogFooter>
    </Form>
  </DialogContent>
</Dialog>
```

One primary button ("Thêm"); "Hủy" is ghost. One accent per view.

---

## 3. Edit project header

Trigger: "Sửa". Same `Dialog` shape. The `Project` type already exists, so this
edits a real doc.

```tsx
type EditProjectForm = {
  title: string           // required
  code?: string           // MSHV / grant number
  defenseDate?: Date       // the schedule anchor
  supervisorId?: string
  degreeTemplate?: string  // masters-vn | masters-jp | phd-eu …
}
```

`defenseDate` is why the Lịch trình card can compute anything — setting it here
flips that card from empty ("Chưa đặt ngày bảo vệ") to data. `DatePicker`
(shadcn calendar + popover).

`status` is **not** in this dialog — it changes via the chip dropdown (§4),
because it is a frequent one-click action, not a form edit.

`visibility` (private / group) is **not built and should not appear here.**
Projects are currently tenant-scoped with no group isolation (see states §2.2).
A visibility control with no rules enforcing it is a switch that lies — do not
add it until projects are group-isolated and the rules enforce the scope.

---

## 4. Status change — dropdown on the chip

```tsx
<DropdownMenu>
  <DropdownMenuTrigger><StatusChip status={project.status}/></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Đang chạy</DropdownMenuItem>
    <DropdownMenuItem>Tạm dừng</DropdownMenuItem>
    <DropdownMenuItem>Hoàn thành</DropdownMenuItem>
    <DropdownMenuItem>Lưu trữ</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Status is **human-set, never inferred** (spec §2). Labyra does not flip a
project to "done" because all WPs are done — the researcher decides. The
dropdown writes `project.status` directly, optimistic + toast. "Lưu trữ" may
warrant an `AlertDialog` if archiving hides the project from the main list.

---

## 5. Tabs — routes, not local state

Each tab is a **route**. Only `/projects/[id]` exists today; the rest are
net-new:

```
/projects/[id]              → Tổng quan   (exists)
/projects/[id]/experiments  → Thí nghiệm  (build)
/projects/[id]/samples      → Mẫu         (build)
/projects/[id]/dft          → DFT         (build)
/projects/[id]/papers       → Tài liệu    (build)
/projects/[id]/lineage      → Nguồn gốc   (build — see lineage-in-project.md)
```

Why routes: back button works, tabs are linkable, each loads its own data lazily
instead of the Overview fetching everything. The active tab reads from the
pathname.

Counts in tabs (`Thí nghiệm 12`) come from lightweight count queries, not by
loading each collection.

**Scroll preservation:** `scroll={false}` on the tab links so switching does not
jump to top.

---

## 6. Row interaction in "Nội dung nghiên cứu"

**Pick one, don't build both.** Given a WP holds ChemicalPlan[] +
EquipmentPlan[] + Deliverable[] + the planned/actual/stock table (spec §3.11),
that is a full workspace, not a popover. **Recommendation: navigate** to
`/projects/[id]/wp/[wpId]`. The three-column planned/used/stock table is the
value axis of the page and deserves its own screen.

If navigate: the whole row is the click target, with a visible
`IconChevronRight` on the right.

---

## 7. "Thuyết minh" export

Trigger: header primary button. The killer feature (spec §7.1), so not a dead
click — but **the export format depends on an unverified template.**

`project-page-spec §8`: the B1-2a form is recalled from memory, not fetched.
Before wiring real export:

1. Get the actual current B1-2a from the university's KHCN&DA office — forms
   change by circular (thông tư).
2. Map WorkPackage[] + estimates + deliverables → the form's sections.

Until verified, the button opens a **preview dialog** showing the mapped
structure ("ND1 → Nội dung 1, công việc, sản phẩm dự kiến…") rather than
emitting a malformed .docx. A wrong official form is worse than none — it looks
authoritative and misfiles the proposal. Do not fabricate the template
structure. Preview from real data; wire .docx only after the form is confirmed.

---

## 8. Optimistic updates + the concurrent-edit block

All mutations (add WP, edit header, change status) are optimistic — update
immediately, roll back on error, toast on failure.

But **spec §6 flags concurrent edit**: Firestore is last-write-wins. Two people
edit ND2's `estimateWeeks` → one silently loses. For a thesis facing
examination, "who changed 3 weeks to 5" gets asked. Not solved by optimistic UI;
needs either an `updatedAt` check on write (reject if the doc changed since
read) or an audit trail (`{field, old, new, by, at}`) on estimate changes.
Neither blocks the happy path. At minimum, log estimate changes — the
examination-trail need is real and cheap to satisfy early.

---

## 9. Build order

1. **`useProjects` error support** — two-line change (§10), unblocks the page
   error state; do this first, it is nearly free
2. **Tab routing** — unblocks everything; each tab then built independently
3. **Add WP dialog** — the primary action; needs the `WorkPackage` collection +
   rules + type, not just a dialog
4. **Edit header dialog** — sets `defenseDate`, turns on the Lịch trình card
5. **Status dropdown** — one-click, cheap
6. **Row → WP detail navigate** — the planned/used/stock workspace (its own spec)
7. **Thuyết minh preview** — after the B1-2a template is verified

Steps 2–5 make the Overview fully live. 6 is a new screen. 7 waits on a real
template.

---

## 10. Blocks — reconciled

| Block | From | Status R573 |
|---|---|---|
| Estimate unit (weeks vs person-days) | spec §6 | **open** — decide before §2.2 field ships |
| Experiments attach to WP or project | spec §6 | **open** — decides whether WP detail's "used" column breaks down; also blocks lineage graph nesting |
| B1-2a real template | spec §8 | **open** — fetch from KHCN&DA before §7 export |
| Concurrent-edit strategy | spec §6 | **open** — at minimum log estimate changes |
| ~~404 vs 403~~ | states §2.2 | **moot** — no group isolation on projects; the real question is whether to add it, and it does not block this work |
| ~~viewer denied or unimplemented~~ | interactions | **denied** — `isWriter` blocks viewer writes at the rules layer |
| ~~error state needs new infra~~ | states §2.3 | **trivial** — `useTenantCollection` already runs on react-query (`isError`/`refetch` exist); `useProjects` just needs to forward them, and stop swallowing permission-denied into `[]` |

The four genuinely open blocks are data-model and policy decisions a mockup
cannot answer. Building on the wrong answer means rework, not a restyle — which
is why they are called out rather than defaulted.
