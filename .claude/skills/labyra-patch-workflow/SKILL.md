---
name: labyra-patch-workflow
description: |
  Use this skill at the start of every Labyra session AND before generating any
  patch script. Codifies session bootstrap (git sync check), patch file
  conventions, anchor verification, idempotency markers, and the recurring small
  bugs that have wasted time across rounds: bash heredoc + Python -c quoting
  conflicts, anchor-not-found from invisible whitespace, marker substring
  collisions, missing imports after function inserts, and Firebase auth race
  conditions. Read this before answering any "build me a patch" request and
  before writing any orchestrator/worker code change.
version: R181
---

# Labyra Patch Workflow

This skill captures hard-won conventions from R150–R181. Follow it for every
patch round to avoid regressions and re-debugging known issues.

## 1. Session bootstrap (mandatory)

Before any new work, verify both repos are in sync:

```bash
cd ~/LAB-MANAGER/labyra-app
git status -sb && git log --oneline origin/main..HEAD
cd ~/LAB-MANAGER/labyra-spectra-worker
git status -sb && git log --oneline origin/main..HEAD
```

If drift exists (uncommitted changes OR unpushed commits), surface it and
ask whether to commit/push before new work — never silently overwrite.

If user mentions any architectural decision, read relevant ADRs first:
`docs/adr/ADR-015` through latest. Current latest: ADR-027.

## 2. Patch script conventions

### Naming

`round-{N}-{short-description}.{py|sh}` placed in `/mnt/user-data/outputs/`
so user can run `python /mnt/d/labbook-patches/round-{N}-*.py` or
`bash /mnt/d/labbook-patches/round-{N}-*.sh`.

Hotfix naming: `round-{N}-hotfix{X}-{desc}.sh` — never bundle hotfix into
the original round file, always separate.

### Required structure (Python patch)

```python
#!/usr/bin/env python3
"""round-N-{slug}.py — Brief description.

Files changed:
  - path/to/file.ts                                    EXT|NEW
  - ...

Idempotent via @rN-applied marker. Backups: .bakN.

@phase RN
"""
SKIP_MARKER = "@r{N}-applied"  # MUST be unique — substring of older marker = collision
BAK_SUFFIX = ".bak{N}"
```

### Idempotency marker rules

**CRITICAL**: `_check_marker` typically does substring match. `@r178-3-applied`
substring-matches inside `@r179-2-applied` check. To prevent silent skip:

- Use full round identifier including hyphens: `@r179-2-applied`, not `@r179-applied`
- For hotfix: `@r{N}-hotfix{X}-applied`
- When checking, search for the EXACT current round marker
- If a file might receive multiple rounds of edits, check ONLY the current
  round's marker — not a prefix that could match older rounds

### Backup before edit

Always `cp file file.bak{N}` before in-place modification. User can restore.

## 3. Anchor verification (avoid "FATAL: anchor not found")

Before writing patch with `content.replace(old, new)`, **verify exact bytes**:

```bash
# Show exact bytes including whitespace
sed -n '95,105p' path/to/file.py | cat -A
```

Watch for:
- **Blank lines** between code blocks (your anchor must include them)
- **Trailing whitespace** on lines
- **Tabs vs spaces** mixed indentation
- **CRLF vs LF** line endings (Windows-imported files)
- **Smart quotes** vs ASCII quotes from copy-paste

If anchor has multiple occurrences, error out — patches must be unambiguous:

```python
if content.count(old) > 1:
    raise SystemExit(f"FATAL: anchor x{content.count(old)} — make more specific")
```

## 4. Bash heredoc + Python conflicts (NEVER do this)

### Anti-pattern

```bash
python3 -c "
from pathlib import Path
c = open('file.py').read()
if not c: print('!error')  # bash interprets !error → 'event not found'
"
```

Symptoms: `-bash: !user: event not found` × multiple, then `Anchor not found`.
Cause: bash `histexpand` parses `!` even inside double-quoted command.

### Correct pattern

Write to a tmp file, then execute it:

```bash
cat > /tmp/fix.py << 'PYEOF'
from pathlib import Path
p = Path('file.py')
c = p.read_text()
if not c:
    raise SystemExit('error')  # single-quoted heredoc — bash doesn't touch
PYEOF
python3 /tmp/fix.py
rm /tmp/fix.py
```

Key points:
- Heredoc delimiter MUST be quoted: `'PYEOF'` (single quotes prevent variable expansion)
- Avoid `python -c "..."` for any script with `!`, `$`, backticks, or quotes
- Use `python -c '...'` (single-quoted) only for trivial 1-liners with no specials

## 5. Recurring small bugs to pre-empt

### 5.1 Missing imports after function inserts

When a patch inserts a function that uses `upload_bytes()` or `blob_exists()`,
ALSO add the import line. Forgetting causes runtime `NameError: name 'X' is not defined`
that won't surface until paper is processed in production.

```python
# Always verify imports added when adding new function calls
old_imp = "from src.gcs_client import download_bytes"
new_imp = "from src.gcs_client import blob_exists, download_bytes, upload_bytes"
```

