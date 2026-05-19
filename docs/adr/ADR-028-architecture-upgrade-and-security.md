# ADR-028 — Architecture Upgrade Strategy & Security Hardening

> Roadmap nâng cấp kiến trúc Labyra để tăng linh hoạt + mở rộng, kèm chiến lược bảo mật đạt Mozilla Observatory 100/100.

**Status**: Proposed
**Date**: 2026-05-19
**Round**: R180 (planning)
**Related**: ADR-019 (Tier Architecture), ADR-020 (Cost Controls), ADR-021 (Inter-tier), ADR-026/027 (R179 series)
**Supersedes**: N/A — extends current architecture

---

## 1. Executive Summary

Sau khi review codebase R175 (63K LOC, 6-tier AI live, 1 internal pilot BKU) và 5 chiến lược nâng cấp đề xuất (Event-Driven Agentic, CQRS, mTLS, MCP, Idempotency), kết luận:

- **2 chiến lược nên ship ngay** (R176–R180): Idempotency Key, Feature Flags
- **2 chiến lược ship sau có 3–5 tenant** (R180–R190): Event-Driven Agentic (extend R167), MCP Server (strategic)
- **3 chiến lược defer** đến scale phase: CQRS toàn hệ thống, mTLS, Redis rate limiter
- **7 chiến lược bổ sung** cần thiết hơn nhưng chưa có trong list ban đầu

Mục tiêu bảo mật **Mozilla Observatory 100/100** đạt được qua 8 HTTP security headers + CSP nonce-based với `strict-dynamic`, ship được trong 1 round R181-S (security stage 1.5).

---

## 2. Context & Hiện trạng

### 2.1 Codebase tại R175

```
labyra-app:                ~46,600 LOC (TS + JS + CSS)
labyra-spectra-worker:     ~8K–12K LOC Python
lsis-playground:           ~3K–5K LOC TS (đang dev)
docs/:                     9,422 LOC Markdown
Tổng:                      ~63,000 LOC
```

Stack đang chạy production:
- Next.js 16 App Router + TypeScript strict + shadcn/ui + Tremor
- Firebase (Firestore + Auth + Functions + Storage)
- Cloud Run Python worker (spectra parsing + AI pipeline)
- Pinecone serverless (1 namespace/tenant)
- 6-tier AI stack (Gemini 2.5 Flash / Sonnet 4.6 / Opus 4.7)
- Pub/Sub async cho paper processing (R167)

### 2.2 Security baseline hiện tại

Theo `proxy.ts` (R162 Stage 1):
- ✅ CSRF protection cho `/api/*` POST/PUT/PATCH/DELETE
- ✅ Rate limiting via Firestore `_rate_limits/{key}`
- ✅ Origin allowlist
- ✅ Firebase Auth + tenantId claim mandatory
- ✅ Firestore security rules per-tenant
- ✅ Signed URL upload (bypass Vercel bandwidth)
- ❌ Chưa có HTTP security headers (CSP, HSTS, X-Frame-Options...)
- ❌ Chưa có Subresource Integrity (SRI)
- ❌ Chưa có security.txt / well-known endpoints

Mozilla Observatory hiện tại ước tính: **~45–55/100 (Grade C/C+)** — thiếu CSP và HSTS là 2 penalty lớn nhất (-25 và -20).

---

## 3. Part A — Architecture Upgrade Strategy

### 3.1 Review 5 chiến lược đề xuất

#### Chiến lược 1: Event-Driven Agentic Workflow (Pub/Sub)

| Aspect | Đánh giá |
|---|---|
| **Verdict** | ✅ SHOULD ADOPT — extend R167 pattern |
| **Vị trí trong R175** | Layer B (Backend) — `/api/chat/route.ts` gọi trực tiếp Cloud Run worker |
| **Đề xuất** | T0 Router publishes Event JSON → Pub/Sub topic `ai-tier-dispatch` → T1-T4 subscribers process độc lập |
| **Lợi ích** | (1) Decouple T0 khỏi T1-T4 — Gemini rate limit không block Sonnet; (2) Retry + DLQ tự động; (3) Backpressure khi 1 tier nghẽn |
| **Trade-off** | Latency +50–200ms per hop; phải redesign streaming UX |
| **Khi nào ship** | R180–R185, sau 3–5 tenant active |
| **Effort** | ~2 tuần (mở rộng pattern R167 sẵn có) |

