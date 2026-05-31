# Labyra — Session Handoff R237br → R237cp

**Phiên:** Chất lượng DOI/citation + phân loại OpenAlex + dashboard thư viện + báo cáo chi phí + redesign panel Citation + lọc theo nhà xuất bản/Open-Access
**Ngày:** 2026-05-29 → 2026-05-30
**Trạng thái cuối:** mọi patch app tsc 0 / oxlint 0 / build green; worker AST OK + pytest pass (6 test mới R237co + 36 cũ). Docs đã đồng bộ. **Chưa deploy / chưa reprocess** (việc của nAM, xem §2).

---

## 1. ĐÃ SHIP (theo round)

### Chất lượng DOI (worker)
- **R237br** — NFC normalize cho KaTeX + title (combining mark làm vỡ `no-misleading-character-class`).
- **R237cc/cd** — **verify** DOI bài chính với Crossref/OpenAlex; UI cảnh báo "unverified" khi không xác nhận được.
- **R237cg** — **reverse DOI lookup**: khi PDF không có DOI, query Crossref `query.bibliographic` (title + first-author + year), chỉ nhận candidate nếu title token-set Jaccard ≥ 0.70 (DOI sai tệ hơn không có). Phục hồi review surfactant → `10.1039/d0nr07339c`. Coverage DOI non-book = 25/25.

### Phân loại OpenAlex (app + worker)
- **R237bz/ca/cb** — field từ OpenAlex `primary_topic` → `PaperDomainBadge` (authoritative) + filter field trên thư viện; ưu tiên hơn domain đoán bởi Gemini (taxonomy Gemini R178-3 giữ làm fallback).

### Chuẩn hoá nhà xuất bản (app)
- **R237ch/ck** — `normalizePublisher()` trong `journal-stats.ts`: bỏ tag tổ chức trong ngoặc ("(ACS)"), hậu tố pháp lý (BV/Ltd/GmbH/Press…), + alias map (mọi biến thể Springer → "Springer Nature"). Display-only, không reprocess. Thư viện thật gom: 13 Springer Nature, 4 ACS, 2 Elsevier, 2 RSC, 1 Wiley, 1 Beilstein.

### Dashboard Overview thư viện (app)
- **R237cl** — `papers-landscape.tsx`: toggle "List | Overview"; stat tiles (papers/fields/publishers/year-span) + pie field OpenAlex + bar publisher + histogram năm (recharts + shadcn `ChartContainer`, 0 call OpenAlex/Firestore thêm).
- **R237cm** — click pie field / bar publisher → set filter thư viện (`openalexFields` / `publishers`) + chuyển sang list, chip quick-filter gỡ được.

### Pricing + tier (app + worker)
- **R237ci** — giá re-verify anthropic.com 2026-05-30 (không đổi số): Opus 4.8/4.7 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5; cache-read giảm 90%; Opus tokenizer +35%. Thêm PRICING entry `claude-opus-4-8`. (Opus 4.8 fast-mode $10/$50 KHÔNG model.)
- **R237cj** — Tier-5 đổi `claude-opus-4-7` → `claude-opus-4-8` (cùng giá, mạnh hơn). Giữ entry 4.7 cho cost row lịch sử. ADR-019.

### Redesign panel Citation + lọc (app + worker)
- **R237cn** — bỏ collapse toàn section; mỗi ref hiện **tên bài** (clamp 2 dòng) + 1 dòng "tác-giả-1 et al · năm · tạp chí"; KHÔNG hiện DOI dạng text và KHÔNG đưa DOI qua `formatSciNode` (fix subscript "s43586"); bỏ DOI của chính paper khỏi danh sách ref; nút thu/thả lên header REFERENCES; ô ref ≈ ⅓ chiều cao cũ. Shadow tab active → `.edge-tab-active` CSS dùng `color-mix(--foreground …)` (đúng dark mode, trước hardcode đen).
- **R237co** (worker) — citation lưu `targetPublisher` + `targetIsOpenAccess`. Crossref → publisher; **OpenAlex → `open_access.is_oa`** (+ publisher). Vì nhánh chính Crossref-`reference[]` không có 2 field, dùng **1 call OpenAlex batch** (`filter=doi:A|B|…`, ~50 DOI/call, free) fill cả 2 nhánh; `create_citation` backfill khi reprocess. Doc: `scientific-methods/citation-matching.md`.
- **R237cp** (app) — filter Citation = toggle **Open Access** + multi-select **nhà xuất bản** (thay chips confidence). Chỉ hiện sau khi reprocess đã có data publisher/OA (ẩn trước đó để tránh filter rỗng).

---

## 2. CHƯA LÀM (việc nAM — theo thứ tự)

