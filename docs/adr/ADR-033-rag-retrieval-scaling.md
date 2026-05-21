# ADR-033 — RAG Retrieval Scaling & GraphRAG Prerequisite

> Quyết định kiến trúc cho tầng truy hồi (retrieval) của AI chat (T2 Librarian):
> nguyên nhân `tool_timeout`, region, N+1 Firestore, lộ trình bỏ quét-toàn-corpus,
> và điều kiện tiên quyết trước khi triển khai GraphRAG (Phase 6b).

**Status**: Accepted
**Date**: 2026-05-21 (R188)
**Round**: R188-4 (Phase 1 ship) → R188+ (Phase 2) → R190+ (GraphRAG 6b)
**Related**: ADR-016 (PROV-O — citations collection = graph edges), ADR-017 (Citation
Network), ADR-019 (AI Tier — T2 rag-balanced), tooltimeoutaudit-2026-05-20.md
**Scope**: `labyra-app` — `src/lib/ai/rag/*` (search, bm25-manager, embedding, rerank),
`src/app/api/chat/route.ts` (M7 timeout), `vercel.json` (region), `firestore.indexes.json`.

---

## 1. Bối cảnh

Người dùng gặp `Error: tool_timeout` khi hỏi T2 (Librarian/RAG) câu thường, ví dụ
"WO₃ có cấu trúc tinh thể gì". `searchPapers` (hybrid retrieval) vượt ngưỡng timeout
nội bộ 20s (`withTimeout` tại `chat/route.ts`, M7).

Điều tra (verified, không suy đoán) tìm ra **3 lớp nguyên nhân**:

### 1.1 Region lệch (nguyên nhân latency lớn nhất)
- Vercel function chạy default `iad1` (US East). Firestore ở `asia-southeast1`
  (Singapore). Mỗi Firestore RTT ~200ms (xuyên Thái Bình Dương) thay vì ~30ms.
- Pipeline có 2 burst N+1 Firestore × ~17 RTT (16 papers + 1) = ~34 RTT/search.
  34 × 200ms ≈ 7s **chỉ riêng network**, + embed + rerank + cold start → vượt 20s.

### 1.2 N+1 Firestore kép (nguyên nhân cấu trúc)
Hai hotspot quét toàn corpus mỗi search, mỗi cái N+1 tuần tự:
- `getCorpus` (bm25-manager.ts): đọc papers → loop `await chunks.get()` từng paper.
- `retrieveBM25` (search.ts): đọc papers → loop `await chunks.get()` từng paper.
Tệ hơn: `getBM25ForTenant` **load BM25 state từ Firestore rồi vẫn refit lại từ
corpus** (bỏ state vừa load) — lãng phí kép. Cache in-memory vô dụng vì Vercel
instance recycle 5-15 phút → hầu hết request hit cold path.

### 1.3 Timeout 20s quá gắt (nguyên nhân vận hành)
Hybrid RAG (Voyage embed + Pinecone + BM25 + RRF + Voyage rerank) steady 3-5s,
cold start 10-15s, + Vercel cold start 1-3s → 15-25s là **hợp lệ**. 20s cắt oan
cả search đúng.

---

## 2. Quyết định

### Phase 1 — Stop the bleed (R188-4, ĐÃ SHIP)

| ID | Quyết định | Lý do |
|---|---|---|
| R | Vercel function region → **`sin1`** (vercel.json `regions`) | Cùng khu vực Firestore asia-southeast1 + worker Cloud Run + user VN. RTT 200ms→~30ms. Trade-off: free tier 1 region (mất iad1) — chấp nhận, không có user US. |
| T-1 | Timeout 20s → **45s** + graceful message; timeout KHÔNG throw cả `Promise.all` (→ ToolResult error, turn sống) | Search hợp lệ cần tới 25s; 1 tool fail không được giết lượt chat (tránh "..." trống). |
| T-7 | **Timing log** mỗi step `searchPapers` (`event=search_timing`) | Đo P95 thật để quyết Phase 2 — không tối ưu mù. |

### Phase 2 — Real fix (theo data T-7; CHƯA làm)

Kích hoạt khi: log T-7 cho thấy `bm25_retrieve` hoặc `parallel_embed_and_bm25_load`
là P95 bottleneck SAU khi region=sin1, **HOẶC** tenant nào đó > 30 papers indexed.