```typescript
// Event schema đề xuất
interface AIDispatchEvent {
  conversationId: string;
  messageId: string;
  tenantId: string;
  userId: string;
  tier: 1 | 2 | 3 | 4;
  feature: 'lab_ops' | 'theory' | 'spectrum_analysis' | 'paper_writing';
  payload: { message: string; context?: Record<string, unknown> };
  idempotencyKey: string;        // SHA-256 (xem chiến lược 5)
  publishedAt: number;
}
```

#### Chiến lược 2: CQRS (Tách Đọc/Ghi)

| Aspect | Đánh giá |
|---|---|
| **Verdict** | ⚠️ PARTIAL ADOPT — không cho toàn hệ thống |
| **Lý do** | Firestore < 10M docs đọc nhanh, chưa hit pain point. CQRS toàn hệ thống thêm eventual consistency bug |
| **Đề xuất scope hẹp** | Chỉ áp dụng cho: (a) Dashboard analytics → sync sang BigQuery; (b) Lineage Explorer graph traversal → Firestore denormalized hoặc Neo4j |
| **Trade-off** | Eventual consistency: user vừa ghi xong, query lại không thấy ngay — UX research lab rất ghét |
| **Khi nào ship** | R185+, khi Firestore aggregate query > 1s hoặc Lineage > 1000 nodes |
| **Effort** | ~3 tuần cho 2 use case hẹp |

#### Chiến lược 3: mTLS / Service-to-Service Auth

| Aspect | Đánh giá |
|---|---|
| **Verdict** | ❌ DEFER — quá sớm |
| **Lý do** | GCP Service Account + OIDC token-based auth đã đủ zero-trust trong VPC. mTLS thêm cert rotation overhead lớn |
| **Đề xuất thay thế** | (1) Service Account với OIDC token; (2) Secret Manager rotation cho API keys; (3) VPC Service Controls cho data egress |
| **Khi nào ship** | R200+ hoặc khi customer enterprise require SOC 2 Type II |
| **Effort** | ~4 tuần (cert infra, monitoring, rotation) |

#### Chiến lược 4: Model Context Protocol (MCP)

| Aspect | Đánh giá |
|---|---|
| **Verdict** | 🔵 STRATEGIC ADOPT — pitch differentiator |
| **Lý do** | MCP là standard mới của Anthropic. Adopting sớm = lock-in lợi thế khi ecosystem grow. **Đây là move strategic nhất** trong 5 chiến lược |
| **Lợi ích pitch** | "Labyra là lab SaaS đầu tiên ở SEA expose MCP server — researcher có thể dùng Claude Desktop, Cursor, hoặc bất kỳ AI agent nào để query lab data trực tiếp" — unique selling point cho investor |
| **Đề xuất impl** | Bắt đầu với 3 tools đơn giản: `listChemicals`, `searchPapers`, `recentExperiments` thành MCP server tại `src/lib/ai/mcp/server.ts` |
| **Trade-off** | MCP spec evolving — phải treat experimental layer, không production-critical |
| **Khi nào ship** | R180–R190 |
| **Effort** | ~2 tuần cho MVP MCP server |

#### Chiến lược 5: Idempotency Key + Zod DTO

| Aspect | Đánh giá |
|---|---|
| **Verdict** | ✅ SHIP NOW — cấp thiết |
| **Lý do** | R167 paper upload có thể duplicate khi Vercel timeout retry → bug đang ẩn chưa explode vì 1 tenant |
| **Đề xuất** | SHA-256 content hash làm idempotency key (đã có sẵn R160 spectra-1) apply lên: (1) paper upload; (2) experiment create; (3) AI cost recording; (4) spectrum upload |
| **Khi nào ship** | R176–R178 |
| **Effort** | ~1 tuần — low-effort high-value |

```typescript
// Đề xuất schema Idempotency
interface IdempotencyRecord {
  key: string;                    // SHA-256 hash
  resourceType: 'paper' | 'experiment' | 'spectrum' | 'ai_cost';
  resourceId: string;             // FK to created doc
  tenantId: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;           // TTL 7 ngày
}

// Path: tenants/{tid}/_idempotency/{key}
```

### 3.2 7 chiến lược bổ sung quan trọng hơn (chưa có trong list ban đầu)

#### Bổ sung 1: Feature Flag System

**Priority**: 🔴 High — ship R176

