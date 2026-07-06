# Feedback Widget: Portable Handoff Sheet

A drop-in, in-app "Send feedback" tool extracted from the Vigilis dashboard. Users click a Feedback button (page header or inside any modal), pick a category and severity, write a message, optionally attach or paste a screenshot, and submit. The server opens a labeled GitHub issue in a private triage repo, enriched with page context, user identity, and (optionally) silently captured browser diagnostics: recent console errors, failed network requests, click/navigation breadcrumbs, session-replay links, and runtime health.

**How to use this sheet:** in a Claude Code session inside the target repo, paste the canonical prompt below. It resolves the template local-first with a network fallback, so it works on any machine (BoardPandas/BP is public; raw fetch needs no auth).

```text
Install the in-app feedback widget from the BP repo template (BoardPandas/BP,
templates/feedback-widget/).

Get the template, local first with fetch as fallback:
1. If C:\Github\BP exists on this machine, use
   C:\Github\BP\templates\feedback-widget\ (read HANDOFF.md there).
2. Otherwise fetch
   https://raw.githubusercontent.com/BoardPandas/BP/main/templates/feedback-widget/HANDOFF.md
   then fetch each template file listed in its section 4 file map from
   https://raw.githubusercontent.com/BoardPandas/BP/main/templates/feedback-widget/<template file path>

Then follow HANDOFF.md top to bottom.
- Tier: [1 = button + GitHub issue | 2 = + screenshots | 3 = + browser diagnostics]
- Auth: [BetterAuth / NextAuth / Clerk / ... or "detect from codebase"]
- Storage (tier 2 only): [S3 / R2 / Railway buckets / none]
- Analytics: [PostHog / none, or "detect from codebase"]
- GitHub triage repo: [your-org/your-app-feedback]
```

Everything Claude needs is in this file plus the `files/` folder. Every app-specific seam is marked `ADAPT` in the code. The section 4 file map doubles as the fetch manifest: template paths there are relative to `templates/feedback-widget/`.

---

## 1. What you get

| Surface | Behavior |
|---|---|
| Header button | `FeedbackButton` opens the feedback dialog from anywhere in the app |
| In-modal button (optional) | `DialogFeedbackButton` renders inside every shadcn dialog; captures the modal title so the issue says where the user was |
| Dialog | Category + severity selects, 10-2000 char message with counter, optional screenshot (file picker or Ctrl+V paste), rate-limit-aware errors, success toast |
| Output | GitHub issue in a private repo with labels (`feedback`, `severity:*`, category, `surface:page|modal`), full context section, screenshot link, diagnostics summary, and a committed full-diagnostics JSON artifact |

## 2. Architecture

```
Browser                              Server (Next.js API routes)         GitHub
-------                              ---------------------------         ------
FeedbackTelemetryInit (tier 3)
  patches console/fetch/history
  into ring buffers on window

FeedbackButton / DialogFeedbackButton
  -> FeedbackDialog
       screenshot? -> POST /api/feedback/screenshot/presign  (tier 2)
                        -> presigned PUT to S3-compatible storage
       submit     -> POST /api/feedback
                        1. requireUser (auth seam)
                        2. rate limit (1 per 30s per user)
                        3. Zod validate
                        4. screenshot: fetch bytes from storage,
                           commit to repo via Contents API      -> feedback-attachments/<category>/...
                           (fallback: 7-day presigned URL)
                        5. diagnostics JSON committed to repo   -> feedback-attachments/diagnostics/...
                        6. create issue                          -> Issues API
                        7. log + analytics event
```

## 3. Adoption tiers

Install incrementally. Each tier works without the ones above it.

| Tier | What | Extra requirements |
|---|---|---|
| **1: Core** | Button + dialog + `/api/feedback` -> GitHub issue with page/user context | GitHub PAT + private repo |
| **2: Screenshots** | Attach/paste image, presigned upload, committed into the repo | S3-compatible object storage |
| **3: Diagnostics** | Silent console/network/breadcrumb capture, React-crash record, diagnostics JSON artifact | None (optional analytics SDK for replay links) |

Tier 2 and 3 code paths are marked `TIER 2` / `TIER 3` in the files; the sheet notes what to delete if you skip them. If unsure, install all three: tier 3 is what makes bug reports actionable without a follow-up conversation.

## 4. File map

Copy each template file to its destination (the destination is also in the header comment of every file).

