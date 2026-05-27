# Labyra — Session Handoff R209→R219

**Phiên:** Figure Studio hoàn chỉnh + Điện hóa đầy đủ + PEC khởi động + Auth fix
**Trạng thái cuối:** mọi thứ tsc 0 / oxlint 0 / Firestore-guard pass. Drift = 0 (sau khi push). Worker live revision **00093** (sau deploy R219).

---

## 1. ĐÃ SHIP (theo round)

### Auth fix (R209) — 3 bug, KHÔNG phải R208
- **Cookie `__Host-` + HTTP localhost:** `__Host-` prefix bắt buộc HTTPS → localhost HTTP từ chối set cookie. Fix: dev dùng cookie tên `session` (no-secure), prod giữ `__Host-session`+secure. File: `session-cookie.ts` (MỚI) + route/proxy/server.ts.
- **Race redirect:** login gọi `router.push` trước khi session cookie set (async qua onIdTokenChanged) → proxy bounce. Fix: `establishSession(cred)` await POST /api/auth/session trước push. File: `auth/actions.ts`, `auth/index.ts`, `sign-in/page.tsx`, `sign-up/page.tsx`.
- **verifyIdToken fail khi mạng chặn Google:** Admin SDK fetch googleapis.com để verify chữ ký. Fix: dev fallback `decodeJwtPayloadDev` (decode KHÔNG verify, chỉ NODE_ENV≠production). File: `firebase/admin.ts`.
- **Gốc rễ:** mạng dev của nAM đôi khi chặn `googleapis.com` (font Google + verify token cùng fail). Đổi mạng/VPN là khỏi. Production Vercel (US) không bị.

### Figure Studio (R206→R208, R210, R211, R217, R218)
- **R206/R207:** modal Figure Studio (accordion axes/series/peaks + Plotly live preview + export footer), trace-based FigureConfig v2 (serializable), color-control (hex + wheel + scientific palettes Okabe-Ito/Viridis/Grayscale). SpectrumChart controlled.
- **R208:** **Figure Registry** (`figure-registry.tsx`) — `getFigureDefinitions(parsed) → FigureDefinition[]`. Section refactor registry-driven 0 if/else. DRS + Tauc controlled. Card-per-figure (Law of Proximity). Bỏ Delete khỏi detail page.
- **R210 (R5.4):** persistence per-user Firestore. Collection PHẲNG `tenants/{tid}/figureConfigs/{measurementId}__{figureKey}__{userId}` (KHÔNG nhét trong measurement doc — để BigQuery B1 export sạch). Debounce-save 800ms. `figure-configs.ts` (queries, MỚI) + firestore.rules (own-user rule). **CẦN deploy rules: `firebase deploy --only firestore:rules`**.
- **R211:** TGA/DSC/OCP vào registry (controlled + descriptors). Section thuần registry.
- **R217:** nút **"Publication theme"** (Nature/ACS) trong modal — `applyPublicationTheme()`: grid off, frame on, ticks inside, palette Okabe-Ito, lineWidth 1.75. Thêm field `ticksInside` vào FigureConfig.
- **R218:** theme tick-inside đồng bộ MỌI chart (ext + echem + tafel). Export SVG/PNG/PDF đã đầy đủ sẵn (xác nhận, không cần làm).

### Điện hóa (R212, R213, R214, R215)
- **R212:** Tafel/LSV/CV/EIS — type (`spectra-analysis-echem.ts`) + chart (`spectrum-chart-echem.tsx`) + metrics (`echem-metrics.tsx`) + registry. EIS Nyquist equal-aspect. Worker đã có parser sẵn (cv/lsv/tafel/eis), app chỉ thiếu display.
- **R213:** tách **"Re-analyze"** khỏi "Edit figure" (thẩm mỹ vs xử lý số liệu). `echem-params-dialog.tsx` (MỚI) nhập area/reference/pH/reaction/iR/scanRate/nElectrons → POST reanalyze với metadata (route nhận `body.metadata`, whitelist 8 key, merge vào doc trước publish). Icons.refresh thêm vào icons.tsx.
- **R214:** Tafel plot ĐÚNG (log|j| vs η) — sửa bug chart cũ vẽ E-vs-j. Worker `tafel.py` trả `tafel_curve`. `tafel-chart.tsx` (MỚI) + **Range Selector** (kéo chọn vùng → client-side OLS fit instant, KHÔNG gọi worker — an toàn vì worker đã trả curve đã xử lý RHE/density).
- **R215:** LSV cũng trả `tafel_curve` → LSV hiện 2 figure (E-I + Tafel view từ LSV). TafelChart nhận props `curve`+`autoSlope` (dùng chung Tafel type lẫn LSV).

