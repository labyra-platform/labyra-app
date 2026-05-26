# Electrochemistry Kinetics (LSV / Tafel) — Scientific Methods Reference

Methods for HER/OER electrocatalysis from linear-sweep voltammetry and Tafel analysis.

> **Source files**:
> - Worker: `~/LAB-MANAGER/labyra-spectra-worker/src/parsers/lsv.py`, `tafel.py`
> - App display: `~/LAB-MANAGER/labyra-app/src/features/spectra/components/spectrum-chart-echem.tsx`, `tafel-chart.tsx`, `echem-metrics.tsx`

---

## 1. RHE conversion (Nernst)

Convert measured potential to the reversible hydrogen electrode scale.

**Formula**:
```
E_RHE = E_measured + E°_reference + 0.0592 · pH    (at 25 °C)
```

**Reference-electrode offsets E°_ref (V vs SHE, 25 °C)** — `REFERENCE_OFFSET_V` in lsv.py/tafel.py:
- Ag/AgCl (sat. KCl): 0.197 · Ag/AgCl (3M KCl): 0.210
- SCE (sat. calomel): 0.241 · Hg/HgO (1M, alkaline): 0.140
- RHE / SHE / NHE: 0.0

**Edge case**: unknown reference → η and benchmarks not computed (flagged in notes, never silently assumed).

**Reference**: Bard, Faulkner & White, *Electrochemical Methods*, 3rd ed.

## 2. Overpotential at benchmark current (LSV)

The standard activity figure of merit.

**Formula**:
```
η = E_RHE − 1.23 V   (OER)
η = 0 − E_RHE        (HER)
```
Reported at **j = 10 mA/cm²** (geometric) — `overpotential_at_10mA_cm2_V`; onset at **1 mA/cm²** — `onset_overpotential_at_1mA_cm2_V`.

**Parameters required**: electrode area (→ mA/cm²), reference electrode + pH (→ RHE), reaction (her/oer).

**Reference**: McCrory, Jaramillo et al., *J. Am. Chem. Soc.* 2013, 135, 16977. DOI: 10.1021/ja407115p

## 3. Tafel slope & exchange current density

From the linear region of overpotential vs log current density.

**Formula**:
```
η = a + b · log₁₀|j|
Tafel slope b  (mV/dec)
j₀ = 10^(−a/b)          (exchange current density, extrapolate to η=0)
α = (0.0592 / |b|)      (transfer coefficient, 25 °C)
```

**Window selection (worker auto)**: slide a window ≥5 points over the kinetic branch (|j|>1 µA, η in driving direction), keep the fit with max R². `_tafel_fit` in tafel.py.

**Range Selector (app, R214)**: user drags a window on the Tafel plot (log|j| vs η); client runs ordinary least-squares over the selected points instantly. Safe because the worker returns the already-processed `tafel_curve` (RHE + density applied) — the client only fits a line, never re-derives units.

**Edge case**: R² < 0.98 → flagged ("verify kinetic region + iR correction"). Not iR-corrected → η and slope overestimated (flagged).

**Reference**: Bard, Faulkner & White, *Electrochemical Methods*, 3rd ed., §15.2.2 (HER kinetics, rate-determining-step diagnostics by slope).
