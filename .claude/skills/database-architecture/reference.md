# Database Architecture — Experiment Data
## Agent Reference Report for Labrya Lab Management SaaS

> **Dành cho:** AI Agent khi implement, query, hoặc thiết kế data layer cho experiment data  
> **Cập nhật:** May 2026  
> **Stack hiện tại:** Firebase RTDB + Firestore + Cloud Run (R138 era)  
> **Tài liệu gốc:** AI_ARCHITECTURE.md + ARCHITECTURE.md

---

## 0. Cách Agent Dùng Document Này

```
Khi nhận task liên quan đến experiment data → xác định DATA TYPE:

Type 1: Raw spectrum files (.xy, .csv, .spe...)  → Section 2.1 → GCS
Type 2: Structured results (peaks, Eg, Rct...)   → Section 2.2 → Firestore
Type 3: Time-series arrays (GCD cycles, CA...)   → Section 2.3 → BigQuery
Type 4: Graph relationships (material→property)  → Section 2.4 → Firestore (now) / Neo4j (later)
Type 5: Vector embeddings (RAG, similarity)      → Section 2.5 → Vertex AI Vector Search

→ Không bao giờ dùng một database cho tất cả.
→ Không bao giờ store raw file content trong Firestore document.
→ Không bao giờ store time-series arrays trong Firestore.
```

---

## 1. Taxonomy — 6 Analyzer Groups × 24 Spectrum Types

Agent phải biết data shape của từng loại để chọn đúng storage.

### Group 1: Structural

| Spectrum | Format | Data shape | Size điển hình |
|---|---|---|---|
| **XRD** | `.xy`, `.csv`, `.raw` | 2 col: 2θ (°), Intensity (counts) | 3,000–8,000 rows |
| **SAED** | `.tif`, `.dm3` | 2D diffraction pattern image | 2–20 MB |
| **HRTEM** | `.tif`, `.dm3` | High-res image + FFT | 10–50 MB |

### Group 2: Optical

| Spectrum | Format | Data shape | Size điển hình |
|---|---|---|---|
| **UV-Vis** | `.csv`, `.txt`, `.dpt` | 2 col: λ (nm), Absorbance | 500–2,000 rows |
| **PL** | `.csv`, `.txt` | 2 col: λ (nm), Intensity | 500–3,000 rows |
| **Raman** | `.txt`, `.spe`, `.wdf` | 2 col: Wavenumber (cm⁻¹), Intensity | 1,000–4,000 rows |
| **FTIR** | `.csv`, `.dpt`, `.spa` | 2 col: Wavenumber (cm⁻¹), %T hoặc Abs | 4,000–8,000 rows |

### Group 3: Electrochemistry

| Spectrum | Format | Data shape | Size điển hình |
|---|---|---|---|
| **CV** | `.txt`, `.csv` | 3 col: Time (s), Voltage (V), Current (A) | 500–5,000 rows/cycle, N cycles |
| **EIS** | `.txt`, `.csv`, `.z` | 3+ col: Freq (Hz), Z_real (Ω), Z_imag (Ω) | 50–200 rows |
| **GCD** | `.txt`, `.csv` | 3 col: Time (s), Voltage (V), Current (A) | **100K–1M rows** (1000 cycles) |
| **LSV** | `.txt`, `.csv` | 2 col: Voltage (V), Current (A) | 500–3,000 rows |
| **CA** | `.txt`, `.csv` | 2 col: Time (s), Current (A) | **10K–100K rows** (hours) |

### Group 4: Photoelectrochemistry

| Spectrum | Format | Data shape | Size điển hình |
|---|---|---|---|
| **PEC J-V** | `.txt`, `.csv` | 2 col: Voltage (V vs RHE), J (mA/cm²) | 200–1,000 rows |
| **IPCE** | `.txt`, `.csv` | 2 col: λ (nm), IPCE (%) | 200–500 rows |
| **EIS-light** | `.txt`, `.csv` | Same as EIS, under illumination | 50–200 rows |

