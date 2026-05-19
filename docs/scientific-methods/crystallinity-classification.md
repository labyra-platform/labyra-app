# Crystallinity Classification + Adaptive Tolerance (R185-5)

## Overview

Real samples range from bulk crystalline to amorphous. Naive peak matching
with fixed tolerance fails on nanocrystalline (broad peaks) and amorphous
(no sharp peaks) samples. Labyra classifies crystallinity from 4 independent
signals and scales matcher tolerance accordingly.

## 4 Signals

### Signal 1: Mean FWHM Ratio
$$
R_{\text{FWHM}} = \frac{1}{N} \sum_{i=1}^{N} \frac{\text{FWHM}_{\text{sample},i}}{\text{FWHM}_{\text{ref},i}}
$$

Indicates peak broadening relative to reference (bulk standard).

### Signal 2: Peak Count Ratio
$$
R_{\text{count}} = \frac{\text{matched peaks}}{\text{total ref peaks}}
$$

Amorphous samples show only a few broad bands.

### Signal 3: Background Ratio
$$
R_{\text{bg}} = \frac{\text{baseline intensity}}{\text{peak max intensity}}
$$

Amorphous halo elevates baseline.

### Signal 4: Mean Signed Shift
$$
\bar{\Delta} = \frac{1}{N} \sum_i (s_i - r_i)
$$

Small upshift (~2-5 cm⁻¹) without other anomalies → phonon confinement signature
of nanocrystals.

## Classification Logic

| Class | $R_{\text{FWHM}}$ | $R_{\text{bg}}$ | Tolerance factor |
|-------|---------------------|-------------------|------------------|
| bulk | < 1.3 | < 0.1 | 1.0× |
| nanocrystalline | 1.3 - 2.5 | 0.1 - 0.3 | 1.5× |
| nano-small (<5 nm) | 2.5 - 4.0 | 0.1 - 0.3 | 2.0× |
| amorphous | > 4.0 | > 0.3 | 3.0× |
| mixed | — | — | 2.0× |

Confidence boosted when multiple signals agree.

## Particle Size Estimation (PCM)

For nanocrystalline classification with Raman data, particle size estimated
via Phonon Confinement Model:
$$
D \approx \frac{10}{R_{\text{FWHM}} - 0.5} \quad [\text{nm}]
$$

Approximation tuned for TiO₂ anatase Eg mode (Bersani 1998). Other oxides
within factor of 2. Uncertainty ±40%.

For XRD data, Scherrer formula gives:
$$
D = \frac{K \lambda}{\beta \cos\theta}
$$
with $K = 0.9$ (spherical crystallites).

## Adaptive Tolerance Feed-Back

After classification, matcher re-runs with tolerance × factor:
- Bulk: 5 cm⁻¹ (Raman)
- Nano: 7.5 cm⁻¹
- Amorphous: 15 cm⁻¹

This second pass captures broad amorphous features that strict tolerance misses.

## References

- Bersani, D. et al. (1998). Phonon confinement effects in TiO₂ nanocrystals.
  *Physical Review B* **63**: 125415.
  DOI: [10.1103/PhysRevB.63.125415](https://doi.org/10.1103/PhysRevB.63.125415)
- Scherrer, P. (1918). Bestimmung der Größe und der inneren Struktur von
  Kolloidteilchen mittels Röntgenstrahlen. *Nachr. Ges. Wiss. Göttingen* **2**: 98-100.
- Williamson, G.K., Hall, W.H. (1953). X-ray line broadening from filed
  aluminium and wolfram. *Acta Metallurgica* **1**(1): 22-31.
  DOI: [10.1016/0001-6160(53)90006-6](https://doi.org/10.1016/0001-6160(53)90006-6)

## Implementation

- `src/deviation/crystallinity.py`
- `tests/deviation/test_crystallinity.py`

@phase R185-5
