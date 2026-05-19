# R185 End-to-End Validation Checklist

Single test sample: **MoS₂/rGO heterostructure** (canonical composite for materials science).
Run through every R185 layer before declaring production-ready.

## Prerequisites

- [ ] Worker deployed latest revision (`bash deploy.sh` ran without errors)
- [ ] App deployed to Vercel (latest commit pushed, build green)
- [ ] CSIE Pub/Sub setup ran (`bash scripts/setup_csie_pubsub.sh`)
- [ ] MP materialProfiles synced with structure field (`bash scripts/resync_mp_structures.sh`)
- [ ] Test tenant has at least 1 admin user logged in
- [ ] Sample Raman (.txt or .csv) + XRD (.xy or .xrdml) files for MoS₂/rGO on hand

## Layer 0 — Worker health

```bash
TOKEN=$(gcloud auth print-identity-token)

# Worker alive
curl -H "Authorization: Bearer $TOKEN" https://spectra-worker-5xd6gcfx5q-as.a.run.app/

# Cache empty initially (or freshly cleared)
curl -H "Authorization: Bearer $TOKEN" https://spectra-worker-5xd6gcfx5q-as.a.run.app/materials/cache-stats
# Expected: { size: 0, hit_rate: 0.0, ... } or populated if recent run
```

- [ ] /health returns 200
- [ ] /materials/cache-stats returns valid JSON
- [ ] Cloud Run logs show no errors in last hour

## Layer 1 — Sample creation with composition (R185-4b)

1. Navigate to Samples → New
2. Fill in:
   - sampleCode: `MOS2-RGO-001`
   - name: `MoS2/rGO composite test`
   - workflowStatus: prepared
3. Add composition (R185-4b form):
   - Row 1: formula=`MoS2`, role=matrix, fraction=0.7
   - Row 2: formula=`C`, role=support, fraction=0.3
4. Select compositeType: `heterostructure`
5. Save

**Verify in Firestore:**
- [ ] `tenants/{tid}/samples/MOS2-RGO-001` exists
- [ ] `composition` field present with 2 entries
- [ ] `compositeType` = "heterostructure"

**Verify in UI:**
- [ ] MaterialKnowledgePanel shows MoS₂ details (when typing the name)
- [ ] Both composition rows render with correct role badges
- [ ] Add/remove row buttons work (44px touch target)

## Layer 2 — Spectrum upload (Raman, R185-4e snapshot)

1. From Sample detail page → Add measurement → Raman
2. Upload Raman .txt file
3. Fill metadata: laser 532nm, instrument name optional
4. Submit

**Verify in Firestore:**
- [ ] `tenants/{tid}/spectra/{spectrumId}` exists
- [ ] `sampleId` = MOS2-RGO-001
- [ ] `composition` field present (snapshot from sample)
- [ ] `compositeType` = "heterostructure"
- [ ] `chemicalFormula` (or null if not set on sample)

## Layer 3 — Worker analysis (R185-1..7c, single spectrum)

Pub/Sub triggers worker `/process` after notify-complete.

**Wait ~30s, then verify:**
- [ ] Firestore `tenants/{tid}/spectra/{id}/analysis/latest` exists
- [ ] `analysisResult.deviationAnalysis.mode` = "multi-phase"
- [ ] `analysisResult.deviationAnalysis.multiPhase.components` has 2 entries:
  - MoS2 — should have intent_coverage > 0.5
  - C — should have intent_coverage > 0.5 (D and G bands matched)
- [ ] `analysisResult.deviationAnalysis.perComponentHypotheses` populated
- [ ] `analysisResult.deviationAnalysis.compositeHypotheses` may contain R11/R14 if charge transfer or D/G ratio anomalous
- [ ] `analysisResult.deviationAnalysis.fractionEstimates` present (raman-intensity-ratio-qualitative method)
- [ ] All fractionEstimates have `quantitative=false` (Raman cannot mass-quantify)

**Cloud Run logs should show:**
- [ ] "Deviation (multi-phase): components=2 match_rate=...% grade=..."
- [ ] No exceptions or stack traces

## Layer 4 — DeviationPanel UI render (R185-10a/b)

1. Open spectrum detail page in app
2. Scroll down past existing analysis card

**Verify visually:**
- [ ] DeviationPanel card renders
- [ ] Multi-phase analysis section shows Tabs: Summary | MoS₂ | C | Composite (if cross-phase rules fired)
- [ ] Summary tab: 4-stat grid (components count, overall match rate, grade, unassigned peaks)
- [ ] Phase fractions card: 2 FractionEstimateCard with QUALITATIVE badge + "NOT mass fraction" warning
- [ ] MoS₂ tab: MatchSummaryStats + hypotheses list
- [ ] C tab: same
- [ ] Composite tab: any R11-R15 hypotheses (if observed)
- [ ] Citation chips clickable, open DOI in new tab

**Mobile (DevTools → 375px width):**
- [ ] Tabs horizontal scroll works
- [ ] Stats grid stacks to 2 cols
- [ ] Touch targets ≥ 44px

## Layer 5 — Second spectrum (XRD, triggers CSIE)

