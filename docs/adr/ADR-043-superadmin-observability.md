# ADR-043: Superadmin Observability Dashboard — Same-app Route, MVP 3 Widgets

> **Status**: Proposed (design-only, code R237)
> **Date**: 2026-05-28
> **Context refs**: Cost Guard v2 telemetry (R170), Firebase Functions backupCostsDaily (R171), target architecture tree (Horizon A1/A4/A5), useIsSuperAdmin auth claim (R223)
> **Supersedes/relates**: extends existing `/dashboard/superadmin/costs` UI; consumes data model from ADR-042 (group quotas)

---

## 1. Context

Founder (nAM) cần một trang quản lý duy nhất để nhìn toàn cảnh Labyra **xuyên tenant**: AI cost theo
thời gian, request volume, error rate, group nào tốn nhất, paper pipeline có healthy không. Không
có dashboard này = mù khi mở beta — không biết bill bao nhiêu, không biết tenant nào abuse, không
phát hiện được anomaly trước khi user phàn nàn.

Hiện tại đã có một phần: `/dashboard/superadmin/costs` UI (memory ghi "API already exists" trong
target tree A4). Cần mở rộng thành ops console đầy đủ + thiết kế đúng để các widget sau plug vào
mà không phải refactor.

**Quyết định kiến trúc ở đây — không phải chi tiết widget.**

---

## 2. Decision

### 2.1 Hosting — same app, route riêng (không tách subdomain)

Route nằm trong cùng app Labyra (`labyra-app` repo, Vercel deploy hiện tại):

```
/dashboard/superadmin/
  ├── overview              ← R237 MVP — 3 widget lõi
  ├── costs                 ← đã có, mở rộng
  ├── tenants               ← sau — danh sách tenant + drill-in
  ├── groups                ← sau — danh sách group + plan + quota
  ├── pipeline              ← sau — Pub/Sub queue depth, OCR fail
  └── ai-models             ← sau — cost per model, latency, error rate
```

**Lý do same-app (không tách `admin.labyra.com`):**
- Tái dùng auth Firebase + sidebar + theme + components + i18n
- 1 codebase, 1 deploy
- Bảo vệ bằng claim `role: superadmin` + middleware check
- Scale founder hiện tại (1 ops user) phù hợp same-app

**Khi nào tách subdomain (trigger gated):**
- Có team ops ≥ 3 người
- Cần monitor uptime khi app chính sập (independent failover)
- Bundle app chính bị admin widget kéo nặng quá rõ

→ Quyết định tách subdomain = ADR riêng sau, không phải bây giờ.

### 2.2 Access control

- Gate: middleware check `claims.role === 'superadmin'` + `pathname.startsWith('/dashboard/superadmin')`
- Reject với 404 (KHÔNG 403) — tránh lộ existence route admin
- Hiện tại: 1 user duy nhất (nAM) có claim `role: superadmin`
- Sau: phân cấp `owner / operator / support` (open question §7)

### 2.3 Data sources — tận dụng telemetry hiện có

| Widget data | Source | Status |
|---|---|---|
| AI cost | Firestore `_costs/{date}` (R170) + `backupCostsDaily` (R171) | ✓ có |
| Request volume | structured logs Cloud Logging (R170) → BigQuery (target A5) | một phần |
| Latency p50/p95/p99 | Cloud Logging → BQ aggregation | cần A5 logger expand |
| Error rate | Cloud Logging error events | một phần |
| Group quota usage | Firestore `tenants/{tid}/groups/{gid}/usage/{month}` (ADR-042) | sẽ có sau R236 |
| Tenant list + plans | Firestore `tenants/{tid}` + `groups/{gid}` | sẽ có sau R236 |
| Pipeline health | Pub/Sub metrics + worker logs | cần wire |
| Pinecone usage | Pinecone API + namespace count | cần wire |

**Nguyên tắc data:**
- KHÔNG truy vấn trực tiếp Firestore từ client side (cost cao + lộ structure)
- API endpoints `/api/superadmin/*` server-side aggregate → trả về client
- Cache server-side (revalidate 60s đến 5 phút) — dashboard không cần realtime tuyệt đối

### 2.4 Tech stack — Tremor + recharts (đã có)

Memory CLAUDE.md ghi Tremor đã trong stack. Tremor có:
- Dashboard blocks built-in (Card, LineChart, BarList, Tracker)
- Theming khớp shadcn (qua Tailwind tokens)
- Tốt cho admin dashboard hơn shadcn pure

Nguyên tắc UI:
- Tremor cho chart + metric card
- shadcn cho navigation, dialog, form
- Không thêm dep mới (Plotly, D3) trừ khi widget cần đặc biệt

### 2.5 MVP — 3 widget lõi cho R237

**Widget 1: Cost timeline**
- LineChart 30 ngày AI cost (USD) theo ngày
- Toggle breakdown: total / per tier (T0-T5) / per provider (Anthropic/Gemini/Mistral)
- Số tổng tháng này + so sánh tháng trước

**Widget 2: Volume + Error**
- 2 number cards: tổng request 24h, % error rate
- Sparkline 7 ngày
- Top 5 routes nhiều request nhất

**Widget 3: Group leaderboard**
- BarList top 10 group AI cost cao nhất 30 ngày
- Mỗi row: group name, tenant name, cost, % quota dùng
- Click → drill-in /superadmin/groups/{gid} (sau)

→ 3 widget này đủ trả lời 80% câu hỏi vận hành: bill thế nào, hệ thống có chạy không, ai tốn nhất.

