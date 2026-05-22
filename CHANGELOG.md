# Labyra App — CHANGELOG

> Chronological history of shipped phases. Each phase = one or more atomic commits.
> See ROADMAP.md cho long-term planning, ADRs trong `docs/adr/` cho architectural decisions.

<!-- R178-docs-update-2026-05-18 -->

**Last updated**: 2026-05-22

---

## R190–R191 — Cost telemetry fix, test infra, nonce-CSP, Gemini retry (May 22, 2026)

> Tech-debt cleanup session, verify-before-assert throughout. Six atomic rounds.

### R190-1 — T0 cost telemetry billed $0 (bug, ~2 weeks live)
- CAPABILITY_MAP emits GA string `gemini-3.1-flash-lite` (GA 2026-05-07) but the
  PRICING table keyed it `gemini-3.1-flash-lite-preview` → PRICING miss → every
  Tier-0 call hit the "unknown model → $0" branch since 2026-05-07. Fixed key +
  GA cache rates ($0.20/$0.50 read/write, was preview $0.025/$0.25). Removed the
  deprecated `MODELS` zombie (overdue since R169). ADR-020 addendum.
- Historical per-tenant cost for 2026-05-07..05-22 under-counts T0 (backfill TBD).

### R190-2/3 — unit-test infra + G-8 guardrail
- New `vitest.config.ts` (unit, @/ alias inline, excludes the emulator-bound
  rules test) + `tests/unit/cost-calculator.test.ts` (G-8: every tier model must
  exist in PRICING; 11 tests) + `test:unit` script. R190-3 hotfix split
  `vitest.rules.config.ts` so the unit config no longer filters out test:rules.

### R191-1 — nonce-based CSP (Report-Only) + zod jitless (ADR-031)
- CSP moved from static next.config.ts header to per-request nonce in proxy.ts
  (`btoa(crypto.randomUUID())` set on request.headers before handleI18nRouting;
  next-intl forwards it; Next SSR reads the nonce). script-src drops
  'unsafe-inline' + 'unsafe-eval' (nonce + strict-dynamic). style-src keeps
  'unsafe-inline' (Tailwind/shadcn/Plotly). Policy in src/lib/security/csp.ts.
- zod v4 JIT uses `new Function` (the lone eval source on form routes); disabled
  via a nonce'd inline script setting `__zod_globalConfig.jitless` in root <head>.
- Verified on preview: nonce matches across all scripts (view-source == header),
  console clean. Enforce flip + HSTS preload deferred to the domain batch.

