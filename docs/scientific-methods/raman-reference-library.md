# Raman Reference Library

> docs/scientific-methods/raman-reference-library.md
> Phase: R183-1 | Last updated: 2026-05-19

---

## Overview

Labyra seeds a curated Raman reference database used by the T3 spectrum analysis pipeline to match experimental peaks against known phase signatures. Cards stored at `tenants/{tenantId}/references` with `spectrumType: 'raman'`.

---

## Physical basis

### Raman scattering

Inelastic scattering of photons by molecular/crystal vibrations. Shift $\Delta\tilde{\nu}$ (cm⁻¹):

$$\Delta\tilde{\nu} = \tilde{\nu}_\text{laser} - \tilde{\nu}_\text{scattered}$$

Active modes require non-zero polarizability derivative:

$$\left(\frac{\partial \alpha}{\partial Q}\right)_{Q=0} \neq 0$$

### Phonon dispersion — key modes

| Symbol | Symmetry | Physical meaning |
|--------|----------|-----------------|
| A₁g / A1g | Totally symmetric | Out-of-plane stretch (e.g., MoS₂ 408 cm⁻¹) |
| E²₂g / E12g | Doubly degenerate | In-plane stretch (e.g., MoS₂ 383 cm⁻¹) |
| E₂g | " | G-band graphene 1580 cm⁻¹ |
| B₁g | Non-degenerate | TiO₂ anatase 399 cm⁻¹ |
| F₂g | Triply degenerate | Si 520 cm⁻¹ (TO phonon) |

### Phonon confinement (nanoparticles)

For nanocrystals of size $L$, the phonon wavevector selection rule ($q \approx 0$) relaxes. Peak shifts to lower frequency and broadens:

$$\Delta\omega \propto -\frac{A}{L^2}, \quad \Gamma \propto \frac{B}{L^2}$$

where $A$, $B$ are material constants. Used to estimate TiO₂ nanoparticle size from 144 cm⁻¹ Eg linewidth (PCM model, Bersani 1998, DOI: 10.1103/PhysRevB.63.125415).

---

## Laser wavelength selection

Critical for fluorescence avoidance and resonance enhancement:

| λ (nm) | Energy (eV) | Use case | Fluorescence risk |
|--------|-------------|----------|-------------------|
| 532 | 2.33 | Carbon, metal oxides, 2D materials | Medium |
| 785 | 1.58 | Biological, polymers, perovskites | Low |
| 1064 | 1.17 | Highly fluorescent organics | Minimal |

**Resonance Raman**: When laser energy matches electronic transition, cross-section increases 10²–10⁶×. Example: WS₂ at 532 nm enhances 2LA(M) mode resonantly (Berkdemir 2013).

**Perovskite rule**: Always use 785 nm for MAPbI₃ — 532 nm causes photoinduced PbI₂ degradation within seconds.

---

## 2D material layer counting

Peak separation method (MoS₂ as model system):

$$\Delta = \nu_{A_{1g}} - \nu_{E^1_{2g}}$$

| $\Delta$ (cm⁻¹) | Layer count |
|-----------------|-------------|
| ~19–20 | Monolayer |
| ~22 | Bilayer |
| ~23–24 | Trilayer |
| ~25–26 | Bulk |

For graphene: I(2D)/I(G) ratio:
- > 2 → monolayer
- ~1 → bilayer  
- < 0.5 → few-layer / multilayer

---

## Carbon sp² characterization

D/G intensity ratio as defect metric:

$$\frac{I_D}{I_G} \propto \frac{1}{L_a^2}$$ (Tuinstra-Koenig, valid for $L_a > 2$ nm)

$$L_a \text{(nm)} = \frac{(2.4 \times 10^{-10}) \lambda_L^4}{I_D/I_G}$$ (λ in nm, Knight & White formula)

| Material | I(D)/I(G) typical | I(2D)/I(G) |
|----------|-------------------|------------|
| HOPG | < 0.05 | 0.3–0.5 |
| Monolayer graphene | < 0.1 | > 2 |
| GO | 0.9–1.2 | < 0.3 |
| MWCNT (commercial) | 0.8–1.5 | 0.2–0.4 |

---

## Phase identification notes

### WO₃ polymorphs

| Phase | T range | Key peaks (cm⁻¹) |
|-------|---------|-----------------|
| Monoclinic (m-WO₃) | RT stable | 806 (W=O), 715 (W-O-W), 267 |
| Hexagonal (h-WO₃) | metastable | 782 (W=O), 640 (tunnel), 246 |
| Tetragonal | > 740°C | 870, 700 (broader) |

BKU context: WO₃ electrochromic films may contain mixed monoclinic + hexagonal phases. Compare 806 vs 640 cm⁻¹ relative intensities.

### TiO₂ phase mixture

Anatase (144 cm⁻¹ Eg) + rutile (447 cm⁻¹ Eg) can coexist in calcined powders. Anatase fraction estimate:

$$f_A \approx \frac{I_{144}}{I_{144} + 0.89 \times I_{447}}$$

(Spurr & Myers correction factor 0.89, J. Anal. Chem. 1957)

### Iron oxide discrimination

| Phase | Diagnostic peaks (cm⁻¹) |
|-------|------------------------|
| Hematite α-Fe₂O₃ | 292 (Eg), 226 (A1g), 498 (A1g) |
| Magnetite Fe₃O₄ | 668 (A1g sole strong peak) |
| Maghemite γ-Fe₂O₃ | broad 350–720, no sharp 292 |

---

## Reference card schema

