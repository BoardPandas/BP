# OpenRouter Reference — 4. API fundamentals

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 03-client-sdks.md](03-client-sdks.md) · [Next: 05-endpoints-core-inference.md →](05-endpoints-core-inference.md)

## 4. API fundamentals

Cross-cutting behavior of the OpenRouter HTTP API: base URL, request formats, authentication and headers, generation parameters, streaming (SSE), limits, errors and debugging, versioning, plus the Responses API and Embeddings guides. Field-by-field endpoint schemas live in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)–[§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise).

**Quick facts**

| Item | Value |
| - | - |
| Base URL | `https://openrouter.ai/api/v1` (only version: `v1`, selected by path) |
| Auth | `Authorization: Bearer <OPENROUTER_API_KEY>` |
| OpenAPI spec | `https://openrouter.ai/openapi.yaml`, `https://openrouter.ai/openapi.json` |
| Text inference endpoints | `POST /responses`, `POST /chat/completions`, `POST /messages` (Anthropic format) |
| Streaming | `stream: true` → Server-Sent Events; ignore lines starting with `:` |
| Generation ID | `X-Generation-Id` response header on all inference endpoints; query with `GET /generation?id=gen-...` |
| Key/limit introspection | `GET /key` |
| Changelog | `https://openrouter.ai/docs/changelog` (RSS: `https://openrouter.ai/docs/changelog/rss.xml`) |

### 4.1 API overview

OpenRouter's request and response schemas are very close to OpenAI's. OpenRouter **normalizes the schema across models and providers**, so one request shape works for every model; OpenRouter transforms it for each upstream provider.

#### Base URL and OpenAPI specification

- Base URL: `https://openrouter.ai/api/v1`. The OpenAPI spec's single server is `https://openrouter.ai/api/v1` ("Production server"). Endpoint paths in this document are relative to it unless written in full.
- Spec downloads: YAML `https://openrouter.ai/openapi.yaml`, JSON `https://openrouter.ai/openapi.json`. Use them with Swagger UI, Postman, or any OpenAPI code generator.
- The spec declares `bearer`/`apiKey` HTTP bearer security schemes ("API key as bearer token in Authorization header").

#### The three request formats

The overview page describes two request shapes (Responses and Chat Completions). The errors page and the OpenAPI spec describe a third "skin", the Anthropic Messages format. All three use the same models, routing, plugins, and billing; they differ in wire format.

| Format | Endpoint | Request core | Response core | Stream terminator | Use when |
| - | - | - | - | - | - |
| Responses API (OpenAI Responses-compatible, **stateless**) | `POST /api/v1/responses` | `input` (string or item array), `instructions`, `max_output_tokens` | `output[]` items (`message`, `reasoning`, `function_call`, server-tool items); `usage.input_tokens/output_tokens` | `response.completed` / `response.failed` / `response.incomplete` event, then `data: [DONE]` | New code; the docs list it first; typed items for reasoning, tools, server tools |
| Chat Completions (OpenAI Chat-compatible) | `POST /api/v1/chat/completions` | `messages[]`, `max_tokens`/`max_completion_tokens` | `choices[]` with `message` (or `delta` when streaming); `usage.prompt_tokens/completion_tokens` | Final usage chunk, then `data: [DONE]` | Existing OpenAI Chat code, most third-party frameworks |
| Anthropic Messages | `POST /api/v1/messages` | Anthropic `messages`, `system`, `max_tokens`, `output_config` | Anthropic message `content[]` blocks | `message_stop` event (no `[DONE]` since 2026-10-21) | Anthropic SDKs / Claude Agent SDK / Claude Code pointed at OpenRouter |

Decision guidance:

- Starting fresh in TypeScript/Python: Responses API (or the Agent SDK in [§2](02-agent-sdk.md#2-agent-sdk-openrouteragent), which is built on it).
- Porting OpenAI Chat code or using a framework that speaks Chat Completions: Chat Completions. Only the base URL and key change.
- Using Anthropic's SDKs or tools: Messages API. For the Anthropic SDK family the base URL is `https://openrouter.ai/api` (the SDK appends `/v1/messages`), e.g. `ANTHROPIC_BASE_URL="https://openrouter.ai/api"`, `ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"`, `ANTHROPIC_API_KEY=""` (must be explicitly empty) for the Claude Agent SDK (see [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)).
- Endpoint field schemas: [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference).

#### Responses API request format

A Responses request takes `input` (a string or an array of input items), optional `instructions`, and the same routing fields as Chat Completions (`models`, `provider`, `plugins`, `user`). Full schema: [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) and [§4.8](#48-responses-api-guide).

```json
{
  "model": "openai/gpt-5.2",
  "instructions": "Answer in one sentence.",
  "input": "What is the meaning of life?",
  "max_output_tokens": 256
}
```

#### Chat Completions request format

Body of `POST /api/v1/chat/completions`, as the overview page's TypeScript type (complete parameter list: [§4.3](#43-parameters); full schema: [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)):

```typescript
// Definitions of subtypes are below
type Request = {
  // Either "messages" or "prompt" is required
  messages?: Message[];
  prompt?: string;

  // If "model" is unspecified, uses the user's default
  model?: string; // See "Supported Models" section

  // Allows to force the model to produce specific output format.
  response_format?: ResponseFormat;

  stop?: string | string[];
  stream?: boolean; // Enable streaming

  // Plugins to extend model capabilities (PDF parsing, response healing)
  plugins?: Plugin[];

  // See LLM Parameters (openrouter.ai/docs/api_reference/parameters)
  max_tokens?: number; // Range: [1, context_length)
  temperature?: number; // Range: [0, 2]

  // Tool calling
  // Will be passed down as-is for providers implementing OpenAI's interface.
  // For providers with custom interfaces, we transform and map the properties.
  // Otherwise, we transform the tools into a YAML template. The model responds with an assistant message.
  // See models supporting tool calling: openrouter.ai/models?supported_parameters=tools
  tools?: Tool[];
  tool_choice?: ToolChoice;

  // Advanced optional parameters
  seed?: number; // Integer only
  top_p?: number; // Range: (0, 1]
  top_k?: number; // Range: [1, Infinity) Not available for OpenAI models
  frequency_penalty?: number; // Range: [-2, 2]
  presence_penalty?: number; // Range: [-2, 2]
  repetition_penalty?: number; // Range: (0, 2]
  logit_bias?: { [key: number]: number };
  top_logprobs: number; // Integer only
  min_p?: number; // Range: [0, 1]
  top_a?: number; // Range: [0, 1]

  // Reduce latency by providing the model with a predicted output
  // https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
  prediction?: { type: 'content'; content: string };

  // OpenRouter-only parameters
  // See "Model Routing" section: openrouter.ai/docs/guides/features/model-routing
  models?: string[];
  route?: 'fallback';
  // See "Provider Routing" section: openrouter.ai/docs/guides/routing/provider-selection
  provider?: ProviderPreferences;
  user?: string; // A stable identifier for your end-users. Used to help detect and prevent abuse.

  // Debug options (streaming only)
  debug?: {
    echo_upstream_body?: boolean; // If true, returns the transformed request body sent to the provider
  };
};

// Subtypes:

type TextContent = {
  type: 'text';
  text: string;
};

type ImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string; // URL or base64 encoded image data
    detail?: string; // Optional, defaults to "auto"
  };
};

type ContentPart = TextContent | ImageContentPart;

type Message =
  | {
      role: 'user' | 'assistant' | 'system';
      // ContentParts are only for the "user" role:
      content: string | ContentPart[];
      // If "name" is included, it will be prepended like this
      // for non-OpenAI models: `{name}: {content}`
      name?: string;
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
      name?: string;
    };

type FunctionDescription = {
  description?: string;
  name: string;
  parameters: object; // JSON Schema object
};

type Tool = {
  type: 'function';
  function: FunctionDescription;
};

type ToolChoice =
  | 'none'
  | 'auto'
  | {
      type: 'function';
      function: {
        name: string;
      };
    };

// Response format for structured outputs
type ResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: object; // JSON Schema object
      };
    };

// Plugin configuration
type Plugin = {
  id: string; // 'web', 'file-parser', 'response-healing', 'context-compression'
  enabled?: boolean;
  // Additional plugin-specific options
  [key: string]: unknown;
};
```

Discrepancies between this overview type and the OpenAPI spec (`ChatRequest`), worth knowing:

- The spec marks `messages` as **required** (`minItems: 1`) and defines no `prompt` field and no `/completions` path. Treat `prompt` as legacy; always send `messages`.
- `route` is `DeprecatedRoute` in the spec: "Use `provider.sort.partition` instead"; legacy `"fallback"` maps to `"model"`, `"sort"` maps to `"none"`.
- `tool_choice` in the spec also accepts `"required"` and a server-tool form `{ "type": "openrouter:web_search" }` (also `web_search`, `web_search_preview`).
- `response_format` in the spec also has text, grammar (`ChatFormatGrammarConfig`, e.g. `grammar: 'root ::= "yes" | "no"'`) and Python variants.
- `max_tokens` is described in the spec as "deprecated, use `max_completion_tokens`. Note: some providers enforce a minimum of 16."

#### OpenRouter-specific request fields

Fields the overview lists as OpenRouter-only (accepted on Chat Completions; the Responses API accepts the same routing fields):

| Field | Type | Purpose | Details |
| - | - | - | - |
| `models` | `string[]` | Ordered model fallback list | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Model fallbacks |
| `route` | `'fallback'` | Deprecated; use `provider.sort.partition` | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| `provider` | `ProviderPreferences` | Provider routing (order, only, ignore, sort, data_collection, zdr, max_price, ...) | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Provider routing |
| `user` | `string` | Stable end-user identifier; helps detect and prevent abuse | Spec: use a stable ID, hash, or pseudonym. When a provider requires a user identity, OpenRouter folds it into the hashed identity sent upstream and never forwards it raw. If omitted, an account-level identity is used, so provider policy blocks can affect the whole account |
| `plugins` | `Plugin[]` | `web` (deprecated, use `openrouter:web_search` server tool), `file-parser`, `response-healing`, `context-compression`, and others | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Plugins |
| `debug` | `{ echo_upstream_body?: boolean }` | Echo the transformed upstream request body (streaming only) | [§4.6](#46-errors-and-debugging) Debugging |

Other cross-cutting fields defined in the spec on the inference request bodies (details in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference), [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities), [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)): `session_id` (max 256 chars; sticky routing key and observability grouping; also accepted as the `x-session-id` header, body wins), `trace` (`trace_id`, `trace_name`, `span_name`, `generation_name`, `parent_span_id`, plus custom keys forwarded to Broadcast destinations), `metadata` (max 16 pairs, 64-char keys, 512-char values), `service_tier` (`auto`, `default`, `fast` (alias of `priority`), `flex`, `priority`, `scale`, `ultrafast`), `cache_control`, `prompt_cache_key`, `prompt_cache_options`, `stop_server_tools_when`, `deferred_tools`, `modalities`, `image_config`, `stream_options` (its `include_usage` is deprecated and has no effect; full usage is always included).

#### Structured outputs and plugins (summary)

- `response_format: { type: 'json_object' }`: JSON mode; the model returns valid JSON. Also instruct the model to produce JSON in a system or user message.
- `response_format: { type: 'json_schema', json_schema: { name, strict?, schema } }`: strict schema mode. Models that support it: `https://openrouter.ai/models?supported_parameters=structured_outputs`. Details: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Structured outputs.
- Plugins: add a `plugins` array, e.g.

```json
{
  "plugins": [
    { "id": "web" },
    { "id": "response-healing" }
  ]
}
```

#### Model selection, fallbacks, non-standard parameters

- If `model` is omitted, the user's or payer's **default model** is used. Otherwise use a model ID with the organization prefix (e.g. `openai/gpt-5.2`, `anthropic/claude-sonnet-4.6`); list them via the Models API ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).
- OpenRouter selects the least expensive and best GPUs available, and falls back to other providers or GPUs on a 5xx response or when rate-limited.
- If the chosen model doesn't support a request parameter (e.g. `logit_bias` on non-OpenAI models, `top_k` on OpenAI), the parameter is **ignored**; the rest are forwarded. To route only to providers that support every parameter you sent, use `provider.require_parameters: true` ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).
- Streaming is supported for all models with `stream: true` ([§4.4](#44-streaming-server-sent-events)).

#### Assistant prefill

Ask a model to continue a partial answer by ending the `input` array (Responses) or `messages` array (Chat Completions) with an `assistant` message.

```typescript
// Responses API
await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-5.2',
    input: [
      { role: 'user', content: 'What is the meaning of life?' },
      { role: 'assistant', content: "I'm not sure, but my best guess is" },
    ],
  }),
});

// Chat Completions: same, with `messages` instead of `input`
await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-5.2',
    messages: [
      { role: 'user', content: 'What is the meaning of life?' },
      { role: 'assistant', content: "I'm not sure, but my best guess is" },
    ],
  }),
});
```

#### Responses API response format

Generated content is a list of items in `output`: `message` items hold `output_text` content parts; `reasoning`, `function_call`, and server-tool items (such as `openrouter:web_search`) appear as their own entries. Token counts: `usage.input_tokens`, `usage.output_tokens`, `usage.total_tokens`.

```json
{
  "id": "resp_1234567890",
  "object": "response",
  "created_at": 1234567890,
  "model": "openai/gpt-5.2",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "msg_abc123",
      "status": "completed",
      "role": "assistant",
      "content": [{ "type": "output_text", "text": "The meaning of life is...", "annotations": [] }]
    }
  ],
  "usage": { "input_tokens": 12, "output_tokens": 45, "total_tokens": 57 }
}
```

#### Chat Completions response format

Normalized to the OpenAI Chat API: `choices` is **always an array**, even with one completion. Each choice has `delta` when streaming and `message` otherwise.

```typescript
type Response = {
  id: string;
  // Depending on whether you set "stream" to "true" and
  // whether you passed in "messages" or a "prompt", you
  // will get a different output shape
  choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[];
  created: number; // Unix timestamp
  model: string;
  object: 'chat.completion' | 'chat.completion.chunk';

  system_fingerprint?: string; // Only present if the provider supports it

  // Usage data is always returned for non-streaming.
  // When streaming, usage is returned exactly once in the final chunk
  // before the [DONE] message. Unlike OpenAI's spec, this chunk contains
  // a non-empty choices array: a choice with a content-free delta that
  // repeats the finish_reason of the stream.
  usage?: ResponseUsage;
};

type NonChatChoice = {
  finish_reason: string | null;
  text: string;
  error?: ErrorResponse;
};

type NonStreamingChoice = {
  finish_reason: string | null;
  native_finish_reason: string | null;
  message: {
    content: string | null;
    role: string;
    tool_calls?: ToolCall[];
  };
  error?: ErrorResponse;
};

type StreamingChoice = {
  finish_reason: string | null;
  native_finish_reason: string | null;
  delta: {
    content: string | null;
    role?: string;
    tool_calls?: ToolCall[];
  };
  error?: ErrorResponse;
};

type ErrorResponse = {
  code: number; // See "Error Handling" section
  message: string;
  metadata?: Record<string, unknown>; // Contains additional error information such as provider details, the raw error message, etc.
};

type ToolCall = {
  id: string;
  type: 'function';
  function: FunctionCall;
};
```

Example:

```json
{
  "id": "gen-xxxxxxxxxxxxxx",
  "choices": [
    {
      "finish_reason": "stop",
      "native_finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": "Hello there!"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 4,
    "total_tokens": 14,
    "prompt_tokens_details": { "cached_tokens": 0 },
    "completion_tokens_details": { "reasoning_tokens": 0 },
    "cost": 0.00014
  },
  "model": "openai/gpt-4o"
}
```

`model` in the response is the model that actually served the request (it can differ from the requested one when fallbacks or routers are used). The spec's `ChatResult` also carries optional `openrouter_metadata` (opt-in, see [§4.2](#42-authentication-and-headers) headers), `service_tier`, `system_fingerprint`, and beta fields `alignment` and `safeguard_results`.

#### Usage and cost object (Chat Completions)

OpenRouter always returns detailed usage. Token counts use the **model's native tokenizer**, and credit usage and pricing are based on these native counts.

```typescript
type ResponseUsage = {
  /** Including images, input audio, and tools if any */
  prompt_tokens: number;
  /** The tokens generated */
  completion_tokens: number;
  /** Sum of the above two fields */
  total_tokens: number;

  /** Breakdown of prompt tokens (optional) */
  prompt_tokens_details?: {
    cached_tokens: number;        // Tokens cached by the endpoint
    cache_write_tokens?: number;  // Tokens written to cache (models with explicit caching)
    audio_tokens?: number;        // Tokens used for input audio
    video_tokens?: number;        // Tokens used for input video
  };

  /** Breakdown of completion tokens (optional) */
  completion_tokens_details?: {
    reasoning_tokens?: number;    // Tokens generated for reasoning
    audio_tokens?: number;        // Tokens generated for audio output
    image_tokens?: number;        // Tokens generated for image output
  };

  /** Cost in credits (optional) */
  cost?: number;
  /** Whether request used Bring Your Own Key */
  is_byok?: boolean;
  /** Detailed cost breakdown (optional) */
  cost_details?: {
    upstream_inference_cost?: number;
    upstream_inference_prompt_cost: number;
    upstream_inference_completions_cost: number;
    /** Metered server-tool execution cost (e.g. shell sandbox time), billed in USD */
    server_tool_cost?: number | null;
  };

  /** Server-side tool usage (optional) */
  server_tool_use?: {
    web_search_requests?: number;
  };
};
```

Where usage appears per format: non-streaming bodies always include it; Chat Completions streams send it once in the final chunk before `[DONE]`; Responses streams carry it in the `response.completed` event; Messages streams carry it in `message_delta` before `message_stop`.

#### Finish reasons

- Normalized `finish_reason` (Chat Completions): one of `tool_calls`, `stop`, `length`, `content_filter`, `error` (spec enum `ChatFinishReasonEnum` also allows `null` while a stream is in progress).
- `native_finish_reason`: the raw string returned by the provider/model. Some models have additional native reasons.
- Common meanings: `length` = hit `max_tokens` (on reasoning models possibly with empty `content`, see [§4.3](#43-parameters)); `content_filter` = provider-side refusal/filter (a successful refusal returns `message.refusal` with `finish_reason: "content_filter"`); `error` = an error interrupted generation (see [§4.6](#46-errors-and-debugging)).
- Responses API equivalent: `status` (`completed`, `incomplete` with `incomplete_details.reason` such as `max_output_tokens` or `content_filter`, `failed`).

#### Querying cost and stats after the request

Use the generation ID to fetch stats (token counts, cost, provider, latency, etc.) after completion via `GET /api/v1/generation?id=<id>`. Useful for auditing or fetching stats asynchronously.

```typescript
const generation = await fetch(
  `https://openrouter.ai/api/v1/generation?id=${generationId}`,
  { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } },
);
const stats = await generation.json();
```

- The `id` query parameter is required; spec pattern `^gen-[0-9A-Za-z-]+$`, max length 128. Chat Completions examples show `gen-...` IDs. The `X-Generation-Id` response header carries the generation ID on all inference endpoints (chat completions, completions, responses, messages), so read it from the header when the body ID has another prefix (Responses examples show `resp_...`).
- Selected response fields (`data.*`): `total_cost`, `usage`, `upstream_inference_cost`, `cache_discount`, `tokens_prompt`, `tokens_completion`, `native_tokens_prompt`, `native_tokens_completion`, `native_tokens_reasoning`, `native_tokens_cached`, `provider_name`, `provider_responses` (incl. fallback attempts), `finish_reason`, `native_finish_reason`, `latency`, `generation_time`, `moderation_latency`, `streamed`, `cancelled`, `is_byok`, `session_id`, `workspace_id`, `data_region`, `response_cache_source_id`, `router`, `service_tier`, `web_search_engine`, `api_type`. Full schema: [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) Generations. `GET /generation/content` returns stored prompt/completion content ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).
- Declared error responses include `400` (malformed `id`, added 2026-10-01), `401`, `402`, `403` (added 2026-10-23), `404`, `429`, `500`, `502`, `524`, `529`.

#### Gotchas

- Do not assume `choices[0].message.content` is non-null: tool calls return `content: null` with `tool_calls`.
- Check for an `error` object even on HTTP `200` ([§4.6](#46-errors-and-debugging)).
- `usage.cost` is in credits; `cost_details.server_tool_cost` is in USD.
- OpenAI SDK users pass OpenRouter-only fields via `extra_body` (Python) or extra properties on the request object (TypeScript).

Sources: https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/guides/community/anthropic-agent-sdk, OpenAPI spec (`ChatRequest`, `ChatFinishReasonEnum`, `GET /generation`)

### 4.2 Authentication and headers

#### Bearer API keys

- All API requests authenticate with a Bearer token: `Authorization: Bearer <OPENROUTER_API_KEY>`. This makes `curl` and the OpenAI SDK work directly.
- OpenRouter keys are more powerful than direct model-API keys: they can carry credit limits for apps and can be used in OAuth flows.
- Create keys at `https://openrouter.ai/keys` (settings: `https://openrouter.ai/settings/keys`). Give each a name and a credit limit (or no limit).
- When a key reaches its credit limit, requests with it are rejected until you raise the limit, or, for a daily/weekly/monthly limit, until it resets ([§4.5](#45-limits-credits-budgets-rate-limits)).
- Keys created for you during onboarding get a **$100 credit limit** and **expire after 180 days**.
- Recommended: set a credit limit on every key. A key with no limit lets a leaked key or runaway agent spend your entire balance, including auto top-ups. Keep unlimited keys out of client-side code and rotate them promptly.

#### Key types (summary; details in §10)

| Kind | Used for | Notes |
| - | - | - |
| API key (standard) | Inference and most read endpoints | Optional credit limit with reset (`daily`/`weekly`/`monthly`), optional `expires_at` |
| Management key (formerly "provisioning key") | Admin endpoints: creating/updating keys, credits, guardrails, workspaces, etc. | Cannot call completion endpoints. `GET /key` reports `is_management_key` (`is_provisioning_key` is a deprecated alias). Key writes count toward a daily limit ([§4.5](#45-limits-credits-budgets-rate-limits)) |
| OAuth PKCE user key | Apps acting for an OpenRouter user | [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) OAuth PKCE |
| Workload identity token | Exchange a workload identity token for an OpenRouter access token | `POST /oauth/token`, `GET /oauth/jwks` (added 2026-09-03); [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) |
| BYOK provider keys | Your own provider keys stored in OpenRouter | Not used as the Bearer token; [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) BYOK |

#### Request headers

| Header | Required | Purpose |
| - | - | - |
| `Authorization: Bearer <key>` | Yes | Authentication |
| `Content-Type: application/json` | Yes (JSON bodies) | |
| `HTTP-Referer` | Optional | Your app/site URL. Identifies your app on openrouter.ai; required for app attribution (rankings, app page) |
| `X-OpenRouter-Title` | Optional | App display name. `X-Title` is also accepted (backwards compatibility). Must be paired with `HTTP-Referer` to create an app entry; `localhost` referers also need a title to be tracked |
| `X-OpenRouter-Categories` | Optional | Comma-separated marketplace categories, up to 2 per request, lowercase hyphenated, max 30 chars each; unrecognized ones dropped silently; merged up to 10 total |
| `X-OpenRouter-App-Visibility: hidden` | Optional | Creates a **new** app hidden from public rankings/marketplace; ignored for existing apps |
| `X-OpenRouter-Metadata: enabled` | Optional | Opt in to `openrouter_metadata` (routing context) on `/chat/completions`, `/responses`, `/messages`. Enum `disabled` (default) / `enabled`. Legacy header `X-OpenRouter-Experimental-Metadata` is still accepted. [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Router metadata |
| `x-session-id` | Optional | Same as body `session_id` (body value takes precedence) |

Attribution details (category list, origin grouping): [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) App attribution. Attribution headers are not part of the response-cache key.

#### Response headers

| Header | When | Meaning |
| - | - | - |
| `X-Generation-Id` | All inference endpoints | Generation ID for `GET /generation` and debugging |
| `Retry-After` | Some `429`, `503`, and `402` with `limit_source: openrouter_in_flight_budget` | Seconds to wait before retrying ([§4.6](#46-errors-and-debugging)) |
| `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | Only on `429` errors OpenRouter itself returns for free-model or key-management limits | `X-RateLimit-Reset` is milliseconds since the Unix epoch. Successful inference responses never carry `X-RateLimit-*` |

#### OpenRouter TypeScript SDK

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  httpReferer: '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
  appTitle: '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
});

const response = await openRouter.responses.send({
  responsesRequest: {
    model: 'openai/gpt-5.2',
    input: 'Say this is a test',
    stream: false,
  },
});

if (!('output' in response)) {
  throw new Error('Expected a non-streaming response');
}

console.log([...response.output].reverse().find((item) => item.type === 'message'));
```

The SDK constructor also accepts `appCategories` (the attribution-categories value). Full SDK reference: [§3](03-client-sdks.md#3-client-sdks-typescript-python-go).

#### OpenAI SDK pointed at OpenRouter

Set the base URL to `https://openrouter.ai/api/v1` and the API key to your OpenRouter key. (The auth page's prose says `api_base`; the current SDK options are `baseURL` in TypeScript and `base_url` in Python, as its examples show.)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-OpenRouter-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
  },
});

const response = await openai.responses.create({
  model: 'openai/gpt-5.2',
  input: 'Say this is a test',
});
console.log(response.output_text);
```

```python
import os
from openai import OpenAI

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=os.environ["OPENROUTER_API_KEY"],
)

response = client.responses.create(
  extra_headers={
    "HTTP-Referer": "<YOUR_SITE_URL>",  # Optional. Site URL for rankings on openrouter.ai.
    "X-OpenRouter-Title": "<YOUR_SITE_NAME>",     # Optional. Site title for rankings on openrouter.ai.
  },
  # pass extra_body to access OpenRouter-only arguments, e.g.
  # extra_body={"models": ["openai/gpt-4o", "mistralai/mixtral-8x22b-instruct"]},
  model="openai/gpt-5.2",
  instructions="You are a helpful assistant.",
  input="Hello!",
)

reply = response.output_text
```

Migration helper mentioned in the OpenAI SDK guide: `npx @getgrit/launcher openrouter` (Grit). More framework setups: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations).

#### Raw HTTP

```typescript
fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional.
    'X-OpenRouter-Title': '<YOUR_SITE_NAME>', // Optional.
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-5.2',
    input: 'What is the meaning of life?',
  }),
});
```

```shell
curl https://openrouter.ai/api/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
  "model": "openai/gpt-5.2",
  "instructions": "You are a helpful assistant.",
  "input": "Hello!"
}'
```

#### If your key has been exposed

- Never commit keys to public repositories; use environment variables.
- OpenRouter is a **GitHub secret scanning partner** and has other methods to detect exposed keys. If a key is determined compromised you get an email notification.
- On notification or suspicion: immediately delete the key at `https://openrouter.ai/settings/keys` and create a new one.

#### Gotchas

- A `401` means invalid credentials: missing/invalid/disabled API key or an expired OAuth session.
- Management keys cannot call completion endpoints; use a standard API key for inference.
- Don't ship unlimited keys in browser or mobile code; use OAuth PKCE ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)) or a backend proxy.
- `HTTP-Referer` and `X-OpenRouter-Title` are optional for API calls; they only affect attribution.

Sources: https://openrouter.ai/docs/api_reference/authentication, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/app-attribution, https://openrouter.ai/docs/guides/community/openai-sdk, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/guides/features/response-caching, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/api_reference/streaming, OpenAPI spec (`MetadataLevel`, security schemes)

### 4.3 Parameters

#### Forwarding semantics

- When a sampling parameter is **absent**, OpenRouter omits it upstream; the provider applies its own default. The "Default" values below are conventional, not injected by OpenRouter.
- Explicitly sending the default (e.g. `temperature: 1.0`) is forwarded and may behave differently from omitting it (for example it can change provider-side cache keys).
- Some provider-specific parameters are passed straight through to the matching provider if specified, e.g. `safe_prompt` for Mistral, `raw_mode` for Hyperbolic. Provider-specific options can also go in `provider.options`, keyed by provider slug ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).
- Parameters a model doesn't support are ignored. Check a model's `supported_parameters` (Models API, [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)) or set `provider.require_parameters: true` to route only to providers that support all parameters you send ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

#### Parameter reference (Chat Completions names)

| Key | Type | Range | Default (conventional) | Summary |
| - | - | - | - | - |
| `temperature` | float | 0.0 to 2.0 | 1.0 | Output variety. Lower = more predictable; 0 = same response for a given input |
| `top_p` | float | 0.0 to 1.0 (overview type: `(0, 1]`) | 1.0 | Nucleus sampling: only tokens whose probabilities sum to P |
| `top_k` | integer | 0 or above (overview type: `[1, Infinity)`) | 0 (disabled) | Pick from top K tokens; 1 = always most likely. Not available for OpenAI models |
| `frequency_penalty` | float | -2.0 to 2.0 | 0.0 | Penalty scales with number of occurrences; negative encourages reuse |
| `presence_penalty` | float | -2.0 to 2.0 | 0.0 | Penalty does not scale with occurrences; negative encourages reuse |
| `repetition_penalty` | float | 0.0 to 2.0 (overview type: `(0, 2]`) | 1.0 | Reduces repetition of input tokens; scales with the token's original probability; too high hurts coherence |
| `min_p` | float | 0.0 to 1.0 | 0.0 | Minimum probability relative to the top token (0.1 = at least 1/10th as probable) |
| `top_a` | float | 0.0 to 1.0 | 0.0 | Keep tokens with "sufficiently high" probability relative to the top token ("dynamic Top-P") |
| `seed` | integer | any integer | none | Deterministic sampling for same seed + params; not guaranteed for some models |
| `max_tokens` | integer | 1 or above; max = context length minus prompt length | none | Upper bound on generated tokens |
| `max_completion_tokens` | integer | 1 or above | none | Same semantics as `max_tokens` |
| `logit_bias` | map (token ID → bias) | bias -100 to 100 | none | Added to logits before sampling; ±1 nudges, ±100 bans/forces |
| `logprobs` | boolean | | none | Return log probabilities of output tokens |
| `top_logprobs` | integer | 0 to 20 | none | Most likely tokens per position with logprobs; requires `logprobs: true` |
| `response_format` | map | | none | `{ "type": "json_object" }` JSON mode, or `json_schema` ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Structured outputs) |
| `structured_outputs` | boolean | | none | Listed by the page as "If the model can return structured outputs using response_format json_schema"; in the spec it is a model capability value in `supported_parameters`, not a `ChatRequest` field |
| `stop` | array (spec: `string \| string[] \| null`, up to 4) | | none | Stop when any listed sequence is generated |
| `tools` | array | | none | OpenAI tool-calling shape; transformed for non-OpenAI providers ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Tool calling) |
| `tool_choice` | string or object | `none`, `auto`, `required`, `{"type":"function","function":{"name":"..."}}` | provider default | Which tool (if any) is called |
| `parallel_tool_calls` | boolean | | **true** | Allow multiple simultaneous function calls; only applies with `tools` |
| `include_reasoning` | boolean | | none | **Deprecated** alias related to `reasoning.exclude`; when true, reasoning tokens are returned when supported |
| `reasoning` | map | | none | Reasoning enabled / effort / max reasoning tokens / exclude ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Reasoning tokens) |
| `reasoning_effort` | enum | `xhigh`, `high`, `medium`, `low`, `minimal`, `none` (spec also `max`) | none | OpenAI-style shorthand for `reasoning.effort`; cannot conflict with `reasoning.effort` |
| `web_search_options` | map | | none | Native web search options for models/providers that support it |
| `verbosity` | enum | `low`, `medium`, `high`, `xhigh`, `max` | **medium** | Response length/detail. On Anthropic models maps to `output_config.effort` |
| `prediction` | `{ type: 'content', content: string }` | | none | Predicted output to reduce latency on supported models |

