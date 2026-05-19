# Peak Matching Algorithm (R185-1)

## Overview

Labyra matches detected sample peaks to reference peaks from materialProfiles
using the **Hungarian algorithm** (Kuhn 1955) for optimal 1-to-1 assignment.
This is the foundation of all deviation analysis.

## Algorithm

Given:
- Sample peaks at positions $\{s_1, s_2, ..., s_m\}$ with intensities/FWHMs
- Reference peaks at positions $\{r_1, r_2, ..., r_n\}$
- Tolerance $\tau$ depending on spectrum type

Build cost matrix $C \in \mathbb{R}^{m \times n}$:
$$
C_{ij} = \begin{cases}
|s_i - r_j| & \text{if } |s_i - r_j| \leq \tau \\
\infty & \text{otherwise}
\end{cases}
$$

Solve linear assignment via `scipy.optimize.linear_sum_assignment` (Hungarian):
$$
\min \sum_{(i,j) \in A} C_{ij}
$$

subject to each sample peak matched to at most one ref peak and vice versa.

## Default tolerances per spectrum type

| Type | Tolerance | Rationale |
|------|-----------|-----------|
| Raman | 5 cm⁻¹ | Typical instrumental resolution |
| FTIR | 10 cm⁻¹ | Broader peaks, lower resolution |
| XRD | 0.3° (2θ) | Bragg peak natural broadening |
| PL | 0.05 eV | Emission peak width |
| UV-Vis | 10 nm | Absorption edge dispersion |

Tolerances are scaled by R185-5 crystallinity classifier (×1.5 for nano, ×3 for amorphous).

## Quality grading

For each match result, we compute:
- **Match rate** = matched / total ref peaks
- **Mean absolute deviation** across matched peaks
- **RMSE** of deviations
- **Quality grade**: excellent (>85%), good (70-85%), fair (50-70%), poor (<50%)

## Confidence scoring per match

Each matched peak gets a confidence score:
$$
\text{conf} = \max\left(0, 1 - \frac{|s_i - r_j|}{\tau}\right)
$$

Higher confidence = closer to reference position.

## References

- Kuhn, H.W. (1955). The Hungarian method for the assignment problem.
  *Naval Research Logistics Quarterly* **2**: 83-97.
  DOI: [10.1002/nav.3800020109](https://doi.org/10.1002/nav.3800020109)
- Munkres, J. (1957). Algorithms for the assignment and transportation problems.
  *Journal of the Society for Industrial and Applied Mathematics* **5**(1): 32-38.
  DOI: [10.1137/0105003](https://doi.org/10.1137/0105003)

## Implementation

- `src/deviation/peak_matcher.py`
- `tests/deviation/test_peak_matcher.py`

@phase R185-1
