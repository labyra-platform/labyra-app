# ADR-018: Async Cloud Run Worker Architecture

<!-- R166-docs-update-2026-05-15 -->

**Status**: Accepted
**Date**: 2026-05-15
**Phase**: R167

---

## Context

Phase 6a (ai-6 citation extraction) is complete and deployed. Smoke test:

- Paper 3 pages: pipeline completes (no references → 0 citations, expected)
- Paper 16 pages (5.23 MB review article): **OCR times out**
  - Error: `Request timed out: TimeoutError: The operation was aborted due to timeout`
  - Cause: Vercel function timeout (60s default, 300s max on Pro plan)
  - Mistral OCR for 16-page PDF takes ~3–5 minutes

This is a fundamental architectural mismatch: **Vercel functions are for short HTTP requests
(< 60s typical), not long-running compute jobs (OCR/embedding for large PDFs)**.

Current ai-5b pipeline runs synchronously in the Vercel API route handler, which:
- Blocks the HTTP response while pipeline runs
- Hits Vercel timeout for any paper > ~5 pages
- Provides no retry on partial failure
- Cannot scale beyond one tenant's traffic before degrading

---

## Decision

Move paper processing pipeline (OCR → chunk → embed → index → citation) from
Vercel API route into an **async Cloud Run worker** with **Pub/Sub queue**.

### Worker target: extend `labyra-spectra-worker`

The existing `labyra-spectra-worker` (Python FastAPI on Cloud Run, `asia-southeast1`)
already handles spectra analysis (XRD, FTIR, Raman, UV-Vis, etc.) with shared infrastructure:
- Mistral OCR SDK (Python canonical)
- Firestore admin SDK
- Auth + logging utilities
- `deploy.sh` script
- 60-minute Cloud Run timeout
- Auto-scaling

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| New repo `labyra-papers-worker` | Microservice explosion — two worker repos with shared deps, double CI/CD |
| Firebase Cloud Functions Gen 2 | Mistral Python SDK awkward, cold start trade-off, less flexibility for heavy compute |
| Keep on Vercel with `maxDuration: 300` | Quick fix only — still fails for papers > ~20 pages |

### Queue: Cloud Pub/Sub

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| Firestore collection as queue (polling) | Wasted reads, no native retry, harder to scale |
| Cloud Tasks | Good for HTTP retries but Pub/Sub is event-driven (better fit for stream of paper uploads) |

**Pub/Sub benefits**:
- Event-driven (no polling cost)
- Auto-scaling subscribers (Cloud Run pull subscription)
- Built-in retries + dead-letter topic
- Free tier covers Stage 1 volume (< 10GB/month)
- Push subscription option (Pub/Sub → HTTPS POST to Cloud Run endpoint)

### Worker language: Python

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| TypeScript worker | Inconsistent with existing Python worker, would duplicate Mistral SDK + Firestore admin code paths |

**Python benefits**:
- `labyra-spectra-worker` already Python (FastAPI) → single repo, single language
- Mistral OCR Python SDK is canonical (more examples, better docs)
- Scientific computing libs (numpy/scipy) already used for spectra → reuse for paper analysis
- Pydantic + mypy strict for type safety (~80% of TS strictness, acceptable)

---

## Architecture

```
┌───────────────────────┐
│ Browser               │
│ POST /papers/upload   │
└─────────┬─────────────┘
          │
          ▼
┌───────────────────────────┐         ┌────────────────────────┐
│ Vercel API route          │         │ Cloud Pub/Sub          │
│ /api/papers/upload        ├────────▶│ topic:                 │
│                           │  publish│  paper-processing-jobs │
│ - validate                │         │                        │
│ - write paper doc         │         └─────────┬──────────────┘
│   (status='queued')       │                   │
│ - publish job             │                   │ push subscription
│ - return 202              │                   ▼
└───────────────────────────┘         ┌────────────────────────┐
                                      │ labyra-spectra-worker  │
          Firestore (status)          │ Cloud Run (Python)     │
          ◀───────────────────────────│ POST /papers/process   │
                                      │                        │
                                      │ Steps:                 │
                                      │  1. OCR (Mistral)      │
                                      │  2. chunking           │
                                      │  3. embedding (Voyage) │
                                      │  4. indexing (Pinecone)│
                                      │  5. citations          │
                                      └────────────────────────┘
```

