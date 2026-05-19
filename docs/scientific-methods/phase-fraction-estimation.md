# Phase Fraction Estimation (R185-7 / R185-7b)

## Overview

Three quantification methods, dispatched by spectrum type + available data.
Each method explicitly flags **quantitative** vs **qualitative** so users
understand whether the output is mass fraction or merely intensity ratio.

**Trust > Coverage**: never claim mass fraction unless scientifically defensible.

## Method 1: Reference Intensity Ratio (RIR, Chung 1974)

### Formula
$$
X_i = \frac{I_i / \text{RIR}_i}{\sum_j I_j / \text{RIR}_j}
$$

Where $\text{RIR}_i$ is the I/I_corundum factor for phase $i$ (tabulated in
ICDD PDF cards or computable from crystal structure).

### Applicability
- XRD only
- Requires `rirFactor` in materialProfile
- Uncertainty: ±5-10% for randomly oriented powders
- Bias up to 30% for textured samples or thin films

### Citation
Chung, F.H. (1974). Quantitative interpretation of X-ray diffraction patterns
of mixtures. I. Matrix-flushing method for quantitative multicomponent analysis.
*Journal of Applied Crystallography* **7**(6): 519-525.
DOI: [10.1107/S0021889874010375](https://doi.org/10.1107/S0021889874010375)

## Method 2: Direct Comparison (Klug-Alexander)

### Formula
$$
X_i = \frac{I_i / (\mu/\rho)_i}{\sum_j I_j / (\mu/\rho)_j}
$$

Where $(\mu/\rho)_i$ is the mass absorption coefficient computed from
compound formula via element MACs (NIST XCOM database):
$$
(\mu/\rho)_{\text{compound}} = \sum_k w_k \cdot (\mu/\rho)_k
$$

Element MAC values stored in `mass_absorption.py` for Cu Kα (86 elements)
and Mo Kα (subset). Compound formula parsed by pymatgen.

### Applicability
- XRD only
- Works for any compound with parseable formula
- Uncertainty: ±3-5% (better than RIR)
- Preferred when both DC and RIR available

### Citation
Klug, H.P., Alexander, L.E. (1974). X-Ray Diffraction Procedures for
Polycrystalline and Amorphous Materials, 2nd ed. Wiley. Chapter 7:
Quantitative Analysis by Direct Comparison.
ISBN: 978-0-471-49369-3

NIST XCOM photon cross-section database:
[https://physics.nist.gov/PhysRefData/Xcom/](https://physics.nist.gov/PhysRefData/Xcom/)

## Method 3: Raman Intensity Ratio (QUALITATIVE)

### Critical caveat

Raman scattering cross-sections vary 10-100× between materials. Equal mass
of MoS₂ and carbon black give very different signal intensities. This method
reports DETECTED INTENSITY ratio, **NEVER mass fraction**.

### Formula
$$
r_i^{\text{Raman}} = \frac{I_i}{\sum_j I_j} \quad (\text{NOT mass fraction})
$$

### Applicability
- Raman only
- Always qualitative (`quantitative=false` in output)
- Uncertainty: ±30-40% relative
- Use case: relative crystallinity comparison between same-material samples;
  monitoring composition trends over time in same instrument

For absolute composition, use XRD-RIR/DC or elemental analysis (XPS, EDS, ICP-MS).

## Method 4: Peak Count Fallback (Order of Magnitude)

When neither DC nor RIR applicable (unparseable formula, missing data),
fall back to:
$$
X_i^{\text{loose}} = \frac{\text{observed peaks of } i}{\text{total observed peaks}}
$$

NOT mass fraction. Loose, ±50% uncertainty. Used only when nothing better available.

## Dispatcher Logic

```
spectrum_type == "xrd":
    try Direct Comparison (needs parseable formula)
    if fail: try RIR (needs rirFactor)
    if fail: peak-count fallback

spectrum_type == "raman":
    always qualitative ratio

other:
    peak-count fallback
```

## Implementation

- `src/deviation/fraction_estimator.py` — main dispatcher
- `src/deviation/mass_absorption.py` — MAC tables + compound calculator
- `tests/deviation/test_fraction_estimator.py`
- `tests/deviation/test_direct_comparison.py`

@phase R185-7 / R185-7b
