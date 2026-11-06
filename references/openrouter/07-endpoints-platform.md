# OpenRouter Reference — 7. Endpoint reference — account & platform data

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 06-endpoints-other-inference.md](06-endpoints-other-inference.md) · [Next: 08-endpoints-governance.md →](08-endpoints-governance.md)

## 7. Endpoint reference — account & platform data

This section documents every operation in the OpenRouter OpenAPI spec tagged Models, Endpoints, Providers, Generations, Credits, API Keys, Analytics, OAuth, BYOK, Benchmarks, Classifications, Datasets, External Users, and Organization (43 operations). These cover catalog discovery, per-request stats, keys and credits, usage analytics, auth flows, and public datasets. Inference endpoints are in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)/[§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs); governance resources (guardrails, workspaces, presets, SCIM, …) are in [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise). Concept guides for OAuth, BYOK, management keys, and workload identity are in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy).

### 7.1 Conventions for this section

**Base URL:** `https://openrouter.ai/api/v1` (all paths below are relative to it). Regional hosts `https://eu.openrouter.ai/api/v1` and `https://us.openrouter.ai/api/v1` exist for in-region routing (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). `GET /models/user` and `GET /models` filter results to region-eligible models when called on a regional host.

**Auth kinds used in this section**

| Label | Meaning | Header |
| - | - | - |
| **Public / optional** | Works without a key. Docs show unauthenticated `curl` calls. A key may change the result (e.g. filtered catalog, performance stats). | none, or `Authorization: Bearer <api key>` |
| **API key** | Any regular OpenRouter API key (the same key used for inference). | `Authorization: Bearer $OPENROUTER_API_KEY` |
| **Management key** | A [management API key](https://openrouter.ai/settings/management-keys). Regular keys are rejected. Management keys cannot call inference endpoints. | `Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY` |
| **None (credential in body)** | OAuth exchange endpoints. The credential is the code or JWT in the body. | none |

The spec declares one global security scheme (`apiKey`: HTTP bearer). Per-operation overrides: `POST /credits/coinbase` has `security: []`, and `GET /models/user` declares the `bearer` scheme explicitly (the TS SDK takes it as a per-call `bearer` option). Short-lived access tokens from `POST /oauth/token` work wherever the targeted key works. A `management`-scope token is accepted on management routes, an `inference`-scope token on inference routes.

**Response envelope:** almost every success body is `{"data": ...}`. List endpoints add `total_count` and/or `links`. Exceptions: `DELETE /keys/{hash}` and `DELETE /byok/{id}` return `{"deleted": true}`, `POST /auth/keys` returns `{"key", "user_id"}`, `/oauth/*` return RFC-shaped bodies, and `DELETE /external-users/{user}` returns `204` with no body.

**Error body** (all `*Response` error schemas such as `BadRequestResponse`, `UnauthorizedResponse`, `ForbiddenResponse`, `NotFoundResponse`, `ConflictResponse`, `GoneResponse`, `TooManyRequestsResponse`, `InternalServerResponse`):

```json
{
  "error": { "code": 400, "message": "Invalid request parameters", "metadata": null },
  "openrouter_metadata": null,
  "user_id": null
}
```

`error.code` (int, required), `error.message` (string, required), `error.metadata` (object|null, optional), `openrouter_metadata` (object|null, optional), `user_id` (string|null, optional). The OAuth token endpoint uses RFC 6749 `{error, error_description}` instead ([§7.9](#79-oauth-pkce-key-exchange-workload-identity-token-exchange-jwks)). See [§4](04-api-fundamentals.md#4-api-fundamentals) for general error handling.

**Pagination styles**

| Style | Endpoints |
| - | - |
| Opt-in `offset` + `limit`. Full list when both are omitted. `limit` default 500, max 1000. `links.next` gives the next page. | `GET /models`, `GET /models/user` |
| `offset` + `limit` (default 50, max 100) + `total_count` | `GET /byok`, `GET /external-users`, `GET /organization/members` |
| `offset` only, 100 per page | `GET /keys` |
| `offset` (0–100) + `limit` (1–100, default 50) | `GET /datasets/app-rankings` |
| `offset` (0–5000) + `limit` (1–500, default 100) | `GET /datasets/session-cost` |
| `max_results` cap only | `GET /benchmarks` |
| `limit` / `group_limit` in body | `POST /analytics/query` |

**Formats:**
- Prices in catalog objects are **decimal strings in USD per unit**, usually per token (e.g. `"0.0000025"` = $2.50 per 1M tokens). The `/models` price filters (`min_price`, `max_price`, …) take **USD per 1M tokens** as numbers.
- Body timestamps such as `expires_at` (keys, auth codes) and `time_range.start/end` (analytics) **must include seconds** (`YYYY-MM-DDTHH:MM:SSZ`, fractional seconds allowed). Minute-precision timestamps are rejected.
- Dataset dates are `YYYY-MM-DD` UTC.

**SDK naming:** every operation except the deprecated Coinbase endpoint has a TS (`@openrouter/sdk`), Python (`openrouter`), and Go method. The operation map below lists them. In the TS SDK, request fields are the camelCase form of the wire names (`limit_reset` → `limitReset`, `generation_id` → `generationId`). Body-carrying calls wrap the body in a named property (`requestBody`, `createBYOKKeyRequest`, `submitGenerationFeedbackRequest`, …). Several list methods return async page iterators (`for await (const page of result)`). [§3](03-client-sdks.md#3-client-sdks-typescript-python-go) covers SDK setup, retries, and pagination helpers.

```typescript
import { OpenRouter } from "@openrouter/sdk";

// Regular key for public/API-key routes
const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" });
// Management key for management routes
const admin = new OpenRouter({ apiKey: process.env.OPENROUTER_MANAGEMENT_KEY ?? "" });
```

```python
import os
from openrouter import OpenRouter

with OpenRouter(api_key=os.environ["OPENROUTER_API_KEY"]) as open_router:
    res = open_router.models.get(author="openai", slug="gpt-4")
```

#### Operation map

| Method & path | operationId | Auth | TS SDK | Python SDK | Go SDK |
| - | - | - | - | - | - |
| `GET /models` | `getModels` | Public / optional | `models.list` | `models.list` | `Models.List` |
| `GET /models/user` | `listModelsUser` | API key (bearer) | `models.listForUser` | `models.list_for_user` | `Models.ListForUser` |
| `GET /models/count` | `listModelsCount` | Public / optional | `models.count` | `models.count` | `Models.Count` |
| `GET /model/{author}/{slug}` | `getModel` | Public / optional | `models.get` | `models.get` | `Models.Get` |
| `GET /models/{author}/{slug}/endpoints` | `listEndpoints` | Public / optional (perf stats need a key) | `endpoints.list` | `endpoints.list` | `Endpoints.List` |
| `GET /endpoints/zdr` | `listEndpointsZdr` | Public / optional | `endpoints.listZdrEndpoints` | `endpoints.list_zdr_endpoints` | `Endpoints.ListZdrEndpoints` |
| `GET /providers` | `listProviders` | Spec default bearer; only 200/500 documented | `providers.list` | `providers.list` | `Providers.List` |
| `GET /generation` | `getGeneration` | API key | `generations.getGeneration` | `generations.get_generation` | `Generations.GetGeneration` |
| `GET /generation/content` | `listGenerationContent` | API key | `generations.listGenerationContent` | `generations.list_generation_content` | `Generations.ListGenerationContent` |
| `POST /generation/feedback` | `submitGenerationFeedback` | Management key | `generations.submitFeedback` | `generations.submit_feedback` | `Generations.SubmitFeedback` |
| `GET /credits` | `getCredits` | Management key | `credits.getCredits` | `credits.get_credits` | `Credits.GetCredits` |
| `POST /credits/coinbase` | `createCoinbaseCharge` | none — **DEPRECATED, always 410** | (ignored by SDK generators) | — | — |
| `GET /key` | `getCurrentKey` | Any key (inspects itself) | `apiKeys.getCurrentKeyMetadata` | `api_keys.get_current_key_metadata` | `APIKeys.GetCurrentKeyMetadata` |
| `GET /keys` | `list` | Management key | `apiKeys.list` | `api_keys.list` | `APIKeys.List` |
| `POST /keys` | `createKeys` | Management key | `apiKeys.create` | `api_keys.create` | `APIKeys.Create` |
| `GET /keys/{hash}` | `getKey` | Management key | `apiKeys.get` | `api_keys.get` | `APIKeys.Get` |
| `PATCH /keys/{hash}` | `updateKeys` | Management key | `apiKeys.update` | `api_keys.update` | `APIKeys.Update` |
| `DELETE /keys/{hash}` | `deleteKeys` | Management key | `apiKeys.delete` | `api_keys.delete` | `APIKeys.Delete` |
| `GET /activity` | `getUserActivity` | Management key | `analytics.getUserActivity` | `analytics.get_user_activity` | `Analytics.GetUserActivity` |
| `GET /analytics/meta` | `getAnalyticsMeta` | Management key | `analytics.getAnalyticsMeta` | `analytics.get_analytics_meta` | `Analytics.GetAnalyticsMeta` |
| `POST /analytics/query` | `queryAnalytics` | Management key | `analytics.queryAnalytics` | `analytics.query_analytics` | `Analytics.QueryAnalytics` |
| `POST /auth/keys/code` | `createAuthKeysCode` | API key (bearer; 401 documented) | `oAuth.createAuthCode` | `o_auth.create_auth_code` | `OAuth.CreateAuthCode` |
| `POST /auth/keys` | `exchangeAuthCodeForAPIKey` | None (code + verifier in body) | `oAuth.exchangeAuthCodeForAPIKey` | `o_auth.exchange_auth_code_for_api_key` | `OAuth.ExchangeAuthCodeForAPIKey` |
| `POST /oauth/token` | `createOauthToken` | None (JWT in form body) | `oAuth.createOauthToken` | `o_auth.create_oauth_token` | `OAuth.CreateOauthToken` |
| `GET /oauth/jwks` | `listOauthJwks` | Public | `oAuth.listOauthJwks` | `o_auth.list_oauth_jwks` | `OAuth.ListOauthJwks` |
| `GET /byok` | `listBYOKKeys` | Management key | `byok.list` | `byok.list` | `BYOK.List` |
| `POST /byok` | `createBYOKKey` | Management key | `byok.create` | `byok.create` | `BYOK.Create` |
| `GET /byok/{id}` | `getBYOKKey` | Management key | `byok.get` | `byok.get` | `BYOK.Get` |
| `PATCH /byok/{id}` | `updateBYOKKey` | Management key | `byok.update` | `byok.update` | `BYOK.Update` |
| `DELETE /byok/{id}` | `deleteBYOKKey` | Management key | `byok.delete` | `byok.delete` | `BYOK.Delete` |
| `GET /benchmarks` | `getBenchmarks` | API key | `benchmarks.getBenchmarks` | `benchmarks.get_benchmarks` | `Benchmarks.GetBenchmarks` |
| `GET /classifications/task` | `getTaskClassifications` | API key | `classifications.getTaskClassifications` | `classifications.get_task_classifications` | `Classifications.GetTaskClassifications` |
| `GET /datasets/app-rankings` | `getAppRankings` | API key | `datasets.getAppRankings` | `datasets.get_app_rankings` | `Datasets.GetAppRankings` |
| `GET /datasets/rankings-daily` | `getRankingsDaily` | API key | `datasets.getRankingsDaily` | `datasets.get_rankings_daily` | `Datasets.GetRankingsDaily` |
| `GET /datasets/session-cost` | `getSessionCost` | API key (spec default) | `datasets.getSessionCost` | `datasets.get_session_cost` | `Datasets.GetSessionCost` |
| `GET /external-users` | `listExternalUsers` | Management key (org) | `externalUsers.list` | `external_users.list` | `ExternalUsers.List` |
| `POST /external-users` | `createExternalUser` | Management key (org) | `externalUsers.create` | `external_users.create` | `ExternalUsers.Create` |
| `GET /external-users/{user}` | `getExternalUser` | Management key (org) | `externalUsers.get` | `external_users.get` | `ExternalUsers.Get` |
| `PATCH /external-users/{user}` | `updateExternalUser` | Management key (org) | `externalUsers.update` | `external_users.update` | `ExternalUsers.Update` |
| `DELETE /external-users/{user}` | `deleteExternalUser` | Management key (org) | `externalUsers.delete` | `external_users.delete` | `ExternalUsers.Delete` |
| `GET /organization/members` | `listOrganizationMembers` | Management key (org) | `organization.listMembers` | `organization.list_members` | `Organization.ListMembers` |
| `GET /organization/settings` | `getOrganizationSettings` | Management key (org) | `organization.getSettings` | `organization.get_settings` | `Organization.GetSettings` |
| `PATCH /organization/settings` | `updateOrganizationSettings` | Management key (org) | `organization.updateSettings` | `organization.update_settings` | `Organization.UpdateSettings` |

The management-key column matches the guide's list of "Routes That Require a Management Key". `GET /generation` and `GET /generation/content` are not on that list, so regular keys work. The `403` text on `GET /generation` ("The management key does not have permission for this request") shows management keys are accepted there too.

Sources: https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties, https://openrouter.ai/docs/client-sdks/typescript/sdks/models/README, https://openrouter.ai/docs/client-sdks/python/sdks/models/README, https://openrouter.ai/docs/client-sdks/go/sdks/models/README, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/changelog

### 7.2 Models

#### `GET /models` — list all models and their properties

- **operationId:** `getModels` · **Auth:** public / optional · **SDK:** TS `models.list()` (async pages), Python `models.list()`, Go `Models.List`.
- Called with no key, it returns the public catalog. Called with an API key, the spec (OrganizationSettings description) says it "always returns only the models that key can use". The management-keys guide instead ties that filtering to the org setting `is_filtered_model_catalog_enabled` (see [§7.15](#715-organization) and Gotchas).
- The response is edge-cached. `?use_rss=true` returns an RSS feed (`application/rss+xml`) instead of JSON.
- **Default modality filter:** with neither `output_modalities` nor `endpoints` set, only **text-output** models are returned. Image, embedding, rerank, TTS/STT, video, and decision models are omitted unless you ask for them.

**Query parameters** (all optional)

| Name | Type | Default | Description |
| - | - | - | - |
| `offset` | integer\|null ≥0 | 0 | Records to skip. Pagination is opt-in: when **both** `offset` and `limit` are omitted, the full list is returned and `links.next` is `null`. |
| `limit` | integer 1–1000 | 500 | Page size (max 1000). Same opt-in rule. |
| `category` | enum | — | Use-case category: `programming`, `roleplay`, `marketing`, `marketing/seo`, `technology`, `science`, `translation`, `legal`, `finance`, `health`, `trivia`, `academia`. |
| `supported_parameters` | string (comma-separated) | — | Filter by supported request parameter(s), e.g. `tools`, `temperature`. Values come from the `Parameter` enum below. |
| `output_modalities` | string (comma-separated) | `text` | Any of `text`, `image`, `embeddings`, `audio`, `video`, `rerank`, `decisions`, `speech`, `transcription`, or `all` (skip modality filtering). |
| `input_modalities` | string (comma-separated) | — | Any of `text`, `image`, `audio`, `file`. |
| `endpoints` | string (comma-separated) | — | Request paths the model must serve (all listed). Valid: `/api/v1/chat/completions`, `/api/v1/completions`, `/api/v1/messages`, `/api/v1/responses`, `/api/v1/embeddings`, `/api/v1/rerank`, `/api/alpha/decisions`, `/api/alpha/extractions`, `/api/v1/videos`, `/api/v1/audio/speech`, `/api/v1/audio/transcriptions`, `/api/v1/images`, `/api/v1/batches`. When set without `output_modalities`, models of every output modality are considered. An unknown path returns `400`. |
| `sort` | enum | (existing default order) | Server-side sort. Values: `most-popular`, `newest`, `top-weekly`, `pricing-low-to-high`, `pricing-high-to-low`, `context-high-to-low`, `throughput-high-to-low`, `latency-low-to-high`, `intelligence-high-to-low`, `coding-high-to-low`, `agentic-high-to-low`, `design-arena-elo-high-to-low`. Models without data for the chosen dimension sort last. |
| `q` | string | — | Free-text search on model name or slug. |
| `context` | integer ≥1 | — | Minimum context length in tokens. |
| `min_price` / `max_price` | number\|null ≥0 | — | Prompt price bounds in **$ per 1M tokens**. |
| `min_output_price` / `max_output_price` | number\|null ≥0 | — | Completion price bounds in **$ per 1M tokens**. |
| `arch` | string | — | Architecture/model family (e.g. `GPT`, `Claude`, `Gemini`, `Llama`). |
| `model_authors` | string (comma-separated) | — | Author slugs, e.g. `openai,anthropic`. |
| `providers` | string (comma-separated) | — | Hosting provider **names**, e.g. `OpenAI,Anthropic`. |
| `distillable` | enum `"true"`\|`"false"` | — | `true` = only distillable models; `false` = exclude them. |
| `zdr` | enum `"true"` | — | Only models with zero-data-retention endpoints. |
| `region` | enum `eu`\|`us` | — | Only models with endpoints in that data region. This filter takes `eu`, not `europe`. |
| `min_age_days` / `max_age_days` | integer\|null ≥0 | — | Model age in days since `created`. |
| `min_intelligence_index` / `max_intelligence_index` | number\|null ≥0 | — | Artificial Analysis intelligence index bounds. |
| `min_coding_index` / `max_coding_index` | number\|null ≥0 | — | Artificial Analysis coding index bounds. |
| `min_agentic_index` / `max_agentic_index` | number\|null ≥0 | — | Artificial Analysis agentic index bounds. |
| `min_tool_success_rate` / `max_tool_success_rate` | number\|null 0–1 | — | Tool-calling success rate (fraction of requests finishing with a `tool_calls` finish reason). |
| `use_rss` | string | — | `true` → RSS feed response. |
| `use_rss_chat_links` | string | — | `true` → RSS items link to chat. |

What the `sort` values mean (guide):
- `pricing-*`: weighted average of prompt, completion, request, and web_search pricing.
- `context-high-to-low`: context length.
- `throughput-high-to-low`: p50 throughput from routing heuristics.
- `latency-low-to-high`: p50 time to first token.
- `most-popular` and `top-weekly`: most tokens processed in the last week (the guide calls them the same).
- `newest`: creation date.
- `intelligence-/coding-/agentic-high-to-low`: Artificial Analysis indices.
- `design-arena-elo-high-to-low`: best Design Arena ELO across arenas.

**Response `200` (`ModelsListResponse`)**

| Field | Type | Description |
| - | - | - |
| `data` | `Model[]` (required) | The models (see Model object below). |
| `total_count` | integer (required) | Total models matching the query. |
| `links.next` | string\|null (required) | Next-page URL (e.g. `/api/v1/models?offset=500&limit=500`), or `null` on the last page / when not paginating. |

**Errors:** `400`, `401`, `403`, `404`, `408`, `409`, `429`, `500`, `503`.

#### The Model object

Returned by `GET /models`, `GET /models/user`, and (wrapped in `data`) `GET /model/{author}/{slug}`.

| Field | Type | Req | Description |
| - | - | - | - |
| `id` | string | ✓ | Routable model ID used in requests (e.g. `openai/gpt-4`, `poolside/laguna-s-2.1:free`). |
| `canonical_slug` | string | ✓ | Canonical, permanent slug for the model that never changes (example `openai/gpt-4`). |
| `name` | string | ✓ | Display name. |
| `created` | integer | ✓ | Unix timestamp (seconds) when the model was added to OpenRouter. |
| `description` | string | | Description of the model. |
| `context_length` | integer\|null | ✓ | Max context window in tokens. |
| `architecture` | object | ✓ | See Architecture below. |
| `pricing` | object | ✓ | Pricing from the top provider. See Pricing below. |
| `top_provider` | object | ✓ | See Top provider below. |
| `per_request_limits` | object\|null | ✓ | `{prompt_tokens: number, completion_tokens: number}` per-request token caps, or `null` if none. |
| `supported_parameters` | `Parameter[]` | ✓ | Request parameters this model accepts (enum below). |
| `default_parameters` | object\|null | ✓ | Default sampling values: `temperature`, `top_p`, `top_k` (int), `frequency_penalty`, `presence_penalty`, `repetition_penalty`. Each number\|null. |
| `reasoning` | object | | Reasoning config. Omitted for non-reasoning models and dynamic router models. See Reasoning below. |
| `supported_voices` | string[]\|null | ✓ | Voice IDs for TTS models; `null` for non-TTS models. |
| `endpoints` | string[] | ✓ | Request API paths serving this model, e.g. `["/api/v1/chat/completions","/api/v1/completions","/api/v1/messages","/api/v1/responses"]`. A model served only on an alpha surface lists only that path. |
| `links` | object | ✓ | `{details: string}`: path of the model's endpoints API, e.g. `/api/v1/models/openai/gpt-4/endpoints`. |
| `expiration_date` | string\|null | | `YYYY-MM-DD` after which the model may be removed (deprecation), or `null`. |
| `knowledge_cutoff` | string\|null | | Training-data cutoff `YYYY-MM-DD`, or `null` if unknown. |
| `hugging_face_id` | string\|null | | Hugging Face model ID, if applicable. Open-weight models have one. |
| `benchmarks` | object | | Third-party benchmark rankings. **Omitted entirely** when no data exists. See Benchmarks below. |
| `alias_target` | object | | For tilde-latest aliases (`~author/...-latest`): `{name: string, slug: string}` of the concrete target model (the `slug` matches that model row's `id`). |

**Architecture (`ModelArchitecture`)**

| Field | Type | Req | Values |
| - | - | - | - |
| `modality` | string\|null | ✓ | Primary modality string, e.g. `"text->text"`. |
| `input_modalities` | `InputModality[]` | ✓ | `text`, `image`, `file`, `audio`, `video` |
| `output_modalities` | `OutputModality[]` | ✓ | `text`, `image`, `embeddings`, `audio`, `video`, `rerank`, `decisions`, `speech`, `transcription` |
| `tokenizer` | `ModelGroup` | | `Router`, `Media`, `Other`, `GPT`, `Claude`, `Gemini`, `Gemma`, `Grok`, `Cohere`, `Nova`, `Qwen`, `Yi`, `DeepSeek`, `Mistral`, `Llama2`, `Llama3`, `Llama4`, `PaLM`, `RWKV`, `Qwen3` |
| `instruct_type` | `InstructType` (string\|null) | | `none`, `airoboros`, `alpaca`, `alpaca-modif`, `chatml`, `claude`, `code-llama`, `gemma`, `llama2`, `llama3`, `mistral`, `nemotron`, `neural`, `openchat`, `phi3`, `rwkv`, `vicuna`, `zephyr`, `deepseek-r1`, `deepseek-v3.1`, `qwq`, `qwen3`, `null` |

**Pricing (`PublicPricing`; same keys as endpoint `Pricing`).** All prices are strings in USD. `"0"` means free.

| Field | Req | Unit |
| - | - | - |
| `prompt` | ✓ | USD per input (prompt) token |
| `completion` | ✓ | USD per output (completion) token |
| `request` | | USD per request (fixed) |
| `image` | | USD per input image |
| `image_output` | | USD per output image |
| `image_token` | | USD per image token |
| `audio` | | USD per audio input token |
| `audio_output` | | USD per audio output token |
| `input_audio_cache` | | USD per cached audio input token |
| `web_search` | | USD per web search |
| `internal_reasoning` | | USD per internal reasoning token |
| `input_cache_read` | | USD per cached input token read |
| `input_cache_write` | | USD per cache-write token. For providers with several cache TTLs (e.g. Anthropic), this is the default 5-minute rate. |
| `input_cache_write_1h` | | USD per 1-hour cache-write token. Only present when the provider prices a 1-hour TTL separately (e.g. Anthropic). |
| `discount` | | number (not string). Fractional discount; effective price = price × (1 − discount). 0 = none, 1 = free. |
| `overrides` | | `PricingOverride[]`. Conditional pricing (see below). |

**`PricingOverride` entries.** Top-level pricing keys always show the price under *default conditions*, i.e. the current time window. `overrides` lists the conditional exceptions.

| Field | Kind | Description |
| - | - | - |
| `min_prompt_tokens` | condition (number) | Applies when the request's total prompt tokens are **strictly greater** than this. |
| `utc_start` | condition (number, HHMM) | Inclusive start of a daily UTC window (e.g. `1030` = 10:30). |
| `utc_end` | condition (number, HHMM) | Exclusive end. The window `[utc_start, utc_end)` wraps past midnight when `utc_start > utc_end`, so `utc_end: 0` means end of day. Match wrap-aware: `t >= start \|\| t < end`. |
| `utc_days` | condition (enum[], min 1) | `monday` … `sunday`, evaluated at the request instant. Scopes the time window, or the whole day if there is no window. Absent means every day. |
| `prompt`, `completion`, `input_cache_read`, `input_cache_write`, `input_cache_write_1h`, `audio`, `input_audio_cache` | price (string) | Overridden prices, same units as base. Absent keys inherit the base price. |

Matching rules:
- An entry applies only when **all** its condition fields match.
- When several entries apply, later entries win per key.
- Time-scheduled entries tile the full day (or week, with `utc_days`) with no overlaps, so exactly one matches at any instant.
- **Skip entries containing condition fields you don't recognize.** New conditions may be added.

```json
"pricing": {
  "prompt": "0.0000025",
  "completion": "0.00001",
  "overrides": [ { "min_prompt_tokens": 200000, "prompt": "0.000005", "completion": "0.00002" } ]
}
```

**Top provider (`TopProviderInfo`)**

| Field | Type | Req | Description |
| - | - | - | - |
| `context_length` | integer\|null | | Top provider's context length. |
| `max_completion_tokens` | integer\|null | | Top provider's max output tokens. This is a ceiling for `max_tokens`, not a guaranteed output size: input and output share the context window. |
| `is_moderated` | boolean | ✓ | Whether the top provider moderates content. |

**Reasoning (`ModelReasoning`)**

| Field | Type | Req | Description |
| - | - | - | - |
| `mandatory` | boolean | ✓ | `true` → reasoning cannot be disabled and effort `"none"` is rejected. |
| `default_enabled` | boolean | | Reasoning state when the client doesn't set `reasoning.enabled`. |
| `default_effort` | `ReasoningEffort` | | Effort used when reasoning is enabled without an effort (maps to `reasoning.effort`). When `"none"`, prefer omitting effort unless the user explicitly disables reasoning. |
| `supported_efforts` | `ReasoningEffort[]`\|null | | Allowed efforts, highest first. `null` = no allowlist (all gateway values accepted). |
| `supports_max_tokens` | boolean | | Present and `true` when the model accepts `reasoning.max_tokens` (Anthropic-style). Omitted otherwise. |

`ReasoningEffort` enum: `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`, `null`. See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) for reasoning tokens.

**Benchmarks (`ModelBenchmarks`)**
- `artificial_analysis` (optional): `{intelligence_index, coding_index, agentic_index}`. Each number\|null; higher is better.
- `design_arena` (required when `benchmarks` is present): array of `{arena, category, elo, win_rate, rank}`.
  - `arena`: e.g. `models`, `builders`, `agents`.
  - `category`: e.g. `website`, `gamedev`, `uicomponent`.
  - `elo`: number.
  - `win_rate`: percentage.
  - `rank`: integer, 1 = highest ELO among models listed on OpenRouter.

**`Parameter` enum (`supported_parameters`):** `temperature`, `top_p`, `top_k`, `min_p`, `top_a`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `max_tokens`, `max_completion_tokens`, `logit_bias`, `logprobs`, `top_logprobs`, `prediction`, `seed`, `response_format`, `structured_outputs`, `stop`, `tools`, `tool_choice`, `parallel_tool_calls`, `include_reasoning`, `reasoning`, `reasoning_effort`, `web_search_options`, `verbosity`.

Example Model (from spec):

```json
{
  "id": "openai/gpt-4",
  "canonical_slug": "openai/gpt-4",
  "name": "GPT-4",
  "created": 1692901234,
  "description": "GPT-4 is a large multimodal model that can solve difficult problems with greater accuracy.",
  "context_length": 8192,
  "architecture": { "input_modalities": ["text"], "output_modalities": ["text"], "modality": "text->text", "tokenizer": "GPT", "instruct_type": "chatml" },
  "pricing": { "prompt": "0.00003", "completion": "0.00006", "image": "0", "request": "0" },
  "top_provider": { "context_length": 8192, "max_completion_tokens": 4096, "is_moderated": true },
  "per_request_limits": null,
  "supported_parameters": ["temperature", "top_p", "max_tokens"],
  "default_parameters": null,
  "reasoning": { "default_effort": "medium", "default_enabled": true, "mandatory": false, "supported_efforts": ["high", "medium", "low", "minimal"] },
  "supported_voices": null,
  "endpoints": ["/api/v1/chat/completions", "/api/v1/completions", "/api/v1/messages", "/api/v1/responses"],
  "links": { "details": "/api/v1/models/openai/gpt-4/endpoints" },
  "expiration_date": null,
  "knowledge_cutoff": null
}
```

**Examples**

```bash
# Default: text-output models only, full list (no pagination)
curl "https://openrouter.ai/api/v1/models"

# Everything, any modality
curl "https://openrouter.ai/api/v1/models?output_modalities=all"

# Tool-calling models with >=128K context, cheapest first, prompt price <= $1/M
curl "https://openrouter.ai/api/v1/models?supported_parameters=tools&context=128000&max_price=1&sort=pricing-low-to-high"

# Models that serve the Extractions API (any modality)
curl "https://openrouter.ai/api/v1/models?endpoints=/api/alpha/extractions"

# Opt-in pagination
curl "https://openrouter.ai/api/v1/models?offset=0&limit=500"

# EU in-region eligible models
curl "https://openrouter.ai/api/v1/models?region=eu"

# Models with benchmark data
curl -s "https://openrouter.ai/api/v1/models" | jq '.data[] | select(.benchmarks) | {id, benchmarks}'
```

```typescript
const result = await openRouter.models.list();
for await (const page of result) {
  console.log(page); // ModelsListResponse pages
}
```

```python
res = open_router.models.list()
```

#### `GET /models/user` — models filtered by the user's provider preferences, privacy settings, and guardrails

- **operationId:** `listModelsUser` · **Auth:** API key, required (bearer) · **SDK:** TS `models.listForUser({ bearer })` (async pages), Python `models.list_for_user`, Go `Models.ListForUser`.
- Returns only models that remain usable after the account's provider preferences, privacy/data-policy settings (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)), and guardrails (see [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)) are applied.
- Text-output models by default. Pass `output_modalities` to include others.
- On a regional hostname (`eu.`/`us.`), results are limited to models that satisfy in-region routing for that region.

| Query param | Type | Default | Description |
| - | - | - | - |
| `offset` | integer\|null ≥0 | 0 | As `/models` (opt-in pagination). |
| `limit` | integer 1–1000 | 500 | As `/models`. |
| `output_modalities` | string | `text` | As `/models`. |
| `sort` | enum | — | Same 12 values as `/models`. |
| `client` | enum `claude_code`\|`claude_desktop`\|`codex` | — | Filters models **and presets** by the named harness's eligibility policy (details below). Omit to get every usable model. |

`client` filter details:
- Tool calling is required.
- If a guardrail sets `enforce_first_party_harness_models`, only the harness vendor's own models remain: OpenAI for `codex`, Anthropic for `claude_code`/`claude_desktop`.
- If the workspace's Managed Machines policy sets a model list for that harness, only listed models remain. A preset remains only while every model it routes to is listed.
- The filter does not apply the harness's ranking, caps, or Claude Desktop model-ID aliases, so returned IDs stay routable.

**Response:** same as `GET /models` (`data`, `total_count`, `links.next`). **Errors:** `401`, `403`, `404`, `408`, `409`, `429`, `500`, `503`.

```bash
curl "https://openrouter.ai/api/v1/models/user?output_modalities=all&client=claude_code" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

```typescript
const result = await openRouter.models.listForUser({ bearer: process.env.OPENROUTER_API_KEY ?? "" });
for await (const page of result) console.log(page);
```

#### `GET /models/count` — total count of available models

- **operationId:** `listModelsCount` · **Auth:** public / optional · **SDK:** `models.count()`.
- Query: `output_modalities` (string, default `text`; same values as `/models`). Use the same value you pass to `/models` so counts match list results.
- **Response `200`:** `{"data": {"count": 150}}`. `data.count` is an integer. **Errors:** `400`, `403`, `500`.

```bash
curl "https://openrouter.ai/api/v1/models/count?output_modalities=all"
```

#### `GET /model/{author}/{slug}` — get one model by slug

- **operationId:** `getModel` · **Auth:** public / optional · **SDK:** TS `models.get({ author, slug })`, Python `models.get(author=..., slug=...)`. Note the path is singular `/model/`.
- Path params: `author` (string, required, e.g. `openai`) and `slug` (string, required, e.g. `gpt-4` or `gpt-4:free`). The slug may include a variant suffix.
- **Response `200` (`ModelResponse`):** `{"data": Model}`. Same Model object as above.
- **Errors:** `403`, `404`, `500`.

Resolution behavior:
- **Aliases resolve.** `anthropic/claude-3-5-sonnet` returns the canonical `anthropic/claude-3.5-sonnet` entry.
- **Catalog variants** (e.g. `:free`) return that variant's own entry (`id: "poolside/laguna-s-2.1:free"`).
- **Routing variants** (`:nitro`, `:floor`, `:exacto`) return the **base** model's entry, because they are not separate catalog entries. With mixed suffixes, the catalog variant is kept and routing variants are dropped (`…:free:nitro` → `…:free`).
- Returns `404` when the model doesn't exist and isn't an alias, including a catalog variant suffix the model has no entry for.

```bash
curl "https://openrouter.ai/api/v1/model/openai/gpt-4o"
curl "https://openrouter.ai/api/v1/model/poolside/laguna-s-2.1:free"   # catalog variant entry
curl "https://openrouter.ai/api/v1/model/openai/gpt-4o:nitro"          # returns base openai/gpt-4o
```

```typescript
const result = await openRouter.models.get({ author: "openai", slug: "gpt-4" });
console.log(result.data.pricing.prompt); // "0.00003" = USD per prompt token
```

Sources: https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties, https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails, https://openrouter.ai/docs/api/api-reference/models/get-total-count-of-available-models, https://openrouter.ai/docs/api/api-reference/models/get-a-model-by-its-slug, https://openrouter.ai/docs/guides/overview/models, https://openrouter.ai/docs/guides/routing/model-variants/overview, https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/client-sdks/typescript/sdks/models/README, https://openrouter.ai/docs/client-sdks/python/sdks/models/README

### 7.3 Endpoints (per-model provider endpoints, ZDR preview)

An **endpoint** is one provider deployment of a model: provider, quantization, service tier, and optionally a BYOK key. Routing ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) chooses among them. These operations expose live price, limits, capabilities, uptime, latency, and throughput per endpoint.

#### `GET /models/{author}/{slug}/endpoints` — list all endpoints for a model

- **operationId:** `listEndpoints` · **Auth:** public / optional · **SDK:** TS `endpoints.list({ author, slug })`, Python `endpoints.list(author=..., slug=...)`, Go `Endpoints.List`.
- Path params: `author` (string, required), `slug` (string, required).
- Variant suffixes behave like `/model/...`: `openai/gpt-5.2:nitro/endpoints` returns `id: "openai/gpt-5.2"`.
- **When the resolved catalog entry doesn't exist** (e.g. `:free` on a model without a free entry), this route returns **`200` with `"endpoints": []`**, not 404. Treat an empty list as "model unavailable"; don't retry with the base slug.
- **Performance fields** (`latency_last_30m`, `throughput_last_30m`, `perf_last_30m_by_workload`) are only populated when authenticated with an API key or cookie. They are `null` for unauthenticated requests.
- **Errors:** `403`, `404`, `500`, `503`.

**Response `200`:** `{"data": ListEndpointsResponse}`

| Field | Type | Description |
| - | - | - |
| `id` | string | Model ID. |
| `name` | string | Display name. |
| `created` | integer | Unix timestamp. |
| `description` | string | Description. |
| `architecture` | object | Same as Model architecture, but here `instruct_type` is required (nullable) and `tokenizer` is required (`ModelGroup` or `null`). |
| `endpoints` | `PublicEndpoint[]` | One entry per endpoint (table below). |

**`PublicEndpoint` object**

| Field | Type | Req | Description |
| - | - | - | - |
| `name` | string | ✓ | Endpoint display name, e.g. `"OpenAI: GPT-4"`. |
| `model_id` | string | ✓ | Model permaslug. |
| `model_name` | string | ✓ | Model display name. |
| `provider_name` | `ProviderName` | ✓ | Provider display name (enum, e.g. `OpenAI`, `Anthropic`, `Google`, `Google AI Studio`, `Amazon Bedrock`, `Azure`, `Together`, `Fireworks`, `DeepInfra`, `Groq`, `Cerebras`, `Mistral`, `xAI`, `Z.AI`, …, 123 values in the spec). |
| `tag` | string | ✓ | Endpoint tag, e.g. `"openai"` (no description in the spec). |
| `context_length` | integer | ✓ | Endpoint context window. |
| `max_completion_tokens` | integer\|null | ✓ | Max output tokens. The effective max for a request is further limited by the context left after input. |
| `max_prompt_tokens` | integer\|null | ✓ | Max input tokens. |
| `pricing` | `Pricing` | ✓ | Same keys and units as Model pricing (incl. `discount`, `overrides`). |
| `quantization` | enum\|null | ✓ | `int4`, `int8`, `fp4`, `mxfp4`, `nvfp4`, `fp6`, `fp8`, `mxfp8`, `fp16`, `bf16`, `fp32`, `unknown`. |
| `service_tier` | enum\|null | ✓ | `flex`, `priority`, `ultrafast`, or `null` for a standard endpoint. Always the canonical tier: `priority` also covers the "fast" request alias and provider spellings `turbo`/`highspeed`/`prime`, which this field never reports. See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Service tiers. |
| `status` | integer enum | | `0`, `-1`, `-2`, `-3`, `-5`, `-10`. The spec lists the values without meanings; examples use `0`. |
| `supported_parameters` | `Parameter[]` | ✓ | Parameters accepted by this endpoint. |
| `supports_tool_choice` | object | ✓ | `{auto, none, required, function}` booleans: which `tool_choice` values *passed testing*. `tool_choice` in `supported_parameters` only means the parameter is accepted. |
| `supports_implicit_caching` | boolean | ✓ | Whether the endpoint supports implicit (automatic) prompt caching. The spec has no description; see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Prompt caching. |
| `native_tools` | map<string, `{type: string}`> | ✓ | Server tools this endpoint runs as the provider's own built-in tool (`engine: "native"`), keyed by canonical `openrouter:*` name. The value names the provider tool type, e.g. `{"openrouter:web_search": {"type": "web_search_20260209"}}` (Anthropic) or `google_search` (Gemini). `{}` when none. See [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Server tools. |
| `supports_diarization` | boolean | ✓ | STT endpoint can label transcript segments by speaker. `false` when undeclared. |
| `supports_voice_cloning` | boolean | | Default `false`. TTS endpoint accepts inline reference audio (`input_references`). Requests with reference audio are only routed to endpoints where this is true. |
| `supports_multiple_audio_references` | boolean | | Default `false`. TTS endpoint accepts more than one `input_audio` reference clip. |
| `supports_image_reference` | boolean | | Default `false`. TTS endpoint accepts an `image_url` voice reference. |
| `uptime_last_5m` | number\|null | ✓ | Uptime % over 5 min (definition below). |
| `uptime_last_30m` | number\|null | ✓ | Uptime % over 30 min. |
| `uptime_last_1d` | number\|null | ✓ | Uptime % over 1 day. |
| `latency_last_30m` | `PercentileStats`\|null | ✓ | **Time to first token** in ms over the last 30 min: `{p50, p75, p90, p99}`. `null` when unauthenticated. |
| `throughput_last_30m` | `PercentileStats`\|null | ✓ | Output **tokens/second** over the last 30 min. `pN` is the speed N% of requests reached or exceeded, so **p90 < p50**. `null` when unauthenticated. |
| `perf_last_30m_by_workload` | object | | Per-workload performance over the last 30 min (details below). Additive to the legacy singular fields. Authenticated only. |

Uptime definition: the share of minutes in which ≥80% of provider attempts succeeded, counting only minutes with ≥10 attempts. Rate-limited and caller-caused failures are excluded. `null` when no minute had enough traffic.

`perf_last_30m_by_workload` details:
- Keys: `text_generation`, `image_generation`, `video_generation`, `embeddings`, `rerank`, `tts`, `stt`, `decisions`, `extractions`, `unknown`.
- Each value: `{latency: PercentileStats, throughput: PercentileStats, request_count: integer|null}`.
- Image and video generation report full **end-to-end** latency. Every other workload reports time to first token/result.
- Throughput is only meaningful for text generation and is `null` for workloads without token throughput.

```json
{
  "data": {
    "id": "openai/gpt-4", "name": "GPT-4", "created": 1692901234, "description": "…",
    "architecture": { "input_modalities": ["text"], "output_modalities": ["text"], "modality": "text->text", "tokenizer": "GPT", "instruct_type": "chatml" },
    "endpoints": [{
      "name": "OpenAI: GPT-4", "model_id": "openai/gpt-4", "model_name": "GPT-4",
      "provider_name": "OpenAI", "tag": "openai", "quantization": "fp16", "service_tier": null, "status": 0,
      "context_length": 8192, "max_completion_tokens": 4096, "max_prompt_tokens": 8192,
      "pricing": { "prompt": "0.00003", "completion": "0.00006", "image": "0", "request": "0" },
      "supported_parameters": ["temperature", "top_p", "max_tokens"],
      "supports_tool_choice": { "auto": true, "function": true, "none": true, "required": true },
      "supports_implicit_caching": true, "supports_diarization": false,
      "native_tools": { "openrouter:web_search": { "type": "web_search_20260209" } },
      "uptime_last_5m": 100, "uptime_last_30m": 99.5, "uptime_last_1d": 99.8,
      "latency_last_30m": { "p50": 0.25, "p75": 0.35, "p90": 0.48, "p99": 0.85 },
      "throughput_last_30m": { "p50": 45.2, "p75": 38.5, "p90": 28.3, "p99": 15.1 },
      "perf_last_30m_by_workload": { "text_generation": { "latency": { "p50": 250, "p75": 350, "p90": 480, "p99": 850 }, "request_count": 1000, "throughput": { "p50": 45.2, "p75": 38.5, "p90": 28.3, "p99": 15.1 } } }
    }]
  }
}
```

(The spec examples show `latency_last_30m` values like `0.25` next to workload latency `250`, though both are described as milliseconds. Rely on the description, not the example magnitudes.)

```bash
curl "https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-4.5/endpoints" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"   # key needed for latency/throughput
```

```typescript
// SDK: const result = await openRouter.endpoints.list({ author: "openai", slug: "gpt-4" });
const res = await fetch("https://openrouter.ai/api/v1/models/openai/gpt-4/endpoints", {
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
});
const { data } = await res.json();
// Highest median throughput among endpoints that report it
const fastest = data.endpoints
  .filter((e: any) => e.throughput_last_30m)
  .sort((a: any, b: any) => b.throughput_last_30m.p50 - a.throughput_last_30m.p50)[0];
console.log(fastest?.provider_name, fastest?.pricing);
```

#### `GET /endpoints/zdr` — preview the endpoints eligible under ZDR

- **operationId:** `listEndpointsZdr` · **Auth:** public / optional · **SDK:** TS `endpoints.listZdrEndpoints()`, Python `endpoints.list_zdr_endpoints()`. No parameters.
- Lists every endpoint that stays eligible when Zero Data Retention is enforced (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) ZDR). The list updates automatically when a provider's data policy changes. It also includes **Safety Retention** endpoints, which are used only if you allow Safety Retention.
- **Response `200`:** `{"data": PublicZdrEndpoint[]}`. `PublicZdrEndpoint` is `PublicEndpoint` plus:
  - `safety_retention` (boolean, required): prompts aren't retained by default, but the provider may retain prompts its safety classifiers flag. A ZDR-enforced request reaches these endpoints only when the account allows Safety Retention and no applied guardrail disallows it.
- **Errors:** `403`, `500`, `503`.

```bash
curl "https://openrouter.ai/api/v1/endpoints/zdr" | jq '.data[] | {model_id, provider_name, safety_retention}'
```

Sources: https://openrouter.ai/docs/api/api-reference/endpoints/list-all-endpoints-for-a-model, https://openrouter.ai/docs/api/api-reference/endpoints/preview-the-impact-of-zdr-on-the-available-endpoints, https://openrouter.ai/docs/guides/features/zdr, https://openrouter.ai/docs/guides/routing/model-variants/overview, https://openrouter.ai/docs/client-sdks/typescript/sdks/endpoints/README

### 7.4 Providers

#### `GET /providers` — list all providers

- **operationId:** `listProviders` · **Auth:** spec default bearer. Only `200` and `500` are documented. · **SDK:** `providers.list()`. No parameters.
- **Response `200`:** `{"data": Provider[]}`

| Field | Type | Req | Description |
| - | - | - | - |
| `name` | string | ✓ | Display name (e.g. `OpenAI`). Matches `provider_name` on endpoints. |
| `slug` | string | ✓ | URL-friendly identifier (e.g. `openai`). Provider routing fields `provider.order` / `only` / `ignore` take provider slugs (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). |
| `privacy_policy_url` | string\|null | ✓ | Provider privacy policy URL. |
| `terms_of_service_url` | string\|null | | Terms of service URL. |
| `status_page_url` | string\|null | | Status page URL. |
| `headquarters` | enum (ISO 3166-1 alpha-2) | | HQ country code, e.g. `US`. |
| `datacenters` | enum[]\|null (ISO 3166-1 alpha-2) | | Datacenter country codes, e.g. `["US","IE"]`. |

```json
{ "data": [ { "name": "OpenAI", "slug": "openai", "headquarters": "US", "datacenters": ["US", "IE"],
  "privacy_policy_url": "https://openai.com/privacy", "terms_of_service_url": "https://openai.com/terms",
  "status_page_url": "https://status.openai.com" } ] }
```

```bash
curl "https://openrouter.ai/api/v1/providers" -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

Sources: https://openrouter.ai/docs/api/api-reference/providers/list-all-providers, https://openrouter.ai/docs/client-sdks/typescript/sdks/providers/README, https://openrouter.ai/docs/guides/routing/provider-selection

### 7.5 Generations (per-request stats, stored content, feedback)

Every inference response carries a generation `id` (`gen-…`). Use it to fetch cost and token stats after the request completes. This helps with auditing historical usage, with streaming requests, and with asynchronous cost reconciliation.

#### `GET /generation` — request & usage metadata for a generation

- **operationId:** `getGeneration` · **Auth:** API key (the `403` text also covers management keys) · **SDK:** TS `generations.getGeneration({ id })`, Python `generations.get_generation(id=...)`, Go `Generations.GetGeneration`.
- Query param `id` (string, **required**, maxLength 128, pattern `^gen-[0-9A-Za-z-]+$`): the generation ID.
- **Errors:** `400`, `401`, `402`, `403`, `404`, `429`, `500`, `502`, `524`, `529`.

**Response `200`:** `{"data": Generation}`. Fields are required (many nullable) unless marked optional.

| Field | Type | Description |
| - | - | - |
| `id` | string | Generation ID. |
| `request_id` | string\|null (optional) | Groups all generations from a single API request (e.g. `req-1727282430-…`). |
| `session_id` | string\|null (optional) | Groups generations in the same session. |
| `upstream_id` | string\|null | Upstream provider's ID for this generation (e.g. `chatcmpl-…`). |
| `created_at` | string | ISO 8601 timestamp. |
| `model` | string | Model used. |
| `provider_name` | string\|null | Provider that served the request. |
| `router` | string\|null | Router used (e.g. `openrouter/auto`). |
| `preset_id` | string\|null | Preset used, or `null`. |
| `api_type` | enum\|null | `completions`, `embeddings`, `rerank`, `decisions`, `extractions`, `video`, `tts`, `stt`, `image`, `tools_invoke`, `null`. |
| `streamed` | boolean\|null | Whether the response was streamed. |
| `cancelled` | boolean\|null | Whether the generation was cancelled. |
| `finish_reason` | string\|null | Finish reason. OpenRouter normalizes it to `tool_calls`, `stop`, `length`, `content_filter`, or `error`. |
| `native_finish_reason` | string\|null | Raw finish reason from the provider. |
| **Cost** | | |
| `total_cost` | number | Total cost of the generation, USD. |
| `usage` | number | Usage amount, USD. |
| `upstream_inference_cost` | number\|null | Cost charged by the upstream provider. |
| `cache_discount` | number\|null | Discount applied due to caching. Some providers (e.g. Anthropic) show a **negative** discount on cache writes and a positive one on cache reads. |
| `is_byok` | boolean | Whether bring-your-own-key was used. |
| **Tokens** | | |
| `tokens_prompt` | integer\|null | Prompt token count. The spec doesn't say which tokenizer. |
| `tokens_completion` | integer\|null | Completion token count. |
| `native_tokens_prompt` | integer\|null | Prompt tokens as reported by the provider. |
| `native_tokens_completion` | integer\|null | Completion tokens as reported by the provider. |
| `native_tokens_completion_images` | integer\|null | Completion image tokens (provider-reported). |
| `native_tokens_reasoning` | integer\|null | Reasoning tokens (provider-reported). |
| `native_tokens_cached` | integer\|null | Cached prompt tokens (provider-reported). |
| **Media / tools** | | |
| `num_media_prompt` | integer\|null | Media items in the prompt. |
| `num_input_audio_prompt` | integer\|null | Audio inputs in the prompt. |
| `num_media_completion` | integer\|null | Media items in the completion. |
| `num_search_results` | integer\|null | Search results included. |
| `num_fetches` | integer\|null | Web fetches performed. |
| `web_search_engine` | string\|null | Resolved web search engine (e.g. `exa`, `firecrawl`, `parallel`). |
| **Timing** | | |
| `latency` | number\|null | Total latency, ms. |
| `generation_time` | number\|null | Generation time, ms. |
| `moderation_latency` | number\|null | Moderation latency, ms. |
| **Routing** | | |
| `service_tier` | string\|null | Service tier the upstream provider *reported* running the request on, or `null`. |
| `data_region` | enum | `global`, `europe`, or `us`: the data region the generation was routed through. |
| `provider_responses` | `ProviderResponse[]`\|null | Provider attempts, including fallbacks (table below). |
| `response_cache_source_id` | string\|null (optional) | Set to the original generation ID when this one was served from the response cache. See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Response caching. |
| **Attribution** | | |
| `app_id` | integer\|null | App that made the request. |
| `origin` | string | Origin URL of the request. |
| `http_referer` | string\|null | `Referer` header. |
| `user_agent` | string\|null | `User-Agent` header. |
| `external_user` | string\|null | External user identifier (see [§7.14](#714-external-users)). |
| `workspace_id` | string\|null | Workspace the generation is attributed to. `null` for accounts without workspaces. Pre-workspace generations are attributed to the default workspace. |

**`ProviderResponse`** (element of `provider_responses`; only `status` is required)

| Field | Type | Description |
| - | - | - |
| `status` | integer\|null | HTTP status from the provider. |
| `provider_name` | enum | Provider name. This is a larger enum than `ProviderName` and includes names not in it, e.g. `AnyScale`, `Lepton`, `Together 2`. |
| `model_permaslug` | string | Canonical model slug. |
| `endpoint_id` | string | Internal endpoint identifier. |
| `id` | string | Upstream provider response identifier. |
| `is_byok` | boolean | Whether this attempt used BYOK. |
| `latency` | number | Attempt latency, ms. |
| `routed_service_tier` | enum `flex`\|`priority`\|`ultrafast` | Tier the request was routed to. The tier actually applied and billed comes from the provider response and may differ. |

Token counts in API responses use the model's native tokenizer, and credit usage and pricing are based on native counts. Reconcile spend with `native_tokens_*`, `usage`, and `total_cost`. To debug BYOK failures, check `provider_responses[].status` for each attempt.

```json
{
  "data": {
    "id": "gen-3bhGkxlo4XFrqiabUM7NDtwDzWwG", "request_id": "req-1727282430-aBcDeFgHiJkLmNoPqRsT",
    "created_at": "2024-07-15T23:33:19.433273+00:00", "model": "sao10k/l3-stheno-8b", "provider_name": "Infermatic",
    "api_type": "completions", "streamed": true, "cancelled": false, "finish_reason": "stop", "native_finish_reason": "stop",
    "total_cost": 0.0015, "usage": 0.0015, "upstream_inference_cost": 0.0012, "cache_discount": null, "is_byok": false,
    "tokens_prompt": 10, "tokens_completion": 25, "native_tokens_prompt": 10, "native_tokens_completion": 25,
    "native_tokens_reasoning": 5, "native_tokens_cached": 3, "native_tokens_completion_images": 0,
    "num_media_prompt": 1, "num_input_audio_prompt": 0, "num_media_completion": 0, "num_search_results": 5, "num_fetches": 0,
    "latency": 1250, "generation_time": 1200, "moderation_latency": 50,
    "router": "openrouter/auto", "service_tier": "priority", "data_region": "global", "web_search_engine": "exa",
    "preset_id": "a9e8d400-592a-494f-908c-375efa66cafd", "provider_responses": null, "session_id": null,
    "app_id": 12345, "origin": "https://openrouter.ai/", "http_referer": "https://openrouter.ai/", "user_agent": "Mozilla/5.0",
    "external_user": "user-123", "upstream_id": "chatcmpl-791bcf62-080e-4568-87d0-94c72e3b4946",
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

```bash
curl "https://openrouter.ai/api/v1/generation?id=$GENERATION_ID" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

```typescript
const result = await openRouter.generations.getGeneration({ id: "gen-3bhGkxlo4XFrqiabUM7NDtwDzWwG" });
console.log(result);
```

#### `GET /generation/content` — stored prompt, completion, and error content

- **operationId:** `listGenerationContent` · **Auth:** API key · **SDK:** TS `generations.listGenerationContent({ id })`, Python `generations.list_generation_content(id=...)`.
- Query param `id` (string, required, maxLength 128, pattern `^gen-[0-9A-Za-z-]+$`).
- **Content exists only if Input & Output Logging was on** (Settings → Observability) *when the generation was made*. See [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) Logs.
- **Errors:** `400`, `401`, `403`, `404`, `429`, `500`, `502`, `524`, `529`.

**Response `200`:** `{"data": GenerationContentData}`

| Field | Type | Description |
| - | - | - |
| `input` | object | Either `{prompt: string}` or `{messages: any[]}`. |
| `output.completion` | string\|null | Completion output. |
| `output.reasoning` | string\|null | Reasoning/thinking output, if any. |
| `error` | object\|null | `null` when the generation succeeded. Otherwise the stored failure (fields below). |

`error` fields:

| Field | Type | Description |
| - | - | - |
| `status` | integer\|null | HTTP status returned to the client. |
| `message` | string\|null | Error message returned to the client. |
| `provider_name` | string\|null | Provider whose error was returned, when known. |
| `raw` | string\|null | Raw error body behind the returned error, when stored. |
| `previous_errors` | array | Every upstream attempt that failed before the returned error, in attempt order. Each item is `{code: integer, message: string, provider_name: string\|null, raw: string\|null}`. |

```json
{ "data": { "error": null,
  "input": { "messages": [ { "role": "user", "content": "What is the meaning of life?" } ] },
  "output": { "completion": "The meaning of life is a philosophical question...", "reasoning": null } } }
```

Failed-generation example of `error`:

```json
{ "status": 504, "message": "Timed out waiting for the provider", "provider_name": "Vertex",
  "raw": "{\"error\":{\"code\":504,\"message\":\"Deadline exceeded\"}}",
  "previous_errors": [ { "code": 429, "message": "Provider returned error", "provider_name": "Google",
    "raw": "{\"error\":{\"code\":429,\"message\":\"Resource exhausted\"}}" } ] }
```

#### `POST /generation/feedback` — submit feedback for a generation

- **operationId:** `submitGenerationFeedback` · **Auth:** **management key** · **SDK:** TS `generations.submitFeedback({ submitGenerationFeedbackRequest })`, Python `generations.submit_feedback`.
- Submits structured feedback on a generation the authenticated user made.
- **One submission per generation per account.** A repeat returns `409` and the first submission is kept.

| Body field | Type | Req | Description |
| - | - | - | - |
| `generation_id` | string, minLength 1 | ✓ | The generation. |
| `category` | enum | ✓ | `latency`, `incoherence`, `incorrect_response`, `formatting`, `billing`, `api_error`, `other`. |
| `comment` | string, maxLength 1000 | | Optional free text. |

**Response `200`:** `{"data": {"success": true}}`. **Errors:** `400`, `401`, `403`, `404`, `409`, `429`, `500`, `503`.

```bash
curl -X POST https://openrouter.ai/api/v1/generation/feedback \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"generation_id":"gen-3bhGkxlo4XFrqiabUM7NDtwDzWwG","category":"incorrect_response","comment":"The model repeated the same paragraph three times."}'
```

```typescript
await admin.generations.submitFeedback({
  submitGenerationFeedbackRequest: {
    category: "incorrect_response",
    comment: "The model repeated the same paragraph three times.",
    generationId: "gen-3bhGkxlo4XFrqiabUM7NDtwDzWwG",
  },
});
```

Sources: https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation, https://openrouter.ai/docs/api/api-reference/generations/get-stored-prompt-completion-and-error-content-for-a-generation, https://openrouter.ai/docs/api/api-reference/generations/submit-feedback-for-a-generation, https://openrouter.ai/docs/guides/features/logs, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/guides/best-practices/prompt-caching, https://openrouter.ai/docs/guides/overview/auth/byok, https://openrouter.ai/docs/client-sdks/typescript/sdks/generations/README

### 7.6 Credits

#### `GET /credits` — total credits purchased and used

- **operationId:** `getCredits` · **Auth:** **management key** · **SDK:** TS `credits.getCredits()`, Python `credits.get_credits()`. No parameters.
- **Response `200`:** `{"data": {"total_credits": 100.5, "total_usage": 25.75}}`
  - `total_credits` (number, required): total credits purchased.
  - `total_usage` (number, required): total credits used.
  - Remaining balance = `total_credits − total_usage`.
- **Errors:** `401`, `403`, `500`. Per-IP burst limits apply (see "Limits on key endpoints" in [§7.7](#77-api-keys)).

```bash
curl https://openrouter.ai/api/v1/credits -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

#### `POST /credits/coinbase` — **DEPRECATED** Coinbase Commerce charge

- **operationId:** `createCoinbaseCharge` · `security: []`. Marked `x-speakeasy-ignore` / `x-fern-ignore`, so no SDK method is generated.
- The Coinbase APIs behind it were deprecated, so Coinbase Commerce charges have been removed. It **never returns 200**. It always returns **`410 Gone`**:
  `{"error":{"code":410,"message":"The Coinbase APIs used by this endpoint have been deprecated, so the Coinbase Commerce credits API has been removed. Use the web credits purchase flow instead."}}`
- No API endpoint buys credits. Use the web purchase flow.

Sources: https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits, https://openrouter.ai/docs/api/api-reference/credits/deprecated-coinbase-commerce-charge-endpoint, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/api_reference/limits

### 7.7 API keys

Two families:
- `GET /key` describes **the key making the call**. Any key works.
- `/keys` and `/keys/{hash}` manage the account's keys and require a **management key**.

A key is addressed by its `hash`, a SHA-256 hex digest of the key string; the OAuth guide derives the lowercase hex digest the same way. The plaintext key is returned once, by `POST /keys`.

#### `GET /key` — current API key

- **operationId:** `getCurrentKey` · **Auth:** any API key, regular or management (`is_management_key` says which) · **SDK:** TS `apiKeys.getCurrentKeyMetadata()`, Python `api_keys.get_current_key_metadata()`.
- Use it to check remaining spend, budgets, and the free-model quota before and during long tasks.
- **Errors:** `401`, `500`.

**Response `200`:** `{"data": {...}}`. All fields are required except `expires_at`.

| Field | Type | Description |
| - | - | - |
| `label` | string | Masked key label, e.g. `sk-or-v1-au7...890`. |
| `limit` | number\|null | The key's own spending limit, USD. `null` = unlimited. |
| `limit_remaining` | number\|null | Remaining on the key's own limit. `null` = unlimited. |
| `limit_reset` | string\|null | Reset interval of the key limit (`daily`/`weekly`/`monthly`). `null` = never resets. |
| `include_byok_in_limit` | boolean | Whether external BYOK usage counts toward `limit`. |
| `usage`, `usage_daily`, `usage_weekly`, `usage_monthly` | number | OpenRouter credit usage in USD: all-time, current UTC day, current UTC week (Mon–Sun), current UTC month. |
| `byok_usage`, `byok_usage_daily`, `byok_usage_weekly`, `byok_usage_monthly` | number | The same periods for external BYOK usage, USD. |
| `budgets` | `KeyBudget[]` | Every budget layer enforcement checks for this key, in check order: guardrail budgets, then workspace budgets, then the key's own limit. Empty when nothing is budgeted. `limit`/`limit_remaining` above describe only the key's own limit. |
| `effective_budget` | `KeyBudget`\|null | The budget that blocks first. If one is already spent, it is the entry enforcement rejects on. Otherwise it is the entry with the least `remaining_usd`. `null` when nothing is budgeted. |
| `free_model_daily_requests` | `{limit, remaining, used}` (integers) | `:free`-variant daily request quota for the owning account. Resets at UTC midnight. See note below. |
| `is_free_tier` | boolean | Spec: whether this is a free-tier API key. Limits guide: whether the user has paid for credits before. |
| `is_management_key` | boolean | Whether this is a management key. |
| `is_provisioning_key` | boolean | **DEPRECATED** duplicate of `is_management_key`. |
| `allowed_data_regions` | (`global`\|`europe`\|`us`)[] | Data regions permitted by the key's guardrail policies and the account's regional-routing entitlement. Empty = no region permitted. Covers region policy only. Other restrictions still apply (e.g. management keys are blocked from inference). |
| `creator_user_id` | string\|null | For org keys, the member who created the key; for individuals, the user's own ID. |
| `organization_id` | string\|null | Owning organization, or `null` for an individual account. |
| `workspace_id` | string\|null | Workspace the key spends in. `null` when no active workspace resolved, e.g. the key's workspace was deleted. |
| `expires_at` | string\|null (optional) | ISO 8601 UTC expiry, or `null`. |
| `rate_limit` | object | **DEPRECATED** legacy `{interval, note, requests}`. The spec says it "will always return -1"; the spec example shows a note saying it is safe to ignore. |

`free_model_daily_requests` details:
- `limit`: the daily ceiling. It depends on total credits purchased, independent of `is_free_tier`.
- `used`: requests so far today. `remaining`: what is left today.
- Exempt accounts/endpoints and BYOK requests are not gated by this counter. For them, `remaining` reflects tier policy, not an enforced ceiling.
- The per-minute free-model limit is not reported here.

**`KeyBudget`**

| Field | Type | Description |
| - | - | - |
| `scope` | enum | Layer, in enforcement order: `workspace_default_member` (workspace default guardrail vs the member aggregate), `workspace_default_key` (workspace default guardrail vs this key), `member` (member guardrail), `api_key` (API-key guardrail), `workspace` (a workspace budget), `key_limit` (the key's own limit). |
| `guardrail_id` | string\|null | Guardrail that carries the budget. `null` for other scopes. |
| `budget_id` | string\|null | Workspace budget ID for the `workspace` scope. `null` otherwise. |
| `limit_usd` | number | Limit for the current window. |
| `spend_usd` | number | Spend counted against the limit this window: the member aggregate for member-scoped layers, otherwise this key or workspace. |
| `remaining_usd` | number | `limit_usd − spend_usd`. **Zero or negative means this layer rejects requests with `403`** until it resets. |
| `reset_interval` | enum\|null | `daily`, `weekly` (weeks start Monday), `monthly`, or `null` (lifetime budget that never resets). |
| `resets_at` | string\|null (date-time) | ISO 8601 UTC instant when the window rolls over. `null` for lifetime. |
| `include_byok` | boolean | Whether external BYOK inference spend counts toward this budget. |

```json
{ "data": {
  "label": "sk-or-v1-au7...890", "limit": 100, "limit_remaining": 74.5, "limit_reset": "monthly",
  "include_byok_in_limit": false, "usage": 25.5, "usage_daily": 25.5, "usage_weekly": 25.5, "usage_monthly": 25.5,
  "byok_usage": 17.38, "byok_usage_daily": 17.38, "byok_usage_weekly": 17.38, "byok_usage_monthly": 17.38,
  "budgets": [ { "scope": "member", "guardrail_id": "0df9e665-d932-5740-b2c7-b52af166bc11", "budget_id": null,
    "limit_usd": 50, "spend_usd": 32.5, "remaining_usd": 17.5, "reset_interval": "weekly",
    "resets_at": "2026-10-12T00:00:00.000Z", "include_byok": false } ],
  "effective_budget": { "scope": "member", "guardrail_id": "0df9e665-d932-5740-b2c7-b52af166bc11", "budget_id": null,
    "limit_usd": 50, "spend_usd": 32.5, "remaining_usd": 17.5, "reset_interval": "weekly",
    "resets_at": "2026-10-12T00:00:00.000Z", "include_byok": false },
  "free_model_daily_requests": { "limit": 50, "remaining": 38, "used": 12 },
  "is_free_tier": false, "is_management_key": false, "is_provisioning_key": false,
  "allowed_data_regions": ["global", "europe", "us"], "creator_user_id": "user_2dHFtVWx2n56w6HkM0000000000",
  "organization_id": null, "workspace_id": "0df9e665-d932-5740-b2c7-b52af166bc11", "expires_at": "2027-12-31T23:59:59Z",
  "rate_limit": { "interval": "1h", "note": "This field is deprecated and safe to ignore.", "requests": 1000 } } }
```

```typescript
// SDK: await openRouter.apiKeys.getCurrentKeyMetadata();
const res = await fetch("https://openrouter.ai/api/v1/key", {
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
});
const { data } = await res.json();
const eff = data.effective_budget;
if (eff && eff.remaining_usd <= 0) {
  throw new Error(`Budget layer ${eff.scope} exhausted; resets at ${eff.resets_at ?? "never"}`);
}
if (data.limit_remaining !== null && data.limit_remaining <= 0) throw new Error("Key limit exhausted");
```

#### The API key object (`/keys` responses)

| Field | Type | Description |
| - | - | - |
| `hash` | string | Key identifier. Used in `/keys/{hash}`, `GET /activity?api_key_hash=`, analytics `api_key_id` filters, and BYOK `allowed_api_key_hashes`. |
| `name` | string | Key name. |
| `label` | string | Human-readable label. The guide shows a masked key (`sk-or-v1-abc...123`); the spec's create example shows the name. |
| `disabled` | boolean | Disabled flag. |
| `limit` | number\|null | Spending limit, USD. |
| `limit_remaining` | number\|null | Remaining on the limit. |
| `limit_reset` | string\|null | `daily`/`weekly`/`monthly`/`null`. |
| `include_byok_in_limit` | boolean | Whether BYOK usage counts toward the limit. |
| `usage`, `usage_daily`, `usage_weekly`, `usage_monthly` | number | Credit usage, USD (UTC day / Mon–Sun week / month). |
| `byok_usage`, `byok_usage_daily`, `byok_usage_weekly`, `byok_usage_monthly` | number | External BYOK usage, USD. |
| `created_at` | string | ISO 8601. |
| `updated_at` | string\|null | ISO 8601 of the last update. |
| `last_used_at` | string\|null (date-time) | Most recent recorded usage. `null` if none was recorded since the end of 2025. |
| `expires_at` | string\|null (date-time, optional) | Expiry, or `null`. |
| `creator_user_id` | string\|null | Creating member or user. |
| `external_user` | string\|null | Partner end-user identifier for attribution (set by `external.user` on create). |
| `workspace_id` | string | Workspace the key belongs to. |

All fields are required except `expires_at`.

#### `GET /keys` — list API keys

- **operationId:** `list` · **Auth:** management key · **SDK:** TS `apiKeys.list()`, Python `api_keys.list()`.
- Returns the most recent **100** keys per call. Paginate with `offset` (e.g. `?offset=100`). There is **no `limit` parameter**.

| Query param | Type | Description |
| - | - | - |
| `include_disabled` | string, boolean-valued (`"true"`/`"false"`) | Include disabled keys. |
| `include_expired` | string, boolean-valued | Include expired keys. They are excluded by default and returned only when `true`. |
| `offset` | integer\|null ≥0 | Number of keys to skip. |
| `workspace_id` | string (uuid) | Workspace filter. An org-scoped management key gets the **default workspace** when this is omitted. A workspace-scoped management key always gets its own workspace and cannot list another. |

**Response `200`:** `{"data": APIKey[]}`. **Errors:** `400`, `401`, `403`, `404`, `429`, `500`.

```bash
curl "https://openrouter.ai/api/v1/keys?offset=100&include_disabled=true" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

#### `POST /keys` — create an API key

- **operationId:** `createKeys` · **Auth:** management key · **SDK:** TS `apiKeys.create({ requestBody })`, Python `api_keys.create(...)`.
- The plaintext `key` appears **only in this response**. Treat it as write-only; it cannot be retrieved later.

| Body field | Type | Req | Description |
| - | - | - | - |
| `name` | string, 1–256 | ✓ | Key name. |
| `limit` | number\|null, ≥0, <1,000,000 | | Spending limit in USD. |
| `limit_reset` | enum `daily`\|`weekly`\|`monthly`\|`null` | | Limit reset interval. Resets happen at midnight UTC; weeks run Monday–Sunday. |
| `include_byok_in_limit` | boolean | | Count BYOK usage toward the limit. |
| `expires_at` | string\|null (date-time) | | ISO 8601 UTC expiry. **Must include seconds** (`YYYY-MM-DDTHH:MM:SSZ`); minute precision is rejected. |
| `workspace_id` | string (uuid) | | Target workspace. Defaults to the default workspace for an org-scoped management key, or to the management key's own workspace when it is workspace-scoped (which cannot create keys elsewhere). |
| `creator_user_id` | string\|null, minLength 1 | | For org-owned keys: the member who is creating the key. A workspace-scoped management key may only name a member of its own workspace. |
| `external` | object | | Partner identity for the key (fields below). |

`external` fields:
- `user` (required): the partner's external user identifier. 1–512 characters after trimming surrounding whitespace, well-formed Unicode, no NUL. For organization keys outside HIPAA workspaces, it is registered as an external user ([§7.14](#714-external-users)) if it doesn't exist yet, and the key is linked to it.
- `api_key` (optional): a partner-supplied API key, 32–512 characters with sufficient entropy. Stored as a SHA-256 hash and never returned.

**Response `201`:** `{"data": APIKey, "key": "sk-or-v1-…"}`. **Errors:** `400`, `401`, `403`, `429`, `500`.

```bash
curl -X POST https://openrouter.ai/api/v1/keys \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"name":"My New API Key","limit":50,"limit_reset":"monthly","include_byok_in_limit":true,"expires_at":"2027-12-31T23:59:59Z"}'
```

```typescript
const created = await admin.apiKeys.create({
  requestBody: {
    name: "My New API Key",
    limit: 50,
    limitReset: "monthly",
    includeByokInLimit: true,
    expiresAt: new Date("2027-12-31T23:59:59Z"),
  },
});
// created.key is the plaintext key: store it now, it is never returned again
```

```python
import requests, os
r = requests.post(
    "https://openrouter.ai/api/v1/keys",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_MANAGEMENT_KEY']}"},
    json={"name": "Customer Instance Key", "limit": 1000},
)
plaintext = r.json()["key"]
```

#### `GET /keys/{hash}` — get one API key

- **operationId:** `getKey` · **Auth:** management key · **SDK:** TS `apiKeys.get({ hash })`, Python `api_keys.get(hash=...)`.
- Path: `hash` (string, required).
- **Response `200`:** `{"data": APIKey}`. **Errors:** `401`, `403`, `404`, `429`, `500`.

#### `PATCH /keys/{hash}` — update an API key

- **operationId:** `updateKeys` · **Auth:** management key · **SDK:** TS `apiKeys.update({ hash, requestBody })`.
- The body accepts only the fields below. **Unrecognized fields are ignored.** A body with none of the accepted fields fails with `400` `No update fields provided`.

| Body field | Type | Description |
| - | - | - |
| `name` | string, 1–256 | New name. |
| `disabled` | boolean | Disable or re-enable the key. |
| `limit` | number\|null, ≥0, <1,000,000 | New limit, USD. |
| `limit_reset` | enum `daily`\|`weekly`\|`monthly`\|`null` | New reset interval. Resets at midnight UTC; weeks run Mon–Sun. |
| `include_byok_in_limit` | boolean | Count BYOK usage toward the limit. |
| `workspace_id` | string (uuid) | **Move** the key to another workspace (see below). |

Moving a key with `workspace_id`:
- The key keeps its value.
- Guardrail selections move with it.
- Other workspace-scoped settings do **not** move: presets, BYOK keys, broadcast destinations, routing rules.
- Sending the key's current workspace is a no-op.

`expires_at` is not in the update schema, so set the expiry at creation.

**Response `200`:** `{"data": APIKey}`. **Errors:** `400`, `401`, `403`, `404`, `409`, `429`, `500`.

```bash
curl -X PATCH "https://openrouter.ai/api/v1/keys/$KEY_HASH" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Updated API Key Name","disabled":false,"limit":75,"limit_reset":"daily","include_byok_in_limit":true}'
```

#### `DELETE /keys/{hash}` — delete an API key

- **operationId:** `deleteKeys` · **Auth:** management key · **SDK:** TS `apiKeys.delete({ hash })`.
- **Response `200`:** `{"deleted": true}`. **Errors:** `401`, `403`, `404`, `429`, `500`.

#### Limits that apply to key endpoints

**Key-management daily limit**
- Applies to `POST /keys`, `PATCH /keys/{hash}` (including disabling a key), and `DELETE /keys/{hash}`. They share one limit of **10,000 requests/day** per account or organization by default, reset at 00:00 UTC.
- A request counts even when it fails, e.g. a `404` for an unknown key. Reading keys, usage, or credits does not count.
- Over the limit, requests fail with `429`. `X-RateLimit-Reset` gives the reset time in ms since the Unix epoch.
- For short-lived per-job keys, set `expires_at` at creation instead of deleting afterwards. That halves the counted requests.
- Contact support for a higher limit.

**Per-IP burst limits (per minute)**
- Counted separately for key writes, key reads (`GET /keys`, `GET /keys/{hash}`), and `GET /key` / `GET /credits`.
- `PATCH` and `DELETE` on `/keys/{hash}` share one count. Write limits are lower.
- These responses carry **no** `X-RateLimit-*` headers. Wait a few seconds, then retry with exponential backoff.

**Management keys**
- For organizations, only **Organization Admins** can create them.
- They are unscoped and cover all of the account's workspaces.
- The expiration is fixed at creation. After it passes, requests fail with `401` and the message `API key expired`.
- Management keys cannot call completion endpoints.

> The management-keys guide's TS snippet uses positional/flat forms (`apiKeys.get(keyHash)`, `apiKeys.update(keyHash, {...})`, `apiKeys.create({ name, limit })`). The generated SDK reference uses `apiKeys.get({ hash })`, `apiKeys.update({ hash, requestBody })`, and `apiKeys.create({ requestBody })`. Follow the SDK reference forms (see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go)).

Sources: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key, https://openrouter.ai/docs/api/api-reference/api-keys/list-api-keys, https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key, https://openrouter.ai/docs/api/api-reference/api-keys/get-a-single-api-key, https://openrouter.ai/docs/api/api-reference/api-keys/update-an-api-key, https://openrouter.ai/docs/api/api-reference/api-keys/delete-an-api-key, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/guides/overview/auth/oauth, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/client-sdks/typescript/sdks/apikeys/README

### 7.8 Analytics (activity, analytics meta & query)

All three operations require a **management key**. They are the programmatic side of the Activity dashboard ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) Activity). `/analytics/meta` and `/analytics/query` were previously tagged `beta.Analytics`; that tag has been removed.

#### `GET /activity` — activity grouped by endpoint

- **operationId:** `getUserActivity` · **SDK:** TS `analytics.getUserActivity()`, Python `analytics.get_user_activity()`.
- Daily usage rows grouped by endpoint for the **last 30 completed UTC days**.

| Query param | Type | Description |
| - | - | - |
| `date` | string `YYYY-MM-DD` | A single UTC date within the last 30 days. |
| `api_key_hash` | string | Filter by key hash (SHA-256 hex, as returned by the keys API). |
| `user_id` | string | Filter by org member user ID. Organization accounts only. |
| `workspace_id` | string (UUID) | Only activity attributed to that workspace. The workspace must belong to the authenticated account. |
| `group_by` | enum `workspace` | Split each row per workspace and add `workspace_id` to every item. When omitted, rows are aggregated across workspaces (by date, model, endpoint) and `workspace_id` is not returned (the historical shape). |

Activity recorded before workspaces existed is permanently attributed to the default workspace; no backfill is possible.

**Response `200`:** `{"data": ActivityItem[]}`

| Field | Type | Description |
| - | - | - |
| `date` | string | `YYYY-MM-DD`. |
| `model` | string | Model slug, e.g. `openai/gpt-4.1`. |
| `model_permaslug` | string | Model permaslug, e.g. `openai/gpt-4.1-2025-04-14`. |
| `endpoint_id` | string | Endpoint ID. |
| `provider_name` | string | Provider serving the endpoint. |
| `requests` | integer | Request count. |
| `prompt_tokens` | integer | Prompt tokens. |
| `completion_tokens` | integer | Completion tokens. |
| `reasoning_tokens` | integer | Reasoning tokens. |
| `cached_tokens` | integer | Prompt tokens read from the provider prompt cache. Usually a subset of `prompt_tokens`, but for replayed response-cache hits the provider may count disjoint token sets, so it can exceed `prompt_tokens`. |
| `usage` | number | Cost in USD (OpenRouter credits spent). |
| `byok_usage_inference` | number | BYOK inference cost in USD (external credits spent). |
| `workspace_id` | string (optional) | Present only with `group_by=workspace`. |

**Errors:** `400`, `401`, `403`, `404`, `500`.

```bash
curl "https://openrouter.ai/api/v1/activity?date=2025-08-24&group_by=workspace" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

```json
{ "data": [ { "date": "2025-08-24", "model": "openai/gpt-4.1", "model_permaslug": "openai/gpt-4.1-2025-04-14",
  "endpoint_id": "550e8400-e29b-41d4-a716-446655440000", "provider_name": "OpenAI", "requests": 5,
  "prompt_tokens": 50, "completion_tokens": 125, "reasoning_tokens": 25, "cached_tokens": 10,
  "usage": 0.015, "byok_usage_inference": 0.012 } ] }
```

#### `GET /analytics/meta` — metrics, dimensions, operators, granularities

- **operationId:** `getAnalyticsMeta` · **SDK:** TS `analytics.getAnalyticsMeta()`. No parameters. **Errors:** `401`, `403`, `500`.
- Call it to discover valid `metrics` and `dimensions` for `/analytics/query`.
- The spec does not list them. Names that appear in the docs:
  - Metrics: `request_count`, `total_usage`.
  - Dimensions: `model`, `generation_id`, `api_key_id`, `user`, `workspace`, `app`, `provider`, `origin`, `country`.

**Response `200`:** `{"data": {metrics, dimensions, operators, granularities}}`

| Array | Item fields |
| - | - |
| `metrics[]` | `name`: identifier used in queries. `display_label`. `display_format`: `number`, `currency`, `percent`, `latency`, or `throughput` (percent → multiply by 100 and append `%`; currency → prefix `$`). `is_rate`: boolean, true when the metric is a ratio that is averaged rather than summed. |
| `dimensions[]` | `name`, `display_label` |
| `operators[]` | `name`: `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`. `value_type`: `scalar` or `array`. |
| `granularities[]` | `name`: `minute`, `hour`, `day`, `week`, `month`. `display_label`. |

```json
{ "data": {
  "metrics": [ { "name": "request_count", "display_label": "Request Count", "display_format": "number", "is_rate": false } ],
  "dimensions": [ { "name": "model", "display_label": "Model" } ],
  "operators": [ { "name": "eq", "value_type": "scalar" } ],
  "granularities": [ { "name": "day", "display_label": "Day" } ] } }
```

#### `POST /analytics/query` — query analytics data

- **operationId:** `queryAnalytics` · **SDK:** TS `analytics.queryAnalytics({ requestBody })`, Python `analytics.query_analytics(...)`.
- The programmatic equivalent of Activity → Explore: choose metrics, group by up to two dimensions, filter, and pick a time granularity.

| Body field | Type | Req | Description |
| - | - | - | - |
| `metrics` | string[] (min 1) | ✓ | Metric names from `/analytics/meta`. |
| `dimensions` | string[] (max 2) | | Dimensions to group by. |
| `granularity` | string | | Time granularity (`minute`/`hour`/`day`/`week`/`month` per meta). |
| `time_range` | `{start, end}` (both required) | | ISO 8601 UTC date-times. **Must include seconds.** |
| `filters` | `Filter[]` (max 20) | | **ScalarFilter**: `{field, operator: eq\|neq\|gt\|gte\|lt\|lte, value: string\|number}`. **SetFilter**: `{field, operator: in\|not_in, value: (string\|number)[], include_unset?: boolean}`. `include_unset` keeps rows where the dimension has no value; it only applies to dimensions with an unset bucket. |
| `order_by` | `{field, direction: asc\|desc}` | | `field` is a metric in `metrics`, `"request_count"` (orderable even if not requested), a requested dimension, or `"date"`. |
| `limit` | integer | | Max total rows. Default **1000**. For time-series queries with dimensions and no explicit `group_limit`, the server may raise it to fit the expected bucket × dimension combinations. |
| `group_limit` | integer | | Max rows per distinct dimension combination. Auto-computed for time-series queries (granularity + dimensions) so time windows are not truncated. An explicit value lower than the bucket count truncates buckets. Ignored without dimensions. |
| `classifier_dimensions` | object | | Group by custom classifier tags (fields below). Requires an active classifier on the workspace. |
| `classifier_filters` | object | | Keep only generations with given classifier tag values (fields below). Can be used alone or with standard dimensions. |

`classifier_dimensions` fields:
- `classifier_id` (uuid, required).
- `dimension_names` (string[], max 2, snake_case, pattern `^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`). Each name becomes its own column; two names cross-group. With no names, rows carry `clf_dimension_name`/`clf_dimension_value` columns, one row per dimension/value pair.
- `include_nulls` (boolean, default `false`): also include untagged generations.

`classifier_filters` fields:
- `classifier_id` (uuid, required). Must equal `classifier_dimensions.classifier_id` when both are sent.
- `filters` (1–10 items, required). Each is `{field, operator: eq|neq, value: string|number}` or `{field, operator: in|not_in, value: (string|number)[]}`. Ordered comparisons are unavailable because classification values are strings.

**Filter values use underlying IDs, not the labels shown in responses:**
- `api_key_id`: numeric ID (from generation metadata) or the 64-char key hash from `GET /keys`, resolved server-side.
- `user`: Clerk user ID (e.g. `user_abc123`), not the display name.
- `workspace`: workspace UUID, not the name. Filtering or grouping by the default workspace also covers activity from before workspace resolution existed.
- `app`: numeric app ID, not the title.
- `model`: permaslug (e.g. `openai/gpt-4o`), not the display name.
- Other dimensions (`provider`, `origin`, `country`, …) are not enriched; pass the value as returned.

**Response `200`**

| Field | Type | Description |
| - | - | - |
| `data.data` | object[] | Rows of metric and dimension values. With `granularity: "day"`, the time bucket appears as `date__day` (spec example: `{"date__day": "2025-01-01T00:00:00.000Z", "request_count": 1500}`). |
| `data.metadata` | `{query_time_ms: number, row_count: integer, truncated: boolean}` | `truncated: true` means `limit`/`group_limit` cut rows. |
| `data.warnings` | string[] (optional) | Filter-resolution warnings, e.g. unresolvable `api_key_id` hashes. The query still runs normally. |
| `data.cachedAt` | number (optional) | No description in the spec. Note the camelCase name. |

**Errors:** `400`, `401`, `403`, `408` (operation exceeded time limit), `500`.

```bash
curl https://openrouter.ai/api/v1/analytics/query \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{
    "metrics": ["request_count", "total_usage"],
    "dimensions": ["model"],
    "granularity": "day",
    "time_range": { "start": "2025-01-01T00:00:00Z", "end": "2025-01-08T00:00:00Z" },
    "filters": [ { "field": "model", "operator": "in", "value": ["openai/gpt-4o"] } ],
    "order_by": { "field": "request_count", "direction": "desc" },
    "limit": 100
  }'
```

```typescript
const result = await admin.analytics.queryAnalytics({
  requestBody: {
    dimensions: ["model"],
    granularity: "day",
    limit: 100,
    metrics: ["request_count"],
    timeRange: { end: new Date("2025-01-08T00:00:00Z"), start: new Date("2025-01-01T00:00:00Z") },
  },
});
```

Classifier example: per-generation tags. Classification runs asynchronously, so the newest generations may not have tags yet.

```bash
curl https://openrouter.ai/api/v1/analytics/query \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{
    "metrics": ["total_usage"],
    "dimensions": ["generation_id"],
    "classifier_dimensions": { "classifier_id": "<classifier_id>", "dimension_names": ["department"] },
    "time_range": { "start": "2026-10-01T00:00:00Z", "end": "2026-10-02T00:00:00Z" },
    "limit": 1000
  }'
```

Each row has `generation_id`, a `department` column, and the requested metrics. Look up each ID with `GET /generation`. To find a classifier's UUID, open the workspace's Classifiers page and click a dimension badge. The Explore URL then contains `dimension=clf::<classifier_id>::<dimension_name>`.

Sources: https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity-grouped-by-endpoint, https://openrouter.ai/docs/api/api-reference/analytics/get-available-analytics-metrics-and-dimensions, https://openrouter.ai/docs/api/api-reference/analytics/query-analytics-data, https://openrouter.ai/docs/guides/features/activity, https://openrouter.ai/docs/guides/features/classifiers, https://openrouter.ai/docs/changelog, https://openrouter.ai/docs/client-sdks/typescript/sdks/analytics/README

### 7.9 OAuth (PKCE key exchange, workload identity token exchange, JWKS)

There are two unrelated flows here:
- **PKCE** (`/auth/keys/code`, `/auth/keys`): your users connect their own OpenRouter account and your app receives a user-controlled API key billed to them.
- **Workload identity federation** (`/oauth/token`, `/oauth/jwks`): your workloads swap an IdP-issued JWT for a short-lived OpenRouter access token.

The concepts, browser redirect parameters, and setup are in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy). This subsection is the endpoint contract.

#### PKCE flow at a glance

1. Send the user to `https://openrouter.ai/auth?callback_url=<URL>&code_challenge=<C>&code_challenge_method=S256`.
   - Optional query params: `key_label`, `workspace_id` (preselect), `required_workspace_id` (lock; takes precedence), `state` (echoed on the callback).
   - Localhost callbacks work on any port.
   - Headless mode: omit `callback_url`; `code_challenge` is then required, and the code is shown on screen for the user to paste.
2. The user returns to `callback_url?code=…`, or pastes the code in headless mode.
3. `POST /auth/keys` with the `code` and `code_verifier` returns `{ key }`.
4. Use `key` as a normal bearer API key.

For S256, `code_challenge` = base64url(sha256(`code_verifier`)). Codes are single-use and expire **10 minutes** after issuance.

#### `POST /auth/keys/code` — create an authorization code (API-driven PKCE)

- **operationId:** `createAuthKeysCode` · **Auth:** bearer API key per the spec (`401` documented) · **SDK:** TS `oAuth.createAuthCode({ requestBody })`, Python `o_auth.create_auth_code(...)`.
- Creates a PKCE authorization code server-side instead of through the browser `/auth` page. Exchange it with `POST /auth/keys`.

| Body field | Type | Req | Description |
| - | - | - | - |
| `callback_url` | string (uri) | ✓ | Redirect after authorization. `https` URLs, or `localhost`/`127.0.0.1` on any port (for local CLI tools). |
| `code_challenge` | string | | PKCE code challenge. |
| `code_challenge_method` | enum `S256`\|`plain` | | Challenge method. |
| `limit` | number | | Credit limit for the key that will be created. |
| `usage_limit_type` | enum `daily`\|`weekly`\|`monthly` | | Reset interval for that credit limit. |
| `expires_at` | string\|null (date-time) | | ISO 8601 UTC expiry for the key. **Must include seconds.** |
| `key_label` | string, max 100 | | Custom key label. Defaults to the app name. |
| `workspace_id` | string (uuid) | | Workspace to associate the key with. |

**Response `200`:** `{"data": {"id": "auth_code_xyz789", "app_id": 12345, "created_at": "2025-08-24T10:30:00Z"}}`
- `id` (string): the authorization code to send to `POST /auth/keys`.
- `app_id` (integer): the app the code belongs to.
- `created_at` (string): ISO 8601 creation time.

**Errors:** `400`, `401`, `403`, `409`, `500`.

```typescript
const result = await openRouter.oAuth.createAuthCode({
  requestBody: {
    callbackUrl: "https://myapp.com/auth/callback",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    codeChallengeMethod: "S256",
    limit: 100,
  },
});
```

#### `POST /auth/keys` — exchange an authorization code for an API key

- **operationId:** `exchangeAuthCodeForAPIKey` · **Auth:** the spec lists the global bearer scheme, but the guide calls it **without** an `Authorization` header (the code and verifier are the credential) · **SDK:** TS `oAuth.exchangeAuthCodeForAPIKey({ requestBody })`, Python `o_auth.exchange_auth_code_for_api_key(...)`.

| Body field | Type | Req | Description |
| - | - | - | - |
| `code` | string | ✓ | Code from the OAuth redirect (or from `POST /auth/keys/code`). |
| `code_verifier` | string | | Required if a `code_challenge` was used. |
| `code_challenge_method` | enum `S256`\|`plain`\|`null` | | Must match the method used in step 1. |

**Response `200`:**
- `key` (string): the user-controlled API key.
- `user_id` (string\|null): the user it belongs to.

```json
{ "key": "sk-or-v1-<redacted-example-key>", "user_id": "user_2yOPcMpKoQhcd4bVgSMlELRaIah" }
```

**Errors:**

| Status | Meaning |
| - | - |
| `400` | Spec: bad request. Guide: `Invalid code_challenge_method` (use the same method as step 1). |
| `403` | `Invalid code or code_verifier` (user must be logged in; verifier/method must be correct), or `Authorization code expired` (codes expire after 10 minutes). |
| `405` | Guide: use `POST` over HTTPS. |
| `500` | Server error. |

```typescript
const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: "S256" }),
});
const { key } = await res.json();

// Optional: link to the user's own logs/settings for this key
const keyHash = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))),
  (b) => b.toString(16).padStart(2, "0"),
).join("");
const logsUrl = `https://openrouter.ai/logs?api_key_hash=${keyHash}`;
const settingsUrl = `https://openrouter.ai/keys/${keyHash}`;
```

#### `POST /oauth/token` — exchange a workload identity token (RFC 8693)

- **operationId:** `createOauthToken` · **Auth:** none; the IdP JWT in the body is the credential · **SDK:** TS `oAuth.createOauthToken({ tokenExchangeRequest })`, Python `o_auth.create_oauth_token(...)`.
- **Plan:** workload identity federation requires a Business or Enterprise plan.
- **Setup:** an org admin configures issuers and policies under Settings → Workload identity (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).
- **Body:** `application/x-www-form-urlencoded`, total **< 32 KB**.

| Form field | Type | Req | Description |
| - | - | - | - |
| `grant_type` | enum | ✓ | Must be `urn:ietf:params:oauth:grant-type:token-exchange`. |
| `subject_token_type` | enum | ✓ | Must be `urn:ietf:params:oauth:token-type:jwt`. |
| `subject_token` | string, 1–16384 chars, pattern `^[\w-]+\.[\w-]+\.[\w-]+$` | ✓ | The JWT from your IdP. |
| `federation_policy_id` | string (uuid) | ✓ | Policy to evaluate, from Settings → Workload identity. Binds the exchange to one organization. |
| `requested_token_type` | enum | | If present, must be `urn:ietf:params:oauth:token-type:access_token`. |
| `scope` | enum `inference`\|`management` | | If present, must match the policy's key kind: `management` for a management key, `inference` otherwise. When omitted, the token gets the policy's scope. |
| `audience`, `resource` | — | | Accepted and ignored (guide). |

**Subject token requirements:**
- Signed `ES256` or `RS256` with a key published at the issuer's JWKS.
- Carries `iss`, `sub`, `aud`, `exp` and is not expired.
- `iss` equals the policy issuer URL, one `aud` equals the policy audience, and `sub` equals the policy subject when the policy sets one.
- Passes the policy's claim checks (`scopes` array, `token_type` string) and its CEL condition.
- Tokens whose `sub` or any `aud` value exceeds 512 chars, or whose `scopes` has more than 16 entries or an entry over 512 chars, are rejected before any rule runs.

**Response `200` (`TokenExchangeResponse`)**

| Field | Type | Description |
| - | - | - |
| `access_token` | string | Short-lived JWT. Send it as `Authorization: Bearer`. |
| `token_type` | enum `Bearer` | |
| `issued_token_type` | enum `urn:ietf:params:oauth:token-type:access_token` | |
| `expires_in` | integer | Seconds until expiry. At most 900 (15 min), and never later than the subject token's `exp`. |
| `scope` | string | `inference` (policy targets a workspace API key) or `management` (policy targets a management key). |

The access token acts as the targeted API key, and usage is attributed to that key. A `management` token is refused on inference endpoints, and an `inference` token is refused on management endpoints.

**Errors (`OAuthErrorResponse`: `{error, error_description}`)**

| HTTP | `error` | Meaning |
| - | - | - |
| 400 | `invalid_request` | Missing or malformed field, or `subject_token` isn't a JWT. |
| 400 | `unsupported_grant_type` | Wrong `grant_type`. |
| 400 | `invalid_scope` | Scope isn't `inference`/`management`, or isn't the scope the policy grants. |
| 400 | `invalid_grant` | Token not accepted: unknown or paused policy, claims don't match, bad signature, or expired. One generic message covers all of these so callers can't probe another org's configuration. |
| 413 | `invalid_request` | Body larger than 32 KB (guide). |
| 429 | `invalid_request` | Too many exchanges from one address. Honor `Retry-After`. |
| 500 | `server_error` | The token could not be issued. |
| 503 | `temporarily_unavailable` | The issuer's discovery document or JWKS could not be fetched. Retry shortly. |

```bash
curl https://openrouter.ai/api/v1/oauth/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d subject_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d federation_policy_id="$FEDERATION_POLICY_ID" \
  -d subject_token="$IDP_JWT"
# -> {"access_token":"<short-lived JWT>","issued_token_type":"urn:ietf:params:oauth:token-type:access_token","token_type":"Bearer","expires_in":900,"scope":"inference"}
```

```typescript
const result = await openRouter.oAuth.createOauthToken({
  tokenExchangeRequest: {
    federationPolicyId: process.env.FEDERATION_POLICY_ID!,
    grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
    subjectToken: idpJwt,
    subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
  },
});
```

**Revocation:** deleting or pausing a policy, deleting an issuer, or losing the entitlement stops *new* exchanges immediately. Tokens already issued stay valid until they expire (≤15 min). To cut access within that window, disable or delete the targeted API key; key state is checked on every request. Re-exchange before `expires_in` elapses.

#### `GET /oauth/jwks` — OpenRouter access-token signing keys

- **operationId:** `listOauthJwks` · **Auth:** public (published key set) · **SDK:** TS `oAuth.listOauthJwks()`.
- RFC 7517 JWK Set of the public keys OpenRouter uses to sign access tokens.
- Access tokens are JWTs with header `typ: at+jwt`, signed `ES256`.
- Token claims:
  - `sub`: the `sub` of the exchanged JWT.
  - `federation_policy_id` and `federation_issuer_id`: the policy and issuer that authorized the token. They are for your auditing; OpenRouter doesn't read them when authorizing.

**Response `200`:** `{"keys": [...]}` with at least one key. Each key has:

| Field | Value |
| - | - |
| `kty` | `EC` |
| `crv` | `P-256` |
| `alg` | `ES256` |
| `use` | `sig` |
| `kid` | string, minLength 1 |
| `x`, `y` | base64url strings (`^[A-Za-z0-9_-]+$`) |

**Errors:** `500` (signing keys are not configured).

```json
{ "keys": [ { "kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "or-2026-09",
  "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU", "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0" } ] }
```

Sources: https://openrouter.ai/docs/api/api-reference/oauth/create-authorization-code, https://openrouter.ai/docs/api/api-reference/oauth/exchange-authorization-code-for-api-key, https://openrouter.ai/docs/api/api-reference/oauth/exchange-a-workload-identity-token, https://openrouter.ai/docs/api/api-reference/oauth/openrouter-access-token-signing-keys, https://openrouter.ai/docs/guides/overview/auth/oauth, https://openrouter.ai/docs/guides/overview/auth/workload-identity-federation, https://openrouter.ai/docs/client-sdks/typescript/sdks/oauth/README

### 7.10 BYOK provider credentials

These endpoints manage bring-your-own-key credentials, i.e. your upstream provider keys. All require a **management key**. Routing semantics (priority, fallback, shared capacity, regions, ZDR) are in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) BYOK. This subsection is the API contract.

#### The `BYOKKey` object

| Field | Type | Description |
| - | - | - |
| `id` | string (uuid) | Stable public ID. |
| `provider` | `BYOKProviderSlug` | Upstream provider slug (list below). |
| `name` | string\|null (optional) | Human-readable name. |
| `label` | string | Masked key snippet for display, e.g. `sk-...AbCd`. The raw key is **never** returned. |
| `workspace_id` | string (uuid)\|null | Scoped workspace. **`null` = global**, usable across every workspace in the account; it does *not* mean the default workspace. |
| `disabled` | boolean | Disabled flag. |
| `sort_order` | integer | Position within the provider. Credentials are tried in ascending order. |
| `is_fallback` | boolean | Used only after the provider's non-fallback keys (and OpenRouter shared endpoints) have been tried. Cannot be combined with `is_byok_only`. |
| `is_required` | boolean | Removes OpenRouter shared endpoints on this provider **for the models this credential applies to** (its `allowed_models`, or all models if `null`). Models outside the allowlist may still use shared capacity. |
| `is_byok_only` | boolean | Removes shared endpoints on this provider **for every model**, including models outside `allowed_models` and after all your keys for the provider fail. The provider is skipped rather than spending OpenRouter credits. Only valid on non-fallback credentials. |
| `allowed_models` | string[]\|null (max 100) | Model-slug allowlist. `null` = no restriction. |
| `allowed_api_key_hashes` | string[]\|null (max 100) | Allowlist of OpenRouter API key hashes. `null` = no restriction. |
| `allowed_user_ids` | string[]\|null (max 100) | Allowlist of user IDs (Clerk IDs). `null` = no restriction. |
| `declared_region` | enum `global`\|`europe`\|`us`\|`null` | Your declaration of where the upstream account processes data, used for routing eligibility on regional hosts. `null` (undeclared) and `global` behave the same: the credential follows the region OpenRouter records for the endpoint. `europe`/`us` let requests to `eu.openrouter.ai`/`us.openrouter.ai` use this credential. For OpenAI and Fireworks the value must match the region in the key material. |
| `declared_zdr` | boolean\|null | Your ZDR declaration for the upstream account. `null` inherits OpenRouter's policy for the endpoint. `true` lets ZDR-required requests route to this credential even when the shared endpoint retains data. `false` means ZDR-required requests never route to it. Self-declared. |
| `created_at` | string | ISO timestamp. |

Shared-capacity settings (UI → API):

| UI setting | API fields |
| - | - |
| Use shared capacity (default) | `is_required: false`, `is_byok_only: false` |
| Never use shared capacity for models this key applies to | `is_required: true` |
| Never use shared capacity for any model on this provider | `is_byok_only: true` |

`is_required` and `is_byok_only` may both be `true`; `is_byok_only` then wins. Setting `is_byok_only: true` with `is_fallback: true` returns `400`. This applies whether both arrive in one request or the stored key already has the other flag.

**`BYOKProviderSlug` values (124):** `ai21`, `aion-labs`, `akashml`, `alibaba`, `amazon-bedrock`, `amazon-bedrock/claude-on-aws`, `amazon-nova`, `ambient`, `antdigital`, `anthropic`, `anthropic/2`, `arcee-ai`, `assemblyai`, `atlas-cloud`, `avian`, `azure`, `baidu`, `baseten`, `black-forest-labs`, `byteplus`, `cerebras`, `chutes`, `cirrascale`, `clarifai`, `claude-on-aws`, `cloudflare`, `cohere`, `coreweave`, `cosine`, `crusoe`, `darkbloom`, `databricks`, `decart`, `deepgram`, `deepinfra`, `deepseek`, `dekallm`, `digitalocean`, `elevenlabs`, `featherless`, `fireworks`, `fish-audio`, `friendli`, `gmicloud`, `google-ai-studio`, `google-vertex`, `groq`, `heygen`, `inception`, `inceptron`, `inferact-vllm`, `inference-net`, `infermatic`, `inflection`, `io-net`, `ionstream`, `krea`, `kt`, `liquid`, `makora`, `mancer`, `mara`, `meta`, `minimax`, `mistral`, `modal`, `modelrun`, `modular`, `moonshotai`, `morph`, `near-ai`, `nebius`, `nex-agi`, `nextbit`, `novita`, `nvidia`, `ollama`, `open-inference`, `openai`, `parallel`, `parasail`, `pareto-alpha`, `particle-ai`, `pearl-research`, `perceptron`, `perplexity`, `phala`, `poolside`, `primalabs`, `primeintellect`, `quiver`, `recraft`, `recursive`, `reka`, `relace`, `respan`, `river`, `runway`, `sail-research`, `sakana`, `sakana-ai`, `sambanova`, `scaledown`, `seed`, `siliconflow`, `sourceful`, `stepfun`, `streamlake`, `switchpoint`, `tencent`, `tenstorrent`, `thinkingmachines`, `together`, `typesafe`, `unbiased`, `upstage`, `venice`, `voyageai`, `wafer`, `wandb`, `wandb-legacy`, `xai`, `xiaomi`, `z-ai`.

**Key material formats** for `key` (details in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) BYOK):
- Most providers take the plain API key string.
- `azure` takes a JSON array of configs: Foundry `{api_key, resource_name, resource_type: "ai_foundry"|"openai"}` or per-deployment `{model_slug, endpoint_url, api_key, model_id}`.
- `amazon-bedrock` takes either a Bedrock API key string or JSON `{accessKeyId, secretAccessKey, region}`.
- `google-vertex` takes the service-account JSON, with an optional `region`.

**Omission vs `null` for the allowlists:**
- On **create**, omitting a field means no restriction. An array sets the restriction.
- On **update**, omitting a field leaves it unchanged. `null` clears it. An array replaces it.
- `allowed_api_key_hashes` rules:
  - Each entry must be exactly 64 lowercase hex chars and resolve to a live key in your account.
  - An empty array `[]` is rejected with `400`; use `null` to clear.
  - Unknown, cross-account, or malformed hashes → `400`.
  - Max 100 entries.

#### `GET /byok` — list BYOK credentials

- **operationId:** `listBYOKKeys` · **SDK:** TS `byok.list()` (async pages), Python `byok.list()`.
- Lists credentials in the **default workspace** unless `workspace_id` is passed.

| Query param | Type | Default | Description |
| - | - | - | - |
| `offset` | integer\|null ≥0 | 0 | Records to skip. |
| `limit` | integer 1–100 | 50 | Page size. |
| `workspace_id` | string (uuid) | default workspace | Scope to a workspace. If the default workspace has been deleted, omitting this returns `400`; pass it explicitly. |
| `provider` | `BYOKProviderSlug` | — | Filter by provider (e.g. `openai`, `anthropic`, `amazon-bedrock`). |

**Response `200`:** `{"data": BYOKKey[], "total_count": integer}`. **Errors:** `400`, `401`, `403`, `500`.

```json
{ "data": [ { "id": "11111111-2222-3333-4444-555555555555", "provider": "openai", "name": "Production OpenAI Key",
  "label": "sk-...AbCd", "workspace_id": "550e8400-e29b-41d4-a716-446655440000", "disabled": false, "sort_order": 0,
  "is_fallback": false, "is_required": false, "is_byok_only": false, "allowed_models": null,
  "allowed_api_key_hashes": null, "allowed_user_ids": null, "declared_region": null, "declared_zdr": null,
  "created_at": "2025-08-24T10:30:00Z" } ], "total_count": 1 }
```

#### `POST /byok` — create a BYOK credential

- **operationId:** `createBYOKKey` · **SDK:** TS `byok.create({ createBYOKKeyRequest })`, Python `byok.create(...)`.
- The raw key is encrypted at rest and never returned.
- Without `workspace_id`, the credential goes into the default workspace. If that workspace was deleted, the request returns `400`.

| Body field | Type | Req | Description |
| - | - | - | - |
| `provider` | `BYOKProviderSlug` | ✓ | Upstream provider. |
| `key` | string, minLength 1 | ✓ | Raw provider key or credential JSON. Write-only. |
| `name` | string\|null, max 255 | | Display name. |
| `workspace_id` | string (uuid) | | Workspace scope (default workspace if omitted). |
| `disabled` | boolean | | Create in a disabled state. |
| `is_fallback` | boolean | | Fallback key. Cannot be combined with `is_byok_only`. |
| `is_required` | boolean | | Default `false`. See the object table. |
| `is_byok_only` | boolean | | Default `false`. See the object table. |
| `allowed_models` | string[]\|null, max 100 | | Model allowlist. |
| `allowed_api_key_hashes` | string[]\|null, 1–100 | | Key-hash allowlist. Must contain at least one hash if provided. |
| `allowed_user_ids` | string[]\|null, max 100 | | Member allowlist. |
| `declared_region` | enum `global`\|`europe`\|`us`\|`null` | | Region declaration. |
| `declared_zdr` | boolean\|null | | ZDR declaration. |

**Response `201`:** `{"data": BYOKKey}`. **Errors:** `400`, `401`, `403`, `500`.

```bash
curl -X POST https://openrouter.ai/api/v1/byok \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "key": "sk-...",
    "name": "Production GPT-4o Key",
    "allowed_models": ["openai/gpt-4o", "openai/gpt-4o-mini"],
    "allowed_api_key_hashes": ["f01d52606dc8f0a8303a7b5cc3fa07109c2e346cec7c0a16b40de462992ce943"],
    "allowed_user_ids": ["user_2abc123"]
  }'
```

```typescript
const result = await admin.byok.create({
  createBYOKKeyRequest: {
    key: process.env.OPENAI_API_KEY ?? "",
    name: "Production OpenAI Key",
    provider: "openai",
  },
});
```

#### `GET /byok/{id}` — get a BYOK credential

- **operationId:** `getBYOKKey` · **SDK:** TS `byok.get({ id })`. Path `id`: string (uuid), required.
- **Response `200`:** `{"data": BYOKKey}`. **Errors:** `401`, `403`, `404`, `500`.

#### `PATCH /byok/{id}` — update / rotate a BYOK credential

- **operationId:** `updateBYOKKey` · **SDK:** TS `byok.update({ id, updateBYOKKeyRequest })`.
- Body fields (all optional):
  - `key`: rotates the key in place. Previous key material is overwritten and the masked `label` is regenerated.
  - `name`, `disabled`, `is_fallback`, `is_required`, `is_byok_only`, `allowed_models`, `allowed_api_key_hashes`, `allowed_user_ids`, `declared_region`, `declared_zdr`: same types as create.
- Omitted fields keep their stored values.
- `declared_region`: send `null` to clear it. For OpenAI and Fireworks, change it by sending a key whose material has the new region.
- `provider` and `workspace_id` cannot be changed; they are not in the update schema.
- **Response `200`:** `{"data": BYOKKey}`. **Errors:** `400`, `401`, `403`, `404`, `409`, `500`.

```bash
# Clear the API-key restriction
curl -X PATCH https://openrouter.ai/api/v1/byok/11111111-2222-3333-4444-555555555555 \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"allowed_api_key_hashes": null}'

# Never use shared capacity on this provider
curl -X PATCH https://openrouter.ai/api/v1/byok/11111111-2222-3333-4444-555555555555 \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"is_byok_only": true}'
```

#### `DELETE /byok/{id}` — delete a BYOK credential

- **operationId:** `deleteBYOKKey` · **SDK:** TS `byok.delete({ id })`.
- Soft delete: the encrypted key material is wiped and the record is marked deleted.
- **Response `200`:** `{"deleted": true}`. **Errors:** `401`, `403`, `404`, `500`.

Debugging BYOK: use `GET /generation`. Check `is_byok`, `upstream_inference_cost`, and `provider_responses[].status` for each attempt.

Sources: https://openrouter.ai/docs/api/api-reference/byok/list-byok-provider-credentials, https://openrouter.ai/docs/api/api-reference/byok/create-a-byok-provider-credential, https://openrouter.ai/docs/api/api-reference/byok/get-a-byok-provider-credential, https://openrouter.ai/docs/api/api-reference/byok/update-a-byok-provider-credential, https://openrouter.ai/docs/api/api-reference/byok/delete-a-byok-provider-credential, https://openrouter.ai/docs/guides/overview/auth/byok, https://openrouter.ai/docs/client-sdks/typescript/sdks/byok/README

### 7.11 Benchmarks

#### `GET /benchmarks` — unified benchmark scores

- **operationId:** `getBenchmarks` · **Auth:** any valid API key · **Rate limit:** 30 requests/minute per key and 500/day per account · **SDK:** TS `benchmarks.getBenchmarks()`, Python `benchmarks.get_benchmarks()`.
- Combines scores from three sources:
  - **Artificial Analysis** (intelligence, coding, and agentic indices).
  - **Design Arena** (ELO).
  - **OpenRouter's own evals**: tau-bench, GPQA, and web-search benchmarks.
- Filter by `source` to get the exact shapes of the legacy per-source endpoints. Use `task_type` to find models for a workload.
- OpenRouter search benchmarks (`task_type=search` or a `search_*` `benchmark_type`) publish each model's highest-scoring eligible evaluation configuration. Runs with the same configuration are combined by task-weighted mean.

| Query param | Type | Default | Description |
| - | - | - | - |
| `source` | enum `artificial-analysis`\|`design-arena`\|`openrouter` | all | Source to query. It determines the item shape. |
| `task_type` | enum `coding`\|`intelligence`\|`agentic`\|`search` | — | For AA, maps to the corresponding index. For Design Arena, maps to the matching category. `search` returns only OpenRouter search results. |
| `benchmark_type` | enum `gpqa_diamond`\|`tau_bench_verified_airline`\|`search_browsecomp`\|`search_hle`\|`search_dsqa`\|`search_widesearch` | — | One exact OpenRouter benchmark. A `search_*` value narrows the response to search results only. A classic value narrows the OpenRouter items and leaves other sources' items unchanged. |
| `include_run_config` | boolean | `false` | Search benchmarks only: include `run_config` (the published lane config whitelist) on each search item. |
| `search_engine` | string | — | Search benchmarks only: filter by search engine. |
| `search_surface` | enum `server-tool`\|`plugin` | — | Search benchmarks only: filter by request surface. |
| `arena` | enum `models`\|`builders`\|`agents` | `models` when `source=design-arena` | Design Arena only. |
| `category` | string | all | Design Arena only: category within the arena (e.g. `codecategories`, `uicomponent`, `gamedev`, `3d`, `dataviz`, `image`, `video`, `svg`). |
| `max_results` | integer ≥1 | all | Cap on returned items. |

**Response `200` (`UnifiedBenchmarksResponse`):** `{"data": Item[], "meta": Meta}`. Each item is one of four shapes, distinguished by `source` (and `benchmark_type` for OpenRouter items).

| Variant | Fields |
| - | - |
| **AA** (`source: "artificial-analysis"`) | `model_permaslug`, `display_name` (as listed on AA), `intelligence_index`, `coding_index`, `agentic_index` (number\|null, higher is better), `pricing` |
| **Design Arena** (`source: "design-arena"`) | `model_permaslug` (OpenRouter permaslug when mapped, otherwise the upstream Design Arena model ID), `display_name`, `arena`, `category`, `elo`, `win_rate` (0–100 %), `avg_generation_time_ms` (number\|null), `tournament_stats` `{first_place, second_place, third_place, fourth_place, total}` (int\|null), `pricing` |
| **OpenRouter classic** (`source: "openrouter"`, `benchmark_type: gpqa_diamond\|tau_bench_verified_airline`) | `model_permaslug`, `display_name`, `accuracy` (0–1), `accuracy_stddev` (number\|null; null for a single run), `avg_cost_per_task` (USD\|null), `total_tasks`, `last_run_timestamp` |
| **OpenRouter search** (`source: "openrouter"`, `benchmark_type: search_*`) | `model_permaslug`, `display_name`, `primary_metric` (`f1_by_item` for WideSearch, `accuracy` for the rest), `primary_score` (0–1), `avg_cost_per_task` (USD\|null), `avg_latency_per_task_ms` (number\|null), `total_tasks`, `last_run_timestamp` (newest qualifying run in the published lane), `search_engine`, `search_surface` (`server-tool`\|`plugin`), `run_config?` (see below) |

- `pricing` (`UnifiedBenchmarkPricing`, may be `null`) is `{prompt, completion}`, USD per token as decimal strings.
- `run_config` is `{max_agent_turns: int|null (null for plugin lanes), reasoning_effort: string|null, temperature: number|null}`. Only these three settings are public.

**`meta`**

| Field | Type | Description |
| - | - | - |
| `as_of` | string | ISO-8601 time of the last data update. |
| `source` | enum\|null | The source filter applied, or `null` for all sources. |
| `task_type` | string\|null | The task_type filter applied, or `null`. |
| `model_count` | integer | Unique models in the response. |
| `citation` | string\|null | **Required attribution** when republishing. `null` when results span sources; then attribute each item by its `source`. |
| `source_url` | string\|null | Upstream data URL, or `null` when results span sources. |
| `version` | enum `v1` | Dataset version. |

**Errors:** `400`, `401`, `429`, `500`.

```bash
curl "https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis&task_type=coding&max_results=20" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
curl "https://openrouter.ai/api/v1/benchmarks?task_type=search&include_run_config=true" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

```json
{ "data": [
  { "source": "artificial-analysis", "model_permaslug": "openai/gpt-4o", "display_name": "GPT-4o",
    "intelligence_index": 71.2, "coding_index": 65.8, "agentic_index": 58.3,
    "pricing": { "prompt": "0.0000025", "completion": "0.00001" } },
  { "source": "openrouter", "benchmark_type": "gpqa_diamond", "model_permaslug": "openai/gpt-4o", "display_name": "GPT-4o",
    "accuracy": 0.72, "accuracy_stddev": 0.03, "avg_cost_per_task": 0.002, "total_tasks": 300,
    "last_run_timestamp": "2026-06-03T12:00:00Z" } ],
  "meta": { "as_of": "2026-06-03T12:00:00Z", "citation": null, "model_count": 1, "source": null,
    "source_url": null, "task_type": null, "version": "v1" } }
```

Related: Model objects embed `benchmarks.artificial_analysis` and `benchmarks.design_arena` ([§7.2](#72-models)). `GET /models` can filter and sort by AA indices and Design Arena ELO.

Sources: https://openrouter.ai/docs/api/api-reference/benchmarks/list-benchmarks, https://openrouter.ai/docs/client-sdks/typescript/sdks/benchmarks/README

### 7.12 Classifications

#### `GET /classifications/task` — task-classification market share

- **operationId:** `getTaskClassifications` · **Auth:** any valid API key (same as inference) · **Rate limit:** 30/min per key, 500/day per account · **SDK:** TS `classifications.getTaskClassifications()`.
- Shows how OpenRouter traffic splits across task classifications (e.g. code generation, web search, summarization) over a trailing window.
- Shares are fractions (0–1) of **classified, sampled** requests (`usage_share`) and tokens (`token_share`).
- The unclassified `other` bucket is excluded. Absolute volumes are not exposed because the data is sampled.
- **Citation when republishing:** "Source: OpenRouter (openrouter.ai/rankings), as of {as_of}."

| Query param | Type | Default | Description |
| - | - | - | - |
| `window` | enum `7d` | `7d` | Trailing window. Only `7d` is supported. |

**Response `200`:** `{"data": {...}}`

| Field | Type | Description |
| - | - | - |
| `as_of` | string `YYYY-MM-DD` | UTC date of the window's upper bound (yesterday). The current incomplete UTC day is excluded. This is the expected latest date; it does not confirm that data exists for it. |
| `window_days` | integer | Trailing days covered. |
| `classifications[]` | array | Sorted by `usage_share` descending. Fields in the next table. |
| `macro_categories[]` | array | Fields in the last table below. |

`classifications[]` item fields:

| Field | Description |
| - | - |
| `tag` | Classification tag, e.g. `code:general_impl`, `agent:web_search`. |
| `display_name` | Display label. |
| `macro_category` | `code`, `data`, `agent`, or `general` (from the tag prefix). |
| `usage_share`, `token_share` | Fraction of all classified sampled requests / tokens (prompt + completion). The `other` bucket is excluded from the denominator. |
| `category_usage_share`, `category_token_share` | Share within the macro-category. Sums to 1 across that macro-category. |
| `models[]` | Top models by request volume: `{id (permaslug), tag_usage_share, tag_token_share}`. Shares sum to ≤1 because only the top N are listed and unattributed requests are excluded. |

`macro_categories[]` item fields: `key`, `label`, and `usage_share`, `token_share` (combined across the macro-category).

**Errors:** `400`, `401`, `429`, `500`.

```json
{ "data": { "as_of": "2026-06-17", "window_days": 7,
  "classifications": [ { "tag": "code:general_impl", "display_name": "Code Generation", "macro_category": "code",
    "usage_share": 0.23, "token_share": 0.31, "category_usage_share": 0.51, "category_token_share": 0.48,
    "models": [ { "id": "openai/gpt-4.1-mini", "tag_usage_share": 0.55, "tag_token_share": 0.75 } ] } ],
  "macro_categories": [ { "key": "code", "label": "Code", "usage_share": 0.45, "token_share": 0.52 } ] } }
```

These are platform-wide public classifications. They are unrelated to your own **custom classifiers**, which you query via `/analytics/query` `classifier_dimensions` ([§7.8](#78-analytics-activity-analytics-meta--query), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)).

Sources: https://openrouter.ai/docs/api/api-reference/classifications/task-classification-market-share, https://openrouter.ai/docs/client-sdks/typescript/sdks/classifications/README

### 7.13 Datasets (public usage data, CC BY 4.0)

Public OpenRouter usage datasets. The data is licensed under **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**: you may reuse and republish it, including commercially, **with attribution to OpenRouter**.

Common rules:
- **Auth:** any valid OpenRouter API key, the same one used for inference.
- **Rate limit:** 30 requests/minute per key and 500/day per account. This is stated for app-rankings and rankings-daily; the session-cost description doesn't repeat it.
- **Big numbers:** token totals are **decimal strings**, so 64-bit values aren't truncated. Parse them with `BigInt` or a decimal library.
- **Cross-provider caveat:** token counts come from each upstream provider's own tokenizer. A token in one row isn't directly comparable to a token from a different provider.
- **Date windows** (app-rankings, rankings-daily): `start_date`/`end_date` are `YYYY-MM-DD` UTC and inclusive.
  - `end_date` defaults to the most recent completed UTC day. It must be ≥ `2025-01-01`; earlier values return `400`.
  - `start_date` defaults to 30 days before `end_date`. Values before `2025-01-01` are clamped forward, and the resolved value is echoed in `meta.start_date`.
- **`meta` for date-window datasets** (`RankingsDailyMeta`):
  - `as_of`: ISO-8601 generation time. It reflects data freshness, since the underlying view ingests continuously.
  - `start_date`, `end_date`: the resolved window.
  - `version`: `"v1"`. Field names and grain are stable for the life of `v1`.

#### `GET /datasets/app-rankings` — top apps by token usage

- **operationId:** `getAppRankings` · **SDK:** TS `datasets.getAppRankings()` (async pages), Python `datasets.get_app_rankings()`.
- Matches the public apps marketplace at openrouter.ai/apps.
- Token totals = `prompt_tokens + completion_tokens`.
- Hidden and private apps are excluded. Traffic from app aliases is merged into the canonical visible app.
- **Citation:** "Source: OpenRouter (openrouter.ai/apps), as of {as_of}."

| Query param | Type | Default | Description |
| - | - | - | - |
| `sort` | enum `popular`\|`trending` | `popular` | `popular`: total token volume in the window. `trending`: absolute excess growth, i.e. window volume minus the average of the three equal-length preceding periods. Apps with no excess growth are omitted, so `trending` may return fewer than `limit` rows. |
| `category` | enum `coding`\|`creative`\|`productivity`\|`entertainment` | — | Marketplace category group. |
| `subcategory` | enum `cli-agent`, `ide-extension`, `cloud-agent`, `programming-app`, `native-app-builder`, `creative-writing`, `video-gen`, `image-gen`, `audio-gen`, `roleplay`, `game`, `writing-assistant`, `general-chat`, `personal-agent`, `legal` | — | Takes precedence over `category`. If both are sent they must be consistent. |
| `start_date` / `end_date` | `YYYY-MM-DD` | see above | Window. |
| `limit` | integer 1–100 | 50 | Rows. |
| `offset` | integer\|null 0–100 | 0 | Rows to skip. `rank` stays absolute, so the first row at `offset=50` is `rank: 51`. |

Ranks are renumbered 1..N after category filtering.

**Response `200`:** `{"data": AppRankingsItem[], "meta": RankingsDailyMeta}`. Item fields:
- `rank` (int, 1-based)
- `app_id` (int, stable)
- `app_name` (string)
- `total_requests` (int)
- `total_tokens` (**string**)

```bash
curl "https://openrouter.ai/api/v1/datasets/app-rankings?subcategory=cli-agent&sort=trending&limit=20" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

```json
{ "data": [ { "rank": 1, "app_id": 12345, "app_name": "Cline", "total_requests": 4321, "total_tokens": "12345678" } ],
  "meta": { "as_of": "2026-05-12T02:00:00Z", "start_date": "2026-04-12", "end_date": "2026-05-11", "version": "v1" } }
```

#### `GET /datasets/rankings-daily` — daily token totals for the top 50 models

- **operationId:** `getRankingsDaily` · **SDK:** TS `datasets.getRankingsDaily()`, Python `datasets.get_rankings_daily()`.
- Returns the top 50 public models per day by total tokens (`prompt + completion`), plus one aggregated `other` row per day for everything outside the top 50. This matches the openrouter.ai/rankings chart.
- Each row is a distinct `(date, model_permaslug)`.
- The `other` row uses the reserved permaslug `other`. It is always last within its date and is omitted when the long tail is empty. Top-50 share of a day = sum of real rows / sum of all rows.
- Sorting: `date` ascending, then `total_tokens` descending. Ties break alphabetically by `model_permaslug`.
- **Citation:** "Source: OpenRouter (openrouter.ai/rankings), as of {as_of}."

| Query param | Type | Default | Description |
| - | - | - | - |
| `start_date` / `end_date` | `YYYY-MM-DD` | see above | Window. |
| `period` | enum `day`\|`week`\|`month` | `day` | Row grain. `week` buckets by ISO week start, `month` by month start. With `category` or `language_type`, only `week` (their default) and `month` are allowed; `day` → `400`. For those sampled datasets, `month` buckets each week by its week-start month, so month-boundary totals are approximate. |
| `modality` | enum `text`\|`image`\|`image_output`\|`audio`\|`tool_calling` | — | Exact dataset. `text`/`image_output` match output modality. `image`/`audio` match input modality. `tool_calling` keeps rows with at least one tool call. |
| `context_bucket` | enum `1K`\|`10K`\|`100K`\|`1M`\|`10M` | — | Exact dataset: request context-length bucket. |
| `category` | enum `programming`, `roleplay`, `marketing`, `marketing/seo`, `technology`, `science`, `translation`, `legal`, `finance`, `health`, `trivia`, `academia` | — | **Sampled, upsampled** dataset. `total_tokens` is an estimate aggregated weekly, and the trailing weekly bucket may include traffic past `end_date`. |
| `language_type` | enum `natural`\|`programming` | — | Sampled dataset, same caveats as `category`. |

**Filter compatibility:**
- `category` and `language_type` cannot be combined with each other or with `modality`/`context_bucket`.

**Response `200`:** `{"data": RankingsDailyItem[], "meta": RankingsDailyMeta}`. Item fields:
- `date` (`YYYY-MM-DD`)
- `model_permaslug`: non-default variants carry a `:variant` suffix and rank as their own entries, e.g. `openai/gpt-4o-2024-05-13:free`.
- `total_tokens` (**string**)

Up to 51 rows per day.

```json
{ "data": [
  { "date": "2026-05-11", "model_permaslug": "openai/gpt-4o-2024-05-13", "total_tokens": "12345678" },
  { "date": "2026-05-11", "model_permaslug": "anthropic/claude-3.5-sonnet-20241022", "total_tokens": "9876543" },
  { "date": "2026-05-11", "model_permaslug": "other", "total_tokens": "4321098" } ],
  "meta": { "as_of": "2026-05-12T02:00:00Z", "end_date": "2026-05-11", "start_date": "2026-04-12", "version": "v1" } }
```

```bash
curl "https://openrouter.ai/api/v1/datasets/rankings-daily?period=week&modality=tool_calling&start_date=2026-01-01" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### `GET /datasets/session-cost` — cost per session by harness and model

- **operationId:** `getSessionCost` · **SDK:** TS `datasets.getSessionCost()` (async pages), Python `datasets.get_session_cost()`.
- Aggregated cost-per-session cells for the published harnesses, refreshed weekly.
- Sessions are never pooled across apps. Medians are of per-session USD spend.
- Privacy-preserving aggregation never exposes `clerk_user_id` values or per-session rows.
- Filtering by `model` alone compares harnesses at a fixed model.

| Query param | Type | Default | Description |
| - | - | - | - |
| `app_slug` | string | — | One published harness slug. |
| `model` | string | — | Exact model permaslug. Works across all harness apps. |
| `turn_range` | enum `1-turn`\|`2-9-turns`\|`10-49-turns`\|`50-plus-turns` | — | Inclusive session turn-count range. |
| `limit` | integer 1–500 | 100 | Cells. |
| `offset` | integer\|null 0–5000 | 0 | Sorted cells to skip. |

**Response `200`:** `{"data": SessionCostItem[], "meta": SessionCostMeta}`

Item fields:
- `app_slug`, `app_name`: harness slug and display label.
- `model_permaslug`
- `turn_range`
- `median_session_cost_usd` (number)

`meta` fields:
- `as_of`
- `version`: `"v1"`.
- `window_days` (int\|null): days in the weekly sample window.
- `window_end_date` (string\|null): last day of the window.
- `window_days` and `window_end_date` are `null` when no snapshot is published.

```json
{ "data": [ { "app_name": "Hermes Agent", "app_slug": "hermes-agent", "median_session_cost_usd": 1.74,
  "model_permaslug": "anthropic/claude-4.8-opus", "turn_range": "10-49-turns" } ],
  "meta": { "as_of": "2026-05-12T02:00:00.000Z", "version": "v1", "window_days": 30, "window_end_date": "2026-05-11" } }
```

**Errors (all datasets):** `400` (bad or conflicting filters, out-of-range dates), `401`, `429`, `500`.

Sources: https://openrouter.ai/docs/api/api-reference/datasets/top-apps-by-token-usage, https://openrouter.ai/docs/api/api-reference/datasets/daily-token-totals-for-top-50-models, https://openrouter.ai/docs/api/api-reference/datasets/cost-per-session-by-harness-and-model, https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README

### 7.14 External users

An **external user** registration records a caller-supplied tracking ID under your **organization**. It is the same string you send as `user` on inference requests or as `external.user` when creating an API key with `POST /keys`. A registration creates no login account, policy, or credentials. Registration state (`is_active`) is **not** an inference authorization decision: deactivating a user doesn't block their requests.

All five operations require a **management key**. These endpoints were renamed from `/end-users`:
- Requests to `/end-users` and `/end-users/{user}` are still forwarded.
- Python SDK ≥1.3.70 uses `external_users`; the old `end_users` namespace was removed.
- TS SDK ≥1.5.0 uses `externalUsers`; `endUsers` remains as an alias.

**`ExternalUser` object**

| Field | Type | Description |
| - | - | - |
| `user` | string | The tracking ID. Immutable and case-sensitive. 1–512 chars, well-formed Unicode, no NUL, no leading or trailing whitespace (pattern `^(?!\s)(?![\s\S]*\s$)[^\u0000]+$`). |
| `is_active` | boolean | Registration state only. |
| `created_at` | string (date-time) | Registration creation time. |
| `updated_at` | string (date-time) | Last lifecycle update. |

No generated public identifier is returned. The `user` string is the key. **URL-encode it in paths.** IDs `.` or `..` can't be addressed by path; look them up with `GET /external-users?user=`.

#### `GET /external-users` — list registrations

- **operationId:** `listExternalUsers` · **SDK:** TS `externalUsers.list()` (async pages), Python `external_users.list()`.

| Query param | Type | Default | Description |
| - | - | - | - |
| `offset` | integer\|null ≥0 | 0 | Records to skip. |
| `limit` | integer 1–100 | 50 | Page size. |
| `user` | string (same constraints) | — | Exact tracking-ID filter. |
| `include_inactive` | boolean | `false` | Include deactivated registrations. Inactive ones are excluded by default. |

**Response `200`:** `{"data": ExternalUser[], "total_count": integer}`. `total_count` is the number of matches before pagination. **Errors:** `400`, `401`, `403`, `404`, `500`.

```json
{ "data": [ { "user": "employee_123", "is_active": true, "created_at": "2026-09-16T12:00:00Z", "updated_at": "2026-09-16T12:00:00Z" } ], "total_count": 1 }
```

#### `POST /external-users` — register

- **operationId:** `createExternalUser` · **SDK:** TS `externalUsers.create({ createExternalUserRequest: { user } })`.
- Body: `{ "user": string }` (required; same constraints as above).
- **Response `201`:** `{"data": ExternalUser}`.
- **Errors:** `400`, `401`, `404`, `409` (the tracking ID is already registered in this org, active or not), `500`.

```bash
curl -X POST https://openrouter.ai/api/v1/external-users \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"user":"employee_123"}'
```

#### `GET /external-users/{user}` — get one (active or inactive)

- **operationId:** `getExternalUser` · **SDK:** TS `externalUsers.get({ user })`. Path `user` is URL-encoded.
- **Response `200`:** `{"data": ExternalUser}`. **Errors:** `400`, `401`, `403`, `404`, `500`.

#### `PATCH /external-users/{user}` — update state (also how you reactivate)

- **operationId:** `updateExternalUser` · **SDK:** TS `externalUsers.update({ user, updateExternalUserRequest: { isActive } })`.
- Body: `{ "is_active": boolean }` (required). It changes registration state only and does not enforce inference access. Identity is unchanged.
- **Response `200`:** `{"data": ExternalUser}`. **Errors:** `400`, `401`, `404`, `500`.

#### `DELETE /external-users/{user}` — deactivate (soft)

- **operationId:** `deleteExternalUser` · **SDK:** TS `externalUsers.delete({ user })`, which has no return value.
- Soft-deactivates the registration and keeps the tracking ID. Repeating it succeeds. It doesn't block inference; reactivate with `PATCH`.
- **Response `204`** (no body). **Errors:** `400`, `401`, `404`, `500`.

```typescript
await admin.externalUsers.update({ user: "employee_123", updateExternalUserRequest: { isActive: true } });
await admin.externalUsers.delete({ user: "employee_123" });
// Path-encode IDs yourself when using fetch:
await fetch(`https://openrouter.ai/api/v1/external-users/${encodeURIComponent("team/alice@example.com")}`, {
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_MANAGEMENT_KEY}` },
});
```

Sources: https://openrouter.ai/docs/api/api-reference/external-users/list-registered-external-users, https://openrouter.ai/docs/api/api-reference/external-users/register-an-external-user, https://openrouter.ai/docs/api/api-reference/external-users/get-a-registered-external-user, https://openrouter.ai/docs/api/api-reference/external-users/update-a-registered-external-user, https://openrouter.ai/docs/api/api-reference/external-users/deactivate-a-registered-external-user, https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key, https://openrouter.ai/docs/changelog, https://openrouter.ai/docs/client-sdks/typescript/sdks/externalusers/README

### 7.15 Organization

All three operations require a **management key created in an organization**. The organization is the one the key belongs to and can't be chosen per request. A management key from a **personal account gets `404`**.

#### `GET /organization/members` — list members

- **operationId:** `listOrganizationMembers` · **SDK:** TS `organization.listMembers()` (async pages), Python `organization.list_members()`.

| Query param | Type | Default | Description |
| - | - | - | - |
| `offset` | integer\|null ≥0 | 0 | Records to skip. |
| `limit` | integer 1–100 | 50 | Page size. |

**Response `200`:** `{"data": Member[], "total_count": integer}`. Member fields:
- `id`: user ID, e.g. `user_2dHFt…`.
- `email`
- `first_name` (string\|null), `last_name` (string\|null)
- `role`: `org:admin`, `org:member`, or `org:viewer`. `org:viewer` is **coming soon / not yet available**. Once launched it will be read-only at org level (view settings, billing, workspaces), while workspace roles can still grant write access in specific workspaces.

**Errors:** `401`, `403`, `404`, `500`.

```json
{ "data": [ { "id": "user_2dHFtVWx2n56w6HkM0000000000", "email": "jane.doe@example.com", "first_name": "Jane", "last_name": "Doe", "role": "org:member" } ], "total_count": 25 }
```

Member IDs from this list are what BYOK `allowed_user_ids`, `GET /activity?user_id=`, and analytics `user` filters expect.

#### `GET /organization/settings` — get settings

- **operationId:** `getOrganizationSettings` · **SDK:** TS `organization.getSettings()`.
- **Response `200`:** `{"data": {"id": "org_…", "is_filtered_model_catalog_enabled": boolean}}`. **Errors:** `401`, `403`, `404`, `500`.

#### `PATCH /organization/settings` — update settings

- **operationId:** `updateOrganizationSettings` · **SDK:** TS `organization.updateSettings({ updateOrganizationSettingsRequest: { isFilteredModelCatalogEnabled } })`.
- Body: `{ "is_filtered_model_catalog_enabled": boolean }` (required).
- **Response `200`:** the persisted settings `{"data": OrganizationSettings}`. **Errors:** `400`, `401`, `403`, `404`, `500`.

`is_filtered_model_catalog_enabled` (default `false`) is the same switch as Settings → Privacy → "Filter the model catalog for API keys". The two sources describe it differently:
- **Guide:** when enabled, `GET /models` called with one of the org's API keys returns only the models that key can use (the `/models/user` catalog), and the signed-in dashboard shows the same list. Requests without a key still get the public catalog. The active workspace's guardrails and provider preferences decide which models remain; enabling the switch doesn't change them.
- **Spec field description:** the setting affects only the dashboard, and `GET /models` with an API key **always** returns only the models that key can use, whatever the setting.

If you need a guaranteed per-key view, call `GET /models/user`.

```bash
curl https://openrouter.ai/api/v1/organization/settings -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
curl -X PATCH https://openrouter.ai/api/v1/organization/settings \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"is_filtered_model_catalog_enabled": true}'
# -> {"data":{"id":"org_2dHFtVWx2n56w6HkM0000000000","is_filtered_model_catalog_enabled":true}}
```

Sources: https://openrouter.ai/docs/api/api-reference/organization/list-organization-members, https://openrouter.ai/docs/api/api-reference/organization/get-organization-settings, https://openrouter.ai/docs/api/api-reference/organization/update-organization-settings, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/client-sdks/typescript/sdks/organization/README

### 7.16 Gotchas and decision guide

**Which key?**
- **Management key required:**
  - `/credits`, `/generation/feedback`
  - `/keys`, `/keys/{hash}`
  - `/activity`, `/analytics/meta`, `/analytics/query`
  - `/byok*`, `/external-users*`, `/organization/*`
- **Regular API key works:**
  - `/key`
  - `/generation`, `/generation/content`
  - `/models/user`
  - `/benchmarks`, `/classifications/task`, `/datasets/*`
- **No key needed** (docs call them anonymously):
  - `/models`, `/models/count`, `/model/{author}/{slug}`
  - `/models/{author}/{slug}/endpoints`, `/endpoints/zdr`
  - `/auth/keys`, `/oauth/token`, `/oauth/jwks`
- Management keys **cannot** run inference, and inference keys get rejected on management routes.
- For workload-identity tokens, the `scope` (`inference` or `management`) decides which family works.
- `/organization/*` with a personal-account management key returns `404`, not `403`.

**Catalog**
- `GET /models` returns **text-output models only** unless you pass `output_modalities` (or `all`) or `endpoints`. Image, embedding, rerank, TTS/STT, video, and decision models are hidden by default. Pass the same `output_modalities` to `/models/count` so the counts match.
- Price **filters** take **$/1M tokens** (`max_price=1` means $1 per 1M). Price **fields** are **USD per token strings** (`"0.000001"`). Parse prices as decimals, not floats, if you do exact billing math.
- Region filter value is `eu`/`us` on `/models`. Guardrails, BYOK `declared_region`, `/key.allowed_data_regions`, and generation `data_region` use `europe`/`us`/`global`.
- `pricing.overrides`: the top-level price is the *current/default* price. Apply overrides by condition, later entries win per key, and skip entries with unknown condition fields.
- `top_provider.max_completion_tokens` and endpoint `max_completion_tokens` are ceilings. Input and output share the context window.
- The field is `expiration_date` (not `expiration`). `per_request_limits` and `default_parameters` are often `null`. `reasoning` and `benchmarks` are **omitted** (not `null`) when not applicable.
- Single-model lookup is singular `/model/{author}/{slug}`. Endpoint listing is plural `/models/{author}/{slug}/endpoints`.
- Routing variants (`:nitro`, `:floor`, `:exacto`) aren't catalog entries; lookups return the base model. A missing catalog variant (e.g. a nonexistent `:free`) gives **404** on `/model/...` but **200 with `endpoints: []`** on `/models/.../endpoints`. Don't retry with the base slug.
- Endpoint `latency_last_30m`, `throughput_last_30m`, and `perf_last_30m_by_workload` are `null` without auth. Send a key if you rank providers by speed.
- Throughput percentiles are "speed reached or exceeded", so **p90 < p50**.
- `supports_tool_choice` tells you which `tool_choice` values actually work. `"tool_choice"` in `supported_parameters` only means the parameter is accepted.

**Stats & content**
- `GET /generation/content` only returns content if Input & Output Logging was on when the generation ran.
- Feedback is once per generation (`409` on repeat).
- `cache_discount` can be negative (cache writes).
- `provider_responses` lists every attempt, which helps when debugging fallbacks and BYOK.

**Keys**
- The plaintext key is returned only once (`POST /keys` → `key`; `POST /auth/keys` → `key`).
- Timestamps must include seconds: `expires_at`, analytics `time_range`.
- `expires_at` can't be changed via `PATCH`. Rotate by creating a new key.
- `PATCH /keys/{hash}` silently ignores unknown fields, and returns `400 No update fields provided` if none are recognized. Don't send camelCase over raw HTTP.
- `GET /keys` defaults to the default workspace (org-scoped management key), returns 100 per page, has no `limit`, and excludes expired keys unless `include_expired=true`.
- Moving a key between workspaces doesn't move its presets, BYOK keys, broadcast destinations, or routing rules.
- Key writes share a 10,000/day account limit, counted even when the request fails.
- `/key`, `/keys*`, and `/credits` have per-IP burst limits with no `X-RateLimit-*` headers; back off exponentially.
- In `/key`, `limit`/`limit_remaining` cover **only** the key's own cap. Guardrail and workspace budgets are in `budgets`/`effective_budget`, and any layer with `remaining_usd ≤ 0` causes `403`. `rate_limit` is deprecated (ignore it), and `is_provisioning_key` is a deprecated alias of `is_management_key`.

**BYOK**
- The raw key is never returned. `label` is a masked snippet.
- `workspace_id: null` means **global** (all workspaces), not "default workspace".
- `allowed_api_key_hashes: []` → `400`. Use `null` to clear it, or omit it to leave it unchanged.
- `is_byok_only` + `is_fallback` → `400`.
- If the default workspace was deleted, list/create without `workspace_id` → `400`.

**Analytics**
- Filters need underlying IDs (model permaslug, workspace UUID, Clerk user ID, numeric app ID, key hash or numeric key ID), not display labels.
- Check `metadata.truncated` and `warnings`.
- `/activity` only covers the last 30 completed UTC days. Rows omit `workspace_id` unless `group_by=workspace`.

**Datasets / benchmarks / classifications**
- 30 req/min per key, 500/day per account.
- Token totals are strings.
- Attribution is required: datasets are CC BY 4.0, and benchmarks give `meta.citation`.
- `category`/`language_type` in rankings-daily are sampled estimates that can't mix with exact filters and reject `period=day`.
- `trending` app rankings may return fewer rows than `limit`.

**OAuth**
- PKCE codes expire after 10 minutes. Use the same `code_challenge_method` in both steps.
- Workload-identity tokens last ≤15 min, are not revocable before expiry (disable the target key instead), and require a form-encoded body under 32 KB.
- `invalid_grant` is deliberately generic.

**External users**
- Deactivation is bookkeeping only and does not block inference.
- URL-encode IDs in paths.
- A re-registration returns `409` even if the user is inactive; reactivate with `PATCH`.
- `/end-users` paths still forward, but use `/external-users`.

**Deprecated / removed**
- `POST /credits/coinbase` always returns `410`.
- `/key.rate_limit` and `/key.is_provisioning_key` are deprecated.
- `org:viewer` role is not yet available.

Sources: https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/guides/overview/models, https://openrouter.ai/docs/guides/routing/model-variants/overview, https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/guides/overview/auth/byok, https://openrouter.ai/docs/guides/overview/auth/oauth, https://openrouter.ai/docs/guides/overview/auth/workload-identity-federation, https://openrouter.ai/docs/guides/features/logs, https://openrouter.ai/docs/changelog
