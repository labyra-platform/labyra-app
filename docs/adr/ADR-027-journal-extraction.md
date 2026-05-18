# ADR-027: Journal Metadata Extraction (R179-2)

<!-- R179-2-2026-05-18 -->
<!-- @r179-2-applied -->

**Status**: Accepted
**Date**: 2026-05-18
**Phase**: R179-2

---

## Context

Papers indexed in Labyra have DOI but no journal/venue metadata. Users
filter on Domain (R178-3) and want to also filter by journal/year for:
- Literature review scoping ("show all Nature Energy papers")
- Recency triage ("only 2024+ in my Li-ion subset")
- Journal-quality assessment ("how many ACS-published papers do I have")

Crossref `container-title` + ISSN provide this for free. OpenAlex covers
papers Crossref misses (less common, but exists for older / preprint cases).

## Decision

Add Step 1e to worker pipeline after Step 1d classify: resolve journal
metadata from DOI via Crossref → OpenAlex fallback. Persist
`journal/journalShort/journalIssn/journalSourceId/journalResolvedAt` on
Paper doc. No audit log collection (lighter than R178-3 classify which has
prompt/model versioning concerns; journal lookup is deterministic API call).

### Why pipeline (not on-demand)

- 1-shot cost: 1 HTTP call per paper, ~$0 (Crossref free)
- Avoid query-time latency on filter UX
- Cached forever after first resolve (immutable journal metadata)

### Why Crossref first, OpenAlex fallback

- Crossref: faster (~150ms), authoritative for DOI registry
- OpenAlex: catches papers with DOI not registered in Crossref (preprints,
  older journals)
- Both free, no auth needed

### Why no audit log

R178-3 audit was needed because classification depends on Gemini prompt +
model version (drift over time, need to track for migrations). Journal
lookup = deterministic API response, no AI involved. If Crossref changes
their schema, that's a code-level breakage we handle by version bump.

### Filter UX decisions

- **Year**: dual number input (min/max), bounds inferred from paper set
- **Journal**: multi-select chip list, sort by count desc, search box if >6
- Both client-side computation from Paper[] (no Firestore aggregation)

## Consequences

### Positive
- Free metadata enrichment
- Foundation for future "journal-quality" features (Impact Factor lookup, etc.)
- Backfill script ships same round → existing papers covered

### Negative
- +1 external API dependency per paper (graceful fallback to empty)
- Adds 5 fields to Paper schema
- Backfill must run after deploy for existing papers

## Alternatives considered

### Alt 1: Use existing citation-extraction pipeline output

R166 already calls Crossref for citation chunks. Could persist parent paper's
own metadata as a side-effect. **Rejected**: citation extraction runs on
references LIST, not paper itself. Different code path, different DOI source.

### Alt 2: AI-extract journal name from paper text

PDF first page often shows journal header. Gemini could OCR + extract.
**Rejected**: Crossref API already authoritative for any DOI'd paper. AI
extraction = unnecessary cost + drift risk.

### Alt 3: Top-N journal list with "Other" bucket

Limit chips to top-10 journals, gather rest under "Other".
**Rejected**: niche journals (1-2 papers) are exactly the ones users want
to filter on. Search box + scroll list scales better.

## Future revisit triggers
- >50 journals in single tenant → consider grouping by publisher
- Impact Factor / quartile info needed → integrate SCImago API
- Custom journal aliases (user wants "JMCA" instead of full name) → R180+
