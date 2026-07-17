# ADR-034 — Group Hierarchy, 2-Axis RBAC & Per-Group Data Scoping

**Status**: Accepted — shipped, status corrected R564

> Said "Proposed — DESIGN ONLY. Implementation deferred to post-launch." while
> `groupId` is a live custom claim (a real account carries
> `groupId: qndyvIFfkt3kIK72i8on`) and firestore.rules references isAdmin/groupId
> in 24 places. This was the most dangerous of the five: a reader trusting the
> label would conclude group isolation does not exist yet and write code that
> ignores it.
>
> Original header, for the record: Proposed (R192, 2026-05-22) — **DESIGN ONLY. Implementation deferred to post-launch.**
Không code track này trước launch blockers (xem ROADMAP "Commercial launch track").
**Extends**: ADR-030 (RBAC phẳng) — KHÔNG thay thế, mở rộng thêm trục thứ 2.
**Cross-ref**: ADR-033 (RAG retrieval scaling — trục *performance*, ADR này là trục *scoping*),
ADR-016/017 (PROV-O lineage — moat cần bảo toàn), ADR-019 (AI tier — RAG `searchPapers`).

---

## 1. Bối cảnh

ADR-030 thiết lập RBAC một trục: `role ∈ {superadmin, admin, member, viewer}`, claim phẳng,
mọi entity filter theo `tenantId`. Đủ cho 1 lab nhỏ phẳng, KHÔNG đủ cho cấu trúc thật:

### 1.1 Nhu cầu thật (tenant #1 = Lab Vật liệu BKU)
Một lab vận hành theo **nhiều nhóm (group)**, mỗi nhóm có **hướng đề tài riêng** (vd nhóm pin,
nhóm xúc tác, nhóm màng). Hệ quả:
- **RAG nhiễu domain**: thả paper mọi nhóm vào chung 1 KB → retrieval trả lẫn lộn domain,
  ngữ cảnh sai. Cô lập paper theo nhóm = giữ RAG sạch, đúng domain. (Đây là lý do
  *chất lượng AI*, không phải *quyền riêng tư*.)
- **Đề tài là trí tuệ riêng nhóm**: experiment/sample/spectra của một đề tài thuộc về nhóm đó.

### 1.2 Mô hình quyền thật = theo PHẠM VI, không phải thang dọc
Phân cấp sau "admin" KHÔNG phải bậc tuyến tính (admin→phó→member). Là **quyền theo scope**:

| Tầng | Vai trò | Phạm vi quản |
|---|---|---|
| Tenant-level | **Owner** (trưởng lab / người trả tiền) | cấu trúc lab + billing + tạo group + bổ nhiệm leader |
| Group-level | **Group Admin** (leader nhóm) | nội dung + member của NHÓM MÌNH |
| In-group | **Member** (NCS/HV) | làm việc trong nhóm |
| In-group | **Viewer** | chỉ xem |
| Đặc biệt (opt-in) | **cross-group visibility** | Owner bật → đọc xuyên nhóm. KHÔNG mặc định. |

### 1.3 Bối cảnh thương mại (chỉ ghi nhận — không thiết kế ở đây)
Hai mô hình trả tiền đã thảo luận (A: NCS ngang hàng góp tiền; B: trưởng lab phân cấp trả)
là **hai cấu hình của cùng một mô hình tenant + một payer** (KHÔNG split-payment). Group
hierarchy ở ADR này là *nền* cho mô hình B; mô hình A chỉ là tenant phẳng (không group, hoặc
1 group). Billing/seat-limit = ADR riêng khi Stripe ship. Ghi để tránh thiết kế ngược.

---

## 2. Quyết định

### 2.1 Khái niệm `group` (nhóm người)
- Collection mới: `tenants/{tenantId}/groups/{groupId}` — `{ name, leaderId, createdBy, createdAt }`.
- "group" = **nhóm NGƯỜI** (leader + members), KHÔNG phải đề tài. Project/đề tài là khái niệm
  riêng (future, không trộn — tránh chồng khái niệm). Nếu sau cần "đề tài", thêm `Project`
  *bên trong* group, không thay group.
- **1 user thuộc ĐÚNG 1 group** (claim `groupId` = 1 string, như `tenantId`). KHÔNG đa-group:
  giữ claim đơn giản, RBAC/filter/billing không nổ phức tạp. Mở rộng đa-group chỉ khi có nhu cầu
  thật đã validate (YAGNI).

