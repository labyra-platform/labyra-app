# ADR-048 — OCR Engine-Agnostic Layer (license-driven swappability)

> Bọc tầng OCR sau một interface **swappable** để engine không bao giờ trở thành
> lock-in. Lý do trực tiếp: model weights Chandra dùng OpenRAIL-M sửa đổi có
> **ngưỡng $2M** (bom hẹn giờ) + clause no-compete. Khi tới ngưỡng, đổi giữa
> "mua license Chandra" và "nhảy sang engine permissive (olmOCR 2 / Docling)"
> phải là một lựa chọn **config / 1-file**, không phải đại phẫu.

**Status**: Proposed (chờ duyệt)
**Date**: 2026-05-31
**Round**: R257
**Related**: ADR-018 (async paper pipeline), ADR-033/046 (RAG retrieval), strategy
report `docs/strategy/labyra-translation-strategy-report.md` (§1 PDF extraction).
**Scope**: `labyra-app` `src/lib/ai/rag/ocr/*` (types, registry, router, index +
adapters chandra/olmocr/docling). Consumer `pipeline/ocr-step.ts` **không đổi**.
**Tiêu chí bám**: Trust > Coverage · dùng cái đã có · license sạch · không
over-engineer · không break behavior hiện tại.

---

## 1. Bối cảnh (verify trên repo, không suy đoán)

- `src/lib/ai/rag/ocr/` đã có abstraction `OcrProvider` (R160) nhưng:
  - `getOcrProvider()` **hardcode** `new MistralOcrProvider()` — không chọn theo
    env, không routing, không fallback.
  - Chandra / olmOCR / Docling chỉ là ghi chú "future provider", **chưa wire**.
- Engine đang chạy thực tế: **Mistral OCR** (code) + Chandra qua server tự host
  (HF Space) — strategy report ghi "Mistral OCR + Chandra".
- Ràng buộc cứng của founder: **"không lấy repo người khác dính license"**.

### 1.1 Vì sao Chandra là rủi ro license (nguyên văn `chandra/MODEL_LICENSE`)
- **Code** chandra-ocr = **Apache-2.0** (thoải mái thương mại).
- **Model weights** = OpenRAIL-M sửa đổi, mất quyền free nếu **bất kỳ** điều sau:
  - (a) **gross revenue > $2,000,000 ở NĂM TRƯỚC** (annual, reset mỗi năm);
  - (b) **tổng vốn equity/debt đã gọi > $2,000,000** (cộng dồn, không reset);
  - (c) cung cấp sản phẩm/dịch vụ **cạnh tranh** với Datalab (không có ngưỡng).
- Labyra hiện: solo founder, tenant đầu = lab đại học → <$2M cả (a) và (b);
  OCR dùng **nội bộ** nạp paper cho RAG, không bán OCR-API → (c) không áp.
  ⇒ **Hợp lệ ở giai đoạn này.** Rủi ro là (b) khi raise >$2M (vĩnh viễn) và (a)
  khi doanh thu/năm vượt $2M.

## 2. Quyết định

Thêm tầng engine-agnostic **mỏng** quanh `OcrProvider` đã có:

1. **Registry** (`registry.ts`): nguồn-sự-thật-duy-nhất về engine nào tồn tại +
   **license posture** + factory. Engine: `mistral` `chandra` `olmocr` `docling`.
2. **Chọn theo env** (`index.ts`): `OCR_ENGINE` (default `mistral` → **không đổi
   behavior**). `OCR_FALLBACK` = danh sách id, có thì bọc trong router.