### Group 5: Surface

| Spectrum | Format | Data shape | Size điển hình |
|---|---|---|---|
| **XPS** | `.vms`, `.txt`, `.csv` | 2 col: Binding Energy (eV), Intensity | 500–5,000 rows/element |
| **EDS** | `.csv`, `.emsa` | 2 col: Energy (keV), Counts | 1,000–4,000 rows |
| **BET** | `.csv`, `.txt` | Multi-col: P/P₀, Volume adsorbed | 20–50 rows |
| **Contact Angle** | `.jpg`, `.png` + measurement | Image + scalar value (°) | 1–5 MB |

### Group 6: Microscopy

| Spectrum | Format | Data shape | Size điển hình |
|---|---|---|---|
| **SEM** | `.tif`, `.jpg` | Image (grayscale/color) | 5–50 MB |
| **TEM** | `.tif`, `.dm3` | Image + diffraction | 10–100 MB |
| **AFM** | `.spm`, `.ibw`, `.txt` | 2D height map (512×512 float32) | 1–10 MB |
| **Optical microscopy** | `.jpg`, `.tif` | Color image | 2–20 MB |

---

## 2. Database Selection — Theo Data Type

### 2.1 Type 1: Raw Spectrum Files

**→ Google Cloud Storage (GCS)**

Không bao giờ lưu file content trong Firestore. Firestore chỉ lưu metadata.

#### Path Convention (bắt buộc)

```
gs://labrya-{env}/
  tenants/
    {tenantId}/
      experiments/
        {experimentId}/
          spectra/
            {spectrumId}/
              raw/
                original.xy          ← file gốc, immutable
                original.xy.sha256   ← checksum integrity
              processed/
                normalized.csv       ← sau khi normalize
                background_sub.csv   ← sau khi subtract background
              exports/
                figure.png           ← exported chart
                data_export.csv      ← user download
          images/
            {imageId}/
              sem_001.tif
              sem_001_thumb.jpg      ← thumbnail (< 100KB)
```

#### Firestore Metadata Document (lưu song song)

```typescript
// /tenants/{tenantId}/experiments/{experimentId}/spectra/{spectrumId}
interface SpectrumMetadata {
  id: string;
  experimentId: string;
  tenantId: string;

  // File info
  type: 'xrd' | 'raman' | 'uvvis' | 'pl' | 'ftir' | 'eis' | 'cv' |
        'gcd' | 'lsv' | 'ca' | 'pec_jv' | 'ipce' | 'xps' | 'eds' |
        'bet' | 'sem' | 'tem' | 'afm' | 'contact_angle' | 'saed' |
        'hrtem' | 'optical';
  group: 'structural' | 'optical' | 'electrochemistry' |
         'photoelectrochemistry' | 'surface' | 'microscopy';

  // GCS paths
  gcs: {
    raw: string;           // "gs://labrya-prod/tenants/.../raw/original.xy"
    processed?: string;
    thumbnail?: string;    // cho image types
  };

  // File metadata
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;          // integrity check

  // Measurement conditions
  instrument?: string;     // "Rigaku MiniFlex 600"
  operator?: string;       // userId
  measuredAt: Timestamp;
  sampleId: string;
  sampleLabel: string;     // "WO₃-batch-2024-03"

  // Processing status
  status: 'uploaded' | 'queued' | 'processing' | 'analyzed' | 'failed';
  analyzedAt?: Timestamp;
  analysisVersion?: string; // AI model version

  // Quick stats (denormalized từ results để query nhanh)
  quickStats?: {
    rowCount?: number;
    xRange?: [number, number];
    yRange?: [number, number];
    peakCount?: number;
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### Rules cho GCS

```
[REQUIRED] Immutability: raw/ folder không bao giờ overwrite
           → New version = new spectrumId, link previous_version
[REQUIRED] Signed URLs: không expose GCS path trực tiếp ra client
           → Generate signed URL (15 phút expiry) cho mỗi download
