# ADR-045 — Translation Quality: Placeholder Protection, Glossary, Reflection, RAT

> **Trạng thái:** Proposed · Tháng 5/2026
> **Phạm vi:** Chất lượng dịch chuyên ngành cho Papers reader (Ctrl+drag region → dịch)
> **Phương châm:** Trust > Coverage · chậm mà chắc · prompt-engineering + orchestration, KHÔNG tool/model mới
> **Liên quan:** ADR-018 (async pipeline), ADR-033 (RAG retrieval), labyra-translation-strategy-report (pre-translate, PDF→Word)

---

## 1. Bối cảnh

Dịch region hiện dùng **prompt-based do-not-translate**: system prompt liệt kê "DO NOT TRANSLATE" (công thức hóa học, acronym, đơn vị, species, citation `[1]`) + tags `<sub>/<sup>/<b>/<i>/<math>`. Model (Gemini-3-Flash T2) *được nhờ* giữ nguyên các phần đó.

Vấn đề: prompt-based **không đảm bảo 100%**. Model thỉnh thoảng:
- Dịch số trong citation (`[20]` → loca­lize), phá range `[29–31]`.
- Dịch không nhất quán từ chỉ thị: "Figure 4" lúc thành "Hình 4", lúc giữ "Figure 4".
- Phá công thức / danh pháp hóa học khi nằm lẫn trong câu.
- Làm researcher **mất tracking nguồn** (citation/ref là điểm neo tra cứu).

Đã có sẵn để tái dùng: cache `_translations/{hash}` (cross-tenant skip model), cost-guard feature `translate`, Pinecone (RAG), Voyage embed, tenant config, taxonomy domain 36-cat.

## 2. Quyết định

Nâng chất lượng dịch theo **4 tầng**, triển khai tuần tự, mỗi tầng độc lập, KHÔNG refactor lớn, KHÔNG thêm model/dịch vụ ngoài (LLM hiện tại + Pinecone là đủ).

### Tầng 1 — Do-not-translate Placeholder (thay prompt-based "nhờ vả")

Thay vì *nhờ* model giữ, **mask trước khi gửi → restore sau**:

```
[1] Detect + replace:  "Figure 4 shows [20]"  →  "⟦C0⟧ shows ⟦C1⟧"
                        map = {C0:{kind:figure,num:"4",raw:"Figure 4"},
                               C1:{kind:bracket,raw:"[20]"}}
[2] LLM dịch masked:    "⟦C0⟧ cho thấy ⟦C1⟧"   (model KHÔNG thấy ref → không phá)
[3] Restore (vi):       "Hình 4 cho thấy [20]"  (dịch từ chỉ thị, giữ số/nội dung)
```

**Placeholder = `⟦Cn⟧`** (U+27E6/27E7 math white brackets) — cực hiếm trong văn bản, model ít đụng; vẫn giữ prompt "đừng đổi `⟦…⟧`" như belt-and-braces; post-process tự phục hồi cả khi model lỡ thêm/bớt space.

**Patterns mask (ưu tiên ít-nhầm trước):**
| Pattern | Ví dụ | Restore (vi) |
|---|---|---|
| Bracket numeric | `[23]` `[1-3]` `[20,25]` `[29–31]` | giữ nguyên |
| Figure ref | `Figure 4` `Fig. 4` `Fig 4` `Fig. S2` | **Hình 4** (giữ số) |
| Table ref | `Table 1` `Tab. 1` | **Bảng 1** |
| Equation ref | `Eq. 5` `eq 2` `Equation 2` | **phương trình 2** |
| Section ref | `Section 3.2` `Sec. 3` | **Mục 3.2** |
| Công thức LaTeX | `$\frac{...}{...}$` | giữ nguyên (đã có `<math>`) |
| Tên hóa học | `H₂O₂` `WO₃` | giữ nguyên (đã có) |
| Author-year *(giai đoạn sau)* | `(Smith et al., 2023)` | giữ, "et al."→"và cs." |

**Edge cases** (từ report): citation kép sát nhau (`[20][21]`), range (`[20-25]` cụm), mixed (`pH⁷⁵`), citation trong công thức (mask công thức TRƯỚC), footnote markers, arXiv ref, URL → đều thành placeholder.

**Vị trí:** pure function (regex) chạy ngay trong route `translate` (không cần worker). Author-year để **giai đoạn 2** vì regex dễ bắt nhầm — cần test trên paper thật.

