# Labyra — Chiến lược Translation & PDF Conversion

> **Phiên bản:** R262 · 6/2026 (đối chiếu hiện trạng) — bản nháp gốc 5/2026
> **Phạm vi:** PDF → Word/LaTeX · Pre-translate theo lớp · Chặn dịch ngôn ngữ trùng
> **Phương châm áp dụng:** Trust > Coverage, đi chậm mà chắc, dùng cái đã có

---

## Mục lục

0. [Hiện trạng (cập nhật R262 · 6/2026)](#0-hiện-trạng-cập-nhật-r262--62026)
1. [Chiến lược chuyển đổi PDF → Word/LaTeX](#1-chiến-lược-chuyển-đổi-pdf--wordlatex)
2. [Chiến lược Pre-translate theo lớp](#2-chiến-lược-pre-translate-theo-lớp)
3. [Xử lý triệt để dịch ngôn ngữ trùng (en→en)](#3-xử-lý-triệt-để-dịch-ngôn-ngữ-trùng-enen)
4. [Lộ trình triển khai tổng hợp](#4-lộ-trình-triển-khai-tổng-hợp)

---

## 0. Hiện trạng (cập nhật R262 · 6/2026)

Phần này đối chiếu chiến lược bên dưới với những gì **đã ship** tính tới R262, để doc còn dùng được thay vì kế hoạch suông. §1–§4 giữ nguyên làm định hướng; bảng dưới là điểm xuất phát thực tế.

### 0.1 Đã ship

| Hạng mục | Trạng thái | Vị trí code / ADR |
|---|---|---|
| OCR engine **Datalab Marker** (hosted, async poll) + fallback Mistral | ✅ prod (R221) | worker `src/papers/ocr.py` + `ocr_datalab.py`; ADR-048 (engine-agnostic) |
| Dịch on-demand vùng chọn (Tier 2, Gemini Flash) | ✅ | `src/app/api/papers/[id]/translate/route.ts` |
| Bảo vệ citation/cross-ref khi dịch (mask ⟦Cn⟧, localize "Figure→Hình") | ✅ Tier 1a | `citation-protect.ts`; ADR-045 |
| Domain glossary EN→VI (điện hóa / phổ) inject vào prompt | ✅ Tier 2 | `translation-glossary.ts`; ADR-045 |
| Translation memory (Firestore, key SHA256(lang+source)) | ✅ tầng server | `src/lib/ai/rag/translation-memory.ts` |
| Cost guard + telemetry theo feature `translate` | ✅ | trong translate route |
| Thư viện phát hiện ngôn ngữ **franc-min** (MIT) | ✅ đã là dependency | dùng sẵn ở `hybrid-tokenizer.ts` |

### 0.2 Chưa làm (theo thứ tự ưu tiên)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| **en→en short-circuit** (§3) | ❌ — **nên làm trước** | ROI cao nhất: 0 token + tức thì cho mọi dịch trùng ngôn ngữ |
| Field `paper.language` trong metadata step (worker) | ❌ | Tiền đề cho Tầng 3 (rẻ nhất, bắt ~99% case) |
| Pre-translate Lớp 1 (abstract/conclusion/captions/headings) | ❌ | §2.3; thêm step vào pipeline async |
| Glossary đa lớp (tenant/paper) + ngôn ngữ ngoài VI | ⏳ một phần | hiện chỉ domain-VI; mở rộng dần |
| Do-not-translate cho công thức / danh pháp / tên riêng | ⏳ một phần | citation-protect mới bọc ref; công thức/nomenclature chưa |
| Cache client (LRU + IndexedDB) | ⏳ một phần | mới có TM Firestore; thêm tầng client |
| Pre-translate Lớp 2/3; PDF → DOCX/LaTeX (output AI Science) | ❌ | trung hạn, sau khi đo |

### 0.3 Quyết định chốt (cập nhật so với bản nháp)

- **Thư viện detect ngôn ngữ = `franc-min` (MIT), KHÔNG thêm Lingua.** franc-min đã là dependency (dùng cho sparse retrieval). Dùng lại cho cả Tầng 1 (client) lẫn Tầng 2 (server) của en→en. Chỉ cân nhắc `lingua-py` (Apache) nếu sau này độ chính xác trên text ngắn/mixed không đạt — và phải kiểm license trước khi thêm. *(Phương châm: dùng cái đã có — điều chỉnh so với gợi ý "Lingua làm T2-primary" trước đây, vì franc-min đã sẵn.)*
- **OCR cho RAG đã giải quyết** bằng Datalab Marker (markdown + paginate). §1 (PDF → DOCX/LaTeX có công thức, font MATH, pandoc) **chỉ còn cần cho output AI Science** (manuscript gen) — KHÁC với OCR-cho-RAG, đừng gộp hai việc làm một.
- **Translation quality đã có nền** (ADR-045: citation-protect + glossary). ADR mới cần viết: (a) en→en identity short-circuit, (b) pre-translate scope. Phần cache có thể gộp vào ADR-045 khi thêm tầng client.

### 0.4 Bước kế đề xuất (gói gọn 1 round patch)

en→en short-circuit — không thêm dependency, không refactor:

1. **Worker metadata step:** lưu `paper.language` (đa số = `"en"`) bằng franc-min trên fullText → phục vụ Tầng 3.
2. **Route `translate`:** thêm guard đầu hàm — nếu `paper.language == targetLang` → trả identity (0 token); nếu chưa có metadata → franc-min trên `text` (Tầng 2, chỉ khi `text.length > 10`).
3. **UI:** panel hiện "Văn bản đã ở <ngôn ngữ>, không cần dịch" + dropdown đổi target language.
4. **Eval L8:** thêm metric "en→en không gọi API = 100%".

---

## 1. Chiến lược chuyển đổi PDF → Word/LaTeX

### 1.1 Bối cảnh & vấn đề

PDF là format trình bày cuối, không thiết kế để edit. Chuyển PDF → Word/LaTeX không bao giờ là chuyển đổi không mất mát, đặc biệt với paper khoa học chứa nhiều công thức, bảng, multi-column.

Hai use case khác nhau cho Labyra:

- **Use case 1 — Input cho RAG/Q&A**: paper user upload làm knowledge base. Cần text + structure để chunk + embed. *Không cần Word/LaTeX editable.*
- **Use case 2 — Input cho AI Science**: paper tham khảo cho AI viết manuscript. Cần extract công thức + structure chính xác để AI có nguyên liệu chất lượng.

### 1.2 So sánh các công cụ

| Công cụ | License | Chi phí | Chất lượng công thức | Maintenance | Phù hợp |
|---|---|---|---|---|---|
| **Mathpix API** | Trả phí | ~$0.005/trang PDF ($5/1k trang) | Cao nhất | Thấp (API) | Test nhanh, scale nhỏ |
| **Nougat (Meta)** | Open source | Compute GPU ~$30-100/tháng | Khá tốt | Cao (self-host) | Workload lớn |
| **Marker** | Open source | Compute ~$15-50/tháng | Khá tốt | Trung | **Cân bằng tốt nhất** |
| **GROBID** | Open source | Compute thấp ~$5-15 | Yếu công thức | Thấp | Metadata + references |
| **pdf2docx (Python)** | MIT | Free | Không xử lý công thức | Thấp | Word đơn giản |
| **Vision LLM (GPT-4o/Claude)** | API call | Đắt theo vision tokens | Tốt nhưng không deterministic | Trung | Trường hợp đặc biệt |

### 1.3 Pipeline lai (đa stage) — hướng đúng cho Labyra

Không có công cụ đơn lẻ trị mọi thứ. Pipeline tốt kết hợp nhiều giai đoạn chuyên trách:

```
PDF input
  ↓
[1] Layout detection → vùng: text / công thức / bảng / figure
  ↓
[2] Text extraction (text layer hoặc OCR)
  ↓
[3] Math extraction (chỉ chạy trên vùng công thức)
  ↓
[4] Table extraction (camelot / tabula)
  ↓
[5] Figure extraction (cắt ảnh + caption)
  ↓
[6] Reference parsing (GROBID hoặc anystyle)
  ↓
[7] Tổng hợp thành nguồn trung gian (Markdown mở rộng / JSON)
  ↓
[8] Pandoc → DOCX / LaTeX / HTML
```

### 1.4 Vấn đề font cho Word output

Word equation bắt buộc dùng font có **MATH table**. Times New Roman không có → không gán trực tiếp được. Giải pháp:

- **Font Times-like có MATH table:** STIX Two Math, XITS Math, TeX Gyre Termes Math.
- **Embed font vào file** để user mở ở máy chưa cài vẫn đúng (STIX OFL license cho phép embed).
- **Text thường** dùng Times New Roman bình thường.

#### Cách tự động hóa ở backend (đúng cho SaaS)

```
AI Science gen manuscript
  ↓
Nguồn trung gian (Markdown + LaTeX công thức + CSL-JSON citation)
  ↓
Pandoc làm trung tâm chuyển đổi:
  ├─→ LaTeX (template tạp chí + newtxmath/stix2)
  ├─→ DOCX (reference template STIX Two Math + embed font)
  ├─→ PDF (qua LaTeX, chuẩn xuất bản)
  └─→ HTML (preview trong app)
```

**Pandoc làm trung tâm** vì nhận một nguồn, xuất mọi format, xử lý công thức (LaTeX → OMML) + citation (CSL-JSON → format tạp chí) tự động. CSL-JSON đã là citation interchange của Labyra → khớp tự nhiên.

### 1.5 Đề xuất chiến lược cho Labyra

**Giai đoạn 1 — Đo trước, đừng thêm tool (1-2 tuần)**

Trước khi commit Marker hay tool nào:

1. Chọn 20 paper đại diện (FTIR, Raman, XRD, electrochemistry, perovskite).
2. Audit chất lượng extraction (hiện tại OCR = **Datalab Marker**, R221) trên 20 paper đó.
3. Đo bằng Ragas (L8): faithfulness, context-precision cho câu hỏi về công thức/bảng/methods.

**Quyết định:**
- Pipeline cũ đủ tốt → giữ nguyên, không thêm tool. Dồn sức vào RAG Q&A + AI Science v0.
- Pipeline cũ thiếu rõ cho công thức/bảng → sang Giai đoạn 2.

**Giai đoạn 2 — Tích hợp Marker như stage tùy chọn (2-3 tuần)**

Nguyên tắc thiết kế:

- **Marker là path bổ sung**, không thay OCR cũ.
- **Routing tự động** theo metadata: paper math-heavy → Marker, paper review → OCR cũ.
- **Marker chạy on-demand, không min-instance GPU.**
- **Fallback** về OCR cũ nếu Marker fail.
- **Cache output Marker** trong Firestore/GCS, reprocess chỉ khi cần.
- **Schema chung** cho output: cả OCR cũ lẫn Marker trả về cùng format.

**Cost guardrail:**
- Per-paper Marker run < ngưỡng $/paper.
- Daily quota tổng cho Marker job — vượt → fallback OCR cũ.
- Cost attribution riêng cho feature `paper_marker_extraction`.

**Giai đoạn 3 — Output AI Science (manuscript gen)**

Tách hoàn toàn khỏi input extraction. Sinh **mới** dưới dạng nguồn trung gian:

```
Input side (paper tham khảo):           Output side (AI viết manuscript):
PDF → Marker/OCR → structured           AI Science → nguồn trung gian
                ↓                                       ↓
            chunk + embed                         pandoc → LaTeX/DOCX/PDF
                ↓                                       ↓
            Pinecone (RAG)                         File cho user/tạp chí
                ↓
        AI Science đọc làm tham khảo ← (kết nối ở đây)
```

### 1.6 Cảnh báo & nguyên tắc

- **Chuyển đổi PDF → editable không bao giờ 100% chính xác.** Bất kỳ feature nào cũng phải có bước user xác nhận + sửa.
- **Không phụ thuộc dịch vụ trả phí bên thứ ba cho data sensitive.** Marker self-host là lựa chọn an toàn cho multi-tenant.
- **Không đầu tư self-host vội.** Mathpix API có pay-as-you-go + credit $29 để test giả định trước.
- **Đừng triển khai Marker chỉ vì "open source và tốt".** Test trên paper thật của domain user (XRD/FTIR/Raman) trước khi commit pipeline mới.

---

## 2. Chiến lược Pre-translate theo lớp

### 2.1 Vấn đề: dịch on-demand thuần tốn token & cảm giác chậm

Mỗi lần Ctrl+drag = 1 API call ~vài giây + tốn token. User kéo vài chục lần là bay quota. Cần pre-translate thông minh để vừa nhanh vừa tiết kiệm.

### 2.2 Insight về pattern đọc paper khoa học

Researcher KHÔNG đọc paper tuần tự đầu-cuối. Pattern "skim-to-deep" chuẩn:

1. **Abstract** — gating quyết định "đáng đọc tiếp không"
2. **Conclusion** — xem kết quả + tuyên bố chính
3. **Figures + captions** — skim trực quan, hiểu kết quả nhanh
4. **Introduction** — context + motivation
5. **Methods** — nếu vẫn quan tâm, để đánh giá độ tin cậy
6. **Results / Discussion** — chi tiết cuối cùng
7. **References** — chỉ tra cứu, không đọc tuần tự

Pre-translate phải phục vụ đúng pattern này, không dịch tuần tự bừa.

### 2.3 Kiến trúc 3 lớp

#### Lớp 1 — Pre-translate khi upload (luôn dịch, rất rẻ)

Worker dịch sẵn các phần researcher chắc chắn đọc đầu tiên:

- **Abstract** (luôn)
- **Conclusion / Conclusions** (luôn)
- **Figure captions + table captions** (luôn — skim figures là bước 3)
- **Section headings** (toàn paper)
- **Highlights** (nếu paper có)

**Chi phí:** ~10-15% nội dung paper, ~$0.005-0.01/paper với Gemini Flash-Lite.

**Schema lưu:**
```
translations/{paperId}/{lang}/abstract
translations/{paperId}/{lang}/conclusion
translations/{paperId}/{lang}/figure_captions/{figId}
translations/{paperId}/{lang}/section_headings
translations/{paperId}/{lang}/highlights
```

**Tích hợp vào worker:** thêm step 6 vào pipeline async hiện tại

```
1. OCR (Mistral/Chandra)
2. Metadata extract (Gemini Flash + Crossref/OpenAlex)
3. Domain classification (taxonomy 36-cat)
4. Citation extract
5. Chunk + embed (Voyage) + Pinecone
6. [MỚI] Pre-translate Lớp 1 (Gemini Flash-Lite)
```

Thêm ~3-5s vào pipeline (16s → 19-21s). Async nên không block UI.

#### Lớp 2 — Pre-translate khi user "engage" (có signal thật)

Trigger pre-translate phần sâu hơn khi user chứng tỏ quan tâm thật:

**Trigger:**
- Time-on-paper > 30s sau khi mở
- Scroll past abstract (vào Introduction)
- Click vào section trong outline sidebar → trigger cho section đó + trước/sau
- Bookmark / lưu paper → mạnh tay, trigger cả Methods + Discussion
- Ctrl+drag dịch lần đầu → trigger ngay

**Dịch:**
- Introduction (bước 4 trong pattern)
- Methods (bước 5)

Chỉ chạy với paper "active", không dịch bừa cho mọi paper upload.

#### Lớp 3 — On-demand + Predictive

- **On-demand qua Ctrl+drag**: cache content-hash. Lần kéo lại = hit cache, tức thì.
- **Predictive khi đang đọc**: user đang ở trang X → ngầm dịch trang X+1 (client-side prefetch idle time). Khi sang trang đó → đã sẵn.

### 2.4 Ràng buộc loại trừ — KHÔNG pre-translate

Quan trọng: không phải document nào cũng nên pre-translate.

**Loại trừ rõ:**
- `documentType == "book"` — quá dài, pattern khác (đọc nhảy chapter)
- `documentType == "thesis" | "dissertation"` — dài, pattern đọc khác paper
- `documentType == "presentation"` — pattern khác

**Safety net theo kích thước:**
- `pages > 50` → skip
- `total_chars > 200_000` → skip

**Lý do:**
- Sách 300-500 trang × 4000 char = 1.2-2M ký tự, dịch hết tốn ~$1-3/cuốn.
- Tỷ lệ user đọc cả sách rất thấp (đa số chỉ tham khảo 1-2 chapter).
- Pre-translate hết = waste 80-90% token.
- Sách không có "phần ai cũng đọc đầu tiên" như abstract của paper.

**Code thực tế:**

```python
def should_pretranslate(document_type, num_pages, total_chars):
    # Loại trừ rõ
    if document_type in {"book", "thesis", "dissertation", "monograph"}:
        return False
    if document_type == "presentation":
        return False

    # Safety net
    if num_pages > 50:
        return False
    if total_chars > 200_000:
        return False

    # Còn lại: article, review, perspective, conference paper
    return True
```

**UI cho document bị loại trừ:**
> "Tài liệu dài, dịch theo vùng chọn (Ctrl+drag)"

Minh bạch hành vi → tăng trust. Sách vẫn dịch được on-demand, chỉ không pre.

### 2.5 Cấu hình ngôn ngữ đích

**Tenant config khai báo `default_language`** khi onboard → worker biết chính xác dịch sang gì.

- 1 ngôn ngữ đích/tenant cho hầu hết case → không nhân chi phí.
- User cá nhân muốn ngôn ngữ khác → on-demand (Lớp 3), không pre.

### 2.6 Cost ước lượng

Với 1000 paper upload/tháng:

| Lớp | Chi phí | Coverage |
|---|---|---|
| Lớp 1 (mọi paper qua filter) | ~$5-10/tháng | 100% paper được pretranslate phần value cao |
| Lớp 2 (engagement-triggered) | ~$10-15/tháng | ~30% paper active |
| Lớp 3 (on-demand + predictive) | đo trên usage thực | Phần body chi tiết |

**Tổng pre-translate: ~$15-25 / 1000 paper / tháng.** Trong cost guard không đáng kể.

So sánh với dịch toàn body khi upload: ~$50-80/1000 paper × 70% waste = $35-55 phí phạm. Tránh được.

### 2.7 Engagement signal schema

Để Lớp 2 hoạt động, track signal user-side:

```
papers/{paperId}/user_engagement/{userId}:
  time_spent_seconds
  sections_viewed: [...]
  scrolls_count
  ctrl_drag_translate_count
  last_active_at
```

Threshold reach → trigger pre-translate job qua API. Có quota daily để tránh runaway cost.

### 2.8 Document quyết định

Đáng ghi vào ADR (kiểu ADR-044):
> "Pre-translate scope: chỉ article-type documents (article, review, perspective, conference paper, letter). Loại trừ book/thesis/dissertation. Safety net: pages > 50 hoặc chars > 200k. Lý do: pattern đọc khác, cost không hợp."

---

## 3. Xử lý triệt để dịch ngôn ngữ trùng (en→en)

### 3.1 Vấn đề

Khi target_lang == source_lang (vd. paper EN, tenant EN), API vẫn được gọi và tốn vài giây + token, trong khi việc cần làm chỉ là **trả về chính text đó**. Đây là token waste và UX chậm không cần thiết.

### 3.2 Chiến lược 3 tầng — chặn triệt để

**Không bao giờ nên gọi API cho case này.** Defense in depth qua 3 tầng:

#### Tầng 1 — Detect tại client trước khi gửi request

Khi user trigger dịch, client biết `targetLang` (tenant config / user preference). Detect `sourceLang` bằng `franc-min` (MIT, đã là dependency của repo) chạy client-side.

```js
async function translateSelection(text, targetLang) {
  // T1: detect client-side
  if (text.length > 10) {
    const detected = detectLanguageClient(text);
    if (detected === targetLang) {
      return { result: text, source: "identity", tokens: 0 };
    }
  }

  // Không trùng → gọi API
  return await api.translate({ text, targetLang });
}
```

Không gọi API, không gọi worker, không tốn token. Phát hiện sai một chút cũng không sao — vẫn fallback xuống Tầng 2.

#### Tầng 2 — Detect tại worker/endpoint (defense in depth)

Phòng trường hợp client miss (text quá ngắn, mixed language):

```python
def translate(text, target_lang, source_lang=None):
    # Auto-detect nếu chưa biết
    if not source_lang:
        source_lang = detect_language(text)  # langdetect / fasttext / lingua-py

    if source_lang == target_lang:
        return {
            "translation": text,
            "source": "identity",
            "tokens_used": 0
        }

    # ... gọi model dịch thật
```

Server-side dùng lại `franc-min` (đồng bộ với client) — rẻ, nhanh (~ms), không tốn token. *(Lingua-py/Apache chỉ khi cần chính xác hơn trên text ngắn/mixed.)*

#### Tầng 3 — Metadata paper lưu sẵn ngôn ngữ

Khi worker xử lý paper (metadata extract step), lưu luôn `paper.language`. Hầu hết paper khoa học là EN. Cho tenant `default_language=EN`, mọi vùng chọn từ paper EN → biết ngay không cần dịch trước cả khi user trigger.

```python
@app.post("/translate")
async def translate(req: TranslateRequest):
    # T3: check paper metadata (rẻ nhất)
    if req.paper_id:
        paper = get_paper(req.paper_id)
        if paper.language == req.target_lang:
            return identity_response(req.text)

    # T2: detect server-side
    source = detect_language(req.text)
    if source == req.target_lang:
        return identity_response(req.text)

    # Thật sự dịch
    return await llm_translate(req.text, req.target_lang)
```

### 3.3 Hiệu quả ước tính

- **Tầng 3** bắt ~99% case en→en (paper EN, tenant EN — phần lớn use case).
- **Tầng 1 + 2** bắt nốt edge case (mixed language, text ngắn, paper không có metadata language).
- Kết quả: 0 token cho mọi dịch trùng ngôn ngữ, response ~ms thay vì vài giây.

### 3.4 UX khi phát hiện same language

Đừng để user thấy "không gì xảy ra". Hiển thị explicit:

```
[Tiếng Anh ▾]                              ← chip ngôn ngữ đích
✓ Văn bản đã ở tiếng Anh, không cần dịch
[hiển thị nguyên text]
```

Hoặc đơn giản: panel hiện ngay text gốc với note "Same language detected". User hiểu nhanh thay vì tưởng app lỗi.

**Bonus:** cho dropdown đổi target language ngay tại panel — user click "Tiếng Việt" → dịch lần đầu cho selection đó, từ giờ cache lại.

### 3.5 Ràng buộc kỹ thuật

- Language detection client-side chỉ chạy khi `text.length > 10` (text quá ngắn detect không đáng tin).
- Server-side luôn check lại, không tin client mù.
- Cache identity response trong client state (tuy không tốn API nhưng tránh re-detect cho cùng text).

---

## 4. Lộ trình triển khai tổng hợp

### 4.1 Ưu tiên theo phương châm "chậm mà chắc"

#### Ngay (round patch nhỏ — 1-2 ngày mỗi cái)

1. **Fix bug en→en triệt để** (3 tầng):
   - Dùng lại `franc-min` (đã có trong repo) cho cả client + server
   - Bổ sung field `language` vào paper metadata schema
   - UI: hiển thị "Same language detected" thay vì gọi API
2. **Pre-translate Lớp 1** (abstract + conclusion + captions + headings):
   - Thêm step vào worker pipeline async
   - Schema Firestore `translations/{paperId}/{lang}/{section}`
   - Filter loại trừ book/thesis/dissertation + safety net pages/chars
   - Tenant config có `default_language`

#### Trong 2-4 tuần tới

3. **Fix các bug user-facing còn lại** trong tính năng dịch:
   - "thought}" artifact rò rỉ
   - Bản dịch cắt giữa chừng
   - Subscript vỡ trong công thức
   - Danh pháp hóa học bị phiên âm bừa
4. **Glossary nhiều lớp** (global → domain → tenant → paper):
   - Domain glossary cho electrochemistry / FTIR / XRD / DFT
   - Tenant glossary cho lab cụ thể (bồi đắp dần)
   - Inject vào prompt dịch theo độ ưu tiên
5. **Do-not-translate placeholders** triệt để:
   - Bọc công thức / danh pháp / tên riêng / viết tắt
   - Restore sau khi dịch

#### Sau khi RAG Q&A ship

6. **Pre-translate Lớp 2** (engagement-triggered):
   - Track signal client-side (time_spent, sections_viewed, scrolls, drag_count)
   - Job nhẹ trigger khi đạt threshold
   - Dịch Introduction + Methods
7. **Predictive Lớp 3**:
   - Client-side prefetch trang kế tiếp khi user đang đọc
8. **Figure caption inline overlay**:
   - Hiển thị bản dịch caption ngay dưới figure trong PDF viewer
   - Toggle on/off

#### Trung hạn (1-3 tháng)

9. **PDF → Word/LaTeX strategy** (sau khi đo pipeline cũ):
   - Audit chất lượng OCR hiện tại trên 20 paper đại diện
   - Quyết định có cần Marker không
   - Nếu cần: tích hợp như stage tùy chọn + routing + fallback
10. **AI Science output pipeline**:
    - Nguồn trung gian (Markdown + LaTeX + CSL-JSON)
    - Pandoc multi-format export
    - STIX Two Math + embed font cho Word
    - LaTeX template cho 2-3 tạp chí ưu tiên

### 4.2 Quyết định kiến trúc đáng document (ADR)

- **ADR mới — Pre-translate scope**: chỉ article-type, loại trừ book/thesis, safety net 50 pages / 200k chars.
- **ADR mới — Language identity short-circuit**: 3 tầng detect (client + server + metadata), không gọi LLM cho trùng ngôn ngữ.
- **ADR cập nhật — Translation cache architecture**: 3 tầng (memory LRU + IndexedDB + Firestore), TTL 30 ngày, key theo content hash.
- **ADR mới — PDF extraction pipeline**: routing OCR cũ vs Marker theo document type, fallback, cost guard.
- **ADR mới — Manuscript output pipeline**: nguồn trung gian + pandoc + STIX embed cho AI Science.

### 4.3 Eval cần thêm vào L8 Ragas weekly

- **Translation quality**: faithfulness so với gốc, danh pháp hóa học giữ nguyên, công thức không vỡ.
- **Pre-translate cache hit rate**: % paper được user mở dịch abstract → hit cache. >70% = giả định đúng.
- **en→en short-circuit**: 100% case trùng ngôn ngữ không gọi API.
- **Marker vs OCR cũ** (nếu triển khai): chất lượng extraction so trên cùng eval set.

### 4.4 Cost attribution

Tách riêng feature trong cost guard:

- `feature_translate_ondemand`
- `feature_pretranslate_layer1`
- `feature_pretranslate_layer2`
- `feature_paper_marker_extraction` (nếu có)
- `feature_manuscript_export` (sau)

Mỗi feature có quota tenant + alert. Tránh runaway cost.

### 4.5 Cảnh báo & nguyên tắc

- **Trust > Coverage**: dịch sai một chút mất niềm tin lớn hơn dịch chậm. Ưu tiên chất lượng trước tốc độ.
- **Đo trước khi đầu tư hạ tầng**: Marker, Lớp 2 engagement, đều cần signal số liệu thật trước khi commit engineering effort.
- **Dùng cái đã có**: tenant config, document_type routing, Pub/Sub pipeline, cost guard, Ragas — đã sẵn. Mở rộng thay vì xây lại.
- **Đừng over-engineer**: pre-translate hết, dịch toàn body khi upload, build Marker pipeline ngay từ đầu — đều là cám dỗ over-engineer. Theo "chậm mà chắc".
- **9L anti-hallucination áp cho cả translate + extract**: không tạo cơ chế riêng, tái dùng L1-L9 đã có. L8 Ragas mở rộng cho translation eval. L9 HITL cho confidence thấp.

---

## Phụ lục — Quick reference

### Quyết định pre-translate (pseudocode)

```python
def should_pretranslate(paper, tenant):
    # Document type filter
    if paper.document_type in EXCLUDED_TYPES:
        return False, "excluded_type"

    # Size safety net
    if paper.num_pages > 50 or paper.total_chars > 200_000:
        return False, "too_long"

    # Tenant config
    if not tenant.pretranslate_enabled:
        return False, "tenant_disabled"

    return True, "ok"

EXCLUDED_TYPES = {"book", "thesis", "dissertation", "monograph", "presentation"}
```

### Quyết định identity short-circuit (pseudocode)

```python
def should_skip_translation(text, target_lang, paper=None):
    # T3: paper metadata
    if paper and paper.language == target_lang:
        return True

    # T2: server-side detect
    if len(text) > 10:
        detected = detect_language(text)
        if detected == target_lang:
            return True

    return False
```

### Sections của paper khoa học theo pattern đọc

| Thứ tự đọc | Section | Pre-translate Lớp |
|---|---|---|
| 1 | Abstract | Lớp 1 (luôn) |
| 2 | Conclusion | Lớp 1 (luôn) |
| 3 | Figures + Captions | Lớp 1 (luôn) |
| 4 | Introduction | Lớp 2 (engaged) |
| 5 | Methods | Lớp 2 (engaged) |
| 6 | Results / Discussion | Lớp 3 (on-demand) |
| 7 | References | Không pre, chỉ resolve DOI |

---

*Tài liệu này tổng hợp các quyết định chiến lược cho tính năng translation + PDF conversion của Labyra. Mỗi mục đều có thể triển khai độc lập theo round patch, không yêu cầu refactor lớn hạ tầng hiện tại.*
