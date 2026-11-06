# OpenRouter Reference — 5. Endpoint reference — core text inference

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 04-api-fundamentals.md](04-api-fundamentals.md) · [Next: 06-endpoints-other-inference.md →](06-endpoints-other-inference.md)

## 5. Endpoint reference — core text inference

This section is the field-level reference for OpenRouter's three text-inference "skins":

| Endpoint | Wire format | operationId | Generated SDK method |
| - | - | - | - |
| `POST /api/v1/chat/completions` | OpenAI Chat Completions (+ OpenRouter extensions) | `sendChatCompletionRequest` | TS `openRouter.chat.send(...)`, Python `open_router.chat.send(...)`, Go `s.Chat.Send(ctx, ...)` |
| `POST /api/v1/responses` | OpenAI Responses / "OpenResponses" (stateless) | `createResponses` | TS `openRouter.responses.send(...)`, Python `open_router.responses.send(...)`, Go `s.Responses.Send(ctx, ...)`; `beta.responses.send` is a **deprecated alias** |
| `POST /api/v1/messages` | Anthropic Messages (+ OpenRouter extensions) | `createMessages` | **Not generated** in the OpenRouter SDKs (`x-speakeasy-ignore: true`); use the Anthropic SDK with `baseURL: "https://openrouter.ai/api"` |

All three route to any model in the catalog (OpenRouter translates to the provider's native format), share the same routing/plugin/server-tool machinery, and differ mainly in message shape, tool shape, streaming events, usage field names, and error envelope. Fields are taken from the OpenAPI 3.1 spec (`components/schemas/ChatRequest`, `ResponsesRequest`, `MessagesRequest` and their results); where prose guides document something the spec does not model, that is flagged as **guide-documented**.

Cross-references: base URL, auth, app-attribution headers, SSE framing, rate limits and the full typed-error table are in [§4](04-api-fundamentals.md#4-api-fundamentals); routing semantics in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) (provider routing, fallbacks, plugins, server tools, structured outputs, multimodal); reasoning, caching, service tiers and presets semantics in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy).

### 5.1 Conventions common to all three endpoints

**Transport**

| Item | Value |
| - | - |
| Base URL | `https://openrouter.ai/api/v1` (Anthropic SDKs use `https://openrouter.ai/api` and append `/v1/messages` themselves) |
| Auth | `Authorization: Bearer <OPENROUTER_API_KEY>` (OpenAPI `securitySchemes.apiKey`: HTTP bearer) |
| Request content type | `application/json` (body required on all three) |
| Response content type | `application/json` (non-streaming) or `text/event-stream` (when `stream: true`) |
| Stream terminator | Chat and Responses: `data: [DONE]` sentinel (`x-speakeasy-sse-sentinel: '[DONE]'`). Messages: Anthropic event sequence ending in `message_stop` (no sentinel declared in the spec) |
| Keep-alive | SSE comment lines such as `: OPENROUTER PROCESSING` may appear in any stream; skip lines starting with `:` |
| Generation id | `X-Generation-Id` response header on all endpoints (chat completions, completions, responses, messages) |

**Request headers specific to these endpoints**

| Header | Values | Effect |
| - | - | - |
| `X-OpenRouter-Metadata` | `enabled` / `disabled` (enum `MetadataLevel`, case-insensitive; anything else = `disabled`; default `disabled`) | Adds `openrouter_metadata` (routing snapshot) to the response, to the final stream chunk/event, and to error envelopes. Legacy name `X-OpenRouter-Experimental-Metadata` still accepted. |
| `x-session-id` | string | Same as body `session_id`; body value wins if both are sent. |
| `HTTP-Referer`, `X-OpenRouter-Title` (`X-Title` accepted), `X-OpenRouter-Categories` | strings | App attribution (see [§4](04-api-fundamentals.md#4-api-fundamentals) / [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). The generated SDKs expose them as `httpReferer`, `appTitle`, `appCategories` (TS) and `http_referer`, `x_open_router_title`, `x_open_router_categories` (Python). |

**Model selection (all three)**

- `model`: catalog slug such as `openai/gpt-4o`, `anthropic/claude-sonnet-4.5`, a `~author/family-latest` alias, a variant suffix (`:online`, `:nitro`, ... see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)), a router such as `openrouter/auto`, or a preset reference `@preset/<slug>` / `<model>@preset/<slug>` (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). Required on `/messages`; optional on `/chat/completions` and `/responses` (if omitted, the user's or payer's default model is used).
- `models`: ordered fallback list (array of slugs). On `/messages` you may instead send `fallbacks` (max 3, not combinable with `models`).
- `preset` (**guide-documented**, not in the OpenAPI request schemas): `"@preset/<slug>"`; a bare slug without `@preset/` is ignored.

**Unsupported parameters**: if the selected model/provider does not support a parameter (e.g. `logit_bias` on non-OpenAI models, `top_k` on OpenAI), it is ignored and the rest are forwarded — unless `provider.require_parameters: true`, which filters out providers that do not support every parameter you sent. When a sampling parameter is absent, OpenRouter omits it upstream (provider default applies) rather than injecting a value.

**SDK naming**: the TypeScript SDK wraps the body in a named field and uses camelCase properties (`openRouter.chat.send({ chatRequest: { messages, model, maxTokens, ... } })`, `openRouter.responses.send({ responsesRequest: {...} })`). Python uses snake_case keyword arguments (`open_router.chat.send(messages=[...], stream=False)`). Go uses typed structs (`components.ChatRequest{...}`, `components.ResponsesRequest{...}`). Standalone tree-shakable functions: `chatSend` from `@openrouter/sdk/funcs/chatSend.js`, `responsesSend` from `@openrouter/sdk/funcs/responsesSend.js` (used with `OpenRouterCore` from `@openrouter/sdk/core.js`; they return `{ ok, value | error }` instead of throwing). Each TS method takes an optional second `options` argument: `options.fetchOptions` (any `RequestInit` except `method`/`body`, e.g. extra headers) and `options.retries` (`RetryConfig`). Full SDK coverage is in [§3](03-client-sdks.md#3-client-sdks-typescript-python-go).

Sources: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion, https://openrouter.ai/docs/api/api-reference/responses/create-a-response, https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/parameters, https://openrouter.ai/docs/guides/features/router-metadata, https://openrouter.ai/docs/guides/features/presets, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/responses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README, https://openrouter.ai/docs/client-sdks/go/sdks/chat/README, https://openrouter.ai/docs/guides/routing/model-fallbacks

### 5.2 Shared OpenRouter request fields

These fields have the same schema on all three request bodies unless the "Endpoints" column says otherwise (C = chat, R = responses, M = messages).

| Field | Type | Endpoints | Description |
| - | - | - | - |
| `provider` | `ProviderPreferences` object or null | C R M | Provider routing preferences (table below; semantics in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). |
| `plugins` | array of plugin objects (discriminator `id`) | C R M | Per-request plugins (table below). |
| `models` | array of string | C R M | Fallback model list. |
| `route` | `"fallback"` / `"sort"` / null — **DEPRECATED** | C R M | Alias for `provider.sort.partition`: `fallback` → `model`, `sort` → `none`. |
| `session_id` | string, maxLength 256 | C R M | Groups related requests; used as the **sticky routing key** (same provider for the whole session to maximize prompt-cache hits) and for observability grouping. Body beats `x-session-id` header. |
| `user` | string (R, M: maxLength 256) | C R M | End-user identifier for abuse isolation. Chat description: use a stable ID/hash/pseudonym; OpenRouter folds it into a hashed identity upstream and never forwards it raw; if omitted, an account-level identity is used, so provider policy blocks can affect the whole account. |
| `trace` | `TraceConfig` object (additional keys allowed) | C R M | Observability metadata. Known keys `trace_id`, `trace_name`, `span_name`, `generation_name`, `parent_span_id` get special handling; other keys pass through as custom metadata to broadcast destinations ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). |
| `cache_control` | `{ type: "ephemeral", ttl?: "5m" or "1h" }` | C R M | Top level: automatic prompt caching — breakpoint applied to the last cacheable block. On a content block: explicit breakpoint. Block-level markers also work on OpenAI models with explicit caching (converted to native format). See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy). |
| `service_tier` | C, R: enum `auto`, `default`, `fast`, `flex`, `priority`, `scale`, `ultrafast`, null (R default `auto`); M: string | C R M | Capacity tier. `fast` = alias of `priority`; `ultrafast` prefers ultrafast endpoints, then falls back to `priority`, then default. See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy). |
| `stop_server_tools_when` | array (minItems 1) of conditions | C R M | Stop conditions for the server-tool agent loop (below). Overrides `max_tool_calls`. |
| `deferred_tools` | `DeferredToolsControl` | C R M | Opt-in router-level deferred-tool protocol (below). |
| `debug` | `{ echo_upstream_body?: boolean }` | C R | Streaming only: emits the transformed upstream request body first in the stream (chat: a chunk with `debug`, responses: a `response.debug` event). Ignored on non-streaming requests; not for production. |
| `image_config` | map of string → string, number, or array | C R | Provider-specific image-generation options (e.g. `aspect_ratio`, `quality`, `size`, `resolution`); see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) image generation. |
| `prompt_cache_key` | string or null | C R | OpenAI-style prompt cache key. |
| `prompt_cache_options` | `{ mode: "explicit", ttl?: string or null }` or null | C R | `mode: "explicit"` disables OpenAI-managed breakpoints so only blocks marked with `prompt_cache_breakpoint` are cached; `ttl` = `"30m"` (default) or `"12h"` (billed at the higher 12h write rate). Only OpenAI GPT-5.6 and newer. |
| `metadata` | C: map string→string (max 16 pairs, 64-char keys, 512-char values); R: `RequestMetadata` (keys ≤64 chars, no brackets, values ≤512, max 16) or null; M: `{ user_id?: string or null }` | C R M | Request metadata. |

#### `provider` (ProviderPreferences)

| Field | Type | Default | Description |
| - | - | - | - |
| `allow_fallbacks` | boolean or null | `true` | `true`: when the primary provider (or your `order` list) is unavailable, use the next best. `false`: only the primary/custom providers; return the upstream error otherwise. |
| `data_collection` | `"allow"` / `"deny"` / null | `allow` | `deny` = only providers that do not collect user data; request errors if none qualifies. |
| `enforce_distillable_text` | boolean or null | — | Only models whose author allows text distillation. |
| `ignore` | array of `ProviderName` or string, or null | — | Provider slugs to skip; merged with account-wide ignored providers. |
| `only` | array of `ProviderName` or string, or null | — | Provider slugs to allow; merged with account-wide allowed providers. |
| `order` | array of `ProviderName` or string, or null | — | Try these providers first, in order (subset that supports the model); then fall back unless `allow_fallbacks: false`. |
| `max_price` | object: `prompt`, `completion` (USD per million tokens), `image` (per image), `audio` (per audio unit), `request` (per request) — all strings | — | Price ceiling. |
| `preferred_max_latency` | number (p50 seconds), or `{ p50?, p75?, p90?, p99? }` (seconds), or null | — | Endpoints above threshold are deprioritized (not excluded); may cause a fallback model to win. All specified percentiles must be met. |
| `preferred_min_throughput` | number (p50 tokens/sec), or `{ p50?, p75?, p90?, p99? }`, or null | — | Endpoints below threshold are deprioritized. |
| `quantizations` | array of `int4`, `int8`, `fp4`, `mxfp4`, `nvfp4`, `fp6`, `fp8`, `mxfp8`, `fp16`, `bf16`, `fp32`, `unknown`; or null | — | Filter by quantization. |
| `require_parameters` | boolean or null | `false` | Only providers that support every parameter in the request. |
| `sort` | `"price"` / `"throughput"` / `"latency"` / `"exacto"`, or `{ by?: same enum or null, partition?: "model" (default) / "none" / null }`, or null | — | Sort strategy when `order` is not set; **disables load balancing**. `partition: "model"` sorts within each model (fallback models stay fallbacks); `"none"` sorts all endpoints together. |
| `zdr` | boolean or null | — | Only Zero-Data-Retention endpoints. |
| `options` | object keyed by provider slug → map of any | — | Provider-specific options forwarded only to the matched provider (provider segment case-insensitive; an endpoint tag after `/`, e.g. `amazon-bedrock/claude-on-aws`, `anthropic/2`, must match exactly). Unrecognized keys silently dropped. Example: `{"openai": {"max_tokens": 1000}}`. |

`ProviderName` enum (display names accepted in `order`/`only`/`ignore`; free strings are also accepted): Modal, AkashML, AI21, AionLabs, Alibaba, Ambient, Ant Digital, Baidu, Amazon Bedrock, Amazon Nova, Anthropic, Arcee AI, AssemblyAI, AtlasCloud, Avian, Azure, BaseTen, BytePlus, Black Forest Labs, Cerebras, Chutes, Cirrascale, Claude Platform on AWS, Clarifai, Cloudflare, Cohere, CoreWeave, Cosine, Crucible, Crusoe, Darkbloom, Databricks, Decart, Deepgram, DeepInfra, DeepSeek, DekaLLM, DigitalOcean, ElevenLabs, Featherless, Fireworks, Fish Audio, Friendli, GMICloud, Google, Google AI Studio, Groq, HeyGen, Inception, Inceptron, InferenceNet, Ionstream, Infermatic, Io Net, Inferact vLLM, Inflection, KT, Liquid, Makora, Mara, Mancer 2, Meta, Minimax, ModelRun, Mistral, Modular, Moonshot AI, Morph, VoyageAI by MongoDB, TypeSafe, Near AI, Nebius, Nex AGI, NextBit, Novita, Nvidia, Ollama, OpenAI, OpenInference, Parallel, Parasail, ParetoAlpha, Particle AI, Pearl Research, Poolside, PrimaLabs, PrimeIntellect, Perceptron, Perplexity, Phala, Recraft, Recursive, Reka, Relace, Respan, River, Sail Research, Sakana AI, SambaNova, ScaleDown, Seed, SiliconFlow, Sourceful, StepFun, Stealth, StreamLake, Switchpoint, Tencent, Tenstorrent, Thinking Machines, Together, Unbiased, Upstage, Venice, Wafer, WandB, Quiver, Krea, Runway, Xiaomi, xAI, Z.AI, FakeProvider. (Doc examples use lowercase slugs such as `["openai", "anthropic"]`.)

`provider.options` keys (provider slugs): `01ai`, `ai21`, `aion-labs`, `akashml`, `alibaba`, `amazon-bedrock`, `amazon-bedrock/claude-on-aws`, `amazon-nova`, `ambient`, `antdigital`, `anthropic`, `anthropic/2`, `anyscale`, `arcee-ai`, `assemblyai`, `atlas-cloud`, `atoma`, `avian`, `azure`, `baidu`, `baseten`, `black-forest-labs`, `byteplus`, `centml`, `cerebras`, `chutes`, `cirrascale`, `clarifai`, `claude-on-aws`, `cloudflare`, `cohere`, `coreweave`, `cosine`, `crofai`, `crucible`, `crusoe`, `darkbloom`, `databricks`, `decart`, `deepgram`, `deepinfra`, `deepseek`, `dekallm`, `digitalocean`, `elevenlabs`, `enfer`, `fake-provider`, `featherless`, `fireworks`, `fish-audio`, `friendli`, `gmicloud`, `google-ai-studio`, `google-vertex`, `gopomelo`, `groq`, `heygen`, `huggingface`, `hyperbolic`, `hyperbolic-quantized`, `inception`, `inceptron`, `inferact-vllm`, `inference-net`, `infermatic`, `inflection`, `inocloud`, `io-net`, `ionstream`, `klusterai`, `krea`, `kt`, `lambda`, `lepton`, `liquid`, `lynn`, `lynn-private`, `makora`, `mancer`, `mancer-old`, `mara`, `meta`, `minimax`, `mistral`, `modal`, `modelrun`, `modular`, `moonshotai`, `morph`, `ncompass`, `near-ai`, `nebius`, `nex-agi`, `nextbit`, `nineteen`, `novita`, `nvidia`, `octoai`, `ollama`, `open-inference`, `openai`, `parallel`, `parasail`, `pareto-alpha`, `particle-ai`, `pearl-research`, `perceptron`, `perplexity`, `phala`, `poolside`, `primalabs`, `primeintellect`, `quiver`, `recraft`, `recursal`, `recursive`, `reflection`, `reka`, `relace`, `replicate`, `respan`, `river`, `runway`, `sail-research`, `sakana`, `sakana-ai`, `sambanova`, `sambanova-cloaked`, `scaledown`, `seed`, `sf-compute`, `siliconflow`, `sourceful`, `stealth`, `stepfun`, `streamlake`, `switchpoint`, `targon`, `tencent`, `tenstorrent`, `thinkingmachines`, `together`, `together-lite`, `typesafe`, `ubicloud`, `unbiased`, `upstage`, `venice`, `voyageai`, `wafer`, `wandb`, `wandb-legacy`, `xai`, `xiaomi`, `z-ai`.

#### `plugins` (all 14 variants, discriminator `id`)

Every variant is accepted by all three endpoints. Behavior details are in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) (plugins) and [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) (alignment/armor/guardrails).