After patch, grep to confirm:
```bash
grep "from src.gcs_client import" path/to/file.py
```

### 5.2 Indent level inside try blocks

Python code inserted via `replace()` must match surrounding indent. R178-3 wasted
days because Step 1d was inserted at 4-space indent (function level) but should
have been at 8 spaces (inside `try:` block). Result: orphan code after
`STEP 2`, `SyntaxError` at runtime.

After any Python patch:
```bash
python3 -c "import py_compile; py_compile.compile('path/file.py', doraise=True)"
```

### 5.3 shadcn Button `size` variants

Only `'default' | 'sm' | 'lg' | 'icon'`. There is no `'icon-sm'` or `'xs'`.
For smaller icon buttons: `size='icon' className='size-7'` (not `size='icon-sm'`).

### 5.4 Firebase auth race

`getFirebaseAuth().currentUser` is `null` immediately after page load. Reading it
in component mount → `not_authenticated` error.

Pattern to wait for auth resolution:

```typescript
const auth = getFirebaseAuth();
let user = auth.currentUser;
if (!user) {
  user = await new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
}
if (!user) throw new Error('not_authenticated');
```

### 5.5 useEffect priority order

When multiple effects sync state ↔ URL, define explicit case ordering. R178-3
had 7 hotfixes because Case 3 (clear URL when state empty) fired before
Case 1 (load state from URL). Lesson: when effects conflict, the "load"
direction must always run before any "clear/sync" direction.

### 5.6 ResizeObserver feedback loop

When a child element re-renders based on container width, and the child changes
the scrollbar visibility, ResizeObserver fires again → infinite re-render.

Fixes (try in order):
1. CSS: `scrollbar-gutter: stable` on scroll container → width never fluctuates
2. Debounce: only update if `Math.abs(newWidth - prevWidth) > threshold`
3. Decouple: don't track container width during user-controlled state (e.g., zoom)

### 5.7 React Hooks rule violations

ALL `useMemo`/`useState`/`useEffect` must execute before any conditional return.
Audit hook order before shipping any component patch.

### 5.8 Next.js App Router boundaries

- `'server-only'` ONLY for firebase-admin and Node-only modules
- NEVER on edge runtime or shared client modules
- Pure business logic in separate files with no admin SDK import

### 5.9 Middleware filename

Labyra uses `src/proxy.ts` (default export `proxy`), NOT `middleware.ts`.
Both existing = build fail. Merge new logic into `proxy.ts`.

### 5.10 i18n key dots

`next-intl` keys CANNOT contain dots. Use nested objects:
```json
{ "papers": { "filter": { "label": "..." } } }  // OK
{ "papers.filter.label": "..." }                  // BREAKS
```

## 6. Post-patch verification

Run before claiming "done":

```bash
# Python worker
cd ~/LAB-MANAGER/labyra-spectra-worker
python3 -c "import py_compile; py_compile.compile('src/papers/orchestrator.py', doraise=True)"
python3 -c "import py_compile; py_compile.compile('src/papers/ocr.py', doraise=True)"

# Next.js app
cd ~/LAB-MANAGER/labyra-app
pnpm exec tsc --noEmit
```

Only ship if both return zero errors. Type errors caught locally are minutes;
caught in production after deploy is hours.

## 7. Worker deploy verification

After `bash deploy.sh`:
- Capture revision name from output (e.g., `spectra-worker-00069-f65`)
- Verify revision active: `gcloud run services describe spectra-worker --region=asia-southeast1 --format='value(status.latestReadyRevisionName)'`
- Confirm marker present in deployed code: `grep -E "@r{N}-applied" path/to/file.py` (on local source — local matches deployed since deploy.sh uploads local)

## 8. Cost guardrails

Each test that reprocesses a paper costs ~$0.03 OCR + $0.005 embedding.
For debug iterations:
1. Prefer local Python test (`python3 -c "..."` with mocked env vars) over reprocess
2. If reprocess needed, batch hypotheses — don't reprocess after each tweak
3. R181 OCR cache means second+ reprocess of same content is free — leverage it

## 9. Scientific documentation requirement

Every feature using algorithms / math / physics / chemistry MUST get a section
in `docs/scientific-methods/{topic}.md` with:
- Formula (LaTeX or plain math)
- Physics/chemistry meaning
- References (DOI if available)
- Parameters and edge cases
- Implementation file path

No exceptions for "obvious" methods — XRD/UV-Vis/FTIR/Raman are all documented;
new methods join the canon.

## 10. Patch file delivery

When generating a patch script, deliver it via `present_files` tool with the
output path `/mnt/user-data/outputs/round-{N}-{slug}.{ext}`. User downloads to
`/mnt/d/labbook-patches/` and runs from there.

NEVER deliver patch content inline in chat — user needs the file.

---

**Last updated**: R181 — added OCR cache import bug, ResizeObserver loop fix,
Firebase auth race pattern, bash heredoc quoting rule.
