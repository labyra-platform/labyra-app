# R164 Smoke Test Checklist

Manual QA plan for R164 PROV-O migration. Run on prod after every major change.

## Prerequisites

- Test account with admin role
- Tenant: `tenant-dev-001`
- Browser DevTools network tab open

## 1. Material lifecycle

- [ ] Navigate `/vi/dashboard/materials` — list displays
- [ ] Click any material → detail page loads with "Hoạt động" badge
- [ ] Click **"Lưu trữ"** (Archive/Deprecate)
  - [ ] Confirm dialog appears
  - [ ] Click confirm → redirect to materials list
  - [ ] Material disappears from default list
- [ ] Click filter dropdown → check "Đã ngừng"
  - [ ] Deprecated material appears with amber badge
- [ ] Click into deprecated material
  - [ ] "Khôi phục" button visible
  - [ ] "Thu hồi..." button visible
  - [ ] Click **Khôi phục** → toast success, badge → "Hoạt động"
- [ ] Test retract path:
  - [ ] Click **"Thu hồi..."** → reason dialog opens
  - [ ] Type reason (e.g., "Test retraction")
  - [ ] Confirm → toast success, list view → material gone
  - [ ] Filter "Đã thu hồi" → material visible with red badge
  - [ ] Open detail → NO action buttons (immutable notice)

## 2. Sample + Experiment lifecycle

Repeat above for `/vi/dashboard/samples` and `/vi/dashboard/experiments`.

## 3. Lineage graph

- [ ] Open a sample with parent materials
- [ ] Click "📊 Sơ đồ lineage (PROV-O)" → graph renders
- [ ] Sample appears as larger root node (depth 0)
- [ ] Parent material(s) appear connected via solid line (derivedFrom)
- [ ] Hover node → tooltip with type + label
- [ ] Drag a node → physics simulation responds smoothly
- [ ] Click parent material node → navigates to material detail
- [ ] Color legend at bottom shows 7 entity types

## 4. Measurement upload (renamed from spectra)

- [ ] Open `/vi/dashboard/spectra/upload` (or wherever upload UI lives)
- [ ] Upload XRD file (e.g., `xrd-wo3.xy`)
- [ ] Network tab shows `POST /api/measurements/signed-upload` (NOT /api/spectra)
- [ ] Upload completes, worker analysis starts
- [ ] Open analysis page → results display

### 4a. Legacy URL redirect test

- [ ] In DevTools console: `fetch('/api/spectra/signed-upload', {method:'POST', headers: {authorization: 'Bearer XXX'}, body: ...}).then(r => r.status)`
- [ ] Response → 308 redirect to `/api/measurements/signed-upload`

## 5. AI citation → Paper link

- [ ] Open reference card → set `paperId: pap_xxx` (manual via Firestore Console
      if UI not available)
- [ ] Upload spectrum that matches that reference
- [ ] On analysis page, find citation chip "Library · ref_xxx"
- [ ] Click chip → navigates to `/vi/dashboard/papers/pap_xxx` (internal nav,
      no external icon)
- [ ] If reference has NO paperId, chip links to `/vi/dashboard/reference-cards/ref_xxx`

## 6. Paper versioning

- [ ] Open `/vi/dashboard/papers/[any-paper-id]`
- [ ] Scroll down → "Version history" section
- [ ] Initially shows v1 (current)
- [ ] Edit paper metadata (title/authors) via PATCH endpoint or UI form (if available)
- [ ] Reload detail page → v2 appears, v1 marked as old
- [ ] Click v1 to expand → shows JSON snapshot

## 7. Reference + versioning

- [ ] Open reference card detail
- [ ] (If R164 UI ported) version history visible
- [ ] (Legacy UI) basic display still works

## 8. Migration verification

Check Firebase Console:

- [ ] `tenants/tenant-dev-001/measurements` — 28 documents
- [ ] `tenants/tenant-dev-001/references` — 1 document
- [ ] `tenants/tenant-dev-001/spectra` — still 28 documents but each has
      `_migrated: true` and `_migratedTo` field
- [ ] `tenants/tenant-dev-001/reference_cards` — same `_migrated: true`

## 9. Tenant isolation

- [ ] Create test tenant `tenant-test-001`
- [ ] Sign in as user from test tenant
- [ ] Navigate `/dashboard/materials` → should NOT see tenant-dev-001 materials
- [ ] Try direct API: `GET /api/materials/mat_wo3_001` → 404 or 403

## 10. Performance + rate limits

- [ ] Spam 110 GET requests on `/api/materials` within 60s
- [ ] After ~100, response → 429 "rate_limited" with Retry-After header
- [ ] Wait 60s, request → 200 again

## Rollback plan

If critical bug discovered post-deploy:

1. Revert app commits: `git revert <r164-commit-range>` → push
2. Worker stays — backward compat with old `spectrumId` payload
3. Data: migrated docs in `measurements`/`references` collections — KEEP, will
   be re-read when re-deploying. Old `spectra`/`reference_cards` docs untouched.
4. Document failure in `docs/incidents/r164-rollback.md`

## Sign-off

- [ ] All checks above pass
- [ ] Production smoke verified by: __________ (nAM)
- [ ] Date: __________

---

@phase R164-phase-12
