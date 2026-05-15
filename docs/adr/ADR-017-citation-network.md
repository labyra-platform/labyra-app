# ADR-017: Citation Network (ai-6 GraphRAG)

**Status:** Accepted
**Date:** 2026-05-15
**Phase:** R166 ai-6

## Context

After R164 (PROV-O ELN) + R165-5 (ai-5b wired), papers are uploaded and indexed
into Pinecone with vector embeddings. Single-paper retrieval works.

For multi-paper intelligence ("which papers cite X?", "literature review on Y"),
we need a citation network. Concept-similarity edges (LLM-inferred) violate the
project's "Trust > Coverage" principle (Memory entry #24, #11) — LLMs hallucinate
DOIs and concept boundaries drift across model versions.

## Decision

Build citation network from **explicit citations** parsed from PDF references section.
DOI is ground truth (Crossref/OpenAlex resolvable). Title-fuzzy fallback when no DOI.

### Architecture

```
Paper upload (PDF)
  ↓ [ai-5 pipeline existing]
OCR → chunks → embed → index
  ↓ [NEW ai-6 background job]
extractReferences(ocrText)        — regex DOI from references section
  ↓
lookupMetadata(doi)               — Crossref primary, OpenAlex fallback
  ↓
createCitation()                  — stored as edge in tenants/{tid}/citations/
  ↓
resolveInternalTargets()          — match targetDoi to internal paperIds
  ↓
recomputeCitationStats(paperId)   — denormalized counts
```

### Storage

- **Citations:** `tenants/{tid}/citations/{id}` — one doc per edge
- **Stats:** `tenants/{tid}/papers/{paperId}/_stats` — denormalized counts
- **Job queue:** reuse R165-5 InProcessQueue, new job type `citation_extraction`

### Multi-tenant isolation

Same nested tenant pattern as R164. No cross-tenant queries.

### External APIs

- **Crossref** (primary): free, 50 req/s rate, REST API at `api.crossref.org`
- **OpenAlex** (fallback): free, 100k/day, REST API at `api.openalex.org`

Both NO API key required for low-volume Stage 1.
Stage 2 (>1k papers/day): register for Crossref Plus + OpenAlex polite pool.

### Rate limiting

External API calls run in **separate background job** (not ai-5 pipeline) to:
- Prevent blocking user upload UX
- Allow retry on API downtime
- Throttle to respect external rate limits without affecting indexing

### Edge cases

1. **No DOI extractable**: Store title-only Citation with confidence='title-fuzzy'.
   Lookup Crossref by title to get DOI later (best-effort).
2. **Target not in DB**: targetPaperId = null. Periodic re-scan when new papers added.
3. **Duplicate citations**: ID = `{sourcePaperId}:{sha256(targetDoi).slice(0,8)}` for dedup.
4. **Self-citation**: Allowed (author cites own previous work).
5. **Retracted papers**: targetDoi may resolve to retracted DOI. Crossref returns `is-retracted` flag → store as metadata, don't filter.

## Consequences

### Positive
- **Trust:** Every edge is verifiable in PDF references section
- **Scalability:** External APIs are stable (20+ years), no maintenance
- **Composability:** Citation data unlocks future features (literature review autopilot, conflict detection, citation suggestion)
- **PROV-O compliance:** Citations as first-class entities with full audit

### Negative
- **Cold start:** Need N papers (>20) before graph becomes useful
- **Extraction failure rate:** ~5-10% of PDFs have poorly-formatted references; we accept partial graph
- **API dependency:** Crossref/OpenAlex downtime = extraction delay (retry handles it)

### Mitigations
- Manual citation entry UI for missing edges (confidence='manual')
- Background re-extraction job (cron) for papers with low confidence scores

## Implementation phases

- **Phase 6a-1** (this patch): Types + Zod schemas
- **Phase 6a-2**: Services (createCitation, findByX, resolveInternal)
- **Phase 6a-3**: Pipeline integration (background job + Crossref/OpenAlex)
- **Phase 6b**: UI (paper detail "Cited by" + D3 network viz)
- **Phase 6c**: AI tool `searchCitations` + dispatcher integration

## References

- ADR-016 (PROV-O ELN) — foundation
- W3C PROV-O specification
- Crossref API docs: https://api.crossref.org
- OpenAlex API docs: https://docs.openalex.org

---

@phase R166-ai6a-1