### Message shape

```json
{
  "jobId": "uuid",
  "tenantId": "tenant-dev-001",
  "paperId": "abc123",
  "version": 2,
  "storagePath": "papers/abc123/file.pdf",
  "createdBy": "uid",
  "enqueuedAt": 1234567890
}
```

### Worker repo structure (extended)

```
labyra-spectra-worker/
├── src/
│   ├── parsers/          # existing spectra parsers
│   ├── papers/           # NEW (R167-B)
│   │   ├── ocr.py
│   │   ├── chunking.py
│   │   ├── embedding.py
│   │   ├── indexing.py
│   │   ├── citations.py  # ports R166 Phase 6a Python
│   │   └── orchestrator.py
│   ├── pubsub/           # NEW (R167-A)
│   │   ├── subscriber.py
│   │   └── handlers.py
│   └── main.py           # FastAPI routes
└── deploy.sh
```

---

## Implementation Phases

### R167-A — Infrastructure (~1h)

- Create Pub/Sub topic `paper-processing-jobs` (gcloud CLI)
- Create push subscription pointing to worker endpoint
- Add `/papers/process` POST handler to `labyra-spectra-worker` (skeleton)
- Add `/papers/health` GET endpoint
- Setup service account with `roles/pubsub.subscriber`
- Update `deploy.sh` for new env vars (`PUBSUB_TOPIC`, etc.)

### R167-B — Pipeline port (~2h)

- Port `src/lib/ai/rag/pipeline/*.ts` → `src/papers/*.py`
- OCR (Mistral): direct port (Python SDK)
- Chunking: regex-based, easy port
- Embedding (Voyage): REST call, easy port
- Indexing (Pinecone): REST call, easy port
- State machine: Firestore updates per step (mirror current TS logic)

### R167-C — Citation step + cutover (~30p)

- Port `runCitationStep` TS → Python
- Update `labyra-app` `/api/papers/upload` to publish Pub/Sub message instead of sync run
- Remove TS orchestrator code (or keep as fallback during transition)
- Update `/api/papers/[id]/reprocess` to republish Pub/Sub message

---

## Consequences

### Positive

- **Reliability**: OCR for large papers no longer hits Vercel timeout
- **Scalability**: Cloud Run auto-scales worker instances; Pub/Sub buffers spikes
- **Retry**: Pub/Sub auto-retries failed messages; dead-letter for poison messages
- **Observability**: Cloud Run logs centralized in GCP Logging (better than fragmented Vercel logs)
- **Cost**: Cloud Run free tier (180k vCPU-seconds/month) covers Stage 1 volume

### Negative

- **Complexity**: 2 deployment targets (Vercel + Cloud Run) instead of 1
- **Latency**: Pub/Sub publish + worker pickup adds ~1-3s vs sync. Acceptable for upload flow
  (user expects async indexing UX with status polling anyway)
- **Type safety**: Python is less strict than TypeScript. Mitigated by Pydantic + mypy strict
- **Auth handoff**: Worker needs service account, no user token. Tenant context passed in
  Pub/Sub message body (signed by Vercel route after token verification)

### Mitigations

- Comprehensive type hints + Pydantic models in worker
- Schema-versioned Pub/Sub messages for future evolution
- Idempotent worker (retry-safe: dedup on `jobId` + `paperId+version` combo)
- Detailed structured logging in worker for trace
- Health endpoint + GCP uptime checks

---

## References

- [Cloud Pub/Sub overview](https://cloud.google.com/pubsub/docs/overview)
- [Cloud Run async patterns](https://cloud.google.com/run/docs/triggering/pubsub-push)
- [ADR-015 Stage 1 Security](ADR-015-stage-1-security.md) — auth carries over
- [ADR-017 Citation Network](ADR-017-citation-network.md) — citation step ported in R167-C

---

@phase R167-architecture-decision
