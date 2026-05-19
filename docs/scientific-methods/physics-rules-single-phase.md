# Single-Phase Physics Rules R1-R10 (R185-2)

## Overview

After peak matching (R185-1) produces a MatchResult, physics rules R1-R10
detect specific physical/chemical phenomena from peak shifts, broadening,
and unmatched peaks. Each rule outputs a Hypothesis with:
- Confidence score
- Evidence list
- Quantitative estimate where defensible
- Suggested followup experiment
- DOI citation

Rules operate on a **single phase** (one MatchResult per call). Composite/multi-phase
phenomena handled by R11-R15 (see physics-rules-composite.md).

## Rules

### R1: Tensile Strain
Consistent peak downshifts across multiple peaks indicate lattice expansion.

**Trigger**: All matched peaks shift by $\Delta\omega < -1.5$ cm⁻¹ (Raman) or
$\Delta(2\theta) < -0.1$° (XRD), with consistent direction.

**Physics**: Lattice expansion lowers phonon frequencies (Grüneisen relation):
$$
\frac{\Delta\omega}{\omega} = -\gamma \cdot \frac{\Delta V}{V}
$$

**Citation**: Khorsand Zak, A. et al. (2014). Williamson-Hall analysis in
estimation of lattice strain. *Solid State Sciences* **26**: 113-118.
DOI: [10.1016/j.solidstatesciences.2014.04.012](https://doi.org/10.1016/j.solidstatesciences.2014.04.012)

### R2: Compressive Strain
Mirror of R1 — consistent upshifts indicate lattice contraction.

### R3: Phonon Confinement (Nanocrystals)
Small upshift (1-5 cm⁻¹) + significant peak broadening indicates particle size
< 20 nm via phonon confinement model (PCM):
$$
\Delta\omega \propto -\frac{A}{L^2}, \quad \Gamma_{\text{FWHM}} \propto \frac{B}{L^2}
$$

**Citation**: Bersani, D., Lottici, P.P., Ding, X.Z. (1998).
Phonon confinement effects in the Raman scattering by TiO₂ nanocrystals.
*Physical Review B* **63**: 125415.
DOI: [10.1103/PhysRevB.63.125415](https://doi.org/10.1103/PhysRevB.63.125415)

### R4: Oxygen Vacancy (Transition Metal Oxides)
Asymmetric peak softening + low-frequency tail in oxide spectra indicates
oxygen-deficient phase. Specific to WO₃, TiO₂, ZnO, Fe₂O₃, MoO₃.

**Citation**: Wang, F. et al. (2020). Oxygen vacancies in tungsten oxide for
photocatalytic applications. *Chemistry of Materials* **32**(20): 8762-8772.
DOI: [10.1021/acs.chemmater.0c02029](https://doi.org/10.1021/acs.chemmater.0c02029)

### R5: Mixed Phase
Multiple unmatched peaks at expected positions of common polymorphs (e.g., anatase
+ rutile both detected). Suggests phase mixture, not single polymorph.

### R6: Doping/Intercalation
Symmetric peak shift + new shoulder peak at characteristic dopant position.

### R7: TMD Layer Count (Raman, MoS₂/WS₂)
$\Delta\omega = \omega_{A_{1g}} - \omega_{E^1_{2g}}$ varies with layer count:
- Monolayer: $\Delta \sim 18-19$ cm⁻¹
- 2-3 layers: $\Delta \sim 22-24$ cm⁻¹
- Bulk: $\Delta \sim 25-27$ cm⁻¹

**Citation**: Li, H. et al. (2012). From bulk to monolayer MoS₂: Evolution of
Raman scattering. *Advanced Functional Materials* **22**(7): 1385-1390.
DOI: [10.1002/adfm.201102111](https://doi.org/10.1002/adfm.201102111)

### R8: Amorphization
G-band peak shifts toward 1500-1520 cm⁻¹ + D-band broadening + I(D)/I(G) > 1.5
indicates amorphous carbon transition.

**Citation**: Tuinstra, F., Koenig, J.L. (1970). Raman spectrum of graphite.
*Journal of Chemical Physics* **53**(3): 1126-1130.
DOI: [10.1063/1.1674108](https://doi.org/10.1063/1.1674108)

### R9: Substrate Signature
Strong unmatched peak at known substrate position (Si: 520 cm⁻¹, ZnO: 437,
sapphire: 418, SiO₂: 460) flags substrate contamination.

### R10: WS₂ Resonance Enhancement at 532 nm
WS₂ shows resonance enhancement of 2LA(M) mode at ~350 cm⁻¹ when measured
with 532 nm excitation. Disappears at 785 nm.

**Citation**: Berkdemir, A. et al. (2013). Identification of individual and
few layers of WS₂ using Raman spectroscopy. *Scientific Reports* **3**: 1755.
DOI: [10.1038/srep01755](https://doi.org/10.1038/srep01755)

## Implementation

- `src/deviation/rules.py` — all 10 rules
- `src/deviation/hypothesis.py` — Hypothesis + RuleCitation dataclasses
- `tests/deviation/test_rules.py`

@phase R185-2
