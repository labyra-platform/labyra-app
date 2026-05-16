# R175 → R176 Handoff

**Generated:** 2026-05-16
**For:** Next session continuing Labyra work after R175-1 Writer citation format.
**State:** R168-3.13 through R175-1 complete + pushed origin/main. Vercel deploy live.

---

## 1. R168→R175 cumulative shipped (May 16)

Massive session — 8 atomic commits, ~13,000+ LOC.

### R168-3.13 — AI architecture refresh + economics skill

- Replaced outdated `AI_ARCHITECTURE.md` v2.x (~2046 LOC) with v3.0 (303 LOC)
- New economics skill in `.claude/skills/labyra-economics/`
- Whitelisted `.claude/skills/` for repo tracking (R168-3.13c chore)

### R169 — 6-tier capability abstraction + cost telemetry

NEW source-of-truth: `src/lib/ai/config/capabilities.ts`

```ts
export type Capability =
  | 'security-router'      // Tier 0
  | 'tool-calling-cheap'   // Tier 1
  | 'rag-balanced'         // Tier 2
  | 'reasoning-balanced'   // Tier 3, Tier 4
  | 'reasoning-frontier'   // Tier 5
  | 'embedding' | 'rerank' | 'ocr';
```

`CAPABILITY_MAP` records provider+model+pricing per capability. `TIER_CAPABILITY` maps AiTier → Capability. `TIER_CONFIG` auto-derives via `selectProvider(tier)`. Edit one place to swap model.

AiTier type expanded `0|1|2|3` → `0|1|2|3|4|5` (R169-2).

Cost telemetry: `tenants/{tid}/_costs/{date}` aggregated by tier + feature + latency + tokens + grounding (R169-3/4).

ADR-019 documents this abstraction.

### R170 — Cost Guard v2 + per-feature telemetry + dry-run mode

4-gate pre-check in `src/lib/ai/governance/cost-guard.ts`:
1. Per-call estimate cap (USD)
2. Daily cap per tenant
3. Monthly cap per tenant
4. Feature-specific quota

Tier+feature combinations limited per tenant tier (`tenant.tier: free | pro | enterprise`).

Cost estimator in `src/lib/ai/cost/estimator.ts` predicts cost before LLM call.

Dry-run mode `?dry_run=1` returns intent decision + cost estimate without calling LLM.

ADR-020.

### R171 — Cloud Functions cron infrastructure (LIVE asia-southeast1)

NEW `functions/` directory (separate `package.json`, separate Node runtime).

**3 scheduled functions deployed**:

1. **`backupCostsDaily`** — 02:00 UTC daily, exports `tenants/{tid}/_costs/{date}` to `gs://labyra-app-dev.firebasestorage.app/_admin/cost-backups/`. 90-day GCS lifecycle policy (R173-2).
2. **`reconcileCostDrift`** — 02:30 UTC daily, compares estimated vs actual costs from Anthropic Usage API + Google Billing (BigQuery export, awaiting 24h initial sync).
3. **`ragasEvalWeekly`** — 03:00 UTC Sunday, samples 10 random conversations from past 7 days (tier ≥2). 11-metric quality evaluation via Opus 4.7 evaluator. Output: `tenants/{tid}/_evals/{yyyy-Www}/conversations/{id}`.

IAM:
- Service account: `cron-runner@labyra-app-dev.iam.gserviceaccount.com`
- Roles: `datastore.user`, `storage.objectAdmin`, `logging.logWriter`, `monitoring.metricWriter`, `bigquery.dataViewer`, `bigquery.jobUser`
- Compute SA `802854518465-compute@developer.gserviceaccount.com` impersonates cron-runner

Secret Manager: `ANTHROPIC_API_KEY`, `ANTHROPIC_ADMIN_KEY`, `GCP_BILLING_ACCOUNT_ID` (= `01545E-FF945F-4AF504`).

Setup script: `scripts/setup/r171-functions-iam.sh` (idempotent).

Cron jobs in Cloud Scheduler:
```
firebase-schedule-backupCostsDaily-asia-southeast1     0 2 * * * (UTC)
firebase-schedule-reconcileCostDrift-asia-southeast1   30 2 * * * (UTC)
firebase-schedule-ragasEvalWeekly-asia-southeast1      0 3 * * 0 (UTC)
```

