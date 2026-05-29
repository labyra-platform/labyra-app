# ADR-041: AI Science — Paper Writing Pipeline (web-adapted)

> **Status**: Proposed (design-only, chưa code)
> **Date**: 2026-05-26 · **Revised**: 2026-05-29 (thêm §2.5 Unified Export Pipeline)
> **Context refs**: T4 Writer (R173), T5 Auditor (R176-5), RAG searchPapers (R160-ai-5d), citation network (R166, ADR-017), async paper pipeline (R167, ADR-018), in-reader translation (R237aa–R237ap), KaTeX render (R237al)
> **Supersedes/relates**: none new; reuses ADR-019 (AI Tier), ADR-033 (RAG Scaling)

---

## 1. Context

nAM (nhà nghiên cứu vật liệu, founder Labyra) muốn thêm tính năng lớn **AI Science**:
trợ lý viết paper khoa học, lấy cảm hứng từ:
- **AutoResearchClaw** (arXiv 2605.20025v2) — multi-agent autonomous research, 23-stage,
  5 cơ chế (multi-agent debate K=3, self-healing executor, verifiable result reporting +
  numeric registry, HITL 7 modes, cross-run evolution time-decay).
- **academic-research-skills** (github Imbad0202) — Claude Code skills, 10-stage pipeline
  (research→write→integrity→review→socratic→revise→finalize), CSL multi-format, tectonic PDF.

**Khác biệt nền tảng quyết định mọi thứ**: cả hai nguồn là **Claude Code / terminal multi-agent
chạy Docker sandbox, Agent Teams, Ralph Loop**. Labyra là **web SaaS** (Next.js 16 + Vercel
serverless 60s timeout, không Docker/filesystem/long-running). → KHÔNG port code; chỉ chắt lọc ý tưởng.

**Lợi thế độc nhất của Labyra** (cả 2 nguồn KHÔNG có): Labyra **sở hữu dữ liệu đo đạc thật của lab**
(measurements: XRD/Raman/FTIR/UV-Vis/TGA peaks, MaterialProfile: bandgap/formula/DOI, RAG paper
library, lineage PROV-O). → AI Science của Labyra KHÔNG tự chạy thí nghiệm (bỏ toàn bộ Phase
Experimentation của AutoResearchClaw: code-gen, sandbox run, self-heal, pivot/refine — stage 9-15),
mà **viết paper grounded trên data thật của nhà nghiên cứu**. Vị thế: research amplifier, không phải
autonomous fabricator.

---

## 2. Decision

Xây AI Science như một **module web-native**, tái dùng tối đa hạ tầng AI sẵn có, theo lộ trình phase
v0→v3 với scope v0 chốt cứng tối thiểu.

### 2.1 Kiến trúc 3 tầng

**Tầng 1 — UI** (Next.js): trang `/dashboard/ai-science`, nav nhóm 2 cấp (sub-nav: Viết section /
Bản nháp / Review / Xuất bản). Pipeline Stage Viewer (giai đoạn sau) + HITL gates qua web UI.

**Tầng 2 — Pipeline stages** (tái dùng T4 Writer + T5 Auditor + worker async R167):
- Literature → reuse `searchPapers` (RAG hybrid, R160-ai-5d).
- Hypothesis/debate → tier tuần tự nhẹ (Vercel timeout — KHÔNG full multi-agent song song).
- Draft → reuse **T4 Writer** (`runWriter`, đã hỗ trợ `SectionType: introduction|methods|results|discussion`).
- Audit/integrity → reuse **T5 Auditor** (R176-5, findings + verdict).
- Citation verify → reuse Crossref+OpenAlex (R166), thêm arXiv + S2 + LLM relevance (Verified/Suspicious/Hallucinated).

**Tầng 3 — Ground truth registry** (Firestore, data thật): measurements + MaterialProfile + RAG library.
Mọi số trong paper phải trace về registry (verifiable reporting); integrity stage reject số không khớp.

### 2.2 Trục Citation / Reference management (CSL-JSON làm chuẩn trung gian)

