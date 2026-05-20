# ADR-030 — RBAC & Onboarding Model

> Mô hình phân quyền (RBAC) và luồng onboarding B2B cho Labyra: ai đăng ký thành admin, mời thành viên thế nào, quyền enforce ở đâu.
> Chốt giai đoạn 1 (RBAC thuần) đủ cho commercial launch; ABAC ownership defer giai đoạn 2.

**Status**: Proposed
**Date**: 2026-05-20
**Round**: R186+ (RBAC enforcement + onboarding backend)
**Related**: ADR-028 (Architecture Upgrade & Security), ADR-029 (Graduated Security Testing), securityaudit20260520.md (C1 Firestore rules), AI_ARCHITECTURE.md (tenant isolation)
**Scope**: `labyra-app` — auth layer, API routes, Firestore rules, members/invite flow, signup. Áp dụng cho mọi tenant.

---

## 1. Executive Summary

Labyra là B2B multi-tenant SaaS. Mỗi tenant = 1 lab. Quyết định cốt lõi:

| Quyết định | Lựa chọn | Giai đoạn |
|---|---|---|
| Mô hình quyền | RBAC thuần (role → action), KHÔNG ownership | 1 (launch) |
| Ownership (ABAC) | Member chỉ sửa/xóa data mình tạo | 2 (defer) |
| Onboarding | Buyer đăng ký → tạo tenant → thành admin | 1 |
| Gia nhập | Invite-only (admin mời) | 1 |
| Request-to-join | User xin, admin duyệt + domain match | 2 (defer) |
| Billing | Per-tenant (admin trả cho cả lab) | 1 |
| Enforcement | 3 tầng: rules + API + UI; API là nguồn chân lý | 1 |

**Vấn đề phát hiện (R186)**: API routes hiện CHỈ check `tenantId` + `uid`, KHÔNG check `role`. Vì app ghi DB qua Admin SDK (bypass Firestore rules), API layer mới là enforcement thật — và nó đang trống. Viewer/member gọi API tạo/sửa/xóa được như admin. Đây là lỗ hổng phân quyền toàn cục, blocking cho commercial launch.

**Căn cứ best practice ngành** (WorkOS, Auth0, AWS Prescriptive Guidance): RBAC thuần phù hợp sản phẩm giai đoạn đầu với role phổ quát (owner/admin/member/viewer); thêm ABAC khi cần >2-3 điều kiện tùy biến. Backend là nguồn chân lý, UI chỉ phản ánh ngữ nghĩa backend.

---

## 2. Roles & Permission Matrix

### 2.1 Bốn role (custom claim `role` trên Firebase token)

| Role | Mô tả | Scope |
|---|---|---|
| `superadmin` | Platform operator (nAM). Cross-tenant. | Toàn platform |
| `admin` | Lab PI / người mua. Full control 1 tenant. | 1 tenant |
| `member` | Researcher. Tạo/sửa data, dùng AI. | 1 tenant |
| `viewer` | Guest / cộng tác viên ngoài. Read-only. | 1 tenant |

Role được set qua custom claim bởi Cloud Function lúc accept invite (hoặc tạo tenant). Token cũng mang `tenantId`. Mọi quyết định authorization phải **tenant-aware**: không hỏi "có phải admin?" mà "có phải admin TRONG tenant này?".

### 2.2 Ma trận quyền (giai đoạn 1 — RBAC thuần)

