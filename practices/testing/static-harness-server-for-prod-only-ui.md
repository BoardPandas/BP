---
concern: testing
tech: [node, css, vanilla-js, chrome-devtools]
priority: recommended
source-repo: tcg
applies-to: [static-frontend, pwa, dashboard]
---
# Verify prod-only static UI pre-deploy with a scratchpad harness server + DevTools emulation

## PATTERN
When a web app's frontend is plain static files (no build step) but the app itself only runs in production (local dev server retired or impractical), verify layout/behavior changes BEFORE deploying by:

1. Writing a throwaway Node static server (~25 lines, no deps) that serves the app's public directory at `/` and maps one extra route (e.g. `/harness`) to a harness HTML file kept OUTSIDE the repo (scratchpad/temp dir), so no temp files land in the working tree.
2. Writing a harness page that loads the real CSS files by their absolute production paths and imports the real ES modules the same way (absolute `/sections/...` imports resolve because the server root IS the public dir), then mounts the component under test with faked state/context, forced into its worst-case configuration.
3. Driving it with Chrome DevTools MCP (or plain DevTools): `emulate` a true device viewport (window resize floors at ~500px width; device emulation does not), then `evaluate_script` to assert layout math (scrollHeight vs clientHeight, getBoundingClientRect floors, reachability after programmatic scroll) instead of eyeballing screenshots.

## WHY
- "Prod-only" apps otherwise force a deploy per layout experiment; this gives a full edit-measure loop in seconds with the REAL css/js files, not a copy.
- Numeric assertions (clip overflow = 0, touch target >= 44px, popover rect inside container rect) catch regressions screenshots hide, and document exactly what "verified" meant.
- Keeping the harness + server in the session scratchpad means nothing to gitignore, nothing to clean out of the repo, and no risk of a concurrent session sweeping temp files into a commit.

## EXAMPLE
From tcg (dashboard is prod-only; fixed a 375px overflow in `dashboard/src/public/sections/app/`):

`scratchpad/serve.mjs` (route map is the whole trick):
```js
if (url.pathname === "/" || url.pathname === "/harness") file = HARNESS; // scratchpad file
else file = join(ROOT, normalize(url.pathname).replace(/^([A-Za-z]:)?[\\/]+/, "")); // repo public/
```

Harness mounts the real module with worst-case fake state:
```js
import { mountQuadrant, updateQuadrant } from "/sections/app/quadrant.js"; // real file, real path
// fake seats/ctx, force hidden identity rows visible, seed counters...
```

Measurement (chrome-devtools MCP), after `emulate viewport 375x667x2,mobile,touch`:
```js
clipOverflow: q.scrollHeight - q.clientHeight,          // must be 0
footerScrollable: footer.scrollHeight > footer.clientHeight,
addBtnReachableAfterScroll,                              // scrollTop = max, then rect-in-rect
lifeTapH: Math.round(plus.height),                       // must be >= 44
```

## CHECK
How to verify if a repo already follows this:
- [ ] A documented (or scripted) way exists to load the app's static components locally without the full backend
- [ ] Pre-deploy UI verification uses device emulation (not window resize) for phone viewports
- [ ] Layout verification asserts numbers (overflow, target sizes, rect containment), not only screenshots

## IMPLEMENT
Steps to adopt this:
1. Write the ~25-line static server in the session scratchpad; root = the app's public dir; add one virtual route for the harness file (also in scratchpad).
2. Write a harness page linking the app's real CSS by production absolute paths and importing the real modules; fake the minimal state/context; force the worst-case UI configuration (everything visible, max rows).
3. Drive with DevTools/MCP: emulate the target viewport (window resize floors around 500px wide; emulation is exact), assert layout numerically via evaluated JS, screenshot once for sanity.
4. Delete nothing from the repo afterwards; the scratchpad is self-cleaning.

## NOTES
- Works only for genuinely static frontends (no bundler-rewritten import paths). If imports are bundled aliases, the harness needs the build output as its root instead.
- Fake-state mounting can drift from real mounting; treat this as a pre-deploy gate, not a replacement for the post-deploy live check on prod.
- Auto-discovered by practice-scout from tcg commit (375px Commander-tracker quadrant overflow fix, 3.164.3.0).