#### Parameter details

- **temperature**: lower values produce more predictable, typical responses; higher values produce more diverse, less common ones. At 0 the model always gives the same response for a given input.
- **top_p**: limits choices to the top tokens whose probabilities add up to P. Lower is more predictable; the default allows the full range. Think "dynamic Top-K".
- **top_k**: limits the choice at each step to the K most likely tokens. 1 = greedy. Default disabled (all tokens considered).
- **frequency_penalty**: discourages tokens proportionally to how often they already appear in the input. Scales with occurrence count. Negative values encourage reuse.
- **presence_penalty**: discourages repeating tokens already used; does **not** scale with occurrence count. Negative values encourage reuse.
- **repetition_penalty**: reduces repetition of tokens from the input; too high causes incoherent output (run-on sentences lacking small words). Scales based on the original token's probability. 1.0 = no penalty.
- **min_p**: minimum probability for a token, relative to the most likely token's probability.
- **top_a**: filters to tokens with sufficiently high probability relative to the maximum. Lower values narrow the choice; higher values do not necessarily add creativity, they refine filtering.
- **seed**: repeated requests with the same seed and parameters should return the same result; determinism isn't guaranteed for some models.
- **max_tokens / max_completion_tokens**: the model won't generate more than this. For **reasoning models**, the limit covers reasoning tokens plus visible output on most providers. A small value can be consumed entirely by reasoning, returning `finish_reason: "length"` with empty `content` ([§4.6](#46-errors-and-debugging) "When no content is generated"; [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Reasoning tokens).
- **logit_bias**: maps token IDs (in the model's tokenizer) to a bias from -100 to 100 added to logits before sampling. Values between -1 and 1 nudge likelihood; -100/100 effectively ban/force a token. Effect varies per model; ignored by non-OpenAI models.
- **logprobs / top_logprobs**: `top_logprobs` (0–20) requires `logprobs: true`.
- **response_format**: `{ "type": "json_object" }` guarantees valid JSON; also tell the model to output JSON in a system/user message.
- **stop**: generation stops immediately when the model produces any listed sequence.
- **tools / tool_choice**: `none` = generate a message, `auto` = model chooses message or one or more tool calls, `required` = must call one or more tools, `{"type": "function", "function": {"name": "my_function"}}` = force that tool.
- **parallel_tool_calls**: true lets the model call several functions at once; false makes calls sequential.
- **reasoning / reasoning_effort / include_reasoning**: see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Reasoning tokens for the full `reasoning` object and per-model support.
- **verbosity**: lower = more concise, higher = more detailed. Introduced by OpenAI for the Responses API. For Anthropic models it maps to `output_config.effort`; `xhigh` is supported by Anthropic Claude 4.7 Opus and later, `max` by Claude 4.6 Opus and later. Anthropic Messages API callers set `output_config.effort` directly.

#### Names on the Responses API

The Responses API uses its own names for some of these (full schema in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)): `max_output_tokens` instead of `max_tokens`; `text: { format, verbosity }` instead of `response_format`/`verbosity` (`text.verbosity` accepts `low`, `medium`, `high`, `xhigh`, `max`, or `null`); `reasoning: { effort, summary, enabled, max_tokens, context, mode }` ([§4.8](#48-responses-api-guide)); `tool_choice` accepts `auto`, `none`, `required`, `{ type: 'function', name }`. It also accepts `temperature`, `top_p`, `top_k`, `top_logprobs`, `presence_penalty`, `frequency_penalty`, `parallel_tool_calls`, `max_tool_calls`, and `stop` (added 2026-10-15).

#### Discrepancies to be aware of

- Ranges for `top_p`, `top_k`, and `repetition_penalty` differ slightly between the parameters page and the overview type (noted in the table). Stay inside the stricter range.
- `reasoning_effort`: the parameters page lists `xhigh, high, medium, low, minimal, none`; the spec enum also includes `max`.
- `max_tokens`: the parameters page treats it as a normal parameter; the spec calls it deprecated in favor of `max_completion_tokens`. Both are accepted.

Sources: https://openrouter.ai/docs/api_reference/parameters, https://openrouter.ai/docs/api_reference/overview, OpenAPI spec (`ChatRequest`, `Parameter`, `TextExtendedConfig`, `ReasoningEffort`, `OpenAIResponsesToolChoice`)

### 4.4 Streaming (Server-Sent Events)

Set `stream: true` in the request body to stream any model. The response is `text/event-stream`.

#### Wire format

- Each event is one or more `data: <payload>` lines followed by a blank line. Payloads are JSON except the terminal sentinel `data: [DONE]`.
- **Keep-alive comments**: OpenRouter occasionally sends SSE comment lines to prevent connection timeouts:

```text
: OPENROUTER PROCESSING
```

- Comments can be ignored per the SSE spec, or used for UX (e.g. a loading indicator). If you parse by hand, **skip lines starting with `:` before calling `JSON.parse`**: passing the comment to `JSON.parse` throws and, unhandled, crashes the stream loop. (Example of long holds: with the Alignment plugin in `enforce` mode, Chat Completions sends `: OPENROUTER PROCESSING` about every 420 ms while a message is held for checking; see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Plugins.)
- Terminator per endpoint:

| Endpoint | Event framing | Usage location | End of stream |
| - | - | - | - |
| `/chat/completions` | `data:` lines with `chat.completion.chunk` JSON | Extra final chunk with `usage`, sent just before `[DONE]` | `data: [DONE]` |
| `/responses` | `data:` lines with typed events (`{"type":"response.output_text.delta",...}`) | `response.completed` event | Terminal `response.completed` / `response.incomplete` / `response.failed`, then `data: [DONE]` |
| `/messages` | Anthropic `event: <name>` + `data:` pairs (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`, `ping`, `error`) | `message_delta` before `message_stop` | `message_stop` on success; **no `[DONE]`** (removed 2026-10-21, matching Anthropic's protocol). On failure: `error` event or stream closure |

- The generation ID is in the `X-Generation-Id` response header for all endpoints (chat completions, completions, responses, and messages), useful for debugging and correlating requests.
- Errors that happen **before** streaming starts are plain JSON with a 4xx/5xx status, not SSE. Check `response.ok` first.

#### Recommended SSE clients

Some SSE clients don't parse per spec and throw on the non-JSON comment payloads. Recommended: [`eventsource-parser`](https://github.com/rexxars/eventsource-parser), the [OpenAI SDK](https://www.npmjs.com/package/openai), the [Vercel AI SDK](https://www.npmjs.com/package/ai). The OpenRouter SDKs ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)) also handle streaming. A spec-compliant parser handles comments, multi-line `data:` fields, and buffering for you.

```typescript
import { createParser } from 'eventsource-parser';

const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    input: 'Hello',
    stream: true,
  }),
});

