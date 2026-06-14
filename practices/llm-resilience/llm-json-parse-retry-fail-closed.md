---
concern: llm-resilience
tech: [typescript, node, llm, ai]
priority: recommended
source-repo: tcg
applies-to: [typescript, node, llm, ai]
---
# Robustly parse non-strict LLM JSON with parse-only retry and fail-closed fallback

## PATTERN
When you ask an LLM for a JSON object but the provider has no strict `json_object`
response mode (Anthropic), the model returns JSON *most* of the time but
intermittently wraps it in a Markdown code fence or trails prose after the
object. Handle this in three layers:

1. **Defensive parse ladder.** Try the cheap clean paths first, then escalate:
   direct `JSON.parse` of the unfenced text, then the raw trimmed text, then a
   STRING-AWARE balanced-brace scan from the first `{` to its matching `}`, then a
   last-resort first-brace/last-brace slice. The balanced scan tracks string
   literals and escapes so a `}` inside a string value (or in trailing
   commentary) does not throw off the bounds. **Reject non-object JSON** (a bare
   array, string, or number) so it cannot masquerade as the expected shape.
2. **Failure-mode-aware retry.** Retry ONCE on a *parse* failure: the call
   already returned, so a re-prompt with a strict "raw JSON only, escape
   newlines/quotes" nudge is cheap. Do NOT retry on a *timeout or transport*
   error: a second full-length wait worsens latency with no reason to expect a
   different result. Fall through to the next model/attempt, or fail closed.
3. **Fail closed.** When every parse fails, degrade safely (drop or caveat the
   unverified content) rather than emitting raw or unchecked output.

## WHY
A naive `JSON.parse(response.text)` is the worst kind of bug: it passes every
test (the model returns clean JSON in dev) and then throws in production under
load, exactly when the model decides to fence the object or add a sentence of
commentary. The ladder absorbs those intermittent shapes without a hard failure.

- A first-`{`..last-`}` slice over-grabs when the model appends commentary that
  happens to contain a `}`. The string-aware scan finds the true object bounds.
- Rejecting non-object JSON prevents a bare array/string from silently
  type-coercing into the expected shape and corrupting everything downstream.
- The retry asymmetry matters for latency: a parse-retry is cheap because the
  output already exists; a transport/timeout retry pays the full wait again and
  rarely helps, so falling through is the safer bound.
- Failing closed makes "we could not verify this" degrade to the safe side
  instead of presenting unchecked content as if it were checked.

## EXAMPLE
From the tcg repo (`dashboard/src/lib/concierge-ai.ts`, functions `extractFirstJsonObject`,
`parseVerifierJson`, and the retry loop in `verifyTurn`):

```typescript
// unfenceJson(raw): if the reply is wrapped in a Markdown code fence (with an
// optional "json" info string), strip the fence and return the inner text via
// one anchored regex match; otherwise return raw.trim().

/** Scan from the first `{` to its MATCHING `}`, tracking string literals +
 * escapes so a brace inside a value (or trailing prose) doesn't break the
 * bounds. More correct than first-`{`..last-`}`, which over-grabs. */
function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null; // unbalanced: no complete object
}

/** Tolerant parse: cheap clean paths, then balanced extraction, then the legacy
 * first-to-last brace slice. Non-object JSON is rejected so a bare array/string
 * can't pose as the verdict. Returns null only when nothing yields an object. */
function parseLlmJson(raw: string): Record<string, unknown> | null {
  const candidates: string[] = [];
  const unfenced = unfenceJson(raw).trim();
  const trimmed = raw.trim();
  if (unfenced) candidates.push(unfenced);
  if (trimmed && trimmed !== unfenced) candidates.push(trimmed);
  const balanced = extractFirstJsonObject(unfenced) ?? extractFirstJsonObject(raw);
  if (balanced) candidates.push(balanced);
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* try the next candidate */ }
  }
  return null;
}

const PARSE_RETRIES = 1; // one cheap re-prompt when a reply won't parse
const STRICT_JSON_RETRY_NUDGE =
  "IMPORTANT: your previous reply could not be parsed as JSON. Reply with ONLY a " +
  "single raw JSON object (no markdown code fences, no text before or after it) " +
  "and make sure every newline and double-quote inside string values is " +
  'escaped (\\n, \\").';

// Each model in the chain gets up to PARSE_RETRIES+1 tries, but the extra try
// fires ONLY when the call returned UNPARSEABLE text. A thrown error
// (timeout / transport) breaks to the next model instead of burning a retry.
let lastErr: unknown = null;
for (const cfg of modelChain) {
  for (let tryIdx = 0; tryIdx <= PARSE_RETRIES; tryIdx++) {
    const sys = tryIdx === 0 ? system : `${system}\n\n${STRICT_JSON_RETRY_NUDGE}`;
    try {
      // jsonMode is honored by providers that support it (OpenAI/OpenRouter);
      // Anthropic ignores it -> this is exactly the path that needs the parser.
      const r = await callLlm({ ...cfg, system: sys, jsonMode: cfg.provider !== "anthropic",
        signal: AbortSignal.timeout(VERIFIER_TIMEOUT_MS) });
      const parsed = parseLlmJson(r.text);
      if (parsed) return useResult(parsed);          // good parse -> done
      lastErr = new Error("LLM returned unparseable output");
      // unparseable: let the inner loop re-prompt if a try remains
    } catch (err) {
      lastErr = err;                                 // timeout / transport
      break;                                         // do NOT spend a parse-retry
    }
  }
}
return failClosed();  // every attempt failed -> degrade safely, never emit unverified output
```

