# ADR-046 — Keyword Retrieval at Scale: BM25 → Pinecone Sparse Vectors

> Quyết định kiến trúc cho tầng keyword/lexical retrieval của RAG khi mở rộng tới
> cap **1000 paper/cá nhân**. Thay BM25 quét-toàn-corpus trên Firestore bằng
> sparse vectors trong Pinecone (managed), loại bottleneck scan-all tận gốc.

**Status**: Proposed (chờ duyệt + số liệu T-7)
**Date**: 2026-05-30
**Round**: dự kiến R237br+
**Related**: ADR-033 (RAG retrieval scaling — Phase 2/3 mà ADR này thay thế một phần),
ADR-016/017 (PROV-O / citation graph), ADR-019 (AI tier — rerank Voyage).
**Scope**: `labyra-app` `src/lib/ai/rag/*` (search, retrieveBM25→retrieveSparse,
vector-store/pinecone) + `labyra-spectra-worker` `src/papers/` (index step: upsert
sparse cạnh dense).
**Tiêu chí bám**: Trust > Coverage · deterministic trước LLM · dùng cái đã có ·
license sạch · đo trước khi xây · không over-engineer.

---

## 1. Bối cảnh (đã verify trên repo, không suy đoán)

`retrieveBM25` (`src/lib/ai/rag/search.ts`) cho mỗi câu hỏi:
1. query `papers` (status=indexed, group scope),
2. **loop `await paper.ref.collection('chunks').get()` từng paper**,
3. gom **toàn bộ** chunk vào RAM, BM25 `encoder.score(query, allTexts)` trên tất cả,
4. sort, cắt topK.

Ở quy mô cap 1000 paper (~52k chunk):
- ~1001 Firestore round-trip / query,
- ~52k chunk doc đọc + nạp RAM / query,
- BM25 score 52k text / query.
→ timeout + chi phí Firestore reads + áp lực bộ nhớ. Đây là **O(corpus) mỗi query**.

`getBM25ForTenant` còn refit BM25 từ corpus mỗi cold start (Vercel recycle 5-15′),
nên hầu hết request đi cold path.

**ADR-033 đã vạch Phase 2 (collectionGroup) + Phase 3 T-6 (tự xây inverted index).**
Phase 2 gộp round-trip (1001→1) nhưng **vẫn O(corpus)** về RAM/CPU (load + score 52k).
T-6 chữa hết nhưng = tự dựng một search engine (inverted index, posting list, refit
cron) — nặng và trùng chức năng hạ tầng đã mua.

## 2. Kỹ thuật mới (Pinecone 2024–2025, đã tra cứu)

Pinecone nay hỗ trợ **sparse-only index** (public preview, mọi user): index + truy
hồi trực tiếp sparse vectors, hỗ trợ **BM25** và learned sparse `pinecone-sparse-
english-v0`, chạy trên serverless LSM scale động (benchmark vượt Elasticsearch/
OpenSearch trên 8.9M vector). Encode 2 cách: Pinecone Inference (gửi text) hoặc
`pinecone_text` BM25/SPLADE chạy local rồi chỉ gửi vector (nếu lo privacy).

Tức **keyword search chạy trong Pinecone**, không cần quét Firestore — đúng thứ cần.

## 3. Quyết định

**Chuyển nhánh keyword retrieval từ in-app BM25 (Firestore scan-all) sang Pinecone
sparse vectors.** Giữ nguyên kiến trúc cascade hiện có: `[dense, sparse] → RRF →
Voyage rerank`.

### 3.1 Vì sao hơn ADR-033 Phase 2/3

| | ADR-033 P2 (collectionGroup) + P3 T-6 (tự inverted index) | **ADR-046 (Pinecone sparse)** |
|---|---|---|
| Round-trip/query | 1 | 1 |
| RAM/CPU mỗi query | O(corpus) — load+score 52k | O(log n) managed |
| Bền 1000 paper | cần tự xây + bảo trì inverted index | Pinecone serverless lo |
| Công sức | migration + dựng search engine | upsert sparse + đổi 1 hàm retrieve |
| Trùng hạ tầng đã mua | có (tự làm việc Pinecone đã làm) | không |

### 3.2 Encoder — chọn (a) BM25Encoder (quyết định)

- **(a) `pinecone_text` BM25Encoder** — tokenization ngôn ngữ-agnostic, giữ đúng
  hành vi BM25 hiện tại (ít regression), hoạt động với **query tiếng Việt** lẫn
  paper tiếng Anh. **CHỌN.**
- (b) `pinecone-sparse-english-v0` — chất lượng EN cao hơn nhưng **chỉ tiếng Anh**;
  query VN sẽ kém. Loại vì lab giao tiếp tiếng Việt (query có thể VN).