| Action | viewer | member | admin | superadmin |
|---|---|---|---|---|
| Read (GET) trong tenant | ✅ | ✅ | ✅ | ✅ |
| Create / Update (POST/PATCH) | ❌ | ✅ | ✅ | ✅ |
| Retract / Reactivate (xóa mềm) | ❌ | ✅ | ✅ | ✅ |
| AI chat / upload / analyze | ❌ | ✅ | ✅ | ✅ |
| Members / Settings / Billing | ❌ | ❌ | ✅ | ✅ |
| superadmin/* (cross-tenant) | ❌ | ❌ | ❌ | ✅ |

**Quyết định cụ thể**:
- GET không check role — viewer là read-only nên đọc trong tenant OK. Tenant isolation (tenantId filter) đã chặn cross-tenant đọc.
- Member được retract (xóa mềm). Retract = lifecycle deprecated/retracted, không hard delete; admin reactivate được. Member tự rút data lỗi là workflow bình thường.
- Member KHÔNG quản lý members/settings/billing (admin-only).

### 2.3 Defer giai đoạn 2 — Ownership (ABAC)

Khi cần "member chỉ sửa/xóa data MÌNH tạo" (check `createdBy === uid`): thêm lớp ABAC nhẹ trên nền RBAC. KHÔNG làm giai đoạn 1 vì:
- Lab trong 1 tenant thường tin nhau.
- Ownership phức tạp đáng kể (mỗi mutating route phải load doc trước, check createdBy).
- Best practice: chỉ thêm ABAC khi >2-3 điều kiện tùy biến hoặc khách yêu cầu.

---

## 3. Enforcement — 3 tầng

Phân quyền enforce ở nhiều tầng, mỗi tầng một vai trò (defense-in-depth):

| Tầng | Vai trò | Trạng thái |
|---|---|---|
| **Firestore Rules** (data) | Chặn client SDK ghi TRỰC TIẾP DB (DevTools). | Đang fix C1 (catch-all OR bug) |
| **API Routes** (action) | **Nguồn chân lý.** App ghi qua Admin SDK → rules bypass → API check role mới thật sự enforce. | **CHƯA có — R186 fix** |
| **UI** (cosmetic) | Ẩn/hiện nút theo role. KHÔNG phải bảo mật. | Cần audit |

**Điểm mấu chốt**: Admin SDK bypass Firestore rules. Mọi mutating action đi qua API route → Admin SDK → DB. Vì vậy **API layer là enforcement thật**. Firestore rules chỉ là defense-in-depth (chặn client gọi Firestore trực tiếp). UI gate chỉ là UX.

### 3.1 Helper API (giai đoạn 1)

Mở rộng `src/lib/api/auth-helper.ts` để trả thêm `role`, và thêm guard:

```typescript
// auth-helper trả: { tenantId, uid, role }
// getRoleFromToken(decoded) trong token.ts — đọc custom claim 'role'

requireWriter(auth)      // chặn viewer — cho create/update/retract/AI
requireAdmin(auth)       // members/settings/billing
requireSuperadmin(auth)  // superadmin/* — đã có superadmin-guard.ts
```

Pattern per-route (minh bạch, mỗi route tự khai quyền):

```typescript
const auth = await authenticate(req);
if (auth.error) return auth.error;
const denied = requireWriter(auth);   // 403 nếu viewer
if (denied) return denied;
// ... proceed
```

**Lý do chọn per-route thay vì map tập trung**: route đã có sẵn pattern `authenticate()` ở đầu (chỉ +1 dòng); minh bạch & dễ audit; Next.js không có middleware-per-route gọn. Map tập trung dễ sai path matching + khó logic phức tạp.

### 3.2 Phân loại 63 API routes

- **GET (read)**: không thêm guard (viewer đọc OK).
- **POST/PATCH/PUT + retract/reactivate**: thêm `requireWriter`. Nhóm: materials, samples, experiments, spectra, equipment, bookings, measurements, references, analyses, chat, papers, csie.
- **Admin ops**: thêm `requireAdmin`. Nhóm: members, settings, billing.
- **superadmin/***: `requireSuperadmin` (đã có guard, verify dùng nhất quán — xem M1 audit về inline re-implementation ở material-profiles).

---

## 4. Onboarding B2B

### 4.1 Hai luồng đăng ký KHÁC NHAU (phân biệt rõ — dễ sai)

**Luồng A — Buyer tạo lab mới:**
```
Signup (email + tên lab)
  → tạo TENANT MỚI (tenantId mới)
  → user thành ADMIN (owner) của tenant đó
  → billing gắn với tenant
  → vào dashboard trống + onboarding (setup lab = Settings page)
```

**Luồng B — Thành viên được mời:**
```
Nhận email mời (chứa token invite + tenantId + role đã định)
  → đăng ký / login
  → KHÔNG tạo tenant mới
  → Cloud Function gán claim { tenantId, role } theo invite
  → vào dashboard CHUNG của lab (tenant đã có)
```

Hệ thống PHẢI phân biệt 2 luồng: signup qua link invite (vào tenant có sẵn) vs signup mới toanh (tạo tenant mới). Nhầm lẫn = tạo tenant rác hoặc gán sai tenant.

### 4.2 Gia nhập: Invite-only (giai đoạn 1)

- Admin nhập email + chọn role (member/viewer) → gửi email mời → user accept → vào lab.
- User KHÔNG tự đăng ký vào tenant có sẵn được.
- Lý do chọn invite-only: an toàn nhất (admin kiểm soát ai vào + role), chuẩn B2B (Slack/Linear/Notion), Labyra đã có UI invite flow, đơn giản → launch nhanh.
- UI đã build: Members page (mời + role + invite pending + resend/cancel).

**Defer giai đoạn 2** — Request-to-join: user xin tham gia, admin duyệt; hoặc domain-match (email `@hcmut.edu.vn` → gợi ý lab cùng trường). Hợp môi trường ĐH đông nhưng phức tạp (discovery + approval queue + chống spam) → để sau.

### 4.3 Anti privilege-escalation (BẮT BUỘC giai đoạn 1)

Lỗ hổng RBAC kinh điển: nếu admin gán được role ≥ role mình → leo thang đặc quyền.

**Quy tắc** (enforce ở invite + role-change route):
- User chỉ gán được role **thấp hơn** role mình.
- Admin gán được: member, viewer. KHÔNG gán được admin/superadmin.
- Chỉ superadmin tạo được admin/superadmin.
- Role-change cũng tuân quy tắc này (admin không tự nâng mình lên superadmin).

### 4.4 Billing

- Gắn với **tenant** (admin/owner trả cho cả lab), KHÔNG per-user.
- Số lượng member/viewer có thể là yếu tố pricing (defer — xem roadmap billing).

---

## 5. Implementation Roadmap

### R186+ — RBAC API enforcement

```
1. token.ts: thêm getRoleFromToken(decoded)
2. auth-helper.ts: trả { tenantId, uid, role }
3. tạo requireWriter / requireAdmin (requireSuperadmin đã có)
4. sweep routes theo nhóm:
   - writer-gated: materials/samples/experiments/spectra/equipment/
     bookings/references/analyses/papers/chat/csie (POST/PATCH/retract/reactivate)
   - admin-gated: members/settings/billing
5. anti-escalation guard ở invite + role-change route
6. build + Firestore rules emulator test (viewer POST → 403, member OK)
```

### Onboarding backend (sau RBAC)

```
- signup → tạo tenant + gán admin (Cloud Function)
- invite route + accept-invite → Cloud Function gán { tenantId, role }
- phân biệt luồng A (tạo tenant) vs B (join qua invite)
- anti-escalation ở invite role selector
```

### Verify

- Emulator test: ma trận quyền (mỗi role × mỗi action).
- Manual: viewer login → mọi nút mutate ẩn (UI) + API trả 403 (security).
- Tích hợp ADR-029 L3 (authenticated app test) cho RBAC.

---

## 6. Consequences

**Tích cực:**
- Phân quyền enforce thật (không chỉ UI). Viewer không phá được data.
- Chuẩn B2B → onboard lab dễ, investor-ready.
- RBAC thuần đơn giản → maintain dễ, launch nhanh.
- Có đường nâng cấp rõ (ABAC giai đoạn 2) không phải đập đi xây lại.

**Đánh đổi:**
- Sweep 63 route (mỗi route +1-2 dòng) — công sức 1 lần.
- Giai đoạn 1 member sửa được data người khác trong tenant (chấp nhận; ABAC sau).
- Cần Cloud Function cho signup/invite (backend onboarding chưa có).

**Rủi ro nếu KHÔNG làm:**
- Viewer/member xóa/sửa data như admin → không bán được SaaS.
- Admin tự nâng superadmin → kiểm soát cross-tenant (escalation).

---

## 7. References

- WorkOS — Multi-tenant RBAC design: https://workos.com/blog/how-to-design-multi-tenant-rbac-saas
- Auth0 — Authorization model for multi-tenant SaaS: https://auth0.com/blog/how-to-choose-the-right-authorization-model-for-your-multi-tenant-saas-application/
- AWS Prescriptive Guidance — Multi-tenant SaaS authorization & API access control
- OWASP Top 10 Web 2021 — A01 Broken Access Control
- ADR-028 (Architecture Upgrade & Security), ADR-029 (Graduated Security Testing)
- securityaudit20260520.md — C1 (Firestore rules catch-all), H3 (IDOR audit endpoint)

---

## 8. Living Notes

- **R186 priority**: RBAC API enforcement TRƯỚC commercial launch — blocking.
- C1 (Firestore rules) là defense-in-depth song song; API enforcement là chính.
- Anti-escalation guard không được quên — lỗ hổng dễ bỏ sót.
- Onboarding backend (signup→tenant, invite→role) là blocker riêng cho self-serve launch.
- Giai đoạn 2 review: ABAC ownership + request-to-join + domain-match khi có nhu cầu thật từ khách.

*Document version 1.0 — R186 planning. Next review: sau RBAC enforcement ship.*
