# R167 → R168 Handoff

**Generated:** 2026-05-15
**For:** Next session continuing Labyra work after R167 Pub/Sub cutover.
**State:** R167-A through R167-C2 complete + verified E2E.

---

## 1. R167 cumulative shipped (May 14-15)

### R167-A — Infrastructure
- Pub/Sub topic `paper-processing` + DLQ `paper-processing-dlq` (max 5 attempts)
- Push subscription `spectra-worker-papers-push` → `https://spectra-worker-5xd6gcfx5q-as.a.run.app/papers/process`
- ack-deadline 600s, message-retention 1d, DLQ 7d
- IAM: Pub/Sub SA → roles/iam.serviceAccountTokenCreator on worker SA
- IAM: worker SA `spectra-worker@labyra-app-dev.iam.gserviceaccount.com` → roles/pubsub.subscriber on topic

### R167-B (Python worker, labyra-spectra-worker repo)
- 18 files in `src/papers/`:
  - `types.py` — Pydantic mirrors of labyra-app TS types (PaperJob, PaperDoc, OcrResult, Chunk)
  - `state.py` — Firestore writers, poll-based cancellation (`check_cancelled`)
  - `errors.py` — CancelledError / FatalError / RetryableError
  - `pricing.py` — Mistral/Voyage/Haiku cost functions
  - `ocr.py` — Mistral OCR (model `mistral-ocr-latest`, $1/1000 pages batch)
  - `chunking.py` — Sliding window (1024 tokens, 100 overlap, CHARS_PER_TOKEN=3.5)
  - `embed.py` — Voyage REST `voyage-3-large`, batch 128, $0.18/1M tokens
  - `index.py` — Firestore chunks + Pinecone upsert namespace=tenantId
  - `enrich.py` — Anthropic Haiku 4.5 + prompt cache 1h TTL (OFF by default `ENABLE_ENRICHMENT=false`)
  - `metadata.py` — Haiku 4.5 first-page title/authors/year/DOI
  - `citation_types.py` — Citation Pydantic mirrors (ADR-017)
  - `references_parser.py` — DOI regex extraction from EN+VI section headers
  - `crossref.py` + `openalex.py` — REST clients with composite `lookup_doi()`
  - `citation_service.py` — Firestore CRUD create-side (Citation, stats)
  - `citation.py` — Citation step orchestration with rate limit 200ms
  - `orchestrator.py` — Pipeline runner (6 steps + idempotency)
- Mistral SDK pinned 2.4.5 (internal import path: `from mistralai.client.sdk import Mistral`)
- Pinecone `pinecone>=5.0.0`, index `labyra-papers` 1024-dim cosine AWS us-east-1
- main.py `/papers/process` push handler: 204=ack, 400=permanent, 5xx=retry
- gcs_client.py extended R167-B8 to accept relative paths (FIREBASE_BUCKET env fallback)

### R167-B0 — Stale Paper type removal (labyra-app)
- Removed duplicate `Paper` interface from `src/lib/ai/rag/types.ts`
- Source of truth: `src/types/papers.ts` (PROV-O extended schemaVersion=2)

### R167-B7 — UI fix (labyra-app)
- Added `extracting_citations` to STEPS array in `processing-timeline.tsx`
- Added `status.extracting_citations` i18n keys (en + vi)
- R166-ai6a-3b-fix2 had added to enum + STEP_ORDER but missed STEPS render

### R167-C / R167-C2 — Vercel publisher cutover (labyra-app)
- Extended `PaperProcessingJob` with `storagePath` + `createdBy` (ADR-018 message shape)
- New `src/lib/ai/rag/jobs/pubsub.ts` — `PubSubQueue` using REST API (gRPC fails Vercel)
- Reuses `getAuth()` from `src/lib/pubsub/publisher.ts` (exported R167-C2)
- Factory `index.ts` switches by `PAPER_QUEUE_BACKEND` env (`pubsub` | `in-process`)
- Updated `/api/papers/upload/route.ts` + `/api/papers/[id]/reprocess/route.ts` populate new fields
- IAM granted: Vercel SA `firebase-adminsdk-fbsvc@labyra-app-dev` → roles/pubsub.publisher on topic
- Vercel env: `PAPER_QUEUE_BACKEND=pubsub`, `PUBSUB_PAPER_TOPIC=paper-processing`, `GCP_PROJECT_ID=labyra-app-dev`
- Verified E2E: 3-page paper = 8s, 16-page = 16s (vs Vercel 60s timeout pre-R167)

