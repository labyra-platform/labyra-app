# Handoff for R162 — Comprehensive Context

> Created: 2026-05-14
> Previous: R161 SHIPPED 17 phases (May 14, 2026)

---

## NEW CHAT — PASTE THIS PROMPT VERBATIM:

```
Resume Labyra dev R162. Read THESE BEFORE coding:

1. CLAUDE.md (project rules, code standards, dependencies)
2. ROADMAP.md (current phase + Strategic Context section)
3. docs/strategy/INSIGHTS.md (pricing, trust, onboarding, VN psychology)
4. docs/scientific-methods/xrd-analysis.md (XRD methods reference)
5. .claude/memory/handoff-r162.md (this file)

PROJECT: Labyra SaaS lab management + AI spectrum analysis. International, $29/lab/mo, 
disrupting LIMS Big 4 ($50K+/year). VN-first, academic researcher target.

R161 SHIPPED (May 14):
- XRD Tier 1+2 metrics (d/D Scherrer/β/δ/ε/crystallinity/quality)
- hkl wire from citation candidate
- Re-analyze button, NavBack universal
- DataTable sortable+collapse+Excel export (4 tables migrated)
- Subscript variables (W₁₈O₄₉, WₙO₃ₙ₋ₓ)
- 4a-pdf manual reference card overlay
- Citation cache Protocol pattern + Firestore
- Cloud Run scale: concurrency=10, RAM=4Gi
- AI temperature=0 deterministic
- MP API capitalize via periodic table
- Per-phase summary card (lattice + space group)
- Profile function (Gaussian/Lorentzian/Pseudo-Voigt) + zero shift
- 15-section XRD scientific methods doc
- Strategic context docs (market + consumer psych + actionable insights)

WORKFLOW:
- labyra-app: WSL ~/LAB-MANAGER/labyra-app/, pnpm, branch main only
- worker: ~/LAB-MANAGER/labyra-spectra-worker/, bash deploy.sh
- patches: /mnt/d/labbook-patches/round-r{N}-{name}.py
- pre-push: pnpm exec tsc --noEmit (~6s)
- analysis_version=spectra-4b-1.4.0

CRITICAL RULES:
1. TRUST > COVERAGE: every AI assertion needs source {type, id, doi?}. No hallucination.
2. SECURITY per feature: input validation (Zod), sanitization, rate limit, tenant isolation. 
   Dedicated security hardening phase TBD.
3. LEGAL: ICDD PDF-2/4 = copyrighted, never redistribute. Only user-pasted data allowed.
   COD/MP free. Future ICDD partnership when international.
4. SCIENTIFIC DOC: every feature using algorithms/formulas/physics MUST document in 
   docs/scientific-methods/{topic}.md (name, formula, physics meaning, references, 
   implementation path).
5. UI/UX: WCAG 2.2 AA mandatory. shadcn/ui only. Lucide icons in labyra-app.
   Mobile-first (VN users). Touch targets ≥44x44px.
6. PSYCHOLOGY: Trust > Performance for academic users. Citation chips visible/clickable.
   Time-to-value < 10 min onboarding. PI recommendation > peer > paper > marketing.
7. CODE: TS strict no any, max 200 LOC component, kebab-case files, Conventional Commits 
   max 400 LOC diff, multi-tenant always tenantId filter.

ROADMAP NEXT (vote with user):
1. 4b + ai-5c — Internal lib Firestore material library + chip UI (~2-3h)
2. 4c — FTIR/Raman/UVVis web_search fallback citation (~1-2h)
3. 3d — PL + EDS + BET parsers (~3-4h)
4. 3e — CV/LSV/EIS electrochemistry (~2-3h)
5. Prompt engineering — XML structured output + few-shot (~30 min)
6. Gemini 3 thought_signature handling — multi-turn tool calling (~1h)
7. Demo dataset library — sample files for every spectrum type (onboarding boost)
8. PI dashboard — aggregate team experiments view
9. Tier 3 XRD — Rietveld QPA, March-Dollase, RIR (specialized, weeks)

USER PREFERENCES:
- Concise responses, no preamble, no trade-off analysis unless asked
- Code first, explain after
- Vietnamese mix English (code/log/errors English)
- Patches /mnt/d/labbook-patches/round-r{N}-{name}.py
- 4-5 options when ask_user_input_v0
- End conversation early if signs of fatigue

NOW: 
Acknowledge context loaded. Suggest top 4 phase candidates with time estimates. 
Wait for user vote before coding.
```

---

## Quick Reference (for self only — not paste to new chat)

### Open items / tech debt
- [ ] hkl in Firestore: spaces vs underscore format (works but verify)
- [ ] Citation cache hit rate not logged (metrics)
- [ ] Profile function r²=0.5 threshold may need tuning
- [ ] Gemini 3 multi-turn thought_signature
- [ ] MP API retry with exponential backoff
- [ ] ICDD partnership exploration
- [ ] Test cache impact under load

### Memory state (30/30 used)
Cleanup candidates if need space:
- #3 (LabBook BKU Origin Lab) — legacy
- #15 (TypeScript not .js) — redundant
- #7 (patch convention) — merge with #21

### Files modified R161 (high-traffic)
- Worker: src/parsers/xrd.py, src/citation/*, src/ai/analyzer.py, src/main.py
- App: src/types/spectra-analysis.ts, src/components/ui-extra/data-table.tsx,
  src/features/spectra/components/xrd-*.tsx, spectrum-upload-dropzone.tsx,
  src/app/api/spectra/[id]/reanalyze/route.ts, src/lib/spectra/parse-reference-card.ts

### Strategic insights summary
- Target: Academic VN + Asia-Pacific (CAGR fastest, Big 4 underserve)
- Pricing: $29/lab disrupts $50K+ enterprise
- Trust > Coverage: AI citations grounded to COD/MP
- Onboarding: <10 min sign-up → first analysis
- Mobile-first for VN