// Errors that occur before streaming starts are plain JSON, not SSE
if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error.message);
}

const parser = createParser({
  onEvent(event) {
    if (event.data === '[DONE]') return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'response.output_text.delta') {
        console.log(data.delta);
      }
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

A parser only handles framing: mid-generation errors still arrive as ordinary `data:` events (`response.failed` or `error` on Responses; a chunk with a top-level `error` on Chat Completions). See "Errors during streaming" below.

#### Chat Completions chunks and the final usage chunk

Content chunks are `chat.completion.chunk` objects with `choices[0].delta` (`content`, `role`, `tool_calls`). On `/api/v1/chat/completions` every stream ends with an extra chunk carrying `usage`, sent just before `[DONE]`. OpenAI's spec sends that chunk with an empty `choices` array, which crashes many clients that read `choices[0].delta`; OpenRouter intentionally deviates: the usage chunk has **one choice with a content-free `delta` that repeats `finish_reason` (and `native_finish_reason`)**.

```text
data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}]}
data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}],"usage":{...}}
data: [DONE]
```

The terminal `finish_reason` therefore appears **twice**: on the last content-bearing chunk and again on the usage chunk. Stream validators should treat the usage chunk as an accounting frame, not a second terminal event. `stream_options.include_usage` is deprecated and has no effect (usage is always sent). This shape is specific to Chat Completions.

#### Responses API stream events

Event types defined in the OpenAPI spec for `/responses` streams (JSON objects with a `type`, usually with `sequence_number`):

| Group | Events |
| - | - |
| Lifecycle | `response.created`, `response.in_progress`, `response.completed`, `response.incomplete`, `response.failed`, `error` |
| Output items | `response.output_item.added`, `response.output_item.done`, `response.content_part.added`, `response.content_part.done` |
| Text | `response.output_text.delta`, `response.output_text.done`, `response.output_text.annotation.added`, `response.refusal.delta`, `response.refusal.done` |
| Reasoning | `response.reasoning_text.delta`, `response.reasoning_text.done`, `response.reasoning_summary_part.added`, `response.reasoning_summary_part.done`, `response.reasoning_summary_text.delta`, `response.reasoning_summary_text.done` |
| Function / custom tools | `response.function_call_arguments.delta`, `response.function_call_arguments.done`, `response.custom_tool_call_input.delta`, `response.custom_tool_call_input.done` |
| Server tools | `response.web_search_call.in_progress` / `.searching` / `.completed`; `response.image_generation_call.in_progress` / `.generating` / `.partial_image` / `.completed`; `response.code_interpreter_call.in_progress` / `.interpreting` / `.completed`; `response.code_interpreter_call_code.delta` / `.done`; `response.mcp_list_tools.in_progress` / `.completed` / `.failed`; `response.mcp_call.in_progress` / `.completed` / `.failed`; `response.mcp_call_arguments.delta` / `.done`; `response.apply_patch_call_operation_diff.delta` / `.done`; `response.fusion_call.*` (`in_progress`, `completed`, `analysis.in_progress`, `analysis.completed`, `panel.added`, `panel.delta`, `panel.reasoning.delta`, `panel.completed`, `panel.failed`) |
| Debug | `response.debug` (only with `debug.echo_upstream_body`, [§4.6](#46-errors-and-debugging)) |

Gotcha: the Responses guide pages (basic usage, reasoning) show event names that are not in the spec: `response.content_part.delta`, `response.done`, `response.reasoning.delta`. Code against the spec names above (`response.output_text.delta`, `response.completed`, `response.reasoning_text.delta` / `response.reasoning_summary_text.delta`), and make unknown event types a no-op.

#### Streaming examples (Responses API)

Official examples from the streaming page. All three handle `response.failed`, `response.incomplete`, and text deltas; the two manual parsers buffer partial lines across network reads and skip `:` comment lines.

TypeScript SDK (`@openrouter/sdk`): the stream is a `ReadableStream` of typed events.

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const question = 'How would you build the tallest building ever?';

const stream = await openRouter.responses.send({
  responsesRequest: {
    model: 'openai/gpt-4o',
    input: question,
    stream: true,
  },
});

if (!(stream instanceof ReadableStream)) {
  throw new Error('Expected a streaming response');
}

for await (const event of stream) {
  if (event.type === 'response.failed') {
    throw new Error(event.response.error?.message ?? 'Response failed');
  }
  if (event.type === 'response.incomplete') {
    throw new Error(
      `Response incomplete: ${event.response.incompleteDetails?.reason ?? 'unknown reason'}`,
    );
  }

  if (event.type === 'response.output_text.delta') {
    console.log(event.delta);
  }

  // The final response.completed event includes usage stats
  if (event.type === 'response.completed') {
    console.log('Usage:', event.response.usage);
  }
}
```

Python (`requests`, manual SSE parsing with a line buffer):

```python
import json
import os
import requests

question = "How would you build the tallest building ever?"

url = "https://openrouter.ai/api/v1/responses"
headers = {
  "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
  "Content-Type": "application/json"
}

payload = {
  "model": "openai/gpt-4o",
  "input": question,
  "stream": True
}

buffer = ""
with requests.post(url, headers=headers, json=payload, stream=True) as r:
  r.raise_for_status()
  for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
    buffer += chunk
    while True:
      # Find the next complete SSE line
      line_end = buffer.find('\n')
      if line_end == -1:
        break

      line = buffer[:line_end].strip()
      buffer = buffer[line_end + 1:]

      # Skip SSE comments (lines starting with ":"), e.g. the
      # ": OPENROUTER PROCESSING" keep-alive — they are not JSON
      if line.startswith(':'):
        continue
      if not line.startswith('data: '):
        continue

      data = line[6:]
      if data == '[DONE]':
        break

      try:
        data_obj = json.loads(data)
      except json.JSONDecodeError:
        continue

      if data_obj.get("type") == "response.failed":
        error = data_obj["response"].get("error") or {}
        raise RuntimeError(error.get("message", "Response failed"))
      if data_obj.get("type") == "response.incomplete":
        details = data_obj["response"].get("incomplete_details") or {}
        raise RuntimeError(f"Response incomplete: {details.get('reason', 'unknown reason')}")
      if data_obj.get("type") == "response.output_text.delta":
        print(data_obj["delta"], end="", flush=True)
```

TypeScript (`fetch`, manual SSE parsing with a line buffer):

```typescript
const question = 'How would you build the tallest building ever?';
const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    input: question,
    stream: true,
  }),
});

const reader = response.body?.getReader();
if (!reader) {
  throw new Error('Response body is not readable');
}

const decoder = new TextDecoder();
let buffer = '';

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append new chunk to buffer
    buffer += decoder.decode(value, { stream: true });

    // Process complete lines from buffer
    while (true) {
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) break;

      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      // Skip SSE comments (lines starting with ":"), e.g. the
      // ": OPENROUTER PROCESSING" keep-alive — they are not JSON
      if (line.startsWith(':')) continue;

      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'response.failed') {
            throw new Error(parsed.response.error?.message ?? 'Response failed');
          }
          if (parsed.type === 'response.incomplete') {
            throw new Error(
              `Response incomplete: ${parsed.response.incomplete_details?.reason ?? 'unknown reason'}`,
            );
          }
          if (parsed.type === 'response.output_text.delta') {
            console.log(parsed.delta);
          }
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
    }
  }
} finally {
  reader.cancel();
}
```

Notes on these examples:

- The SDK exposes camelCase fields (`event.response.incompleteDetails`); raw JSON uses snake_case (`incomplete_details`).
- In both manual parsers, `break` on `[DONE]` leaves only the inner line loop; the outer read loop then ends when the server closes the connection. Use a labeled break (or a flag) if you need to stop immediately.
- The fetch example does not check `response.ok` first; add the pre-stream check shown in "Errors during streaming" below.

Adapting a manual parser to **Chat Completions** (`POST /api/v1/chat/completions` with `messages`): keep the same line buffering, `:` skipping, and `[DONE]` handling, then read text from `chunk.choices?.[0]?.delta?.content`, treat a chunk with a top-level `error` (and `choices[0].finish_reason: "error"`) as a mid-stream failure, and take `usage` from the final chunk before `[DONE]`. The Chat Completions debug example in [§4.6](#46-errors-and-debugging) shows the same `data:`-line loop over a whole buffered body.

#### Stream cancellation

Abort the HTTP connection to cancel. For **supported providers** this immediately stops model processing and billing.

| Supported | Not currently supported |
| - | - |
| OpenAI, Azure, Anthropic, Fireworks, Mancer, Recursal, AnyScale, Lepton, OctoAI, Novita, DeepInfra, Together, Cohere, Hyperbolic, Infermatic, Avian, XAI, Cloudflare, SFCompute, Nineteen, Liquid, Friendli, Chutes, DeepSeek | AWS Bedrock, Groq, Modal, Google, Google AI Studio, Minimax, HuggingFace, Replicate, Perplexity, Mistral, AI21, Featherless, Lynn, Lambda, Reflection, SambaNova, Inflection, ZeroOneAI, AionLabs, Alibaba, Nebius, Kluster, Targon, InferenceNet |

- Cancellation only works for **streaming** requests with supported providers. For non-streaming requests or unsupported providers the model keeps processing and you are **billed for the complete response**.
- Several endpoints declare HTTP `499` "Client Closed Request - The caller cancelled the request" (e.g. `/embeddings`, `/files`, `/videos`).

TypeScript SDK: pass an `AbortController` signal in the request options (second argument). Aborting before the response arrives throws `RequestAbortedError` (from `@openrouter/sdk/models/errors`); aborting mid-stream throws an `AbortError`.

```typescript
import { OpenRouter } from '@openrouter/sdk';
import { RequestAbortedError } from '@openrouter/sdk/models/errors';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const controller = new AbortController();

try {
  const stream = await openRouter.responses.send({
    responsesRequest: {
      model: 'openai/gpt-4o',
      input: 'Write a story',
      stream: true,
    },
  }, {
    signal: controller.signal,
  });

  if (!(stream instanceof ReadableStream)) {
    throw new Error('Expected a streaming response');
  }

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      console.log(event.delta);
    }
  }
} catch (error) {
  // Aborting before the response arrives throws RequestAbortedError; aborting mid-stream throws AbortError.
  if (error instanceof RequestAbortedError || (error instanceof Error && error.name === 'AbortError')) {
    console.log('Stream cancelled');
  } else {
    throw error;
  }
}

// To cancel the stream:
controller.abort();
```

Python (`requests`): close the response to drop the connection; here a `threading.Event` signals cancellation from another thread.

```python
import os
import requests
from threading import Event, Thread

def stream_with_cancellation(prompt: str, cancel_event: Event):
    with requests.Session() as session:
        response = session.post(
            "https://openrouter.ai/api/v1/responses",
            headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
            json={"model": "openai/gpt-4o", "input": prompt, "stream": True},
            stream=True
        )

        try:
            for line in response.iter_lines():
                if cancel_event.is_set():
                    response.close()
                    return
                if line:
                    print(line.decode(), end="", flush=True)
        finally:
            response.close()

# Example usage:
cancel_event = Event()
stream_thread = Thread(target=lambda: stream_with_cancellation("Write a story", cancel_event))
stream_thread.start()

# To cancel the stream:
cancel_event.set()
```

TypeScript (`fetch`): pass `signal: controller.signal` and call `controller.abort()`; the pending read rejects with an `AbortError`.

```typescript
const controller = new AbortController();

try {
  const response = await fetch(
    'https://openrouter.ai/api/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        input: 'Write a story',
        stream: true,
      }),
      signal: controller.signal,
    },
  );

  // Process the stream...
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    console.log('Stream cancelled');
  } else {
    throw error;
  }
}