---

## 2. Rollback procedures

### Worker side
```bash
# Disable papers subscription (preserve config)
gcloud pubsub subscriptions update spectra-worker-papers-push --push-endpoint=""
# Re-enable when fixed
gcloud pubsub subscriptions update spectra-worker-papers-push \
  --push-endpoint="$(gcloud run services describe spectra-worker --region=asia-southeast1 --format='value(status.url)')/papers/process" \
  --push-auth-service-account=spectra-worker@labyra-app-dev.iam.gserviceaccount.com
```

### Vercel side (revert to InProcessQueue)
1. Vercel dashboard → labyra-app → Settings → Environment Variables
2. Change `PAPER_QUEUE_BACKEND` to `in-process` (or delete)
3. Redeploy production → falls back to TS orchestrator

---

## 3. R168 tech debt backlog

### High priority

**3.1 — Generic Pub/Sub publisher util**
- Current: `src/lib/pubsub/publisher.ts` (spectra) + `src/lib/ai/rag/jobs/pubsub.ts` (papers) duplicate HTTP publish boilerplate
- Refactor: `src/lib/pubsub/publish-to-topic.ts` generic primitive, domain wrappers in `src/lib/pubsub/topics/{spectra,papers}.ts`
- Test regression on both flows

**3.2 — Vercel 4.5MB body limit for upload**
- Bug: any paper > 4.5MB returns HTTP 413 before reaching `/api/papers/upload` function
- Surfactants paper (5.23MB) fails through browser even though MAX_FILE_SIZE=50MB
- Fix: implement browser-direct upload to Firebase Storage via signed URL, Vercel function only receives `storagePath` metadata
- Pattern: see Firebase Storage `getSignedUploadUrl()` docs

**3.3 — DOI regex false positives**
- R166 ai-6a-3a parser bug: regex `\b10\.\d{4,9}/[-._;()/:a-zA-Z0-9]+` too permissive
- OCR noise creates variants: `10.1021/ja407115p.1`, `10.1021/ja407115p.l` (l vs 1), `10.1021/ja407115p/1`, `10.1021/ja407115pJ`
- 5 citations created for 1 real DOI in test paper d6888c56
- Fix options: (a) stricter regex with required word boundary at end, (b) Crossref 404 → confidence='unverified' instead of 'doi-exact', (c) skip citation entirely on 404
- Worker `src/papers/references_parser.py` mirrors TS bug — fix both

### Medium priority

**3.4 — `metadata.py` year extraction bug**
- Haiku 4.5 returns year correctly in test but `year=0` persisted to Firestore
- Likely `parsed.year` returns as string not int → falls through `isinstance(year, int)` check
- Add fallback `int(year)` cast with try/except in `_parse_metadata_json()`

**3.5 — Husky pre-push too aggressive**
- Runs full `pnpm build` on every push
- Block push when ANY untracked file has TS errors (hand-tracking branch)
- Fix: switch to `pnpm tsc --noEmit --project tsconfig.staged.json` covering only committed files
- Or: filter pre-push to only check files in commit being pushed

**3.6 — Citation `_stats` doc undefined for some papers**
- Test paper Surfactants: stats subcollection not created despite `recompute_citation_stats()` being called
- Test paper Benchmarking: stats correctly created
- Difference unclear — may be timing issue or paper had 0 chunks failing aggregation count
- Investigate: add error logging in `recompute_citation_stats()`, run again

### Low priority

**3.7 — `_force-reset-paper.mjs` misleading name**
- Sets status='cancelled', not 'queued' — opposite of what name implies
- Rename to `_force-cancel-paper.mjs`
- Write new `_force-requeue-paper.mjs` that correctly resets to queued + clears cancelRequestedAt + processing fields

**3.8 — Mistral SDK fragile import path**
- Worker uses `from mistralai.client.sdk import Mistral` (internal path)
- Top-level `from mistralai import Mistral` not exposed in 2.4.5
- Pinned `mistralai==2.4.5` exact; upgrade may break import
- Watch Mistral changelog; consider switching to direct REST API like Voyage

