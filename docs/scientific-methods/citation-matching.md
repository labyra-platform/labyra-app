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