**Lý do**: Critical cho multi-tenant. Khi onboard tenant thứ 2, không thể "all or nothing" — phải enable AI tier mới cho 1 lab thử trước, gradual rollout.

**Đề xuất impl**: Tự build trên Firestore (không cần LaunchDarkly $0 stage):

```typescript
// Path: platform/featureFlags/{flagId}
interface FeatureFlag {
  flagId: string;                              // 'ai-tier-5-auto-trigger'
  description: string;
  defaultValue: boolean;
  overrides: Record<string, boolean>;          // tenantId → bool
  rolloutPercentage?: number;                  // 0-100
  expiresAt?: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

// Usage in code:
const enabled = await isFeatureEnabled('ai-tier-5-auto-trigger', tenantId);
if (enabled) { /* ... */ }
```

**Cost**: ~$1/tháng Firestore reads.

#### Bổ sung 2: Tenant Isolation Stress Test + Chaos Engineering

**Priority**: 🔴 Critical — ship R176 trước launch external

**Lý do**: Trước khi nhận lab external, phải có automated test verify tenant A KHÔNG bao giờ thấy data tenant B (kể cả qua Pinecone namespace bug, Firestore rule edge case). **Một bug leak data = mất hoàn toàn trust pitch.**

**Đề xuất impl**:
- Test suite `tests/security/tenant-isolation.test.ts`:
  - Tạo 2 tenant fake với data overlap (same paperTitle, similar materials)
  - Auth as tenant A user, attempt list/read/write tất cả collection trong tenant B
  - Assert tất cả requests fail với 403 hoặc empty result
  - Test cross-tenant qua: Firestore direct, Pinecone vector search, Storage URL, BigQuery
- Run trong CI mỗi PR, block merge nếu fail
- Manual chaos test: Inject malicious tenantId vào claims, verify proxy.ts reject

**Effort**: ~3 ngày để build initial suite.

#### Bổ sung 3: Backup + Disaster Recovery

**Priority**: 🟠 High — ship R178 trước paying customer

**Lý do**: Hiện chưa có. Mất Firestore data = mất luôn. GDPR/audit yêu cầu retention policy.

**Đề xuất impl**:
- Cloud Function `backupFirestoreDaily` (extend pattern R171 `backupCostsDaily`):
  - Schedule: `0 3 * * *` (03:00 UTC daily)
  - Export full `tenants/*` sang GCS bucket `gs://labyra-backups-{env}/firestore/{date}/`
  - GCS lifecycle: 30-day Standard → 90-day Coldline → 365-day delete
  - Cross-region replication: `asia-southeast1` → `us-central1` (DR)
- Cost: ~$5/tháng cho 1GB data

#### Bổ sung 4: Observability Stack (OpenTelemetry + Grafana)

**Priority**: 🟠 High — ship R180

**Lý do**: Hiện debug 1 lỗi cần check 4 nơi (Vercel logs / Cloud Run logs / Firebase Functions logs / BigQuery cost). Khi launch, customer report "AI chậm" → 30 phút để biết chậm ở đâu. Với OTel + Grafana = 30 giây.

**Đề xuất impl**:
- `@vercel/otel` package cho Next.js auto-instrumentation
- OTel collector → Grafana Cloud Free tier (10K series, đủ dùng đến 50 tenant)
- Custom spans cho: AI tier dispatch, RAG search, Cloud Run worker call, Firestore query
- Dashboard: Request flow trace (Vercel → Pub/Sub → Worker → AI → Firestore)

**Effort**: ~1 tuần setup, ~2 tuần custom instrumentation.

#### Bổ sung 5: API Gateway / Stage 2 Rate Limiting

**Priority**: 🟡 Medium — ship R185 khi 20+ labs

**Lý do**: Hiện rate limit qua Firestore (R162 Stage 1) — khi scale, Firestore writes cho rate limit chính nó thành bottleneck.

**Đề xuất**:
- Upstash Ratelimit (đã mention trong memory Stage 2 trigger) — $0 free tier 10K req/day
- Hoặc Cloudflare Workers trước Vercel
- Migrate khi: (1) > 20 tenant, hoặc (2) > 1M API calls/ngày

#### Bổ sung 6: Pinecone Standard Migration

**Priority**: 🟡 Medium — ship R190 khi 50+ tenant

**Lý do**: Hiện R167 dùng Pinecone serverless 1 namespace/tenant. Khi 50+ tenant, cold-start latency tăng đáng kể.