[REQUIRED] Checksum: verify sha256 sau khi upload
[REQUIRED] Retention: raw files giữ indefinitely (research data)
[REQUIRED] Tenant isolation: Cloud Storage bucket-level IAM
           → Service account của tenant chỉ access folder của mình
[INDUSTRY] Thumbnail: generate tự động cho SEM/TEM/AFM/optical (< 400px)
[INDUSTRY] Compression: TIFF → WebP cho display, giữ TIFF gốc
```

---

### 2.2 Type 2: Structured Analysis Results

**→ Firestore**

Kết quả đã được AI/Python extract từ raw file. Schema thay đổi theo spectrum type.

#### Base Result Schema

```typescript
// /tenants/{tenantId}/experiments/{experimentId}/results/{spectrumId}
interface AnalysisResult {
  spectrumId: string;        // FK → SpectrumMetadata
  spectrumType: string;
  analysisVersion: string;   // "v2.1.3" — để track model version
  analyzedAt: Timestamp;
  analyzerTier: 'sonnet' | 'opus';  // AI tier used
  confidence: number;        // 0.0–1.0

  // Type-specific results (xem bên dưới)
  data: XRDResult | RamanResult | UVVisResult | EISResult | ...;

  // Provenance
  citations: Citation[];     // papers support analysis
  aiSummary: string;         // human-readable summary
  warnings: string[];        // "Peak at 23.1° may overlap with substrate"
}
```

#### XRD Result

```typescript
interface XRDResult {
  peaks: Array<{
    twoTheta: number;        // degrees
    dSpacing: number;        // Angstrom
    intensity: number;       // counts
    fwhm: number;            // full width at half maximum
    crystalliteSize_nm: number;  // Scherrer equation
    phase: string;           // "monoclinic WO₃"
    hkl?: string;            // Miller indices "020"
  }>;
  strain: number;
  dominantPhase: string;
  crystallinity_percent: number;
  latticeParameters?: {
    a: number; b: number; c: number;
    alpha: number; beta: number; gamma: number;
  };
}
```

#### Raman Result

```typescript
interface RamanResult {
  peaks: Array<{
    wavenumber: number;      // cm⁻¹
    intensity: number;       // a.u.
    fwhm: number;
    assignment: string;      // "A1g mode of WS₂"
    shift?: number;          // vs reference (strain indicator)
  }>;
  layerCount?: number;       // 1L, 2L, bulk
  defectDensity?: string;    // "low" | "medium" | "high"
  dToPeakRatio?: number;     // D/G ratio cho carbon materials
}
```

#### UV-Vis / Tauc Plot Result

```typescript
interface UVVisResult {
  bandgap_eV: number;        // Eg từ Tauc plot
  bandgapType: 'direct' | 'indirect';
  absorptionEdge_nm: number;
  taucPlot: {
    n: number;               // 1/2 (direct) hoặc 2 (indirect)
    linearRegion: [number, number]; // energy range for linear fit
    r_squared: number;
  };
  absorbance: {
    at400nm?: number;
    at500nm?: number;
    at600nm?: number;
  };
}
```

#### EIS Result

```typescript
interface EISResult {
  equivalentCircuit: string; // "R(RQ)" hoặc "R(RQ)(RQ)"
  Rs_ohm: number;            // solution resistance
  Rct_ohm: number;           // charge transfer resistance
  Cdl_F: number;             // double layer capacitance
  W?: number;                // Warburg element (diffusion)
  chargeTransferRate?: number;
  fittingError_percent: number;
  nyquistData: Array<{       // fitted curve points
    zReal: number;
    zImag: number;
    frequency: number;
  }>;
}
```

#### GCD / Cycling Result (summary — arrays ở BigQuery)

```typescript
interface GCDResult {
  // Summary stats — Firestore
  currentDensity_mAcm2: number;
  specificCapacitance_Fg: number;    // hoặc mAhg
  capacityRetention_percent: number; // after N cycles
  totalCycles: number;
  coulombicEfficiency_avg: number;
  voltageWindow: [number, number];

