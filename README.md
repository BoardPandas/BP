# BP -- Best Practices Knowledge Base

A machine-readable knowledge base of proven coding patterns, extracted from 30+ repositories. Designed for consumption by Claude Code via `/add-dir C:\Github\BP`.

## What This Is

Where [LL-G](../LL-G) tracks gotchas and anti-patterns (what NOT to do), BP tracks proven patterns (what TO do). Together they form a complete reference for writing better code.

## Structure

```
practices/
  claude-config/      # CLAUDE.md structure, rules, hooks, skills, agents
  testing/            # Vitest, Jest, Playwright, coverage patterns
  linting-formatting/ # Biome, ESLint, auto-format hooks
  error-handling/     # Structured logging, error context
  deployment/         # Docker, Cloudflare, Railway, Doppler
  monorepo/           # pnpm + Turborepo, workspaces
  versioning/         # Semver, changelog enforcement
  safety/             # Read-only-first, permissions gates, hooks
  documentation/      # Reference files, plans, investigations
  design-systems/     # OKLCH tokens, guardrails, iframe isolation
  environment/        # Doppler + .env.local, secrets
  knowledge-bases/    # YAML frontmatter, two-level indexes
```

Each concern directory contains an `llms.txt` index and individual `.md` entry files.

## Usage

From any Claude Code session:
```
/add-dir C:\Github\BP
```

Then follow the RULE 3 protocol in `CLAUDE.md`.

## Skills

- `/add-practice` -- Add a new best practice entry
- `/audit-repo` -- Audit a repo against applicable practices
- `/apply-practice` -- Apply a specific practice to a repo

## Priority Levels

- **FOUNDATIONAL** -- Every repo should follow these
- **RECOMMENDED** -- Strong patterns for matching tech stacks
- **OPTIONAL** -- Nice-to-have improvements