| Template file | Destination | Tier |
|---|---|---|
| `files/lib/validations-feedback.ts` | `src/lib/validations/feedback.ts` | 1 |
| `files/lib/github-issue.ts` | `src/lib/feedback/github-issue.ts` | 1 |
| `files/lib/github-attachment.ts` | `src/lib/feedback/github-attachment.ts` | 2/3 |
| `files/server/server-adapter.ts` | `src/lib/feedback/server-adapter.ts` | 1 |
| `files/server/storage.ts` | `src/lib/feedback/storage.ts` | 2 |
| `files/api/feedback-route.ts` | `src/app/api/feedback/route.ts` | 1 |
| `files/api/screenshot-presign-route.ts` | `src/app/api/feedback/screenshot/presign/route.ts` | 2 |
| `files/components/feedback-auth.ts` | `src/components/feedback/feedback-auth.ts` | 1 |
| `files/components/analytics-client.ts` | `src/lib/feedback/analytics-client.ts` | 1 |
| `files/components/feedback-button.tsx` | `src/components/feedback/feedback-button.tsx` | 1 |
| `files/components/feedback-dialog.tsx` | `src/components/feedback/feedback-dialog.tsx` | 1 |
| `files/components/dialog-feedback-button.tsx` | `src/components/feedback/dialog-feedback-button.tsx` | optional |
| `files/lib/telemetry-types.ts` | `src/lib/feedback/telemetry-types.ts` | 3 |
| `files/lib/telemetry-redact.ts` | `src/lib/feedback/telemetry-redact.ts` | 3 |
| `files/lib/telemetry-capture.ts` | `src/lib/feedback/telemetry-capture.ts` | 3 |
| `files/lib/telemetry-client.ts` | `src/lib/feedback/telemetry-client.ts` | 3 |
| `files/components/feedback-telemetry-init.tsx` | `src/components/feedback/feedback-telemetry-init.tsx` | 3 |

## 5. Prerequisites

Assumed stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui. Other stacks work but the dialog JSX and route files need porting.

**Packages** (skip any already installed):

