# Citation Matching

> **Status:** Reference document
> **Phase:** R161 base + R162 internal library + R162 grounding
> **Cross-refs:** `xrd-analysis.md` §12 (matching algorithm) + §17 (internal library) + §18 (AI grounding)

Citation matching is the bridge between detected peaks (§1) and external
references (COD, Materials Project, ICDD via tenant library). It produces the
citation candidates that flow into UI cards (`XRDPhaseSummary`) and AI grounding
prompts (§18).

## Sources

Three citation sources, three trust levels, one ranking algorithm:

| Source     | Provenance               | Coverage          | Trust (R162)  |
|------------|--------------------------|-------------------|---------------|
| COD        | Public database          | ~500K structures  | High (peer-reviewed CIFs) |
| MP         | Materials Project (DFT)  | ~150K structures  | High (well-curated)       |
| Internal   | Tenant ICDD/JCPDS paste  | Per-tenant        | High (user-vouched)       |
| Unverified | None matched             | —                 | Low (rejected at < 0.4 score) |

## Algorithm (unified across sources)

Function: `matchScore(userPeaks, refPeaks, toleranceDeg=0.3)`
Location:
- Worker (Python): `labyra-spectra-worker/src/citation/match.py` (for COD/MP)
- App (TypeScript): `src/lib/spectra/match-score.ts` (for internal)

Both implementations encode the same logic:

```
For each reference peak ref_i with intensity I_i (0-100):
  weight_i = I_i / 100
  total_weight += weight_i
  Find user peak u_j closest to ref_i within ±0.3°
  If found: matched_weight += weight_i

score = matched_weight / total_weight    ∈ [0, 1]
```

**Why intensity-weighted:**
- A weak reference peak missing is less concerning than a strong one missing.
- A weak user peak matching a strong reference is significant evidence.
- Pure count-based ratio over-weighs noise.

