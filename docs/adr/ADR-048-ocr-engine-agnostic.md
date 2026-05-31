# ADR-048 — OCR Engine-Agnostic Layer (license-driven swappability)

> Bọc tầng OCR sau một interface **swappable** để engine không bao giờ trở thành
> lock-in. Runtime hiện tại = **Datalab hosted API** (trả phí, turnkey); self-host
> Chandra (free, dính ngưỡng $2M OpenRAIL) để dành làm đường thoát. Đổi giữa các
> engine phải là **config / 1-file**, không phải đại phẫu.

**Status**: Proposed (chờ duyệt)
**Date**: 2026-05-31
**Round**: R257 (layer) + R258 (Datalab hosted adapter)
**Related**: ADR-018 (async paper pipeline), ADR-033/046 (RAG retrieval), strategy
report `docs/strategy/labyra-translation-strategy-report.md` (§1 PDF extraction).
**Scope**: `labyra-app` `src/lib/ai/rag/ocr/*` (types, registry, router, index +
adapters mistral/chandra/datalab/olmocr/docling). Consumer `pipeline/ocr-step.ts`
**không đổi**.
**Tiêu chí bám**: Trust > Coverage · dùng cái đã có · license sạch · không
over-engineer · không break behavior hiện tại.

---

## 1. Bối cảnh (verify trên repo, không suy đoán)

- `src/lib/ai/rag/ocr/` đã có abstraction `OcrProvider` (R160) nhưng:
  - `getOcrProvider()` **hardcode** `new MistralOcrProvider()` — không chọn theo
    env, không routing, không fallback.
  - Chandra / olmOCR / Docling chỉ là ghi chú "future provider", **chưa wire**.
- Ràng buộc cứng của founder: **"không lấy repo người khác dính license"**.

### 1.1 Ba đường dùng Chandra/Datalab — KHÁC NHAU (dễ lẫn)
1. **Self-host open weights** (`chandra.ts`): chạy server riêng (HF Space / vLLM).
   Free (GPU mình), **dính ngưỡng $2M OpenRAIL**. URL = server của mình.
2. **Datalab hosted API** (`datalab.ts`): dịch vụ cloud **trả phí theo trang**
   tại `https://www.datalab.to/api/v1/marker`, auth `X-Api-Key`. → **Ngưỡng $2M
   KHÔNG áp** (trả tiền dùng service, không đụng open weights). **Async/poll.**
3. **On-prem container**: ảnh Datalab chạy hạ tầng riêng, licensing thương mại.

### 1.2 Ngưỡng $2M của weights open (nguyên văn `chandra/MODEL_LICENSE`)
Chỉ áp cho **đường 1 (self-host weights)**. Mất quyền free nếu **bất kỳ**:
(a) **gross revenue > $2M ở NĂM TRƯỚC** (annual, reset mỗi năm); (b) **tổng vốn
equity/debt đã gọi > $2M** (cộng dồn, không reset); (c) cung cấp dịch vụ **cạnh
tranh** Datalab (không ngưỡng). Code chandra-ocr = Apache-2.0 (vô tư).

## 2. Quyết định

Tầng engine-agnostic **mỏng** quanh `OcrProvider`:

1. **Registry** (`registry.ts`): nguồn-sự-thật engine + **license posture** +
   factory. Engine: `mistral` `chandra` `datalab` `olmocr` `docling`.
2. **Chọn theo env** (`index.ts`): `OCR_ENGINE` (default `mistral` → **không đổi
   behavior**). `OCR_FALLBACK` = danh sách id, có thì bọc router.
3. **Router + fallback** (`router.ts`): primary lỗi → rớt sang engine kế; success
   đầu tiên thắng; gắn `fallbackFrom`.
4. **Adapter Datalab hosted** (`datalab.ts`, R258): POST `/api/v1/marker`
   (multipart, `X-Api-Key`) → poll `request_check_url` tới `status==complete`.
   `paginate=true` + tách trang theo delimiter Marker (`\n\n{N}` + 48 gạch).
   **Đây là runtime đang dùng** (anh đã có API key).
5. **Adapter Chandra self-host** (`chandra.ts`): để dành đường free; `parseChandraResponse`
   cô lập để khớp server riêng khi cần.