| ID | Quyết định | Tác động |
|---|---|---|
| T-2 | Collapse N+1 → `collectionGroup('chunks')` 1 query (cả getCorpus + retrieveBM25). Prereq: denormalize `tenantId`+`paperStatus` vào chunk docs (migration Cloud Function 1 lần) + composite index collectionGroup. | 51 RTT → 1 RTT. −4-6s/search. |
| T-3 | Persist + reuse BM25 state (idf/vocab/avgdl) — bỏ refit mỗi cold start. `loadState()` thay `fit(corpus)`. | −100-300ms cold; corpus fetch chỉ cần khi refit cron. |
| T-4 | Fail-soft: bọc `retrieveBM25` timeout 5s nội bộ → fallback vector-only nếu BM25 chậm. | Worst case 3-4s thay vì 10-15s. Vector cho 70-80% chất lượng. |

### Phase 3 — Long-term (defer, ngưỡng rõ)

| ID | Khi nào | Hướng |
|---|---|---|
| T-5 | repeat-query rate > 20% | Cache query embedding (sha256→vector, Firestore TTL 7d). |
| T-6 | tenant nào > 50k chunks | Inverted index (token→posting list) thay vì scan-all-chunks. |

---

## 3. GraphRAG (Phase 6b) — điều kiện tiên quyết

GraphRAG 6b (ROADMAP: D3 citation graph + `searchCitations` tool) đã unblocked về
mặt data (RAG ground truth có từ R166). **NHƯNG không được triển khai trước Phase 2.**

**Lý do (quyết định cứng):**
- GraphRAG traversal trên `citations` collection (ADR-016/017 — graph edges) sẽ
  thêm nhiều Firestore round-trip (multi-hop). Nếu xây trên tầng retrieval còn
  quét-toàn-corpus + N+1 (Phase 2 chưa xong), GraphRAG **kế thừa và khuếch đại**
  cùng bệnh latency — xây nhà trên móng nứt.
- T-2 (collectionGroup + denormalized fields) + T-6 (inverted index) chính là móng
  cho graph layer truy vấn hiệu quả.

**Thứ tự bắt buộc:**
```
Phase 1 (region+timeout, DONE)
  → Phase 2 (T-2 collapse N+1, T-3 persist state, T-4 fail-soft)
    → GraphRAG 6b (citation graph traversal + searchCitations tool)
```

GraphRAG KHÔNG bị huỷ — được đặt sau khi tầng retrieval vững. "Triển khai GraphRAG
đúng" = làm Phase 2 trước, không nhồi 6b lên nền chưa sửa.

---

## 4. Hệ quả

**Tích cực:**
- Phase 1 ship: chat T2 sống lại (tool_timeout hết), latency giảm mạnh nhờ sin1.
- Có đường rõ (Phase 2/3 + ngưỡng kích hoạt) → không tối ưu non, không over-engineer
  cho lab nhỏ (16 papers) hiện tại.
- GraphRAG có móng vững khi tới lượt.

**Đánh đổi:**
- sin1: free tier 1 region, mất multi-region (chấp nhận — không có user US/EU).
- T-2 cần migration backfill (denormalize chunk fields) — việc 1 lần, nửa ngày.
- Timing log T-7 là tạm (console.log) — gỡ sau khi root cause đóng.

**Rủi ro nếu bỏ qua Phase 2:**
- Tenant vượt ~30 papers → N+1 lại gây timeout dù đã sin1.
- GraphRAG xây sớm trên nền chưa sửa → nợ kép, đập làm lại.

---

## 5. Bug liên quan đã sửa cùng round (R188)

- **R188-5**: R187 soft-delete thêm `where('lifecycleStatus','in',...)+orderBy` vào
  8 entity LIST nhưng thiếu composite index → `9 FAILED_PRECONDITION`. Đã thêm 8
  index (7× lifecycleStatus+createdAt, samples lifecycleStatus+preparedAt) + deploy.
  **Anti-pattern ghi nhận**: thêm where+orderBy mới PHẢI thêm firestore index đồng bộ.
- **R176-3 (3c+3d)**: Gemini 3 multi-turn 400 INVALID_ARGUMENT (thoughtSignature
  persistence + functionResponse.name = ID thay vì function name) — KHÔNG liên quan
  retrieval, nhưng cùng path T2. (Audit G-2.)

---

## 6. Living Notes

- Phase 1 metric chốt sau khi đọc T-7 log (P50/P95 mỗi mark). Cập nhật mục 1.1 với
  số đo thật khi có.
- T-2 migration: verify chunk docs có `paperId` chưa (đã có theo PaperChunkMetadata);
  cần thêm `tenantId` + `paperStatus` denormalized.
- Gỡ T-7 console.log sau khi Phase 2 đóng (tránh log pollution prod).
- CSP `eval` violation tại `/experiments/new` (report-only) — KHÔNG thuộc ADR này,
  ghi riêng: phải fix trước khi flip CSP enforce (launch domain).

*Document version 1.0 — R188. Next review: sau khi có T-7 P95 data + quyết Phase 2.*