// To cancel the stream:
controller.abort();
```

#### Errors during streaming

**Before the response is committed**: a standard JSON error with the matching HTTP status. Covers failures raised before the request reaches a provider, and provider failures visible at connection time (connection error, non-2xx upstream status). Common: `400` bad request (invalid parameters), `401` invalid API key, `402` insufficient credits, `429` rate limited, `502` provider error, `503` no available providers.

```json
{
  "error": {
    "code": 400,
    "message": "Invalid model specified"
  }
}
```

**After the response is committed (mid-stream)**: once the provider has returned response headers, `200 OK` is committed even if no token has been produced. Any later error arrives as an SSE event:

Responses API: the stream ends with `response.failed`.

```text
data: {"type":"response.failed","response":{"id":"gen-abc123", ... ,"status":"failed","output":[],"error":{"code":"server_error","message":"Provider disconnected unexpectedly"},"error_type":"provider_unavailable"},"sequence_number":12}
```

- The error is in `response.error`; `response.status` is `"failed"`; the canonical OpenRouter `error_type` is at the top level of `response`.
- The stream schema also defines a plain `error` event (`{"type":"error","code":"...","message":"..."}`). OpenRouter reports failures with `response.failed`, but handling both is safe.
- HTTP status stays `200`; the stream is terminated after the event.
- It can be the **first and only** event: treat a `200` carrying `response.failed` with no output as a failure.

Chat Completions: the stream ends with a chunk carrying a top-level `error`.

```text
data: {"id":"cmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","provider":"openai","error":{"code":"server_error","message":"Provider disconnected unexpectedly"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

- The error is at the **top level** next to `id`, `object`, `created`; `choices` is included with `finish_reason: "error"` to terminate the stream properly.
- HTTP status stays `200`; the stream ends after this event; it can be the first and only event (treat a `200` with only an `error` chunk as a failure).
- Mid-stream rate limits look the same with `"error":{"code":429,"message":"Rate limit exceeded"}`.

Messages API: an SSE `error` event, e.g. `{"type":"error","error":{"type":"overloaded_error","message":"Provider is temporarily overloaded","error_type":"provider_overloaded"}}` ([§4.6](#46-errors-and-debugging)).

Handling both error types (official examples). TypeScript SDK: pre-stream errors are thrown by `send()`; mid-stream errors arrive as `response.failed`, `response.incomplete`, or `error` events.

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

async function streamWithErrorHandling(prompt: string) {
  try {
    const stream = await openRouter.responses.send({
      responsesRequest: {
        model: 'openai/gpt-4o',
        input: prompt,
        stream: true,
      },
    });

    if (!(stream instanceof ReadableStream)) {
      throw new Error('Expected a streaming response');
    }

    for await (const event of stream) {
      // Check for mid-stream errors
      if (event.type === 'response.failed') {
        console.error(`Stream error: ${event.response.error?.message}`);
        console.log('Stream terminated due to error');
        return;
      }
      if (event.type === 'response.incomplete') {
        console.error(
          `Stream incomplete: ${event.response.incompleteDetails?.reason ?? 'unknown reason'}`,
        );
        return;
      }
      if (event.type === 'error') {
        console.error(`Stream error: ${event.message}`);
        return;
      }

      // Process normal content
      if (event.type === 'response.output_text.delta') {
        console.log(event.delta);
      }
    }
  } catch (error) {
    // Handle pre-stream errors
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

Python: check the HTTP status first (pre-stream error), then inspect events. The page declares this function `async def` although it uses blocking `requests` and never awaits; drop `async` (or run it in a thread) when you reuse it.

```python
import json
import os
import requests

async def stream_with_error_handling(prompt):
    response = requests.post(
        'https://openrouter.ai/api/v1/responses',
        headers={'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
        json={
            'model': 'openai/gpt-4o',
            'input': prompt,
            'stream': True
        },
        stream=True
    )

    # Check initial HTTP status for pre-stream errors
    if response.status_code != 200:
        error_data = response.json()
        print(f"Error: {error_data['error']['message']}")
        return

    # Process stream and handle mid-stream errors
    for line in response.iter_lines():
        if line:
            line_text = line.decode('utf-8')
            if line_text.startswith('data: '):
                data = line_text[6:]
                if data == '[DONE]':
                    break

                try:
                    parsed = json.loads(data)

                    # Check for mid-stream errors
                    if parsed.get('type') == 'response.failed':
                        print(f"Stream error: {parsed['response']['error']['message']}")
                        print("Stream terminated due to error")
                        break
                    if parsed.get('type') == 'response.incomplete':
                        details = parsed['response'].get('incomplete_details') or {}
                        reason = details.get('reason', 'unknown reason')
                        print(f"Stream incomplete: {reason}")
                        break
                    if parsed.get('type') == 'error':
                        print(f"Stream error: {parsed['message']}")
                        break

                    # Process normal content
                    if parsed.get('type') == 'response.output_text.delta':
                        print(parsed['delta'], end='', flush=True)

                except json.JSONDecodeError:
                    pass
```

The page's `fetch` variant is the buffered parser from "Streaming examples" above plus an `if (!response.ok) { const error = await response.json(); ... }` pre-stream check and an `error`-event branch.

API-specific token-limit behavior:

- Responses: upstream token-limit errors (such as `max_tokens_exceeded`) end the stream with `response.incomplete` (`incomplete_details.reason: "max_output_tokens"`) rather than an error; other failures end with `response.failed`.
- Chat Completions: returns an `ErrorResponse` directly if no chunks were processed, or includes error information in the stream if some were; the same token-limit errors become `finish_reason: "length"`.

Full error formats and typed codes: [§4.6](#46-errors-and-debugging).

#### Gotchas

- Never `JSON.parse` a line starting with `:`; don't assume every line is `data:` (Messages streams also send `event:` lines).
- Stop on `[DONE]` for Chat Completions and Responses; stop on `message_stop` for Messages.
- Don't treat the Chat Completions usage chunk's repeated `finish_reason` as a second completion.
- A stream can fail after `200 OK`; always inspect events for `error` / `response.failed`.
- Failover to another provider stops once any output has reached you.

Sources: https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/api_reference/responses/basic-usage, https://openrouter.ai/docs/guides/features/plugins/alignment, https://openrouter.ai/docs/changelog (2026-10-21 `/messages` `[DONE]` removal), OpenAPI spec (Responses and Messages stream event schemas)

### 4.5 Limits (credits, budgets, rate limits)

Making additional accounts or API keys does **not** raise your rate limits; capacity is governed globally. Different models have different rate limits, so you can spread load across models.

| Limit type | What it governs | Error | Where to check |
| - | - | - | - |
| Credit limits | Spend: account balance, per-key credit caps, in-flight spending budget | `402` | `GET /api/v1/key` → `limit_remaining`; `error.metadata.limit_source` on the error |
| Budget limits | Admin-configured spend caps: guardrail budgets, workspace budgets, and the key's own limit once spent | `403` | `GET /api/v1/key` → `budgets`, `effective_budget`; `error.metadata` |
| Rate limits | Request counts: free-model caps, key-management caps, per-IP burst limits, DDoS protection | `429` | `X-RateLimit-*` headers on free-model and key-management errors |

(The page's "Error on exceeding" column did not render in the captured source; the statuses above come from the page's handling sections and examples.)

#### Checking a key's limits: `GET /api/v1/key`

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// SDK reference name. The limits page example writes apiKeys.getCurrent() instead (see note below).
const keyInfo = await openRouter.apiKeys.getCurrentKeyMetadata();
console.log(keyInfo);
```

```python
import json
import os
import requests

response = requests.get(
  url="https://openrouter.ai/api/v1/key",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"
  }
)

print(json.dumps(response.json(), indent=2))
```

```typescript
const response = await fetch('https://openrouter.ai/api/v1/key', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  },
});

const keyInfo = await response.json();
console.log(keyInfo);
```

SDK naming conflict: the limits page calls `openRouter.apiKeys.getCurrent()`, but the TypeScript SDK reference README (method list) and the spec's SDK name hint use `openRouter.apiKeys.getCurrentKeyMetadata()`, which the example above uses. Verify against your installed version ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)).

Response shape (from the limits page):

```typescript
// One budget that applies to requests made with the key
type Budget = {
  scope: 'workspace_default_member' | 'workspace_default_key' | 'member' | 'api_key' | 'workspace' | 'key_limit';
  guardrail_id: string | null; // Set for guardrail scopes
  budget_id: string | null; // Set for the workspace scope
  limit_usd: number;
  spend_usd: number; // Spend counted against the limit in the current window
  remaining_usd: number; // limit_usd - spend_usd; zero or negative blocks requests
  reset_interval: 'daily' | 'weekly' | 'monthly' | null; // null never resets
  resets_at: string | null; // ISO 8601 UTC instant the window rolls over, or null
  include_byok: boolean; // Whether external BYOK spend counts toward this budget
};

type Key = {
  data: {
    label: string;
    limit: number | null; // Credit limit for the key, or null if unlimited
    limit_reset: string | null; // Type of limit reset for the key, or null if never resets
    limit_remaining: number | null; // Remaining credits for the key, or null if unlimited
    include_byok_in_limit: boolean;  // Whether to include external BYOK usage in the credit limit

    budgets: Budget[]; // Every budget enforced for this key, in the order enforcement checks them
    effective_budget: Budget | null; // The budget that blocks requests first, or null if none

    usage: number; // Number of credits used (all time)
    usage_daily: number; // Number of credits used (current UTC day)
    usage_weekly: number; // ... (current UTC week, starting Monday)
    usage_monthly: number; // ... (current UTC month)

    byok_usage: number; // Same for external BYOK usage
    byok_usage_daily: number;
    byok_usage_weekly: number;
    byok_usage_monthly: number;

    is_free_tier: boolean; // Whether the user has paid for credits before

    free_model_daily_requests: {
      used: number; // Free-model requests recorded so far in the current UTC day
      limit: number; // Free-model requests allowed per UTC day
      remaining: number; // Free-model requests left in the current UTC day
    };
    // rate_limit: { ... } // A deprecated object in the response, safe to ignore
  };
};
```

Additional fields in the OpenAPI spec's `GET /key` response: `allowed_data_regions` (array of `global` / `europe` / `us` permitted by guardrail policies and the account's regional-routing entitlement), `creator_user_id`, `expires_at` (optional), `is_management_key`, `is_provisioning_key` (deprecated), `organization_id` (null for individual accounts), `workspace_id` (null when no active workspace resolved), `rate_limit` (deprecated; "Will always return -1"). Full schema: [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data).

`GET /api/v1/credits` (management key required) returns `data.total_credits` and `data.total_usage` ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

#### Credit limits

1. **Account balance**: available credits across the account. With a **negative credit balance** you may see `402` errors, **including for free models**. Add credits to bring the balance above zero to use them again.
2. **Per-key credit limit**: optional cap on an individual key, described by `limit`, `limit_reset`, `limit_remaining`.
3. **In-flight spending budget**: a cap on the estimated token cost of paid requests running or recently completed, relative to your balance.

##### In-flight spending budget

- OpenRouter charges a request when it finishes, so many concurrent requests could commit more than the balance covers. To prevent that, each paid request's **token cost is estimated up front** at the endpoint's prices: input tokens plus the completion tokens allowed by `max_tokens`, up to a fixed per-request cap (the cap is used when `max_tokens` is not set).
- Only token prices are estimated: per-request fees, plugin charges, and image pricing are not, so a request with no token component is not held.
- The estimate is held while the request runs; when it completes or fails, the hold is replaced by the actual cost for a short settlement window, then released.
- The total that can be held is your in-flight spending budget: a fraction of your current balance, up to a fixed ceiling. A request whose estimate doesn't fit alongside running and recently completed requests is rejected with `402` **before it reaches a provider**, even with a positive balance.
- `error.metadata` says which case you hit:
  - `"reason": "in_flight_budget_exhausted"` with `"limit_source": "openrouter_in_flight_budget"`: running/recent requests fill the budget. Transient; can occur with nothing running while recent costs settle. The response includes `Retry-After`; wait and retry.
  - `"reason": "weight_exceeds_budget"` with `"limit_source": "openrouter_credits"`: this single request's estimate is larger than the whole budget; retrying won't help. Lower `max_tokens` or the prompt size, or add credits.
- Every `402` whose metadata has `limit_source` also has `remedy_hint`, a one-line human-readable next step. Branch on `limit_source`, not on the hint text.
- Scope: prepaid accounts spending their own credits, and only a subset of them: accounts whose balance is below a threshold and, while rolling out, newer accounts without an established spending history. A larger balance raises the budget up to the ceiling; a balance at or above the threshold is exempt. Not applied to free models, to requests served entirely with your own provider keys (BYOK) that use no paid plugins, or to enterprise, paid-subscription, or invoice-billed accounts.

```json
{
  "error": {
    "code": 402,
    "message": "This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.",
    "metadata": {
      "reason": "in_flight_budget_exhausted",
      "limit_source": "openrouter_in_flight_budget",
      "remedy_hint": "Retry after your in-flight requests settle (see the Retry-After header). Adding credits at https://openrouter.ai/settings/credits raises your in-flight budget, up to a capped ceiling."
    }
  }
}
```

##### Handling 402

- Check `error.metadata.limit_source`:
  - `openrouter_in_flight_budget`: in-flight budget full (not your balance); wait for `Retry-After` and retry.
  - `openrouter_key_limit`: the API key's credit limit is exhausted; raise it or wait for the reset (`limit_reset`).
  - `openrouter_credits`: balance can't cover the request, or the single request is too expensive for your in-flight budget.
- Add credits to bring the balance above zero or raise the in-flight budget.
- Reduce request size (fewer input tokens or lower `max_tokens`).
- Monitor `limit_remaining` and usage proactively via `GET /api/v1/key`.
- The OpenAI, Anthropic, Vercel AI, and OpenRouter SDKs do **not** retry `402` on their own; for the in-flight case catch the error, read `Retry-After`, and retry explicitly.

#### Budget limits

Org-admin spend caps, checked **in this order** on every paid request; the first one that is spent blocks:

1. **Guardrail budgets**: a `limit_usd` with `reset_interval` on the workspace default guardrail (checked against the member's combined spend, then against the key's own spend), on the guardrail assigned to the member, and on the guardrail assigned to the API key ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) Guardrails).
2. **Workspace budgets**: caps on the whole workspace's spend per interval ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)).
3. **The key's own limit** (`limit`), once its window is spent.

Windows are UTC: a daily budget resets at 00:00 UTC, weekly on Monday 00:00 UTC, monthly on the first of the month 00:00 UTC. A lifetime workspace budget never resets.

`GET /api/v1/key` lists every budget that applies to the key in `budgets`, with spend counted, remaining amount, and rollover time. `effective_budget` is the budget that blocks first: when one is already spent, it is the entry enforcement rejects on (the first in the order above, or the broadest spent workspace budget); otherwise it is the entry with the least `remaining_usd`. `limit` and `limit_remaining` keep describing only the key's own limit.

```json
{
  "data": {
    "limit": null,
    "limit_remaining": null,
    "budgets": [
      {
        "scope": "workspace_default_member",
        "guardrail_id": "0df9e665-d932-5740-b2c7-b52af166bc11",
        "budget_id": null,
        "limit_usd": 100,
        "spend_usd": 40,
        "remaining_usd": 60,
        "reset_interval": "weekly",
        "resets_at": "2026-10-12T00:00:00.000Z",
        "include_byok": false
      },
      {
        "scope": "member",
        "guardrail_id": "6b1d2c3e-4f50-4a61-9b72-83c4d5e6f708",
        "budget_id": null,
        "limit_usd": 50,
        "spend_usd": 40,
        "remaining_usd": 10,
        "reset_interval": "weekly",
        "resets_at": "2026-10-12T00:00:00.000Z",
        "include_byok": false
      }
    ],
    "effective_budget": {
      "scope": "member",
      "guardrail_id": "6b1d2c3e-4f50-4a61-9b72-83c4d5e6f708",
      "budget_id": null,
      "limit_usd": 50,
      "spend_usd": 40,
      "remaining_usd": 10,
      "reset_interval": "weekly",
      "resets_at": "2026-10-12T00:00:00.000Z",
      "include_byok": false
    }
  }
}
```

##### Handling 403 budget errors

A budget-blocked request fails with `403` before it reaches a provider. The message names the budget and ends with the figures; `error.metadata` carries them as fields:

```json
{
  "error": {
    "code": 403,
    "message": "Org member budget limit exceeded (weekly limit). Contact your org admin. $52.00 of $50.00 used; resets 2026-10-12T00:00:00.000Z.",
    "metadata": {
      "limit_source": "openrouter_guardrail_budget",
      "remedy_hint": "Wait for the budget window to reset (see metadata.resets_at), or ask your org admin to raise the guardrail budget.",
      "scope": "member",
      "limit_usd": 50,
      "spend_usd": 52,
      "resets_at": "2026-10-12T00:00:00.000Z"
    }
  }
}
```

- `limit_source`: `openrouter_guardrail_budget` (guardrail budget), `openrouter_workspace_budget` (workspace budget), `openrouter_key_limit` (key's own limit).
- `scope` matches the `scope` values in `GET /api/v1/key` `budgets`.
- `resets_at`: ISO 8601 UTC rollover instant, or `null` for a lifetime workspace budget. Retrying before it fails the same way. There is **no `Retry-After`** header, because the wait is usually hours or days.
- Before a long task, call `GET /api/v1/key` and watch `effective_budget.remaining_usd` to avoid hitting the cap partway through.

#### Rate limits

1. **Free usage limits** (free variants, model IDs ending in `:free`):

| Credits purchased (all time) | Requests per minute | Requests per day |
| - | - | - |
| Less than 10 | 20 | 50 |
| At least 10 | 20 | 1000 |

- `free_model_daily_requests` in `GET /api/v1/key` reports the daily counter and ceiling (`used`, `limit`, `remaining`) gating free-model requests when these limits apply. Exempt accounts and endpoints, and BYOK requests, are not gated by it, so `remaining` reflects the tier policy rather than an enforced ceiling for them. The **per-minute limit is not reported**. The counter resets at UTC midnight.
- The `limit` tier is chosen by all-time credits purchased, independently of `is_free_tier`. To absorb rounding and top-up fees, the higher daily ceiling is granted from **one credit below** the threshold. (The page shows an unrendered template here, `{FREE_MODEL_CREDITS_THRESHOLD - 1}` credits; with the table's 10-credit threshold that is 9.) An account that purchased fewer credits than that reports `is_free_tier: false` together with the lower daily ceiling.

2. **Key-management limits**: creating, updating, and deleting API keys with a management key count toward a daily limit per account or organization: **10,000 requests per day** by default, resetting at **00:00 UTC**.
   - `POST /api/v1/keys`, `PATCH /api/v1/keys/{hash}` (including disabling a key), and `DELETE /api/v1/keys/{hash}` count toward the same limit. A request counts even if it fails (e.g. a 404 for an unknown key).
   - Reading keys, usage, or credits doesn't count.
   - At the limit, requests fail with `429` until the reset; `X-RateLimit-Reset` gives the reset time in **milliseconds since the Unix epoch**.
   - For short-lived per-job keys, set `expires_at` at creation instead of deleting afterwards; this halves the counted requests.
   - For a higher limit, contact support.

3. **Per-IP burst limits** (requests per client IP per minute) on:
   - Key writes: `POST /api/v1/keys`, `PATCH /api/v1/keys/{hash}`, `DELETE /api/v1/keys/{hash}`
   - Key reads: `GET /api/v1/keys`, `GET /api/v1/keys/{hash}`
   - Current key and credits: `GET /api/v1/key`, `GET /api/v1/credits`
   - Each endpoint counts separately, except `PATCH` and `DELETE` on `/api/v1/keys/{hash}` share a count. Key-write limits are lower than the others. These responses carry **no `X-RateLimit-*` headers**: wait a few seconds and retry with exponential backoff. (No numeric values are published.)

4. **DDoS protection**: Cloudflare's DDoS protection blocks requests that dramatically exceed reasonable usage.

##### Handling 429

```json
{
  "error": {
    "code": 429,
    "message": "Rate limit exceeded",
    "metadata": {
      "error_type": "rate_limit_exceeded"
    }
  }
}
```

A `429` comes from one of two places:

1. **OpenRouter**, when you hit a platform limit above (free-model per minute or per day, key-management per day, per-IP burst, DDoS protection).
2. **The upstream provider**, when the provider serving the request is rate limiting or at capacity. `error.metadata.provider_code` carries the provider's original error code when available. Fallback routing retries other providers for the same model automatically before the error reaches you; add fallback models (`models`) to try different models when all providers of the first are exhausted ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

Headers: successful inference responses carry no `X-RateLimit-*` headers. When OpenRouter itself returns `429` for a free-model or key-management limit, the error carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. When every attempted provider returned a retry hint, the error also carries `Retry-After`. `GET /api/v1/key` reports the remaining free-model daily quota but not the key-management limit.

Resolution:

- Retry with exponential backoff; honor `Retry-After` when present.
- On `:free` variants, purchase at least 10 credits to raise the daily limit, or switch to the paid variant, which has no platform-level request cap.
- For provider-side limits, add fallback models or relax provider routing preferences so more providers are eligible.

##### Mid-stream rate limits

If a rate limit is hit after streaming started, it arrives as an SSE chunk with `finish_reason: "error"` instead of an HTTP `429` (the `200` was already sent):

```text
data: {"id":"cmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","provider":"openai","error":{"code":429,"message":"Rate limit exceeded"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

#### Gotchas

- `402` isn't always "out of money": check `limit_source`; only `openrouter_in_flight_budget` is wait-and-retry.
- `403` can be a budget block (no `Retry-After`; wait for `resets_at`), a guardrail block, or a moderation flag ([§4.6](#46-errors-and-debugging)).
- A negative account balance blocks even `:free` models.
- Extra keys or accounts do not add rate-limit capacity.

Sources: https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/api_reference/errors-and-debugging, OpenAPI spec (`GET /key`, `GET /credits`)

### 4.6 Errors and debugging

#### Error response shape

```typescript
type ErrorResponse = {
  error: {
    code: number;
    message: string;
    metadata?: Record<string, unknown>;
  };
};
```

The OpenAPI error schemas (`BadRequestResponse`, `UnauthorizedResponse`, ...) add two optional top-level fields: `openrouter_metadata` (object or null; routing context when opted in via `X-OpenRouter-Metadata: enabled`) and `user_id` (string or null). `error.code` and `error.message` are required; `error.metadata` is an object or null.

**When is the HTTP status an error?** The HTTP status equals `error.code` when the request itself fails: the original request is invalid, or the API key/account is out of credits (and other pre-flight rejections such as auth, rate limits, budgets, guardrails). Otherwise the HTTP status is `200` and any error that occurs while the LLM is producing output is emitted **in the response body or as an SSE event**.

```typescript
const request = await fetch('https://openrouter.ai/...');
console.log(request.status); // Will be an error code unless the model started processing your request
const response = await request.json();
console.error(response.error?.code); // Will be an error code
console.error(response.error?.message);
```

#### HTTP status codes

| Status | Meaning |
| - | - |
| `400` | Bad Request (invalid or missing params, CORS) |
| `401` | Invalid credentials (OAuth session expired, disabled/invalid API key) |
| `402` | Account or API key has insufficient credits; add credits and retry ([§4.5](#45-limits-credits-budgets-rate-limits) for `limit_source`) |
| `403` | Forbidden (insufficient permissions, guardrail block, budget block, or moderation flag) |
| `408` | Request timed out |
| `429` | Rate limited |
| `502` | Chosen model is down or OpenRouter received an invalid response from it |
| `503` | No available model provider meets your routing requirements |

Additional statuses declared across the OpenAPI spec (per endpoint):

| Status | Spec description |
| - | - |
| `404` | Not Found - Resource does not exist |
| `409` | Conflict - Resource conflict or concurrent modification |
| `410` | Gone - Endpoint has been permanently removed or deprecated (also used when batch results were deleted after the 30-day retention window) |
| `413` | Payload Too Large - Request payload exceeds size limits |
| `422` | Unprocessable Entity - Semantic validation failure |
| `499` | Client Closed Request - The caller cancelled the request |
| `500` | Internal Server Error - Unexpected server error |
| `504` | Gateway Timeout - Provider did not respond before the upstream deadline |
| `524` | Infrastructure Timeout - Provider request timed out at edge network |
| `529` | Provider Overloaded - Provider is temporarily overloaded |

#### `Retry-After` header

On `429` and `503`, and on `402` whose `error.metadata.limit_source` is `openrouter_in_flight_budget`, OpenRouter may include a standard `Retry-After` header (seconds to wait). A `402` **without** the header is not a wait-and-retry case ([§4.5](#45-limits-credits-budgets-rate-limits)).

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

The OpenAI SDK, Anthropic SDK, Vercel AI SDK, and OpenRouter SDK already respect this header on the statuses each retries automatically. None retries `402` on its own. With raw `fetch`:

```typescript
const res = await fetch('https://openrouter.ai/api/v1/responses', { /* ... */ });
if (res.status === 429 || res.status === 503 || res.status === 402) {
  const retryAfter = Number(res.headers.get('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    // retry the request
  }
}
```

#### Moderation errors

If your input was flagged, `error.metadata` contains:

```typescript
type ModerationErrorMetadata = {
  reasons: string[]; // Why your input was flagged
  flagged_input: string; // The text segment that was flagged, limited to 100 characters. If the flagged input is longer than 100 characters, it will be truncated in the middle and replaced with ...
  provider_name: string; // The name of the provider that requested moderation
  model_slug: string;
};
```

#### Budget errors

When a guardrail budget, workspace budget, or the key's own limit is spent, the request is rejected with `403` before it reaches a provider. The message ends with `$X of $Y used; resets <ISO instant>.`

```json
{
  "error": {
    "code": 403,
    "message": "Budget limit exceeded (weekly limit). Contact your org admin. $52.00 of $50.00 used; resets 2026-10-12T00:00:00.000Z.",
    "metadata": {
      "limit_source": "openrouter_guardrail_budget",
      "remedy_hint": "Wait for the budget window to reset (see metadata.resets_at), or ask your org admin to raise the guardrail budget.",
      "scope": "workspace_default_member",
      "limit_usd": 50,
      "spend_usd": 52,
      "resets_at": "2026-10-12T00:00:00.000Z"
    }
  }
}
```

| Field | Meaning |
| - | - |
| `limit_source` | `openrouter_guardrail_budget`, `openrouter_workspace_budget`, or `openrouter_key_limit` |
| `scope` | Which layer blocked: `workspace_default_member`, `workspace_default_key`, `member`, `api_key`, `workspace`, or `key_limit` (as listed by `GET /api/v1/key`) |
| `limit_usd` | The budget's limit in USD |
| `spend_usd` | Spend counted against it in the current window |
| `resets_at` | ISO 8601 UTC rollover instant, or `null` for a lifetime budget |
| `remedy_hint` | One-line next step for logs; branch on `limit_source`, not this text |

#### Guardrail errors

On `/chat/completions`, `/responses`, and `/messages`, a request can be blocked before reaching a provider, e.g. by a content filter or prompt-injection detector configured via guardrails ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). The response is `403` with the block reason. The OpenRouter-shaped body below applies to `/chat/completions` and `/responses`; on `/messages` the block is an Anthropic `permission_error` envelope (with `openrouter_metadata` still at the top level when opted in).

```json
{
  "error": {
    "code": 403,
    "message": "Request blocked: prompt injection patterns detected",
    "metadata": {
      "patterns": ["ignore all previous instructions"]
    }
  }
}
```

With `X-OpenRouter-Experimental-Metadata: enabled` (or `X-OpenRouter-Metadata: enabled`), the 403 also includes the full `openrouter_metadata` object with routing context and a `pipeline` array describing the guardrail stages that ran:

```json
{
  "error": {
    "code": 403,
    "message": "Request blocked: prompt injection patterns detected",
    "metadata": { "patterns": ["ignore all previous instructions"] }
  },
  "openrouter_metadata": {
    "requested": "openai/gpt-4o",
    "strategy": "direct",
    "region": "iad",
    "summary": "available=1",
    "attempt": 1,
    "is_byok": false,
    "endpoints": {
      "total": 1,
      "available": [
        { "provider": "OpenAI", "model": "openai/gpt-4o", "selected": false }
      ]
    },
    "pipeline": [
      {
        "type": "guardrail",
        "name": "regex_pi_detection",
        "guardrail_id": "grd_abc123",
        "guardrail_scope": "api-key",
        "summary": "Blocked: prompt injection detected (1 pattern matched)",
        "data": {
          "action": "blocked",
          "detected": true,
          "engines": ["regex"],
          "patterns": ["ignore all previous instructions"]
        }
      }
    ]
  }
}
```

`openrouter_metadata` has the same shape as on successful responses (stage types and fields: [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Router metadata).

#### Provider errors

OpenRouter normalizes every upstream provider error into a stable, typed `error_type` vocabulary (below). The same `error_type` values apply whether the error arrives in a non-streaming body or a mid-stream SSE event. Native protocol codes (Anthropic `error.type`, Responses `error.code`) are best-effort and can differ between formats; **`error_type` is the field to rely on**.

Chat Completions, provider error that interrupts generation:

```json
{
  "error": {
    "code": 429,
    "message": "Rate limit exceeded",
    "metadata": {
      "error_type": "rate_limit_exceeded",
      "provider_code": "rate_limited"
    }
  }
}
```

**Masking and raw provider details**

- On a `500`, `message` is replaced with a generic string, and `provider_code` and `openrouter_metadata` are omitted, but `error_type` is still present (`server`).
- For non-500 errors, the provider's own code is in `error.metadata.provider_code` when available. Opt-in routing context (selected provider, fallback attempts, ...) is in `openrouter_metadata` when the request sets `X-OpenRouter-Metadata` (routing-summary fields only).

#### When no content is generated

Occasionally a model returns no content. Typical causes:

- The model is warming up from a cold start (usually a few seconds to a few minutes, depending on model and provider).
- The system is scaling up to handle more requests.
- A reasoning model spent the whole `max_tokens` budget on reasoning: response is `200` with `finish_reason: "length"`, empty `content`, and `usage.completion_tokens_details.reasoning_tokens` close to `usage.completion_tokens`. Retrying doesn't help; raise `max_tokens` or cap reasoning ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Reasoning tokens).

For persistent no-content issues, retry, or try a different provider or a model with more recent activity. You may still be charged for prompt processing by the upstream provider even if no content is generated (but see zero completion insurance below).

#### Streaming and non-streaming error timing

- **Pre-stream errors** (before any tokens are sent) use the standard error format with a proper 4xx/5xx status. At this stage OpenRouter can still return an HTTP error status, silently retry another provider endpoint if fallback routing is enabled, and apply rate-limit or auth checks. Examples: invalid API keys, malformed requests, every provider endpoint exhausted before streaming starts.
- **Mid-stream errors**: OpenRouter sends `200 OK` and headers as soon as the provider accepts the request, before any token. An HTTP status is final once sent, so every later failure is reported inside the response: an SSE error event (streaming) or an error body (non-streaming). This includes provider errors that arrive before any token. Failover stops once part of the answer has reached you.
- If an attempt fails before any tokens reach you, OpenRouter automatically tries a backup provider; the status stays `200` even if every provider fails, and the **last** error reaches you in the body.
- Common mid-stream causes: provider disconnect after partial output; provider timeout (read deadline expires); token limit hit during generation (`max_tokens` or context window); output content filter flags already-streamed text; provider overload (rate-limit/capacity error after streaming began).

Chat Completions mid-stream error chunk:

```typescript
type MidStreamError = {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  provider: string;
  error: {
    code: number;       // HTTP status code (e.g. 400, 429, 502)
    message: string;
    metadata?: {
      error_type: string;     // Typed error code — see table below
      provider_code?: string; // Original upstream error code (omitted on 500s)
    };
  };
  choices: [{
    index: 0;
    delta: { content: '' };
    finish_reason: 'error';
    native_finish_reason?: string;
  }];
};
```

```text
data: {"id":"gen-abc123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","provider":"OpenAI","error":{"code":429,"message":"Rate limit exceeded","metadata":{"error_type":"rate_limit_exceeded"}},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

- Error at the **top level** next to standard fields; `error.metadata.error_type` is switchable; `choices` has `finish_reason: "error"`; status stays `200`; stream ends after it; on 500-class errors `message` is generic and `provider_code` omitted.
- **Non-streaming requests**: same timing. If the provider returns headers and then fails, you get `200 OK` whose JSON body holds **only an `error` object and no `choices`**; its `id` identifies the generation for support. Always check the body for `error` even on `200`.

#### Typed error codes (`error_type`)

Where it appears:

- Chat Completions: `error.metadata.error_type` (mid-stream chunk, and non-streaming responses when a provider error interrupts generation).
- Anthropic Messages: `error.error_type` (SSE `error` event and non-streaming error envelope).
- Responses: top-level `error_type` on the failed response (streaming `response.failed` and non-streaming JSON).

Token and length limits:

| `error_type` | HTTP | Description |
| - | - | - |
| `context_length_exceeded` | 400 | Combined input and output tokens exceed the model's context window |
| `max_tokens_exceeded` | 400 | Output token limit reached (`max_output_tokens` on Responses; `max_tokens`/`max_completion_tokens` on Chat Completions) |
| `token_limit_exceeded` | 400 | A token budget enforced by OpenRouter (e.g. credit-based cap) was exceeded |
| `string_too_long` | 400 | A single string field (system prompt, user message, ...) exceeded the provider's per-field character limit |

Authentication and authorization:

| `error_type` | HTTP | Description |
| - | - | - |
| `authentication` | 401 | API key missing, invalid, or revoked |
| `permission_denied` | 403 | Key valid but lacks permission, or request blocked by a guardrail |
| `payment_required` | 402 | Insufficient credits on account or key |

Rate limiting and availability:

| `error_type` | HTTP | Description |
| - | - | - |
| `rate_limit_exceeded` | 429 | Request- or token-level rate limit; respect `Retry-After` |
| `provider_overloaded` | 503 | Upstream temporarily overloaded; retry after a short delay |
| `provider_unavailable` | 502 | Upstream returned an invalid or empty response; may auto-retry another provider with fallback routing |

Request validation:

| `error_type` | HTTP | Description |
| - | - | - |
| `invalid_request` | 400 | A request parameter is malformed or missing |
| `invalid_prompt` | 400 | A specific message (`input` on Responses, `messages` on Chat Completions) is invalid (e.g. unsupported role, empty content) |
| `not_found` | 404 | Resource (model, file, ...) doesn't exist |
| `precondition_failed` | 412 | A precondition header (e.g. `If-Match`) was not satisfied |
| `payload_too_large` | 413 | Request body exceeds the maximum size |
| `unprocessable` | 422 | Syntactically valid but semantically unprocessable |

Content policy:

| `error_type` | HTTP | Description |
| - | - | - |
| `content_policy_violation` | 403 | Input or output flagged by a content filter running separately from the model (provider- or OpenRouter-level), e.g. Gemini's `SAFETY` block |
| `refusal` | 403 | Provider reported a model refusal as an error (e.g. Anthropic "refused to respond" / usage-policy envelopes); `error.message` carries the explanation when available |

Both policy types use `403` for every provider and skin, regardless of the provider's wire status. Mid-stream, `403` is the `code` inside the error body. `metadata.provider_name`, `metadata.provider_code`, and `metadata.raw` identify who declined and carry the verbatim payload. A refusal the model produces as successful output is **not** an error: Chat Completions returns `message.refusal` with `finish_reason: "content_filter"`; Responses returns `status: "incomplete"`, `incomplete_details.reason: "content_filter"`, and a `refusal` content part. Fallback to another model still runs before any output is returned when routing allows.

Image errors:

| `error_type` | HTTP | Description |
| - | - | - |
| `invalid_image` | 400 | Image corrupt or unreadable |
| `image_too_large` | 400 | Exceeds provider max file size or pixel dimensions |
| `image_too_small` | 400 | Below provider minimum pixel dimensions |
| `unsupported_image_format` | 400 | Format not supported by provider |
| `image_not_found` | 404 | Referenced image URL or file ID couldn't be resolved |
| `image_download_failed` | 400 | OpenRouter couldn't download the image (DNS failure, timeout, non-200, ...) |

Generic:

| `error_type` | HTTP | Description |
| - | - | - |
| `server` | 500 | Unexpected internal error; upstream message masked |
| `timeout` | 504 | Provider didn't respond in time |
| `unmapped` | 500 | Upstream error with no known category; `error.metadata.provider_code` may hold the original code |

#### Skin-specific error formats

**Chat Completions** (`/api/v1/chat/completions`): mid-stream errors are a `chat.completion.chunk` with top-level `error` (above). For non-streaming requests with a provider error, the error can be embedded in the final response next to partial content:

```json
{
  "choices": [{
    "message": { "role": "assistant", "content": "partial output..." },
    "finish_reason": "error",
    "error": {
      "code": 502,
      "message": "Provider disconnected mid-stream",
      "metadata": { "error_type": "provider_unavailable" }
    }
  }]
}
```

**Responses API** (`/api/v1/responses`): internal types map onto the OpenAI Responses `error.code` set, which is narrower (many collapse to `server_error`), so the precise reason is kept in a top-level `error_type`:

| Internal `error_type` | Responses `error.code` |
| - | - |
| `rate_limit_exceeded` | `rate_limit_exceeded` |
| `context_length_exceeded`, `invalid_request`, `refusal` | `invalid_prompt` |
| `content_policy_violation` | `image_content_policy_violation` |
| `authentication`, `provider_overloaded`, `provider_unavailable`, `timeout`, `server` | `server_error` |
| All others (including `invalid_prompt`) | `server_error` |

```json
{
  "id": "resp_abc123",
  "status": "failed",
  "error": { "code": "server_error", "message": "Invalid credentials" },
  "error_type": "authentication"
}
```

The spec's Responses `error.code` enum is broader than this table: `server_error`, `rate_limit_exceeded`, `invalid_prompt`, `vector_store_timeout`, `invalid_image`, `invalid_image_format`, `invalid_base64_image`, `invalid_image_url`, `image_too_large`, `image_too_small`, `image_parse_error`, `image_content_policy_violation`, `invalid_image_mode`, `image_file_too_large`, `unsupported_image_media_type`, `empty_image_file`, `failed_to_download_image`, `image_file_not_found`, `bio_policy`, `cyber_policy`, `misalignment_policy_violation`, `data_residency_mismatch`, `permission_denied` (added 2026-10-14). The Responses error-handling page also lists `permission_denied` (403: a well-formed request declined by a policy gate such as an Alignment plugin block or a HIPAA refusal).

Stream terminal events: `response.failed` (terminal; `response.status: "failed"`, `response.error`, `response.error_type`), plus the schema-defined plain `error` event whose fields sit directly on the event:

```json
{ "type": "response.failed", "response": { "id": "resp_abc123", "status": "failed", "error": { "code": "server_error", "message": "Internal server error" }, "error_type": "server" } }
```

```json
{ "type": "error", "code": "invalid_api_key", "message": "Invalid API key provided", "param": null, "sequence_number": 3 }
```

Error code transformations (token/length errors become a completed-but-truncated response instead of a failure; Chat Completions equivalent is `finish_reason: "length"`):

| Upstream error code | Result on `/api/v1/responses` |
| - | - |
| `context_length_exceeded` (with `param: "input"`, or an overflow message) | Terminal failure: non-streaming gets an error status; streams end with `response.failed` carrying `error.code: "invalid_prompt"` |
| `context_length_exceeded` (output budget) | `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"` |
| `max_tokens_exceeded` | `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"` |
| `token_limit_exceeded` | `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"` |
| `string_too_long` | `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"` |

Streams for the truncated cases end with `response.incomplete`.

**Anthropic Messages** (`/api/v1/messages`):

| Internal `error_type` | Anthropic `error.type` |
| - | - |
| `authentication` | `authentication_error` |
| `permission_denied` | `permission_error` |
| `payment_required` | `billing_error` |
| `not_found`, `image_not_found` | `not_found_error` |
| `rate_limit_exceeded` | `rate_limit_error` |
| `provider_overloaded`, `timeout` | `overloaded_error` |
| `context_length_exceeded`, `content_policy_violation`, `refusal`, `invalid_request`, ... | `invalid_request_error` |
| `provider_unavailable`, `server`, `unmapped`, ... | `api_error` |

The canonical `error_type` is added inside the `error` object next to the lossy native `type`, both in non-streaming envelopes and SSE `error` events. Pre-Router errors (e.g. authentication) carry `request_id: null`; post-Router errors carry the `gen-` generation ID.

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "Invalid credentials",
    "error_type": "authentication"
  },
  "request_id": null
}
```

```json
{
  "type": "error",
  "error": {
    "type": "overloaded_error",
    "message": "Provider is temporarily overloaded",
    "error_type": "provider_overloaded"
  }
}
```

#### When errors are billed

- **Zero completion insurance** (applies automatically to all models/providers): no charge for the model's prompt, completion, or reasoning tokens when the response has zero completion tokens and a blank/null finish reason, or has an error finish reason, even if the provider charged OpenRouter for prompt processing. Auxiliary work already performed (web search fees, file parsing/PDF OCR, web fetch) may still be billed and appears in the usage breakdown (sometimes skipped too, e.g. upstream failure with no tokens). Details: [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Zero completion insurance.
- **Cancelled streams**: billing stops immediately only for providers that support cancellation; otherwise (and for non-streaming requests) you pay for the full response ([§4.4](#44-streaming-server-sent-events)).
- **Pre-flight rejections** (`402` in-flight budget, `403` budget/guardrail) happen before the request reaches a provider.
- **No-content responses**: the errors page notes the upstream provider may still charge prompt processing; zero completion insurance covers model token costs for qualifying responses.

#### Retry guidance

| Situation | Retry? | How |
| - | - | - |
| `429` (OpenRouter or provider) | Yes | Exponential backoff; honor `Retry-After`; for provider limits add fallback models / relax routing |
| `503` / `provider_overloaded`, `529` | Yes | Short delay; honor `Retry-After`; enable fallbacks |
| `502` / `provider_unavailable`, `timeout`, `524` | Yes | Backoff; OpenRouter may already have tried other providers |
| `402` with `limit_source: openrouter_in_flight_budget` | Yes | Wait `Retry-After`, then retry (SDKs won't do it) |
| `402` other (`openrouter_credits`, `openrouter_key_limit`), `weight_exceeds_budget` | No | Add credits, raise key limit, or shrink request |
| `403` budget | Not before `resets_at` | Wait or raise budget |
| `403` guardrail / moderation / `refusal` / `content_policy_violation` | No | Change the input or policy |
| `400` / `401` / `404` / `413` / `422` | No | Fix the request or credentials |
| `200` with `finish_reason: "length"` and empty content on a reasoning model | No | Raise `max_tokens` or cap reasoning |
| Empty response from cold start | Yes | Simple retry or switch provider/model |

#### Debugging: echo the upstream request body

The `debug` option returns the exact transformed request body OpenRouter sent upstream. Works on Chat Completions and Responses; useful to see how parameters are mapped per provider.

```typescript
type DebugOptions = {
  echo_upstream_body?: boolean; // If true, returns the transformed request body sent to the provider
};
```

Chat Completions:

```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'anthropic/claude-haiku-5.5',
    stream: true, // Debug only works with streaming
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ],
    debug: {
      echo_upstream_body: true,
    },
  }),
});

const text = await response.text();

for (const line of text.split('\n')) {
  if (!line.startsWith('data: ')) continue;

  const data = line.slice(6);
  if (data === '[DONE]') break;

  const parsed = JSON.parse(data);

  if (parsed.debug?.echo_upstream_body) {
    console.log('\nDebug:', JSON.stringify(parsed.debug.echo_upstream_body, null, 2));
  }

  process.stdout.write(parsed.choices?.[0]?.delta?.content ?? '');
}
```

```python
import json
import os
import requests

response = requests.post(
  url="https://openrouter.ai/api/v1/chat/completions",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
    "Content-Type": "application/json",
  },
  data=json.dumps({
    "model": "anthropic/claude-haiku-5.5",
    "stream": True,
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello!" }
    ],
    "debug": {
      "echo_upstream_body": True
    }
  }),
  stream=True
)

for line in response.iter_lines():
  if line:
    text = line.decode('utf-8')
    if 'echo_upstream_body' in text:
      print(text)
```

Responses API (same request with `input` instead of `messages`; look for the `response.debug` event):

```typescript
const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'anthropic/claude-haiku-5.5',
    stream: true,
    input: 'Hello!',
    debug: { echo_upstream_body: true },
  }),
});

