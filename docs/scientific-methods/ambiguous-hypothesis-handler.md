# Ambiguous Hypothesis Handler (R185-9)

## Overview

Real-world spectra often have observations explainable by multiple physical/
chemical causes. Naive output of "rule X fired with 0.7 confidence" oversells
certainty. This module:

1. Clusters hypotheses by underlying observation (not rule_id)
2. Re-scores candidates using multi-spectrum evidence (CSIE consistency)
3. Suggests discrimination experiments from a curated knowledge base
4. Flags severity: info / warning / error based on score gap

## Observation Clusters

Five canonical clusters cover the dominant ambiguity cases:

| Cluster ID | Observation | Competing causes |
|------------|-------------|------------------|
| `raman_peak_shift_with_broadening` | Raman peak shifted + broadened | Strain (R1/R2), phonon confinement (R3), doping (R6), charge transfer (R11) |
| `tmd_polymorph_ambiguity` | TMD basal peak ~14.4° 2θ | 2H-MoS₂ vs 2H-WS₂, layer count (R7) |
| `carbon_disorder_signature` | Carbon D/G ratio anomaly | Amorphization (R8), defect coupling (R14) |
| `bandgap_shift` | Bandgap deviation from bulk | Doping (R6), heterojunction (R12), quantum confinement |
| `low_freq_unassigned_peak` | Unassigned peak < 100 cm⁻¹ | Interface phonon (R13), vdW stacking (R15) |

## Severity Levels

Determined by score gap between top 2 candidates:
- **error**: $|\text{top} - \text{second}| < 0.05$ — truly indistinguishable
- **warning**: $|\text{top} - \text{second}| < 0.15$ — leaning but not certain
- **info**: clear winner, alternatives noted for completeness

## Discrimination Knowledge Base

15 discrimination experiments encoded with:
- Technique (TEM, XPS, polarized Raman, etc.)
- Protocol (sample prep + measurement)
- Which causes it discriminates between
- Expected outcomes per cause
- Literature citation where applicable

Example: TEM particle size discriminates between:
- R3 (phonon confinement): particles < 10 nm visible
- R1 (tensile strain): particles > 20 nm with lattice expansion
- R11 (charge transfer): interfacial contact between phases observed

## Multi-Spectrum Re-Scoring

If CSIE consistency confirms a phase across multiple techniques, hypotheses
about that phase get a confidence boost (up to ×1.1, capped at 0.95):
$$
\text{score} = \min\left(0.95, \text{conf} \cdot \max(1.0, 1 + 0.1 \cdot \text{consistency})\right)
$$

## References

- Ferrari, A.C., Basko, D.M. (2013). Raman spectroscopy as a versatile tool
  for studying the properties of graphene. *Nature Nanotechnology* **8**: 235-246.
  DOI: [10.1038/nnano.2013.46](https://doi.org/10.1038/nnano.2013.46)
- Reshchikov, M.A. (2014). Determination of acceptor concentration from
  photoluminescence measurements. *Journal of Applied Physics* **115**: 012010.
  DOI: [10.1063/1.4895792](https://doi.org/10.1063/1.4895792)
- Castro Neto, A.H. et al. (2009). The electronic properties of graphene.
  *Reviews of Modern Physics* **81**: 109-162.
  DOI: [10.1103/RevModPhys.81.109](https://doi.org/10.1103/RevModPhys.81.109)
- Mak, K.F. et al. (2010). Atomically thin MoS₂: A new direct-gap semiconductor.
  *Physical Review Letters* **105**: 136805.
  DOI: [10.1103/PhysRevLett.105.136805](https://doi.org/10.1103/PhysRevLett.105.136805)

## Implementation

- `src/csie/ambiguity.py` — clustering, re-scoring, discrimination KB
- `tests/csie/test_ambiguity.py`
- Integrated into `src/csie/pipeline.py` after consistency check

@phase R185-9