| `id` | Fields (all optional unless marked) | Notes |
| - | - | - |
| `auto-router` | `enabled` (bool, default true); `allowed_models` (string[], ≤1024 patterns, each ≤1024 chars, ≤65536 chars total, wildcards like `anthropic/*`); `excluded_models` (same limits; applied after `allowed_models`, exclusion wins); `cost_tier` (`low` [0,20) / `medium` [20,40) / `high` [40,60) / `xhigh` [60,80) / `max` [80,100] cost-percentile bands); `cost_quality_tradeoff` (int 0–10, **DEPRECATED**, default 9 when no cost setting; `cost_tier` wins); `pin_model` (bool, default false: reuse the `model` of the most recent assistant message) | Configures the `openrouter/auto` router. |
| `auto-beta-router` | `enabled`, `allowed_models`, `excluded_models`, `cost_tier`, `cost_quality_tradeoff` (deprecated) — same semantics | Beta auto router. No `pin_model`. |
| `moderation` | — | Moderation plugin. |
| `web` | `enabled` (default true); `engine` (`native`, `exa`, `firecrawl`, `parallel`, `perplexity`); `max_results` (int); `max_uses` (int, max searches per turn; passed to native providers such as Anthropic); `search_prompt` (string); `include_domains` / `exclude_domains` (string[], wildcards `*.substack.com`, path filters `openai.com/blog`); `mode` (`instant`, `fast`, `auto`, `deep-lite`, `deep`, `deep-reasoning` for Exa; `turbo`, `fast`, `basic`, `advanced` for Parallel; unsupported modes ignored); `user_location` (`{type:"approximate", city, country, region, timezone}`); `x_search` (see below) | Web search plugin. The Responses web-search guide marks the plugin approach **deprecated** in favor of the `openrouter:web_search` server tool. |
| `web-fetch` | `allowed_domains`, `blocked_domains` (string[]); `max_content_tokens` (int; longer content truncated); `max_uses` (int; once exceeded the tool returns an error) | URL fetch plugin. |
| `file-parser` | `enabled` (default true); `pdf.engine`: `mistral-ocr`, `native`, `cloudflare-ai`, or `pdf-text` (**deprecated**, redirected to `cloudflare-ai`) | PDF/file parsing. |
| `response-healing` | `enabled` (default true) | Repairs malformed JSON output. |
| `context-compression` | `enabled` (default true); `engine`: `middle-out` (default, only value) | Replaces the old `transforms: ["middle-out"]` mechanism; no `transforms` field exists in the current spec. Endpoints with ≤8,192 context default to compression; disable with `{"id":"context-compression","enabled":false}`. |
| `pareto-router` | `enabled` (default true); `min_coding_score` (0–1; ≥0.66 high, ≥0.33 medium, <0.33 low; default highest tier); `max_price` (number ≥0, USD per million input tokens; bypasses `min_coding_score`; 404 if nothing qualifies); `price_source` (`prompt` default = catalog price, `weighted_avg` = traffic-weighted effective price) | Pareto coding router. |
| `fusion` | `enabled` (default true); `analysis_models` (string[], 1–8; default Quality preset `~anthropic/claude-opus-latest`, `~openai/gpt-sol-latest`, `~google/gemini-pro-latest`); `model` (analyst + synthesis model); `preset` (`general-high`, `general-budget`, `general-fast`); `max_tool_calls` (int 1–16, default 4); `tools` (≤8 `{type, parameters?}` server tools; default web_search + web_fetch; `[]` disables) | Configuration for a Fusion run started by model `openrouter/fusion` or the `openrouter:fusion` server tool. |
| `switchyard-router` | `algorithm` (`capability`, `stage` (platform default), `auto`, `random`, `composite`, `passthrough`); `judge_model` (string, minLength 1; must support structured outputs; default judge `google/gemini-3.5-flash-lite`, else `openai/gpt-4o-mini`; billed) | Switchyard router. |
| `jev-router` | `models` (string[] slugs/wildcards/`~family-latest` aliases, ≤1024); `allowed_models` (alias of `models`, combined); `excluded_models` (wins over includes; empty result → 404); `cost_tier` (string matching `^[a-z][a-z0-9_-]{0,31}$`: `low`, `medium`, `high` or operator-configured) | Jev router. |
| `alignment` (**Beta**) | `rules` (**required**, 1–128 of `{ rule: string 1–200 chars, watch: 1–5 of content, tool_calls, refusal, images, audio }`); `mode` (`audit` default / `enforce`); `instruct` (bool, default true: state rules to the model in a system message on every call); `max_retries` (int, default 1, enforce mode); `threshold` (0.01–1, default 0.7) | Result appears as `alignment` on the response; shapes may change. |
| `armor` | `enabled` (default true); `mode` (`enforce` default / `audit`); `on_error` (`block` default / `log`); `output_mode` (`text` default: withheld call replaced by an `<openrouter_armor_blocked>` marker; `custom_item`: Responses only, emits an `openrouter:armor_blocked` output item; `claude_code_compatibility`: Messages only, default when the request carries a `dangerous_tool_use` safeguard — `tool_use` stays and the verdict is `flagged` in `safeguard_results`); `evaluate_native_tools` (bool, default false); `use_cc_style_default_rules` (bool; prepends Claude Code's built-in auto-mode rules — 1 hard-deny, 72 soft-deny, 17 allow, 21 environment slots; default true on Messages, false elsewhere); `classifier_context` (`{ v: 1, auto_mode: { hard_deny[], soft_deny[], allow[], environment[] } }`; rules are strings (≤8122 chars) or `{ id (^[a-z0-9][a-z0-9_-]*$, ≤64), instructions (≤8000), name? (≤120), threshold? (default 0.6 deny / 0.7 allow) }`; environment entries are `"Name: value"` strings or `{ name (≤120), value (≤4000) }`) | Evaluates every client tool call against hard-deny / soft-deny / allow rules; verdicts in `safeguard_results`. Evaluation not billed during the beta. |

`x_search` (`XSearchOptions`, SpaceXAI native search only, billed separately by SpaceXAI): `allowed_x_handles` (≤20) **or** `excluded_x_handles` (≤20) — mutually exclusive; `from_date`, `to_date` (ISO date `YYYY-MM-DD`); `enable_image_understanding`, `enable_video_understanding` (bool).

#### OpenRouter server tools (declared in `tools`)

Server tools are executed by OpenRouter inside an agent loop and are declared as `{ "type": "openrouter:<name>", "parameters": {...} }` in the `tools` array (semantics, pricing and output formats: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). Availability below is by presence of a dedicated variant in each endpoint's `tools` union ("—" = no dedicated variant; chat and messages also have a generic server-tool envelope that may accept other registered tools, while `openrouter:apply_patch` is explicitly "restricted to the Responses API"):

| `type` | C | R | M | `parameters` |
| - | - | - | - | - |
| `openrouter:web_search` | yes (+ shorthand) | yes | yes | `engine` (`auto` default: native if supported else Exa; `native`, `exa`, `firecrawl`, `parallel`, `perplexity`); `max_results` (default 5; Perplexity max 20, clamped; ignored for native); `max_total_results` (default 50, across all calls in the request); `max_uses` (searches per request; native: forwarded only to Anthropic); `max_characters` (per-result content cap for Exa/Parallel (default 1,500)/Perplexity; beats `search_context_size`); `search_context_size` (`low`/`medium`/`high`; Exa fixed caps 5,000/15,000/30,000 chars); `allowed_domains` **or** `excluded_domains`; `mode` (see `web` plugin); `user_location` (`{type:"approximate", city, country, region, timezone}`); `x_search` |
| `openrouter:web_fetch` | yes | yes | yes | `engine` (`auto` default, `native`, `openrouter` (direct HTTP), `exa`, `parallel`, `firecrawl`); `max_uses`; `max_content_tokens`; `allowed_domains`; `blocked_domains` |
| `openrouter:datetime` | yes | yes | yes | `timezone` (IANA, default UTC) |
| `openrouter:image_generation` | yes | yes | yes | `model` (default `openai/gpt-5-image`) plus any `image_config` key (`aspect_ratio`, `quality`, `size`, `background`, `output_format`, `output_compression`, `moderation`, ...) |
| `openrouter:experimental__search_models` (**experimental**) | yes | yes | yes | `max_results` (default 5, max 20) |
| `openrouter:bash` | yes | yes | yes | `engine` (`auto` default and `native` = native passthrough, the call is returned to your app; `openrouter` = run in OpenRouter sandbox); `environment` (container, below) |
| `openrouter:shell` | — | yes | yes | `engine` (`auto` default: provider's hosted shell when available (OpenAI), else OpenRouter sandbox; `openrouter`); `environment` (container only; no local shells) |
| `openrouter:tool_search` | — | yes | yes | `max_results` (default 5). Finds tools marked `defer_loading: true`. |
| `openrouter:files` | yes | yes | — | `{}` (no options). Read/write/edit/list workspace files via the Files API; needs an authenticated request. |
| `openrouter:fusion` | yes | yes | — | `analysis_models` (1–8), `model` (analyst; default = outer request model), `max_completion_tokens` (default 16000), `max_tool_calls` (1–16, default 4), `reasoning` (`{effort, max_tokens}`), `temperature` (panelists only; analyst at 0), `tools` (≤8), `cache_control` |
| `openrouter:advisor` | yes | yes | — | `model`, `name` (1–64 chars `^[a-zA-Z0-9 _-]+$`, unique; ≤1 unnamed default entry), `instructions`, `forward_transcript` (bool, default false), `max_completion_tokens`, `reasoning` (`{effort, max_tokens}`), `temperature`, `stream` (Responses only: streams advice as `response.output_text.delta` on the advisor item) |
| `openrouter:subagent` | yes | yes | — | `model` (default = outer model), `name`, `instructions`, `max_completion_tokens`, `max_tool_calls` (1–25), `reasoning`, `temperature`, `tools` (OpenRouter server tools only; not itself), `inherit_functions` / `inherited_function_names` (**EXPERIMENTAL**, Responses only; other APIs → 400) |
| `openrouter:apply_patch` | — | yes (Responses only) | — | `engine` (`auto` default: native passthrough if the endpoint supports it else HITL validator; `native`; `openrouter` = always HITL) |
| `openrouter:mcp` | — | yes | — | **required** `parameters`: `server_label` (required), `server_url` (streamable HTTP), `authorization` (OAuth bearer), `headers`, `connector_id`, `server_description`, `allowed_tools` (string[] or `{tool_names, read_only}`), `require_approval` (`always` default / `never` / `{always:{...}, never:{...}}`) |
| any registered server tool | yes (`ChatDynamicServerTool`: `{type, parameters}`) | — | yes (generic `{type}` object) | Generic envelope; `parameters` validated against the tool definition. |

Container `environment` (bash, shell): `{ type: "container_auto", file_ids?, network_policy? }` (ephemeral managed container) or `{ type: "container_reference", container_id, file_ids?, network_policy? }` where `container_id` is 1–40 chars `^[\w-]+$` (reuse any previously returned `sess_...`/`gen_...` id, or a fresh name to create a persistent container; bash and shell share files with the same id). `file_ids`: ≤20 workspace file ids (`or_file_...`), copied in as `~/<last 8 chars of id>-<basename>`; bad ids → 400. `network_policy`: `{type:"disabled"}` (default, no egress) or `{type:"allowlist", allowed_domains: 1–50 lowercase hostnames or `*` globs}` (ports 80/443; `["*"]` = unrestricted); changing the policy of a warm container → 409.

#### `stop_server_tools_when` conditions (OR logic)

| `type` | Required field | Fires when |
| - | - | - |
| `step_count_is` | `step_count` (int) | The loop executed this many steps |
| `has_tool_call` | `tool_name` (string, minLength 1) | A tool with this name was called |
| `max_tokens_used` | `max_tokens` (int) | Cumulative tokens across the loop exceed this |
| `max_cost` | `max_cost_in_dollars` (number) | Cumulative cost exceeds this |
| `finish_reason_is` | `reason` (string, minLength 1) | Upstream model emits this finish reason (e.g. `length`) |

When a condition fires while the model is still emitting tool calls, the pending calls are executed and one final turn runs with tool calls disabled, so the response ends with natural language. Example: `[{"type":"step_count_is","step_count":5},{"type":"max_cost","max_cost_in_dollars":0.5}]`. On `/responses`, `max_tool_calls` (default 30, also the maximum) is the simpler cap and is ignored when this field is set.

#### `deferred_tools` (DeferredToolsControl)

| Field | Required | Values |
| - | - | - |
| `protocol` | yes | `v1` |
| `profile` | yes | `portable` — serves tools marked `defer_loading` through router-built search and call wrappers on any model; catalog fixed. `universal` — defers every wrappable tool behind the wrappers so the provider-facing tool list never changes, rebuilding the catalog from each request (tools can be added/removed mid-conversation). |
| `search` | yes | `{type:"regex", max_results?}` (versioned safe-regex), `{type:"bm25", max_results?}` (deterministic BM25), or `{type:"custom", tool_id, result_key, max_results?}` (caller-executed search returning tool identities under `result_key`) |
| `validation` | yes | `runtime` (only option: arguments validated against the original schema inside OpenRouter) |

Rule from the spec: replay assistant reasoning unchanged on continuation and keep the catalog unchanged. Usage across all upstream calls is reported in `usage.deferred_tools_details` (`prompt_tokens`, `completion_tokens`, `total_tokens`, `turns`); the native usage fields report only the final call, while `cost` covers every call. Example: `{"protocol":"v1","profile":"portable","search":{"type":"bm25","max_results":5},"validation":"runtime"}`.

Sources: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion, https://openrouter.ai/docs/api/api-reference/responses/create-a-response, https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/guides/features/message-transforms, https://openrouter.ai/docs/api_reference/responses/web-search, https://openrouter.ai/docs/guides/features/service-tiers

### 5.3 Shared response extensions and error model

#### Response fields OpenRouter adds on all three endpoints

| Field | Where | Description |
| - | - | - |
| `openrouter_metadata` | Top level of the JSON response; final chunk before `[DONE]` (chat/responses); `message_stop` event (messages); error envelopes | Present only with `X-OpenRouter-Metadata: enabled`. Fields: `requested` (string), `strategy` (`direct`, `auto`, `free`, `latest`, `alias`, `fallback`, `pareto`, `bodybuilder`, `fusion`), `region` (string or null, e.g. `iad`), `summary` (string), `attempt` (int), `attempts[]` (`{model, provider, status}`), `is_byok` (bool), `endpoints` (`{total, available: [{model, provider, selected}]}`), `generation_time` (ms from upstream dispatch to body end; absent if nothing dispatched; divide completion tokens by it for throughput), `params` (`{quality_floor?, throughput_floor?, version_group?, ...}`), `pipeline[]` (`{type: guardrail / plugin / server_tools / response_healing / context_compression, name, summary?, data?, cost_usd?, guardrail_id?, guardrail_scope?}`). |
| `safeguard_results` | Top level (chat, responses: array; messages: array or null, also in `message_delta.delta`) | OpenRouter Armor verdicts per client tool call, present whenever Armor evaluated the response (independent of the metadata header): `{ type: "dangerous_tool_use", status: { type: "available", tool_uses: { "<call id>": {type:"evaluated", outcome:"flagged" or "not_flagged", explanation?} or {type:"skipped"} or {type:"unavailable", reason} } } }`. |
| `alignment` (**Beta**) | Top level (chat, responses; chat stream: last data event) | `{ calls: [ {call, outcome:"allowed", rules:[{applicable, broken, probability}]}, {call, outcome:"blocked", rules}, {call, outcome:"unavailable", reason: cut / evaluator_error / malformed_answer / time_limit} ] }`. |
| `usage.cost` | usage object | Cost of the request (number or null). |
| `usage.is_byok` | usage object | Whether BYOK was used. |
| `usage.cost_details` | usage object | Chat & Messages: `upstream_inference_prompt_cost` (req), `upstream_inference_completions_cost` (req), `upstream_inference_cost` (nullable), `server_tool_cost` (metered server-tool cost such as shell sandbox time, USD; 0 if it settled at $0; absent if none ran). **Responses uses different names**: `upstream_inference_input_cost`, `upstream_inference_output_cost`, `upstream_inference_cost`, `server_tool_cost`. |
| `usage.server_tool_use_details` (chat, responses) / `usage.server_tool_use` (messages) | usage object | `tool_calls_requested` (OpenRouter server-orchestrated calls requested; provider-native tools not counted), `tool_calls_executed`, `web_search_requests` (do not sum with `tool_calls_requested`); messages also `web_fetch_requests`. |
| `usage.deferred_tools_details` | usage object | See 5.2. |

#### Canonical error type (`ApiErrorType`)

Stable across all three formats: `context_length_exceeded`, `max_tokens_exceeded`, `token_limit_exceeded`, `string_too_long`, `authentication`, `permission_denied`, `payment_required`, `rate_limit_exceeded`, `provider_overloaded`, `provider_unavailable`, `invalid_request`, `invalid_prompt`, `not_found`, `precondition_failed`, `payload_too_large`, `unprocessable`, `content_policy_violation`, `refusal`, `invalid_image`, `image_too_large`, `image_too_small`, `unsupported_image_format`, `image_not_found`, `image_download_failed`, `server`, `timeout`, `unmapped`. Location per skin: chat → `error.metadata.error_type`; responses → top-level `error_type` on the response object; messages → `error.error_type`. Full HTTP mapping and retry guidance: [§4](04-api-fundamentals.md#4-api-fundamentals).

#### OpenRouter error envelope (chat and responses HTTP errors)

```json
{
  "error": { "code": 400, "message": "Invalid request parameters", "metadata": { } },
  "openrouter_metadata": null,
  "user_id": null
}
```

`error.code` (int, required), `error.message` (string, required), `error.metadata` (object or null: e.g. `error_type`, `provider_code`, guardrail `patterns`, provider raw details), top-level `openrouter_metadata` (object or null, with the metadata header) and `user_id` (string or null). The same schema family is used for each status: `BadRequestResponse` (400), `UnauthorizedResponse` (401), `PaymentRequiredResponse` (402), `ForbiddenResponse` (403), `NotFoundResponse` (404), `RequestTimeoutResponse` (408), `PayloadTooLargeResponse` (413), `UnprocessableEntityResponse` (422), `TooManyRequestsResponse` (429), `InternalServerResponse` (500), `BadGatewayResponse` (502), `ServiceUnavailableResponse` (503), `EdgeNetworkTimeoutResponse` (524), `ProviderOverloadedResponse` (529). The TS SDK maps these to `errors.BadRequestResponseError` ... `errors.ProviderOverloadedResponseError`, plus `errors.OpenRouterDefaultError` for other 4XX/5XX.

| Status | Meaning (spec) | Example `message` |
| - | - | - |
| 400 | Invalid request parameters or malformed input | `Invalid request parameters` |
| 401 | Authentication required or invalid credentials | `Missing Authentication header` |
| 402 | Insufficient credits or quota | `Insufficient credits. Add more using https://openrouter.ai/credits` |
| 403 | Insufficient permissions, **or a guardrail blocked the request** (with metadata header: `openrouter_metadata.pipeline` shows the guardrail stage) | `Request blocked: prompt injection patterns detected` (with `error.metadata.patterns`), `Only management keys can perform this operation` |
| 404 | Resource does not exist (e.g. model) | `Resource not found` |
| 408 | Operation exceeded time limit | `Operation timed out. Please try again later.` |
| 413 | Payload too large | `Request payload too large` |
| 422 | Semantic validation failure | `Invalid argument` |
| 429 | Rate limit exceeded | `Rate limit exceeded` |
| 500 | Unexpected server error | `Internal Server Error` |
| 502 | Provider/upstream failure | `Provider returned error` |
| 503 | Service temporarily unavailable (e.g. no available providers) | `Service temporarily unavailable` |
| 524 | Provider request timed out at the edge | `Request timed out. Please try again later.` |
| 529 | Provider temporarily overloaded | `Provider returned error` |

`/messages` uses its own Anthropic-shaped envelope (see 5.6). Errors after the stream is committed arrive in-band with HTTP 200 (see each endpoint's streaming section).

Sources: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion, https://openrouter.ai/docs/api/api-reference/responses/create-a-response, https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message, https://openrouter.ai/docs/guides/features/router-metadata, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README

### 5.4 `POST /chat/completions` — Chat Completions

**Purpose**: OpenAI-compatible chat completion for any model, with OpenRouter routing, plugins and server tools. Streaming and non-streaming. operationId `sendChatCompletionRequest`; SDK: TS `openRouter.chat.send({ chatRequest })` (standalone `chatSend`), Python `open_router.chat.send(...)`, Go `s.Chat.Send(ctx, components.ChatRequest{...}, nil)`. Request schema `ChatRequest`; responses `ChatResult` (JSON) / `ChatStreamingResponse` (SSE, `data:` = `ChatStreamChunk`, terminated by `[DONE]`).

#### Request body (`ChatRequest`)

Only `messages` is required. Defaults marked "conv." are the conventional values from the Parameters page; OpenRouter does not inject them (an omitted sampling parameter is omitted upstream).

| Field | Type | Default / constraints | Description |
| - | - | - | - |
| `messages` | array of `ChatMessages` | **required**, minItems 1 | Conversation (roles `system`, `user`, `developer`, `assistant`, `tool`; below). |
| `model` | string | user/payer default if omitted | Model slug. |
| `models` | string[] | — | Fallback models, tried in order. |
| `stream` | boolean | `false` | SSE streaming. |
| `stream_options` | object or null | — | `include_usage` (boolean) is **DEPRECATED and has no effect**: full usage is always included. |
| `max_completion_tokens` | integer or null | ≥1 | Max tokens to generate (shares the budget with reasoning tokens on most providers). |
| `max_tokens` | integer or null | ≥1; **deprecated** (use `max_completion_tokens`); some providers enforce a minimum of 16 | Same semantics. |
| `temperature` | number or null | 0–2 (conv. 1.0) | Sampling temperature. |
| `top_p` | number or null | 0–1 (conv. 1.0) | Nucleus sampling. |
| `top_k` | integer or null | ≥0 (conv. 0 = disabled); not available for OpenAI models | Top-K sampling; 1 = greedy. |
| `frequency_penalty` | number or null | −2.0 to 2.0 (conv. 0) | Penalty scaled by occurrence count. |
| `presence_penalty` | number or null | −2.0 to 2.0 (conv. 0) | Penalty not scaled by count. |
| `repetition_penalty` | number or null | 0–2 (conv. 1.0 = none) | Penalizes repeated tokens; not all providers. |
| `min_p` | number or null | 0–1 (conv. 0) | Drop tokens below `min_p` × top-token probability; not all providers. |
| `top_a` | number or null | 0–1 (conv. 0) | "Sufficiently high" probability filter; not all providers. |
| `seed` | integer or null | — | Deterministic sampling where supported. |
| `logit_bias` | object (token id → number) or null | bias −100 to 100 | Token logit adjustments (e.g. `{"50256": -100}`). |
| `logprobs` | boolean or null | — | Return log probabilities. |
| `top_logprobs` | integer or null | 0–20; requires `logprobs: true` | Alternatives per position. |
| `stop` | string, string[] (maxItems 4), or null | ≤4 sequences | Stop sequences. |
| `response_format` | object (discriminator `type`) | — | `text`, `json_object`, `json_schema`, `grammar`, `python` (below). |
| `prediction` | `{ type: "content", content: string or [{type:"text", text}] }` or null | — | Predicted output to reduce latency on supported models. |
| `tools` | array of `ChatFunctionTool` | — | Function tools and OpenRouter server tools (below). |
| `tool_choice` | string or object | — | `none`, `auto`, `required`, named function, or a server-tool type (below). |
| `parallel_tool_calls` | boolean or null | conv. `true` | Allow multiple tool calls in one response. |
| `reasoning` | object | — | `effort`, `max_tokens`, `summary` (below). |
| `reasoning_effort` | enum `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`, or null | — | Shorthand for `reasoning.effort`; must not differ from it if both are sent. |
| `modalities` | array of `text`, `image`, `audio` | — | Output modalities (e.g. `["text","image"]` for image generation, `["text","audio"]` for audio output). |
| `image_config` | map | — | Image-generation options (5.2, [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). |
| `metadata` | map string→string | ≤16 pairs, keys ≤64 chars, values ≤512 chars | Request metadata. |
| `user` | string | — | End-user id (5.2). |
| `session_id` | string | ≤256 chars | Sticky routing / grouping (5.2). |
| `trace` | object | — | Tracing metadata (5.2). |
| `provider` | object or null | — | Provider routing (5.2). |
| `plugins` | array | — | Plugins (5.2). |
| `route` | `fallback` / `sort` / null | **DEPRECATED** | Use `provider.sort.partition`. |
| `service_tier` | enum `auto`, `default`, `fast`, `flex`, `priority`, `scale`, `ultrafast`, null | — | Capacity tier (5.2, [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). |
| `cache_control` | `{type:"ephemeral", ttl?:"5m" or "1h"}` | — | Automatic prompt caching (5.2, [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). |
| `prompt_cache_key` | string or null | — | OpenAI-style cache key. |
| `prompt_cache_options` | `{mode:"explicit", ttl?}` or null | GPT-5.6+ only | Explicit OpenAI cache breakpoints (5.2). |
| `debug` | `{echo_upstream_body?: boolean}` | streaming only | Echo the transformed upstream body in the first chunk. |
| `deferred_tools` | object | — | Deferred tool protocol (5.2). |
| `stop_server_tools_when` | array | minItems 1 | Server-tool loop stop conditions (5.2). |

**Guide-documented Chat parameters that are not in the OpenAPI `ChatRequest` schema** (sent at the top level of the body; treat as supported but untyped in generated SDKs):

| Field | Source | Description |
| - | - | - |
| `audio` | Audio guide | `{ voice, format }` for audio output with `modalities: ["text","audio"]`; voices e.g. `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`; formats e.g. `wav`, `mp3`, `flac`, `opus`, `pcm16` (vary by model). **Audio output requires `stream: true`**; Responses does not accept `audio`. |
| `verbosity` | Parameters page | `low`, `medium` (default), `high`, `xhigh`, `max`. For Anthropic models maps to `output_config.effort` (`xhigh` on Claude 4.7 Opus+, `max` on Claude 4.6 Opus+). |
| `web_search_options` | Parameters page | Native web search options for providers that support web-connected answers. |
| `include_reasoning` | Parameters page, reasoning guide | **Deprecated** legacy flag: `true` ≡ `reasoning: {}`, `false` ≡ `reasoning: { exclude: true }`. Chat only. |
| `reasoning.enabled`, `reasoning.exclude` | Reasoning guide | `enabled: true` = reasoning at default (medium) effort; `exclude: true` = model still reasons (billed) but `reasoning` is omitted from the response (Chat only; Responses ignores `exclude`). |
| `structured_outputs` | Parameters page | Listed as an optional boolean ("If the model can return structured outputs using response_format json_schema"); the description reads like a model capability, so prefer `response_format`. |
| `preset` | Presets guide | `"@preset/<slug>"`. |
| `prompt` | Overview page TS type ("Either `messages` or `prompt` is required") | Legacy text-prompt form; the OpenAPI schema requires `messages` — do not rely on `prompt` here (legacy completions are out of scope). |

#### Messages (`ChatMessages`, discriminator `role`)

| Role | Fields |
| - | - |
| `system` | `content` (**req**: string or array of text parts), `name?` (string), `configuration_update?` (OpenRouter extension, below) |
| `developer` | `content` (**req**: string or array of text parts), `name?`, `configuration_update?` |
| `user` | `content` (**req**: string or array of content parts — text, image, audio, video, file), `name?` |
| `assistant` | `content?` (string, array of content parts, or null), `name?`, `tool_calls?` (`[{id, type:"function", function:{name, arguments: JSON string}}]`), `reasoning?` (string or null; guide: `reasoning_content` is accepted as an alias), `reasoning_details?` (array, below), `refusal?` (string or null), `images?` (`[{image_url:{url}}]`), `audio?` (`{id?, data?, expires_at?, transcript?}`), `model?` (model that produced it; used by `auto-router` `pin_model`) |
| `tool` | `content` (**req**: string or array of content parts), `tool_call_id` (**req**: id of the assistant tool call this answers) |

- A trailing `assistant` message acts as **prefill**: the model continues it.
- `name`: for non-OpenAI models it is prepended as `{name}: {content}` (overview page).
- `configuration_update` (`ConfigurationUpdate` or null): `{ reasoning: { effort: max / xhigh / high / medium / low / minimal / none } }`. Changes reasoning effort from that point onward **without invalidating the prompt cache**. Put it on a content-less system (or developer) message (`content: ""`) directly before the user message it applies to, keep it at the same position in later requests, never two adjacent; not combinable with `reasoning.mode: "pro"`/pro variants; rejected on the Batch API; only routed to endpoints that support it (else 400). Equivalent to the Responses `configuration_update` item and the Messages per-message `output_config.effort`.

#### Content parts (`ChatContentItems`, discriminator `type`)

| `type` | Shape | Notes |
| - | - | - |
| `text` | `{ type, text, cache_control?, prompt_cache_breakpoint? }` | `cache_control`: Anthropic-style breakpoint `{type:"ephemeral", ttl?:"5m"/"1h"}`; `prompt_cache_breakpoint`: OpenAI-style `{mode:"explicit", ttl?: "30m"/"12h"}`. OpenRouter converts between the two based on the serving provider. Only text parts are allowed in `system`/`developer` messages. |
| `image_url` | `{ type, image_url: { url, detail? } }` | `url`: https URL or `data:` URL. `detail`: `auto`, `low`, `high`, `original` (`original` is an OpenRouter extension for true original resolution, downgraded to `high` where unsupported). |
| `input_audio` | `{ type, input_audio: { data, format } }` | `data`: base64; `format` e.g. `wav`, `mp3`, `flac`, `m4a`, `ogg`, `aiff`, `aac`, `pcm16`, `pcm24` (provider-dependent). |
| `video_url` | `{ type, video_url: { url, processing? } }` | `url`: URL or `data:` URL; `processing`: `agentic` or `static` (fixed-rate frame sampling; currently Google Gemini). |
| `input_video` | `{ type, video_url: { url, processing? } }` | **DEPRECATED** legacy video part; use `video_url`. |
| `file` | `{ type, file: { file_data?, file_id?, filename? } }` | `file_data`: base64 data URL or URL; `file_id`: previously uploaded file ([§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs) Files API). PDFs are parsed per the `file-parser` plugin ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). |

#### Tools (`ChatFunctionTool`)

Function tool:

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get the current weather for a location",
    "parameters": { "type": "object", "properties": { "location": { "type": "string" } }, "required": ["location"] },
    "strict": false
  },
  "cache_control": { "type": "ephemeral" },
  "defer_loading": false
}
```

| Field | Type | Notes |
| - | - | - |
| `type` | `"function"` | **required** |
| `function.name` | string | **required**; `a-z A-Z 0-9 _ -`, maxLength 64 |
| `function.description` | string | — |
| `function.parameters` | JSON Schema object | — |
| `function.strict` | boolean or null | Strict schema adherence |
| `function.defer_loading`, `defer_loading` | boolean | Withhold until found by tool search / deferred tools (5.2) |
| `cache_control` | cache directive | Cache breakpoint on the tool definition |

Other `tools` entries: OpenRouter server tools `openrouter:advisor`, `openrouter:bash`, `openrouter:datetime`, `openrouter:files`, `openrouter:fusion`, `openrouter:image_generation`, `openrouter:experimental__search_models`, `openrouter:subagent`, `openrouter:web_fetch`, `openrouter:web_search` (parameters in 5.2); the **web-search shorthand** `{ type: "web_search" / "web_search_preview" / "web_search_preview_2025_03_11" / "web_search_2025_08_26", ...WebSearchConfig fields or parameters }`, automatically converted to `openrouter:web_search`; and the generic `{ type: "<registered server tool>", parameters }` envelope.

The `tools` array must be sent on **every** request of a tool loop (the router validates the schema each call).

#### `tool_choice` (`ChatToolChoice`)

| Value | Meaning |
| - | - |
| `"none"` | Never call tools |
| `"auto"` | Model decides (default behavior) |
| `"required"` | Must call one or more tools |
| `{ "type": "function", "function": { "name": "get_weather" } }` | Force a specific function |
| `{ "type": "openrouter:web_search" }` (also `web_search`, `web_search_preview`) | OpenRouter extension: force a server tool directly |

#### `response_format` (discriminator `type`)

| `type` | Extra fields | Notes |
| - | - | - |
| `text` | — | Plain text |
| `json_object` | — | JSON mode; also instruct the model to emit JSON |
| `json_schema` | `json_schema` (**req**): `{ name (req, ≤64, a-zA-Z0-9_-), description?, schema? (JSON Schema), strict? (boolean or null) }` | Structured outputs ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) |
| `grammar` | `grammar` (**req**, string), e.g. `root ::= "yes" \| "no"` | Custom grammar |
| `python` | — | Python code format |

Example (spec):

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "math_response",
      "description": "A mathematical response",
      "strict": true,
      "schema": { "type": "object", "properties": { "answer": { "type": "number" } }, "required": ["answer"] }
    }
  }
}
```

Pair with the `response-healing` plugin to repair malformed JSON; use `provider.require_parameters: true` to route only to providers that support structured outputs ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

#### Reasoning

| Field | Type | Notes |
| - | - | - |
| `reasoning.effort` | `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`, null | Token share of the output limit ≈ 95% (max, xhigh), 80% (high), 50% (medium), 20% (low), 10% (minimal); `none` disables. |
| `reasoning.max_tokens` | integer or null | Reasoning token budget (Anthropic, Gemini, some Qwen). **Cannot be combined with `reasoning.effort` or `reasoning_effort`** → error `Only one of "reasoning.effort" and "reasoning.max_tokens" can be specified`. Anthropic: min 1024, cap 128,000; output limit must exceed it. |
| `reasoning.summary` | `auto`, `concise`, `detailed`, null | Reasoning summary verbosity. |
| `reasoning.enabled`, `reasoning.exclude` | boolean | Guide-documented (see above). |

Preserve reasoning across turns (required for tool use with reasoning models) by sending back the assistant message's `reasoning_details` unchanged and in order (or `reasoning` for plain-text-only models). Details in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy).

#### Response body (`ChatResult`, `object: "chat.completion"`)

| Field | Type | Req | Description |
| - | - | - | - |
| `id` | string | yes | Completion id (`gen-...`); also in `X-Generation-Id`; query `/api/v1/generation?id=` for stats ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)). |
| `object` | `"chat.completion"` | yes | — |
| `created` | integer | yes | Unix timestamp |
| `model` | string | yes | Model actually used (may differ from the request when routing/fallback applies) |
| `choices` | array of `ChatChoice` | yes | Always an array |
| `system_fingerprint` | string or null | yes | Provider fingerprint |
| `usage` | `ChatUsage` | — | Always returned for non-streaming (overview) |
| `service_tier` | string or null | — | Tier actually used upstream (`default`, `flex`, `priority`, ...) |
| `openrouter_metadata` | object | — | With `X-OpenRouter-Metadata: enabled` (5.3) |
| `safeguard_results` | array | — | Armor verdicts (5.3) |
| `alignment` | object | — | Alignment plugin result (Beta, 5.3) |

`ChatChoice`: `index` (int, req), `finish_reason` (req; `tool_calls`, `stop`, `length`, `content_filter`, `error`, or null), `message` (req, `ChatAssistantMessage`: `role: "assistant"`, `content`, `refusal`, `reasoning`, `reasoning_details`, `tool_calls`, `images`, `audio`, `model`, `name`), `logprobs` (`{ content: [{token, logprob, bytes, top_logprobs:[{token, logprob, bytes}]}] or null, refusal: same or null }` or null).

Documented outside the spec schema:
- `native_finish_reason` on each choice: the raw provider finish reason (overview, streaming pages).
- `choices[].error` (`{code, message, metadata}`) with `finish_reason: "error"` when a provider fails after partial output on a non-streaming request.
- `message.annotations`: web search results as `{ type: "url_citation", url_citation: { url, title, content?, start_index, end_index } }` (standardized for all models, `content` added by OpenRouter when available); parsed-PDF annotations as `{ type: "file", file: { hash, name?, content: [ {type:"text", text} or {type:"image_url", image_url:{url}} ] } }` — send these back in later requests to skip re-parsing (dedupe by `file.hash`; on total failure they appear in `error.metadata.file_annotations`).
- `provider` (string) appears in streaming/debug chunk examples.
- `completion_tokens_details.image_tokens` appears in the overview's usage type.

`reasoning_details` items (`ReasoningDetailUnion`, discriminator `type`; common optional fields `id` (string or null), `index` (int), `format` (`unknown`, `openai-responses-v1`, `azure-openai-responses-v1`, `bedrock-openai-responses-v1`, `bedrock-xai-responses-v1`, `xai-responses-v1`, `meta-responses-v1`, `openrouter-stealth-v1`, `anthropic-claude-v1`, `google-gemini-v1`, null)):

| `type` | Fields |
| - | - |
| `reasoning.text` | `text` (string or null), `signature` (string or null) |
| `reasoning.summary` | `summary` (req string) |
| `reasoning.encrypted` | `data` (req string) |
| `reasoning.server_tool_call` | `tool_name` (req, e.g. `openrouter:fusion`), `arguments` (req JSON string), `result` (req JSON string), `tool_call_id` (string or null) — lets a prior server-tool call be rehydrated in a later turn |

`ChatUsage`:

| Field | Type | Req | Notes |
| - | - | - | - |
| `prompt_tokens` | int | yes | Includes images, input audio, tools; native tokenizer |
| `completion_tokens` | int | yes | Includes reasoning tokens |
| `total_tokens` | int | yes | Sum |
| `prompt_tokens_details` | object or null | — | `cached_tokens`, `cache_write_tokens` (explicit-caching models with write pricing), `audio_tokens`, `video_tokens` |
| `completion_tokens_details` | object or null | — | `reasoning_tokens`, `audio_tokens`, `accepted_prediction_tokens`, `rejected_prediction_tokens` (all int or null) |
| `cost` | number or null | — | Request cost |
| `cost_details` | object or null | — | `upstream_inference_prompt_cost`, `upstream_inference_completions_cost`, `upstream_inference_cost`, `server_tool_cost` (5.3) |
| `is_byok` | boolean | — | BYOK used |
| `server_tool_use_details` | object or null | — | `tool_calls_requested`, `tool_calls_executed`, `web_search_requests` |
| `deferred_tools_details` | object | — | `prompt_tokens`, `completion_tokens`, `total_tokens`, `turns` |

Visible-output check for reasoning models: `completion_tokens - completion_tokens_details.reasoning_tokens`; near 0 with `finish_reason: "length"` means the budget was spent on reasoning (still billed).

Example (spec):

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "openai/gpt-4",
  "system_fingerprint": "fp_44709d6fcb",
  "choices": [
    { "index": 0, "finish_reason": "stop",
      "message": { "role": "assistant", "content": "The capital of France is Paris." } }
  ],
  "usage": { "prompt_tokens": 25, "completion_tokens": 10, "total_tokens": 35 }
}
```

#### Streaming (`stream: true`)

Each SSE line is `data: <ChatStreamChunk JSON>`; the stream ends with `data: [DONE]`. Ignore comment lines beginning with `:`.

`ChatStreamChunk`: `id` (req), `object: "chat.completion.chunk"` (req), `created` (req), `model` (req), `choices` (req, array of `ChatStreamChoice`), `system_fingerprint?`, `service_tier?`, `usage?` (`ChatUsage`), `error?` (`{ code (int), message, metadata?: { error_type (ApiErrorType, req), provider_code? } }`), `openrouter_metadata?`, `safeguard_results?`, `alignment?` (on the last data event).

`ChatStreamChoice`: `index` (req), `finish_reason` (req, null until the end), `delta` (req), `logprobs?`. Prose also shows `native_finish_reason`.

`ChatStreamDelta`: `role?` (`"assistant"`), `content?` (string or null), `reasoning?` (string or null), `reasoning_details?` (same union as above), `refusal?`, `audio?` (`{id?, data?, expires_at?, transcript?}` — base64 audio chunk plus transcript), `tool_calls?` (array of `{ index (req), id?, type?: "function", function?: { name?, arguments? } }`).

Tool-call deltas: the first delta for a call carries `index`, `id`, `type`, `function.name`; later deltas carry only `index` and an `arguments` fragment. Accumulate `arguments` per `index` and parse JSON once `finish_reason: "tool_calls"` arrives.

Stream sequence and special chunks:
1. Optional **debug chunk** first (only with `debug.echo_upstream_body: true`): `choices: []` and `debug: { echo_upstream_body: {...} }` (one per attempted provider when falling back).
2. Content chunks (`delta.content`, `delta.reasoning`, `delta.tool_calls`, ...).
3. A chunk with the terminal `finish_reason`.
4. **Usage chunk** just before `[DONE]`: unlike OpenAI (empty `choices`), OpenRouter sends one choice with a content-free delta that repeats `finish_reason`/`native_finish_reason`, plus `usage` (and `openrouter_metadata` when opted in). Treat it as an accounting frame, not a second terminal event.
5. `data: [DONE]`.

```text
data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}]}
data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}],"usage":{...}}
data: [DONE]
```

**Mid-stream errors** (after HTTP 200 is committed) arrive as a chunk with a top-level `error` and `finish_reason: "error"`, then the stream ends. It can be the first and only event — treat a 200 stream whose only chunk is an error as a failure:

```text
data: {"id":"cmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","provider":"openai","error":{"code":"server_error","message":"Provider disconnected unexpectedly"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

Upstream token-limit errors become `finish_reason: "length"` instead of an error. Errors before the stream is committed are normal JSON error responses with an HTTP status (5.3). Aborting the HTTP connection cancels the request and stops billing on supported providers ([§4](04-api-fundamentals.md#4-api-fundamentals)).

#### Errors

HTTP 400, 401, 402, 403, 404, 408, 413, 422, 429, 500, 502, 503, 524, 529 with the OpenRouter envelope (5.3). Non-streaming provider failures after partial output are returned in the body:

```json
{
  "choices": [{
    "message": { "role": "assistant", "content": "partial output..." },
    "finish_reason": "error",
    "error": { "code": 502, "message": "Provider disconnected mid-stream", "metadata": { "error_type": "provider_unavailable" } }
  }]
}
```

#### Examples

curl, non-streaming (body is the spec's request example):

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4",
    "max_tokens": 150,
    "temperature": 0.7,
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "What is the capital of France?" }
    ]
  }'
```

curl, streaming with routing metadata:

```bash
curl -N https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-OpenRouter-Metadata: enabled" \
  -d '{
    "model": "openai/gpt-4o",
    "stream": true,
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

TypeScript SDK (`@openrouter/sdk`), non-streaming:

```typescript
import { OpenRouter } from "@openrouter/sdk";

const openRouter = new OpenRouter({
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
  httpReferer: "https://example.com", // optional attribution
  appTitle: "My App",                 // optional attribution
});

const result = await openRouter.chat.send({
  chatRequest: {
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the capital of France?" },
    ],
  },
});
console.log(result);
```

TypeScript SDK, streaming (from the SDK quickstart; `stream: true` makes the result an async iterable of chunks):

```typescript
const stream = await openRouter.chat.send({
  chatRequest: {
    model: "openai/gpt-5",
    messages: [{ role: "user", content: "Hello, how are you?" }],
    provider: { zdr: true, sort: "price" },
    stream: true,
  },
});

for await (const chunk of stream) {
  console.log(chunk.choices[0]?.delta.content);
}
```

Plain `fetch` streaming parser that follows the documented rules (skip `:` comments, stop at `[DONE]`, surface in-band errors, read usage from the last chunk):

```typescript
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/gpt-4o",
    stream: true,
    messages: [{ role: "user", content: "Write a haiku about routers." }],
  }),
});
if (!res.ok) throw new Error((await res.json()).error.message); // pre-stream error = plain JSON

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;      // also skips ": OPENROUTER PROCESSING"
    const data = line.slice(6).trim();
    if (data === "[DONE]") continue;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(`${chunk.error.metadata?.error_type}: ${chunk.error.message}`);
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) process.stdout.write(delta.content);
    if (chunk.usage) console.log("\ncost:", chunk.usage.cost, "tokens:", chunk.usage.total_tokens);
  }
}
```

Tool-calling round trip (tool-calling guide). Step 1 sends `tools`; the model returns `finish_reason: "tool_calls"` and `message.tool_calls`; step 3 sends the assistant message back plus a `tool` message, **with `tools` again**:

```json
{
  "model": "google/gemini-3-flash-preview",
  "messages": [
    { "role": "user", "content": "What are the titles of some James Joyce books?" },
    { "role": "assistant", "content": null,
      "tool_calls": [{ "id": "call_abc123", "type": "function",
        "function": { "name": "search_gutenberg_books", "arguments": "{\"search_terms\": [\"James\", \"Joyce\"]}" } }] },
    { "role": "tool", "tool_call_id": "call_abc123",
      "content": "[{\"id\": 4300, \"title\": \"Ulysses\", \"authors\": [{\"name\": \"Joyce, James\"}]}]" }
  ],
  "tools": [{
    "type": "function",
    "function": {
      "name": "search_gutenberg_books",
      "description": "Search for books in the Project Gutenberg library",
      "parameters": { "type": "object",
        "properties": { "search_terms": { "type": "array", "items": { "type": "string" }, "description": "List of search terms to find books" } },
        "required": ["search_terms"] }
    }
  }]
}
```

Python SDK: `open_router.chat.send(model="openai/gpt-4o", messages=[{"role": "user", "content": "Hi"}], stream=False)` inside `with OpenRouter(api_key=os.getenv("OPENROUTER_API_KEY", "")) as open_router:`. Go SDK: `s := openrouter.New(openrouter.WithSecurity(os.Getenv("OPENROUTER_API_KEY")))` then `s.Chat.Send(ctx, components.ChatRequest{Messages: []components.ChatMessages{components.CreateChatMessagesUser(components.ChatUserMessage{Content: components.CreateChatUserMessageContentStr("Hi"), Role: components.ChatUserMessageRoleUser})}}, nil)`; streaming responses expose `res.ChatStreamingResponse.Next()` / `.Value()` / `.Close()`. See [§3](03-client-sdks.md#3-client-sdks-typescript-python-go).

Sources: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/api_reference/parameters, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/guides/features/tool-calling, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/guides/overview/multimodal/audio, https://openrouter.ai/docs/guides/overview/multimodal/pdfs, https://openrouter.ai/docs/guides/features/plugins/web-search, https://openrouter.ai/docs/client-sdks/typescript/overview, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README, https://openrouter.ai/docs/client-sdks/go/sdks/chat/README

### 5.5 `POST /responses` — Responses API (stateless OpenResponses)

**Purpose**: OpenAI Responses-compatible, item-based API ("drop-in replacement for OpenAI's Responses API") for any model. Inputs and outputs are typed **items** (messages, reasoning, function calls, server-tool calls), which makes it the natural fit for agents; the Agent SDK's `callModel` ([§2](02-agent-sdk.md#2-agent-sdk-openrouteragent)) is built on it. operationId `createResponses`; SDK: TS `openRouter.responses.send({ responsesRequest })` (standalone `responsesSend`), Python `open_router.responses.send(...)`, Go `s.Responses.Send(ctx, components.ResponsesRequest{...}, nil)`. `beta.responses.send` / `s.Beta.Responses.Send` is a **deprecated alias** scheduled for removal. Responses: `OpenResponsesResult` (JSON) / `ResponsesStreamingResponse` (SSE, typed events, `[DONE]` sentinel).

**Stateless only**: nothing is stored. `store` accepts only `false`; `store: true` or any non-null `previous_response_id` → **400**. Send the full history in `input` every time (including prior `output` items you want the model to see).

#### Request body (`ResponsesRequest`)

No field is marked required in the schema, but in practice send `input` (and usually `model`).

| Field | Type | Default / constraints | Description |
| - | - | - | - |
| `input` | string, or array of input items | — | Prompt text or conversation items (below). |
| `instructions` | string or null | — | System/developer instructions. |
| `model` | string | user default if omitted | Model slug. |
| `models` | string[] | — | Fallback models. |
| `stream` | boolean | `false` | SSE event stream. |
| `max_output_tokens` | integer or null | — | Output cap; reasoning tokens count against it on most providers. |
| `temperature` | number or null | 0–2 | Sampling temperature. |
| `top_p` | number or null | 0–1 | Nucleus sampling. |
| `top_k` | integer | — | Top-K sampling. |
| `frequency_penalty` | number or null | — | Frequency penalty. |
| `presence_penalty` | number or null | — | Presence penalty. |
| `top_logprobs` | integer or null | — | Logprob alternatives per token (returned in `output_text.logprobs`). |
| `stop` | string, string[] (maxItems 4), or null | ≤4 | Stop sequences. |
| `text` | `{ format?, verbosity? }` | — | `format`: `{type:"text"}`, `{type:"json_object"}`, or `{type:"json_schema", name (req), schema (req), description?, strict?}`. `verbosity`: `low`, `medium`, `high`, `xhigh`, `max`, or null. |
| `reasoning` | object or null | — | `effort` (`max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`, null), `summary` (`auto`, `concise`, `detailed`, null), `enabled` (boolean or null), `max_tokens` (int or null; not with `effort`), `mode` (`standard` default / `pro` — deeper reasoning at standard token rates; GPT-5.6+), `context` (`auto` / `all_turns` / `current_turn` — which turns' reasoning the model sees; GPT-5.6+). `exclude` is ignored here (reasoning items are always returned). |
| `tools` | array | — | Function, custom, namespace, OpenAI hosted tools, OpenRouter server tools (below). |
| `tool_choice` | string or object | — | See below. |
| `parallel_tool_calls` | boolean or null | — | Allow parallel calls. |
| `max_tool_calls` | integer or null | default **30**, also the maximum | Max server-tool agent steps per request; ignored if `stop_server_tools_when` is set. |
| `include` | array or null | values: `file_search_call.results`, `message.input_image.image_url`, `computer_call_output.output.image_url`, `reasoning.encrypted_content`, `output.encrypted_content`, `code_interpreter_call.outputs` | Extra data to include in the output. |
| `truncation` | `auto` / `disabled` / null | — | Context truncation; `configuration_update` items cannot be combined with `"auto"`. |
| `modalities` | array of `text`, `image` | — | Output modalities (no audio on Responses). |
| `image_config` | map | — | Image generation options (5.2). |
| `prompt` | `{ id (req), variables? }` or null | — | Stored prompt template reference (`StoredPromptTemplate`). |
| `background` | boolean or null | — | Present in the schema without description (OpenAI background mode); the API is stateless, so do not rely on it. |
| `store` | `false` | const `false`, default `false` | Must be false. |
| `previous_response_id` | any | non-null → 400 | Not supported. |
| `safety_identifier` | string or null | — | **Recommended** per-end-user identifier for abuse isolation (hashed upstream, never forwarded raw; omitted → account-level identity). |
| `user` | string | ≤256 | End-user identifier. |
| `access_programs` | `{ cyber?: "standard" / "daybreak_blue" / "daybreak_red" }` | — | OpenAI Cyber access program. Non-`standard` only works on BYOK requests using your own OpenAI key enrolled in that program; otherwise 400. OpenRouter's own OpenAI credentials always run `standard`. Omit unless enrolled. |
| `metadata` | map or null | ≤16 pairs; keys ≤64 chars, no brackets; values ≤512 | Request metadata. |
| `session_id`, `trace`, `provider`, `plugins`, `route` (deprecated), `service_tier` (default `auto`), `cache_control`, `prompt_cache_key`, `prompt_cache_options`, `debug`, `deferred_tools`, `stop_server_tools_when` | — | — | Shared fields (5.2). |

Guide-documented: `preset` (`"@preset/<slug>"`), `model: "@preset/<slug>"`. Not accepted here: `audio`, `include_reasoning`.

#### Input items (`input` array)

Message forms:

| Item | Shape | Notes |
| - | - | - |
| Easy message (`EasyInputMessage`) | `{ type?: "message", role: "user" / "system" / "assistant" / "developer", content: string or content parts or null, phase?: "commentary" / "final_answer" / null }` | Simplest form: `{ "role": "user", "content": "Hi" }`. |
| Input message (`InputMessageItem`) | `{ type?: "message", id?, role: "user" / "system" / "developer", content: content parts or null }` | — |
| Replayed assistant output (`OutputMessageItem`) | `{ type: "message", id, role: "assistant", status: "completed" / "incomplete" / "in_progress", content: [{type:"output_text", text, annotations?, logprobs?} or {type:"refusal", refusal}] (or string or null), phase? }` | Replay prior output with `output_text`; the basic-usage guide says `id` and `status` are **required** on replayed assistant messages. Preserve `phase` for `gpt-5.3-codex`-and-later models. |

Input content parts:

| `type` | Fields | Notes |
| - | - | - |
| `input_text` | `text` (req), `prompt_cache_breakpoint?` (`{mode:"explicit", ttl?}`) | — |
| `input_image` | `detail` (req: `auto`, `high`, `low`, `original`), `image_url?` (URL or base64 data URL, or null), `file_id?` | Provide `image_url` or `file_id`. |
| `input_file` | `file_data?`, `file_id?`, `file_url?`, `filename?` | PDFs and documents (parsing: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). |
| `input_audio` | `input_audio: { data (base64), format: "mp3" / "wav" }` | — |
| `input_video` | `video_url` (req: data URL or remote URL), `processing?` (`agentic` / `static`) | — |

Tool-loop and control items:

| `type` | Fields (req in bold) | Purpose |
| - | - | - |
| `function_call` | **`call_id`**, **`name`**, **`arguments`** (JSON string), `id?`, `status?` (`in_progress`/`completed`/`incomplete`), `namespace?`, `async?`, `subagent_id?`, `subagent_items?` (EXPERIMENTAL) | Replay of a model function call. |
| `function_call_output` | **`call_id`**, **`output`** (string or array of `input_text`/`input_image`/`input_file` parts), `id?`, `status?` | Your tool result; `call_id` pairs it with the call (`id` optional). Non-text parts only reach multimodal models. |
| `reasoning` | **`id`**, **`summary`** (`[{type:"summary_text", text}]`), `content?` (`[{type:"reasoning_text", text}]`), `encrypted_content?`, `signature?`, `format?`, `status?` | Replay reasoning unchanged and in order (needed for tool use with reasoning models). |
| `configuration_update` | **`reasoning: { effort }`**, `id?` | Change reasoning effort from this point without breaking the prompt cache; place before the user message; never two adjacent; not with `truncation: "auto"` or `reasoning.mode: "pro"`. |
| `item_reference` | **`id`** | Reference a previous item by id. |
| `custom_tool_call` | **`call_id`**, **`name`**, **`input`** (free text), `id?`, `namespace?`, `async?`, `status?` | Call to a freeform-grammar custom tool. |
| `custom_tool_call_output` | **`call_id`**, **`output`** (string or parts), `id?` | Result of a custom tool call. |
| `apply_patch_call` | **`call_id`**, **`operation`** (`{type:"create_file", path, diff}`, `{type:"update_file", path, diff}`, `{type:"delete_file", path}`; V4A diffs), **`status`** (`in_progress`/`completed`), `id?` | Model-requested patch. |
| `apply_patch_call_output` | **`call_id`**, **`status`** (`completed`/`failed`), `output?` (log), `id?` | Your echo after applying the patch. |
| `mcp_approval_response` | **`approval_request_id`**, **`approve`** (bool), `reason?`, `id?` | Answer an `mcp_approval_request`. |
| `compaction_trigger` | — | Ask the model to compact the preceding input into a `compaction` item. |
| `compaction` / `context_compaction` | `encrypted_content`, `id` | Replay a compaction marker. |
| `additional_tools` | **`role`** (`unknown`, `user`, `assistant`, `system`, `critic`, `discriminator`, `developer`, `tool`), **`tools`** (tool definitions), `id?` | Make extra tools available from this point in the input. |
| `agent_message` | **`author`**, **`recipient`**, **`content`** (`input_text`, `input_image`, or `{type:"encrypted_content", encrypted_content}`), `agent?` (`{agent_name}`), `id?` | Message between agents in a multi-agent session. |
| `tool_search_call` / `tool_search_output` | **`call_id`**, **`execution`** (`server`/`client`), `arguments?` / **`tools`**, `status?`, `id?` | Client-executed tool search and the tools it loaded. |
| `local_shell_call` / `local_shell_call_output`, `shell_call` / `shell_call_output` | per OpenAI shapes (`action`, `call_id`, `output`, `container_id`, `files`, ...) | Shell tool round trips. |
| `mcp_list_tools`, `mcp_approval_request`, `mcp_call` | see output items | Replay MCP items. |
| Server-tool output items | `web_search_call`, `file_search_call`, `image_generation_call`, `code_interpreter_call`, `computer_call`, and every `openrouter:*` output item (`openrouter:datetime`, `openrouter:web_search`, `openrouter:web_fetch`, `openrouter:image_generation`, `openrouter:bash`, `openrouter:shell`, `openrouter:apply_patch`, `openrouter:tool_search`, `openrouter:fusion`, `openrouter:advisor`, `openrouter:subagent`, `openrouter:files`, `openrouter:experimental__search_models`, `openrouter:code_interpreter`, `openrouter:file_search`, `openrouter:browser_use`, `openrouter:text_editor`, `openrouter:memory`, `openrouter:armor_blocked`) | Replay prior output items unchanged. Echo `instance_name` on advisor/subagent items unchanged; replay a blocked `openrouter:armor_blocked` item to replay its `reason` text to the model. |

#### Tools (`tools` array)

Function tool (flat, not nested under `function`):

```json
{
  "type": "function",
  "name": "get_weather",
  "description": "Get the current weather in a location",
  "parameters": { "type": "object", "properties": { "location": { "type": "string" } }, "required": ["location"] },
  "strict": null
}
```

| Field | Type | Notes |
| - | - | - |
| `type` | `"function"` | **required** |
| `name` | string | **required** |
| `parameters` | object or null | **required** (may be null) |
| `description` | string or null | — |
| `strict` | boolean or null | — |
| `output_schema` | object or null | — |
| `allowed_callers` | array of `direct` / `programmatic`, or null | — |
| `async` | boolean | Model may keep working after calling it; you still execute it and return a `function_call_output` with the original `call_id` in a later request. Only honored where the provider's Responses API supports async tools. |
| `defer_loading` | boolean | Withhold until `openrouter:tool_search` finds it; OpenRouter may add the search tool automatically. If you declare the search tool yourself, keep at least one tool non-deferred. |

Other tool types:

| `type` | Fields | Notes |
| - | - | - |
| `custom` | `name` (req), `description?`, `format?` (`{type:"text"}` or `{type:"grammar", syntax: "lark"/"regex", definition}`), `async?`, `defer_loading?` | Freeform-input tool → `custom_tool_call` items. |
| `namespace` | `name`, `description`, `tools` (function tools with `name`, `parameters?`, `strict?`, `output_schema?`, `allowed_callers?`, `async?`, `defer_loading?`, or custom tools) — all req | Groups tools; calls carry `namespace`. |
| `web_search_preview`, `web_search_preview_2025_03_11`, `web_search` (legacy), `web_search_2025_08_26` | `engine?` (`auto`, `native`, `exa`, `parallel`, `firecrawl`, `perplexity`), `filters?` (`{allowed_domains?, blocked_domains?, excluded_domains?}`), `max_results?` (default 5), `max_uses?`, `mode?`, `search_context_size?` (`low`/`medium`/`high`), `user_location?` (`{type:"approximate", city, country, region, timezone}`), `x_search?` | OpenAI-style web search, executed via OpenRouter's search stack. |
| `file_search` | `vector_store_ids` (req), `max_num_results?`, `ranking_options?` (`{ranker: "auto"/"default-2024-11-15", score_threshold}`), `filters?` (`{key, type: eq/ne/gt/gte/lt/lte, value}` or `{type:"and"/"or", filters}`) | OpenAI hosted file search. |
| `computer_use_preview` | `display_width`, `display_height`, `environment` (`windows`, `mac`, `linux`, `ubuntu`, `browser`) — all req | OpenAI computer use. |
| `code_interpreter` | `container` (req: string id, or `{type:"auto", file_ids?, memory_limit?: "1g"/"4g"/"16g"/"64g"}`) | OpenAI code interpreter. |
| `mcp` | `server_label` (req), `server_url?`, `authorization?`, `headers?`, `connector_id?`, `server_description?`, `allowed_tools?`, `require_approval?` | OpenAI-style remote MCP (OpenRouter also offers `openrouter:mcp`). |
| `image_generation` | `model?`, `quality?` (`low`/`medium`/`high`/`auto`), `size?`, `background?` (`transparent`/`opaque`/`auto`), `output_format?` (`png`/`webp`/`jpeg`), `output_compression?`, `moderation?` (`auto`/`low`), `partial_images?`, `input_fidelity?` (`high`/`low`), `input_image_mask?` (`{file_id?, image_url?}`) | OpenAI image generation tool. |
| `local_shell`, `shell`, `apply_patch` | `type` only | OpenAI/Codex client-executed tools. |
| `openrouter:*` | `openrouter:advisor`, `openrouter:subagent`, `openrouter:datetime`, `openrouter:files`, `openrouter:fusion`, `openrouter:image_generation`, `openrouter:experimental__search_models`, `openrouter:web_fetch`, `openrouter:web_search`, `openrouter:apply_patch`, `openrouter:bash`, `openrouter:shell`, `openrouter:tool_search`, `openrouter:mcp` | OpenRouter server tools (parameters in 5.2). |

#### `tool_choice` (`OpenAIResponsesToolChoice`)

`"auto"`, `"none"`, `"required"`; `{ "type": "function", "name": "get_weather" }` (name at top level, unlike Chat); `{ "type": "web_search_preview" }` or `{ "type": "web_search_preview_2025_03_11" }`; `{ "type": "allowed_tools", "mode": "auto" or "required", "tools": [ { "type": "function", "name": "get_weather" } ] }`; `{ "type": "apply_patch" }`; `{ "type": "shell" }`; `{ "type": "mcp", "server_label": "huggingface", "name"?: "tool" }`.

#### Response body (`OpenResponsesResult`, `object: "response"`)

| Field | Type | Req | Description |
| - | - | - | - |
| `id` | string | yes | Response id |
| `object` | `"response"` | yes | — |
| `created_at` | int | yes | Unix seconds |
| `completed_at` | int or null | yes | — |
| `status` | `completed`, `incomplete`, `in_progress`, `failed`, `cancelled`, `queued` | yes | Overall status |
| `model` | string | yes | Model used |
| `output` | array of output items | yes | Generated items (below) |
| `output_text` | string | — | Convenience concatenation of output text |
| `error` | `{ code, message, metadata? }` or null | yes | Failure details. `code` ∈ `server_error`, `rate_limit_exceeded`, `invalid_prompt`, `vector_store_timeout`, `invalid_image`, `invalid_image_format`, `invalid_base64_image`, `invalid_image_url`, `image_too_large`, `image_too_small`, `image_parse_error`, `image_content_policy_violation`, `invalid_image_mode`, `image_file_too_large`, `unsupported_image_media_type`, `empty_image_file`, `failed_to_download_image`, `image_file_not_found`, `bio_policy`, `cyber_policy`, `misalignment_policy_violation`, `data_residency_mismatch`, `permission_denied`; `metadata.alignment` carries an alignment-plugin block result. |
| `error_type` | `ApiErrorType` | — | Canonical, precise error category (5.3) |
| `incomplete_details` | `{ reason?: "max_output_tokens" / "content_filter" }` or null | yes | Why `status` is `incomplete` |
| `usage` | object or null | — | Below |
| `instructions`, `metadata`, `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, `parallel_tool_calls`, `tool_choice`, `tools` | echoes of the request | yes | — |
| `max_output_tokens`, `max_tool_calls`, `top_logprobs`, `truncation`, `reasoning` (`{effort, summary, mode, context}`), `text`, `prompt`, `prompt_cache_key`, `prompt_cache_options`, `safety_identifier`, `user`, `store`, `background`, `previous_response_id` | echoes | — | — |
| `service_tier` | string or null | — | Tier actually used (`default` for base tier) |
| `access_programs` | `{ cyber }` or null (default null) | — | Access program reported by the provider; null includes OpenAI's implicit Standard |
| `openrouter_metadata`, `safeguard_results`, `alignment` | — | — | 5.3 |

`usage` (`OpenAIResponsesUsage` + OpenRouter extensions):

| Field | Notes |
| - | - |
| `input_tokens` (req), `output_tokens` (req), `total_tokens` (req) | Token counts (native tokenizer) |
| `input_tokens_details` (req) | `cached_tokens` (req), `cache_write_tokens` (int or null) |
| `output_tokens_details` (req) | `reasoning_tokens` (req) |
| `cost`, `is_byok` | — |
| `cost_details` | `upstream_inference_input_cost` (req), `upstream_inference_output_cost` (req), `upstream_inference_cost` (nullable), `server_tool_cost` |
| `server_tool_use_details`, `deferred_tools_details` | 5.3 |

If reasoning consumes the whole `max_output_tokens`, the response is `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"`, no `message` item, and reasoning is still billed; detect with `output_tokens - output_tokens_details.reasoning_tokens ≈ 0`.

Example (spec 200 response for `{"model":"openai/gpt-4o","input":"Tell me a joke"}`):

```json
{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1700000000,
  "completed_at": 1700000010,
  "status": "completed",
  "model": "openai/gpt-4o",
  "output": [{
    "type": "message", "id": "msg-abc123", "role": "assistant", "status": "completed",
    "content": [{ "type": "output_text", "text": "Why did the chicken cross the road? To get to the other side!", "annotations": [] }]
  }],
  "usage": {
    "input_tokens": 10, "input_tokens_details": { "cached_tokens": 0 },
    "output_tokens": 20, "output_tokens_details": { "reasoning_tokens": 0 },
    "total_tokens": 30
  },
  "error": null, "incomplete_details": null, "instructions": null, "metadata": null,
  "max_output_tokens": null, "temperature": null, "top_p": null,
  "frequency_penalty": null, "presence_penalty": null,
  "parallel_tool_calls": true, "tool_choice": "auto", "tools": []
}
```

A reasoning model adds a `reasoning` item before the message, e.g. `{"type":"reasoning","id":"rs_abc123","encrypted_content":"gAAAAAB...","summary":[...]}`, and `usage.output_tokens_details.reasoning_tokens > 0`.

#### Output item types (`output[]`, discriminator `type`)

| `type` | Key fields |
| - | - |
| `message` | `id`, `role: "assistant"`, `status`, `phase?`, `content[]`: `output_text` (`text`, `annotations[]`, `logprobs[]` of `{token, logprob, bytes, top_logprobs}`) or `refusal` (`refusal`). Annotations: `url_citation` (`url`, `title`, `start_index`, `end_index`, `content?`), `file_citation` (`file_id`, `filename`, `index`), `file_path` (`file_id`, `index`). |
| `reasoning` | `id`, `summary[]` (`summary_text`), `content[]?` (`reasoning_text`), `encrypted_content?`, `signature?`, `format?`, `status?` |
| `function_call` | `call_id`, `name`, `arguments` (JSON string), `id?`, `status?`, `namespace?`, `async?` (model may continue before output returns), `subagent_id?` / `subagent_items?` (**EXPERIMENTAL**: calls projected by an `openrouter:subagent`; replay `subagent_items` verbatim; only the first parallel call carries them) |
| `custom_tool_call` | `call_id`, `name`, `input`, `namespace?`, `async?`, `status?` |
| `web_search_call` | `id`, `status` (`completed`, `searching`, `in_progress`, `failed`, `incomplete`), `action?` (`{type:"search", query, queries?, sources?[{type:"url", url}]}`, `{type:"open_page", url}`, `{type:"find_in_page", url, pattern}`) |
| `file_search_call` | `id`, `queries[]`, `status` |
| `image_generation_call` | `id`, `status` (`in_progress`, `completed`, `generating`, `failed`), `result` (base64 or null), `prompt?` (possibly rewritten) |
| `code_interpreter_call` | `id`, `status` (`in_progress`, `completed`, `incomplete`, `interpreting`, `failed`), `code?`, `container_id?`, `outputs?` |
| `computer_call` | `call_id`, `action`, `pending_safety_checks[]`, `status` |
| `apply_patch_call` | `call_id`, `operation`, `status` — apply it and send `apply_patch_call_output` |
| `shell_call`, `shell_call_output` | `call_id`, `action`, `arguments`, `output`, `container_id`, `files`, `max_output_length`, `status` |
| `tool_search_call` | `call_id`, `execution`, `arguments`, `status` |
| `compaction` | `id`, `encrypted_content`, `created_by?` (reply to `compaction_trigger`) |
| `mcp_list_tools` | `server_label`, `tools[]` (`name`, `input_schema`, `description?`, `annotations?`), `error?` |
| `mcp_call` | `server_label`, `name`, `arguments`, `output?`, `status?` (`in_progress`, `completed`, `incomplete`, `calling`, `failed`), `approval_request_id?`, `error?` (string, `{type:"mcp_protocol_error", code, message}`, `{type:"mcp_tool_execution_error", content}`, `{type:"http_error", code, message}`) |
| `mcp_approval_request` | `id`, `server_label`, `name`, `arguments` — the response ends; answer with `mcp_approval_response` |
| `openrouter:datetime` | `datetime` (ISO 8601), `timezone`, `status` (`in_progress`/`completed`/`incomplete`/`failed`), `error?` |
| `openrouter:web_search` | `action` (`{type:"search", query, sources?}`), `status`, `error?` |
| `openrouter:web_fetch` | `url`, `title`, `content`, `httpStatus`, `status`, `error?` |
| `openrouter:image_generation` | `result` (base64 or URL), `imageUrl?`, `imageB64?`, `prompt?`, `revisedPrompt?`, `status`, `error?` |
| `openrouter:bash` | `command`, `stdout`, `stderr`, `exitCode`, `container_id` (reusable as `container_reference`), `files[]` (≤10 `container_file_citation` `{file_id, filename, container_id, start_index, end_index}`), `call_id?`, `arguments?`, `status`, `error?` (tool failure; non-zero `exitCode` is a command failure) |
| `openrouter:shell` | `action`, `arguments`, `call_id`, `output`, `container_id`, `files`, `status`, `error?` |
| `openrouter:apply_patch` | `call_id`, `operation`, `status`, `error?` — turn halts on successful validation so the client applies the patch and echoes `apply_patch_call_output` |
| `openrouter:tool_search` | `query`, `matches`, `arguments`, `call_id`, `catalog_index`, `format`, `hint`, `turn_call_ids`, `status`, `error?` |
| `openrouter:fusion` | `analysis` (`consensus[]`, `contradictions[]` of `{topic, stances[{model, stance}]}`, `partial_coverage[]` `{point, models}`, `unique_insights[]` `{model, insight}`, `blind_spots[]`), `responses[]` (`{model, content}`), `sources[]` (`{url, title}`), `failed_models[]` (`{model, error, status_code?}`), `failure_reason?` (`all_panels_failed`, `insufficient_credits`, `rate_limited`, `invalid_model`, `judge_not_valid_json`, `judge_schema_mismatch`, `judge_upstream_error`, `judge_empty_completion`, `cancelled`), `status`, `error?` |
| `openrouter:advisor` | `advice`, `model`, `prompt`, `instance_name?` (echo unchanged), `status`, `error?` |
| `openrouter:subagent` | `outcome`, `model`, `name?`, `task_name`, `task_description`, `call_id` (EXPERIMENTAL; matches `subagent_id` on projected function calls), `instance_name?`, `status`, `error?` |
| `openrouter:files` | `operation`, `file_id`, `filename`, `result`, `arguments`, `call_id`, `status`, `error?` |
| `openrouter:experimental__search_models` | `query`, `arguments`, `status`, `error?` |
| `openrouter:memory` | `action`, `key`, `value`, `status` |
| `openrouter:armor_blocked` | `call_id`, `name`, `arguments`, `explanation` (`[Rule Name]`), `reason` (error text the model received), `namespace?`, `status: "completed"` — emitted in place of a blocked call when `armor.output_mode: "custom_item"` |

#### Streaming events (`stream: true`)

Every SSE `data:` payload has a `type` and a monotonically increasing `sequence_number`; the stream ends with `data: [DONE]`. Payload fields below are all required unless marked `?`.

| Event `type` | Payload |
| - | - |
| `response.created`, `response.in_progress` | `response` (full response object, `status: "in_progress"`) |
| `response.completed` | `response` (final object incl. `usage`; `openrouter_metadata` when opted in) |
| `response.incomplete` | `response` (`status: "incomplete"`, `incomplete_details`) — e.g. output token limit |
| `response.failed` | `response` (`status: "failed"`, `error`, top-level `error_type`) — terminal failure |
| `error` | `code` (string or null), `message`, `param` (string or null) |
| `response.output_item.added` / `.done` | `output_index`, `item` (complete item on `.done`, e.g. a `function_call` with full `arguments`) |
| `response.content_part.added` / `.done` | `item_id`, `output_index`, `content_index`, `part` (`output_text`, `reasoning_text`, or `refusal`) |
| `response.output_text.delta` | `item_id`, `output_index`, `content_index`, `delta`, `logprobs[]` |
| `response.output_text.done` | `item_id`, `output_index`, `content_index`, `text`, `logprobs[]` |
| `response.output_text.annotation.added` | `item_id`, `output_index`, `content_index`, `annotation_index`, `annotation` |
| `response.refusal.delta` / `.done` | `item_id`, `output_index`, `content_index`, `delta` / `refusal` |
| `response.function_call_arguments.delta` | `item_id`, `output_index`, `delta` |
| `response.function_call_arguments.done` | `item_id`, `output_index`, `name`, `arguments` |
| `response.custom_tool_call_input.delta` / `.done` | `item_id`, `output_index`, `delta` / `input` |
| `response.reasoning_text.delta` / `.done` | `item_id`, `output_index`, `content_index`, `delta` / `text` |
| `response.reasoning_summary_part.added` / `.done` | `item_id`, `output_index`, `summary_index`, `part` (`summary_text`) |
| `response.reasoning_summary_text.delta` / `.done` | `item_id`, `output_index`, `summary_index`, `delta` / `text` |
| `response.image_generation_call.in_progress` / `.generating` / `.completed` | `item_id`, `output_index` |
| `response.image_generation_call.partial_image` | `item_id`, `output_index`, `partial_image_b64`, `partial_image_index` |
| `response.code_interpreter_call.in_progress` / `.interpreting` / `.completed` | `item_id`, `output_index` |
| `response.code_interpreter_call_code.delta` / `.done` | `item_id`, `output_index`, `delta` / `code` |
| `response.web_search_call.in_progress` / `.searching` / `.completed` | `item_id`, `output_index` |
| `response.apply_patch_call_operation_diff.delta` / `.done` | `item_id`, `output_index`, `delta` / `diff` (native passthrough streams incrementally; HITL sends one delta) |
| `response.fusion_call.in_progress` / `.completed` | `item_id`, `output_index` |
| `response.fusion_call.panel.added` | `item_id`, `output_index`, `model` |
| `response.fusion_call.panel.delta` / `.panel.reasoning.delta` | `item_id`, `output_index`, `model`, `delta` |
| `response.fusion_call.panel.completed` | `item_id`, `output_index`, `model`, `content` |
| `response.fusion_call.panel.failed` | `item_id`, `output_index`, `model`, `error`, `status_code?` |
| `response.fusion_call.analysis.in_progress` | `item_id`, `output_index`, `analyst_model`, `judge_model` |
| `response.fusion_call.analysis.completed` | `item_id`, `output_index`, `analysis` |
| `response.mcp_list_tools.in_progress` / `.completed` / `.failed` | `item_id`, `output_index` |
| `response.mcp_call.in_progress` / `.completed` / `.failed` | `item_id`, `output_index` |
| `response.mcp_call_arguments.delta` / `.done` | `item_id`, `output_index`, `delta` / `arguments` |
| `response.debug` | `debug` (`{ echo_upstream_body: {...} }`) — only with `debug.echo_upstream_body` |

Typical text sequence: `response.created` → `response.in_progress` (when emitted) → `response.output_item.added` (message) → `response.content_part.added` → many `response.output_text.delta` → `response.output_text.done` → `response.content_part.done` → `response.output_item.done` → `response.completed` → `[DONE]`. Usage arrives in `response.completed`.

Failures after the 200 is committed end with `response.failed` (`response.error` + top-level `response.error_type`); the spec also defines a plain `error` event — handle both. A `response.failed` can be the first and only event. Upstream token-limit errors end with `response.incomplete` (`incomplete_details.reason: "max_output_tokens"`), except a prompt that overflows the context window, which is a terminal `response.failed` with `error.code: "invalid_prompt"`.

Doc inconsistency: the basic-usage page's sample stream shows `response.content_part.delta` and `response.done`; those names are not in the OpenAPI event union — code against `response.output_text.delta` and `response.completed`.

#### Errors

HTTP status codes and envelopes as for chat (5.3). Inside a response object (non-streaming failure or `response.failed`), `error.code` uses the reduced Responses vocabulary and `error_type` the canonical type:

| Internal `error_type` | Responses `error.code` |
| - | - |
| `rate_limit_exceeded` | `rate_limit_exceeded` |
| `context_length_exceeded`, `invalid_request`, `refusal` | `invalid_prompt` |
| `content_policy_violation` | `image_content_policy_violation` |
| policy-gate refusals (e.g. alignment block, HIPAA refusal) | `permission_denied` (≈403) |
| `authentication`, `provider_overloaded`, `provider_unavailable`, `timeout`, `server`, all others | `server_error` |

```json
{ "id": "resp_abc123", "status": "failed",
  "error": { "code": "server_error", "message": "Invalid credentials" },
  "error_type": "authentication" }
```

#### Examples

curl, non-streaming (Responses basic-usage page):

```bash
curl -X POST https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/o4-mini",
    "input": "What is the meaning of life?",
    "max_output_tokens": 9000
  }'
```

curl, streaming with reasoning:

```bash
curl -N -X POST https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/o4-mini",
    "input": "Solve this step by step: If a train travels 60 mph for 2.5 hours, how far does it go?",
    "reasoning": { "effort": "medium" },
    "stream": true,
    "max_output_tokens": 9000
  }'
```

TypeScript SDK, non-streaming:

```typescript
import { OpenRouter } from "@openrouter/sdk";

const openRouter = new OpenRouter({ apiKey: process.env["OPENROUTER_API_KEY"] ?? "" });

const response = await openRouter.responses.send({
  responsesRequest: {
    model: "openai/gpt-4o",
    input: "Tell me a joke",
  },
});
console.log(response);
```

The operation is annotated for SDK streaming on the `stream` field with the `[DONE]` sentinel (same mechanism as `chat.send`), so `stream: true` yields an iterable of events.

TypeScript streaming with `eventsource-parser` (streaming page):

```typescript
import { createParser } from "eventsource-parser";

const response = await fetch("https://openrouter.ai/api/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model: "openai/gpt-4o", input: "Hello", stream: true }),
});

// Errors that occur before streaming starts are plain JSON, not SSE
if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error.message);
}

const parser = createParser({
  onEvent(event) {
    if (event.data === "[DONE]") return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === "response.output_text.delta") console.log(data.delta);
    } catch {
      // Ignore invalid JSON
    }
  },
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  parser.feed(decoder.decode(value, { stream: true }));
}
```

Function-calling loop (tool-calling page + reasoning guide). The first response contains a `function_call` item:

```json
{ "type": "function_call", "id": "fc_abc123", "call_id": "call_xyz789",
  "name": "get_weather", "arguments": "{\"location\":\"San Francisco, CA\"}" }
```

The follow-up request replays the prior output items in order (including any `reasoning` item, unchanged) and appends one `function_call_output` per call, sending `tools` again:

```json
{
  "model": "anthropic/claude-sonnet-4.5",
  "reasoning": { "max_tokens": 2000 },
  "tools": [{ "type": "function", "name": "get_weather",
    "parameters": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] } }],
  "input": [
    { "role": "user", "content": "What's the weather in Boston?" },
    { "type": "reasoning", "id": "rs_abc123", "summary": [],
      "content": [{ "type": "reasoning_text", "text": "The user wants the current weather, so I should call get_weather." }],
      "signature": "..." },
    { "type": "function_call", "id": "fc_abc123", "call_id": "call_abc123", "name": "get_weather", "arguments": "{\"city\":\"Boston\"}" },
    { "type": "function_call_output", "call_id": "call_abc123", "output": "{\"temperature_f\":62,\"conditions\":\"cloudy\"}" }
  ]
}
```

Multimodal tool output: `"output": [{ "type": "input_text", "text": "{...}" }, { "type": "input_image", "detail": "auto", "image_url": "https://example.com/image.jpg" }]`.

Streaming tool calls: watch `response.output_item.done` and collect items whose `item.type === "function_call"` (full `arguments`), push every completed item into your replay list, and on `response.completed` run the tools and send the follow-up; treat `response.failed` / `response.incomplete` as errors.

Sources: https://openrouter.ai/docs/api/api-reference/responses/create-a-response, https://openrouter.ai/docs/api_reference/responses/overview, https://openrouter.ai/docs/api_reference/responses/basic-usage, https://openrouter.ai/docs/api_reference/responses/tool-calling, https://openrouter.ai/docs/api_reference/responses/reasoning, https://openrouter.ai/docs/api_reference/responses/web-search, https://openrouter.ai/docs/api_reference/responses/error-handling, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/guides/features/tool-calling, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/guides/overview/multimodal/pdfs, https://openrouter.ai/docs/client-sdks/typescript/sdks/responses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/go/sdks/responses/README, https://openrouter.ai/docs/agent-sdk/call-model/overview

### 5.6 `POST /messages` — Anthropic Messages API

**Purpose**: Anthropic Messages-compatible endpoint ("Supports text, images, PDFs, tools, and extended thinking") so Anthropic SDKs, Claude Code and the Claude Agent SDK can run against OpenRouter — and against **any** model, not only Claude (`thinking`/`output_config.effort` are normalized to the unified reasoning parameter; examples route `openai/gpt-5` through it). operationId `createMessages`; request `MessagesRequest`; responses `MessagesResult` (JSON) / `MessagesStreamingResponse` (SSE with `event:` names).

**SDK access**: the operation is marked `x-speakeasy-ignore: true`, so the OpenRouter TS/Python/Go SDKs have **no** method for it. Use the Anthropic SDK pointed at `baseURL: "https://openrouter.ai/api"` (the SDK appends `/v1/messages`), or Claude Code / Claude Agent SDK with `ANTHROPIC_BASE_URL=https://openrouter.ai/api`, `ANTHROPIC_AUTH_TOKEN=$OPENROUTER_API_KEY`, and `ANTHROPIC_API_KEY=""` (must be explicitly empty). For raw HTTP use `Authorization: Bearer` (the only scheme declared in the spec).

#### Request body (`MessagesRequest`)

Required: `model`, `messages`.

| Field | Type | Default / constraints | Description |
| - | - | - | - |
| `model` | string | **required** | Any OpenRouter model slug. |
| `messages` | array of `MessagesMessageParam` (or null) | **required** | Conversation (below). |
| `max_tokens` | integer | not marked required by OpenRouter's spec (Anthropic's API requires it; examples always send it) | Output cap. With `thinking.type: "enabled"`, must exceed `budget_tokens`. |
| `system` | string, or array of text blocks (`{type:"text", text, cache_control?, citations?}`) | — | Top-level system prompt. |
| `stream` | boolean | — | SSE streaming. |
| `temperature` | number | — | Sampling temperature. |
| `top_p` | number | — | Nucleus sampling. |
| `top_k` | integer | — | Top-K. |
| `stop_sequences` | string[] | — | Stop sequences. |
| `tools` | array | — | Anthropic tools and OpenRouter server tools (below). |
| `tool_choice` | object | — | `auto` / `any` / `none` / `tool` (below). |
| `thinking` | object | — | Extended thinking (below). |
| `output_config` | object | — | `effort`, `format`, `task_budget` (below). |
| `context_management` | `{ edits: [...] }` or null | — | Server-side context editing (below). |
| `metadata` | `{ user_id?: string or null }` | — | Anthropic metadata. |
| `fallbacks` | array of `{ model }` or null | max **3**; only `model` allowed (per-attempt overrides such as `max_tokens`, `thinking`, `speed`, `output_config` → 400); **cannot be combined with `models`** (→ 400) | Fallback models, handled by OpenRouter routing (not Anthropic server-side fallbacks); trigger on the same errors as `models` (rate limits, downtime, moderation refusals), not only refusals. |
| `models` | string[] | — | OpenRouter fallback list (alternative to `fallbacks`). |
| `speed` | `fast` / `standard` / null | default `standard` | `fast` = higher-speed inference at premium pricing; reported as `service_tier: "priority"` and `usage.speed: "fast"`. |
| `service_tier` | string | — | OpenRouter service tier (`auto`, `default`, `flex`, `priority`, ... see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)); returned inside `usage`. |
| `safeguards` | array of `{ type, classifier_context?, ... }` or null | — | Anthropic server-side safeguards (e.g. `{"type":"dangerous_tool_use","classifier_context":{"permission_mode":"auto","v":1}}`); merged into the Armor rule stack. |
| `provider`, `plugins`, `route` (deprecated), `session_id`, `user` (≤256), `trace`, `cache_control`, `deferred_tools`, `stop_server_tools_when` | — | — | Shared fields (5.2). Not in this schema: `debug`, `image_config`, `prompt_cache_options`, `modalities`, `reasoning`. |

#### Messages (`MessagesMessageParam`)

| Field | Type | Notes |
| - | - | - |
| `role` | `user`, `assistant`, `system` | **required**. `system` messages may appear mid-conversation (OpenRouter extension) — used for effort changes and tool additions/removals. |
| `content` | string, or array of content blocks | **required** |
| `output_config` | `{ effort?: low / medium / high / xhigh / max / null }` or null | Per-message effort change (put on a content-less `system` message, e.g. `{"role":"system","content":[],"output_config":{"effort":"low"}}`, directly before the user turn; equivalent to Chat `configuration_update`). |
| `clear_at` | `next_user_message` / `never` / null | Undocumented in the spec beyond the enum (lifetime of a mid-conversation system message). |

Content blocks accepted in requests:

| `type` | Fields | Notes |
| - | - | - |
| `text` | `text` (req), `cache_control?`, `citations?` (array of `char_location`, `page_location`, `content_block_location`, `web_search_result_location`, `search_result_location` objects) | — |
| `image` | `source` (req): `{type:"base64", media_type: image/jpeg / image/png / image/gif / image/webp, data}`, `{type:"url", url}`, or `{type:"file", file_id}`; `cache_control?` | `file_id` = OpenRouter file id (e.g. `or_file_...`, [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs)). |
| `document` | `source` (req): `{type:"base64", media_type:"application/pdf", data}`, `{type:"text", media_type:"text/plain", data}`, `{type:"content", content: string or text/image blocks}`, `{type:"url", url}` (PDF), or `{type:"file", file_id}`; `title?`, `context?`, `citations?: {enabled}`, `cache_control?` | PDFs and documents. |
| `tool_use` | `id`, `name`, `input` (object), `cache_control?` | Replayed assistant tool call. |
| `tool_result` | `tool_use_id` (req), `content?` (string, or array of `text`, `image`, `tool_reference` `{tool_name}`, `search_result`, `document`), `is_error?`, `cache_control?` | Your tool result (in a `user` message). |
| `thinking` | `thinking`, `signature` (both req) | Replay unchanged. |
| `redacted_thinking` | `data` (req) | Replay unchanged. |
| `server_tool_use` | `id`, `name`, `input`, `cache_control?` | Replayed server tool call. |
| `web_search_tool_result` | `tool_use_id`, `content`: array of `{type:"web_search_result", url, title, encrypted_content, page_age?}` or `{type:"web_search_tool_result_error", error_code: invalid_tool_input / unavailable / max_uses_exceeded / too_many_requests / query_too_long / request_too_large}`, `cache_control?` | — |
| `search_result` | `source`, `title`, `content` (text blocks) — req; `citations?: {enabled}`, `cache_control?` | Your own search results with citations. |
| `compaction` | `content` (string or null, req), `encrypted_content?`, `cache_control?` | Replay of a compaction block. |
| `advisor_tool_result` | `tool_use_id`, `content` (object) | Replay of an `advisor_20260301` result. |
| `tool_addition` | `tool` (req): `{type:"tool_reference", name}` (a tool declared with `defer_loading: true`), `{type:"mcp_tool_reference", name, server_name}`, `{type:"mcp_toolset_reference", server_name}`, or `{type:"tool_definition", definition: <Anthropic tool>}`; `cache_control?` | Add a tool mid-conversation without invalidating the cache. **Only in `role: "system"` messages; not on Claude Sonnet 5 or models older than Claude Opus 4.8.** |
| `tool_removal` | `tool` (req): `tool_reference`, `mcp_tool_reference`, or `mcp_toolset_reference`; `cache_control?` | Remove a tool mid-conversation; same restrictions. |
| `openrouter_shell_tool_result`, `openrouter_bash_tool_result` | `tool_use_id`, `content` (object), `container_id?`, `files?` | Replays of OpenRouter sandbox results; accepted and **dropped before the provider request** (Anthropic has no equivalent). |
| `openrouter_tool_search_result` | `tool_use_id`, `content` (object) | Router-owned deferred-tool discovery result for continuation. |

#### `thinking` (one of)

| Variant | Fields | Unified equivalent |
| - | - | - |
| `{ type: "enabled", budget_tokens }` | `budget_tokens` (req int), `display?`, `block_binding?` | `reasoning: { max_tokens: budget_tokens }` |
| `{ type: "adaptive" }` | `display?`, `block_binding?` | `reasoning: { enabled: true }` (effort left to the model unless `output_config.effort` is set) |
| `{ type: "disabled" }` | — | `reasoning: { enabled: false }` (wins even if `output_config.effort` is present; Claude still receives the effort) |
| `{ type: "between_tools" }` | — | (no description in the spec) |

- `display`: `summarized` (OpenRouter's default for Claude models that support it), `omitted`, `updates`, or null. Only changes the visible trace, not billing.
- `block_binding`: `{ prefix_mismatch_behavior: "error" / "drop_block" / null, mismatch_behavior: same (**DEPRECATED alias**; send only one) }`.
- `output_config.effort` takes precedence over `adaptive`. With `enabled` + `budget_tokens` **and** `output_config.effort`, Claude receives both, but other models receive only the effort (the budget is not forwarded).

#### `output_config` (`MessagesOutputConfig`)

| Field | Type | Notes |
| - | - | - |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max`, null | Maps to `reasoning.effort` (never to OpenAI `text.verbosity`). Claude: `minimal` → `low`, `none` rejected. |
| `format` | `{ type: "json_schema", schema }` or null | Structured output. |
| `task_budget` | `{ type: "tokens", total (req, ≥20000), remaining? (≥0 or null) }` or null | Advisory countdown for an agentic turn; not a hard cap. |

#### `context_management.edits[]`

| `type` | Fields |
| - | - |
| `clear_tool_uses_20250919` | `trigger?` (`{type:"input_tokens", value}` or `{type:"tool_uses", value}`), `keep?` (`{type:"tool_uses", value}`), `clear_at_least?` (`{type:"input_tokens", value}`), `clear_tool_inputs?` (boolean, string[], or null), `exclude_tools?` (string[] or null) |
| `clear_thinking_20251015` | `keep?` (`{type:"thinking_turns", value}`, `{type:"all"}`, or `"all"`) |
| `compact_20260112` | `trigger?` (`{type:"input_tokens", value}` or null), `instructions?` (string or null), `pause_after_compaction?` (boolean) |

Applied edits are reported in the response `context_management.applied_edits[]` (`{type, ...}`).

#### Tools

| Tool | Shape |
| - | - |
| Custom (client) tool | `{ name (req), input_schema (req: {type:"object", properties?, required?}), description?, type?: "custom", strict?, defer_loading?, cache_control? }` |
| Bash | `{ type: "bash_20250124", name: "bash", cache_control? }` |
| Text editor | `{ type: "text_editor_20250124", name: "str_replace_editor", cache_control? }` |
| Web search | `{ type: "web_search_20250305", name: "web_search", allowed_domains?, blocked_domains?, max_uses?, user_location? ({type:"approximate", city, country, region, timezone}), cache_control? }` |
| Web search (2026) | `{ type: "web_search_20260209", name: "web_search", ...same, allowed_callers? (direct, code_execution_20250825, code_execution_20260120) }` |
| Advisor | `{ type: "advisor_20260301", name: "advisor", model (req), max_uses?, caching? (cache directive or null), allowed_callers?, defer_loading?, cache_control? }` |
| Tool search | `{ type: "tool_search_tool_bm25_20251119" or "tool_search_tool_bm25", name: "tool_search_tool_bm25", ... }` and `{ type: "tool_search_tool_regex_20251119" or "tool_search_tool_regex", name: "tool_search_tool_regex", ... }` (each with `allowed_callers?`, `defer_loading?`, `strict?`, `cache_control?`) |
| OpenRouter server tools | `openrouter:bash`, `openrouter:datetime`, `openrouter:image_generation`, `openrouter:experimental__search_models`, `openrouter:web_fetch`, `openrouter:web_search`, `openrouter:shell`, `openrouter:tool_search` (parameters in 5.2) |
| Generic | `{ type: "<string>", ... }` (any other tool type) |

`tool_choice`: `{type:"auto", disable_parallel_tool_use?}`, `{type:"any", disable_parallel_tool_use?}`, `{type:"none"}`, `{type:"tool", name, disable_parallel_tool_use?}`.

#### Response body (`MessagesResult`, `type: "message"`)

| Field | Type | Req | Description |
| - | - | - | - |
| `id` | string | yes | Message id |
| `type` | `"message"` | yes | — |
| `role` | `"assistant"` | yes | — |
| `model` | string | yes | Model used |
| `content` | array of content blocks | yes | Below |
| `stop_reason` | `end_turn`, `max_tokens`, `model_context_window_exceeded`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `compaction`, null | yes | Why generation stopped |
| `stop_sequence` | string or null | yes | Matched stop sequence |
| `stop_details` | `{ type: "refusal", category: cyber / bio / frontier_llm / reasoning_extraction / general_harms / null, explanation: string or null }` or null | yes | Refusal details |
| `container` | `{ id, expires_at, skills?: [{skill_id, type: anthropic / custom, version}] or null }` or null | yes | Code-execution container |
| `usage` | object | yes | Below |
| `input_transformations` | array of `{ type, path?, reason? }` or null | — | Server-side input changes (e.g. `{type:"thinking_dropped", path:"messages.1.content.0", reason:"prefix_binding_mismatch"}`) |
| `context_management` | `{ applied_edits: [{type, ...}] }` or null | — | Context edits applied |
| `provider` | string | — | Serving provider |
| `safeguard_results` | array of `{ type, status: {type, ...} }` or null | — | Safeguard / Armor verdicts |
| `openrouter_metadata` | object | — | With metadata header (5.3) |

Response content blocks (`ORAnthropicContentBlock`): `text` (`text`, `citations` (req, array or null): `char_location` / `page_location` / `content_block_location` (each with `cited_text`, `document_index`, `document_title`, index ranges, `file_id`), `web_search_result_location` (`cited_text`, `url`, `title`, `encrypted_index`), `search_result_location` (`cited_text`, `source`, `title`, `search_result_index`, `start_block_index`, `end_block_index`)); `tool_use` (`id`, `name`, `input`, `caller` (req: `{type:"direct"}` or a code-execution caller)); `thinking` (`thinking`, `signature`); `redacted_thinking` (`data`); `server_tool_use` (`id`, `name`, `input`, `caller?`); `web_search_tool_result`; `web_fetch_tool_result` (`content`: `{type:"web_fetch_result", url, content: document, retrieved_at}` or error); `code_execution_tool_result`; `bash_code_execution_tool_result`; `text_editor_code_execution_tool_result`; `tool_search_tool_result` (`content.tool_references[]`); `container_upload` (`file_id`); `compaction` (`content`, `encrypted_content?`); `advisor_tool_result`; `openrouter_shell_tool_result` / `openrouter_bash_tool_result` (`content`, `container_id?`, `files?` container file citations); `openrouter_tool_search_result`.

`usage`:

| Field | Type | Notes |
| - | - | - |
| `input_tokens`, `output_tokens` | int (req) | No `total_tokens` |
| `cache_creation_input_tokens`, `cache_read_input_tokens` | int or null (req) | Cache write / read tokens |
| `cache_creation` | `{ ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }` or null (req) | Write tokens by TTL |
| `output_tokens_details` | `{ thinking_tokens }` or null (req) | Reasoning tokens |
| `server_tool_use` | `{ web_search_requests, web_fetch_requests, tool_calls_requested?, tool_calls_executed? }` or null (req) | — |
| `service_tier` | `standard`, `priority`, `batch`, null (req) | Base tier is reported as **`standard`** here (`default` on the other APIs) |
| `inference_geo` | string or null (req) | — |
| `speed` | `fast` / `standard` / null | — |
| `iterations` | array of `{ type: "message" / "compaction" / "advisor_message" / other, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cache_creation, model? }` | Per-iteration usage (compaction, advisor calls) |
| `cost`, `cost_details` (prompt/completions naming), `is_byok`, `deferred_tools_details` | — | OpenRouter extensions (5.3) |

Example (spec):

```json
{
  "id": "msg_abc123",
  "type": "message",
  "role": "assistant",
  "model": "anthropic/claude-sonnet-4",
  "container": null,
  "content": [{ "type": "text", "text": "I'm doing well, thank you for asking! How can I help you today?", "citations": [] }],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "stop_details": null,
  "usage": {
    "input_tokens": 12, "output_tokens": 18,
    "cache_creation": null, "cache_creation_input_tokens": null, "cache_read_input_tokens": null,
    "inference_geo": null, "output_tokens_details": null, "server_tool_use": null, "service_tier": "standard"
  }
}
```

#### Streaming events

Each SSE frame has an `event:` line naming the type and a `data:` JSON payload with the same `type` (`MessagesStreamingResponse = { event, data }`). The spec declares no `[DONE]` sentinel; the stream ends after `message_stop` (or an `error` event).

| Event | Payload |
| - | - |
| `message_start` | `message`: full message shell (`id`, `type`, `role`, `model`, `content: []`, `stop_reason: null`, `stop_sequence`, `stop_details`, `container`, `usage` incl. `iterations?`/`speed?`, `provider?`, `input_transformations?`) |
| `content_block_start` | `index`, `content_block` (any response content block, initially empty, e.g. `{type:"text", text:"", citations:[]}`) |
| `content_block_delta` | `index`, `delta`: `{type:"text_delta", text}`, `{type:"input_json_delta", partial_json}` (concatenate per block, parse at `content_block_stop`), `{type:"thinking_delta", thinking}`, `{type:"signature_delta", signature}`, `{type:"citations_delta", citation}`, `{type:"compaction_delta", content, encrypted_content?}` |
| `content_block_stop` | `index` |
| `message_delta` | `delta`: `{ stop_reason, stop_sequence, stop_details, container, safeguard_results? }`; `usage`: `{ output_tokens (req), input_tokens, cache_creation_input_tokens, cache_read_input_tokens, cache_creation?, output_tokens_details, server_tool_use, iterations? }` — usage is reported here |
| `message_stop` | `openrouter_metadata?` (with metadata header) |
| `ping` | keep-alive |
| `error` | `error: { type, message, error_type? }`, `openrouter_metadata?` — mid-stream failure (e.g. `{"type":"overloaded_error","message":"Provider is temporarily overloaded","error_type":"provider_overloaded"}`) |

#### Errors (`AnthropicMessagesErrorResponse`)

```json
{
  "type": "error",
  "error": { "type": "authentication_error", "message": "Invalid credentials", "error_type": "authentication" },
  "request_id": null
}
```

Fields: `type: "error"` (req), `error.type` (req: `invalid_request_error`, `authentication_error`, `permission_error`, `not_found_error`, `rate_limit_error`, `api_error`, `overloaded_error`, `billing_error`, `timeout_error`), `error.message` (req), `error.error_type` (canonical `ApiErrorType`), `request_id` (req; `null` for pre-router errors such as auth failures, a `gen-...` id otherwise), `metadata?`, `openrouter_metadata?` (e.g. guardrail `pipeline`). Statuses in the spec: 400 invalid request, 401 authentication, 403 forbidden (incl. guardrail blocks, `permission_error`), 404 not found (e.g. `Model not found`), 429 rate limit, 500 API error, 503 and 529 overloaded.

| Internal `error_type` | `error.type` |
| - | - |
| `authentication` | `authentication_error` |
| `permission_denied` | `permission_error` |
| `payment_required` | `billing_error` |
| `not_found`, `image_not_found` | `not_found_error` |
| `rate_limit_exceeded` | `rate_limit_error` |
| `provider_overloaded`, `timeout` | `overloaded_error` |
| `context_length_exceeded`, `content_policy_violation`, `refusal`, `invalid_request`, ... | `invalid_request_error` |
| `provider_unavailable`, `server`, `unmapped`, ... | `api_error` |

#### Examples

curl, non-streaming (service-tiers guide; note a non-Anthropic model through the Anthropic format):

```bash
curl https://openrouter.ai/api/v1/messages \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5",
    "service_tier": "flex",
    "max_tokens": 1024,
    "messages": [
      { "role": "user", "content": "What is the meaning of life?" }
    ]
  }'
```

curl, streaming with extended thinking:

```bash
curl -N https://openrouter.ai/api/v1/messages \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "max_tokens": 4096,
    "stream": true,
    "thinking": { "type": "enabled", "budget_tokens": 2048 },
    "system": "You are a concise assistant.",
    "messages": [{ "role": "user", "content": "Explain SSE in two sentences." }]
  }'
```

TypeScript with the Anthropic SDK (`@anthropic-ai/sdk`), non-streaming with OpenRouter `fallbacks` (model-fallbacks guide):

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  baseURL: "https://openrouter.ai/api",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const message = await anthropic.beta.messages.create({
  model: "anthropic/claude-sonnet-4.5",
  max_tokens: 1024,
  fallbacks: [{ model: "anthropic/claude-opus-4.1" }],
  messages: [{ role: "user", content: "What is the meaning of life?" }],
});
console.log(message.content);
```

TypeScript streaming (Anthropic SDK: `stream: true` returns an async iterable of the events above):

```typescript
const stream = await anthropic.messages.create({
  model: "anthropic/claude-sonnet-4.5",
  max_tokens: 1024,
  stream: true,
  messages: [{ role: "user", content: "Write a haiku about routers." }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
  if (event.type === "message_delta") console.log("\nstop:", event.delta.stop_reason, event.usage);
}
```

Tool-use round trip (shapes from the schema): the model answers with `stop_reason: "tool_use"` and a `tool_use` block; send the assistant content back unchanged (including any `thinking` blocks) and answer in a `user` message with `tool_result`, repeating `tools`:

```json
{
  "model": "anthropic/claude-sonnet-4.5",
  "max_tokens": 1024,
  "tools": [{ "name": "get_weather", "description": "Get the current weather for a city.",
    "input_schema": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] } }],
  "messages": [
    { "role": "user", "content": "What's the weather in Boston?" },
    { "role": "assistant", "content": [
      { "type": "tool_use", "id": "toolu_01abc", "name": "get_weather", "input": { "city": "Boston" } } ] },
    { "role": "user", "content": [
      { "type": "tool_result", "tool_use_id": "toolu_01abc", "content": "{\"temperature_f\":62,\"conditions\":\"cloudy\"}" } ] }
  ]
}
```

Mid-conversation effort change (reasoning guide):

```json
{
  "model": "anthropic/claude-fable-5.1",
  "max_tokens": 4096,
  "output_config": { "effort": "high" },
  "messages": [
    { "role": "user", "content": "Plan the migration." },
    { "role": "assistant", "content": "Here's the plan: ..." },
    { "role": "system", "content": [], "output_config": { "effort": "low" } },
    { "role": "user", "content": "Now rename the config file." }
  ]
}
```

Sources: https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/guides/routing/model-fallbacks, https://openrouter.ai/docs/guides/features/service-tiers, https://openrouter.ai/docs/guides/features/router-metadata, https://openrouter.ai/docs/guides/community/anthropic-agent-sdk

### 5.7 Format comparison and choosing an endpoint

#### Field mapping across the three formats

| Concern | Chat Completions | Responses | Anthropic Messages |
| - | - | - | - |
| Path / operationId | `/chat/completions` / `sendChatCompletionRequest` | `/responses` / `createResponses` | `/messages` / `createMessages` |
| OpenRouter SDK | `chat.send` | `responses.send` (`beta.responses.send` deprecated) | none (use Anthropic SDK, base URL `https://openrouter.ai/api`) |
| Required body fields | `messages` | none in schema (send `input`) | `model`, `messages` |
| Conversation | `messages[]` with `role` | `input` string or items | `messages[]` with `role` + content blocks |
| System prompt | `system` / `developer` message | `instructions`, or `system` / `developer` message item | top-level `system` (string or text blocks); mid-conversation `role: "system"` messages allowed |
| Output limit | `max_completion_tokens` (`max_tokens` deprecated) | `max_output_tokens` | `max_tokens` |
| Stop sequences | `stop` (≤4) | `stop` (≤4) | `stop_sequences` |
| Sampling | `temperature`, `top_p`, `top_k`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `min_p`, `top_a`, `seed`, `logit_bias`, `logprobs`, `top_logprobs` | `temperature`, `top_p`, `top_k`, `frequency_penalty`, `presence_penalty`, `top_logprobs` | `temperature`, `top_p`, `top_k` |
| Structured output | `response_format` (`text`, `json_object`, `json_schema`, `grammar`, `python`) | `text.format` (`text`, `json_object`, `json_schema`) | `output_config.format` (`json_schema`) |
| Verbosity | `verbosity` (guide-documented) | `text.verbosity` | — (`output_config.effort` maps to reasoning effort only) |
| Reasoning control | `reasoning {effort, max_tokens, summary}` (+ guide: `enabled`, `exclude`), `reasoning_effort` | `reasoning {effort, max_tokens, enabled, summary, mode, context}` | `thinking` + `output_config.effort` |
| Mid-conversation effort | `configuration_update` on an empty system/developer message | `configuration_update` input item | per-message `output_config.effort` on an empty system message |
| Reasoning output | `message.reasoning` + `reasoning_details[]` | `reasoning` output items (`summary`, `content`, `encrypted_content`, `signature`) | `thinking` / `redacted_thinking` blocks |
| Function tool definition | `{type:"function", function:{name, description, parameters, strict}}` | `{type:"function", name, description, parameters, strict}` | `{name, description, input_schema}` |
| Model tool call | `message.tool_calls[]` `{id, type, function:{name, arguments}}` (arguments = JSON string) | `function_call` item `{call_id, name, arguments}` (JSON string) | `tool_use` block `{id, name, input}` (object) |
| Tool result | `{role:"tool", tool_call_id, content}` | `{type:"function_call_output", call_id, output}` | `user` message with `{type:"tool_result", tool_use_id, content, is_error?}` |
| Force a tool | `{type:"function", function:{name}}` | `{type:"function", name}` | `{type:"tool", name}` |
| Require any tool | `"required"` | `"required"` | `{type:"any"}` |
| Disable parallel calls | `parallel_tool_calls: false` | `parallel_tool_calls: false` | `tool_choice.disable_parallel_tool_use: true` |
| Server-tool loop cap | `stop_server_tools_when` | `max_tool_calls` (default/max 30) or `stop_server_tools_when` | `stop_server_tools_when` |
| Output modalities | `modalities` text / image / audio (+ guide `audio`) | `modalities` text / image | — |
| End-user id | `user` | `safety_identifier` (recommended), `user` | `user`, `metadata.user_id` |
| Fallback models | `models` | `models` | `models` or `fallbacks` (≤3, not both) |
| Caching | `cache_control`, `prompt_cache_key`, `prompt_cache_options`, part-level `cache_control` / `prompt_cache_breakpoint` | same; `prompt_cache_breakpoint` on `input_text` | `cache_control` (top level and per block) |
| Debug echo | `debug.echo_upstream_body` (stream) | same, as `response.debug` event | — |
| Usage names | `prompt_tokens`, `completion_tokens`, `total_tokens` | `input_tokens`, `output_tokens`, `total_tokens` | `input_tokens`, `output_tokens` |
| Cache usage | `prompt_tokens_details.cached_tokens` / `cache_write_tokens` | `input_tokens_details.cached_tokens` / `cache_write_tokens` | `cache_read_input_tokens` / `cache_creation_input_tokens` (+ `cache_creation` by TTL) |
| Reasoning tokens | `completion_tokens_details.reasoning_tokens` | `output_tokens_details.reasoning_tokens` | `output_tokens_details.thinking_tokens` |
| Cost breakdown | `cost_details.upstream_inference_prompt_cost` / `_completions_cost` | `cost_details.upstream_inference_input_cost` / `_output_cost` | prompt / completions naming |
| Tier used | top-level `service_tier` (`default`, ...) | top-level `service_tier` | `usage.service_tier` (`standard`, ...) |
| Completion signal | `finish_reason`: `stop`, `length`, `tool_calls`, `content_filter`, `error` | `status` + `incomplete_details.reason` (`max_output_tokens`, `content_filter`) | `stop_reason`: `end_turn`, `max_tokens`, `tool_use`, `stop_sequence`, `pause_turn`, `refusal`, `compaction`, `model_context_window_exceeded` |
| Stream framing | `data:` chunks, `[DONE]` | typed `data:` events with `sequence_number`, `[DONE]` | `event:` + `data:` Anthropic events, ends at `message_stop` |
| Usage in stream | extra final chunk before `[DONE]` | `response.completed` | `message_delta` |
| `openrouter_metadata` in stream | final chunk | final event | `message_stop` |
| Mid-stream error | chunk with top-level `error` + `finish_reason: "error"` | `response.failed` (or `error` event) | `error` event |
| HTTP error envelope | `{error:{code (int), message, metadata}}` | same; in-body `error.code` string + `error_type` | `{type:"error", error:{type, message, error_type}, request_id}` |
| Canonical error type location | `error.metadata.error_type` | top-level `error_type` | `error.error_type` |
| State | stateless | stateless (`store: false` only; `previous_response_id` → 400) | stateless |

#### Feature availability (by schema)

| Feature | Chat | Responses | Messages |
| - | - | - | - |
| Plugins (all 14 ids) | yes | yes | yes |
| `provider`, `models`, `session_id`, `trace`, `service_tier`, `stop_server_tools_when`, `deferred_tools` | yes | yes | yes |
| `openrouter:web_search`, `web_fetch`, `datetime`, `image_generation`, `bash`, `experimental__search_models` | yes | yes | yes |
| `openrouter:shell`, `openrouter:tool_search` | generic envelope only | yes | yes |
| `openrouter:files`, `fusion`, `advisor`, `subagent` | yes | yes | — |
| `openrouter:apply_patch`, `openrouter:mcp`, OpenAI hosted tools (`file_search`, `code_interpreter`, `computer_use_preview`, `mcp`, `image_generation`), `custom`/`namespace` tools | — | yes | — |
| Anthropic native tools (`bash_20250124`, `text_editor_20250124`, `web_search_2025xxxx`, `advisor_20260301`, tool search) | — | — | yes |
| Audio output | yes (stream only, guide-documented `audio`) | — | — |
| Grammar / Python response formats | yes | — | — |
| `logprobs` | yes | `top_logprobs` → `output_text.logprobs` | — |
| Context editing / compaction | — | `compaction_trigger` item | `context_management` edits, `compaction` blocks |
| Mid-conversation tool add/remove | — | `additional_tools` item | `tool_addition` / `tool_removal` in system messages |
| Armor `output_mode` | `text` | `text`, `custom_item` | `text`, `claude_code_compatibility` |
| Generated OpenRouter SDK method | yes | yes | no |

#### Which one to use

- **Chat Completions** — maximum ecosystem compatibility (OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"`, Vercel AI SDK, LangChain, most frameworks; [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)), simple message arrays, the widest sampling-parameter set (`min_p`, `top_a`, `repetition_penalty`, `logit_bias`, logprobs), audio output, grammar/Python formats, and `chat.send` in all three OpenRouter SDKs. Reasoning round-trips via `reasoning_details`.
- **Responses** — the item model is best for agents and tool-heavy apps: explicit `function_call`/`function_call_output` pairing by `call_id`, reasoning items with `encrypted_content`/`signature`, every server-tool call surfaced as its own typed output item, MCP and apply-patch flows, typed streaming events with `sequence_number`, and the richest server-tool catalog (`openrouter:mcp`, `apply_patch`, subagent inheritance). The OpenRouter docs present it first, and the Agent SDK (`@openrouter/agent`, [§2](02-agent-sdk.md#2-agent-sdk-openrouteragent)) is built on it. It is stateless, so you resend history.
- **Anthropic Messages** — when the client already speaks Anthropic (Anthropic SDK, Claude Code, Claude Agent SDK): native `thinking` blocks and signatures, `cache_control` on blocks, `context_management`, Anthropic server tools, `fallbacks`, `speed`, safeguards/Armor in Claude Code compatibility mode. Works with non-Claude models too, but there is no OpenRouter SDK method, and `debug`, `image_config`, `modalities` are not available.
- Switching formats does not change routing, pricing, or plugin behavior; it changes only request/response shapes. Pick one format per conversation — the replay items (reasoning signatures, tool ids) are format-specific.

Sources: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion, https://openrouter.ai/docs/api/api-reference/responses/create-a-response, https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/guides/features/tool-calling, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/guides/features/service-tiers, https://openrouter.ai/docs/agent-sdk/call-model/overview

### 5.8 Gotchas and common mistakes

**All endpoints**

- Mid-stream failures arrive with HTTP **200**: chat → chunk with `error` and `finish_reason: "error"`; responses → `response.failed` (also handle `error` events); messages → `error` event. The error can be the only event in the stream. Errors before the stream is committed are ordinary JSON with an HTTP status — check `response.ok` before parsing SSE.
- Skip SSE comment lines (`: OPENROUTER PROCESSING`) before `JSON.parse`; buffer partial lines across reads (chunks can split a JSON line).
- Reasoning tokens share the output budget (`max_completion_tokens`/`max_tokens`/`max_output_tokens`) on most providers: a small limit yields empty content with `finish_reason: "length"` / `status: "incomplete"` while reasoning is still billed. For Anthropic budgets the output limit must be strictly greater than the reasoning budget.
- `reasoning.effort` and `reasoning.max_tokens` are mutually exclusive (400). On Chat, `reasoning_effort` must match `reasoning.effort` if both are sent.
- Always resend `tools` in every turn of a tool loop, and replay reasoning (`reasoning_details`, `reasoning` items, `thinking` blocks) **unchanged and in order** — rearranging or editing them breaks reasoning models.
- Tool arguments are a **JSON string** on Chat (`function.arguments`) and Responses (`arguments`), but an **object** on Messages (`input`). Function names: max 64 chars, `[a-zA-Z0-9_-]` (Chat spec).
- `provider.sort` disables load balancing; `route` is deprecated (use `provider.sort.partition`); `provider.ignore`/`only` merge with account-wide settings rather than replacing them.
- `session_id` (≤256 chars) is a sticky routing key: requests in a session stick to one provider for cache hits. The body value overrides the `x-session-id` header.
- `debug.echo_upstream_body` works only with `stream: true` and can expose request content; never enable in production. It is not available on `/messages`.
- `X-OpenRouter-Metadata` must be exactly `enabled` (case-insensitive) — any other value silently means disabled.
- Deprecations to avoid in new code: `max_tokens` on Chat (use `max_completion_tokens`), `stream_options.include_usage` (no effect), `include_reasoning`, `route`, `input_video` content part (use `video_url`), `pdf-text` engine (redirected to `cloudflare-ai`), `cost_quality_tradeoff` (use `cost_tier`), `X-OpenRouter-Experimental-Metadata`, `beta.responses`, the `web` plugin and `:online` variant (use the `openrouter:web_search` server tool), `thinking.block_binding.mismatch_behavior`. There is no `transforms` field any more — use the `context-compression` plugin.
- `configuration_update` / per-message effort: place directly before the user turn, keep it at the same position in later requests, never two adjacent, not with `reasoning.mode: "pro"`, not on the Batch API; models that do not support it return 400 rather than silently dropping it.
- `defer_loading`: if you declare `openrouter:tool_search` yourself, keep at least one tool non-deferred.

**Chat Completions**

- The final usage chunk has a **non-empty** `choices` array that repeats `finish_reason`; do not treat it as a second terminal event, and do not assume `choices` is empty when `usage` is present.
- Usage is always included; you do not need `stream_options`.
- `top_logprobs` requires `logprobs: true`; `stop` accepts at most 4 sequences.
- Audio output needs `modalities: ["text","audio"]`, the guide-documented `audio` object, and `stream: true`.
- The spec's `ChatResult`/`ChatChoice` do not declare `native_finish_reason`, `choices[].error`, `message.annotations`, or `provider`, but the prose docs show them in responses — parse them defensively (typed SDK models may drop them).
- Guide-documented parameters missing from `ChatRequest` (`audio`, `verbosity`, `web_search_options`, `include_reasoning`, `reasoning.enabled`, `reasoning.exclude`, `preset`) may need an escape hatch in typed SDKs (e.g. `extra_body` in the OpenAI SDK).
- Image `detail: "original"` is an OpenRouter extension (downgraded to `high` where unsupported). `system`/`developer` messages accept only text parts.
- Use `message.reasoning_details` (not just `reasoning`) when replaying for models that return encrypted or summarized reasoning; `reasoning_content` is accepted as an alias of `reasoning`.

**Responses**

- Stateless: `store: true` and `previous_response_id` are rejected (400). Resend everything; replayed assistant `message` items need `id` and `status` (basic-usage guide) and should keep `phase` for codex-class models.
- `function_call_output` is matched by `call_id`, not `id` (`id` optional).
- `reasoning.exclude` is ignored; filter `reasoning` items client-side if unwanted.
- `max_tool_calls` defaults to and caps at 30; `stop_server_tools_when` overrides it.
- `tool_choice` for a function uses top-level `name` (`{type:"function", name}`), unlike Chat's nested `function.name`.
- `usage.cost_details` uses `upstream_inference_input_cost` / `upstream_inference_output_cost` (Chat/Messages use `..._prompt_cost` / `..._completions_cost`).
- The basic-usage page's sample stream uses `response.content_part.delta` and `response.done`; the spec uses `response.output_text.delta` and `response.completed`. Code to the spec.
- `access_programs.cyber` other than `standard` works only on BYOK with an enrolled OpenAI key; otherwise 400.
- `modalities` supports only `text` and `image`; there is no `audio` parameter on Responses.
- `openrouter:apply_patch` and subagent `inherit_functions`/`inherited_function_names` are Responses-only (others return 400).

**Anthropic Messages**

- No method in the OpenRouter SDKs (`x-speakeasy-ignore`). Point the Anthropic SDK at `https://openrouter.ai/api` (not `/api/v1`). For Claude Code / Agent SDK set `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and an explicitly empty `ANTHROPIC_API_KEY`.
- `fallbacks`: max 3 entries, `model` only, and never together with `models` — each violation is a 400.
- `service_tier` comes back inside `usage` and the base tier is `standard` (other APIs: top-level and `default`). `speed: "fast"` is reported as `service_tier: "priority"`.
- Error bodies use the Anthropic envelope; read `error.error_type` for the precise cause (native `error.type` is lossy). `request_id` is `null` for pre-router failures.
- `tool_addition` / `tool_removal` blocks are only valid in `role: "system"` messages and not on Claude Sonnet 5 or models older than Claude Opus 4.8.
- `openrouter_bash_tool_result` / `openrouter_shell_tool_result` blocks are accepted on replay but dropped before the provider call.
- `thinking: {type:"disabled"}` turns reasoning off even when `output_config.effort` is set; `output_config.effort` overrides `adaptive`; with both `budget_tokens` and `effort`, non-Claude models only receive the effort.
- The streaming spec declares no `[DONE]` sentinel; stop at `message_stop`. Accumulate `input_json_delta.partial_json` per block index and parse at `content_block_stop`.

Sources: https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/api_reference/parameters, https://openrouter.ai/docs/api_reference/responses/overview, https://openrouter.ai/docs/api_reference/responses/basic-usage, https://openrouter.ai/docs/api_reference/responses/tool-calling, https://openrouter.ai/docs/api_reference/responses/web-search, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/guides/features/tool-calling, https://openrouter.ai/docs/guides/routing/model-fallbacks, https://openrouter.ai/docs/guides/features/service-tiers, https://openrouter.ai/docs/guides/features/router-metadata, https://openrouter.ai/docs/guides/overview/multimodal/audio, https://openrouter.ai/docs/guides/community/anthropic-agent-sdk, https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion, https://openrouter.ai/docs/api/api-reference/responses/create-a-response, https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message