Quyết định cốt lõi: **KHÔNG khóa cứng vào Zotero**. Dùng **CSL-JSON** (Citation Style Language JSON)
làm format dữ liệu reference trung gian:
- Crossref/OpenAlex (đã có R166) trả CSL-JSON.
- `citeproc-js` áp CSL style (APA/IEEE/Elsevier/... 10000+ style mở) → đổi format ref runtime.
- Export sang Zotero / EndNote / BibTeX đều từ CSL-JSON.
- **Zotero ưu tiên** qua Zotero Web API (`api.zotero.org`): user kết nối → Labyra đọc thư viện thật →
  citation lấy từ Zotero (luôn có thật, khớp anti-hallucination).

### 2.3 Xuất file Word

- v1: .docx text + bibliography TĨNH theo 1 CSL style (docx skill + citeproc-js).
- v3 (defer): Word field động Zotero-compatible (CSL-JSON nhúng / Zotero RTF-ODF Scan) để chỉnh
  format ref trong Word qua plugin. Khó nhất, nhiều edge case → hoãn.

> **Lưu ý**: §2.3 mô tả *citation* trong file Word. Việc render *công thức* (equation) trong các
> format xuất ra được tách thành §2.5 — vì nó là một trục riêng (LaTeX, không phải CSL) và áp cho
> CẢ AI Science manuscript LẪN in-reader translation export.

### 2.4 Anti-hallucination (kế thừa nguyên tắc dự án)

- Citation CHỈ từ ground truth: kho RAG Labyra (v0) hoặc Zotero thật (v2). KHÔNG để LLM tự sinh DOI
  (đã chốt từ memory rule: "real citations only when RAG ground truth exists").
- Số liệu CHỈ từ registry tầng 3; integrity stage reject số bịa (như AutoResearchClaw verifiable reporting).
- HITL gate CoPilot (paper chứng minh 87.5% accept >> Full-Auto 25%): dừng ở checkpoint cao-giá-trị
  để user duyệt, KHÔNG full-auto.

### 2.5 Unified Export Pipeline (LaTeX-first, Pandoc-on-worker)  — **thêm 2026-05-29**

**Bối cảnh quyết định**: vấn đề "font equation chuẩn tạp chí" (phát sinh khi copy bản dịch ra Word —
Word render equation bằng Cambria Math, không phải font tạp chí) KHÔNG được giải quyết riêng lẻ/tạm bợ.
Nó là **một nhánh của một pipeline xuất bản thống nhất** dùng chung bởi AI Science manuscript và
in-reader translation export. Giải quyết triệt để một lần, ở một chỗ.

**Sự thật typography (chốt để không hiểu nhầm)**: "Times New Roman cho equation" là sai về kỹ thuật —
TNR là *text font*, không có MATH table (luật spacing/positioning) lẫn glyph toán đầy đủ. Cái các tạp
chí thực sự dùng (và trông giống Times) là **STIX Two Math** — math font do chính các nhà xuất bản
khoa học (AMS, AIP, APS, ACS, IEEE, Elsevier) tạo ra, thiết kế tương thích thị giác với Times, license
**OFL** (mở, cho nhúng — hợp pháp cho SaaS). Word equation editor mặc định Cambria Math và không cho
đổi font qua UI; chỉ control được font equation khi **gen file ở tầng XML** (OMML) hoặc qua **LaTeX**.

**Quyết định cốt lõi**: **Công thức là LaTeX — nguồn chân lý duy nhất, từ tầng SINH**, không phải
MathML/ảnh. Mọi nơi sinh nội dung khoa học phải phát công thức dưới dạng LaTeX:
- T4 Writer (AI Science) — **đã làm** (R173): `$...$` inline, `$$...$$` display (xác nhận ở
  `tier4-writer/prompts.ts`).
- In-reader translation + Ask AI — **đã làm** (R237ak/al): công thức bọc `<math>LaTeX</math>`, render
  bằng KaTeX trong UI.
- → Nền "công thức = LaTeX" đã tồn tại; ADR này chỉ chốt **KHÔNG downgrade** sang MathML/ảnh ở tầng sinh
  và quy định cách **chuyển đổi** ra các format đích.

