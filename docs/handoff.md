# Labyra App — Session Handoff

> Updated at end of each session. Keep concise — for verbose context use `.claude/snapshot.md`.

## Session: 2026-05-12

### Completed
- R160-i18n-3a/3b/3c/3d/3e — i18n migration + breadcrumbs + proxy fix
- R160-shell-2 — sidebar nav rewrite for LabBook domains (4 groups, 10 stub pages)
- R160-dashboard-1 — Firebase foundation (sub-collection rules, firebase.json, CLAUDE.md update)
- R160-dashboard-2 — seed dev tenant + mock data + auth claims
- R160-dashboard-3 — auth claims hooks + debug page
- R160-dashboard-4 — live Firestore data in KPI cards + 3 charts + recent experiments
- R160-meta-1 — context snapshot generator (`pnpm snapshot`) + AGENTS.md
- R160-meta-2 — ARCHITECTURE.md + WORKFLOW.md + README refresh

### Decisions
- Sub-collection tenant model (not top-level + tenantId field) — simpler rules, cleaner GDPR
- Tremor → recharts (CLAUDE.md updated)
- Storage region asia-southeast1 (upgraded to Blaze)
- Project split: `labyra-app-dev` (current) / `labyra-app-prod` (Phase E) / `lab-manager-268a6` (legacy)
- Manual `pnpm snapshot` (no commit, gitignored .claude/)
- AI chat: Anthropic Claude via Next.js Route Handler (not Firebase Function) with prompt caching from day one

### Open questions
- AI Tier 1 dispatcher: Gemini Flash vs Haiku 4.5? (proposed: Haiku — uniform stack)
- Provenance: Firestore vs RTDB for streaming responses? (proposed: hybrid — RTDB for live message, Firestore for finalized provenance)
- RAG paper migration timing: in R160-ai-chat or defer to Phase B port?

### Next phase
**R160-ai-1** — Chat foundation:
- `/api/chat` Route Handler skeleton
- Anthropic SDK setup with prompt caching pattern
- Provenance schema in Firestore
- Tier 1 Gemini proxy (basic, no tool calling yet)
- Chat UI sidetab core (Cmd+J trigger)

### State
- HEAD: (run `git rev-parse --short HEAD`)
- Branch: main
- Build: passing
- Firestore (dev): tenant-dev-001 seeded with 50 docs
- User: nvhn.7202@gmail.com (admin claims active)