1. From same sample → Add measurement → XRD
2. Upload XRD .xy file
3. Submit

**Wait ~30s for analysis + Pub/Sub csie-trigger.**

**Verify Firestore:**
- [ ] `tenants/{tid}/spectra/{xrdId}/analysis/latest` populated
- [ ] `deviationAnalysis.rietveld` present (if MP structure available)
- [ ] `rietveld.r_wp` reasonable (< 30%, ideally < 15%)
- [ ] `rietveld.gof` populated
- [ ] `rietveld.difference_plot` array with ~200 points
- [ ] `rietveld.phase_contributions` per phase

**CSIE auto-trigger:**
- [ ] `tenants/{tid}/samples/MOS2-RGO-001/crossSpectrum/latest` doc appears within 1-2 min
- [ ] `consistency.measurements_analyzed` = 2
- [ ] `consistency.declared_phases` has MoS2 + C with verdicts
- [ ] `consistency.overall_coherence_score` populated
- [ ] If any ambiguity → `ambiguous_observations` array

## Layer 6 — Sample-level CrossSpectrumPanel (R185-10c)

1. Open Sample detail page (MOS2-RGO-001)

**Verify:**
- [ ] CrossSpectrumPanel card renders below lineage
- [ ] Stats: spectra analyzed=2, techniques=[raman, xrd], coherence meter
- [ ] PhaseEvidenceCard per declared phase (MoS₂ confirmed, C confirmed/partial)
- [ ] Border-left color matches verdict (emerald=confirmed)
- [ ] Refresh button works (force=true, rate limited 10/min)
- [ ] Empty state if you delete a measurement (only 1 left) — shows "Need ≥2"

**Mobile responsive:**
- [ ] PhaseEvidenceCard readable at 375px
- [ ] Refresh button reachable (top-right Card header)

## Layer 7 — Rietveld + DifferencePlot (R185-10d-1)

If XRD analysis ran Rietveld:

- [ ] RietveldResultCard shows 6-col grid: R_wp, R_p, R_exp, GoF, χ², iterations
- [ ] Quality badge (good/acceptable/poor) reflects R_wp
- [ ] Profile params row (U, V, W, η, Δ2θ) renders
- [ ] Phases table with R_Bragg column
- [ ] DifferencePlot below: observed dots + calc line + diff in y2 below
- [ ] Phase contribution traces dotted
- [ ] Plotly responsive: 380px desktop, 280px mobile

## Layer 8 — Ambiguous observations (R185-9)

If sample triggered ambiguity (likely for nanocrystalline MoS₂):

- [ ] AmbiguousObservationCard renders
- [ ] Severity badge (info/warning/error) appropriate
- [ ] Candidates list with confidence meters
- [ ] Discrimination experiments expandable
- [ ] Expected outcomes per rule_id visible
- [ ] Citations clickable

## Layer 9 — i18n switch (R185-10d-2)

1. Switch locale via UI selector to /vi
2. Re-open same Sample detail page

**Verify VI labels:**
- [ ] "Phân tích đa phổ chéo" (Cross-spectrum)
- [ ] "Tinh chỉnh Rietveld" (Rietveld refinement)
- [ ] "Xác nhận" / "Một phần" / "Thiếu" / "Mâu thuẫn" (verdicts)
- [ ] "Tỉ lệ pha" (Phase fractions)
- [ ] "Nano tinh thể" (Nanocrystalline)
- [ ] Scientific term labels remain in English (RIR, Caglioti, Pseudo-Voigt — by design)

## Layer 10 — Rate limit + security

```bash
# Hammer CSIE refresh 15 times
TOKEN=$(... get firebase ID token ...)
for i in {1..15}; do
  curl -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"tenantId":"tenant-dev-001","force":true}' \
    "https://labyra-app.vercel.app/api/csie/MOS2-RGO-001/refresh"
  echo ""
done
```

- [ ] First 10 succeed (200)
- [ ] 11th+ return 429 rate_limited
- [ ] Retry-After header present

```bash
# Try injection
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"tenantId":"../etc/passwd"}' \
  "https://labyra-app.vercel.app/api/csie/MOS2-RGO-001/refresh"
```

- [ ] Returns 400 invalid_sample_id or similar
- [ ] No 500 server error

## Layer 11 — Performance

Open spectrum detail page, measure load time:

- [ ] First Contentful Paint < 2s
- [ ] DeviationPanel renders without "flash of empty state"
- [ ] DifferencePlot Plotly chart renders < 1s after data fetch
- [ ] No console errors in DevTools

## Known limitations / acceptable issues

- Raman fraction NEVER quantitative (cross-section variation) — expected, this is feature not bug
- If MoS₂ materialProfile lacks structure → Rietveld skipped (graceful)
- CSIE requires composition declared — single-formula samples skip CSIE
- Mobile tabs overflow scrolls horizontally — design choice over wrapping

## Sign-off

When all checks pass:
- [ ] Tag release: `git tag r185-validated && git push --tags`
- [ ] Update README status section: "R185 production-ready (validated YYYY-MM-DD)"
- [ ] Move to R186 / R187 with confidence

@phase R185-validation
