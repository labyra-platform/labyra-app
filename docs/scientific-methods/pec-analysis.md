# Photoelectrochemistry (PEC) — Scientific Methods Reference

> **Source files**:
> - Worker: `~/LAB-MANAGER/labyra-spectra-worker/src/parsers/pec_jv.py`
> - App: `spectrum-chart-echem.tsx` (PECJVChart), `echem-metrics.tsx` (PECJVMetrics)

---

## 1. PEC J-V (linear sweep under illumination)

Current-voltage scan of a photoelectrode for solar water splitting.

**Quantities** (`pec_jv.py`):
- **Photocurrent onset** (`photocurrent_onset_V`): first potential where |j| ≥ 0.1 mA/cm².
- **j @ 1.23 V_RHE** (`photocurrent_at_1p23V_RHE`): interpolated photocurrent density at the thermodynamic water-splitting potential.
- **Light/dark**: 3-column input (E, j_light, j_dark) → net photocurrent = light − dark. (Current impl: 2-column E-j; chopped light shows as sawtooth in one trace.)

## 2. Solar-to-Hydrogen efficiency (STH)

**Formula**:
```
STH (%) = [ |j| (mA/cm²) × 1.23 V × η_Faradaic ] / P_light (mW/cm²) × 100
```
- P_light default = AM1.5G = 100 mW/cm² (flagged if assumed)
- η_Faradaic assumed 100% (verify)

**CRITICAL validity** (`sth_percent` only when): zero applied bias, two-electrode, AM1.5G, 100% Faradaic to H₂/O₂. **If applied bias ≠ 0** → reported as **ABPE** (`abpe_percent`), NOT STH — a common literature error.

**Reference**: Coridan et al., *Energy Environ. Sci.* 2015, 8, 2886 (rigorous STH/ABPE definitions). DOI: 10.1039/C5EE00777A. Chen, Jaramillo et al., *J. Mater. Res.* 2010.

---

## 3. Not yet implemented (R220+)
- **Mott-Schottky**: 1/C² vs E → flat-band potential (x-intercept) + donor density N_D from slope (Nₐ = 2/(e·ε·ε₀·slope)).
- **Chronoamperometry chopped**: j vs t with light on/off steps → transient photoresponse + stability.