### 2.2 RBAC 2 trục (mở rộng ADR-030, không phá)
Claim mở rộng: `{ tenantId, role, groupId }`. Thêm khái niệm role `group_admin` (leader).
- **Owner** (`role: admin`/`superadmin`, tenant-scope): tạo/xoá group, đặt tên, bổ nhiệm leader,
  invite mọi role, bật cross-group visibility cho chính mình.
- **Group Admin** (`role: group_admin`, scope = `groupId` của mình):
  - Invite người **CHỈ vào group mình** (invite mang theo `groupId`).
  - **Anti-escalation (mở rộng ADR-030)**: leader chỉ gán `member`/`viewer`.
    KHÔNG gán `admin`, KHÔNG gán `group_admin`. (ADR-030 đã chặn admin-mời-admin;
    đây thêm tầng: group_admin chỉ mời member/viewer + chỉ trong group mình.)
  - Quản nội dung (CRUD) trong scope group mình.
- **Member/Viewer**: như ADR-030, nhưng giới hạn trong `groupId`.

### 2.3 Data scoping — CÔ LẬP đúng tầng, CHUNG đúng tầng
Quyết định nền quan trọng nhất. Phân loại entity theo bản chất:

| Nhóm | Entity | Scope | Lý do |
|---|---|---|---|
| **Trí tuệ nghiên cứu** | `experiments`, `samples`, `spectra`, `papers` (+ KB/Pinecone) | **group-scope** (`groupId`) | đề tài + tài liệu riêng nhóm; RAG sạch domain |
| **Tài nguyên vật lý** | `equipment`, `chemicals`, `bookings` | **tenant-scope** (chung lab) | 1 máy/1 lọ hoá chất là vật lý dùng chung; cô lập → đặt trùng máy thật, vô lý |
| **Quản trị** | `groups`, `invites`, `users`, cost telemetry | tenant-scope | thuộc owner |

**Nguyên tắc**: cô lập **trí tuệ** (riêng nhóm), chung **vật lý** (cả lab). Booking máy XRD phải
chung để 2 nhóm không đặt trùng giờ máy thật.

### 2.4 Lineage vs Isolation — KHÔNG mâu thuẫn (điểm then chốt)
Lo ngại: cô lập có phá moat lineage PROV-O (ADR-016/017) không?
**Không, nếu cô lập đúng tầng.** Chuỗi `sample → spectra → experiment → analysis → paper` đều
nằm TRONG cùng group (vì cả 4 đều group-scope) → lineage **nguyên vẹn trong phạm vi nhóm**.
Lineage chỉ "không xuyên" giữa các group — mà đó CHÍNH LÀ ý đồ cô lập. Moat lineage giữ đủ.
Tài nguyên vật lý (equipment/chemical) là leaf-node tham chiếu chung, không nằm trên trục lineage
trí tuệ → chung lab không gãy chuỗi.

### 2.5 cross-group visibility (2 chế độ cho trưởng lab)
Opt-in, KHÔNG mặc định. Khi Owner bật:
1. **KB tổng**: Owner query RAG xuyên mọi group (bỏ filter `groupId`).
2. **Filter-by-group**: Owner xem KB/data của từng nhóm cụ thể ("nhóm nào thêm tài liệu gì").
Triển khai = nới filter ở retrieval/list theo claim Owner, dùng RBAC sẵn (admin đọc xuyên).

### 2.6 RAG scoping (KB-per-group) — khả thi, KHÔNG re-embed
Verify R192 (ADR-033 hiện trạng): Pinecone namespace = `tenantId` (1 ns/tenant); query đã nhận
`filter?: Record<string,unknown>` truyền thẳng `ns.query({filter})`; cơ chế metadata-filter đã
dùng cho `section: {$nin}`. Do đó:
- Thêm `groupId` vào **metadata** chunk (Pinecone hỗ trợ update metadata theo id — **không cần
  re-embed**, giữ nguyên vector).
- `searchPapers` (ADR-033) merge filter `groupId: { $in: [userGroupId, 'lab-shared'] }`.
- BM25 (Firestore `papers`) thêm `.where('groupId', 'in', [...])` → **composite index mới**
  (`status` + `groupId`) phải thêm + deploy (invariant: where+orderBy → index).
- `paper.groupId` nhận giá trị `groupId | 'lab-shared'` (1 giá trị, không mảng — filter gọn).
  `'lab-shared'` = tài liệu định hướng chung cả lab, mọi group thấy.

---

## 3. Phases triển khai (DEFERRED — sau launch blockers)

