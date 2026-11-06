# OpenRouter Developer Reference — Index

> For coding agents building OpenRouter integrations: Agent SDK (`@openrouter/agent`), Client SDKs (TypeScript `@openrouter/sdk`, Python `openrouter`, Go `go-sdk`), the full REST API, and every platform feature those APIs expose.
> Compiled from https://openrouter.ai/docs (Agent SDK, Client SDKs, API reference, feature guides) and the OpenAPI spec https://openrouter.ai/docs/openapi/openapi.yaml on 2026-11-06. Live sources win over these files.

## How to use these files

1. Find your task in **Find it fast** below and open only the linked file and subsection.
2. If the task isn't listed, scan the **Subsection map**: it gives each subsection's starting line, so you can read a slice (e.g. `offset`/`limit`) instead of a whole file.
3. Cross-references like `§9.3` are links to the file and subsection that hold the detail.
4. Before shipping, confirm exact field names against the live OpenAPI spec; every subsection ends with `Sources:` links to the official pages.
5. The same content is also available as one file: [`OpenRouter-Developer-Reference.md`](OpenRouter-Developer-Reference.md) in this folder (about 450K tokens; search it rather than loading it whole).

Basics: base URL `https://openrouter.ai/api/v1` · auth header `Authorization: Bearer $OPENROUTER_API_KEY` · optional attribution headers `HTTP-Referer`, `X-OpenRouter-Title` · model IDs `author/slug`, variants like `:free`/`:nitro`, aliases like `~anthropic/claude-sonnet-latest`.

## Files

| File | Section | Covers | Lines | Tokens |
|---|---|---|---|---|
| [01-orientation.md](01-orientation.md) | §1 | Orientation, choosing an integration, first requests, glossary | 200 | ~4K |
| [02-agent-sdk.md](02-agent-sdk.md) | §2 | Agent SDK (`@openrouter/agent`): callModel, tools, streaming, hooks, MCP, stop conditions, HITL, state | 4,267 | ~53K |
| [03-client-sdks.md](03-client-sdks.md) | §3 | Client SDKs (TypeScript, Python, Go): setup, config, errors, pagination, full method catalog | 1,847 | ~42K |
| [04-api-fundamentals.md](04-api-fundamentals.md) | §4 | API fundamentals: auth, headers, parameters, streaming/SSE, limits, errors, versioning, Responses & Embeddings guides, recent changes | 3,613 | ~44K |
| [05-endpoints-core-inference.md](05-endpoints-core-inference.md) | §5 | Endpoint reference: POST /chat/completions, /responses, /messages (every request/response field, stream events) | 1,514 | ~37K |
| [06-endpoints-other-inference.md](06-endpoints-other-inference.md) | §6 | Endpoint reference: embeddings, rerank, images, video, TTS, STT, batches, files, containers, SystemOne, alpha decisions/extractions, server-tools catalog | 1,777 | ~35K |
| [07-endpoints-platform.md](07-endpoints-platform.md) | §7 | Endpoint reference: models, endpoints, providers, generations, credits, API keys, analytics, OAuth, BYOK, benchmarks, datasets, external users, organization | 2,034 | ~37K |
| [08-endpoints-governance.md](08-endpoints-governance.md) | §8 | Endpoint reference: guardrails, guardrail policies, observability destinations, presets, private endpoints/providers, SCIM, vault, workspaces & budgets | 1,582 | ~36K |
| [09-features-routing-capabilities.md](09-features-routing-capabilities.md) | §9 | Features: model IDs & variants, provider routing, fallbacks, routers, multimodal I/O, tool calling, server tools, plugins, structured outputs | 3,588 | ~66K |
| [10-features-auth-cost-privacy.md](10-features-auth-cost-privacy.md) | §10 | Features: quickstart, app attribution, OAuth PKCE, workload identity, management keys, BYOK, prompt/response caching, reasoning, service tiers, presets, privacy/ZDR/in-region, spend & latency best practices | 3,183 | ~47K |
| [11-features-ops-integrations.md](11-features-ops-integrations.md) | §11 | Features: batch, files, containers, guardrails & policies, sensitive info, prompt injection, workspaces, SSO, SCIM, logs, broadcast, notifications, classifiers, MCP server, framework integrations | 3,449 | ~53K |
| [12-appendix-endpoint-index.md](12-appendix-endpoint-index.md) | Appendix | Appendix: every API operation (method, path, operationId, notes) with the section that documents it | 370 | ~5K |

Token counts are rough (bytes ÷ 4).

## Find it fast

