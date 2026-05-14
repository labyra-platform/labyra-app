# XRD Analysis — Scientific Methods Reference

Comprehensive list of algorithms, formulas, and physics methods used in Labyra's XRD pipeline.

> **Source files**:
> - Worker: `~/LAB-MANAGER/labyra-spectra-worker/src/parsers/xrd.py`
> - Worker citation: `~/LAB-MANAGER/labyra-spectra-worker/src/citation/`
> - App display: `~/LAB-MANAGER/labyra-app/src/features/spectra/components/xrd-*.tsx`

---

## 1. Peak Detection

### 1.1 Savitzky-Golay Smoothing
Reduce noise before peak finding.

**Formula**: Polynomial fit (degree=3) over moving window (size=11) using least-squares regression.

**Implementation**: `scipy.signal.savgol_filter(y, window_length=11, polyorder=3)`

**Reference**: Savitzky, A.; Golay, M.J.E. (1964). "Smoothing and Differentiation of Data by Simplified Least Squares Procedures". Analytical Chemistry. DOI: 10.1021/ac60214a047

### 1.2 Peak Finding
**Method**: `scipy.signal.find_peaks` with prominence + distance + width constraints.

**Parameters**:
- `prominence = 0.03 × (y_max − y_min)` — filter low-intensity noise peaks
- `distance = 5` data points — minimum peak separation
- `width = 2` — minimum peak width

**Limit**: Top 30 peaks by intensity.

---

## 2. Bragg's Law (d-spacing)

**Formula**:
```
d = λ / (2 · sin(θ))
```
where:
- `d` = interplanar spacing (Å)
- `λ` = X-ray wavelength (Å)
- `θ` = half of 2θ angle (rad)

**Physics**: Constructive interference condition for X-ray diffraction in crystalline planes.

**Reference**: Bragg, W.H.; Bragg, W.L. (1913). "The Reflection of X-rays by Crystals". Proc. R. Soc. Lond. A.

---

## 3. Wavelength Selection (Anode + Monochromator)

### 3.1 Kα1 Wavelengths by Anode (Å)
| Anode | Kα1 | Kα2 | Kα2/Kα1 ratio |
|---|---|---|---|
| Cu | 1.5406 | 1.5444 | 0.50 |
| Mo | 0.70932 | 0.71359 | 0.50 |
| Co | 1.78897 | 1.79285 | 0.50 |
| Cr | 2.29100 | 2.29361 | 0.50 |
| Fe | 1.93604 | 1.93998 | 0.50 |
| Ag | 0.55941 | 0.56381 | 0.50 |

### 3.2 Monochromator Presets (Kα1 weight fraction)
| Preset | Kα1 fraction | Use case |
|---|---|---|
| None | 0.67 (2:1 Kα1:Kα2 natural) | Standard tube |
| Ni filter | 0.75 | Cu absorption filter |
| Graphite | 0.85 | Secondary monochromator |
| Ge(111) | 0.99 | Primary high-resolution |
| Johansson | 0.99 | Focusing monochromator |
| Si(220) | 0.995 | Highest resolution |

**Effective wavelength**: `λ_eff = f · λ_Kα1 + (1−f) · λ_Kα2`

---

## 4. Profile Function Fitting (R161-phase-E)

### 4.1 Gaussian
```
G(x) = A · exp(−(x−x₀)² / (2σ²))
σ = FWHM / (2·√(2·ln2)) ≈ FWHM / 2.355
```

### 4.2 Lorentzian (Cauchy)
```
L(x) = A · γ² / ((x−x₀)² + γ²)
γ = FWHM / 2
```

### 4.3 Pseudo-Voigt
```
PV(x) = η · L(x) + (1−η) · G(x)
η ∈ [0, 1]   (0 = pure Gaussian, 1 = pure Lorentzian)
```

**Physics meaning of η**: Mixing parameter indicating instrumental + sample contributions.
- Pure Gaussian (η≈0): instrumental broadening dominant
- Pure Lorentzian (η≈1): size/strain broadening dominant
- Mixed (η≈0.3-0.7): realistic for typical lab XRD

**Implementation**: `scipy.optimize.curve_fit` with window=15 points around each peak.

**Reference**:
- Wertheim, G.K. et al. (1974). "Determination of the Gaussian and Lorentzian content of experimental line shapes". Rev. Sci. Instrum.
- Thompson, P. et al. (1987). "Rietveld refinement of Debye-Scherrer synchrotron X-ray data from Al₂O₃". J. Appl. Cryst.

