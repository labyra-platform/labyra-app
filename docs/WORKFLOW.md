# WORKFLOW.md — Labyra Development Workflow

> How to develop, commit, deploy, and survive Labyra Platform.
> For architecture overview, see `ARCHITECTURE.md`. For coding rules, see `CLAUDE.md`.

**Last updated**: 2026-05-12

---

## 1. Local development setup

### 1.1 First-time setup

```bash
git clone git@github.com:labyra-platform/labyra-app.git
cd labyra-app
pnpm install                              # uses pnpm-workspace.yaml
cp env.example.txt .env.local             # template
# → edit .env.local with Firebase + (later) Anthropic creds
```

Firebase env vars are obtained from:
- Firebase Console → Project Settings → General → Your apps (`NEXT_PUBLIC_FIREBASE_*`)
- Firebase Console → Project Settings → Service accounts → Generate new private key (`FIREBASE_ADMIN_*`)

### 1.2 Daily start

```bash
cd ~/LAB-MANAGER/labyra-app
pnpm snapshot                             # refresh .claude/snapshot.md
cat .claude/snapshot.md                   # → paste to AI agent if needed
pnpm dev                                  # localhost:3000
```

### 1.3 Firebase emulator suite (optional)

For offline work or destructive testing without touching live data:

```bash
firebase emulators:start --only auth,firestore,database,storage
# UI: http://localhost:4000
# Auth: 9099, Firestore: 8080, RTDB: 9000, Storage: 9199
```

In `.env.local.emulator` (if using):
```
NEXT_PUBLIC_USE_EMULATOR=true
```

Then in `lib/firebase/client.ts`, conditionally call `connectAuthEmulator()` etc.
(Not implemented yet — add when needed.)

---

## 2. Patch workflow (AI-agent collaboration)

This project uses **Python idempotent patch scripts** delivered via shared filesystem,
then executed locally by the user.

### 2.1 Why this pattern

- AI agent can't directly edit user's files
- Python scripts are platform-agnostic
- Idempotent + fail-fast catches drift between agent's mental model and reality
- Audit trail: every change has a named script

### 2.2 Patch lifecycle

```
1. AI agent writes script: /home/claude/r160-phase-N.py
2. Saved to user-data/outputs and presented
3. User downloads to: /mnt/d/labbook-patches/r160-phase-N.py
4. User runs:           python3 /mnt/d/labbook-patches/r160-phase-N.py
5. Script reports: OK / SKIP / FAIL per change
6. User verifies:       pnpm build, manual smoke test
7. User commits:        git commit -m "feat(...) [R160-phase-N]"
```

### 2.3 Script conventions

All patch scripts must:

- **Preflight**: verify `package.json` name is `labyra-app`, key files exist
- **Idempotent**: detect "already applied" state via fingerprint, skip with message
- **Fail-fast**: missing anchor → `sys.exit(1)` with reason
- **Atomic per file**: write completed text in one `path.write_text()` call
- **Anchor-based edits**: regex or substring match for surgical updates
- **Skip on existence**: don't overwrite user-edited files (or backup first)
- **Postflight**: print verify + commit commands

Example skeleton:

```python
def preflight() -> None:
    if not (ROOT / "package.json").exists():
        fail("not in labyra-app root")
    pkg = json.loads((ROOT / "package.json").read_text())
    if pkg.get("name") != "labyra-app":
        fail(f"wrong project: {pkg.get('name')!r}")
    ok("preflight passed")

def patch_thing() -> None:
    path = ROOT / "src/thing.ts"
    text = path.read_text()
    if "FINGERPRINT" in text:
        skip("already patched")
        return
    # ... edit ...
    path.write_text(new_text)
    ok("patched")
```

### 2.4 Hotfix scripts

Naming convention: `r160-phase-N-hotfix.py` (singular) for bug fix on top of `r160-phase-N.py`.
Idempotent — running twice is safe. Always read existing file first to detect prior state.

---

## 3. Commit conventions

### 3.1 Format

```
<type>(<scope>): <summary> [R###-phase-X]

<body — optional, lists what changed and why>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`.

### 3.2 Examples

```
feat(auth): claims hooks + debug page + refresh helper [R160-dashboard-3]

- useTenantId/useRole/useIsAdmin/useIsSuperAdmin/useIsAuthenticated hooks
- refreshAuthClaims() force token refresh
- /dashboard/debug-auth dev tool to inspect claims
```

```
chore(meta): context snapshot generator + AGENTS.md [R160-meta-1]
```

```
fix(i18n): trust next-intl redirects, strict locale match [R160-i18n-3e]
```

### 3.3 Limits