### A. Deploy (bắt buộc — patch mới chưa lên repo)
1. **App** — apply `r237-FULL-SYNC.zip` **một lần** (đã gộp toàn bộ state app mới nhất: landscape, filter, pricing, T5→Opus4.8, citation redesign + type + 4 docs) → commit → push (Vercel auto).
2. **Worker** — apply `r237cg` (reverse DOI) + `r237co` (citation OA) → `git push && ./deploy.sh` (Cloud Run resolve secret lúc khởi động — **push không phải deploy**).
3. **Docs** — `r237-docs.zip` (app 4 file + worker 1 file) nếu chưa nằm trong full-sync.

### B. Reprocess (sau khi worker deploy)
- `cd ~/LAB-MANAGER/labyra-app && node scripts/reprocess-all.mjs` — backfill `targetPublisher` + `targetIsOpenAccess`. **Filter R237cp chỉ hiện sau bước này.**
- Kiểm: one-liner đếm citation có publisher/OA (đã đưa trong chat).

### C. Xoá paper lỗi
- "Water Electrolysis" (`944db906c7e6cada1dc2267370e37469`) — PDF hỏng, hard-delete (Firestore doc + Storage + citations + annotations; không có Pinecone vì còn queued). Total về 25.

### D. Backlog (chưa bắt đầu — chọn cho phiên sau)
- **Citation network / related works** (ADR-017): OpenAlex `related_works` + `cited_by` → gợi ý paper tương tự + graph. Lớn, cần design pass.
- **AI Science** (ADR-041) v0: route mỏng trên T4 Writer + `searchPapers` RAG (trợ lý viết paper).
- **Spectra worker R220+**: PEC Mott-Schottky, chopped chronoamperometry, GCD, Figure Builder.
- **Tab Edge UI**: shadow đã token-hoá (R237cn) nhưng "pop" kiểu Edge chưa xong — cần CSS computed thật từ tab Edge. Drag dnd-kit (reorder + in/out group) chưa làm.
- Optional: theo dõi cost pipeline Gemini (giá trị thấp, Flash rẻ) + sổ cost in-app (ADR).

### E. Treo có chủ đích
- **Security debt B** (`costUsd` trong client snapshot → chuyển sang `papers/{id}/private/cost` admin-only). Chờ nAM yêu cầu. BLOCKER trước SaaS.

---

## 3. Trạng thái các report

| Report (script) | Đã chạy? | Kết quả |
|---|---|---|
| `report-status.mjs` | ✅ xong | Snapshot Papers: total 26 (1 book), 24 indexed / 2 queued, DOI 25/25 với-DOI (23 verified), OpenAlex field 23/25, Gemini domain 17/25, citations 2402, publisher gom đúng |
| `report-cost.mjs` | ✅ xong | OCR (Mistral) $0.80, Embedding (Voyage) $0.23, **Enrichment $0** (ENABLE_ENRICHMENT=false, cố ý), TOTAL ~$1.04. Đắt nhất = sách "Infrared and Raman Spectroscopy" $0.92 (nhiều trang OCR, lệch trung bình) |
| `anthropic-cost.mjs` | ✅ xong | `cost_report` rỗng mọi ngày → đang dùng credit free/trial, Claude ≈ $0. `usage_report` chỉ thấy `claude-haiku-4-5`, vài nghìn token/ngày (đúng: Haiku dùng cho on-topic grounding + metadata/enrich app-side, ngoài 6-tier) |

**Chưa đo (không nằm trong report nào):** chi phí pipeline Gemini (classify chỉ ghi `_classifyDebug.costUsd`, metadata/references không tính cost), AI tương tác (Ask-AI/search/translate per-session), spectra worker. Cost Gemini lấy qua GCP Console → Billing → filter "Generative Language API" (không có one-liner terminal sạch). Giá trị thấp vì toàn model rẻ.

---

## Bất biến nhắc lại
- Worker `git push` ≠ deploy → **luôn `./deploy.sh`**; app auto-deploy; hard-refresh Ctrl+Shift+R.
- Trust > Coverage; deterministic trước LLM; agent/LLM **không bao giờ bịa DOI**.
- 6-tier: T0/T1 gemini-3.1-flash-lite, T2 gemini-3-flash, T3/T4 sonnet-4-6, **T5 = opus-4-8**. Haiku 4.5 ngoài tier (grounding + metadata/enrich).
- Citation Firestore `tenants/{tid}/citations/{id}`; field += `targetPublisher` / `targetIsOpenAccess` (R237co).
- OpenAlex: key qua `?api_key=`; DOI singleton + `filter=doi:A|B|…` batch đều FREE (không tốn daily cap).
- Utility `.mjs` để trong `scripts/` (root `.mjs` bị lint → no-console fail).
- Patch filename kèm round; lưu `/mnt/d/labbook-patches/`.
