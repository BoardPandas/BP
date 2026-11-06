# OpenRouter Reference — 3. Client SDKs (TypeScript, Python, Go)

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 02-agent-sdk.md](02-agent-sdk.md) · [Next: 04-api-fundamentals.md →](04-api-fundamentals.md)

## 3. Client SDKs (TypeScript, Python, Go)

The Client SDKs are thin, typed wrappers over the OpenRouter REST API (`https://openrouter.ai/api/v1`). They are generated from the OpenRouter OpenAPI spec and mirror the API surface 1:1: one namespace per resource, one method per operation. They handle authentication, request validation, response typing, SSE streaming, pagination iterators and retries. They do **not** run agent loops; for multi-turn tool execution, use the Agent SDK ([§2](02-agent-sdk.md#2-agent-sdk-openrouteragent)).

This section covers setup, configuration, error handling and streaming for each language, then a full method catalog. Request and response field schemas are in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)–[§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise).

### 3.1 Overview: packages, installation, stability

#### Packages

| Language | Package / module | Install | Import | Client |
| - | - | - | - | - |
| TypeScript / JavaScript (runtimes: see `RUNTIMES.md` in the repo) | `@openrouter/sdk` (npm), ESM only | `npm install @openrouter/sdk` | `import { OpenRouter } from "@openrouter/sdk";` | `new OpenRouter({...})`; tree-shakable `OpenRouterCore` from `@openrouter/sdk/core.js` |
| Python (3.10+) | `openrouter` (PyPI); "stable as of v1.0" | `pip install openrouter` / `uv add openrouter` / `poetry add openrouter` | `from openrouter import OpenRouter` | `with OpenRouter(api_key=...) as open_router:` (sync) or `async with OpenRouter(...)` (async) |
| Go (1.26.10+, as stated in the GitHub README) | `github.com/OpenRouterTeam/go-sdk` (listed on the overview page as `go-sdk`); **beta**, Apache-2.0 | `go get github.com/OpenRouterTeam/go-sdk` (pin a version, e.g. `@v0.9.116`) | `openrouter "github.com/OpenRouterTeam/go-sdk"` | `openrouter.New(openrouter.WithSecurity(key))` |

All install commands from the docs:

```bash
npm install @openrouter/sdk        # or: npm add @openrouter/sdk
pnpm add @openrouter/sdk
yarn add @openrouter/sdk
bun add @openrouter/sdk
deno add npm:@openrouter/sdk
pip install openrouter
uv add openrouter
poetry add openrouter
go get github.com/OpenRouterTeam/go-sdk
go get github.com/OpenRouterTeam/go-sdk@v0.9.116   # pinned version, as recommended in the Go README
```

#### Facts that apply to all three SDKs

- **Generated from the OpenAPI spec.** "New models, parameters, and endpoints appear immediately after each API release." The spec carries Speakeasy generator extensions (`x-speakeasy-name-override`, `x-speakeasy-group`, `x-speakeasy-pagination`, `x-speakeasy-retries`, `x-speakeasy-sse-sentinel: '[DONE]'`, `x-speakeasy-stream-request-field: stream`, `x-speakeasy-ignore`). These extensions set method names, pagination, retries and streaming behavior. The Go README confirms the SDKs are created by Speakeasy and that manual edits to generated files are overwritten on the next generation.
- **Coverage.** TypeScript exposes 172 methods in 40 namespaces (this count includes 2 deprecated alias namespaces). Python exposes 167 methods and Go exposes 144. Differences:
  - Only TypeScript keeps the `endUsers` alias (5 methods).
  - Go has **no Guardrail Policies namespace** (23 methods). This was verified: there is no Go README for it, and no Go page mentions `GuardrailPolicies`.
- **Not exposed by any client SDK.** `POST /messages` (Anthropic Messages) and `POST /credits/coinbase` (deprecated, always 410) are marked `x-speakeasy-ignore`. Call `/messages` over raw HTTP or with an Anthropic-compatible client ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)). The SDKs can still *create presets from* a Messages body (`presets.createPresetsMessages`) and can target `/v1/messages` in a batch.
- **TypeScript is ESM-only.** From CommonJS, use `const { OpenRouter } = await import("@openrouter/sdk")`.
- **Python has sync and async clients.** Async methods carry an `_async` suffix (e.g. `await open_router.chat.send_async(...)`) and run under `async with OpenRouter(...)` (GitHub README; see [§3.4](#34-python-sdk-openrouter)).

#### Versions and stability notes

| Item | Status |
| - | - |
| Responses API (`responses.send`) | GA. `beta.responses` is a **deprecated alias**, "scheduled for removal (sunset date TBD)". The TypeScript standalone function `betaResponsesSend` is also a deprecated alias (per the changelog). |
| `endUsers` namespace (TS) | **Deprecated alias** of `externalUsers` since `@openrouter/sdk` 1.5.0. Python `end_users` was **removed** in `openrouter` 1.3.70 (switch to `external_users`). Model renames in the same release: `EndUser*` → `ExternalUser*`. |
| `alpha.decisions`, `alpha.extractions` | **Alpha**: "the shape may change" / "the shape is not stable". Served from a different base path (`https://openrouter.ai/api/alpha/...`). |
| Agent toolkit (`callModel`, `tool`, stop conditions, …) in `@openrouter/sdk` | Moved to `@openrouter/agent`. "The agent exports will be removed from `@openrouter/sdk` in a future major version." See the migration table below. |
| DevTools (`@openrouter/devtools`) | **Pre-release**. No supported public Client SDK integration yet ([§3.8](#38-devtools-openrouterdevtools-pre-release)). |
| Python SDK maturity | "Stable as of v1.0." The minimum Python version (currently 3.10) is raised once a Python version reaches end of life, after a 3-month grace period. |
| Go SDK maturity | **Beta**: "Breaking changes may ship in minor `0.x` releases." Pin a module version (the README example: `go get github.com/OpenRouterTeam/go-sdk@v0.9.116`) and review `RELEASES.md` before upgrading. |
| TypeScript SDK maturity | The README makes no maturity statement. Supported runtimes are listed in the repo's `RUNTIMES.md`, which is not reproduced here. |
| Workspace budget methods | 2026-09-10: path argument renamed `id` → `workspace_ref` (`workspaceRef` in TypeScript). |
| `files.list` / `files.delete` responses | 2026-07-29: became unions discriminated by `_shape`. In TypeScript the field is `shape`; check `shape === "openrouter"` before reading OpenRouter fields. |

#### When to use the Client SDKs vs the Agent SDK

| | Client SDKs | Agent SDK ([§2](02-agent-sdk.md#2-agent-sdk-openrouteragent)) |
| - | - | - |
| Focus | Lean API client, mirrors the REST API with full type safety | Agentic primitives: multi-turn loops, tools, stop conditions |
| Use when | You want direct model calls and run orchestration yourself | You want built-in agent loops, tool execution and state management |
| Conversation state | You manage it | Managed for you by `callModel` |
| Tool execution | You dispatch tool calls | Automatic with the `tool()` helper |
| Languages | TypeScript, Python, Go | TypeScript |

Use the Client SDKs for:
- single-turn completions and streaming;
- embeddings, rerank, images, video, TTS and STT;
- account and platform management (API keys, credits, guardrails, workspaces, etc.);
- custom orchestration.

#### Agent toolkit migration (`@openrouter/sdk` → `@openrouter/agent`)

You only need to migrate if you import agent features from `@openrouter/sdk`. Code that only uses REST methods (`client.chat.send(...)`, `client.models.list()`, …) needs no change. The two packages work side by side, and `@openrouter/agent` ships its own `OpenRouter` client class.

| Old import path | New import path |
| - | - |
| `@openrouter/sdk` (client class, when used for agents) | `@openrouter/agent` or `@openrouter/agent/openrouter` |
| `@openrouter/sdk/funcs/call-model` | `@openrouter/agent/call-model` |
| `@openrouter/sdk/lib/model-result` | `@openrouter/agent/model-result` |
| `@openrouter/sdk/lib/tool` | `@openrouter/agent/tool` |
| `@openrouter/sdk/lib/tool-types` | `@openrouter/agent/tool-types` |
| `@openrouter/sdk/lib/stop-conditions` | `@openrouter/agent/stop-conditions` |
| `@openrouter/sdk/lib/async-params` | `@openrouter/agent/async-params` |
| `@openrouter/sdk` (barrel: `createInitialState`, `updateState`, `fromClaudeMessages`, `fromChatMessages`) | `@openrouter/agent` |

```diff
- import OpenRouter from '@openrouter/sdk';
- import { callModel } from '@openrouter/sdk/funcs/call-model';
+ import { OpenRouter } from '@openrouter/agent';

  const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
+ const result = client.callModel({ model: 'openai/gpt-4o', input: 'Hello' });
+ const text = await result.getText();
```

```typescript
// Both packages together
import { OpenRouter } from '@openrouter/sdk';
import { callModel } from '@openrouter/agent/call-model';
import { tool } from '@openrouter/agent/tool';
```

Notes on the docs' automated `sed` script:
- It rewrites **subpath** imports only, and it must replace `tool-types` before `tool`.
- Barrel imports and client-class imports (`from '@openrouter/sdk'` with no subpath) must be updated by hand. A blanket replace of the bare package name would also break the subpaths.
- Verify the result with `npx tsc --noEmit` and your tests.

API keys and endpoints are unchanged.

The TypeScript GitHub README also points to a migration skill, `npx skills add OpenRouterTeam/skills --skill openrouter-agent-migration`. It is documented here as a feature; do not run it on the user's behalf.

Sources: https://github.com/OpenRouterTeam/typescript-sdk, https://github.com/OpenRouterTeam/python-sdk, https://github.com/OpenRouterTeam/go-sdk, https://openrouter.ai/docs/client-sdks/overview, https://openrouter.ai/docs/client-sdks/typescript/overview, https://openrouter.ai/docs/client-sdks/python/overview, https://openrouter.ai/docs/client-sdks/go/overview, https://openrouter.ai/docs/client-sdks/agent-migration, https://openrouter.ai/docs/changelog

### 3.2 Cross-SDK conventions

#### Server, base URL and per-operation servers

| Item | Value |
| - | - |
| Default server | `https://openrouter.ai/api/v1` (spec server id `production`) |
| Alpha endpoints | `alpha.decisions.create` → `POST https://openrouter.ai/api/alpha/decisions`; `alpha.extractions.create` → `POST https://openrouter.ai/api/alpha/extractions`. Each operation declares its own server, `https://openrouter.ai`. |
| Per-operation server override | Only for operations that declare their own server list (the two alpha methods). TS `options.serverURL`, Python `server_url=`, Go `operations.WithServerURL("https://openrouter.ai")`. |
| Global server override | Go: `openrouter.WithServer("production")` selects by name (`production` = `https://openrouter.ai/api/v1` is the only server), or `openrouter.WithServerURL(url)` sets a URL. TS/Python: **not documented**; their READMEs omit a Server Selection section. |
| Custom HTTP client / timeouts | Go: `openrouter.WithClient(c)`, where `c` implements `Do(req *http.Request) (*http.Response, error)`, e.g. `&http.Client{Timeout: 30 * time.Second}`. TS/Python: **not documented**. For per-call cancellation, TS can use `options.fetchOptions.signal` and Go can use `ctx`. |
| Debug logging | TS: `new OpenRouter({ debugLogger: console })`. Python: `OpenRouter(debug_logger=logging.getLogger("openrouter"))`. Both: setting env `OPENROUTER_DEBUG=true` enables a default debug logger. Debug logs "will reveal secrets, like API tokens in headers", so use them in local development only. Go: not documented. |

#### Authentication

- Global security scheme `apiKey`: HTTP bearer, sent as `Authorization: Bearer <key>`. You supply it once at construction:
  - TypeScript: `apiKey`
  - Python: `api_key`
  - Go: `openrouter.WithSecurity(key)`
  - The Go README's security table names the global scheme `APIKey` (HTTP Bearer) and gives `OPENROUTER_API_KEY` as its environment variable. Some README examples build clients with no key (`new OpenRouter()` in TS; `openrouter.New()` in Go for per-operation-security calls). No README describes an automatic environment fallback in prose, so pass the key explicitly.
- **Management-key-only methods.** Many account and governance methods are marked "[Management key] required". The catalog ([§3.6](#36-method-catalog-all-resources)) flags them **Mgmt key**. A regular inference key gets 401/403 on these. Use a separate client instance built with a management key ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) Management keys).
  - `apiKeys.getCurrentKeyMetadata` (`GET /key`) works with a normal key.
  - `credits.getCredits` (`GET /credits`) **requires a management key**.
- **Operation-level `bearer` security** applies to three methods: `models.listForUser`, `tools.listTools` and `tools.getTool`. These declare a separate `bearer` scheme, and the token is passed **per call** as a security object, not taken from the client:
  - TypeScript: first argument `{ bearer: "..." }`, e.g. `openRouter.tools.getTool({ bearer }, { name })`. The examples build the client without `apiKey`.
  - Python: `security=operations.ListModelsUserSecurity(bearer=...)`, `operations.ListToolsSecurity(...)` or `operations.GetToolSecurity(...)`.
  - Go: `operations.ListModelsUserSecurity{Bearer: ...}` (and `ListToolsSecurity` / `GetToolSecurity`) as the argument after `ctx`. The Go README's Per-Operation Security example confirms this order and builds the client with plain `openrouter.New()`.
  - The examples read the token from `OPENROUTER_BEARER`. That value is an OpenRouter bearer token (API key).
- Presets and Vault operations re-declare the default `apiKey` scheme. Callers do nothing extra.

#### App attribution headers

These map to the attribution headers described in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) (App attribution). `HTTP-Referer` is required for an app page; `X-OpenRouter-Title` alone does not create one; the legacy `X-Title` is still accepted.

| Purpose | HTTP header | TypeScript client option | Python constructor kwarg (also a per-method kwarg) | Go |
| - | - | - | - | - |
| App URL, the primary identifier for rankings | `HTTP-Referer` | `httpReferer` | `http_referer` | no option; inject via a custom `HTTPClient` ([§3.5](#35-go-sdk-githubcomopenrouterteamgo-sdk)) |
| App display name | `X-OpenRouter-Title` | `appTitle` | `x_open_router_title` | same |
| Comma-separated marketplace categories, e.g. `"cli-agent,cloud-agent"` | `X-OpenRouter-Categories` | `appCategories` | `x_open_router_categories` | same |

```typescript
const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  httpReferer: 'https://myapp.com',       // Your app's URL
  appTitle: 'My AI Assistant',            // Your app's display name
  appCategories: 'cli-agent,cloud-agent', // Optional categories
});
```

#### Other header parameters exposed as method arguments

| Header | Methods | TS | Python | Go |
| - | - | - | - | - |
| `X-OpenRouter-Metadata` (`MetadataLevel` enum `disabled` \| `enabled`; default `disabled`). Opts in to routing metadata under `openrouter_metadata` in the response. The legacy `X-OpenRouter-Experimental-Metadata` is still accepted. | `chat.send`, `responses.send`, `beta.responses.send` | a field of the request object, next to `chatRequest` / `responsesRequest`. The key is not shown in the TS README; by convention it is `xOpenRouterMetadata` (verify). | `x_open_router_metadata=` | 3rd positional arg `xOpenRouterMetadata *components.MetadataLevel`: pass `nil` or `components.MetadataLevelEnabled.ToPointer()` |
| `Idempotency-Key` | `privateEndpoints.create` | a field of the request object (key not shown in the TS README) | `idempotency_key=` | `idempotencyKey *string` positional arg |

#### Namespace names by language (method counts in parentheses)

| Resource | TypeScript `openRouter.` | Python `open_router.` | Go `s.` |
| - | - | - | - |
| Analytics | `analytics` (3) | `analytics` (3) | `Analytics` (3) |
| API Keys | `apiKeys` (6) | `api_keys` (6) | `APIKeys` (6) |
| Batch | `batch` (4) | `batch` (4) | `Batch` (4) |
| Benchmarks | `benchmarks` (1) | `benchmarks` (1) | `Benchmarks` (1) |
| Beta.Responses (deprecated) | `beta.responses` (1) | `beta.responses` (1) | `Beta.Responses` (1) |
| BYOK | `byok` (5) | `byok` (5) | `BYOK` (5) |
| Chat | `chat` (1) | `chat` (1) | `Chat` (1) |
| Classifications | `classifications` (1) | `classifications` (1) | `Classifications` (1) |
| Containers | `containers` (4) | `containers` (4) | `Containers` (4) |
| Credits | `credits` (1) | `credits` (1) | `Credits` (1) |
| Datasets | `datasets` (3) | `datasets` (3) | `Datasets` (3) |
| Alpha.Decisions | `alpha.decisions` (1) | `alpha.decisions` (1) | `Alpha.Decisions` (1) |
| Embeddings | `embeddings` (2) | `embeddings` (2) | `Embeddings` (2) |
| Endpoints | `endpoints` (2) | `endpoints` (2) | `Endpoints` (2) |
| EndUsers (deprecated) | `endUsers` (5) | — (removed) | — |
| External Users | `externalUsers` (5) | `external_users` (5) | `ExternalUsers` (5) |
| Alpha.Extractions | `alpha.extractions` (1) | `alpha.extractions` (1) | `Alpha.Extractions` (1) |
| Files | `files` (5) | `files` (5) | `Files` (5) |
| Generations | `generations` (3) | `generations` (3) | `Generations` (3) |
| Guardrail Policies | `guardrailPolicies` (23) | `guardrail_policies` (23) | — **(missing in Go)** |
| Guardrails | `guardrails` (13) | `guardrails` (13) | `Guardrails` (13) |
| Images | `images` (3) | `images` (3) | `Images` (3) |
| Models | `models` (4) | `models` (4) | `Models` (4) |
| OAuth | `oAuth` (4) | `o_auth` (4) | `OAuth` (4) |
| Observability | `observability` (5) | `observability` (5) | `Observability` (5) |
| Organization | `organization` (3) | `organization` (3) | `Organization` (3) |
| Presets | `presets` (7) | `presets` (7) | `Presets` (7) |
| Private Endpoints | `privateEndpoints` (9) | `private_endpoints` (9) | `PrivateEndpoints` (9) |
| Private Providers | `privateProviders` (5) | `private_providers` (5) | `PrivateProviders` (5) |
| Providers | `providers` (1) | `providers` (1) | `Providers` (1) |
| Rerank | `rerank` (1) | `rerank` (1) | `Rerank` (1) |
| Responses | `responses` (1) | `responses` (1) | `Responses` (1) |
| SCIM | `scim` (8) | `scim` (8) | `Scim` (8) |
| STT | `stt` (2) | `stt` (2) | `STT` (2) |
| SystemOne | `systemOne` (1) | `system_one` (1) | `SystemOne` (1) |
| Tools | `tools` (2) | `tools` (2) | `Tools` (2) |
| TTS | `tts` (1) | `tts` (1) | `TTS` (1) |
| Vault | `vault` (9) | `vault` (9) | `Vault` (9) |
| Video Generation | `videoGeneration` (4) | `video_generation` (4) | `VideoGeneration` (4) |
| Workspaces | `workspaces` (12) | `workspaces` (12) | `Workspaces` (12) |

#### Method and field naming

- Method names come from `x-speakeasy-name-override` when the spec sets one, and otherwise from the `operationId`. Each language applies its own casing to the same name: TS `getCurrentKeyMetadata`, Python `get_current_key_metadata`, Go `GetCurrentKeyMetadata`. Python and Go also use their own casing for initialisms: `oAuth` / `o_auth` / `OAuth`; `exchangeAuthCodeForAPIKey` / `exchange_auth_code_for_api_key` / `ExchangeAuthCodeForAPIKey`.
- Request and response **fields** follow the same convention. TS uses camelCase (`includeByokInLimit`, `maxTokens`, `allowFallbacks`, `codeChallengeMethod`). Python uses the wire snake_case (`include_byok_in_limit`). Go uses PascalCase struct fields (`IncludeBYOKInLimit`, `CodeChallengeMethod`, `FederationPolicyID`).
- Some JSON names are not valid identifiers. In TypeScript the `_shape` discriminator is exposed as `shape`.
- Raw API JSON in snake_case cannot be handed to the TypeScript request types as-is. The Body Builder guide notes that generated `max_tokens`-style JSON should be sent with plain HTTP "rather than converting it to SDK request types".

#### Request shape by language

| | TypeScript | Python | Go |
| - | - | - | - |
| Call shape | One request object, plus optional `options` (2nd arg) | Keyword arguments, flattened | Positional: `ctx`, then path/query params or a request struct, then the body struct, then `opts ...operations.Option` |
| Path and query params | Top-level camelCase keys: `{ hash }`, `{ containerId, fileId }`, `{ workspaceRef, interval }` | kwargs: `hash=`, `container_id=` | Positional values: `"hash"`, optional values as pointers |
| JSON body | Nested under a **named key** that differs per method: `chatRequest`, `responsesRequest`, `requestBody`, `createBYOKKeyRequest`, `batchSubmitBody`, `imageGenerationRequest`, `speechRequest`, `sttRequest`, `decisionsRequest`, `extractionsRequest`, `tokenExchangeRequest`, `vaultSecretWriteRequest`, … (exact keys are in [§3.6](#36-method-catalog-all-resources)) | Body fields flattened into kwargs (`model=`, `messages=`, …). Nested objects accept dicts | Typed struct: `components.ChatRequest{...}`, `operations.CreateEmbeddingsRequest{...}`, … |
| Optional values | Omit the key | Omit the kwarg | `nil`, `openrouter.Pointer(v)`, `optionalnullable.From(...)` |
| Per-request options | `options.fetchOptions`, `options.retries`, `options.serverURL` (alpha only) | `retries=`, `server_url=` (alpha only), per-call `http_referer` / `x_open_router_title` / `x_open_router_categories` | `opts ...operations.Option`: `operations.WithRetries(retry.Config{...})`, `operations.WithServerURL(url)` |
| Return | `Promise<T>` | `T` (a Pydantic-style model with attribute access) | `(*T, error)`, or just `error` for no-body deletes |

#### Response types, unions and binary data

- **Type namespaces.** TS: `models.*` / `operations.*`. Python: `components.*` / `operations.*`. Go: `components.*` / `operations.*`.
- **Inference methods that can stream** return a union of the JSON result and an event stream (TS `operations.SendChatCompletionRequestResponse`, `operations.CreateResponsesResponse`). Narrow the union before use ([§3.3](#33-typescript-sdk-openroutersdk)–[§3.5](#35-go-sdk-githubcomopenrouterteamgo-sdk)).
- **Binary responses:**

| Method | HTTP | TS return | Python return | Go return |
| - | - | - | - | - |
| `containers.downloadContainerFileContent` | `GET /containers/{container_id}/files/{file_id}/content` | `ReadableStream<Uint8Array>` | `httpx.Response` | `io.ReadCloser` |
| `files.download` | `GET /files/{file_id}/content` | `ReadableStream<Uint8Array>` | `httpx.Response` | `io.ReadCloser` |
| `tts.createSpeech` | `POST /audio/speech` | `ReadableStream<Uint8Array>` | `httpx.Response` | `io.ReadCloser` |
| `videoGeneration.getVideoContent` | `GET /videos/{jobId}/content` | `ReadableStream<Uint8Array>` | `httpx.Response` | `io.ReadCloser` |

- **No-body responses:**
  - `externalUsers.delete` / `endUsers.delete`: TS `Promise<void>`, Python returns nothing, Go returns only `error`.
  - `vault.deleteVaultSecret`, `vault.deleteInternVaultSecret`: 204, same handling.

#### Streaming (SSE)

| Method | Trigger | Event type | TS consumption | Python consumption | Go consumption |
| - | - | - | - | - | - |
| `chat.send` | `stream: true` | chat completion chunks (`object: "chat.completion.chunk"`) | `for await (const chunk of result)` | `with res as event_stream: for event in event_stream:` | `res.ChatStreamingResponse.Next()` / `.Value()` / `.Close()` |
| `responses.send` (and `beta.responses.send`) | `stream: true` | Responses events, e.g. `response.output_text.delta` | `for await (const event of stream)` | same as above | `res.ResponsesStreamingResponse` |
| `images.generate` | streaming request (`stream` field) | e.g. `image_generation.partial_image` | (not shown) | `with res as event_stream:` | `res.ImageStreamingResponse` |

- The streams terminate at the `[DONE]` sentinel (`x-speakeasy-sse-sentinel`), which the SDK handles for you.
- Embeddings and rerank declare a `text/event-stream` response marked "Not used". They do not stream.
- Streaming wire format, mid-stream errors and cancellation are in [§4](04-api-fundamentals.md#4-api-fundamentals).

#### Pagination

The spec's `x-speakeasy-pagination` turns list methods into iterators. Two styles exist:

| Style | Methods | Inputs → outputs |
| - | - | - |
| `offsetLimit` | `byok.list`, `datasets.getAppRankings`, `datasets.getSessionCost`, `embeddings.listModels`, `externalUsers.list` (and `endUsers.list`), `guardrails.list`, `guardrails.listGuardrailKeyAssignments`, `guardrails.listGuardrailMemberAssignments`, `guardrails.listKeyAssignments`, `guardrails.listMemberAssignments`, `guardrailPolicies.listAccountPolicies` / `listBudgetPolicies` / `listModelAvailabilityPolicies` / `listModerationPolicies`, `models.list`, `models.listForUser`, `observability.list`, `organization.listMembers`, `presets.list`, `presets.listVersions`, `scim.listMappings`, `scim.listGroups`, `workspaces.list`, `workspaces.listMembers` | query `offset`, `limit` → results `$.data` |
| `offsetLimit` (offset only) | `apiKeys.list` | query `offset` → `$.data`. No README example iterates pages, though the management-keys guide says the list returns the most recent 100 and you paginate with `offset`. |
| `cursor` | `batch.list` | query `after` ← `$.last_id`; results `$.data` |
| `cursor` | `files.list` | query `cursor` ← `$.cursor`; results `$.data` |

How to iterate:
- TS: `for await (const page of result) { ... }`
- Python: `while res is not None: ...; res = res.next()`
- Go: `res, err = res.Next()`; stop when `res == nil`

Other list methods (`containers.listContainerFiles`, the `vault.list*` methods, `privateEndpoints.list`, `privateProviders.list`, `workspaces.listBudgets`) have no SDK iterator. Page them by hand with their `limit` / `offset` / `after` params.

#### Retries

Default retry policy declared in the spec (`x-speakeasy-retries`, global):

| Setting | Value |
| - | - |
| `strategy` | `backoff` |
| `backoff.initialInterval` | 500 ms |
| `backoff.maxInterval` | 60000 ms |
| `backoff.exponent` | 1.5 |
| `backoff.maxElapsedTime` | 3600000 ms (1 h) |
| `statusCodes` | `5XX` |
| `retryConnectionErrors` | `true` |

- **Override:** `batch.createBatches` (`POST /batches`) retries **only `429`** and does **not** retry connection errors.
- The spec also has a top-level `x-retry-strategy` (`type: exponential`, `initialDelay: 500`, `maxDelay: 60000`, `maxAttempts: 3`). Its consumer is not documented.
- **Per-request override:**
  - TS: `options.retries` (type `RetryConfig`), "Enables retrying HTTP requests under certain failure conditions."
  - Python: `retries=` (`utils.RetryConfig`), "Configuration to override the default retry behavior of the client."
  - Go:
    - per call: `operations.WithRetries(retry.Config{...})`
    - whole client: `openrouter.WithRetryConfig(retry.Config{...})`
    - package: `github.com/OpenRouterTeam/go-sdk/retry`
    - fields: `Strategy: "backoff"`, `Backoff: &retry.BackoffStrategy{InitialInterval, MaxInterval, Exponent, MaxElapsedTime}`, `RetryConnectionErrors bool`
    - Without configuration, the SDK "will fall back to the default retry strategy provided by the API" (the spec block above).
  - The TS/Python `RetryConfig` fields are **not spelled out** in their READMEs. They presumably mirror the same structure (`strategy`, `backoff{initialInterval, maxInterval, exponent, maxElapsedTime}`, `retryConnectionErrors`); verify against the installed package.
- The default applies to non-idempotent POSTs too (chat, responses, images, video). A 5XX after the upstream started work can be retried. Weigh this for expensive generation calls.
- `privateEndpoints.create` supports `Idempotency-Key` for safe retries.

#### Error classes

Every method lists typed errors per status code. Then a catch-all exists: TS/Python `errors.OpenRouterDefaultError`, Go `sdkerrors.APIError`, for any other `4XX`/`5XX` (`*/*` content). In Go, "all operations return a response object or an error, they will never return both". The Go error types live in `github.com/OpenRouterTeam/go-sdk/models/sdkerrors`. Common classes (same names in all three; namespace `errors.` in TS/Python, `sdkerrors.` in Go):

| Status | Class | Typical cause |
| - | - | - |
| 400 | `BadRequestResponseError` | Invalid request |
| 401 | `UnauthorizedResponseError` | Missing/invalid credentials |
| 402 | `PaymentRequiredResponseError` | Insufficient credits |
| 403 | `ForbiddenResponseError` | Insufficient permissions (e.g. inference key on a management route) |
| 404 | `NotFoundResponseError` | Not found |
| 408 | `RequestTimeoutResponseError` | Request timeout |
| 409 | `ConflictResponseError` | Conflict / state precondition |
| 410 | `GoneResponseError` | `videoGeneration.getVideoContent` only |
| 413 | `PayloadTooLargeResponseError` | Payload too large |
| 422 | `UnprocessableEntityResponseError` | Unprocessable entity |
| 429 | `TooManyRequestsResponseError` | Rate limited |
| 499 | `ClientClosedRequestResponseError` | Client closed request (`embeddings.generate`, `files.upload`, `videoGeneration.generate`, `containers.promoteContainerFile`) |
| 500 | `InternalServerResponseError` | Server error |
| 502 | `BadGatewayResponseError` | Upstream/provider error |
| 503 | `ServiceUnavailableResponseError` | Unavailable |
| 504 | `GatewayTimeoutResponseError` | `embeddings.generate`, `stt.*`, all `vault.*` |
| 524 | `EdgeNetworkTimeoutResponseError` | Edge timeout |
| 529 | `ProviderOverloadedResponseError` | Provider overloaded |
| other 4XX/5XX | TS/Py `OpenRouterDefaultError`; Go `APIError` | Fallback |

Resource-specific error classes:
- **Batch:** `BatchErrorResponse` covers every status of `batch.list`, `batch.createBatches`, `batch.delete` and `batch.getBatches`. `batch.getBatches` uses `BatchPaymentRequiredResponseError` for 402.
- **OAuth:** `OAuthErrorResponse` covers 400/429/500/503 of `oAuth.createOauthToken`.
- **Private endpoints:** TS and Python add `CreatePrivateEndpointValidationFailedResponseError` (404/409/422/500/502) for `privateEndpoints.create`, ahead of the generic class for the same codes. Go's README lists `sdkerrors.NotFound`, `sdkerrors.Conflict`, `sdkerrors.UnprocessableEntity`, `sdkerrors.InternalServerError` and `sdkerrors.BadGateway` for that method instead.

Status-code semantics and the error body format are in [§4](04-api-fundamentals.md#4-api-fundamentals).

Sources: https://github.com/OpenRouterTeam/typescript-sdk, https://github.com/OpenRouterTeam/python-sdk, https://github.com/OpenRouterTeam/go-sdk, https://openrouter.ai/docs/client-sdks/overview, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/decisions/README, https://openrouter.ai/docs/client-sdks/python/sdks/decisions/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/models/README, https://openrouter.ai/docs/client-sdks/python/sdks/tools/README, https://openrouter.ai/docs/client-sdks/go/sdks/tools/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/privateendpoints/README, https://openrouter.ai/docs/client-sdks/go/sdks/privateendpoints/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/batch/README, https://openrouter.ai/docs/app-attribution, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/guides/routing/routers/body-builder, https://openrouter.ai/docs/changelog (OpenAPI spec `x-speakeasy-*` extensions)

### 3.3 TypeScript SDK (`@openrouter/sdk`)

#### Install and import

```bash
npm install @openrouter/sdk   # pnpm add / yarn add / bun add / deno add npm:@openrouter/sdk
```

```typescript
import { OpenRouter } from "@openrouter/sdk";               // full client
import { OpenRouterCore } from "@openrouter/sdk/core.js";    // tree-shakable core
import { chatSend } from "@openrouter/sdk/funcs/chatSend.js"; // standalone function
```

- The package is **ESM only**. From CommonJS, use `await import("@openrouter/sdk")`.
- Supported runtimes: see `RUNTIMES.md` in the GitHub repo (not reproduced in the docs).
- The file-upload examples use `openAsBlob` from `node:fs` (Node v20+). Other runtimes are covered under Uploads below.

#### Client construction

```typescript
const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  httpReferer: "https://myapp.example", // optional, HTTP-Referer
  appTitle: "My App",                   // optional, X-OpenRouter-Title
  appCategories: "cli-agent",           // optional, X-OpenRouter-Categories
});
```

| Option | Type | Required | Description |
| - | - | - | - |
| `apiKey` | `string` | Yes, for all operations except the three operation-level-`bearer` ones | API key or management key, sent as `Authorization: Bearer` |
| `httpReferer` | `string` | No | App URL for attribution and rankings |
| `appTitle` | `string` | No | App display name |
| `appCategories` | `string` | No | Comma-separated categories |
| `debugLogger` | logger matching `console`'s interface | No | Emits debug logs for SDK requests and responses, e.g. `debugLogger: console`. Setting env `OPENROUTER_DEBUG=true` enables a default debug logger instead. **Debug logs reveal secrets such as API tokens in headers**; local development only. |

- No other constructor options (server URL, timeout, retry config, HTTP client) are documented. The GitHub README marks its Retries, Error Handling, Server Selection and Custom HTTP Client sections as absent.
- Some doc snippets call `new OpenRouter()` with no arguments (TS overview, the GitHub README's SDK Usage, the Usage-for-Agents page). The docs do not state an environment-variable fallback, so pass `apiKey` explicitly.

#### Method call shape and per-request options

Signature: `openRouter.<namespace>.<method>(request, options?)`. The three operation-level-`bearer` methods take the security object **first**: `(security, request?, options?)`. For example, `openRouter.models.listForUser({ bearer })` and `openRouter.tools.getTool({ bearer }, { name: "openrouter:web_search" })`. Their parameter tables list `request` before `security`; the examples are authoritative.

| Parameter | Type | Description |
| - | - | - |
| `request` | `operations.<OperationId>Request` | One object. Path and query params are top-level camelCase keys; the JSON body sits under a named key ([§3.2](#32-cross-sdk-conventions), [§3.6](#36-method-catalog-all-resources)) |
| `security` | `operations.ListModelsUserSecurity` / `ListToolsSecurity` / `GetToolSecurity` | `{ bearer: string }`. Only for `models.listForUser`, `tools.listTools`, `tools.getTool` |
| `options` | `RequestOptions` | Optional |
| `options.fetchOptions` | `RequestInit` | Passed to the underlying `fetch`. "Can be used to inject extra headers". All `Request` options are allowed **except `method` and `body`** (so `headers`, `signal`, … work) |
| `options.retries` | `RetryConfig` | Per-request retry override |
| `options.serverURL` | `string` | Only on `alpha.decisions.create` and `alpha.extractions.create` |

```typescript
const ac = new AbortController();
const result = await openRouter.chat.send(
  {
    chatRequest: {
      model: "openai/gpt-5.2",
      messages: [{ role: "user", content: "Hi" }],
    },
  },
  {
    fetchOptions: {
      headers: { "x-session-id": "session-1234" }, // any extra header
      signal: ac.signal,                            // cancellation via RequestInit
    },
  },
);
```

#### Standalone functions and `OpenRouterCore` (tree-shaking)

- Every method has a standalone function in `@openrouter/sdk/funcs/<name>.js`.
- Naming: `<namespaceCamel><MethodPascal>`. Examples:
  - `chatSend`, `responsesSend`, `creditsGetCredits`
  - `apiKeysGetCurrentKeyMetadata`, `modelsList`, `embeddingsGenerate`
  - `alphaDecisionsCreate`, `alphaExtractionsCreate`, `oAuthCreateAuthCode`
  - `systemOneCreate`, `videoGenerationGenerate`, `guardrailPoliciesListBudgetPolicies`
- Use it with `OpenRouterCore` ("for best tree-shaking performance. You can create one instance of it to use across an application"). `OpenRouterCore` takes the same constructor options as `OpenRouter`.
- Standalone functions **do not throw** for API errors. They return a result object: `{ ok: true, value }` or `{ ok: false, error }`.
- Deprecated aliases share functions. The Beta.Responses README shows `responsesSend`, and the changelog says `betaResponsesSend` remains as a deprecated alias. `endUsers.*` uses the `externalUsers*` functions (e.g. `externalUsersList`).

```typescript
import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { creditsGetCredits } from "@openrouter/sdk/funcs/creditsGetCredits.js";

const core = new OpenRouterCore({ apiKey: process.env.OPENROUTER_MANAGEMENT_KEY ?? "" });

const res = await creditsGetCredits(core);
if (res.ok) {
  const { value: result } = res;
  console.log(result);
} else {
  console.log("creditsGetCredits failed:", res.error);
}
```

#### Streaming

`chat.send` and `responses.send` return a union. With `stream: true` the result is an event stream (a `ReadableStream`) that you consume with `for await`. Narrow the type before use.

```typescript
// Chat Completions streaming (TS overview quickstart; provider prefs are camelCase)
const result = await openRouter.chat.send({
  chatRequest: {
    model: "openai/gpt-5",
    messages: [{ role: "user", content: "Hello, how are you?" }],
    provider: { zdr: true, sort: "price" },
    stream: true,
  },
});
for await (const chunk of result) {
  console.log(chunk.choices[0]?.delta.content);
}
```

```typescript
// Responses API streaming (Usage-for-Agents page)
const stream = await openRouter.responses.send({
  responsesRequest: { model: "~anthropic/claude-sonnet-latest", input: "Tell me a story", stream: true },
});
if (!(stream instanceof ReadableStream)) {
  throw new Error("Expected a streaming response");
}
for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
}
```

Type guards used in the docs for non-streaming results:
- Responses: `if (!('output' in response)) throw ...`
- Chat: `if (completion instanceof ReadableStream) throw ...`

#### Pagination

For paginated methods ([§3.2](#32-cross-sdk-conventions)), you "make your SDK calls as usual, but the returned response object will also be an async iterable that can be consumed using the `for await...of` syntax":

```typescript
const result = await openRouter.models.list();
for await (const page of result) {
  console.log(page); // each page is a list response; items are under `data` on the wire
}
```

#### Uploads and binary downloads

Multipart methods (`files.upload`, `stt.createTranscriptionMultipart`) take a file handle. The README recommends streaming the file rather than reading it all into memory, which avoids out-of-memory crashes on large files. Ways to get a handle without buffering:

| Runtime | Helper |
| - | - |
| Node.js v20+ | `openAsBlob(path)` from `node:fs` |
| Bun | `Bun.file(path)` |
| Browsers | the `File` from an `<input type="file">` element |
| Node.js v18 | `fileFrom(path)` from `fetch-blob/from.js` (npm `fetch-blob`) |

```typescript
import { openAsBlob } from "node:fs";

const uploaded = await openRouter.files.upload({
  provider: "openai",                               // optional: store on the provider with your own key
  requestBody: { file: await openAsBlob("report.pdf") },
});

const transcript = await openRouter.stt.createTranscriptionMultipart({
  requestBody: { file: await openAsBlob("clip.wav"), model: "openai/whisper-large-v3", language: "en" },
});

const audio = await openRouter.tts.createSpeech({
  speechRequest: { input: "Hello world", model: "mistralai/voxtral-mini-tts-2603", voice: "en_paul_neutral", speed: 1 },
}); // ReadableStream<Uint8Array>
```

#### Error handling

- **Class methods throw** typed errors. The class names come from each method's Errors table ([§3.2](#32-cross-sdk-conventions)): `errors.UnauthorizedResponseError`, `errors.TooManyRequestsResponseError`, …, with `errors.OpenRouterDefaultError` as the fallback.
- **Standalone functions return** `{ ok: false, error }` instead of throwing.
- The import path of the `errors` namespace is **not shown** in the docs. Speakeasy TypeScript SDKs conventionally export it from `@openrouter/sdk/models/errors`; verify against the installed package before relying on it.

```typescript
// Unverified import path, see note above
import * as errors from "@openrouter/sdk/models/errors";

try {
  await openRouter.credits.getCredits();
} catch (err) {
  if (err instanceof errors.ForbiddenResponseError) {
    // e.g. called with an inference key instead of a management key
  } else if (err instanceof errors.TooManyRequestsResponseError) {
    // back off
  } else {
    throw err;
  }
}
```

#### Worked examples (TypeScript)

```typescript
import { OpenRouter } from "@openrouter/sdk";

const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" });

// 1) Chat completion, non-streaming
const completion = await openRouter.chat.send({
  chatRequest: {
    model: "openai/gpt-5.2",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the capital of France?" },
    ],
    stream: false,
  },
});
if (completion instanceof ReadableStream) throw new Error("Expected a non-streaming response");
console.log(completion.choices[0]?.message.content);

// 2) Chat completion, streaming
const chatStream = await openRouter.chat.send({
  chatRequest: { model: "openai/gpt-5.2", messages: [{ role: "user", content: "Count to 5" }], stream: true },
});
if (!(chatStream instanceof ReadableStream)) throw new Error("Expected a stream");
for await (const chunk of chatStream) process.stdout.write(chunk.choices[0]?.delta.content ?? "");

// 3) Responses API (non-streaming)
const response = await openRouter.responses.send({
  responsesRequest: { model: "openai/gpt-5.2", input: "Explain quantum computing in one sentence." },
});
if (!("output" in response)) throw new Error("Expected a non-streaming response");
if (response.status !== "completed") {
  throw new Error(response.error?.message ?? `Response ended as ${response.status}`);
}
const message = [...response.output].reverse().find((item) => item.type === "message");
console.log(message?.content.find((part) => part.type === "output_text")?.text);

// 4) Embeddings
const emb = await openRouter.embeddings.generate({
  requestBody: { model: "openai/text-embedding-3-small", input: "The quick brown fox jumps over the lazy dog" },
});
console.log(emb); // wire shape: { data: [{ embedding, index, object: "embedding" }], model, object: "list", usage }

// 5) List models (paginated iterator)
for await (const page of await openRouter.models.list()) {
  console.log(page);
}

// 6) Current key metadata (works with any key)
const key = await openRouter.apiKeys.getCurrentKeyMetadata();
console.log(key); // wire shape: { data: { label, limit, limit_remaining, usage, ... } }, camelCased in TS

// 7) Credits (management key required)
const mgmt = new OpenRouter({ apiKey: process.env.OPENROUTER_MANAGEMENT_KEY ?? "" });
const credits = await mgmt.credits.getCredits();
console.log(credits); // wire fields: data.total_credits, data.total_usage
```

API-key administration as written in the generated README (request-object form; management key):

```typescript
await mgmt.apiKeys.create({ requestBody: { name: "Customer Instance Key", limit: 50, limitReset: "monthly", includeByokInLimit: true } });
await mgmt.apiKeys.update({ hash: "<KEY_HASH>", requestBody: { disabled: true } });
await mgmt.apiKeys.get({ hash: "<KEY_HASH>" });
await mgmt.apiKeys.delete({ hash: "<KEY_HASH>" });
```

The Management API Keys guide shows an older positional style: `apiKeys.list({ offset: 100 })`, `apiKeys.create({ name, limit })`, `apiKeys.get(keyHash)`, `apiKeys.update(keyHash, {...})`, `apiKeys.delete(keyHash)`. This **conflicts with the generated README**, which uses `{ hash }` and `{ requestBody }`. Prefer the README form.

Sources: https://github.com/OpenRouterTeam/typescript-sdk, https://openrouter.ai/docs/client-sdks/typescript/overview, https://openrouter.ai/docs/client-sdks/overview, https://openrouter.ai/docs/client-sdks/usage-for-agents, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/responses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/credits/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/files/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/stt/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/tts/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/models/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/tools/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/apikeys/README, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/guides/routing/routers/body-builder, https://openrouter.ai/docs/changelog

### 3.4 Python SDK (`openrouter`)

#### Install and import

The SDK requires Python 3.10 or higher and is "stable as of v1.0". When a Python version reaches end of life, the SDK's minimum version is raised after a 3-month grace period.

```bash
pip install openrouter        # or: uv add openrouter / poetry add openrouter
uvx --from openrouter python  # Python shell with the SDK available (uv)
```

A standalone script needs no project setup (run it with `uv run script.py`):

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "openrouter",
# ]
# ///

from openrouter import OpenRouter

sdk = OpenRouter(
  # SDK arguments
)
```

IDE support: the models are Pydantic-based. For PyCharm, the README recommends the PyCharm Pydantic plugin for better integration.

```python
from openrouter import OpenRouter                          # client
from openrouter import OpenRouter, operations, components  # typed request/security models
from openrouter.utils import parse_datetime                # date-time helper used in examples
```

#### Client construction (context manager)

```python
import os
from openrouter import OpenRouter

with OpenRouter(
    api_key=os.environ["OPENROUTER_API_KEY"],
    http_referer="https://myapp.example",   # optional, HTTP-Referer
    x_open_router_title="My App",           # optional, X-OpenRouter-Title
    x_open_router_categories="cli-agent",   # optional, X-OpenRouter-Categories
) as open_router:
    ...
```

| Kwarg | Type | Description |
| - | - | - |
| `api_key` | `str` | API key or management key (Bearer) |
| `http_referer` | `Optional[str]` | "The app identifier should be your app's URL and is used as the primary identifier for rankings." |
| `x_open_router_title` | `Optional[str]` | "The app display name allows you to customize how your app appears in OpenRouter's dashboard." |
| `x_open_router_categories` | `Optional[str]` | Comma-separated list of app categories (e.g. `"cli-agent,cloud-agent"`), used for marketplace rankings |
| `debug_logger` | a `logging.Logger` | Emits debug logs for SDK requests and responses, e.g. `logging.basicConfig(level=logging.DEBUG)` then `OpenRouter(debug_logger=logging.getLogger("openrouter"))`. Setting env `OPENROUTER_DEBUG=true` enables a default debug logger. Debug output can include API tokens; local development only. |

- No other constructor kwargs (server URL, timeout, custom `httpx` client) are documented. The GitHub README marks its Retries, Error Handling, Server Selection and Custom HTTP Client sections as absent.

#### Resource management, sync and async

- `OpenRouter` implements the context-manager protocol and registers a finalizer that closes the underlying **sync and async HTTPX clients**. This closes HTTP connections and frees memory and other resources.
- In short scripts and notebooks this rarely matters. In long-lived programs, create **one** instance via a context manager and reuse it across the application.
- **Async:** use the same class under `async with`. Methods have `_async` coroutine variants; the README shows `chat.send_async`.

```python
import asyncio
import os
from openrouter import OpenRouter

async def main():
    async with OpenRouter(api_key=os.environ["OPENROUTER_API_KEY"]) as open_router:
        res = await open_router.chat.send_async(
            model="anthropic/claude-4.5-sonnet",
            messages=[{"role": "user", "content": "Hello, how are you?"}],
            provider={"zdr": True, "sort": "price"},
            stream=True,
        )
        # The README's example iterates an `event_stream` it never binds; the async
        # form of the documented sync pattern (`with res as event_stream:`) is:
        async with res as event_stream:
            async for event in event_stream:
                print(event, flush=True)

asyncio.run(main())
```

- Only `chat.send_async` appears in the README. Other methods presumably follow the same `<method>_async` naming; confirm against the installed package.

#### Method call shape and per-call kwargs

- Body fields and path/query params are **flattened into kwargs**: `open_router.chat.send(model=..., messages=[...], stream=False)`.
- Nested objects accept plain dicts, for example `messages=[{"role": "user", "content": "..."}]`, `time_range={"start": parse_datetime(...), "end": ...}`, `file={"file_name": ..., "content": ...}`.
- Exceptions:
  - `analytics.get_user_activity(request=...)` takes a single `operations.GetUserActivityRequest`.
  - `guardrail_policies.create_account_policy` and `update_account_policy` take `account_guardrail_policy_request=`.
- Per-call kwargs on most methods:

| Kwarg | Description |
| - | - |
| `retries` | `Optional[utils.RetryConfig]`, overrides the client's default retry behavior |
| `http_referer`, `x_open_router_title`, `x_open_router_categories` | Per-call overrides of the attribution headers. Listed on almost every method |
| `server_url` | `alpha.decisions.create`, `alpha.extractions.create` only ("An optional server URL to use") |
| `security` | `models.list_for_user`, `tools.list_tools`, `tools.get_tool`. Pass `operations.ListModelsUserSecurity(bearer=...)` / `operations.ListToolsSecurity(...)` / `operations.GetToolSecurity(...)` |
| `x_open_router_metadata` | `chat.send`, `responses.send`, `beta.responses.send`: `"enabled"` / `"disabled"` |
| `idempotency_key` | `private_endpoints.create` |

```python
import os
from openrouter import OpenRouter, operations

with OpenRouter(api_key=os.environ["OPENROUTER_API_KEY"]) as open_router:
    tool = open_router.tools.get_tool(
        security=operations.GetToolSecurity(bearer=os.getenv("OPENROUTER_BEARER", "")),
        name="openrouter:web_search",
    )
```

The docs' example for these three methods builds the client with only the attribution kwargs, because the bearer travels in `security`.

#### Streaming

The generated README examples consume streams with the response used as a context manager:

```python
res = open_router.chat.send(model="openai/gpt-5.2", messages=[{"role": "user", "content": "Hi"}], stream=True)
with res as event_stream:
    for event in event_stream:
        print(event, flush=True)  # chat chunk: event.choices[0].delta.content
```

- The same pattern applies to `responses.send(..., stream=True)` (events have `.type`, e.g. `response.output_text.delta`) and to `images.generate(...)` when streaming.
- **Gotcha:** the GitHub README's usage example sets `stream=True` but iterates an `event_stream` variable it never binds; add `with res as event_stream:`. Separately, the generated examples pass `stream=False` and then iterate an event stream. That is a generator artifact. With `stream=False` you get a plain response object (as in the overview example, where `response.status` and `response.output` are read directly). Use `with res as event_stream` only with `stream=True`.

#### Pagination

The returned response has a next-page method; when it returns `None`, there are no more pages. The README prose calls it `Next`, but the code uses `res.next()`:

```python
res = open_router.models.list(offset=0, limit=500)
while res is not None:
    # handle res (items under res.data per the wire format)
    res = res.next()
```

#### Uploads and binary downloads

```python
up = open_router.files.upload(
    file={"file_name": "report.pdf", "content": open("report.pdf", "rb")},
    provider="openai",  # optional
)
tr = open_router.stt.create_transcription_multipart(
    model="openai/whisper-large-v3",
    file={"file_name": "clip.wav", "content": open("clip.wav", "rb")},
)
audio = open_router.tts.create_speech(
    input="Hello world", model="mistralai/voxtral-mini-tts-2603", voice="en_paul_neutral",
)  # httpx.Response
```

- The `file` kwarg type is `operations.UploadFileFile`, a dict with `file_name` and `content`. For multipart STT, `file` is optional and can be replaced by `source_url`.
- The README recommends passing a stream (an open file object) rather than reading the whole file into memory. Byte arrays are also accepted, but streams are recommended for large files.
- Binary methods return `httpx.Response`: `files.download`, `containers.download_container_file_content`, `tts.create_speech`, `video_generation.get_video_content`.

#### Typed server tools (web search)

The Python SDK has native types for OpenRouter web search ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Server tools):

```python
from openrouter import OpenRouter, components

# Chat Completions
res = open_router.chat.send(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "What changed in AI today?"}],
    tools=[
        components.OpenRouterWebSearchServerTool(
            type="openrouter:web_search",
            parameters=components.WebSearchConfig(max_results=5, search_context_size="medium"),
        )
    ],
)

# Responses API
res = open_router.responses.send(
    model="openai/gpt-4o",
    input="What changed in AI today?",
    tools=[
        components.WebSearchServerToolOpenRouter(
            type="openrouter:web_search",
            parameters=components.WebSearchServerToolConfig(max_results=5, search_context_size="medium"),
        )
    ],
    stream=False,
)
```

- The class names differ per API:
  - Chat: `OpenRouterWebSearchServerTool` + `WebSearchConfig`
  - Responses: `WebSearchServerToolOpenRouter` + `WebSearchServerToolConfig`
- The web-search plugin is available as `components.WebSearchPlugin(id="web", ...)` for request shapes that accept `plugins`.

#### Error handling

- Methods raise typed errors named as in the README tables: `errors.UnauthorizedResponseError`, `errors.PaymentRequiredResponseError`, `errors.TooManyRequestsResponseError`, …, with `errors.OpenRouterDefaultError` as the fallback.
- The import statement for `errors` is not shown in the docs. The examples import `components` and `operations` from the top-level `openrouter` package, so `from openrouter import errors` is the likely form. **Verify** it.

```python
from openrouter import OpenRouter, errors  # import path unverified, see above

try:
    credits = open_router.credits.get_credits()
except errors.ForbiddenResponseError:
    ...  # inference key used where a management key is required
except errors.OpenRouterDefaultError as e:
    ...
```

#### Worked examples (Python)

```python
import os
from openrouter import OpenRouter

with OpenRouter(api_key=os.environ["OPENROUTER_API_KEY"]) as open_router:
    # 1) Chat completion, non-streaming
    res = open_router.chat.send(
        model="openai/gpt-5.2",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is the capital of France?"},
        ],
        stream=False,
    )
    print(res.choices[0].message.content)

    # 2) Chat completion, streaming
    stream = open_router.chat.send(
        model="openai/gpt-5.2", messages=[{"role": "user", "content": "Count to 5"}], stream=True,
    )
    with stream as event_stream:
        for event in event_stream:
            print(event.choices[0].delta.content or "", end="", flush=True)

    # 3) Responses API
    response = open_router.responses.send(
        model="openai/gpt-5.2", input="Explain quantum computing in one sentence.",
    )
    if response.status != "completed":
        raise RuntimeError(response.error.message if response.error else f"Response ended as {response.status}")
    message = next(item for item in reversed(response.output) if item.type == "message")
    print(next(part.text for part in message.content if part.type == "output_text"))

    # 4) Embeddings
    emb = open_router.embeddings.generate(
        input="The quick brown fox jumps over the lazy dog", model="openai/text-embedding-3-small",
    )
    print(emb)  # wire shape: data[].embedding, model, usage

    # 5) List models (paginated)
    page = open_router.models.list(offset=0, limit=500)
    while page is not None:
        print(page)
        page = page.next()

    # 6) Current key metadata (any key)
    print(open_router.api_keys.get_current_key_metadata())

# 7) Credits require a management key
with OpenRouter(api_key=os.environ["OPENROUTER_MANAGEMENT_KEY"]) as mgmt:
    print(mgmt.credits.get_credits())  # data.total_credits, data.total_usage
```

Chat field access (`res.choices[0].message.content`, `event.choices[0].delta.content`) follows the wire schema ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)). The SDK pages themselves only print the result.

Sources: https://github.com/OpenRouterTeam/python-sdk, https://openrouter.ai/docs/client-sdks/python/overview, https://openrouter.ai/docs/client-sdks/overview, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README, https://openrouter.ai/docs/client-sdks/python/sdks/responses/README, https://openrouter.ai/docs/client-sdks/python/sdks/embeddings/README, https://openrouter.ai/docs/client-sdks/python/sdks/models/README, https://openrouter.ai/docs/client-sdks/python/sdks/files/README, https://openrouter.ai/docs/client-sdks/python/sdks/stt/README, https://openrouter.ai/docs/client-sdks/python/sdks/tts/README, https://openrouter.ai/docs/client-sdks/python/sdks/tools/README, https://openrouter.ai/docs/client-sdks/python/sdks/analytics/README, https://openrouter.ai/docs/client-sdks/python/sdks/apikeys/README, https://openrouter.ai/docs/client-sdks/python/sdks/credits/README, https://openrouter.ai/docs/client-sdks/python/sdks/decisions/README, https://openrouter.ai/docs/quickstart

### 3.5 Go SDK (`github.com/OpenRouterTeam/go-sdk`)

#### Install and import

Requirements and maturity:
- Go 1.26.10 or higher, as stated in the GitHub README.
- **Beta**: "Breaking changes may ship in minor `0.x` releases." Pin a module version in production and review `RELEASES.md` before upgrading.
- License: Apache-2.0.
- Runnable examples live under `examples/` in the repo (starting with `examples/chat`).

```bash
go get github.com/OpenRouterTeam/go-sdk
go get github.com/OpenRouterTeam/go-sdk@v0.9.116   # pinned (the README's example version)
```

```go
import (
	openrouter "github.com/OpenRouterTeam/go-sdk"        // client, Pointer helper
	"github.com/OpenRouterTeam/go-sdk/models/components" // request/response models, enums, unions
	"github.com/OpenRouterTeam/go-sdk/models/operations" // per-operation request/response/security types, Option
	"github.com/OpenRouterTeam/go-sdk/optionalnullable"  // optional+nullable wrapper
	"github.com/OpenRouterTeam/go-sdk/types"             // date/time helpers (types.Date, time parsing)
	"github.com/OpenRouterTeam/go-sdk/models/sdkerrors"  // typed API errors
	"github.com/OpenRouterTeam/go-sdk/retry"             // retry.Config, retry.BackoffStrategy
)
```

#### Client construction

```go
s := openrouter.New(
	openrouter.WithSecurity(os.Getenv("OPENROUTER_API_KEY")),
)
```

Client options (from the GitHub README):

| Option | Description |
| - | - |
| `openrouter.WithSecurity(apiKey string)` | Global `APIKey` scheme (HTTP Bearer). The README lists env var `OPENROUTER_API_KEY` for it. |
| `openrouter.WithServer(name string)` | Select the server by name. Only `production` (`https://openrouter.ai/api/v1`) exists. |
| `openrouter.WithServerURL(serverURL string)` | Override the default server URL for the client |
| `openrouter.WithRetryConfig(retry.Config)` | Default retry strategy for all operations that support retries |
| `openrouter.WithClient(client HTTPClient)` | Replace the default `net/http`-based client with anything implementing `Do(req *http.Request) (*http.Response, error)` |

- Timeouts: configure them on a custom HTTP client (`&http.Client{Timeout: 30 * time.Second}`) or per call through the required `ctx context.Context` (e.g. `context.WithTimeout`).
- There is **no attribution-header option**. The README calls a custom HTTP client "a convenient way to configure timeouts, cookies, proxies, custom headers, and other low-level configuration". See Custom HTTP client below for a header-injecting wrapper.

#### Method signatures

Pattern: `s.<Namespace>.<Method>(ctx, <args...>, opts ...operations.Option) (*<Response>, error)`.

- Path params are positional strings: `s.APIKeys.Get(ctx, hash)`, `s.Workspaces.GetBudget(ctx, "production", components.WorkspaceBudgetIntervalMonthly)`.
- Query params are positional pointers or `optionalnullable.OptionalNullable[T]`: `s.BYOK.List(ctx, offset, limit, workspaceID, provider)`.
- Some query-heavy methods take a request struct pointer instead (`nil` or e.g. `&operations.GetModelsRequest{}`): `Models.List`, `Models.ListForUser`, `Batch.List`, `Files.List`, `Benchmarks.GetBenchmarks`, the `Datasets.*` methods.
- Bodies are typed structs, e.g. `components.ChatRequest{...}`, `operations.CreateEmbeddingsRequest{...}`, `components.CreateBYOKKeyRequest{...}`.
- `Chat.Send`, `Responses.Send` and `Beta.Responses.Send` take a third argument, `xOpenRouterMetadata *components.MetadataLevel` (usually `nil`).
- Operation-level-security methods take the security struct right after `ctx`:
  - `s.Models.ListForUser(ctx, operations.ListModelsUserSecurity{Bearer: os.Getenv("OPENROUTER_BEARER")}, &operations.ListModelsUserRequest{})`
  - `s.Tools.ListTools(ctx, operations.ListToolsSecurity{Bearer: ...}, offset, limit, apiFormat)`
  - `s.Tools.GetTool(ctx, operations.GetToolSecurity{Bearer: ...}, "openrouter:web_search")`
  - The `Models.ListForUser` parameter table lists `request` before `security`, but the example passes security first. Follow the example; the GitHub README's Per-Operation Security example uses the same order.
- No-body deletes return only `error`: `err := s.ExternalUsers.Delete(ctx, "employee_123")`. The same applies to `Vault.DeleteVaultSecret` and `Vault.DeleteInternVaultSecret`.
- `opts ...operations.Option` ("The options for this request") exists on every method. Documented options:
  - `operations.WithRetries(retry.Config{...})`
  - `operations.WithServerURL(url)`, only for operations with their own server list (the alpha methods)

#### Value helpers (as used in the docs)

| Need | Helper |
| - | - |
| Optional scalar | `openrouter.Pointer("openai/gpt-5.4")`, `openrouter.Pointer[int64](50)`, `openrouter.Pointer[float64](1.0)`, `openrouter.Pointer(true)` |
| Optional **and** nullable field | `optionalnullable.From(openrouter.Pointer[float64](75.0))`; explicit null via `optionalnullable.From[[]string](nil)` / `optionalnullable.From[int64](nil)` |
| Enum constant → pointer | `components.FileProviderOpenai.ToPointer()`, `operations.WindowSevend.ToPointer()` |
| Date-time | `types.MustTimeFromString("2025-01-08T00:00:00Z")`, `types.MustNewTimeFromString("2027-12-31T23:59:59Z")` |
| Union constructors | `components.CreateChatMessagesUser(components.ChatUserMessage{...})`, `components.CreateChatMessagesSystem(...)`, `components.CreateChatUserMessageContentStr("...")`, `components.CreateChatSystemMessageContentStr("...")`, `components.CreateInputsUnionStr("...")` (Responses input), `operations.CreateInputUnionStr("...")` (embeddings input), `operations.CreateDocumentStr("...")` (rerank documents), `components.CreateSpeechInputStr("...")` (TTS), `components.CreateSTTInputAudioSTTInlineInputAudio(...)` (STT), `operations.CreateKeepMembersBoolean(false)` (SCIM delete), `components.CreateQuestionsNoul(...)` / `CreateQuestionsChoice` / `CreateQuestionsScore` (decisions) |
| Enum values | `components.ChatUserMessageRoleUser`, `components.ChatSystemMessageRoleSystem`, `components.WorkspaceBudgetIntervalMonthly`, `components.EndpointRootV1ChatCompletions` (batch endpoint), `components.BYOKProviderSlugOpenai`, … |

#### Union responses

Discriminated union responses are switched on `.Type`:

```go
switch res.Type {
case components.FileResponseTypeAnthropic:
	// res.AnthropicFile is populated
case components.FileResponseTypeOpenai:
	// res.OpenAIFile is populated
case components.FileResponseTypeOpenrouter:
	// res.OpenRouterFile is populated
default:
	// Unknown type - use res.GetUnknownRaw() for raw JSON
}
```

This is used by `Files.*`, `Containers.PromoteContainerFile` and `Observability.*`.

#### Streaming

```go
res, err := s.Chat.Send(ctx, req, nil)
if err != nil {
	log.Fatal(err)
}
if res != nil {
	defer res.ChatStreamingResponse.Close()
	for res.ChatStreamingResponse.Next() {
		event := res.ChatStreamingResponse.Value()
		log.Print(event)
	}
}
```

- Stream fields: `ChatStreamingResponse` (`Chat.Send`), `ResponsesStreamingResponse` (`Responses.Send`, `Beta.Responses.Send`), `ImageStreamingResponse` (`Images.Generate`).
- From the README: "These operations will expose the stream as an iterable that can be consumed using a simple `for` loop. The loop will terminate when the server no longer has any events to send and closes the underlying connection."
- The README examples iterate these fields without setting the stream flag. This includes the GitHub README's `Responses.Send` example, which passes `components.MetadataLevelEnabled.ToPointer()` as the metadata argument. Set the request's stream field to true.
- The name of the field that holds the **non-streaming** JSON result on these wrappers is not shown in the docs. Inspect `operations.SendChatCompletionRequestResponse` / `operations.CreateResponsesResponse` / `operations.CreateImagesResponse`.

#### Pagination

The response has a `Next` method; when it returns `nil`, there are no more pages.

```go
res, err := s.Models.List(ctx, &operations.GetModelsRequest{})
if err != nil {
	log.Fatal(err)
}
for res != nil {
	// handle items
	res, err = res.Next()
	if err != nil {
		// handle error
		break
	}
}
```

#### Uploads and binary downloads

```go
f, err := os.Open("report.pdf")
if err != nil {
	panic(err)
}
up, err := s.Files.Upload(ctx, operations.UploadFileRequestBody{
	File: operations.UploadFileFile{FileName: "report.pdf", Content: f},
}, nil /* workspaceID */, components.FileProviderOpenai.ToPointer() /* provider, optional */)

audio, err := s.TTS.CreateSpeech(ctx, components.SpeechRequest{
	Input: components.CreateSpeechInputStr("Hello world"),
	Model: "mistralai/voxtral-mini-tts-2603",
	Voice: openrouter.Pointer("en_paul_neutral"),
}) // audio is io.ReadCloser
```

- Multipart STT: `s.STT.CreateTranscriptionMultipart(ctx, operations.CreateAudioTranscriptionsMultipartRequest{File: &operations.CreateAudioTranscriptionsMultipartFile{FileName: "clip.wav", Content: f}, Model: "openai/whisper-large-v3"})`.
- Binary methods return `io.ReadCloser`. Close it after reading.

#### Error handling

- "All operations return a response object or an error, they will never return both."
- By default an API error is `*sdkerrors.APIError`. Operations with custom error responses may also return their typed errors (e.g. `*sdkerrors.UnauthorizedResponseError`); see each method's Errors table.
- The package is `github.com/OpenRouterTeam/go-sdk/models/sdkerrors`. Match with `errors.As`. Error values implement `Error()` (the README logs `e.Error()`).

```go
// import "github.com/OpenRouterTeam/go-sdk/models/sdkerrors"
res, err := s.Credits.GetCredits(ctx)
if err != nil {
	var forbidden *sdkerrors.ForbiddenResponseError
	var apiErr *sdkerrors.APIError
	switch {
	case errors.As(err, &forbidden):
		// management key required
	case errors.As(err, &apiErr):
		// other 4XX/5XX
	default:
		log.Fatal(err)
	}
}
_ = res
```

#### Retries

```go
import (
	"github.com/OpenRouterTeam/go-sdk/models/operations"
	"github.com/OpenRouterTeam/go-sdk/retry"
)

cfg := retry.Config{
	Strategy: "backoff",
	Backoff: &retry.BackoffStrategy{
		InitialInterval: 1,
		MaxInterval:     50,
		Exponent:        1.1,
		MaxElapsedTime:  100,
	},
	RetryConnectionErrors: false,
}

// Per call: override the default strategy for one request
res, err := s.Analytics.GetUserActivity(ctx, nil, nil, nil, nil, nil, operations.WithRetries(cfg))

// Whole client: default for every operation that supports retries
sRetry := openrouter.New(
	openrouter.WithRetryConfig(cfg),
	openrouter.WithSecurity(os.Getenv("OPENROUTER_API_KEY")),
)
```

- The values above are the README's illustrative numbers. Units are not stated; the spec's defaults are in milliseconds (500 / 60000 / 1.5 / 3600000).
- The README's per-call example imports `"models/operations"`. The real path is `github.com/OpenRouterTeam/go-sdk/models/operations`.
- With no configuration, the API's default strategy applies ([§3.2](#32-cross-sdk-conventions)).

#### Server selection

```go
s1 := openrouter.New(openrouter.WithServer("production"), openrouter.WithSecurity(key))                      // by name
s2 := openrouter.New(openrouter.WithServerURL("https://openrouter.ai/api/v1"), openrouter.WithSecurity(key)) // by URL

// Per operation, only where the operation declares a server list (alpha endpoints):
res, err := s.Alpha.Decisions.Create(ctx, decisionsReq, operations.WithServerURL("https://openrouter.ai"))
```

#### Custom HTTP client

```go
type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

httpClient := &http.Client{Timeout: 30 * time.Second}
sdkClient := openrouter.New(openrouter.WithClient(httpClient), openrouter.WithSecurity(os.Getenv("OPENROUTER_API_KEY")))
```

The wrapper below adds app-attribution headers, which have no dedicated Go option. It is built on the documented `HTTPClient` interface; the header names come from [§3.2](#32-cross-sdk-conventions).

```go
type attributionClient struct{ base *http.Client }

func (c attributionClient) Do(req *http.Request) (*http.Response, error) {
	req.Header.Set("HTTP-Referer", "https://myapp.example")
	req.Header.Set("X-OpenRouter-Title", "My App")
	return c.base.Do(req)
}

s := openrouter.New(
	openrouter.WithClient(attributionClient{base: &http.Client{Timeout: 30 * time.Second}}),
	openrouter.WithSecurity(os.Getenv("OPENROUTER_API_KEY")),
)
```

#### Special types

`types.Date` wraps `time.Time` and marshals to JSON as a `"2006-01-02"` date string:

```go
d1 := types.NewDate(time.Now())                    // *types.Date
d2 := types.DateFromTime(time.Now())               // types.Date
d3, err := types.NewDateFromString("2019-01-01")   // *types.Date, error
d4, err := types.DateFromString("2019-01-01")      // types.Date, error
d5 := types.MustNewDateFromString("2019-01-01")    // *types.Date, panics on error
d6 := types.MustDateFromString("2019-01-01")       // types.Date, panics on error
```

For date-time fields the method READMEs use `types.MustTimeFromString("2025-01-08T00:00:00Z")` and `types.MustNewTimeFromString(...)` (see Value helpers).

#### Worked examples (Go)

```go
package main

import (
	"context"
	"log"
	"os"

	openrouter "github.com/OpenRouterTeam/go-sdk"
	"github.com/OpenRouterTeam/go-sdk/models/components"
	"github.com/OpenRouterTeam/go-sdk/models/operations"
)

func main() {
	ctx := context.Background()
	s := openrouter.New(openrouter.WithSecurity(os.Getenv("OPENROUTER_API_KEY")))

	msgs := []components.ChatMessages{
		components.CreateChatMessagesUser(components.ChatUserMessage{
			Content: components.CreateChatUserMessageContentStr("What is the capital of France?"),
			Role:    components.ChatUserMessageRoleUser,
		}),
	}

	// 1) Chat completion, non-streaming
	chatRes, err := s.Chat.Send(ctx, components.ChatRequest{
		Model:    openrouter.Pointer("openai/gpt-5.2"),
		Messages: msgs,
	}, nil)
	if err != nil {
		log.Fatal(err)
	}
	_ = chatRes // non-streaming payload field not named in the docs; inspect operations.SendChatCompletionRequestResponse

	// 2) Chat completion, streaming
	streamRes, err := s.Chat.Send(ctx, components.ChatRequest{
		Model:    openrouter.Pointer("openai/gpt-5.2"),
		Messages: msgs,
		Stream:   openrouter.Pointer(true), // Go field for wire `stream`; pointer type assumed, verify
	}, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer streamRes.ChatStreamingResponse.Close()
	for streamRes.ChatStreamingResponse.Next() {
		log.Print(streamRes.ChatStreamingResponse.Value())
	}

	// 3) Responses API
	respRes, err := s.Responses.Send(ctx, components.ResponsesRequest{
		Model: openrouter.Pointer("openai/gpt-5.2"),
		Input: openrouter.Pointer(components.CreateInputsUnionStr("Explain quantum computing in one sentence.")),
	}, nil)
	if err != nil {
		log.Fatal(err)
	}
	_ = respRes

	// 4) Embeddings
	embRes, err := s.Embeddings.Generate(ctx, operations.CreateEmbeddingsRequest{
		Input: operations.CreateInputUnionStr("The quick brown fox jumps over the lazy dog"),
		Model: "openai/text-embedding-3-small",
	})
	if err != nil {
		log.Fatal(err)
	}
	_ = embRes

	// 5) List models (paginated)
	page, err := s.Models.List(ctx, &operations.GetModelsRequest{})
	for err == nil && page != nil {
		// handle page
		page, err = page.Next()
	}

	// 6) Current key (works with any key)
	keyRes, err := s.APIKeys.GetCurrentKeyMetadata(ctx)
	if err != nil {
		log.Fatal(err)
	}
	_ = keyRes

	// 7) Credits (management key)
	mgmt := openrouter.New(openrouter.WithSecurity(os.Getenv("OPENROUTER_MANAGEMENT_KEY")))
	credRes, err := mgmt.Credits.GetCredits(ctx)
	if err != nil {
		log.Fatal(err)
	}
	_ = credRes // wire fields: data.total_credits, data.total_usage
}
```

Sources: https://github.com/OpenRouterTeam/go-sdk, https://openrouter.ai/docs/client-sdks/go/overview, https://openrouter.ai/docs/client-sdks/go/sdks/chat/README, https://openrouter.ai/docs/client-sdks/go/sdks/responses/README, https://openrouter.ai/docs/client-sdks/go/sdks/images/README, https://openrouter.ai/docs/client-sdks/go/sdks/embeddings/README, https://openrouter.ai/docs/client-sdks/go/sdks/models/README, https://openrouter.ai/docs/client-sdks/go/sdks/files/README, https://openrouter.ai/docs/client-sdks/go/sdks/tts/README, https://openrouter.ai/docs/client-sdks/go/sdks/stt/README, https://openrouter.ai/docs/client-sdks/go/sdks/presets/README, https://openrouter.ai/docs/client-sdks/go/sdks/tools/README, https://openrouter.ai/docs/client-sdks/go/sdks/externalusers/README, https://openrouter.ai/docs/client-sdks/go/sdks/apikeys/README, https://openrouter.ai/docs/client-sdks/go/sdks/analytics/README, https://openrouter.ai/docs/client-sdks/go/sdks/credits/README

### 3.6 Method catalog (all resources)

This catalog covers every operation in every SDK README. One table per resource group.

How to read the columns:
- **TypeScript**: `openRouter.<ns>.<method>(<request-object keys>)`. The keys are the ones the README example uses. `()` means no required input. Optional query params go into the same object as camelCase keys (e.g. `{ offset, limit, workspaceId }`). Body keys (`requestBody`, `chatRequest`, …) wrap the JSON body.
- **Python**: `open_router.<ns>.<method>(kwargs)`. `*` marks a required kwarg. `…+N` means N more optional kwargs (full lists in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)–[§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)). The per-call `retries` and attribution kwargs are omitted.
- **Go**: `s.<Ns>.<Method>(ctx, positional args)`. The trailing `opts ...operations.Option` is omitted. `request` / `<x>Request` means a struct (or a struct pointer for query-only requests).
- **HTTP**: method and path relative to `https://openrouter.ai/api/v1`. The alpha paths are absolute on `https://openrouter.ai`.

What the Notes flags mean:
- **Mgmt key**: the README says a management key is required.
- **Paginated (type)**: an SDK page iterator exists ([§3.2](#32-cross-sdk-conventions)).
- **SSE stream**: the method returns an event stream when streaming is requested.
- **Binary response**: the method returns raw bytes.
- **Errors**: the typed status codes listed for the method. Every method also has the 4XX/5XX fallback class.

#### Analytics

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Get user activity grouped by endpoint | `analytics.getUserActivity()` | `analytics.get_user_activity(request*)` | `Analytics.GetUserActivity(ctx, date, apiKeyHash, userID, groupBy, workspaceID)` | `GET /activity` | **Mgmt key** · Last 30 completed UTC days, grouped by endpoint. Query: `date`, `api_key_hash`, `user_id`, `group_by` (`workspace` splits rows per workspace), `workspace_id`. Python takes a single `request` object; Go takes 5 positional optional pointers · Errors: 400,401,403,404,500 |
| Get available analytics metrics and dimensions | `analytics.getAnalyticsMeta()` | `analytics.get_analytics_meta()` | `Analytics.GetAnalyticsMeta(ctx)` | `GET /analytics/meta` | **Mgmt key** · Lists metrics, dimensions, filter operators and granularities usable by `queryAnalytics` · Errors: 401,403,500 |
| Query analytics data | `analytics.queryAnalytics({requestBody})` | `analytics.query_analytics(metrics*, classifier_dimensions, classifier_filters, dimensions, filters, granularity, group_limit, …+3)` | `Analytics.QueryAnalytics(ctx, request)` | `POST /analytics/query` | **Mgmt key** · Body: `metrics` (req), `dimensions`, `filters`, `classifier_dimensions`, `classifier_filters`, `granularity`, `group_limit`, `limit`, `order_by`, `time_range{start,end}` · Errors: 400,401,403,408,500 |

#### API Keys

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Get current API key | `apiKeys.getCurrentKeyMetadata()` | `api_keys.get_current_key_metadata()` | `APIKeys.GetCurrentKeyMetadata(ctx)` | `GET /key` | Works with a normal (inference) key; returns label, limit, limit_remaining, usage (daily/weekly/monthly), BYOK usage, budgets, `is_management_key`, workspace_id · Errors: 401,500 |
| List API keys | `apiKeys.list()` | `api_keys.list(include_disabled, offset, workspace_id)` | `APIKeys.List(ctx, includeDisabled, offset, workspaceID)` | `GET /keys` | **Mgmt key** · Paginated (offsetLimit) · Query: `include_disabled`, `offset`, `workspace_id`. Spec declares offset pagination but no README example iterates pages · Errors: 400,401,429,500 |
| Create a new API key | `apiKeys.create({requestBody})` | `api_keys.create(name*, creator_user_id, expires_at, external, include_byok_in_limit, limit, limit_reset, workspace_id)` | `APIKeys.Create(ctx, request)` | `POST /keys` | **Mgmt key** · Body: `name`, `limit`, `limit_reset`, `include_byok_in_limit`, `expires_at`, `workspace_id`, `creator_user_id`, `external`. Plaintext `key` is returned only in this response · Errors: 400,401,403,429,500 |
| Delete an API key | `apiKeys.delete({hash})` | `api_keys.delete(hash*)` | `APIKeys.Delete(ctx, hash)` | `DELETE /keys/{hash}` | **Mgmt key** · Path `hash` · Errors: 401,404,429,500 |
| Get a single API key | `apiKeys.get({hash})` | `api_keys.get(hash*)` | `APIKeys.Get(ctx, hash)` | `GET /keys/{hash}` | **Mgmt key** · Path `hash` · Errors: 401,404,429,500 |
| Update an API key | `apiKeys.update({hash, requestBody})` | `api_keys.update(hash*, disabled, include_byok_in_limit, limit, limit_reset, name)` | `APIKeys.Update(ctx, hash, requestBody)` | `PATCH /keys/{hash}` | **Mgmt key** · Path `hash`; body `name`, `disabled`, `limit`, `limit_reset`, `include_byok_in_limit` · Errors: 400,401,404,429,500 |

#### Batch

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List batches | `batch.list()` | `batch.list(limit, after, status, created_after, created_before)` | `Batch.List(ctx, request)` | `GET /batches` | Paginated (cursor) · Cursor pagination: pass previous page's `last_id` as `after`. Query: `limit`, `after`, `status`, `created_after`, `created_before`. Items omit `results` · Errors: 400,401,429,500,502 |
| Create a batch | `batch.createBatches({batchSubmitBody})` | `batch.create_batches(endpoint*, model*, requests*, callback_url, completion_window, provider)` | `Batch.CreateBatches(ctx, request)` | `POST /batches` | Body `endpoint` (`/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/embeddings`), `model`, `requests[{custom_id, body}]`, `callback_url`, `completion_window`, `provider`. Returns 202 `status: "validating"`. Retry override: 429 only, no connection-error retries · Errors: 400,401,402,403,404,413,422,429,500,502 |
| Delete a batch | `batch.delete({id})` | `batch.delete(id*)` | `Batch.Delete(ctx, id)` | `DELETE /batches/{id}` | Only terminal batches (`completed`/`failed`/`expired`/`cancelled`); in-progress returns 409 · Errors: 401,404,409,429,500,502 |
| Get a batch | `batch.getBatches({id})` | `batch.get_batches(id*)` | `Batch.GetBatches(ctx, id)` | `GET /batches/{id}` | Terminal batches include `results`; failures in `error.message` · Errors: 402,401,404,410,429,500,502 |

#### Benchmarks

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List Benchmarks | `benchmarks.getBenchmarks()` | `benchmarks.get_benchmarks(source, task_type, benchmark_type, include_run_config, search_engine, search_surface, …+3)` | `Benchmarks.GetBenchmarks(ctx, request)` | `GET /benchmarks` | Query: `source`, `task_type`, `benchmark_type`, `include_run_config`, `search_engine`, `search_surface`, `arena`, `category`, `max_results` · Errors: 400,401,429,500 |

#### Beta.Responses (DEPRECATED alias of Responses)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Create a response | `beta.responses.send({responsesRequest})` | `beta.responses.send(x_open_router_metadata, access_programs, background, cache_control, debug, deferred_tools, …+36)` | `Beta.Responses.Send(ctx, responsesRequest, xOpenRouterMetadata)` | `POST /responses` | SSE stream when `stream: true` · DEPRECATED alias · Same as `responses.send`; scheduled for removal (sunset TBD) · Errors: 400,401,402,403,404,408,413,422,429,500,502,503,524,529 |

#### BYOK

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List BYOK provider credentials | `byok.list()` | `byok.list(offset, limit, workspace_id, provider)` | `BYOK.List(ctx, offset, limit, workspaceID, provider)` | `GET /byok` | **Mgmt key** · Paginated (offsetLimit) · Query `offset`, `limit`, `workspace_id`, `provider` · Errors: 400,401,403,500 |
| Create a BYOK provider credential | `byok.create({createBYOKKeyRequest})` | `byok.create(key*, provider*, allowed_api_key_hashes, allowed_models, allowed_user_ids, declared_region, declared_zdr, disabled, …+5)` | `BYOK.Create(ctx, request)` | `POST /byok` | **Mgmt key** · Body `key`*, `provider`*, `name`, `workspace_id`, `allowed_api_key_hashes`, `allowed_models`, `allowed_user_ids`, `is_fallback`, `is_byok_only`, `is_required`, `declared_region`, `declared_zdr`, `disabled`. Raw key never returned · Errors: 400,401,403,500 |
| Delete a BYOK provider credential | `byok.delete({id})` | `byok.delete(id*)` | `BYOK.Delete(ctx, id)` | `DELETE /byok/{id}` | **Mgmt key** · Soft delete; key material wiped · Errors: 401,403,404,500 |
| Get a BYOK provider credential | `byok.get({id})` | `byok.get(id*)` | `BYOK.Get(ctx, id)` | `GET /byok/{id}` | **Mgmt key** · Errors: 401,403,404,500 |
| Update a BYOK provider credential | `byok.update({id, updateBYOKKeyRequest})` | `byok.update(id*, allowed_api_key_hashes, allowed_models, allowed_user_ids, declared_region, declared_zdr, disabled, …+5)` | `BYOK.Update(ctx, id, updateBYOKKeyRequest)` | `PATCH /byok/{id}` | **Mgmt key** · Include `key` to rotate in place; `allowed_api_key_hashes: null` clears restriction · Errors: 400,401,403,404,409,500 |

#### Chat

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Create a chat completion | `chat.send({chatRequest})` | `chat.send(messages*, x_open_router_metadata, cache_control, debug, deferred_tools, frequency_penalty, image_config, …+36)` | `Chat.Send(ctx, chatRequest, xOpenRouterMetadata)` | `POST /chat/completions` | SSE stream when `stream: true` · Body `messages`* plus `model`/`models`, `stream`, `stream_options`, `tools`, `tool_choice`, `response_format`, `reasoning`, `provider`, `plugins`, `temperature`… (see [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)). `stream: true` returns an SSE event stream. Extra header param `X-OpenRouter-Metadata` (`xOpenRouterMetadata` / `x_open_router_metadata`) · Errors: 400,401,402,403,404,408,413,422,429,500,502,503,524,529 |

#### Classifications

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Task classification market share | `classifications.getTaskClassifications()` | `classifications.get_task_classifications(window)` | `Classifications.GetTaskClassifications(ctx, window)` | `GET /classifications/task` | Query `window` (Go enum e.g. `operations.WindowSevend`) · Errors: 400,401,429,500 |

#### Containers

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List container files | `containers.listContainerFiles({containerId})` | `containers.list_container_files(container_id*, limit, after)` | `Containers.ListContainerFiles(ctx, containerID, limit, after)` | `GET /containers/{container_id}/files` | Path `container_id`; `limit`, `after` (pass previous `last_id`). Manual cursor paging (no SDK iterator) · Errors: 400,401,403,429,500,503 |
| Retrieve a container file | `containers.getContainerFile({containerId, fileId})` | `containers.get_container_file(container_id*, file_id*)` | `Containers.GetContainerFile(ctx, containerID, fileID)` | `GET /containers/{container_id}/files/{file_id}` | Path `container_id`, `file_id` · Errors: 400,401,403,404,429,500,503 |
| Download container file content | `containers.downloadContainerFileContent({containerId, fileId})` | `containers.download_container_file_content(container_id*, file_id*)` | `Containers.DownloadContainerFileContent(ctx, containerID, fileID)` | `GET /containers/{container_id}/files/{file_id}/content` | Binary response · Raw bytes · Errors: 400,401,403,404,429,500,503 |
| Promote a container file into workspace documents | `containers.promoteContainerFile({containerId, fileId})` | `containers.promote_container_file(container_id*, file_id*)` | `Containers.PromoteContainerFile(ctx, containerID, fileID)` | `POST /containers/{container_id}/files/{file_id}/promote` | Copies a sandbox file into durable workspace documents; returns Files API shape · Errors: 400,401,403,404,413,429,499,500,503 |

#### Credits

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Get remaining credits | `credits.getCredits()` | `credits.get_credits()` | `Credits.GetCredits(ctx)` | `GET /credits` | **Mgmt key** · Returns `data.total_credits`, `data.total_usage` · Errors: 401,403,500 |

#### Datasets

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Top apps by token usage | `datasets.getAppRankings()` | `datasets.get_app_rankings(category, subcategory, sort, start_date, end_date, limit, offset)` | `Datasets.GetAppRankings(ctx, request)` | `GET /datasets/app-rankings` | Paginated (offsetLimit) · Query `category`, `subcategory`, `sort`, `start_date`, `end_date`, `limit`, `offset`. CC BY 4.0 data · Errors: 400,401,429,500 |
| Daily token totals for top 50 models | `datasets.getRankingsDaily()` | `datasets.get_rankings_daily(start_date, end_date, period, modality, context_bucket, category, language_type)` | `Datasets.GetRankingsDaily(ctx, request)` | `GET /datasets/rankings-daily` | Query `start_date`, `end_date`, `period`, `modality`, `context_bucket`, `category`, `language_type` · Errors: 400,401,429,500 |
| Cost per session by harness and model | `datasets.getSessionCost()` | `datasets.get_session_cost(app_slug, model, turn_range, limit, offset)` | `Datasets.GetSessionCost(ctx, request)` | `GET /datasets/session-cost` | Paginated (offsetLimit) · Query `app_slug`, `model`, `turn_range`, `limit`, `offset` · Errors: 400,401,429,500 |

#### Alpha.Decisions (ALPHA)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Submit a Decisions request | `alpha.decisions.create({decisionsRequest})` | `alpha.decisions.create(model*, questions*, state*, assets, provider, session_id, trace, user, server_url)` | `Alpha.Decisions.Create(ctx, request)` | `POST /api/alpha/decisions` | ALPHA · Body `model`*, `questions`* (`noul`/`choice`/`score`/`box`), `state`*, `assets`, `provider`, `session_id`, `trace`, `user`. Served from `https://openrouter.ai/api/alpha/...` (not `/api/v1`); per-call `serverURL`/`server_url` override. Shape may change · Errors: 400,401,402,403,404,413,429,500,502,503,524,529 |

#### Embeddings

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Submit an embedding request | `embeddings.generate({requestBody})` | `embeddings.generate(input*, model*, dimensions, encoding_format, input_type, provider, session_id, trace, user)` | `Embeddings.Generate(ctx, request)` | `POST /embeddings` | Body `input`*, `model`*, `dimensions`, `encoding_format`, `input_type`, `provider`, `session_id`, `trace`, `user` · Errors: 400,401,402,403,404,408,413,429,499,500,502,503,504,524,529 |
| List all embeddings models | `embeddings.listModels()` | `embeddings.list_models(offset, limit)` | `Embeddings.ListModels(ctx, offset, limit)` | `GET /embeddings/models` | Paginated (offsetLimit) · `offset`, `limit` · Errors: 400,500 |

#### Endpoints

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Preview the impact of ZDR on the available endpoints | `endpoints.listZdrEndpoints()` | `endpoints.list_zdr_endpoints()` | `Endpoints.ListZdrEndpoints(ctx)` | `GET /endpoints/zdr` | Errors: 403,500,503 |
| List all endpoints for a model | `endpoints.list({author, slug})` | `endpoints.list(author*, slug*)` | `Endpoints.List(ctx, author, slug)` | `GET /models/{author}/{slug}/endpoints` | Path `author`, `slug` (model endpoints) · Errors: 403,404,500,503 |

#### EndUsers (DEPRECATED alias of ExternalUsers, TypeScript only)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List registered external users | `endUsers.list()` | — | — | `GET /external-users` | **Mgmt key** · Paginated (offsetLimit) · DEPRECATED alias · Use `externalUsers.list` · Errors: 400,401,403,404,500 |
| Register an external user | `endUsers.create({createExternalUserRequest})` | — | — | `POST /external-users` | **Mgmt key** · DEPRECATED alias · Use `externalUsers.create` · Errors: 400,401,404,409,500 |
| Deactivate a registered external user | `endUsers.delete({user})` | — | — | `DELETE /external-users/{user}` | **Mgmt key** · No response body · DEPRECATED alias · Use `externalUsers.delete` · Errors: 400,401,404,500 |
| Get a registered external user | `endUsers.get({user})` | — | — | `GET /external-users/{user}` | **Mgmt key** · DEPRECATED alias · Use `externalUsers.get` · Errors: 400,401,403,404,500 |
| Update a registered external user | `endUsers.update({user, updateExternalUserRequest})` | — | — | `PATCH /external-users/{user}` | **Mgmt key** · DEPRECATED alias · Use `externalUsers.update` · Errors: 400,401,404,500 |

#### External Users

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List registered external users | `externalUsers.list()` | `external_users.list(offset, limit, user, include_inactive)` | `ExternalUsers.List(ctx, offset, limit, user, includeInactive)` | `GET /external-users` | **Mgmt key** · Paginated (offsetLimit) · Query `offset`, `limit`, `user`, `include_inactive` (inactive excluded by default) · Errors: 400,401,403,404,500 |
| Register an external user | `externalUsers.create({createExternalUserRequest})` | `external_users.create(user*)` | `ExternalUsers.Create(ctx, request)` | `POST /external-users` | **Mgmt key** · Body `user`* (caller-supplied tracking ID). No account/credentials created · Errors: 400,401,404,409,500 |
| Deactivate a registered external user | `externalUsers.delete({user})` | `external_users.delete(user*)` | `ExternalUsers.Delete(ctx, user)` | `DELETE /external-users/{user}` | **Mgmt key** · No response body · Soft-deactivate (tracking ID retained); does not block inference; reactivate via update · Errors: 400,401,404,500 |
| Get a registered external user | `externalUsers.get({user})` | `external_users.get(user*)` | `ExternalUsers.Get(ctx, user)` | `GET /external-users/{user}` | **Mgmt key** · Path `user` (URL-encoded tracking ID) · Errors: 400,401,403,404,500 |
| Update a registered external user | `externalUsers.update({user, updateExternalUserRequest})` | `external_users.update(user*, is_active*)` | `ExternalUsers.Update(ctx, user, updateExternalUserRequest)` | `PATCH /external-users/{user}` | **Mgmt key** · Body `is_active`* · Errors: 400,401,404,500 |

#### Alpha.Extractions (ALPHA)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Submit an Extractions request | `alpha.extractions.create({extractionsRequest})` | `alpha.extractions.create(fields*, model*, state*, assets, provider, reference_date, session_id, trace, user, server_url)` | `Alpha.Extractions.Create(ctx, request)` | `POST /api/alpha/extractions` | ALPHA · Body `fields`*, `model`*, `state`*, `assets`, `reference_date`, `provider`, `session_id`, `trace`, `user`. Served from `https://openrouter.ai/api/alpha/...`; per-call server override. Shape not stable · Errors: 400,401,402,403,404,413,429,500,502,503,524,529 |

#### Files

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List files | `files.list()` | `files.list(limit, cursor, workspace_id, provider, after, after_id, …+2)` | `Files.List(ctx, request)` | `GET /files` | Paginated (cursor) · Cursor pagination via `cursor`; also `limit`, `workspace_id`, `provider`, `after`, `after_id`, `before_id`, `order`. Response union discriminated by `_shape` (TS field `shape`) · Errors: 400,401,403,429,500,502,503 |
| Upload a file | `files.upload({provider, requestBody})` | `files.upload(file*, workspace_id, provider)` | `Files.Upload(ctx, requestBody, workspaceID, provider)` | `POST /files` | Multipart `file`*; `workspace_id`, `provider` (store on provider with your own key). Max 100 MB; type sniffed from content · Errors: 400,401,403,413,429,499,500,502,503 |
| Delete a file | `files.delete({fileId, provider})` | `files.delete(file_id*, workspace_id, provider)` | `Files.Delete(ctx, fileID, workspaceID, provider)` | `DELETE /files/{file_id}` | Irreversible. Response union discriminated by `_shape` (TS `shape`) · Errors: 401,403,404,429,500,502,503 |
| Get file metadata | `files.retrieve({fileId, provider})` | `files.retrieve(file_id*, workspace_id, provider)` | `Files.Retrieve(ctx, fileID, workspaceID, provider)` | `GET /files/{file_id}` | Metadata only · Errors: 401,403,404,429,500,502,503 |
| Download file content | `files.download({fileId, provider})` | `files.download(file_id*, workspace_id, provider)` | `Files.Download(ctx, fileID, workspaceID, provider)` | `GET /files/{file_id}/content` | Binary response · Raw bytes; only server-created files (uploaded files return 400) · Errors: 400,401,403,404,429,500,502,503 |

#### Generations

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Get request & usage metadata for a generation | `generations.getGeneration({id})` | `generations.get_generation(id*)` | `Generations.GetGeneration(ctx, id)` | `GET /generation` | Query `id` · Errors: 400,401,402,403,404,429,500,502,524,529 |
| Get stored prompt, completion, and error content for a generation | `generations.listGenerationContent({id})` | `generations.list_generation_content(id*)` | `Generations.ListGenerationContent(ctx, id)` | `GET /generation/content` | Query `id`; stored prompt/completion/error content · Errors: 400,401,403,404,429,500,502,524,529 |
| Submit feedback for a generation | `generations.submitFeedback({submitGenerationFeedbackRequest})` | `generations.submit_feedback(category*, generation_id*, comment)` | `Generations.SubmitFeedback(ctx, request)` | `POST /generation/feedback` | **Mgmt key** · Body `generation_id`*, `category`*, `comment` · Errors: 400,401,403,404,409,429,500,503 |

#### Guardrail Policies (TypeScript + Python only; not in Go)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List workspace-wide policies | `guardrailPolicies.listAccountPolicies()` | `guardrail_policies.list_account_policies(offset, limit)` | — | `GET /guardrails/policies/account` | **Mgmt key** · Paginated (offsetLimit) · Workspace-wide (account) policies · Errors: 400,401,403,404,500 |
| Create a workspace-wide policy | `guardrailPolicies.createAccountPolicy({accountGuardrailPolicyRequest})` | `guardrail_policies.create_account_policy(account_guardrail_policy_request*)` | — | `POST /guardrails/policies/account` | **Mgmt key** · Body `account_guardrail_policy_request` (`policy_type` budget/moderation/model_availability, `name`, `config`) · Errors: 400,401,403,404,409,500 |
| Delete a workspace-wide policy | `guardrailPolicies.deleteAccountPolicy({id})` | `guardrail_policies.delete_account_policy(id*)` | — | `DELETE /guardrails/policies/account/{id}` | **Mgmt key** · Errors: 400,401,403,404,409,500 |
| Update a workspace-wide policy | `guardrailPolicies.updateAccountPolicy({id, accountGuardrailPolicyRequest})` | `guardrail_policies.update_account_policy(id*, account_guardrail_policy_request*)` | — | `PUT /guardrails/policies/account/{id}` | **Mgmt key** · PUT replace incl. workspace coverage · Errors: 400,401,403,404,409,500 |
| Get an API key policy assignment | `guardrailPolicies.getApiKeyPolicyAssignment({hash, workspaceId, policyType})` | `guardrail_policies.get_api_key_policy_assignment(hash*, workspace_id*, policy_type*)` | — | `GET /guardrails/policies/assignments/api-keys/{hash}` | **Mgmt key** · Query `workspace_id`*, `policy_type`*. Needs management key with write access · Errors: 400,401,403,404,500 |
| Change an API key policy assignment | `guardrailPolicies.changeApiKeyPolicyAssignment({hash, changeGuardrailPolicyAssignmentRequest})` | `guardrail_policies.change_api_key_policy_assignment(hash*, assigned*, expected_assignment*, policy_id*, policy_type*, workspace_id*)` | — | `PUT /guardrails/policies/assignments/api-keys/{hash}` | **Mgmt key** · Body `assigned`, `expected_assignment`, `policy_id`, `policy_type`, `workspace_id`; 409 when `expected_assignment` is stale · Errors: 400,401,403,404,409,500 |
| Get a member policy assignment | `guardrailPolicies.getMemberPolicyAssignment({memberId, workspaceId, policyType})` | `guardrail_policies.get_member_policy_assignment(member_id*, workspace_id*, policy_type*)` | — | `GET /guardrails/policies/assignments/members/{member_id}` | **Mgmt key** · Query `workspace_id`*, `policy_type`* · Errors: 400,401,403,404,500 |
| Change a member policy assignment | `guardrailPolicies.changeMemberPolicyAssignment({memberId, changeGuardrailPolicyAssignmentRequest})` | `guardrail_policies.change_member_policy_assignment(member_id*, assigned*, expected_assignment*, policy_id*, policy_type*, workspace_id*)` | — | `PUT /guardrails/policies/assignments/members/{member_id}` | **Mgmt key** · Same body as API-key variant; 409 on stale `expected_assignment` · Errors: 400,401,403,404,409,500 |
| List budget policies | `guardrailPolicies.listBudgetPolicies({workspaceId})` | `guardrail_policies.list_budget_policies(workspace_id*, offset, limit)` | — | `GET /guardrails/policies/budget` | **Mgmt key** · Paginated (offsetLimit) · Query `workspace_id`* · Errors: 400,401,403,404,500 |
| Create a budget policy | `guardrailPolicies.createBudgetPolicy({createBudgetGuardrailPolicyRequest})` | `guardrail_policies.create_budget_policy(config*, name*, policy_type*, workspace_id*, api_key_hashes, is_workspace_default, member_ids, opted_out_api_key_hashes, opted_out_member_ids)` | — | `POST /guardrails/policies/budget` | **Mgmt key** · Body `config`*, `name`*, `policy_type`*, `workspace_id`*, assignment lists · Errors: 400,401,403,404,409,500 |
| Delete a budget policy | `guardrailPolicies.deleteBudgetPolicy({id, workspaceId})` | `guardrail_policies.delete_budget_policy(id*, workspace_id*)` | — | `DELETE /guardrails/policies/budget/{id}` | **Mgmt key** · Query `workspace_id`* · Errors: 400,401,403,404,409,500 |
| Get a budget policy | `guardrailPolicies.getBudgetPolicy({id, workspaceId})` | `guardrail_policies.get_budget_policy(id*, workspace_id*)` | — | `GET /guardrails/policies/budget/{id}` | **Mgmt key** · Includes member and API-key assignments · Errors: 400,401,403,404,500 |
| Update a budget policy | `guardrailPolicies.updateBudgetPolicy({id, updateBudgetGuardrailPolicyRequest})` | `guardrail_policies.update_budget_policy(id*, config*, name*, workspace_id*, api_key_hashes, is_workspace_default, member_ids, opted_out_api_key_hashes, opted_out_member_ids)` | — | `PUT /guardrails/policies/budget/{id}` | **Mgmt key** · PUT replace name/config (+ optional assignments) · Errors: 400,401,403,404,409,500 |
| List model availability policies | `guardrailPolicies.listModelAvailabilityPolicies({workspaceId})` | `guardrail_policies.list_model_availability_policies(workspace_id*, offset, limit)` | — | `GET /guardrails/policies/model-availability` | **Mgmt key** · Paginated (offsetLimit) · Query `workspace_id`* · Errors: 400,401,403,404,500 |
| Create a model availability policy | `guardrailPolicies.createModelAvailabilityPolicy({createModelAvailabilityGuardrailPolicyRequest})` | `guardrail_policies.create_model_availability_policy(config*, name*, policy_type*, workspace_id*, api_key_hashes, is_workspace_default, member_ids, opted_out_api_key_hashes, opted_out_member_ids)` | — | `POST /guardrails/policies/model-availability` | **Mgmt key** · Errors: 400,401,403,404,409,500 |
| Delete a model availability policy | `guardrailPolicies.deleteModelAvailabilityPolicy({id, workspaceId})` | `guardrail_policies.delete_model_availability_policy(id*, workspace_id*)` | — | `DELETE /guardrails/policies/model-availability/{id}` | **Mgmt key** · Errors: 400,401,403,404,409,500 |
| Get a model availability policy | `guardrailPolicies.getModelAvailabilityPolicy({id, workspaceId})` | `guardrail_policies.get_model_availability_policy(id*, workspace_id*)` | — | `GET /guardrails/policies/model-availability/{id}` | **Mgmt key** · Errors: 400,401,403,404,500 |
| Update a model availability policy | `guardrailPolicies.updateModelAvailabilityPolicy({id, updateModelAvailabilityGuardrailPolicyRequest})` | `guardrail_policies.update_model_availability_policy(id*, config*, name*, workspace_id*, api_key_hashes, is_workspace_default, member_ids, opted_out_api_key_hashes, opted_out_member_ids)` | — | `PUT /guardrails/policies/model-availability/{id}` | **Mgmt key** · PUT replace · Errors: 400,401,403,404,409,500 |
| List moderation policies | `guardrailPolicies.listModerationPolicies({workspaceId})` | `guardrail_policies.list_moderation_policies(workspace_id*, offset, limit)` | — | `GET /guardrails/policies/moderation` | **Mgmt key** · Paginated (offsetLimit) · Query `workspace_id`* · Errors: 400,401,403,404,500 |
| Create a moderation policy | `guardrailPolicies.createModerationPolicy({createModerationGuardrailPolicyRequest})` | `guardrail_policies.create_moderation_policy(config*, name*, policy_type*, workspace_id*, api_key_hashes, is_workspace_default, member_ids, opted_out_api_key_hashes, opted_out_member_ids)` | — | `POST /guardrails/policies/moderation` | **Mgmt key** · Errors: 400,401,403,404,409,500 |
| Delete a moderation policy | `guardrailPolicies.deleteModerationPolicy({id, workspaceId})` | `guardrail_policies.delete_moderation_policy(id*, workspace_id*)` | — | `DELETE /guardrails/policies/moderation/{id}` | **Mgmt key** · Errors: 400,401,403,404,409,500 |
| Get a moderation policy | `guardrailPolicies.getModerationPolicy({id, workspaceId})` | `guardrail_policies.get_moderation_policy(id*, workspace_id*)` | — | `GET /guardrails/policies/moderation/{id}` | **Mgmt key** · Errors: 400,401,403,404,500 |
| Update a moderation policy | `guardrailPolicies.updateModerationPolicy({id, updateModerationGuardrailPolicyRequest})` | `guardrail_policies.update_moderation_policy(id*, config*, name*, workspace_id*, api_key_hashes, is_workspace_default, member_ids, opted_out_api_key_hashes, opted_out_member_ids)` | — | `PUT /guardrails/policies/moderation/{id}` | **Mgmt key** · PUT replace · Errors: 400,401,403,404,409,500 |

#### Guardrails

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List guardrails | `guardrails.list()` | `guardrails.list(offset, limit, workspace_id)` | `Guardrails.List(ctx, offset, limit, workspaceID)` | `GET /guardrails` | **Mgmt key** · Paginated (offsetLimit) · `offset`, `limit`, `workspace_id` · Errors: 400,401,403,500 |
| Create a guardrail | `guardrails.create({createGuardrailRequest})` | `guardrails.create(name*, allow_safety_retention_google, allow_safety_retention_other, allowed_data_regions, allowed_models, allowed_providers, content_filter_builtins, …+18)` | `Guardrails.Create(ctx, request)` | `POST /guardrails` | **Mgmt key** · Body `name`* + limits (`limit_usd`, `reset_interval`), provider/model allow/ignore lists, `allowed_data_regions`, `enforce_zdr_*`, content filters… Enforces nothing until assigned to keys/members · Errors: 400,401,403,500 |
| Delete a guardrail | `guardrails.delete({id})` | `guardrails.delete(id*)` | `Guardrails.Delete(ctx, id)` | `DELETE /guardrails/{id}` | **Mgmt key** · Errors: 401,403,404,500 |
| Get a guardrail | `guardrails.get({id})` | `guardrails.get(id*)` | `Guardrails.Get(ctx, id)` | `GET /guardrails/{id}` | **Mgmt key** · Errors: 401,403,404,500 |
| Update a guardrail | `guardrails.update({id, updateGuardrailRequest})` | `guardrails.update(id*, allow_safety_retention_google, allow_safety_retention_other, allowed_data_regions, allowed_models, allowed_providers, content_filter_builtins, …+18)` | `Guardrails.Update(ctx, id, updateGuardrailRequest)` | `PATCH /guardrails/{id}` | **Mgmt key** · Collection fields use replace semantics (send the full set) · Errors: 400,401,403,404,409,500 |
| List key assignments for a guardrail | `guardrails.listGuardrailKeyAssignments({id})` | `guardrails.list_guardrail_key_assignments(id*, offset, limit)` | `Guardrails.ListGuardrailKeyAssignments(ctx, id, offset, limit)` | `GET /guardrails/{id}/assignments/keys` | **Mgmt key** · Paginated (offsetLimit) · Errors: 401,403,404,500 |
| Bulk assign keys to a guardrail | `guardrails.bulkAssignKeys({id, bulkAssignKeysRequest})` | `guardrails.bulk_assign_keys(id*, key_hashes*)` | `Guardrails.BulkAssignKeys(ctx, id, bulkAssignKeysRequest)` | `POST /guardrails/{id}/assignments/keys` | **Mgmt key** · Body `key_hashes`*. A key holds at most one guardrail (replaces) · Errors: 400,401,403,404,500 |
| Bulk unassign keys from a guardrail | `guardrails.bulkUnassignKeys({id, bulkUnassignKeysRequest})` | `guardrails.bulk_unassign_keys(id*, key_hashes*)` | `Guardrails.BulkUnassignKeys(ctx, id, bulkUnassignKeysRequest)` | `POST /guardrails/{id}/assignments/keys/remove` | **Mgmt key** · Body `key_hashes`* · Errors: 400,401,403,404,500 |
| List member assignments for a guardrail | `guardrails.listGuardrailMemberAssignments({id})` | `guardrails.list_guardrail_member_assignments(id*, offset, limit)` | `Guardrails.ListGuardrailMemberAssignments(ctx, id, offset, limit)` | `GET /guardrails/{id}/assignments/members` | **Mgmt key** · Paginated (offsetLimit) · Errors: 401,403,404,500 |
| Bulk assign members to a guardrail | `guardrails.bulkAssignMembers({id, bulkAssignMembersRequest})` | `guardrails.bulk_assign_members(id*, member_user_ids*)` | `Guardrails.BulkAssignMembers(ctx, id, bulkAssignMembersRequest)` | `POST /guardrails/{id}/assignments/members` | **Mgmt key** · Body `member_user_ids`* · Errors: 400,401,403,404,500 |
| Bulk unassign members from a guardrail | `guardrails.bulkUnassignMembers({id, bulkUnassignMembersRequest})` | `guardrails.bulk_unassign_members(id*, member_user_ids*)` | `Guardrails.BulkUnassignMembers(ctx, id, bulkUnassignMembersRequest)` | `POST /guardrails/{id}/assignments/members/remove` | **Mgmt key** · Body `member_user_ids`* · Errors: 400,401,403,404,500 |
| List all key assignments | `guardrails.listKeyAssignments()` | `guardrails.list_key_assignments(offset, limit)` | `Guardrails.ListKeyAssignments(ctx, offset, limit)` | `GET /guardrails/assignments/keys` | **Mgmt key** · Paginated (offsetLimit) · All key assignments across guardrails · Errors: 400,401,403,404,500 |
| List all member assignments | `guardrails.listMemberAssignments()` | `guardrails.list_member_assignments(offset, limit)` | `Guardrails.ListMemberAssignments(ctx, offset, limit)` | `GET /guardrails/assignments/members` | **Mgmt key** · Paginated (offsetLimit) · All member assignments across guardrails · Errors: 400,401,403,404,500 |

#### Images

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Generate an image | `images.generate({imageGenerationRequest})` | `images.generate(model*, prompt*, aspect_ratio, background, frame_count, frame_duration_ms, input_references, markup, …+12)` | `Images.Generate(ctx, request)` | `POST /images` | SSE stream when `stream: true` · Body `model`*, `prompt`*, `n`, `size`, `aspect_ratio`, `resolution`, `quality`, `output_format`, `background`, `input_references`, `seed`, `stream`… Streams partial images when `stream` is set (Go `ImageStreamingResponse`) · Errors: 400,401,402,403,404,413,429,500,502,524,529 |
| List image generation models | `images.listModels()` | `images.list_models()` | `Images.ListModels(ctx)` | `GET /images/models` | Errors: 500 |
| List endpoints for an image model | `images.listModelEndpoints({author, slug})` | `images.list_model_endpoints(author*, slug*)` | `Images.ListModelEndpoints(ctx, author, slug)` | `GET /images/models/{author}/{slug}/endpoints` | Path `author`, `slug` · Errors: 404,500 |

#### Models

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Get a model by its slug | `models.get({author, slug})` | `models.get(author*, slug*)` | `Models.Get(ctx, author, slug)` | `GET /model/{author}/{slug}` | Path `author`, `slug`; supports variant suffixes (`:free`) and slug aliases · Errors: 403,404,500 |
| List all models and their properties | `models.list()` | `models.list(offset, limit, category, supported_parameters, output_modalities, sort, …+24)` | `Models.List(ctx, request)` | `GET /models` | Paginated (offsetLimit) · Many filters: `category`, `supported_parameters`, `input_modalities`, `output_modalities`, `sort`, `q`, price/age/intelligence/coding/agentic index ranges, `providers`, `zdr`, `region`… (see [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)) · Errors: 400,401,403,404,408,409,429,500,503 |
| Get total count of available models | `models.count()` | `models.count(output_modalities)` | `Models.Count(ctx, outputModalities)` | `GET /models/count` | Query `output_modalities` · Errors: 400,403,500 |
| List models filtered by user provider preferences, privacy settings, and guardrails | `models.listForUser({bearer})` | `models.list_for_user(security*, offset, limit, output_modalities, sort, client)` | `Models.ListForUser(ctx, security, request)` (order per README example; its param table lists request first) | `GET /models/user` | Paginated (offsetLimit) · Operation-level `bearer` security passed per call (`{ bearer }` / `security=operations.ListModelsUserSecurity(bearer=...)` / `operations.ListModelsUserSecurity{Bearer: ...}`). Query `offset`, `limit`, `output_modalities`, `sort`, `client` · Errors: 401,403,404,408,409,429,500,503 |

#### OAuth

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Exchange authorization code for API key | `oAuth.exchangeAuthCodeForAPIKey({requestBody})` | `o_auth.exchange_auth_code_for_api_key(code*, code_challenge_method, code_verifier)` | `OAuth.ExchangeAuthCodeForAPIKey(ctx, request)` | `POST /auth/keys` | Body `code`*, `code_verifier`, `code_challenge_method` (`S256`). PKCE step 2 · Errors: 400,403,500 |
| Create authorization code | `oAuth.createAuthCode({requestBody})` | `o_auth.create_auth_code(callback_url*, code_challenge, code_challenge_method, expires_at, key_label, limit, usage_limit_type, workspace_id)` | `OAuth.CreateAuthCode(ctx, request)` | `POST /auth/keys/code` | Body `callback_url`*, `code_challenge`, `code_challenge_method`, `limit`, `usage_limit_type`, `expires_at`, `key_label`, `workspace_id` · Errors: 400,401,403,409,500 |
| OpenRouter access token signing keys | `oAuth.listOauthJwks()` | `o_auth.list_oauth_jwks()` | `OAuth.ListOauthJwks(ctx)` | `GET /oauth/jwks` | RFC 7517 JWK Set · Errors: 500 |
| Exchange a workload identity token | `oAuth.createOauthToken({tokenExchangeRequest})` | `o_auth.create_oauth_token(federation_policy_id*, grant_type*, subject_token*, subject_token_type*, requested_token_type, scope)` | `OAuth.CreateOauthToken(ctx, request)` | `POST /oauth/token` | RFC 8693 token exchange (workload identity). Body `federation_policy_id`*, `grant_type`*, `subject_token`*, `subject_token_type`*, `requested_token_type`, `scope`. Errors typed `OAuthErrorResponse` · Errors: 400,429,500,503 |

#### Observability

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List observability destinations | `observability.list()` | `observability.list(offset, limit, workspace_id)` | `Observability.List(ctx, offset, limit, workspaceID)` | `GET /observability/destinations` | **Mgmt key** · Paginated (offsetLimit) · Only stable-release destination types surfaced · Errors: 400,401,403,500 |
| Create an observability destination | `observability.create({createObservabilityDestinationRequest})` | `observability.create(config*, name*, type*, api_key_hashes, broadcast_generation_cost, broadcast_generation_cost_allocation, broadcast_generation_identity, broadcast_generation_request_context, enabled, …+5)` | `Observability.Create(ctx, request)` | `POST /observability/destinations` | **Mgmt key** · Body `config`*, `name`*, `type`* (e.g. `langfuse`), `enabled`, `sampling_rate`, `filter_rules`, `privacy_mode`, `api_key_hashes`, `broadcast_generation_*`, `regions`, `workspace_id`. Max 5 per type · Errors: 400,401,403,409,500 |
| Delete an observability destination | `observability.delete({id})` | `observability.delete(id*)` | `Observability.Delete(ctx, id)` | `DELETE /observability/destinations/{id}` | **Mgmt key** · Soft delete · Errors: 401,403,404,500 |
| Get an observability destination | `observability.get({id})` | `observability.get(id*)` | `Observability.Get(ctx, id)` | `GET /observability/destinations/{id}` | **Mgmt key** · Errors: 401,403,404,500 |
| Update an observability destination | `observability.update({id, updateObservabilityDestinationRequest})` | `observability.update(id*, api_key_hashes, broadcast_generation_cost, broadcast_generation_cost_allocation, broadcast_generation_identity, broadcast_generation_request_context, config, …+6)` | `Observability.Update(ctx, id, updateObservabilityDestinationRequest)` | `PATCH /observability/destinations/{id}` | **Mgmt key** · Partial update (only provided fields) · Errors: 400,401,403,404,409,500 |

#### Organization

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List organization members | `organization.listMembers()` | `organization.list_members(offset, limit)` | `Organization.ListMembers(ctx, offset, limit)` | `GET /organization/members` | **Mgmt key** · Paginated (offsetLimit) · Errors: 401,403,404,500 |
| Get organization settings | `organization.getSettings()` | `organization.get_settings()` | `Organization.GetSettings(ctx)` | `GET /organization/settings` | **Mgmt key** · Errors: 401,403,404,500 |
| Update organization settings | `organization.updateSettings({updateOrganizationSettingsRequest})` | `organization.update_settings(is_filtered_model_catalog_enabled*)` | `Organization.UpdateSettings(ctx, request)` | `PATCH /organization/settings` | **Mgmt key** · Body `is_filtered_model_catalog_enabled`* · Errors: 400,401,403,404,500 |

#### Presets

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List presets | `presets.list()` | `presets.list(offset, limit)` | `Presets.List(ctx, offset, limit)` | `GET /presets` | Paginated (offsetLimit) · Errors: 400,401,403,500,503 |
| Get a preset | `presets.get({slug})` | `presets.get(slug*)` | `Presets.Get(ctx, slug)` | `GET /presets/{slug}` | Path `slug`; current version inline · Errors: 400,401,403,404,500,503 |
| Create a preset from a chat-completions request body | `presets.createPresetsChatCompletions({slug, chatRequest})` | `presets.create_presets_chat_completions(slug*, messages*, cache_control, debug, deferred_tools, frequency_penalty, image_config, logit_bias, …+35)` | `Presets.CreatePresetsChatCompletions(ctx, slug, chatRequest)` | `POST /presets/{slug}/chat/completions` | Path `slug` + a chat-completions body; only preset-config fields persist (`messages`, `stream`, `prompt` ignored) · Errors: 400,401,403,404,409,500 |
| Create a preset from a messages request body | `presets.createPresetsMessages({slug, messagesRequest})` | `presets.create_presets_messages(slug*, messages*, model*, cache_control, context_management, deferred_tools, fallbacks, max_tokens, metadata, …+20)` | `Presets.CreatePresetsMessages(ctx, slug, messagesRequest)` | `POST /presets/{slug}/messages` | Path `slug` + a Messages body · Errors: 400,401,403,404,409,500 |
| Create a preset from a responses request body | `presets.createPresetsResponses({slug, responsesRequest})` | `presets.create_presets_responses(slug*, access_programs, background, cache_control, debug, deferred_tools, frequency_penalty, …+35)` | `Presets.CreatePresetsResponses(ctx, slug, responsesRequest)` | `POST /presets/{slug}/responses` | Path `slug` + a Responses body · Errors: 400,401,403,404,409,500 |
| List versions of a preset | `presets.listVersions({slug})` | `presets.list_versions(slug*, offset, limit)` | `Presets.ListVersions(ctx, slug, offset, limit)` | `GET /presets/{slug}/versions` | Paginated (offsetLimit) · Oldest first · Errors: 400,401,403,404,500,503 |
| Get a specific version of a preset | `presets.getVersion({slug, version})` | `presets.get_version(slug*, version*)` | `Presets.GetVersion(ctx, slug, version)` | `GET /presets/{slug}/versions/{version}` | Path `slug`, `version` · Errors: 400,401,403,404,500,503 |

#### Private Endpoints

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List private endpoints | `privateEndpoints.list()` | `private_endpoints.list()` | `PrivateEndpoints.List(ctx)` | `GET /private-endpoints` | **Mgmt key** · Requires private endpoints entitlement · Errors: 401,403,408,500 |
| Create a private endpoint | `privateEndpoints.create({createPrivateEndpointRequest})` | `private_endpoints.create(model_permaslug*, provider_slug*, upstream_model_id*, idempotency_key, activate, base_url, declared_parameters, declared_region, declared_zdr, …+2)` | `PrivateEndpoints.Create(ctx, createPrivateEndpointRequest, idempotencyKey)` | `POST /private-endpoints` | **Mgmt key** · Body `model_permaslug`*, `provider_slug`*, `upstream_model_id`*, `base_url`, `pricing`, `settings`, `declared_*`, `activate`. Header `Idempotency-Key` (`idempotency_key` / Go `idempotencyKey`). Extra typed error `CreatePrivateEndpointValidationFailedResponseError` (TS/Py) · Errors: 400,401,403,404,408,409,422,500,502 |
| Delete a private endpoint | `privateEndpoints.delete({id})` | `private_endpoints.delete(id*, draft_only)` | `PrivateEndpoints.Delete(ctx, id, draftOnly)` | `DELETE /private-endpoints/{id}` | **Mgmt key** · Query `draft_only` (409 if activated) · Errors: 400,401,403,404,408,409,422,500,502 |
| Get a private endpoint | `privateEndpoints.get({id})` | `private_endpoints.get(id*)` | `PrivateEndpoints.Get(ctx, id)` | `GET /private-endpoints/{id}` | **Mgmt key** · Errors: 401,403,404,408,500 |
| Update a private endpoint | `privateEndpoints.update({id, updatePrivateEndpointRequest})` | `private_endpoints.update(id*, base_url, declared_parameters, declared_region, declared_zdr, pricing, settings, upstream_model_id)` | `PrivateEndpoints.Update(ctx, id, updatePrivateEndpointRequest)` | `PATCH /private-endpoints/{id}` | **Mgmt key** · Only present fields change; `pricing`/`declared_parameters` replace; `settings` merges · Errors: 400,401,403,404,408,409,422,500,502 |
| Activate a validated private endpoint | `privateEndpoints.activate({id})` | `private_endpoints.activate(id*)` | `PrivateEndpoints.Activate(ctx, id)` | `POST /private-endpoints/{id}/activate` | **Mgmt key** · 409 if never validated, stale, or already active · Errors: 400,401,403,404,408,409,422,500,502 |
| Disable a private endpoint | `privateEndpoints.disable({id})` | `private_endpoints.disable(id*)` | `PrivateEndpoints.Disable(ctx, id)` | `POST /private-endpoints/{id}/disable` | **Mgmt key** · Errors: 400,401,403,404,408,409,422,500,502 |
| Enable a private endpoint | `privateEndpoints.enable({id})` | `private_endpoints.enable(id*)` | `PrivateEndpoints.Enable(ctx, id)` | `POST /private-endpoints/{id}/enable` | **Mgmt key** · Errors: 400,401,403,404,408,409,422,500,502 |
| Validate a draft private endpoint | `privateEndpoints.validate({id, validatePrivateEndpointRequest})` | `private_endpoints.validate(id*, workspace_id*)` | `PrivateEndpoints.Validate(ctx, id, validatePrivateEndpointRequest)` | `POST /private-endpoints/{id}/validate` | **Mgmt key** · Body `workspace_id`* (uses that workspace's BYOK credential). Failed checks return 200 `passed: false` · Errors: 400,401,403,404,408,409,422,500,502 |

#### Private Providers

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List private providers | `privateProviders.list()` | `private_providers.list()` | `PrivateProviders.List(ctx)` | `GET /private-providers` | **Mgmt key** · Errors: 401,403,500 |
| Create a private provider | `privateProviders.create({createPrivateProviderRequest})` | `private_providers.create(name*, base_url, display_name, slug)` | `PrivateProviders.Create(ctx, request)` | `POST /private-providers` | **Mgmt key** · Body `name`*, `slug`, `display_name`, `base_url` · Errors: 400,401,403,404,408,409,422,429,500,502 |
| Delete a private provider | `privateProviders.delete({slug})` | `private_providers.delete(slug*)` | `PrivateProviders.Delete(ctx, slug)` | `DELETE /private-providers/{slug}` | **Mgmt key** · 409 while endpoints still run under it · Errors: 400,401,403,404,408,409,422,429,500,502 |
| Get a private provider | `privateProviders.get({slug})` | `private_providers.get(slug*)` | `PrivateProviders.Get(ctx, slug)` | `GET /private-providers/{slug}` | **Mgmt key** · Errors: 401,403,404,500 |
| Update a private provider | `privateProviders.update({slug, updatePrivateProviderRequest})` | `private_providers.update(slug*, base_url, display_name)` | `PrivateProviders.Update(ctx, slug, updatePrivateProviderRequest)` | `PATCH /private-providers/{slug}` | **Mgmt key** · Body `display_name`, `base_url` (empty body → 400) · Errors: 400,401,403,404,408,409,422,429,500,502 |

#### Providers

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List all providers | `providers.list()` | `providers.list()` | `Providers.List(ctx)` | `GET /providers` | Errors: 500 |

#### Rerank

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Submit a rerank request | `rerank.rerank({requestBody})` | `rerank.rerank(documents*, model*, query*, provider, session_id, top_n, trace, user)` | `Rerank.Rerank(ctx, request)` | `POST /rerank` | Body `model`*, `query`*, `documents`*, `top_n`, `provider`, `session_id`, `trace`, `user` · Errors: 400,401,402,403,404,413,429,500,502,503,524,529 |

#### Responses

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Create a response | `responses.send({responsesRequest})` | `responses.send(x_open_router_metadata, access_programs, background, cache_control, debug, deferred_tools, …+36)` | `Responses.Send(ctx, responsesRequest, xOpenRouterMetadata)` | `POST /responses` | SSE stream when `stream: true` · OpenResponses body: `input`, `instructions`, `model`/`models`, `stream`, `tools`, `tool_choice`, `reasoning`, `text`, `previous_response_id`, `background`, `provider`, `plugins`… (see [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)). Header param `X-OpenRouter-Metadata` · Errors: 400,401,402,403,404,408,413,422,429,500,502,503,524,529 |

#### SCIM

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List SCIM group mappings | `scim.listMappings()` | `scim.list_mappings(offset, limit)` | `Scim.ListMappings(ctx, offset, limit)` | `GET /scim/group-mappings` | **Mgmt key** · Paginated (offsetLimit) · Errors: 401,403,404,500 |
| Create a SCIM group mapping | `scim.create({createScimGroupMappingRequest})` | `scim.create(role*, scim_group_id*, workspace_id*)` | `Scim.Create(ctx, request)` | `POST /scim/group-mappings` | **Mgmt key** · Body `role`*, `scim_group_id`*, `workspace_id`*. Same role re-applies; different role → 409 · Errors: 400,401,403,404,409,500 |
| Delete a SCIM group mapping | `scim.delete({id, keepMembers})` | `scim.delete(id*, keep_members*)` | `Scim.Delete(ctx, id, keepMembers)` | `DELETE /scim/group-mappings/{id}` | **Mgmt key** · Query `keep_members`* (Go `operations.CreateKeepMembersBoolean(false)`) · Errors: 400,401,403,404,500 |
| Get a SCIM group mapping | `scim.read({id})` | `scim.read(id*)` | `Scim.Read(ctx, id)` | `GET /scim/group-mappings/{id}` | **Mgmt key** · Note the verb: `read`, not `get` · Errors: 401,403,404,500 |
| Update a SCIM group mapping | `scim.update({id, updateScimGroupMappingRequest})` | `scim.update(id*, role*)` | `Scim.Update(ctx, id, updateScimGroupMappingRequest)` | `PATCH /scim/group-mappings/{id}` | **Mgmt key** · Body `role`* · Errors: 400,401,403,404,500 |
| List SCIM groups | `scim.listGroups()` | `scim.list_groups(offset, limit, display_name, external_id)` | `Scim.ListGroups(ctx, offset, limit, displayName, externalID)` | `GET /scim/groups` | **Mgmt key** · Paginated (offsetLimit) · `display_name`, `external_id` filters · Errors: 401,403,404,500 |
| Start a SCIM directory sync | `scim.createSyncJob()` | `scim.create_sync_job()` | `Scim.CreateSyncJob(ctx)` | `POST /scim/sync-jobs` | **Mgmt key** · Errors: 401,403,404,500 |
| Get SCIM directory sync status | `scim.getSyncJob({id})` | `scim.get_sync_job(id*)` | `Scim.GetSyncJob(ctx, id)` | `GET /scim/sync-jobs/{id}` | **Mgmt key** · Errors: 401,403,404,500 |

#### STT (speech-to-text)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Create transcription | `stt.createTranscription({sttRequest})` | `stt.create_transcription(input_audio*, model*, diarize, keyterms, language, provider, response_format, session_id, …+4)` | `STT.CreateTranscription(ctx, request)` | `POST /audio/transcriptions` | JSON body: `input_audio`* (`{data, format}` base64), `model`*, `language`, `response_format`, `diarize`, `keyterms`, `timestamp_granularities`, `temperature`… · Errors: 400,401,402,403,404,413,429,500,502,503,504,524,529 |
| Create transcription (multipart/form-data) | `stt.createTranscriptionMultipart({requestBody})` | `stt.create_transcription_multipart(model*, diarize, file, keyterms, language, provider, response_format, …+6)` | `STT.CreateTranscriptionMultipart(ctx, request)` | `POST /audio/transcriptions` | Same endpoint as multipart/form-data: `model`*, `file` or `source_url`, plus the same options. TS uses `openAsBlob` · Errors: 400,401,402,403,404,413,429,500,502,503,504,524,529 |

#### SystemOne

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Submit a System One request | `systemOne.create({decisionsRequest})` | `system_one.create(model*, questions*, state*, assets, provider, session_id, trace, user)` | `SystemOne.Create(ctx, request)` | `POST /systemone` | Same envelope as Alpha.Decisions (`decisionsRequest`); bare IDs like `jev-1.13` map to `typesafe/` · Errors: 400,401,402,403,404,413,429,500,502,503,524,529 |

#### Tools (server-tool catalog)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List server tools | `tools.listTools({bearer})` | `tools.list_tools(security*, offset, limit, api_format)` | `Tools.ListTools(ctx, security, offset, limit, apiFormat)` | `GET /tools` | Operation-level `bearer` security per call. `offset`, `limit`, `api_format` · Errors: 401,403,404,500 |
| Get a server tool | `tools.getTool({bearer}, { name })` | `tools.get_tool(security*, name*)` | `Tools.GetTool(ctx, security, name)` | `GET /tools/{name}` | Operation-level `bearer` security; path `name` (canonical or alias, e.g. `openrouter:web_search`). TS passes security first: `getTool({ bearer }, { name })` · Errors: 401,403,404,500 |

#### TTS (text-to-speech)

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Create speech | `tts.createSpeech({speechRequest})` | `tts.create_speech(input*, model*, input_references, instructions, provider, response_format, session_id, speed, …+3)` | `TTS.CreateSpeech(ctx, request)` | `POST /audio/speech` | Binary response · Body `input`*, `model`*, `voice`, `speed`, `response_format`, `instructions`, `input_references`… Returns raw audio bytes · Errors: 400,401,402,403,404,413,429,500,502,503,524,529 |

#### Vault

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List the connections an intern can use | `vault.listInternConnections({internId})` | `vault.list_intern_connections(intern_id*)` | `Vault.ListInternConnections(ctx, internID)` | `GET /vault/interns/{internId}/connections` | Path `internId` · Errors: 400,401,403,404,408,429,500,502,503,504 |
| List the secrets an intern receives | `vault.listInternEffectiveVaultSecrets({internId, limit})` | `vault.list_intern_effective_vault_secrets(intern_id*, limit, offset)` | `Vault.ListInternEffectiveVaultSecrets(ctx, internID, limit, offset)` | `GET /vault/interns/{internId}/effective-secrets` | `limit`, `offset` (manual) · Errors: 400,401,403,404,408,429,500,502,503,504 |
| List intern secrets | `vault.listInternVaultSecrets({internId, limit})` | `vault.list_intern_vault_secrets(intern_id*, limit, offset)` | `Vault.ListInternVaultSecrets(ctx, internID, limit, offset)` | `GET /vault/interns/{internId}/secrets` | `limit`, `offset` (manual) · Errors: 400,401,403,404,408,429,500,502,503,504 |
| Delete an intern secret | `vault.deleteInternVaultSecret({internId, name})` | `vault.delete_intern_vault_secret(intern_id*, name*)` | `Vault.DeleteInternVaultSecret(ctx, internID, name)` | `DELETE /vault/interns/{internId}/secrets/{name}` | No response body (204) · Errors: 400,401,403,404,408,409,429,500,502,503,504 |
| Store an intern secret | `vault.storeInternVaultSecret({internId, name, vaultSecretWriteRequest})` | `vault.store_intern_vault_secret(intern_id*, name*, hosts*, value*)` | `Vault.StoreInternVaultSecret(ctx, internID, name, vaultSecretWriteRequest)` | `PUT /vault/interns/{internId}/secrets/{name}` | PUT create/replace; body `hosts`*, `value`*. Value released only to exact `hosts` · Errors: 400,401,403,404,408,409,413,429,500,502,503,504 |
| Copy workspace secrets to an intern | `vault.copyVaultSecretsToIntern({internId, vaultSecretCopyRequest})` | `vault.copy_vault_secrets_to_intern(intern_id*, names*)` | `Vault.CopyVaultSecretsToIntern(ctx, internID, vaultSecretCopyRequest)` | `POST /vault/interns/{internId}/secrets/copy` | Body `names`*; all-or-nothing (404 if any missing) · Errors: 400,401,403,404,408,409,413,429,500,502,503,504 |
| List workspace secrets | `vault.listVaultSecrets()` | `vault.list_vault_secrets(limit, offset)` | `Vault.ListVaultSecrets(ctx, limit, offset)` | `GET /vault/secrets` | Workspace scope selected by the API key · Errors: 400,401,403,404,408,429,500,502,503,504 |
| Delete a workspace secret | `vault.deleteVaultSecret({name})` | `vault.delete_vault_secret(name*)` | `Vault.DeleteVaultSecret(ctx, name)` | `DELETE /vault/secrets/{name}` | No response body (204) · Errors: 400,401,403,404,408,409,429,500,502,503,504 |
| Store a workspace secret | `vault.storeVaultSecret({name, vaultSecretWriteRequest})` | `vault.store_vault_secret(name*, hosts*, value*)` | `Vault.StoreVaultSecret(ctx, name, vaultSecretWriteRequest)` | `PUT /vault/secrets/{name}` | PUT create/replace; body `hosts`*, `value`* · Errors: 400,401,403,404,408,409,413,429,500,502,503,504 |

#### Video Generation

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| Submit a video generation request | `videoGeneration.generate({videoGenerationRequest})` | `video_generation.generate(model*, aspect_ratio, callback_url, creativity, duration, frame_images, generate_audio, …+11)` | `VideoGeneration.Generate(ctx, request)` | `POST /videos` | Body `model`*, `prompt`, `duration`, `resolution`, `aspect_ratio`, `size`, `seed`, `frame_images`, `input_references`, `generate_audio`, `callback_url`, `previous_job_id`… Returns a polling URL/job · Errors: 400,401,402,403,404,413,429,499,500,503 |
| Poll video generation status | `videoGeneration.getGeneration({jobId})` | `video_generation.get_generation(job_id*)` | `VideoGeneration.GetGeneration(ctx, jobID)` | `GET /videos/{jobId}` | Path `jobId`; poll status (not the same as `generations.getGeneration`) · Errors: 401,403,404,500 |
| Download generated video content | `videoGeneration.getVideoContent({jobId})` | `video_generation.get_video_content(job_id*, index)` | `VideoGeneration.GetVideoContent(ctx, jobID, index)` | `GET /videos/{jobId}/content` | Binary response · Path `jobId`, query `index`; raw video bytes · Errors: 400,401,403,404,409,410,500,502 |
| List all video generation models | `videoGeneration.listVideosModels()` | `video_generation.list_videos_models()` | `VideoGeneration.ListVideosModels(ctx)` | `GET /videos/models` | Errors: 400,500 |

#### Workspaces

| Operation | TypeScript `openRouter.…` | Python `open_router.…` | Go `s.…` | HTTP | Notes |
| - | - | - | - | - | - |
| List workspaces | `workspaces.list()` | `workspaces.list(offset, limit)` | `Workspaces.List(ctx, offset, limit)` | `GET /workspaces` | **Mgmt key** · Paginated (offsetLimit) · Errors: 401,403,500 |
| Create a workspace | `workspaces.create({createWorkspaceRequest})` | `workspaces.create(name*, slug*, default_image_model, default_provider_sort, default_text_model, description, disabled_server_tools, io_logging_api_key_ids, …+4)` | `Workspaces.Create(ctx, request)` | `POST /workspaces` | **Mgmt key** · Body `name`*, `slug`*, defaults (`default_text_model`, `default_image_model`, `default_provider_sort`), logging/observability flags · Errors: 400,401,403,500 |
| Delete a workspace | `workspaces.delete({id})` | `workspaces.delete(id*, confirm_default_workspace_deletion)` | `Workspaces.Delete(ctx, id, confirmDefaultWorkspaceDeletion)` | `DELETE /workspaces/{id}` | **Mgmt key** · Path `id` (ID or slug); `confirm_default_workspace_deletion`. Workspaces with active keys can't be deleted · Errors: 400,401,403,404,500 |
| Get a workspace | `workspaces.get({id})` | `workspaces.get(id*)` | `Workspaces.Get(ctx, id)` | `GET /workspaces/{id}` | **Mgmt key** · Path `id` (ID or slug) · Errors: 401,403,404,500 |
| Update a workspace | `workspaces.update({id, updateWorkspaceRequest})` | `workspaces.update(id*, default_image_model, default_provider_sort, default_text_model, description, disabled_server_tools, io_logging_api_key_ids, …+6)` | `Workspaces.Update(ctx, id, updateWorkspaceRequest)` | `PATCH /workspaces/{id}` | **Mgmt key** · Errors: 400,401,403,404,500 |
| List workspace members | `workspaces.listMembers({id})` | `workspaces.list_members(id*, offset, limit)` | `Workspaces.ListMembers(ctx, id, offset, limit)` | `GET /workspaces/{id}/members` | **Mgmt key** · Paginated (offsetLimit) · Default workspace returns all org members · Errors: 401,403,404,500 |
| Bulk add members to a workspace | `workspaces.bulkAddMembers({id, bulkAddWorkspaceMembersRequest})` | `workspaces.bulk_add_members(id*, user_ids*)` | `Workspaces.BulkAddMembers(ctx, id, bulkAddWorkspaceMembersRequest)` | `POST /workspaces/{id}/members/add` | **Mgmt key** · Body `user_ids`* · Errors: 400,401,403,404,500 |
| Bulk remove members from a workspace | `workspaces.bulkRemoveMembers({id, bulkRemoveWorkspaceMembersRequest})` | `workspaces.bulk_remove_members(id*, user_ids*)` | `Workspaces.BulkRemoveMembers(ctx, id, bulkRemoveWorkspaceMembersRequest)` | `POST /workspaces/{id}/members/remove` | **Mgmt key** · Body `user_ids`*; SCIM-managed members can't be removed · Errors: 400,401,403,404,500 |
| List workspace budgets | `workspaces.listBudgets({workspaceRef})` | `workspaces.list_budgets(workspace_ref*)` | `Workspaces.ListBudgets(ctx, workspaceRef)` | `GET /workspaces/{workspace_ref}/budgets` | **Mgmt key** · Path `workspace_ref` (renamed from `id` 2026-09-10) · Errors: 401,403,404,500 |
| Delete a workspace budget | `workspaces.deleteBudget({workspaceRef, interval})` | `workspaces.delete_budget(workspace_ref*, interval*)` | `Workspaces.DeleteBudget(ctx, workspaceRef, interval)` | `DELETE /workspaces/{workspace_ref}/budgets/{interval}` | **Mgmt key** · Path `workspace_ref`, `interval` · Errors: 400,401,403,404,500 |
| Get a workspace budget | `workspaces.getBudget({workspaceRef, interval})` | `workspaces.get_budget(workspace_ref*, interval*)` | `Workspaces.GetBudget(ctx, workspaceRef, interval)` | `GET /workspaces/{workspace_ref}/budgets/{interval}` | **Mgmt key** · Path `workspace_ref`, `interval` · Errors: 400,401,403,404,500 |
| Create or update a workspace budget | `workspaces.setBudget({workspaceRef, interval, upsertWorkspaceBudgetRequest})` | `workspaces.set_budget(workspace_ref*, interval*, limit_usd*, include_byok_in_budgets)` | `Workspaces.SetBudget(ctx, workspaceRef, interval, upsertWorkspaceBudgetRequest)` | `PUT /workspaces/{workspace_ref}/budgets/{interval}` | **Mgmt key** · PUT upsert; body `limit_usd`*, `include_byok_in_budgets` (workspace-wide). Limits must strictly decrease lifetime > monthly > weekly > daily · Errors: 400,401,403,404,500 |

Sources (all generated SDK READMEs): https://openrouter.ai/docs/client-sdks/typescript/sdks/analytics/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/apikeys/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/batch/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/benchmarks/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/byok/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/classifications/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/containers/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/credits/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/datasets/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/decisions/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/embeddings/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/endpoints/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/endusers/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/externalusers/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/extractions/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/files/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/generations/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrailpolicies/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrails/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/images/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/models/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/oauth/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/observability/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/organization/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/presets/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/privateendpoints/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/privateproviders/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/providers/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/rerank/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/responses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/scim/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/stt/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/systemone/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/tools/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/tts/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/vault/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/videogeneration/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/workspaces/README, https://openrouter.ai/docs/client-sdks/python/sdks/analytics/README, https://openrouter.ai/docs/client-sdks/python/sdks/apikeys/README, https://openrouter.ai/docs/client-sdks/python/sdks/batch/README, https://openrouter.ai/docs/client-sdks/python/sdks/benchmarks/README, https://openrouter.ai/docs/client-sdks/python/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/python/sdks/byok/README, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README, https://openrouter.ai/docs/client-sdks/python/sdks/classifications/README, https://openrouter.ai/docs/client-sdks/python/sdks/containers/README, https://openrouter.ai/docs/client-sdks/python/sdks/credits/README, https://openrouter.ai/docs/client-sdks/python/sdks/datasets/README, https://openrouter.ai/docs/client-sdks/python/sdks/decisions/README, https://openrouter.ai/docs/client-sdks/python/sdks/embeddings/README, https://openrouter.ai/docs/client-sdks/python/sdks/endpoints/README, https://openrouter.ai/docs/client-sdks/python/sdks/externalusers/README, https://openrouter.ai/docs/client-sdks/python/sdks/extractions/README, https://openrouter.ai/docs/client-sdks/python/sdks/files/README, https://openrouter.ai/docs/client-sdks/python/sdks/generations/README, https://openrouter.ai/docs/client-sdks/python/sdks/guardrailpolicies/README, https://openrouter.ai/docs/client-sdks/python/sdks/guardrails/README, https://openrouter.ai/docs/client-sdks/python/sdks/images/README, https://openrouter.ai/docs/client-sdks/python/sdks/models/README, https://openrouter.ai/docs/client-sdks/python/sdks/oauth/README, https://openrouter.ai/docs/client-sdks/python/sdks/observability/README, https://openrouter.ai/docs/client-sdks/python/sdks/organization/README, https://openrouter.ai/docs/client-sdks/python/sdks/presets/README, https://openrouter.ai/docs/client-sdks/python/sdks/privateendpoints/README, https://openrouter.ai/docs/client-sdks/python/sdks/privateproviders/README, https://openrouter.ai/docs/client-sdks/python/sdks/providers/README, https://openrouter.ai/docs/client-sdks/python/sdks/rerank/README, https://openrouter.ai/docs/client-sdks/python/sdks/responses/README, https://openrouter.ai/docs/client-sdks/python/sdks/scim/README, https://openrouter.ai/docs/client-sdks/python/sdks/stt/README, https://openrouter.ai/docs/client-sdks/python/sdks/systemone/README, https://openrouter.ai/docs/client-sdks/python/sdks/tools/README, https://openrouter.ai/docs/client-sdks/python/sdks/tts/README, https://openrouter.ai/docs/client-sdks/python/sdks/vault/README, https://openrouter.ai/docs/client-sdks/python/sdks/videogeneration/README, https://openrouter.ai/docs/client-sdks/python/sdks/workspaces/README, https://openrouter.ai/docs/client-sdks/go/sdks/analytics/README, https://openrouter.ai/docs/client-sdks/go/sdks/apikeys/README, https://openrouter.ai/docs/client-sdks/go/sdks/batch/README, https://openrouter.ai/docs/client-sdks/go/sdks/benchmarks/README, https://openrouter.ai/docs/client-sdks/go/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/go/sdks/byok/README, https://openrouter.ai/docs/client-sdks/go/sdks/chat/README, https://openrouter.ai/docs/client-sdks/go/sdks/classifications/README, https://openrouter.ai/docs/client-sdks/go/sdks/containers/README, https://openrouter.ai/docs/client-sdks/go/sdks/credits/README, https://openrouter.ai/docs/client-sdks/go/sdks/datasets/README, https://openrouter.ai/docs/client-sdks/go/sdks/decisions/README, https://openrouter.ai/docs/client-sdks/go/sdks/embeddings/README, https://openrouter.ai/docs/client-sdks/go/sdks/endpoints/README, https://openrouter.ai/docs/client-sdks/go/sdks/externalusers/README, https://openrouter.ai/docs/client-sdks/go/sdks/extractions/README, https://openrouter.ai/docs/client-sdks/go/sdks/files/README, https://openrouter.ai/docs/client-sdks/go/sdks/generations/README, https://openrouter.ai/docs/client-sdks/go/sdks/guardrails/README, https://openrouter.ai/docs/client-sdks/go/sdks/images/README, https://openrouter.ai/docs/client-sdks/go/sdks/models/README, https://openrouter.ai/docs/client-sdks/go/sdks/oauth/README, https://openrouter.ai/docs/client-sdks/go/sdks/observability/README, https://openrouter.ai/docs/client-sdks/go/sdks/organization/README, https://openrouter.ai/docs/client-sdks/go/sdks/presets/README, https://openrouter.ai/docs/client-sdks/go/sdks/privateendpoints/README, https://openrouter.ai/docs/client-sdks/go/sdks/privateproviders/README, https://openrouter.ai/docs/client-sdks/go/sdks/providers/README, https://openrouter.ai/docs/client-sdks/go/sdks/rerank/README, https://openrouter.ai/docs/client-sdks/go/sdks/responses/README, https://openrouter.ai/docs/client-sdks/go/sdks/scim/README, https://openrouter.ai/docs/client-sdks/go/sdks/stt/README, https://openrouter.ai/docs/client-sdks/go/sdks/systemone/README, https://openrouter.ai/docs/client-sdks/go/sdks/tools/README, https://openrouter.ai/docs/client-sdks/go/sdks/tts/README, https://openrouter.ai/docs/client-sdks/go/sdks/vault/README, https://openrouter.ai/docs/client-sdks/go/sdks/videogeneration/README, https://openrouter.ai/docs/client-sdks/go/sdks/workspaces/README; HTTP paths mapped via the OpenAPI spec operationIds

### 3.7 Deprecated aliases, removed namespaces and renamed APIs

| Deprecated / changed | Use instead | Languages | Notes |
| - | - | - | - |
| `beta.responses.send` (TS/Py), `Beta.Responses.Send` (Go) | `responses.send` / `Responses.Send` | all | "Deprecated alias of responses … scheduled for removal (sunset date TBD)." Same endpoint (`POST /responses`) and same request/response types. `beta.responses` was only an OpenAPI tag and SDK namespace, never a URL. |
| TS standalone `betaResponsesSend` | `responsesSend` | TS | Deprecated alias (changelog). The Beta.Responses README already shows `responsesSend`. |
| `openRouter.endUsers.*` (`list`, `create`, `get`, `update`, `delete`) | `openRouter.externalUsers.*` | TS only | Compatibility alias since `@openrouter/sdk` 1.5.0; same `externalUsers*` standalone functions. |
| Python `client.end_users` | `client.external_users` | Python | **Removed** in `openrouter` 1.3.70. |
| Models `EndUser`, `EndUserResponse`, `CreateEndUserRequest`, `UpdateEndUserRequest`, `ListEndUsersResponse` | `ExternalUser`, `ExternalUserResponse`, `CreateExternalUserRequest`, `UpdateExternalUserRequest`, `ListExternalUsersResponse` | TS ≥1.5.0, Py ≥1.3.70 | Shapes unchanged. `/end-users` HTTP paths are forwarded to `/external-users`. |
| Agent exports in `@openrouter/sdk` (`callModel`, `tool`, stop conditions, …) | `@openrouter/agent` subpaths ([§3.1](#31-overview-packages-installation-stability)) | TS | To be removed from `@openrouter/sdk` in a future major version. |
| Workspace budget path arg `id` | `workspace_ref` / `workspaceRef` | all | Changed 2026-09-10. The URL value is unchanged. |
| Request field `max_tokens` (chat/presets) | `max_completion_tokens` | all | "Maximum tokens (deprecated, use max_completion_tokens)". |
| Guardrail field `enforce_zdr` | `enforce_zdr_anthropic`, `enforce_zdr_google`, `enforce_zdr_openai`, `enforce_zdr_other`, `enforce_zdr_xai` | all | Marked DEPRECATED in the guardrails README. |
| Key field `is_provisioning_key` (`GET /key` response) | `is_management_key` | all | DEPRECATED in the response schema. |
| `POST /credits/coinbase` | Web credits purchase flow | — | Deprecated and not generated into any SDK (`x-speakeasy-ignore`). Always returns 410. |

Sources: https://openrouter.ai/docs/client-sdks/typescript/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/python/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/go/sdks/betaresponses/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/endusers/README, https://openrouter.ai/docs/client-sdks/python/sdks/guardrails/README, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README, https://openrouter.ai/docs/client-sdks/agent-migration, https://openrouter.ai/docs/changelog

### 3.8 DevTools (`@openrouter/devtools`), pre-release

> Status: **pre-release, development only.** Per the docs, "there is no complete supported public client integration yet". `@openrouter/sdk` cannot attach the DevTools hooks through its typed public options. `@openrouter/agent`'s `callModel` uses streaming Responses output, which DevTools cannot currently complete or normalize. Never deploy DevTools to production.

Components:
1. **SDK telemetry hooks.** They normalize supported operations into the DevTools telemetry format.
2. **DevTools viewer.** A local web UI for captured telemetry with run tracking, per-step request/response/timing/errors, token usage, and dark/light mode.

Install:

```bash
npm install --save-dev @openrouter/devtools   # pnpm add -D / yarn add -D / bun add -d / deno add --dev npm:@openrouter/devtools
npm install --global @openrouter/cli          # provides the `openrouter devtools` command
```

Viewer:

```bash
openrouter devtools                              # serves http://localhost:4983
OPENROUTER_DEVTOOLS_PORT=5000 openrouter devtools
```

- Run the viewer from a project that already contains a compatible `.devtools/openrouter-generations.json`.
- The viewer auto-refreshes when new telemetry arrives.

Hook configuration (`createOpenRouterDevtools(options)`):

| Option | Type | Default | Description |
| - | - | - | - |
| `storagePath` | `string` | `'.devtools/openrouter-generations.json'` | Where telemetry is stored |
| `serverUrl` | `string` | `'http://localhost:4983/api/notify'` | DevTools server notification endpoint. Update it if you change the port, e.g. `createOpenRouterDevtools({ serverUrl: 'http://localhost:5000/api/notify' })` |

Behavior:
- **Capture flow:**
  1. The hooks intercept requests.
  2. They parse the request and response bodies.
  3. They store runs, steps and metadata in the JSON file.
  4. They notify the local server, and the viewer updates.
- **Recognized internal operation IDs:** `createResponses` and `sendChatCompletionRequest` only. Everything else, including embeddings, is ignored. This list does not mean those integrations work:
  - The Agent SDK reaches `createResponses`, but its streaming response is unsupported.
  - The Client SDK reaches `sendChatCompletionRequest`, but it cannot attach the plain hooks.
- **Data per step:**
  - Request: model, messages, parameters.
  - Response: content, prompt and completion tokens, provider and model, finish reason.
  - Metadata: start and completion timestamps, duration in ms, status (`success`/`error`/`in_progress`), error details.
- **Failure isolation:**
  - Hooks return the original request and response.
  - Capture errors are swallowed and failed writes are ignored.
  - Body parsing runs inside the hook lifecycle, so capture is not zero-cost.
- **Production guard:** creating the hooks throws when `NODE_ENV === 'production'` ("DevTools should not be used in production").

Troubleshooting from the docs:

| Symptom | Fix |
| - | - |
| `EADDRINUSE :::4983` | Stop the other process, or set `OPENROUTER_DEVTOOLS_PORT` and match `serverUrl` |
| Telemetry file not found | Check `.devtools/`, write permissions, and any custom `storagePath` |
| Viewer not updating | Confirm the server is running and `serverUrl` matches the port, then refresh |
| `Cannot find module '@openrouter/devtools'` | Install the dev dependency |

Sources: https://openrouter.ai/docs/client-sdks/dev-tools/devtools

### 3.9 Usage for Agents (official skill)

OpenRouter publishes the `openrouter-typescript-sdk` skill in the `OpenRouterTeam/skills` GitHub repository. It is an Agent Skills-standard package for AI coding assistants and covers both `@openrouter/sdk` and `@openrouter/agent`. With the Client SDKs, it focuses on platform features such as model listing, chat completions, credits, OAuth and key management. The steps below are documented here as a feature; do not run them on the user's behalf.

| Assistant | Install (as documented) |
| - | - |
| Claude Code | `/plugin marketplace add OpenRouterTeam/skills` then `/plugin install openrouter@openrouter` |
| Cursor | Settings > Rules > Add Rule > Remote Rule (Github) with `OpenRouterTeam/skills` |
| Any agent via GitHub CLI (v2.90.0+; Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Windsurf, …) | `gh skill install OpenRouterTeam/skills openrouter-typescript-sdk` |

- **Listed as supported:** Claude Code, Cursor, OpenCode, GitHub Copilot, Codex, Amp, Roo Code, Antigravity.
- **Knowledge the skill provides:**
  - SDK installation and setup
  - Responses API (the recommended API)
  - Embeddings
  - Error handling
  - Streaming
  - Tool use
  - API key management
  - OAuth PKCE
- **Patterns it teaches:** `responses.send` with `stream: false` plus the `'output' in response` guard, and streaming with an `instanceof ReadableStream` guard on `response.output_text.delta` events (the examples in [§3.3](#33-typescript-sdk-openroutersdk)).

Sources: https://openrouter.ai/docs/client-sdks/usage-for-agents

### 3.10 Gotchas for coding agents

**Naming and shape:**
1. **Request shapes differ per language.**
   - TS wraps the body under a method-specific key: `chatRequest`, `responsesRequest`, `requestBody`, `createGuardrailRequest`, `batchSubmitBody`, `speechRequest`, `sttRequest`, … Check [§3.6](#36-method-catalog-all-resources). `{ model, messages }` at the top level of a TS `chat.send` argument is wrong; it must be `{ chatRequest: { model, messages } }`.
   - Python flattens everything into kwargs.
   - Go uses positional args plus typed structs.
2. **Field casing.** TS fields are camelCase (`maxTokens`, `includeByokInLimit`, `allowFallbacks`, `limitReset`, `workspaceRef`). Python fields are wire snake_case. Go fields are PascalCase with initialisms (`IncludeBYOKInLimit`, `FederationPolicyID`, `CallbackURL`). Do not paste raw snake_case JSON into TS request objects.
3. **Namespace spellings differ:**

   | TS | Python | Go |
   | - | - | - |
   | `oAuth` | `o_auth` | `OAuth` |
   | `apiKeys` | `api_keys` | `APIKeys` |
   | `systemOne` | `system_one` | `SystemOne` |
   | `byok` | `byok` | `BYOK` |
   | `stt` / `tts` | `stt` / `tts` | `STT` / `TTS` |
   | `scim` | `scim` | `Scim` |
   | `videoGeneration` | `video_generation` | `VideoGeneration` |
   | `externalUsers` | `external_users` | `ExternalUsers` |
   | `guardrailPolicies` | `guardrail_policies` | (absent) |

4. **Non-obvious method names:**
   - `credits.getCredits` (not `credits.get`). The agent-migration FAQ mentions `client.credits.get()`, but the generated method is `getCredits`.
   - `embeddings.generate`, `images.generate`, `videoGeneration.generate` (not `create`).
   - `rerank.rerank`; `batch.createBatches` / `batch.getBatches`.
   - `apiKeys.getCurrentKeyMetadata` (`GET /key`).
   - `scim.read` (not `get`); `workspaces.setBudget` (PUT upsert).
   - `files.retrieve` returns metadata and `files.download` returns bytes.
   - `videoGeneration.getGeneration` polls a video job. It is unrelated to `generations.getGeneration` (`GET /generation`).
5. **Two methods for one endpoint:** `stt.createTranscription` sends JSON with base64 `input_audio`. `stt.createTranscriptionMultipart` sends multipart `file` or `source_url`. Both hit `POST /audio/transcriptions`.

**Coverage:**
6. **Go is missing Guardrail Policies.** All 23 `/guardrails/policies/*` operations need raw HTTP in Go ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)). Python and TS have them.
7. **No SDK method for `POST /messages`.** Use HTTP or an Anthropic-compatible client ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). `presets.createPresetsMessages` only creates a preset from a Messages body.
8. **`endUsers` exists only in TS**, as a deprecated alias. Python removed `end_users`; Go never had it.

**Auth:**
9. **Management keys.** Every **Mgmt key** method in [§3.6](#36-method-catalog-all-resources) fails with an inference key (401/403). Typical layout: one client per key type. `apiKeys.getCurrentKeyMetadata` works with any key; `credits.getCredits` needs a management key.
10. **Per-call bearer security.** `models.listForUser`, `tools.listTools` and `tools.getTool` take a security object per call. TS passes it as the **first** argument, Python as `security=`, Go right after `ctx`. Setting `apiKey` on the client is not enough for these.

**Endpoints and options:**
11. **Alpha endpoints live outside `/api/v1`.** `alpha.decisions.create` and `alpha.extractions.create` call `https://openrouter.ai/api/alpha/...`. Only these two accept a per-call server override (TS `options.serverURL`, Python `server_url`). Their shapes may change.
12. **Client options differ by language.**
    - Go documents client options `WithServer`, `WithServerURL`, `WithRetryConfig` and `WithClient` (a custom `HTTPClient`, e.g. for timeouts and extra headers), plus per-call `operations.WithRetries` and `operations.WithServerURL`.
    - TS and Python document only `debugLogger` / `debug_logger` (and `OPENROUTER_DEBUG`) beyond the key and attribution options. Global server URL, timeouts, custom HTTP clients and retry-config fields are **not documented** for them, so do not generate such options without checking the installed package.
    - Cancellation: TS uses `options.fetchOptions.signal` (all `RequestInit` options except `method`/`body` are allowed); Go uses `ctx` or a client timeout.
    - Python async methods use the `_async` suffix under `async with`.

**Streaming and responses:**
13. **Narrow streaming unions.**
    - TS: check `instanceof ReadableStream` or `'output' in response` before reading fields.
    - Python: use `with res as event_stream` only when `stream=True`.
    - Go: iterate `res.ChatStreamingResponse` / `ResponsesStreamingResponse` / `ImageStreamingResponse` and `defer ….Close()`.
    - The generated examples are inconsistent about the stream flag; always set it explicitly.
14. **Union responses.**
    - `files.list` and `files.delete` responses are unions keyed by `_shape` (TS `shape`). Check `shape === "openrouter"` first.
    - Go union responses expose `.Type` plus a typed field per variant, and `GetUnknownRaw()` for unknown types.
15. **Binary endpoints return streams, not JSON**: `files.download`, `containers.downloadContainerFileContent`, `tts.createSpeech`, `videoGeneration.getVideoContent`. TS returns `ReadableStream<Uint8Array>`, Python `httpx.Response`, Go `io.ReadCloser`. `files.download` works only for server-created files; uploaded files return 400.

**Pagination and retries:**
16. **Pagination differences.** Iterators exist only for the methods listed in [§3.2](#32-cross-sdk-conventions). `apiKeys.list` is offset-paginated in the spec but not shown iterating. `containers.listContainerFiles`, the `vault.list*` methods, `privateEndpoints.list` and `privateProviders.list` need manual paging. `batch.list` and `files.list` are cursor-based.
17. **Default retries cover 5XX and connection errors for every method, including POST inference** (backoff from 500 ms to 60 s, exponent 1.5, up to 1 h total). `batch.createBatches` retries only 429. Override per call for expensive non-idempotent work. Use `Idempotency-Key` on `privateEndpoints.create`.

**Doc inconsistencies and misc:**
18. **Conflicting docs.** The Management API Keys guide's TS snippet (`apiKeys.get(keyHash)`, `apiKeys.create({ name, limit })`) does not match the generated README (`apiKeys.get({ hash })`, `apiKeys.create({ requestBody: {...} })`). Trust the README.
19. **Attribution headers.**
    - TS: set `httpReferer`/`appTitle`/`appCategories` on the client.
    - Python: set them on the client or per call.
    - Go: no dedicated option; inject the headers through a custom `HTTPClient` passed to `openrouter.WithClient` ([§3.5](#35-go-sdk-githubcomopenrouterteamgo-sdk)).
    - `HTTP-Referer` is required for an app page; `localhost` URLs also need a title.
20. **TS is ESM-only.** In CommonJS, use `await import("@openrouter/sdk")`. For agent loops, import from `@openrouter/agent` rather than the deprecated `@openrouter/sdk` agent exports.
21. **Destructive and secret-bearing methods:**
    - `apiKeys.create` returns the plaintext key once.
    - `byok.create` / `byok.update` accept raw provider keys, which are never returned.
    - `vault.store*` methods accept secret values; responses return metadata only.
    - `files.delete` and `workspaces.delete` are irreversible. `batch.delete` works only on terminal batches.
    - Get explicit user approval before generating code that runs these against a live account.
22. **Go is beta; pin it.** Breaking changes can land in minor `0.x` releases, so pin the module version (e.g. `@v0.9.116`). The Python SDK is stable since v1.0.
23. **Debug logging leaks secrets.** TS `debugLogger`, Python `debug_logger` and `OPENROUTER_DEBUG=true` print request details, including API tokens in headers. Never enable them in production.
24. **README snippet bugs to avoid copying:**
    - The Python README's streaming examples iterate an unbound `event_stream`.
    - The Go README's retry example imports `"models/operations"` instead of `github.com/OpenRouterTeam/go-sdk/models/operations`.
    - The Go README's error example redeclares `var e` in one scope, which does not compile as written. Use distinct variable names.

Sources: https://github.com/OpenRouterTeam/typescript-sdk, https://github.com/OpenRouterTeam/python-sdk, https://github.com/OpenRouterTeam/go-sdk, https://openrouter.ai/docs/client-sdks/overview, https://openrouter.ai/docs/client-sdks/agent-migration, https://openrouter.ai/docs/client-sdks/usage-for-agents, https://openrouter.ai/docs/client-sdks/typescript/sdks/chat/README, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README, https://openrouter.ai/docs/client-sdks/go/sdks/chat/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/models/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/tools/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/decisions/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/files/README, https://openrouter.ai/docs/client-sdks/go/sdks/files/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrailpolicies/README, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/app-attribution, https://openrouter.ai/docs/guides/routing/routers/body-builder, https://openrouter.ai/docs/changelog