- **Max 400 LOC diff** per commit (CLAUDE.md rule)
- **One concern per commit** (no mixing refactor + feature)
- **Conventional Commits** enforced via commitlint (when configured)

### 3.4 Branching

- `main` — protected, deployable
- `feat/<short-name>` — for >1 commit features
- `fix/<short-name>` — for non-trivial bug fixes
- `refactor/<short-name>` — code organization

Small changes (single commit) go direct to `main`.

---

## 4. Testing

### 4.1 Coverage targets (CLAUDE.md)

```
Unit tests:   > 80% business logic (hooks, utils, stores)
Integration:  > 60% API routes
E2E:          Critical paths (login, create experiment, AI query)
```

### 4.2 Vitest (unit, when implemented)

```bash
pnpm test                                 # watch mode
pnpm test --run                           # single run
pnpm test:coverage                        # with coverage report
```

### 4.3 Playwright (E2E, Phase 6)

```bash
pnpm test:e2e                             # all
pnpm test:e2e --ui                        # UI mode for debugging
```

---

## 5. Deployment

### 5.1 Vercel (frontend)

Auto-deploy on push to `main`. Preview URL per PR.

Env vars set in Vercel dashboard:
- All `NEXT_PUBLIC_*` from `.env.local`
- All `FIREBASE_ADMIN_*`
- (Phase 5) `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`

### 5.2 Firebase

```bash
firebase use dev                          # select project alias

# Rules only (safe, no functions changed)
firebase deploy --only firestore:rules

# Indexes (after schema change)
firebase deploy --only firestore:indexes

# Functions (Phase 5+)
firebase deploy --only functions
firebase deploy --only functions:claudeProxy   # single function
```

### 5.3 Multi-project workflow

```bash
firebase use dev                          # labyra-app-dev
firebase use prod                         # labyra-app-prod (Phase E)
firebase projects:list                    # all projects
```

---

## 6. Troubleshooting playbook

### 6.1 Turbopack cache corruption

Symptoms: `Persisting failed: Unable to write SST file`, build hangs, dev server 404s.

Cause: multiple `next dev` processes or `rm -rf .next` while server running.

```bash
pkill -9 -f "next dev"
sleep 2
rm -rf .next .turbo node_modules/.cache
pnpm dev
```

### 6.2 Workspace root warning

Symptoms: `We detected multiple lockfiles and selected ... as root directory`.

Cause: stray `package-lock.json` in parent directory.

```bash
ls ~/LAB-MANAGER/package-lock.json
rm ~/LAB-MANAGER/package-lock.json        # if exists and not used
```

### 6.3 Firebase Admin: "Invalid PEM formatted message"

Symptoms: seed script fails parsing `FIREBASE_ADMIN_PRIVATE_KEY`.

Cause: multi-line key in `.env.local` not parsed by line-by-line reader.

Fix: use Node 22+ `--env-file=.env.local` flag (already in `pnpm seed` script).
Backup: `set -a; source .env.local; set +a` then run node manually.

### 6.4 Firestore: "5 NOT_FOUND"

Symptoms: gRPC error from Firestore on any operation.

Cause: Firestore database not yet created in Firebase Console.

Fix: Console → Build → Firestore Database → Create database (Production mode, asia-southeast1).

### 6.5 Firestore: "permission-denied"

Symptoms: client SDK reads return empty + console error.

Cause: rules deployed but user's ID token doesn't have `tenantId` claim yet.

Fix: sign out + sign in again to refresh token. Or use `refreshAuthClaims()` helper.

### 6.6 Middleware redirect loop

Symptoms: `localhost redirected you too many times`.

Cause: proxy.ts logic clobbering next-intl redirects, or strict locale extraction broken.

Fix: ensure `r160-i18n-3e-proxy-fix.py` has been applied (trust next-intl 3xx responses).

### 6.7 Build error: "Expected ','" in icons.tsx

Symptoms: TypeScript parser fails at icon imports.

Cause: missing trailing comma after last import in `@tabler/icons-react` block.

Fix: run `r160-shell-2-hotfix.py` to normalize trailing commas.

---

## 7. Dev vs production performance

Slow page renders in `pnpm dev` are **expected**, not a bug. Next.js dev mode
prioritizes developer ergonomics over runtime speed:

| Aspect | Dev (`pnpm dev`) | Prod (`pnpm build` + `pnpm start`) |
|---|---|---|
| Route compilation | On-demand per request | Pre-compiled at build time |
| First request | ~2-3s (cold compile) | ~50-200ms |
| Hot reload | Yes (HMR overhead) | No |
| Source maps | Full | Production-only (minimal) |
| Code splitting | Basic | Aggressive, tree-shaken |
| Minification | No | Yes |
| Server Components | Re-evaluated per request | Statically rendered where possible |

