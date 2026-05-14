# Strategic Insights — Actionable for Development

Distilled from `market-research.md` + `consumer-psychology.md` (May 2026).
**Read this when building features touching: pricing, onboarding, AI trust, VN-specific UX.**

---

## 1. Market Position (from market-research.md)

### Pricing disruption
- LIMS Big 4 (LabWare/Thermo/LabVantage/STARLIMS): $50K–$500K/year enterprise
- Labrya target: **$29/lab/month** = 100-1000x cheaper
- Per-lab pricing (not per-user) → no adoption barrier from PI/admin

### Unique position
- ONLY platform combining: lab management + domain-specific AI + spectrum analysis
- Vertical SaaS (materials science) > Horizontal SaaS in retention + revenue efficiency
- AI-native SaaS CAGR 38-40% (vs traditional 19%)

### Target segment
- **SAM**: Academic + research institute labs, materials science, Asia-Pacific + global
- TAM ~$5.8B (LIMS $2.88B + AI research $2.1B + spectrum tools $0.8B)
- SAM ~$600M-900M
- SOM Year 1-3: focus VN academic + Asia-Pacific tier-2 markets

### Competitive moat
- Domain expertise (materials science specific) — hard to replicate
- AI-grounded citations (COD/MP/PDF) — trust differentiator
- Vietnamese-first then global — Asia-Pacific advantage

---

## 2. User Psychology (from consumer-psychology.md)

### Trust hierarchy (academic context)
1. PI / Senior researcher recommendation (highest)
2. Peer / lab mate recommendation
3. Paper citation in publication
4. Marketing / ads (lowest)

→ **One PI converted = entire lab adopts**. Sales/marketing target PIs first.

### UTAUT factors weighted (academic VN)
- **Trust** (strongest) — citation accuracy, no hallucination
- **Social Influence** — "PI lab bên đang dùng"
- Performance Expectancy — "AI nhanh hơn tôi 10x"
- Effort Expectancy — onboarding < 10 min

### Time-to-Value target
- Sign-up → first XRD analysis result: **< 10 minutes**
- If > 10 min, retention drops 40%

### Critical onboarding flow
1. Sign up (no credit card required)
2. Upload sample XRD file (provide demo dataset)
3. AI analysis with grounded citation → instant value
4. "Share with PI" CTA at result page

### Pricing psychology
- **Anchoring**: Show "$50K LIMS" beside "$29/lab"
- **Decoy**: Free tier (limited) → Pro ($29) → Lab ($99). Most pick Pro.
- **Annual framing**: "$29/mo" vs "$348/year" — show monthly first
- **Free trial**: 14 days, no credit card. VN users skeptical of auto-charge.

### Churn psychology
- Churn không phải vì missing feature, mà vì:
  1. Onboarding friction (didn't reach "aha moment")
  2. Single point of failure (1 day outage = lose trust)
  3. Lack of social proof in their context

### VN-specific
- Mobile-first usage (Decision Lab Q3 2025)
- WhatsApp/Zalo for support preference > email
- Vietnamese language critical for adoption (not just translation, but cultural)
- Trust auto-charge LOW — clear "Cancel anytime" prominent

---

## 3. Implementation Rules for Dev/Claude Agent

### Trust > Coverage (already in memory #11)
- Every AI assertion MUST have source: `{type: 'COD'|'MP'|'paper', id, doi?}`
- Unverified phase identification → badge "Unverified" not hallucinated name
- Citation chip visible, clickable, links to source

### Onboarding (when shipping new features)
- New feature must reach value < 30s on existing user flow
- Demo data button on every analysis page
- Error states must explain "why" not just "what"
- No JS errors in console (Vietnamese users won't report, just leave)

### VN-specific code patterns
- All `toast()` messages bilingual (use `t.has()` check pattern)
- Phone format `+84 ...` validation
- Date format DD/MM/YYYY (not US MM/DD/YYYY)
- Currency: VND for VN users, USD for international (locale detection)

### AI prompts (already in worker)
- **temperature=0** for scientific output (already shipped R161)
- Cite source for every numerical claim
- Refuse if no high-confidence match (better empty than wrong)

### Pricing display
- Always show "$29/lab" not "$29/user" — different psychology
- Anchor "vs $50K enterprise LIMS" prominently
- VN: hiển thị "~700K VND/tháng" tương đương USD

### Mobile (top priority for VN)
- All pages must be mobile responsive
- Touch targets ≥ 44×44px (WCAG 2.5.5)
- Spectrum chart pinch-zoom + tap-to-inspect peak

### Trust signals on UI
- "Trusted by 10+ labs at HCMC University of Technology" (when true)
- "Powered by Anthropic Claude + Google Gemini" (well-known AI brands)
- "Data hosted on Google Cloud (asia-southeast1, Singapore)" (data residency)
- ISO 27001 certificate when achieved

---

## 4. Roadmap Implications

### Near-term (Q2 2026)
- **Demo dataset library**: every spectrum type có 1-2 sample files
- **PI dashboard**: aggregate view across team's experiments
- **Sharing UX**: "Share with PI" / "Share with lab" prominent CTA
- **Vietnamese onboarding video**: 90s walkthrough

### Mid-term (Q3-Q4 2026)
- **Institutional plan**: $X/year for whole university
- **API access**: programmatic access for power users (paid tier)
- **Mobile app**: native iOS/Android (not just responsive web)
- **Marketplace**: lab can sell their reference card library

### Long-term (2027+)
- **GraphRAG**: cross-paper citation network
- **AI agent**: autonomous experiment design suggestion
- **Geographic expansion**: Indonesia, Thailand, Philippines (similar markets)
- **Vertical expansion**: pharma, biotech, food testing

---

## 5. Metrics to Track

### Adoption (psychology-grounded)
- Time-to-first-analysis (target < 10 min)
- Aha moment rate (% of users reaching first successful analysis)
- PI conversion rate (% lab signups originating from PI invite)
- Vietnamese vs English locale split

### Retention
- D1, D7, D30 retention (SaaS standard)
- Feature adoption rate per spectrum type
- Citation chip click rate (trust signal engagement)

### Trust signals
- "Verified" badge ratio (citations matched / total)
- AI confidence average (should be >0.7 for high-confidence display)
- Hallucination report rate (user-flagged)

---

## References
- See `market-research.md` for full TAM/SAM/SOM analysis
- See `consumer-psychology.md` for full UTAUT/TAM model application
- See `docs/uiux-international-standards.md` for WCAG/ISO/Nielsen
- See `docs/scientific-methods/xrd-analysis.md` for XRD methods
