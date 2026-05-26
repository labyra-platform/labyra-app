# Cyclic Voltammetry & Impedance (CV / EIS) — Scientific Methods Reference

> **Source files**:
> - Worker: `~/LAB-MANAGER/labyra-spectra-worker/src/parsers/cv.py`, `eis.py`
> - App: `spectrum-chart-echem.tsx` (CVChart, EISChart), `echem-metrics.tsx`

---

## 1. Cyclic Voltammetry (CV)

Splits forward/reverse sweep, locates anodic/cathodic peaks.

**Quantities** (`cv.py`):
- `Epa, ipa` — anodic peak potential + current; `Epc, ipc` — cathodic
- `ΔEp = Epa − Epc` (mV) — peak separation
- `E°' = (Epa + Epc)/2` — formal potential
- `ΔEp_ideal = 59/n` mV (Nernstian, 25 °C) — `dEp_ideal_mV`
- `|ipa/ipc|` — peak current ratio (~1 for reversible)

**Reversibility classification**:
- reversible-like: ΔEp near 59/n mV, ipa/ipc ~ 1
- quasi-reversible / irreversible-like (large ΔEp)

**Caveat**: one scan rate is provisional — confirm with scan-rate dependence (ΔEp vs ν).

**Reference**: Bard & Faulkner, *Electrochemical Methods*, §6.

---

## 2. Electrochemical Impedance Spectroscopy (EIS)

**Nyquist plot**: Z' (x) vs −Z'' (y), equal aspect ratio so the semicircle isn't distorted. `nyquist.z_real`, `nyquist.z_imag_neg` (worker pre-negates Z'').

**Bode**: |Z| vs frequency.

**Circuit fit** (`circuit_fit`): equivalent-circuit fitting via the Python `impedance` library (e.g. Randles R(RC), R(Q(RW))). Returns `parameters` (Rs, Rct, Cdl…) + `chi_square`. If `impedance` not installed → returns `{error}`, only model-free readout shown.

**Data formats**: f, Z', Z'' columns OR f, |Z|, phase (worker converts via Z' = |Z|cos φ, Z'' = |Z|sin φ).

**Reference**: Lasia, *Electrochemical Impedance Spectroscopy and its Applications*, Springer.