| Task | Go to |
|---|---|
| Send a first request (curl, TS, Python, OpenAI SDK, Agent SDK) | [01-orientation.md → 1.3 First request in each surface](01-orientation.md#13-first-request-in-each-surface) |
| Choose REST vs Client SDK vs Agent SDK vs OpenAI SDK | [01-orientation.md → 1.2 Choose an integration surface](01-orientation.md#12-choose-an-integration-surface) |
| Build an agent loop with tools | [02-agent-sdk.md → 2.9 Tools](02-agent-sdk.md#29-tools) |
| Configure `callModel` options and read results | [02-agent-sdk.md → 2.3 callModel: signature, options, input formats, model selection](02-agent-sdk.md#23-callmodel-signature-options-input-formats-model-selection) |
| Stop an agent by step count, tool call, cost or tokens | [02-agent-sdk.md → 2.14 Stop conditions (stopWhen)](02-agent-sdk.md#214-stop-conditions-stopwhen) |
| Stream agent output (text, items, tool events) | [02-agent-sdk.md → 2.6 Streaming: every consumption pattern](02-agent-sdk.md#26-streaming-every-consumption-pattern) |
| Require human approval for tool calls; persist and resume state | [02-agent-sdk.md → 2.17 Tool approval and state persistence](02-agent-sdk.md#217-tool-approval-and-state-persistence) |
| Connect remote MCP servers to an agent | [02-agent-sdk.md → 2.11 MCP tools via @openrouter/mcp](02-agent-sdk.md#211-mcp-tools-via-openroutermcp) |
| Observe or change the agent loop with hooks | [02-agent-sdk.md → 2.12 Lifecycle hooks](02-agent-sdk.md#212-lifecycle-hooks) |
| Migrate agent imports from `@openrouter/sdk` to `@openrouter/agent` | [02-agent-sdk.md → 2.2 Migrating from @openrouter/sdk imports to @openrouter/agent](02-agent-sdk.md#22-migrating-from-openroutersdk-imports-to-openrouteragent) |
| Set up the TypeScript Client SDK | [03-client-sdks.md → 3.3 TypeScript SDK (@openrouter/sdk)](03-client-sdks.md#33-typescript-sdk-openroutersdk) |
| Set up the Python Client SDK (sync/async) | [03-client-sdks.md → 3.4 Python SDK (openrouter)](03-client-sdks.md#34-python-sdk-openrouter) |
| Set up the Go Client SDK | [03-client-sdks.md → 3.5 Go SDK (github.com/OpenRouterTeam/go-sdk)](03-client-sdks.md#35-go-sdk-githubcomopenrouterteamgo-sdk) |
| Look up an SDK method name for an endpoint (TS/Python/Go) | [03-client-sdks.md → 3.6 Method catalog (all resources)](03-client-sdks.md#36-method-catalog-all-resources) |
| Authenticate and set attribution headers | [04-api-fundamentals.md → 4.2 Authentication and headers](04-api-fundamentals.md#42-authentication-and-headers) |
| Look up sampling/generation parameters | [04-api-fundamentals.md → 4.3 Parameters](04-api-fundamentals.md#43-parameters) |
| Parse SSE streams, cancel streams, handle mid-stream errors | [04-api-fundamentals.md → 4.4 Streaming (Server-Sent Events)](04-api-fundamentals.md#44-streaming-server-sent-events) |
| Understand credit limits, rate limits, free-model limits | [04-api-fundamentals.md → 4.5 Limits (credits, budgets, rate limits)](04-api-fundamentals.md#45-limits-credits-budgets-rate-limits) |
| Handle error codes and debug failed requests | [04-api-fundamentals.md → 4.6 Errors and debugging](04-api-fundamentals.md#46-errors-and-debugging) |
| Every request/response field of Chat Completions | [05-endpoints-core-inference.md → 5.4 POST /chat/completions — Chat Completions](05-endpoints-core-inference.md#54-post-chatcompletions--chat-completions) |
| Every request/response field and stream event of the Responses API | [05-endpoints-core-inference.md → 5.5 POST /responses — Responses API (stateless OpenResponses)](05-endpoints-core-inference.md#55-post-responses--responses-api-stateless-openresponses) |
| Use the Anthropic Messages format | [05-endpoints-core-inference.md → 5.6 POST /messages — Anthropic Messages API](05-endpoints-core-inference.md#56-post-messages--anthropic-messages-api) |
| Pick between chat, responses and messages formats | [05-endpoints-core-inference.md → 5.7 Format comparison and choosing an endpoint](05-endpoints-core-inference.md#57-format-comparison-and-choosing-an-endpoint) |
| Embeddings and rerank | [06-endpoints-other-inference.md → 6.2 Embeddings](06-endpoints-other-inference.md#62-embeddings) |
| Generate images | [06-endpoints-other-inference.md → 6.4 Images](06-endpoints-other-inference.md#64-images) |
| Generate video (async jobs, polling, webhooks) | [06-endpoints-other-inference.md → 6.5 Video generation (async jobs)](06-endpoints-other-inference.md#65-video-generation-async-jobs) |
| Text-to-speech / speech-to-text | [06-endpoints-other-inference.md → 6.6 Text-to-speech (POST /audio/speech)](06-endpoints-other-inference.md#66-text-to-speech-post-audiospeech) |
| Run batch jobs | [06-endpoints-other-inference.md → 6.8 Batch API (async jobs)](06-endpoints-other-inference.md#68-batch-api-async-jobs) |
| List models, pricing, context length, supported parameters | [07-endpoints-platform.md → 7.2 Models](07-endpoints-platform.md#72-models) |
| Get a generation's exact cost and token stats | [07-endpoints-platform.md → 7.5 Generations (per-request stats, stored content, feedback)](07-endpoints-platform.md#75-generations-per-request-stats-stored-content-feedback) |
| Create, list, update and delete API keys programmatically | [07-endpoints-platform.md → 7.7 API keys](07-endpoints-platform.md#77-api-keys) |
| Query usage analytics | [07-endpoints-platform.md → 7.8 Analytics (activity, analytics meta & query)](07-endpoints-platform.md#78-analytics-activity-analytics-meta--query) |
| Manage BYOK provider credentials via API | [07-endpoints-platform.md → 7.10 BYOK provider credentials](07-endpoints-platform.md#710-byok-provider-credentials) |
| Configure guardrail policies (budget, model availability, moderation) | [08-endpoints-governance.md → 8.3 Guardrail Policies (v2)](08-endpoints-governance.md#83-guardrail-policies-v2) |
| Create and version presets via API | [08-endpoints-governance.md → 8.5 Presets](08-endpoints-governance.md#85-presets) |
| Manage workspaces, members and budgets via API | [08-endpoints-governance.md → 8.10 Workspaces, members and workspace budgets](08-endpoints-governance.md#810-workspaces-members-and-workspace-budgets) |
| Model variants (`:free`, `:nitro`, `:floor`, `:online`, `:thinking`…) | [09-features-routing-capabilities.md → 9.2 Model variants (:free, :nitro, :floor, :exacto, :online, :thinking, :extended, :batch)](09-features-routing-capabilities.md#92-model-variants-free-nitro-floor-exacto-online-thinking-extended-batch) |
| Control provider selection, sorting, data policy, max price | [09-features-routing-capabilities.md → 9.3 Provider routing: the provider object](09-features-routing-capabilities.md#93-provider-routing-the-provider-object) |
| Fallback models | [09-features-routing-capabilities.md → 9.6 Model fallbacks (models array)](09-features-routing-capabilities.md#96-model-fallbacks-models-array) |
| Let a router pick the model (Auto, Pareto, Fusion, Free…) | [09-features-routing-capabilities.md → 9.8 Routers overview: choosing a model-selection mechanism](09-features-routing-capabilities.md#98-routers-overview-choosing-a-model-selection-mechanism) |
| Send images, PDFs, audio or video as input | [09-features-routing-capabilities.md → 9.17 Multimodal overview: which API carries which modality](09-features-routing-capabilities.md#917-multimodal-overview-which-api-carries-which-modality) |
| Client-side function/tool calling | [09-features-routing-capabilities.md → 9.26 Client tool calling (function calling)](09-features-routing-capabilities.md#926-client-tool-calling-function-calling) |
| Server tools (web search, web fetch, shell, subagent…) | [09-features-routing-capabilities.md → 9.27 Server tools: concepts, catalog, limits, privacy](09-features-routing-capabilities.md#927-server-tools-concepts-catalog-limits-privacy) |
| Plugins (response healing, alignment, armor) | [09-features-routing-capabilities.md → 9.33 Plugins: the plugins array, defaults and precedence](09-features-routing-capabilities.md#933-plugins-the-plugins-array-defaults-and-precedence) |
| Structured outputs / JSON schema | [09-features-routing-capabilities.md → 9.38 Structured outputs (text.format / response_format)](09-features-routing-capabilities.md#938-structured-outputs-textformat--response_format) |
| Let users connect their own OpenRouter account (OAuth PKCE) | [10-features-auth-cost-privacy.md → 10.3 OAuth PKCE (users bring their own OpenRouter key)](10-features-auth-cost-privacy.md#103-oauth-pkce-users-bring-their-own-openrouter-key) |
| Use management keys | [10-features-auth-cost-privacy.md → 10.5 Management API keys](10-features-auth-cost-privacy.md#105-management-api-keys) |
| Bring your own provider keys (BYOK) | [10-features-auth-cost-privacy.md → 10.7 BYOK (bring your own provider keys)](10-features-auth-cost-privacy.md#107-byok-bring-your-own-provider-keys) |
| Prompt caching and cache savings | [10-features-auth-cost-privacy.md → 10.8 Prompt caching (provider-side)](10-features-auth-cost-privacy.md#108-prompt-caching-provider-side) |
| Response caching | [10-features-auth-cost-privacy.md → 10.9 Response caching (OpenRouter-side)](10-features-auth-cost-privacy.md#109-response-caching-openrouter-side) |
| Reasoning tokens and preserving reasoning across tool turns | [10-features-auth-cost-privacy.md → 10.10 Reasoning tokens](10-features-auth-cost-privacy.md#1010-reasoning-tokens) |
| Service tiers | [10-features-auth-cost-privacy.md → 10.11 Service tiers](10-features-auth-cost-privacy.md#1011-service-tiers) |
| Use presets in requests | [10-features-auth-cost-privacy.md → 10.15 Presets](10-features-auth-cost-privacy.md#1015-presets) |
| Zero data retention and privacy controls | [10-features-auth-cost-privacy.md → 10.17 Zero Data Retention (ZDR)](10-features-auth-cost-privacy.md#1017-zero-data-retention-zdr) |
| EU / in-region routing | [10-features-auth-cost-privacy.md → 10.18 In-region routing (EU / US data residency)](10-features-auth-cost-privacy.md#1018-in-region-routing-eu--us-data-residency) |
| Spend controls and capping shared agent keys | [10-features-auth-cost-privacy.md → 10.19 Spend controls (best practices)](10-features-auth-cost-privacy.md#1019-spend-controls-best-practices) |
| Batch API workflow end to end | [11-features-ops-integrations.md → 11.1 Batch API](11-features-ops-integrations.md#111-batch-api) |
| Upload files and use them in requests | [11-features-ops-integrations.md → 11.2 Files API (beta)](11-features-ops-integrations.md#112-files-api-beta) |
| Guardrails, sensitive info and prompt-injection detection | [11-features-ops-integrations.md → 11.4 Guardrails](11-features-ops-integrations.md#114-guardrails) |
| Send traces to observability tools (Broadcast) | [11-features-ops-integrations.md → 11.16 Broadcast](11-features-ops-integrations.md#1116-broadcast) |
| Connect the OpenRouter MCP server to a coding assistant | [11-features-ops-integrations.md → 11.19 OpenRouter MCP server](11-features-ops-integrations.md#1119-openrouter-mcp-server) |
| Use OpenRouter from the OpenAI SDK, Vercel AI SDK, LangChain, Mastra, PydanticAI… | [11-features-ops-integrations.md → 11.20 Framework integrations](11-features-ops-integrations.md#1120-framework-integrations) |
| Every API operation in one table | [12-appendix-endpoint-index.md](12-appendix-endpoint-index.md) |

## Subsection map

Line numbers are 1-based positions inside each file.

### 01-orientation.md

- L8: [1.1 What OpenRouter is](01-orientation.md#11-what-openrouter-is)
- L24: [1.2 Choose an integration surface](01-orientation.md#12-choose-an-integration-surface)
- L40: [1.3 First request in each surface](01-orientation.md#13-first-request-in-each-surface)
- L172: [1.4 Core concepts glossary](01-orientation.md#14-core-concepts-glossary)
- L193: [1.5 How to read this document](01-orientation.md#15-how-to-read-this-document)

### 02-agent-sdk.md

- L35: [2.1 What the Agent SDK is: packages, install, relationship to @openrouter/sdk](02-agent-sdk.md#21-what-the-agent-sdk-is-packages-install-relationship-to-openroutersdk)
- L155: [2.2 Migrating from @openrouter/sdk imports to @openrouter/agent](02-agent-sdk.md#22-migrating-from-openroutersdk-imports-to-openrouteragent)
- L287: [2.3 callModel: signature, options, input formats, model selection](02-agent-sdk.md#23-callmodel-signature-options-input-formats-model-selection)
- L486: [2.4 ModelResult: every accessor and method](02-agent-sdk.md#24-modelresult-every-accessor-and-method)
- L535: [2.5 The items-based streaming paradigm](02-agent-sdk.md#25-the-items-based-streaming-paradigm)
- L642: [2.6 Streaming: every consumption pattern](02-agent-sdk.md#26-streaming-every-consumption-pattern)
- L895: [2.7 Text generation and structured output](02-agent-sdk.md#27-text-generation-and-structured-output)
- L976: [2.8 Message format helpers (OpenAI chat, Anthropic Claude)](02-agent-sdk.md#28-message-format-helpers-openai-chat-anthropic-claude)
- L1134: [2.9 Tools](02-agent-sdk.md#29-tools)
- L1634: [2.10 Async tools: background and deferred execution](02-agent-sdk.md#210-async-tools-background-and-deferred-execution)
- L1908: [2.11 MCP tools via @openrouter/mcp](02-agent-sdk.md#211-mcp-tools-via-openroutermcp)
- L2123: [2.12 Lifecycle hooks](02-agent-sdk.md#212-lifecycle-hooks)
- L2465: [2.13 Doom-loop detection](02-agent-sdk.md#213-doom-loop-detection)
- L2604: [2.14 Stop conditions (stopWhen)](02-agent-sdk.md#214-stop-conditions-stopwhen)
- L2793: [2.15 Dynamic parameters (per-turn functions)](02-agent-sdk.md#215-dynamic-parameters-per-turn-functions)
- L2905: [2.16 nextTurnParams: tool-driven parameter changes (skills / plugins pattern)](02-agent-sdk.md#216-nextturnparams-tool-driven-parameter-changes-skills--plugins-pattern)
- L3053: [2.17 Tool approval and state persistence](02-agent-sdk.md#217-tool-approval-and-state-persistence)
- L3299: [2.18 API Reference (type signatures and exports, reproduced)](02-agent-sdk.md#218-api-reference-type-signatures-and-exports-reproduced)
- L3706: [2.19 Examples: weather tool and skills loader](02-agent-sdk.md#219-examples-weather-tool-and-skills-loader)
- L3986: [2.20 DevTools (telemetry capture and visualization) (pre-release)](02-agent-sdk.md#220-devtools-telemetry-capture-and-visualization-pre-release)
- L4050: [2.21 Usage for Agents (skills for AI coding assistants)](02-agent-sdk.md#221-usage-for-agents-skills-for-ai-coding-assistants)
- L4070: [2.22 Complete minimal agent, Gotchas, documentation inconsistencies](02-agent-sdk.md#222-complete-minimal-agent-gotchas-documentation-inconsistencies)

### 03-client-sdks.md

- L12: [3.1 Overview: packages, installation, stability](03-client-sdks.md#31-overview-packages-installation-stability)
- L121: [3.2 Cross-SDK conventions](03-client-sdks.md#32-cross-sdk-conventions)
- L351: [3.3 TypeScript SDK (@openrouter/sdk)](03-client-sdks.md#33-typescript-sdk-openroutersdk)
- L622: [3.4 Python SDK (openrouter)](03-client-sdks.md#34-python-sdk-openrouter)
- L903: [3.5 Go SDK (github.com/OpenRouterTeam/go-sdk)](03-client-sdks.md#35-go-sdk-githubcomopenrouterteamgo-sdk)
- L1267: [3.6 Method catalog (all resources)](03-client-sdks.md#36-method-catalog-all-resources)
- L1658: [3.7 Deprecated aliases, removed namespaces and renamed APIs](03-client-sdks.md#37-deprecated-aliases-removed-namespaces-and-renamed-apis)
- L1676: [3.8 DevTools (@openrouter/devtools), pre-release](03-client-sdks.md#38-devtools-openrouterdevtools-pre-release)
- L1738: [3.9 Usage for Agents (official skill)](03-client-sdks.md#39-usage-for-agents-official-skill)
- L1762: [3.10 Gotchas for coding agents](03-client-sdks.md#310-gotchas-for-coding-agents)

### 04-api-fundamentals.md

- L23: [4.1 API overview](04-api-fundamentals.md#41-api-overview)
- L487: [4.2 Authentication and headers](04-api-fundamentals.md#42-authentication-and-headers)
- L652: [4.3 Parameters](04-api-fundamentals.md#43-parameters)
- L725: [4.4 Streaming (Server-Sent Events)](04-api-fundamentals.md#44-streaming-server-sent-events)
- L1316: [4.5 Limits (credits, budgets, rate limits)](04-api-fundamentals.md#45-limits-credits-budgets-rate-limits)
- L1620: [4.6 Errors and debugging](04-api-fundamentals.md#46-errors-and-debugging)
- L2234: [4.7 Versioning policy](04-api-fundamentals.md#47-versioning-policy)
- L2266: [4.8 Responses API guide](04-api-fundamentals.md#48-responses-api-guide)
- L3072: [4.9 Embeddings guide](04-api-fundamentals.md#49-embeddings-guide)
- L3493: [4.10 Recent API changes (September 1 – October 29, 2026)](04-api-fundamentals.md#410-recent-api-changes-september-1--october-29-2026)

### 05-endpoints-core-inference.md

- L20: [5.1 Conventions common to all three endpoints](05-endpoints-core-inference.md#51-conventions-common-to-all-three-endpoints)
- L54: [5.2 Shared OpenRouter request fields](05-endpoints-core-inference.md#52-shared-openrouter-request-fields)
- L172: [5.3 Shared response extensions and error model](05-endpoints-core-inference.md#53-shared-response-extensions-and-error-model)
- L224: [5.4 POST /chat/completions — Chat Completions](05-endpoints-core-inference.md#54-post-chatcompletions--chat-completions)
- L654: [5.5 POST /responses — Responses API (stateless OpenResponses)](05-endpoints-core-inference.md#55-post-responses--responses-api-stateless-openresponses)
- L1074: [5.6 POST /messages — Anthropic Messages API](05-endpoints-core-inference.md#56-post-messages--anthropic-messages-api)
- L1388: [5.7 Format comparison and choosing an endpoint](05-endpoints-core-inference.md#57-format-comparison-and-choosing-an-endpoint)
- L1461: [5.8 Gotchas and common mistakes](05-endpoints-core-inference.md#58-gotchas-and-common-mistakes)

### 06-endpoints-other-inference.md

- L10: [6.1 Conventions for this section](06-endpoints-other-inference.md#61-conventions-for-this-section)
- L108: [6.2 Embeddings](06-endpoints-other-inference.md#62-embeddings)
- L232: [6.3 Rerank](06-endpoints-other-inference.md#63-rerank)
- L294: [6.4 Images](06-endpoints-other-inference.md#64-images)
- L481: [6.5 Video generation (async jobs)](06-endpoints-other-inference.md#65-video-generation-async-jobs)
- L690: [6.6 Text-to-speech (POST /audio/speech)](06-endpoints-other-inference.md#66-text-to-speech-post-audiospeech)
- L779: [6.7 Speech-to-text (POST /audio/transcriptions)](06-endpoints-other-inference.md#67-speech-to-text-post-audiotranscriptions)
- L890: [6.8 Batch API (async jobs)](06-endpoints-other-inference.md#68-batch-api-async-jobs)
- L1183: [6.9 Files API (beta)](06-endpoints-other-inference.md#69-files-api-beta)
- L1259: [6.10 Containers (sandbox container files, beta)](06-endpoints-other-inference.md#610-containers-sandbox-container-files-beta)
- L1340: [6.11 SystemOne (POST /systemone)](06-endpoints-other-inference.md#611-systemone-post-systemone)
- L1395: [6.12 Decisions (POST /api/alpha/decisions), **alpha**](06-endpoints-other-inference.md#612-decisions-post-apialphadecisions-alpha)
- L1515: [6.13 Extractions (POST /api/alpha/extractions), **alpha**](06-endpoints-other-inference.md#613-extractions-post-apialphaextractions-alpha)
- L1639: [6.14 Server tools catalog (GET /tools, GET /tools/{name})](06-endpoints-other-inference.md#614-server-tools-catalog-get-tools-get-toolsname)
- L1725: [6.15 Gotchas and common mistakes](06-endpoints-other-inference.md#615-gotchas-and-common-mistakes)

### 07-endpoints-platform.md

- L10: [7.1 Conventions for this section](07-endpoints-platform.md#71-conventions-for-this-section)
- L127: [7.2 Models](07-endpoints-platform.md#72-models)
- L430: [7.3 Endpoints (per-model provider endpoints, ZDR preview)](07-endpoints-platform.md#73-endpoints-per-model-provider-endpoints-zdr-preview)
- L550: [7.4 Providers](07-endpoints-platform.md#74-providers)
- L579: [7.5 Generations (per-request stats, stored content, feedback)](07-endpoints-platform.md#75-generations-per-request-stats-stored-content-feedback)
- L763: [7.6 Credits](07-endpoints-platform.md#76-credits)
- L787: [7.7 API keys](07-endpoints-platform.md#77-api-keys)
- L1035: [7.8 Analytics (activity, analytics meta & query)](07-endpoints-platform.md#78-analytics-activity-analytics-meta--query)
- L1201: [7.9 OAuth (PKCE key exchange, workload identity token exchange, JWKS)](07-endpoints-platform.md#79-oauth-pkce-key-exchange-workload-identity-token-exchange-jwks)
- L1399: [7.10 BYOK provider credentials](07-endpoints-platform.md#710-byok-provider-credentials)
- L1558: [7.11 Benchmarks](07-endpoints-platform.md#711-benchmarks)
- L1631: [7.12 Classifications](07-endpoints-platform.md#712-classifications)
- L1681: [7.13 Datasets (public usage data, CC BY 4.0)](07-endpoints-platform.md#713-datasets-public-usage-data-cc-by-40)
- L1816: [7.14 External users](07-endpoints-platform.md#714-external-users)
- L1894: [7.15 Organization](07-endpoints-platform.md#715-organization)
- L1948: [7.16 Gotchas and decision guide](07-endpoints-platform.md#716-gotchas-and-decision-guide)

### 08-endpoints-governance.md

- L10: [8.1 Conventions used by these endpoints](08-endpoints-governance.md#81-conventions-used-by-these-endpoints)
- L74: [8.2 Guardrails (v1 / legacy guardrail objects)](08-endpoints-governance.md#82-guardrails-v1--legacy-guardrail-objects)
- L303: [8.3 Guardrail Policies (v2)](08-endpoints-governance.md#83-guardrail-policies-v2)
- L651: [8.4 Observability destinations (Broadcast)](08-endpoints-governance.md#84-observability-destinations-broadcast)
- L825: [8.5 Presets](08-endpoints-governance.md#85-presets)
- L973: [8.6 Private endpoints](08-endpoints-governance.md#86-private-endpoints)
- L1158: [8.7 Private providers](08-endpoints-governance.md#87-private-providers)
- L1203: [8.8 SCIM group mappings, groups and sync jobs (management API)](08-endpoints-governance.md#88-scim-group-mappings-groups-and-sync-jobs-management-api)
- L1263: [8.9 Vault (host-bound secrets for workspaces and interns)](08-endpoints-governance.md#89-vault-host-bound-secrets-for-workspaces-and-interns)
- L1372: [8.10 Workspaces, members and workspace budgets](08-endpoints-governance.md#810-workspaces-members-and-workspace-budgets)
- L1529: [8.11 Gotchas](08-endpoints-governance.md#811-gotchas)

### 09-features-routing-capabilities.md

- L35: [9.1 Models: IDs, catalog API and model metadata](09-features-routing-capabilities.md#91-models-ids-catalog-api-and-model-metadata)
- L139: [9.2 Model variants (:free, :nitro, :floor, :exacto, :online, :thinking, :extended, :batch)](09-features-routing-capabilities.md#92-model-variants-free-nitro-floor-exacto-online-thinking-extended-batch)
- L213: [9.3 Provider routing: the provider object](09-features-routing-capabilities.md#93-provider-routing-the-provider-object)
- L451: [9.4 How default traffic routing works (load-balancing internals)](09-features-routing-capabilities.md#94-how-default-traffic-routing-works-load-balancing-internals)
- L484: [9.5 Auto Exacto and the :exacto variant (tool-calling quality routing)](09-features-routing-capabilities.md#95-auto-exacto-and-the-exacto-variant-tool-calling-quality-routing)
- L523: [9.6 Model fallbacks (models array)](09-features-routing-capabilities.md#96-model-fallbacks-models-array)
- L606: [9.7 Private endpoints and private providers (routing view)](09-features-routing-capabilities.md#97-private-endpoints-and-private-providers-routing-view)
- L639: [9.8 Routers overview: choosing a model-selection mechanism](09-features-routing-capabilities.md#98-routers-overview-choosing-a-model-selection-mechanism)
- L670: [9.9 Auto Router (openrouter/auto, openrouter/auto-beta)](09-features-routing-capabilities.md#99-auto-router-openrouterauto-openrouterauto-beta)
- L741: [9.10 Body Builder (openrouter/bodybuilder)](09-features-routing-capabilities.md#910-body-builder-openrouterbodybuilder)
- L788: [9.11 Free Models Router (openrouter/free)](09-features-routing-capabilities.md#911-free-models-router-openrouterfree)
- L806: [9.12 Pareto Router (openrouter/pareto-code)](09-features-routing-capabilities.md#912-pareto-router-openrouterpareto-code)
- L847: [9.13 Latest model resolution (~author/family-latest)](09-features-routing-capabilities.md#913-latest-model-resolution-authorfamily-latest)
- L873: [9.14 Fusion Router (openrouter/fusion, openrouter/fusion-flash)](09-features-routing-capabilities.md#914-fusion-router-openrouterfusion-openrouterfusion-flash)
- L935: [9.15 Jev Router (typesafe/jev-router) and author routers (<author>/auto)](09-features-routing-capabilities.md#915-jev-router-typesafejev-router-and-author-routers-authorauto)
- L994: [9.16 Switchyard (nvidia/switchyard)](09-features-routing-capabilities.md#916-switchyard-nvidiaswitchyard)
- L1094: [9.17 Multimodal overview: which API carries which modality](09-features-routing-capabilities.md#917-multimodal-overview-which-api-carries-which-modality)
- L1127: [9.18 Image inputs (vision)](09-features-routing-capabilities.md#918-image-inputs-vision)
- L1206: [9.19 PDF inputs and the file-parser plugin](09-features-routing-capabilities.md#919-pdf-inputs-and-the-file-parser-plugin)
- L1368: [9.20 Audio inputs and audio output](09-features-routing-capabilities.md#920-audio-inputs-and-audio-output)
- L1484: [9.21 Video inputs](09-features-routing-capabilities.md#921-video-inputs)
- L1550: [9.22 Image generation](09-features-routing-capabilities.md#922-image-generation)
- L1651: [9.23 Video generation (asynchronous)](09-features-routing-capabilities.md#923-video-generation-asynchronous)
- L1797: [9.24 Text-to-speech (POST /api/v1/audio/speech)](09-features-routing-capabilities.md#924-text-to-speech-post-apiv1audiospeech)
- L1925: [9.25 Speech-to-text (POST /api/v1/audio/transcriptions)](09-features-routing-capabilities.md#925-speech-to-text-post-apiv1audiotranscriptions)
- L2022: [9.26 Client tool calling (function calling)](09-features-routing-capabilities.md#926-client-tool-calling-function-calling)
- L2363: [9.27 Server tools: concepts, catalog, limits, privacy](09-features-routing-capabilities.md#927-server-tools-concepts-catalog-limits-privacy)
- L2511: [9.28 Server tools: web search (openrouter:web_search) and web fetch (openrouter:web_fetch)](09-features-routing-capabilities.md#928-server-tools-web-search-openrouterweb_search-and-web-fetch-openrouterweb_fetch)
- L2669: [9.29 Server tools: datetime, image generation, search models](09-features-routing-capabilities.md#929-server-tools-datetime-image-generation-search-models)
- L2765: [9.30 Server tools: apply patch, shell, bash (coding and execution)](09-features-routing-capabilities.md#930-server-tools-apply-patch-shell-bash-coding-and-execution)
- L2875: [9.31 Server tools: tool search (openrouter:tool_search) and deferred tools](09-features-routing-capabilities.md#931-server-tools-tool-search-openroutertool_search-and-deferred-tools)
- L2950: [9.32 Server tools: fusion, advisor, subagent (inner model calls)](09-features-routing-capabilities.md#932-server-tools-fusion-advisor-subagent-inner-model-calls)
- L3055: [9.33 Plugins: the plugins array, defaults and precedence](09-features-routing-capabilities.md#933-plugins-the-plugins-array-defaults-and-precedence)
- L3100: [9.34 Web Search plugin (id: "web", deprecated)](09-features-routing-capabilities.md#934-web-search-plugin-id-web-deprecated)
- L3157: [9.35 Response Healing plugin (id: "response-healing")](09-features-routing-capabilities.md#935-response-healing-plugin-id-response-healing)
- L3200: [9.36 Alignment plugin (id: "alignment", beta)](09-features-routing-capabilities.md#936-alignment-plugin-id-alignment-beta)
- L3344: [9.37 Armor plugin (id: "armor", beta)](09-features-routing-capabilities.md#937-armor-plugin-id-armor-beta)
- L3460: [9.38 Structured outputs (text.format / response_format)](09-features-routing-capabilities.md#938-structured-outputs-textformat--response_format)

### 10-features-auth-cost-privacy.md

- L27: [10.1 Quickstart: the canonical first request](10-features-auth-cost-privacy.md#101-quickstart-the-canonical-first-request)
- L212: [10.2 App attribution](10-features-auth-cost-privacy.md#102-app-attribution)
- L312: [10.3 OAuth PKCE (users bring their own OpenRouter key)](10-features-auth-cost-privacy.md#103-oauth-pkce-users-bring-their-own-openrouter-key)
- L500: [10.4 Workload identity federation (WIF)](10-features-auth-cost-privacy.md#104-workload-identity-federation-wif)
- L697: [10.5 Management API keys](10-features-auth-cost-privacy.md#105-management-api-keys)
- L877: [10.6 Security settings](10-features-auth-cost-privacy.md#106-security-settings)
- L920: [10.7 BYOK (bring your own provider keys)](10-features-auth-cost-privacy.md#107-byok-bring-your-own-provider-keys)
- L1162: [10.8 Prompt caching (provider-side)](10-features-auth-cost-privacy.md#108-prompt-caching-provider-side)
- L1397: [10.9 Response caching (OpenRouter-side)](10-features-auth-cost-privacy.md#109-response-caching-openrouter-side)
- L1532: [10.10 Reasoning tokens](10-features-auth-cost-privacy.md#1010-reasoning-tokens)
- L2251: [10.11 Service tiers](10-features-auth-cost-privacy.md#1011-service-tiers)
- L2398: [10.12 Message transforms (context compression, middle-out)](10-features-auth-cost-privacy.md#1012-message-transforms-context-compression-middle-out)
- L2437: [10.13 Router metadata (openrouter_metadata)](10-features-auth-cost-privacy.md#1013-router-metadata-openrouter_metadata)
- L2566: [10.14 Zero completion insurance](10-features-auth-cost-privacy.md#1014-zero-completion-insurance)
- L2582: [10.15 Presets](10-features-auth-cost-privacy.md#1015-presets)
- L2705: [10.16 Privacy: data collection and provider logging](10-features-auth-cost-privacy.md#1016-privacy-data-collection-and-provider-logging)
- L2741: [10.17 Zero Data Retention (ZDR)](10-features-auth-cost-privacy.md#1017-zero-data-retention-zdr)
- L2814: [10.18 In-region routing (EU / US data residency)](10-features-auth-cost-privacy.md#1018-in-region-routing-eu--us-data-residency)
- L2945: [10.19 Spend controls (best practices)](10-features-auth-cost-privacy.md#1019-spend-controls-best-practices)
- L3038: [10.20 Capping shared agent keys (best practices)](10-features-auth-cost-privacy.md#1020-capping-shared-agent-keys-best-practices)
- L3091: [10.21 Latency and performance (best practices)](10-features-auth-cost-privacy.md#1021-latency-and-performance-best-practices)
- L3168: [10.22 Uptime optimization (best practices)](10-features-auth-cost-privacy.md#1022-uptime-optimization-best-practices)

### 11-features-ops-integrations.md

- L18: [11.1 Batch API](11-features-ops-integrations.md#111-batch-api)
- L745: [11.2 Files API (beta)](11-features-ops-integrations.md#112-files-api-beta)
- L898: [11.3 Containers (beta)](11-features-ops-integrations.md#113-containers-beta)
- L1071: [11.4 Guardrails](11-features-ops-integrations.md#114-guardrails)
- L1289: [11.5 Guardrail Policies](11-features-ops-integrations.md#115-guardrail-policies)
- L1589: [11.6 Sensitive Info detection](11-features-ops-integrations.md#116-sensitive-info-detection)
- L1704: [11.7 Detected secret formats (Secrets preset)](11-features-ops-integrations.md#117-detected-secret-formats-secrets-preset)
- L1750: [11.8 Prompt injection detection and allowlist](11-features-ops-integrations.md#118-prompt-injection-detection-and-allowlist)
- L1843: [11.9 Workspaces](11-features-ops-integrations.md#119-workspaces)
- L1923: [11.10 Workspace budgets](11-features-ops-integrations.md#1110-workspace-budgets)
- L2017: [11.11 Single Sign-On (SSO)](11-features-ops-integrations.md#1111-single-sign-on-sso)
- L2057: [11.12 SCIM group mappings](11-features-ops-integrations.md#1112-scim-group-mappings)
- L2119: [11.13 Logs](11-features-ops-integrations.md#1113-logs)
- L2160: [11.14 Activity](11-features-ops-integrations.md#1114-activity)
- L2187: [11.15 Input & Output Logging (beta)](11-features-ops-integrations.md#1115-input--output-logging-beta)
- L2228: [11.16 Broadcast](11-features-ops-integrations.md#1116-broadcast)
- L2523: [11.17 Notifications](11-features-ops-integrations.md#1117-notifications)
- L2564: [11.18 Custom classifiers](11-features-ops-integrations.md#1118-custom-classifiers)
- L2680: [11.19 OpenRouter MCP server](11-features-ops-integrations.md#1119-openrouter-mcp-server)
- L2764: [11.20 Framework integrations](11-features-ops-integrations.md#1120-framework-integrations)

### 12-appendix-endpoint-index.md

- L10: [Anthropic Messages (§5)](12-appendix-endpoint-index.md#anthropic-messages-5)
- L16: [Chat (§5)](12-appendix-endpoint-index.md#chat-5)
- L22: [Responses (§5)](12-appendix-endpoint-index.md#responses-5)
- L28: [alpha.decisions (§6)](12-appendix-endpoint-index.md#alphadecisions-6)
- L34: [alpha.extractions (§6)](12-appendix-endpoint-index.md#alphaextractions-6)
- L40: [Batch (§6)](12-appendix-endpoint-index.md#batch-6)
- L49: [Containers (§6)](12-appendix-endpoint-index.md#containers-6)
- L58: [Embeddings (§6)](12-appendix-endpoint-index.md#embeddings-6)
- L65: [Files (§6)](12-appendix-endpoint-index.md#files-6)
- L75: [Images (§6)](12-appendix-endpoint-index.md#images-6)
- L83: [Rerank (§6)](12-appendix-endpoint-index.md#rerank-6)
- L89: [STT (§6)](12-appendix-endpoint-index.md#stt-6)
- L95: [SystemOne (§6)](12-appendix-endpoint-index.md#systemone-6)
- L101: [Tools (§6)](12-appendix-endpoint-index.md#tools-6)
- L108: [TTS (§6)](12-appendix-endpoint-index.md#tts-6)
- L114: [Video Generation (§6)](12-appendix-endpoint-index.md#video-generation-6)
- L123: [Analytics (§7)](12-appendix-endpoint-index.md#analytics-7)
- L131: [API Keys (§7)](12-appendix-endpoint-index.md#api-keys-7)
- L142: [Benchmarks (§7)](12-appendix-endpoint-index.md#benchmarks-7)
- L148: [BYOK (§7)](12-appendix-endpoint-index.md#byok-7)
- L158: [Classifications (§7)](12-appendix-endpoint-index.md#classifications-7)
- L164: [Credits (§7)](12-appendix-endpoint-index.md#credits-7)
- L171: [Datasets (§7)](12-appendix-endpoint-index.md#datasets-7)
- L179: [Endpoints (§7)](12-appendix-endpoint-index.md#endpoints-7)
- L186: [External Users (§7)](12-appendix-endpoint-index.md#external-users-7)
- L196: [Generations (§7)](12-appendix-endpoint-index.md#generations-7)
- L204: [Models (§7)](12-appendix-endpoint-index.md#models-7)
- L213: [OAuth (§7)](12-appendix-endpoint-index.md#oauth-7)
- L222: [Organization (§7)](12-appendix-endpoint-index.md#organization-7)
- L230: [Providers (§7)](12-appendix-endpoint-index.md#providers-7)
- L236: [Guardrail Policies (§8)](12-appendix-endpoint-index.md#guardrail-policies-8)
- L264: [Guardrails (§8)](12-appendix-endpoint-index.md#guardrails-8)
- L282: [Observability (§8)](12-appendix-endpoint-index.md#observability-8)
- L292: [Presets (§8)](12-appendix-endpoint-index.md#presets-8)
- L304: [Private Endpoints (§8)](12-appendix-endpoint-index.md#private-endpoints-8)
- L318: [Private Providers (§8)](12-appendix-endpoint-index.md#private-providers-8)
- L328: [SCIM (§8)](12-appendix-endpoint-index.md#scim-8)
- L341: [Vault (§8)](12-appendix-endpoint-index.md#vault-8)
- L355: [Workspaces (§8)](12-appendix-endpoint-index.md#workspaces-8)
