# Database Stage 2 — Migration Plan

> **Status:** Planning  
> **Owner:** Backend / AI Architecture  
> **Source:** `labyra-experiment-database-report.md`  
> **Created:** May 13, 2026

## Why

Stage 1 (current MVP) stores all data in Firestore. This works for:
- Metadata (Materials, Samples, Experiments, Equipment, Bookings)
- Paper RAG chunks (with Pinecone vector backend)

Stage 1 will hit hard limits when we add:
- Raw spectrum file uploads (XRD, Raman, UV-Vis, etc.) → 1MB Firestore doc limit
- Time-series data (GCD cycles, CA traces) → 500K-1M rows per experiment
- Image data (SEM, TEM, AFM) → 10-100MB files

Stage 2 introduces the right storage tier per data shape, per the database report:

| Data type | Storage | When |
|---|---|---|
| Raw files (.xy, .csv, .tif) | GCS | Phase 1 |
| Structured analysis results | Firestore | Phase 1 |
| Time-series arrays | BigQuery | Phase 2 |
| Vector embeddings | Pinecone (already done) | Stage 1 |
| Graph relationships | Firestore (Stage 1+2), Neo4j later | Phase 3 |

## Phase 1 — GCS + Spectrum Metadata (2-3 weeks)

### Deliverables
- [ ] GCS bucket: `labyra-app-dev-spectra` with tenant-scoped IAM
- [ ] Path convention: `tenants/{tenantId}/experiments/{experimentId}/spectra/{spectrumId}/raw/...`
- [ ] Signed URL upload API: `POST /api/spectra/signed-upload`
- [ ] Signed URL download API: `GET /api/spectra/[id]/signed-download`
- [ ] SpectrumMetadata Firestore schema (`src/types/spectra.ts`)
- [ ] Upload UI: drag-drop + format detection (XRD/Raman/UV-Vis/...)
- [ ] sha256 checksum verification client-side + server-side
- [ ] Immutability rule: `raw/` is write-once-only

### Firestore composite indexes
- `spectra: (tenantId, spectrumType, createdAt desc)` — filter by type
- `spectra: (tenantId, sampleId, spectrumType)` — get all spectra of a sample
- `spectra: (tenantId, status, createdAt asc)` — analysis queue

### Cost
- GCS storage: ~$1/month for 10 tenants (30GB/year accumulated)
- Operations: negligible (~$0.05/month)

## Phase 2 — Python Worker + AI Analysis (2-3 weeks)

### Deliverables
- [ ] Cloud Run service: `labyra-spectrum-worker` (Python 3.12 + pymatgen + lmfit)
- [ ] Cloud Pub/Sub topic: `spectrum-upload-complete`
- [ ] Worker pipeline: download → parse → preprocess → analyze → store
- [ ] Tier 2 AI analysis (Sonnet 4.6) for peak interpretation
- [ ] AnalysisResult Firestore schema per spectrum type (XRD, Raman, EIS, ...)
- [ ] Real-time UI update via Firestore listener

### AI Analysis tiers
| Spectrum | Tier | Notes |
|---|---|---|
| XRD peak fitting | Sonnet 4.6 + pymatgen | Phase identification |
| Raman peak assignment | Sonnet 4.6 | Reference library lookup |
| EIS circuit fitting | Sonnet 4.6 + lmfit | Equivalent circuit |
| Tauc plot (UV-Vis) | Sonnet 4.6 | Bandgap extraction |
| Image classification (SEM) | Vision API | Optional, Phase 2.5 |

## Phase 3 — BigQuery Time-Series (1-2 weeks)

### Deliverables
- [ ] BigQuery dataset: `labyra_timeseries`
- [ ] Table: `gcd_cycles` partitioned by `experimentId`, clustered by `cycleNumber`
- [ ] Row Access Policy for tenant isolation
- [ ] Python worker → BigQuery streaming insert
- [ ] UI: time-series chart with downsampling for display

### When this triggers
- A spectrum type produces >10K rows (GCD, CA, long CV runs)
- Aggregation queries needed (avg capacity, retention over cycles)

## Phase 4 — Graph + Search (later)

### Deliverables (deferred until 10+ tenants)
- [ ] Typesense for full-text search across experiments, papers
- [ ] Firestore aiGraph collection: entity + relation extraction from papers
- [ ] (Optional) Neo4j migration for complex graph queries (cross-paper citation networks)

## Out of scope (forever, per anti-patterns)
- ❌ Storing raw file content in Firestore documents
- ❌ Storing time-series arrays in Firestore
- ❌ Query Firestore for COUNT/AVG/SUM aggregations
- ❌ Cross-tenant queries
- ❌ Downloading files through Next.js backend (use signed URLs)

## Tenant isolation rules
Every storage tier MUST enforce tenantId isolation:
- GCS: IAM conditions on `resource.name.startsWith("tenants/{tenantId}/")`
- Firestore: Security rules `request.auth.token.tenantId == tenantId`
- BigQuery: Row Access Policy filtering by `tenant_id`
- Pinecone: namespace-per-tenant (already in place)

## References
- Source doc: `labyra-experiment-database-report.md`
- Existing infra: Pinecone serverless `labyra-papers` index (1024-dim cosine, AWS us-east-1)
- Cloud project: `labyra-app-dev`