Phần cross-lingual (query VN ↔ nội dung EN) vẫn do **dense Voyage 3-large (đa ngôn
ngữ)** đảm nhiệm như hiện tại; sparse lo exact-keyword. Hai nhánh bổ trợ, đúng vai.

### 3.3 Index layout — hai index riêng (dense + sparse)

Pinecone khuyến nghị: khi cần rerank độc lập và quản lý riêng, dùng **2 index**
(1 dense `labyra-papers` đang có + 1 sparse mới `labyra-papers-sparse`) thay vì 1
index lẫn 2 loại (score range dense [-1,1] vs sparse unbounded không tự hoà giải,
sparse sẽ át). Hai index → query song song → **RRF (`reciprocalRankFusion` đã có)**
hoà hạng theo rank (không phụ thuộc thang điểm) → Voyage rerank. Tái dùng RRF tránh
luôn vấn đề normalize điểm.

### 3.4 Thay đổi tối thiểu (tái dùng pipeline)

- **Worker (index step):** khi upsert dense vector cho chunk, encode + upsert thêm
  sparse vector vào index sparse (cùng id `{paperId}-{idx}`, cùng metadata để filter).
- **App `search.ts`:** thay `retrieveBM25` (Firestore scan) bằng `retrieveSparse`
  (Pinecone sparse query, có `filter` + group scope như dense). RRF + rerank + phần
  còn lại **giữ nguyên**. `getBM25ForTenant`/`bm25-manager` (refit corpus) **bỏ**.
- **`pineconeQuery` đã có `filter`** → group scope + metadata pre-filter dùng lại.

## 4. Hệ quả

**Tích cực:** loại O(corpus)/query → bền tới 1000+ paper; bỏ N+1 + refit BM25 +
Firestore chunk reads/query; managed (không tự bảo trì inverted index); RRF+rerank
tái dùng; pre-filter domain/year sẵn sàng (`filter`).

**Đánh đổi / rủi ro:**
- Sparse index = thêm storage + write cost (mỗi chunk thêm 1 sparse vector) + query
  cost. Bù lại: bỏ Firestore chunk reads/query (đang tốn N reads). **Phải đo cost
  thực** trước khi cam kết toàn bộ corpus.
- Sparse index đang **public preview** — đọc limitations, test kỹ trước prod.
- Cần **reprocess** để upsert sparse cho corpus hiện có (idempotent theo id; như các
  reprocess trước).
- BM25Encoder cần "fit" idf trên corpus để có trọng số tốt — xác định nơi fit
  (1 lần, lưu state) thay vì refit/query. (Chi tiết ở mục 6.)

## 5. Lộ trình (ngưỡng rõ — đo trước, không làm hết một lúc)

```
Nhịp 1 (DONE — R237bq): T-4 fail-soft — retrieveBM25 timeout 5s → vector-only.
  + đọc T-7 search_timing log xác nhận bm25_retrieve là P95.   ← bảo vệ tức thời
   ↓ (kích hoạt khi: T-7 xác nhận BM25 là bottleneck, HOẶC tenant tiến gần >50-100 paper)
Nhịp 2 (ADR-046 này): migrate sparse — worker upsert sparse + app retrieveSparse.
   ↓ (khi corpus lớn / đo cần)
Nhịp 3: metadata pre-filter (domain/year) trong query Pinecone (filter đã có).
```

## 6. Living Notes / việc cần làm khi triển khai nhịp 2

- **Đo trước (bắt buộc):** P95 `bm25_retrieve` từ T-7 log; ước cost sparse (storage
  + query) cho 52k vector × 1000 user.
- **BM25 fit:** quyết nơi fit idf (worker batch khi index? hay 1 cron?) + lưu state;
  hoặc dùng `pinecone-sparse-english-v0` cho phần EN nếu đo thấy BM25 fit phiền (đổi
  lại mất query-VN — cân nhắc khi có số).
- **Migration:** reprocess upsert sparse; verify count sparse == count dense.
- **Rollback:** giữ `retrieveBM25` sau cờ `KEYWORD_BACKEND=bm25|sparse` để lật về
  Firestore nếu sparse có vấn đề (như ADR-018 `PAPER_QUEUE_BACKEND`).
- **Doc khoa học:** cập nhật `docs/scientific-methods/` mục retrieval (RRF, hybrid,
  sparse encoder, ngưỡng).
- **License:** Pinecone (đã trả tiền); `pinecone_text` Apache-2.0. Không vendor mới.

*Document version 1.0 — Proposed. Next: duyệt + số liệu T-7 → chuyển Accepted, lên lịch nhịp 2.*