**Why ±0.3° tolerance:**
- Typical zero-shift on lab instruments: 0.05-0.15°
- Lattice strain shift: up to 0.2° for moderately strained samples
- 0.3° captures both with margin, narrower would miss real matches
- Could be exposed as user-tunable in R163 (see Tech debt #19 — proposed)

## Ranking + grounding flow

```
Worker:                          App:
1. Detect peaks  →               4. Fetch tenant reference cards
2. Query COD + MP                5. computeInternalCandidates() (same algo)
3. matchScore each → score      ─┐
                                 ├─ 6. Merge worker + internal candidates
                                ─┘    sorted by match_score (toSorted)
                                 7. Render XRDPhaseSummary
                                 8. AI sees ranked list, follows §18 RULE 2
```

## Threshold semantics

| Score range | Status      | UI label    | AI behavior          |
|-------------|-------------|-------------|----------------------|
| ≥ 0.7       | High        | "Strong match" | Confidently cite     |
| 0.4-0.7     | Medium      | "Plausible"    | Cite, note alternatives in `warnings` |
| 0.3-0.4     | Low         | "Weak match"   | Show, but AI uses `unverified` per §18 RULE 2 |
| < 0.3       | Filtered    | Not shown      | Excluded by internal lib (Trust > Coverage) |

## Stage 2 (future, deferred to ICDD partnership)

ICDD PDF-2/4+ official database integration when scaling international:
- Requires licensing agreement (~$25K/year institutional)
- 1.2M+ structures, gold-standard for industry
- API would slot in as 4th source with same `matchScore` interface
- No code changes needed beyond new fetcher module

## References

- Match algorithm: see implementation comments in `match-score.ts` / `match.py`
- COD: Gražulis, S. et al. (2009). J. Appl. Cryst. 42, 726.
- MP: Jain, A. et al. (2013). APL Materials 1, 011002.
- ICDD PDF: International Centre for Diffraction Data. https://www.icdd.com/

<!-- R162-docs-scientific -->


---

## Paper Citation Extraction (R166 ai-6)

> **Status:** Reference document
> **Phase:** R166 ai-6 base + R168-3.3 refinement
> **ADR:** [ADR-017 Citation Network](../adr/ADR-017-citation-network.md)

This section covers **paper-to-paper citation extraction**, distinct from the
phase-to-CIF matching above. Goal: build a citation graph from explicit DOI
references parsed out of paper PDFs.

### Pipeline

```
PDF upload
  → OCR (Mistral)            → markdown text
  → references parser         → list<{doi, context}>
  → Crossref lookup           → CitationMetadata | 404
  → OpenAlex fallback         → CitationMetadata | 404
  → createCitation()          → Firestore: tenants/{tid}/citations/{id}
  → recomputeCitationStats()  → denormalized counts on source paper
```

### DOI regex strategy (R168-3.3 strict shape)

**Scan regex** (extract phase, in references section):
```
\b10\.\d{4,9}/[-._;()/:a-zA-Z0-9]*[a-zA-Z0-9](?![.\d])
```

| Component | Purpose |
|---|---|
| `\b10\.` | DOI prefix word-boundary anchor |
| `\d{4,9}/` | Registrant code (4-9 digits) |
| `[-._;()/:a-zA-Z0-9]*` | Body (0+ chars, allows internal dots/slashes) |
| `[a-zA-Z0-9]` | **Required alphanum ending** (rejects trailing punctuation) |
| `(?![.\d])` | **Negative lookahead** (rejects `.1`, `.5b00123`, etc.) |

**Validate regex** (Zod schema, post-cleanup):
```
^10\.\d{4,9}/[-._;()/:a-zA-Z0-9]*[a-zA-Z0-9]$
```

Same shape, anchored on both ends — catches anything that slipped past
scan-time cleanup.

### Why "Trust > Coverage" applies here

A DOI returned by extraction is only useful if it can be looked up in a
trusted external source. Three trust levels in the pipeline:

| Confidence    | Trigger | What it means |
|---|---|---|
| `manual`      | Operator entered citation by hand | Highest trust (human-verified) |
| `doi-exact`   | Regex pass + Crossref OR OpenAlex returned metadata | DOI verifiably exists |
| `title-fuzzy` | No DOI but title match via API | Title-only fallback (reserved) |
| `unverified`  | Regex pass + Crossref + OpenAlex both 404 | DOI extracted but unconfirmed |

**`unverified` is the key R168-3.3 addition.** Before the fix, citations
with metadata=null were created with `confidence='doi-exact'` (wrong) — a
DOI that 404s in every major registrar is NOT verified, regardless of
shape compliance. Silent skip would lose PROV-O audit trail; downgrade to
`unverified` preserves traceability while signaling low trust.

### Idempotency

Citation document ID is deterministic:
```
{sourcePaperId}:d:{sha256(targetDoi).slice(0,8)}
```

Re-running the pipeline on the same paper produces identical IDs, so
duplicate writes are no-ops. The service layer additionally protects
against confidence downgrades on re-processing — a stored `manual` will
never be overwritten by a fresh `doi-exact`, etc.

---

## R168-3.3 — Regex Strictness Evolution + Confidence Hierarchy

> **Status:** Post-mortem + design rationale
> **Phase:** R168-3.3 (May 2026, [R168-3.3d](../round-r167-handoff.md#33-doi-regex-false-positives))
> **Trigger:** Surfactants paper (16 pages, R167 smoke test) created 5 citations
>              from 1 real DOI. Audit revealed regex false positives.

### Bug

Original regex:
```
\b10\.\d{4,9}/[-._;()/:a-zA-Z0-9]+
```

For real DOI `10.1021/ja407115p`, OCR noise produced 4 variants — all
matched by the unconstrained body class `[-._;()/:a-zA-Z0-9]+`:

| Variant | OCR origin | Old regex | New regex |
|---|---|---|---|
| `10.1021/ja407115p` (real) | clean | ✅ match | ✅ match |
| `10.1021/ja407115p.1` | misread superscript / footnote marker | ❌ matches (sai) | ✅ rejected (lookahead) |
| `10.1021/ja407115p.l` | `1` misread as `l` (ell vs one) | ❌ matches (sai) | ✅ rejected (lookahead) |
| `10.1021/ja407115p/1` | OCR injected slash | ❌ matches (sai) | ⚠ matches; Crossref 404 → `unverified` |
| `10.1021/ja407115pJ` | adjacent letter bled in | ❌ matches (sai) | ⚠ matches; Crossref 404 → `unverified` |

The first 2 variants are rejected at regex layer (Strategy A). The latter
2 cannot be distinguished by regex alone — a legitimate Zenodo DOI like
`10.5281/zenodo.123/v1` ends in `/v1` and is real, so we cannot blanket-reject
`/N` suffixes. Strategy B (Crossref 404 → `unverified`) catches them at
the lookup layer with audit trail preserved.

### Strategy: A + B combined

**A. Regex strict** (extract-time, free):
- Reduces false positives by ~50% without API cost.
- Conservative — does not over-reject (allow legitimate version suffixes).

**B. Crossref/OpenAlex 404 → `unverified`** (lookup-time, audit-preserving):
- Catches noise that regex cannot distinguish from legitimate suffixes.
- Citation entry created (PROV-O compliant) with `confidence='unverified'`.
- Re-scan job (future) can upgrade `unverified` → `doi-exact` if APIs
  later resolve the DOI (e.g., new pre-print indexed).

### Why NOT delete on 404

Considered Strategy C: skip citation entirely if both APIs 404.

Rejected because:
1. **PROV-O compliance**: Every reference encountered should appear in audit
   trail. Silent skip = "where did this extraction go?" later.
2. **Future re-scan**: A DOI 404 today (preprint not yet indexed) may
   resolve in 6 months. Storing as `unverified` enables periodic re-check.
3. **Operator workflow**: When reviewing a paper's bibliography, operator
   wants to see "the parser found 47 DOIs, 45 verified, 2 unverified",
   not "the parser found 45 DOIs" (silent loss).

### Confidence ranking (R168-3.3b)

Used by `createCitation()` idempotency check — never overwrite higher trust
with lower trust:

```typescript
const order: Record<Citation['confidence'], number> = {
  unverified: 1,
  'title-fuzzy': 2,
  'doi-exact': 3,
  manual: 4
};
```

### Implementation files

| File | Role |
|---|---|
| `src/lib/schemas/citation-schema.ts` | `DOI_REGEX` validate + Zod enum |
| `src/types/citations.ts` | TS type alias |
| `src/lib/ai/citations/references-parser.ts` | Scan regex (extract phase) |
| `src/lib/ai/rag/pipeline/citation-step.ts` | 404 → `unverified` logic |
| `src/lib/firebase/citations/service.ts` | Confidence ordering |
| `labyra-spectra-worker/src/papers/citation_types.py` | Python type mirror |
| `labyra-spectra-worker/src/papers/references_parser.py` | Python parser |
| `labyra-spectra-worker/src/papers/citation.py` | Python citation step |

### Operational tools

- `scripts/_audit-fake-citations.mjs` — dry-run audit + `--delete` + `--downgrade`
  Classifies existing citations against new regex + Crossref, removes regex-fail,
  downgrades 404s to `unverified`.

<!-- R168-3.3d -->