```bash
pnpm add react-hook-form @hookform/resolvers zod sonner lucide-react
# Tier 2 only:
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**shadcn/ui components** (skip any already present in `src/components/ui/`):

```bash
pnpm dlx shadcn@latest add button dialog label select textarea
```

Sonner's `<Toaster />` must be mounted in the root layout if it isn't already.

## 6. Adaptation seams (the ADAPT checklist)

These are the only places that need project-specific code. Search the copied files for `ADAPT` to find them all.

| # | Seam | File | Required? | What to do |
|---|---|---|---|---|
| 1 | Server auth | `server-adapter.ts` -> `requireUser()` | **Yes** | Return the session user or a 401. Ships as a 501 stub so a half-finished install fails loudly. BetterAuth and NextAuth examples are in the comment. |
| 2 | Client auth | `feedback-auth.ts` -> `useFeedbackUser()` | **Yes** | Return the signed-in user or null. Ships returning null, which hides the buttons until implemented. |
| 3 | Logging | `server-adapter.ts` -> `log()` | Recommended | Swap console fallback for your structured logger (Pino etc.). |
| 4 | Rate limiting | `server-adapter.ts` -> `checkRateLimit()` | Recommended | In-memory fallback included; swap for Redis/Upstash if you run multiple instances. |
| 5 | Server analytics | `server-adapter.ts` -> `track()` | Optional | No-op by default; forward to PostHog/Segment. |
| 6 | Client analytics | `analytics-client.ts` -> `track()` | Optional | Same, client-side. |
| 7 | Storage | `storage.ts` | Tier 2 | Generic S3 client using `S3_*` env vars. If the project already has a storage lib, delete this file and re-point the imports in both API routes. |
| 8 | Tenant context | `feedback-route.ts` -> `context` array | Optional | Push rows like `{ label: "Org", value: "Acme (org_123)" }` to show tenant info in the issue. Vigilis fills this with org + partner lookups. |
| 9 | Categories | `validations-feedback.ts` + `github-issue.ts` | Optional | Trim/extend `feedbackCategories`; keep `CATEGORY_LABEL_SLUG` and GitHub labels in sync. |
| 10 | Telemetry window key | `telemetry-types.ts` -> `WINDOW_KEY` | Optional | Rename per app. |
| 11 | Analytics host ignore | `telemetry-capture.ts` | Optional | Set `NEXT_PUBLIC_ANALYTICS_HOST` so the fetch patch ignores your own analytics traffic. |
| 12 | Session replay | `telemetry-client.ts` -> `collectSession()` | Optional | Reads `window.posthog` if present; wire to your SDK import for replay URLs and flags. |

## 7. GitHub setup (one-time, per app)

1. Create a **private** triage repo, e.g. `your-org/your-app-feedback`. Private matters: issue bodies contain user emails and IDs.
2. Create a **fine-grained PAT** scoped to only that repo with repository permissions:
   - **Issues: Read and write** (create issues)
   - **Contents: Read and write** (commit screenshots and diagnostics JSON)
3. Create the labels the route applies (run from any directory):

```bash
gh label create feedback --repo your-org/your-app-feedback --color 0E8A16 --description "In-app feedback submission"
gh label create "severity:low" --repo your-org/your-app-feedback --color C2E0C6
gh label create "severity:medium" --repo your-org/your-app-feedback --color FBCA04
gh label create "severity:high" --repo your-org/your-app-feedback --color D93F0B
gh label create "surface:page" --repo your-org/your-app-feedback --color BFD4F2
gh label create "surface:modal" --repo your-org/your-app-feedback --color BFD4F2
gh label create data-issue --repo your-org/your-app-feedback --color 5319E7
gh label create ui-ux --repo your-org/your-app-feedback --color F9D0C4
gh label create billing --repo your-org/your-app-feedback --color 006B75
gh label create performance --repo your-org/your-app-feedback --color FEF2C0
gh label create account-access --repo your-org/your-app-feedback --color B60205
gh label create other --repo your-org/your-app-feedback --color EDEDED
# `bug` and `enhancement` usually exist by default; create them if missing.
```

Missing labels do not break issue creation (GitHub auto-creates labels when the token has Issues write), but pre-creating gives you controlled colors.

## 8. Environment variables

| Variable | Tier | Purpose |
|---|---|---|
| `GITHUB_FEEDBACK_TOKEN` | 1 | Fine-grained PAT from step 7 |
| `GITHUB_FEEDBACK_REPO` | 1 | `owner/repo` of the triage repo |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 2 | Object storage for screenshot staging (skip `S3_ENDPOINT` on real AWS) |
| `NEXT_PUBLIC_APP_VERSION` | 3, optional | Build identifier shown in the Diagnostics section |
| `NEXT_PUBLIC_ANALYTICS_HOST` | 3, optional | Analytics ingest host to exclude from network capture |

If both `GITHUB_FEEDBACK_TOKEN` and `GITHUB_FEEDBACK_REPO` are unset, submissions are still accepted, validated, and logged; no issue is opened (a warning is logged). This makes local dev safe by default.

## 9. Install steps

1. Copy files per the file map (section 4), creating `src/lib/feedback/` and `src/components/feedback/`.
2. Install packages and shadcn components (section 5).
3. Implement seams 1 and 2 (auth). Do the recommended seams while you're there.
4. Set env vars (section 8) after doing the GitHub setup (section 7).
5. Mount the pieces:

**Header button** in your app shell / top bar:

```tsx
import { FeedbackButton } from "@/components/feedback/feedback-button";
// inside the header actions area:
<FeedbackButton />
```

**Telemetry init (tier 3)**, once near the root, e.g. in your providers component:

```tsx
import { FeedbackTelemetryInit } from "@/components/feedback/feedback-telemetry-init";
// alongside your other providers:
<FeedbackTelemetryInit />
```

**React-crash capture (tier 3)** in `src/app/global-error.tsx` (create the file if the app has none; it must render its own `<html>/<body>`):

```tsx
"use client";
import { useEffect } from "react";
import { recordReactError } from "@/lib/feedback/telemetry-client";