3. **Router + fallback** (`router.ts`): chạy primary, lỗi thì rớt sang engine kế;
   success đầu tiên thắng; gắn `fallbackFrom`. (Strategy report muốn "routing +
   fallback".)
4. **Adapter Chandra** (`chandra.ts`): HTTP client tới server tự host
   (`CHANDRA_OCR_URL`), không ship weights. Một hàm `parseChandraResponse` cô lập
   = chỗ DUY NHẤT cần chỉnh khớp JSON server thật.
5. **Plug-point olmOCR / Docling** (`olmocr.ts`, `docling.ts`): implement
   interface + đăng ký trong registry, `processPdf` reject kèm **recipe wiring**
   ở header. Router đã route tới → wire sau = sửa đúng 1 file.

Output schema (`OcrResult`/`OcrPage`) mở rộng **non-breaking** (thêm field optional
`html`, `confidence`, `engineVersion`, `language`, `fallbackFrom`, `meta`).

## 3. Ma trận license engine (tiêu chí "license sạch")

| Engine | Code | Weights | Ngưỡng/cap | Dùng SaaS đóng? |
|---|---|---|---|---|
| **Mistral OCR** | — (cloud API) | — | tính tiền/trang | OK (không redistribute model) |
| **Chandra 2** | Apache-2.0 | OpenRAIL-M sửa đổi | **$2M rev/năm + $2M funding + no-compete** | OK **tới ngưỡng** |
| **olmOCR 2** | Apache-2.0 | **Apache-2.0** | không | **Sạch, free vĩnh viễn** |
| **Docling + Granite-Docling** | MIT | Apache-2.0 | không | **Sạch, chạy local/air-gapped** |

Tránh (không đưa vào registry): **MinerU** (AGPL-3.0, network copyleft),
**Marker** (Datalab OpenRAIL như Chandra), **fasttext lid.176** (CC-BY-SA).

Trade-off chất lượng (olmOCR-bench, từ model card Chandra): Chandra 2 = 85.9,
olmOCR 2 = 82.4 → engine "sạch" kém ~3.5 điểm nhưng không bom hẹn giờ.

## 4. Hệ quả

- **Hôm nay**: default `mistral`, behavior y nguyên. Bật Chandra = set
  `OCR_ENGINE=chandra` + `CHANDRA_OCR_URL` + khớp `parseChandraResponse`.
- **Tới ngưỡng $2M**: quyết định "mua license Datalab" vs "đổi engine" chỉ là đổi
  `OCR_ENGINE` (nếu olmOCR/Docling đã wire) — từ **thế chủ động**, không bị deadline
  ép. Đổi engine **rẻ nhất lúc còn nhỏ**, đắt nhất lúc gần ngưỡng → tầng này khóa
  chi phí migrate ở mức thấp ngay từ giờ.
- Nếu mua license Datalab: **đọc commercial terms xem có gỡ luôn clause (c)
  no-compete không**, hay chỉ bỏ cap (a)/(b).

## 5. Env

| Var | Bắt buộc | Ý nghĩa |
|---|---|---|
| `OCR_ENGINE` | không (default `mistral`) | `mistral`\|`chandra`\|`olmocr`\|`docling` |
| `OCR_FALLBACK` | không | csv id rớt-dần khi primary lỗi, vd `mistral` |
| `CHANDRA_OCR_URL` | nếu dùng chandra | endpoint POST server Chandra |
| `CHANDRA_OCR_TOKEN` | không | bearer token (nếu server yêu cầu) |
| `CHANDRA_COST_PER_1000` | không (default 0) | USD/1000 trang để attribute cost |
| `OLMOCR_URL` / `DOCLING_URL` | khi wire plug-point | endpoint tương ứng |

## 6. Chưa làm (cố ý, ngoài scope R257)

- Schema **structured-block** (table/equation/figure dạng block) cho path
  **PDF→Word/LaTeX** (AI Science) — concern riêng, làm khi cần.
- Wire thật olmOCR/Docling (rasterize trang + prompt VLM / docling-serve).
- `parseChandraResponse` mới là giả định contract; khớp với server thật trước khi
  bật `OCR_ENGINE=chandra` ở prod.

## 7. Không phải tư vấn pháp lý
Tóm tắt từ file LICENSE công khai (weights ≠ code). Để chắc tuyệt đối: đọc trực
tiếp `MODEL_LICENSE` của đúng version + luật sư cho cách diễn giải "competes".
