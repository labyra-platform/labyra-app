# AGENTS.md

> **First file an AI agent should read when joining this project.**
> Points to other docs in the correct order.

## What is Labyra

AI-native lab management SaaS for materials science research. Next.js 16 + TypeScript strict + Firebase + multi-tenant from day one.

## Required reading (in order)

1. **`AGENTS.md`** — this file (you're here)
2. **`.claude/snapshot.md`** — current codebase state (gitignored, regenerate with `pnpm snapshot`)
3. **`CLAUDE.md`** — coding rules (non-negotiable)
4. **`ROADMAP.md`** — phases, progress, what's next
5. **`docs/ai/AI_ARCHITECTURE.md`** — AI layer design (inherited from labbook-bku, port plan)
6. **`docs/handoff.md`** — last session state, open decisions
7. **`docs/ARCHITECTURE.md`** — system overview *(planned: R160-meta-2)*
8. **`docs/WORKFLOW.md`** — dev process *(planned: R160-meta-2)*

## How this project is built

- **Patches as Python scripts** delivered to `/mnt/d/labbook-patches/`, run by the user on Ubuntu.
- **Idempotent + fail-fast**: every script verifies preconditions, skips already-applied changes, fails on missing anchors.
- **Conventional Commits** with `[R###-phase-X]` tags. Max 400 LOC diff per commit.
- **`pnpm dev`**, **`pnpm build`** for verify cycle.

## Communication style

- Respond in **Vietnamese** for conversation, **English** for code/identifiers.
- Be **concise**. No filler, no preamble.
- When information is missing, ask for paste rather than guess.
- Surface trade-offs and recommend, don't just list options.

## Bootstrap command

When starting a new session:

```bash
cd ~/LAB-MANAGER/labyra-app
pnpm snapshot       # regenerate .claude/snapshot.md
cat .claude/snapshot.md   # → paste to agent
```

## Project state at a glance

Check `.claude/snapshot.md` for:
- Phase progress (X/Y checkpoints done)
- HEAD commit + working tree state
- Recent commits + files changed
- Codebase file tree
- Anti-pattern reminders