**Đề xuất**:
- Migrate sang **pgvector self-hosted** trên Cloud SQL (~$100/tháng)
- Hoặc **Pinecone Standard** với separate index per enterprise tenant
- Trigger: cold-start latency > 2s p95

#### Bổ sung 7: "Trust Layer" — Public Audit Log (STRATEGIC)

**Priority**: 🔵 Strategic — ship R195+ để defensible moat

**Lý do**: Differentiator thực sự cho academic market. Cho phép lab xuất audit log public-verifiable cho thesis defense / paper publication (Merkle tree hash). **Không ai khác trong lab SaaS có.**

**Đề xuất impl**:
- Mỗi `aiProvenance` doc có `merkleHash` field
- Daily batch: build Merkle tree từ tất cả provenance trong ngày → publish root hash lên public ledger (Ethereum L2 testnet hoặc IPFS)
- UI: "Export verifiable audit trail" → ZIP gồm provenance + Merkle proof + timestamp
- Researcher có thể prove trong paper rằng "AI analysis này được generate ngày X bằng model Y với citation Z"

**Cost**: ~$10/tháng cho L2 gas + IPFS pinning.

### 3.3 Roadmap tổng hợp

```
R176–R178 (TUẦN 1–4, PRE-LAUNCH):
  ✅ Chiến lược 5: Idempotency Key
  ✅ Bổ sung 1: Feature Flag System
  ✅ Bổ sung 2: Tenant Isolation Test Suite
  ✅ Part B: Security Hardening → 100/100 Mozilla

R178–R180 (TUẦN 5–8, LAUNCH WINDOW):
  ✅ Bổ sung 3: Backup + DR
  ✅ Bổ sung 4: Observability v1 (Grafana setup)
  ✅ Chiến lược 4 MVP: MCP Server với 3 tools

R180–R185 (THÁNG 3–6, POST-LAUNCH):
  ⚠️ Chiến lược 1: Event-Driven Agentic (extend R167)
  ⚠️ Chiến lược 4 full: MCP server đủ 10+ tools, public docs
  ⚠️ Bổ sung 4 full: OTel custom spans

R185–R195 (THÁNG 6–12, SCALE):
  ⚠️ Chiến lược 2 hẹp: CQRS chỉ cho Dashboard + Lineage
  ⚠️ Bổ sung 5: Upstash rate limit Stage 2
  ⚠️ Bổ sung 6: Pinecone migration
  ⚠️ Bổ sung 7: Trust Layer MVP

R200+ (NĂM 2, ENTERPRISE):
  ❌ Chiến lược 3: mTLS — chỉ nếu compliance require
```

---

## 4. Part B — Security Hardening: Mozilla Observatory 100/100

### 4.1 Mục tiêu

Đạt **Mozilla Observatory Grade A+ (100/100)** trên `app.labyra.com` (production) và `dev.labyra.com` trong R181-S.

### 4.2 Scoring breakdown (Mozilla Observatory)

Theo Mozilla scoring docs:

| Test | Modifier | Trạng thái Labyra hiện tại |
|---|---|---|
| `csp-not-implemented` | **−25** | ❌ Thiếu |
| `hsts-not-implemented` | **−20** | ❌ Thiếu |
| `x-frame-options-not-implemented` | **−20** | ❌ Thiếu |
| `x-content-type-options-not-implemented` | **−5** | ❌ Thiếu |
| `referrer-policy-not-implemented` | 0 | ❌ Thiếu |
| `cookies-not-secure` | −15 (nếu có cookie không Secure) | ⚠️ Cần check |
| `sri-not-implemented` | 0–5 | ❌ Thiếu |
| `cross-origin-resource-sharing-implemented-with-public-access` | −20 nếu mở `*` | ✅ OK |
| `hsts-preloaded` | **+5 bonus** | ❌ Chưa preload |
| `csp-implemented-with-no-unsafe-default-src-none` | **+5 bonus** | ❌ Chưa |

**Cộng dồn baseline hiện tại**: 100 − 25 − 20 − 20 − 5 = **30/100 (Grade D)** trong kịch bản worst case.

**Mục tiêu sau hardening**: 100 + 5 (HSTS preload) + 5 (CSP strict default-src 'none') = **110+/100 = Grade A+**.

### 4.3 8 HTTP Security Headers cần thiết

