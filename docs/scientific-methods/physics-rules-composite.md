# Composite Physics Rules R11-R15 (R185-6)

## Overview

These rules detect cross-phase phenomena that only manifest in composites/
heterostructures. They operate on MultiPhaseResult (per-component matches)
from R185-4, not on a single MatchResult.

## R11: Charge Transfer (TMD/Graphene)

**Trigger**: TMD A₁g peak downshift (-1 to -5 cm⁻¹) AND graphene/rGO G-band
upshift (+1 to +5 cm⁻¹), observed simultaneously.

**Physics**: Electron transfer from carbon to TMD softens TMD out-of-plane
phonons (A₁g) and stiffens graphene G mode (electron donation depopulates
$\pi^*$ band).

Charge transfer magnitude ~ 10¹²-10¹³ cm⁻² (order of magnitude estimate).

**Followup**: XPS core level shifts (Mo 3d, W 4f toward lower binding energy)
confirm electron accumulation. PL quenching also supports.

**Citation**: Chen, X. et al. (2014). Probing the electron states and metal-
insulator transition mechanisms in molybdenum disulphide vertical
heterostructures. *ACS Nano* **8**(10): 11070-11075.
DOI: [10.1021/nn5025654](https://doi.org/10.1021/nn5025654)

## R12: Heterojunction Band Offset (UV-Vis)

**Trigger**: Absorption edges red-shifted in 2+ semiconductor components.

**Physics**: Type-II band alignment creates staggered conduction/valence band
offsets at interface. Bulk absorption edge shifts to lower energy than either
constituent.

**Followup**: PL should show suppressed direct emission + indirect inter-layer
emission at lower energy. UPS/XPS for valence band offset measurement.

**Citation**: Xu, K. et al. (2018). Sub-10 nm nanopattern architecture for 2D
material field-effect transistors. *Nature Communications* **9**: 2148.
DOI: [10.1038/s41467-018-04748-x](https://doi.org/10.1038/s41467-018-04748-x)

## R13: Interface Phonon Mode (vdW Breathing)

**Trigger**: Unassigned peak at 20-100 cm⁻¹ in Raman with 2+ phases observed.

**Physics**: van der Waals heterostructures support new low-frequency modes
arising from interlayer rigid-body breathing (out-of-plane Ag) or shear
(in-plane Eg). Frequency scales as $1/\sqrt{N}$ for N-layer stack.

**Followup**: Polarization-resolved Raman distinguishes breathing (parallel)
vs shear (cross-polarized).

**Citation**: Lin, M.L. et al. (2017). Cross-dimensional electron-phonon
coupling in van der Waals heterostructures. *Nano Letters* **17**(11): 7037-7044.
DOI: [10.1021/acs.nanolett.7b03515](https://doi.org/10.1021/acs.nanolett.7b03515)

## R14: Defect-Mediated Coupling (D/G Ratio)

**Trigger**: Carbon component in composite shows I(D)/I(G) > 1.5 or < 0.5,
significantly different from pristine rGO baseline (~1.0).

**Physics**: I(D)/I(G) ratio indicates defect density in sp² carbon network.
Composite formation can:
- Increase defects via covalent functionalization (I(D)/I(G) ↑)
- Heal defects via π-π stacking with TMD (I(D)/I(G) ↓)

**Citation**: Ferrari, A.C. (2007). Raman spectroscopy of graphene and graphite:
Disorder, electron-phonon coupling, doping and nonadiabatic effects.
*Solid State Communications* **143**(1-2): 47-57.
DOI: [10.1016/j.ssc.2007.03.052](https://doi.org/10.1016/j.ssc.2007.03.052)

Updated: Ferrari, A.C., Basko, D.M. (2013). Raman spectroscopy as a versatile
tool for studying the properties of graphene. *Nature Nanotechnology* **8**: 235-246.
DOI: [10.1038/nnano.2013.46](https://doi.org/10.1038/nnano.2013.46)

## R15: vdW Stacking Modes (Ultra-Low Frequency)

**Trigger**: Unassigned peak < 50 cm⁻¹ when 2D material (TMD, graphene) present.

**Physics**: Layered materials exhibit shear modes (in-plane, Eg) and breathing
modes (out-of-plane, A1g) below 50 cm⁻¹ that are diagnostic of layer count.

**Citation**: Tan, P.H. et al. (2012). The shear mode of multilayer graphene.
*Nature Materials* **11**: 294-300.
DOI: [10.1038/nmat3505](https://doi.org/10.1038/nmat3505)

## Implementation

- `src/deviation/composite_rules.py`
- `tests/deviation/test_composite_rules.py`

@phase R185-6