**Pandoc làm trung tâm chuyển đổi đa format** (một nguồn → nhiều format, không gen riêng từng format):

```
Nguồn trung gian (Markdown mở rộng + LaTeX công thức $...$ + citation CSL-JSON + figure refs)
  │
  └── Pandoc (chạy ở WORKER, không Vercel)
        ├── LaTeX   (template tạp chí: newtxmath / stix2)          → nộp Elsevier/Nature/ACS
        ├── DOCX    (reference-doc: font equation = STIX Two Math) → co-author dùng Word
        │             → POST-PROCESS: nhúng font STIX vào .docx
        ├── PDF     (qua LaTeX engine — TeX, NẶNG)                 → preview/đọc/in
        └── HTML    (KaTeX — đã có trong app)                      → preview trong Labyra
```

**Ràng buộc thực thi BẮT BUỘC** (đây là phần ADR gốc thiếu, dễ làm sai nếu không ghi):

1. **Pandoc KHÔNG chạy trên Vercel serverless** (binary ~150MB, cần subprocess + filesystem). Export
   **bắt buộc là async job qua worker** (`labyra-spectra-worker`, Cloud Run), theo đúng pattern
   paper-processing R167 (enqueue → state machine → poll/notify). Worker Docker image phải thêm
   `apt-get install -y pandoc`. KHÔNG có đường tắt qua route Next.js.

2. **Nhúng font KHÔNG phải Pandoc làm.** Pandoc reference-doc chỉ set *tên* font equation = STIX Two
   Math. Để máy co-author chưa cài STIX vẫn hiển thị đúng, phải **nhúng** font vào .docx ở bước RIÊNG
   sau Pandoc: `python-docx` patch `word/settings.xml` thêm `<w:embedRegular>` (hoặc LibreOffice
   headless). Pipeline Word = `pandoc → post-process embed font`. STIX OFL cho phép nhúng; Cambria thì
   KHÔNG (license đóng) → đây là lý do kỹ thuật chọn STIX, không phải Cambria.

3. **PDF path (TeX engine) tách khỏi DOCX path — vì TeX rất nặng.** LaTeX→PDF cần xelatex/tectonic
   (vài trăm MB, compile chậm, phình worker image). Nhưng **DOCX + LaTeX-source KHÔNG cần TeX** (Pandoc
   tự làm). → Thứ tự: làm **LaTeX-source + DOCX trước** (Pandoc đủ); PDF (cần TeX) đẩy sau hoặc dùng
   cloud-compile riêng. KHÔNG gánh TeX vào worker sớm.

4. **Một converter, hai người dùng.** Translation export (1 đoạn dịch — nhẹ) và AI Science manuscript
   (cả paper: section + citation CSL-JSON + figure — nặng) gọi **CÙNG một worker endpoint Pandoc**,
   khác nhau chỉ ở payload/template. Converter là shared service; KHÔNG build hai lần.

5. **Hai trục dữ liệu độc lập, Pandoc hợp nhất**: citation = CSL-JSON (§2.2), equation = LaTeX (§2.5).
   Pandoc xử lý cả hai trong một lần convert. Không trộn hai trục.

---

## 3. Lộ trình phase (scope có chủ đích)

| Phase | Scope | Reuse | Mới |
|---|---|---|---|
| **v0** | 1 nút "Viết section" (Introduction trước) từ đề tài + kho paper Labyra. Output markdown + citation chip + công thức LaTeX render KaTeX. **KHÔNG Zotero, KHÔNG export file.** | T4 Writer (`runWriter`), searchPapers, sources-panel, citation-chip, KaTeX (R237al) | route mỏng `/api/ai-science/section` + trang + nav nhóm |
| **v1** | Quản lý nhiều draft (Bản nháp), ghép section → paper. (Export file CHƯA — chỉ chuẩn hóa "nguồn trung gian": markdown + LaTeX + CSL-JSON.) | docx skill, citeproc-js | draft store (Firestore), CSL render, chuẩn hóa nguồn trung gian |
| **v2** | **Export pipeline (§2.5): worker + Pandoc → LaTeX-source + DOCX** (font STIX, nhúng). Zotero Web API (citation từ Zotero). Đổi CSL style. Review stage (T5). | T5 Auditor, CSL-JSON, worker async R167 | **worker Pandoc image + endpoint**, Zotero connector, style switcher, font-embed post-process |
| **v3** | PDF qua TeX engine. Word field động Zotero-compatible. Full pipeline HITL gates + integrity + Pipeline Stage Viewer. EndNote/Mendeley. Template nhiều tạp chí. | toàn bộ tầng 2 | TeX engine, Word field codes, multi-stage orchestrator, template registry |