Triển khai trong `src/proxy.ts` (đã có sẵn cho CSRF, extend thêm headers):

```typescript
// src/proxy.ts — extend hiện tại
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest): NextResponse {
  // ... CSRF + rate limit + tenantId logic hiện có ...

  // Generate per-request nonce cho CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const isDev = process.env.NODE_ENV === 'development';

  // CSP nonce-based + strict-dynamic
  const cspHeader = `
    default-src 'none';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data: https://firebasestorage.googleapis.com https://*.googleusercontent.com;
    font-src 'self' data:;
    connect-src 'self'
      https://*.firebaseio.com
      wss://*.firebaseio.com
      https://*.googleapis.com
      https://api.anthropic.com
      https://generativelanguage.googleapis.com
      https://api.voyageai.com
      https://*.pinecone.io
      https://api.mistral.ai;
    media-src 'self';
    worker-src 'self' blob:;
    frame-src 'none';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
    block-all-mixed-content;
    report-uri /api/csp-report;
  `.replace(/\s{2,}/g, ' ').trim();

  // Build response
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // 8 security headers — THỨ TỰ NÀY QUAN TRỌNG
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return response;
}

export const config = {
  matcher: [
    '/((?!api/csp-report|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### 4.4 CSP nonce integration vào React components

```typescript
// src/app/[locale]/layout.tsx
import { headers } from 'next/headers';

