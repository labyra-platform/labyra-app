# Changelog\n\n## [R161] - 2026-05-14

### Added
- **XRD Tier 1+2 metrics** (per-peak): d-spacing (Bragg), Scherrer crystallite size D (nm), integral breadth β, dislocation density δ (1/D²), microstrain ε (β·cosθ/4), hkl from citation match
- **XRD quality metrics card**: scan range, step size, λ effective, SNR, smallest FWHM, crystallinity %
- **Per-phase summary card**: lattice params (a/b/c/α/β/γ), space group, crystal system, citation chip with View source link
- **Profile function fitting**: Gaussian, Lorentzian, Pseudo-Voigt (default) via scipy.optimize.curve_fit with R² goodness gate
- **Zero shift correction**: manual 2θ offset input (instrument calibration)
- **Citation cache**: Protocol pattern abstraction (FirestoreCitationCache + NoOpCitationCache), migration-safe for future Redis/Postgres
- **Re-analyze button** on spectrum detail page (Pub/Sub republish for backfilling new fields)
- **NavBack** universal component (window.history aware, fallback to URL)
- **DataTable** generic sortable + collapsible + Excel export
- **Reference card overlay** (4a-pdf): manual paste XRD reference cards from HighScore Plus / ICDD format, vertical sticks on chart, legal-safe (user-provided data only)
- **Subscript rendering** for chemical formulas with variables: W₁₈O₄₉, WₙO₃ₙ₋ₓ, Fe₁₋ₓCoₓO₃
- **AI determinism**: temperature=0 for reproducible phase identification
- **MP formula capitalize**: periodic table tokenizer (WO3 not wo3)
- **Scientific methods documentation**: `docs/scientific-methods/xrd-analysis.md` (15 sections)

### Changed
- Migrated 4 tables (Materials, Samples, Experiments, Spectra) to DataTable component
- Cloud Run worker scaled: concurrency 5→10, RAM 2→4Gi
- Gemini config: gemini-3-flash-preview model (single-turn safe; multi-turn deferred for thought_signature handling)
- Worker analysis_version: spectra-4a-1.0.0 → spectra-4b-1.4.0

### Fixed
- Lint cleanup: 12 errors → 0 (no-useless-escape, prefer-string-starts-ends-with, jsx-a11y, no-new-array, no-useless-fallback-in-spread, next/no-html-link-for-pages)
- Pre-push hook: 60s → 6s (tsc --noEmit only)
- MP API 400 Bad Request (formula case sensitivity)

### Performance
- Citation lookup cache hit rate: cold start ~25-30s → warm ~5-10s (3-5x speedup)
- Cloud Run throughput: 2x with concurrency=10

### Security
- All new endpoints (reference-cards CRUD, reanalyze) require Firebase auth + tenantId claim
- Zod validation with strict length/range limits (max 50KB pasted text, 3-200 peaks, etc.)
- Tenant isolation via Firestore path scoping