**Nguyên tắc**: mỗi phase ship được độc lập. Tầm nhìn lớn (Zotero/CSL/Word/PDF/pipeline) ghi đầy đủ ở
đây để không mất ý tưởng, nhưng **thực thi từng phase nhỏ** — chống scope creep.

**Phương châm export (chốt theo thảo luận 2026-05-29)**: "triệt để" KHÔNG có nghĩa nhảy thẳng vào
export đa format hoàn hảo ở v0. v0–v1 lo **nguồn trung gian + công thức LaTeX đúng** (nền tảng — phần
lớn đã có). v2–v3 mới lo **exporter từng format**. Vì nguồn đã chuẩn, thêm format về sau chỉ là thêm
một "exporter", không phải làm lại nội dung.

---

## 4. Scope v0 — CHỐT CỨNG

**Làm:**
- Route `POST /api/ai-science/section` — wrap `runWriter({ sectionType, userMessage: <đề tài>, tenantId })`.
- Trang `/dashboard/ai-science` (sub-nav "Viết section"): ô nhập đề tài + dropdown section + dropdown
  "IMRaD chung" + nút "Viết Introduction".
- Stream draft (T4 `onTextDelta`) + hiện citations (reuse sources-panel + citation-chip).
- Công thức LaTeX trong draft render bằng KaTeX (reuse pipeline R237al — KHÔNG dựng lại).
- Nav nhóm 2 cấp: "AI Science" (icon sparkles) cạnh "AI Assistant"; sub-nav 4 mục (3 mục sau disabled/badge v1-v2).
- Xử lý kho paper RỖNG: nếu tenant chưa có paper → viết không citation + cảnh báo "chưa có paper trong kho".

**KHÔNG làm trong v0** (defer rõ ràng):
- Zotero/EndNote, CSL style switcher, **export .docx/.pdf/.tex (toàn bộ §2.5 pipeline)**, Word field,
  multi-stage pipeline, HITL gates, numeric registry verify, draft persistence, review/audit integration.

---

## 5. Consequences

**Tích cực:**
- v0 ship nhanh (lõi T4 Writer có sẵn từ R173 — chỉ route + UI).
- Kiến trúc CSL-JSON mở: không khóa Zotero, đỡ được EndNote/Mendeley sau.
- **Công thức LaTeX-first đã có sẵn (T4 + translation)** → export pipeline không phải sửa tầng sinh,
  chỉ thêm tầng chuyển đổi. "Font equation chuẩn tạp chí" trở thành tự nhiên qua STIX (DOCX) /
  newtxmath (LaTeX), không phải vá riêng.
- Grounded trên data thật → vị thế khác biệt vs công cụ generic.
- Nav nhóm thiết kế từ đầu → thêm v1-v3 không phải tái cấu trúc.
- Một converter dùng chung cho translation export lẫn manuscript export → không trùng lặp.

**Rủi ro / cần theo dõi:**
- T4 citation key heuristic (`paperId.includes(key.slice(0,5))`) thô — có thể map citation sai. Cần
  cải thiện ở v1 (dùng metadata khớp chính xác).
- Vercel 60s: pipeline dài (v3) **và toàn bộ export §2.5** phải async qua worker (R167 pattern), không
  chạy trong 1 request. Pandoc/TeX KHÔNG được chạy trên Vercel.
