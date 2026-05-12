# RAG_STRATEGY.md — Labyra Corpus Indexing & Retrieval

> Strategy document specific to Labyra's electrochemical materials science corpus.
> For general AI architecture, see `AI_ARCHITECTURE.md`. For GraphRAG specifics,
> see `AI_ARCHITECTURE.md` Section 22.

**Status**: Planning (Phase 5 / ai-5 onwards)
**Last updated**: R160 era

---

## 1. Corpus profile

### 1.1 Seed corpus (Lab BKU initial upload)

- **Size**: ~5,000 papers (PDF, not OCR'd)
- **Format**: PDF research articles (no books, no theses, no reviews mixed in)
- **Subject area**: Electrochemical materials science

### 1.2 Domain decomposition (4 application clusters)

| Cluster | Common entities | Typical methods | Key metrics |
|---|---|---|---|
| **Energy storage** (battery) | Li/Na/K-ion electrodes, anodes, cathodes, electrolytes | GCD, CV, EIS, XRD, SEM | Capacity (mAh/g), cycle stability, rate capability |
| **Supercapacitors** | Carbon, MXene, conducting polymers, metal oxides | CV, EIS, GCD, BET surface area | Specific capacitance (F/g), energy density (Wh/kg), power density (kW/kg) |
| **Gas sensors** | SnO₂, ZnO, WO₃, MoS₂, conducting polymers | Resistance vs time, I-V curves | Response %, recovery time (s), selectivity, target gas |
| **Water splitting (PEC + EC)** | WO₃, BiVO₄, MoS₂, Ni-Fe LDH, transition metal phosphides | LSV, Tafel plot, IPCE, Mott-Schottky, Faradaic efficiency | Photocurrent (mA/cm²), overpotential @10 mA/cm², onset potential |

### 1.3 Shared entity vocabulary

Strong overlap across clusters → single graph viable:
- **Shared materials**: WO₃, MoS₂, TiO₂, NiO, Co₃O₄ appear in 3+ clusters
- **Shared methods**: XRD, Raman, XPS, EIS are universal
- **Shared properties**: bandgap, surface area, electrical conductivity

This makes Labyra's corpus **ideal for GraphRAG** — controlled vocabulary, ~500
unique chemical formulas total, manageable entity space.

---

## 2. Indexing pipeline

### 2.1 Stages

```
PDF upload (Phase ai-5 UI) or Zotero sync (Phase ai-7)
  ↓
[Chandra OCR] — extract markdown with section structure
  $0.005/page × ~25 pages = $0.125/paper
  ↓
[Section-aware chunker]
  Title + Abstract → 1 chunk (always retrieved with paper)
  Methods → chunks of ~800 tokens
  Results → chunks of ~600 tokens (smaller for table/figure context)
  Conclusions → 1-2 chunks
  Citations → indexed separately (citation graph)
  ↓
[Contextual enrichment] — Anthropic Claude Haiku 4.5
  Prepend 1-2 sentences of paper context to each chunk
  Cache full paper text (90% cost saving per chunk after first)
  ~$0.005/paper after caching
  ↓
[Voyage embed] — voyage-3-large, 1024-dim vectors
  $0.06/M tokens × 8000 tokens/paper × 5000 = $2.4 total
  ↓
[BM25 inverted index] — chemistry-aware tokenizer
  Preserves formulas (WO₃ stays as one token)
  Splits CamelCase scientifically (TiO2 → ['TiO2', 'Ti', 'O2'])
  Free (TS-side processing)
  ↓
[Entity + relation extraction] — Phase ai-6 (GraphRAG)
  Claude Haiku NER with cached domain glossary
  ~$0.03/paper = $150 total for 5000 papers
  ↓
Firestore writes:
  /tenants/{tenantId}/papers/{paperId}             — metadata
  /tenants/{tenantId}/paperChunks/{chunkId}        — text + embedding + BM25 tokens
  /tenants/{tenantId}/aiGraph/entities/{entityId}  — Phase ai-6
  /tenants/{tenantId}/aiGraph/relations/{relId}    — Phase ai-6
```

### 2.2 Cost summary (one-time, for 5,000-paper seed corpus)

| Stage | Cost |
|---|---|
| Chandra OCR | $625 |
| Contextual chunk enrichment (Haiku cached) | $20 |
| Voyage embed | $2.40 |
| Storage (10GB Firebase) | $0.26/month |
| Entity + relation extract (Phase ai-6) | $150 |
| **Total all-in (vanilla + graph)** | **~$800 one-time + $30/month** |

For comparison: 1 hour of researcher time saved = $5-25 USD value. ROI < 1 month at
single-lab scale.

---

## 3. Retrieval strategy

### 3.1 Vanilla hybrid (Phase ai-5)

```
Query → Voyage embed query (1024-dim)
  Parallel:
    Vector search: cosine similarity on chunk embeddings → top 30
    BM25 search: chemistry-tokenized → top 30
  ↓
Reciprocal Rank Fusion (RRF) → merge to top 30
  ↓
Voyage rerank-2.5 → top 8 chunks
  ↓
Pass to LLM with structured context
```

**Expected recall** (estimated against eval corpus from labbook-bku):
- Lookup queries ("what is X"): ~85%
- Aggregation queries ("which materials beat threshold"): ~45%
- Relational queries ("how does A affect B"): ~50%

### 3.2 GraphRAG augmentation (Phase ai-6)

```
Query → NER (extract mentioned entities)
  ↓
Two-stage retrieval:
  Stage A: Vanilla hybrid (above) → top 30 chunks
  Stage B: Graph traverse from query entities, 1-2 hops → subgraph
    → expand to chunks referenced by graph edges
  ↓
RRF merge → top 30 candidates
  ↓
Voyage rerank-2.5 → top 8 chunks + structured graph context
  ↓
Pass to LLM
```

**Expected recall improvement**:
- Lookup queries: +0-5% (no major gain)
- Aggregation queries: +35-40%
- Relational queries: +30-35%

---

## 4. Eval framework

### 4.1 Test set construction

Build 200-query eval set across 4 categories:

| Category | # queries | Examples |
|---|---|---|
| Lookup | 50 | "What is the bandgap of WO₃?" |
| Aggregation | 50 | "Which photocatalysts have IPCE > 30% at 400 nm?" |
| Relational | 50 | "How does Ni-doping affect MoS₂ HER performance?" |
| Multi-hop reasoning | 50 | "Compare supercaps using carbon vs MXene electrodes" |

Each query has gold-standard answer + supporting paper IDs.

### 4.2 Metrics

- **Hit@K** — does correct paper appear in top K retrieved?
- **Faithfulness** — does LLM answer match retrieved chunks (no hallucination)?
- **Citation accuracy** — are cited papers actually in retrieved set?

### 4.3 Comparison runs

Run eval on:
- Vanilla RAG (ai-5 only)
- +Contextual chunking (Anthropic technique)
- +HyDE query rewriting (Phase ai-6 sub-task)
- +GraphRAG (Phase ai-6 full)

Pick configurations with cost-benefit table.

---

## 5. Multi-tenant considerations

### 5.1 Tenant isolation

- All paper chunks scoped to `/tenants/{tenantId}/paperChunks/{chunkId}`
- Graph nodes/edges scoped per-tenant
- Query never crosses tenant boundary
- Test case: tenant A and tenant B both upload "WO₃ bandgap" paper, must be independent entities

### 5.2 Curated shared corpus (Phase E premium tier)

Future product idea — a curated "Labyra Materials Index":
- 5,000 high-quality papers curated by Labyra team
- Accessible to Premium tier tenants
- Stored under `/platform/sharedCorpus/...` (separate from tenant data)
- Tenants can opt-in: their queries also search shared corpus
- Pricing: +$50/month for Premium

### 5.3 Personal vs lab knowledge

- Lab admin uploads → shared with all lab members
- Member uploads → personal scope (under `/tenants/{tenantId}/users/{userId}/papers/`)
- Phase 2 feature: paper visibility (private, lab, citation-only)

---

## 6. Source connectors (Phase ai-7+)

Researchers won't change their personal workflows. Labyra is the index, not the
storage. Connectors:

| Source | Phase | API access | Effort |
|---|---|---|---|
| Direct PDF upload | ai-5 | drag-drop UI | 2 rounds |
| Zotero | ai-7 | Web API + OAuth | 3 rounds |
| Mendeley | Phase 6 | Web API + OAuth | 2 rounds |
| BibTeX import | ai-7 | file parse | 1 round |
| arXiv auto-fetch | Phase 6 | public API by query | 2 rounds |
| Google Drive | Phase 6 | Drive API + watch trigger | 3 rounds |
| Local NAS (rsync) | Phase 7 | self-host agent | future |

**Anti-pattern**: don't try to be Zotero. Be the AI index that sits next to it.

---

## 7. Phase plan summary

| Phase | Deliverable | Cost ($K) | Cost (rounds) |
|---|---|---|---|
| ai-5 | PDF upload UI + OCR + chunk + embed + vanilla RAG retrieval | ~$650 one-time, $25/mo | 4-5 rounds |
| ai-6 | Entity extraction + graph schema + hybrid retrieval + eval framework | +$150, +$5/mo | 5-7 rounds |
| ai-7 | Zotero connector + BibTeX import | nominal | 3 rounds |
| Phase 6 | Multi-source connectors + eval iteration | nominal | TBD |

---

## 8. References

- `AI_ARCHITECTURE.md` Section 22 (GraphRAG decision)
- `AI_IMPROVEMENTS_REPORT.md` (contextual chunking, HyDE)
- Anthropic Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval
- Microsoft GraphRAG: https://github.com/microsoft/graphrag
- Voyage AI rerank-2.5: https://docs.voyageai.com/docs/reranker

*Living document. Update when corpus profile or retrieval strategy changes.*
