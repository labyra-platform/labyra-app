#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generate .claude/snapshot.md — codebase context for AI agents.
 *
 * Pulls from:
 *   - git log (recent commits)
 *   - git diff (files changed since previous snapshot)
 *   - ROADMAP.md (phase progress count)
 *   - src/ tree walk (file structure)
 *   - package.json (stack version)
 *
 * Output is gitignored. Run manually:  pnpm snapshot
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SNAPSHOT_DIR = join(ROOT, '.claude');
const SNAPSHOT_PATH = join(SNAPSHOT_DIR, 'snapshot.md');
const NL = '\n';

function git(cmd) {
  try {
    return execSync('git ' + cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function readFileSafe(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

// ─── Git context ───────────────────────────────────────────────
function gitContext() {
  const head = git('rev-parse --short HEAD') || 'unknown';
  const branch = git('rev-parse --abbrev-ref HEAD') || 'unknown';
  const isDirty = git('status --porcelain').length > 0;
  const recentCommits = git('log --oneline -5')
    .split(NL)
    .filter(Boolean)
    .map((line) => '  ' + line)
    .join(NL);

  // Files changed in HEAD (vs HEAD~1). Fall back to working tree diff.
  let diffOutput = git('diff --name-status HEAD~1 HEAD');
  if (!diffOutput) diffOutput = git('show --name-status --format= HEAD');
  const lastCommitFiles = diffOutput
    .split(NL)
    .filter((l) => l.trim().length > 0)
    .map((line) => '  ' + line)
    .join(NL);

  return { head, branch, isDirty, recentCommits, lastCommitFiles };
}

// ─── ROADMAP phase count ───────────────────────────────────────
function roadmapProgress() {
  const text = readFileSafe('ROADMAP.md');
  if (!text) return { done: 0, total: 0, pct: 0, currentPhase: 'unknown' };

  const lines = text.split(NL);
  let done = 0;
  let total = 0;
  let currentPhase = '';

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('- [x]')) { done++; total++; }
    else if (trimmed.startsWith('- [ ]')) { total++; }
    else if (trimmed.startsWith('### Phase') && trimmed.toLowerCase().includes('current')) {
      currentPhase = trimmed.replace(/^### /, '');
    }
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct, currentPhase: currentPhase || '(not marked)' };
}

// ─── File tree walk ────────────────────────────────────────────
const TRACKED_DIRS = [
  'src/app/[locale]',
  'src/lib/auth',
  'src/lib/firebase',
  'src/lib/firestore',
  'src/components/layout',
  'src/features',
  'src/config',
  'scripts',
  'messages'
];

const TRACKED_CONFIG = [
  'next.config.ts',
  'firestore.rules',
  'firebase.json',
  'firestore.indexes.json',
  'src/proxy.ts',
  'src/i18n/routing.ts'
];

function walkDir(dir, maxDepth = 3, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  const full = join(ROOT, dir);
  if (!existsSync(full)) return results;

  for (const name of readdirSync(full)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const rel = join(dir, name);
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) {
      results.push(...walkDir(rel, maxDepth, depth + 1));
    } else if (/\.(tsx?|mjs|json|rules)$/.test(name)) {
      results.push({ path: rel, size: stat.size });
    }
  }
  return results;
}

function fileTree() {
  const sections = [];

  for (const dir of TRACKED_DIRS) {
    const files = walkDir(dir);
    if (files.length === 0) continue;
    const lines = files
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => '  ' + f.path + '  (' + (f.size / 1024).toFixed(1) + 'KB)')
      .join(NL);
    sections.push('### ' + dir + '/' + NL + lines);
  }

  const configLines = TRACKED_CONFIG
    .filter((p) => existsSync(join(ROOT, p)))
    .map((p) => '  ' + p + '  (' + (statSync(join(ROOT, p)).size / 1024).toFixed(1) + 'KB)')
    .join(NL);
  if (configLines) sections.push('### config' + NL + configLines);

  return sections.join(NL + NL);
}

// ─── Stack versions ────────────────────────────────────────────
function stackVersions() {
  const pkg = JSON.parse(readFileSafe('package.json') || '{}');
  const deps = pkg.dependencies || {};
  const keys = [
    'next', 'react', 'firebase', 'firebase-admin',
    'next-intl', '@tanstack/react-query', 'tailwindcss', 'typescript'
  ];
  return keys
    .filter((k) => deps[k])
    .map((k) => '  ' + k + ': ' + deps[k])
    .join(NL);
}

// ─── Compose ───────────────────────────────────────────────────
function compose() {
  const g = gitContext();
  const r = roadmapProgress();
  const tree = fileTree();
  const stack = stackVersions();
  const FENCE = '```';

  return [
    '# Context Snapshot',
    '> Generated ' + nowIso() + ' — gitignored, regenerate with `pnpm snapshot`.',
    '> Read this first when starting a new agent session.',
    '',
    '## Project',
    '- **Name**: Labyra Platform',
    '- **Vision**: AI-native lab management SaaS for materials science research',
    '- **Stack**: Next.js 16 (App Router) + TypeScript strict + Firebase + multi-tenant',
    '- **Tenant model**: `/tenants/{tenantId}/...` sub-collection',
    '- **Deploy target**: Vercel (frontend) + Firebase (backend) + Cloud Run (Python, future)',
    '',
    '## Required reading (in order)',
    '1. **CLAUDE.md** — coding rules (non-negotiable)',
    '2. **ARCHITECTURE.md** — system overview *(TODO: R160-meta-2)*',
    '3. **AI_ARCHITECTURE.md** — AI layer detail (inherited from labbook-bku)',
    '4. **ROADMAP.md** — phases + progress',
    '5. **WORKFLOW.md** — dev process *(TODO: R160-meta-2)*',
    '6. **docs/handoff.md** — last session state',
    '7. **This file** — current snapshot',
    '',
    '## Progress',
    '- **Phase progress**: ' + r.done + '/' + r.total + ' checkpoints done (~' + r.pct + '%)',
    '- **Current phase**: ' + r.currentPhase,
    '',
    '## Git state',
    '- **HEAD**: ' + g.head,
    '- **Branch**: ' + g.branch,
    '- **Working tree**: ' + (g.isDirty ? '⚠ dirty (uncommitted changes)' : '✓ clean'),
    '',
    '### Recent commits',
    FENCE,
    g.recentCommits || '(no commits)',
    FENCE,
    '',
    '### Files changed in last commit',
    FENCE,
    g.lastCommitFiles || '(no diff)',
    FENCE,
    '',
    '## Stack versions',
    FENCE,
    stack,
    FENCE,
    '',
    '## Codebase structure (key paths)',
    '',
    tree,
    '',
    '## Conventions reminder',
    '- **Patches**: Python idempotent scripts → `/mnt/d/labbook-patches/` → user runs',
    '- **Commits**: Conventional Commits + `[R###-phase-X]` tag',
    '- **Diff limit**: 400 LOC per commit',
    '- **i18n**: `messages/{en,vi}.json` — `nav.*`, `dashboard.*`, `auth.*` namespaces',
    '- **Auth claims**: `tenantId` + `role` (admin/superadmin/member/viewer)',
    '- **Firestore**: scope under `/tenants/{tenantId}/...` (rules enforce)',
    '- **Icons**: Tabler (current); CLAUDE.md says Lucide (tech debt, deferred)',
    '- **Charts**: recharts (was Tremor, migrated R160-dashboard-1)',
    '',
    '## Anti-patterns to watch',
    '- Top-level Firestore collections with `tenantId` field → use sub-collection',
    '- `index` as React `key` prop → use stable id',
    '- Inline styles or hardcoded colors → CSS variables + Tailwind',
    '- `console.log` in production → use logger',
    '- `any` type / `@ts-nocheck` → `unknown` + type guard',
    '',
    '## Quick verification commands',
    FENCE + 'bash',
    'git status                       # working tree state',
    'rm -rf .next && pnpm build       # full build, ~30s',
    'pnpm dev                         # localhost:3000',
    FENCE,
    ''
  ].join(NL);
}

function main() {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const content = compose();
  writeFileSync(SNAPSHOT_PATH, content, 'utf-8');
  console.log('✓ Wrote ' + relative(ROOT, SNAPSHOT_PATH) + ' (' + content.length + ' bytes)');
}

main();
