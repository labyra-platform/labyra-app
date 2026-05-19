# FTIR Reference Library — Scientific Method

> Reference card database for FTIR functional group identification.

**Phase**: R182 (May 19, 2026)
**Status**: Live (29 cards seeded)
**Path**: `tenants/{tenantId}/references` (Firestore)

---

## 1. Purpose

After Gemini Flash analyzes an FTIR spectrum and assigns functional groups (with confidence levels), the system queries the tenant's reference card library to surface **independent corroboration**: which known functional groups in the library match the detected peaks within tolerance.

This provides a second opinion that is grounded in canonical IR data (NIST WebBook + Coates IR Table) rather than the LLM's parametric memory. The user sees both:
- AI assignment with confidence (high/medium/low) and reasoning
- Library matches with match score (how many library peaks aligned to user peaks)

---

## 2. Data sources

- **NIST Chemistry WebBook** — https://webbook.nist.gov (free, >5000 compounds, peer-reviewed)
- **Coates J. (2000)** — "Interpretation of Infrared Spectra, A Practical Approach", Encyclopedia of Analytical Chemistry, DOI: 10.1002/9780470027318.a5606
- **Nakamoto K. (2009)** — "Infrared and Raman Spectra of Inorganic and Coordination Compounds", 6th ed., Wiley, ISBN 978-0-471-74339-2

---

## 3. Schema

Each card is a Firestore document under `tenants/{tenantId}/references` matching the `FTIRReferenceCard` discriminated union variant:

```typescript
{
  spectrumType: 'ftir',
  cardNumber: string,              // e.g. "FTIR-LIB-001"
  phaseName: string,               // e.g. "Carbonate CO3"
  formula: string,                 // must start with capital letter (Zod constraint)
  source: 'manual' | 'cod' | 'mp' | 'paper',
  sourceUrl?: string,
  mode?: 'transmittance' | 'absorbance',
  peaks: [                         // min 2, max 200
    {
      wavenumber: number,          // cm⁻¹, typical 400-4000
      intensity: number,           // relative 0-100
      assignment?: string          // e.g. "CO3 asymmetric stretch (v3)"
    }
  ],
  // ProvBase fields (auto-set by service layer):
  id, tenantId, lifecycleStatus, version, createdAt, createdBy
}
```

### 3.1 Why FormulaSchema requires capital letter

Zod constraint `formula: must start with capital letter`. Reject `R-OH`, `M-OH`, `C=O`, `R-NH2`.

Workaround: use bare functional group abbreviation (`OH`, `CO`, `NH2`, `COOH`). The full radical context lives in `phaseName` and `notes`.

---

## 4. Matching algorithm

See `src/lib/spectra/multi-match-score.ts` — `matchScoreFTIR()`:

```
For each reference card:
  matched_peaks = 0
  For each peak in reference:
    Find nearest user peak within ±15 cm⁻¹ (configurable)
    If found and not already claimed: matched_peaks += 1
  score = matched_peaks / total_reference_peaks
  If score >= 0.3 (THRESHOLD_MULTI): include in candidate list
```

Renders via `MultiCitationsPanel` component, sorted by `match_score` descending.

### 4.1 Tolerance rationale

- **±15 cm⁻¹** for sharp peaks (C=O, P-O, S-O)
- Broader matching (±50 cm⁻¹) considered for H-bonded O-H but not yet implemented (R183 candidate)

### 4.2 Threshold rationale

`THRESHOLD_MULTI = 0.3` means a candidate must explain ≥30% of its own characteristic peaks. Empirically chosen to filter spurious single-peak matches while accepting partial coverage from broad functional groups.

---

## 5. Seeded library (R182)

29 cards across 7 categories:

| Category | Count | Examples |
|---|---|---|
| Hydroxyl / water | 3 | Free O-H, H-bonded O-H, M-OH |
| Carbonate / bicarbonate | 2 | CO₃²⁻, HCO₃⁻ |
| Sulfate / nitrate / phosphate | 3 | SO₄²⁻, NO₃⁻, PO₄³⁻ |
| Silicate / aluminate | 2 | Si-O-Si, Al-O octahedral |
| Metal oxides / sulfides | 5 | M-O lattice, WO₃, TiO₂, ZnO, M-S |
| Organic functional groups | 10 | C-H, aromatic, C=O, COOH, ester, amide, amine, nitrile, alcohol, ether |
| Specific materials | 4 | PFSA (Nafion), GO, cellulose, MOF carboxylate |

Cards seeded via `POST /api/references` to ensure Zod validation + lifecycle metadata.

---

## 6. Known limitations

1. **Static library** — doesn't grow with user uploads. R190+ will add UI to extract reference cards from analyzed FTIR spectra of known materials.
2. **Wavenumber tolerance is global** — should be width-aware (broad O-H needs wider tolerance than sharp C=O).
3. **No intensity weighting** — currently match is position-only. Intensity could weight match score for stronger cards.
4. **No paper linking** — cards seeded as `paperId: null`. When ai-5 RAG ships, FTIR assignments from user papers will create cards with `paperId` set.

---

## 7. Adding new cards

Via UI (`+ Add reference` button on FTIR analysis page) or programmatically via `POST /api/references` with body matching `CreateFTIRReferenceSchema`.

Future R183 will add Raman (`CreateRamanReferenceSchema`) and UV-Vis (`CreateUVVisReferenceSchema`) reference libraries with comparable seed counts.

---

## 8. References

- ADR-019 (AI tier architecture) — FTIR analysis runs at Tier 2 (Gemini Flash)
- `src/lib/schemas/reference-schema.ts` — Zod validation
- `src/lib/spectra/multi-match-score.ts` — matching implementation
- `src/features/spectra/components/multi-citations-panel.tsx` — render

*Last updated: R182 (2026-05-19) — initial 29-card seed*