  // Reference to BigQuery
  bigqueryTable: string;   // "labrya.experiments.gcd_cycles"
  bigqueryFilter: {        // WHERE clause để query
    tenantId: string;
    spectrumId: string;
  };
}
```

#### Firestore Rules cho Results

```
[REQUIRED] Versioning: không overwrite result cũ
           → Tạo result mới với analysisVersion mới
           → Mark version cũ là superseded: true
[REQUIRED] Atomic write: metadata.status + result document
           → Dùng Firestore batch write
[REQUIRED] Size limit: Firestore document max 1MB
           → Nếu arrays lớn → chuyển sang BigQuery
           → Arrays > 500 phần tử KHÔNG được lưu trong Firestore
[INDUSTRY] Indexes: tạo composite index cho các query phổ biến:
           → (tenantId, spectrumType, analyzedAt DESC)
           → (tenantId, sampleId, spectrumType)
           → (tenantId, status, createdAt DESC)
```

---

### 2.3 Type 3: Time-Series & Large Numeric Arrays

**→ BigQuery**

GCD, CA, long CV cycling — hàng triệu data points không phù hợp với Firestore.

#### Schema Design

```sql
-- Table: labrya.experiments.time_series
CREATE TABLE labrya.experiments.time_series (
  -- Partition + cluster keys
  tenant_id       STRING NOT NULL,
  spectrum_id     STRING NOT NULL,
  spectrum_type   STRING NOT NULL,  -- 'gcd', 'ca', 'cv', 'ipce'
  measured_date   DATE NOT NULL,    -- PARTITION BY này

  -- Time axis
  time_s          FLOAT64,          -- seconds (nullable nếu không phải time-domain)
  cycle_number    INT64,            -- GCD/CV cycle number

  -- Primary measured quantities
  voltage_v       FLOAT64,          -- Voltage (V)
  current_a       FLOAT64,          -- Current (A)
  current_density_mAcm2 FLOAT64,   -- Normalized

  -- Spectrum-specific columns
  wavelength_nm   FLOAT64,          -- IPCE, UV-Vis
  frequency_hz    FLOAT64,          -- EIS
  z_real_ohm      FLOAT64,          -- EIS
  z_imag_ohm      FLOAT64,          -- EIS
  ipce_percent    FLOAT64,          -- IPCE
  power_density_mWcm2 FLOAT64,      -- PEC

  -- Metadata
  instrument      STRING,
  operator_id     STRING,
  created_at      TIMESTAMP
)
PARTITION BY measured_date
CLUSTER BY tenant_id, spectrum_type, spectrum_id;
```

#### Common Queries

```sql
-- Query GCD cycles cho một spectrum
SELECT
  cycle_number,
  MAX(voltage_v) - MIN(voltage_v) AS voltage_window,
  MAX(time_s) - MIN(time_s) AS cycle_duration_s
FROM labrya.experiments.time_series
WHERE tenant_id = @tenantId
  AND spectrum_id = @spectrumId
  AND spectrum_type = 'gcd'
GROUP BY cycle_number
ORDER BY cycle_number;

-- Specific capacitance per cycle
SELECT
  cycle_number,
  -- Cs = I × Δt / (m × ΔV)
  (AVG(ABS(current_a)) * MAX(time_s - MIN_time)) /
  (sample_mass_g * voltage_window) AS specific_capacitance_Fg
FROM ...

-- So sánh performance giữa các samples
SELECT
  s.sample_label,
  AVG(t.current_density_mAcm2) AS avg_current_density
FROM labrya.experiments.time_series t
JOIN labrya.experiments.spectra_metadata s USING (spectrum_id)
WHERE t.tenant_id = @tenantId
  AND t.spectrum_type = 'ca'
  AND t.measured_date BETWEEN @startDate AND @endDate