export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    recordReactError(error);
    console.error("Global error:", error);
  }, [error]);
  // render your fallback UI with inline styles (globals.css is unavailable here)
}
```

**In-modal button (optional):** patch `src/components/ui/dialog.tsx` so every dialog gets the button, with an opt-out prop:

```tsx
import { DialogFeedbackButton } from "@/components/feedback/dialog-feedback-button";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showFeedbackButton = true,   // add
  ...props
}: DialogPrimitiveContentProps & {
  showCloseButton?: boolean;
  showFeedbackButton?: boolean;  // add
}) {
  return (
    /* ...existing structure... */
    <>
      {children}
      {/* existing close button */}
      {showFeedbackButton && <DialogFeedbackButton />}   // add before closing tag
    </>
  );
}
```

Then pass `showFeedbackButton={false}` on dialogs where it doesn't belong: the feedback dialog itself (already done in the template), command palettes, search dialogs, keyboard-shortcut overlays. If you skip this patch, delete `dialog-feedback-button.tsx` and remove the `showFeedbackButton={false}` prop inside `feedback-dialog.tsx`.

Note: `DialogContent` must not have `overflow-hidden` clipping, since the button is absolutely positioned at bottom-left. The `data-slot="dialog-content"` / `data-slot="dialog-title"` attributes must exist for modal-title capture (standard in current shadcn dialogs).

6. Build (`pnpm build` or your typecheck command) and fix any import-path drift.

## 10. Security notes (keep these behaviors)

- **Screenshot key ownership check**: the feedback route rejects any `screenshotKey` not prefixed `feedback/{userId}/`. This prevents referencing another user's uploads. If you change the presign key scheme, change the check in lockstep.
- **Client + server validation**: the Zod schema bounds every field; diagnostics sub-objects are intentionally non-strict so rolling deploys degrade gracefully.
- **Redaction before transport**: console lines, network URLs, and breadcrumb labels pass through `redactText`/`redactUrl` (JWTs, bearer tokens, emails, long hex/tokens, sensitive query params). Storage capture counts sizes only, never values.
- **Rate limits**: 1 submission / 30s and 5 presigns / 30s per user. Keep them; the endpoint writes to your GitHub repo.
- **Private triage repo**: issue bodies contain user email, ID, and page URLs. Do not point this at a public repo.
- **Auth required**: both routes refuse anonymous requests. The template stubs fail closed (501 / hidden buttons) until auth is wired.

## 11. Gotchas (learned the hard way in Vigilis)

- **Private-repo images do not render inline** in GitHub issues. `raw.githubusercontent.com` URLs for private repos carry a short-lived token that 404s in minutes, and GitHub's image proxy cannot authenticate. That is why screenshots are committed via the Contents API and linked as blob URLs. Do not "simplify" to the Contents API `download_url`.
- **There is no PAT API for drag-and-drop issue attachments**; committing files to the repo is the only supported way to host artifacts next to issues.
- **Presigned-URL fallback rots**: when the GitHub commit fails, the issue embeds a 7-day presigned URL and says so. Triage within the window or pull from storage later.
- **The fetch patch must ignore itself**: `/api/feedback` and analytics ingest URLs are excluded from network capture, otherwise submissions capture their own upload traffic (and analytics noise floods the buffer).
- **Paste handling**: image paste is ignored while the user is typing into a non-empty input, so pasting text into the message box never gets hijacked; pasting into an empty field still accepts an image (snipping-tool flow).
- **In-memory rate limiter is per-process**: fine on one instance, advisory behind a load balancer. Use Redis there.
- **GitHub failures never fail the submission**: issue-create, screenshot-commit, and diagnostics-commit all degrade to warnings. The user always gets their "sent" toast; check logs if issues stop appearing.
- **Issue body size**: everything rendered into the body is truncated/bounded; the full diagnostics live in the committed JSON. Keep it that way or you will hit GitHub's 65k body cap.

## 12. Verification checklist

- [ ] Signed out: no feedback button renders.
- [ ] Signed in: header button opens dialog; submit with a short message (<10 chars) is blocked.
- [ ] Valid submit: success toast; issue appears in the triage repo with correct labels, user, and page link.
- [ ] Second submit within 30s: friendly "please wait" error (429 path).
- [ ] Tier 2: attach a PNG via picker and via Ctrl+V; issue links a screenshot; a commit lands under `feedback-attachments/<category>/`.
- [ ] Tier 2: oversized (>10MB) and wrong-type files are rejected client-side.
- [ ] Tier 3: trigger a console.error and a failing fetch, then submit; the issue's Diagnostics section shows them, and a `diagnostics-*.json` commit exists.
- [ ] Tier 3: tokens/emails logged to console appear redacted in the artifact.
- [ ] In-modal button (if installed): submitting from inside a modal sets the `[Modal Title]` prefix and `surface:modal` label.
- [ ] Env vars unset: submission still succeeds (200) and a "not configured" warning is logged.

---

_Source of truth: extracted 2026-07-06 from the Vigilis dashboard (`src/components/feedback/`, `src/lib/feedback/`, `src/app/api/feedback/`). If Vigilis's implementation evolves, re-extract or diff against these paths._