- **Worker image phình** khi thêm Pandoc (~150MB) rồi TeX (vài trăm MB). Theo dõi build time + cold
  start Cloud Run. Cân nhắc tách worker export riêng nếu image quá nặng (nhưng chỉ khi cần — Stage 1
  giữ một worker).
- **Font embed (B4) là bước hậu kỳ riêng** — python-docx patch settings.xml hoặc LibreOffice headless;
  test trên máy CHƯA cài STIX để xác nhận nhúng hoạt động.
- Word field động (v3) phụ thuộc format nội bộ Zotero — có thể đổi; theo dõi chuẩn CSL/Zotero RTF-ODF.
- Kho paper tenant phải đủ lớn để citation có ý nghĩa (gated như ADR-033).
- **Copyright export (BLOCKER trước public launch)**: export bản dịch / manuscript chỉ xuất nội dung do
  Labyra/user tạo + reference; KHÔNG tái phân phối PDF gốc bản quyền. Cần ADR Legal riêng (ADR-044).

**Quyết định bị ràng buộc bởi ADR này:**
- KHÔNG tự sinh DOI/citation bằng LLM (chỉ ground truth).
- KHÔNG chạy thí nghiệm/code trong Labyra (khác AutoResearchClaw — Labyra dùng data đã đo).
- CSL-JSON là format citation trung gian bắt buộc (không hardcode 1 định dạng).
- **Công thức là LaTeX ở tầng sinh — KHÔNG downgrade sang MathML/ảnh.**
- **Export = Pandoc trên worker, KHÔNG trên Vercel. Font equation = STIX Two Math (nhúng), KHÔNG Cambria.**
- **DOCX/LaTeX trước, PDF (TeX) sau — không gánh TeX sớm.**
- Mỗi phase một bước; v0 không được phình.

---

## 6. Alternatives considered

- **Port nguyên academic-research-skills / AutoResearchClaw**: bác bỏ — chúng là Claude Code/terminal,
  cần Docker/Agent Teams/filesystem mà Vercel serverless không có.
- **Khóa cứng Zotero (dùng Zotero làm format gốc)**: bác bỏ — CSL-JSON trung gian mở hơn, đỡ EndNote/Mendeley.
- **Full pipeline ngay từ v0**: bác bỏ — scope creep, rủi ro không ship được. Phase hóa thay thế.
- **LLM tự sinh citation cho tiện**: bác bỏ — vi phạm anti-hallucination, bịa DOI phá niềm tin.
- **Equation dạng MathML hoặc ảnh ở tầng sinh**: bác bỏ — MathML/ảnh là format *đích* (dẫn xuất), không
  phải nguồn. Giữ LaTeX làm nguồn cho phép Pandoc xuất mọi format (LaTeX/OMML/PDF) nhất quán; downgrade
  sớm sẽ mất khả năng chỉnh + sai font tạp chí.
- **Chạy Pandoc/TeX trên Vercel (route Next.js)**: bác bỏ — serverless không có binary/subprocess/
  filesystem; timeout 60s. Bắt buộc worker async.
- **Ép font equation = Times New Roman**: bác bỏ — TNR không phải math font (thiếu MATH table + glyph
  toán). Dùng STIX Two Math (Times-like, chuẩn tạp chí, OFL nhúng được).
- **Ép STIX qua clipboard MathML (copy-paste)**: bác bỏ — Word render MathML bằng font equation mặc
  định (Cambria), bỏ qua chỉ định font trong MathML. Control font chỉ khả thi khi gen file (OMML) →
  đó là lý do export file là con đường triệt để, không phải copy-paste.
- **TeX engine trong worker ngay từ v2**: hoãn — quá nặng. DOCX + LaTeX-source (Pandoc, không TeX) đủ
  cho v2; PDF (TeX) v3.
- **Worker export riêng tách khỏi spectra-worker**: hoãn — chỉ tách khi image quá nặng hoặc cần scale
  riêng. Stage 1 giữ một worker (khớp ADR-015 "Redis/PubSub forbidden Stage 1" tinh thần đơn giản hóa).
