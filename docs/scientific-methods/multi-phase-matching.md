# Multi-Phase Greedy Matching (R185-4)

## Overview

For samples declared as composites (Sample.composition with multiple entries),
Labyra performs **greedy iterative peak matching** to assign each detected peak
to the best-matching declared phase. Inspired by XERUS algorithm (Castelli 2022),
**self-implemented in original code** per Option A license audit.

## Algorithm

1. Sort declared components by weight prior (descending)
2. For each component in order:
   a. Run single-phase Hungarian matching against its reference peaks
   b. Remove matched sample peaks from working pool
3. Continue until all components processed
4. Remaining unassigned peaks flagged as "not explained"

## Weight prior

Each declared component has a role-based weight + nominal fraction adjustment:

| Role | Base weight | Use case |
|------|-------------|----------|
| matrix | 1.0 | Primary phase |
| core | 0.95 | Core in core-shell |
| active | 0.9 | Functional layer |
| shell | 0.8 | Shell layer |
| support | 0.6 | rGO, carbon support |
| filler | 0.5 | Bulk addition |
| dopant | 0.4 | Small fraction, distinct signature |
| substrate | 0.3 | Si, SiO₂ underlying material |

Final weight:
$$
w = \text{base} \cdot (0.5 + 0.5 \cdot f_{\text{nominal}})
$$

where $f_{\text{nominal}}$ is user-declared nominal mass fraction (optional).

## Intent reconciliation

For each declared phase, compute:
$$
\text{intent coverage} = \frac{\text{ref peaks observed}}{\text{ref peaks total}}
$$

- coverage ≥ 0.3 → phase observed
- coverage < 0.3 → declared but not observed (flagged as `intended_but_not_observed`)

This surfaces discrepancies between researcher intent and sample reality.

## References

- Baptista de Castro, P. et al. (2022). XERUS: An Open-Source Tool for Quick
  XRD Phase Identification and Refinement Automation. *Advanced Theory and Simulations*.
  DOI: [10.1002/adts.202100588](https://doi.org/10.1002/adts.202100588)
- Lutterotti, L. et al. (2010). MAUD: a friendly Java program for material
  analysis using diffraction. *IUCr Newsletter* **21**.
- Castelli, P. et al. (2024). Dara: Automated multiple-hypothesis phase
  identification and refinement from powder X-ray diffraction.
  *arXiv:2510.19667*. [arXiv link](https://arxiv.org/abs/2510.19667)

## Implementation

- `src/deviation/multi_phase.py`
- `tests/deviation/test_multi_phase.py`

@phase R185-4
