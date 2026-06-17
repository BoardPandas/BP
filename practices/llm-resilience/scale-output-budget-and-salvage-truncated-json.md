---
concern: llm-resilience
tech: [typescript, nodejs, llm, openrouter, gemini, anthropic]
priority: recommended
source-repo: tcg
applies-to: [typescript, nodejs, llm-integration]
---
# Scale the LLM output budget to the task, and salvage truncated JSON instead of discarding it

## PATTERN
When an LLM must emit LARGE structured (JSON) output, one failure dominates: the model hits its output-token cap and the JSON is cut off mid-string, so `JSON.parse` throws after minutes of generation with nothing saved. Defend with two paired techniques:

1. **Depth-scaled output budget (prevention).** Size `maxOutputTokens` to the request's depth/complexity instead of a single flat cap, and expose an env override so prod can tune it without a deploy. A "deep"/content-rich request gets more headroom than a "quick" one; keep every tier under the model's max-completion ceiling.

2. **Truncated-JSON salvage (recovery).** When `JSON.parse` still fails, recover the COMPLETE LEADING PORTION of the truncated value rather than throwing the whole generation away: a single-pass scan tracking string + escape state and the open-container (`{`/`[`) stack, rewinding to the last position that sits BETWEEN complete elements (never mid-key, mid-value, or just after a comma), dropping a dangling comma, and appending the closers for whatever is still open. Return a parseable string, or `null` if nothing is recoverable.

Salvage is a FALLBACK ONLY and strictly ordered: `JSON.parse` first, salvage on the catch, and if salvage returns `null` fall through to the ORIGINAL parse error. This makes the path never worse than not calling it -- the worst case is the same throw you already had.

This is distinct from (and composes with) the non-strict parse ladder for COMPLETE-but-messy output (fences / extra prose / brace balance): that handles a whole-but-dirty response and fails closed; this handles an INCOMPLETE response and keeps the near-complete remainder.

## WHY
- A flat token budget truncates large outputs mid-string. The model spends minutes generating, then `JSON.parse` dies and the entire job fails with nothing written -- the worst latency-to-failure ratio there is.
- Depth-scaling removes MOST truncation up front (the common case generates fully), so salvage is the rare backstop, not the norm.
- Salvage turns "lost everything after eight minutes" into "kept the complete leading sections" -- a near-finished deep result still lands, and the caller can re-run later at a higher budget to fill the tail.
- The strict ordering (parse -> salvage -> original error) makes adding salvage risk-free: it can only upgrade a failure into a partial success, never degrade a success.

## EXAMPLE
Depth-scaled budget with an env override (`dashboard/src/lib/theme-research-service.ts`):
```ts
const MAX_OUTPUT_TOKENS_OVERRIDE = Number(process.env.THEME_RESEARCH_MAX_OUTPUT_TOKENS) || 0;

function maxOutputTokensFor(depth: ResearchDepth, pass: 1 | 2): number {
  if (MAX_OUTPUT_TOKENS_OVERRIDE > 0) return MAX_OUTPUT_TOKENS_OVERRIDE;
  if (pass === 1) {                 // the structured-JSON pass needs the most room
    if (depth === "quick") return 16000;
    if (depth === "deep") return 48000;
    return 28000;                   // standard
  }
  // pass 2 (narrative) mirrors it, a notch lower
  ...
}
```

Salvage as a strict fallback at the parse site (`theme-research-service.ts`):
```ts
const jsonText = unfenceJson(raw);
let dossier: any;
try {
  dossier = JSON.parse(jsonText);
} catch (parseErr) {
  const repaired = repairTruncatedJson(jsonText);   // null if unrecoverable
  if (repaired) {
    try { dossier = JSON.parse(repaired); /* log: salvaged leading sections */ }
    catch { dossier = undefined; }
  }
  if (dossier === undefined) throw parseErr;          // never worse than before
}
```

The salvage scanner (`dashboard/src/lib/text-llm-client.ts`, `repairTruncatedJson`) -- shape:
```ts
export function repairTruncatedJson(raw: string): string | null {
  const text = raw.trimEnd();
  if (text[0] !== "{" && text[0] !== "[") return null;
  // single pass: track inString/escaped + a stack of "{"/"[" frames and the
  // grammar position (key | colon | value | comma); record the last index that
  // sits BETWEEN complete elements as the safe rewind point.
  // ...then slice to safeEnd, drop a trailing comma, append closers for the
  // still-open frames in reverse, and return -- or null if no safe point exists.
}
```

## CHECK
How to verify if a repo already follows this:
- [ ] LLM calls that emit large JSON size `maxOutputTokens` by request complexity (not one flat constant for every call).
- [ ] The output budget has an env override so it can be raised on prod without a code change.
- [ ] On `JSON.parse` failure the code attempts to recover a truncated/partial value, rather than only retrying or only failing.
- [ ] Salvage is ordered strictly after a direct parse and falls through to the ORIGINAL error when it can't recover (no swallowed errors, no worse-than-baseline path).
- [ ] Salvage handles truncation specifically (unterminated strings, unclosed containers), not just brace-balancing of a complete response.

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Replace the flat `maxOutputTokens` constant with a function of the request's depth/size; keep every tier under the model's max-completion ceiling.
2. Add an env override (`*_MAX_OUTPUT_TOKENS`) that wins when set, for no-deploy prod tuning.
3. Add a `repairTruncatedJson(raw): string | null` helper: single-pass scan tracking string/escape state and an open-container stack, rewind to the last between-elements boundary, drop a dangling comma, append the missing closers; return `null` when no safe boundary exists.
4. At each large-JSON parse site, order it: `JSON.parse` -> on catch, `repairTruncatedJson` then parse the repaired string -> if still unrecoverable, throw the ORIGINAL parse error. Log when a salvage succeeds so truncation stays visible.
5. Optionally raise the budget after observing salvage logs -- a salvage means the tier was too small for that request.

## NOTES
- Composes with, and is distinct from, the non-strict parse ladder for COMPLETE-but-messy JSON ([Robustly parse non-strict LLM JSON with parse-only retry and fail-closed fallback](llm-json-parse-retry-fail-closed.md)): run the parse ladder for fences / prose / brace-balance on a whole response; reach for truncation salvage when the response was cut off at the token cap. A full defense can do both -- ladder first, then truncation salvage.
- Salvage deliberately keeps complete leading elements and DISCARDS the truncated tail; it is permissive, not strict. Downstream consumers must tolerate a partial object (some sections missing) -- pair it with a merge/extend path so a later, higher-budget run can fill the gaps.
- Some models (e.g. Gemini 3) count THINKING tokens against `maxOutputTokens`, so the visible-output budget must clear the thinking burn too -- floor those providers higher.
- Shipped in tcg v3.15.1.0.