### When dev feels too slow

```bash
# Production build smoke test — verifies real-world speed
rm -rf .next
pnpm build
pnpm start                       # localhost:3000 in prod mode
```

A page that takes 3s in dev typically renders in ~200ms in prod. If prod is
**also** slow, the bottleneck is real (likely Firestore query latency, large
client bundle, or slow Server Component data fetch) — not Next.js dev overhead.

### Quick wins to make dev faster

1. **Limit concurrent dev processes**: only one `pnpm dev` per project. Multiple
   instances corrupt Turbopack cache (see Section 6.1).

2. **Skip Turbopack for stable parts**: if a feature is rarely edited, build it
   once with `pnpm build`, then run prod for that part. Not common — usually
   easier to live with dev speed.

3. **Use route prefetching**: `<Link prefetch>` (default for Next.js Link) warms
   adjacent routes during idle time, masking compile latency on navigation.

4. **Lazy-load heavy client components**: charts, 3D viewers, Plotly. Saves
   compile time AND runtime bundle size:
   ```typescript
   const HeavyChart = dynamic(() => import('./HeavyChart'), { ssr: false });
   ```

### Profile Firestore query latency separately

If prod is slow despite the above, the bottleneck is likely backend:

```
DevTools → Network → Filter "firestore" → reload page
→ Check "Time" column for each query
→ Slow query (>1s) → add index, denormalize, or use `getCountFromServer()`
```

See `docs/ARCHITECTURE.md` Section 4.4 for query patterns.

---

## 8. Session continuity protocol

### 7.1 Start of session

```bash
cd ~/LAB-MANAGER/labyra-app
git status                                # any uncommitted? stash or commit first
pnpm snapshot                             # refresh .claude/snapshot.md
cat .claude/snapshot.md                   # → paste into AI agent
```

### 7.2 During session

After every applied patch:
```bash
pnpm build                                # verify build
# manual smoke test in browser
git add <files>
git commit -m "<conventional> [R###-phase-X]"
```

### 7.3 End of session

```bash
pnpm snapshot                             # capture final state
# → update docs/handoff.md with summary (next phase, open questions)
git push                                  # if branch is ready
```

### 7.4 docs/handoff.md template

Keep it short. Sections:

```markdown
## Session: YYYY-MM-DD

### Completed
- R160-xxx — ...

### Decisions
- ...

### Open questions
- ...

### Next phase
R160-yyy — ...

### State
- HEAD: <commit-hash>
- Branch: main, clean working tree
- Build: passing
```

---

## 9. Migration playbooks

### 8.1 Adding a new domain page (e.g. /dashboard/calibrations)

1. Create stub: `src/app/[locale]/dashboard/calibrations/page.tsx`
2. Add nav item to `src/config/nav-config.ts` with `titleKey: 'nav.calibrations'`
3. Add i18n keys to `messages/{en,vi}.json`: `nav.calibrations`
4. Add Tabler icon import + mapping to `src/components/icons.tsx`
5. Build + verify route renders

### 8.2 Adding a new Firestore collection

1. Update `firestore.rules` if needed (default catch-all `/tenants/{tenantId}/{document=**}` covers)
2. Add types in `src/types/` or alongside hooks in `src/lib/firestore/queries/`
3. Create query hook: `useFooCollection()` based on `useTenantCollection`
4. (Optional) Update seed script if dev data needed
5. (Optional) Add composite index in `firestore.indexes.json` if querying with `where + orderBy`
6. Run `firebase deploy --only firestore:indexes` if indexes changed

### 8.3 Adding a new locale (e.g. ko)

1. Update `src/i18n/routing.ts`: add `'ko'` to `locales` array
2. Create `messages/ko.json` (copy `vi.json` as starting structure)
3. Add label to `nav-config.ts` LocaleSwitcher dropdown
4. Add `locale.korean` key to messages
5. Build + verify `/ko/dashboard/overview` renders

### 8.4 Cross-project Firebase (Phase E commercial)

For migrating prod / setting up cross-project token verify:

```typescript
// Verify token from labyra-app-dev tenant on labyra-app-prod backend
const decoded = await adminAuth.verifyIdToken(token, /* checkRevoked */ true);
// Must check `decoded.aud` matches expected project (audience check)
```

Recommend: separate Cloud Function for each project rather than cross-project IAM
(simpler, fewer IAM bindings to manage).

---

## 10. References

- `CLAUDE.md` — coding rules
- `ARCHITECTURE.md` — system overview
- `AI_ARCHITECTURE.md` — AI layer
- `ROADMAP.md` — phase plan
- `AGENTS.md` — agent bootstrap