const text = await response.text();

for (const line of text.split('\n')) {
  if (!line.startsWith('data: ')) continue;
  const data = line.slice(6);
  if (data === '[DONE]') break;
  const parsed = JSON.parse(data);
  if (parsed.type === 'response.debug') {
    console.log('\nDebug:', JSON.stringify(parsed.debug, null, 2));
  }
}
```

Debug output formats:

- Chat Completions: a debug chunk is sent as the **first chunk** of the stream, with an empty `choices` array and a `debug.echo_upstream_body` field:

```json
{
  "id": "gen-xxxxx",
  "provider": "Anthropic",
  "model": "anthropic/claude-haiku-5.5",
  "object": "chat.completion.chunk",
  "created": 1234567890,
  "choices": [],
  "debug": {
    "echo_upstream_body": {
      "system": [
        { "type": "text", "text": "You are a helpful assistant." }
      ],
      "messages": [
        { "role": "user", "content": "Hello!" }
      ],
      "model": "claude-haiku-5-5",
      "stream": true,
      "max_tokens": 65536
    }
  }
}
```

- Responses API: a `response.debug` SSE event:

```json
{
  "type": "response.debug",
  "debug": {
    "echo_upstream_body": {
      "model": "claude-haiku-5-5",
      "messages": [
        { "role": "user", "content": "Hello!" }
      ],
      "stream": true,
      "max_tokens": 65536
    }
  },
  "sequence_number": 0
}
```

Important notes:

- **Streaming only**: non-streaming requests ignore `debug`. (Note the Chat Completions debug chunk has `choices: []`, so guard `choices?.[0]`.)
- **Not for production**: the output may expose sensitive request data. OpenRouter makes a best effort to redact sensitive or noisy data.
- Use cases: understanding parameter transformations (e.g. how `max_tokens`/`temperature` are set), verifying message formatting (system message concatenation, user message merging), checking applied defaults, and debugging provider fallbacks (a debug chunk is sent for **each attempted provider**).

Other debugging aids: the `X-Generation-Id` header + `GET /generation` ([§4.1](#41-api-overview)), `X-OpenRouter-Metadata: enabled` for routing context ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)), and the Activity/Logs pages ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)).

Sources: https://openrouter.ai/docs/api_reference/errors-and-debugging, https://openrouter.ai/docs/api_reference/responses/error-handling, https://openrouter.ai/docs/api_reference/limits, https://openrouter.ai/docs/api_reference/streaming, https://openrouter.ai/docs/guides/features/zero-completion-insurance, OpenAPI spec (error response schemas, `ResponsesErrorField`)

### 4.7 Versioning policy

- One stable version, **`v1`**, selected by URL path: `https://openrouter.ai/api/v1`. No version headers, no date-based version pinning. Every endpoint in the API Reference is part of `v1`.
- The API changes continuously, not in numbered releases. Every change is reflected in the OpenAPI spec; every release that changes the spec produces an entry in the API Changelog (generated automatically from spec diffs).

