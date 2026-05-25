# Labyra App — Roadmap
> Long-term planning. Update sau mỗi phase complete.
> See CLAUDE.md cho coding rules, AI_ARCHITECTURE.md cho system design.

<!-- R238-update-2026-05-25 -->
**Last updated**: 2026-05-25
**Current state**: R238 SHIPPED. Booking module hoàn thiện (timeline + form 6 nâng
cấp + Side-Sheet). Chuẩn hóa form 5 entity → Sheet quick-add. Material refocus thành
catalog tham chiếu KH + Master-Detail view với knowledge panel. 6-tier AI production
live. Next: xem "Active" bên dưới — ưu tiên UNIT TEST (0 test qua R200-238) + spectral
chart tương tác HOẶC lõi worker.

---

## Vision
Labyra Platform = AI-native lab management SaaS cho materials science research.
Multi-tenant từ đầu (Lab Vật liệu BKU = tenant #1, commercial scale sau).

---

## Stack
Next.js 16 + TypeScript strict + shadcn/ui + Tremor + Firebase + next-intl + Vercel.
Charts: recharts (dashboard) + Plotly.js (scientific) + Three.js (3D Phase D) + D3 (lineage + citation network).
AI: Anthropic Claude (Sonnet 4.6 + Opus 4.7) + Google Gemini 3 Flash + Voyage embed + Pinecone serverless + Mistral OCR.
Async pipeline: Vercel publisher → Cloud Pub/Sub → Cloud Run Python worker (R167).
Cron infra: Firebase Functions Gen 2 asia-southeast1 (R171).

---

## 🔐 Commercial launch track (ACTIVE — priority #1)
Goal: full paid commercial launch. Gated on security + RBAC + onboarding + billing.
Security criticals (C1/C2/C3), highs/mediums, RBAC (ADR-030), onboarding backend +
frontend + email — **ALL DONE** (xem lịch sử bên dưới). Còn lại:
- [ ] **E2E TEST**: incognito signup (invited email) → /onboarding → accept → dashboard.
- [ ] Tenant-create flow + self-serve: deferred to billing phase.

### 🌐 Domain activation checklist (when labyra.io purchased — DO ALL AT ONCE)
Buy at Cloudflare/Porkbun (at-cost). Then: DNS app.labyra.io→Vercel + SPF/DKIM/DMARC;
Resend verify domain + EMAIL_FROM; Vercel env (RESEND_API_KEY/EMAIL_ENABLED=true/
NEXT_PUBLIC_APP_URL); origin.ts add app.labyra.io; **CSP flip Report-Only→enforce sau
7d burn-in** (giờ ở proxy.ts không phải next.config.ts — ADR-031); HSTS preload submit;
Firebase Auth authorized domains. Expected Mozilla Observatory A+/100.

### Then (post-security)
- [x] Chemicals/Equipment/Bookings (port LabBook) — DONE. Booking module hoàn thiện
      (R213-R230). Chemical + Equipment tables/forms live.
- [ ] Billing/Stripe + trial/paywall + Legal (Privacy/ToS, GDPR export/delete)
- [ ] Dashboard KPI + Spectra Comparison view

---

## 🚧 ACTIVE — chọn 1 hướng cho phiên mới (R239+)

### Ưu tiên cao: chất lượng / nợ
- **R239? UNIT TEST** — **0 test qua R200-238 (~37 round)**. Tài sản lớn không lưới
  an toàn. Bắt đầu: booking constants (duration/advance/overlap/isEquipmentBookable),
  material schema, services. `pnpm test:unit` (vitest.config.ts) đã có hạ tầng (G-8).
- Material data cũ: category 'chemical/reagent…' → migrate/sửa tay sang KH (oxide/...).

### Material catalog — feature lắp vào section đã chừa (R233 module hóa)
- **Spectral chart tương tác** (Plotly/ECharts): đỉnh XRD/Raman/FTIR vẽ biểu đồ +
  zoom + overlay nhiều nhiệt độ (thay bảng đỉnh). Data sẵn trong MaterialProfile. ~4h.
- **3D crystal viewer** (Three.js): render lattice từ latticeParams (h-WO₃ hexagonal
  tunnels, WS₂). Lớn.
- **Computer Vision** (nAM nêu): SEM/TEM imagery + morphology/particle-size/phase →
  thêm section detail panel.
- **SOP Timeline / version control** quy trình tổng hợp (git-style diff).
- Nhân Master-Detail catalog sang Chemical/Sample.

### Nâng entity theo Benchling/SciNote (tham khảo, áp cái khả thi)
- **Chemical**: PubChem async autocomplete, SMILES→2D render, SDS upload, cascading
  location (Phòng→Tủ→Ngăn), expiry highlight. (CAS lookup + GHS toggle đã có.)
- **Equipment**: calibration tracking (ngày gần/tiếp + nhắc), manual upload, internal
  ID, booking min/max duration.
- **Command Palette** Ctrl+K (kbar đã có).

### Lõi sản phẩm (nAM nêu cao hơn UI dài hạn)
- Worker phân tích phổ XRD/FTIR/Raman/UV-Vis/TGA — chưa hoàn thiện (3x analysis).
- E2E onboarding test.

---

## ✅ Completed Rounds

### R160–R167 — Foundation → Async pipeline (April–May 2026)
Next.js 16 + Firebase multi-tenant + i18n + AI ai-3/4/5. R161 XRD Tier1+2. R162 Stage1
security (ADR-015). R163 FTIR/Raman/UV-Vis refcards. R164 PROV-O ELN 7 entities +
lineage (ADR-016). R165 cleanup. R166 citation network data layer (ADR-017). R167 async
Pub/Sub paper pipeline 16s vs 60s (ADR-018).

### R168–R175 — Full 6-tier AI production (May 16)
6-tier abstraction + cost telemetry (ADR-019), Cost Guard v2 (ADR-020), Cloud Functions
cron + founder dashboard (R171/172), T4 Writer + T5 Auditor orchestrators (R173), UX
polish (R174), Writer citation `[authorYear]` (R175).

### R177–R183 — Worker migration + paper domain (May 17–19)
Worker Haiku→Gemini 3 Flash, Google Books resolver, document-type routing, paper domain
auto-classify (36-cat taxonomy, ADR-025), 29 FTIR + 25 Raman refcards seeded.
MaterialProfile global collection seeded (R183-2/3) — đỉnh phổ/bandgap/crystal + DOI.

### R190–R191 — Tech-debt + security hardening (May)
T0 cost telemetry fix + G-8 guardrail (∀ tier model ∈ PRICING, 11 tests) + vitest config.
nonce-CSP Report-Only (CSP → proxy.ts per-request nonce, zod jitless) ADR-031. Gemini SDK
retry explicit. ADR-032 (scaling decisions gom).

### R200–R213 — Chat + tables foundation (May)
Chat multimodal (ADR-036) + UI + system prompt (ADR-037), citation KaTeX. 7 bảng →
DataTable selectable/kebab/soft-delete-undo (measurements/experiments/samples/materials/
chemicals/equipment/bookings).

### R214–R230 — Booking module (May, ADR-038/039/040)
- Timeline (ADR-038): Week kéo-thả 2 chiều + resize 2 cạnh + DragOverlay + Month view +
  hover popover + filter user/group + business-hours shading + current-time line. Chặn
  past + completed (R218, áp mọi user incl admin).
- Denormalize (ADR-039): userName/groupName set lúc create (pre-tx lookup), bookings
  tenant-shared, group = display/filter.
- Limits single source (ADR-040): `features/bookings/constants.ts` — MIN/MAX_DURATION_MS,
  MAX_ADVANCE_MS, UNAVAILABLE_EQUIPMENT_STATUSES, BLOCKING_STATUSES, isEquipmentBookable,
  intervalsOverlap. Pure client+server. schema refine + service + form đồng bộ.
- Form 6 nâng cấp: error i18n + live-status dropdown (R226), duration tags (R227),
  conflict realtime (R228), Side-Sheet (R229), purpose presets (R230).
- R224 bulk select (bookings cancel / equipment delete confirm).

### R231–R238 — Material refocus + catalog + form chuẩn hóa (May 25)
- **R231a**: MaterialKnowledgePanel vào trang Material detail (đỉnh phổ/bandgap theo
  formula). Module hóa cho CV sau.
- **R232 [QUYẾT ĐỊNH KIẾN TRÚC]**: Material = catalog tham chiếu KH (KHÔNG inventory).
  Bỏ cas/quantity/unit/location/supplier/lot/purchase/expiry/hazard; giữ name/formula/
  category(KH)/+description. Inventory/CAS/GHS → Chemical. Category: oxide/sulfide/
  nitride/carbon/metal/polymer/composite/perovskite/two_dimensional/other.
- **R233-1/2**: Material catalog Master-Detail hybrid (lưới card 3 + detail panel 7,
  URL ?selected, Focus Mode, responsive). Detail = section module (KnowledgePanel khoa
  học + Sửa Sheet + Lifecycle). Chừa chỗ 3D/chart/CV/timeline.
- **R234–R237**: chuẩn hóa form New/Edit → Sheet quick-add cho material/experiment/
  chemical/sample (đồng bộ booking R229). Pattern: form onSuccess/onCancel +
  `<EntityFormSheet>` side=right. Trang /new + /[id] giữ. Layout chuẩn.
- **R238**: dọn nợ — service booking dùng constants (bỏ BLOCKING/overlaps riêng).

---

## Phase markers convention
`@phase R{NUM}{-suffix}` in code comments. Each architectural change → ADR.

Active ADRs: 015 Stage1 Security · 016 PROV-O ELN · 017 Citation Network · 018 Async
Worker · 019 AI Tier · 020 Cost Controls · 021 Inter-tier Protocols · 025 Paper Domain
Classification · 030 RBAC · 031 nonce-CSP · 032 AI Scaling · 033 RAG Scaling · 036 Chat
Image Attachments · 037 System Prompt Rewrite · 038 Booking Timeline Grid · 039 Booking
Denormalize · 040 Booking Limits.

---

## Deferred / legacy
- Citation network UI R166 Phase 6b (D3 force graph) — deferred, sau ADR-033 Phase 2 RAG.
- GraphRAG 6b — CHỈ sau ADR-033 Phase 2. KHÔNG MCP-hóa RAG nội bộ.
- Gemini 3 re-adoption: T1/T2 đã `gemini-3-flash-preview`; monitor thought_signature.
- BigQuery cost-drift integration (R176-2, fetchGoogleActual placeholder).
- T5 auto-trigger after T3 (need baseline). Citation export BibTeX/CSL.
- Bug #11 notifications. labbook-bku legacy housekeeping.
- equipment soft-delete (hiện hard-delete). 3 service thiếu updatedAt (non-bug).
- labyra-landing: L8 VN copy, L9 Preact, L10 a11y, L11 analytics, L12 domain, L13 email.

---

## Timeline reality check
- **Code**: ~52k LOC TypeScript (src thuần TS; functions/lib = compiled, gitignored),
  13k+ LOC docs.
- Production: 6-tier AI live, cost controls + cron + founder dashboard, booking module,
  material catalog, 5-entity form chuẩn hóa. Lab BKU ready.
- **Nợ nổi cộm**: 0 unit test qua R200-238 → ưu tiên lưới an toàn trước feature lớn.