### R191-2 — ADR-031 Plotly note
- The "spectra:8" violation is Plotly's `addStyleRule` injecting inline STYLE
  (not script), covered by style-src 'unsafe-inline' and harmless (plotly issues
  #2355/#4585/PR#7109). Not a blocker for the enforce flip.

### R191-3 — G-6 Gemini retry (ADR-032)
- @google/genai retries 429/5xx natively; made explicit + bounded:
  getClient() `httpOptions {timeout:20000, retryOptions:{attempts:3}}`,
  streamChat() override `{timeout:40000, attempts:2}` (T2 RAG ~25s, within chat
  route maxDuration 60). No hand-rolled wrapper (would stack on SDK retry).

### R191-4 / R191-6 — ADR-032 consolidation
- The canonical ADR-032 (`ADR-032-ai-scaling-and-v3.5-evaluation.md`, R187)
  existed only in the D: context pack, never committed to the repo. R191-4
  mistakenly re-created it as a thinner `ADR-032-ai-scaling.md`. R191-6 fixes
  this: restored the canonical R187 file into the repo, appended the G-6 retry
  status update to it, and removed the duplicate thin file.

### Docs
- ADR-031 (nonce-CSP). ADR-032 (AI scaling) consolidated onto canonical R187
  file. ROADMAP + HANDOFF +
  BOOTSTRAP refreshed to R191. Final commit `7239b75`.

---

## R188–R189 — Gemini 3 conversation fidelity, tool-timeout, soft-delete indexes, cost-token tracking (May 21, 2026)

> Backfilled from commit log 4653e8f..7239b75 (the R188–R189 session left commits
> but no CHANGELOG section at the time). Two paired session blocks.

### R188 — Gemini 3 model wiring + R187 soft-delete fallout + tool reliability
- **R176-3** (18a8347): persist + restore Gemini 3 `thoughtSignature` across
  conversation reload — prevents thought-context loss on multi-turn resume.
- **R176-3d** (3178359): `functionResponse.name` must be the function name, not the
  tool-call ID (G-2); unified `toolResults` type — completes the R176-3 multi-turn
  400 fix.
- **R188-1** (cfe0188): sync Gemini 3 model strings to `capabilities.ts`.
- **R188-2** (7cd5191 + 2833d84): restore current CLAUDE.md to repo (was stale at
  R160; repo now R187).
- **R188-4** (7944265): tool_timeout phase 1 — sin1 region + 45s timeout + graceful
  message + search-timing logs. (Superseded R187 by the later maxDuration→60 fix.)
- **R188-5** (fbe5df7): add `lifecycleStatus` composite indexes for 8 entities —
  R187 soft-delete had broken LIST queries (FAILED_PRECONDITION).
- **ADR-033** (0ba4602): RAG retrieval scaling + GraphRAG prerequisite documented.
- Also: Vercel Speed Insights added for real-user Core Web Vitals (97bea6b).

### R189 — Gemini safety + cost-telemetry token accounting
- **R189-1** (4200ee5): Gemini `safetySettings` — relax `dangerous_content`
  threshold for materials-science content (false-positive blocks on legitimate
  chemistry/spectroscopy prompts) (G-5).
- **R189-2** (414f438): track Gemini cached + thoughts tokens in cost telemetry
  (G-3/G-4) — prerequisite for the R190-1 T0 pricing fix.

---

## R187 — Launch hardening: Chemicals, Bookings, Perf, AI polish, bug fixes (May 21, 2026)

> Large UI/UX + correctness session. Security/RBAC/onboarding finalized; two new
> domains ported; perf measured (LCP 0.6s, Lighthouse 97); AI chat polished; many
> bug fixes. See ROADMAP.md "R187 (THIS SESSION)" for the full list.

### Security + RBAC + Onboarding (finalize, ADR-030)
- C2 `__Host-session` cookie (HttpOnly/Secure), C3 signed-download tenant-prefix,
  H1-H5 + M/L. RBAC ~47 routes (getRoleFromToken + authenticateWriter/Admin).
  Onboarding invite-only + email-verify gate (Google auto-verified).

### Chemicals (CHEM-1-4)
- GHS standard (9 pictograms, official PubChem SVGs) + materials fields + event-sourced
  inventory (immutable transactions subcollection, quantity derived) + PubChem CAS
  auto-fill (2-step PUG REST+View, 90-day cache). Firestore rules + dashboard GHS chart.

### Bookings (BOOK-1-3)
- Overlap-safe service (race-check inside runTransaction, half-open intervals) +
  auto-find-slot + owner/admin cancel-edit + shadcn datetime picker + 409 conflict +
  status filter (upcoming/all/cancelled). Member auto-approve.

### QW-1-5 (perf + a11y + i18n quick wins)
- Single Labyra brand theme (cut 9 themes) + brand fonts Inter/Plus Jakarta Sans/
  JetBrains Mono (dropped 11 fonts, PERF-1) + UI-9 contrast. D3 tree-shake (PERF-2).
  reduced-motion + skip-link + `<main>` landmark (UI-3/4 WCAG). VN diacritics (UI-5).

### Perf config + loading (PERF-7/11/12/13, A5)
- logger.ts (structured JSON), @next/bundle-analyzer, removeConsole exclude error/warn,
  Cache-Control material-profiles. ListSkeleton (header bar + varied column widths) for
  all list pages incl papers.
- **Measured REAL**: LCP 0.6s, FCP 0.6s, TBT 0ms, CLS 0.009, Lighthouse 97. Audit's
  3.5-5s estimate was stale (pre fonts/D3 cut). PERF-3/4/5/8 refactors deferred
  (premature optimization at current scale).

### AI chat polish (AI-POLISH-1-3)
- Gemini-style shimmer thinking indicator (replaces pulsing dots, reduced-motion safe,
  fixes UI-3). Copy button on assistant messages (hover-reveal, copy→check). Message
  bubble fade-in on appear (runs once on mount, reduced-motion safe).

### Bug fixes
- `getAuth()` → `getFirebaseAuth()` across 17 files (prevents 'No Firebase App' crash).
- spectra DELETE targeted wrong collection (measurements→spectra).
- soft-delete (deprecate/retract) now filtered from all spectra list hooks (was: rows
  stayed visible). Added `lifecycleStatus?` to SpectrumMetadata type.
- `<main>` flex layout (fixes off-center loading on every page).
- Header template cruft removed (GitHub CTA, theme selector). Logout wired.
- Lineage graphs removed from detail pages (belongs in Lineage Explorer).
- **chat tool_timeout** on broad RAG queries — root cause: chat route lacked
  maxDuration → Vercel Pro default 15s cut the function before tool finished. Fixed:
  `export const maxDuration = 60`.

### Docs
- ADR-032 (AI scaling + rate-limit + v3.5 deck evaluation). ROADMAP + HANDOFF + BOOTSTRAP
  refreshed to R187. Final commit `4653e8f`.

---


## R182 — FTIR reference library (May 19, 2026)

**Tenant**: `tenant-dev-001`. 29 functional group reference cards seeded into `tenants/{tid}/references` via `POST /api/references`. Sources: NIST WebBook + Coates IR Table.

Hotfixes during seed:
- Wrong collection initially (`referenceCards` not `references`)
- Zod validation missing `lifecycleStatus` + `version` (handled by service layer when using API)
- FormulaSchema requires capital letter (rejected `R-OH`, `C=O`, `M-OH` — use bare functional group `OH`, `CO`)

Doc: `docs/scientific-methods/ftir-reference-library.md`

---

## R181 — OCR cache + classify v1.1 + citation sort + path fix (May 19, 2026)

**Commits app**: `8eee48f`, `4c4a35b`. **Commit worker**: `12894a5`.

### R181-1 — OCR cache GCS + SHA256
- Cache key: `gs://{bucket}/ocr-cache/{sha256}.json`
- Lifecycle: 365-day delete
- Savings: ~$0.001/page on reprocess

### R181-2 to R181-8 — PDF viewer rewrite
- Decoupled ResizeObserver from page rendering (window resize only)
- Wrapped callbacks in useCallback for stable identity
- Removed `fitMode` state (single source of truth via fullscreenchange event)
- Container width lock to parentElement
- 300 LOC rewrite, fixed infinite re-render loop

### R181-9 — Classify prompt v1.1
- Added 5 new rules (7-11) preventing passing-reference false positives
- Input window 3000 → 5000 chars
- `PROMPT_VERSION` v1.0 → v1.1 (audit log will diff)

### R181-10 — Citation sort by confidence
- Order: doi-exact → manual → title-fuzzy → unverified
- Stable sort within same confidence

### R181-11 — Firestore path measurements→spectra fix
- R164-phase-5b-2 renamed URLs but collection stayed at /spectra
- Reverted all query paths back to spectra
- URL endpoints stay `/api/measurements`
- R190+ scope: proper Firestore migration

### R181-skill — labyra-patch-workflow.md
- Codifies session bootstrap, patch conventions, 10 recurring bug patterns
- Path: `.claude/skills/labyra-patch-workflow/SKILL.md`

---

## R180 — Cancel UX + Cmd+K (May 18, 2026)

**Commit**: `9738467`.

### R180-1 — Cancel endpoint
- Sets `status='cancelled'` directly (skip transient `cancelling`)
- Fixes stuck cancelling when worker scales to zero

### R180-2 — kbar Cmd+K paper search
- `usePaperActions` hook fetches top 30 recent active papers
- Dynamic actions under "Papers" section
- File: `src/components/kbar/use-paper-actions.tsx`

---

## R179 — Layer 2 + journal extract + react-pdf (May 18, 2026)

**Commits worker**: `c214281`, `4cb373a`.

### R179-1 — Layer 2 orphan audit
- `auditOrphansWeekly` Cloud Function (Sun 04:00 UTC)
- Scans tenants for orphan spectra/papers/references
- Writes to `_orphan_audit/{date}`
- ADR-026

### R179-2 — Journal extract via Crossref + OpenAlex
- Worker Step 1e
- Cache: Firestore `_journal_resolve_cache/{doi_or_issn}` 90-day TTL
- UI: PaperFilterPanel exposes journal filter
- ADR-027

### R179-3 — Soft archive papers
- `POST /api/papers/{id}/deprecate` sets `lifecycleStatus='deprecated'`
- No hard delete (preserves audit trail)

### R179-4/4b — Gemini 3 Flash thinking_level adapter
- Replaces deprecated `thinking_budget`
- All worker AI calls migrated

### R179-5 — Orchestrator indent fix (critical)
- Steps 1d/1e were dedented to function level → SyntaxError
- Re-indented INSIDE try block

### R179-6 — Step 1b debug logging
- Write `metadataExtractError` field to Firestore on failure

### R179-7 — react-pdf v10 viewer
- Custom toolbar, page navigation
- Fuzzy title search via fuse.js
- InfoSidebarConditional hides right sidebar on /view pages
- Rejected react-pdf-viewer.dev + @react-pdf-kit/viewer (commercial license)

---

## R178-2c-fix-2 — Client CONVERSATION_GONE handling (May 17, 2026)

**Commit**: `ec1343d`

Companion to fix-1. UI now resets URL + state on 410 instead of showing raw error.

### EDIT

- `src/lib/ai/use-chat-stream.ts`: detect 410 from `/api/chat`, parse `error.code === "CONVERSATION_GONE"` → `setConversationId(null)` + `setMessages([])` + throw 'conversation_gone'
- `src/features/ai/components/chat-shell.tsx`: new useEffect — when `conversationId === null` AND `urlConvId` set, drop `?c=` param via `router.replace`
- `src/features/ai/hooks/use-selected-papers.ts`: detect 404 PATCH → clear local Set, throw 'conversation_gone' (stop retry loop)

---

## R178-2c-fix-1 — Conversation referential integrity (May 17, 2026)

**Commit**: `458a023`

Prevents orphan messages from accumulating in subcollections under deleted conversation docs.

### EDIT

- `src/app/api/chat/route.ts`: when client supplies `conversationId`, verify doc exists + userId match
  - 410 `{ error: { code: 'CONVERSATION_GONE', message: '...' } }` if missing
  - 403 if userId mismatch (defense in depth)
- Cost: 1 extra Firestore read/turn when client supplies id (negligible vs orphan cleanup pain)

Layer 2 (audit Cloud Function) + Layer 3 (admin UI) deferred to R179+.

---

## R178-2c — System prompt scope awareness (May 17, 2026)

**Commit**: previous in series

User reported: select paper → "tóm tắt" → LLM generic "what do you want to summarize?". LLM had no awareness of scoped papers.

### EDIT

- `src/app/api/chat/route.ts`: when `selectedPaperIds.length > 0`, fetch paper metadata (db.getAll), build dynamic system block `# Scoped Library (R178-2b)` listing papers in citation format `[1] Author1, Author2 et al. (Year) — Title [DOI: ...]`. Behavior instruction: "CALL searchPapers immediately for ANY content question". Append as 2nd system segment (cache: false).
- `src/lib/ai/tools/paper-tools.ts`: tool description gains paragraph "When system prompt mentions Scoped Library, ALWAYS call this tool for any content question — even vague ones like 'tóm tắt' or 'summarize'..."

Cache strategy preserved: base prompt 1h cache (unchanged), scope segment per-turn dynamic.

---

## R178-2b — Paper selector panel UI (May 17, 2026)

NotebookLM-style right sidebar for scoping chat RAG to selected papers.

### NEW

- `src/features/ai/hooks/use-selected-papers.ts` (121 LOC):
  - Set<string> state initialized from `conversation.selectedPaperIds`
  - `toggle()` optimistic UI, hard cap 10
  - `clear()` bulk deselect
  - Debounced PATCH to `/api/conversations/[id]/papers` (500ms)
  - `saving` + `error` state for UI feedback
- `src/features/ai/components/paper-selector-panel.tsx` (233 LOC):
  - Right sidebar collapsible (w-80 open / w-12 closed)
  - localStorage persist open state (`labyra:paperSelector:open`)
  - shadcn: Badge, Button, Input, ScrollArea, Skeleton
  - @tabler/icons-react: Check, File, LayoutSidebarRight*, Loader2, Search, X
  - Search filters by title + authors
  - Selected papers sort to top, then alphabetical
  - Empty/no-match states with IconFile
  - Max-reached: opacity-40 + cursor-not-allowed on unselected
  - Save status: spinner + 'Saving...' OR destructive 'error' (aria-live=polite)
  - WCAG 2.2 AA: aria-pressed, aria-label, focus-visible:ring

### EDIT

- `src/lib/firestore/queries/ai-conversations.ts`: `conversationFromSnapshot` extended to include `selectedPaperIds`
- `src/features/ai/components/chat-shell.tsx`: import `useConversation` + `PaperSelectorPanel`. Render panel as 3rd flex child after main chat div.
- `messages/en.json` + `messages/vi.json`: 13 new `ai.paperSelector*` + `unknownAuthors` keys each

---

## R178-2a — Multi-paper RAG backend (May 17, 2026)

Foundation for paper-scoped chat retrieval.

### EDIT

- `src/types/ai.ts`: `AiConversation.selectedPaperIds?: string[]`
- `src/lib/ai/tools/types.ts`: `ToolContext.selectedPaperIds?: string[]`
- `src/lib/ai/tools/paper-tools.ts`: `searchPapersHandler` builds Pinecone filter `{ paperId: { $in: ctx.selectedPaperIds } }` when non-empty (omits filter entirely when empty — `$in: []` returns zero hits)
- `src/app/api/chat/route.ts`: read convDoc once after `convRef` declaration, extract `selectedPaperIds.slice(0, 10)`, pass to `executeToolCall` context

### NEW

- `src/app/api/conversations/[id]/papers/route.ts` — PATCH endpoint:
  - Body `{ paperIds: string[] }`, max 10
  - Validate caller owns conversation (userId), each paperId exists in tenant (`getAll` defense)
  - Rate limit 30/min per tenant
  - Returns `{ data: { selectedPaperIds } }`

---

## R178-1b-1 — PDF viewer V1 (browser iframe) (May 17, 2026)

User-facing PDF viewing. V1 = browser native iframe (0 KB bundle, native a11y). V2 (pdfjs-dist) deferred to R178-1b-2 when R179 translate needs text layer.

### NEW

- `src/app/[locale]/dashboard/papers/[id]/view/page.tsx` — Server Component
- `src/app/[locale]/dashboard/papers/[id]/view/loading.tsx` — IconLoader2 spinner
- `src/app/[locale]/dashboard/papers/[id]/view/error.tsx` — shadcn Alert variant=destructive with retry
- `src/features/papers/components/pdf-viewer-iframe.tsx` (168 LOC):
  - Fetch signed URL, auto-refresh 60s before expiry
  - Header: back link + truncated title + filesize/pages/version + download Button asChild
  - iframe full-height (calc(100vh-4rem))

### EDIT

- `src/features/papers/components/paper-detail.tsx`: add IconEye import + "View PDF" Link button
- `messages/en.json` + `messages/vi.json`: 7 new `papers.*` keys (viewPdf, viewPageTitle, backToDetail, download, pdfLoadFailed, retry, loading)

---

## R178-1a — Paper signed-download endpoint (May 17, 2026)

### NEW

- `src/app/api/papers/[id]/signed-download/route.ts`:
  - GET, returns `{ url, expiresAt }` 15-min TTL
  - Mirror `/api/measurements/[id]/signed-download` pattern (R164-phase-5b)
  - Bearer Firebase ID token auth, rate limit 100/60s, tenant isolation
  - Lifecycle check: 410 Gone on retracted papers
  - Uses existing `getSignedDownloadUrl()` helper

---

## R177-1f — Worker tests for book detection (May 17, 2026)

22 unit + integration tests for R177-1c (google_books) + R177-1d (metadata).

### NEW

- `tests/test_google_books.py` (16 tests):
  - TestJaccardSimilarity: 6 pure-function tests
  - TestNormalizeIsbn: 4 pure-function tests
  - TestLookupBookIsbn: 4 integration tests (real Google Books API)
  - TestSearchBookByTitle: 4 integration tests + Jaccard threshold
- `tests/test_metadata_book.py` (6 tests):
  - TestArticleDetection: documentType='article', DOI/year extract, no ISBN/publisher
  - TestBookDetection: documentType='book', ISBN+publisher (Schrader textbook)
  - TestDefaults: empty/short input → safe defaults (no API key needed)

Integration tests skip gracefully when keys missing (CI-safe).

---

## R177-1d-followup — deploy.sh GEMINI + BOOKS secrets (May 17, 2026)

`gcloud run deploy` ghi đè secret config per revision. Previous `deploy.sh` only listed 5 secrets, causing Gemini + Books mounts to silently drop on each redeploy → worker fell through to defaults (`title='Untitled'`).

### EDIT

- `deploy.sh`: `--set-secrets` adds `GEMINI_API_KEY=gemini-api-key:latest,BOOKS_API_KEY=books-api-key:latest`. Now hardcodes all 7 secrets (ANTHROPIC + MP + MISTRAL + VOYAGE + PINECONE + GEMINI + BOOKS).

---

## R177-1d — Orchestrator routing + types extend (May 17, 2026)

### EDIT (worker)

- `src/papers/types.py`:
  - `DocumentType = "article"|"book"|"thesis"|"unknown"` Literal
  - PaperDoc fields: `document_type` (alias `documentType`, default 'unknown'), `isbn`, `publisher`
- `src/papers/metadata.py`:
  - `ExtractedMetadata` extended + EXTRACT_PROMPT updated with documentType classification rules
- `src/papers/orchestrator.py`:
  - Step 1b: persist 3 new fields to Firestore + log `document_type` telemetry
  - New Step 1c: book metadata resolve (best-effort, non-blocking)
    - documentType=book → `lookup_book_isbn(isbn)` first
    - Fallback: `search_book_by_title(title, authors)`
    - Merge: title/year/publisher (prefer API), bookPageCount, bookSubtitle, bookSourceId, bookResolvedAt

---

## R177-1e — TS Paper schema sync (May 17, 2026)

Sync labyra-app TS schema with worker R177-1d Firestore writes.

### EDIT (labyra-app)

- `src/types/papers.ts`:
  - `DocumentType` type
  - Paper interface: `documentType` (required, default 'unknown'), `isbn`, `publisher` (required, '' default), optional `bookSubtitle`, `bookPageCount`, `bookSourceId`, `bookResolvedAt`
- `src/lib/schemas/paper-schema.ts`:
  - `DocumentTypeSchema` enum
  - `PaperPatchFields` gains documentType, isbn, publisher (lenient ISBN regex)
- `src/app/api/papers/upload/route.ts` + `upload-complete/route.ts`:
  - Initialize 3 required fields with defaults (`documentType: "unknown"`, `isbn: ""`, `publisher: ""`)

---

## R177-1c — Google Books resolver (May 17, 2026)

### NEW (worker)

- `src/papers/google_books.py` (270 LOC):
  - `lookup_book_isbn(isbn) → BookMetadata | None` — exact match
  - `search_book_by_title(title, authors=None) → BookMetadata | None` — Jaccard 0.8 + min 3 tokens
  - `jaccard_similarity(s1, s2) → float` — token-set ratio
  - BookMetadata Pydantic mirrors CitationMetadata shape + book fields (subtitle, isbn_10/13, page_count)
  - Defensive: ISBN regex, Min title length 5, min 3 tokens, Jaccard 0.8 floor
  - Returns None on miss / network error / invalid input (never raises)

Verified Schrader textbook (ISBN 3527264469) → 'Infrared and Raman Spectroscopy: Methods and Applications', Bernhard Schrader, 1995, Wiley-VCH, 788 pages.

---

## R177-1b — Metadata Haiku → Gemini Flash migration (May 17, 2026)

### EDIT (worker)

- `src/papers/metadata.py`: Anthropic Haiku 4.5 → Gemini 3 Flash via `extract_json()` with Pydantic schema. ~$0.005/paper → ~$0.001/paper (~50% reduction). Quality preserved via SDK structured output mode.

Worker LLM stack hybrid (intentional):
- `metadata.py` → Gemini 3 Flash (structured JSON, cheap)
- `enrich.py` → Anthropic Haiku (cache-optimized, OFF by default)
- `analyzer.py` → Anthropic Sonnet (scientific audit trail)

---

## R177-1a — Gemini client infra (May 17, 2026)

### NEW (worker)

- `src/papers/_gemini_client.py`: singleton via `lru_cache`, `extract_text()` + `extract_json()` with Pydantic schema constraint, `thinking_budget=0` default (Gemini 3 charges thoughts at output rate, disable for structured tasks)
- `pyproject.toml`: add `google-genai>=0.10.0`
- `src/config.py`: `gemini_api_key`, `gemini_model_metadata=gemini-3-flash-preview`, `gemini_model_enrich=gemini-3-flash-preview`, `books_api_key`
- GCP: Secret Manager `gemini-api-key` + `books-api-key` created; IAM `spectra-worker@labyra-app-dev.iam.gserviceaccount.com` granted secretAccessor

---

## R176-2bc-hotfix — Gemini 3 thoughtSignature extraction (May 17, 2026)

Gemini 3 multi-turn tool calling failed with 400 INVALID_ARGUMENT because SDK helper `response.text` strips `thoughtSignature` from candidates.

### EDIT (labyra-app)

- `src/lib/ai/providers/gemini.ts`: extract `thoughtSignature` from raw `candidates[0].content.parts[*]` (not via SDK helper). Forward through:
  - LLMToolCall → assistant block → Firestore message
  - `buildHistory` includes signature in parts for next-turn request

E2E verified: "Có bao nhiêu sample" → tool call → response works.

---

## R176-2bc — Gemini 3 model swap (May 17, 2026)

T0=gemini-3.1-flash-lite, T1+T2=gemini-3-flash-preview, T3+T4=sonnet-4-6, T5=opus-4-7.

---

## R176-2a — SDK migration (May 17, 2026)

`@google/generative-ai` v0.24.1 (legacy) → `@google/genai` 2.3.0.

### R176-2a-hotfix — Role-based tier labels (May 17, 2026)

Tier labels decoupled from model identity: Lab Manager / Librarian / Engineer / Writer / Auditor. Stable across model swaps.

---

## R175-1 — Writer citation format `[authorYear]` (May 16, 2026)

**Commit**: `9f834a2`

T4 Writer outputs now use academic-style citation keys (`[smith2024]`) instead of chunk hash IDs (`[ab008565301d]`).

### NEW

- `src/lib/ai/tier4-writer/citation-loader.ts`:
  - `loadPapersMetadata(tenantId, paperIds[])` — batched Firestore read of `tenants/{tid}/papers/{paperId}` docs
  - `buildCitationKey(meta, existingKeys)` — `authorSurname + year` format with collision suffix (smith2024, smith2024a, smith2024b, ...)
  - `extractSurname()` — handles "Last, First" / "First Last" / Vietnamese name order (Nguyen/Tran/Le/Pham heuristic)
  - `stripDiacritics()` — NFD normalize + đ→d for Vietnamese names
  - `fallbackCitationKey()` — `unknown<hash>` when paper metadata absent

### EDIT

- `src/lib/ai/tier4-writer/orchestrator.ts`:
  - Two-pass context block construction
  - Load metadata BEFORE generation
  - `extractCitations` does direct key lookup (no fuzzy match)

### Known limitation

Papers without `authors`/`year` metadata still use fallback hash. R176+ paper metadata backfill (DOI lookup + LLM extraction from first-page text) addresses this.

---

## R174 — UX polish + T4 routing + Gemini stability (May 16, 2026)

**Commit**: `fd304fd`

Major UX overhaul + fix Gemini 3 series breakage. 8 atomic hotfixes in single commit.

### R174-1 — Gemini stability rollback

`capabilities.ts`: T0+T1+T2 models `gemini-3.1-flash-lite-preview` / `gemini-3-flash-preview` → `gemini-2.5-flash`.

Reason: Gemini 3 series requires `thought_signature` field in multi-turn function calls. SDK `@google/generative-ai` 2026-05 release doesn't yet expose signature pass-through. Until SDK stable, fall back to 2.5-flash (no signature required, identical tool-calling semantics).

Defer Gemini 3 re-adoption to R175+ when SDK signature handling lands.

### R174-2 — Tier badge realtime update

`ChatStreamEventV2.message_start` now carries `tier` field. `chat/route.ts` emits tier at message_start. `useChatStream` sets tier on pending assistant message immediately. Badge appears live, no F5 reload needed.

### R174-3 — Thinking indicator (Gemini-style)

NEW `src/features/ai/components/thinking-indicator.tsx` (3 animated dots).

MessageList renders ThinkingIndicator in place of empty assistant bubble while `isStreaming`.

i18n: `ai.thinking` ('Thinking...' / 'Đang suy nghĩ...').

### R174-4 — Widen chat container

`ChatShell`: `max-w-3xl` → `max-w-5xl`, `h-[calc(100vh-7rem)]` → `h-[calc(100vh-4rem)]`. Better use of wide-screen real estate.

### R174-5 — Gemini functionResponse role split (P0 fix)

`gemini.ts` `toGeminiHistory()`: previously placed `functionResponse` parts on role='user', which Gemini 2.5-flash rejects with `[400] Content with role user cannot contain functionResponse part`.

Fix: split message into multiple history entries — text+functionCall on role='model', functionResponse on role='function'. Restores T1 tool calling.

### R174-6 — T4 Writer keyword override (workaround)

Gemini 2.5-flash classifier with few-shot prompt cannot reliably emit tier=4 for "Draft methods section" queries. Default to T2.

Workaround: pre-classifier regex check; if message matches strong drafting keywords (draft|write|compose|viết|soạn + methods|results|discussion|introduction|phần phương pháp|kết quả|thảo luận|giới thiệu), force tier=4 + feature=paper_writing, bypass classifier.

Reliable trigger for T4 Writer flow.

### R174-7 — Classifier prompt + tier expansion

Updated `CLASSIFIER_SYSTEM` to include Tier 4 (Writer) section with 4 example queries. JSON spec tier union `1|2|3` → `1|2|3|4`.

`normalizeTier` accepts tier=4. Confidence threshold maxTokens 100 → 256 (previous truncated JSON output of Gemini 2.5-flash). FALLBACK_TIER = 2 (Sonnet) when parse fail or low confidence.

### R174-8 — Writer prompt strict no-questions

`tier4-writer/prompts.ts`: `BASE_WRITER_PROMPT` added rules:
- DO NOT ask for clarification or additional info.
- Use placeholder values (X g, Y mL) when info missing.
- DO NOT end with follow-up questions or 'Bạn có muốn...' prompts.
- DO NOT include parameter-asking section at end.

### R174-9 — Tier label consistency

`messages/{en,vi}.json`: tier labels updated:
- `tierWriter`: 'Writer' → 'T4 Writer'
- `tierAuditor`: 'Auditor' / 'Kiểm duyệt' → 'T5 Auditor' / 'T5 Kiểm duyệt'

Matches T1 Flash / T2 Sonnet / T3 Opus naming pattern.

---

## R173-hotfix4 — Vercel build fix (May 16, 2026)

**Commit**: `9fda56c`

Vercel build failed with `Cannot find module 'firebase-functions/v2'`. Root cause: TS tried to type-check `functions/` directory which has its own `package.json` with `firebase-functions` dep not in root `node_modules`.

Fix: Added `"functions"` to root `tsconfig.json` exclude array.

---

## R173-4 + R173-5 — T4 Writer + T5 Auditor orchestrators (May 16, 2026)

**Commit**: `5da428c`

Completes 6-tier AI architecture. T4/T5 now wired with actual route handlers, not just config stubs.

### R173-4 — T4 Writer (paper section drafting)

NEW `src/lib/ai/tier4-writer/`:
- `types.ts` — `WriterResult`, `SectionType` ('methods' | 'results' | 'discussion' | 'introduction'), `WriterCitation`
- `prompts.ts` — Section-specific system prompts:
  - Methods: past-tense passive, materials/procedure/characterization sections
  - Results: observations BEFORE interpretation, no causal claims
  - Discussion: present tense + mechanism explanation + literature comparison
  - Introduction: funnel context → gap → contribution
- `orchestrator.ts` — `runWriter()`:
  - Detect section type (methods/results/discussion/introduction) via heuristic
  - RAG search top-8 papers via `searchPapers`
  - Stream draft with Sonnet 4.6 (reasoning-balanced capability)
  - Extract inline citations `[citationKey]`
  - Output: `{ draft, section, citations, totalCost, sourceCount }`

WIRED `src/app/api/chat/route.ts`:
- `if (tier === 4)` → `runWriter()` branch
- Stream events: `rag_search_complete`, `writer_complete`
- Cost telemetry via existing `recordCost` flow

### R173-5 — T5 Auditor (peer-review audit endpoint)

NEW `src/lib/ai/tier5-auditor/`:
- `types.ts` — `AuditFinding`, `Verdict` ('supported' | 'partially_supported' | 'unsupported' | 'contradicted'), `ClaimType` ('numerical' | 'citation' | 'mechanism' | 'definition')
- `claim-extractor.ts` — Heuristic claim extraction:
  - Numerical pattern: value + units (e.g., "2.6 eV", "150 mA/cm²")
  - Citation pattern: `[keyYear]` regex
  - Mechanism hints: "due to", "caused by", "do", "bởi vì" (EN+VI)
  - Definition hints: "is defined as", "là", "được định nghĩa"
  - Max 15 claims per run
- `audit-prompts.ts` — Opus 4.7 evaluator system prompt (strict JSON output)
- `orchestrator.ts` — `runAuditor()`:
  - Extract claims (numerical/citation/mechanism/definition)
  - Build evidence block from RAG chunks
  - Single Opus 4.7 batch evaluation
  - Parse JSON findings + compute weighted overall confidence
  - Verdict weights: supported=1.0, partial=0.6, unsupported=0.3, contradicted=0.0
  - Save `tenants/{tid}/aiAudits/{auditId}`

NEW endpoint: `POST /api/messages/[id]/audit` (explicit trigger):
- Auth: Bearer token + tenantId claim
- Loads message + aiProvenance for RAG chunks
- Cost Guard pre-check (Tier 5 daily Opus quota)
- Returns AuditResult JSON

Auto-trigger after T3 deferred — need Lab BKU baseline data first.

### Type updates

- `src/types/ai.ts`:
  - `AiMessage.tier` expanded `1|2|3` → `1|2|3|4|5`
  - `ChatStreamEventV2` union: + `rag_search_complete` + `writer_complete`
- `src/features/ai/components/message-bubble.tsx`:
  - `TierBadge` prop expanded `1|2|3` → `1|2|3|4|5`
  - `TIER_COLORS` + `TIER_LABELS` expanded to 5 entries
  - Tier 4: orange (writer), Tier 5: red (auditor)
- `messages/{en,vi}.json`:
  - `ai.tierWriter`, `ai.tierAuditor`

---

## R171 + R172 — Cloud Functions cron + Superadmin dashboard (May 16, 2026)

**Commit**: `a91a9c2`

### R171 — Firebase Functions cron infrastructure (7 sub-rounds)

#### R171-0 — Setup functions/ directory + IAM

NEW `functions/` with TypeScript template, region `asia-southeast1`. `setGlobalOptions` memory 512MiB, timeout 540s (9 min Gen 2 max).

`scripts/setup/r171-functions-iam.sh`:
- cron-runner service account
- 4 IAM roles: `datastore.user`, `storage.objectAdmin`, `logging.logWriter`, `monitoring.metricWriter`
- Compute SA impersonation for Functions Gen 2 runtime
- 5 GCP APIs enabled (Functions, Scheduler, Build, Run, Pub/Sub)

Secret Manager: `ANTHROPIC_API_KEY`, `ANTHROPIC_ADMIN_KEY`, `GCP_BILLING_ACCOUNT_ID` (= `01545E-FF945F-4AF504`).

`roles/billing.viewer` granted at billing account level. `cloudbilling.googleapis.com` enabled.

#### R171-1 — Tenant.tier setup

NEW `scripts/set-tenant-tier.mjs`. Lab BKU `tenant-dev-001` set to `'enterprise'` (no Cost Guard quota block).

#### R171-2 — Founder CLI cost-query

NEW `scripts/cost-query.mjs` (--tier/feature/capability breakdowns + CSV export).

#### R171-3 — Daily cost backup function (LIVE asia-southeast1)

NEW `functions/src/scheduled/backup-costs.ts`. Cron `0 2 * * *` (02:00 UTC daily). Exports `tenants/{tid}/_costs/{date}` to `gs://labyra-app-dev.firebasestorage.app/_admin/cost-backups/{date}/{tenantId}.json`.

#### R171-4 — Cost Guard structured logging

EDIT `src/app/api/chat/route.ts`: `console.info` JSON `event: cost_guard_check` with tenantId, tier, feature, estimated, allowed, reason, daily/monthly current+limits. Visible in Vercel logs.

#### R171-5 — Weekly Ragas eval function (LIVE asia-southeast1)

NEW `functions/src/scheduled/ragas-eval.ts`. Cron `0 3 * * 0` (03:00 UTC Sunday). Samples 10 random conversations from past 7 days (tier ≥ 2). 11 metrics via Opus 4.7 evaluator:
- Core RAG (3): faithfulness, contextRelevance, answerRelevance
- Quality (5): conciseness, vietnameseFluency, technicalAccuracy, citationQuality, subscriptFormatting
- Safety (2): toxicity, piiLeakage
- Domain (1): materialsSciencePlausibility

Weighted overall score. Auto-flag if core RAG <0.5 OR safety >0.3. Cost cap $5/run. Output: `tenants/{tid}/_evals/{yyyy-Www}/conversations/{id}`.

#### R171-6 — Daily drift detection function (LIVE asia-southeast1)

NEW `functions/src/scheduled/cost-drift.ts`. Cron `30 2 * * *` (02:30 UTC daily). Reconciles `_costs/{D-2}` estimates with:
- Anthropic Usage API (cross-org via Admin Key)
- Google Billing (placeholder; BigQuery export R173-3+)

Per-tenant attribution via share ratio. Alert if |drift| > 20%.

### R172 — Superadmin dashboard (UI + API + RBAC)

#### R172-1 — Superadmin role infrastructure

NEW `scripts/set-superadmin.mjs` (promote by uid or `--email`).
NEW `src/lib/auth/superadmin-guard.ts` (server-side guard).
EDIT `src/hooks/use-nav.ts` (filter by `access.role`).

#### R172-2/3/4 — Superadmin API routes

- NEW `/api/superadmin/costs` (aggregate 30-day cost data)
- NEW `/api/superadmin/evals` (Ragas weekly summaries + flagged conversations)
- NEW `/api/superadmin/drift` (drift reports + alerts)

#### R172-5 — Dashboard pages

- NEW `/[locale]/dashboard/superadmin/layout.tsx` (client guard)
- NEW `/[locale]/dashboard/superadmin/costs/page.tsx` (KPI + timeseries + table)
- NEW `/[locale]/dashboard/superadmin/evals/page.tsx` (weekly + flagged)
- NEW `/[locale]/dashboard/superadmin/drift/page.tsx` (reports + alerts)

#### R172-6 — Chart components

- NEW `src/features/superadmin/components/cost-kpi-cards.tsx` (4 cards)
- NEW `src/features/superadmin/components/cost-timeseries.tsx` (stacked area by tier, recharts)

#### R172-7 — Nav config + i18n

- EDIT `src/config/nav-config.ts`: add Superadmin nav group (3 items)
- EDIT `messages/{en,vi}.json`: flat keys `nav.superadminCosts/Evals/Drift` (avoid next-intl path conflict)
- EDIT `src/hooks/use-breadcrumbs.tsx`: routeMapping for `/superadmin/*`

### Hotfixes during R172 dev

- `getAuth()` → `getAdminAuthService()` (admin SDK default app not exist in dev)
- Same fix for `/api/conversations/[id]/cost/route.ts`
- i18n nested → flat (next-intl `INSUFFICIENT_PATH` conflict)
- Breadcrumb parent link unique (React duplicate keys warning)
- Icon `activity` → `alertCircle` (not in Icons type)

Lab BKU tenant promoted `nvhn.7202@gmail.com` → `role: 'superadmin'`.

---

## R170 — Cost Guard v2 + per-feature telemetry + dry-run mode (May 16, 2026)

**Commit**: `c1aff61`

### Cost Guard v2 (4-gate pre-check)

NEW `src/lib/ai/governance/cost-guard.ts`. Before every LLM call:

1. **Per-call estimate cap** (USD) — block if single call > threshold
2. **Daily cap per tenant** — accumulated cost today < limit
3. **Monthly cap per tenant** — accumulated cost this month < limit
4. **Feature-specific quota** — per `tenant.tier` (free/pro/enterprise) × feature

Limits encoded in `src/lib/ai/governance/limits.ts` per tenant tier.

### Cost estimator

NEW `src/lib/ai/cost/estimator.ts`. Predicts cost (USD) before LLM call based on:
- Tier → Capability → Model
- Input token estimate (message length + system prompt + tools + context)
- Output token estimate (max_tokens cap)
- Pricing from `CAPABILITY_MAP`

Used by Cost Guard pre-check + dry-run mode.

### Dry-run mode

EDIT `src/app/api/chat/route.ts`: query param `?dry_run=1` returns:
- `intentDecision` (tier, feature, reason, confidence)
- `capability` (from `getCapabilityForTier`)
- `estimatedCostUsd`
- Without calling LLM

Useful for testing routing logic + cost estimation.

### Per-feature telemetry

`recordCost()` extended to break down by `feature` (lab_ops / theory / spectrum_analysis / paper_writing / audit). Aggregated in `tenants/{tid}/_costs/{date}.byFeature.{feature}`.

ADR-020 documents cost control architecture.

---

## R169 — 6-tier capability abstraction + cost telemetry (May 16, 2026)

**Commit**: `ea20db8`

### Capability abstraction (single source of truth)

NEW `src/lib/ai/config/capabilities.ts`:

```ts
export type Capability =
  | 'security-router'      // Tier 0
  | 'tool-calling-cheap'   // Tier 1
  | 'rag-balanced'         // Tier 2
  | 'reasoning-balanced'   // Tier 3, Tier 4
  | 'reasoning-frontier'   // Tier 5
  | 'embedding' | 'rerank' | 'ocr';
```

`CAPABILITY_MAP`: Capability → `{ provider, model, inputCost, outputCost, cacheReadCost, maxTokens, contextWindow, tokenizerInflation, notes }`.

`TIER_CAPABILITY`: AiTier → Capability mapping.

`TIER_CONFIG` (in `src/lib/ai/providers/index.ts`) auto-derives from `CAPABILITY_MAP` via `buildTierConfig()`. Edit one place to swap model.

### AiTier expansion

`src/types/ai.ts`:
```ts
export type AiTier = 0 | 1 | 2 | 3 | 4 | 5; // was 0|1|2|3
```

### Cost telemetry

NEW `src/lib/ai/cost/telemetry.ts`: `recordCost({ tenantId, tier, capability, feature, costUsd, inputTokens, outputTokens, latencyMs, grounding })`.

Aggregated in `tenants/{tid}/_costs/{date}` with breakdowns by tier, feature, capability. Latency + token + grounding warning counts.

### Latency + provenance enrichment

`writeProvenance()` extended to capture per-call latency, embedding model, rerank scores, grounding stats. Cost telemetry pairs with provenance for cost-quality analysis.

ADR-019 documents 6-tier capability architecture.

---

## R168-3.13 — AI architecture refresh + economics skill (May 16, 2026)

**Commits**: `ddb83dd`, `f9481ff`

### AI architecture v3.0

Replaced outdated `docs/ai/AI_ARCHITECTURE.md` v2.x (~2046 LOC of pre-R168 state) with v3.0 (303 LOC). Focused on 6-tier production with capability abstraction.

### Economics skill

NEW `.claude/skills/labyra-economics/SKILL.md`:
- Pricing reference for all model providers
- Unit economics rules (cost per query target by tenant tier)
- Cost-quality trade-off heuristics
- Profitability scenarios

`.claude/skills/labyra-economics/` + `.claude/skills/database-architecture/` + `.claude/skills/ui-ux-standards/` versioned in `.claude/`.

### Repo tracking

R168-3.13c chore: whitelisted `.claude/skills/` in `.gitignore` exception list — skills now tracked in repo, available across all sessions.

---

## (Pre-R168 entries kept below — historical)

<!-- INSERT EXISTING CHANGELOG ENTRIES BELOW THIS LINE -->
<!-- (Manual: append existing changelog content here from R167 backward) -->