export default async function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  const nonce = (await headers()).get('x-nonce') || undefined;

  return (
    <html lang="vi">
      <head>
        {/* Webpack chunks tự động pick up nonce */}
      </head>
      <body>
        {/* Inline scripts cần nonce */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `__webpack_nonce__ = ${JSON.stringify(nonce)};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
```

### 4.5 CSP Report endpoint

```typescript
// src/app/api/csp-report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  const report = await req.json();
  const db = getAdminFirestoreService();

  // Log CSP violations cho analysis
  await db.collection('platform/_security/cspViolations').add({
    report: report['csp-report'],
    userAgent: req.headers.get('user-agent'),
    timestamp: new Date(),
  });

  return new NextResponse(null, { status: 204 });
}
```

### 4.6 HSTS Preload submission

Sau khi deploy HSTS header với `preload` flag chạy ≥1 tháng stable:

1. Verify tại https://hstspreload.org/?domain=labyra.com
2. Submit preload list — Chrome/Firefox/Safari include trong 2–3 tháng
3. **CẢNH BÁO**: Sau preload, KHÔNG thể rollback. Tất cả subdomain phải HTTPS forever.

### 4.7 Firebase cookies — Secure + HttpOnly

Firebase Auth tự handle cookie security, nhưng cần verify:

```typescript
// src/lib/auth/server.ts — đảm bảo session cookie secure
import { auth } from '@/lib/firebase/admin';

export async function createSessionCookie(idToken: string) {
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

  return {
    name: '__Secure-session',  // __Secure- prefix enforces HTTPS
    value: sessionCookie,
    maxAge: expiresIn / 1000,
    httpOnly: true,
    secure: true,                // Required, never false in prod
    sameSite: 'strict' as const,
    path: '/',
  };
}
```

### 4.8 Subresource Integrity (SRI) cho 3rd party scripts

Nếu có 3rd party CDN scripts (analytics, etc):

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-..."
  crossorigin="anonymous"
></script>
```

Hiện Labyra không dùng 3rd party CDN — không cần SRI ngay. Khi add Google Analytics/Plausible, MUST có SRI.

### 4.9 Validation workflow

```bash
# Step 1: Deploy headers tới preview env
git checkout -b R181-S-security-headers
# ... apply patch ...
git push origin R181-S-security-headers
# Vercel preview deploy: labyra-app-r181-s.vercel.app

# Step 2: Test locally
curl -I https://labyra-app-r181-s.vercel.app | grep -E "(content-security|strict-transport|x-frame|referrer)"

# Step 3: Mozilla Observatory scan
# https://observatory.mozilla.org/analyze/labyra-app-r181-s.vercel.app

# Step 4: Google CSP Evaluator
# https://csp-evaluator.withgoogle.com/

# Step 5: SecurityHeaders.com
# https://securityheaders.com/?q=labyra-app-r181-s.vercel.app

# Step 6: Merge to main sau khi 100/100
```

### 4.10 Risks & Mitigation

| Risk | Mitigation |
|---|---|
| CSP block legitimate Firebase script | Test kỹ `connect-src` whitelist; monitor `/api/csp-report` 1 tuần report-only mode trước khi enforce |
| `strict-dynamic` break inline event handlers | Refactor tất cả `onclick=""` → `addEventListener()` trước khi enforce |
| HSTS preload không rollback được | Run HSTS 1 tháng `max-age=300` → 1 tháng `max-age=86400` → 1 tháng full `63072000` trước submit preload |
| Frame-Ancestors none block embedding | Nếu cần embed (Notion, Slack preview), chuyển sang `frame-ancestors https://*.notion.so https://*.slack.com` |

### 4.11 Beyond Mozilla 100/100 — Defense-in-Depth bổ sung

Đạt 100/100 chỉ là baseline. 5 layer phòng thủ thêm:

1. **Web Application Firewall**: Cloudflare WAF (free tier) trước Vercel — block OWASP Top 10 patterns
2. **API Key rotation tự động**: Cloud Function rotate Pinecone/Voyage/Anthropic keys mỗi 90 ngày qua Secret Manager
3. **Dependency scanning**: Snyk hoặc Dependabot trên GitHub, auto-PR cho CVE
4. **Penetration test**: Bằng tool free như OWASP ZAP, chạy hàng quý
5. **security.txt**: `/.well-known/security.txt` với contact email cho responsible disclosure:

```
# /public/.well-known/security.txt
Contact: security@labyra.com
Expires: 2027-05-19T00:00:00.000Z
Preferred-Languages: en, vi
Canonical: https://labyra.com/.well-known/security.txt
```

---

## 5. Decision Summary

### 5.1 Ship R176–R178 (Pre-launch)

- [x] **Idempotency Key** + Zod DTO (chiến lược 5)
- [x] **Feature Flag** system (bổ sung 1)
- [x] **Tenant Isolation** test suite (bổ sung 2)
- [x] **Mozilla 100/100** security headers (Part B)

### 5.2 Ship R178–R180 (Launch window)

- [x] **Backup + DR** Cloud Function (bổ sung 3)
- [x] **Observability v1** — Grafana setup (bổ sung 4)
- [x] **MCP Server MVP** với 3 tools (chiến lược 4)

### 5.3 Defer R180+

- Event-Driven Agentic full rollout
- CQRS hẹp cho Dashboard
- Trust Layer (Merkle tree)
- mTLS — chỉ nếu enterprise require

### 5.4 Reject

- CQRS toàn hệ thống — overengineered cho stage hiện tại
- Redis rate limiter Stage 2 — chưa hit ngưỡng

---

## 6. References

- ADR-019, ADR-020, ADR-021 — Current AI architecture
- `AI_ARCHITECTURE.md` v3.1 — Full AI design
- `ARCHITECTURE.md` Section 7 — XRD pipeline reference
- Mozilla HTTP Observatory scoring: https://github.com/mozilla/http-observatory/blob/main/httpobs/docs/scoring.md
- Next.js CSP guide: https://nextjs.org/docs/app/guides/content-security-policy
- MCP spec: https://modelcontextprotocol.io

---

## 7. Implementation Notes for Future Patches

### 7.1 Patch breakdown

```
round-181-s-security-headers-apply.py    # Part B fully
round-181-s-csp-report-endpoint.py       # CSP violation logging
round-181-s-csrf-cookie-secure.py        # Verify __Secure- prefix
round-182-idempotency-schema.py          # Firestore _idempotency collection
round-182-idempotency-middleware.py      # Apply to /api/papers, /api/spectra
round-183-feature-flag-firestore.py      # platform/featureFlags collection
round-183-feature-flag-hook.py           # useFeatureFlag() React hook
round-184-tenant-isolation-tests.py      # tests/security/*.test.ts
round-185-backup-firestore-cron.py       # Cloud Function daily backup
round-186-mcp-server-mvp.py              # src/lib/ai/mcp/server.ts
round-187-otel-vercel-setup.py           # @vercel/otel + Grafana
```

### 7.2 ADR follow-up

- ADR-029 — Idempotency contract specification
- ADR-030 — Feature Flag governance (who can toggle, audit log)
- ADR-031 — Mozilla 100/100 baseline + CSP policy details
- ADR-032 — MCP server scope (which tools to expose externally)

---

*Living document. Update with each implementation milestone. Version 1.0 — R180 planning.*