6. **Plug-point olmOCR / Docling** (`olmocr.ts`, `docling.ts`): interface + đăng ký,
   `processPdf` reject kèm recipe wiring. Wire sau = sửa 1 file.

`OcrResult`/`OcrPage` mở rộng **non-breaking** (`html`, `confidence`,
`engineVersion`, `language`, `fallbackFrom`, `meta`).

## 3. Ma trận license engine (tiêu chí "license sạch")

| Engine | Đường | Code | Weights | Ngưỡng/cap | Dùng SaaS đóng? |
|---|---|---|---|---|---|
| **Mistral OCR** | cloud | — | — | tính tiền/trang | OK (không redistribute) |
| **Datalab API** | cloud (hosted) | — | — | tính tiền/trang | **OK — $2M N/A** (trả phí) |
| **Chandra 2** | self-host | Apache-2.0 | OpenRAIL-M | **$2M rev/năm + $2M funding + no-compete** | OK **tới ngưỡng** |
| **olmOCR 2** | self-host | Apache-2.0 | **Apache-2.0** | không | **Sạch, free vĩnh viễn** |
| **Docling + Granite** | self-host | MIT | Apache-2.0 | không | **Sạch, local/air-gapped** |

Tránh (không vào registry): **MinerU** (AGPL-3.0), **Marker self-host** (OpenRAIL
như Chandra), **fasttext lid.176** (CC-BY-SA).

## 4. Hệ quả

- **Hôm nay**: set `OCR_ENGINE=datalab` + `DATALAB_API_KEY` → chạy Datalab hosted
  (chính xác cao, trả phí/trang). Nên set `OCR_FALLBACK=mistral` để Datalab sập
  thì Mistral đỡ. Default code vẫn `mistral` (non-breaking nếu chưa set env).
- **Tối ưu chi phí sau**: muốn bỏ phí/trang → self-host (`chandra` free nhưng dính
  $2M, hoặc `olmocr`/`docling` sạch hẳn) chỉ bằng đổi `OCR_ENGINE` + wire 1 file.
- **`use_llm`**: Datalab có cờ tăng độ chính xác nhưng **rủi ro hallucination nhỏ**
  + chậm + đắt hơn → mặc định TẮT (`DATALAB_USE_LLM`), bật có chủ đích.

## 5. Env

| Var | Bắt buộc | Ý nghĩa |
|---|---|---|
| `OCR_ENGINE` | không (default `mistral`) | `mistral`\|`chandra`\|`datalab`\|`olmocr`\|`docling` |
| `OCR_FALLBACK` | không | csv id rớt-dần khi primary lỗi, vd `mistral` |
| `DATALAB_API_KEY` | nếu dùng datalab | key Datalab (datalab.to/app/keys) |
| `DATALAB_USE_LLM` | không (default false) | `true` → chính xác hơn, rủi ro hallucination nhỏ |
| `DATALAB_LANGS` | không | csv ngôn ngữ OCR, vd `English,Vietnamese` |
| `DATALAB_COST_PER_1000` | không (default 0) | USD/1000 trang để attribute cost |
| `DATALAB_MARKER_URL` | không | override endpoint |
| `CHANDRA_OCR_URL` / `CHANDRA_OCR_TOKEN` / `CHANDRA_COST_PER_1000` | khi self-host chandra | endpoint + token + giá |
| `OLMOCR_URL` / `DOCLING_URL` | khi wire plug-point | endpoint tương ứng |

## 6. Chưa làm (cố ý, ngoài scope)

- Schema **structured-block** (table/equation/figure dạng block) cho path
  **PDF→Word/LaTeX** (AI Science) — concern riêng.
- Wire thật olmOCR/Docling (rasterize trang + prompt VLM / docling-serve).
- `parseChandraResponse` (chandra.ts) còn là giả định contract — khớp server thật
  trước khi bật `OCR_ENGINE=chandra`.

## 7. Không phải tư vấn pháp lý
Tóm tắt từ file LICENSE công khai (weights ≠ code; hosted API ≠ self-host). Chắc
tuyệt đối: đọc `MODEL_LICENSE` đúng version + commercial terms Datalab + luật sư.