GROUP BY s.sample_label;
```

#### BigQuery Rules

```
[REQUIRED] Partition: PARTITION BY measured_date (giảm cost query)
[REQUIRED] Cluster: CLUSTER BY tenant_id, spectrum_type, spectrum_id
[REQUIRED] Tenant isolation: Row-level security policy
           → CREATE ROW ACCESS POLICY ... FILTER USING (tenant_id = SESSION_USER())
[REQUIRED] Cost control: estimate bytes scanned trước khi run
           → Dùng query dry-run trong Python layer
[REQUIRED] Không query trực tiếp từ frontend
           → Tất cả qua Cloud Run Python worker
           → Cache kết quả phổ biến trong Firestore (TTL 1h)
[INDUSTRY] Materialized views cho common aggregations:
           → Specific capacitance per cycle (GCD)
           → Coulombic efficiency per cycle
           → Average current at each potential (CV)
[INDUSTRY] Export: stream BigQuery → GCS (CSV) cho user download
           → Không download trực tiếp từ BigQuery query
```

#### Khi nào dùng BigQuery vs Firestore

```
Firestore nếu:
  □ Array < 500 phần tử
  □ Cần real-time update
  □ Query đơn giản (get by ID, filter 1-2 fields)
  □ Document < 500KB

BigQuery nếu:
  □ Array > 500 phần tử
  □ Time-series (GCD, CA, long CV)
  □ Aggregation (AVG, SUM, GROUP BY)
  □ Cross-spectrum comparison
  □ Analytics và reporting
```

---

### 2.4 Type 4: Graph Relationships (GraphRAG — Phase ai-6)

**→ Firestore (hiện tại) → Neo4j Aura (khi > 50K entities)**

#### Graph Schema (Firestore)

```typescript
// Nodes
// /tenants/{tenantId}/aiGraph/nodes/{entityId}
interface Entity {
  id: string;              // 'mat:WO3', 'prop:bandgap_eV', 'method:XRD'
  type: 'material' | 'property' | 'method' | 'application' | 'paper';
  name: string;            // display: "WO₃"
  aliases: string[];       // ["tungsten trioxide", "WO3", "W-oxide"]
  canonicalFormula?: string;  // "WO3" (pymatgen normalized)
  unit?: string;           // "eV", "mAh/g", "F/g"
  paperIds: string[];      // papers mentioning this entity
  experimentIds: string[]; // Labrya experiments với entity này
}

// Edges
// /tenants/{tenantId}/aiGraph/edges/{edgeId}
interface Relation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: 'exhibits'           // material → property
      | 'measured_by'        // property → method
      | 'synthesized_by'     // material → method
      | 'heterojunction_with'// material ↔ material
      | 'doped_with'         // material → dopant
      | 'applied_to'         // material → application
      | 'reported_in';       // entity → paper
  value?: number;            // numeric property value
  unit?: string;
  confidence: number;        // 0.0–1.0
  paperCount: number;        // papers supporting this relation
  evidenceChunkIds: string[];// RAG chunk IDs
}
```

#### Migration Trigger sang Neo4j

```
Evaluate Neo4j khi:
  □ Total entities > 50,000
  □ Multi-hop queries (material → method → property → application)
    bắt đầu timeout (> 5s)
  □ Cross-tenant graph queries cần thiết
  □ Pattern matching queries phức tạp

Neo4j Aura pricing reference (2026):
  Free: 200K nodes, 400K relationships
  Professional: $65/tháng — 1M nodes
  Enterprise: custom