**3.9 — hand-tracking experimental code**
- Stashed at `/mnt/d/labyra-hand-tracking-stash/` (folders `hand-tracking/` + `test-hand-tracking/`)
- Blocked Vercel build due to missing `@mediapipe/tasks-vision` package
- Restore when ready to resume feature: `mv /mnt/d/labyra-hand-tracking-stash/* ~/LAB-MANAGER/labyra-app/` + `pnpm add @mediapipe/tasks-vision`

**3.10 — Utility scripts not committed**
- 4 untracked: `scripts/_check-papers-status.mjs`, `_check-citations.mjs`, `_force-reset-paper.mjs`, `_set-tenant-claim.mjs`
- Commit as `chore(scripts): admin utilities for papers/tenants` when convenient

**3.11 — `package.json` local has incorrect downgrade history**
- Local working tree has had erroneous `firebase-admin ^13.9.0 → ^10.3.0` downgrade twice
- Caught + reverted both times (firebase-admin v10 missing `.count()` aggregation API needed by R166)
- Investigate: what tool/script is editing package.json wrongly? `pnpm install` shouldn't change deps if lockfile matches

---

## 4. Production env vars active (Vercel + Cloud Run)

### Vercel labyra-app (Production scope)
- `PAPER_QUEUE_BACKEND=pubsub`
- `PUBSUB_PAPER_TOPIC=paper-processing`
- `GCP_PROJECT_ID=labyra-app-dev`
- `GOOGLE_APPLICATION_CREDENTIALS_BASE64=<base64-encoded service account JSON>`
- `FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`
- `MISTRAL_API_KEY`, `VOYAGE_API_KEY`, `PINECONE_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `CROSSREF_POLITE_MAILTO`
- `PINECONE_INDEX_NAME=labyra-papers` (optional, default in code)

### Cloud Run spectra-worker
- Service URL: `https://spectra-worker-5xd6gcfx5q-as.a.run.app`
- Memory: 4Gi, Timeout: 3600s, Concurrency: 1
- Secrets (Secret Manager): `mistral-api-key`, `voyage-api-key`, `pinecone-api-key`, `anthropic-api-key`, `mp-api-key`
- Env vars: `GCP_PROJECT_ID`, `GCP_REGION=asia-southeast1`, `FIREBASE_BUCKET=labyra-app-dev.firebasestorage.app`, `DEFAULT_LOCALE=en`, `ANALYSIS_VERSION=xrd-1.0.0`, `PINECONE_INDEX_NAME=labyra-papers`

---

## 5. How newchat should bootstrap

1. Read `docs/round-r167-handoff.md` (this file) first
2. Read latest ADRs in order: ADR-015 → 016 → 017 → 018
3. Check current ROADMAP.md state (next: R166 Phase 6b citation UI, or R168 tech debt)
4. For continuing R166 Phase 6b: build UI components for citation network (D3 viz + Cited-by section in paper detail)
5. For R168 tech debt cleanup: pick from §3 prioritized list

Working dirs:
- `~/LAB-MANAGER/labyra-app/` — Vercel Next.js app
- `~/LAB-MANAGER/labyra-spectra-worker/` — Python Cloud Run worker
- `/mnt/d/labbook-patches/` — patch scripts (Windows mount in WSL)
- `/mnt/d/labyra-hand-tracking-stash/` — stashed experimental feature

---

## 6. Smoke test for R167 health check

```bash
# Worker health (requires auth token)
RUN_URL=$(gcloud run services describe spectra-worker --region=asia-southeast1 --format='value(status.url)')
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" $RUN_URL/papers/health
# Expect: {"status":"ok","subsystem":"papers","phase":"R167-B6"}

# Reprocess existing paper E2E (use small paper, e.g. Tungsten 26b28e83)
TOKEN="<fresh-from-browser>"
curl -X POST "https://labyra-app.vercel.app/api/papers/26b28e83c20f42199542029a13d93498aed8f7034814824ad68a693b182e77e4/reprocess" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Origin: https://labyra-app.vercel.app" \
  -d '{}'
# Expect: HTTP 202 {"ok":true,"version":N}

# Watch worker pipeline (within 30s)
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=spectra-worker AND textPayload:"pipeline_complete"' \
  --limit=3 --freshness=5m --format='value(textPayload)'
```

---

## 7. End of handoff

R167 ships async paper processing pipeline. R168 should address tech debt + continue R166 Phase 6b UI (citation network viz). Code wins over this snapshot if anything conflicts.