```ts
interface RamanReferenceCard {
  cardNumber: string;          // 'RAMAN-001'
  phaseName: string;
  formula: string;             // capital letter (FormulaSchema)
  spectrumType: 'raman';
  laserWavelength?: 532 | 785 | 1064;
  peaks: Array<{
    shift: number;             // cm⁻¹
    intensity: number;         // 0–100 relative
    assignment?: string;
  }>;
  notes?: string;
  doi?: string | null;
  source: 'manual';
  lifecycleStatus: 'active';
  version: number;
}
```

---

## Seeded cards (R183-1)

| # | cardNumber | Phase | Formula | λ (nm) | Key peaks (cm⁻¹) | Source DOI |
|---|-----------|-------|---------|--------|------------------|-----------|
| 1 | RAMAN-001 | Graphite HOPG | C | 532 | 1350, 1580, 2700 | 10.1038/nnano.2013.46 |
| 2 | RAMAN-002 | Monolayer Graphene | C | 532 | 1350, 1580, 2690 | 10.1103/PhysRevLett.97.187401 |
| 3 | RAMAN-003 | Graphene Oxide | C | 532 | 1350, 1590 | 10.1021/nn9013577 |
| 4 | RAMAN-004 | MWCNT | C | 532 | 1350, 1580 | 10.1103/PhysRevLett.78.1932 |
| 5 | RAMAN-005 | m-WO₃ | WO3 | 532 | 806, 715, 267 | 10.1039/c0cp02429a |
| 6 | RAMAN-006 | TiO₂ anatase | TiO2 | 532 | 144, 399, 639 | 10.1021/jp9015088 |
| 7 | RAMAN-007 | TiO₂ rutile | TiO2 | 532 | 447, 612, 143 | 10.1021/jp9015088 |
| 8 | RAMAN-008 | ZnO wurtzite | ZnO | 532 | 437, 99, 574 | 10.1007/s00339-003-2461-x |
| 9 | RAMAN-009 | α-Fe₂O₃ hematite | Fe2O3 | 532 | 292, 226, 498 | 10.1002/jrs.1250210110 |
| 10 | RAMAN-010 | MoS₂ monolayer | MoS2 | 532 | 383, 403 | 10.1021/nl201874w |
| 11 | RAMAN-011 | MoS₂ bulk | MoS2 | 532 | 382, 408 | 10.1021/nl201874w |
| 12 | RAMAN-012 | WS₂ monolayer | WS2 | 532 | 356, 417 | 10.1021/acs.nanolett.5b01925 |
| 13 | RAMAN-013 | MoSe₂ bulk | MoSe2 | 532 | 241, 288 | 10.1021/nl4009376 |
| 14 | RAMAN-014 | WSe₂ monolayer | WSe2 | 532 | 250, 260 | 10.1038/ncomms2882 |
| 15 | RAMAN-015 | MAPbI₃ | CH3NH3PbI3 | 785 | 62, 94, 119 | 10.1039/c5nr02510e |
| 16 | RAMAN-016 | PbI₂ (degradation) | PbI2 | 785 | 74, 97 | 10.1039/c5nr02510e |
| 17 | RAMAN-017 | Si (c-Si calibration) | Si | 532 | 520 | 10.1038/s41598-017-18064-3 |
| 18 | RAMAN-018 | SiO₂ fused silica | SiO2 | 532 | 440, 800, 1060 | — |
| 19 | RAMAN-019 | Sapphire α-Al₂O₃ | Al2O3 | 532 | 418, 432, 645 | 10.1016/0022-3697(70)90007-7 |
| 20 | RAMAN-020 | PMMA | C5H8O2 | 532 | 1728, 813, 2954 | 10.1016/j.vibspec.2010.03.008 |
| 21 | RAMAN-021 | Cellulose | C6H10O5 | 785 | 1095, 1120, 2897 | 10.1021/bm034096d |
| 22 | RAMAN-022 | Protein amide I | C2H3NO | 785 | 1655, 1240, 1005 | 10.1021/bi00379a021 |
| 23 | RAMAN-023 | TiO₂ anatase NPs | TiO2 | 532 | 144 (PCM) | 10.1103/PhysRevB.63.125415 |
| 24 | RAMAN-024 | h-WO₃ hexagonal | WO3 | 532 | 782, 640, 246 | 10.1021/acs.chemmater.0c02029 |
| 25 | RAMAN-025 | SnO₂ cassiterite | SnO2 | 532 | 632, 473, 774 | 10.1016/j.snb.2009.07.028 |

Total: **25 cards**, 7 categories.

---

## References

1. Ferrari AC & Robertson J (2001). Phys Rev B 63, 125415. DOI: 10.1103/PhysRevB.63.125415
2. Ferrari AC et al. (2006). PRL 97, 187401. DOI: 10.1103/PhysRevLett.97.187401
3. Li H et al. (2012). Nano Lett 12, 5941. DOI: 10.1021/nl201874w
4. Berkdemir A et al. (2013). Sci Rep 3, 1755. DOI: 10.1038/srep01755
5. Su W et al. (2010). Chem Commun 46, 7872. DOI: 10.1039/c0cp02429a
6. Ohsaka T et al. (1978). J Raman Spectrosc 7, 321. DOI: 10.1021/jp9015088
7. RRUFF Project: rruff.info

---

## Implementation

- Seed script: `round-183-1-seed-raman-refs.mjs`
- Firestore path: `tenants/{tenantId}/references` (spectrumType filter = 'raman')
- T3 matcher: `src/lib/spectra/raman-matcher.ts` (R183-2, planned)
- Peak tolerance: ±10 cm⁻¹ default, configurable per phase