**Non-breaking changes ship without prior notice**:

- New endpoints
- New optional request parameters
- New fields in responses
- New response status codes
- New schemas, and new optional properties or union variants on existing schemas

Write clients defensively: **ignore unrecognized response fields and don't fail on unknown enum values**.

**Breaking changes** are reviewed by a human before publication and appear in the changelog under the **Breaking** tag with migration notes:

- Removing or renaming an endpoint, parameter, or response field
- Changing a field's type
- Widening a response field to allow `null` when it was previously always present
- Making an optional parameter required

(In practice the changelog also files new *required response* properties under "Breaking changes" with "No action needed", and tags each entry "Action required" or "No action needed".)

**Nullable response fields**: a present-but-`null` field means the value is genuinely absent. Read `null` as "not set"; don't substitute a default or assume a fallback. Example: `workspace_id` is `null` on a BYOK credential not scoped to any workspace (applies account-wide) and on a guardrail created before workspace scoping existed; in both cases `null` is distinct from "your default workspace", and a `null` guardrail does not apply to every workspace.

**Deprecations** are announced in the changelog and marked deprecated in the API Reference. Removing a deprecated feature is a breaking change and follows the process above. Model availability is separate from API versioning (providers add/remove models independently; list current models via the Models API, [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

**Staying up to date**: watch the API Changelog (`https://openrouter.ai/docs/changelog`), subscribe to the RSS feed (`https://openrouter.ai/docs/changelog/rss.xml`), and filter by the **Breaking** tag.

Sources: https://openrouter.ai/docs/api_reference/versioning, https://openrouter.ai/docs/changelog

### 4.8 Responses API guide

OpenRouter's Responses API (`POST https://openrouter.ai/api/v1/responses`) is an OpenAI-compatible, drop-in replacement for OpenAI's Responses API with reasoning, tool calling, and web search. Endpoint schema: [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference).

#### Stateless only

- Each request is independent; **no conversation state is persisted**. Send the full conversation history in `input` every time.
- Requests that set `store: true` or a non-null `previous_response_id` are **rejected with `400`**. (Spec: `store` is `const: false`, default `false`; `previous_response_id` is "Not supported on this proxy ... Send the full conversation history in `input` instead.")
- Replayed assistant content uses `output_text` parts; user content uses `input_text` parts.

Authentication is the usual Bearer key:

```python
import os
import requests

response = requests.post(
    'https://openrouter.ai/api/v1/responses',
    headers={
        'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        'Content-Type': 'application/json',
    },
    json={
        'model': 'openai/o4-mini',
        'input': 'Hello, world!',
    }
)
```

```bash
curl -X POST https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/o4-mini",
    "input": "Hello, world!"
  }'
```

Standard OpenRouter rate limits apply ([§4.5](#45-limits-credits-budgets-rate-limits)).

#### Basic usage

Simple string input:

```typescript
const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/o4-mini',
    input: 'What is the meaning of life?',
    max_output_tokens: 9000,
  }),
});

const result = await response.json();
console.log(result);
```

Structured message input (message array):

```typescript
body: JSON.stringify({
  model: 'openai/o4-mini',
  input: [
    {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'Tell me a joke about programming',
        },
      ],
    },
  ],
  max_output_tokens: 9000,
}),
```

Response:

```json
{
  "id": "resp_1234567890",
  "object": "response",
  "created_at": 1234567890,
  "model": "openai/o4-mini",
  "output": [
    {
      "type": "message",
      "id": "msg_abc123",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "The meaning of life is a philosophical question that has been pondered for centuries...",
          "annotations": []
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 12,
    "output_tokens": 45,
    "total_tokens": 57
  },
  "status": "completed"
}
```

Extract the text: find the last `output` item with `type === 'message'` and join its `output_text` parts (the OpenAI SDK exposes this as `response.output_text`).

Common parameters (guide table; full list in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)):

| Parameter | Type | Description |
| - | - | - |
| `model` | string | **Required.** Model to use (e.g. `openai/o4-mini`) |
| `input` | string or array | **Required.** Text or message array |
| `stream` | boolean | Enable streaming (default: `false`) |
| `max_output_tokens` | integer | Maximum tokens to generate |
| `temperature` | number | Sampling temperature (0-2) |
| `top_p` | number | Nucleus sampling (0-1) |

Other cross-cutting request fields: `instructions`, `models`, `provider`, `plugins`, `user`, `tools`, `tool_choice`, `parallel_tool_calls`, `max_tool_calls`, `reasoning`, `text`, `stop`, `metadata`, `session_id`, `trace`, `service_tier`, `debug`, `truncation`, `include` ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)).

Streaming (TypeScript, from the guide; see [§4.4](#44-streaming-server-sent-events) for a buffered parser and the spec event names):

```typescript
const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/o4-mini',
    input: 'Write a short story about AI',
    stream: true,
    max_output_tokens: 9000,
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        console.log(parsed);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}
```

The guide's sample stream output (note: it uses `response.content_part.delta` and `response.done`, whereas the spec defines `response.output_text.delta` and `response.completed`; handle the spec names):

```text
data: {"type":"response.created","response":{"id":"resp_1234567890","object":"response","status":"in_progress"}}

data: {"type":"response.output_item.added","response_id":"resp_1234567890","output_index":0,"item":{"type":"message","id":"msg_abc123","role":"assistant","status":"in_progress","content":[]}}

data: {"type":"response.content_part.added","response_id":"resp_1234567890","output_index":0,"content_index":0,"part":{"type":"output_text","text":""}}

data: {"type":"response.content_part.delta","response_id":"resp_1234567890","output_index":0,"content_index":0,"delta":"Once"}

data: {"type":"response.output_item.done","response_id":"resp_1234567890","output_index":0,"item":{"type":"message","id":"msg_abc123","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Once upon a time..."}]}}

data: {"type":"response.done","response":{"id":"resp_1234567890","object":"response","status":"completed","usage":{"input_tokens":12,"output_tokens":45,"total_tokens":57}}}

data: [DONE]
```

Basic error handling:

```typescript
try {
  const response = await fetch('https://openrouter.ai/api/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'openai/o4-mini', input: 'Hello, world!' }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error.error.message);
    return;
  }

  const result = await response.json();
  console.log(result);
} catch (error) {
  console.error('Network Error:', error);
}
```

Also check a `200` body for `status: "failed"` / `error` and `status: "incomplete"` ([§4.6](#46-errors-and-debugging)).

#### Multi-turn conversations

Include the full history each time. Replayed assistant messages use `output_text`; user messages use `input_text`.

```typescript
// Second request - include previous conversation
const secondResponse = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/o4-mini',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'What is the capital of France?' }],
      },
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_abc123',
        status: 'completed',
        content: [
          { type: 'output_text', text: 'The capital of France is Paris.', annotations: [] },
        ],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'What is the population of that city?' }],
      },
    ],
    max_output_tokens: 9000,
  }),
});
```

- The basic-usage page states **`id` and `status` are required for any `assistant` message** in the history. Other pages show assistant items without them (prefill examples with `{ role: 'assistant', content: '...' }`, the reasoning-tokens guide's `configuration_update` example). Safest: when replaying a prior output message, copy it as returned (with `id` and `status`).
- Simple messages may also be written as `{ role: 'user', content: '...' }` (used in the overview's prefill example).

Input items used across the guides:

| Item | Shape | Notes |
| - | - | - |
| User message | `{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }` or `{ role: 'user', content: '...' }` | Content parts: `input_text`, `input_image`, `input_file` (multimodal, [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) |
| Assistant message (replay) | `{ type: 'message', role: 'assistant', id, status, content: [{ type: 'output_text', text, annotations: [] }] }` | Last-position assistant message = prefill |
| Function call (replay) | `{ type: 'function_call', id, call_id, name, arguments }` | `arguments` is a JSON string |
| Function call output | `{ type: 'function_call_output', call_id, output, id? }` | `output`: string or array of `input_text`/`input_image`/`input_file` |
| Effort change | `{ type: 'configuration_update', reasoning: { effort } }` | Mid-conversation effort change, cache-friendly (see Reasoning) |

#### Reasoning

Configure with the `reasoning` object:

```typescript
body: JSON.stringify({
  model: 'openai/o4-mini',
  input: 'What is the meaning of life?',
  reasoning: { effort: 'high' },
  max_output_tokens: 9000,
}),
```

```python
response = requests.post(
    'https://openrouter.ai/api/v1/responses',
    headers={
        'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        'Content-Type': 'application/json',
    },
    json={
        'model': 'openai/o4-mini',
        'input': 'What is the meaning of life?',
        'reasoning': {'effort': 'high'},
        'max_output_tokens': 9000,
    }
)
```

Effort levels (guide table):

| `effort` | Description |
| - | - |
| `minimal` | Basic reasoning with minimal computational effort |
| `low` | Light reasoning for simple problems |
| `medium` | Balanced reasoning for moderate complexity |
| `high` | Deep reasoning for complex problems |

`reasoning` object fields in the OpenAPI spec (`ReasoningConfig`):

| Field | Type / values | Notes |
| - | - | - |
| `effort` | `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`, `null` | The guide documents only `minimal`–`high`; support varies by model ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)) |
| `summary` | `auto`, `concise`, `detailed`, `null` | Reasoning summary verbosity |
| `enabled` | boolean or null | |
| `max_tokens` | integer or null | Reasoning token budget |
| `context` | `auto`, `all_turns`, `current_turn`, `null` | Which earlier reasoning the model sees; only OpenAI GPT-5.6 and newer |
| `mode` | `standard` (default), `pro`, `null` | `pro` = deeper reasoning on supporting models, billed at standard token rates; only OpenAI GPT-5.6 and newer |

Changing effort mid-conversation without invalidating the prompt cache: insert a `configuration_update` item directly before the user message it should apply to (interchangeable with the Chat Completions and Messages forms; rules and supported models in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Reasoning tokens):

```json
{
  "model": "anthropic/claude-fable-5.1",
  "reasoning": { "effort": "high" },
  "input": [
    { "role": "user", "content": "Plan the migration." },
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "Here's the plan: ..." }] },
    { "type": "configuration_update", "reasoning": { "effort": "low" } },
    { "role": "user", "content": "Now rename the config file." }
  ]
}
```

Rules from the reasoning-tokens guide: don't place two updates adjacent; keep the item in the same position in later requests; can't combine with `truncation: "auto"` or `reasoning.mode: "pro"`; not accepted on the Batch API; a model that doesn't support it returns `400`.

Reasoning in multi-turn conversations works the same way as any multi-turn request (full history with `input_text`/`output_text` messages plus `reasoning: { effort }`).

Streaming reasoning (guide example; it filters `response.reasoning.delta`, which is not a spec event; the spec emits `response.reasoning_text.delta` and `response.reasoning_summary_text.delta`):

```python
import json

response = requests.post(
    'https://openrouter.ai/api/v1/responses',
    headers={
        'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        'Content-Type': 'application/json',
    },
    json={
        'model': 'openai/o4-mini',
        'input': 'Solve this step by step: If a train travels 60 mph for 2.5 hours, how far does it go?',
        'reasoning': {'effort': 'medium'},
        'stream': True,
        'max_output_tokens': 9000,
    },
    stream=True
)

REASONING_EVENTS = {
    'response.reasoning_text.delta',          # spec
    'response.reasoning_summary_text.delta',  # spec
    'response.reasoning.delta',               # name used in the guide
}

for line in response.iter_lines():
    if line:
        line_str = line.decode('utf-8')
        if line_str.startswith('data: '):
            data = line_str[6:]
            if data == '[DONE]':
                break
            try:
                parsed = json.loads(data)
                if parsed.get('type') in REASONING_EVENTS:
                    print(f"Reasoning: {parsed.get('delta', '')}")
            except json.JSONDecodeError:
                continue
```

Response with reasoning: a `reasoning` output item precedes the message; usage reports reasoning tokens.

```json
{
  "id": "resp_1234567890",
  "object": "response",
  "created_at": 1234567890,
  "model": "openai/o4-mini",
  "output": [
    {
      "type": "reasoning",
      "id": "rs_abc123",
      "encrypted_content": "gAAAAABotI9-FK1PbhZhaZk4yMrZw3XDI1AWFaKb9T0NQq7LndK6zaRB...",
      "summary": [
        "First, I need to determine the current year",
        "Then calculate the difference from 1995",
        "Finally, compare that to 30 years"
      ]
    },
    {
      "type": "message",
      "id": "msg_xyz789",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Yes. In 2025, 1995 was 30 years ago...",
          "annotations": []
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 15,
    "output_tokens": 85,
    "output_tokens_details": { "reasoning_tokens": 45 },
    "total_tokens": 100
  },
  "status": "completed"
}
```

Best practices: `high` for complex problems, `low` for simple tasks; reasoning increases token consumption (and counts against `max_output_tokens`); stream long reasoning chains; give enough context. Replaying reasoning items (with `encrypted_content`) across turns: [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Reasoning tokens.

#### Tool calling

Responses tools use the **flat** OpenAI Responses shape: `name`, `description`, `parameters`, `strict` sit at the top level of the tool (Chat Completions nests them under `function`).

```typescript
const weatherTool = {
  type: 'function' as const,
  name: 'get_weather',
  description: 'Get the current weather in a location',
  strict: null,
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
      },
    },
    required: ['location'],
  },
};

const response = await fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/o4-mini',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'What is the weather in San Francisco?' }],
      },
    ],
    tools: [weatherTool],
    tool_choice: 'auto',
    max_output_tokens: 9000,
  }),
});
```

`tool_choice`:

| Value | Behavior |
| - | - |
| `auto` | Model decides whether to call tools |
| `none` | Model will not call any tools |
| `{ type: 'function', name: 'tool_name' }` | Force a specific tool (note: `name` is top-level, unlike Chat Completions' `function.name`) |
| `required` | In the spec (`OpenAIResponsesToolChoice`), not in the guide table: must call a tool |

The spec also allows web-search-preview choice types (e.g. `web_search_preview`, `web_search_preview_2025_03_11`).

Force a tool: `tool_choice: { type: 'function', name: 'get_weather' }`. Disable tools while keeping them defined: `tool_choice: 'none'`. Multiple tools: pass several definitions (e.g. `[weatherTool, calculatorTool]`) with `tool_choice: 'auto'`; for a prompt like "Calculate 10*5 and also tell me the weather in Miami" the model can emit **parallel** `function_call` items in one response.

Tool call response:

```json
{
  "id": "resp_1234567890",
  "object": "response",
  "created_at": 1234567890,
  "model": "openai/o4-mini",
  "output": [
    {
      "type": "function_call",
      "id": "fc_abc123",
      "call_id": "call_xyz789",
      "name": "get_weather",
      "arguments": "{\"location\":\"San Francisco, CA\"}"
    }
  ],
  "usage": {
    "input_tokens": 45,
    "output_tokens": 25,
    "total_tokens": 70
  },
  "status": "completed"
}
```

`function_call` required fields: `type` (`"function_call"`), `id` (unique ID of the function-call object), `name` (matches a tool definition), `arguments` (valid JSON **string**), `call_id` (unique ID for the call). Spec additions (2026-09): `status`, `namespace`, `async`, `subagent_id`, `subagent_items`.

Returning tool results: replay the `function_call` and add a `function_call_output` with the same `call_id`, then continue the conversation.

```typescript
body: JSON.stringify({
  model: 'openai/o4-mini',
  input: [
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'What is the weather in Boston?' }],
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_123',
      name: 'get_weather',
      arguments: JSON.stringify({ location: 'Boston, MA' }),
    },
    {
      type: 'function_call_output',
      id: 'fc_output_1',
      call_id: 'call_123',
      output: JSON.stringify({ temperature: '72°F', condition: 'Sunny' }),
    },
    {
      type: 'message',
      role: 'assistant',
      id: 'msg_abc123',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: 'The weather in Boston is currently 72°F and sunny. This looks like perfect weather for a picnic!',
          annotations: [],
        },
      ],
    },
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Is that good weather for a picnic?' }],
    },
  ],
  max_output_tokens: 9000,
}),
```

- `id` is **optional** on `function_call_output`; only `type`, `call_id`, and `output` are required. `call_id` pairs the output with its `function_call`.
- **Multimodal tool outputs**: `output` may be a string or an array of input content parts (`input_text`, `input_image`, `input_file`), the same shape as user-message content. Non-text parts are only forwarded to multimodal models.

```json
{
  "type": "function_call_output",
  "call_id": "call_123",
  "output": [
    { "type": "input_text", "text": "{\"results\":[{\"title\":\"Golden Gate Bridge\"}]}" },
    { "type": "input_image", "image_url": "https://example.com/image.jpg" }
  ]
}
```

Complete client-side tool loop (constructed from the documented shapes; the Agent SDK in [§2](02-agent-sdk.md#2-agent-sdk-openrouteragent) automates this):

```typescript
type Item = Record<string, any>;

const tools = [weatherTool];
const handlers: Record<string, (args: any) => Promise<unknown>> = {
  get_weather: async ({ location }) => ({ location, temperature: '72°F', condition: 'Sunny' }),
};

const input: Item[] = [
  { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Weather in Boston and Miami?' }] },
];

for (let turn = 0; turn < 8; turn++) {
  const res = await fetch('https://openrouter.ai/api/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'openai/o4-mini', input, tools, tool_choice: 'auto' }),
  });
  const body = await res.json();
  if (!res.ok || body.status === 'failed') throw new Error(body.error?.message);

  // Stateless: append everything the model produced (reasoning, messages, function_calls)
  input.push(...body.output);

  const calls = body.output.filter((o: Item) => o.type === 'function_call');
  if (calls.length === 0) {
    const msg = [...body.output].reverse().find((o: Item) => o.type === 'message');
    console.log(msg?.content?.map((c: Item) => c.text).join(''));
    break;
  }

  // Parallel calls: answer every call_id before the next request
  for (const call of calls) {
    const result = await handlers[call.name](JSON.parse(call.arguments));
    input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
  }
}
```

Streaming tool calls: watch `response.output_item.added` with `item.type === 'function_call'` (gives `item.name`) and `response.function_call_arguments.done` (gives the complete `arguments`); `response.function_call_arguments.delta` streams partial arguments.

```typescript
const parsed = JSON.parse(data);
if (parsed.type === 'response.output_item.added' && parsed.item?.type === 'function_call') {
  console.log('Function call:', parsed.item.name);
}
if (parsed.type === 'response.function_call_arguments.done') {
  console.log('Arguments:', parsed.arguments);
}
```

Best practices: clear function and parameter descriptions; valid JSON Schema for `parameters`; handle responses where no tool is called; design tools to work independently (parallel calls); include tool results in follow-up requests. More on tool calling across APIs, server tools (`openrouter:*`), and `strict`: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

#### Web search

> Deprecated approach: the `web` plugin (`plugins: [{ id: "web" }]`) and the `:online` model variant are **deprecated**. Use the `openrouter:web_search` **server tool** in `tools` instead; it works on both Chat Completions and Responses (beta; full parameter reference in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Server tools).

Recommended (server tool):

```json
{
  "model": "openai/o3",
  "input": "What is OpenRouter?",
  "tools": [{ "type": "openrouter:web_search", "parameters": { "max_results": 3 } }]
}
```

Server-tool `parameters` (summary): `engine` (`auto` default, `native`, `exa`, `firecrawl`, `parallel`, `perplexity`), `mode`, `max_results` (default 5; 1–25, 1–20 for Perplexity), `max_uses`, `max_total_results`, `search_context_size` (`low`/`medium`/`high`), `max_characters` (1–100,000), `user_location`, `allowed_domains`, `excluded_domains`, `x_search`.

Legacy plugin (still documented):

```typescript
body: JSON.stringify({
  model: 'openai/o3',
  input: 'What is OpenRouter?',
  plugins: [{ id: 'web', max_results: 3 }],
  max_output_tokens: 9000,
}),
```

| Plugin parameter | Type | Description |
| - | - | - |
| `id` | string | **Required.** Must be `"web"` |
| `engine` | string | `"native"`, `"exa"`, `"firecrawl"`, `"parallel"`, or omit for auto |
| `max_results` | integer | Max results (1–25; 1–20 for Perplexity; default 5) |
| `include_domains` | string[] | Restrict to these domains (wildcards like `*.substack.com`) |
| `exclude_domains` | string[] | Exclude these domains |

Note the naming difference: plugin uses `include_domains`/`exclude_domains`; the server tool uses `allowed_domains`/`excluded_domains`.

**X search (SpaceXAI only)**: on SpaceXAI models (e.g. `x-ai/grok-4.3`), web search sends only SpaceXAI's `web_search` tool. Add an `x_search` object to the plugin (or `parameters.x_search` on the server tool) to also search X/Twitter; `{}` enables it with no filters. The legacy top-level `x_search_filter` field still works. X search is opt-in because SpaceXAI bills it per item from **September 21, 2026 12:00 PM PT**: $5 per 1,000 posts fetched and $10 per 1,000 user profiles fetched (replacing $5 per 1,000 tool calls).

```json
{
  "model": "~x-ai/grok-latest",
  "input": "What are people saying about AI?",
  "plugins": [
    {
      "id": "web",
      "x_search": {
        "allowed_x_handles": ["OpenRouterAI"],
        "from_date": "2025-01-01",
        "enable_image_understanding": true
      }
    }
  ]
}
```

| `x_search` field | Type | Description |
| - | - | - |
| `allowed_x_handles` | string[] | Only posts from these handles (max 20) |
| `excluded_x_handles` | string[] | Exclude these handles (max 20) |
| `from_date` | string | Start date (ISO 8601, e.g. `"2025-01-01"`) |
| `to_date` | string | End date (ISO 8601) |
| `enable_image_understanding` | boolean | Analyze images in posts |
| `enable_video_understanding` | boolean | Analyze videos in posts |

`allowed_x_handles` and `excluded_x_handles` are mutually exclusive.

Deprecated `:online` variant: `model: 'openai/o3:online'`.

Citations arrive as `url_citation` annotations on `output_text`:

```json
{
  "type": "output_text",
  "text": "OpenRouter is a unified API for accessing multiple Large Language Model providers...",
  "annotations": [
    { "type": "url_citation", "url": "https://openrouter.ai/docs", "start_index": 0, "end_index": 85 },
    { "type": "url_citation", "url": "https://openrouter.ai/models", "start_index": 120, "end_index": 180 }
  ]
}
```

A `url_citation` may also include `content` (an excerpt from the page): `{ "type": "url_citation", "url": "https://example.com/article", "start_index": 0, "end_index": 50, "content": "Excerpt from the web page..." }`. When streaming, read annotations from the final `response.completed` event (or `response.output_text.annotation.added`).

```typescript
function extractCitations(response: any) {
  const messageOutput = response.output?.find((o: any) => o.type === 'message');
  const textContent = messageOutput?.content?.find((c: any) => c.type === 'output_text');
  const annotations = textContent?.annotations || [];

  return annotations
    .filter((annotation: any) => annotation.type === 'url_citation')
    .map((annotation: any) => ({
      url: annotation.url,
      text: textContent.text.slice(annotation.start_index, annotation.end_index),
      startIndex: annotation.start_index,
      endIndex: annotation.end_index,
    }));
}
```

```python
def extract_citations(response_data):
    output = response_data.get('output', [])
    message_output = next((o for o in output if o.get('type') == 'message'), {})
    content = message_output.get('content', [])
    text_content = next((c for c in content if c.get('type') == 'output_text'), {})
    annotations = text_content.get('annotations', [])
    text = text_content.get('text', '')

    citations = []
    for annotation in annotations:
        if annotation.get('type') == 'url_citation':
            citations.append({
                'url': annotation.get('url'),
                'text': text[annotation.get('start_index', 0):annotation.get('end_index', 0)],
                'start_index': annotation.get('start_index'),
                'end_index': annotation.get('end_index'),
            })
    return citations
```

Web search in a conversation: send the full history as usual (the guide's example replays an assistant message with `status: 'in_progress'`). Best practices: tune `max_results` for quality vs. speed, process annotations for attribution, make queries specific, handle search failures, mind search rate limits and per-search pricing ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities), [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

#### Error handling (Responses)

Error body format on this endpoint:

```json
{
  "error": {
    "code": "invalid_prompt",
    "message": "Detailed error description"
  },
  "metadata": null
}
```

| `error.code` | Description | Equivalent HTTP |
| - | - | - |
| `invalid_prompt` | Request or prompt validation failed (context length exceeded, invalid request fields) | 400 |
| `rate_limit_exceeded` | Too many requests | 429 |
| `image_content_policy_violation` | Input or output flagged by a content filter | 403 |
| `permission_denied` | Well-formed request declined by a policy gate (e.g. Alignment plugin block, HIPAA refusal) | 403 |
| `server_error` | Internal error, authentication failure, provider overloaded/unavailable, or timeout | 500+ |

These codes are a reduced mapping of the typed error codes; e.g. `context_length_exceeded` and `invalid_request` both surface as `invalid_prompt`. Failed responses also carry a top-level canonical `error_type` (stable across all three APIs); use it when `code` is ambiguous:

```json
{
  "id": "resp_abc123",
  "status": "failed",
  "error": { "code": "server_error", "message": "Invalid credentials" },
  "error_type": "authentication"
}
```

Example from the overview page: `{"error": {"code": "invalid_prompt", "message": "Missing required parameter: 'model'."}, "metadata": null}`. Full mapping tables: [§4.6](#46-errors-and-debugging).

#### Gotchas

- `previous_response_id` / `store: true` → `400`. Keep history client-side.
- Responses tool definitions are flat (`name` at top level); Chat Completions nests under `function`.
- `function_call.arguments` is a JSON string; parse it, and send `function_call_output.output` as a string (or content-part array).
- Answer every `call_id` from parallel calls before the next request.
- Guide event names `response.content_part.delta`, `response.done`, `response.reasoning.delta` aren't in the spec; use `response.output_text.delta`, `response.completed`, `response.reasoning_text.delta`.
- Prefer the `openrouter:web_search` server tool over the deprecated `web` plugin and `:online` suffix.

Sources: https://openrouter.ai/docs/api_reference/responses/overview, https://openrouter.ai/docs/api_reference/responses/basic-usage, https://openrouter.ai/docs/api_reference/responses/reasoning, https://openrouter.ai/docs/api_reference/responses/tool-calling, https://openrouter.ai/docs/api_reference/responses/web-search, https://openrouter.ai/docs/api_reference/responses/error-handling, https://openrouter.ai/docs/api_reference/overview, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/guides/features/server-tools/web-search, OpenAPI spec (`ResponsesRequest`, `ReasoningConfig`, `OpenAIResponsesToolChoice`, stream events)

### 4.9 Embeddings guide

Embeddings convert text (and, for some models, images and other media) into vectors where semantically similar inputs are close together. Uses: RAG retrieval, semantic search, recommendations, clustering/classification, duplicate detection, anomaly detection.

- `POST https://openrouter.ai/api/v1/embeddings`: create embeddings (operationId `createEmbeddings`; TS SDK `openRouter.embeddings.generate`).
- `GET https://openrouter.ai/api/v1/embeddings/models`: list embedding models (operationId `listEmbeddingsModels`; SDK `listModels`); query `offset` (default 0) and `limit` (default 500, max 1000); omit both to get the full list. Browse: `https://openrouter.ai/models?fmt=cards&output_modalities=embeddings`.

#### Request fields

| Field | Type | Required | Description |
| - | - | - | - |
| `model` | string | Yes | Embedding model ID, e.g. `openai/text-embedding-3-small` |
| `input` | string \| string[] \| number[] \| number[][] \| multimodal object[] | Yes | Text, token, or multimodal input(s). Strings must be non-empty |
| `dimensions` | integer ≥ 1 | No | Number of output dimensions (model-dependent) |
| `encoding_format` | `"float"` \| `"base64"` | No | Output encoding |
| `input_type` | string | No | Input type hint, e.g. `search_query`, `search_document` |
| `provider` | ProviderPreferences | No | Provider routing ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) |
| `user` | string | No | End-user identifier |
| `session_id` | string (max 256) | No | Observability grouping; never sent to the provider; `x-session-id` header also accepted (body wins) |
| `trace` | object | No | Observability metadata (`trace_id`, `trace_name`, `span_name`, `generation_name`, `parent_span_id`, custom keys) |

`input` forms:

- Single string: `"The quick brown fox jumps over the lazy dog"`
- Batch of strings: `["text one", "text two", ...]` (one embedding per element, matched by `index`)
- Token IDs: `number[]` or `number[][]`
- Multimodal: an array of objects `{ "content": [ ...parts ] }` (at least one part each). Parts: `{ "type": "text", "text": "..." }`, `{ "type": "image_url", "image_url": { "url": "..." } }`, and (per the spec) input audio, input video, and file parts (`ContentPartInputAudio`, `ContentPartInputVideo`, `ContentPartInputFile`). Text and images in one `content` array produce a **joint** embedding.

#### Examples

Official examples from the embeddings page.

Basic request:

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const response = await openRouter.embeddings.generate({
  requestBody: {
    model: 'openai/text-embedding-3-small',
    input: 'The quick brown fox jumps over the lazy dog',
  },
});

console.log(response.data[0].embedding);
```

```python
import os
import requests

response = requests.post(
  "https://openrouter.ai/api/v1/embeddings",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
    "Content-Type": "application/json",
  },
  json={
    "model": "openai/text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog"
  }
)

data = response.json()
embedding = data["data"][0]["embedding"]
print(f"Embedding dimension: {len(embedding)}")
```

```shell
curl https://openrouter.ai/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
```

SDK call shape conflict: the embeddings guide passes `{ model, input }` directly to `openRouter.embeddings.generate()`, while the generated TypeScript SDK reference README wraps them as `generate({ requestBody: { model, input } })`. The examples here use the SDK reference form; verify against your installed SDK version ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)).

Batch processing: pass an array of strings; each result's `index` matches its input position.

```typescript
const response = await openRouter.embeddings.generate({
  requestBody: {
    model: 'openai/text-embedding-3-small',
    input: [
      'Machine learning is a subset of artificial intelligence',
      'Deep learning uses neural networks with multiple layers',
      'Natural language processing enables computers to understand text'
    ],
  },
});

// Process each embedding
response.data.forEach((item, index) => {
  console.log(`Embedding ${index}: ${item.embedding.length} dimensions`);
});
```

```python
response = requests.post(
  "https://openrouter.ai/api/v1/embeddings",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
    "Content-Type": "application/json",
  },
  json={
    "model": "openai/text-embedding-3-small",
    "input": [
      "Machine learning is a subset of artificial intelligence",
      "Deep learning uses neural networks with multiple layers",
      "Natural language processing enables computers to understand text"
    ]
  }
)

data = response.json()
for i, item in enumerate(data["data"]):
  print(f"Embedding {i}: {len(item['embedding'])} dimensions")
```

Image input: wrap each input in `{ "content": [...] }` with `image_url` parts. The page uses the multimodal model `nvidia/llama-nemotron-embed-vl-1b-v2:free`.

```python
response = requests.post(
  "https://openrouter.ai/api/v1/embeddings",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
    "Content-Type": "application/json",
  },
  json={
    "model": "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "input": [
      {
        "content": [
          {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/640px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"}}
        ]
      }
    ],
    "encoding_format": "float",
  }
)

data = response.json()
embedding = data["data"][0]["embedding"]
print(f"Embedding dimension: {len(embedding)}")
```

```shell
curl https://openrouter.ai/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "input": [
      {
        "content": [
          {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/640px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"}}
        ]
      }
    ],
    "encoding_format": "float"
  }'
```

Text + image joint embedding: put a `text` part and an `image_url` part in the same `content` array.

```python
response = requests.post(
  "https://openrouter.ai/api/v1/embeddings",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
    "Content-Type": "application/json",
  },
  json={
    "model": "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "input": [
      {
        "content": [
          {"type": "text", "text": "A scenic boardwalk through a green meadow"},
          {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/640px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"}}
        ]
      }
    ],
    "encoding_format": "float",
  }
)

data = response.json()
embedding = data["data"][0]["embedding"]
print(f"Embedding dimension: {len(embedding)}")
```

List embedding models:

```typescript
const models = await openRouter.embeddings.listModels();
console.log(models.data);
```

```python
response = requests.get(
  "https://openrouter.ai/api/v1/embeddings/models",
  headers={
    "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
  }
)

models = response.json()
for model in models["data"]:
  print(f"{model['id']}: {model.get('context_length', 'N/A')} tokens")
```

```shell
curl https://openrouter.ai/api/v1/embeddings/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### Response format

```json
{
  "id": "...",
  "object": "list",
  "model": "openai/text-embedding-3-small",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.0023064255, -0.009327292, 0.015797347] }
  ],
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

| Field | Notes |
| - | - |
| `object` | `"list"` |
| `data[]` | `{ object: "embedding", embedding: number[] \| string (base64), index }` |
| `model` | Model used |
| `id` | Optional response ID |
| `usage` | `prompt_tokens`, `total_tokens`, optional `cost` (credits), `is_byok`, `cost_details` (`upstream_inference_cost`, `upstream_inference_prompt_cost`, `upstream_inference_completions_cost`, `server_tool_cost`), and `prompt_tokens_details` (`text_tokens`, `image_tokens`, `audio_tokens`, `video_tokens`, `file_tokens`; present only for inputs with 2+ modalities when the provider reports per-modality usage, non-zero counts only) |

#### Provider routing

Use `provider` to pick providers for privacy, cost, latency, or provider-specific features (full options: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Provider routing):

```json
{
  "model": "openai/text-embedding-3-small",
  "input": "Your text here",
  "provider": {
    "order": ["openai", "azure"],
    "allow_fallbacks": true,
    "data_collection": "deny"
  }
}
```

#### Errors

| Status | Meaning (guide) |
| - | - |
| `400` | Invalid input format or missing parameters; check `input` and `model` |
| `401` | Invalid or missing API key |
| `402` | Insufficient credits |
| `404` | Model doesn't exist or isn't an embedding model |
| `429` | Rate limited; exponential backoff |
| `529` | Provider overloaded; enable `allow_fallbacks: true` for backup providers |

The spec additionally declares `403`, `408`, `413`, `499` (client closed request), `500`, `502`, `503`, `504` (added 2026-09-27), and `524` for this endpoint.

#### Limitations and best practices

- **No streaming**: embeddings return as complete responses. (The spec lists a `text/event-stream` content type on the 200 response; the guide says streaming is not supported. Don't rely on streaming.)
- **Token limits**: each model has a max input length; longer inputs may be truncated or rejected. Chunk long documents along meaningful boundaries (paragraphs, sections).
- **Deterministic**: the same input yields the same embedding (no temperature); cache embeddings in a database or vector store.
- **Batch** many texts in one request to reduce latency and cost.
- **Compare with cosine similarity** rather than Euclidean distance.
- **Model choice**: smaller models (e.g. `perplexity/pplx-embed-v1-0.6b`, `openai/text-embedding-3-small`) are faster and cheaper; larger ones (e.g. `openai/text-embedding-3-large`) give better quality. Some models are language-specialized.

Practical example: semantic search (official). One request embeds the query and all documents together (`input: [query, ...documents]`); results are ranked by cosine similarity.

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Sample documents
const documents = [
  "The cat sat on the mat",
  "Dogs are loyal companions",
  "Python is a programming language",
  "Machine learning models require training data",
  "The weather is sunny today"
];

// Function to calculate cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function semanticSearch(query: string, documents: string[]) {
  // Generate embeddings for all documents and the query
  const response = await openRouter.embeddings.generate({
    requestBody: {
      model: 'openai/text-embedding-3-small',
      input: [query, ...documents],
    },
  });

  const queryEmbedding = response.data[0].embedding;
  const docEmbeddings = response.data.slice(1);

  // Calculate similarity scores
  const results = documents.map((doc, i) => ({
    document: doc,
    similarity: cosineSimilarity(
      queryEmbedding as number[],
      docEmbeddings[i].embedding as number[]
    ),
  }));

  // Sort by similarity (highest first)
  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

// Search for documents related to pets
const results = await semanticSearch("pets and animals", documents);
console.log("Search results:");
results.forEach((result, i) => {
  console.log(`${i + 1}. ${result.document} (similarity: ${result.similarity.toFixed(4)})`);
});
```

```python
import os
import requests
import numpy as np

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]

# Sample documents
documents = [
  "The cat sat on the mat",
  "Dogs are loyal companions",
  "Python is a programming language",
  "Machine learning models require training data",
  "The weather is sunny today"
]

def cosine_similarity(a, b):
  """Calculate cosine similarity between two vectors"""
  dot_product = np.dot(a, b)
  magnitude_a = np.linalg.norm(a)
  magnitude_b = np.linalg.norm(b)
  return dot_product / (magnitude_a * magnitude_b)

def semantic_search(query, documents):
  """Perform semantic search using embeddings"""
  # Generate embeddings for query and all documents
  response = requests.post(
    "https://openrouter.ai/api/v1/embeddings",
    headers={
      "Authorization": f"Bearer {OPENROUTER_API_KEY}",
      "Content-Type": "application/json",
    },
    json={
      "model": "openai/text-embedding-3-small",
      "input": [query] + documents
    }
  )

  data = response.json()
  query_embedding = np.array(data["data"][0]["embedding"])
  doc_embeddings = [np.array(item["embedding"]) for item in data["data"][1:]]

  # Calculate similarity scores
  results = []
  for i, doc in enumerate(documents):
    similarity = cosine_similarity(query_embedding, doc_embeddings[i])
    results.append({"document": doc, "similarity": similarity})

  # Sort by similarity (highest first)
  results.sort(key=lambda x: x["similarity"], reverse=True)

  return results

# Search for documents related to pets
results = semantic_search("pets and animals", documents)
print("Search results:")
for i, result in enumerate(results):
  print(f"{i + 1}. {result['document']} (similarity: {result['similarity']:.4f})")
```

Expected output (from the page):

```text
Search results:
1. Dogs are loyal companions (similarity: 0.8234)
2. The cat sat on the mat (similarity: 0.7891)
3. The weather is sunny today (similarity: 0.3456)
4. Machine learning models require training data (similarity: 0.2987)
5. Python is a programming language (similarity: 0.2654)
```

Both examples assume results come back in input order (`data[0]` is the query). Sort `data` by `index` if you need to be defensive.

Reranking (`POST /rerank`) and the full endpoint schema: [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs). RAG cookbook: `https://openrouter.ai/docs/cookbook/evaluate-and-optimize/rag`.

Sources: https://openrouter.ai/docs/api_reference/embeddings, https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request, https://openrouter.ai/docs/api/api-reference/embeddings/list-all-embeddings-models, https://openrouter.ai/docs/client-sdks/typescript/sdks/embeddings/README, OpenAPI spec (`POST /embeddings`)

### 4.10 Recent API changes (September 1 – October 29, 2026)

Condensed from the auto-generated API Changelog (newest first; the newest entry at capture time is October 29, 2026). "Breaking" = listed under Breaking changes; routine provider-enum additions, description edits, and example updates are omitted.

**October 29, 2026**
- New Private Providers API: `GET/POST /private-providers`, `GET/PATCH/DELETE /private-providers/{slug}` ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)).
- Breaking (no action): `PATCH /private-endpoints/{id}` is now a merge patch over `pricing`, `declared_parameters`, `settings`, and draft-only upstream fields; `upstream_model_id` no longer required (on an active endpoint it still returns 409 `already_active`). `PUT /private-endpoints/{id}/pricing` and `/parameters` marked deprecated aliases (migration note says they have been removed; send `pricing`/`declared_parameters` to `PATCH`). Private endpoints gain `settings`.
- `ProviderOptions` gains `kt`.

**October 28, 2026**
- Breaking (action required): observability S3 `config.roleArn` must be in the commercial AWS partition (`arn:aws:iam::`); IAM role trust policies must require the destination's `sts:ExternalId` (otherwise 403).
- Breaking (no action): `configuration_update` on `ChatSystemMessage`/`ChatDeveloperMessage` now references the named `ConfigurationUpdate` schema (only SDK type names change).
- `GET /models` now declares `401`, `404`, `408`, `409`, `429`; `GET /models/user` declares `408`, `409`, `429`.
- Guardrails gain `enforce_first_party_harness_models`. `POST /private-endpoints` returns 400 `parameters_invalid` when `tool_choice` is declared without `tools`.

**October 27, 2026**
- Observability S3 destinations support IAM role auth (`authMode: "iam_role"`, `provider: "aws"`, `roleArn`, `region`, `externalId`); `accessKeyId`/`secretAccessKey` now optional (still required for default `authMode: "access_keys"`).
- New `PUT /private-endpoints/{id}/parameters`; private endpoints gain `declared_parameters`, `tested_parameters`, `max_completion_tokens`.
- `503` now declared on `GET /models`, `/models/user`, `/models/{author}/{slug}/endpoints`, `/endpoints/zdr`, presets reads, `POST /generation/feedback`.
- Decisions requests gain `assets`.

**October 26, 2026**: new `AnthropicToolUnion` schema; `MessagesToolAdditionBlock` gains a variant.

**October 23, 2026**
- Breaking (action required): the entire **Interns** API (`/interns/*`, including `/interns/{internId}/chat/completions`, daemon, invoke, provision, suspend) and all `Intern*` schemas were **removed**.
- `GET /generation` now declares `403`.

**October 21, 2026**
- Breaking (action required): **`POST /messages` streams no longer send a trailing `data: [DONE]`**; terminate on `message_stop` (success) or the `error` event / stream closure (failure).
- Breaking (action required for SDK users): End Users renamed **External Users**. New `GET/POST /external-users`, `GET/PATCH/DELETE /external-users/{user}`; `/end-users*` still forwards. Python SDK `openrouter` ≥ 1.3.70: `client.external_users` (old namespace removed); TypeScript `@openrouter/sdk` ≥ 1.5.0: `externalUsers` (`endUsers` kept as alias). Schemas `EndUser*` → `ExternalUser*`.
- Breaking (action required): bulk member assign/unassign `member_user_ids` capped at 500 items (else `400`).
- `PromptCacheBreakpoint` gains `ttl`; private endpoint pricing gains `cache_read`/`cache_write`. New provider `Recursive`.
- Many governance reads (guardrails, organization, workspaces, budgets) now declare `403`.

**October 22, 2026**: `403` declared on BYOK, observability, SCIM, external-users, and presets endpoints; `POST /generation/feedback` declares `409`.

**October 18–20, 2026**: new provider `ParetoAlpha` (`pareto-alpha`); `GET /vault/interns/{internId}/connections` added (Oct 18).

**October 17, 2026**: `BatchSubmitBody` gains `callback_url`.

**October 16, 2026**: batch objects gain required `expires_at` and `provider` (response-only, no action).

**October 15, 2026**
- **`ResponsesRequest` gains `stop`.**
- Endpoints gain required `service_tier` (`PublicServiceTier`); `GET /models/user` gains `sort`; token exchange `scope` adds `management`.

**October 14, 2026**
- Breaking (action required): `AlignmentRuleRecord.probability` is now `number | null` (null when new `applicable` is false).
- `499` declared on `/embeddings`, `/files`, `/videos`, container file promote; `/videos` declares `503`.
- Armor plugin schemas (`ArmorPlugin`, `ArmorRule`, `ArmorSafeguardResult`, ...); `ChatResult`/`ChatStreamChunk` gain `alignment` and `safeguard_results`.
- Responses error `code` enum adds `permission_denied`. Endpoints gain `supports_diarization`. Videos gain `urls`.

**October 13, 2026**: observability destinations gain `broadcast_generation_cost_allocation`; guardrails gain `allow_safety_retention_google` / `allow_safety_retention_other`; new `OutputArmorBlockedItem` output item.

**October 10–11, 2026**
- **`GET /key` gains required `budgets` and `effective_budget`** ([§4.5](#45-limits-credits-budgets-rate-limits)).
- **`deferred_tools`** added to Chat, Messages, and Responses requests; `CustomTool` gains `defer_loading`; tool-search result types (`DeferredBm25Search`, `DeferredRegexSearch`, `DeferredCustomSearch`).
- Videos gain `expires_at`; `GET /embeddings/models` response updated (Oct 11).

**October 9, 2026**: end-user IDs may be up to 512 characters (was 256) and may contain control characters other than NUL; `PATCH /keys/{hash}` declares `403`, `409`.

**October 8, 2026**: `GET /keys` gains `include_expired`; key bulk-assign requests gain `maxItems`.

**October 7, 2026**: tool-search call/output items; server-tool output items (web search, datetime, image generation, apply patch, search models, tool search) gain `error`.

**October 6, 2026**: BYOK keys gain `declared_region` (`global`/`europe`/`us`/null); API keys gain required `last_used_at`; TTS gains multi-speaker `SpeechInput`/`SpeechTurn` and `instructions`.

**October 1–5, 2026**: `GET /generation` and `/generation/content` validate `id` (`400` on bad IDs); `ChatDynamicServerTool` added to Chat tools; activity items gain `cached_tokens`; STT/TTS gain `data_collection` and `zdr` (Oct 2); batch provider preferences gain `allow_fallbacks` (Oct 5).

**September 30, 2026**: End Users endpoints introduced (renamed Oct 21); `GET/PATCH /organization/settings`; Alignment plugin schemas added to Chat/Messages/Responses.

**September 29, 2026**
- New server-tools catalog: **`GET /tools`**, **`GET /tools/{name}`** ([§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs)).
- STT: `file` no longer required, new inline/URL audio inputs, `diarize`, `keyterms`, entities, speaker labels.
- `ServiceTier` enum extended; `JevRouterPlugin` added; `GET /batches/{id}` declares `410`.

**September 28, 2026**: Private Endpoints API (`/private-endpoints` CRUD, activate, disable, enable, validate, pricing); endpoints gain required `native_tools`.

**September 27, 2026**: `POST /embeddings` declares `504`.

**September 25, 2026**: **Batch API**: `GET/POST /batches`, `GET/DELETE /batches/{id}` ([§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)); TTS reference images.

**September 24, 2026**: **`ProviderPreferences.options`** (provider-specific options keyed by provider slug); SCIM groups filters `display_name`, `external_id`.

**September 23, 2026**: `FunctionCallItem` / `CustomToolCallItem` flattened with required `type`, `call_id`, `name`, `arguments`/`input`; new optional `id`, `status`, `namespace`, `async` (and `subagent_id`, `subagent_items` on function calls).

**September 22, 2026**: workspaces gain `disabled_server_tools`; Messages requests gain `safeguards` and `message_delta` gains `safeguard_results`; `SwitchyardRouterPlugin`.

**September 21, 2026**: `x_search` options on web search plugin/server tool and `ChatWebSearchShorthand`; BYOK keys gain required `declared_zdr`.

**September 19–20, 2026**: `GET /key` gains required `organization_id` and `workspace_id` (Sep 19); `POST /systemone` (TypeSafe SDK-compatible alias) (Sep 20).

**September 16–17, 2026**
- **`GET /key` gains `free_model_daily_requests` and `allowed_data_regions`** (Sep 16).
- Vault secrets API (`/vault/secrets*`, `/vault/interns/{internId}/secrets*`); `504` on STT; image/STT/TTS/video gain `session_id`.
- Shell/bash server-tool outputs gain `error`.
- `POST /api/alpha/decisions` (Sep 17); `InputImage` gains `file_id`; STT `confidence`; videos `previous_job_id`.

**September 15, 2026**: image, STT, TTS, and video requests gain `user` and `trace`.

**September 10–14, 2026**
- Breaking (action required for SDK/Terraform): workspace budget paths renamed `{id}` → `{workspace_ref}` (`/workspaces/{workspace_ref}/budgets`, `/budgets/{interval}`; URL values unchanged) (Sep 10).
- Tools and function-call items gain `async` (Sep 11).
- `GET /videos/{jobId}/content` declares `409`, `410` (Sep 14).

**September 9, 2026**: BYOK keys gain required `is_byok_only` and `is_required`; Anthropic thinking-block binding `mismatch_behavior`.

**September 8, 2026**
- Breaking (action required): `sleep_after_seconds` removed from bash/shell server-tool config (no replacement).
- Breaking (action required): provider `ncompass` retired; `prime-intellect` slug replaced by `primeintellect`.
- `ChatDeveloperMessage` gains `configuration_update`.

**September 4–5, 2026**: SCIM sync jobs (`POST /scim/sync-jobs`, `GET /scim/sync-jobs/{id}`); `ChatSystemMessage.configuration_update` and Responses `ConfigurationUpdateItem` (mid-conversation effort changes); MCP error schemas; observability destinations gain required `regions` (Sep 5).

**September 3, 2026**: workload identity federation: **`POST /oauth/token`** (exchange a workload identity token) and **`GET /oauth/jwks`** (access-token signing keys) ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

**September 2, 2026**: `POST /keys` drops `external_api_key`/`external_user` request properties; `403` declared on TTS, STT, embeddings, rerank, videos; guardrails gain `allowed_data_regions`; `OpenRouterMetadata` gains `generation_time`; video inputs gain `processing`.

**September 1, 2026**: Anthropic Messages additions: `output_config` and `clear_at` on messages, `input_transformations` on results/`message_start`, container `skills`, thinking-block binding.

Sources: https://openrouter.ai/docs/changelog