Verified working: `gcloud scheduler jobs run firebase-schedule-backupCostsDaily-asia-southeast1` → function executed, found 1 tenant, skipped (no data yet), no errors.

### R172 — Superadmin dashboard (UI + API + RBAC)

Founder-only `/dashboard/superadmin/{costs,evals,drift}` pages:

- `costs`: KPI cards (Total cost, queries, avg cost/query, projected monthly), daily cost trend chart (recharts AreaChart stacked by tier), raw data table.
- `evals`: Weekly Ragas eval summaries + flagged conversations (low confidence).
- `drift`: Drift reports + alerts (estimated vs actual cost > 20%).

3 API routes:
- `GET /api/superadmin/costs?range=30`
- `GET /api/superadmin/evals`
- `GET /api/superadmin/drift?range=14`

All routes guarded by `requireSuperadmin()` in `src/lib/auth/superadmin-guard.ts`.

CLI: `scripts/set-superadmin.mjs` to promote users. nAM (uid `nvhn.7202@gmail.com`) promoted superadmin.

Hotfix R172-late: `getAuth()` (firebase-admin/auth) → `getAdminAuthService()` (labyra's wrapper) — default Firebase admin app not initialized in dev → 401 on superadmin routes.

i18n keys flattened to avoid `next-intl` `INSUFFICIENT_PATH` conflict: `nav.superadminCosts` (not nested `nav.superadmin.costs`).

### R173-4 — T4 Writer orchestrator

NEW `src/lib/ai/tier4-writer/`:
- `types.ts` — `WriterResult`, `SectionType` ('methods' | 'results' | 'discussion' | 'introduction'), `WriterCitation`
- `prompts.ts` — Section-specific system prompts (Methods past-tense, Results observations-only, Discussion mechanism-focused, etc.) + `detectSection()` heuristic
- `orchestrator.ts` — `runWriter()`: detect section → RAG search top-8 → stream draft (Sonnet 4.6) → extract `[citationKey]` citations
- `citation-loader.ts` (R175-1) — `loadPapersMetadata()` + `buildCitationKey()` for proper `[authorYear]` keys

Wired in `src/app/api/chat/route.ts`:
```ts
if (tier === 4) {
  const writerResult = await runWriter({ userMessage, tenantId, sectionType: 'auto', onTextDelta, onSearchComplete });
  // emit writer_complete event
}
```

New SSE events: `rag_search_complete`, `writer_complete`.

### R173-5 — T5 Auditor orchestrator + explicit endpoint

NEW `src/lib/ai/tier5-auditor/`:
- `types.ts` — `AuditFinding`, `Verdict` ('supported' | 'partially_supported' | 'unsupported' | 'contradicted'), `ClaimType` ('numerical' | 'citation' | 'mechanism' | 'definition')
- `claim-extractor.ts` — Heuristic regex-based claim extraction (numerical patterns with units, citation `[keyYear]`, mechanism hints VN+EN, definition hints; max 15 claims/run)
- `audit-prompts.ts` — Opus 4.7 evaluator system prompt (strict JSON output)
- `orchestrator.ts` — `runAuditor()`: extract claims → build evidence from RAG chunks → single Opus 4.7 batch call → parse JSON findings → compute weighted overall confidence → save `tenants/{tid}/aiAudits/{auditId}`

Verdict weights: supported=1.0, partial=0.6, unsupported=0.3, contradicted=0.0.

NEW endpoint: `POST /api/messages/[id]/audit` (Option B — explicit trigger, not auto). Body: `{ conversationId }`. Auth: Bearer + tenantId match. Cost Guard pre-check tier 5.

Auto-trigger after T3 deferred — need Lab BKU baseline data first to calibrate cost-effectiveness.

### R173-hotfix4 — Vercel build fix

Vercel build failed: TS tried to type-check `functions/` directory which has its own `package.json` with `firebase-functions` dep not in root `node_modules`. Fix: added `"functions"` to root `tsconfig.json` exclude array.

### R174 — UX polish + T4 routing + Gemini stability (8 sub-hotfixes)

**R174-1 — Gemini stability rollback**: T0+T1+T2 models rolled back from `gemini-3.1-flash-lite-preview` / `gemini-3-flash-preview` → `gemini-2.5-flash`. Reason: Gemini 3 series requires `thought_signature` field in multi-turn function calls; SDK `@google/generative-ai` 2026-05 doesn't expose pass-through. Defer to R175+ when SDK signature support lands.

**R174-2 — Tier badge realtime**: `ChatStreamEventV2.message_start` now carries `tier` field. `useChatStream` sets tier on pending assistant message immediately, no F5 reload needed.

**R174-3 — ThinkingIndicator** (Gemini-style): NEW `src/features/ai/components/thinking-indicator.tsx` with 3 animated dots. MessageList renders ThinkingIndicator in place of empty assistant bubble while `isStreaming`.

**R174-4 — Widen chat container**: ChatShell `max-w-3xl` → `max-w-5xl`, `h-[calc(100vh-7rem)]` → `h-[calc(100vh-4rem)]`.

**R174-5 — Gemini functionResponse role split** (P0 fix): `toGeminiHistory()` previously placed `functionResponse` parts on role='user'. Gemini 2.5-flash rejects: `Content with role 'user' can't contain 'functionResponse' part`. Fix: split into separate history entries — text+functionCall on role='model', functionResponse on role='function'. Restores T1 tool calling.

**R174-6 — T4 keyword override** (workaround): Gemini 2.5-flash classifier with few-shot prompt unreliable for tier=4. Defaults to T2 even for "Draft methods section". Workaround: pre-classifier regex check in `intent-classifier.ts`:

```ts
function detectT4Override(message: string): IntentDecision | null {
  const draftVerbs = /\b(draft|write|compose|viết|soạn|...)\b/i;
  const sectionTypes = /\b(methods|results|discussion|introduction|phần phương pháp|...)\b/i;
  if (draftVerbs.test(lower) && sectionTypes.test(lower)) {
    return { tier: 4, feature: 'paper_writing', reason: 'keyword_override', confidence: 0.95 };
  }
  return null;
}
```

**R174-7 — Classifier prompt expansion + tier=4 support**: CLASSIFIER_SYSTEM updated with Tier 4 (Writer) section + 4 examples. JSON spec tier union 1|2|3 → 1|2|3|4. `normalizeTier` accepts tier=4. maxTokens 100 → 256 (Gemini 2.5-flash verbose output truncated). FALLBACK_TIER = 2 (Sonnet/RAG safer default).

**R174-8 — Writer prompt strict no-questions**: Added rules:
- DO NOT ask for clarification or additional information.
- Use REASONABLE PLACEHOLDER VALUES (X g, Y mL) when info missing.
- DO NOT end with follow-up questions or "Bạn có muốn..." prompts.
- The draft itself IS the final output.

**R174-9 — Tier label consistency**: messages/{en,vi}.json updated:
- `tierWriter`: 'Writer' → 'T4 Writer'
- `tierAuditor`: 'Auditor' / 'Kiểm duyệt' → 'T5 Auditor' / 'T5 Kiểm duyệt'

Matches T1 Flash / T2 Sonnet / T3 Opus naming pattern.

### R175-1 — Writer citation format `[authorYear]`

NEW `src/lib/ai/tier4-writer/citation-loader.ts`:
- `loadPapersMetadata(tenantId, paperIds[])` — batched Firestore read of `tenants/{tid}/papers/{paperId}` docs
- `buildCitationKey(meta, existingKeys)` — format `authorSurname + year` with collision suffix (smith2024, smith2024a, ...)
- `extractSurname()` — handles "Last, First" / "First Last" / Vietnamese name order (Nguyen/Tran/Le/Pham heuristic)
- `stripDiacritics()` — NFD normalize + đ→d
- `fallbackCitationKey()` — `unknown<hash>` when paper metadata absent

Orchestrator updated for two-pass context block construction:
1. Load metadata BEFORE generation
2. Assign citation keys (stable iteration)
3. Append chunk texts with proper keys
4. `extractCitations` does direct key lookup (no fuzzy match)

Limitation: Papers without `authors`/`year` metadata still use fallback hash. R176+ paper metadata backfill addresses this.

---

## 2. Production state (May 16, 2026)

### Cumulative commits pushed origin/main

```
9f834a2  feat(ai): R175-1 T4 Writer proper [authorYear] citation format
fd304fd  feat(ui+ai): R174 UX polish + T4 routing + Gemini stability
9fda56c  fix(build): R173-hotfix4 exclude functions/ from Next.js tsconfig
5da428c  feat(ai): R173-4 T4 Writer + R173-5 T5 Auditor orchestrators
a91a9c2  feat(ops+ui): R171 Cloud Functions cron + R172 superadmin dashboard
c1aff61  feat(ai): R170 cost guard + per-feature telemetry + dry-run mode
ea20db8  feat(ai): R169 capability abstraction + cost telemetry + 6-tier expansion
f9481ff  chore: R168-3.13c whitelist .claude/skills/ for repo tracking
ddb83dd  docs(ai): R168-3.13 AI architecture refresh + economics skill
```

### 6-tier AI production stack

| Tier | Model | Role | Handler | Trigger |
|---|---|---|---|---|
| T0 | gemini-2.5-flash | Shield + Router | `intent-classifier.ts` | Mọi chat |
| T1 | gemini-2.5-flash | Lab Manager (tools) | chat route tools mode | `feature: 'lab_ops'` |
| T2 | gemini-2.5-flash | Librarian (RAG) | chat route RAG mode | `feature: 'theory'` |
| T3 | claude-sonnet-4-6 | Engineer (reflection) | `runReflection` | `feature: 'spectrum_analysis'` |
| T4 | claude-sonnet-4-6 | Writer (paper sections) | `runWriter` | `feature: 'paper_writing'` (keyword override) |
| T5 | claude-opus-4-7 | Auditor (peer review) | `runAuditor` | `POST /api/messages/[id]/audit` |

### Infrastructure

- 3 Cloud Functions live asia-southeast1
- BigQuery billing export enabled (24h sync — table `gcp_billing_export_v1_01545E_FF945F_4AF504` available tomorrow)
- GCS lifecycle 90-day for `_admin/cost-backups/`
- Secret Manager: 3 secrets (Anthropic API, Anthropic Admin, GCP Billing ID)
- Cost Guard 4-gate + telemetry per tenant per day
- Lab BKU tenant `tenant-dev-001` tier=enterprise (no quota block dev)
- nAM superadmin role assigned

### Active Anthropic + Gemini API state

- Anthropic API: Claude Sonnet 4.6 + Opus 4.7 production
- Gemini API: gemini-2.5-flash for T0+T1+T2 (rolled back from G3 series)
- Voyage REST: voyage-3-large 1024-dim cosine
- Pinecone serverless: index `labyra-papers`, namespace per tenant
- Mistral OCR: `mistral-ocr-latest` (paper indexing)

---

## 3. Known issues + tech debt

### High priority

**3.1 — Paper metadata missing for many papers**

Papers in `tenants/tenant-dev-001/papers/` lack `authors` + `year` fields. R175-1 citation-loader falls back to `unknown<hash>` keys. Need backfill:

- Option A: DOI lookup via Crossref (if paper has DOI extracted by `metadata.py` in worker)
- Option B: LLM extract from first-page text (Haiku 4.5 — already done by `metadata.py` but `year` was bugged → year=0)
- Option C: Manual UI for users to fill metadata

R166-handoff §3.4 noted year=0 bug in worker `metadata.py`. Fix `_parse_metadata_json()` to coerce string→int.

**3.2 — BigQuery cost-drift integration**

`functions/src/scheduled/cost-drift.ts` has placeholder `fetchGoogleActual()` returning 0. After BigQuery export syncs (24h, available May 17+), update to query:

```sql
SELECT SUM(cost) FROM `labyra-app-dev.gcp_billing_export.gcp_billing_export_v1_01545E_FF945F_4AF504`
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
  AND service.description IN ('Gemini API', 'Cloud Functions', ...)
```

Per-tenant attribution still requires share ratio (no native tenant breakdown from Google).

**3.3 — T2 empty response after multi-turn tool calls**

After T1 tool call returns result, sometimes T2 Sonnet returns empty content (`...` bubble). Stream parser may drop deltas or Sonnet decides to wait. Reproducible: "List my chemicals" → response → "Tìm bài báo về WO3" → empty.

Investigate: enable streaming debug logs in `src/lib/ai/providers/anthropic.ts`, check if `text_delta` events emit or if response is suppressed by Anthropic.

### Medium priority

**3.4 — Long-conversation Writer prompt drift**

After 2-3 turns in same conversation, T4 Writer starts asking follow-up questions despite strict "DO NOT ask" rule in R174-8. Context dilutes attention.

Mitigation: Inject reminder instruction in user-turn message just before generation, e.g.:
```ts
const reinforcedMessage = `${userMessage}\n\n[System reminder: Output draft only. No questions. No "Bạn có muốn..." prompts.]`;
```

**3.5 — Audit findings UI**

T5 Auditor saves results to `tenants/{tid}/aiAudits/{auditId}` but no UI to display. Need:
- "Audit" button on assistant message → triggers `POST /api/messages/[id]/audit`
- Loading state while audit runs (~5-10s)
- Findings displayed as cards inline below message:
  - Color-coded by verdict (green/yellow/red)
  - Confidence percentage
  - Evidence chunk references
- Overall confidence header at top

**3.6 — Gemini 3 series re-adoption**

Monitor `@google/generative-ai` SDK releases. When `thought_signature` pass-through lands, re-test:

```ts
// capabilities.ts — restore G3
'security-router': { model: 'gemini-3.1-flash-lite-preview', ... },
'tool-calling-cheap': { model: 'gemini-3.1-flash-lite-preview', ... },
'rag-balanced': { model: 'gemini-3-flash-preview', ... }
```

Verify multi-turn tool calling works before deploying.

### Low priority

**3.7 — T5 auto-trigger logic**

Currently T5 only triggered via explicit endpoint. After Lab BKU survey accumulates ~50 conversations with cost telemetry, evaluate cost-effectiveness of auto-trigger after T3 responses containing ≥3 numerical claims or ≥2 citations.

**3.8 — Citation export (BibTeX / CSL JSON)**

When T4 Writer drafts have proper citations, export as BibTeX for paper submission workflows. Need:
- `tenants/{tid}/papers/{paperId}` metadata complete
- Generate BibTeX entries from `authors[]` + `year` + `title` + `doi`
- Bundle in chat export feature

**3.9 — E2E test automation**

Manual browser testing for 5 tiers takes ~10 min per regression. Script CLI test with curl + token automation. Cover: T0 routing decisions, T1 tools, T2 RAG, T3 reflection, T4 Writer, T5 audit.

**3.10 — Domain content deep docs**

`docs/scientific-methods/` has XRD + citation-matching. Add:
- UV-Vis Tauc bandgap (full Kubelka-Munk derivation)
- FTIR ATR vs KBr sample prep guide
- Raman laser wavelength selection
- TGA gas atmosphere effects (N2/Air/O2)
- Materials science plausibility rules for Ragas eval (bandgap ranges, lattice parameters)

**3.11 — Long-conversation Sonnet 4.6 context dilution**

Same issue as 3.4 but broader — across all tiers when conversation > 10 turns, instruction adherence drops. Consider:
- Periodic system prompt reinforcement
- Context window summarization
- Session reset suggestion in UI

---

## 4. Rollback procedures

### Gemini 3 re-adoption fail

If Gemini 3 SDK supports signature but production breaks:

```bash
# Edit capabilities.ts, revert to gemini-2.5-flash
cd ~/LAB-MANAGER/labyra-app
git revert <commit-hash>
git push origin main
# Vercel auto-deploy
```

### T4 keyword override too aggressive

If `detectT4Override()` triggers T4 for messages user didn't intend as paper drafting:

```bash
# Edit src/lib/ai/dispatcher/intent-classifier.ts
# Tighten regex or remove function call
```

### Cost overrun emergency

```bash
# Set tenant tier to 'free' to enable Cost Guard quota block
node --env-file=.env.local scripts/set-tenant-tier.mjs --tenant tenant-dev-001 --tier free
```

### Cloud Function disable

```bash
gcloud scheduler jobs pause firebase-schedule-backupCostsDaily-asia-southeast1 \
  --location=asia-southeast1 --project=labyra-app-dev
```

---

## 5. Production env vars active

### Vercel labyra-app (Production scope)

Existing from R167:
- `PAPER_QUEUE_BACKEND=pubsub`, `PUBSUB_PAPER_TOPIC=paper-processing`, `GCP_PROJECT_ID=labyra-app-dev`
- `GOOGLE_APPLICATION_CREDENTIALS_BASE64`, `FIREBASE_ADMIN_*`
- `MISTRAL_API_KEY`, `VOYAGE_API_KEY`, `PINECONE_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `CROSSREF_POLITE_MAILTO`, `PINECONE_INDEX_NAME=labyra-papers`

No new env vars added in R168→R175 (capabilities config + secrets in Secret Manager for Cloud Functions only).

### Cloud Functions (asia-southeast1)

Secrets bound to functions:
- `ANTHROPIC_API_KEY` (for Ragas Opus 4.7 calls)
- `ANTHROPIC_ADMIN_KEY` (for Usage API in drift detection)
- `GCP_BILLING_ACCOUNT_ID` = `01545E-FF945F-4AF504`

### Cloud Run spectra-worker

Unchanged from R167-handoff §4.

---

## 6. How newchat should bootstrap

1. Read `docs/round-r175-handoff.md` (this file) first
2. Read ADRs in order: 015 → 016 → 017 → 018 → 019 → 020 → 021
3. Read `docs/ai/AI_ARCHITECTURE.md` v3.0+ for 6-tier
4. Check ROADMAP.md state (next: R176 paper metadata backfill OR BigQuery integration)
5. Pick task from §3 prioritized list

Working dirs unchanged from R167:
- `~/LAB-MANAGER/labyra-app/` — Next.js Vercel
- `~/LAB-MANAGER/labyra-spectra-worker/` — Python Cloud Run
- `/mnt/d/labbook-patches/` — patch scripts (Windows mount in WSL)
- `/mnt/d/labyra-newchat-context/` — this context pack

---

## 7. Smoke tests for R175 health check

```bash
# 1. Verify all tiers dispatch correctly (manual browser test)
# Mở https://labyra-app.vercel.app/dashboard/ai-assistant
# Test queries:
#   "hello" → T1 Flash
#   "List my chemicals" → T1 Flash + tool call
#   "What is bandgap of WO3?" → T2 Sonnet (RAG)
#   "Compare WO3 vs TiO2 photocatalysis mechanism" → T3 Opus (reflection)
#   "Draft methods section for WO3 hydrothermal synthesis" → T4 Writer
# Verify badge appears realtime (no F5 needed)
# Verify thinking dots before first text_delta

# 2. Test T5 audit endpoint
TOKEN="<fresh-token-from-browser-console>"
MSG_ID="<from-latest-T3-response-firestore>"
CONV_ID="<conversation-id>"
curl -X POST "https://labyra-app.vercel.app/api/messages/$MSG_ID/audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\": \"$CONV_ID\"}"
# Expect: AuditResult JSON with findings + overallConfidence

# 3. Verify Cloud Function logs
firebase functions:log --only backupCostsDaily --lines 20 --project=labyra-app-dev
# Should see: "[backup-costs] complete totalDocs=N tenantsProcessed=M"

# 4. Verify superadmin dashboard
# Mở https://labyra-app.vercel.app/dashboard/superadmin/costs
# Should show KPI cards + chart + table (data accumulates after chat usage)

# 5. Verify BigQuery sync (May 17+)
bq query --project_id=labyra-app-dev --use_legacy_sql=false \
  "SELECT COUNT(*) FROM \`labyra-app-dev.gcp_billing_export.gcp_billing_export_v1_01545E_FF945F_4AF504\` LIMIT 10"
```

---

## 8. R176 recommended first task

**Paper metadata backfill** addresses 3.1 (citation fallback) + unblocks proper academic citations across all T4 Writer outputs.

Pipeline:
1. Iterate `tenants/{tid}/papers/` where `authors == null OR year == null`
2. If `doi` extracted, query Crossref API → fill authors/year/title
3. Else, LLM extract from first chunk text (Haiku 4.5)
4. Update Firestore doc

Estimated 3-4h. New file `src/lib/ai/tier4-writer/metadata-backfill.ts` + script `scripts/backfill-paper-metadata.mjs`.

Alternative starting points:
- **BigQuery cost-drift integration** (1.5h) — easier, code-only, data ready May 17+
- **T2 empty response debug** (2h) — UX critical for Lab BKU survey

---

## 9. End of handoff

R168→R175 ships full 6-tier AI production. Cost controls, cron infra, founder dashboard, T4/T5 orchestrators, UX polish, citation format all live.

Next session: paper metadata backfill for clean academic citations OR BigQuery drift completion OR T2 stream bug.

Code wins over this snapshot if anything conflicts.