---

## 5. Integral Breadth (β)

**Formula**:
```
Gaussian:     β = FWHM · √(π / (4·ln2)) ≈ 1.0645 · FWHM
Lorentzian:   β = FWHM · π/2 ≈ 1.5708 · FWHM
Pseudo-Voigt: β = FWHM · (η · 1.5708 + (1−η) · 1.0645)
```

**Physics**: Area-equivalent width. Used in Scherrer (Williamson-Hall use β instead of FWHM for accuracy).

---

## 6. Scherrer Equation (Crystallite Size)

**Formula**:
```
D = K · λ / (β · cos(θ))
```
where:
- `D` = crystallite size (nm)
- `K` = shape factor = 0.9 (for spherical, common approximation; range 0.62-1.4 for other shapes)
- `λ` = X-ray wavelength (Å)
- `β` = peak broadening (rad)
- `θ` = Bragg angle (rad)

**Implementation**: Per-peak + average of top-3 peaks (avg also returned as `scherrer_avg_nm`).

**Reference**: Scherrer, P. (1918). "Bestimmung der Größe und der inneren Struktur von Kolloidteilchen mittels Röntgenstrahlen". Nachr. Ges. Wiss. Göttingen.

**Limitations**:
- Assumes monodisperse spherical particles
- Doesn't separate size from strain (use Williamson-Hall for both)
- Lower limit ~3-5 nm (peak broadening dominates), upper ~200 nm (broadening too small)

---

## 7. Williamson-Hall Plot (Size + Strain Decomposition)

**Formula**:
```
β · cos(θ) = (K · λ / D) + 4 · ε · sin(θ)
```

**Linear regression**:
- y = β·cos(θ)
- x = 4·sin(θ)
- slope = ε (microstrain, dimensionless)
- y-intercept = K·λ / D → solve for D

**Quality gate**: R² ≥ 0.5 required for reliable results. Lower R² indicates anisotropic strain or multi-phase mixture.

**Reference**: Williamson, G.K.; Hall, W.H. (1953). "X-ray line broadening from filed aluminium and wolfram". Acta Metallurgica.

---

## 8. Dislocation Density (δ)

**Formula**:
```
δ = 1 / D²
```
- `δ` in lines/m² (commonly 10¹⁴ - 10¹⁶ for typical materials)
- `D` in m

**Physics**: Number of dislocation lines per unit area. Inversely proportional to squared crystallite size.

**Reference**: Williamson, G.K.; Smallman, R.E. (1956). "Dislocation densities in some annealed and cold-worked metals from measurements on the X-ray Debye-Scherrer spectrum". Phil. Mag.

---

## 9. Microstrain (ε)

**Per-peak formula**:
```
ε = β · cos(θ) / 4
```
- Dimensionless (or × 10⁻³ for display)

**Physics**: Lattice distortion from defects, dislocations, stacking faults. Typical range: 10⁻⁴ - 10⁻² for crystalline materials.

---

## 10. Crystallinity Percentage

**Formula**:
```
Crystallinity (%) = (Σ peak areas / total integrated area) × 100
```

**Implementation**:
- Peak area approximated by `I × FWHM × 1.0645` (Gaussian)
- Total area: trapezoidal integration of full spectrum

**Limitations**: Approximate. For accurate XRD crystallinity, use Rietveld refinement or proper background subtraction.

---

## 11. Zero Shift Correction

**Source**: Systematic instrumental offset in 2θ angle (sample displacement, goniometer alignment).

**Correction**: `2θ_corrected = 2θ_measured − Δ`

where Δ is the zero shift (typically ±0.05° from instrument calibration).

**Reference**: Cernik, R.J. et al. (1990). "Standardization of XRD". IUCr Commission on Powder Diffraction Newsletter.

---

## 12. Citation Matching

### 12.1 Peak Matching Algorithm
**Tolerance**: ±0.3° in 2θ.

**Score formula**:
```
score = 0.7 × match_ratio + 0.3 × intensity_correlation
```
- `match_ratio` = matched_peaks / total_user_peaks
- `intensity_correlation` = Pearson r between user and simulated normalized intensities