`failClosed()` is domain-specific. In the source it strips sentences carrying an
unverified interaction claim and appends a caveat, so the user never sees an
unchecked claim:

```typescript
// Deterministic fallback: drop the unverified parts, keep the rest, add a caveat.
function failClosed(text: string): { text: string; flagged: number } {
  /* ...split into lines/sentences, remove the ones matching the claim regex,
     append "(some claims were held back pending verification)" ... */
}
```

## CHECK
How to verify if a repo already follows this:
- [ ] LLM JSON responses go through a tolerant parser, not a bare `JSON.parse(response.text)`
- [ ] The parser strips Markdown code fences and ignores prose trailing the object
- [ ] Brace extraction is string-aware (tracks string literals + escapes), not a naive first/last-brace slice
- [ ] The parser rejects non-object JSON (bare array/string/number) instead of returning it
- [ ] Retry policy retries on a parse failure but NOT on a timeout/transport error
- [ ] The parse-retry re-prompt explicitly demands raw JSON only with escaped string contents
- [ ] When all attempts fail, the code fails closed (drops/caveats unverified output) rather than emitting it

## IMPLEMENT
1. Write an `unfenceJson(text)` helper that strips a leading/trailing ` ```json ` fence and returns the trimmed inner text (or the trimmed input when unfenced).
2. Write a string-aware `extractFirstJsonObject(s)` that scans from the first `{` to its matching `}`, tracking string literals and escapes; return null when unbalanced.
3. Write `parseLlmJson(raw)` that tries, in order: the unfenced text, the raw trimmed text, the balanced-brace extraction, then a first/last-brace slice. Reject any result that is not a plain object; return null if nothing parses.
4. Define `PARSE_RETRIES = 1` and a strict "raw JSON only, escape newlines/quotes" nudge appended to the system prompt on retry.
5. In the call loop: on a successful parse, return; on an unparseable reply, re-prompt up to `PARSE_RETRIES`; on a thrown error (timeout/transport), `break` to the next model/attempt without spending a parse-retry. Put the timeout on the call itself (`AbortSignal.timeout(...)`) so a hung provider fails closed instead of hanging the caller.
6. After all attempts, fail closed: degrade to a safe output (omit, caveat, or use a conservative default) rather than surfacing raw or unverified content.

## NOTES
- Keep `jsonMode` / `response_format: { type: "json_object" }` ON for providers that support it (OpenAI, OpenRouter/Kimi). The defensive parser is the fallback for providers that ignore it (Anthropic). Belt and suspenders: keep the parser even when jsonMode is on, since "JSON mode" guarantees valid JSON, not your schema.
- The string-aware scan beats first-`{`..last-`}` specifically because the latter over-grabs when the model appends commentary containing a `}`.
- The retry asymmetry is the crux: a parse-retry is cheap (output already exists); a transport/timeout retry pays the full latency again and rarely helps, so fall through to the next model or fail closed instead.
- "Fail closed" is domain-specific. Here it strips unverified claims; generally it means degrade to the safe side (omit, caveat, conservative default) rather than presenting unchecked output as checked. Pair it with a per-call timeout so a slow provider triggers the same safe path.
- Sourced from the tcg repo, commit 35bd92e, `dashboard/src/lib/concierge-ai.ts` (functions `parseVerifierJson`, `extractFirstJsonObject`, and the retry loop in `verifyTurn`). Added manually via the practice-scout entry workflow, not an automated scout discovery.
