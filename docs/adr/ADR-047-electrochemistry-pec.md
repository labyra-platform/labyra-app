# ADR-047: Electrochemistry & PEC measurement support

> **Renumbered R564.** Filed as ADR-041, which
> `ADR-041-ai-science-pipeline.md` already held — two decisions, one number,
> both dated 2026-05-26, so the date could not settle it. References did:
> everything citing "ADR-041" (ADR-042 twice, two handoffs) means AI Science.
> Nothing cited this one, so this one moved. 047 was the only genuinely free
> slot — 044 is claimed twice over (Legal/Copyright in round-r237-handoff,
> design tokens in design-rules), which is the same collision waiting to
> happen the moment somebody writes the file.

**Status**: Accepted
**Date**: 2026-05-26
**Phase**: R212–R219

## Context

The worker already had electrochemistry parsers (cv/lsv/tafel/eis, R254–R260) but
the app could not display them — `SpectrumParsedData` and the chart layer only knew
the spectroscopy/thermal types. Users could upload CV/LSV/EIS and the worker analysed
them, but the measurement page rendered nothing. Photoelectrochemistry (PEC) had no
support at all (worker or app).

## Decision

### 1. Reuse the Figure Registry, no per-type branching
Each electrochemistry technique is added as a `FigureDefinition` in
`figure-registry.tsx` (R208 architecture). A new technique = one registry case +
a controlled chart + a descriptor list. The section/modal never change. This kept
4 electrochemistry types + PEC additive (Open-Closed).

### 2. Separate "Edit figure" (aesthetics) from "Re-analyze" (science)
Electrochemistry results depend on experimental conditions (electrode area,
reference electrode, pH, reaction, iR). Mixing these into "Edit figure" (which only
restyles) would risk silently changing computed numbers. So a distinct **Re-analyze**
flow (`echem-params-dialog.tsx`) captures conditions → merges them into the spectrum
doc (whitelisted keys) → re-publishes the analysis task. Worker reads the doc and
recomputes. "Edit figure" remains purely visual.

### 3. Worker owns the science chain; client only fits a line
The Tafel plot needs processed axes (log|j| vs overpotential), which require the
RHE conversion + current-density chain. Rather than duplicate that in JS (drift
risk → two different numbers → lost trust), the worker returns a ready
`tafel_curve`. The app's **Range Selector** (R214) runs an ordinary least-squares
fit over the user-selected window of that curve — instant, client-side, but never
re-deriving units. Same data in worker and client ⇒ identical results.

### 4. STH vs ABPE honesty (PEC)
Solar-to-hydrogen efficiency is only valid at zero applied bias. If a bias is set,
the worker reports **ABPE** (`abpe_percent`), not STH, with a flag — preventing the
common literature error of quoting biased efficiency as STH.

### 5. Persistence unaffected
figureConfig persistence (ADR via R210) is per-figure-key, so every new technique
inherits Edit-figure + Publication-theme + save automatically through the registry.

## Consequences

- App now displays Tafel, LSV (+ in-place Tafel view), CV, EIS (Nyquist equal-aspect),
  and PEC J-V (photocurrent onset, j@1.23V, STH/ABPE).
- PEC Re-analyze deferred: its inputs (light power, applied bias) are not yet in the
  params dialog; captured at upload for now (`hasReanalyzeParams` excludes pec_jv).
- Remaining PEC (Mott-Schottky, chronoamperometry chopped) and GCD follow the same
  pattern — see scientific-methods/pec-analysis.md §3.

## References
- McCrory et al., *JACS* 2013 (overpotential benchmark)
- Bard & Faulkner, *Electrochemical Methods* 3rd ed. (Tafel, CV)
- Coridan et al., *EES* 2015 (STH/ABPE)
- scientific-methods/electrochemistry-kinetics.md, cv-eis-analysis.md, pec-analysis.md
