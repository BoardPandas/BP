---
concern: deployment
tech: [doppler]
priority: recommended
source-repo: bp-website
applies-to: [node, typescript, docker]
---
# Doppler as Single Source of Truth for Secrets

## PATTERN
Use Doppler as the centralized secrets manager across all environments. Each project has three configs: `dev`, `stg`, and `prd`. Local development uses `doppler run` to inject secrets, with `.env.local` as offline fallback only. Production secrets sync to hosting providers (Cloudflare, Railway) via Doppler integrations or CLI.

## WHY
Scattered `.env` files across developer machines and hosting dashboards lead to drift, accidental commits, and "works on my machine" failures. Doppler provides a single source of truth with audit logging, environment separation, and automatic sync to deployment targets.

## EXAMPLE
From bp-website (`CLAUDE.md`):
```markdown
## Environment Variables

**Doppler is the single source of truth for all secrets.**
Project: `bp-website`

**Doppler configs:**
- `dev` -- local development values
- `stg` -- staging/preview values
- `prd` -- production values (synced to Cloudflare Workers)

**Local development:** Use `doppler run` to inject secrets,
or fall back to `.env.local` for offline work.
```

Usage:
```bash
# Local dev with Doppler injection
doppler run -- npm run dev

# Sync to Cloudflare Workers
doppler secrets --json --project bp-website --config prd \
  | jq -c 'with_entries(.value = .value.computed)' \
  | wrangler secret bulk

# Sync to Railway (native Doppler integration: continuous sync, no code)
```

## CHECK
How to verify if a repo already follows this:
- [ ] Doppler project exists for this repo
- [ ] CLAUDE.md documents all environment variables and their Doppler project/config
- [ ] `.env.local` is in `.gitignore`
- [ ] No hardcoded secrets in source code
- [ ] Production deployment pipeline pulls from Doppler

## IMPLEMENT
1. Create Doppler project with `dev`, `stg`, `prd` configs
2. Add all environment variables to each config
3. Document variables in CLAUDE.md with their purpose and type (secret vs public)
4. Update dev scripts to use `doppler run` prefix
5. Set up Doppler sync to hosting provider (Cloudflare via `wrangler secret bulk`, Railway via the native Doppler integration)
6. Remove any committed `.env` files and add to `.gitignore`

## NOTES
- Never commit `.env` files with real secrets
- `.env.local` is the offline fallback, not the primary source
- Public variables (NEXT_PUBLIC_*) can be in source but secrets must be in Doppler
- Doppler CLI: `doppler setup` to link a local directory to a project
