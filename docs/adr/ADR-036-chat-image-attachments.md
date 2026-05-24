# ADR-036 — Chat image attachments (multimodal vision)

**Status:** Accepted (phase 2a) · **Date:** 2026-05-24 · **Round:** R200

## Context

Người dùng cần đính ảnh vào câu hỏi chat để AI phân tích (giống Claude): thả
ảnh phổ XRD/SEM/sơ đồ, hỏi "đỉnh này là pha gì?", "vi cấu trúc này có gì bất
thường?". Hiện `MessageInput` chỉ gửi `text`; `chat/route.ts` chỉ nhận
`message: string`; `LLMMessage.content` là `string`. Không có đường cho ảnh.

Tin tốt từ khảo sát code:
- Cả 2 provider (gemini/anthropic) ĐÃ xử lý `content` dạng block array
  (`LabyraBlock[]` cho text/tool_use/tool_result). Thêm `image` chỉ là 1 case.
- Mọi model trong stack đều hỗ trợ vision: gemini-3-flash (T1+), claude
  sonnet/opus (T3+). Chỉ gemini-3.1-flash-lite (T0) vision yếu hơn.

## Decision

### Phạm vi phase 2a
- **CHỈ ảnh**: PNG, JPEG, WebP, GIF (non-animated). PDF-attach = phase 2b
  (chồng luồng paper upload, OCR — tách riêng).
- Giới hạn: ≤ 5 MB/ảnh, ≤ 4 ảnh/message.

### Storage
- Đường dẫn: `tenants/{tid}/chat-attachments/{convId}/{attachmentId}.{ext}`
  (nested, đồng bộ format R198).
- Upload qua signed URL (tái dùng `getSignedUploadUrl`), client PUT trực tiếp.
- Firestore user message lưu **ref** (không base64):
  `attachments: [{ storagePath, mimeType, name }]`.

### Type / provider
- `LLMMessage.content: string | LLMContentBlock[]`.
- `LLMContentBlock` = text | image (`{ type:'image', mimeType, data /*base64*/ }`).
- gemini: `image` → `{ inlineData: { mimeType, data } }` (buildHistory +
  buildCurrentTurnParts).
- anthropic: `image` → `{ type:'image', source:{ type:'base64', media_type, data } }`.

### Tier
- Message có ảnh → **ép tier tối thiểu 1** (gemini-3-flash). Không để T0
  flash-lite xử ảnh (vision yếu). Logic ở chỗ chọn tier sau intent classify.

### Flow
1. UI: ＋ / drag-drop ảnh → validate (type, size, count) → signed upload →
   preview chip.
2. `send(text, attachments)` → body `{ message, conversationId, attachments }`.
3. route: validate attachments thuộc tenant/conv, load ảnh từ storage → base64
   → ghép user turn `content: [{text}, {image}...]`, lưu message kèm refs.
4. provider build vision parts → model đọc → trả lời.
5. message-bubble: render ảnh user đã gửi (signed download URL).

## Consequences
- Chi phí: ảnh tốn token vision (gemini ~258 tok/tile, claude ~tokens theo
  kích thước). Cost Guard v2 đã đếm theo usage trả về — không cần thay đổi.
- Bảo mật: signed upload có giới hạn type/size; route verify attachment path
  prefix `tenants/{tid}/chat-attachments/{convId}/` (chống path traversal,
  như C3 paper signed-download).
- Tier ép ≥1 khi có ảnh: T0-only-text path không đổi.

## Phase 2b (sau, KHÔNG trong scope này)
- PDF attach: qua document block (Claude PDF native) hoặc OCR pipeline.
- Animated GIF / video.
- Ảnh do AI sinh (generative) — đã REJECTED, dùng tool-call component pattern.
