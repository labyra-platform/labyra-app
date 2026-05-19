# Rietveld Refinement (R185-7c-1 / R185-7c-2)

## Overview

Full-pattern Rietveld refinement for multi-phase XRD quantitative analysis.
Achieves ±2-5% mass fraction accuracy on real-world samples (including
nanocrystalline and strained), surpassing RIR/DC methods.

**Self-implemented per Option A license audit** — no GSAS-II/BGMN dependency.
Uses pymatgen for structure handling, lmfit for non-linear least-squares.

## Algorithm

### Forward model

Observed intensity at $2\theta$:
$$
y_{\text{calc}}(2\theta) = B(2\theta) + \sum_i s_i \sum_k I_{i,k} \cdot P(2\theta - 2\theta_{i,k} + z; U,V,W,\eta)
$$

Where:
- $B(2\theta)$ = Chebyshev polynomial background (5 coefficients)
- $s_i$ = scale factor of phase $i$
- $I_{i,k}$ = theoretical Bragg intensity of reflection $k$ in phase $i$
  (computed by pymatgen XRDCalculator from structure + wavelength)
- $2\theta_{i,k}$ = theoretical Bragg position
- $z$ = zero shift (sample displacement correction)
- $P$ = Pseudo-Voigt profile with Caglioti FWHM

### Caglioti FWHM (Caglioti, Paoletti, Ricci 1958)

$$
\text{FWHM}^2(2\theta) = U \tan^2\theta + V \tan\theta + W
$$

Three free parameters capture instrumental + sample broadening:
- $W$: dominant at low angle, instrumental contribution
- $V$: intermediate
- $U$: dominant at high angle, size/strain broadening

### Pseudo-Voigt profile

$$
P(x) = \eta \cdot L(x) + (1-\eta) \cdot G(x)
$$

Where $L$ = Lorentzian, $G$ = Gaussian, both with FWHM from Caglioti.
$\eta \in [0, 1]$ = mixing parameter (refined).

### Chebyshev background

$$
B(x_n) = \sum_{k=0}^{4} b_k T_k(x_n), \quad x_n \in [-1, 1]
$$

5 coefficients refined. Captures sloping background, amorphous halo,
air scattering.

### Objective function

Weighted nonlinear least-squares minimized via Levenberg-Marquardt:
$$
\chi^2 = \sum_n w_n (y_{\text{obs},n} - y_{\text{calc},n})^2, \quad w_n = \frac{1}{\max(y_{\text{obs},n}, 1)}
$$

(Poisson statistics weights).

### Free parameters

For $N$ phases:
- Background: 5 coefficients
- Profile: U, V, W, η, zero_shift (5 params)
- Scales: $N$ phase scale factors

Total: $10 + N$ params, typically << 500 data points → well-determined.

## Mass Fraction (Hill-Howard 1987)

After scale refinement, mass fractions derived as:
$$
X_i = \frac{s_i \cdot Z_i \cdot M_i / V_i^2}{\sum_j s_j \cdot Z_j \cdot M_j / V_j^2}
$$

Where:
- $Z_i$ = formula units per unit cell
- $M_i$ = molar mass of formula unit
- $V_i$ = unit cell volume

All extracted from pymatgen Structure.

**Citation**: Hill, R.J., Howard, C.J. (1987). Quantitative phase analysis from
neutron powder diffraction data using the Rietveld method. *Journal of Applied
Crystallography* **20**(6): 467-474.
DOI: [10.1107/S0021889887087090](https://doi.org/10.1107/S0021889887087090)

## Reliability Factors

### Weighted profile R-factor
$$
R_{\text{wp}} = \sqrt{\frac{\sum_n w_n (y_{\text{obs},n} - y_{\text{calc},n})^2}{\sum_n w_n y_{\text{obs},n}^2}} \cdot 100\%
$$

Quality interpretation:
- $R_{\text{wp}} < 10\%$: good fit
- $R_{\text{wp}}$ 10-20%: acceptable for non-publication
- $R_{\text{wp}} > 20\%$: poor, recheck phases or instrument params

R_p, R_exp, GoF, R_Bragg per-phase, and difference plots scheduled for R185-7c-3.

## Crystallite Size from Refined Profile

Refined Caglioti FWHM at representative 2θ, with instrumental subtraction:
$$
\beta_{\text{sample}}^2 = \text{FWHM}^2_{\text{refined}} - \text{FWHM}^2_{\text{inst}}
$$

Default instrumental FWHM = 0.05° (typical lab diffractometer).

Then Scherrer:
$$
D = \frac{K \lambda}{\beta_{\text{sample}} \cos\theta}, \quad K = 0.9
$$

## References

### Primary

- Rietveld, H.M. (1969). A profile refinement method for nuclear and magnetic
  structures. *Journal of Applied Crystallography* **2**(2): 65-71.
  DOI: [10.1107/S0021889869006558](https://doi.org/10.1107/S0021889869006558)

- Caglioti, G., Paoletti, A., Ricci, F.P. (1958). Choice of collimators for a
  crystal spectrometer for neutron diffraction. *Nuclear Instruments* **3**(4): 223-228.
  DOI: [10.1016/0369-643X(58)90029-X](https://doi.org/10.1016/0369-643X(58)90029-X)

- Thompson, P., Cox, D.E., Hastings, J.B. (1987). Rietveld refinement of
  Debye-Scherrer synchrotron X-ray data from Al₂O₃. *Journal of Applied
  Crystallography* **20**(2): 79-83.
  DOI: [10.1107/S0021889887087090](https://doi.org/10.1107/S0021889887087090)

- Hill, R.J., Howard, C.J. (1987). Quantitative phase analysis from neutron
  powder diffraction data. *Journal of Applied Crystallography* **20**(6): 467-474.
  DOI: [10.1107/S0021889887087090](https://doi.org/10.1107/S0021889887087090)

- Toby, B.H. (2006). R factors in Rietveld analysis: How good is good enough?
  *Powder Diffraction* **21**(1): 67-70.
  DOI: [10.1154/1.2179804](https://doi.org/10.1154/1.2179804)

### Tools used

- pymatgen.analysis.diffraction.xrd.XRDCalculator — pattern simulation
  Citation: Ong, S.P. et al. (2013). *Computational Materials Science* **68**: 314-319.
  DOI: [10.1016/j.commatsci.2012.10.028](https://doi.org/10.1016/j.commatsci.2012.10.028)

- lmfit Levenberg-Marquardt optimizer
  Citation: Newville, M. et al. (2014). LMFIT: Non-Linear Least-Square
  Minimization and Curve-Fitting for Python.
  DOI: [10.5281/zenodo.11813](https://doi.org/10.5281/zenodo.11813)

## Implementation

- `src/deviation/rietveld.py` — refine_full (R185-7c-2), refine_scales (R185-7c-1)
- `src/materials/mp_sync.py` — fetches structure from Materials Project
- `tests/deviation/test_rietveld_scale.py` (R185-7c-1 legacy)
- `tests/deviation/test_rietveld_profile.py` (R185-7c-2)

## License compliance

Algorithm self-implemented, inspired by ideas in:
- XERUS (Castelli 2022, MIT) — multi-phase greedy search concept
- MAUD (Lutterotti 2010, academic) — Rietveld concept

NOT used: Profex (GPL v2), BGMN (proprietary), GSAS-II (DOE restricted).
See `docs/algorithm-attributions.md` for full audit.

@phase R185-7c-1 / R185-7c-2
