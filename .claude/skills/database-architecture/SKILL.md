---
name: database-architecture
description: Database architecture for Labyra experiment data. This skill should be used when designing, implementing, or modifying any data layer involving spectra, raw files, time-series, vector embeddings, graph relationships, Firestore schemas, GCS storage, BigQuery, Pinecone, signed URLs, tenant isolation, or composite indexes. Triggers on tasks involving 24 spectrum types (XRD, Raman, UV-Vis, EIS, CV, GCD, etc.), file upload pipelines, AI analysis results, time-series streaming, or cross-tenant queries. Read `reference.md` for the full 880-line authoritative document; this SKILL.md provides the storage decision tree and quick-reference rules applied to every data-layer change.
license: MIT
metadata:
  author: labyra-platform
  version: '1.0.0'
  source: docs/labrya-experiment-database-report.md
---

# Database Architecture — Experiment Data

Authoritative reference for ALL data layer decisions in labyra-app.

## When to Apply

Use this skill when:
- Adding a new spectrum type or experiment data shape
- Designing Firestore schemas, security rules, or composite indexes
- Implementing file upload/download flows (papers, spectra, images)
- Choosing storage tier: GCS vs Firestore vs BigQuery vs Pinecone
- Querying time-series data (GCD cycles, CA traces)
- Working with vector embeddings (RAG, similarity search)
- Building tenant isolation rules
- Estimating cost of new data features
- Migrating between storage tiers (Stage 1 → Stage 2 → Stage 3)

## Storage Decision Tree (CRITICAL)

```
Task involves experiment data → identify DATA TYPE:

Type 1: Raw spectrum files (.xy, .csv, .spe, .tif, .dm3)  → GCS
Type 2: Structured analysis results (peaks, Eg, Rct)      → Firestore
Type 3: Time-series arrays (GCD cycles, CA traces)        → BigQuery
Type 4: Graph relationships (material→property→method)    → Firestore (Stage 1+2), Neo4j (later)
Type 5: Vector embeddings (RAG, similarity)               → Pinecone (current) / Vertex AI Vector Search

NEVER use one database for everything.
NEVER store raw file content in Firestore documents.
NEVER store time-series arrays in Firestore.
NEVER store raw embedding vectors (1536 float) in Firestore.
NEVER expose GCS paths directly to client — always use signed URLs.
NEVER cross-tenant queries.
```

## Anti-Patterns (NEVER DO)

```
❌ Lưu file content (base64) in Firestore — hits 1MB doc limit
❌ Lưu time-series arrays in Firestore — 500K rows = timeout
❌ Query Firestore for COUNT/AVG/SUM — no native aggregation
❌ Cross-tenant data access in a query — security violation
❌ Download file from GCS through Next.js backend — bandwidth bottleneck
❌ Expose GCS paths to client — bypasses access control
❌ Overwrite raw/ files in GCS — loses data lineage
❌ Skip sha256 checksum on upload — no integrity/tampering check
```

## Spectrum Taxonomy — 24 Types, 6 Groups

| Group | Types | Storage shape |
|---|---|---|
| **Structural** | XRD, SAED, HRTEM | 2-col CSV (3-8K rows) or TIFF image |
| **Optical** | UV-Vis, PL, Raman, FTIR | 2-col CSV (0.5-8K rows) |
| **Electrochemistry** | CV, EIS, GCD, LSV, CA | 2-3 col, GCD/CA can hit 100K-1M rows → BigQuery |
| **Photoelectrochemistry** | PEC J-V, IPCE, EIS-light | 2-col CSV (200-1K rows) |
| **Surface** | XPS, EDS, BET, Contact Angle | 2-col CSV or image |
| **Microscopy** | SEM, TEM, AFM, Optical | TIFF/JPG images (5-100MB) |

Full size ranges and file formats in `reference.md` Section 1.

## GCS Path Convention (REQUIRED)

```
gs://labyra-{env}/
  tenants/{tenantId}/
    experiments/{experimentId}/
      spectra/{spectrumId}/
        raw/
          original.xy          ← file gốc, IMMUTABLE
          original.xy.sha256   ← checksum integrity
        processed/
          normalized.csv       ← derived (versioned)
        exports/
          figure.png           ← user-generated
      images/{imageId}/
        sem_001.tif
        sem_001_thumb.jpg      ← thumbnail (< 100KB)
```

## Tenant Isolation Rules (BLOCKING — must enforce every tier)

- **GCS:** IAM conditions on `resource.name.startsWith("tenants/{tenantId}/")`
- **Firestore:** Security rules `request.auth.token.tenantId == tenantId`
- **BigQuery:** Row Access Policy filtering by `tenant_id`
- **Pinecone:** namespace-per-tenant (already in place for papers)

## Upload Flow (Phase 1 shipped in R160-spectra-1)

```
1. Frontend: validate format + size
2. Frontend: POST /api/spectra/signed-upload → get signed URL
3. Frontend: PUT file DIRECTLY to GCS (bypass backend bandwidth)
4. Frontend: compute SHA-256 client-side
5. Frontend: POST /api/spectra/notify-complete
6. Backend: verify file exists in GCS, verify size, create Firestore doc (status: 'uploaded')
7. Phase 2 (deferred): Pub/Sub → Cloud Run worker → parse → AI analysis → status: 'analyzed'
```

## Current State (R160-spectra-2 shipped May 13, 2026)

- All 24 spectrum types supported in upload UI
- Firebase Storage at `tenants/{tenantId}/spectra/{spectrumId}/raw/<file>`
- 4 composite indexes deployed for spectra collection
- Signed URL upload working end-to-end
- **Phase 2 NOT shipped:** no Cloud Run worker, no AI analysis pipeline yet

## Cost Estimate (10 tenants, early stage)

| Service | Cost/month |
|---|---|
| GCS | ~$1 |
| Firestore | ~$5 |
| BigQuery | ~$4 (when Phase 3 ships) |
| Vertex AI Vector (batch) | ~$1 |
| Cloud Run (Python workers) | ~$10-30 (when Phase 2 ships) |
| **Total** | **~$20-40/mo** |

## Full Reference

See `reference.md` in this skill folder for the complete 880-line authoritative document covering:
- All 24 spectrum types with format/size details
- AnalysisResult schemas per spectrum type (XRDResult, RamanResult, EISResult, etc.)
- Full upload flow with sequence diagram
- BigQuery schema for time-series
- Vertex AI Vector Search setup
- Migration roadmap and implementation priorities
- 9 anti-patterns with rationale