```

---

### 2.5 Type 5: Vector Embeddings (RAG Pipeline — Phase ai-5)

**→ Vertex AI Vector Search**

#### Embedding Schema

```typescript
interface VectorRecord {
  id: string;              // chunkId
  embedding: number[];     // 1536-dim (text-embedding-004)
                           // hoặc 768-dim (MatSciBERT)
  metadata: {
    tenantId: string;
    sourceType: 'paper' | 'experiment' | 'spectrum_result';
    sourceId: string;      // paperId, experimentId, spectrumId
    chunkIndex: number;
    text: string;          // original text chunk (< 512 tokens)
    spectrumType?: string; // nếu từ spectrum analysis
    materials?: string[];  // entities extracted
    doi?: string;
  };
}
```

#### Index Configuration

```python
# Vertex AI Vector Search index config
index_config = {
    "dimensions": 1536,
    "approximate_neighbors_count": 150,
    "distance_measure_type": "DOT_PRODUCT_DISTANCE",
    "algorithm_config": {
        "treeAhConfig": {
            "leafNodeEmbeddingCount": 500,
            "leafNodesToSearchPercent": 7
        }
    }
}

# Separate indexes per tenant (isolation)
# hoặc metadata filtering nếu Vertex AI support
```

#### Retrieval Pipeline

```python
async def retrieve(query: str, tenant_id: str, top_k: int = 30):
    # 1. Embed query
    query_embedding = await embed(query)  # text-embedding-004

    # 2. Vector search
    vector_results = await vertex_search(
        query_embedding,
        filter=f"tenantId={tenant_id}",
        top_k=top_k * 2  # over-fetch for reranking
    )

    # 3. BM25 search (hybrid)
    bm25_results = await typesense_search(query, tenant_id, top_k)

    # 4. Merge (Reciprocal Rank Fusion)
    merged = rrf_merge(vector_results, bm25_results)

    # 5. Rerank
    reranked = await voyage_rerank(query, merged[:top_k * 2], top_k=8)

    return reranked
```

---

## 3. Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Labrya Experiment Data Layer                      │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│   TYPE 1     │   TYPE 2     │   TYPE 3     │   TYPE 4 & 5           │
│  Raw Files   │  Structured  │  Time-Series │  Graph + Vectors       │
│              │  Results     │  Arrays      │                        │
│  Google      │  Firestore   │  BigQuery    │  Firestore (graph)     │
│  Cloud       │              │              │  + Vertex AI Vector    │
│  Storage     │  - peaks     │  - GCD cycles│    Search (RAG)        │
│              │  - Eg, Rct   │  - CA data   │                        │
│  .xy .csv    │  - phases    │  - long CV   │  Neo4j (future,        │
│  .spe .tif   │  - ai summary│  - IPCE sweep│   > 50K entities)      │
│  .dm3 .spm   │  - citations │              │                        │
│              │              │              │                        │
│  Immutable   │  < 1MB/doc   │  Partitioned │  1536-dim embeddings   │
│  Signed URLs │  Indexed     │  Clustered   │  Hybrid BM25+Vector    │
└──────────────┴──────────────┴──────────────┴────────────────────────┘
       │               │               │                │
       └───────────────┴───────────────┴────────────────┘
                               │
                    Python Cloud Run Workers
                    (pymatgen, ASE, lmfit,
                     impedance.py, MatSciBERT)
                               │
                    ┌──────────┴──────────┐
                    │  Typesense          │
                    │  (Full-text search  │
                    │   chemicals, papers,│
                    │   experiment notes) │
                    └─────────────────────┘
```

---

## 4. Data Flow — Khi User Upload Spectrum