### Tầng 2 — Glossary domain injection

Glossary thuật ngữ chuyên ngành (electrochemistry / FTIR / Raman / XRD / DFT) → inject vào prompt dịch theo độ ưu tiên (global → domain → tenant → paper). Đảm bảo "overpotential"→"quá thế", "linear sweep voltammetry"→"quét thế tuyến tính" nhất quán toàn paper. Domain lấy từ taxonomy 36-cat đã có; tenant glossary bồi đắp dần.

### Tầng 3 — Reflection Agent (Andrew Ng 3-bước)

`translate → reflect (model tự soi lỗi: thuật ngữ, công thức, danh pháp) → improve`. Port pattern `andrewyng/translation-agent` (MIT) sang TS, dùng cho **dịch chất lượng cao** (không phải mặc định). **Cost: gấp ~2-3 lần token** → chỉ bật on-demand (nút "Dịch kỹ") hoặc cho L1 pre-translate (abstract/conclusion), KHÔNG cho mọi region drag. Cost-guard feature riêng.

### Tầng 4 — Translation Memory + RAT

TM lưu cặp (source hash → translation) đã duyệt → fuzzy match cho đoạn tương tự. RAT (Retrieval-Augmented Translation): retrieve glossary + TM liên quan từ **Pinecone** (đã có) → inject vào prompt. Tận dụng hạ tầng RAG sẵn có, không thêm store.

## 3. KHÔNG làm (theo report)

- **KHÔNG** dùng OPUS-MT / NLLB / LibreLLM / Marian làm **main path** — chất lượng < LLM cho dịch chuyên ngành. (Có thể làm fallback khi LLM unavailable, giai đoạn rất sau.)
- **KHÔNG** fine-tune model sớm — chỉ khi domain cực rõ + có corpus song ngữ (3000+ cặp đã duyệt).
- **KHÔNG** constrained-decoding library (outlines/guidance) vội — placeholder + prompt đủ tốt cho Gemini; chỉ cần nếu đo thấy model phá placeholder nhiều.

## 4. Lộ trình (chậm mà chắc)

| Bước | Việc | Rủi ro | Phụ thuộc |
|---|---|---|---|
| **1a** | Placeholder: bracket + Figure/Table/Eq/Section ref → restore (Figure→Hình) | Thấp | — |
| **1b** | Mở rộng placeholder: author-year, edge cases | TB (regex nhầm) | test paper thật |
| **2** | Glossary domain inject vào prompt | Thấp | taxonomy (có) |
| **3** | Reflection agent (nút "Dịch kỹ", cost-guard riêng) | TB (cost) | cost telemetry |
| **4** | TM + RAT qua Pinecone | TB | Pinecone (có) |

## 5. Trade-offs & rủi ro

- **Placeholder bị model phá** (đổi `⟦C1⟧`→`[C1]` hoặc bỏ): giảm bằng prompt + post-process tolerant; nếu cao → constrained decoding (Tầng phụ).
- **Restore nhầm** "Figure"→"Hình" khi không nên (vd trong tên riêng): chỉ restore placeholder đã mask (không regex lại trên output).
- **Reflection cost gấp 2-3**: chặn bằng on-demand + cost-guard feature `translate_reflect` riêng + quota.
- **Glossary sai/lỗi thời**: glossary có versioning, ưu tiên tenant override global.

## 6. Eval (mở rộng L8 Ragas)

- Citation/ref preservation: % giữ nguyên 100% sau dịch (mục tiêu 100%).
- Chemical/formula integrity: không vỡ công thức/danh pháp.
- Term consistency: thuật ngữ glossary dịch nhất quán toàn paper.
- Placeholder survival rate: % placeholder model giữ đúng (nếu < 98% → cân nhắc constrained decoding).

## 7. Cost attribution (cost-guard)

- `feature_translate_ondemand` (hiện có) — dịch region thường (Tầng 1+2).
- `feature_translate_reflect` (mới) — dịch kỹ (Tầng 3), quota chặt hơn.

---

*ADR này document chiến lược chất lượng dịch từ phân tích placeholder-protection + translation-quality. Mỗi tầng triển khai độc lập theo round patch, tái dùng cache / cost-guard / Pinecone / taxonomy sẵn có — không refactor hạ tầng, không tool/model mới.*