---

## 3. Lộ trình phase

| Phase | Scope | Output |
|---|---|---|
| **v0 (R237)** | MVP 3 widget + middleware gate | `/dashboard/superadmin/overview` chạy được |
| **v1** | Drill-in tenants + groups | `/superadmin/tenants/{tid}` chi tiết quota, member, paper |
| **v2** | Pipeline health + Pinecone | Pub/Sub queue, OCR fail, namespace count |
| **v3** | Alerts + anomaly detection | Cost spike alert, error rate alert (email/Slack) |
| **v4** | Integration option | Helicone/Langfuse proxy cho LLM call tracing chi tiết |
| **v5 (trigger)** | Tách `admin.labyra.com` | Khi nào có team ops hoặc uptime concern |

---

## 4. Scope CHỐT CỨNG R237 v0

**Làm:**
- Middleware check `role: superadmin` cho `/dashboard/superadmin/*` (return 404 nếu không)
- Trang `/dashboard/superadmin/overview` render 3 widget
- API endpoints server-side:
  - `GET /api/superadmin/costs/timeline?days=30&breakdown=tier|provider`
  - `GET /api/superadmin/volume?hours=24`
  - `GET /api/superadmin/groups/leaderboard?days=30&limit=10`
- Caching server-side (revalidate 60s)
- Loading skeleton + error states (Tremor + shadcn standard)
- Navigation entry trong sidebar (chỉ hiện với role:superadmin)

**KHÔNG làm v0 (defer):**
- Drill-in tenant/group (v1)
- Pipeline + Pinecone widget (v2)
- Alerting (v3)
- Helicone integration (v4)
- Realtime updates (server-sent events / Firestore listeners)
- Audit log của superadmin actions
- Multi-superadmin role (operator/support hierarchy)
- Export CSV / báo cáo PDF

---

## 5. Consequences

**Tích cực:**
- Có "mắt" vận hành ngay từ trước khi mở beta — phát hiện anomaly trước user
- Cost monitoring đúng lúc R236+ Ask cross-library ship (kết hợp tự nhiên với ADR-042 quota)
- Tận dụng telemetry sẵn có (R170/R171) — không cần xây mới
- Same-app = không phí cài đặt mới, founder bandwidth thấp

**Rủi ro / cần theo dõi:**
- **Bundle size**: Tremor + chart deps có thể kéo bundle. Phải route-level lazy load (Next.js dynamic import) cho `/superadmin/*` → user thường không tải.
- **Data freshness**: cache 60s → có thể không thấy spike tức thì. Đủ cho ops thường, không đủ cho incident response → v3 alert sẽ giải.
- **Security của API endpoints**: KHÔNG được expose qua client SDK. Phải server-side với middleware check claim mỗi request.
- **Cost của dashboard chính nó**: Firestore reads + BigQuery queries cho widget có thể tốn. Cache aggressive (60s-5min).

**Quyết định bị ràng buộc bởi ADR này:**
- Same-app cho đến trigger tách subdomain
- Tremor + shadcn, không thêm dep chart mới
- API endpoints server-side với caching
- 1 superadmin role hiện tại, phân cấp sau

---

## 6. Alternatives considered

- **Tách `admin.labyra.com` ngay**: bác bỏ — over-engineering giai đoạn founder 1-user. Setup 2 repo + sync component đau.
- **Helicone/Langfuse drop-in proxy từ đầu**: bác bỏ giai đoạn này — họ là layer LLM observability bổ sung, không thay self-built dashboard. Tích hợp v4 khi cần tracing chi tiết per-call.
- **Grafana + Prometheus self-host**: bác bỏ — overkill, setup nặng cho founder solo. Phù hợp scale lớn hơn.
- **PostHog cho admin dashboard**: bác bỏ — PostHog mạnh ở user behavior + funnel, không phải cost observability. Sẽ tích hợp khi có user analytics need.
- **Realtime Firestore listeners cho widget**: bác bỏ v0 — cost Firestore read cao, complexity không xứng. Cache 60s đủ.
- **Embed Cloud Monitoring iframe**: bác bỏ — UX rời rạc, không tùy biến được cho Labyra context.

---

## 7. Open questions

1. **Phân cấp superadmin sau (owner/operator/support)?** Cần khi onboarding team. Schema để chỗ: `claims.role` có thể là array hoặc map sau.
2. **Audit log của superadmin actions?** Mọi action superadmin (xóa data, đổi plan tenant) cần ghi vào immutable log (target C2 SOC2). Defer v3.
3. **Tenant impersonation** ("login as user" để debug)? Mạnh nhưng nguy hiểm. Defer + cần audit log + tenant consent.
4. **Alert channel**: email vs Slack vs PagerDuty? Email đủ giai đoạn solo. Defer v3.
5. **Mobile-responsive admin?** Founder hay xem trên mobile? Nếu có → ưu tiên Tremor mobile-friendly từ đầu.

---

## 8. Cross-references

- `ADR-042` — Pricing + Quota (data model upstream; group quota widget consume từ đây)
- `ADR-019` — AI Tier (Cost Guard telemetry per-tier → widget 1 breakdown)
- `targetarchitecturetree.md` Horizon A — A1 tracing + A4 cost dashboard + A5 logger là 3 trụ data của ADR này
- `R170` — Cost Guard v2 (`_costs/` collection structure)
- `R171` — Firebase Functions cron (backupCostsDaily — data nguồn cho timeline)
- `R223` — useIsSuperAdmin claim đã có