```
1. User chọn file (e.g., xrd_WO3.xy)
   ↓
2. Frontend: validate format + size
   - Allowed: .xy .csv .txt .spe .dpt .wdf .vms .emsa .tif .dm3 .spm .ibw .jpg .png
   - Max size: 50MB (images), 10MB (spectra)
   ↓
3. Frontend: upload trực tiếp lên GCS qua Signed Upload URL
   - Request signed URL từ backend (không đi qua backend)
   - Upload file → GCS
   - Verify sha256 checksum
   ↓
4. Frontend: notify backend "upload complete"
   ↓
5. Backend (Next.js Route Handler):
   - Tạo SpectrumMetadata document trong Firestore
   - status: "queued"
   - Publish message → Cloud Pub/Sub
   ↓
6. Python Worker (Cloud Run, triggered by Pub/Sub):
   - Download file từ GCS
   - Parse format (pymatgen cho XRD, custom cho Raman...)
   - Preprocess: normalize, background subtract
   - Upload processed file → GCS /processed/
   ↓
7. Python Worker → AI Analysis:
   - Tier 2 (Sonnet 4.6): spectrum interpretation
   - lmfit: peak fitting, Tauc plot, EIS circuit fitting
   - pymatgen: phase identification, crystallite size
   ↓
8. Python Worker → Store results:
   - AnalysisResult → Firestore
   - Time-series (nếu GCD/CA) → BigQuery streaming insert
   - Update SpectrumMetadata.status = "analyzed"
   ↓
9. Firestore → Frontend (real-time listener):
   - User thấy kết quả tự động (không cần refresh)
   ↓
10. Optional: Graph extraction (Phase ai-6)
    - NER: extract materials, properties, methods
    - Upsert entities + relations → Firestore aiGraph
```

---

## 5. Tenant Isolation Rules

```
[REQUIRED] GCS: IAM conditions
  → bucket.objects.get: resource.name.startsWith("tenants/{tenantId}/")
  → Service account riêng per tenant (hoặc IAM conditions)

[REQUIRED] Firestore: Security Rules
  → match /tenants/{tenantId}/{document=**} {
      allow read, write: if request.auth.token.tenantId == tenantId;
    }

[REQUIRED] BigQuery: Row Access Policy
  → CREATE ROW ACCESS POLICY tenant_isolation
    ON labrya.experiments.time_series
    GRANT TO ("serviceAccount:...")
    FILTER USING (tenant_id = SESSION_USER_TENANT());

[REQUIRED] Vertex AI: metadata filter
  → Mọi vector search phải có filter: tenantId = {tenantId}

[REQUIRED] Cross-tenant queries: KHÔNG BAO GIỜ
  → Không có admin query nào select * across tenants
  → Aggregated analytics chạy bằng service account riêng
```

---

## 6. Indexes — Firestore Composite Indexes Cần Tạo

```javascript
// firestore.indexes.json
{
  "indexes": [
    // Spectrum list với filter
    {
      "collectionGroup": "spectra",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "spectrumType", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    // Spectrum by sample
    {
      "collectionGroup": "spectra",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "sampleId", "order": "ASCENDING" },
        { "fieldPath": "spectrumType", "order": "ASCENDING" }
      ]
    },
    // Analysis queue
    {
      "collectionGroup": "spectra",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    // Results by sample (comparison)
    {
      "collectionGroup": "results",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "spectrumType", "order": "ASCENDING" },
        { "fieldPath": "analyzedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 7. Cost Estimation

### GCS (Raw Files)

```
Assumptions: 100 experiments/tháng, avg 5 spectra/experiment
             Spectrum avg 1MB, Images avg 10MB

Storage:
  Spectra: 100 × 5 × 1MB = 500MB/tháng
  Images: 100 × 2 × 10MB = 2GB/tháng
  Accumulated (1 năm): ~30GB

Cost: 30GB × $0.02/GB = ~$0.60/tháng (negligible)

Operations (Class A: upload, Class B: download):
  ~$0.05/tháng
```

### Firestore (Metadata + Results)

```
Reads: 10K reads/ngày × $0.06/100K = $0.006/ngày → ~$0.18/tháng
Writes: 1K writes/ngày × $0.18/100K = $0.0018/ngày → ~$0.05/tháng
Storage: 1GB × $0.18/GB = $0.18/tháng

Total Firestore: ~$0.50/tháng (early stage)
```

### BigQuery (Time-Series)

```
Assumptions: 20 GCD experiments/tháng, avg 500K rows each

Storage: 20 × 500K rows × ~100 bytes = 1GB/tháng active
         Accumulated (1 năm): ~12GB

Storage cost: 12GB × $0.02/GB = $0.24/tháng

Query cost: 10 queries/ngày × 100MB/query = 30GB/tháng
            30GB × $5/TB = $0.15/tháng