```
TEAM-1  Group model: collection groups + claim groupId + role 'group_admin'.
        Owner UI: tạo group, đặt tên, bổ nhiệm leader. (NỀN)
TEAM-2  Invite mở rộng: invite mang groupId; group_admin invite chỉ member/viewer
        trong group mình (anti-escalation mở rộng ADR-030 §2.2).
TEAM-3  Data scoping write-path: thêm groupId vào experiments/samples/spectra/papers
        khi tạo (lấy từ claim). equipment/chemicals/bookings GIỮ tenant-scope.
TEAM-4  Data scoping read-path: filter groupId mọi list/query group-scope + Firestore
        rules chặn đọc chéo group + composite indexes. Migration: backfill data hiện
        có (tenant-dev-001: 16 papers + experiments/samples/spectra) → 'lab-shared'
        hoặc group mặc định.
TEAM-5  RAG KB-per-group: groupId vào Pinecone metadata (update, no re-embed) +
        searchPapers filter + BM25 where + index. cross-group visibility cho Owner.
```

Mỗi phase = 1 patch, build + lint 0 + test green. ADR-029 graduated security testing:
mỗi phase đụng rules PHẢI thêm rules test (đọc chéo group = deny).

---

## 4. Hệ quả

**Tích cực:**
- RAG sạch domain per group → chất lượng AI tăng (lý do gốc của cô lập).
- Lineage moat giữ nguyên trong group (§2.4).
- Tài nguyên vật lý chung → không đặt trùng máy; mô hình khớp lab thật.
- RBAC 2 trục mở rộng ADR-030, không đập lại.
- Nền cho mô hình billing B (trưởng lab phân cấp trả).

**Chi phí / rủi ro:**
- Track LỚN (ngang ADR-030 RBAC): groupId xuyên 4 entity + rules + index + migration.
- **Migration production bắt buộc**: data hiện có không có groupId. Backfill cẩn thận
  (gán 'lab-shared' hoặc group mặc định) — verify trước, không mất dữ liệu.
- Claim thêm `groupId` → đổi Cloud Function set-claims + token refresh sau khi gán group.
- **KHÔNG làm trước launch.** Code track này = bỏ launch blockers (E2E/billing/domain/Stripe)
  để xây cho lab thứ 2 chưa tồn tại. Validate nhu cầu với lab thật trước khi implement
  ngoài tenant #1.

**Out of scope (future, ADR riêng):**
- **Share data giữa group** — KHÔNG thiết kế ở đây. Khi cần: nghiêng *reference* (data thuộc
  group gốc, group khác được đọc — giữ 1 nguồn sự thật), không copy. Làm cô lập trước, share sau.
- **Billing/seat-limit** (mô hình A/B) — chờ Stripe.
- **Project/đề tài** bên trong group — nếu phát sinh nhu cầu, không trộn vào `group`.
- **Đa-group cho 1 user** — chỉ khi validate có nhu cầu thật.

---

## 5. Living Notes
- R192: ADR tạo (design-only). Verify hiện trạng: invite/RBAC/RAG/Pinecone đã đọc file gốc
  (anti-escalation ADR-030 sẵn, namespace=tenantId, metadata-filter sẵn). Chưa code dòng nào.

---

## Addendum R192-5 (2026-05-22) — Role hierarchy finalized + TEAM-2 invites

Decision after building TEAM-1/2. The hierarchy (1 user = 1 group) is:

```
superadmin   = platform operator (the founder) — cross-tenant, SCRIPT-ONLY,
               NEVER invitable via app (security: no one else may become superadmin).
─────────────────────────────────────────────────────────────────────────────
admin        = tenant owner/admin — full control WITHIN tenant: create groups,
               appoint leaders, invite (member/viewer; admin only if superadmin).
group_admin  = group leader — expressed as role 'member' + isGroupLead=true on
               their groupId. NOT a 5th enum role (RBAC stays 2-axis: role × scope).
               May invite member/viewer INTO THEIR OWN GROUP only.
member       = works within their group.
viewer       = read-only within their group.
```

TEAM-2 wiring:
- Invite carries optional `groupId`. Admin may assign any group (or none).
- A group leader (isGroupLead) inviting is forced to role∈{member,viewer} and
  groupId = their own group (client groupId ignored). Enforced in
  `POST /api/invites` (route admits leaders via authenticateWriter, then restricts).
- `acceptInvite` grants `groupId` into claims on accept; `isGroupLead` stays false
  (leadership is appointed separately by an admin via the Groups page).
- `authenticate()` now returns `groupId` + `isGroupLead` for downstream scope checks.

Owner vs admin: NOT split into separate roles. `admin` = owner within a tenant;
`superadmin` is the platform founder, outside the tenant role ladder. A dedicated
billing-owner concept (the paying seat) is deferred to the billing ADR.
