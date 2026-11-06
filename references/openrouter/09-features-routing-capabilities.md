# OpenRouter Reference — 9. Features I — models, routing & capabilities

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 08-endpoints-governance.md](08-endpoints-governance.md) · [Next: 10-features-auth-cost-privacy.md →](10-features-auth-cost-privacy.md)

## 9. Features I — models, routing & capabilities

This section covers how a request picks a **model** and a **provider endpoint**, and the capabilities you can attach to a request: multimodal inputs and outputs, client tool calling, OpenRouter-executed server tools, plugins, and structured outputs. Endpoint request and response schemas are in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) (text inference) and [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs) (images, videos, TTS, STT, server-tools catalog); catalog endpoints are in [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data). Privacy, cost and caching features (ZDR, BYOK, prompt caching, service tiers, reasoning tokens, message transforms, router metadata, in-region routing) are in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy).

Conventions used below:

- Raw HTTP bodies use **snake_case** (`allow_fallbacks`, `cost_tier`). The TypeScript SDK (`@openrouter/sdk`) uses **camelCase** for the same fields (`allowFallbacks`, `costTier`, `minCodingScore`, `sessionId`, `toolChoice`), including inside content parts and items (`imageUrl`, `fileUrl`, `inputAudio`, `videoUrl`, `callId`, `responseFormat`). Examples marked "TypeScript SDK" use camelCase; JSON/cURL/Python use snake_case.
- TypeScript SDK client setup, shown once:

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

// Responses API
const res = await openRouter.responses.send({ responsesRequest: { model: 'openai/gpt-5.2', input: 'Hello', stream: false } });
// Chat Completions
const chat = await openRouter.chat.send({ chatRequest: { model: 'openai/gpt-5.2', messages: [{ role: 'user', content: 'Hello' }] } });
```

- Reading the final text of a non-streaming Responses API result (used by many doc examples):

```typescript
if (!('output' in res)) throw new Error('Expected a non-streaming response');
const message = [...res.output].reverse().find((item) => item.type === 'message');
console.log(message?.content.find((part) => part.type === 'output_text')?.text);
console.log('Model used:', res.model); // concrete model that served the request
```

### 9.1 Models: IDs, catalog API and model metadata

#### Model ID format

| Form | Example | Meaning |
| - | - | - |
| `author/slug` | `openai/gpt-4o`, `anthropic/claude-sonnet-4.5` | Concrete model. This is the `id` in the catalog and the value for `model`. |
| Alias | `anthropic/claude-3-5-sonnet` → `anthropic/claude-3.5-sonnet` | Lookup routes resolve aliases to the canonical entry automatically. |
| `canonical_slug` | dated form, e.g. `openai/gpt-4o-2024-08-06` | Permanent slug that never changes (catalog field). Some management APIs take a dated "permaslug" (e.g. private endpoints' `model_permaslug`). |
| `~author/family-latest` | `~anthropic/claude-opus-latest` | Latest-resolution alias: always resolves to the newest model in the family (see [§9.13](#913-latest-model-resolution-authorfamily-latest)). |
| Router slug | `openrouter/auto`, `openrouter/free`, `openrouter/fusion`, `openrouter/pareto-code`, `openrouter/bodybuilder`, `typesafe/jev-router`, `nvidia/switchyard` | Meta-models that pick or orchestrate concrete models ([§9.8](#98-routers-overview-choosing-a-model-selection-mechanism)–[§9.16](#916-switchyard-nvidiaswitchyard)). |
| Variant suffix | `openai/gpt-5.2:nitro`, `poolside/laguna-s-2.1:free:nitro` | `:suffix` appended to any of the above; see [§9.2](#92-model-variants-free-nitro-floor-exacto-online-thinking-extended-batch). |

The response `model` field always reports the **concrete** model that served the request (not the alias/router you sent).

#### Catalog API pointers (full reference in §7)

| Endpoint | Purpose |
| - | - |
| `GET /api/v1/models` | List models (default: text-output models only). Edge-cached. RSS: `https://openrouter.ai/api/v1/models?use_rss=true` |
| `GET /api/v1/models/count` | Count; accepts the same `output_modalities` filter so counts match list results |
| `GET /api/v1/model/{author}/{slug}` | Single model lookup; resolves aliases and variant suffixes |
| `GET /api/v1/models/{author}/{slug}/endpoints` | Per-provider endpoints (provider `tag`, `quantization`, `supported_parameters`, `native_tools`, `service_tier`, pricing, etc.) |
| `GET /api/v1/models/user` | Models filtered by the caller's provider preferences, privacy settings and guardrails (bearer auth) |
| `GET /api/v1/images/models`, `GET /api/v1/videos/models`, `GET /api/v1/embeddings/models` | Modality-specific catalogs ([§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs)) |

#### `GET /api/v1/models` query parameters

| Param | Values | Behavior |
| - | - | - |
| `output_modalities` | comma-separated list of `text` (default), `image`, `video`, `audio`, `speech` (TTS), `transcription` (STT), `embeddings`, `rerank`, `decisions` (e.g. Jev), or `all` | Omitted ⇒ text-output models only. Image generators, embedding, rerank, TTS/STT and decision models are **not** in the default response. |
| `endpoints` | comma-separated request paths, e.g. `/api/v1/chat/completions`, `/api/v1/embeddings`, `/api/alpha/decisions`, `/api/alpha/extractions` | Model must serve **every** listed path. Unknown path ⇒ `400`. When set without `output_modalities`, models of every output modality are considered. Use it for routes that are not an output modality (e.g. Extractions). |
| `supported_parameters` | e.g. `tools`, `structured_outputs`, `reasoning` | Filter to models supporting the parameter(s). |
| `sort` | `pricing-low-to-high`, `pricing-high-to-low`, `context-high-to-low`, `throughput-high-to-low`, `latency-low-to-high`, `most-popular`, `top-weekly` (= most-popular), `newest` | Server-side sort. Pricing sort = weighted average of prompt, completion, request and web_search pricing. Throughput/latency = p50 from routing heuristics. Models without data for the dimension sort last. Omitted ⇒ default (backward-compatible) order. |
| `offset`, `limit` | integers | Opt-in pagination. Both omitted ⇒ full list, `links.next: null`. When paginating, `limit` defaults to 500, max 1000. |

```bash
curl "https://openrouter.ai/api/v1/models?output_modalities=text,image"
curl "https://openrouter.ai/api/v1/models?endpoints=/api/alpha/decisions,/api/alpha/extractions"
curl "https://openrouter.ai/api/v1/models?sort=throughput-high-to-low&supported_parameters=tools"
curl "https://openrouter.ai/api/v1/models?offset=0&limit=500"
```

Root response: `{ "data": [Model...], "total_count": 150, "links": { "next": "/api/v1/models?offset=500&limit=500" | null } }`.

Single lookup: `GET /api/v1/model/{author}/{slug}` returns `{ "data": Model }`. Catalog variants (`:free`) return their own entry; routing variants (`:nitro`) return the base entry; `404` when the model (or the catalog-variant entry) does not exist and is not an alias.

#### Model object

| Field | Type | Meaning |
| - | - | - |
| `id` | string | ID used in requests (e.g. `google/gemini-2.5-pro-preview`) |
| `canonical_slug` | string | Permanent slug, never changes |
| `name` | string | Display name |
| `created` | number | Unix timestamp the model was added |
| `description` | string | Capabilities description |
| `context_length` | number | Max context window (tokens) |
| `architecture` | object | `input_modalities: string[]` (e.g. `["file","image","text"]`), `output_modalities: string[]`, `tokenizer: string`, `instruct_type: string \| null` |
| `pricing` | object | Pricing from the top provider (below) |
| `top_provider` | object | `context_length`, `max_completion_tokens`, `is_moderated` |
| `per_request_limits` | object \| null | Rate-limit info, `null` if none |
| `supported_parameters` | string[] | Parameters that work with this model |
| `default_parameters` | object \| null | Default parameter values, `null` if none |
| `expiration_date` | string \| null | Deprecation date of the model endpoint, `null` if not deprecated |
| `benchmarks` | object \| absent | Third-party rankings; field omitted when no data |

`pricing` (all values are **strings in USD per token / request / unit**; `"0"` = free): `prompt`, `completion`, `request` (fixed per request), `image` (per image input), `web_search` (per search), `internal_reasoning`, `input_cache_read`, `input_cache_write`, and optional `overrides: PricingOverride[]`.

**Pricing overrides** express conditional prices (long-context, peak/off-peak):

| Override field | Meaning |
| - | - |
| `min_prompt_tokens` | Applies when total prompt tokens are **strictly greater** than this |
| `utc_start` / `utc_end` | Daily UTC window as `HHMM` integers (`1630` = 16:30). Start inclusive, end exclusive. If end ≤ start the window wraps midnight (match `t >= start \|\| t < end`); `0` as end = end of day |
| `utc_days` | Weekdays (`"monday"`…`"sunday"`) evaluated at request instant; scopes the window (or the whole day). Absent = every day |
| price keys | Same keys/units as base pricing; absent keys inherit the base price |

Rules: an entry applies when **all** its conditions match; when several apply, **later entries win per key**; the top-level prices always reflect default conditions *right now* (for time windows, the window currently in effect). Time-scheduled entries tile the full day/week (exactly one matches any instant). **Skip entries containing condition fields you don't recognize** (new conditions may be added).

```json
"pricing": {
  "prompt": "0.0000025",
  "completion": "0.00001",
  "overrides": [ { "min_prompt_tokens": 200000, "prompt": "0.000005", "completion": "0.00002" } ]
}
```

`top_provider.max_completion_tokens` is a **ceiling** for `max_tokens`, not a guaranteed output size: input and output share the context window.

`benchmarks.design_arena[]`: `{ arena, category, elo, win_rate, rank }` — Design Arena rankings computed among models listed on OpenRouter only.

`supported_parameters` values documented: `tools`, `tool_choice`, `max_tokens`, `temperature`, `top_p`, `reasoning`, `include_reasoning`, `structured_outputs`, `response_format`, `stop`, `frequency_penalty`, `presence_penalty`, `seed`.

Tokenizers differ per model (GPT/Claude/Llama chunk multi-character tokens; some tokenize per character), so token counts and costs differ for identical text. Billing uses the model's own tokenizer; read `usage` in the response for actual counts.

#### Gotchas

- Do not assume `GET /api/v1/models` lists everything: non-text-output models need `output_modalities=...` or `all`, and **routing variants never appear** (`openai/gpt-5.2:nitro` is a valid `model` without a catalog entry).
- Pricing values are strings; parse as decimals, not floats, for billing math.
- Respect `pricing.overrides` when estimating cost; ignore entries with unknown condition keys rather than applying them.
- `max_completion_tokens` is not a guarantee; remaining context after input bounds actual output.

Sources: https://openrouter.ai/docs/guides/overview/models, https://openrouter.ai/docs/guides/routing/model-variants/overview

### 9.2 Model variants (`:free`, `:nitro`, `:floor`, `:exacto`, `:online`, `:thinking`, `:extended`, `:batch`)

A variant is a `:suffix` on a model ID. There are two kinds:

- **Catalog variants** are separate entries in `GET /api/v1/models` with their own `id`, `pricing`, `context_length`, `supported_parameters`, endpoints. Only models that list them support them.
- **Routing variants** are accepted on **any** model ID, are never catalog entries, and only change provider ordering/eligibility. Metadata (context, capabilities, base price) is the base model's.