Total BigQuery: ~$0.40/tháng (early stage, partitioning helps)
```

### Vertex AI Vector Search

```
1,000 papers × 50 chunks × 1536 dim × 4 bytes = ~300MB index
Hosting: ~$0.40/hour × 24 × 30 = ~$288/tháng (dedicated)

→ Dùng batch query mode cho Phase ai-5 (không cần dedicated endpoint):
  $0.0001/query × 1,000 queries/tháng = $0.10/tháng
```

### Total Estimated Cost (Early SaaS, 10 tenants)

| Service | Cost/tháng |
|---|---|
| GCS | ~$1 |
| Firestore | ~$5 |
| BigQuery | ~$4 |
| Vertex AI Vector (batch) | ~$1 |
| Cloud Run (Python workers) | ~$10–30 |
| **Total** | **~$20–40/tháng** |

---

## 8. Anti-Patterns — Không Bao Giờ Làm

```
❌ Lưu file content (base64) trong Firestore document
   → Document limit 1MB, không scale, đắt

❌ Lưu time-series arrays trong Firestore
   → [{time: 0, v: 1.2}, {time: 0.1, v: 1.3}, ...] với 500K rows
   → Sẽ timeout, cost cực cao, hit document size limit

❌ Query Firestore cho aggregation (COUNT, AVG, SUM)
   → Không native support, phải đọc tất cả documents
   → Dùng BigQuery hoặc maintain counter documents

❌ Lưu raw embedding vectors (1536 float) trong Firestore
   → 1536 × 4 bytes = 6KB/embedding × 50K chunks = 300MB
   → Không có ANN search, linear scan O(n)

❌ Cross-tenant data access trong một query
   → Vi phạm tenant isolation, security issue

❌ Download file từ GCS qua backend server
   → Bandwidth bottleneck, không scale
   → Dùng Signed URLs, client download trực tiếp từ GCS

❌ Expose GCS paths trực tiếp ra client
   → Bypass access control
   → Luôn dùng Signed URLs với expiry

❌ Store sensitive chemical data unencrypted trong GCS metadata
   → Dùng Firestore với security rules, không GCS metadata

❌ Không có sha256 checksum khi upload
   → Không detect file corruption hoặc tampering

❌ Overwrite raw/ files trong GCS
   → Mất data gốc, không audit-able
   → Immutable raw, versioned processed
```

---

## 9. Implementation Priority

| Task | Priority | Phase | Effort |
|---|---|---|---|
| GCS bucket structure + IAM | 🔴 Critical | Ngay | 1 tuần |
| Firestore SpectrumMetadata schema | 🔴 Critical | Ngay | 3 ngày |
| Signed URL upload flow | 🔴 Critical | Ngay | 3 ngày |
| Firestore composite indexes | 🔴 Critical | Ngay | 1 ngày |
| Firestore AnalysisResult schemas | 🔴 Critical | Phase B.4 | 1 tuần |
| Python parser integration (pymatgen, lmfit) | 🔴 Critical | Phase B.4 | 2–3 tuần |
| BigQuery time-series table + streaming | 🟡 High | Phase B.4 | 1 tuần |
| BigQuery row-level security | 🟡 High | Phase B.4 | 2 ngày |
| Vertex AI Vector Search index | 🟡 High | Phase ai-5 | 1 tuần |
| Typesense full-text search | 🟡 High | SaaS Launch | 1 tuần |
| BigQuery materialized views | 🟢 Medium | After 10 tenants | 3 ngày |
| Neo4j graph migration | 🟢 Low | Phase ai-6+ | 2–4 tuần |
| HDF5 parser | 🟢 Low | Phase C+ | 1 tuần |

---

*Document này là nguồn tham chiếu duy nhất cho data layer decisions liên quan đến experiment data.*  
*Update trigger: Thêm spectrum type mới, thay đổi AI model, scale > 100 tenants.*  
*Owner: AI Architecture Lead + Backend Lead.*