### 12.2 Database Sources
1. **COD** (Crystallography Open Database): Free, open. ~500K structures.
2. **Materials Project**: DFT-computed, free with API key. 150K+ structures.
3. **ICDD PDF-2/4+**: Industry standard, paid license. Deferred to future ICDD partnership.

### 12.3 XRD Pattern Simulation
**Library**: `Dans_Diffraction` (Python) for powder pattern simulation from CIF.

**Process**: 
1. Parse CIF → atom positions + lattice
2. Generate hkl reflections (cube ±6)
3. Compute intensity (structure factor)
4. Group by 2θ (tolerance 0.1°) with multiplicity weighting
5. Filter peaks below relative intensity threshold

---

## 13. AI Determinism (R161)

**Setting**: `temperature=0` for Anthropic API calls.

**Reason**: XRD analysis must be reproducible. Same input → same phase identification.

**Trade-off**: Less creative explanations, but scientifically reliable.

---

## 14. Quality Metrics

### 14.1 Signal-to-Noise Ratio (SNR)
```
SNR = max_intensity / noise_std
```
where `noise_std = std(y[y < 30th percentile])` (low-intensity baseline region).

### 14.2 Resolution Estimate
Smallest FWHM among detected peaks. Typical: 0.05° (HRXRD) - 0.20° (standard lab).

---

## 15. References & Further Reading

- Cullity, B.D.; Stock, S.R. (2014). *Elements of X-ray Diffraction*, 3rd ed. Pearson.
- Pecharsky, V.K.; Zavalij, P.Y. (2009). *Fundamentals of Powder Diffraction*, 2nd ed. Springer.
- Dinnebier, R.E.; Billinge, S.J.L. (2008). *Powder Diffraction: Theory and Practice*. RSC.
- ICDD: https://www.icdd.com/
- Materials Project: https://materialsproject.org/
- COD: http://www.crystallography.net/cod/

---

**Last updated**: R161 (2026-05-14) — added profile fitting, AI temperature=0, citation cache.


## 16. Demo Reference Samples (@phase R162-demo-dataset)

Pre-bundled XRD samples for onboarding (path: `public/demos/spectra/`).
Each sample ships with grounded expected phase for new-user verification of the citation pipeline.

| Sample | Formula | Crystal system | Space group | Source |
|---|---|---|---|---|
| `xrd-w18o49-rod.xy` | W₁₈O₄₉ | Monoclinic | P2/m | COD #1535917 |

**Strategic intent**: cut time-to-first-analysis below 10 min (per `docs/strategy/INSIGHTS.md` §2 Onboarding).
**Loading mechanism**: frontend fetch `/demos/spectra/{filename}` → blob → File → existing dropzone pipeline.
Same code path as user-uploaded files. No demo-only branching.

**Reference peaks (Cu Kα, λ = 1.5406 Å)** — used to verify citation matching algorithm (§12.1) on first run:
- W₁₈O₄₉ monoclinic (rod): 14.65°, 23.42°, 28.75°, 37.10°, 50.35°, 55.97°

**Implementation files**:
- Manifest: `public/demos/spectra/manifest.json`
- Loader: `src/lib/spectra/load-demo.ts`
- Button: `src/features/spectra/components/demo-data-button.tsx`


## 17. Internal Reference Card Library (R162-spectra-4b)

In addition to public databases (COD, MP), each tenant maintains a private
library of reference cards captured manually from ICDD PDF, JCPDS, or
published patterns (R161 §4a-pdf).

**Path**: Firestore `tenants/{tenantId}/reference_cards/{cardId}`
**Schema**: `src/lib/spectra/reference-card-schema.ts`
**Matching algorithm**: identical to §12.1 (`matchScore`, ±0.3° tolerance,
intensity-weighted), invoked client-side from
`src/lib/spectra/internal-candidates.ts`.

**Threshold**: 0.3 (matches worker default). Cards below threshold are
omitted entirely rather than shown as low-confidence — Trust > Coverage.

**UI surfacing**:
- Citation chip type `internal` → label "Library"
- Click chip → routes to `/dashboard/reference-cards/{id}`
- XRDPhaseSummary merges internal candidates with COD/MP, ranked by match score

**Strategic rationale**: each lab accumulates institutional knowledge of
materials they study. Library citations turn that tacit knowledge into
machine-checkable provenance and create switching cost — a structural moat
(per `docs/strategy/market-research.md` §1.2).