### Subscript công thức (R216)
- `formatSciText`/`SciText` (đã có sẵn trong format-units.tsx) áp vào sample label + filename + chart title. `MoS2→MoS₂`, `WO3→WO₃`. An toàn với mã mẫu (`MoS2-RGO-001→MoS₂-RGO-001`, `sample-001` không đụng).

### PEC khởi động (R219)
- **Worker `pec_jv.py` (MỚI):** J-V dưới ánh sáng. photocurrent onset, j@1.23V_RHE, **STH%** (`j×1.23/P_light×100`). Cảnh báo: applied bias → báo ABPE không phải STH (Coridan EES 2015). main.py wire + metadata (lightPower/appliedBias/area).
- **App:** PECJVParsedData type + PECJVChart (E vs j, light/dark 2 đường) + PECJVMetrics + registry. PEC dùng `isEchem` cho metrics nhưng KHÔNG bật Re-analyze button (dialog chưa có light-power/bias field — deferred, dùng `hasReanalyzeParams` tách riêng).

---

## 2. CHƯA LÀM (việc phiên sau — scope đã chốt)

1. **PEC Mott-Schottky:** 1/C² vs E → flat-band potential + donor density (linear fit). Worker parser MỚI + app type/chart/metrics.
2. **PEC Chronoamperometry chopped:** j vs t, on/off light steps. Worker parser MỚI + app.
3. **PEC light-power/bias input trong Re-analyze dialog:** hiện PEC nhập metadata lúc upload; dialog `echem-params-dialog.tsx` cần thêm field lightPower + appliedBias + mở rộng `hasReanalyzeParams` để gồm pec_jv.
4. **Figure Builder** (ảnh đề xuất): ghép panel a/b/c/d cho paper (canvas kéo-thả). Feature lớn riêng.
5. **GCD** (galvanostatic charge-discharge — pin/siêu tụ): worker có type `gcd` chưa parser. specific capacity, coulombic efficiency, rate capability.

---

## 3. LƯU Ý KỸ THUẬT / GOTCHAS PHIÊN NÀY

- **Deploy fail Vercel (đã xảy ra):** push thiếu file → registry import file chưa có export → build fail. Bài học: **LUÔN `pnpm exec tsc --noEmit` trước `git push`** (không chỉ `pnpm dev` — dev lười-compile không bắt hết). Cân nhắc thêm `.husky/pre-push` chạy tsc (chưa làm, đề xuất).
- **R211→R219 các chart phụ thuộc nhau** (registry import ext/echem/tafel/drs/tauc) — copy thiếu 1 file là build vỡ. Copy ĐỦ BỘ.
- **EIS circuit fit** cần lib `impedance` trong worker image — kiểm requirements.txt (nếu thiếu → circuit_fit trả error, chỉ model-free).
- **iR-correction:** form chỉ có toggle "đã iR-corrected" — worker KHÔNG tự bù iR. Auto-iR cần Ru từ EIS high-freq (chưa làm).
- **Worker revision:** 00091 (trước phiên) → 00092 (R214 tafel) → 00093 (R219 pec). Mỗi sửa parser PHẢI `bash deploy.sh` (git push ≠ deploy).
- **Reference electrodes worker hỗ trợ:** ag/agcl (sat + 3M), sce, hg/hgo, rhe, she/nhe — bảng offset trong lsv.py + tafel.py.

---

## 4. CHECKLIST DEPLOY (xác nhận trước khi coi phiên xong)

- [ ] App: `git status -sb` = clean, push hết (R209→R219)
- [ ] Worker: push hết + `bash deploy.sh` → revision 00093 live
- [ ] `firebase deploy --only firestore:rules` (cho figureConfig persistence R210)
- [ ] Vercel env SPECTRA_WORKER_URL (Prod + Preview) — đã làm phiên này
- [ ] Test login (sau auth fix) + test 1 measurement điện hóa (LSV → Re-analyze → overpotential)

---

## 5. STACK / RULES KHÔNG ĐỔI (nhắc cho phiên mới)
- App: Next.js 16 + shadcn + Tremor + Tailwind v4 + Firebase + Plotly. oxlint+oxfmt (KHÔNG ruff/prettier). proxy.ts middleware. @tabler icons qua Icons object (icons.tsx). Mọi Firestore query có tenantId. React hooks trước early return.
- Worker: Python 3.13 FastAPI Cloud Run, ruff. Parsers src/parsers/. Pub/Sub trigger. Deploy `bash deploy.sh`.
- Sandbox Claude: app /tmp/app, worker /tmp/worker. App patch: nAM copy file từ /mnt/d/labbook-patches/ rồi commit (NO patch script). Worker: patch script.
- Figure Studio = thẩm mỹ; Re-analyze = xử lý số liệu (tách bạch, R213).