| Suffix | Kind | Status | Behavior |
| - | - | - | - |
| `:free` | catalog | Active | Free-tier entry with its own (often lower) rate limits, endpoints, possibly shorter context; pricing zero. |
| `:batch` | catalog | Active | Batch-priced entry served by the Batch API. The Batch API takes the **base** slug and resolves `:batch` itself ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). |
| `:thinking` | catalog | **Deprecated** (being removed) | Reasoning on by default for models that shipped a dedicated reasoning endpoint. Use the `reasoning` parameter ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). |
| `:extended` | catalog | **Deprecated** | Larger context window; **no model offers it now** — requests to `model:extended` have no endpoints and fail. |
| `:nitro` | routing | Active | Sort providers by **throughput** + admit **priority** service-tier endpoints (billed at priority rate when served there). Does **not** admit `ultrafast` endpoints. |
| `:floor` | routing | Active | Sort providers by **price** + admit **flex** service-tier endpoints (billed at flex rate when served there). |
| `:exacto` | routing | Active | Sort providers by quality signals tuned for tool-calling reliability (same signals as Auto Exacto, [§9.5](#95-auto-exacto-and-the-exacto-variant-tool-calling-quality-routing)). Equivalent to `provider.sort: "exacto"`. |
| `:online` | routing | **Deprecated** | Attaches web search results (shortcut for `plugins: [{ "id": "web" }]`). Use the `openrouter:web_search` server tool. |

```json
{ "model": "meta-llama/llama-3.2-3b-instruct:free" }
{ "model": "openai/gpt-5.2:nitro" }
{ "model": "openai/gpt-5.2:floor" }
{ "model": "moonshotai/kimi-k2-0905:exacto", "input": "Draft a concise changelog entry." }
```

#### `:nitro` vs `provider.sort: "throughput"`; `:floor` vs `provider.sort: "price"`

- `:nitro` = throughput sort **plus** priority-tier eligibility. Priority endpoints get no special preference: they compete on measured throughput and win only when fastest. For throughput sorting *without* priority eligibility, set `provider.sort: "throughput"`. For OpenAI Ultrafast mode use `service_tier: "ultrafast"` or name the `openai/ultrafast` endpoint slug in `provider.order`/`provider.only`.
- `:floor` = price sort **plus** flex-tier eligibility. Unlike `service_tier: "flex"` (which tries flex endpoints first and falls back only to endpoints priced at or below a flex endpoint on both input and output), `:floor` gives flex no preference — flex simply competes on price, and tends to sort first because it is discounted. For price sort *without* flex eligibility, use `provider.sort: "price"`.
- Billing follows the tier the provider actually serves: if a provider sheds the request to its default tier, you pay default rates. The response reports the serving tier (see Service Tiers, [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

#### `:free` billing gotcha

If a `:free` model is in a `models` fallback array, OpenRouter moves to the next model when the free one is rate-limited, unavailable or has no endpoint supporting your request. **Each model is billed at its own price**, so falling back to a paid model is charged. To stay free: list only `:free` models, or use `openrouter/free` alone (falls back only to free models).

#### `:online` migration

`openai/gpt-5.2:online` is equivalent to the `web` plugin. If your app already sends a `web_search` tool (e.g. OpenAI's built-in web search tool type), OpenRouter hoists it to the `openrouter:web_search` server tool, so you can remove `:online`. Doc inconsistency: the `:online` variant page and the web-search plugin page say `:online` is "exactly equivalent to" `{ "model": "openrouter/auto", "plugins": [{ "id": "web" }] }`, while the plugins overview shows `openai/gpt-5.2:online` ≡ `{ "model": "openai/gpt-5.2", "plugins": [{ "id": "web" }] }` (the suffix keeps your model). The latter is the consistent reading.

#### Combining suffixes

- Any order, colon-separated; at most **one catalog variant** and any number of routing variants: `poolside/laguna-s-2.1:free:nitro`, `openai/gpt-5.2:nitro:exacto`, `openai/gpt-oss-20b:free:online`.
- When several **sorting** variants are present (`:nitro`, `:floor`, `:exacto`), the **last one** determines the sort.
- Only the suffixes listed here are variants. Do not rely on any other suffix.
- A catalog suffix on a model without that entry does **not** fall back to the base model: single-model lookup → `404`; endpoints lookup → `200` with `"endpoints": []`; inference fails (no endpoint).

#### Resolving a requested ID to its catalog entry (for SDKs, pickers, agents)

Send the ID unchanged as `model`; resolve metadata separately:

1. Split on `:`; first segment is the base slug.
2. Keep a catalog variant (`:free`, `:batch`, `:thinking`, `:extended`); drop routing variants (`:nitro`, `:floor`, `:exacto`, `:online`).
3. The result is the catalog `id` to read metadata from.

```text
openai/gpt-5.2:nitro              -> openai/gpt-5.2
openai/gpt-5.2:nitro:exacto       -> openai/gpt-5.2
poolside/laguna-s-2.1:free        -> poolside/laguna-s-2.1:free
poolside/laguna-s-2.1:free:nitro  -> poolside/laguna-s-2.1:free
```

Or let the API do it: `GET /api/v1/model/openai/gpt-5.2:nitro` → `{ "data": { "id": "openai/gpt-5.2", ... } }`; `GET /api/v1/models/openai/gpt-5.2:nitro/endpoints` → base endpoints. `GET /api/v1/model/openai/gpt-5.2:free` → `404`; `.../openai/gpt-5.2:free/endpoints` → `{ "data": { "id": "openai/gpt-5.2:free", "endpoints": [] } }`. Treat either as "unavailable", **not** as a reason to retry with the base slug.

**Model pickers:** routing variants are not in the catalog; derive them. Every model entry accepts `:nitro`, `:floor` and `:exacto`; present them as options on the base model and keep reading metadata from the base entry. `GET /api/v1/models/{author}/{slug}/endpoints` lists the providers the sort applies to.

#### Gotchas

- **Never strip every suffix**: stripping `:free` resolves to the paid entry (larger context, non-zero price) — wrong metadata for the free request.
- `:nitro`/`:floor` can change the price you pay (priority/flex tiers); `provider.sort` alone cannot.
- `:extended` always fails today; `:thinking` is being removed; `:online` is deprecated.
- Variant suffixes also parse on router slugs (e.g. `openrouter/fusion-flash:free`), and `:nitro` on `openrouter/pareto-code` switches its selection to fastest ([§9.12](#912-pareto-router-openrouterpareto-code)).

Sources: https://openrouter.ai/docs/guides/routing/model-variants/overview, https://openrouter.ai/docs/guides/routing/model-variants/free, https://openrouter.ai/docs/guides/routing/model-variants/nitro, https://openrouter.ai/docs/guides/routing/model-variants/floor, https://openrouter.ai/docs/guides/routing/model-variants/exacto, https://openrouter.ai/docs/guides/routing/model-variants/online, https://openrouter.ai/docs/guides/routing/model-variants/thinking, https://openrouter.ai/docs/guides/routing/model-variants/extended, https://openrouter.ai/docs/guides/features/plugins

### 9.3 Provider routing: the `provider` object

`provider` is accepted on the Responses API and Chat Completions (and in reduced form on Images, TTS, STT, Videos — see [§9.22](#922-image-generation)–[§9.25](#925-speech-to-text-post-apiv1audiotranscriptions)). It controls which provider **endpoints** may serve each model in the request and in what order.

#### Field reference

| Field | Type | Default | Description |
| - | - | - | - |
| `order` | string[] | – | Provider/endpoint slugs to try in order (e.g. `["anthropic", "openai"]`). Bypasses default routing. |
| `allow_fallbacks` | boolean | `true` | Allow providers outside `order`/the primary when they are unavailable. `false` ⇒ use only the primary/listed providers and return the upstream error. |
| `require_parameters` | boolean | `false` | Only route to providers that support **all** parameters in the request. |
| `data_collection` | `"allow"` \| `"deny"` | `"allow"` | `deny` ⇒ only providers that do not collect user data. If none qualify, the request errors. |
| `zdr` | boolean | – | Only Zero Data Retention endpoints (Safety Retention endpoints also eligible unless your settings are "ZDR only"). `false`/omitted has no effect. |
| `enforce_distillable_text` | boolean | – | Only models whose author allows text distillation. `false`/omitted has no effect. |
| `only` | string[] | – | Allowlist of provider slugs for this request. |
| `ignore` | string[] | – | Provider slugs to skip for this request. |
| `quantizations` | string[] | – | Filter by quantization: `int4`, `int8`, `fp4`, `mxfp4`, `nvfp4`, `fp6`, `fp8`, `mxfp8`, `fp16`, `bf16`, `fp32`, `unknown`. |
| `sort` | string \| object | – | `"price"`, `"throughput"`, `"latency"` (spec also lists `"exacto"`), or `{ "by": ..., "partition": "model" \| "none" }`. When set, no load balancing; providers are tried in sorted order. |
| `preferred_min_throughput` | number \| object | – | Preferred minimum tokens/sec. Number = p50; object = `{ p50?, p75?, p90?, p99? }`. Deprioritizes, never excludes. |
| `preferred_max_latency` | number \| object | – | Preferred maximum latency (seconds). Number = p50; object = percentile cutoffs. Deprioritizes, never excludes. |
| `max_price` | object | – | Max acceptable pricing: `prompt`, `completion` (USD per **million** tokens), `request` (per request), `image` (per image); spec also lists `audio` (per audio unit). Requests fail if no endpoint fits. |
| `options` | object | – | (Spec; used by Images/Video/TTS/STT guides) provider-specific passthrough keyed by provider slug, e.g. `{ "openai": { ... } }`. Provider segment case-insensitive; an endpoint tag after `/` must match exactly. Only the matched provider's options are forwarded; unknown keys silently dropped. |

`provider` itself and most fields are nullable in the spec, and the schema declares `additionalProperties: false`.

Spec type notes: `max_price` sub-fields are typed as **strings** in the OpenAPI spec, while the guide's example uses numbers (`{"prompt": 1, "completion": 2}`). Both appear in docs; strings match the spec.

#### Default routing (what happens when you set nothing)

For each model, OpenRouter compares what a good response would actually cost at each provider, using inputs measured from recent production traffic (routing reacts within minutes):

- **Effective price** — real price including the provider's cache hit rate and typical input/output mix.
- **Throughput** — end-to-end output tokens/sec (a faster provider can charge more and still win).
- **TTFT** — time to first token.
- **Rate limits** — how often the provider returns 429 for capacity.
- **Reliability** — provider-caused failures.
- **Quality** — whether tool calls come back well formed.

Providers near the best share most traffic; each request picks one **at random weighted by share**; far-behind providers get a small exploration share. On top: providers with far-worse errors/429s get no traffic until they recover (breaker); learned per-provider capacity caps traffic before 429s; bursts of 429s or latency jumps briefly lower share. A failed request's retry is picked the same way from the remaining providers. **Follow-up requests in a conversation stay with the same provider while its prompt cache is warm** (sticky routing, [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). Internals: [§9.4](#94-how-default-traffic-routing-works-load-balancing-internals).

Soft filters applied even by default:

- Requests with `tools` or `tool_choice` are routed, best effort, to providers known to support tool use (and reordered by Auto Exacto, [§9.5](#95-auto-exacto-and-the-exacto-variant-tool-calling-quality-routing)).
- `max_output_tokens` (Responses) / `max_tokens` (Chat) routes only to providers supporting that response length.
- **Default parameter preferences** (even with `require_parameters: false`): `tools`, the response format (`text.format` on Responses, `response_format` on Chat, including structured outputs) and `verbosity`. If some of a model's providers support the parameter, only those are used; if none do, the model is still used and the parameter ignored. This never removes a model from your candidate list (e.g. `models` fallbacks).

**Default routing is bypassed** when you set `sort` (or a default provider sort in account settings at `https://openrouter.ai/settings/preferences`), use `:floor` or `:nitro`, set `order`, or use your own provider key (BYOK). If `only`/`ignore` leave two or more providers, default routing picks among them.

> Business/Enterprise in-region routing (EU/US) is not a `provider` field: send requests to `https://eu.openrouter.ai` or `https://us.openrouter.ai` ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

#### Sorting

```typescript
// TypeScript SDK
await openRouter.responses.send({
  responsesRequest: { model: 'meta-llama/llama-3.3-70b-instruct', input: 'Hello', provider: { sort: 'throughput' }, stream: false },
});
```

```python
import os, requests
requests.post("https://openrouter.ai/api/v1/responses",
  headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
  json={"model": "meta-llama/llama-3.3-70b-instruct", "input": "Hello", "provider": {"sort": "throughput"}})
```

- `"price"`: lowest price first. `"throughput"`: highest throughput first. `"latency"`: lowest latency first. `"exacto"` (spec enum; same as `:exacto`): quality-first for tool calling.
- Shortcuts: `:nitro` ⊇ `sort: "throughput"` (+ priority tier); `:floor` ⊇ `sort: "price"` (+ flex tier). See [§9.2](#92-model-variants-free-nitro-floor-exacto-online-thinking-extended-batch).
- An explicit sort by price/throughput/latency takes precedence over Exacto ordering.

**Advanced sort with `partition`** (matters with `models` fallbacks):

| Field | Type | Default | Description |
| - | - | - | - |
| `sort.by` | string | – | `"price"`, `"throughput"`, `"latency"` (spec also `"exacto"`) |
| `sort.partition` | string | `"model"` | `"model"`: group endpoints by model before sorting (primary model's endpoints always first; fallbacks remain fallbacks). `"none"`: sort all endpoints of all listed models globally. |

The deprecated top-level `route` field is an alias: `"fallback"` ⇒ `partition: "model"`, `"sort"` ⇒ `partition: "none"`.

Use case 1 — fastest of several acceptable models:

```json
{
  "models": ["anthropic/claude-sonnet-4.5", "openai/gpt-5-mini", "google/gemini-3-flash-preview"],
  "input": "Hello",
  "provider": { "sort": { "by": "throughput", "partition": "none" } }
}
```

Use case 2 — cheapest model meeting a performance floor:

```json
{
  "models": ["anthropic/claude-sonnet-4.5", "openai/gpt-5-mini", "google/gemini-3-flash-preview"],
  "input": "Hello",
  "provider": {
    "sort": { "by": "price", "partition": "none" },
    "preferred_min_throughput": { "p90": 50 }
  }
}
```

Use case 3 — maximize BYOK usage across models: with `sort: { by: "price", partition: "none" }`, if you have a BYOK key for OpenAI but not Anthropic, the GPT endpoint with your key can win even though Claude is listed first. BYOK endpoints are prioritized automatically when you have keys and set no `order`; `partition: "none"` lets that prioritization cross model boundaries.

#### Performance thresholds (`preferred_min_throughput`, `preferred_max_latency`)

- Metrics are percentiles over a **rolling 5-minute window** per model+provider: `p50`, `p75`, `p90`, `p99`.
- A bare number applies to **p50**. With an object, **all** specified cutoffs must be met to be in the preferred group.
- Endpoints that miss thresholds are **moved to the end**, not excluded. Thresholds never prevent a request from running (unlike `max_price`). With fallback models, a fallback that meets the threshold may be used before a primary that doesn't.
- Guidance: real-time UIs → p90/p99 latency; batch → p50 throughput; SLAs → multiple cutoffs; cost → combine with `sort: "price"`.

```json
{
  "model": "deepseek/deepseek-v3.2",
  "input": "Hello",
  "provider": {
    "preferred_max_latency": { "p50": 1, "p90": 3, "p99": 5 },
    "preferred_min_throughput": { "p50": 100, "p90": 50 }
  }
}
```

TypeScript SDK spelling: `preferredMaxLatency`, `preferredMinThroughput`.

#### Ordering specific providers (`order`) and fallbacks

- Providers in `order` are tried one at a time in order, for the model in the request; providers that don't host the model are skipped. If none are operational, routing proceeds to other providers unless `allow_fallbacks: false`.
- `order` outranks BYOK priority, but within each named provider your BYOK key is tried before OpenRouter's shared capacity.

```json
// Skips OpenAI (doesn't host Mistral Small 3.2), tries DeepInfra, then normal routing
{ "model": "mistralai/mistral-small-3.2-24b-instruct", "input": "Hello", "provider": { "order": ["openai", "deepinfra"] } }

// Same, but fail if DeepInfra fails
{ "model": "mistralai/mistral-small-3.2-24b-instruct", "input": "Hello", "provider": { "order": ["openai", "deepinfra"], "allow_fallbacks": false } }
```

`allow_fallbacks: false` without `order` restricts the request to the top-ranked provider only.

#### Endpoint slugs: targeting variants, regions and tiers

Every endpoint slug has the shape `provider[/variant][/region][/tier]` (each segment only when needed): variant = quantization (`fp4`) or provider label (`zdr`, `turbo`); region (`us-east5`, `us`); service tier in the provider's spelling (`priority`, `fast`, `turbo`, `flex`), always last. Copy exact slugs from the copy button on model pages.

| Slug in request | Matches |
| - | - |
| `"google-vertex"` | All Google Vertex endpoints (every region) |
| `"google-vertex/us-east5"` | Only the `us-east5` endpoint |
| `"deepinfra"` | All DeepInfra endpoints (e.g. fp8 and turbo) |
| `"deepinfra/turbo"` | Only the turbo endpoint |
| `"baseten/fp4"` | Every region of the fp4 variant (`baseten/fp4/us`, ...) |

- Applies to `order`, `only`, `ignore`. Dropping a trailing segment matches every endpoint sharing the prefix — **except dropping the tier never matches a tier endpoint**.
- A base slug does **not** opt into a service-tier endpoint (e.g. `openai/fast`, `google-vertex/flex`); use `service_tier` or the tier-suffixed slug. Tier endpoints already in the routing pool (e.g. priority endpoints of open-weight models) do match their base slug.

```json
{ "model": "google/gemma-4-31b-it", "input": "Hello", "provider": { "order": ["deepinfra/turbo"], "allow_fallbacks": false } }
```

#### `require_parameters`

Default routing may send a request to a provider that ignores unknown parameters. With `require_parameters: true` such providers are excluded entirely. Typical use: structured outputs / JSON mode.

```json
{ "input": "Hello", "provider": { "require_parameters": true }, "text": { "format": { "type": "json_object" } } }
```

#### `data_collection`, `zdr`, `enforce_distillable_text`

- `data_collection: "deny"` → only providers that don't collect user data (`"allow"` = providers that may store data non-transiently and train on it). Data Policy tags on model pages are best knowledge, not definitive. Account-wide version in `https://openrouter.ai/settings/privacy`.
- `zdr: true` → only ZDR endpoints (+ Safety Retention endpoints unless settings/guardrail say **ZDR only**). It is an **OR** with account-wide and guardrail ZDR settings: the request flag can only turn ZDR on, never override account/guardrail enforcement. ZDR filters **inference endpoints**; Advisor and Subagent server tools forward your `provider` preferences (incl. `zdr`) to inner generations; tool backends are not filtered by `zdr` ([§9.27](#927-server-tools-concepts-catalog-limits-privacy)). Video generation is never ZDR-eligible ([§9.23](#923-video-generation-asynchronous)). Details in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy).
- `enforce_distillable_text: true` → only models whose author enabled text distillation (for dataset / distillation workflows).

```json
{ "model": "openai/gpt-5-mini", "input": "Hello", "provider": { "zdr": true } }
{ "model": "meta-llama/llama-3.3-70b-instruct", "input": "Hello", "provider": { "enforce_distillable_text": true } }
```

#### `only` and `ignore`

```json
{ "model": "openai/gpt-5-mini", "input": "Hello", "provider": { "only": ["azure"] } }
{ "model": "meta-llama/llama-3.3-70b-instruct", "input": "Hello", "provider": { "ignore": ["deepinfra"] } }
```

- Account-wide allowed providers (privacy settings) act as a **ceiling**; the request's `only` narrows within it. If no provider satisfies both ⇒ **404**.
- Request `ignore` is **merged** with account-wide ignored providers.
- If two or more providers remain, default routing picks among them; both reduce fallback options.
- Private provider slugs work in `order`/`only`/`ignore` ([§9.7](#97-private-endpoints-and-private-providers-routing-view)).

#### `quantizations`

Filter open-weight model providers by precision. `fp4` includes `mxfp4`/`nvfp4`; `fp8` includes `mxfp8`. Quantized models may degrade on some prompts.

```json
{ "model": "meta-llama/llama-3.1-8b-instruct", "input": "Hello", "provider": { "quantizations": ["fp8"] } }
```

#### `max_price`

`{"prompt": 1, "completion": 2}` routes only to providers with ≤ $1/M prompt and ≤ $2/M completion tokens. `request` caps per-request pricing; `image` caps per-image price. Commonly combined with `sort`, e.g. "highest throughput as long as ≤ $x/M". Unlike preferences, `max_price` **blocks** the request when nothing qualifies. It also applies to models chosen by `openrouter/auto`.

```json
{ "model": "meta-llama/llama-3.3-70b-instruct", "input": "Hello",
  "provider": { "sort": "throughput", "max_price": { "prompt": 1, "completion": 2 } } }
```

#### Provider-specific headers: `x-anthropic-beta`

OpenRouter passes through supported Anthropic beta features:

| Feature | Header value | Effect |
| - | - | - |
| Interleaved thinking | `interleaved-thinking-2025-05-14` | Claude's thinking interleaves with output/tool calls instead of one block |
| Structured outputs (strict tools) | `structured-outputs-2025-11-13` | Strict tool use: validates tool parameters against your schema |

Combine with commas: `x-anthropic-beta: interleaved-thinking-2025-05-14,structured-outputs-2025-11-13`.

Managed automatically (no header needed): prompt caching and extended context (by model capability); the structured-outputs header for JSON-schema response formats (`text.format.type: "json_schema"` / `response_format.type: "json_schema"`); fine-grained tool streaming (`eager_input_streaming: true` set on every user tool for streamed requests with tools). **For `strict: true` on tools you must send `structured-outputs-2025-11-13` yourself; otherwise OpenRouter strips `strict` and routes normally.**

```typescript
// TypeScript SDK: headers go in the second (options) argument
await openRouter.responses.send(
  { responsesRequest: { model: 'anthropic/claude-sonnet-4.5', input: 'Solve step by step: 15% of 240?', stream: true } },
  { headers: { 'x-anthropic-beta': 'interleaved-thinking-2025-05-14' } },
);
```

#### Gotchas

- Use snake_case in raw JSON and camelCase in the TS SDK (`allowFallbacks`, `requireParameters`, `dataCollection`, `enforceDistillableText`, `preferredMinThroughput`, `preferredMaxLatency`). Mixing them silently does nothing in raw JSON — and the spec's `additionalProperties: false` means a wrong key may be rejected.
- `order` alone does not prevent fallback to other providers; add `allow_fallbacks: false`.
- `sort` disables load balancing and Auto Exacto; sorting by price can hurt tool-call quality but improves prompt-cache stickiness ([§9.5](#95-auto-exacto-and-the-exacto-variant-tool-calling-quality-routing)).
- Thresholds (`preferred_*`) never fail a request; `max_price`, `only`, `data_collection: "deny"`, `zdr` can (404/error when nothing qualifies).
- A base provider slug won't select a service-tier endpoint; use the full tier slug or `service_tier`.
- `require_parameters: true` + structured outputs is the reliable way to avoid providers that ignore `response_format`.

Sources: https://openrouter.ai/docs/guides/routing/provider-selection

### 9.4 How default traffic routing works (load-balancing internals)

When OpenRouter chooses the provider, each endpoint gets a **share** of the model's traffic based on its **adjusted price** and **speed**.

- **Adjusted price** = effective (cache-adjusted) price + penalties for TTFT, reliability/quality failures, and 429s.
- **Speed** = end-to-end output TPS (includes TTFT).
- Endpoints inside the **competitive edge** (a curve where faster endpoints may carry a higher adjusted price) get most traffic; being slightly behind the best costs little. Past the edge, share drops steeply but never to zero (**exploration**) so improvements are noticed.
- Each request picks an endpoint at random weighted by share; a failed attempt's retry is drawn the same way from the remaining endpoints.

Limits on top of shares:

| Limit | Behavior |
| - | - |
| Breaker | If reliability, quality or 429 rate is far worse than peers', traffic pauses until recovery |
| Traffic cap | Learned load at which the endpoint starts returning 429s; excess share goes elsewhere; cap rises once 429s stop |
| Short-term backoff | Bursts of 429s or sudden latency jumps briefly lower share |

Inputs (measured from recent production traffic; last few minutes weigh most; low-traffic endpoints start as a typical peer and converge to their own numbers):

| Input | Definition / example |
| - | - |
| Effective price | Price actually charged over the last **30 minutes** across all traffic, reflecting real cache-hit rate and input/output mix. E.g. 40K uncached input @ $2.00/M + 60K cached @ $0.50/M + ~4K output @ $8.00/M ⇒ $0.142 per request. Routing estimates each new request's tokens and prices it with this. |
| Speed | Output tokens/sec end-to-end. E.g. 5 s TTFT + 500 tokens in 5 s ⇒ 50 TPS. Main factor traded against price. |
| TTFT | Added directly to adjusted price (matters for interactive and agentic loops where every tool call waits for a first token). |
| Reliability | Provider-caused failure, heavy penalty (e.g. 1% error rate × 8× penalty ≈ +8% adjusted price). **Counts:** 5xx; no response (dropped connections, timeouts); setup errors 401, 402, 404, 405, 408, 410, 421, 423, 424, 426, 498; responses failing partway. **Doesn't count:** 400, 413, 422 (bad requests); 403, 451 (geo/legal blocks); 499 (user disconnect); 429 (separate). |
| Quality | How often tool-calling responses are well formed (e.g. 95% well-formed ≈ +5%). Endpoints flagged for broken tool calls or benchmark accuracy well below expected fall far behind (exploration traffic only) until the flag clears. |
| 429s | Charged as the wait + penalty weighted by 429 rate (usually small, e.g. $2.50 wait+penalty × 0.4% ≈ +$0.01); matter mostly via traffic cap, backoff and breaker. |
| Learned capacity | Routing learns the load sustainable with low 429s; rises automatically when the provider adds capacity. |

**Excluded traffic** (no load balancing; request goes where asked): provider `order` set, or an allow/ignore list leaving only one provider; BYOK; sort by price/throughput/latency.

Sources: https://openrouter.ai/docs/guides/providers/traffic-routing, https://openrouter.ai/docs/guides/routing/provider-selection

### 9.5 Auto Exacto and the `:exacto` variant (tool-calling quality routing)

**Auto Exacto** is a routing step that runs **by default on every request that includes tools** (no configuration). It reorders the chosen model's providers using:

- **Throughput** (real-time TPS; Performance tab on model pages).
- **Tool-calling success rate** (Tool Call Error Rate; Performance tab).
- **Benchmark data** from OpenRouter's benchmark harness.

Underperformers are deprioritized; strong track records move to the front; limited-data providers stay behind established ones.

**`:exacto`** (or `provider.sort: "exacto"`) applies the same signals explicitly on any model slug, including requests without tools. Works with `models` fallbacks: any model with `:exacto` requests Exacto sorting when selected. It is a virtual variant (no separate endpoint pool); most useful on tool-calling models with multiple providers and meaningful variance. An explicit sort by price/throughput/latency takes precedence over Exacto.

#### How tool-calling success rate is measured

- Validator: tool call `arguments` validated against `tools[].function.parameters` using `@cfworker/json-schema` pinned to **JSON Schema Draft 7** (`new Validator(parameters, '7')`). Absent/uncompilable schemas count as valid.
- Regex: native JavaScript `RegExp` (V8/ECMA-262) for `pattern`/`patternProperties`, no conformance shim.
- Per-call buckets: `InvalidJson` (`JSON.parse(arguments)` throws), `UnknownName` (name not in request `tools[]`), `SchemaMismatch` (validator `valid: false`); else valid.
- Request-level aggregation: `requests_with_tool_call_errors / requests_where_finish_reason_is_tool_calls` (a request with 5 calls and 1 bad one = 1 errored request).
- Truncation exemption: when generation hits the token limit (finish reason normalizing to `length`, e.g. `max_tokens`/`MAX_TOKENS`, or bare Responses `incomplete`), the **last** tool call is recorded as `truncated-arguments` (not an error) if its args fail to parse or never arrived. Earlier calls still count, and so does the last call when text/reasoning followed it.
- Caveats: Draft 2019-09/2020-12 keywords (`unevaluatedProperties`, `$dynamicRef`) are not enforced; JS regex semantics differ from the JSON Schema dialect.

#### Benchmark harness

- **GPQA Diamond**: temperature `0.5`, deterministic per-question option shuffling (by index — not comparable to openbench, which always puts the answer at `B`), 10 epochs default.
- **Tau2-Bench Airline**: agentic tool-calling, LLM user-simulator, binary reward (final DB state, golden actions, communication checks), temperature `0`, 1 epoch.
- Each run pins one endpoint (no fallback) plus an unpinned baseline run on default routing; tool presets skipped on endpoints without tool support.
- Routing uses each endpoint's score over a **rolling 32-day window**; minimum samples: ≥50 GPQA questions, ≥45 Tau2 tasks.
- Threshold: baseline = median of per-endpoint scores in the first ~21 days for that model+benchmark; derank threshold = baseline − **2σ**. Baseline is provisional (recomputed on each qualifying result) until the window closes, then fixed.
- Scores: **AutoExacto Benchmarks** card on enrolled model pages (per provider/endpoint); throughput and tool-call error rate on the Performance tab.

#### Interaction with prompt caching

Auto Exacto may reorder providers mid-session and override sticky routing, causing cache misses in tool-calling agent loops.

- If cache hit rate matters most (large tool definitions every turn): opt out with `provider.sort: "price"`, the `:floor` variant, or a default provider sort of price in account settings (`https://openrouter.ai/settings/preferences`). Any of these bypasses Auto Exacto; sticky routing then keeps the same provider.
- If you need both: defer most tool definitions with Tool Search (`defer_loading: true`, [§9.31](#931-server-tools-tool-search-openroutertool_search-and-deferred-tools)) so the cached prefix is small and cold starts are cheap.

Sources: https://openrouter.ai/docs/guides/routing/auto-exacto, https://openrouter.ai/docs/guides/routing/model-variants/exacto

### 9.6 Model fallbacks (`models` array)

`models` is an array of model IDs in priority order. If the first model's request errors, OpenRouter tries the next.

```typescript
// TypeScript SDK
const response = await openRouter.responses.send({
  responsesRequest: {
    models: ['~anthropic/claude-sonnet-latest', 'gryphe/mythomax-l2-13b'],
    input: 'What is the meaning of life?',
  },
});
```

```python
requests.post("https://openrouter.ai/api/v1/responses",
  headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
  json={"models": ["~anthropic/claude-sonnet-latest", "gryphe/mythomax-l2-13b"], "input": "What is the meaning of life?"})
```

Behavior:

- **Any error** can trigger a fallback by default, including context-length validation errors, moderation flags for filtered models, rate limiting, and downtime. If the last fallback errors, that error is returned.
- Routing within each model follows the `provider` object. By default (`sort.partition: "model"`) all of the primary model's endpoints are tried before the next model; `partition: "none"` sorts endpoints across all models ([§9.3](#93-provider-routing-the-provider-object)). `preferred_*` thresholds can cause a fallback model that meets them to be used first.
- **Billing:** priced at the model **actually used**, reported in the response `model` field. Applies to `:free` models: falling back to a paid model is billed. Keep requests free by listing only `:free` models.
- With the OpenAI SDK, pass `models` through `extra_body` (Python) or as an extra field (TypeScript, needs `// @ts-expect-error`); the top-level `model` is tried first, then `models` in order:

```python
import os
from openai import OpenAI

openai_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])

response = openai_client.responses.create(
    model="~openai/gpt-sol-latest",
    extra_body={
        "models": ["~anthropic/claude-sonnet-latest", "gryphe/mythomax-l2-13b"],
    },
    input="What is the meaning of life?",
)
print(response.output_text)
```

```typescript
import OpenAI from 'openai';

const openrouterClient = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });

const response = await openrouterClient.responses.create({
  model: '~openai/gpt-sol-latest',
  // @ts-expect-error -- OpenRouter extension not in the OpenAI types
  models: ['~anthropic/claude-sonnet-latest', 'gryphe/mythomax-l2-13b'],
  input: 'What is the meaning of life?',
});
console.log(response.output_text);
```

#### Anthropic Messages API: `fallbacks`

`/api/v1/messages` accepts Anthropic-SDK-shaped `fallbacks`, mapped onto OpenRouter's `models` routing (same triggering errors; OpenRouter handles it, not Anthropic's server-side fallback feature).

```typescript
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ baseURL: 'https://openrouter.ai/api', apiKey: process.env.OPENROUTER_API_KEY });
await anthropic.beta.messages.create({
  model: 'anthropic/claude-sonnet-4.5',
  max_tokens: 1024,
  fallbacks: [{ model: 'anthropic/claude-opus-4.1' }],
  messages: [{ role: 'user', content: 'What is the meaning of life?' }],
});
```

Limitations: each entry accepts only `model` (per-attempt `max_tokens`, `thinking`, `speed`, `output_config` ⇒ 400); cannot combine with `models` (⇒ 400); at most **3** entries (⇒ 400).

#### Gotchas

- Fallbacks are not load balancing; the first model is always preferred unless `partition: "none"`.
- A context-length error on the primary will hop to a fallback that may have a different (smaller/larger) window — design fallbacks with compatible capabilities.
- `~latest` aliases are valid in `models` (the docs' own examples use them), but Switchyard does not accept router slugs or `~latest` aliases as candidates ([§9.16](#916-switchyard-nvidiaswitchyard)).
- The deprecated top-level `route` field (`"fallback"`/`"sort"`) maps to `provider.sort.partition` (`"model"`/`"none"`).

Sources: https://openrouter.ai/docs/guides/routing/model-fallbacks, https://openrouter.ai/docs/guides/routing/model-variants/free

### 9.7 Private endpoints and private providers (routing view)

Enterprise-plan add-on (enable via account rep or `https://openrouter.ai/enterprise/form`; admins manage at `https://openrouter.ai/settings/private-endpoints`). A private endpoint adds **your own dedicated or fine-tuned deployment of a catalog model** to that model's provider list — no new model, same slug.

Routing behavior:

- Only approved users/orgs can see or call it; it never appears in public lists, rankings, search, charts or benchmarks.
- Called via the standard API (Chat Completions and Responses); works with model fallbacks, provider selection and other routing features.
- **For callers with access, OpenRouter prefers the private endpoint**; public providers stay available as fallbacks if you list them.
- Requests authenticate with **your provider key (BYOK)**; each workspace calling it needs a BYOK key for that provider.

Requirements: hosted by a BYOK-supported provider; serves a model already in the catalog with the same request/response shape and behavior (inherits slug and capabilities).

Lifecycle (wizard or API with an **organization Management API key**; personal-account keys rejected; full endpoint reference in [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)): Blueprint (catalog model + provider) → Connect (HTTPS base URL, upstream model/deployment ID, optional pricing for cost reporting, ZDR/retention declaration) → Test (key accepted, OpenAI-compatible response, streaming, usage fields, served model ID matches) → Activate. Drafts are hidden and unroutable.

```bash
curl https://openrouter.ai/api/v1/private-endpoints \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: gpt-4o-prod" \
  -d '{ "model_permaslug": "openai/gpt-4o-2024-08-06", "provider_slug": "openai",
        "base_url": "https://api.openai.com/v1", "upstream_model_id": "gpt-4o-2024-08-06",
        "pricing": { "prompt": "0.0000025", "completion": "0.00001" },
        "activate": { "workspace_id": "<workspace-id>" } }'
```

Key rules: `POST /api/v1/private-endpoints` (create draft) → `/{id}/validate` (`workspace_id` with a BYOK key) → `/{id}/activate`; `activate` in the create body does all three. Failed validation keeps the draft (fix with `PATCH`, re-validate). `Idempotency-Key` reuse with a different body ⇒ `422 idempotency_key_reused`. After activation, `pricing`, `declared_zdr`, `declared_region` can be patched; `base_url`/`upstream_model_id` cannot (`409 already_active`). `/disable`, `/enable`, `DELETE` (`draft_only=true` refuses deleting ever-activated endpoints with 409). Terraform: `openrouter_private_endpoint` resource.

**Private providers**: for self-hosted deployments without a public provider. Fields: `name`, `slug`, `display_name`, OpenAI-compatible HTTPS `base_url`. Visible only to your org; recorded as retaining/training/publishing nothing so its endpoints stay eligible under every data-policy setting (not verified upstream). **The slug works anywhere a provider slug is accepted: BYOK keys and `provider.order`, `only`, `ignore`.** Name/slug fixed at creation and may not match a public provider; deleting a provider with endpoints ⇒ `409 provider_has_endpoints`.

Limits: 10 private endpoints per org by default (drafts count; can be raised); 5 private providers per org. In-region routing: eligible when a region can be derived from the base URL or a data region is declared; otherwise global `openrouter.ai` only.

Sources: https://openrouter.ai/docs/guides/routing/private-endpoints

### 9.8 Routers overview: choosing a model-selection mechanism

Routers are model slugs (or alias forms) that select or orchestrate concrete models. The response `model` field always names the concrete model that answered. Per-request router settings go in the `plugins` array under a router-specific plugin `id`; account defaults live on the Routing page (`https://openrouter.ai/settings/routing`) or the Plugins page (`https://openrouter.ai/settings/plugins`).

| Router | `model` value | Config plugin `id` | How it chooses | Pricing |
| - | - | - | - | - |
| Auto Router | `openrouter/auto` (`openrouter/auto-beta` early access) | `auto-router` (`auto-beta-router`) | Classifies the prompt into ~30 task types, ranks models by community spend share for that task (trailing 7 days), applies a cost-tier band | Selected model's rate; no router fee |
| Body Builder | `openrouter/bodybuilder` | – | Turns natural language into an array of Chat Completions request bodies for you to execute | Generation free; executed requests at standard rates |
| Free Models Router | `openrouter/free` | – | Random free model among those supporting your request's features | Free |
| Latest resolution | `~author/family-latest` | – | Newest visible model in the family | Concrete model's rate |
| Pareto Router | `openrouter/pareto-code` | `pareto-router` | Coding models by Artificial Analysis coding-percentile tier; cheapest in tier (fastest with `:nitro`) | Selected model's rate |
| Fusion Router | `openrouter/fusion`, `openrouter/fusion-flash` | `fusion` | Outer model may call `openrouter:fusion`: parallel panel + analyst | ~4–5× a single completion with default 3-model panel |
| Jev Router | `typesafe/jev-router`, `<author>/auto` | `jev-router` | Jev decision model picks model + reasoning effort per request/turn | Selected model's rate |
| Switchyard | `nvidia/switchyard` | `switchyard-router` | NVIDIA NeMo Switchyard picks the efficient vs capable tier among 1–3 candidates (tiers assigned by price) | Answering model's rate; judge calls billed as normal generations |

Decision guide:

- Unknown/varied prompts, want market-proven picks → `openrouter/auto` (+ `cost_tier`).
- Coding with a quality floor, cheapest acceptable → `openrouter/pareto-code`.
- A decision model choosing model **and** reasoning effort, with cost tiers and include/exclude lists → `typesafe/jev-router`.
- A cheap and a strong model, per-turn escalation in agent loops → `nvidia/switchyard` (`stage`/`composite`).
- Hard, high-stakes questions where multiple perspectives help → `openrouter/fusion`.
- Zero-cost prototyping → `openrouter/free` (or a specific `:free` model).
- Always the newest version of a family without redeploys → `~author/family-latest`; pin a concrete slug for reproducibility.
- Run one prompt across several named models in parallel → `openrouter/bodybuilder`.
- Fixed priority list with failover → `models` array ([§9.6](#96-model-fallbacks-models-array)), not a router.

Router metadata: send header `X-OpenRouter-Metadata: enabled` to get `openrouter_metadata.pipeline` in responses, with a stage per router/plugin (Auto Router `data.task_type`; Jev `resolved_models`, `candidates`, ...; Switchyard `strategy`, `judge_ms`, ...). Full shape in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) (Router Metadata).

Sources: https://openrouter.ai/docs/guides/routing/routers/auto-router, https://openrouter.ai/docs/guides/routing/routers/body-builder, https://openrouter.ai/docs/guides/routing/routers/free-router, https://openrouter.ai/docs/guides/routing/routers/latest-resolution, https://openrouter.ai/docs/guides/routing/routers/pareto-router, https://openrouter.ai/docs/guides/routing/routers/fusion-router, https://openrouter.ai/docs/guides/routing/routers/jev-router, https://openrouter.ai/docs/guides/routing/routers/switchyard-router

### 9.9 Auto Router (`openrouter/auto`, `openrouter/auto-beta`)

Selects a model for each prompt based on what the OpenRouter market spends on for that kind of task.

- `openrouter/auto` — stable; send it as `model`, nothing else required.
- `openrouter/auto-beta` — early-access track; same behavior, but per-request settings must use plugin id **`auto-beta-router`**. **Each slug only reads settings under its own plugin id**; settings under the other id are accepted but silently ignored (`allowed_models`, `excluded_models`, `cost_tier` have no effect).

How it works:

1. **Classify**: a lightweight in-flight classifier assigns one of ~30 task types (e.g. `code:debugging`, `agent:multi_step_planning`, `qa_knowledge`, `math`, `customer_support`, `research_report`). No retention required; rankings use aggregate anonymized spend.
2. **Rank**: models by real-world **share of spend** for that task over a trailing 7-day window (task-spend rankings at `https://openrouter.ai/rankings#task-spend`); follows workload migrations within days.
3. **Cost tier**: `cost_tier` selects a band: `low`, `medium`, `high`, `xhigh`, or `max`.
4. **Route with fallbacks**: top surviving models (spend-share order) become primary + fallbacks after honoring account model/provider restrictions, guardrails, ZDR policies, `allowed_models`, and output-modality requirements. If classification/rankings are unavailable, it degrades to a default model set — routing infrastructure failures never fail the request.

```typescript
// TypeScript SDK
const r = await openRouter.responses.send({
  responsesRequest: {
    model: 'openrouter/auto',
    input: 'Explain quantum entanglement',
    plugins: [{ id: 'auto-router', allowedModels: ['anthropic/*', 'openai/gpt-5.1'], costTier: 'medium' }],
  },
});
console.log('Model used:', r.model);
```

```json
{
  "model": "openrouter/auto",
  "input": "Explain quantum entanglement",
  "plugins": [{
    "id": "auto-router",
    "allowed_models": ["anthropic/*", "openai/*"],
    "excluded_models": ["openai/gpt-4o"],
    "cost_tier": "xhigh"
  }]
}
```

#### `auto-router` / `auto-beta-router` plugin fields

| Field | Type | Default | Description |
| - | - | - | - |
| `id` | `"auto-router"` / `"auto-beta-router"` | required | Must match the slug used |
| `allowed_models` | string[] | all ranked candidates | Wildcard patterns restricting candidates. Up to 1024 patterns, each ≤1024 chars, ≤65,536 chars total |
| `excluded_models` | string[] | – | Same syntax; applied **after** `allowed_models` (exclusion always wins) |
| `cost_tier` | `low` \| `medium` \| `high` \| `xhigh` \| `max` | ≈ `low` band when no cost setting | Cost-percentile band (spec): low = [0,20), medium = [20,40), high = [40,60), xhigh = [60,80), max = [80,100]. A band, not a ceiling: models cheaper than the band are excluded too. Within the band, ranked by spend share. |
| `cost_quality_tradeoff` | integer 0–10 | spec: 9 when no cost setting | **Deprecated**; ceiling behavior (higher = cheaper). `cost_tier` wins if both are set. |
| `enabled` | boolean | `true` | `false` disables the plugin for this request |
| `pin_model` | boolean | `false` | Spec only, `auto-router` schema only (not in the guide): reuse the model from the most recent assistant message's `model` attribute |

Pattern syntax: `anthropic/*` (all Anthropic), `openai/gpt-5*` (all GPT-5 variants), `google/*`, `openai/gpt-5.1` (exact), `*/claude-*` (any provider with claude in the model name). If restrictions leave nothing: **404** `No models match your request and model restrictions`.

Task-type visibility: with `X-OpenRouter-Metadata: enabled`, the router stage in `openrouter_metadata.pipeline` carries `data.task_type` (absent when classification is unavailable).

**Session stickiness**: the router can pick a different model each turn; it remembers the model a conversation landed on (identified by explicit `session_id` or a fingerprint of the messages) and reuses it only while that model is still a top candidate for the new prompt. Provider stickiness works as for any model (`session_id` body field / `x-session-id` header; [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

**Account defaults**: the Routing page's Auto Router section stores allowed models, excluded models and a cost preference, applying to both `openrouter/auto` and `openrouter/auto-beta`. Saved exclusions win over saved allows. Request fields override saved values unless the section's "prevent overrides" toggle is on.

**Pricing**: standard rate of the selected model; no extra fee. `provider.max_price` still applies to the resolved models' endpoints.

**Limitations**: requires conversational input (`input` string/message list on Responses, or `messages` on Chat), not the legacy `prompt` field. Streaming is supported; tool calling and other features work with the selected model. Router models are excluded from EU regional model lists.

Gotchas:

- `auto-router` settings with `openrouter/auto-beta` (or vice versa) silently do nothing.
- `cost_tier` excludes models *cheaper* than the band — `max` won't choose a cheap model even for trivial prompts.
- Always log `response.model`; it can change turn to turn.

Sources: https://openrouter.ai/docs/guides/routing/routers/auto-router

### 9.10 Body Builder (`openrouter/bodybuilder`)

Transforms a natural-language description into ready-to-execute OpenRouter request bodies, e.g. to run the same task across several models in parallel. **Free** to use; executing the generated requests is billed normally. Accepts and returns **Chat Completions shapes only** (use `/api/v1/chat/completions`, not Responses).

```typescript
// TypeScript SDK (the docs validate output with zod: npm install @openrouter/sdk zod)
const completion = await openRouter.chat.send({
  chatRequest: { model: 'openrouter/bodybuilder', messages: [{ role: 'user', content: 'Count to 10 using Claude Sonnet and GPT-5' }] },
});
if (completion instanceof ReadableStream) throw new Error('Expected a non-streaming response');
const { requests } = JSON.parse(completion.choices[0]?.message.content as string);
```

The assistant `content` is a JSON string:

```json
{
  "requests": [
    { "model": "anthropic/claude-sonnet-4.5", "messages": [{ "role": "user", "content": "Count to 10" }] },
    { "model": "openai/gpt-5.1", "messages": [{ "role": "user", "content": "Count to 10" }] }
  ]
}
```

Execute in parallel by POSTing each body as-is (the bodies use API field names such as `max_tokens`, so send the raw JSON rather than converting to SDK types):

```typescript
const results = await Promise.all(requests.map(async (request: { model: string }) => {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`Request failed with status ${r.status}`); }
  const data = await r.json();
  return { model: request.model, content: data.choices[0].message.content };
}));
```

Model selection: has access to all models, uses latest versions by default, understands aliases/common names. As of Dec 4 2025: "Claude Sonnet" → `anthropic/claude-sonnet-4.5`, "Claude Opus" → `anthropic/claude-opus-4.5`, "GPT-5" → `openai/gpt-5.1`, "Gemini" → `google/gemini-3.1-pro-preview`, "DeepSeek" → `deepseek/deepseek-v3.2` (slugs change over time).

Use cases: model benchmarking, redundancy/verification, A/B testing, exploration. Limitations: requires `messages` input; generated requests use minimal required fields; system messages in your input are preserved and forwarded.

Gotchas: the output is model-generated — validate the JSON (the docs use a zod schema) before executing; Body Builder executes nothing itself.

Sources: https://openrouter.ai/docs/guides/routing/routers/body-builder

### 9.11 Free Models Router (`openrouter/free`)

Selects a free model **at random** from currently available free models, after filtering to those supporting what your request needs (image understanding, tool calling, structured outputs, ...).

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "openrouter/free", "input": "Hello!" }'
```

Flow: request analysis (required capabilities) → filter free models → random selection → forward → response `model` reports the chosen model (e.g. `upstage/solar-pro-3:free`).

- **Pricing**: router and routed requests are free; it falls back only to other free models (unlike a `models` array containing paid entries).
- **Limitations**: lower rate limits, variable availability, possibly higher latency at peak, **no control over which model** is chosen (use a specific `:free` slug for that; browse `https://openrouter.ai/models?pricing=free`).
- Router models are excluded from EU in-region model lists; pick an EU-eligible model there.

Sources: https://openrouter.ai/docs/guides/routing/routers/free-router, https://openrouter.ai/docs/guides/routing/model-variants/free

### 9.12 Pareto Router (`openrouter/pareto-code`)

Routes **coding** requests to a strong coding model without naming one. Maintains a curated shortlist ranked by Artificial Analysis (AA) coding percentile (an integer 0–100 within AA's benchmarked coding field).

```json
{
  "model": "openrouter/pareto-code",
  "plugins": [{ "id": "pareto-router", "min_coding_score": 0.8 }],
  "input": "Write a Python function that merges two sorted lists."
}
```

TypeScript SDK: `plugins: [{ id: 'pareto-router', minCodingScore: 0.8 }]`.

#### `pareto-router` plugin

| Field | Type | Default | Description |
| - | - | - | - |
| `min_coding_score` | number 0–1 (1 = best) | omitted ⇒ high tier | `>= 0.66` → **high** (top of AA's coding field); `>= 0.33` and `< 0.66` → **medium** (strong modern flagships below the top); `< 0.33` → **low** (capable coders that still beat AA's median) |
| `enabled` | boolean | `true` | Disable for this request |
| `max_price` | number ≥ 0 | – | **Spec only** (the guide says `min_coding_score` is the only parameter): max input price in USD per million tokens; bypasses tier selection and routes to the best-scoring Pareto-frontier model at or below the cap, falling back through cheaper frontier models, then non-frontier models; `404` if no candidate fits |
| `price_source` | `prompt` \| `weighted_avg` | `prompt` | **Spec only**: price axis for `max_price` (`prompt` = catalog list price; `weighted_avg` = traffic-weighted effective input price, falling back to list price) |

Selection:

1. Map the score to a tier.
2. Filter the tier's shortlist to models currently published on OpenRouter.
3. Sort by price ascending — or by p50 throughput descending with **`openrouter/pareto-code:nitro`**. Top entry = primary; next two = same-tier fallbacks.
4. Fallbacks fire only on transient provider errors/rate limits (they do not load-balance). Only when the whole tier is missing from the catalog does it step into a neighboring tier.
5. Forward; response `model` reports the concrete model.

The score is a **percentile**, so the bar moves with the frontier (`0.66` always means "top of the current field", not an absolute capability). The same score selects the same model deterministically until the shortlist or benchmarks change.

**Session stickiness** (model + provider, best effort, only while the model remains in the current shortlist): implicit via a conversation fingerprint (hash of first system + first user message) once the provider reports prompt-cache usage; explicit with `session_id` from the first successful response (recommended for multi-turn coding/agents). The cache expires after **5 minutes** of inactivity; each successful request resets the timer; a provider error doesn't update the cache (next request can re-route).

**Defaults**: Settings > Plugins > Pareto Router (gear icon): High / Medium / Low or a custom score; toggle on to apply to every `openrouter/pareto-code` request; per-request plugin entries override unless "Prevent overrides" is on.

**Pricing**: no router fee; pay the chosen model (per-request cost varies; lower the score to save). **Limitations**: coding-tuned only; the selected model can change as the shortlist updates; per the guide you can't directly cap cost or latency per request.

Sources: https://openrouter.ai/docs/guides/routing/routers/pareto-router

### 9.13 Latest model resolution (`~author/family-latest`)

`~author/family-latest` slugs resolve to the **newest concrete model** in a family, so code against a stable alias picks up releases without redeploying. Examples: `~anthropic/claude-opus-latest`, `~anthropic/claude-sonnet-latest`. Other aliases used throughout the docs: `~anthropic/claude-haiku-latest`, `~openai/gpt-sol-latest`, `~openai/gpt-latest`, `~google/gemini-pro-latest`, `~google/gemini-flash-latest`, `~moonshotai/kimi-latest`, `~x-ai/grok-latest`.

```json
{ "model": "~anthropic/claude-opus-latest", "input": "Summarize this in one sentence: ..." }
```

The response `model` reports the concrete version (e.g. `anthropic/claude-opus-4.8`) — log it to detect rollovers; it also appears in the activity log.

How it works: `~` prefix recognized → newest **visible** model in the family selected → request routed across providers exactly as with the concrete slug → billed at the concrete model's price. If the family has no eligible model, the request **errors** (no unrelated fallback). It never resolves to another alias or to hidden models.

`~...-latest` rows on the models page and in `/api/v1/models` report the **current target's** pricing, context length, modalities and supported parameters (auto-updated on promotion).

**Compatibility contract** (only `~latest` slugs): if the alias now points at a model that requires reasoning, unsupported reasoning params are remapped instead of rejected:

- `reasoning: { effort: "none" }` → lowest supported effort (e.g. `minimal` or `low`).
- `reasoning: { enabled: false }` → enabled at the lowest supported effort.
- `reasoning: { max_tokens: 0 }` → treated the same; the zero budget is dropped.

Concrete slugs keep strict validation (`effort: "none"` on a reasoning-mandatory model ⇒ `400`). Separately, on **all** slugs, unsupported non-`none` efforts map to the nearest supported level (e.g. `xhigh` → `high`).

Limitations: the target can change at any time (use concrete slugs for regression tests/reproducibility); only "latest" (no "second newest", no rollback through the alias). Pin with `{ "model": "anthropic/claude-opus-4.8" }`. Switchyard rejects `~latest` aliases as candidates.

Sources: https://openrouter.ai/docs/guides/routing/routers/latest-resolution

### 9.14 Fusion Router (`openrouter/fusion`, `openrouter/fusion-flash`)

Gives your model a multi-model deliberation tool. When invoked, a **panel** (up to 8 models) answers your prompt in parallel (each with `openrouter:web_search` + `openrouter:web_fetch`), an **analyst** model compares (does not merge) the answers and returns structured JSON (consensus, contradictions, partial coverage, unique insights, blind spots), and your model writes the final answer. Use it for research questions, expert critique, compare-and-contrast prompts, or anything where being wrong costs more than a few extra completions.

Two equivalent entry points (same pipeline):

```json
{ "model": "openrouter/fusion", "input": "What are the strongest arguments for and against carbon taxes?" }
```

```json
{ "model": "~anthropic/claude-opus-latest", "input": "What are the strongest arguments for and against carbon taxes?", "tools": [{ "type": "openrouter:fusion" }] }
```

- The alias resolves to a real model and **auto-injects** `openrouter:fusion`; the model decides whether to call it (answers directly otherwise, including calling your other tools). Force it with `tool_choice: "required"` — with only fusion injected, "some tool call" means fusion; if your request also includes other tools, the model may pick one of those instead.
- The server-tool form lets you choose the outer model and combine fusion with other tools ([§9.32](#932-server-tools-fusion-advisor-subagent-inner-model-calls)).
- `openrouter/fusion-flash`: separately listed model = Fusion with the **`general-fast`** preset (latency-homogeneous panel for fast agentic turns), with its own `/api/v1/models` entry and usage attribution. Equivalent to `{ "model": "openrouter/fusion", "plugins": [{ "id": "fusion", "preset": "general-fast" }] }` unless you pass your own `preset`, `analysis_models` or `model` (explicit values win). Variant suffixes (`openrouter/fusion-flash:free`) parse as on `openrouter/fusion`.

#### Configuration (`fusion` plugin with the slug, or `parameters` on the server tool)

A `fusion` plugin entry alone does **not** start Fusion; it configures a run started by the model slug or the server tool. Omit config entirely to use the Quality preset defaults.

| Field | Default | Description |
| - | - | - |
| `analysis_models` | Quality preset: `~anthropic/claude-opus-latest`, `~openai/gpt-sol-latest`, `~google/gemini-pro-latest` | Panel models (1–8), each run in parallel with web search + fetch |
| `model` | your outer model (guide); spec for the plugin says first model of the Quality preset | Analyst model producing the analysis JSON |
| `max_tool_calls` | `4` | Tool-calling steps per panelist/analyst web loop before they must return text (1–16) |
| `max_completion_tokens` | `16000` | Max output tokens (incl. reasoning) per inner panel/analyst call |
| `reasoning` | provider default | `{ effort?, max_tokens? }` forwarded to panel and analyst |
| `temperature` | provider default | 0–2, forwarded to panel calls; the analyst always runs at 0 |
| `preset` | – | Spec: `general-high`, `general-budget`, `general-fast`; expands server-side to a curated panel + analyst; explicit `analysis_models`/`model` take precedence |
| `tools` | `[{"type":"openrouter:web_search"},{"type":"openrouter:web_fetch"}]` | Spec: server tools for panel/analyst inner calls (≤8 entries of `{ type, parameters? }`); `[]` disables tools (parametric knowledge only) |
| `enabled` | `true` | Spec: set `false` to disable Fusion configuration for the run |

```json
{
  "model": "openrouter/fusion",
  "plugins": [{ "id": "fusion",
    "analysis_models": ["~anthropic/claude-opus-latest", "~openai/gpt-sol-latest", "~google/gemini-pro-latest"],
    "model": "~openai/gpt-sol-latest" }],
  "input": "Compare ridge, lasso, and elastic-net regression."
}
```

```json
{
  "model": "~anthropic/claude-opus-latest",
  "input": "Compare ridge, lasso, and elastic-net regression.",
  "tools": [{ "type": "openrouter:fusion",
    "parameters": { "analysis_models": ["~anthropic/claude-opus-latest", "~openai/gpt-sol-latest", "~google/gemini-pro-latest"],
                    "model": "~openai/gpt-sol-latest" } }]
}
```

TypeScript SDK uses camelCase (`analysisModels`, `toolChoice: 'required'`).

Response: `model` = the concrete outer model. When Fusion ran, `output` contains `{ "type": "openrouter:fusion", "id": "st_tmp_...", "status": "completed" }` ahead of the final `message`; a direct answer has only the message. Read the **last** `message` item by type. Generation metadata ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)) reports `"router": "openrouter/fusion"`.

Cost: N panel calls + 1 analyst call on top of your request; default 3-model panel ≈ **4–5×** a single completion; scales linearly with panel size. Recursion protection: inner calls carry `x-openrouter-fusion-depth`; panel/analyst cannot invoke fusion (one level). Fusion in `tools` also works on `/chat/completions` but is slower there than on the Responses API. Tool result shape and failure reasons: [§9.32](#932-server-tools-fusion-advisor-subagent-inner-model-calls). Playground: `https://openrouter.ai/fusion/`.

Sources: https://openrouter.ai/docs/guides/routing/routers/fusion-router, https://openrouter.ai/docs/guides/features/server-tools/fusion

### 9.15 Jev Router (`typesafe/jev-router`) and author routers (`<author>/auto`)

Jev (TypeSafe's decision model) assesses the task, its difficulty and the potential benefit of a stronger model; the routing policy balances those against estimated cost and your preferences to select **a model and a reasoning effort**. In supported agentic workflows it can retain a model, adjust effort, or switch models as the task progresses, and (when the policy permits) attach an expert advisor. Jev makes the decision; the selected model generates the response. Works on Chat Completions, Responses and Messages, streaming and non-streaming. Available models and policies change over time.

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "typesafe/jev-router", "plugins": [{ "id": "jev-router", "cost_tier": "medium" }],
        "input": "Summarize this incident report." }'
```

#### `jev-router` plugin (optional; unknown fields or invalid values ⇒ `400`, e.g. `allowed_model` is not accepted)

| Parameter | Type | Behavior |
| - | - | - |
| `id` | string | Required, `"jev-router"` |
| `cost_tier` | string | `"low"` (prioritize lower estimated cost), `"medium"` (balance cost and capability), `"high"` (favor capable models when the expected benefit justifies cost). Omit ⇒ Jev's default policy (set `"medium"` explicitly if you want medium). Unknown tier ⇒ `400`. Spec allows operator-configured tiers (pattern `^[a-z][a-z0-9_-]{0,31}$`). A routing preference — not a fixed model, guaranteed score, or price cap; changing it can change the model within a conversation. |
| `models` | string[] | **Include preferences with fallback** (not a hard allowlist), applied before dynamic pool selection. If they leave no routable candidates, Jev retries without them — unless no entry matches any catalog model (then `404` naming the field). |
| `allowed_models` | string[] | Alias of `models`; entries from both are combined |
| `excluded_models` | string[] | **Hard** exclusions, enforced in every attempt (including include-fallback); excluding every pool model ⇒ `404` |

Entry forms: exact slug (matches every dated revision, e.g. `openai/gpt-6-luna`); dated revision (`openai/gpt-6-luna-20260922`, that revision only); wildcard (`anthropic/*`, `*flash*`; case-sensitive); `~author/family-latest` (every revision of the family). Each list: ≤1,024 patterns, ≤1,024 chars per pattern, ≤65,536 chars total.

How the lists apply (dynamic pools): filters apply **before** ranking and the pool cap (an include can bring in a model that would miss the global cutoff; an exclusion can free a slot). Includes never bypass model eligibility, endpoint policy, capabilities or token-budget checks. Explicit operator pools and built-in pools keep their configured membership. Includes are relaxed only when they leave no routable candidates (including a matching model with no eligible endpoint) — reported as `list_fallback: "models_ignored"`. When lists leave only weaker models than a hard request needs, the router can lower its capability requirement (`list_tier_cap`; not the cost tier). **Do not use an include list to enforce an author restriction** — use an author router or `excluded_models`.

**Reasoning effort**: normally chosen by the router; hint with top-level `reasoning.effort` (or legacy `reasoning_effort` on Chat Completions). Not a guarantee. `reasoning.max_tokens` and `reasoning.mode: "pro"` ⇒ `400`.

```json
{ "model": "typesafe/jev-router", "plugins": [{ "id": "jev-router", "cost_tier": "high",
  "models": ["anthropic/*", "google/*"], "excluded_models": ["anthropic/claude-opus*"] }],
  "reasoning": { "effort": "high" }, "input": "Analyze the tradeoffs in this design." }
```

**Router metadata** (`X-OpenRouter-Metadata: enabled`; `jev-router` entry in `openrouter_metadata.pipeline`): `resolved_models` (fallback order), `candidates` (`model`, `effort`, capability `tier`, `estimated_cost` — not billed cost), `reason`, `pipeline` (`"default"` or `"agentic"`), `advisor_model`, `models`/`excluded_models` (lists applied; `models` includes `allowed_models`), `list_fallback`, `list_tier_cap`, `max_fallback` (`"deep"` when a request that would get an advisor was served without one).

```bash
curl https://openrouter.ai/api/v1/responses -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" -H "X-OpenRouter-Metadata: enabled" \
  -d '{"model":"typesafe/jev-router","plugins":[{"id":"jev-router","cost_tier":"medium"}],"input":"Reply with ok"}' \
  | jq '.openrouter_metadata.pipeline[] | select(.name == "jev-router") | .data | {resolved_models, candidates, reason, pipeline, advisor_model}'
```

**Availability/errors**: global data region only; only in workspaces that allow it; access to the router and the selected models is required; **do not combine `typesafe/jev-router` with another router model** in the same request.

| Status | Examples |
| - | - |
| `400` | Unknown cost tier or plugin field, unsupported reasoning settings, regional routing, combining router models |
| `404` | No eligible model remains after preferences and request requirements; no access to the router |
| `503` | Jev Router unavailable |

**Author routers** (`openai/auto`, `anthropic/auto`, and other `<author>/auto` when in the catalog) run Jev scoped to that author's models (same pool discovery, task policy, reasoning effort and cost tiers). Author scope is a **hard** restriction applied before the pool cap; `models`/`allowed_models` stay soft within it and `excluded_models` stays hard; an author with no eligible model ⇒ `404`. Separately requested fallback models keep their normal behavior. The scope is the model **author**, so an OpenAI model may still be served by Azure; provider preferences and account policies still apply. `openrouter/auto` is a different router and does not use this behavior. Each alias needs its own catalog router row (and access, if private); the API does not create aliases on request.

```json
{ "model": "anthropic/auto", "input": "Explain this query plan.",
  "plugins": [{ "id": "jev-router", "excluded_models": ["~anthropic/claude-opus-latest"] }] }
```

Sources: https://openrouter.ai/docs/guides/routing/routers/jev-router

### 9.16 Switchyard (`nvidia/switchyard`)

Model-routing system built on the open-source NVIDIA NeMo Switchyard library: switches between an **efficient** (low-cost) and a **capable** (high-cost) model per request to optimize cost. Benchmarks of routing configurations: `https://openrouter.ai/benchmarks/routers#all-benchmarks`.

```typescript
// TypeScript SDK (no plugin ⇒ default `stage` algorithm)
const response = await openRouter.responses.send({
  responsesRequest: {
    model: 'nvidia/switchyard',
    models: ['deepseek/deepseek-v3.2', 'anthropic/claude-sonnet-4.5'],
    input: 'Summarize this paragraph in one sentence: ...',
  },
});
if (!('output' in response)) throw new Error('Expected a non-streaming response');
console.log('Model used:', response.model);
```

```python
import os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "nvidia/switchyard",
        "models": ["deepseek/deepseek-v3.2", "anthropic/claude-sonnet-4.5"],
        "input": "Summarize this paragraph in one sentence: ...",
    },
)
data = response.json()
message = next(item for item in reversed(data["output"]) if item["type"] == "message")
print(next(part["text"] for part in message["content"] if part["type"] == "output_text"))
print("Model used:", data["model"])
```

Choose an algorithm with `"plugins": [{ "id": "switchyard-router", "algorithm": "stage" }]` (see Algorithms below).

#### How it works

1. Send `model: "nvidia/switchyard"` with **1–3 concrete models** in top-level `models`, or no `models` for the default pair. At least two eligible candidates are needed for a choice; with one, OpenRouter serves it.
2. Normal routing constraints apply per candidate (provider preferences, price limits, data-collection/ZDR, BYOK keys, account model restrictions); candidates with no eligible endpoint drop out.
3. **Tiers from price**: for each candidate take its lowest-priced endpoint your request may use; price = prompt + completion per token; cheapest = **efficient**, most expensive = **capable**. List order doesn't change tiers (prices are evaluated at request time, so provider price changes or provider preferences can flip them). With three candidates, the middle one is neither tier — tier-based algorithms (`capability`, `stage`, `auto`, `composite`) never choose it first; it follows both tiers in the fallback order. Two equal-priced candidates still get tiers if a third differs.
4. The algorithm picks a tier; OpenRouter runs that model; on failure it falls back to the next model in the plugin's order (like model fallbacks). Response shape = a direct request to the answering model.

**Default pair** (no `models`): from the 20 models with the most spend over the previous 7 days that your request can use (provider, price, data policy settings and request needs: image/file input, tools, context length, parameters), the highest-spend model in the cheapest fifth by average cost per request is efficient; the highest-spend model in the 60th–80th percentile is capable. It stands in for `models` in spend-rank order (higher first). Refreshed hourly; no classifier/judge call. `400` if no ranked model is usable or the ranking can't load (gives up after 2 s on a freshly started server; ranking or catalog errors leave no pool). Sending your own `models` avoids both.

Choosing candidates: one efficient + one capable with a clear price gap; **concrete slugs only** (`~latest` aliases rejected); both must support the features you use (tools, images), since either can serve. Suggested starting pair (prices at time of writing): `["z-ai/glm-5.3", "anthropic/claude-opus-5.5"]` ($5.80 vs $24.00 prompt+completion per M). A third, middle-priced candidate acts as a fallback when both tiers fail.

`models` order matters for: `passthrough` (served as is); candidates an algorithm didn't rank (follow ranked ones in your order, including fallbacks behind a `random` pick); and `caller_order` serving (every eligible candidate at the same price — except `random`, which still picks at random —, only one eligible candidate, or the routing service unavailable).

#### Algorithms (`switchyard-router` plugin `algorithm`; omit ⇒ `stage`; other values ⇒ `400`)

| Algorithm | What it does | Calls the judge |
| - | - | - |
| `capability` | Judge rates how demanding the task is → efficient or capable tier. For independent requests/chat/agents where each human turn is a fresh task. | Every human turn (tool-result turns reuse the pinned model) |
| `stage` (default) | Scores tool results in `input` (errors, repeated failures without progress, long exploration → capable; edits/writes that landed → efficient); decisive score routes without a judge call, otherwise the judge decides. First turn (no tool results) → judge. For coding/tool agents resending the whole conversation. | Sometimes |
| `auto` | `stage` without the judge; turns the signals don't decide take the efficient tier | Never |
| `composite` | `stage` on human turns, remembers the tier for the conversation; on tool turns the remembered tier is the default and stage signals move individual turns off it. Send `session_id`. | Human turns when the tool history doesn't decide; tool turns with no remembered tier |
| `random` | One candidate at random each human turn, kept for its tool turns (A/B baseline) | Never |
| `passthrough` | Eligible candidates in your order; no routing decision (behaves like `models` fallbacks; switch fleets between routed/unrouted without changing `models`) | Never |

All judge-backed algorithms decide **before** the request runs (the judge predicts the needed tier). NeMo's `escalation` mode (run cheap, re-run on capable if poor) is not available on OpenRouter. In `stage`, only the strongest error in the last few tool results is scored (the same error repeated does not add up); corroborating signals skip the judge (an error deep in a task with no edits landing → capable; tests passing right after an edit with no recent errors → efficient); a critical error such as out-of-memory → capable on its own.

#### The judge

- Default model `google/gemini-3.5-flash-lite`. Override with plugin `judge_model` (must be in the catalog and have ≥1 structured-outputs endpoint allowed by your account settings and request `provider` settings). Otherwise the default judge runs and pipeline data reports `judge_model_requested` and `judge_model_fallback` (`not_in_catalog`, `no_structured_outputs`, `no_eligible_endpoint`, `catalog_unavailable`). If the default doesn't fit either (e.g. `provider` settings exclude Google) ⇒ `openai/gpt-4o-mini`; if neither fits, the judge call fails ⇒ capable tier. `auto`/`random`/`passthrough` ignore `judge_model`. A slow judge sends more requests to the capable tier.
- Input: one chat completion with a fixed system prompt plus the first user message and (when there is more than one) the latest user message, taken from a compact projection of your request (last 64 messages; text cut at 8,000 chars; ≤32 content parts and ≤16 tool calls per message; binary parts replaced with markers). The judge never sees candidates, prices, provider names or tool definitions.
- Prompt: describes the efficient tier (reliable on short, well-specified tasks; unreliable on multi-step reasoning, formal proofs, long code changes, nuanced writing); asks for the **crux**, one capability-card rule (`SUP-1`…`SUP-5` supported: short replies, factual lookups, short-text formatting/extraction, small code snippets, simple lists; `UNC-1`, `UNC-2` uncertain: ambiguous requests, long-document summaries/edits; `LIM-1`, `LIM-2` unsupported: multi-step math/logic, substantial code work), and the probability the efficient model completes the whole request correctly in one fresh attempt.
- Output (strict schema, `max_tokens` 4,096): `{ "crux": "...", "primary_rule": "LIM-1", "capability_boundary": "unsupported", "p_solve": 0.22 }`. Rejected (treated as failure) unless `p_solve` ∈ [0,1], `crux` non-empty, no extra fields, and rule matches boundary (`SUP-*`↔`supported`, `UNC-*`↔`uncertain`, `LIM-*`↔`unsupported`, `none`↔`unmatched`).
- Decision: efficient wins when `p_solve` ≥ `0.60` (supported), `0.75` (uncertain/unmatched), `0.90` (unsupported); else capable. The other tier becomes the first fallback.
- Time budget: judge cut at **2.5 s** inside the 3 s routing budget; timeout/error/invalid verdict ⇒ capable tier, request still completes, `judge_failure` names the reason.
- Billing: judge calls run under your account as separate generations (fraction of a cent; usually < 1 s added). Judge-capable algorithms need an account that can pay: no credits ⇒ `402` before routing; BYOK-only candidates still need OpenRouter credits for the judge.

#### Session pins

`capability` and `random` remember the model that **produced** the previous response in the conversation (a fallback, if one served) and reuse it on tool-result turns (judge paid once per human turn). `stage` and `auto` re-read the tool history every turn (no pin). `composite` keeps its own baseline: the model that served the last human turn with output (refusals don't count) and no error; a `caller_order` human turn sets no baseline, so the next tool turn runs judge-backed `stage`. Conversation identity: `session_id`, else a hash of the first system message and the first non-system message — send `session_id` for agents whose history changes between turns.

#### Inspect decisions (`X-OpenRouter-Metadata: enabled`)

```json
{ "type": "plugin", "name": "switchyard-router",
  "data": { "resolved_to": "deepseek/deepseek-v3.2", "fallback_models": ["anthropic/claude-sonnet-4.5"],
            "strategy": "capability", "judge_ms": 668, "route_ms": 702 } }
```

- `strategy`: the algorithm that ran (`capability`, `stage`, `auto`, `composite`, `random`, `passthrough`), `session_pin`, or `caller_order` (requests still succeed).
- `judge_ms`: judge wall time (absent when no judge call). `route_ms`: whole routing decision (≥ `judge_ms`).
- `judge_model_requested`, `judge_model_fallback`, `judge_failure` (e.g. `timeout`).
- `degraded_reason` (only with `caller_order`): `single_candidate`, `equal_pricing`, or an infrastructure reason such as `service_binding_missing`.

#### Pricing and limitations

- Billed at the answering model's rate, no routing fee; judge calls billed as ordinary generations on the judge model.
- `models`, when present: ≥1 concrete model, ≤3. Other router slugs (`openrouter/auto`, `openrouter/fusion`, `~latest` aliases) are not accepted.
- `capability`, `stage`, `composite` send part of the prompt to the judge (`google/gemini-3.5-flash-lite`, or `openai/gpt-4o-mini`). Use `auto`, `random` or `passthrough` if no prompt text may leave your candidate list. ZDR requirements and provider restrictions pass to the judge call.
- End users can word prompts to steer the judge toward a tier — set a price limit (`provider.max_price`) and choose candidates accordingly.
- Global endpoint (`openrouter.ai`) only; regional endpoints ⇒ `400`.

Sources: https://openrouter.ai/docs/guides/routing/routers/switchyard-router

### 9.17 Multimodal overview: which API carries which modality

| Modality | Direction | API / field | Section |
| - | - | - | - |
| Images | input | Responses `input_image` part; Chat `image_url` part | [§9.18](#918-image-inputs-vision) |
| PDFs / files | input | Responses `input_file` part; Chat `file` part; parsing via `file-parser` plugin | [§9.19](#919-pdf-inputs-and-the-file-parser-plugin) |
| Audio | input | Responses `input_audio` (wav/mp3); Chat `input_audio` (provider formats) | [§9.20](#920-audio-inputs-and-audio-output) |
| Audio | output | Chat Completions `modalities: ["text","audio"]` + `audio` config, streaming only | [§9.20](#920-audio-inputs-and-audio-output) |
| Video | input | Responses `input_video`; Chat `video_url` part. Not supported on Messages API | [§9.21](#921-video-inputs) |
| Images | output | Dedicated `POST /api/v1/images`; also `openrouter:image_generation` server tool; Chat/Responses `modalities` + `image_config` | [§9.22](#922-image-generation) |
| Video | output | Async `POST /api/v1/videos` → poll → download | [§9.23](#923-video-generation-asynchronous) |
| Speech (TTS) | output | `POST /api/v1/audio/speech` (OpenAI-compatible, raw audio bytes) | [§9.24](#924-text-to-speech-post-apiv1audiospeech) |
| Transcription (STT) | output | `POST /api/v1/audio/transcriptions` (JSON or OpenAI multipart) | [§9.25](#925-speech-to-text-post-apiv1audiotranscriptions) |

You can mix modalities (text, images, PDFs, audio, video) in one request; the number of files allowed varies by provider/model.

**URL vs base64**

| Type | URL | Base64 / data URL |
| - | - | - |
| Images | `https://example.com/image.jpg` | `data:image/jpeg;base64,{base64_data}` |
| PDFs | `https://example.com/document.pdf` | `data:application/pdf;base64,{base64_data}` |
| Audio (input) | **Not supported** (base64 only) | Raw base64 string + `format` field |
| Video | Provider-specific (e.g. YouTube links on Gemini via AI Studio only) | `data:video/mp4;base64,{base64_data}` |

URLs reduce payload size for large public files; base64 is required for local/private content.

**Model compatibility**: OpenRouter filters available models/endpoints by request content (vision for images, file-capable or parsed for PDFs, audio-capable, video-capable). Check `architecture.input_modalities` (`text`, `image`, `file`, `audio`, `video`) in the catalog or filter on the models page.

**Pricing summary**: images — per image or as input tokens; PDFs — free text extraction, paid OCR, or native model input tokens; audio input — input tokens based on duration; audio output — output tokens; video input — input tokens based on duration and resolution; image/video generation, TTS, STT — per their endpoints' pricing (below).

Sources: https://openrouter.ai/docs/guides/overview/multimodal/overview

### 9.18 Image inputs (vision)

Send images as content parts in a user message. Multiple images = multiple parts. **Put the text prompt first, then images**; if images must come first, put them before the text within the same user message. System messages should contain text only. Number of images per request varies by provider/model.

Supported content types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.

Responses API (`/api/v1/responses`) — `input_image` part: `image_url` is a string (URL or base64 data URL), or use `file_id` of an uploaded image (Files API, [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). `detail`: `auto` | `low` | `high` | `original`. The TS SDK spells it `imageUrl`.

```typescript
// TypeScript SDK — image by URL
const result = await openRouter.responses.send({
  responsesRequest: {
    model: 'google/gemini-3-flash-preview',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: "What's in this image?" },
        {
          type: 'input_image',
          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
          detail: 'auto',
        },
      ],
    }],
    stream: false,
  },
});
```

```python
# Python — local file as base64 data URL
import base64, os, requests

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

data_url = f"data:image/jpeg;base64,{encode_image_to_base64('path/to/your/image.jpg')}"

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "google/gemini-3-flash-preview",
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": "What's in this image?"},
                {"type": "input_image", "image_url": data_url, "detail": "auto"},
            ],
        }],
    },
)
print(response.json())
```

In the TS SDK, build the same data URL with `` `data:image/jpeg;base64,${(await fs.promises.readFile(path)).toString('base64')}` `` and pass it as `imageUrl`.

Chat Completions — `image_url` part with an object (`url` required; `detail` optional):

```json
{
  "model": "google/gemini-3-flash-preview",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "What's in this image?" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo...", "detail": "high" } }
    ]
  }]
}
```

`detail: "original"` is an OpenRouter extension requesting original-resolution media; downgraded to `high` on providers without an original-resolution tier.

Gotchas: Responses `image_url` is a **string** (`imageUrl` in the TS SDK); Chat `image_url` is an **object** `{ url }`. Images are only forwarded to vision-capable models; tool results can also carry images on Responses (`function_call_output.output` array, [§9.26](#926-client-tool-calling-function-calling)).

Sources: https://openrouter.ai/docs/guides/overview/multimodal/image-understanding, https://openrouter.ai/docs/guides/overview/multimodal/overview

### 9.19 PDF inputs and the `file-parser` plugin

PDFs work with **any** model. If the model supports file input natively, the PDF is passed directly; otherwise OpenRouter parses it and passes the parsed result. Also usable in the chat room. You can send PDFs and other file types in the same request.

Responses API — `input_file` part: `file_url` (public URL) **or** `file_data` (base64 data URL) or `file_id` (uploaded file); optional `filename`. TS SDK spellings: `fileUrl`, `fileData`.

```typescript
// TypeScript SDK — PDF by URL, OCR engine pinned
const result = await openRouter.responses.send({
  responsesRequest: {
    model: '~anthropic/claude-sonnet-latest',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: 'What are the main points in this document?' },
        { type: 'input_file', filename: 'document.pdf', fileUrl: 'https://bitcoin.org/bitcoin.pdf' },
      ],
    }],
    // Optional: configure the PDF processing engine
    plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }],
    stream: false,
  },
});
```

```python
# Python — local PDF as base64 data URL, free text extraction
import base64, os, requests

def encode_pdf_to_base64(pdf_path):
    with open(pdf_path, "rb") as pdf_file:
        return base64.b64encode(pdf_file.read()).decode("utf-8")

data_url = f"data:application/pdf;base64,{encode_pdf_to_base64('path/to/your/document.pdf')}"

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "google/gemma-3-27b-it",
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": "What are the main points in this document?"},
                {"type": "input_file", "filename": "document.pdf", "file_data": data_url},
            ],
        }],
        # Optional: PDF parsing still works without the plugin
        "plugins": [{"id": "file-parser", "pdf": {"engine": "cloudflare-ai"}}],
    },
)
print(response.json())
```

Chat Completions — `file` part: `{ "type": "file", "file": { "filename": "document.pdf", "file_data": "<https URL or data:application/pdf;base64,...>" } }` (also `file_id` for previously uploaded files).

#### `file-parser` plugin

```json
{ "plugins": [{ "id": "file-parser", "pdf": { "engine": "cloudflare-ai" } }] }
```

| Field | Values | Notes |
| - | - | - |
| `id` | `"file-parser"` | required |
| `pdf.engine` | `"mistral-ocr"`, `"cloudflare-ai"`, `"native"` (`"pdf-text"` deprecated → redirected to `cloudflare-ai`) | see pricing |
| `enabled` | boolean (default `true`) | `false` disables for this request |

| Engine | Use | Price |
| - | - | - |
| `mistral-ocr` | Scanned docs / PDFs with images | $2 per 1,000 pages; US data region requests use Mistral's US endpoint at $2.2 per 1,000 pages (10% regional upcharge) |
| `cloudflare-ai` | Converts PDF to markdown via Cloudflare Workers AI | Free |
| `native` | Only for models with native file input | Charged as input tokens |

- **Default (no engine)**: model's native file processing if available; otherwise **`mistral-ocr`** (paid).
- **OCR is always billed to your OpenRouter account, including BYOK** (OpenRouter uses its own Mistral key).
- PDF URLs work with all engines: Mistral OCR receives the URL directly; other engines fetch and process it.
- **OCR image limits**: `mistral-ocr` requests at most **8 images per PDF** (`image_limit`) and forwards ≤8 images per request downstream; surplus images dropped, all text preserved. If the downstream model takes no image input, OCR images are stripped and only text is forwarded.

#### Skip re-parsing with file annotations (Chat Completions only)

When OpenRouter parses a PDF on Chat Completions, the assistant message carries `annotations` of type `file`. Send the assistant message (with annotations) back in later turns and OpenRouter reuses the parsed content instead of re-parsing (saves time and OCR cost). The Responses API instead returns `file_citation` annotations, which **cannot** be sent back to skip parsing.

```typescript
type FileAnnotation = {
  type: 'file';
  file: {
    hash: string;            // stable hash identifying the parsed file
    name?: string;           // original filename
    content: ContentPart[];  // parsed text blocks and images (base64 data URLs)
  };
};
type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
```

Official reuse flow (Chat Completions, Python): send the PDF, store `choices[0].message.annotations`, then send follow-ups with the assistant message carrying those annotations. Note that the official example still includes the original `file` part in the first user message — OpenRouter matches the annotation and skips re-parsing:

```python
import base64, os, requests

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"}

with open("path/to/your/document.pdf", "rb") as f:
    data_url = "data:application/pdf;base64," + base64.b64encode(f.read()).decode("utf-8")

first_user = {"role": "user", "content": [
    {"type": "text", "text": "What are the main points in this document?"},
    {"type": "file", "file": {"filename": "document.pdf", "file_data": data_url}},
]}

response_data = requests.post(url, headers=headers,
    json={"model": "google/gemma-3-27b-it", "messages": [first_user]}).json()

file_annotations = None
if response_data.get("choices"):
    file_annotations = response_data["choices"][0]["message"].get("annotations")

if file_annotations:
    follow_up = requests.post(url, headers=headers, json={
        "model": "google/gemma-3-27b-it",
        "messages": [
            first_user,
            {"role": "assistant", "content": "The document contains information about...", "annotations": file_annotations},
            {"role": "user", "content": "Can you elaborate on the second point?"},
        ],
    })
    print(follow_up.json())
```

Chat response excerpt:

```json
{ "choices": [{ "message": { "role": "assistant", "content": "The document discusses...",
  "annotations": [{ "type": "file", "file": { "hash": "abc123...", "name": "document.pdf",
    "content": [{ "type": "text", "text": "Parsed text content..." },
                { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }] } }] } }] }
```

Responses excerpt (citation, not reusable; parsing does not guarantee a citation):

```json
{ "type": "output_text", "text": "The document discusses...",
  "annotations": [{ "type": "file_citation", "file_id": "abc123...", "filename": "document.pdf", "index": 0 }] }
```

**Error responses still carry parsed annotations** (Chat): if parsing succeeded (`mistral-ocr`, `cloudflare-ai`) but every provider then failed, the error body has `error.metadata.file_annotations` (same `FileAnnotation` shape) — resend them on retry to skip re-parsing. `native` produces no annotations. Dedupe by `file.hash` when reading both paths:

```typescript
function extractFileAnnotations(response: any): FileAnnotation[] {
  const fromMessage = response?.choices?.[0]?.message?.annotations ?? [];
  const fromError = response?.error?.metadata?.file_annotations ?? [];
  const seen = new Set<string>();
  return [...fromMessage, ...fromError].filter((a) =>
    a?.type === 'file' && typeof a.file?.hash === 'string' && !seen.has(a.file.hash) && seen.add(a.file.hash));
}
```

Gotchas: forgetting `engine` on a non-file-native model silently uses paid `mistral-ocr`; choose `cloudflare-ai` for free text extraction of text-based PDFs. ZDR enforcement filters inference endpoints, not plugin backends ([§9.33](#933-plugins-the-plugins-array-defaults-and-precedence)).

Sources: https://openrouter.ai/docs/guides/overview/multimodal/pdfs, https://openrouter.ai/docs/guides/features/plugins

### 9.20 Audio inputs and audio output

#### Audio input

Base64 only (no URLs). Content part `input_audio` with `data` (raw base64, not a data URI) and `format`.

| API | Part | Accepted `format` |
| - | - | - |
| Responses (`/api/v1/responses`) | `{ "type": "input_audio", "input_audio": { "data": "...", "format": "wav" } }` | `wav`, `mp3` only |
| Chat Completions | same shape | Any provider-supported string, e.g. `wav`, `mp3`, `aiff`, `aac`, `ogg`, `flac`, `m4a`, `pcm16`, `pcm24` |

```typescript
// TypeScript SDK (field spelled inputAudio)
import fs from 'fs/promises';

const base64Audio = (await fs.readFile('path/to/your/audio.wav')).toString('base64');

const result = await openRouter.responses.send({
  responsesRequest: {
    model: 'google/gemini-2.5-flash',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: 'Please transcribe this audio file.' },
        { type: 'input_audio', inputAudio: { data: base64Audio, format: 'wav' } },
      ],
    }],
    stream: false,
  },
});
```

```python
import base64, os, requests

with open("path/to/your/audio.wav", "rb") as audio_file:
    base64_audio = base64.b64encode(audio_file.read()).decode("utf-8")

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "google/gemini-2.5-flash",
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": "Please transcribe this audio file."},
                {"type": "input_audio", "input_audio": {"data": base64_audio, "format": "wav"}},
            ],
        }],
    },
)
print(response.json())
```

Find audio-input models by filtering on audio input modality. For pure transcription prefer the STT endpoint ([§9.25](#925-speech-to-text-post-apiv1audiotranscriptions)).

#### Audio output (Chat Completions only)

The Responses API does not accept the `audio` parameter. Set `modalities: ["text", "audio"]` and an `audio` object; **streaming is required** (`stream: true`).

| `audio` option | Description |
| - | - |
| `voice` | e.g. `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` (varies by model) |
| `format` | e.g. `wav`, `mp3`, `flac`, `opus`, `pcm16` (varies by model) |

Chunks carry base64 audio and transcript incrementally:

```json
{ "choices": [{ "delta": { "audio": { "data": "<base64-encoded audio chunk>", "transcript": "Hello" } } }] }
```

Official example (Python): stream, collect `delta.audio.data` and `delta.audio.transcript`, then join and decode:

```python
import base64, json, os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "openai/gpt-4o-audio-preview",
        "messages": [{"role": "user", "content": "Say hello in a friendly tone."}],
        "modalities": ["text", "audio"],
        "audio": {"voice": "alloy", "format": "wav"},
        "stream": True,
    },
    stream=True,  # audio output requires streaming
)

audio_data_chunks, transcript_chunks = [], []
for line in response.iter_lines():
    if not line:
        continue
    decoded = line.decode("utf-8")
    if not decoded.startswith("data: "):
        continue
    data = decoded[len("data: "):]
    if data.strip() == "[DONE]":
        break
    delta = json.loads(data)["choices"][0].get("delta", {})
    audio = delta.get("audio", {})
    if audio.get("data"):
        audio_data_chunks.append(audio["data"])
    if audio.get("transcript"):
        transcript_chunks.append(audio["transcript"])

print("Transcript:", "".join(transcript_chunks))
with open("output.wav", "wb") as f:
    f.write(base64.b64decode("".join(audio_data_chunks)))
```

The TypeScript (fetch) version is the same loop over `response.body.getReader()`, buffering partial lines and reading `chunk.choices?.[0]?.delta?.audio`. Note: the guide documents `audio` as a request parameter, but the OpenAPI `ChatRequest` schema does not list it (only `modalities` with `text`/`image`/`audio`); non-streaming assistant messages may carry an `audio` object (`id`, `data`, `transcript`, `expires_at`) per the spec. For standalone speech synthesis use TTS ([§9.24](#924-text-to-speech-post-apiv1audiospeech)).

Sources: https://openrouter.ai/docs/guides/overview/multimodal/audio, https://openrouter.ai/docs/guides/overview/multimodal/overview

### 9.21 Video inputs

API only (not in the chatroom UI). Only video-capable models (`input_modalities` includes `"video"`) handle these. Messages API does **not** support video inputs.

| API | Part |
| - | - |
| Responses | `{ "type": "input_video", "video_url": "<URL or data:video/mp4;base64,...>", "processing": "agentic" }` |
| Chat Completions | `{ "type": "video_url", "video_url": { "url": "<URL or data URL>", "processing": "agentic" } }` (legacy `{ "type": "input_video", "video_url": { "url": ... } }` is deprecated) |

Supported formats: `video/mp4`, `video/mpeg`, `video/mov`, `video/webm`.

```typescript
// TypeScript SDK (field spelled videoUrl) — YouTube URL (Gemini on AI Studio)
const result = await openRouter.responses.send({
  responsesRequest: {
    model: 'google/gemini-2.5-flash',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: "Please describe what's happening in this video." },
        { type: 'input_video', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ],
    }],
    stream: false,
  },
});
// Local file: videoUrl: `data:video/mp4;base64,${(await fs.promises.readFile(path)).toString('base64')}`
```

```python
# Python — agentic processing, Responses API
import os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "google/gemini-2.5-flash",
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": "What is the height of the Rio Cathedral?"},
                {"type": "input_video", "video_url": "https://www.youtube.com/watch?v=-11ookL1yPA", "processing": "agentic"},
            ],
        }],
    },
)
print(response.json())
```

Chat Completions equivalent of the video part: `{"type": "video_url", "video_url": {"url": "https://www.youtube.com/watch?v=-11ookL1yPA", "processing": "agentic"}}` alongside a `{"type": "text", ...}` part.

**URL support is provider-specific**: OpenRouter only sends video URLs to providers that support them. Google Gemini on AI Studio: **YouTube links only**. Gemini on Vertex AI: no video URLs (use base64 data URLs). Others: check model docs. If a URL fails, try a base64 data URL.

**Processing mode** (`processing`, Google Gemini feature; setting it routes to an endpoint that supports it; others ignore it):

- `agentic` — model navigates the timeline dynamically, loading only needed frames/transcript/audio; best for long videos or queries targeting specific moments.
- `static` — fixed frame-rate sampling in one pass; best for latency-sensitive queries on short clips.
- Omitted — no value sent upstream; Gemini's default applies.

Response handling with agentic processing: navigation steps come back as **encrypted reasoning**, not tool calls. Responses API: `reasoning` output items with `encrypted_content` — echo all output items (including reasoning) in the next request's `input` to keep video context. Chat: encrypted `reasoning_details` entries on the assistant message, `finish_reason: "stop"` — send the assistant message back with `reasoning_details` intact ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) reasoning tokens).

Best practices: compress/trim; lower resolution (720p fine for most analysis; 1080p+ for detailed OCR/object detection; 480p for basic scene understanding) and frame rate; split long videos; check per-model duration and size limits. Troubleshooting: verify `input_modalities`, URL support, YouTube-only on AI Studio, format, corruption; large-file errors → compress/trim or use a supported URL.

Sources: https://openrouter.ai/docs/guides/overview/multimodal/videos

### 9.22 Image generation

Primary surface: the dedicated **Image API** (`POST /api/v1/images`; endpoint reference in [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs)). Alternatives: the `openrouter:image_generation` server tool (any text model can generate images, [§9.29](#929-server-tools-datetime-image-generation-search-models)), and `modalities`/`image_config` on Chat/Responses (spec: `modalities` accepts `"image"`; `image_config` is a free-form provider-specific object, e.g. `{ "aspect_ratio": "16:9", "quality": "high" }`; Chat assistant messages carry generated images in `images: [{ "image_url": { "url": "data:image/png;base64,..." } }]`).

#### Discovery

- `GET /api/v1/images/models` — each entry: `id`, `name`, `description`, `created`, `architecture` (`input_modalities`, `output_modalities`), `supported_parameters` (union across endpoints, typed descriptors), `supports_streaming` (any endpoint supports SSE), `endpoints` (URL of per-endpoint records).
- `GET /api/v1/images/models/{author}/{slug}/endpoints` — per endpoint: `provider_name`, `provider_slug` (key for `provider.options[slug]`), `provider_tag` (use to pin; `null` if provider-level routing unavailable), `supported_parameters` (definitive for this endpoint), `allowed_passthrough_parameters` (keys accepted under `provider.options[provider_slug]`), `supports_streaming`, `pricing[]` (`billable`: e.g. `output_image`, `input_image`, `input_reference`; `unit`: `image` \| `megapixel` \| `token`; `cost_usd`; optional `variant` like `2k`/`4k`).
- Or `GET /api/v1/models?output_modalities=image`.

Capability descriptors: `{ "type": "enum", "values": ["1K","2K","4K"] }` (allowlist), `{ "type": "range", "min": 0, "max": 100 }` (any integer in range), `{ "type": "boolean" }` (supported). **Absent key = unsupported.**

#### Request parameters (`POST /api/v1/images`)

| Parameter | Type | Required | Description |
| - | - | - | - |
| `model` | string | Yes | e.g. `bytedance-seed/seedream-4.5` |
| `prompt` | string | Yes | Description of the image |
| `n` | integer | No | Upper bound 1–10; providers may return fewer; single-image providers reject `n > 1` |
| `resolution` | string | No | Tier: `512`, `768`, `1K`, `1.5K`, `2K`, `4K` (pixels derived per provider) |
| `aspect_ratio` | string | No | `auto` (provider chooses), `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `4:5`, `5:4`, extended `1:2`, `2:1`, `1:4`, `4:1`, `1:8`, `8:1`, `9:21`, `21:9`. Providers clamp to their supported subset |
| `size` | string | No | Shorthand: a tier (`"2K"`, ≡ `resolution`, combinable with `aspect_ratio`) or explicit pixels (`"2048x2048"`). Explicit pixels are authoritative where accepted; a mismatched `resolution`/`aspect_ratio` alongside ⇒ 400. xAI and Sourceful V2/V2.5 reject pixel sizes (400); Sourceful V2.6 accepts them within its limits but not combined with `resolution`/`aspect_ratio` |
| `quality` | string | No | `auto`, `low`, `medium`, `high` (ignored by providers without a quality knob) |
| `output_format` | string | No | `png`, `jpeg`, `webp`, `svg` (vectorization models only), `gif` (animation-capable only, e.g. OpenAI gpt-image-2.6); omitted ⇒ provider default |
| `frame_count` | integer | No | GIF frames 2–64 (each model enforces its own range) |
| `frame_duration_ms` | integer | No | Per-frame display 20–2000 ms for GIF |
| `markup` | object | No | Transparent PNG overlay (same shape as an `input_references` entry, same dims as the first reference) marking where an edit applies; image-to-image only (OpenAI gpt-image-2.6) |
| `background` | string | No | `auto`, `transparent`, `opaque` (`transparent` needs png/webp) |
| `output_compression` | integer | No | 0–100 for webp/jpeg; ignored for png |
| `seed` | integer | No | Deterministic generation where supported |
| `stream` | boolean | No | SSE partial images (only where `supports_streaming`) |
| `input_references` | array | No | Reference images for image-to-image: `{ "type": "image_url", "image_url": { "url": "https://... or data:..." } }`; count varies by provider |
| `user` | string | No | Stable end-user ID; hashed upstream, never sent raw |
| `provider.only` / `order` / `ignore` | string[] | No | Routing (use `provider_tag` as base slug) |
| `provider.sort` | string \| object | No | `price`, `throughput`, `latency` |
| `provider.allow_fallbacks` | boolean | No | `false` stops after the primary |
| `provider.options` | object | No | Provider-specific params keyed by provider slug (must be in `allowed_passthrough_parameters`) |

GIF animation: OpenAI renders every frame onto one sprite sheet with a fixed pixel budget, so a bare `aspect_ratio` is shaped to the largest frame that fits (e.g. `1:1` at 9 frames = 928×928); an explicit `size` is forwarded as-is and can be rejected upstream.

```bash
curl -X POST "https://openrouter.ai/api/v1/images" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "bytedance-seed/seedream-4.5", "prompt": "a landscape photo", "resolution": "2K", "aspect_ratio": "16:9" }'
```

```json
{ "model": "openai/gpt-image-1", "prompt": "make this scene look like a watercolor painting",
  "input_references": [{ "type": "image_url", "image_url": { "url": "https://example.com/photo.jpg" } }] }
```

```json
{ "model": "black-forest-labs/flux.2-pro", "prompt": "a dramatic portrait",
  "provider": { "options": { "black-forest-labs": { "steps": 40, "guidance": 3 } } } }
```

```json
{ "model": "google/gemini-2.5-flash-image", "prompt": "a red panda astronaut floating in space",
  "provider": { "only": ["google-ai-studio"], "allow_fallbacks": false } }
```

#### Response

```json
{
  "created": 1748372400,
  "data": [{ "b64_json": "<base64-encoded-image>", "media_type": "image/png" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 4175, "total_tokens": 4175, "cost": 0.04 }
}
```

Images are base64 bytes. `media_type` is present whenever identifiable (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` for Recraft vector models, ...), omitted only if undeterminable.

```typescript
const r = await fetch('https://openrouter.ai/api/v1/images', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai/gpt-image-1', prompt: 'a red panda astronaut floating in space, studio lighting' }),
});
const result = await r.json();
for (const image of result.data) console.log(image.media_type, image.b64_json.length);
```

#### Streaming (`stream: true`)

SSE events (stream ends with `data: [DONE]`):

```text
data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"<base64>"}
data: {"type":"image_generation.completed","b64_json":"<base64>","media_type":"image/png","created":1748372400,"usage":{"prompt_tokens":16,"completion_tokens":272,"total_tokens":288,"cost":0.011}}
data: {"type":"error","error":{"message":"Generation failed","code":"server_error"}}
```

#### Billing and cancellation

**All-or-nothing**: completed generations billed in full per endpoint pricing; failed/cancelled generations are not billed and return `502 Bad Gateway` (never a partial result). Client disconnects never bill you even if the provider finishes. Partial preview images in streams create no partial charges; a stream that ends early is billed as failed (not at all). (Contrast: cancelled chat streams bill tokens produced.)

Gotchas: check endpoint `supported_parameters` before sending (absent = unsupported); explicit pixel `size` + `resolution`/`aspect_ratio` ⇒ 400 on many providers; `n > 1` rejected by single-image providers; `transparent` background requires png/webp.

Sources: https://openrouter.ai/docs/guides/overview/multimodal/image-generation

### 9.23 Video generation (asynchronous)

Text-to-video and image-to-video via an async job API (endpoint reference in [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs)):

1. `POST /api/v1/videos` → `202` with job `id` and `polling_url`.
2. Poll `GET /api/v1/videos/{jobId}` until `status` is terminal.
3. Download `GET /api/v1/videos/{jobId}/content?index=0` (with your API key).

Discovery: `GET /api/v1/videos/models` → per model `id`, `canonical_slug`, `name`, `description`, `created`, `supported_durations` (seconds), `supported_resolutions`, `supported_aspect_ratios`, `supported_sizes`, `pricing_skus` (e.g. `"per-video-second": "0.50"`, `"per-video-second-1080p": "0.75"`), `allowed_passthrough_parameters`. Or `GET /api/v1/models?output_modalities=video`. **Validate `duration`, `resolution`, `aspect_ratio` against these lists — unsupported values return `400` listing the supported values.**

#### Request parameters

| Parameter | Type | Required | Description |
| - | - | - | - |
| `model` | string | Yes | e.g. `google/veo-3.1` |
| `prompt` | string | Yes | Video description |
| `duration` | integer | No | Seconds |
| `resolution` | string | No | `480p`, `720p`, `768p`, `1080p`, `1K`, `2K`, `4K` |
| `aspect_ratio` | string | No | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `9:21` |
| `size` | string | No | `WIDTHxHEIGHT` (e.g. `1280x720`); interchangeable with `resolution` + `aspect_ratio` |
| `frame_images` | array | No | First/last frames (image-to-video); each entry needs `frame_type`: `first_frame` \| `last_frame` |
| `input_references` | array | No | Style/content reference images (reference-to-video) |
| `generate_audio` | boolean | No | Defaults to `true` on models with audio output |
| `seed` | integer | No | Not guaranteed by all providers |
| `callback_url` | string | No | HTTPS webhook URL; overrides workspace default |
| `provider` | object | No | Provider passthrough (`provider.options`) |

If both `frame_images` and `input_references` are present, `frame_images` wins (image-to-video).

```json
{
  "model": "alibaba/wan-2.7",
  "prompt": "A character walking through a forest",
  "frame_images": [{ "type": "image_url", "image_url": { "url": "https://example.com/first-frame.png" }, "frame_type": "first_frame" }],
  "resolution": "1080p"
}
```

```json
{ "model": "alibaba/wan-2.7", "prompt": "A colossal solar flare beside a planet",
  "input_references": [{ "type": "image_url", "image_url": { "url": "https://example.com/style-ref.png" } }], "resolution": "1080p" }
```

Provider options are keyed by the slug of the provider the request routes to; only the matched provider's options are forwarded. **Only Google Veo models nest options under `parameters`**; all other video models (including other Google video models) take their allowed keys directly under the slug (a `parameters` object is not forwarded to them). Runway video upscale rejects any provider options.

```json
{ "model": "google/veo-3.1", "prompt": "A time-lapse of a flower blooming",
  "provider": { "options": { "google-vertex": { "parameters": { "personGeneration": "allow", "negativePrompt": "blurry, low quality" } } } } }
```

```json
{ "model": "bytedance/seedance-2.0", "prompt": "A time-lapse of a flower blooming",
  "provider": { "options": { "seed": { "watermark": false } } } }
```

(Seedance routed to BytePlus uses the `byteplus` slug instead of `seed`.)

#### Responses

Submit (`202`): `{ "id": "abc123", "polling_url": "https://openrouter.ai/api/v1/videos/abc123", "status": "pending" }`

Poll (completed):

```json
{ "id": "abc123", "generation_id": "gen-1234567890-abcdef", "polling_url": "https://openrouter.ai/api/v1/videos/abc123",
  "status": "completed", "unsigned_urls": ["https://openrouter.ai/api/v1/videos/abc123/content?index=0"],
  "usage": { "cost": 0.25, "is_byok": false } }
```

Statuses: `pending` (queued), `in_progress`, `completed`, `failed` (see `error`); webhooks additionally report `cancelled` and `expired`.

Downloading: `unsigned_urls` point at the content endpoint and are **not presigned** — send `Authorization: Bearer ...`. `index` defaults to `0` (multiple outputs). When OpenRouter stores a copy, the completed response also has `urls`: signed URLs usable without a key until `expires_at` (for `<video>` tags, ffmpeg) — treat them as secrets, don't log/share. `unsigned_urls` keep working with your key as long as the output exists.

```bash
curl "https://openrouter.ai/api/v1/videos/{jobId}/content?index=0" -H "Authorization: Bearer $OPENROUTER_API_KEY" --output video.mp4
```

Official end-to-end flow (submit → poll every 30 s → download):

```python
import os, time, requests

headers = {"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"}

# Step 1: submit
result = requests.post("https://openrouter.ai/api/v1/videos", headers=headers, json={
    "model": "google/veo-3.1",
    "prompt": "A golden retriever playing fetch on a sunny beach with waves crashing in the background",
}).json()
polling_url = result["polling_url"]
print(f"Job submitted: {result['id']} ({result['status']})")

# Step 2: poll until a terminal status
while True:
    time.sleep(30)
    status = requests.get(polling_url, headers=headers).json()
    print(f"Status: {status['status']}")
    if status["status"] == "completed":
        # Step 3: download with the same Authorization header
        video = requests.get(status["unsigned_urls"][0], headers=headers)
        with open("output.mp4", "wb") as f:
            f.write(video.content)
        break
    elif status["status"] == "failed":
        print(f"Generation failed: {status.get('error', 'Unknown error')}")
        break
```

The TypeScript (fetch) version is identical in shape: `POST /api/v1/videos`, then `fetch(pollingUrl, { headers })` in a loop with `setTimeout(…, 30000)`, then `fetch(status.unsigned_urls[0], { headers })` and `arrayBuffer()`. Production loops should also stop on `cancelled`/`expired` (statuses the webhooks report).

#### Webhooks

Per-request `callback_url` (priority) or a workspace default callback URL (workspace settings). On terminal state OpenRouter POSTs an envelope; each delivery has header `X-OpenRouter-Idempotency-Key: <job_id>-<status>` for dedup.

| `type` | `data` fields |
| - | - |
| `video.generation.completed` | `id`, `status`, `generation_id`, `model`, `unsigned_urls`, `usage` (`cost`, `is_byok`) |
| `video.generation.failed` | `id`, `status`, `generation_id`, `model`, `error` |
| `video.generation.cancelled` | same, `error: "Job was cancelled"` |
| `video.generation.expired` | same, `error: "Job exceeded maximum time to live"` |

Envelope: `{ "type": "...", "created_at": "2026-04-24T12:00:00.000Z", "data": { ... } }`. `generation_id`/`model` may be `null` for early failures.

Signing secret (workspace settings) ⇒ `X-OpenRouter-Signature: t=<unix>,v1=<hex hmac>`. Verify: HMAC-SHA256 over `` `${t},${rawBody}` `` with the secret, compare hex to `v1` (timing-safe), reject old timestamps. Use the **raw** body bytes.

```typescript
import crypto from 'crypto';
function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const hash = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !hash) return false;
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Number.isNaN(age) || age > 300) return false; // reject > 5 minutes old
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp},${rawBody}`).digest('hex');
  if (expected.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}
```

**ZDR**: video generation is **not eligible** for Zero Data Retention (outputs are retained briefly for async retrieval). With ZDR enforced (account settings or `provider.zdr: true`), video requests are not routed.

Best practices: detailed prompts (motion, camera, lighting, composition); poll ~every 30 s (jobs take 30 s to several minutes); handle `failed` and `error`; quality reference images. Video Generation Cookbook and an `openrouter-video` agent skill are referenced by the docs as further resources.

Sources: https://openrouter.ai/docs/guides/overview/multimodal/video-generation

### 9.24 Text-to-speech (`POST /api/v1/audio/speech`)

OpenAI Audio Speech API–compatible endpoint returning a **raw audio byte stream** (not JSON). Discover models with `GET /api/v1/models?output_modalities=speech` (voices in `supported_voices` on speech models).

| Parameter | Type | Required | Description |
| - | - | - | - |
| `model` | string | Yes | e.g. `openai/gpt-4o-mini-tts-2025-12-15`, `mistralai/voxtral-mini-tts-2603` |
| `input` | string \| array | Yes | Text, or a list of turns for multi-speaker input. Some models (Seed Audio 1.0) treat a string as a prompt that can describe non-speech audio |
| `voice` | string | Provider-dependent | Voice ID (varies by model). Omit only when the provider documents a default voice; omitted ⇒ routed only to providers with a provider-side default, else validation error |
| `instructions` | string | No | Delivery directions (tone, pacing, emotion). Supported by OpenAI `gpt-4o-mini-tts`, Gemini TTS, Fish Audio; ignored elsewhere |
| `response_format` | string | No | `mp3` or `pcm`, **default `pcm`**. HeyGen Voice and Gemini TTS only `pcm`; MiniMax only `mp3` (400 for the other) |
| `speed` | number | No | Default `1.0`; honored by models that support it (e.g. OpenAI); others ignore or 400 for non-default |
| `input_references` | array | No | Stateless voice cloning/design: 1–3 `input_audio` parts (each optionally followed by a `text` transcript), optionally + one `image_url` scene image where supported, or exactly one `image_url` alone |
| `provider` | object | No | Only `zdr`, `data_collection` and `provider.options` apply; `order`/`only`/`ignore` are **not** applied to speech requests |

```typescript
// TypeScript SDK: openRouter.tts.createSpeech returns a ReadableStream of audio bytes
import fs from 'fs';

const stream = await openRouter.tts.createSpeech({
  model: 'openai/gpt-4o-mini-tts-2025-12-15',
  input: 'Hello! This is a text-to-speech test.',
  voice: 'alloy',
  responseFormat: 'mp3',
});

const reader = stream.getReader();
const chunks: Uint8Array[] = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
const buffer = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
let offset = 0;
for (const c of chunks) { buffer.set(c, offset); offset += c.length; }
await fs.promises.writeFile('output.mp3', buffer);
```

```python
# OpenAI Python SDK (OpenAI-compatible endpoint)
import os
from openai import OpenAI

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])

# Non-streaming
response = client.audio.speech.create(
    model="openai/gpt-4o-mini-tts-2025-12-15",
    input="The quick brown fox jumps over the lazy dog.",
    voice="nova",
    response_format="mp3",
)
response.write_to_file("output.mp3")

# Streaming
with client.audio.speech.with_streaming_response.create(
    model="openai/gpt-4o-mini-tts-2025-12-15",
    input="The quick brown fox jumps over the lazy dog.",
    voice="nova",
    response_format="mp3",
) as response:
    response.stream_to_file("output.mp3")
```

```bash
curl https://openrouter.ai/api/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  --output output.mp3 \
  -d '{ "model": "openai/gpt-4o-mini-tts-2025-12-15", "input": "Hello! This is a text-to-speech test.",
        "voice": "alloy", "response_format": "mp3" }'
```

With plain HTTP clients, check `response.ok` first (errors are JSON), read the bytes (`arrayBuffer()` / `response.content`), and log the `X-Generation-Id` header. The OpenAI TypeScript SDK works the same way (`new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', ... }).audio.speech.create({...})`, then `Buffer.from(await response.arrayBuffer())`).

**Multi-speaker input** (Gemini TTS; Fish Audio except S1; others 400): `input` = turns `{ text, voice?, instructions? }`; missing per-turn values inherit top-level ones; synthesized in order into one stream.

```json
{ "model": "google/gemini-3.8-flash-lite-tts",
  "input": [ { "text": "How's it going today, Jane?", "voice": "Kore" },
             { "text": "Not too bad, how about you?", "voice": "Puck", "instructions": "tired, yawning" } ],
  "instructions": "cheerful", "response_format": "pcm" }
```

**Voice cloning** (stateless; no upload step): reference audio as `input_audio` (`data` base64 or `data:audio/...;base64,` URI, or a public `url` that OpenRouter downloads and forwards as bytes — the provider never sees the URL), optional `text` transcript:

```json
{ "model": "fish-audio/s2.1-pro", "input": "Hello from my cloned voice!", "response_format": "mp3",
  "input_references": [
    { "type": "input_audio", "input_audio": { "data": "data:audio/wav;base64,UklGRuQXDAB..." } },
    { "type": "text", "text": "This is the transcript of the reference audio." } ] }
```

Endpoint capability flags (endpoints API): `supports_voice_cloning`, `supports_multiple_audio_references`, `supports_image_reference`; requests with references only route to endpoints that allow them.

- **Scene image** (HeyGen Voice `heygen/heygen-voice-1`): recording + optional `image_url` of the speaker's setting (quiet room vs car/stage acoustics). Omit `voice` when sending a recording. Recording must be WAV/MP3 of clear speech (first 3 minutes used); image JPEG/PNG/WebP. Language auto-detected or set via `provider.options.heygen.language`. HeyGen rejects image-without-recording; Seed Audio rejects recording+image.
- **Multiple clips** (Seed Audio 1.0 `bytedance-seed/seed-audio-1-0`, currently the only model accepting >1): up to 3 clips addressed as `@Audio1`, `@Audio2`, `@Audio3` in `input`. Single clip: placeholder optional (must be `@Audio1` if used). Multiple clips: each must be referenced at least once; placeholders pointing at absent clips ⇒ 400; placeholders with no audio references ⇒ 400. Transcripts: Fish Audio uses them, Seed ignores them; with multiple clips each `text` must immediately follow its clip.
- **Image references** (voice design): exactly one `image_url` (base64 data URI or public http(s) URL; JPEG/PNG/WebP). Seed's voice-design mode accepts only an image (no clips).
- **Limits**: 1–3 `input_audio` parts, ≤1 `image_url` (two images rejected); empty array = no reference; inline ≤20 MiB base64 (15 MiB decoded) else 400; remote downloads ≤15 MiB else 413; remote URLs public http(s) ≤2048 chars; transcript ≤10,000 chars; Seed Audio rejects `voice` + `input_references` together (400). Seed rejections surface as 400 `Provider rejected the request: ...` (base64 redacted).

**Non-speech prompts** (Seed Audio 1.0): `input` forwarded unchanged as a prompt (can describe sound effects/ambience); omit `voice` and `input_references`. Seed limits (400): `input` ≤3000 chars; `speed` 0.5–2.0; ≤120 s generated audio per request; no provider options.

Provider notes:

- **Azure MAI-Voice** (`microsoft/mai-voice-2`, `microsoft/mai-voice-2.1`, `microsoft/mai-voice-2.1-flash`): SSML abstracted; `voice` = full Azure voice ID with model suffix (`:MAI-Voice-2`, `:MAI-Voice-2.1`, `:MAI-Voice-2.1-Flash`, e.g. `en-US-Harper:MAI-Voice-2.1`); voice locale sets the language; `mp3` or `pcm` (24 kHz mono).
- **Fish Audio**: delivery directions in square brackets in text (`[whispering] Nobody answered.`); OpenRouter prepends `instructions` the same way (billed as characters). Multi-speaker: one `reference_id` per distinct voice, `<|speaker:N|>` turn tags. S1: no multi-speaker; reference audio can't combine with multi-speaker.
- **Gemini TTS** (3.8): reads `input` verbatim (directions in text may be spoken) — use `instructions` (sent as `speech_metadata.style`); other `speech_metadata` fields via provider options; remaining options forwarded as generation config. Multi-speaker builds `multiSpeakerVoiceConfig` automatically; a custom `speechConfig` in options replaces it (speaker names must match resolved voice names).

```json
{ "model": "google/gemini-3.8-flash-lite-tts", "input": "Have a wonderful day!", "voice": "Kore",
  "instructions": "warm and friendly", "response_format": "pcm",
  "provider": { "options": { "google-ai-studio": { "temperature": 0.7 } } } }
```

```json
{ "model": "openai/gpt-4o-mini-tts-2025-12-15", "input": "Hello world", "voice": "alloy",
  "provider": { "options": { "openai": { "stream_format": "audio" } } } }
```

Response headers: `Content-Type` (`audio/mpeg` for mp3, `audio/pcm` for pcm), `X-Generation-Id`. `mp3` = compressed (storage/playback); `pcm` = raw, lower latency (real-time pipelines).

Pricing: mostly **per input character**; some (Seed Audio 1.0) **per second** of generated audio, reported under `pricing.completion`.

Gotchas: default format is `pcm` — don't save it as `.mp3`; non-200 responses are JSON errors, not audio; use full slugs (`openai/gpt-4o-mini-tts-2025-12-15`, not `gpt-4o-mini-tts`); split very long texts.

Sources: https://openrouter.ai/docs/guides/overview/multimodal/tts

### 9.25 Speech-to-text (`POST /api/v1/audio/transcriptions`)

Dedicated transcription endpoint returning JSON. Discover models with `GET /api/v1/models?output_modalities=transcription` (also the Speech-to-Text collection on the site).

JSON request:

| Parameter | Type | Required | Description |
| - | - | - | - |
| `model` | string | Yes | e.g. `openai/whisper-1`, `openai/whisper-large-v3` |
| `input_audio` | object | Yes | Audio to transcribe |
| `input_audio.data` | string | Yes | Base64 audio (raw bytes, **not** a data URI) |
| `input_audio.format` | string | Yes | e.g. `wav`, `mp3`, `flac`, `m4a`, `ogg`, `webm`, `aac` |
| `input_audio.url` | string | – | For models that accept a URL: provider downloads directly (bypasses the 25 MB inline cap) |
| `language` | string | No | ISO-639-1 (e.g. `"en"`, `"ja"`); auto-detected if omitted |
| `temperature` | number | No | 0–1 |
| `response_format` | string | No | `json` (default) or `verbose_json` |
| `timestamp_granularities` | string[] | No | `["segment"]` and/or `["word"]`; only with `verbose_json` |
| `provider` | object | No | `zdr`, `data_collection`, and `provider.options`; `order`/`only`/`ignore` not applied |

```typescript
// TypeScript SDK: openRouter.stt.createTranscription
import fs from 'fs';

const base64Audio = (await fs.promises.readFile('audio.wav')).toString('base64');
const result = await openRouter.stt.createTranscription({
  sttRequest: { model: 'openai/whisper-1', inputAudio: { data: base64Audio, format: 'wav' } },
});
console.log(result.text);
```

```python
import base64, os, requests

with open("audio.wav", "rb") as f:
    base64_audio = base64.b64encode(f.read()).decode("utf-8")

response = requests.post(
    "https://openrouter.ai/api/v1/audio/transcriptions",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={"model": "openai/whisper-1", "input_audio": {"data": base64_audio, "format": "wav"}},
)
print(response.json()["text"])
```

```bash
# Verbose transcript with diarization via provider options (Azure)
AUDIO_BASE64=$(base64 < audio.mp3 | tr -d '\n')
curl https://openrouter.ai/api/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "microsoft/mai-transcribe-2", "input_audio": { "data": "'"$AUDIO_BASE64"'", "format": "mp3" },
        "response_format": "verbose_json", "timestamp_granularities": ["segment", "word"],
        "provider": { "options": { "azure": { "diarization": { "enabled": true } } } } }'
```

**OpenAI-compatible multipart** (`multipart/form-data`; official OpenAI SDKs work with base URL `https://openrouter.ai/api/v1`): supported fields `file`, `model`, `language`, `temperature`, `response_format`, `timestamp_granularities` (`timestamp_granularities[]=word`); `prompt` accepted but ignored; `response_format` `text`, `srt`, `vtt` ⇒ 400. Multipart uploads capped at **25 MB** (~26 min of 128 kbps MP3, ~13 min of 16 kHz mono WAV) — prefer mp3/opus.

```python
from openai import OpenAI
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
with open("audio.wav", "rb") as f:
    print(client.audio.transcriptions.create(model="openai/whisper-large-v3", file=f).text)
```

Larger files: base64 JSON via `input_audio` on **OpenAI and Groq** models (offloaded, accepts > 25 MB), or `input_audio.url` for URL-capable models. Other providers reject base64 JSON past the multipart cap. Upstream providers time out after **60 seconds** per request — split long recordings.

**Provider options**: `provider.options` keyed by the endpoint `tag` from `GET /api/v1/models/{author}/{slug}/endpoints`; sent under the provider's own field names. Normalized params (`language`, `temperature`, `response_format`, `timestamp_granularities`) stay top-level. Some integrations forward only an allowlist and silently drop the rest (Deepgram accepts `punctuate`, `diarize`, `smart_format`, `detect_language`); others (Azure) forward most fields as-is (invalid ones surface as provider errors).

```json
{ "model": "openai/whisper-large-v3", "input_audio": { "data": "UklGRiQA...", "format": "wav" },
  "provider": { "options": { "groq": { "prompt": "Expected vocabulary: OpenRouter, API, transcription" } } } }
```

**Verbose transcripts**: `verbose_json` adds `language`, `duration`, `segments` (`start`, `end`, `text`, optional `speaker`), `task` (OpenAI-compatible providers), `confidence` (when scored), and `words` (with `"word"` granularity; `word`, `start`, `end`, optional `speaker`, `confidence`). Field presence varies by provider; providers without structured output, and some models (`openai/gpt-4o-transcribe`, `microsoft/mai-transcribe-1.5`), reject `verbose_json` with 400. Diarization is enabled through provider options (Azure labels phrases → applied to segments and words; Deepgram `diarize`).

Response:

```json
{ "text": "Hello, this is a test of speech-to-text transcription.",
  "usage": { "seconds": 9.2, "total_tokens": 113, "input_tokens": 83, "output_tokens": 30, "cost": 0.000508 } }
```

| Field | Description |
| - | - |
| `text` | Transcript |
| `task`, `language`, `duration`, `confidence`, `segments`, `words` | `verbose_json` only (see above) |
| `usage.seconds` | Input audio duration |
| `usage.total_tokens`, `usage.input_tokens`, `usage.output_tokens` | Token counts (token-priced models) |
| `usage.cost` | USD cost |

Header: `X-Generation-Id`. Common formats: `wav` (`audio/wav`), `mp3` (`audio/mpeg`), `flac`, `m4a` (`audio/mp4`), `ogg`, `webm`, `aac`.

Pricing: duration-based (e.g. Whisper, per second) or token-based (newer OpenAI models). **BYOK supported** (OpenRouter charges only its platform fee). STT vs audio input: STT is optimized transcription with structured JSON; audio input via Responses ([§9.20](#920-audio-inputs-and-audio-output)) is for conversational analysis/Q&A about audio.

Gotchas: `input_audio.data` must be raw base64, not `data:` URI (opposite of TTS references); match `format` to the actual bytes; use full slugs (`openai/whisper-1`).

Sources: https://openrouter.ai/docs/guides/overview/multimodal/stt

### 9.26 Client tool calling (function calling)

The model does not execute tools; it **suggests** calls. Your application runs them and sends results back; the model then answers. OpenRouter normalizes the interface across models/providers. Find tool-capable models: `https://openrouter.ai/models?supported_parameters=tools` or `GET /api/v1/models?supported_parameters=tools`.

#### Three-step flow — Responses API (`POST /api/v1/responses`)

Step 1: request with tools (function tools are **flat**: `type`, `name`, `description`, `parameters`):

```json
{
  "model": "google/gemini-3-flash-preview",
  "input": [{ "role": "user", "content": "What are the titles of some James Joyce books?" }],
  "tools": [{
    "type": "function",
    "name": "search_gutenberg_books",
    "description": "Search for books in the Project Gutenberg library",
    "parameters": {
      "type": "object",
      "properties": { "search_terms": { "type": "array", "items": { "type": "string" }, "description": "List of search terms to find books" } },
      "required": ["search_terms"],
      "additionalProperties": false
    }
  }]
}
```

Step 2: the response `output` contains `function_call` items:

```json
{ "type": "function_call", "id": "fc_abc123", "call_id": "call_xyz789", "name": "search_gutenberg_books",
  "arguments": "{\"search_terms\": [\"James\", \"Joyce\"]}" }
```

Required fields on a `function_call`: `type`, `id`, `name`, `arguments` (JSON **string**), `call_id`. Execute locally.

Step 3: resend the whole history — original input, **every output item** (including `reasoning` items and assistant messages), and one `function_call_output` per call (`id` optional; `type`, `call_id`, `output` required) — **plus the same `tools`**:

```json
{
  "model": "google/gemini-3-flash-preview",
  "input": [
    { "role": "user", "content": "What are the titles of some James Joyce books?" },
    { "type": "function_call", "call_id": "call_abc123", "name": "search_gutenberg_books", "arguments": "{\"search_terms\": [\"James\", \"Joyce\"]}" },
    { "type": "function_call_output", "call_id": "call_abc123", "output": "[{\"id\": 4300, \"title\": \"Ulysses\", \"authors\": [{\"name\": \"Joyce, James\"}]}]" }
  ],
  "tools": [ { "type": "function", "name": "search_gutenberg_books", "description": "...", "parameters": { "...": "..." } } ]
}
```

**Multimodal tool output** (Responses): `function_call_output.output` may be a string **or** an array of input parts (`input_text`, `input_image`, `input_file`); non-text parts are forwarded only to multimodal models.

```json
{ "type": "function_call_output", "call_id": "call_123", "output": [
  { "type": "input_text", "text": "{\"results\":[{\"title\":\"Golden Gate Bridge\"}]}" },
  { "type": "input_image", "image_url": "https://example.com/image.jpg" } ] }
```

#### Three-step flow — Chat Completions (`POST /api/v1/chat/completions`)

Function tools nest under `function`; the model returns `tool_calls` on the assistant message (`finish_reason: "tool_calls"`); results go back as `role: "tool"` messages.

```json
{
  "model": "google/gemini-3-flash-preview",
  "messages": [
    { "role": "user", "content": "What are the titles of some James Joyce books?" },
    { "role": "assistant", "content": null, "tool_calls": [{
        "id": "call_abc123", "type": "function",
        "function": { "name": "search_gutenberg_books", "arguments": "{\"search_terms\": [\"James\", \"Joyce\"]}" } }] },
    { "role": "tool", "tool_call_id": "call_abc123", "content": "[{\"id\": 4300, \"title\": \"Ulysses\"}]" }
  ],
  "tools": [{ "type": "function", "function": {
    "name": "search_gutenberg_books",
    "description": "Search for books in the Project Gutenberg library",
    "parameters": { "type": "object",
      "properties": { "search_terms": { "type": "array", "items": { "type": "string" } } },
      "required": ["search_terms"] } } }]
}
```

Chat tool messages accept `content` as a string or array of content parts.

**On both APIs, include `tools` in every request** (steps 1 and 3) so the router can validate the tool schema each call.

#### Tool definition fields (Chat `function` object; Responses equivalents are top-level)

| Field | Notes |
| - | - |
| `name` | Required. `a-z`, `A-Z`, `0-9`, `_`, `-`, max 64 chars |
| `description` | Strongly recommended — drives when the model uses it |
| `parameters` | JSON Schema object (validated against Draft 7 for reliability metrics, [§9.5](#95-auto-exacto-and-the-exacto-variant-tool-calling-quality-routing)) |
| `strict` | `true` for strict schema adherence where supported. **Anthropic: requires header `x-anthropic-beta: structured-outputs-2025-11-13`, otherwise `strict` is stripped** ([§9.3](#93-provider-routing-the-provider-object)) |
| `defer_loading` | Hide the tool until revealed by tool search ([§9.31](#931-server-tools-tool-search-openroutertool_search-and-deferred-tools)) |
| `cache_control` | Anthropic-style cache breakpoint on the tool (Chat) |

#### `tool_choice`

| Value | Responses API | Chat Completions |
| - | - | - |
| Let model decide (default) | `"auto"` | `"auto"` |
| Disable tools | `"none"` | `"none"` |
| Must call some tool | `"required"` | `"required"` |
| Force a specific function | `{ "type": "function", "name": "search_database" }` | `{ "type": "function", "function": { "name": "search_database" } }` |
| Restrict to a set | `{ "type": "allowed_tools", "mode": "auto" \| "required", "tools": [{ "type": "function", "name": "get_weather" }] }` | – |
| Force a server tool | `{ "type": "web_search_preview" }` / `apply_patch` / `shell` / `{ "type": "mcp", "server_label": "...", "name": "..." }` | OpenRouter extension: `{ "type": "openrouter:web_search" }` (also `web_search`, `web_search_preview`) |

#### Parallel tool calls

`parallel_tool_calls` (default true for most models). `false` ⇒ at most one tool call per response. With parallel calls, return one `function_call_output` / `tool` message per `call_id`.

#### Streaming tool calls

Responses API SSE events to handle:

- `response.output_text.delta` — text tokens.
- `response.output_item.added` with `item.type === "function_call"` — a call started (name available).
- `response.function_call_arguments.delta` / `response.function_call_arguments.done` — argument streaming / final `arguments`.
- `response.output_item.done` — completed item; a completed `function_call` carries the full `arguments`. **Collect every completed item in order** (reasoning and assistant items are required context for some providers when sending tool results).
- `response.completed` — run tools, then send a follow-up with input + all output items + `function_call_output`s.
- `response.failed` (`event.response.error`) and `response.incomplete` (`event.response.incomplete_details.reason`) — handle as errors.

```typescript
const res = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'anthropic/claude-sonnet-4.5', input, tools, stream: true }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
const outputItems: any[] = [];
const toolCalls: any[] = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;
    const event = JSON.parse(data);
    if (event.type === 'response.failed') throw new Error(event.response.error?.message ?? 'Response failed');
    if (event.type === 'response.incomplete') throw new Error(`Incomplete: ${event.response.incomplete_details?.reason}`);
    if (event.type === 'response.output_text.delta') process.stdout.write(event.delta);
    if (event.type === 'response.output_item.done') {
      outputItems.push(event.item);
      if (event.item.type === 'function_call') toolCalls.push(event.item);
    }
  }
}
// if toolCalls.length > 0: run them, then POST input + outputItems + function_call_output items
```

Chat Completions streaming: `choices[].delta.tool_calls[]` entries with `index` (required), `id`, `type: "function"`, `function.name`, `function.arguments` (JSON fragments) — accumulate per `index`. Anthropic: OpenRouter sets `eager_input_streaming: true` on user tools for streamed requests so arguments arrive incrementally like other providers.

#### End-to-end example: Project Gutenberg search with an agentic loop (official)

The tool is a normal function plus an OpenAI-style JSON spec; the model requests it, your code runs it, and the loop repeats until the model answers without tool calls.

TypeScript SDK — setup, tool, and helpers. Types come from `@openrouter/sdk/models`; **SDK objects are camelCase** (`callId`, not `call_id`):

```typescript
import type {
  FunctionCallOutputItem, InputsUnion1, OpenAIResponsesRefusalContent, OpenResponsesResult,
  OutputFunctionCallItem, OutputMessageItem, OutputReasoningItem, ResponseOutputText, ResponsesRequestToolFunction,
} from '@openrouter/sdk/models';
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const instructions = 'You are a helpful assistant.';
const input: InputsUnion1[] = [{ role: 'user', content: 'What are the titles of some James Joyce books?' }];

type Book = { id: number; title: string; authors: { name: string }[] };

async function searchGutenbergBooks(searchTerms: string[]): Promise<Book[]> {
  const response = await fetch(`https://gutendex.com/books?search=${searchTerms.join(' ')}`);
  const data: any = await response.json(); // the docs validate this with type guards
  return data.results.map((b: Book) => ({ id: b.id, title: b.title, authors: b.authors.map((a) => ({ name: a.name })) }));
}

const tools: ResponsesRequestToolFunction[] = [{
  type: 'function',
  name: 'searchGutenbergBooks',
  description: 'Search for books in the Project Gutenberg library based on specified search terms',
  parameters: {
    type: 'object',
    properties: {
      search_terms: {
        type: 'array',
        items: { type: 'string' },
        description: "List of search terms to find books in the Gutenberg library (e.g. ['dickens', 'great'] to search for books by Dickens with 'great' in the title)",
      },
    },
    required: ['search_terms'],
  },
}];

function parseSearchTerms(argumentsJson: string): string[] {
  const args: any = JSON.parse(argumentsJson);
  if (!Array.isArray(args?.search_terms) || !args.search_terms.every((t: unknown) => typeof t === 'string')) {
    throw new Error('Invalid arguments for searchGutenbergBooks');
  }
  return args.search_terms;
}

// Output items must be converted back to input items before replaying them.
function convertOutputItemToInput(item: OpenResponsesResult['output'][number]): InputsUnion1 {
  if (item.type === 'message') {
    const msg = item as OutputMessageItem;
    const content = msg.content.filter(
      (c): c is OpenAIResponsesRefusalContent | ResponseOutputText => c.type === 'output_text' || c.type === 'refusal',
    );
    if (content.length !== msg.content.length) throw new Error('Received an unsupported message content type');
    return { ...msg, content };
  }
  if (item.type === 'function_call' || item.type === 'reasoning') {
    return item as OutputFunctionCallItem | OutputReasoningItem;
  }
  throw new Error(`Received an unexpected output item: ${item.type}`);
}
```

TypeScript SDK — the loop:

```typescript
async function callLLM(input: InputsUnion1[]): Promise<OpenResponsesResult> {
  const result = await openRouter.responses.send({
    responsesRequest: { model: 'google/gemini-3-flash-preview', instructions, tools, input, stream: false },
  });
  if (!('output' in result)) throw new Error('Expected a non-streaming response');
  if (result.status !== 'completed') throw new Error(result.error?.message ?? `Response ended as ${result.status}`);
  input.push(...result.output.map(convertOutputItemToInput)); // replay every output item in order
  return result;
}

async function getToolResponse(toolCall: OutputFunctionCallItem): Promise<FunctionCallOutputItem> {
  if (toolCall.name !== 'searchGutenbergBooks') throw new Error(`Unknown tool: ${toolCall.name}`);
  const toolResult = await searchGutenbergBooks(parseSearchTerms(toolCall.arguments));
  return { type: 'function_call_output', callId: toolCall.callId, output: JSON.stringify(toolResult) };
}

const maxIterations = 10;
let finalText: string | undefined;
for (let i = 0; i < maxIterations; i++) {
  const response = await callLLM(input);
  const toolCalls = response.output.filter((item): item is OutputFunctionCallItem => item.type === 'function_call');
  if (toolCalls.length === 0) {
    const message = [...response.output].reverse().find((item) => item.type === 'message');
    finalText = message?.content.find((part) => part.type === 'output_text')?.text ?? '';
    break;
  }
  for (const toolCall of toolCalls) input.push(await getToolResponse(toolCall));
}
if (finalText === undefined) console.warn('Warning: Maximum iterations reached');
console.log(finalText);
```

Python — the official example uses the **OpenAI SDK's Responses client** against OpenRouter:

```python
import json, os, requests
from openai import OpenAI

openai_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
MODEL = "google/gemini-3-flash-preview"  # any tool-calling model
instructions = "You are a helpful assistant."
input_items = [{"role": "user", "content": "What are the titles of some James Joyce books?"}]

def search_gutenberg_books(search_terms):
    response = requests.get("https://gutendex.com/books", params={"search": " ".join(search_terms)})
    return [{"id": b.get("id"), "title": b.get("title"), "authors": b.get("authors")}
            for b in response.json().get("results", [])]

tools = [{
    "type": "function",
    "name": "search_gutenberg_books",
    "description": "Search for books in the Project Gutenberg library based on specified search terms",
    "parameters": {
        "type": "object",
        "properties": {"search_terms": {"type": "array", "items": {"type": "string"},
            "description": "List of search terms to find books in the Gutenberg library (e.g. ['dickens', 'great'] to search for books by Dickens with 'great' in the title)"}},
        "required": ["search_terms"],
    },
}]
TOOL_MAPPING = {"search_gutenberg_books": search_gutenberg_books}

def call_llm(items):
    resp = openai_client.responses.create(model=MODEL, instructions=instructions, tools=tools, input=items)
    if resp.status != "completed":
        raise RuntimeError(resp.error.message if resp.error else f"Response ended as {resp.status}")
    items += resp.output  # append every output item so the model keeps full context
    return resp

def get_tool_response(tool_call):
    tool_result = TOOL_MAPPING[tool_call.name](**json.loads(tool_call.arguments))
    return {"type": "function_call_output", "call_id": tool_call.call_id, "output": json.dumps(tool_result)}

final_text = None
for _ in range(10):
    resp = call_llm(input_items)
    tool_calls = [item for item in resp.output if item.type == "function_call"]
    if not tool_calls:
        final_text = resp.output_text
        break
    for tool_call in tool_calls:
        input_items.append(get_tool_response(tool_call))

if final_text is None:
    print("Warning: Maximum iterations reached")
print(final_text)
```

With raw `fetch`, the same two-step flow works on plain JSON: `const input_2 = [...input, ...data_1.output]`, then push `{ type: 'function_call_output', call_id: toolCall.call_id, output: JSON.stringify(result) }` per call (snake_case) and POST again with the same `instructions` and `tools`. The docs' fetch version uses the tool name `search_gutenberg_books`; the SDK version uses `searchGutenbergBooks` — either is valid as long as definition and dispatcher agree.

For a managed loop with stop conditions, approvals and streaming, use the Agent SDK `callModel` ([§2](02-agent-sdk.md#2-agent-sdk-openrouteragent)).

#### Interleaved thinking

Reasoning models can reason **between** tool calls (reason about a result, then decide the next call), at the cost of more tokens and latency. Requirements: a capable model (e.g. `anthropic/claude-sonnet-4.5`; for Claude send `x-anthropic-beta: interleaved-thinking-2025-05-14`), and **preserve reasoning across turns** (Responses: keep `reasoning` output items in `input`; Chat: keep `reasoning_details` on assistant messages — [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). Best practices: clear tool descriptions, structured parameter schemas, preserve context across tool interactions, return meaningful tool error messages so the model can adjust.

#### Best practices

- Descriptive names (`get_weather_forecast`, not `weather`) and detailed descriptions with examples and units; use `enum`, `default`, `required`, `additionalProperties: false`.
- Design composable tools (search → get details → check inventory).
- Validate `arguments` (JSON parse + schema) before executing; handle the model not calling a tool.
- Keep the `tools` array (and order) stable across turns for prompt caching; consider Tool Search for large libraries ([§9.31](#931-server-tools-tool-search-openroutertool_search-and-deferred-tools)).
- Reliability: per-endpoint **Tool Call Error Rate** on model Performance tabs; Auto Exacto routes tool requests by it ([§9.5](#95-auto-exacto-and-the-exacto-variant-tool-calling-quality-routing)). Use `:exacto` for tool-heavy agents; `provider.require_parameters: true` to exclude providers lacking tool support.

#### Gotchas

- Responses tools are flat (`name` at top level); Chat tools nest under `function`. Forced-tool `tool_choice` shapes differ the same way.
- `arguments` is a JSON **string**; always `JSON.parse` and validate.
- In `@openrouter/sdk`, output items and `function_call_output` use `callId`; in raw JSON and the OpenAI Python SDK it is `call_id`. When replaying SDK output items as input, convert them (`convertOutputItemToInput` above) rather than pushing raw output objects.
- Omitting `tools` on the follow-up request breaks validation/routing.
- Dropping `reasoning` items / `reasoning_details` between turns breaks interleaved thinking and some providers' tool continuations.
- With `parallel_tool_calls`, answer **every** `call_id` before the next request.

Sources: https://openrouter.ai/docs/guides/features/tool-calling, https://openrouter.ai/docs/guides/routing/provider-selection, https://openrouter.ai/docs/guides/routing/auto-exacto

### 9.27 Server tools: concepts, catalog, limits, privacy

**Beta** — API and behavior may change. Server tools are operated by OpenRouter; any model can call them during a request; OpenRouter executes them server-side and returns results to the model (no client implementation).

| | Server tools | Plugins | User-defined tools |
| - | - | - | - |
| Who decides to use it | The model | Always runs (when enabled) | The model |
| Who executes it | OpenRouter | OpenRouter | Your application |
| Call frequency | 0–N per request | Once per request | 0–N per request |
| Specified via | `tools` array | `plugins` array | `tools` array |
| Type prefix | `openrouter:*` | N/A | `function` |

#### Catalog

| Tool | `type` | API restrictions (per guides) | Summary |
| - | - | - | - |
| Web Search | `openrouter:web_search` (OpenAI-style `web_search`, `web_search_preview`, `web_search_preview_2025_03_11`, `web_search_2025_08_26` are hoisted to it) | None stated | Search the web ([§9.28](#928-server-tools-web-search-openrouterweb_search-and-web-fetch-openrouterweb_fetch)) |
| Web Fetch | `openrouter:web_fetch` | None stated | Fetch/extract a URL or PDF ([§9.28](#928-server-tools-web-search-openrouterweb_search-and-web-fetch-openrouterweb_fetch)) |
| Datetime | `openrouter:datetime` | None stated | Current date/time ([§9.29](#929-server-tools-datetime-image-generation-search-models)) |
| Image Generation | `openrouter:image_generation` | None stated | Generate images ([§9.29](#929-server-tools-datetime-image-generation-search-models)) |
| Search Models | `openrouter:experimental__search_models` | None stated (experimental) | Search the model catalog ([§9.29](#929-server-tools-datetime-image-generation-search-models)) |
| Files | `openrouter:files` | Not covered here | Read/write/edit/list workspace text files via the Files API ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)) |
| Apply Patch | `openrouter:apply_patch` | **Responses only** | Validate V4A diffs; your app applies ([§9.30](#930-server-tools-apply-patch-shell-bash-coding-and-execution)) |
| Shell | `openrouter:shell` | **Responses and Messages** (Chat ⇒ 400) | Hosted sandboxed shell ([§9.30](#930-server-tools-apply-patch-shell-bash-coding-and-execution)) |
| Bash | `openrouter:bash` | **Messages only** (Chat/Responses ⇒ 400) | Anthropic-style bash; client-side or sandboxed ([§9.30](#930-server-tools-apply-patch-shell-bash-coding-and-execution)) |
| Tool Search | `openrouter:tool_search` | **Responses and Messages** (Chat ⇒ 400; use `deferred_tools`) | Discover deferred tools ([§9.31](#931-server-tools-tool-search-openroutertool_search-and-deferred-tools)) |
| Fusion | `openrouter:fusion` | Responses recommended (works on Chat, slower) | Panel + analyst deliberation ([§9.32](#932-server-tools-fusion-advisor-subagent-inner-model-calls)) |
| Advisor | `openrouter:advisor` | Chat, Responses, Messages (Messages also native `advisor_20260301`) | Consult a stronger model ([§9.32](#932-server-tools-fusion-advisor-subagent-inner-model-calls)) |
| Subagent | `openrouter:subagent` | Function inheritance is Responses-only | Delegate to a worker model ([§9.32](#932-server-tools-fusion-advisor-subagent-inner-model-calls)) |

The spec's Chat Completions `tools` union also contains a generic envelope (`{ "type": "<registered server tool or shorthand>", "parameters": {...} }`, validated against the tool definition), so server tools can be addressed by type name.

Catalog API: `GET /api/v1/tools` (all server tools, with engines' `executed_by` and `data_regions`) and `GET /api/v1/tools/{name}` (by canonical name or alias, with models that run it natively) — [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs).

#### How server tools run

1. Add server tools to `tools` (you can mix with your function tools).
2. The model decides whether/when to call each.
3. OpenRouter intercepts the call, executes it, returns the result to the model; the model may call again.
4. The model writes its response. Your function tool calls are still returned to you as usual.

**Native execution**: when the endpoint has a built-in version (e.g. OpenAI/Anthropic web search), OpenRouter can run the provider's tool (`engine: "native"`). Each endpoint object (`GET /api/v1/models/{author}/{slug}/endpoints`) has `native_tools` mapping canonical OpenRouter tool name → provider tool:

```json
{ "name": "Anthropic | anthropic/claude-sonnet-4.5",
  "native_tools": { "openrouter:web_search": { "type": "web_search_20260209" },
                    "openrouter:web_fetch": { "type": "web_fetch_20260209" },
                    "openrouter:bash": { "type": "bash_20250124" } } }
```

(Bash is the exception: Anthropic's native bash returns the command for your application to run.)

#### Quick start (official)

```python
import os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "openai/gpt-5.2",
        "input": "What are the latest developments in AI?",
        "tools": [{"type": "openrouter:web_search"}, {"type": "openrouter:datetime"}],
    },
)
data = response.json()
message = next(item for item in reversed(data["output"]) if item["type"] == "message")
print(next(part["text"] for part in message["content"] if part["type"] == "output_text"))
```

The same body works with `fetch` or cURL against `POST /api/v1/responses`; read the **last** `message` item, since server-tool items (and intermediate messages) can precede it.

#### Combining with user-defined tools

```json
{
  "model": "openai/gpt-5.2",
  "input": [...],
  "tools": [
    { "type": "openrouter:web_search", "parameters": { "max_results": 3 } },
    { "type": "openrouter:datetime" },
    { "type": "function", "name": "get_stock_price", "description": "Get the current stock price for a ticker symbol",
      "parameters": { "type": "object", "properties": { "ticker": { "type": "string" } }, "required": ["ticker"] } }
  ]
}
```

#### Tool call limits (outer agent loop)

| Field (top-level, sibling of `input`/`tools`) | Default | Max | Behavior |
| - | - | - | - |
| `max_tool_calls` | `30` | `30` | Total server-tool steps per request across all server tools; when exhausted the model must give its final answer |
| `stop_server_tools_when` | none | – | Array of stop conditions (OR logic); **overrides** `max_tool_calls` |

Spec note: the Responses request schema has both fields; the Chat Completions request schema lists `stop_server_tools_when` but not `max_tool_calls` — on Chat, use `stop_server_tools_when` (e.g. `step_count_is`) to bound the loop.

`stop_server_tools_when` condition types (spec): `{ "type": "step_count_is", "step_count": 5 }`, `{ "type": "has_tool_call", "tool_name": "finalize" }`, `{ "type": "max_tokens_used", "max_tokens": 10000 }`, `{ "type": "max_cost", "max_cost_in_dollars": 0.5 }`, `{ "type": "finish_reason_is", "reason": "length" }`. When a condition fires while the model is still emitting tool calls, pending calls are executed and one final turn runs with tools disabled so the response ends in natural language.

```json
{ "model": "openai/gpt-5.2", "input": "What were the major AI announcements this week?",
  "tools": [{ "type": "openrouter:web_search" }],
  "stop_server_tools_when": [{ "type": "step_count_is", "step_count": 5 }, { "type": "max_cost", "max_cost_in_dollars": 0.5 }] }
```

Per-tool inner budgets (independent of the outer budget): Fusion `parameters.max_tool_calls` default 4, max 16; Subagent `parameters.max_tool_calls` provider default, max 25.

#### Usage tracking

```json
{ "usage": { "input_tokens": 105, "output_tokens": 250, "total_tokens": 355,
  "server_tool_use_details": { "web_search_requests": 2, "tool_calls_requested": 2, "tool_calls_executed": 2 } } }
```

#### Privacy and regional availability

Execution paths: **Provider** (native), **OpenRouter** (in-process, OpenRouter sandbox, inner generation, or third-party service such as Exa, Parallel, Perplexity, Firecrawl), **Client** (returned to your app).

| Tool | Execution path | Global | US | EU | ZDR enforcement / backend policy |
| - | - | - | - | - | - |
| Web Search | Provider (`native`) or OpenRouter → Exa/Parallel/Perplexity/Firecrawl | All engines | Exa only | None | Firecrawl rejected when ZDR enforced; others apply their own retention |
| Web Fetch | Provider (`native`) or OpenRouter → Exa/Parallel/Firecrawl or OpenRouter fetcher | All engines | None | None | Firecrawl rejected when ZDR enforced |
| Apply Patch | Provider or OpenRouter validator; your app applies | Yes | Yes | Yes | No backend beyond inference |
| Bash client-side (`auto`, `native`) | Client | Yes | Yes | Yes | Commands run in your app |
| Bash sandboxed (`openrouter`) | OpenRouter sandbox | Yes | No | No | ZDR does not apply to sandbox contents |
| Shell | OpenRouter sandbox | Yes | No | No | ZDR does not apply to sandbox contents |
| Advisor | Provider passthrough or OpenRouter inner generation | Yes | Yes | Yes | Inner generation receives request `provider` prefs incl. `zdr`, `data_collection` |
| Subagent | OpenRouter inner generation | Yes | Yes | Yes | Same as Advisor |
| Fusion | OpenRouter inner panel + analyst | Yes | No | No | Runs under your key (account/guardrail ZDR apply); request `provider` prefs **not** forwarded |
| Image Generation | OpenRouter inner image generation | Yes | No | No | Same as Fusion |
| Datetime | In-process | Yes | Yes | Yes | No backend |
| Tool Search | In-process | Yes | Yes | Yes | No backend |
| Search Models | In-process | Yes | Yes | Yes | Queries the catalog |
| Files | Files API storage | Yes | No | No | ZDR does not apply to stored files |

- ZDR restricts inference endpoints only; it does not disable server tools/plugins or change third-party retention. The only tool-level ZDR rule: with ZDR enforced (privacy settings or a guardrail), Web Search, Web Fetch and the Web Search plugin reject Firecrawl.
- In-region routing gates: (1) request admission by regional hostname (`eu.openrouter.ai`, `us.openrouter.ai`) and guardrail `allowed_data_regions`; (2) execution residency per tool/engine — `engine: "auto"`/omitted selects only resident engines; a pinned non-resident engine is rejected. No resident engine ⇒ server tool `403` (Web Search plugin `400`); no fallback to global. On regional endpoints, client-side Bash is rejected if the request also includes another server tool without an in-region native path (only Apply Patch and Advisor have one).

#### Gotchas

- Server tools are **beta**; pin behavior with explicit parameters and watch for changes.
- `max_tool_calls` caps at 30; use `stop_server_tools_when` for cost caps.
- API availability differs per tool (Apply Patch Responses-only; Bash Messages-only; Shell/Tool Search not on Chat).
- Fusion and Image Generation inner calls ignore your request-level `provider` preferences.
- Force a specific server tool on Chat with `tool_choice: { "type": "openrouter:web_search" }`.

Sources: https://openrouter.ai/docs/guides/features/server-tools, https://openrouter.ai/docs/guides/routing/provider-selection

### 9.28 Server tools: web search (`openrouter:web_search`) and web fetch (`openrouter:web_fetch`)

#### Web search

The model decides if/when to search (possibly several times), OpenRouter runs the search with the configured engine (default `auto`: native provider search if available, else Exa), returns URLs/titles/snippets, and the model writes a grounded, cited answer.

```bash
# Quick start
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "openai/gpt-5.2", "input": "What were the major AI announcements this week?",
        "tools": [{ "type": "openrouter:web_search" }] }'
```

```python
# With parameters
import os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "openai/gpt-5.2",
        "input": "What is the current price of Bitcoin?",
        "tools": [{"type": "openrouter:web_search", "parameters": {"max_results": 3}}],
    },
)
data = response.json()
message = next(item for item in reversed(data["output"]) if item["type"] == "message")
print(next(part["text"] for part in message["content"] if part["type"] == "output_text"))
```

Full configuration shape:

```json
{ "type": "openrouter:web_search", "parameters": {
  "engine": "exa", "max_results": 5, "max_total_results": 20, "search_context_size": "medium",
  "allowed_domains": ["example.com"], "excluded_domains": ["reddit.com"] } }
```

| Parameter | Type | Default | Description |
| - | - | - | - |
| `engine` | string | `auto` | `auto`, `native`, `exa`, `firecrawl`, `parallel`, `perplexity` |
| `mode` | string | engine default | Exa: `instant`, `fast`, `auto`, `deep-lite`, `deep`, `deep-reasoning`. Parallel: `turbo`, `fast`, `basic`, `advanced`. Ignored by other engines |
| `max_results` | integer | 5 | Per search call: 1–25 (1–20 Perplexity; higher clamped). Exa/Firecrawl/Parallel/Perplexity; ignored for native |
| `max_uses` | integer | – | Max searches per request; then calls return an error result. Native: forwarded only to Anthropic |
| `max_total_results` | integer | – (spec: 50) | Cap on cumulative results across calls; then the tool returns a "limit hit" message |
| `search_context_size` | `low`\|`medium`\|`high` | – | Exa: fixed per-result cap 5K/15K/30K chars (omitted ⇒ adaptive ~2–4K). Parallel: total chars across results (default `medium`). Perplexity: native `search_context_size`. Ignored for native and Firecrawl. Overridden by `max_characters` |
| `max_characters` | integer 1–100,000 | – | Exact per-result content cap. Exa (highlights), Parallel (excerpts; default 1,500), Perplexity (via `max_tokens_per_page`, trimmed exactly). Wins over `search_context_size` |
| `user_location` | object | – | `{ "type": "approximate", "city", "region", "country", "timezone" }` (all optional); only native search |
| `allowed_domains` | string[] | – | Restrict domains (Exa, Firecrawl, Parallel, Perplexity, most native) |
| `excluded_domains` | string[] | – | Exclude domains (Exa, Firecrawl, Parallel, Perplexity, some native) |
| `x_search` | object | – | Opt in to X/Twitter search on SpaceXAI native search (below) |

**Native providers** (`auto`/`native`): OpenAI (GPT-4.1, 4.1 Mini, 4.1 Nano, GPT-5+, o3, o3 Pro, o4-mini), Anthropic (Claude 3.5 Haiku, 3.7 Sonnet, Claude 4+), Google (Gemini 3 Flash, 3 Pro, 3.1 Flash/Lite, 3.5 Flash), SpaceXAI (Grok 4+; X search needs opt-in), Perplexity (all models). Older OpenAI models (GPT-4o, GPT-4o Mini, GPT-4 Turbo) have no native search — `native` falls back to Exa. Check `native_tools` on endpoints or the "Web Search" badge.

Engine selection:

- `auto` (default): native if supported, else Exa.
- `native`: prefer provider search; fallback Exa (or the workspace's first non-native engine if an admin set an engine list; a list of only `native` ⇒ 403 on models without native search).
- `exa`: keyword + embeddings search; returns Exa **highlights** (query-relevant excerpts, separated by `[...]` within one result) surfaced in `url_citation` annotations.
- `firecrawl`: OpenRouter-managed key (no account needed); `$0.005` per search + `$0.0125` per returned result (5 results = $0.0675). Domain lists mutually exclusive.
- `parallel`: modes `turbo` (~200 ms, $1/1K requests, English+Japanese), `fast` (~550 ms, $1/1K), `basic` (default, ~1 s, $5/1K), `advanced` (~3 s, $5/1K); each includes up to 10 results, +$1 per 1K additional results. OpenRouter sends `basic` explicitly by default.
- `perplexity`: ranked results (titles, URLs, snippets) without LLM synthesis; `$0.005` per request; domain lists mutually exclusive (both ⇒ 400).

Exa modes: `instant` (~250 ms, $0.007), `fast` (~450 ms, $0.007), `auto` (default, ~1 s, $0.007), `deep-lite` (~4 s, $0.012), `deep` (~4–15 s, $0.012), `deep-reasoning` (~12–40 s, $0.015); up to 10 results included, then $0.001 per additional result.

| Feature | Exa | Firecrawl | Parallel | Perplexity | Native |
| - | - | - | - | - | - |
| Domain filtering | Yes | Yes | Yes | Yes (mutually exclusive) | Varies |
| Context size control | Yes (per result) | No | Yes (total) | Yes | No |
| API key | Server-side | OpenRouter-managed (table says "BYOK (your key)"; the text says no key required) | Server-side | Server-side | Provider |

Domain filtering per engine: Exa both simultaneously; Parallel, Firecrawl, Perplexity (400 if both), Anthropic native, SpaceXAI native: mutually exclusive; OpenAI native: `allowed_domains` only (`excluded_domains` ignored, no error); Google native: unsupported — with `auto` falls back to Exa when filters are set, with `native` ⇒ 400.

**X search (SpaceXAI)**: native search sends only xAI's `web_search`; add `x_search` (empty object = no filters) to also search X. Fields: `allowed_x_handles` / `excluded_x_handles` (≤20, mutually exclusive), `from_date`, `to_date` (ISO 8601), `enable_image_understanding`, `enable_video_understanding`. Opt-in because from Sept 21 2026 X Search bills per item ($5 per 1K posts, $10 per 1K profiles). Legacy top-level `x_search_filter` still enables it.

```json
{ "type": "openrouter:web_search", "parameters": { "engine": "native", "x_search": { "allowed_x_handles": ["OpenRouterAI"], "from_date": "2025-01-01" } } }
```

Budgets: `max_total_results` and `max_uses` per tool; every search also consumes one step of the request's shared server-tool budget (`max_tool_calls`, default/max 30; `stop_server_tools_when` overrides).

Citations: results surface as `url_citation` annotations (Chat: `message.annotations[]` with `url_citation: { url, title, content, start_index, end_index }`, where `content` is added by OpenRouter when available).

**Workspace settings** (Server Tools page): engine list, allowed and excluded domains. **Locked** (default on creation): requests limited to these settings; an engine outside the list or a domain list with no overlap ⇒ 403; a request `excluded_domains` under a workspace `allowed_domains` narrows the allowlist (403 if nothing remains or an excluded domain sits inside a remaining allowed domain). **Default** ("Prevent overrides" off): fills only what the request leaves unset; a request that sets either domain list (even empty) keeps its lists. In both modes, no engine/`auto` runs the workspace's Default engine; `native` without native support runs the Native fallback engine (both stored at the head of the engine list; a Default of **Auto** keeps OpenRouter's choice among allowed engines, preferring an in-region engine on regional endpoints). Workspace Plugins-tab settings do not apply to server tools.

Pricing (in addition to tokens for result content): Exa $0.007 (instant/fast/auto), $0.012 (deep-lite/deep), $0.015 (deep-reasoning), up to 10 results then $0.001 each; Parallel $0.001 (turbo/fast) or $0.005 (basic/advanced) per request, up to 10 results then $0.001 each; Perplexity $0.005/request; Firecrawl $0.005/search + $0.0125/result; Native: provider passthrough (OpenAI, Anthropic, Google, Perplexity, SpaceXAI pricing pages).

Privacy/regions: Firecrawl rejected under ZDR enforcement; on `us.openrouter.ai`, `exa`, `auto` and omitted engine run on Exa and every other engine (including `native`) is rejected; nothing available on `eu.openrouter.ai`.

**Migrating from the `web` plugin / `:online`** (both deprecated):

| | Web Search Plugin | Web Search Server Tool |
| - | - | - |
| Enable | `plugins: [{ "id": "web" }]` | `tools: [{ "type": "openrouter:web_search" }]` |
| Who decides | Always searches once | Model decides; 0–N times |
| Engines | Native, Exa, Firecrawl, Parallel, Perplexity | Auto, Native, Exa, Firecrawl, Parallel, Perplexity |
| Domain fields | `include_domains` / `exclude_domains` | `allowed_domains` / `excluded_domains` |
| Context size | `web_search_options` | `search_context_size` |
| Total results cap | No | `max_total_results` |

```json
// Before (deprecated)
{ "model": "openai/gpt-5.2", "input": "...", "plugins": [{ "id": "web", "engine": "exa", "max_results": 5, "include_domains": ["arxiv.org"] }] }
// After
{ "model": "openai/gpt-5.2", "input": "...", "tools": [{ "type": "openrouter:web_search", "parameters": { "engine": "exa", "max_results": 5, "allowed_domains": ["arxiv.org"] } }] }
// Before: { "model": "openai/gpt-5.2:online" }   After: { "model": "openai/gpt-5.2", "tools": [{ "type": "openrouter:web_search" }] }
```

Use one surface per request. If a `web` plugin (from `plugins`, `:online`, or a preset) coexists with the server tool and the tool runs as native search, tool params override the matching plugin settings (`allowed_domains`, `excluded_domains`, `max_results`, `user_location`, `max_uses`, `x_search`; the two domain lists count as one setting), plugin-only settings (e.g. `search_prompt`) are kept. Exceptions keeping plugin settings: a `web` plugin pinned to a non-native engine (its search already ran) and an account `web` setting with **Prevent overrides**.

#### Web fetch

The model fetches a specific URL (web page or PDF); OpenRouter extracts content (text, title, URL). Default engine `auto` (native fetch if available, else Exa).

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "openai/gpt-5.2", "input": "What does the documentation at https://example.com/docs say?",
        "tools": [{ "type": "openrouter:web_fetch", "parameters": { "max_content_tokens": 50000 } }] }'
```

Full configuration shape:

```json
{ "type": "openrouter:web_fetch", "parameters": {
  "engine": "exa", "max_uses": 10, "max_content_tokens": 100000,
  "allowed_domains": ["docs.example.com"], "blocked_domains": ["private.example.com"] } }
```

| Parameter | Type | Default | Description |
| - | - | - | - |
| `engine` | string | `auto` | `auto`, `native`, `exa`, `openrouter`, `firecrawl`, `parallel` |
| `max_uses` | integer | – | Max fetches per request; beyond ⇒ tool returns an error |
| `max_content_tokens` | integer | – | Truncate content beyond this many (approximate) tokens |
| `allowed_domains` | string[] | – | Only fetch from these |
| `blocked_domains` | string[] | – | Never fetch from these (note: `blocked_`, not `excluded_`) |

Engines: `auto`; `native` (falls back to the **`openrouter`** engine, or the workspace's first non-native engine; only-`native` list ⇒ 403 without native fetch); `exa` (Contents API, supports BYOK); `openrouter` (direct HTTP fetch + extraction); `firecrawl` (scrape API, OpenRouter-managed key, $0.0025/page); `parallel` (extract API).

| Feature | Exa | Parallel | Firecrawl | OpenRouter | Native |
| - | - | - | - | - | - |
| Domain filtering | Yes | Yes | Yes | Yes | Varies |
| Token truncation | Yes | Yes | Yes | Yes | No |
| API key | Server-side or BYOK | Server-side | Server-side | Server-side | Provider |
| Hard limit | None | None | None | 50/request | 50/request |

Result to the model: `{ "url": "...", "title": "...", "content": "...", "status": "completed", "retrieved_at": "2025-07-15T14:30:00.000Z" }`; failure: `{ "url": "...", "status": "failed", "error": "HTTP 404: Page not found" }`.

Pricing: Exa $1/1K fetches; Parallel $1/1K; Firecrawl $2.50/1K; OpenRouter engine free; native passthrough (plus tokens). Privacy: Firecrawl rejected under ZDR enforcement; **no engine on `eu.`/`us.openrouter.ai` — regional requests with web fetch ⇒ 403**. Workspace settings: same locked/default model as web search (allowed and blocked domains).

A `web-fetch` plugin also exists in the spec (`{ "id": "web-fetch", "max_uses", "max_content_tokens", "allowed_domains", "blocked_domains" }`), not documented in the guides.

Gotchas: web search uses `excluded_domains`; web fetch uses `blocked_domains`; the deprecated plugin uses `include_domains`/`exclude_domains`. Google native search can't filter domains. Search costs accrue even with `:free` models.

Sources: https://openrouter.ai/docs/guides/features/server-tools/web-search, https://openrouter.ai/docs/guides/features/server-tools/web-fetch, https://openrouter.ai/docs/guides/features/server-tools

### 9.29 Server tools: datetime, image generation, search models

#### Datetime (`openrouter:datetime`)

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "openai/gpt-5.2", "input": "What day of the week is it today?", "tools": [{ "type": "openrouter:datetime" }] }'
```

With a timezone: `{ "type": "openrouter:datetime", "parameters": { "timezone": "America/New_York" } }`.

| Parameter | Type | Default | Description |
| - | - | - | - |
| `timezone` | string | `UTC` | IANA timezone (e.g. `America/New_York`, `Europe/London`, `Asia/Tokyo`) |

Result: `{ "datetime": "2025-07-15T14:30:00.000-04:00", "timezone": "America/New_York" }`. No extra cost.

#### Image generation (`openrouter:image_generation`)

Any model can generate images; OpenRouter runs the configured image model (default `openai/gpt-5-image`).

```json
{ "type": "openrouter:image_generation", "parameters": {
  "model": "openai/gpt-5-image", "quality": "high", "aspect_ratio": "16:9",
  "size": "1024x1024", "background": "transparent", "output_format": "png" } }
```

| Parameter | Type | Default | Description |
| - | - | - | - |
| `model` | string | `openai/gpt-5-image` | Image model (see `?output_modalities=image`) |
| `quality` | string | – | e.g. `low`, `medium`, `high` |
| `size` | string | – | e.g. `1024x1024`, `512x512` |
| `aspect_ratio` | string | – | e.g. `16:9`, `1:1`, `4:3` |
| `background` | string | – | e.g. `transparent`, `opaque` |
| `output_format` | string | – | e.g. `png`, `jpeg`, `webp` |
| `output_compression` | number | – | 0–100 for lossy formats |
| `moderation` | string | – | e.g. `auto`, `low` |

All parameters except `model` pass through to the image API (spec: accepts all `image_config` params plus `model`).

Output: a dedicated item in `output` **before** the model's `message`:

```json
{ "type": "openrouter:image_generation", "id": "ig_abc123", "status": "completed",
  "result": "data:image/png;base64,...", "imageUrl": "data:image/png;base64,...", "prompt": "A futuristic city at sunset" }
```

Official example — request and read both the text and the image items (`result` holds a `data:` URL):

```typescript
const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/gpt-5.2',
    input: 'Generate an image of a mountain landscape',
    tools: [{ type: 'openrouter:image_generation', parameters: { quality: 'high' } }],
  }),
});
const data = await response.json();
const message = [...data.output].reverse().find((item: { type: string }) => item.type === 'message');
const text = message?.content.find((part: { type: string; text?: string }) => part.type === 'output_text')?.text;
if (text) console.log(text);

const images = data.output.filter((item: { type: string; result?: string }) => item.type === 'openrouter:image_generation');
for (const image of images) if (image.result) console.log(image.result);
if (!text && !images.some((image: { result?: string }) => image.result)) {
  throw new Error('Response contained neither text nor a generated image');
}
```

Model-facing result: `{ "status": "ok", "imageUrl": "data:image/png;base64,..." }` or `{ "status": "error", "error": "Generation failed due to content policy" }`. Pricing: underlying image model's price (e.g. `openai/gpt-5-image`, `openai/gpt-5-image-mini`, `openai/gpt-5.4-image-2`) plus normal token costs. Inner generations run under your key; request-level `provider` prefs are not forwarded; global only.

#### Search models (`openrouter:experimental__search_models`) — experimental

Lets a model search/filter the catalog (e.g. agents picking a model for a Subagent). The type name will likely change (dropping `experimental__`) — a breaking change.

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "openai/gpt-5.2",
        "input": "Which models on OpenRouter can take image input and have at least 128k context?",
        "tools": [{ "type": "openrouter:experimental__search_models" }] }'
```

| Parameter | Default | Description |
| - | - | - |
| `max_results` | `5` | 1–20 models per call |

Model-generated call arguments (all optional; empty = browse): `query` (names, slugs, descriptions), `input_modalities` (`text`, `image`, `file`, `audio`, `video`; ALL must match), `output_modalities` (e.g. `text`, `image`, `embeddings`, `audio`; ALL), `min_context_length`, `series` (e.g. `Claude`, `GPT`, `Gemini`).

Result: `{ "models": [{ "id", "name", "description", "context_length", "input_modalities", "output_modalities", "series" }], "total_results": 12, "showing": 1 }`. No separate charge.

Sources: https://openrouter.ai/docs/guides/features/server-tools/datetime, https://openrouter.ai/docs/guides/features/server-tools/image-generation, https://openrouter.ai/docs/guides/features/server-tools/search-models, https://openrouter.ai/docs/guides/features/server-tools

### 9.30 Server tools: apply patch, shell, bash (coding and execution)

#### Apply Patch (`openrouter:apply_patch`) — Responses API only

Models propose file changes as **V4A diffs**; OpenRouter validates syntax (line prefixes, markers, non-empty paths) but **never applies** them (human-in-the-loop). Valid patches come back as `apply_patch_call` output items; invalid ones are returned to the model to self-correct.

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "openai/gpt-5.1-codex-mini", "input": "Create a hello.py file that prints \"Hello, world!\"",
        "tools": [{ "type": "openrouter:apply_patch" }] }'
# data.output contains an apply_patch_call item with operation create_file / update_file / delete_file
```

Operations (`operation` on the item):

```json
{ "type": "apply_patch_call", "call_id": "call_abc123", "status": "completed",
  "operation": { "type": "create_file", "path": "/src/hello.py", "diff": "+print(\"Hello, world!\")\n" } }
{ "type": "apply_patch_call", "call_id": "call_def456", "status": "completed",
  "operation": { "type": "update_file", "path": "/src/main.ts", "diff": "@@ function main() {\n-  console.log(\"old\");\n+  console.log(\"new\");\n }" } }
{ "type": "apply_patch_call", "call_id": "call_ghi789", "status": "completed",
  "operation": { "type": "delete_file", "path": "/src/deprecated.ts" } }
```

`create_file`: every content line starts with `+`. `update_file`: context (` `), additions (`+`), deletions (`-`), `@@` anchors. `delete_file`: no diff.

Echo the result next turn:

```json
{ "model": "openai/gpt-5.1-codex-mini",
  "input": [{ "type": "apply_patch_call_output", "call_id": "call_abc123", "status": "completed", "output": "Applied patch to /src/hello.py" }],
  "tools": [{ "type": "openrouter:apply_patch" }] }
```

`apply_patch_call_output`: `call_id` (must match), `status` (`completed` \| `failed`), `output` (optional log).

`parameters.engine`: `auto` (default; native passthrough when the endpoint supports incremental diff streaming, else HITL validator), `native` (force native; falls back to HITL), `openrouter` (always HITL). Native passthrough (OpenAI endpoints) streams `response.apply_patch_call_operation_diff.delta` events; HITL delivers one atomic `apply_patch_call`. Only OpenAI models stream incrementally. No extra cost. Has an in-region native path. Responses `tool_choice: { "type": "apply_patch" }` forces it.

#### Shell (`openrouter:shell`) — Responses and Messages APIs

Hosted sandboxed shell; a sandbox-backed clone of OpenAI's hosted `shell` tool for any model. No client-side mode (always OpenAI's native shell or OpenRouter's sandbox). Global endpoint only (regional ⇒ rejected). Chat Completions ⇒ 400.

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{ "model": "anthropic/claude-sonnet-4.5",
        "input": "List the files in the current directory and show me the OS version.",
        "tools": [{ "type": "openrouter:shell", "parameters": { "engine": "openrouter" } }] }'
```

Full configuration shape:

```json
{ "type": "openrouter:shell", "parameters": {
  "engine": "openrouter",
  "environment": { "type": "container_auto",
    "network_policy": { "type": "allowlist", "allowed_domains": ["pypi.org", "files.pythonhosted.org"] } } } }
```

| Parameter | Default | Description |
| - | - | - |
| `engine` | `auto` | `openrouter` = OpenRouter sandbox; `auto` = native hosted shell on OpenAI, sandbox elsewhere |
| `environment` | `container_auto` | `{ "type": "container_auto" }` (ephemeral managed container) or `{ "type": "container_reference", "container_id": "..." }` (reuse); `local` not supported |

Containers sleep after **5 minutes idle** (each command renews; not configurable; legacy `sleep_after_seconds` ignored). Containers are scoped per account and workspace. Container details/APIs: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations).

| Limit | Default | Max |
| - | - | - |
| `timeout_ms` per command | 120,000 | 300,000 (clamped) |
| `max_output_length` per stream per command | 16,384 chars | 65,536 (clamped) |
| `commands` per call | – | 100 (more ⇒ rejected) |

Network policy (default **no egress**): `{ "type": "disabled" }`; `{ "type": "allowlist", "allowed_domains": [...] }` (≤50 lowercase hostnames or globs; `*` matches any run; exact hostname doesn't cover subdomains; no schemes/paths/ports; `["*"]` for unrestricted). Fixed at container start — a different policy to a warm container ⇒ **409**. Only ports 80/443; platform DNS. `pip install` needs `pypi.org` + `files.pythonhosted.org` (or `*.pythonhosted.org`). Blocked hosts fail with connection errors (HTTP sees `520`).

Call arguments (model-generated, mirror OpenAI `shell_call.action`): `commands` (string[], each its own invocation, in order), `timeout_ms`, `max_output_length`. On Responses you may send OpenAI's native `{ "type": "shell" }` (or legacy Codex `local_shell`): OpenAI models use OpenAI's shell; others route to the sandbox; response emits native `shell_call` items. Responses output: `openrouter:shell` item (or `shell_call`); Messages: `server_tool_use` block named `openrouter:shell` + `openrouter_shell_tool_result` block.

Result (per command, like `shell_call_output.output[]`):

```json
{ "output": [{ "stdout": "total 0\n...", "stderr": "", "outcome": { "type": "exit", "exit_code": 0 } }] }
```

`outcome`: `{ "type": "exit", "exit_code": n }` or `{ "type": "timeout" }`. Output files: when sandbox commands create/change files under `/workspace/home`, the result lists up to 10 (most recent first) as `container_file_citation` entries (`container_id`, `file_id`, `filename`, `start_index`, `end_index`) next to `container_id`; deleted files not listed; not attached to the final message. List all with `GET /api/v1/containers/{container_id}/files` (100/page default, up to 1000 via `limit`; paginate with `after` = `last_id` while `has_more`), download `GET /api/v1/containers/{container_id}/files/{file_id}/content`. Files deleted 30 days after last container use (promote to workspace to keep). Files outside home (e.g. `/tmp`) are not saved; tell the model to write deliverables to e.g. `~/outputs/`.

Pricing: sandbox time **$0.0001/second**, from the first sandbox command in a request until the response completes; idle time between requests not billed; a request that starts a new or sleeping container is billed **minimum 30 s**.

#### Bash (`openrouter:bash`) — Messages API only

Mirrors Anthropic's bash tool on `/api/v1/messages` (Chat/Responses ⇒ 400; use Shell there, or a normal function tool for client-side execution).

```json
{ "model": "<model-slug>", "max_tokens": 1024,
  "messages": [{ "role": "user", "content": "List the files in the current directory and show me the OS version." }],
  "tools": [{ "type": "openrouter:bash", "parameters": { "engine": "openrouter" } }] }
```

| Parameter | Default | Description |
| - | - | - |
| `engine` | `auto` | `openrouter` = run server-side in the sandbox (opt-in; global only). `auto`/`native` = **client-side HITL**: the call is returned to your app to run; nothing executes on any server |
| `environment` | `container_auto` | As Shell (`container_auto` / `container_reference`); `network_policy` same rules (sandbox only) |

Limits (sandbox): `timeout_ms` per batch 120,000 default / 300,000 max; `max_output_length` 16,384 / 65,536 per stream per batch; ≤100 commands per call. Call arguments: `command` (single), `commands` (sequential), `restart` (reset session — OpenRouter provisions a fresh container for the rest of the turn), `timeout_ms`, `max_output_length`. Keep a sandbox across requests with a stable `session_id` (sandbox keyed by it).

Native Anthropic shape `{ "type": "bash_20250124", "name": "bash" }` always runs **client-side** (returns `tool_use`); for sandbox execution send `openrouter:bash` with `engine: "openrouter"`. Result to the model: `{ "command": "ls -la", "stdout": "...", "stderr": "", "exitCode": 0 }`; sandbox results appear as `openrouter_bash_tool_result` blocks with `container_id` and `files` (same 10-file citation behavior as Shell). Pricing same as Shell ($0.0001/s, 30 s minimum on start). On regional endpoints, client-side Bash is rejected if combined with another server tool lacking an in-region native path.

Gotchas: Shell has no client mode; Bash defaults to client mode (sandbox only with `engine: "openrouter"`); `network_policy` is immutable per container (409); write outputs under `/workspace/home`.

Sources: https://openrouter.ai/docs/guides/features/server-tools/apply-patch, https://openrouter.ai/docs/guides/features/server-tools/shell, https://openrouter.ai/docs/guides/features/server-tools/bash, https://openrouter.ai/docs/guides/features/server-tools

### 9.31 Server tools: tool search (`openrouter:tool_search`) and deferred tools

For large tool libraries: tool definitions cost input tokens every turn, and selection accuracy degrades with hundreds of tools. Mark tools `defer_loading: true`; the model searches and loads them on demand. Works on any model/provider.

```json
{
  "model": "openai/gpt-5.2",
  "input": "What's the weather in Tokyo?",
  "tools": [
    { "type": "openrouter:tool_search" },
    { "type": "function", "name": "get_weather", "description": "Get the current weather for a city.",
      "parameters": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] },
      "defer_loading": true }
  ]
}
```

(The guide's quick-start shows this with `messages`; `openrouter:tool_search` itself is accepted on Responses and Messages only.) The model searches `weather`, finds `get_weather`, and calls it next turn; you handle the call like any function call.

Rules:

- Deferred tools are invisible/uncallable until a search returns them.
- **`openrouter:tool_search` can never be deferred** (⇒ `400`); guarantees one callable tool.
- Keep your 3–5 most-used tools loaded.
- Search: model supplies a **regex** (≤200 chars), matched case-insensitively against each deferred tool's name, description, argument names and argument descriptions. Malformed/pathological patterns return an error result (not a request failure). Write descriptions in users' words; use consistent prefixes (`github_issues_list`, `github_pulls_list`).
- `max_results`: default 5, cap 50 tools per search.
- **`tool_choice`**: omit or `"auto"` (OpenRouter manages widening via `allowed_tools`), or `{ "type": "allowed_tools", ... }` naming immediately callable tools (deferred tools added as found). On Responses, `allowed_tools` is authoritative — a deferred tool left out is **revoked** (search can't reveal it). Any other `tool_choice` (force a tool, `required`, `none`) ⇒ `400` ("`tool_choice` conflicts with `openrouter:tool_search`...").
- Prompt caching is preserved: discovering a tool doesn't disturb tools already in the conversation.

Accepted type aliases: Responses `openrouter:tool_search`, `tool_search`; Messages `openrouter:tool_search`, `tool_search_tool_regex`, `tool_search_tool_regex_20251119`. Only the regex variant is implemented: `tool_search_tool_bm25` / `tool_search_tool_bm25_20251119` ⇒ `400`. Chat Completions does not accept `openrouter:tool_search` in `tools` (⇒ `400`) — use `deferred_tools`.

When to use: definitions > ~10k tokens, > ~10 tools, or degrading selection accuracy. Below ~10 tools or when every tool is used every request, standard tool calling is better.

#### Client-side tool search (your own search tool)

Keep your own search tool loaded and mark others `defer_loading`; reveal a tool when your search finds it. OpenRouter never sends a withheld definition to a provider that can't defer it.

| API | Mark deferred | Endpoint with native deferral | Other endpoints |
| - | - | - | - |
| Chat | `tools[].function.defer_loading: true` | Passed through | Withheld until you re-send the tool without `defer_loading` |
| Responses | `tools[].defer_loading: true` (function tool) | Passed through | Withheld until re-sent without the flag, or loaded via a client `tool_search_output` input item |
| Messages | `tools[].defer_loading: true` | Passed through, incl. `tool_reference` blocks | Withheld until a `tool_reference` block in a tool result names it (sent to the provider as text), or re-sent without the flag |

Native deferral endpoints: Anthropic models on Anthropic, Vertex, Azure Foundry, Claude Platform on AWS, and Anthropic-compatible gateways implementing it. Elsewhere, revealed definitions are appended after loaded tools in reveal order (cache prefix stable). On non-native endpoints at least one loaded tool must look like a search tool (name contains `tool_search`, `tool-search`, `toolsearch`, `search_tools`, `find_tools`, or ends in `_search`/`-search`; Anthropic `tool_search_tool_regex`/`tool_search_tool_bm25`; or `openrouter:tool_search`) — a name check only. Otherwise OpenRouter adds `openrouter:tool_search` (Chat/Responses where managed search is enabled) or fails with `400` ("At least one tool must have defer_loading=false and be able to reveal the others..."). Client-side deferral on non-native endpoints is **rolling out per account**: until admitted, Chat/Responses send deferred tools in full with the flag removed, and Messages routes deferred requests only to native-deferral endpoints (400 if none).

#### Deferred Tools Protocol (`deferred_tools`, Chat/Responses/Messages)

```json
{ "deferred_tools": { "protocol": "v1", "profile": "portable", "validation": "runtime", "search": { "type": "regex", "max_results": 5 } } }
```

| Field | Values |
| - | - |
| `protocol` | `"v1"` |
| `profile` | `"portable"` (only profile): router-built search and call wrappers on any model/provider |
| `validation` | `"runtime"` (only mode): each call validated against the original schema before reaching you |
| `search` | `{ "type": "regex" }` or `{ "type": "bm25" }` (search inside OpenRouter), or `{ "type": "custom", "tool_id": "...", "result_key": "..." }` (one of your non-deferred function tools is the search; your client returns matching tool names under `result_key`). `max_results` default 5, range 1–100 |

All fields are required. Continuation state rides in encrypted reasoning (Chat `reasoning_details` entry; Responses reasoning item `encrypted_content`; Messages `redacted_thinking` block); each turn records only what changed. Non-deferred freeform tools (e.g. Codex `apply_patch`) pass through unvalidated; hosted provider tools whose executed calls can be replayed (`web_search` variants, `code_interpreter`) pass through unchanged (never deferred; an `allowed_tools` choice omitting one removes it); other hosted types (`file_search`, `mcp`, `image_generation`, `computer_use_preview`, shells) ⇒ `400` with `deferred_tools`.

Client requirements: send assistant messages back **exactly** as returned (incl. encrypted reasoning) — editing, removing, reordering, trimming or compacting breaks the chain; interrupted turns: a text-only assistant message with no state is accepted, but one with tool calls and no state is rejected; you can enable `deferred_tools` mid-conversation only if earlier assistant messages have no tool calls/provider tool items; keep `tools`, `tool_choice`, `deferred_tools` identical every turn (order, descriptions, `cache_control` included); **context compression is off** (overflow fails instead of trimming); **Batch API not supported**. Known clients: Claude Code (works in-session; `--continue` after a tool turn ⇒ `deferred_tools_state_missing`), Codex (works; its `web_search` accepted as hosted), pi (pi-ai ≥ `0.84.3` on Chat; keep same provider/API/model; pi on Messages with non-Anthropic models unsupported).

Errors (`400`; code in `error.metadata.code` on Chat/Responses, `metadata.code` on Messages):

| Code | Cause |
| - | - |
| `deferred_tools_state_missing` | Assistant message with tool calls carries no (recognizable) state — usually encrypted reasoning not sent back |
| `deferred_tools_state_invalid` | State modified or issued for a different workspace |
| `deferred_tools_history_changed` | Earlier messages or their state edited, removed or reordered |
| `deferred_tools_catalog_changed` | `tools`, `tool_choice` or `deferred_tools` differ from the conversation start |

Recover by resending the conversation exactly as returned, or start a new conversation.

Sources: https://openrouter.ai/docs/guides/features/server-tools/tool-search, https://openrouter.ai/docs/guides/routing/auto-exacto

### 9.32 Server tools: fusion, advisor, subagent (inner model calls)

#### Fusion (`openrouter:fusion`)

Same pipeline as the Fusion Router ([§9.14](#914-fusion-router-openrouterfusion-openrouterfusion-flash)): the model invokes it for tasks that benefit from multiple perspectives (research, multi-domain critique, compare-and-contrast, high cost of error); simple tactical prompts won't trigger it; force with `tool_choice: "required"`. Parameters (`analysis_models`, `model`, `max_tool_calls`, `max_completion_tokens`, `reasoning`, `temperature`) are in [§9.14](#914-fusion-router-openrouterfusion-openrouterfusion-flash).

Tool result:

```json
{
  "status": "ok",
  "analysis": {
    "consensus": ["Points all or most panel models agreed on"],
    "contradictions": [{ "topic": "...", "stances": [{ "model": "...", "stance": "..." }] }],
    "partial_coverage": [{ "models": ["..."], "point": "Only some models covered this" }],
    "unique_insights": [{ "model": "...", "insight": "Something only one model raised" }],
    "blind_spots": ["Topics no panel model addressed"]
  },
  "responses": [{ "model": "anthropic/claude-opus-4.5", "content": "..." }]
}
```

- Partial panel failure: still `status: "ok"` plus `failed_models`.
- Analyst failure (upstream error, empty output, invalid analysis JSON): `status: "ok"` with `responses` and **no `analysis`**.
- Hard failure: `{ "status": "error", "error": "all panel models failed", "failure_reason": "..." }` with `failure_reason` ∈ `all_panels_failed`, `insufficient_credits`, `rate_limited`, `fusion_invocation_capped` (second call in the same turn), `unexpected_error`. The calling model can answer without the analysis.
- The analyst compares rather than merges; result is not a majority vote. Recursion guard `x-openrouter-fusion-depth`. Runs under your key; request `provider` prefs not forwarded; global only.

#### Advisor (`openrouter:advisor`)

Lets the executing model consult a higher-intelligence **advisor model** mid-generation (before committing to an approach, when stuck, before declaring done). The advisor's response returns as the tool result; your model writes the final answer. Available on Chat Completions, Responses and Messages.

```json
{ "model": "anthropic/claude-haiku-5.5", "input": "Build a concurrent worker pool in Go with graceful shutdown.",
  "tools": [{ "type": "openrouter:advisor", "parameters": {
    "model": "~anthropic/claude-opus-latest", "instructions": "You are a senior staff engineer. Be decisive.", "forward_transcript": false } }] }
```

| Field | Default | Description |
| - | - | - |
| `name` | none (default advisor) | Unique per entry; letters, digits, spaces, `_`, `-`; trimmed; 1–64 chars |
| `model` | outer request model | Advisor model (any OpenRouter model) |
| `instructions` | – | System instructions for the advisor |
| `forward_transcript` | `false` | `true` ⇒ full parent conversation forwarded (tool-call `prompt` appended as final user turn); `false` ⇒ advisor sees only `prompt` |
| `stream` | `false` | Responses only: stream advice as `response.output_text.delta` events on the advisor item (`item_id` = advisor item id), then `response.output_text.done`; completed item still has full `advice`. No effect on Chat; Messages planned |
| `max_completion_tokens` | provider default | Advisor output cap (incl. reasoning) |
| `reasoning` | provider default | `{ effort?, max_tokens? }` |
| `temperature` | provider default | 0–2 |

Advisor model precedence: `parameters.model` → the `model` argument the executor passes in the call (only if the definition doesn't fix one) → outer request model. Call arguments: `prompt` (required unless `forward_transcript: true`), `model`.

Multiple advisors: one `openrouter:advisor` entry per advisor, each with its own `name`/`model`/`instructions`; at most one unnamed (default) entry — two unnamed ⇒ `400` ("Only one advisor tool can serve as the default..."); duplicate names ⇒ `400`. `tool_choice: "required"` (or selecting the advisor tool) forces the **first** entry; forcing a specific named advisor isn't supported yet.

Cross-request memory: each advisor recalls its own prior `prompt → advice` exchanges when you replay them — Responses: include prior `openrouter:advisor` output items unchanged (echo `instance_name`); Chat: include the assistant's advisor `tool_calls` and paired `role: "tool"` results; Messages: include `server_tool_use` and `advisor_tool_result` blocks. Memory is per advisor; overflow compressed with middle-out. Not separately replayed with `forward_transcript: true`. **Advisor identity is positional (index in `tools`)** — keep entry order stable.

Result: `{ "status": "ok", "model": "anthropic/claude-opus-4.8", "advice": "..." }` or `{ "status": "error", "error": "Advisor call failed: ..." }` (model continues without advice).

Messages API native shape (works with any executor model):

```json
{ "model": "anthropic/claude-haiku-5.5", "max_tokens": 1024,
  "messages": [{ "role": "user", "content": "Build a concurrent worker pool in Go with graceful shutdown." }],
  "tools": [{ "type": "advisor_20260301", "name": "advisor", "model": "~anthropic/claude-opus-latest" }] }
```

Response blocks: `server_tool_use` (`name: "advisor"`, `input.prompt`) then `advisor_tool_result` (`content: { "type": "advisor_result", "text": "..." }`). Native shape carries only `model`; `max_uses` not honored (fixed per-request cap); `caching`, `allowed_callers`, `defer_loading` ignored; `tool_choice: { "type": "tool", "name": "advisor" }` supported. Recursion: `x-openrouter-advisor-depth`; advisor stripped from sub-calls; consultations capped per request. Inner generation receives request `provider` prefs (incl. `zdr`, `data_collection`); in-region native path available.

#### Subagent (`openrouter:subagent`)

Delegates self-contained tasks (summarize, extract, draft, reformat) to a cheaper/faster **worker model**. The model calls it with `task_name` and `task_description`; the worker sees **only** the description (no parent conversation, no memory between tasks) and returns `outcome`.

```json
{ "model": "openai/gpt-5.2", "input": "Audit this release: summarize the changelog, list breaking changes, and draft the announcement.",
  "tools": [{ "type": "openrouter:subagent", "parameters": {
    "model": "~anthropic/claude-haiku-latest",
    "instructions": "You are a fast, focused worker. Complete the task exactly as described.",
    "tools": [{ "type": "openrouter:web_search" }] } }] }
```

| Field | Default | Description |
| - | - | - |
| `name` | none (default) | Same naming rules as advisor; one unnamed max |
| `model` | outer request model | Worker model; fixed by the definition (not chosen per call); can't be the subagent tool itself |
| `tools` | – | **Server tools only** for the worker (e.g. `openrouter:web_search`, `openrouter:web_fetch`); function tools ⇒ `400`; can't list itself |
| `inherit_functions` | `false` | **Experimental**, Responses only: worker inherits all top-level function tools |
| `inherited_function_names` | – | **Experimental**, Responses only: inherit named top-level functions (ignored if `inherit_functions`; unknown/whitespace names ⇒ `400`) |
| `instructions` | – | Worker system instructions |
| `max_tool_calls` | provider default | 1–25 worker tool steps |
| `max_completion_tokens` | provider default | Worker output cap |
| `reasoning` | provider default | `{ effort?, max_tokens? }` forwarded |
| `temperature` | provider default | 0–2 |

Worker precedence: `parameters.model` → outer request model. Result: `{ "status": "ok", "model": "anthropic/claude-haiku-5.5", "task_name": "summarize-changelog", "outcome": "..." }` or `{ "status": "error", "task_name": "...", "error": "Subagent call failed: ..." }`. Each completed task echoes the subagent `name`.

**Inheriting client functions — suspension/replay (experimental, Responses only)**: when the worker calls an inherited client function, the response turn ends with (a) the spawning `openrouter:subagent` item `status: "in_progress"` with `call_id`, `task_name`, `task_description` (and `name`/`instance_name`), and (b) projected `function_call` items carrying `subagent_id` (= spawning `call_id`) and `subagent_items` (opaque worker transcript; only on the first of parallel calls). Execute them like normal calls. To resume, resend: the subagent item verbatim; every projected `function_call` exactly as returned (with `subagent_id`/`subagent_items`, in order); one `function_call_output` per call; the **same `tools`** (spawning subagent entry present, subagent entry order stable — identity is positional). A finished worker yields a **new** `openrouter:subagent` item (fresh `id`, same `call_id`) with `status: "completed"`, `model`, `outcome`; workers may suspend for multiple rounds (each suspend-again response carries only new calls; keep the full history); the delegating model resumes only after all workers settle. Resumed worker cost folds into the resuming request's usage.

Streaming: the suspended subagent item's `response.output_item.added` is deferred until the spawning call's arguments finish and arrives enriched; it never gets `response.output_item.done` in that response. Projected calls' `added` events carry `subagent_id`; `subagent_items` arrives only on `response.output_item.done` and `response.completed`.

Failure handling: a failed worker never fails the response (degrades to `status: "error"`): undeliverable suspension, or unresumable replay (missing `call_id`/task echo, missing projected calls or `subagent_items`, missing `function_call_output`, spawning entry dropped from `tools`). Exception: a replayed `function_call` with invalid/mismatched `subagent_id` ⇒ `400`.

Recursion: self-reference check; `x-openrouter-subagent-depth` header; subagent stripped from sub-calls; task executions capped per request. Inner generation receives request `provider` prefs (incl. `zdr`).

Gotchas: advisor/subagent identity is positional — reordering `tools` between turns scrambles memory/resumption; subagent workers can't run your functions unless you opt into the experimental inheritance; put all context in `task_description`.

Sources: https://openrouter.ai/docs/guides/features/server-tools/fusion, https://openrouter.ai/docs/guides/features/server-tools/advisor, https://openrouter.ai/docs/guides/features/server-tools/subagent, https://openrouter.ai/docs/guides/features/server-tools

### 9.33 Plugins: the `plugins` array, defaults and precedence

Plugins inject into or mutate a request/response (PDF parsing, JSON repair, context compression, routing config, safety checks). Unlike server tools, an enabled plugin **always runs once**. Enable per request via `plugins` (Responses API and Chat Completions) or as account defaults at `https://openrouter.ai/settings/plugins`. Each entry is `{ "id": "<plugin-id>", ...config }`; most accept `"enabled": false`.

| Plugin `id` | Purpose | Docs |
| - | - | - |
| `web` | Web search plugin — **deprecated**, use `openrouter:web_search` | [§9.34](#934-web-search-plugin-id-web-deprecated) |
| `file-parser` | PDF parsing engine selection (`pdf.engine`) | [§9.19](#919-pdf-inputs-and-the-file-parser-plugin) |
| `response-healing` | Repair malformed JSON for JSON response formats | [§9.35](#935-response-healing-plugin-id-response-healing) |
| `alignment` | **Beta**: check every assistant message against rules (audit/enforce) | [§9.36](#936-alignment-plugin-id-alignment-beta) |
| `armor` | **Beta**: safety classifier for tool calls (hard-deny/soft-deny/allow) | [§9.37](#937-armor-plugin-id-armor-beta) |
| `context-compression` | Middle-out compression when prompts exceed context (`engine: "middle-out"`) | [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) (Message Transforms) |
| `pareto-router` | Config for `openrouter/pareto-code` | [§9.12](#912-pareto-router-openrouterpareto-code) |
| `auto-router` / `auto-beta-router` | Config for `openrouter/auto` / `openrouter/auto-beta` | [§9.9](#99-auto-router-openrouterauto-openrouterauto-beta) |
| `fusion` | Config for Fusion runs | [§9.14](#914-fusion-router-openrouterfusion-openrouterfusion-flash) |
| `jev-router` | Config for `typesafe/jev-router` / author routers | [§9.15](#915-jev-router-typesafejev-router-and-author-routers-authorauto) |
| `switchyard-router` | Config for `nvidia/switchyard` | [§9.16](#916-switchyard-nvidiaswitchyard) |
| `web-fetch` | Spec only: `max_uses`, `max_content_tokens`, `allowed_domains`, `blocked_domains` | – |
| `moderation` | Spec only: `{ "id": "moderation" }`, no other fields documented | – |

Multiple plugins in one request:

```json
{
  "model": "openai/gpt-5.2",
  "input": "...",
  "plugins": [{ "id": "web", "max_results": 3 }, { "id": "response-healing" }],
  "text": { "format": { "type": "json_schema", "name": "...", "schema": { } } }
}
```

**Defaults and precedence** (Settings > Plugins; in organizations only admins can access it):

1. Request-level `plugins` entries override account defaults for that plugin.
2. Account defaults apply when a plugin is enabled there but not specified in the request.
3. **"Prevent overrides"** makes the account config final — requests cannot disable or modify it.

Disable a default for one request: `{ "plugins": [{ "id": "web", "enabled": false }] }`.

Privacy/regions: ZDR enforcement filters the inference endpoint, not plugin backends — except the Web Search plugin, which rejects Firecrawl when ZDR is enforced. On in-region endpoints a non-resident plugin engine returns an error (Web Search plugin `400`). Alignment and Armor evaluators run on zero-retention tenancy and work with ZDR.

Model-variant shortcut (deprecated): `:online` ≡ `plugins: [{ "id": "web" }]`.

Sources: https://openrouter.ai/docs/guides/features/plugins

### 9.34 Web Search plugin (`id: "web"`, deprecated)

Always runs one search per request and attaches results to the prompt; prefer the `openrouter:web_search` server tool ([§9.28](#928-server-tools-web-search-openrouterweb_search-and-web-fetch-openrouterweb_fetch)). Enabled by `plugins: [{ "id": "web" }]` or the `:online` suffix (also on free variants: `openai/gpt-oss-20b:free:online`). **Search costs apply even with free models.**

Powered by native search for Anthropic, Google, OpenAI, Perplexity and SpaceXAI models (SpaceXAI: web search; X search is opt-in), otherwise Exa (`auto` method, highlights ~2,000–4,000 chars per result, `[...]` separators).

```json
{
  "model": "openai/gpt-5.2",
  "plugins": [{
    "id": "web",
    "engine": "parallel",
    "mode": "turbo",
    "max_results": 1,
    "search_prompt": "Some relevant web results:",
    "include_domains": ["example.com", "*.substack.com"],
    "exclude_domains": ["reddit.com"]
  }]
}
```

| Field | Description |
| - | - |
| `engine` | `native`, `exa`, `firecrawl`, `parallel`, `perplexity`, or omitted (native if available, else Exa). Explicit `native` always attempts provider search, even if unsupported (may error) |
| `mode` | Exa: `instant`, `fast`, `auto` (default), `deep-lite`, `deep`, `deep-reasoning`; Parallel: `turbo`, `fast`, `basic` (default), `advanced` |
| `max_results` | Default 5 |
| `search_prompt` | Prompt prefix for attached results. Default: "A web search was conducted on `date`. Incorporate the following web search results into your response. IMPORTANT: Cite them using markdown links named using the domain of the source. Example: [nytimes.com](https://nytimes.com/some-page)." |
| `include_domains` / `exclude_domains` | Domain lists; wildcards (`*.substack.com`) and path filters (`openai.com/blog`) |
| `max_uses` | Spec: max searches per turn, passed to native providers that support it (Anthropic) |
| `user_location` | Spec: approximate location passed to native providers that support it |
| `x_search` | SpaceXAI X search opt-in (same fields as the server tool: `allowed_x_handles`/`excluded_x_handles` ≤20 and mutually exclusive, `from_date`, `to_date`, `enable_image_understanding`, `enable_video_understanding`). Invalid object ⇒ 400. Legacy top-level `x_search_filter` still works (`x_search` wins) |
| `enabled` | `false` disables a default for this request |

Domain filtering compatibility: Exa both at once; Parallel and Firecrawl mutually exclusive; Perplexity mutually exclusive (both provided ⇒ `include_domains` wins — note the server tool returns 400 in that case); native Anthropic both but mutually exclusive; native Google unsupported (default engine falls back to Exa when filters set; `native` ⇒ 400); native OpenAI `include_domains` only (`exclude_domains` silently ignored); native SpaceXAI both, mutually exclusive, max 5 domains each.

**Result parsing**: results are standardized as OpenAI-style `url_citation` annotations on the assistant message:

```json
{ "message": { "role": "assistant", "content": "Here's the latest news I found: ...",
  "annotations": [{ "type": "url_citation", "url_citation": {
    "url": "https://www.example.com/web-search-result", "title": "Title of the web search result",
    "content": "Content of the web search result", "start_index": 100, "end_index": 200 } }] } }
```

(`content` is added by OpenRouter if available; indices locate the citation in the message.)

**Native search context size** (provider passthrough pricing based on `low`/`medium`/`high`) via the top-level `web_search_options` (Chat):

```json
{ "model": "openai/gpt-4.1", "messages": [{ "role": "user", "content": "Latest developments in quantum computing?" }],
  "web_search_options": { "search_context_size": "high" } }
```

Pricing: Exa $0.007 (Instant/Fast/Auto) / $0.012 (Deep Lite/Deep) / $0.015 (Deep Reasoning) per request, up to 10 results then $0.001 each, plus prompt tokens for results; Parallel $0.001 (Turbo/Fast) or $0.005 (Basic/Advanced), up to 10 results then $0.001 each; Perplexity $0.005/request; Firecrawl $0.005/search + $0.0125/result; native: provider passthrough (only when native is used; Exa pricing applies when `engine: "exa"`).

Sources: https://openrouter.ai/docs/guides/features/plugins/web-search, https://openrouter.ai/docs/guides/routing/model-variants/online

### 9.35 Response Healing plugin (`id: "response-healing"`)

Validates and repairs malformed JSON responses. Activates for **non-streaming** requests that set a JSON response format — `text.format` (Responses) or `response_format` (Chat) with `type: "json_schema"` or `"json_object"` — and include the plugin.

```python
import json, os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "google/gemini-2.5-flash",
        "input": "Generate a product listing with name, price, and description",
        "text": {"format": {
            "type": "json_schema",
            "name": "Product",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Product name"},
                    "price": {"type": "number", "description": "Price in USD"},
                    "description": {"type": "string", "description": "Product description"},
                },
                "required": ["name", "price"],
            },
        }},
        "plugins": [{"id": "response-healing"}],
    },
)
data = response.json()
message = next(item for item in reversed(data["output"]) if item["type"] == "message")
product = json.loads(next(part["text"] for part in message["content"] if part["type"] == "output_text"))
print(product["name"], product["price"])  # the plugin attempts to repair malformed JSON syntax
```

The TypeScript (fetch) version sends the same body and `JSON.parse`s the last message's `output_text` (throwing if there is none).

Fixes: missing closing brackets (`{"name": "Alice", "age": 30` → `{"name": "Alice", "age": 30}`), markdown code-block wrappers (extracts the JSON), mixed text + JSON (extracts the JSON), trailing commas, unquoted keys (`{name: "Eve"}` → `{"name": "Eve"}`), and other missing commas/quotes.

Limitations: non-streaming only; not every response is repairable — in particular **output truncated by `max_output_tokens` can't be healed**. Healing fixes syntax only; it doesn't check content (use Alignment for content rules). Fields: `id`, `enabled`.

Sources: https://openrouter.ai/docs/guides/features/plugins/response-healing, https://openrouter.ai/docs/guides/features/structured-outputs

### 9.36 Alignment plugin (`id: "alignment"`, beta)

**Beta since October 2026** — configuration fields, the `alignment` object and error shapes may change. Checks **every assistant message** of a request against rules you send. For each rule an evaluator model (run by OpenRouter next to your model) returns the probability the message breaks it. Outcome per message: `allowed` (no rule broken), `blocked` (≥1 broken), `unavailable` (not checked). `audit` mode delivers every message with its outcome; `enforce` withholds blocked messages, retries the model call, and errors when retries run out. The evaluator reads only the assistant message (use guardrails — Sensitive Info, Prompt Injection Detection, [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) — for input checks; Response Healing for JSON syntax).

```json
{
  "model": "openai/gpt-4.1-mini",
  "instructions": "You are Northwind support. Damaged items are refunded in full. Keep replies under 15 words.",
  "input": "My mug arrived broken. Will I get my money back?",
  "plugins": [{
    "id": "alignment",
    "mode": "audit",
    "rules": [
      { "rule": "Do not say a refund is issued or approved.", "watch": ["content"] },
      { "rule": "Do not ask for payment card details.", "watch": ["content"] }
    ]
  }]
}
```

```typescript
// TypeScript SDK
const response = await openRouter.responses.send({
  responsesRequest: {
    model: 'openai/gpt-4.1-mini',
    instructions: 'You are Northwind support. Damaged items are refunded in full. Keep replies under 15 words.',
    input: 'My mug arrived broken. Will I get my money back?',
    plugins: [{
      id: 'alignment',
      mode: 'audit',
      rules: [
        { rule: 'Do not say a refund is issued or approved.', watch: ['content'] },
        { rule: 'Do not ask for payment card details.', watch: ['content'] },
      ],
    }],
  },
});
if (!('output' in response)) throw new Error('Expected a non-streaming response');
if (response.error) throw new Error(response.error.message);
console.log(response.alignment?.calls.map((call) => call.outcome)); // e.g. ['blocked']
```

#### Configuration

| Field | Type | Default | Description |
| - | - | - | - |
| `rules` | object[] | required | 1–128 rules; each `{ "rule": "<1–200 chars>", "watch": [...] }` with `watch` ⊆ `content`, `tool_calls`, `refusal`, `images`, `audio` (each once). A rule applies only to messages with ≥1 watched field |
| `threshold` | number | `0.7` | 0.01–1; probability at/above which a rule is broken (below 0.01 rejected) |
| `max_retries` | integer | `1` | 0–3 retries after a blocked message in `enforce` mode; `0` ⇒ first block is an error |
| `mode` | string | `audit` | `audit` or `enforce` |
| `instruct` | boolean | `true` | Insert the rules as a system message (after leading system/developer messages): `Your reply must follow every rule below.` + `- <rule>` lines |

At most **one** `alignment` entry per request (put every rule in it); two entries, unknown fields or out-of-range values ⇒ `400`. Rejections in both modes: regional hostname ⇒ `400` (use `openrouter.ai`); workspace not admitted to the beta ⇒ `400`; HIPAA enabled/unknown ⇒ `403`. ZDR (`provider.zdr` or workspace) is fine — evaluator runs on zero-retention tenancy.

#### Behavior per model call

1. (`instruct: true`) insert the rules system message.
2. Model produces a message.
3. Evaluator answers "Does this assistant message break the rule?" per applicable rule with a probability; broken if ≥ `threshold`.
4. Record in `alignment.calls` and act: `allowed` → delivered; `blocked` → delivered in audit, retried/error in enforce; `unavailable` → delivered in audit, **error with no retry** in enforce.

Retry: same model at the same provider, appending a user message with the blocked message, the broken rules, and `Write the reply again so that it follows every rule.`; at most `max_retries` per model call (each server-tool agent-loop model call has its own budget). Server tool results delivered to your app (e.g. Fusion panel responses/analysis, `openrouter:image_generation` images) are part of the message and checked; results kept server-side are skipped.

#### `alignment` response object

Present on every completed response with the plugin (except a provider error before any message was evaluated). Non-streaming: top-level `alignment`; Responses stream: on the response inside `response.completed`; errors: `error.metadata.alignment`.

| Field | Description |
| - | - |
| `calls[]` | One record per checked message, in production order (no record for failed calls or messages without checkable content, e.g. reasoning only) |
| `calls[].call` | Position, from 1 |
| `calls[].outcome` | `allowed` \| `blocked` \| `unavailable` |
| `calls[].rules[]` | Per rule (request order): `applicable`, `probability` (`null` if not applicable), `broken` (`false` if not applicable). On allowed/blocked records |
| `calls[].reason` | For `unavailable`: `cut` (size limit), `evaluator_error`, `malformed_answer`, `time_limit` (no answer within 4 s; not configurable) |
| `rejected` | The blocked message (only in an error's `error.metadata.alignment`) |

```json
"alignment": { "calls": [
  { "call": 1, "outcome": "blocked", "rules": [ { "applicable": true, "probability": 0.92, "broken": true },
                                               { "applicable": true, "probability": 0.02, "broken": false } ] },
  { "call": 2, "outcome": "allowed", "rules": [ { "applicable": true, "probability": 0.45, "broken": false },
                                               { "applicable": true, "probability": 0.02, "broken": false } ] } ] }
```

(Enforce mode with one retry: `usage` sums both model calls.)

Size limits (only when ≥1 rule applies; UTF-16 code units): text 10,000; tool calls 16 calls and 4,000 for all calls as JSON; refusal 1,000; audio transcripts 1,000 total. A message cut at `max_output_tokens` is checked as is.

#### Errors (enforce mode)

| Last outcome | HTTP status / `error.code` | `error.metadata.error_type` | `error.message` |
| - | - | - | - |
| `blocked` | `403` | `permission_denied` | `Alignment plugin: the reply broke these rules: rules[<index>]: "<rule>"` (multiple joined by `; `) |
| `unavailable` | `503` | `provider_overloaded` | `Alignment plugin: the reply could not be evaluated: <reason>` |

- Non-streaming status is `403` only if known before the first byte; OpenRouter sends whitespace during long non-streaming calls, so the error may arrive with **status `200`** and the error in the body. Detect blocks by `error.metadata.alignment` regardless of status/transport.
- Error body: `error`, `usage` (summed), `error.metadata.alignment` with `rejected` holding the blocked message as `output` items (without reasoning). Rejected item ids: `message` → `msg_<turn id>`, `function_call` → `fc_<call_id>`, `custom_tool_call` → `ctc_<call_id>`, `image_generation_call` → `ig_<turn id>_<index>`, native calls (e.g. `web_search_call`) → provider id.
- Responses streaming (`enforce` + `stream: true`): events are **held** until the check finishes (no tokens meanwhile; retries repeat the wait); a blocked message ends with `response.failed` (error `code` `permission_denied`, or `server_error` for unavailable; `error_type` beside `error`) then `[DONE]`.

Rewrite pattern: read `error.metadata.alignment.rejected[0].content[0].text`, send a new request with the draft as `input`, rewrite instructions, and the same plugin entry; check `alignment.calls[0].outcome === "allowed"`.

Blocking a tool call before it runs (rule watches `tool_calls`; `instruct: false` keeps rules out of the prompt):

```json
{ "model": "openai/gpt-4.1-mini", "instructions": "You are Northwind support. Refund damaged items in full with issue_refund. Be brief.",
  "input": "Order ord_8841: the mug arrived broken. Please refund the $42.",
  "plugins": [{ "id": "alignment", "rules": [{ "rule": "Never call issue_refund with amount_usd over 25.", "watch": ["tool_calls"] }],
                "instruct": false, "max_retries": 0, "mode": "enforce" }],
  "tools": [{ "type": "function", "name": "issue_refund", "description": "Issue a refund for an order",
    "parameters": { "type": "object", "properties": { "order_id": { "type": "string" }, "amount_usd": { "type": "number" } },
                    "required": ["order_id", "amount_usd"] } }] }
```

⇒ `403` with `rejected: [{ "type": "function_call", "name": "issue_refund", "arguments": "{\"order_id\":\"ord_8841\",\"amount_usd\":42}", ... }]`.

#### Writing rules

The evaluator sees the rule plus `{ role, content (string|null, always present), tool_calls[] ({ name, arguments, namespace? }), refusal, images[], audio: { transcript } }`.

- Text rules watch `content`; tool-call rules watch `tool_calls`. A tool-call-only message has `content: null`, so a `content`-only rule is **not applicable** (`applicable: false`, `probability: null`, `allowed`).
- Multi-field `watch` applies when any field is present; the evaluator reads the whole message.
- Agent-loop steps and final answers are judged alike; JSON in `content` is judged as text.
- Rules depending on data outside the message (user's message, price lists) get a probability without that data — restate them as properties of the message.
- One rule = one property (split "no discount and be polite"); rules naming no property ("Be helpful.") give nothing to check.

| Rule as written | Problem | Write instead |
| - | - | - |
| `Answer in the language of the user.` | Depends on the user's message | `The content is written in French.` |
| `Only answer questions about billing.` | Depends on the user's message | `Do not discuss anything but billing.` |
| `The final answer must cite a source.` | Depends on which message is final (a `web_search`-only message breaks it) | `If the content states a fact, the content cites a source.` |
| `End every reply with "Best regards, Support".` + `watch: ["content","tool_calls"]` | Broken on tool-call-only messages | Same rule with `watch: ["content"]` |
| `Never state a wrong price.` | Needs the price list | Put the price list in the system message; drop the rule |
| `Be helpful.` | No property | A rule naming a property of `content`/`tool_calls` |
| `Do not offer a discount and always be polite.` | One probability for two properties | Two rules |

Probabilities vary across models/runs (e.g. one reply scored 0.41–0.94 against the same rule) — run `audit` on real traffic and pick wording/thresholds that separate allowed from forbidden messages.

#### Billing and compatibility

- Every model call billed at its normal price, including blocked ones; **the evaluator is free**. With `instruct: true` the rules system message adds input tokens to every call (cacheable — identical across requests). Each enforce retry adds a model call + check. Cached responses carry their stored `alignment` (no new check).
- Chat Completions differences: `alignment` top-level (stream: on the last data event before `[DONE]`); `rejected` is a single message object (`role`, `content`, `tool_calls`, `refusal`, `images`, `audio` with `id`/`transcript`; argument-less tool calls get `"{}"`); stream errors are a data event with `error` followed by an empty-delta chunk with `usage`, then the stream closes **without `[DONE]`**; during the hold OpenRouter sends SSE comments `: OPENROUTER PROCESSING` about every 420 ms. `@openrouter/sdk` types `alignment` on both APIs.

Sources: https://openrouter.ai/docs/guides/features/plugins/alignment

### 9.37 Armor plugin (`id: "armor"`, beta)

**Beta since October 2026** — config fields, `safeguard_results` and the `openrouter:armor_blocked` item may change. A classifier between the model and your application that evaluates **every client tool call** against plain-English rules before it reaches you. Blocked calls are not executed; the model is told why and continues.

Per tool call: OpenRouter holds the call, sends it with your rules and the conversation to a decision model, gets a per-rule match probability, and combines them into `flagged` or `not_flagged`. The stack merges the workspace guardrail, this plugin, and any Anthropic `safeguards`; on endpoints supporting Anthropic's dangerous-tool-use beta, evaluation is native.

```json
{
  "model": "openai/gpt-4.1",
  "input": "Lint is fixed. Push the branch with git push origin main.",
  "tools": [{ "type": "function", "name": "bash", "description": "Run a shell command in the project directory",
    "parameters": { "type": "object", "properties": { "command": { "type": "string" } }, "required": ["command"] } }],
  "plugins": [{
    "id": "armor",
    "output_mode": "custom_item",
    "classifier_context": {
      "v": 1,
      "auto_mode": {
        "environment": ["Trusted repository: github.com/acme/app"],
        "hard_deny": [{ "id": "git-push", "name": "Git Push",
          "instructions": "Running any git push command. The user reviews every change before it is pushed." }]
      }
    }
  }]
}
```

Blocked result: no `function_call`; instead an `openrouter:armor_blocked` item, the model's own text, and `safeguard_results`:

```json
{
  "output": [
    { "type": "openrouter:armor_blocked", "id": "st_tmp_6t8hpnhyrui", "status": "completed",
      "call_id": "call_EhpTnmfpU1Zx1Iqfl0JZgHqc", "name": "bash", "arguments": "{\"command\":\"git push origin main\"}",
      "reason": "Tool call \"bash\" was blocked by OpenRouter Armor by the rule \"Git Push\" and was not executed. Do not retry it with the same arguments. ...",
      "explanation": "[Git Push]" },
    { "type": "message", "role": "assistant", "status": "completed",
      "content": [{ "type": "output_text", "text": "I'm unable to run the git push command due to security restrictions..." }] }
  ],
  "safeguard_results": [{ "type": "dangerous_tool_use", "status": { "type": "available",
    "tool_uses": { "call_EhpTnmfpU1Zx1Iqfl0JZgHqc": { "type": "evaluated", "outcome": "flagged", "explanation": "[Git Push]" } } } }]
}
```

A non-matching call is released unchanged as an ordinary `function_call` with `not_flagged` in `safeguard_results`.

#### Rules (`classifier_context`)

```json
{
  "v": 1,
  "auto_mode": {
    "environment": ["Trusted repository: github.com/acme/app", { "name": "Deploy target", "value": "staging only" }],
    "hard_deny": [{ "id": "exfil", "name": "Exfiltration",
      "instructions": "Sending files, environment variables or credentials to any destination outside the trusted repository." }],
    "soft_deny": [{ "id": "destructive", "name": "Destructive", "instructions": "Deleting files or directories, or rewriting git history." },
                  "Reading credential files such as .env or ~/.aws/credentials."],
    "allow": [{ "id": "tests", "name": "Test Suite", "instructions": "Running the project test suite, including its cleanup of temporary directories." }]
  }
}
```

- `environment`: facts the decision model treats as true (`"Name: value"` strings or `{ name, value }`): trusted repos/domains/buckets, working directory, branch and protection, remotes, cloud account, deploy target, user identity/role. Keep it current on every request — rules referring to facts are only as precise as the facts.
- **`hard_deny`**: must never happen; a match blocks and nothing clears it (not allow rules, not user consent).
- **`soft_deny`**: usually wrong; blocks unless an `allow` rule also matches **or** the user asked for this exact operation on this exact target in the conversation ("delete the `./reports/drafts` directory" clears deleting that directory; "clean up old drafts" doesn't clear `rm -rf /`). Built-in soft-deny: a boundary the user set and hasn't lifted ("don't push until I review").
- **`allow`**: never blocks; only clears soft-deny matches.
- Rule as string = instructions only (id derived from position, e.g. `soft_deny:1`). Object fields: `id` (required; lowercase letters, digits, `-`, `_`; ≤64; unique across tiers; reported in verdicts), `name` (≤120; shown as `[name]`; defaults to id), `instructions` (required; ≤8,000 chars), `threshold` (0–1; default **0.6 for deny rules, 0.7 for allow rules** — allow needs stronger evidence).
- Writing tips: describe the action, not the command ("rewriting git history that has been pushed" vs "running git push --force"); name what the rule protects (follow data to its destination); put exceptions in `allow`.
- `use_cc_style_default_rules: true` prepends a Claude Code–compatible rule set (spec: 1 hard-deny, 72 soft-deny, 17 allow, 21 environment slots); your rules are added after and can't remove built-ins. Default `true` on Messages, `false` on Chat/Responses. Claude Code's `"$defaults"` list entry is also accepted.

#### Output modes for blocked calls

| `output_mode` | API | Result |
| - | - | - |
| `text` (default on Chat & Responses) | Chat, Responses | Call removed; an `<openrouter_armor_blocked>` XML marker in assistant text (renders everywhere; can't execute when replayed) |
| `custom_item` | Responses only | Call replaced by an `openrouter:armor_blocked` output item (`call_id`, `name`, `arguments` verbatim, `reason` = error the model saw, `explanation` = `[name]`); streams as `response.output_item.added`/`done`. **Echo it back unchanged in `input[]` in position**; OpenRouter expands it to the `function_call` + failed `function_call_output` the model saw. Don't write a `function_call_output` for it |
| `claude_code_compatibility` (default on Messages when the request carries `safeguards`) | Messages only | `tool_use` **kept** in `content[]`, `stop_reason: "tool_use"`, verdict `flagged` — **your client must not run it** (write an `is_error` tool result) |

Wrong mode for the API ⇒ `400`. Under `text`/`custom_item` the model got a failure result in-loop and continued in the same request; under `claude_code_compatibility` the turn ends on the flagged call.

> Under `claude_code_compatibility` a client that ignores `safeguard_results` will run flagged calls. If you don't control the client, send `"output_mode": "text"` on Messages so OpenRouter withholds the call.

Claude Code auto mode: Armor implements a Claude Code–compatible API; through the Ori metaharness (`ori claude --model moonshotai/kimi-k2-0905 -- --permission-mode auto`) no `plugins` entry is needed — a `safeguards` entry of type `dangerous_tool_use` selects Claude Code compatibility. On Anthropic endpoints supporting the beta, Anthropic's classifier verdict is passed through; elsewhere Armor evaluates. `safeguards` is only read on Messages; on Chat/Responses (e.g. a proxy like LiteLLM forwarding Claude Code requests) it arms nothing — send `plugins: [{ "id": "armor" }]`.

#### `safeguard_results`

Present on every evaluated response (both modes), keyed by tool call id (`tool_calls[].id` Chat, `call_id` Responses, `tool_use.id` Messages):

```json
{ "safeguard_results": [{ "type": "dangerous_tool_use", "status": { "type": "available", "tool_uses": {
  "call_1": { "type": "evaluated", "outcome": "not_flagged" },
  "call_2": { "type": "evaluated", "outcome": "flagged", "explanation": "[Git Push]" },
  "call_3": { "type": "unavailable", "reason": "timeout" },
  "call_4": { "type": "skipped" } } } }] }
```

`not_flagged` (permitted; a soft-deny may have been cleared), `flagged` (rule matched), `unavailable` (decision model couldn't answer), `skipped` (not evaluated — provider-native tools). Streaming: final Chat chunk (top level), `response.completed` response object (Responses), `message_delta` `delta` (Messages).

#### All options

| Field | Values | Default | What it does |
| - | - | - | - |
| `classifier_context` | object | none | Rules + environment |
| `mode` | `enforce`, `audit` | `enforce` | `audit` reports verdicts but releases every call (not combinable with `claude_code_compatibility`) |
| `on_error` | `block`, `log` | `block` | For `unavailable` calls: block (model told it couldn't be evaluated) or release. Under `claude_code_compatibility` unavailable calls are always released with the verdict visible |
| `use_cc_style_default_rules` | boolean | `true` Messages / `false` elsewhere | Prepend Claude Code–compatible rules |
| `output_mode` | `text`, `custom_item`, `claude_code_compatibility` | per API | Blocked-call representation |
| `evaluate_native_tools` | boolean | `false` | Force provider-native server tools (web search, code execution) through the loop so Armor evaluates them; otherwise reported `skipped` |
| `enabled` | boolean | `true` | `false` turns Armor off for the request |

OpenRouter server tools (e.g. `openrouter:web_search`) run inside the request, so a blocked server tool is refused in place.

Limits and costs: HIPAA or data-region-restricted requests enabling Armor ⇒ `403` (Claude Code requests on Messages instead get `unavailable` and fall back to local evaluation); ZDR supported (zero-retention evaluator). Added latency ~279 ms median / 334 ms p90 per tool call (with the Claude Code rule set). **Not billed during beta.** Expect occasional false positives/misses — tune with `audit` mode and per-rule `threshold`.

Sources: https://openrouter.ai/docs/guides/features/plugins/armor

### 9.38 Structured outputs (`text.format` / `response_format`)

Constrain responses to a JSON Schema on compatible models.

Responses API — `text.format` with `type: "json_schema"` and `name`, `schema` (required by spec), `strict`, optional `description`:

```typescript
// TypeScript SDK
const response = await openRouter.responses.send({
  responsesRequest: {
    model: 'openai/gpt-4o',
    input: 'What is the weather like in London?',
    text: {
      format: {
        type: 'json_schema',
        name: 'weather',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City or location name' },
            temperature: { type: 'number', description: 'Temperature in Celsius' },
            conditions: { type: 'string', description: 'Weather conditions description' },
          },
          required: ['location', 'temperature', 'conditions'],
          additionalProperties: false,
        },
      },
    },
    stream: false,
  },
});
if (!('output' in response)) throw new Error('Expected a non-streaming response');
const message = [...response.output].reverse().find((item) => item.type === 'message');
const weatherInfo = JSON.parse(message?.content.find((part) => part.type === 'output_text')?.text ?? '{}');
```

```python
import json, os, requests

response = requests.post(
    "https://openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "openai/gpt-4o",
        "input": "What is the weather like in London?",
        "text": {"format": {
            "type": "json_schema",
            "name": "weather",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City or location name"},
                    "temperature": {"type": "number", "description": "Temperature in Celsius"},
                    "conditions": {"type": "string", "description": "Weather conditions description"},
                },
                "required": ["location", "temperature", "conditions"],
                "additionalProperties": False,
            },
        }},
    },
)
data = response.json()
message = next(item for item in reversed(data["output"]) if item["type"] == "message")
weather_info = json.loads(next(part["text"] for part in message["content"] if part["type"] == "output_text"))
```

(The official snippets stop at the raw `output_text` string; the `JSON.parse`/`json.loads` is added here.)

Chat Completions — `response_format: { "type": "json_schema", "json_schema": { name, strict, schema, description? } }` (`name`: a-z, A-Z, 0-9, `_`, `-`, max 64 chars; required):

```json
{
  "model": "openai/gpt-4o",
  "messages": [{ "role": "user", "content": "What's the weather like in London?" }],
  "response_format": { "type": "json_schema", "json_schema": {
    "name": "weather", "strict": true,
    "schema": { "type": "object",
      "properties": { "location": { "type": "string" }, "temperature": { "type": "number" }, "conditions": { "type": "string" } },
      "required": ["location", "temperature", "conditions"], "additionalProperties": false } } }
}
```

Output: `{ "location": "London", "temperature": 18, "conditions": "Partly cloudy with light drizzle" }` (as the message text; parse it).

Other response format types (spec): Responses `text.format` also accepts `{ "type": "text" }` and `{ "type": "json_object" }` (JSON mode without a schema); Chat `response_format.type` ∈ `text`, `json_object`, `json_schema`, `grammar` (`{ "type": "grammar", "grammar": "root ::= \"yes\" | \"no\"" }`), `python`. Grammar/python support is provider-specific.

#### Model and endpoint support

- Supported by select models: filter `supported_parameters=structured_outputs` (`https://openrouter.ai/models?order=newest&supported_parameters=structured_outputs`).
- **Support is per endpoint**, and can change; check the `structured_outputs` parameter in the model page's Providers section (or endpoints API).
- Routing: response format is a **default soft preference** — when some providers support it, only those are used; if none do, the model is still used and the parameter ignored ([§9.3](#93-provider-routing-the-provider-object)). To guarantee enforcement: (1) check supported params, (2) set `provider.require_parameters: true`, (3) send `text.format`/`response_format` with `type: "json_schema"`.

```json
{ "model": "openai/gpt-4o", "input": "...", "provider": { "require_parameters": true },
  "text": { "format": { "type": "json_schema", "name": "weather", "strict": true, "schema": { } } } }
```

- Anthropic: OpenRouter applies the structured-outputs beta header automatically for JSON-schema response formats (strict **tools** still need `x-anthropic-beta: structured-outputs-2025-11-13`, [§9.3](#93-provider-routing-the-provider-object)).

#### Strict mode and best practices

- Add `description`s to properties to guide the model.
- Use `strict: true`: providers with native strict mode enforce the schema exactly; others translate it to their own format or treat it as a strong hint — exact compliance isn't guaranteed everywhere. Strict modes may restrict which JSON Schema features you can use (see provider docs: OpenAI, Google Gemini, Anthropic, Fireworks). The doc examples list every property in `required` and set `additionalProperties: false`.

#### Streaming

Supported: add `stream: true`; the model streams partial JSON that forms a valid object when complete. Accumulate text deltas and parse at the end.

```json
{ "stream": true, "text": { "format": { "type": "json_schema", "name": "weather", "schema": { } } } }
```

#### Errors and healing

- Model doesn't support structured outputs ⇒ the request fails with an error indicating lack of support.
- Invalid JSON Schema ⇒ error.
- **Response Healing** ([§9.35](#935-response-healing-plugin-id-response-healing)) reduces invalid-JSON risk for **non-streaming** `json_schema` (and `json_object`) requests; it cannot fix truncation by `max_output_tokens`, and does not apply to streaming.

#### Gotchas

- Responses uses `text.format` (flat: `type`, `name`, `schema`, `strict`); Chat uses `response_format.json_schema` (nested). Mixing them is the most common error.
- Without `require_parameters: true` a request can still land on a model with no structured-output support (format ignored) — validate output client-side.
- Set `max_output_tokens`/`max_tokens` high enough; truncated JSON is unrecoverable.
- The Free Models Router (`openrouter/free`) automatically filters to free models that support structured outputs when your request uses them.
- The error list above vs. the soft-preference rule can look contradictory: per the routing guide, when **no** provider of a model supports the format the parameter is ignored rather than failing; use `require_parameters: true` so only providers that support the format are eligible.

Sources: https://openrouter.ai/docs/guides/features/structured-outputs, https://openrouter.ai/docs/guides/features/plugins/response-healing, https://openrouter.ai/docs/guides/routing/provider-selection
