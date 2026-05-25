# ADR-038 — Booking timeline grid (drag-and-drop scheduling)

**Status:** Accepted · **Date:** 2026-05-25 · **Round:** R214

## Context

Bookings hiện chỉ có dạng bảng (`bookings-table`) + form tạo mới. Admin muốn
nhìn lịch trực quan và **kéo-thả điều chỉnh** thời gian đặt của thành viên —
nhanh hơn mở form sửa từng cái. Người dùng cần thấy "khoảng trống" và va chạm
trực quan.

Hạ tầng backend đã sẵn (không cần thêm):
- `Booking { startAt, endAt (epoch ms), equipmentId, userId, userName, purpose, status }`
- `PATCH /api/bookings/[id]` nhận `{ startAt?, endAt? }`, owner-or-admin, đã
  overlap-check server-side → trả `409 booking_conflict` với danh sách conflicts.
- `useBookings` realtime (onSnapshot) → grid tự cập nhật sau save.

## Decision

Thêm **timeline grid view** cạnh bảng (toggle Bảng | Lịch), với kéo-thả admin.

### View
- Toggle **Day / Week**.
- **Day**: cột = thiết bị (equipment list), hàng = giờ (07:00–22:00, bước 30').
  Block định vị: `top = (startAt − dayStart)/slot × rowH`, `height = dur/slot × rowH`.
- **Week**: cột = 7 ngày, hàng = giờ. (Một thiết bị tại một thời điểm.)
- Block hiện userName + purpose; màu theo status.

### Tương tác (admin-only)
- **Drag** block dọc → đổi `startAt` (giữ thời lượng). Snap 30'.
- **Resize** cạnh dưới → đổi `endAt` (đổi thời lượng). Snap 30'.
- Thả → `PATCH { startAt, endAt }`. Realtime listener cập nhật.
- **Conflict**: bắt `409` từ server (không tự viết logic) → revert block về vị trí
  cũ + toast đỏ "Trùng lịch". Optimistic update, rollback on 409.
- Non-admin: xem read-only (không drag/resize).

### Thư viện
- `@dnd-kit/core` (cần cài) — pointer-based, accessible, nhẹ. Dùng cho drag.
  Resize tự xử bằng pointer events trên handle (dnd-kit không lo resize).

### RBAC
- Edit (drag/resize) chỉ khi `role ∈ {admin, superadmin}` (client guard +
  server đã enforce owner-or-admin ở updateBooking).

## Implementation layers (mỗi lớp 1 patch, build verify)
1. **Grid tĩnh**: @dnd-kit cài, `booking-timeline.tsx` render Day/Week + blocks
   đúng vị trí. Toggle view ở page. CHƯA drag.
2. **Drag** startAt + snap + optimistic PATCH.
3. **Resize** endAt (pointer handle).
4. **Conflict** 409 → revert + toast đỏ.
5. **Polish**: week toggle hoàn chỉnh, current-time line, empty-slot affordance.

## Consequences
- Admin chỉnh lịch nhanh, trực quan; thành viên xem lịch lab.
- Optimistic + 409-revert: an toàn (server là nguồn chân lý cho conflict).
- @dnd-kit thêm ~10KB. Resize thủ công (không phụ thuộc lib).
- Mobile: drag trên màn nhỏ khó — Day view + pinch-scroll; cân nhắc read-only
  trên mobile ở lớp 5.
