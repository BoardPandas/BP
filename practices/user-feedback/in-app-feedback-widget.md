---
concern: user-feedback
tech: [nextjs, react, typescript, shadcn, zod, github, s3, tailwind]
priority: recommended
source-repo: vigilis
applies-to: [nextjs, react]
---
# Portable In-App Feedback Widget (Button to GitHub Issue)

## PATTERN

Ship a "Send feedback" button in every authenticated app. Users pick a category and severity, write a message, optionally attach or paste a screenshot, and submit. The server opens a labeled GitHub issue in a private triage repo, enriched with page context, user identity, and silently captured browser diagnostics (recent console errors, failed network requests, click/navigation breadcrumbs, session-replay links, runtime health).

This is not a description to reimplement from scratch: a **complete code template** lives in this repo at [`templates/feedback-widget/`](../../templates/feedback-widget/HANDOFF.md), usable in two modes:

- **Faithful install** (`HANDOFF.md`): checklist for stacks matching the reference (Next.js App Router + shadcn); architecture, file map, install commands, GitHub setup, env vars, security notes, gotchas, verification checklist. `files/` holds 17 generalized source files with every app-specific integration point marked `ADAPT`.
- **Adaptive install** (`SPEC.md`): design spec for everything else; separates the invariants (security model, resilience, UX floors that must always hold) from the degrees of freedom (UI surface, form/API shape, categories, triage destination, storage) and defines a survey-plan-implement procedure so Claude designs the integration to fit each codebase's existing conventions.

Four adoption tiers so small projects can take less:
1. **Core**: button + dialog + `/api/feedback` route that opens the GitHub issue (needs only a fine-grained PAT and a private repo).
2. **Screenshots**: presigned upload to S3-compatible storage, then committed into the triage repo via the Contents API.
3. **Diagnostics**: patched console/fetch/history ring buffers with client-side PII redaction, attached to the issue as a committed JSON artifact plus a summarized section in the body.
4. **Slack**: post each submission to one team channel via an incoming webhook, as a Block Kit message linking the GitHub issue (user-supplied text escaped against mrkdwn injection; best-effort, so a webhook outage never blocks the submission).

## WHY

- Feedback that arrives as a labeled GitHub issue with page URL, user, viewport, console errors, and failed requests is actionable without a follow-up conversation; free-form email/Slack feedback is not.
- Building this per-repo from scratch takes days and re-discovers the same traps (private-repo image hosting, PAT-vs-cookie attachment APIs, self-capturing fetch patches). The template encodes the working solution once.
- The tiered design means even a weekend project gets Tier 1 in under an hour, while a production SaaS takes all four (Slack is the tier teams that live in chat reach for first).
- Fail-closed auth stubs (501 API / hidden buttons until wired) prevent a half-finished install from silently accepting anonymous submissions.

## EXAMPLE

Canonical template in this repo: `templates/feedback-widget/` (HANDOFF.md + `files/`). Raw fetch base:
`https://raw.githubusercontent.com/BoardPandas/BP/main/templates/feedback-widget/HANDOFF.md`

Live reference implementation: Vigilis repo, `src/components/feedback/`, `src/lib/feedback/`, `src/app/api/feedback/` (extracted 2026-07-06).

Copy-paste prompts for a target repo live in the intro of [`templates/feedback-widget/HANDOFF.md`](../../templates/feedback-widget/HANDOFF.md) (single source of truth so they don't drift): **Prompt A** for a faithful install on a matching stack, **Prompt B** for an adaptive install where Claude surveys the repo and designs the integration per `SPEC.md`. Both are local-first (`C:\Github\BP`) with raw-fetch fallback; BP is public so the fetch needs no auth.

## CHECK

How to verify if a repo already follows this:
- [ ] An authenticated user sees a Feedback button in the app shell/header
- [ ] Submitting opens a labeled issue in a private triage repo (labels: `feedback`, `severity:*`, category, `surface:*`)
- [ ] The feedback API route requires auth and rate-limits (about 1 submission / 30s / user)
- [ ] Screenshot keys are ownership-checked (`feedback/{userId}/` prefix) before use
- [ ] Diagnostics (if present) pass through redaction before leaving the browser

## IMPLEMENT

1. Copy `templates/feedback-widget/` from this repo (or fetch via raw URLs) into the target repo.
2. Follow `HANDOFF.md` top to bottom: file map (section 4), packages and shadcn components (5), the 12-item ADAPT seam checklist (6), GitHub PAT + label setup (7), env vars (8), mounting (9).
3. Implement the two required seams first: `requireUser()` in `server-adapter.ts` and `useFeedbackUser()` in `feedback-auth.ts`; both fail closed until done.
4. Run the verification checklist in HANDOFF.md section 12.

## NOTES

- The triage repo must be **private**: issue bodies contain user emails and IDs.
- Private-repo images never render inline in GitHub issues; the template commits screenshots via the Contents API and links blob URLs. Do not "simplify" to `download_url` (its token 404s within minutes).
- The in-memory rate limiter in the adapter is per-process; swap for Redis behind a load balancer.
- If the Vigilis implementation evolves, re-extract: the template header notes the source paths.
