# OpenRouter Reference — 2. Agent SDK (@openrouter/agent)

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 01-orientation.md](01-orientation.md) · [Next: 03-client-sdks.md →](03-client-sdks.md)

## 2. Agent SDK (@openrouter/agent)

The Agent SDK is OpenRouter's TypeScript toolkit for agentic applications: a multi-turn inference loop (`callModel`) that executes your tools, feeds results back, tracks conversation state, and stops on configurable conditions. It sits on top of the Responses API (see [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) `POST /responses`) and the TypeScript Client SDK (see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go)).

Subsection map:

- 2.1 Packages, install, relationship to `@openrouter/sdk`
- 2.2 Migrating imports from `@openrouter/sdk` to `@openrouter/agent`
- 2.3 `callModel`: signature, every option, input formats, model selection
- 2.4 `ModelResult`: every accessor and method
- 2.5 The items-based streaming paradigm
- 2.6 Streaming: every consumption pattern, concurrent consumers, cancellation
- 2.7 Text generation and structured output
- 2.8 Message format helpers (OpenAI chat, Anthropic Claude)
- 2.9 Tools (`tool()`, regular / generator / manual / HITL / MCP-branded, context, execution, errors)
- 2.10 Async tools (background, deferred, task check-ins, steering, subagents)
- 2.11 MCP tools via `@openrouter/mcp`
- 2.12 Lifecycle hooks
- 2.13 Doom-loop detection
- 2.14 Stop conditions
- 2.15 Dynamic parameters
- 2.16 `nextTurnParams` (skills / plugins pattern)
- 2.17 Tool approval and state persistence
- 2.18 API Reference (type signatures and exports, reproduced)
- 2.19 Examples: weather tool and skills loader
- 2.20 DevTools (pre-release)
- 2.21 Usage for Agents (skills for coding assistants)
- 2.22 Complete minimal agent, Gotchas, documentation inconsistencies

### 2.1 What the Agent SDK is: packages, install, relationship to `@openrouter/sdk`

**What it does.** `@openrouter/agent` provides the primitives for agentic apps so you do not hand-wire conversation loops, tool dispatch, or state tracking:

- **Multi-turn agent loops**: `callModel` loops automatically until a stop condition is met or the model stops calling tools.
- **Tool definitions**: `tool()` helper with Zod schemas; the SDK validates arguments, executes, and returns results to the model.
- **Stop conditions**: `stepCountIs`, `hasToolCall`, `maxTokensUsed`, `maxCost`, `finishReasonIs`, or custom functions.
- **Conversation state**: messages, tool results, and context tracked across turns; optional persistence via `StateAccessor`.
- **Streaming**: real-time token output within each step; items-based streams; full event streams.
- **Dynamic parameters**: model, temperature, instructions, etc. can be functions evaluated per turn.
- **MCP tools**: remote Model Context Protocol servers via `@openrouter/mcp`.
- Also: lifecycle hooks, doom-loop detection, approval gates and HITL tools, async (background/deferred) tools, subagent tools, message-format converters.

`callModel` design points (from the Call Model overview): items-based model built on the Responses API (structured items: messages, tool calls, reasoning) instead of raw message chunks; multiple consumption patterns from a single call; automatic tool execution; full TypeScript inference for tool inputs, outputs, and events; conversion to/from OpenAI chat and Anthropic Claude message formats; a reusable stream architecture supporting concurrent consumers.

**Relationship to `@openrouter/sdk`.**

- `@openrouter/agent` depends on `@openrouter/sdk` and installs it for you. Its `OpenRouter` class accepts the same client options as the Client SDK (see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go) for client options).
- `@openrouter/agent` ships its own `OpenRouter` client class, so agent-only code does not need `@openrouter/sdk` as a direct dependency.
- Add `@openrouter/sdk` to your own dependencies if you also call REST endpoints directly (e.g. `client.models.list()`, `client.credits.get()`, `client.chat.send()`), so you control which version you get.
- The two packages are designed to be used side by side.

**Packages.**

| Language | Package | Install |
| - | - | - |
| TypeScript | `@openrouter/agent` (npm) | `npm install @openrouter/agent` |
| Python | `openrouter-agent-sdk` (PyPI) | `pip install openrouter-agent-sdk` |
| Go | `github.com/OpenRouterTeam/go-agent` | `go get github.com/OpenRouterTeam/go-agent` |

The Python and Go packages are ports of `@openrouter/agent` "kept in sync automatically"; language-specific details live in the repos `github.com/OpenRouterTeam/python-agent` and `github.com/OpenRouterTeam/go-agent`. All Agent SDK docs (and this section) use TypeScript.

```bash
npm install @openrouter/agent
pnpm add @openrouter/agent
yarn add @openrouter/agent
bun add @openrouter/agent
deno add npm:@openrouter/agent
```

Zod is used for schemas in every example; install it alongside (`npm install @openrouter/agent zod`; Deno: `deno add npm:@openrouter/agent npm:zod`). Most examples import `z` from `'zod'`; the lifecycle-hooks page imports from `'zod/v4'`. The docs do not state a minimum Zod version.

**Related packages.**

| Package | Purpose | Install |
| - | - | - |
| `@openrouter/mcp` | Wrap remote MCP servers as `callModel` tools ([§2.11](#211-mcp-tools-via-openroutermcp)) | `npm install @openrouter/mcp @openrouter/agent` |
| `@openrouter/devtools` | Pre-release telemetry hooks ([§2.20](#220-devtools-telemetry-capture-and-visualization-pre-release)) | `npm install --save-dev @openrouter/devtools` |
| `@openrouter/cli` | Provides the `openrouter devtools` viewer command ([§2.20](#220-devtools-telemetry-capture-and-visualization-pre-release)) | `npm install --global @openrouter/cli` |
| `@openrouter/sdk` | REST client ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)) | installed transitively; add explicitly to pin |

**Import paths (all documented).**

| Import path | Exports documented there |
| - | - |
| `@openrouter/agent` | Barrel: `OpenRouter`, `tool`, stop conditions, format helpers, state helpers, hooks, types (full list in [§2.18](#218-api-reference-type-signatures-and-exports-reproduced)) |
| `@openrouter/agent/openrouter` | `OpenRouter` client class |
| `@openrouter/agent/call-model` | standalone `callModel` function |
| `@openrouter/agent/model-result` | `ModelResult` |
| `@openrouter/agent/tool` | `tool` |
| `@openrouter/agent/tool-types` | `Tool` type, `hasExecuteFunction`, `isGeneratorTool` guards |
| `@openrouter/agent/stop-conditions` | `stepCountIs`, `hasToolCall`, `maxCost`, ... |
| `@openrouter/agent/async-params` | `CallModelInput` type (the migration page also lists `resolveAsyncFunctions` among "async parameters" imports) |
| `@openrouter/agent/conversation-state` | `serializeConversationState`, `deserializeConversationState`, `CONVERSATION_STATE_VERSION`, `UnsupportedStateVersionError`, `InvalidStateError` |
| `@openrouter/agent/hooks-manager` | `HooksManager` |

**When to use which.**

| | Agent SDK | Client SDKs |
| - | - | - |
| Focus | Agentic primitives: multi-turn loops, tools, stop conditions | Lean API client mirroring the REST API with full type safety |
| Use when | You want built-in agent loops, tool execution, state management | You want direct model calls and orchestrate yourself |
| Conversation state | Managed by `callModel` | You manage it |
| Tool execution | Automatic with `tool()` | You dispatch tool calls |
| Languages | TypeScript, Python, Go | TypeScript, Python, Go |

Use the Client SDKs ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)) for simple request/response calls without agent loops; they are lighter.

**Quick example.**

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
import { z } from 'zod';

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: z.object({
    location: z.string().describe('City name'),
  }),
  execute: async ({ location }) => {
    return { temperature: 72, condition: 'sunny', location };
  },
});

const result = openrouter.callModel({
  model: '~anthropic/claude-sonnet-latest',
  input: 'What is the weather in San Francisco?',
  tools: [weatherTool],
});

const text = await result.getText();
console.log(text);
```

One `callModel` invocation sends the input, receives the tool call, executes `get_weather`, feeds the result back, and returns the final response. The core loop:

1. Send `input` to the model.
2. If the model returns tool calls, execute them automatically.
3. Append tool results to the conversation.
4. Repeat until a stop condition is met or no more tool calls are made.

Model IDs used in the Agent SDK examples (`~anthropic/claude-sonnet-latest`, `openai/gpt-5-nano`, `anthropic/claude-sonnet-4.5`, ...) are ordinary OpenRouter model IDs; see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) for the model catalog and ID formats, including `~`-prefixed IDs.

Sources: https://openrouter.ai/docs/agent-sdk/overview, https://openrouter.ai/docs/agent-sdk/call-model/overview, https://openrouter.ai/docs/agent-sdk/agent-migration, https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools, https://openrouter.ai/docs/agent-sdk/dev-tools/devtools, https://openrouter.ai/docs/agent-sdk/call-model/examples/weather-tool

### 2.2 Migrating from `@openrouter/sdk` imports to `@openrouter/agent`

The agent toolkit (`callModel`, `tool`, stop conditions, etc.) moved from `@openrouter/sdk` to the standalone `@openrouter/agent` package, which includes its own `OpenRouter` client.

**Who must migrate:** code that imports any of these from `@openrouter/sdk`:

- `callModel` / `ModelResult`
- `tool` / `Tool` / tool type guards
- Stop conditions (`stepCountIs`, `hasToolCall`, etc.)
- Async parameters (`CallModelInput`, `resolveAsyncFunctions`)
- Conversation state helpers
- Message format converters (`fromClaudeMessages`, `fromChatMessages`, etc.)

If you only use the REST client for non-agent features (`client.chat.send(...)`, `client.models.list()`, etc.), no changes are needed.

**Step 1: install** `@openrouter/agent` (commands in [§2.1](#21-what-the-agent-sdk-is-packages-install-relationship-to-openroutersdk)).

**Step 2: update imports.**

Client class (drop `@openrouter/sdk` entirely if you only use agent features):

```diff
- import OpenRouter from '@openrouter/sdk';
- import { callModel } from '@openrouter/sdk/funcs/call-model';
+ import { OpenRouter } from '@openrouter/agent';

  const client = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
+
+ const result = client.callModel({
+   model: 'openai/gpt-4o',
+   input: 'Hello',
+ });
+ const text = await result.getText();
```

Note the import style change: the old client was a default import (`import OpenRouter from '@openrouter/sdk'`); the agent client is a named import (`import { OpenRouter } from '@openrouter/agent'`, or `from '@openrouter/agent/openrouter'`).

Core imports:

```diff
- import { callModel } from '@openrouter/sdk/funcs/call-model';
+ import { callModel } from '@openrouter/agent/call-model';

- import { ModelResult } from '@openrouter/sdk/lib/model-result';
+ import { ModelResult } from '@openrouter/agent/model-result';

- import { tool } from '@openrouter/sdk/lib/tool';
+ import { tool } from '@openrouter/agent/tool';
```

Tool types and guards:

```diff
- import type { Tool } from '@openrouter/sdk/lib/tool-types';
+ import type { Tool } from '@openrouter/agent/tool-types';

- import { hasExecuteFunction, isGeneratorTool } from '@openrouter/sdk/lib/tool-types';
+ import { hasExecuteFunction, isGeneratorTool } from '@openrouter/agent/tool-types';
```

Stop conditions:

```diff
- import { stepCountIs, hasToolCall, maxCost } from '@openrouter/sdk/lib/stop-conditions';
+ import { stepCountIs, hasToolCall, maxCost } from '@openrouter/agent/stop-conditions';
```

Async parameters:

```diff
- import type { CallModelInput } from '@openrouter/sdk/lib/async-params';
+ import type { CallModelInput } from '@openrouter/agent/async-params';
```

Conversation state and message formats (from the package barrel):

```diff
- import { createInitialState, updateState, fromClaudeMessages, fromChatMessages } from '@openrouter/sdk';
+ import { createInitialState, updateState, fromClaudeMessages, fromChatMessages } from '@openrouter/agent';
```

**Step 3: verify** with your type checker and tests (`npx tsc --noEmit`, `npm test`).

**Full import mapping reference.**

| Old import path | New import path |
| - | - |
| `@openrouter/sdk` (client class) | `@openrouter/agent` or `@openrouter/agent/openrouter` |
| `@openrouter/sdk/funcs/call-model` | `@openrouter/agent/call-model` |
| `@openrouter/sdk/lib/model-result` | `@openrouter/agent/model-result` |
| `@openrouter/sdk/lib/tool` | `@openrouter/agent/tool` |
| `@openrouter/sdk/lib/tool-types` | `@openrouter/agent/tool-types` |
| `@openrouter/sdk/lib/stop-conditions` | `@openrouter/agent/stop-conditions` |
| `@openrouter/sdk/lib/async-params` | `@openrouter/agent/async-params` |
| `@openrouter/sdk` (barrel: state, messages) | `@openrouter/agent` |

**Automated migration (subpath imports only).** The documented script rewrites subpath imports. Barrel imports (`from '@openrouter/sdk'`) and the client default import must be updated manually: a blanket replacement of the bare package name would also match subpath imports and break code.

```bash
# Linux (macOS: use `sed -i ''` instead of `sed -i`)
find src -name '*.ts' -o -name '*.tsx' | xargs sed -i \
  -e "s|@openrouter/sdk/funcs/call-model|@openrouter/agent/call-model|g" \
  -e "s|@openrouter/sdk/lib/model-result|@openrouter/agent/model-result|g" \
  -e "s|@openrouter/sdk/lib/tool-types|@openrouter/agent/tool-types|g" \
  -e "s|@openrouter/sdk/lib/tool|@openrouter/agent/tool|g" \
  -e "s|@openrouter/sdk/lib/stop-conditions|@openrouter/agent/stop-conditions|g" \
  -e "s|@openrouter/sdk/lib/async-params|@openrouter/agent/async-params|g"
```

- The `tool-types` replacement must run before `tool` to avoid partial matches.
- Afterwards, search for remaining `from '@openrouter/sdk'` (no `/` subpath) to find barrel and client imports needing manual edits.

**FAQ.**

- *Do I still need `@openrouter/sdk`?* Only for non-agent REST features such as `client.models.list()`, `client.credits.get()`, `client.chat.send()`.
- *Can I use both together?* Yes:
  ```typescript
  import { OpenRouter } from '@openrouter/sdk';
  import { callModel } from '@openrouter/agent/call-model';
  import { tool } from '@openrouter/agent/tool';
  ```
- *Will old imports keep working?* The agent exports will be removed from `@openrouter/sdk` in a future major version; migrate now.
- *API key / configuration changes?* None. Same API key and endpoints; no server-side changes.

**Migration skill.** The Agent SDK copy of this page offers an AI-coding-assistant skill that performs the import updates: `gh skill install OpenRouterTeam/skills openrouter-agent-migration` (documented only; see [§2.21](#221-usage-for-agents-skills-for-ai-coding-assistants)).

**Differences between the two copies of this page.** `https://openrouter.ai/docs/client-sdks/agent-migration` is identical to `https://openrouter.ai/docs/agent-sdk/agent-migration` except that the Client SDKs copy omits the migration-skill tip above. No other content differs.

Sources: https://openrouter.ai/docs/agent-sdk/agent-migration, https://openrouter.ai/docs/client-sdks/agent-migration, https://openrouter.ai/docs/agent-sdk/overview

### 2.3 `callModel`: signature, options, input formats, model selection

#### Signature and invocation forms

API reference signature:

```typescript
function callModel(request: CallModelInput, options?: RequestOptions): ModelResult
```

"Creates a response using the OpenResponses API with multiple consumption patterns." `callModel` returns a `ModelResult` synchronously (examples never `await` the call itself); you `await` the result's methods.

Two call styles appear in the docs:

```typescript
// 1. Method on the agent client (used on nearly every page)
import { OpenRouter } from '@openrouter/agent';
const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Hello' });

// 2. Standalone function taking the client first (used on the MCP Tools page)
import { callModel } from '@openrouter/agent/call-model';
const result2 = callModel(openrouter, { model: 'openai/gpt-5-nano', input: 'Hello' });
```

The API reference signature `callModel(request, options?)` does not show the client parameter that the MCP page passes first. Treat the method form `openrouter.callModel(request)` as the canonical, consistently documented one. How `RequestOptions` is passed to the method form is not shown in any example.

#### `RequestOptions`

| Name | Type | Description |
| - | - | - |
| `timeout` | `number` | Request timeout in milliseconds |
| `signal` | `AbortSignal` | Abort signal for cancellation |

#### `CallModelInput`: every documented option

Options from the API reference table (Yes\* = either `model` or `models` is required):

| Name | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | `string \| ((ctx: TurnContext) => string)` | Yes\* | | Model ID (e.g. `"openai/gpt-5-nano"`); may be a per-turn function ([§2.15](#215-dynamic-parameters-per-turn-functions)) |
| `models` | `string[]` | Yes\* | | Model fallback array; the SDK tries each in order until one succeeds (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) fallbacks) |
| `input` | `OpenResponsesInput` | Yes | | String or array of messages/items (formats below) |
| `instructions` | `string \| ((ctx: TurnContext) => string)` | No | | System instructions |
| `tools` | `Tool[]` | No | | Tools available to the model; use `as const` for full type inference |
| `maxToolRounds` | `MaxToolRounds` | No | | **Deprecated.** Tool execution limit: a number, or `(ctx: TurnContext) => boolean` (true = continue). `0` disables automatic execution (you get raw tool calls). Migrate to `stopWhen` |
| `stopWhen` | `StopWhen` | No | none: loop runs until a turn has no tool calls | Stop condition or array of them (any one stops) ([§2.14](#214-stop-conditions-stopwhen)) |
| `allowFinalResponse` | `boolean \| string` | No | `true` | When `stopWhen` halts mid-tool-call, run one more turn with `toolChoice: 'none'` plus the built-in `DEFAULT_FINAL_RESPONSE_DIRECTIVE`. A string overrides the directive wording; `''` makes the final turn without appending any message; `false` disables the final turn |
| `strictFinalResponse` | `boolean` | No | `false` | `true` = throw if the final response has empty `output` even after completed tool rounds (pre-0.8.0 behavior). `false` = retry the follow-up once, then resolve with empty text. Runs with no completed tool work always throw on empty output |
| `temperature` | `number \| ((ctx: TurnContext) => number)` | No | | Sampling temperature (0-2) |
| `maxOutputTokens` | `number \| ((ctx: TurnContext) => number)` | No | | Max tokens to generate |
| `topP` | `number` | No | | Top-p sampling |
| `topK` | `number` | No | | Top-k sampling |
| `text` | `ResponseTextConfig` | No | | Text format configuration, e.g. `{ format: { type: 'json_object' } }` ([§2.7](#27-text-generation-and-structured-output)) |
| `provider` | `ProviderPreferences` | No | | Provider routing and configuration (table below; full semantics in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) |
| `metadata` | `Record<string, string>` | No | | Request metadata |
| `toolChoice` | `ToolChoice` | No | | Tool choice configuration |
| `parallelToolCalls` | `boolean` | No | | Enable parallel tool calling |
| `reasoning` | `ReasoningConfig` | No | | Reasoning configuration (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) reasoning tokens) |
| `promptCacheKey` | `string` | No | | Cache key for prompt caching (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)) |
| `previousResponseId` | `string` | No | | Context from a previous response |
| `include` | `string[]` | No | | Include extra fields in the response |
| `background` | `boolean` | No | | Run the request in background (a Responses API request flag; unrelated to async-tool `lifecycle: 'background'`, [§2.10](#210-async-tools-background-and-deferred-execution)) |
| `safetyIdentifier` | `string` | No | | User safety identifier |
| `serviceTier` | `string` | No | | Service tier preference (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)) |
| `truncation` | `string` | No | | Truncation mode |
| `plugins` | `Plugin[]` | No | | Enabled plugins (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) plugins) |
| `user` | `string` | No | | End-user identifier |
| `sessionId` | `string` | No | | Session identifier |
| `store` | `boolean` | No | | Store request data |
| `context` | `ContextInput<ToolContextMap>` | No | | Tool context keyed by tool name; static, sync fn, or async fn ([§2.9](#29-tools)) |
| `hooks` | `InlineHookConfig \| HooksManager` | No | | Agent lifecycle hooks ([§2.12](#212-lifecycle-hooks)) |

Additional `callModel` options documented on feature pages (not in the API reference table):

| Name | Type (as documented) | Default | Description | Page |
| - | - | - | - | - |
| `state` | `StateAccessor` | | Load/save conversation state across invocations; required for deferred tools | Tool Approval & State ([§2.17](#217-tool-approval-and-state-persistence)) |
| `requireApproval` | `(toolCall, context) => boolean` | | Call-level approval gate; takes priority over tool-level `requireApproval` | [§2.17](#217-tool-approval-and-state-persistence) |
| `approveToolCalls` | `string[]` (tool call IDs) | | Approve pending calls when resuming an `awaiting_approval` state | [§2.17](#217-tool-approval-and-state-persistence) |
| `rejectToolCalls` | `string[]` (tool call IDs) | | Reject pending calls; the model receives a rejection error | [§2.17](#217-tool-approval-and-state-persistence) |
| `sharedContextSchema` | Zod object schema | | Runtime validation for `context.shared` | Tools ([§2.9](#29-tools)) |
| `doomLoop` | `boolean \| { ladder?, text?, escalation? }` | off | Doom-loop detection; `true` = recommended defaults (observe@2, block@3, stop@6) | [§2.13](#213-doom-loop-detection) |
| `asyncTools` | `{ onRunEnd?, drainTimeoutMs?, maxDrainTurns?, checkins?, maxTranscriptChars? }` | `onRunEnd: 'drain'`, `checkins: true`, `maxTranscriptChars: 20_000` | Async-tool run-level behavior | [§2.10](#210-async-tools-background-and-deferred-execution) |
| `toolTimeoutMs` | `number` | | Default per-tool deadline | [§2.10](#210-async-tools-background-and-deferred-execution) |
| `toolConcurrency` | `{ round?: number; background?: number }` | | Max simultaneous calls per round / max detached background tasks | [§2.10](#210-async-tools-background-and-deferred-execution) |

The dynamic-parameters page states that **any** `callModel` parameter can be a function `(ctx: TurnContext) => T | Promise<T>` (its examples include async `temperature`, `instructions`, and `provider`). The API reference table types only `model`, `instructions`, `temperature`, and `maxOutputTokens` as function-capable. Prefer function forms for those four when type-checking matters.

#### `ProviderPreferences`

| Name | Type | Description |
| - | - | - |
| `allowFallbacks` | `boolean` | Allow backup providers when the primary is unavailable (default `true`) |
| `requireParameters` | `boolean` | Only use providers that support all requested parameters |
| `dataCollection` | `"allow" \| "deny"` | Data collection policy |
| `order` | `string[]` | Custom provider routing order |
| `only` | `string[]` | Restrict to specific providers |
| `ignore` | `string[]` | Exclude specific providers |
| `quantizations` | `string[]` | Filter by quantization levels |
| `sort` | `string` | Load-balancing strategy (e.g. `"throughput"`) |
| `maxPrice` | `object` | Maximum price limits |
| `preferredMinThroughput` | `number` | Minimum tokens-per-second preference |
| `preferredMaxLatency` | `number` | Maximum latency preference |

Field semantics are covered in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Provider routing. Note the camelCase names used by the SDK.

#### Input formats

`input` (`OpenResponsesInput`) accepts:

```typescript
// 1. Simple string: becomes a single user message
openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'What is the speed of light?' });

// 2. Message array (OpenResponses format) for multi-turn history
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: [
    { role: 'user', content: 'My name is Alice.' },
    { role: 'assistant', content: 'Hello Alice! How can I help you today?' },
    { role: 'user', content: 'What is my name?' },
  ],
});

// 3. Items with typed content parts (multimodal)
openrouter.callModel({
  model: 'openai/gpt-5.2',
  input: [
    {
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: 'What is in this image?' },
        { type: 'input_image', imageUrl: 'https://example.com/image.jpg', detail: 'auto' },
      ],
    },
  ],
});

// 4. Empty array: resuming an approval-paused state (no new user input), see §2.17
openrouter.callModel({ model: 'openai/gpt-4o', input: [], tools, state, approveToolCalls: ids });
```

Other documented input shapes:

- **`function_call_output` items** to resume HITL-paused calls ([§2.9](#29-tools), [§2.17](#217-tool-approval-and-state-persistence)). The exact item field names for this case are not spelled out on the HITL pages; the item stream shows `function_call_output` items carrying `output`, and function calls carrying `callId`.
- **Converted histories** from `fromChatMessages(...)` / `fromClaudeMessages(...)` ([§2.8](#28-message-format-helpers-openai-chat-anthropic-claude)).

Input content-part field names are camelCase in the SDK (`imageUrl`, not `image_url`). For other multimodal input types see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) multimodal inputs.

#### System instructions

```typescript
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  instructions: 'You are a helpful coding assistant. Be concise and provide working code examples.',
  input: 'How do I read a file in Node.js?',
});
```

`instructions` can also be a (possibly async) function of `TurnContext` ([§2.15](#215-dynamic-parameters-per-turn-functions)), and tools can rewrite it for the next turn via `nextTurnParams.instructions` ([§2.16](#216-nextturnparams-tool-driven-parameter-changes-skills--plugins-pattern)).

#### Model selection

```typescript
// Single model
openrouter.callModel({ model: 'anthropic/claude-sonnet-4.5', input: 'Hello!' });

// Fallback list: tried in order until one succeeds
openrouter.callModel({
  models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5.2', 'google/gemini-pro'],
  input: 'Hello!',
});

// Per-turn choice
openrouter.callModel({
  model: (ctx) => (ctx.numberOfTurns > 3 ? 'openai/gpt-5.2' : 'openai/gpt-5-nano'),
  input: 'Hello!',
  tools: [myTool],
});
```

Other ways the model can change mid-run: `nextTurnParams.model` ([§2.16](#216-nextturnparams-tool-driven-parameter-changes-skills--plugins-pattern)) and doom-loop `escalation.model` ([§2.13](#213-doom-loop-detection)).

#### Generation parameters

```typescript
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Write a creative story.',
  temperature: 0.7,      // 0 = deterministic, 2 = very creative
  maxOutputTokens: 1000, // maximum tokens to generate
  topP: 0.9,             // top-p sampling
});
```

Sources: https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/overview, https://openrouter.ai/docs/agent-sdk/call-model/text-generation, https://openrouter.ai/docs/agent-sdk/call-model/dynamic-parameters, https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/stop-conditions, https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools

### 2.4 `ModelResult`: every accessor and method

`ModelResult` wraps one `callModel` run and offers multiple consumption patterns. Streams are backed by a `ReusableReadableStream`, so several consumers can read the same result concurrently and each receives all events ([§2.6](#26-streaming-every-consumption-pattern)).

| Method | Return type | Behavior | Documented on |
| - | - | - | - |
| `getText()` | `Promise<string>` | Final text after all tool execution completes | API ref, Text Generation |
| `getResponse()` | `Promise<OpenResponsesNonStreamingResponse>` | Full response: `output` array and `usage` (`inputTokens`, `outputTokens`, `cachedTokens`); "includes all execution rounds" | API ref, Tools |
| `getTextStream()` | `AsyncIterableIterator<string>` | Text deltas (a few characters or a word each) | API ref, Streaming |
| `getReasoningStream()` | `AsyncIterableIterator<string>` | Reasoning deltas for reasoning models | API ref, Streaming |
| `getItemsStream()` | async iterable of `StreamableOutputItem` | **Recommended.** Complete items re-emitted by ID with progressively updated content ([§2.5](#25-the-items-based-streaming-paradigm)) | Items, Streaming (not in API ref) |
| `getNewMessagesStream()` | `AsyncIterableIterator<ResponsesOutputMessage \| OpenResponsesFunctionCallOutput>` | **Deprecated** (use `getItemsStream()`). Cumulative message snapshots plus tool outputs | API ref, Streaming |
| `getFullResponsesStream()` | `AsyncIterableIterator<EnhancedResponseStreamEvent>` | Every raw Responses stream event plus SDK tool events (`tool.preliminary_result`, `tool.result`, `tool.async_started`, `tool.async_settled`) | API ref, Streaming, Async Tools |
| `getToolCalls()` | `Promise<ParsedToolCall[]>` | All tool calls from the initial response (before auto-execution); also surfaces calls paused by HITL tools | API ref, Tools |
| `getToolCallsStream()` | `AsyncIterableIterator<ParsedToolCall>` | Tool calls as they complete | API ref, Tools |
| `getToolStream()` | `AsyncIterableIterator<ToolStreamEvent>` | Tool-argument deltas (`delta`) and generator progress (`preliminary_result`) | API ref, Tools |
| `getContextUpdates()` | `AsyncGenerator<ToolContextMap<TTools>>` | Context snapshot each time a tool calls `setContext()`; completes when tool execution finishes | API ref, Tools |
| `cancel()` | `Promise<void>` | Cancel the stream and all consumers | API ref, Streaming |
| `requiresApproval()` | awaited in examples (resolves to boolean) | Whether the run paused for tool approval | Tool Approval & State |
| `getPendingToolCalls()` | awaited in examples (array of `{ id, name, arguments }`) | Calls awaiting approval (also paused HITL calls) | Tool Approval & State, Tools |
| `getDoomLoopVerdict()` | awaited; falsy when no detection stopped the run | Verdict object with at least `message` | Doom-Loop Detection |
| `getAsyncTasks()` | snapshot (not awaited in example) | Pending async tasks (`taskId`, `status`, `lastLog`, ...) | Async Tools |
| `sendToTask(taskId, message)` | not documented | Steer an in-process async task; throws for deferred tasks | Async Tools |
| `cancelTask(taskId, reason)` | `boolean` | Cancel a task; `true` when a working task was cancelled | Async Tools |

`StreamableOutputItem` is imported as a type from `@openrouter/agent` in the Items and Streaming pages, but is not in the API reference's export list.

```typescript
const result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'What is the capital of France?' });

const text = await result.getText();           // "The capital of France is Paris."
const response = await result.getResponse();
console.log(response.usage);                   // { inputTokens, outputTokens, cachedTokens }

for await (const delta of result.getTextStream()) process.stdout.write(delta);
for await (const delta of result.getReasoningStream()) console.log('Reasoning:', delta);
for await (const item of result.getItemsStream()) console.log('Item update:', item.type, item.id);
for await (const event of result.getFullResponsesStream()) console.log('Event:', event.type);

const toolCalls = await result.getToolCalls();
for await (const toolCall of result.getToolCallsStream()) console.log(toolCall.name, toolCall.arguments);
for await (const event of result.getToolStream()) {
  if (event.type === 'delta') process.stdout.write(event.content);
  else if (event.type === 'preliminary_result') console.log('Progress:', event.result);
}
```

Sources: https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/overview, https://openrouter.ai/docs/agent-sdk/call-model/streaming, https://openrouter.ai/docs/agent-sdk/call-model/items, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/text-generation

### 2.5 The items-based streaming paradigm

`callModel` is built on the Responses API, which uses an **items-based model** rather than the messages-based model of OpenAI Chat or the Vercel AI SDK. Items are emitted **multiple times with the same ID but progressively updated content**. Replace the entire item by ID; do not accumulate chunks.

| Traditional (OpenAI Chat, Vercel AI) | `callModel` (items-native) |
| - | - |
| Stream chunks, accumulate text | Stream items, replace by ID |
| Single message type | Multiple item types |
| Reconstruct content at end | Each emission is complete |
| Manual state management | Natural React state updates |

#### Item types yielded by `getItemsStream()`

| `type` | Description | Notable fields shown in examples |
| - | - | - |
| `message` | Assistant text responses | `id`, `content: [{ type: 'output_text', text }]` |
| `function_call` | Tool invocations with arguments | `callId`, `name`, `arguments` (JSON string, grows over emissions) |
| `reasoning` | Model thinking (extended thinking) | `summary` |
| `web_search_call` | Web search operations (server tool, see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) | |
| `file_search_call` | File search operations | |
| `image_generation_call` | Image generation operations | |
| `function_call_output` | Results from executed tools | `output` |

#### Lifecycle of an item

Each iteration yields a **complete** item; the latest emission supersedes the previous one with the same ID:

```typescript
// Iteration 1
{ id: "msg_123", type: "message", content: [{ type: "output_text", text: "Hello" }] }
// Iteration 2
{ id: "msg_123", type: "message", content: [{ type: "output_text", text: "Hello world" }] }
// Iteration 3
{ id: "msg_123", type: "message", content: [{ type: "output_text", text: "Hello world!" }] }
```

Function calls follow the same pattern (arguments grow until they are complete JSON):

```typescript
{ type: "function_call", callId: "call_456", arguments: "{\"q" }
{ type: "function_call", callId: "call_456", arguments: "{\"query\": \"weather" }
{ type: "function_call", callId: "call_456", arguments: "{\"query\": \"weather in Paris\"}" }
```

Lifecycle in a tool-using run, as implied by the docs: `reasoning` / `message` / `function_call` items stream in (possibly in parallel); after the SDK executes a tool, a `function_call_output` item appears; the next model turn produces new items. The items approach is most useful when the model produces several outputs at once (thinking + tool calls + text).

#### React integration (replace by ID)

```tsx
import { useState } from 'react';
import type { StreamableOutputItem } from '@openrouter/agent';
import { OpenRouter } from '@openrouter/agent';

const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

function Chat() {
  const [items, setItems] = useState<Map<string, StreamableOutputItem>>(new Map());

  async function handleSubmit(input: string) {
    const result = client.callModel({ model: '~anthropic/claude-sonnet-latest', input });
    for await (const item of result.getItemsStream()) {
      // Replace the entire item by ID; React re-renders automatically
      setItems((prev) => new Map(prev).set(item.id, item));
    }
  }

  return <div>{[...items.values()].map((item) => <ItemRenderer key={item.id} item={item} />)}</div>;
}

function ItemRenderer({ item }: { item: StreamableOutputItem }) {
  switch (item.type) {
    case 'message': return <MessageItem message={item} />;
    case 'function_call': return <ToolCallItem call={item} />;
    case 'reasoning': return <ReasoningItem reasoning={item} />;
    default: return null;
  }
}
```

Documented benefits: no chunk accumulation; natural React updates; concurrent item handling (function calls and messages stream in parallel); works with React 18+ (concurrent features, Suspense); type-safe for all item types.

Contrast with chunk accumulation:

```tsx
// Traditional: accumulate manually
for await (const chunk of result.getTextStream()) setText((prev) => prev + chunk);
// Items: replace by ID
for await (const item of result.getItemsStream()) setItems((prev) => new Map(prev).set(item.id, item));
```

#### Migrating from `getNewMessagesStream()` (deprecated)

```typescript
// Before (deprecated)
for await (const message of result.getNewMessagesStream()) {
  if (message.type === 'message') console.log(message.content);
}
// After
for await (const item of result.getItemsStream()) {
  if (item.type === 'message') console.log(item.content);
}
```

`getItemsStream()` includes every item type (reasoning, function calls, etc.); `getNewMessagesStream()` surfaced only messages (and tool outputs).

Sources: https://openrouter.ai/docs/agent-sdk/call-model/items, https://openrouter.ai/docs/agent-sdk/call-model/streaming

### 2.6 Streaming: every consumption pattern

All streams come from the same underlying `ReusableReadableStream`, so you can attach any number of consumers to one `ModelResult`.

#### Decision guide

| Need | Use |
| - | - |
| Print tokens as they arrive | `getTextStream()` |
| Show model thinking | `getReasoningStream()` |
| Render a UI with messages, tool calls, reasoning, tool outputs | `getItemsStream()` (recommended) |
| Raw protocol events, tool results, async-task events | `getFullResponsesStream()` |
| Tool calls as structured objects | `getToolCallsStream()` (or `getToolCalls()` after completion) |
| Tool argument deltas + generator-tool progress | `getToolStream()` |
| Observe `setContext()` mutations | `getContextUpdates()` |
| Final text / usage only | `getText()` / `getResponse()` |

#### `getTextStream()`

```typescript
import { OpenRouter } from '@openrouter/agent';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Write a short poem about the ocean.',
});

for await (const delta of result.getTextStream()) {
  process.stdout.write(delta);
}
```

#### `getReasoningStream()`

For reasoning-capable models (e.g. o3, Claude with thinking):

```typescript
const result = openrouter.callModel({
  model: 'openai/o3',
  input: 'Solve this step by step: If x + 5 = 12, what is x?',
});

for await (const delta of result.getReasoningStream()) process.stdout.write(delta);
const text = await result.getText(); // the same result can still be read afterwards
```

#### `getItemsStream()` (recommended)

```typescript
import type { StreamableOutputItem } from '@openrouter/agent';

const result = openrouter.callModel({
  model: '~anthropic/claude-sonnet-latest',
  input: 'Hello!',
  tools: [myTool],
});

for await (const item of result.getItemsStream()) {
  switch (item.type) {
    case 'message': console.log('Message:', item.content); break;
    case 'function_call': console.log('Tool call:', item.name, item.arguments); break;
    case 'reasoning': console.log('Thinking:', item.summary); break;
    case 'function_call_output': console.log('Tool result:', item.output); break;
  }
}
```

Yields all item types listed in [§2.5](#25-the-items-based-streaming-paradigm). Replace items by ID rather than accumulating.

#### `getNewMessagesStream()` (deprecated)

```typescript
for await (const message of result.getNewMessagesStream()) {
  if (message.type === 'message') console.log('Assistant message:', message.content);
  else if (message.type === 'function_call_output') console.log('Tool result:', message.output);
}
```

Yields `ResponsesOutputMessage` (assistant text/content updates) and `OpenResponsesFunctionCallOutput` (tool execution results, after tools complete).

#### `getFullResponsesStream()`

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Search for documents',
  tools: [searchTool], // generator tool with eventSchema
});

for await (const event of result.getFullResponsesStream()) {
  switch (event.type) {
    case 'response.output_text.delta':
      process.stdout.write(event.delta);
      break;
    case 'response.function_call_arguments.delta':
      console.log('Tool argument delta:', event.delta);
      break;
    case 'response.completed':
      console.log('Response complete');
      break;
    case 'tool.preliminary_result': // intermediate progress from generator tools
      console.log('Progress:', event.result);
      break;
    case 'tool.result': // final result when tool execution completes
      console.log('Tool completed:', event.toolCallId, event.result);
      if (event.preliminaryResults) console.log('Preliminary results:', event.preliminaryResults);
      break;
  }
}
```

Event types on the full stream (`EnhancedResponseStreamEvent = OpenResponsesStreamEvent | ToolPreliminaryResultEvent`, plus the SDK tool events below):

| Event `type` | Description | Fields shown |
| - | - | - |
| `response.created` | Response object created | |
| `response.in_progress` | Generation started | |
| `response.output_text.delta` | Text content chunk | `delta` |
| `response.output_text.done` | Text content complete | |
| `response.reasoning.delta` | Reasoning content chunk | |
| `response.reasoning.done` | Reasoning complete | |
| `response.function_call_arguments.delta` | Tool-call argument chunk | `delta` |
| `response.function_call_arguments.done` | Tool-call arguments complete | |
| `response.completed` | Full response complete | |
| `tool.preliminary_result` | Progress from generator tools / async-task logs (intermediate yields, `ctx.log` entries) | `toolCallId`, `result` |
| `tool.result` | Final result from tool execution (`ToolResultEvent`) | `toolCallId`, `source`, `result`, `timestamp`, `preliminaryResults?` |
| `tool.async_started` | Async task detached past its grace window ([§2.10](#210-async-tools-background-and-deferred-execution)) | `taskId`, `toolName` |
| `tool.async_settled` | Async task result (or error) delivered | `taskId` |

For the raw Responses API SSE event catalog see [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) / [§4](04-api-fundamentals.md#4-api-fundamentals) streaming.

#### `getToolCallsStream()`

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'What is the weather in Paris and Tokyo?',
  tools: [weatherTool],
  maxToolRounds: 0, // don't auto-execute; just get tool calls
});

for await (const toolCall of result.getToolCallsStream()) {
  console.log(toolCall.name, toolCall.arguments, toolCall.id);
}
```

#### `getToolStream()`

```typescript
for await (const event of result.getToolStream()) {
  if (event.type === 'delta') {
    process.stdout.write(event.content); // raw argument deltas
  } else if (event.type === 'preliminary_result') {
    console.log(`Progress (${event.toolCallId}):`, event.result); // generator-tool progress
  }
}
```

API reference type: `ToolStreamEvent = { type: 'delta'; content: string } | { type: 'preliminary_result'; toolCallId: string; result: unknown }`.

Inconsistency: the MCP Tools page iterates `getToolStream()` and checks for `event.type === 'tool.result'` (with `source`, `toolName`) and `event.type === 'tool.progress'` (with `source`, `toolName`, `progress`). Those event types are not in the documented `ToolStreamEvent` union. If a `tool.result` / `tool.progress` check does not narrow on `getToolStream()`, use `getFullResponsesStream()`, where `tool.result` is documented.

#### Concurrent consumers

```typescript
const result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Write a story.' });

const [text, response] = await Promise.all([
  (async () => {
    let text = '';
    for await (const delta of result.getTextStream()) text += delta;
    return text;
  })(),
  result.getResponse(),
]);

console.log('Text length:', text.length);
console.log('Token usage:', response.usage);
```

#### Cancellation

```typescript
const result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Write a very long essay...' });

let charCount = 0;
for await (const delta of result.getTextStream()) {
  process.stdout.write(delta);
  charCount += delta.length;
  if (charCount > 500) {
    await result.cancel(); // stops generation and all consumers
    break;
  }
}
```

You can also cancel through `RequestOptions.signal` ([§2.3](#23-callmodel-signature-options-input-formats-model-selection)). For async tasks use `result.cancelTask(taskId, reason)` ([§2.10](#210-async-tools-background-and-deferred-execution)).

#### React (text accumulation with cleanup)

```tsx
import { useState, useEffect } from 'react';
import { OpenRouter } from '@openrouter/agent';

function ChatResponse({ prompt }: { prompt: string }) {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    const openrouter = new OpenRouter({ apiKey: API_KEY });
    const result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: prompt });

    (async () => {
      for await (const delta of result.getTextStream()) setText((prev) => prev + delta);
      setIsStreaming(false);
    })();

    return () => { result.cancel(); }; // cancel on unmount / prompt change
  }, [prompt]);

  return <div><p>{text}</p>{isStreaming && <span className="cursor">|</span>}</div>;
}
```

Do not ship an OpenRouter API key to browsers. The doc's `API_KEY` placeholder is illustrative; in production, proxy through your server (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) for key handling).

#### Server-Sent Events (Hono)

```typescript
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

const app = new Hono();

app.get('/stream', (c) => {
  return streamSSE(c, async (stream) => {
    const result = openrouter.callModel({
      model: 'openai/gpt-5-nano',
      input: c.req.query('prompt') || 'Hello!',
    });

    for await (const delta of result.getTextStream()) {
      await stream.writeSSE({ data: JSON.stringify({ delta }), event: 'delta' });
    }
    await stream.writeSSE({ data: JSON.stringify({ done: true }), event: 'done' });
  });
});
```

Sources: https://openrouter.ai/docs/agent-sdk/call-model/streaming, https://openrouter.ai/docs/agent-sdk/call-model/items, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools, https://openrouter.ai/docs/agent-sdk/call-model/api-reference

### 2.7 Text generation and structured output

#### Basic usage and response methods

```typescript
import { OpenRouter } from '@openrouter/agent';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Explain quantum computing in one sentence.',
});

const text = await result.getText();       // text only, after tool execution completes

const response = await result.getResponse();
console.log(response.output);              // full output array
console.log(response.usage);               // inputTokens, outputTokens, cachedTokens (served from cache)
```

Input formats, `instructions`, model selection, and generation parameters are covered in [§2.3](#23-callmodel-signature-options-input-formats-model-selection).

#### Structured output (`text.format`)

The documented example requests JSON mode through `text: ResponseTextConfig`:

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'List three programming languages.',
  text: {
    format: {
      type: 'json_object',
    },
  },
});

const data = JSON.parse(await result.getText());
```

The Agent SDK pages document only `json_object`. `text` follows the Responses API `text` configuration; for JSON-Schema-constrained output (`json_schema` formats, strict mode, model support) see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Structured outputs and [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) `POST /responses`. A pattern assembled from documented pieces for typed structured data inside an agent loop: a "finish" tool whose Zod `inputSchema` is the desired structure, combined with `stopWhen: hasToolCall('finish')` ([§2.14](#214-stop-conditions-stopwhen)); the validated arguments are then available from `getToolCalls()` / step `toolCalls`. This is not presented as a structured-output feature by the docs.

#### Error handling

```typescript
try {
  const result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Hello!' });
  const text = await result.getText();
} catch (error) {
  if (error instanceof Error && 'statusCode' in error) {
    if (error.statusCode === 401) console.error('Invalid API key');
    else if (error.statusCode === 429) console.error('Rate limited - try again later');
    else if (error.statusCode === 503) console.error('Model unavailable');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

The documented example wraps both the `callModel` call and the awaited method in the same `try`; do the same. HTTP errors expose `statusCode`. For the full error-code catalog see [§4](04-api-fundamentals.md#4-api-fundamentals) Errors. Tool-execution errors are handled differently: they are sent back to the model ([§2.9](#29-tools)).

Final-response errors specific to the loop ([§2.14](#214-stop-conditions-stopwhen)):

- `Invalid final response: empty or invalid output` is thrown when the final response is empty and no tool round completed, or always when `strictFinalResponse: true`.
- After at least one completed tool round, the default (`strictFinalResponse: false`) retries once, then resolves with empty text.

#### Concurrent requests

Each `callModel` invocation is independent:

```typescript
const [a, b, c] = await Promise.all([
  openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Question 1' }).getText(),
  openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Question 2' }).getText(),
  openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Question 3' }).getText(),
]);
```

Sources: https://openrouter.ai/docs/agent-sdk/call-model/text-generation, https://openrouter.ai/docs/agent-sdk/call-model/overview, https://openrouter.ai/docs/agent-sdk/call-model/stop-conditions, https://openrouter.ai/docs/agent-sdk/call-model/api-reference

### 2.8 Message format helpers (OpenAI chat, Anthropic Claude)

Four converters, all exported from `@openrouter/agent`:

| Function | Signature | Direction |
| - | - | - |
| `fromChatMessages` | `(messages: Message[]) => OpenResponsesInput` | OpenAI chat messages to `callModel` input |
| `toChatMessage` | `(response: OpenResponsesNonStreamingResponse) => AssistantMessage` | `getResponse()` result to a chat assistant message |
| `fromClaudeMessages` | `(messages: ClaudeMessageParam[]) => OpenResponsesInput` | Anthropic Messages-format messages to `callModel` input |
| `toClaudeMessage` | `(response: OpenResponsesNonStreamingResponse) => ClaudeMessage` | `getResponse()` result to a Claude message (compatible with Anthropic SDK types) |

No other converters are documented (no `toChatMessages` plural, no converters for other formats).

#### OpenAI chat format

```typescript
import { OpenRouter, fromChatMessages, toChatMessage } from '@openrouter/agent';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: fromChatMessages([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there! How can I help you?' },
    { role: 'user', content: 'What is the weather like?' },
  ]),
});

const chatMessage = toChatMessage(await result.getResponse());
// { role: 'assistant', content: '...' }
```

Supported chat roles: `system` (system instructions), `user`, `assistant`, `developer` (developer instructions), `tool` (tool response messages).

Tool messages are converted to function call outputs:

```typescript
const input = fromChatMessages([
  { role: 'user', content: 'What is the weather?' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_123',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"location":"Paris"}' },
    }],
  },
  { role: 'tool', tool_call_id: 'call_123', content: '{"temperature": 20}' },
]);
```

#### Anthropic Claude format

```typescript
import { OpenRouter, fromClaudeMessages, toClaudeMessage } from '@openrouter/agent';

const result = openrouter.callModel({
  model: 'anthropic/claude-sonnet-4.5',
  input: fromClaudeMessages([
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' },
    { role: 'user', content: 'Tell me about TypeScript.' },
  ]),
});

const claudeMessage = toClaudeMessage(await result.getResponse());
```

Supported Claude content blocks:

```typescript
// Text + URL image
fromClaudeMessages([{
  role: 'user',
  content: [
    { type: 'text', text: 'What is in this image?' },
    { type: 'image', source: { type: 'url', url: 'https://example.com/image.jpg' } },
  ],
}]);

// Base64 image
fromClaudeMessages([{
  role: 'user',
  content: [
    { type: 'text', text: 'Describe this image.' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo...' } },
  ],
}]);

// tool_use / tool_result blocks
fromClaudeMessages([
  { role: 'user', content: 'What is the weather?' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'tool_123', name: 'get_weather', input: { location: 'Paris' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool_123', content: '{"temperature": 20}' }] },
]);
```

**Limitations:** some Claude-specific features are not preserved in conversion, e.g. the `is_error` flag on `tool_result` blocks ("not supported by OpenRouter").

#### Migrating from the OpenAI / Anthropic SDKs

```typescript
// Before (OpenAI SDK)
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hello!' }],
});

// After
import { OpenRouter, fromChatMessages } from '@openrouter/agent';
const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const text = await openrouter.callModel({
  model: 'openai/gpt-5.2',
  input: fromChatMessages([{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hello!' }]),
}).getText();
```

```typescript
// Before (Anthropic SDK)
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});

// After: max_tokens becomes maxOutputTokens
import { OpenRouter, fromClaudeMessages } from '@openrouter/agent';
const text2 = await openrouter.callModel({
  model: 'anthropic/claude-sonnet-4.5',
  input: fromClaudeMessages([{ role: 'user', content: 'Hello!' }]),
  maxOutputTokens: 1024,
}).getText();
```

#### Building conversations manually

```typescript
import { fromChatMessages, toChatMessage } from '@openrouter/agent';

let messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' },
];

let result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: fromChatMessages(messages) });
messages.push(toChatMessage(await result.getResponse()));
messages.push({ role: 'user', content: 'What can you help me with?' });

result = openrouter.callModel({ model: 'openai/gpt-5-nano', input: fromChatMessages(messages) });
```

For automatic history accumulation across runs, use a `StateAccessor` instead ([§2.17](#217-tool-approval-and-state-persistence)).

Sources: https://openrouter.ai/docs/agent-sdk/call-model/message-formats, https://openrouter.ai/docs/agent-sdk/call-model/api-reference

### 2.9 Tools

#### The `tool()` helper

```typescript
function tool<TInput, TOutput>(config: ToolConfig): Tool
```

Creates a typed tool with Zod validation. The resulting object has the shape `{ type: ToolType.Function, function: { name, description?, inputSchema, ... } }`; docs access `t.function.name` and call `weatherTool.function.execute(params, { numberOfTurns: 1 })` directly in tests. MCP-branded tools still serialize on the wire as `type: 'function'`.

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
import { z } from 'zod';

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: z.object({
    location: z.string().describe('City name, e.g., "San Francisco, CA"'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
  execute: async (params) => {
    // params is typed as { location: string }
    const weather = await fetchWeather(params.location);
    return { temperature: weather.temp, conditions: weather.description };
  },
});
```

#### `ToolConfig`: every documented field

API reference fields:

| Field | Type | Required | Description |
| - | - | - | - |
| `name` | `string` | Yes | Tool name. `'task'` is reserved (throws, [§2.10](#210-async-tools-background-and-deferred-execution)) |
| `description` | `string` | No | Tool description shown to the model |
| `inputSchema` | `ZodObject` | Yes | Input parameter schema; arguments are validated before execution |
| `outputSchema` | `ZodType` | No (required for HITL, background, deferred tools) | Output schema |
| `eventSchema` | `ZodType` | No | Event schema; **its presence switches the tool to generator mode** |
| `contextSchema` | `ZodObject` | No | Typed per-tool context this tool needs (supplied via `callModel({ context })`) |
| `execute` | `function \| false` | Yes\* | Execute function (async fn, or async generator in generator mode), or `false` for a manual tool |
| `onToolCalled` | `function` | Yes\* | HITL hook: return a value to auto-respond, `null` to pause |
| `onResponseReceived` | `function` | No | HITL hook: post-process the caller-supplied result (HITL only) |
| `nextTurnParams` | `NextTurnParamsFunctions` | No | Functions that modify `callModel` parameters for the next turn ([§2.16](#216-nextturnparams-tool-driven-parameter-changes-skills--plugins-pattern)) |

\* Provide exactly one of `execute` or `onToolCalled`. `execute: false` (and no `onToolCalled`) makes a manual tool.

Fields documented on other pages:

| Field | Type / values | Applies to | Description | Page |
| - | - | - | - | - |
| `sharedSchema` | Zod object | all | Typed access to `context.shared` (shared across tools) | Tools |
| `requireApproval` | `boolean \| ((params, context: TurnContext) => boolean \| Promise<boolean>)` | executable tools | Pause before execution for approve/reject ([§2.17](#217-tool-approval-and-state-persistence)) | Tool Approval & State |
| `loopKey` | `(input) => key \| null`, `false`, or `string[]` of field names | all | Identity used by doom-loop detection ([§2.13](#213-doom-loop-detection)) | Doom-Loop Detection |
| `lifecycle` | `'sync'` (default) \| `'background'` \| `'deferred'` | all | Execution mode ([§2.10](#210-async-tools-background-and-deferred-execution)) | Async Tools |
| `run` | async fn or async generator `(input, ctx) => ...` | async-style tools | Handler used with `lifecycle` ([§2.10](#210-async-tools-background-and-deferred-execution)) | Async Tools |
| `ack` | string, object, or `(input) => ...` | background, deferred | Model-facing note in the pending placeholder | Async Tools |
| `graceMs` | `number` (default 250) | background, agent | Settles this fast: plain sync output, no placeholder | Async Tools |
| `pollAfterMs` | `number` | deferred | Poll-interval hint surfaced in placeholder and status views | Async Tools |
| `timeoutMs` | `number` | all | Whole-task deadline; `ctx.signal` aborts on breach | Async Tools |
| `maxConcurrency` | `number` | all | Max simultaneous executions of this tool | Async Tools |
| `logLimits` | `{ maxEntries (200), maxBytes (256k), maxEntryBytes (4k) }` | background, agent | Log ring-buffer caps | Async Tools |
| `check` | `{ schema?, execute? }` | background, deferred, agent | Custom handling of `task` tool check-ins | Async Tools |
| `toModelOutput` | `ToModelOutputFunction<input, output>` | HITL (appears in the `HITLToolFunction` type) | Not described in prose | API reference |

#### Tool kinds (auto-detected from configuration)

| Kind | How you declare it | Who produces the result | Loop behavior |
| - | - | - | - |
| Regular | `execute: async (params, ctx) => output` | SDK runs `execute` | Auto-continues |
| Generator | `eventSchema` + `execute: async function* (...)` | SDK runs generator; yields become progress events; return value is the output | Auto-continues; progress on `getToolStream()` / `getFullResponsesStream()` |
| Manual | `execute: false` | Your code | Pauses (`awaiting_client_tools`) |
| HITL | `onToolCalled` (+ optional `onResponseReceived`), `outputSchema` required | `onToolCalled` return value, or a caller-supplied `function_call_output` | Auto-continues on a value; pauses (`awaiting_hitl`) on `null` |
| Approval-gated | any executable tool + `requireApproval` | SDK, after approval | Pauses (`awaiting_approval`) |
| Async | `lifecycle: 'background' \| 'deferred'` + `run` (+ `outputSchema`) | Background task / external system | Background continues; deferred pauses (`awaiting_async_tools`) ([§2.10](#210-async-tools-background-and-deferred-execution)) |
| Agent (subagent) | `tool.agent({...})` | A child `callModel` run | Background task ([§2.10](#210-async-tools-background-and-deferred-execution)) |
| MCP-branded | wrapped by `@openrouter/mcp` or `markMcp(tool)` | MCP server (executed locally by the SDK) | Like generator tools ([§2.11](#211-mcp-tools-via-openroutermcp)) |

Type guards:

```typescript
function isManualTool(tool: Tool): tool is ManualTool;          // no execute and no onToolCalled; always pauses the loop
function isHITLTool(tool: Tool): tool is HITLTool;              // has an onToolCalled function
function isAutoResolvableTool(tool: Tool): tool is ToolWithExecute | ToolWithGenerator | HITLTool;
                                                                // false for manual and server tools
function isMcpTool(tool: Tool): tool is McpBranded;             // has the _mcp brand
// From '@openrouter/agent/tool-types' (named in the migration guide, signatures not documented):
// hasExecuteFunction, isGeneratorTool
```

#### Regular tools

```typescript
const calculatorTool = tool({
  name: 'calculate',
  description: 'Perform a mathematical calculation',
  inputSchema: z.object({ expression: z.string().describe('Math expression like "2 + 2"') }),
  outputSchema: z.object({ result: z.number() }),
  execute: async (params) => {
    const result = eval(params.expression); // docs: use a safer eval in production
    return { result };
  },
});
```

#### Generator tools

```typescript
const searchTool = tool({
  name: 'search_database',
  description: 'Search documents with progress updates',
  inputSchema: z.object({ query: z.string(), limit: z.number().default(10) }),
  eventSchema: z.object({                       // triggers generator mode
    progress: z.number().min(0).max(100),
    message: z.string(),
  }),
  outputSchema: z.object({ results: z.array(z.string()), totalFound: z.number() }),
  execute: async function* (params) {
    yield { progress: 0, message: 'Starting search...' };
    const results = [];
    for (let i = 0; i < 5; i++) {
      yield { progress: (i + 1) * 20, message: `Searching batch ${i + 1}...` };
      results.push(...await searchBatch(params.query, i));
    }
    yield { progress: 100, message: 'Complete!' };
    return { results: results.slice(0, params.limit), totalFound: results.length };
  },
});
```

Each `yield` is a progress event (`preliminary_result` on `getToolStream()`, `tool.preliminary_result` on `getFullResponsesStream()`). The `return` value is the final output. The generator example's comments also say the output can be "yield[ed] as last value"; prefer `return`. All yields are also collected into `tool.result`'s `preliminaryResults`.

#### Manual tools

```typescript
const sendEmail = tool({
  name: 'send_email',
  description: 'Send an email (requires user confirmation)',
  inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
  execute: false, // manual handling required
});

const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Send an email to alice@example.com',
  tools: [sendEmail],
  maxToolRounds: 0,
});

for (const call of await result.getToolCalls()) {
  if (call.name === 'send_email') {
    const confirmed = await showConfirmDialog(call.arguments);
    if (confirmed) await sendEmailNow(call.arguments);
  }
}
```

Manual-tool pause semantics:

- Unresolved manual calls at the end of a round pause the loop. The calls are persisted to `ConversationState.pendingToolCalls` with `status: 'awaiting_client_tools'` (added in 0.8.0), so cold-start consumers can recover them from serialized state.
- To continue, call `callModel` again with **new `input`**. The stale pendings are cleared and the run proceeds as a normal turn.
- Manual tools are **not** approved/rejected by call ID (unlike approval and HITL flows).
- Manual and client-executed calls are not counted by doom-loop detection.

#### Human-in-the-loop (HITL) tools

HITL tools extend manual semantics with two sync-or-async hooks:

- `onToolCalled(params, context?)` fires when the model invokes the tool. Return a value to feed the model directly (like `execute`), or return `null` to pause like a manual tool.
- `onResponseReceived(rawResult, context?)` (optional) fires on a later turn when an incoming `function_call_output` matches a prior call of this tool (matched by `callId` to `function_call.name`). It receives the caller-supplied raw result and returns the value sent to the model.
- `outputSchema` is **required**. It validates the non-null `onToolCalled` return and the value delivered via `function_call_output`, whether transformed by `onResponseReceived` or passed through.

```typescript
const approvePaymentTool = tool({
  name: 'approve_payment',
  description: 'Approve a payment, escalating large amounts to a human',
  inputSchema: z.object({ amount: z.number(), recipient: z.string() }),
  outputSchema: z.object({ ok: z.boolean(), reviewedAt: z.number().optional() }),
  onToolCalled: async (input) => {
    if (input.amount < 100) return { ok: true }; // auto-approve small amounts
    return null;                                  // escalate to a human: pauses the loop
  },
  onResponseReceived: async (raw) => {
    return { ...(raw as object), reviewedAt: Date.now() }; // post-process caller result
  },
});
```

- On `null`, conversation state becomes `status: 'awaiting_hitl'`; the paused call is available via `getToolCalls()` / `getPendingToolCalls()`.
- Resume by calling `callModel` again with a `function_call_output` item for each paused call in `input`.
- Errors: throwing from `onToolCalled` surfaces as a tool error `{ error: ... }`. Throwing from `onResponseReceived` surfaces as `{ error: ..., originalOutput: ... }`, including the caller's original output.
- HITL vs `requireApproval`: approval gates always pause **before** execution for a yes/no decision. HITL runs arbitrary logic first and pauses only when it returns `null`. Use HITL for data-driven decisions (amount thresholds, risk scoring); use `requireApproval` when explicit human consent is always needed ([§2.17](#217-tool-approval-and-state-persistence)).

#### Schemas

Input schema patterns:

```typescript
const inputSchema = z.object({
  query: z.string().describe('Search query'),                       // required
  limit: z.number().default(10).describe('Max results'),           // optional with default
  filter: z.string().optional().describe('Filter expression'),     // optional
  sortBy: z.enum(['relevance', 'date', 'popularity']).default('relevance'),
  options: z.object({
    caseSensitive: z.boolean().default(false),
    wholeWord: z.boolean().default(false),
  }).optional(),                                                    // nested
  tags: z.array(z.string()).optional(),                             // arrays
});
```

Output schema: describes the result returned to the model, e.g. `z.object({ results: z.array(z.object({ id: z.string(), title: z.string(), score: z.number() })), metadata: z.object({ totalCount: z.number(), searchTimeMs: z.number() }) })`. `outputSchema` may be a non-object Zod type (the skills examples use `z.string()`).

Event schema (generator tools), e.g. `z.object({ stage: z.enum(['initializing', 'processing', 'finalizing']), progress: z.number(), currentItem: z.string().optional() })`.

Use `.describe()` on every field. The docs recommend it to help the model.

#### Type inference

```typescript
import type { InferToolInput, InferToolOutput, InferToolEvent } from '@openrouter/agent';

type WeatherInput = InferToolInput<typeof weatherTool>;   // { location: string }
type WeatherOutput = InferToolOutput<typeof weatherTool>; // { temperature: number; conditions: string }
type SearchEvent = InferToolEvent<typeof searchTool>;     // { progress: number; message: string } (generator tools only)
```

Pass tools `as const` for typed tool calls (and typed `context`):

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'What is the weather?',
  tools: [weatherTool, searchTool] as const,
  maxToolRounds: 0, // get tool calls without executing
});

for await (const toolCall of result.getToolCallsStream()) {
  if (toolCall.name === 'get_weather') {
    console.log('Weather for:', toolCall.arguments.location); // typed { location: string }
  }
}
```

#### Execute context (second argument to `execute`)

The Tools page documents a flat context that merges `TurnContext` with tool-context accessors:

| Property | Type | Description |
| - | - | - |
| `numberOfTurns` | `number` | Current turn number (1-indexed) |
| `turnRequest` | `OpenResponsesRequest \| undefined` | Current request object (`turnRequest.input` = history, `turnRequest.model`) |
| `toolCall` | `OpenResponsesFunctionToolCall \| undefined` | The tool call being executed |
| `local` | `Readonly<TContext>` | This tool's own context (read-only, live getter) |
| `setContext` | `(partial: Partial<TContext>) => void` | Mutate this tool's context |
| `shared` | `Readonly<TShared>` | Shared context visible to all tools |
| `setSharedContext` | `(partial: Partial<TShared>) => void` | Mutate shared context |

```typescript
const contextAwareTool = tool({
  name: 'context_tool',
  inputSchema: z.object({ data: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async (params, context) => {
    console.log('Turn:', context.numberOfTurns);
    console.log('History:', context.turnRequest?.input);
    console.log('Model:', context.turnRequest?.model);
    return { result: `Processed on turn ${context.numberOfTurns}` };
  },
});
```

Inconsistency: the API reference defines `ToolExecuteContext<TName, TContext> = TurnContext & { tools: { readonly [K in TName]: Readonly<TContext> }; setContext(partial: Partial<TContext>): void }`, which exposes context under `tools[name]` rather than `local` / `shared`. The Tools page examples use `context.local`, `context.shared`, `context.setSharedContext`. Also, the `nextTurnParams` page's skills example reads `context.input` inside `execute`. That is not a documented execute-context property; the Skills Loader page uses `context?.turnRequest?.input`, which matches the table above.

#### Tool context (`contextSchema`, `context`, `setContext`)

Tools declare typed, persistent context with `contextSchema` to receive data from the caller (the docs' example passes an API key and units). Context is keyed by tool name and persists across turns. It is supplied by your code, not by the model's tool arguments.

```typescript
const weatherTool = tool({
  name: 'get_weather',
  description: 'Get weather for a location',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
  contextSchema: z.object({
    apiKey: z.string(),
    units: z.enum(['celsius', 'fahrenheit']),
  }),
  execute: async (params, context) => {
    const { apiKey, units } = context.local;
    const weather = await fetchWeather(params.location, apiKey, units);
    return { temperature: weather.temp };
  },
});

// Static context keyed by tool name
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'What is the weather in Tokyo?',
  tools: [weatherTool, dbTool] as const,
  context: {
    get_weather: { apiKey: process.env.WEATHER_API_KEY!, units: 'celsius' },
    db_query: { connectionString: process.env.DATABASE_URL! },
  },
});

// Async context: resolved ONCE at turn 0 to seed the context store
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'What is the weather?',
  tools: [weatherTool] as const,
  context: async () => ({
    get_weather: { apiKey: await fetchApiKey(), units: 'celsius' },
  }),
});
```

`ContextInput<T> = T | ((turn: TurnContext) => T) | ((turn: TurnContext) => Promise<T>)`. Context resolution runs once at turn 0. For per-turn changes, call `setContext()` inside `execute`.

Mutating and observing context:

```typescript
const authTool = tool({
  name: 'auth',
  inputSchema: z.object({ action: z.string() }),
  contextSchema: z.object({ token: z.string(), refreshCount: z.number() }),
  execute: async (params, context) => {
    const { token } = context.local;
    if (isExpired(token)) {
      context.setContext({                       // persists to the next turn, visible immediately
        token: await refreshToken(token),
        refreshCount: context.local.refreshCount + 1,
      });
    }
    return { success: true };
  },
});

const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Authenticate and fetch data',
  tools: [authTool] as const,
  context: { auth: { token: 'initial', refreshCount: 0 } },
});

for await (const snapshot of result.getContextUpdates()) {
  console.log('Context changed:', snapshot); // { auth: { token: 'new-token', refreshCount: 1 } }
}
```

Shared context across tools (`sharedSchema` on each tool, `sharedContextSchema` on `callModel` for runtime validation, values under `context.shared`):

```typescript
const SharedContextSchema = z.object({ _sessionId: z.string().optional() });

const execTool = tool({
  name: 'sandbox_exec',
  inputSchema: z.object({ command: z.string() }),
  sharedSchema: SharedContextSchema,
  execute: async (input, ctx) => {
    const session = await connect(ctx.shared._sessionId);    // read shared state
    ctx.setSharedContext({ _sessionId: session.id });         // write shared state
    return await session.exec(input.command);
  },
});

openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Run a command',
  tools: [execTool] as const,
  sharedContextSchema: SharedContextSchema,
  context: {
    shared: { _sessionId: 'existing-session' }, // reserved key "shared"
    sandbox_exec: {},
  },
});
```

`context.local` is scoped to one tool; `context.shared` is visible to all tools and persists across turns.

Context helpers exported but not described in prose: `buildToolExecuteContext`, `ToolContextStore`.

#### Execution model

When tools with execute functions are provided, `callModel` runs the loop automatically:

1. Model receives prompt and generates tool call(s).
2. SDK extracts tool calls and validates arguments against `inputSchema`. Invalid JSON produces a parse error without running the tool or its hooks.
3. Approval partitioning (`requireApproval`, `PermissionRequest` hook) and `PreToolUse` hooks run ([§2.12](#212-lifecycle-hooks), [§2.17](#217-tool-approval-and-state-persistence)).
4. Tool `execute` functions run. Multiple calls in one round execute **in parallel** (bounded by `toolConcurrency.round` and per-tool `maxConcurrency`).
5. `nextTurnParams` functions run for each called tool, in `tools` array order ([§2.16](#216-nextturnparams-tool-driven-parameter-changes-skills--plugins-pattern)).
6. Stop conditions are checked ([§2.14](#214-stop-conditions-stopwhen)). If one fires while tool calls were pending, the optional final no-tool turn runs (`allowFinalResponse`).
7. Otherwise results are formatted and sent back to the model with the next turn's (re-resolved, [§2.15](#215-dynamic-parameters-per-turn-functions)) parameters. The model produces a final response or more tool calls, and the loop repeats until a turn has no tool calls.

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Get weather in Paris, Tokyo, and New York simultaneously',
  tools: [weatherTool],
});
const text = await result.getText(); // waits for all tool rounds; the three calls run in parallel
```

**Controlling rounds** (`maxToolRounds`, deprecated in favor of `stopWhen`):

```typescript
openrouter.callModel({ model, input, tools, maxToolRounds: 3 });   // at most 3 rounds of tool execution
openrouter.callModel({ model, input, tools, maxToolRounds: 0 });   // no auto-execution: raw tool calls
openrouter.callModel({
  model, input, tools,
  maxToolRounds: (context) => context.numberOfTurns < 5,           // TurnContext => true continues, false stops
});
```

**Accessing tool calls:**

- `getToolCalls()` returns all calls from the **initial** response (before auto-execution). Pair it with `maxToolRounds: 0` to receive raw calls.
- `getToolCallsStream()` yields calls as they complete.
- Execution metadata for all rounds: `getResponse()` (`output`, `usage`), or `stopWhen` step data (`toolCalls`, `toolResults`).

#### Tool result events and the `source` discriminant

```typescript
type ToolResultEvent<TResult = unknown, TPreliminaryResults = unknown> = {
  type: 'tool.result';
  toolCallId: string;
  /** 'client' for locally-defined tools (result typed from outputSchema), 'mcp' for wrapped MCP tools (result is unknown). */
  source: 'client' | 'mcp';
  result: TResult;
  timestamp: number;
  preliminaryResults?: TPreliminaryResults[];
};
```

```typescript
for await (const event of result.getFullResponsesStream()) {
  if (event.type !== 'tool.result') continue;
  if (event.source === 'client') {
    console.log('Local tool result:', event.result);         // typed from the outputSchema union
  } else {
    console.log('MCP tool result (unknown):', event.result); // validate before use
  }
}
```

- Without `source`, one MCP tool (output `unknown`) collapsed the whole result union to `unknown`. Narrow on `source === 'client'` to recover schema-derived types.
- **Breaking in 0.8.0**: `source` was added to `ToolResultEvent` and `ToolExecutionResult`. Code that exhaustively matched or constructed these payloads must add a `source` case or spread it through.
- MCP brand helpers: `markMcp(tool)` brands a tool (done automatically by `@openrouter/mcp`); `isMcpTool(tool)` is the runtime guard; `McpBranded<T> = T & { readonly _mcp: true }` is the type-level brand. The brand is informational only: MCP tools still execute locally and serialize as `type: 'function'`.

`getToolStream()` event types: `delta` (raw argument chunks from the model) and `preliminary_result` (generator progress).

```typescript
for await (const event of result.getToolStream()) {
  switch (event.type) {
    case 'delta': process.stdout.write(event.content); break;
    case 'preliminary_result': console.log(`Progress: ${event.result.progress}% - ${event.result.status}`); break;
  }
}
```

#### Error handling

- **Execution errors**: exceptions thrown in `execute` are caught and sent back to the model as the tool result. The model can then respond, e.g. "I tried the operation but it failed with: Operation failed: invalid input". They do not reject `getText()`.
- **Validation errors**: invalid arguments are caught by Zod **before** execution; `execute` only runs with valid input.
- **Invalid JSON arguments**: produce a parse error; tool hooks are not emitted. Doom-loop detection counts repeated invalid JSON ([§2.13](#213-doom-loop-detection)).
- **HITL errors**: `{ error }` from `onToolCalled`, `{ error, originalOutput }` from `onResponseReceived`.
- **Graceful pattern**: return an error field instead of throwing:

```typescript
const robustTool = tool({
  name: 'fetch_data',
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ data: z.unknown().optional(), error: z.string().optional() }),
  execute: async (params) => {
    try {
      const response = await fetch(params.url);
      if (!response.ok) return { error: `HTTP ${response.status}: ${response.statusText}` };
      return { data: await response.json() };
    } catch (error) {
      return { error: `Failed to fetch: ${(error as Error).message}` };
    }
  },
});
```

- Failures fire the `PostToolUseFailure` hook ([§2.12](#212-lifecycle-hooks)).

#### Best practices (from the docs)

- Descriptive names and descriptions (`search_knowledge_base` with a full description, not `search` / "Searches stuff").
- `.describe()` plus constraints on parameters (`.min(1).max(100).default(10)`).
- Idempotent tools: check for existing records before creating (`create_user` returns `{ userId, created: false }` if one exists).
- Timeouts: wrap long work with `Promise.race` against a timer, or use the async-tool `timeoutMs` / `toolTimeoutMs` options ([§2.10](#210-async-tools-background-and-deferred-execution)).

Sources: https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/call-model/next-turn-params, https://openrouter.ai/docs/agent-sdk/call-model/examples/skills-loader, https://openrouter.ai/docs/agent-sdk/call-model/examples/weather-tool, https://openrouter.ai/docs/agent-sdk/call-model/lifecycle-hooks, https://openrouter.ai/docs/agent-sdk/agent-migration

### 2.10 Async tools: background and deferred execution

A sync tool blocks the round until it returns. Async tools let the model keep working:

- The model gets a **pending placeholder** for the call immediately and moves on.
- When the work finishes, the SDK injects the result as a `tool_task_result` message at the next turn boundary. External (deferred) work resolves whenever another process reports it.
- While a task runs, the model can check progress, read logs, steer, or cancel it through one built-in `task` tool.

#### Lifecycles

Every async-style tool has a `run` handler (async function or async generator) and a `lifecycle`:

| `lifecycle` | Behavior |
| - | - |
| `'sync'` (default) | The round waits for it, exactly like `execute` |
| `'background'` | Runs in the same process without blocking; the result arrives when it finishes |
| `'deferred'` | Hands the call to an external system; the run pauses until some process completes it |

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
import { z } from 'zod';

const renderVideo = tool({
  name: 'render_video',
  description: 'Render a video from a script. Long-running.',
  lifecycle: 'background',
  inputSchema: z.object({ script: z.string() }),
  outputSchema: z.object({ url: z.string(), durationMs: z.number() }), // required for background/deferred
  ack: 'Rendering started.',   // model-facing note in the placeholder
  timeoutMs: 300_000,          // whole-task deadline; ctx.signal aborts on breach
  run: async function* ({ script }, ctx) {
    const job = await renderer.start(script, { signal: ctx?.signal });
    ctx?.onMessage((msg) => job.reprioritize(msg)); // steering opt-in
    for await (const pct of job.progress()) {
      yield { pct };           // yields become the task's log
    }
    return job.result();       // return value = result, validated against outputSchema
  },
});
```

- Generator `run`: each `yield` is a log entry. Logs feed check-ins, `tool.preliminary_result` events, and transcripts, and are optionally validated by `eventSchema`. The `return` value is the result.
- Plain async `run`: log with `ctx.log()` instead.
- `lifecycle: 'background'` and `'deferred'` **require `outputSchema`**, because the result arrives later and must be validated without the original call.

`run` context (`ctx`) members shown in the docs. Examples type `ctx` as optional (`ctx?.`, `ctx!`):

| Member | Purpose |
| - | - |
| `ctx.signal` | `AbortSignal`, aborted on `timeoutMs` breach, cancel, or parent abort |
| `ctx.onMessage(handler)` | Receive steering messages; messages queue until a handler registers (none lost) |
| `ctx.log(entry)` | Append a log entry from a non-generator `run` |
| `ctx.defer(taskId, { pollAfterMs?, ack? })` | (deferred) Hand off to an external system and pause; the `run` returns this value |
| `ctx.conversationId` | (deferred) ID to give the external system so it can resume the conversation |

#### Background tools

1. If the work finishes within the grace window (`graceMs`, default 250 ms), it behaves like a plain sync call and no placeholder is created.
2. Otherwise the model receives a pending placeholder (including a `taskId`) and the loop continues.
3. When the task finishes, the SDK injects the result as a `tool_task_result` message before the next model turn.

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Render the intro video, and draft the announcement post meanwhile.',
  tools: [renderVideo, draftPost],
});
// The model drafts the post WHILE the render runs, then incorporates the finished URL.
console.log(await result.getText());
```

**When the run would end first** (`asyncTools.onRunEnd`):

| Value | Behavior |
| - | - |
| `'drain'` (default) | Wait for running tasks and give the model extra **no-tool** turns so the final answer includes the results. Capped by `drainTimeoutMs` and `maxDrainTurns` |
| `'detach'` | Return immediately. Tasks keep running; results are dropped (persisted as `orphaned` when a `StateAccessor` is configured) |
| `'cancel'` | Abort in-flight tasks and finish |

```typescript
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Kick off the render.',
  tools: [renderVideo],
  asyncTools: { onRunEnd: 'drain', drainTimeoutMs: 30_000, maxDrainTurns: 2 },
});
```

#### Deferred tools

The `run` registers external work and returns `ctx.defer(taskId)`. The conversation pauses with `status: 'awaiting_async_tools'` until any process completes the task. **A `StateAccessor` is required** ([§2.17](#217-tool-approval-and-state-persistence)) so the paused conversation can be found and resumed from another process.

```typescript
const legalReview = tool({
  name: 'request_legal_review',
  description: 'Send a contract for legal review. Takes days.',
  lifecycle: 'deferred',
  inputSchema: z.object({ contractId: z.string() }),
  outputSchema: z.object({ approved: z.boolean(), notes: z.string().optional() }),
  run: async ({ contractId }, ctx) => {
    const cached = await legal.cachedVerdict(contractId);
    if (cached) return cached;                    // typed fast path: plain value resolves immediately

    const ticket = await legal.open(contractId, {
      conversationId: ctx?.conversationId,        // hand to the webhook for resume
    });
    return ctx!.defer(ticket.id, { pollAfterMs: 60_000, ack: `Ticket ${ticket.id} opened.` });
  },
});
```

**Typed completion from any process.** Completion methods live on the tool object and are typechecked against `outputSchema` (and validated at runtime):

```typescript
// webhook handler, hours later, in a different process
await legalReview.resolve(client, {
  state: makeAccessor(conversationId),
  taskId: ticketId,
  output: { approved: true },          // typechecked against outputSchema
  run: { model: 'openai/gpt-5-nano' }, // optional: continue the conversation immediately
});
```

| Method | Effect |
| - | - |
| `tool.resolve(client, { state, taskId, output, run? })` | Deliver a successful result |
| `tool.fail(...)` | Deliver an error (arguments not shown; presumably mirror `resolve`) |
| `tool.cancel(...)` | Cancel the task (arguments not shown) |
| `resumeToolResults(client, { state, results, ... })` | Lower-level batch API for tools you do not hold a reference to |

- Omit `run` to only record the result; it is delivered on the next `callModel({ state })`.
- A task settles once. A replayed webhook throws `ToolTaskAlreadySettledError` instead of delivering twice.
- **Security**: `.resolve()` injects a value the model treats as a tool result. Authenticate the webhook before calling it; the SDK cannot.

#### Checking on running tasks: the built-in `task` tool

When any long-running tool is registered, the SDK adds **one** built-in `task` tool, a single fixed definition regardless of how many async tools exist. Your tools' schemas stay untouched and prompt cost stays flat. The placeholder tells the model how to use it:

```typescript
task({ taskId: "task_7f3" })                          // status: state, elapsed, last log
task({ taskId, view: "logs", tail: 5 })               // recent progress entries
task({ taskId, view: "transcript" })                  // full detail (agents: child conversation)
task({ taskId, action: "steer", message: "..." })     // send guidance to the running task
task({ taskId, action: "result" })                    // final result if settled, else status
task({ taskId, action: "cancel", reason: "..." })     // stop the task
```

The SDK intercepts these calls and routes each to the tool owning the task.

Custom check handler:

```typescript
const renderVideo = tool({
  name: 'render_video',
  lifecycle: 'background',
  // ...schemas and run as above...
  check: {
    schema: z.object({ includeFrames: z.boolean().optional() }), // validates the model's task({ params }) payload
    execute: async (params, turnContext) => {
      // turnContext.toolCallStatus           → 'working' | 'completed' | ...
      // turnContext.accumulatedYieldedEvents → every run yield so far
      // turnContext.task                     → statusView / tailLogs / transcript / send / cancel
      return {
        state: turnContext.toolCallStatus,
        progressEvents: turnContext.accumulatedYieldedEvents?.length ?? 0,
        ...(params.includeFrames && { lastFrames: turnContext.task?.tailLogs(3) }),
      };
    },
  },
});
```

Rules:

- Without a custom `check`, the SDK answers `status` / `logs` / `transcript` itself. Transcripts are truncated to `asyncTools.maxTranscriptChars` (default 20,000 characters).
- `task`-tool calls are internal: exempt from doom-loop detection, they skip per-tool concurrency and timeout limits, and never fire `PreToolUse` / `PostToolUse`.
- `asyncTools: { checkins: false }` disables check-ins. Placeholders then tell the model not to call the tool again; results still arrive automatically.
- The name `task` is reserved: `tool({ name: 'task' })` throws. If a tool list built without `tool()` includes a tool named `task`, the SDK disables the built-in and logs a warning.
- After a process restart, deferred tasks answer `status` from persisted state (including a bounded `lastLog`). Full logs and transcripts are in-memory only, so those views return a short explanatory note.

#### Steering running tasks

```typescript
result.sendToTask(taskId, 'Prioritize the intro segment.');      // 1. from code
// 2. from the model: task({ taskId, action: "steer", message: "Prioritize the intro." })
// 3. from a custom check handler: turnContext.task.send(message)
```

Messages are delivered to the run body's `ctx.onMessage(handler)` and queued until a handler registers. Deferred tasks throw on `sendToTask`, because their work runs in an external system.

#### Agent tools (subagents): `tool.agent()`

```typescript
import { tool, stepCountIs } from '@openrouter/agent';

const researcher = tool.agent({
  name: 'research_topic',
  description: 'Deep-research a topic in the background.',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ text: z.string() }),
  agent: ({ topic }) => ({                     // child callModel spec
    model: 'openai/gpt-5-nano',
    instructions: 'You are a thorough researcher. Cite sources.',
    input: `Research: ${topic}`,
    tools: [searchTool, fetchTool] as const,
    stopWhen: stepCountIs(15),
  }),
  // Map the finished child run to this tool's output. Default: child's last-message text as { text }.
  result: async (child) => ({ text: await child.getText() }),
});
```

- Runs as a background task. The parent keeps working; several children can run concurrently under the background pool (`toolConcurrency.background`).
- The child's conversation is the check-in transcript; each child turn is a log entry; `status` reports `turnsCompleted` and `currentActivity`.
- Steering lands in the child as a user message at its next turn boundary.
- `cancelTask(taskId)`, parent abort, or `timeoutMs` cancels the child.
- The full child transcript stays out of the parent's context by default. The parent receives the mapped result and pulls transcript detail via the `task` tool.
- Children run **in-memory** (no `StateAccessor`) and **do not inherit the parent's hooks**; pass child hooks explicitly in the `agent` spec. A child that pauses (HITL, approval, or deferred tools inside it) fails the task with a clear error.

#### Observing async tasks

```typescript
result.getAsyncTasks();               // snapshot of pending tasks (taskId, status, lastLog, ...)
result.sendToTask(taskId, message);   // steer an in-process task
result.cancelTask(taskId, reason);    // cancel; true when a working task was cancelled

for await (const event of result.getFullResponsesStream()) {
  switch (event.type) {
    case 'tool.async_started': console.log(`started ${event.taskId} (${event.toolName})`); break; // detached past grace window
    case 'tool.preliminary_result': console.log('progress:', event.result); break;               // generator yield / ctx.log
    case 'tool.async_settled': console.log(`settled ${event.taskId}`); break;                     // result or error delivered
  }
}
```

#### Options reference

Run-level (`callModel`), all optional:

```typescript
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: '...',
  tools: [renderVideo, legalReview, researcher],
  toolTimeoutMs: 60_000,           // default per-tool deadline
  toolConcurrency: {
    round: 4,                      // max simultaneous calls per round
    background: 8,                 // max detached background tasks
  },
  asyncTools: {
    onRunEnd: 'drain',             // 'drain' | 'detach' | 'cancel'
    drainTimeoutMs: 30_000,
    maxDrainTurns: 2,
    checkins: true,                // register the universal task tool
    maxTranscriptChars: 20_000,    // transcript view cap
  },
});
```

Per-tool (`tool()` / `tool.agent()`):

| Field | Applies to | Description |
| - | - | - |
| `lifecycle` | all | `'sync'` (default) \| `'background'` \| `'deferred'` |
| `ack` | background, deferred | Placeholder note: string, object, or `(input) => ...` |
| `graceMs` | background, agent | Settles this fast: plain sync output, no placeholder (default 250) |
| `pollAfterMs` | deferred | Poll-interval hint in placeholder and status views |
| `timeoutMs` | all | Whole-task deadline; `ctx.signal` aborts on breach |
| `maxConcurrency` | all | Max simultaneous executions of this tool |
| `logLimits` | background, agent | `maxEntries` (200), `maxBytes` (256k), `maxEntryBytes` (4k) |
| `check` | background, deferred, agent | `{ schema?, execute? }` custom task-tool handling |

Sources: https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection

### 2.11 MCP tools via `@openrouter/mcp`

`@openrouter/mcp` connects to a **remote** MCP server (Streamable HTTP or SSE) and exposes its tools as first-class `callModel` tools. It handles discovery, invocation, progress events, cancellation, resources, and elicitation. **`stdio` MCP servers are intentionally out of scope.** For a hosted MCP server for your editor or coding assistant instead, see [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) OpenRouter MCP server.

Use it to plug an existing MCP server (Linear, GitHub, an internal tool server) into an Agent SDK loop without hand-rolling the protocol. MCP and local `tool()` tools can share one `tools` array.

```bash
npm install @openrouter/mcp @openrouter/agent
pnpm add @openrouter/mcp @openrouter/agent
bun add @openrouter/mcp @openrouter/agent
```

#### Quick start and the handle

```typescript
import { OpenRouter } from '@openrouter/agent';
import { callModel } from '@openrouter/agent/call-model';
import { createMCPTools } from '@openrouter/mcp';

const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const mcp = await createMCPTools({
  url: 'https://mcp.example.com/mcp',
  auth: { kind: 'bearer', token: process.env.MCP_TOKEN },
});

const result = callModel(client, {
  model: 'anthropic/claude-opus-4-8',
  input: 'What are my three most recently updated issues?',
  tools: mcp.tools,
});

console.log(await result.getText());
await mcp.close();
```

`createMCPTools()` (async; performs `initialize` + `tools/list`) returns a handle:

| Member | Description |
| - | - |
| `mcp.tools` | Array of Agent SDK tools, one per advertised MCP tool (plus synthetic resource tools). Spread into `callModel({ tools })` |
| `mcp.serialize()` | Async. Capture the tool list (and optionally credentials) as plain JSON for cache reuse |
| `mcp.close()` | Disconnect. Call when done |

#### Authentication

Auth is supplied once and reused for discovery and every tool call:

```typescript
auth: { kind: 'bearer', token: process.env.MCP_TOKEN }                    // static bearer token
auth: { kind: 'headers', headers: { 'X-API-Key': process.env.MCP_KEY } }  // arbitrary headers
auth: { kind: 'oauth', provider }                                         // OAuthClientProvider; you own refresh + storage
```

Prefer an `OAuthClientProvider` over caching a static bearer token when the server supports OAuth; the transport refreshes through the provider automatically.

#### Combining with your own tools

```typescript
import { OpenRouter, tool, isMcpTool } from '@openrouter/agent';
import { callModel } from '@openrouter/agent/call-model';
import { createMCPTools } from '@openrouter/mcp';
import { z } from 'zod';

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({ temperature: z.number(), conditions: z.string() }),
  execute: async ({ location }) => fetchWeather(location),
});

const mcp = await createMCPTools({
  url: 'https://mcp.example.com/mcp',
  auth: { kind: 'bearer', token: process.env.MCP_TOKEN },
});

const result = callModel(client, {
  model: 'anthropic/claude-opus-4-8',
  input: 'Summarize my open Linear issues and the weather in SF.',
  tools: [weatherTool, ...mcp.tools],
});

for await (const event of result.getToolStream()) {
  if (event.type !== 'tool.result') continue;
  if (event.source === 'client' && event.toolName === 'get_weather') {
    console.log(`Weather: ${event.result.temperature}°`);           // typed from outputSchema
  }
  if (event.source === 'mcp') {
    console.log(`MCP tool ${event.toolName} returned`, event.result); // unknown: narrow yourself
  }
}

for (const t of [weatherTool, ...mcp.tools]) {
  console.log(t.function.name, isMcpTool(t) ? '(mcp)' : '(client)');
}
```

- Every wrapped tool carries the `_mcp` brand. `source: 'client'` results are typed from `outputSchema`; `source: 'mcp'` results are `unknown`, since the server describes output at runtime.
- `isMcpTool(tool)`: runtime guard, useful in lifecycle hooks or custom stop conditions.
- `markMcp(tool)`: add the brand to an already-built client tool. Used internally on every wrapped tool, including synthetic resource tools. `markMcp(tool, { loopKey })` also sets a doom-loop identity ([§2.13](#213-doom-loop-detection)).
- The example above reads `tool.result` from `getToolStream()`. The documented `ToolStreamEvent` union lacks that type ([§2.6](#26-streaming-every-consumption-pattern)); `getFullResponsesStream()` documents `tool.result`.

#### Caching and rehydration

Every `createMCPTools()` call does an `initialize` + `tools/list` round-trip. For cold-start-heavy workloads (serverless, edge, per-request handlers), persist a snapshot:

```typescript
import { createMCPTools, rehydrateMCPTools } from '@openrouter/mcp';

const mcp = await createMCPTools({
  url: 'https://mcp.example.com/mcp',
  auth: { kind: 'bearer', token: process.env.MCP_TOKEN },
  cacheCredentials: true,
});
const snapshot = await mcp.serialize(); // plain JSON, store anywhere
await mcp.close();

// Later, in another process (no network round-trip):
const mcp2 = await rehydrateMCPTools({
  snapshot,
  auth: { kind: 'bearer', token: process.env.MCP_TOKEN },
});
```

Automatic cache store (rehydrate on hit; connect and write on miss):

```typescript
import { createMCPTools, InMemoryMCPCacheStore } from '@openrouter/mcp';

const store = new InMemoryMCPCacheStore(); // or your own Redis/DB-backed MCPCacheStore

const mcp = await createMCPTools({
  url: 'https://mcp.example.com/mcp',
  auth: { kind: 'bearer', token: process.env.MCP_TOKEN },
  cache: { store, key: `mcp:${userId}` },
  staleness: { maxAgeMs: 60 * 60 * 1000 },
});
```

- Implement `MCPCacheStore` (a small `get` / `set` / `delete` interface) for Redis, a DB, or any KV store.
- **`cacheCredentials` is `false` by default.** When enabled, snapshots contain bearer tokens or headers: treat the store as a secret store and namespace cache keys by principal in multi-tenant setups.

#### Streaming, progress, cancellation, list changes

Wrapped MCP tools behave like generator tools. Server progress notifications surface as `tool.progress` events:

```typescript
for await (const event of result.getToolStream()) {
  if (event.type === 'tool.progress' && event.source === 'mcp') {
    console.log(`[${event.toolName}] ${event.progress}`);
  }
}
```

- `createMCPTools({ signal })`: every in-flight tool call is cancelled when the signal aborts. Individual `callModel` runs can also be aborted through their own signal.
- `autoRefreshOnListChanged` (default on): keeps `mcp.tools` in sync on `tools/list_changed`; the next `callModel` step sees the new list without reconnecting.

#### Resources and elicitation

- **Resources as synthetic tools** (default on): when the server advertises resources, two tools are added: `list_resources` (enumerate) and `read_resource` (fetch by URI). `resources: false` hides them; `resources: { mode: 'synthetic-tools' }` configures the mode (other modes are reserved for the future).
- **Elicitation** (`elicitation/create`): servers can pause a tool call to request structured input. Answer with `onElicitation`; without a handler, requests are **auto-declined** so the call fails cleanly instead of hanging.

```typescript
const mcp = await createMCPTools({
  url,
  auth,
  onElicitation: async ({ message, requestedSchema }) => {
    const answer = await promptUser(message, requestedSchema);
    return { action: 'accept', content: answer };
  },
});
```

#### Multiple servers

```typescript
const [github, linear] = await Promise.all([
  createMCPTools({ url: githubUrl, auth: gh, toolNamePrefix: 'github_' }),
  createMCPTools({ url: linearUrl, auth: ln, toolNamePrefix: 'linear_' }),
]);

const result = callModel(client, {
  model: 'anthropic/claude-opus-4-8',
  input: 'Find the Linear issue linked to GitHub PR #42.',
  tools: [...github.tools, ...linear.tools],
});
```

#### `createMCPTools` options

| Option | Default | Description |
| - | - | - |
| `url` | | Remote MCP server endpoint |
| `transport` | `'streamableHttp'` (falls back to SSE) | Or `'sse'` |
| `auth` | | `{ kind: 'bearer', token }`, `{ kind: 'headers', headers }`, or `{ kind: 'oauth', provider }` |
| `fetch` | | Custom `fetch` for all network requests |
| `clientInfo` | | Client identity sent during `initialize` |
| `toolNamePrefix` | | Prefix applied to every wrapped tool name |
| `includeTools` / `excludeTools` | | Allow/deny lists by MCP tool name |
| `onUnconvertibleSchema` | `'looseLeaf'` | Or `'throw'`, for exotic JSON Schema |
| `cache` | | `{ store: MCPCacheStore, key: string }` |
| `cacheCredentials` | `false` | Include credentials in snapshots |
| `staleness` | | e.g. `{ maxAgeMs }` |
| `resources` | on | Synthetic `list_resources` / `read_resource`; `false` or `{ mode: 'synthetic-tools' }` |
| `emitProgress` | on | Stream MCP progress as generator-tool events |
| `autoRefreshOnListChanged` | on | Re-list on `tools/list_changed` |
| `onElicitation` | auto-decline | Handle server elicitation requests |
| `signal` | | `AbortSignal` threaded into every tool call |
| `loopKeys` | | Map of per-tool doom-loop identities (from the Doom-Loop page) |

`rehydrateMCPTools({ snapshot, auth })` takes a serialized snapshot and auth; other accepted options are not listed.

Sources: https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/overview

### 2.12 Lifecycle hooks

Lifecycle hooks observe and control specific points of the `callModel` loop. Uses: inspect, modify, or block tool calls; record tool successes and failures; rewrite or reject prompts; decide approvals; override stop conditions; track sessions, model calls, tokens, latency, and cost; run custom typed application events.

They are **not** transport hooks. `SDKHooks` / `BeforeRequestHook` ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)) intercept HTTP requests; lifecycle hooks fire on agent-loop events.

#### Two ways to register

**Inline** (built-in hooks only): `hooks: { HookName: HookEntry[] }`.

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
import { z } from 'zod/v4';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const shellTool = tool({
  name: 'run_shell',
  description: 'Run a shell command',
  inputSchema: z.object({ command: z.string() }),
  outputSchema: z.object({ output: z.string() }),
  execute: async ({ command }) => ({ output: await runInSandbox(command) }),
});

const result = openrouter.callModel({
  model: 'openai/gpt-5.4',
  input: 'Delete temporary build files',
  tools: [shellTool] as const,
  hooks: {
    PreToolUse: [
      {
        matcher: 'run_shell',
        handler: ({ toolInput }) => {
          if (String(toolInput.command).includes('rm -rf /')) {
            return { block: 'Refusing to run a destructive command' };
          }
        },
      },
    ],
    PostToolUse: [
      { handler: ({ toolName, durationMs }) => { recordToolLatency(toolName, durationMs); } },
    ],
  },
});
```

**`HooksManager`** (custom hooks, dynamic registration, programmatic `emit`, explicit lifecycle control; shareable across `callModel` runs). Import from `@openrouter/agent` or `@openrouter/agent/hooks-manager`.

```typescript
import { HooksManager, OpenRouter } from '@openrouter/agent';

const hooks = new HooksManager();

const unsubscribe = hooks.on('PreToolUse', {
  matcher: /^db_/,
  filter: ({ toolInput }) => Object.keys(toolInput).length > 0,
  handler: ({ toolInput }, context) => {
    audit(context.sessionId, toolInput);
    return { mutatedInput: { ...toolInput, dryRun: true } };
  },
});

const result = openrouter.callModel({
  model: 'openai/gpt-5.4',
  input: 'Check which old records can be removed',
  tools: [databaseTool] as const,
  hooks,
});
await result.getText();
unsubscribe();
```

Every handler receives `(payload, context)`:

```typescript
interface LifecycleHookContext {
  readonly signal: AbortSignal;
  readonly hookName: string;
  readonly sessionId: string;
}
```

The SDK supplies the current run's session ID per event, so one manager can serve concurrent `callModel` runs without mixing session IDs.

#### Built-in hooks

| Hook | When it fires | Effect | Payload | Result (return) |
| - | - | - | - | - |
| `SessionStart` | Once, before the initial request | Observe | `{ config?: Record<string, unknown> }` | none |
| `UserPromptSubmit` | Before the initial prompt is sent | Rewrite or reject | `{ prompt: string }` | `{ mutatedPrompt?: string; reject?: boolean \| string }` |
| `PostModelCall` | After every completed model response | Observe | `PostModelCallPayload` | none |
| `PermissionRequest` | When a tool requires approval, before the SDK pauses | Allow, deny, or ask | `{ toolName; toolInput; riskLevel: 'low' \| 'medium' \| 'high' }` | `{ decision: 'allow' \| 'deny' \| 'ask_user'; reason?: string }` |
| `PreToolUse` | Before client tool execution (normal rounds and resumed approvals) | Rewrite or block | `{ toolName: string; toolInput: Record<string, unknown> }` | `{ mutatedInput?: Record<string, unknown>; block?: boolean \| string }` |
| `PostToolUse` | After tool success | Observe | `{ toolName; toolInput; toolOutput: unknown; durationMs: number }` | none |
| `PostToolUseFailure` | After a tool executed and threw / returned an error | Observe | `{ toolName; toolInput; error: unknown }` | none |
| `Stop` | When a `stopWhen` condition halts the loop | Append or resume | `{ reason: 'max_turns' }` | `{ forceResume?: boolean; appendPrompt?: string }` |
| `SessionEnd` | Once, when a started session exits | Observe | `{ reason: 'user' \| 'error' \| 'max_turns' \| 'complete'; totalUsage?: SessionUsageTotals }` | none |
| `DoomLoopDetected` | On every doom-loop verdict ([§2.13](#213-doom-loop-detection)) | Override action | not documented | `overrideAction` (last handler wins) |

`DoomLoopDetected` is documented only on the Doom-Loop Detection page. It is absent from the hooks page's table and from the exported payload types.

#### Per-hook details

**SessionStart.** Exported type `SessionStartPayload = { readonly config?: Record<string, unknown> }`. The loop currently emits `config: { hasTools: boolean; hasApproval: boolean; hasState: boolean }`. Use it to initialize tracing, audit records, or session-scoped resources.

**UserPromptSubmit.** `mutatedPrompt` replaces the prompt. `reject: true` aborts with a default error; a non-empty string is the rejection reason. For structured input, the hook uses the latest user-role text; if no user text can be extracted, the hook is skipped.

```typescript
hooks.on('UserPromptSubmit', {
  handler: ({ prompt }) => {
    if (containsSecret(prompt)) return { reject: 'Remove secrets before submitting this prompt' };
    return { mutatedPrompt: redactPersonalData(prompt) };
  },
});
```

**PostModelCall.**

```typescript
type PostModelCallPayload = {
  sessionId: string;
  responseId: string;          // OpenRouter generation ID
  model: string;
  durationMs: number;          // dispatch until full response materialized (includes stream consumption)
  turnType: 'initial' | 'resume' | 'tool_round' | 'final' | 'retry';
  turnNumber: number;
  usage?: ModelCallUsage;      // omitted when the server reports no usage
};

type ModelCallUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cost?: number;               // only when server-side usage accounting reports cost
};
```

- Fires for: the initial request, approval/HITL resume requests, follow-ups after tool rounds, the `allowFinalResponse` final request, and empty-final retries. These map to `turnType`.
- A failed stream that never produces a complete response does **not** emit it. A materialized `response.incomplete` response **does**.
- No-tools streaming path: the response completes only after stream consumption, so the hook fires during session teardown, immediately before `SessionEnd`.
- Suitable for one tracing span per model call. `responseId` can be looked up via the generations endpoint ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

```typescript
hooks.on('PostModelCall', {
  handler: (payload, context) => {
    recordModelSpan({
      sessionId: context.sessionId,
      generationId: payload.responseId,
      model: payload.model,
      durationMs: payload.durationMs,
      cost: payload.usage?.cost,
    });
  },
});
```

**PermissionRequest.**

- `allow`: skip the approval gate; the tool runs through the normal loop.
- `deny`: do not run; a rejected result is sent to the model.
- `ask_user`: continue into the normal approval flow (pause, [§2.17](#217-tool-approval-and-state-persistence)).
- When multiple handlers return decisions, **the last returned decision wins**.
- `riskLevel` derives from the approval rule: callback-based rules = `high`, blanket `true` = `medium`, other cases = `low`.

```typescript
hooks.on('PermissionRequest', {
  matcher: 'read_file',
  handler: ({ toolInput }) =>
    isAllowedPath(toolInput.path)
      ? { decision: 'allow' }
      : { decision: 'deny', reason: 'The requested path is outside the workspace' },
});
```

**PreToolUse.** `mutatedInput` replaces the arguments **before schema validation and execution**. `block: true` skips execution with a default reason; a non-empty string skips execution and is sent to the model as the reason. If the model supplied invalid JSON arguments, the SDK produces a parse error without emitting tool hooks.

```typescript
hooks.on('PreToolUse', {
  matcher: 'search',
  handler: ({ toolInput }) => ({
    mutatedInput: { ...toolInput, limit: Math.min(Number(toolInput.limit ?? 10), 50) },
  }),
});
```

**PostToolUse.** Observational. `toolInput` holds the effective arguments after any `PreToolUse` mutation.

**PostToolUseFailure.** Does **not** fire when the tool never ran: `PermissionRequest` denial, user rejection, `PreToolUse` block, invalid JSON arguments, or a HITL tool pausing. Observe those in the gating hook. `PostToolUse` fires after a paused HITL tool is resumed and completes.

**Stop.**

- `appendPrompt` injects a user message but does not by itself continue the loop. Prompts from multiple handlers are joined with newlines.
- If any handler returns `forceResume: true`, the loop continues, limited to **three consecutive overrides without progress**. A tool output or a fresh model response resets the counter; blocked and denied tool outputs count as progress.
- A bare `forceResume` usually triggers the same stop condition again and burns the override budget. Pair it with `appendPrompt` or a stop condition whose external state can change.

```typescript
hooks.on('Stop', {
  handler: ({ reason }) => {
    if (reason === 'max_turns' && shouldAskForSummary()) {
      return { forceResume: true, appendPrompt: 'Summarize the work completed so far.' };
    }
  },
});
```

**SessionEnd.**

```typescript
type SessionUsageTotals = ModelCallUsage & { modelCalls: number };
```

- `totalUsage` is present when at least one model response completed. Token fields are summed; `cost` is included when at least one response reported it.
- When `SessionStart` succeeded, `SessionEnd` fires **exactly once**: on completion, approval pause, interruption, error, and no-tools streaming teardown. An approval pause currently ends with `reason: 'complete'`.
- Approval and HITL **resume** calls skip `SessionStart` / `SessionEnd`. Tool hooks still fire and detached work is still drained.
- A teardown error is logged and never replaces the run's original error.
- Inconsistency: the Doom-Loop page says a doom-loop stop ends with `SessionEnd.reason: 'doom_loop'`, which is not in the documented `reason` union.

#### Matchers and filters

```typescript
type ToolMatcher = string | RegExp | ((toolName: string) => boolean);
```

- A string matches exactly; a RegExp or predicate matches a set.
- A matcher-scoped handler is skipped when the event has no tool name. Matchers are for tool-scoped hooks (`PermissionRequest`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`); use `filter` alone for session, prompt, model-call, and stop hooks.
- `filter(payload)` adds any further condition.

```typescript
hooks.on('PreToolUse', {
  matcher: /^filesystem_/,
  filter: ({ toolInput }) => toolInput.path !== undefined,
  handler: ({ toolInput }) => { validateWorkspacePath(toolInput.path); },
});
```

#### Handler chain behavior

Handlers run **sequentially in registration order**:

1. Check the handler's matcher and filter.
2. Call the handler with the **latest** payload.
3. A mutation replaces the corresponding payload field for later handlers (mutations pipe through the chain).
4. A block or rejection stops the remaining chain. The blocking handler's own mutation is still applied first.

```typescript
hooks.on('PreToolUse', { matcher: 'query_database', handler: ({ toolInput }) => ({ mutatedInput: { ...toolInput, limit: 100 } }) });
hooks.on('PreToolUse', {
  matcher: 'query_database',
  handler: ({ toolInput }) => (isSafeQuery(toolInput) ? undefined : { block: 'Unsafe query' }), // sees limit: 100
});
```

- Empty strings neither block nor reject.
- Return `mutatedInput` / `mutatedPrompt`; do not mutate nested payload values in place.
- By default a throwing handler, matcher, or filter is **logged and skipped**. Payload/result schema failures follow the same policy. Strict mode propagates them (useful in tests): `new HooksManager(undefined, { throwOnHandlerError: true })`.

#### Asynchronous handlers and `AsyncOutput`

Handlers may return a promise; the chain awaits it before the next handler. To detach work (telemetry, audit) without delaying the loop, return an `AsyncOutput` signal:

```typescript
interface AsyncOutput {
  readonly async: true;
  readonly work?: Promise<unknown>;
  readonly asyncTimeout?: number;   // ms; default 30 seconds
}

hooks.on('PostToolUse', {
  handler: (payload, context) => ({
    async: true,
    work: sendTelemetry(payload, { signal: context.signal }),
    asyncTimeout: 5_000,
  }),
});
```

- On timeout, the handler context's `signal` is aborted and the timeout is logged. Promises cannot be force-cancelled, so background work must observe `context.signal`.
- The manager tracks detached work. On shutdown: `hooks.abortInflight('Application shutting down'); await hooks.drain();`. The agent loop also drains pending hook work when a run ends.
- `isAsyncOutput(value)` is the exported type guard. Objects with extra fields are **not** async signals, so a mutation cannot be accidentally discarded.

#### Custom hooks

```typescript
import { HooksManager } from '@openrouter/agent';
import { z } from 'zod/v4';

const hooks = new HooksManager({
  DeploymentGate: {
    payload: z.object({ environment: z.string(), version: z.string() }),
    result: z.object({ approved: z.boolean() }),
  },
  AuditLog: {
    payload: z.object({ event: z.string() }),
    result: z.void(),
  },
});

hooks.on('DeploymentGate', { handler: ({ environment }) => ({ approved: environment !== 'production' }) });

const { results } = await hooks.emit('DeploymentGate', { environment: 'staging', version: '1.2.3' });
console.log(results[0]?.approved);

// Shared manager + concurrent operations: pass a per-emit session ID
await hooks.emit('AuditLog', { event: 'deployment_started' }, { sessionId: deployment.id });
```

- Payloads and non-void results are validated on every `emit()`. Zod transforms, defaults, and coercion apply before handlers run, so handlers receive the schema output type.
- Custom names must be non-empty and must not collide with built-in names.
- Custom hooks do not inherit built-in mutation/blocking behavior.
- **Inline configuration supports only built-in hooks.**
- `setSessionId()` sets a manager-wide default for direct emits; it is last-writer-wins, so prefer the per-emit `sessionId`.

#### `HooksManager` API

| Member | Signature | Description |
| - | - | - |
| constructor | `new HooksManager(customHooks?, options?)` | `customHooks`: name to `{ payload, result }` Zod schemas. `options.throwOnHandlerError`: propagate hook errors when `true` |
| `on` | `hooks.on(hookName, entry): () => void` | Register `{ handler, matcher?, filter? }`; returns an unsubscribe fn |
| `off` | `hooks.off(hookName, handler): boolean` | Remove a specific handler; returns whether found |
| `removeAll` | `hooks.removeAll(hookName?): void` | Remove handlers for one hook, or all |
| `setSessionId` | `hooks.setSessionId(sessionId): void` | Default `context.sessionId` for direct `emit()` (last-writer-wins) |
| `emit` | `await hooks.emit(hookName, payload, { toolName?, sessionId? })` | Validate the payload, run the chain, return `EmitResult`. `toolName` feeds matchers; `sessionId` overrides the default |
| `hasHandlers` | `hooks.hasHandlers(hookName): boolean` | Any handlers registered? |
| `abortInflight` | `hooks.abortInflight(reason?): void` | Abort active handler signals |
| `drain` | `await hooks.drain(): Promise<void>` | Wait for detached work to settle |

```typescript
type EmitResult<Result, Payload> = {
  results: Result[];
  pending: Promise<void>[];
  finalPayload: Payload;
  blocked: boolean;
  mutated: boolean;
};
```

Exported hook-related values and types: `HooksManager`, `HookName`, `isAsyncOutput`; types `InlineHookConfig`, `HookEntry`, `HookHandler`, `HookReturn`, `HooksManagerOptions`, `HookDefinition`, `HookRegistry`, `ToolMatcher`, `EmitResult`, `BuiltInHookDefinitions`, `LifecycleHookContext`, `AsyncOutput`, and every `*Payload` / `*Result` type above plus `ModelCallUsage`, `SessionUsageTotals`.

Sources: https://openrouter.ai/docs/agent-sdk/call-model/lifecycle-hooks, https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/call-model/async-tools

### 2.13 Doom-loop detection

A doom loop is a run that keeps repeating the same action without progress while spending money. Detection runs inside the `callModel` tool loop and is **off by default**.

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-4o',
  input: 'Research this topic',
  tools: [searchTool, bashTool] as const,
  doomLoop: true, // recommended defaults: observe@2, block@3, stop@6
  // or tune it:
  // doomLoop: {
  //   ladder: { observe: 2, steer: false, block: 3, stop: 6 },
  //   text: { minRepeats: 4 }, // or `false` to disable text detection
  // },
});

const verdict = await result.getDoomLoopVerdict(); // was the run stopped by detection?
if (verdict) console.warn(verdict.message);
```

#### Configuration shape (as documented)

```typescript
doomLoop?: boolean | {
  ladder?: {                 // streak thresholds per action; `false` disables an action
    observe?: number | false;
    steer?: number | false;     // off by default
    escalate?: number | false;  // off by default; needs `escalation`
    block?: number | false;
    stop?: number | false;
  };
  text?: { minRepeats?: number } | false;  // text-repeat detection; false disables
  escalation?: {
    model?: string;          // run the NEXT turn on a stronger model
    advisor?: boolean;       // and/or force an openrouter:advisor consult
    maxEscalations?: number; // cap for the whole conversation (survives pause/resume)
  };
};
```

This type is assembled from the documented examples; no formal type is published. `doomLoop: true` = `observe: 2, block: 3, stop: 6`, with `steer` and `escalate` off. The default `text.minRepeats` is not stated.

#### What is detected

1. **Repeated calls to your tools**: same tool, same inputs, turn after turn. Broken calls count too: repeated empty `{}` or invalid JSON.
2. **Repeated OpenRouter server-tool requests**: e.g. the exact same web search every turn, even though server tools run on OpenRouter's side and you never see the call (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) server tools).
3. **Repeated text**: a phrase repeating at the end of one response, or a response identical to the previous one.

Counting rules (deterministic: the same transcript always gives the same result):

- A repeat counts only when the model **saw the result** and tried the same thing again. Five identical calls fired in one turn count as one.
- Using other tools in between does not reset a tool's streak. Changing the inputs does.
- Rearranged JSON keys or formatting changes do not evade detection; a model stuck on the same invalid JSON is caught rather than bouncing off the parse error forever.
- Repeats are judged on what the model sent, **before** any `PreToolUse` rewrite. Hooks cannot create or hide repeats.
- Built-in `task`-tool calls (async tools) are exempt.

#### Actions (strongest reached threshold wins)

| Action | Effect |
| - | - |
| `observe` | Notes only: emit the `DoomLoopDetected` hook |
| `steer` | Nudge with a message before the next turn saying it is repeating itself (off by default) |
| `escalate` | Run the next turn on a stronger model and/or with a forced `openrouter:advisor` consult, then switch back (off by default; needs `escalation`) |
| `block` | Refuse to run the repeated call; the model gets an error explaining why. Text and server-tool repeats cannot be blocked (they already happened): they fall through to the strongest weaker enabled action (`escalate`, `steer`, or `observe`) |
| `stop` | End the run (`SessionEnd.reason: 'doom_loop'`). Unfinished tool calls get clean error outputs, so the saved conversation stays valid and resumable |

- The SDK validates thresholds and warns about combinations that cannot work. `block` without `stop` lets a stubborn model retry forever (bounded only by `stopWhen`); a weaker action set at a higher threshold than a stronger one can never fire.
- Per-tool overrides: the `DoomLoopDetected` lifecycle hook sees every verdict and can return `overrideAction` (last handler wins). For example, downgrade `block` to `observe` for a tool that repeats harmlessly, or jump straight to `stop`.

#### Escalation to a stronger model

```typescript
openrouter.callModel({
  model: 'z-ai/glm-5.2', // everyday executor
  input: 'Research this topic',
  tools: [searchTool] as const,
  doomLoop: {
    ladder: { observe: 2, escalate: 3, block: 5, stop: 8 },
    escalation: {
      model: 'anthropic/claude-opus-4.6', // run the NEXT turn on a stronger model
      advisor: true,                      // and/or force an openrouter:advisor consult
      maxEscalations: 2,                  // spend cap for the whole conversation
    },
  },
});
```

When escalation fires, the engine tells the model a loop was detected, runs one turn with the extra help, then returns to normal. Once `maxEscalations` is exhausted (counted across pauses and resumes), weaker actions take over. (`openrouter:advisor` is a server tool; see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).)

#### `loopKey`: defining "the same call"

Default identity is all inputs, exactly (after normalization of JSON key order and formatting). Override per tool:

```typescript
// Function: normalize ("Cats" and " cats " are the same search)
tool({
  name: 'web_search',
  inputSchema: z.object({ query: z.string() }),
  loopKey: ({ query }) => query.trim().toLowerCase(),
  execute: async ({ query }) => search(query),
});

// Function returning a subset: command + cwd matter, verbose doesn't
tool({
  name: 'bash',
  inputSchema: z.object({ command: z.string(), cwd: z.string(), verbose: z.boolean() }),
  loopKey: ({ command, cwd }) => ({ command, cwd }),
  execute: async ({ command, cwd }) => run(command, cwd),
});

// false: never count this tool (repetition is its job, e.g. polling)
tool({
  name: 'check_status',
  inputSchema: z.object({ jobId: z.string() }),
  loopKey: false,
  execute: async ({ jobId }) => poll(jobId),
});
```

- A function `loopKey` may return `null` to skip one specific call.
- If the function fails (returns `undefined`, throws, or returns something unhashable), the SDK falls back to comparing all inputs and logs a warning. Detection never crashes a run.
- A field-name array (`loopKey: ['command', 'cwd']`) is plain data: it survives caching and can travel over the wire via `_meta['openrouter/loopKey']`.
- MCP-wrapped tools: `markMcp(tool, { loopKey })` or the `loopKeys` map on `createMCPTools` ([§2.11](#211-mcp-tools-via-openroutermcp)).

#### Pausing and resuming

- Detector memory lives in the conversation state. Streaks survive save/resume **as long as the resuming call also passes `doomLoop`**.
- A `stop` verdict is cleared by sending a fresh user message, but streaks remain, so a model that immediately repeats is still caught.

#### Not caught

- Loops with changing inputs (fresh timestamp or random value per call). Fix with a `loopKey` selecting the fields that matter.
- Same idea in different words. Text detection needs exact repeats.
- Inputs changed by hooks (judged pre-hook, see above).
- Calls your own code executes: manual and client-executed calls pause the loop and are not counted. Only calls the SDK ran, blocked, or failed to parse count as evidence.

Sources: https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools

### 2.14 Stop conditions (`stopWhen`)

```typescript
type StopWhen = StopCondition | StopCondition[];
type StopCondition = (context: StopConditionContext) => boolean | Promise<boolean>;
interface StopConditionContext { steps: StepResult[]; }   // all completed steps, including results and usage
```

**Default behavior:** without `stopWhen`, the loop runs until the model produces a turn with no tool calls. The docs recommend always passing an explicit bound (`stepCountIs(n)`, `maxCost(...)`).

#### Built-in helpers (all exported from `@openrouter/agent` and `@openrouter/agent/stop-conditions`)

| Function | Signature | Stops when |
| - | - | - |
| `stepCountIs` | `(n: number) => StopCondition` | `n` steps have completed |
| `hasToolCall` | `(name: string) => StopCondition` | The named tool is called |
| `maxTokensUsed` | `(n: number) => StopCondition` | `n` total tokens have been used |
| `maxCost` | `(amount: number) => StopCondition` | Cost reaches the limit (USD, e.g. `maxCost(1.00)` = $1.00) |
| `finishReasonIs` | `(reason: string) => StopCondition` | The step's finish reason matches (e.g. `'stop'` = natural finish) |

```typescript
import { OpenRouter, tool, stepCountIs, hasToolCall, maxTokensUsed, maxCost, finishReasonIs } from '@openrouter/agent';
import { z } from 'zod';

openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Analyze this data', tools: [analysisTool], stopWhen: stepCountIs(10) });

const finishTool = tool({
  name: 'finish',
  description: 'Call this when the task is complete',
  inputSchema: z.object({ summary: z.string() }),
  execute: async (params) => ({ done: true }),
});
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Research until you have enough information, then call finish',
  tools: [searchTool, finishTool],
  stopWhen: hasToolCall('finish'),
});

openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Generate content', tools: [writingTool], stopWhen: maxTokensUsed(5000) });
openrouter.callModel({ model: 'openai/gpt-5.2', input: 'Perform extensive analysis', tools: [analysisTool], stopWhen: maxCost(1.00) });
openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Complete this task', tools: [taskTool], stopWhen: finishReasonIs('stop') });
```

#### Combining

An array stops when **any** condition is met (logical OR):

```typescript
stopWhen: [
  stepCountIs(10),        // maximum 10 steps
  maxCost(0.50),          // maximum $0.50
  hasToolCall('finish'),  // or when finish is called
],
```

For AND logic, write a custom condition that evaluates several checks.

#### Final response after a stop (`allowFinalResponse`)

A stop condition can fire while the model is still emitting tool calls. By default the SDK then:

1. Executes those pending tool calls, so they have matching outputs.
2. Makes **one more model turn** with `toolChoice: 'none'`, appending `DEFAULT_FINAL_RESPONSE_DIRECTIVE` as a user message, so the run ends with a natural-language answer instead of a half-finished tool call.

Tools stay in the request (only calling is forbidden), which preserves the prompt-cache prefix.

```typescript
openrouter.callModel({
  model: 'openai/gpt-5.2',
  input: 'Research this topic',
  tools: [searchTool],
  stopWhen: stepCountIs(5),
  // default (omitted or true): final turn + built-in directive
  // allowFinalResponse: 'Summarize what you found so far.', // custom directive wording
  // allowFinalResponse: '',                                  // final turn, no appended message
  // allowFinalResponse: false,                               // no final turn: run ends on the halted tool-call turn
});
```

- Without the directive, models that emit tool-call syntax as text can leak an unparsed tool call (e.g. `<tool_call>…`) into final content. The default exists to prevent that.
- The final turn happens **only** when a stop condition halted the loop while the last response contained executable tool calls. It never fires on natural completion, HITL/approval pauses, or interruption.
- It counts as a model call (`PostModelCall` with `turnType: 'final'`).

#### Empty final output after tool rounds (`strictFinalResponse`)

Some mini-class models intermittently treat a successful tool call as the terminal answer and return an empty `output` array on the final turn. Default behavior: retry that follow-up once; if still empty, resolve with empty text instead of throwing `Invalid final response: empty or invalid output`. This tolerance applies only after at least one completed tool round; runs with no tool work still throw on an empty final response.

```typescript
openrouter.callModel({
  model: 'openai/gpt-5-mini',
  input: 'Look up the weather in Paris',
  tools: [weatherTool],
  strictFinalResponse: true, // throw instead (pre-0.8.0 behavior)
});
```

Use `true` if your code depends on non-empty final text.

#### Custom conditions

```typescript
stopWhen: ({ steps }) => {
  if (steps.length >= 20) return true;                       // after 20 steps
  const lastStep = steps[steps.length - 1];
  if (lastStep && !lastStep.toolCalls?.length) return true;  // last step had no tool calls
  return false;
},
```

Two different `StepResult` shapes are documented:

```typescript
// API reference
interface StepResult {
  stepType: 'initial' | 'continue';
  text: string;
  toolCalls: TypedToolCallUnion[];
  toolResults: ToolExecutionResultUnion[];
  response: OpenResponsesNonStreamingResponse;
  usage?: OpenResponsesUsage;
  finishReason?: string;
  warnings?: Warning[];                          // Warning = { type: string; message: string }
  experimental_providerMetadata?: Record<string, unknown>;
}

// Stop Conditions page
interface StepResult {
  response: Response;
  toolCalls?: ParsedToolCall[];
  toolResults?: ToolExecutionResult[];
  tokens: { input: number; output: number; cached: number };
  cost: number;
}
```

The fields common to both are `response`, `toolCalls`, and `toolResults`. Code defensively for the rest (`step.cost ?? 0`, `step.usage?.…`, optional chaining on `toolCalls` / `toolResults`), as the docs' own examples do.

#### Advanced patterns

```typescript
// Time-based
const startTime = Date.now();
stopWhen: () => Date.now() - startTime > 30_000,

// Content-based
stopWhen: ({ steps }) => {
  const last = steps[steps.length - 1];
  if (!last) return false;
  const content = JSON.stringify(last.response);
  return content.includes('ANSWER FOUND') || content.includes('TASK COMPLETE');
},

// Quality-based (inspect tool results)
stopWhen: ({ steps }) => steps.some((step) =>
  (step.toolResults ?? []).some((r) => r.toolName === 'scorer' && (r.result as any)?.score > 0.9)),

// Hard limits + custom success
stopWhen: [
  stepCountIs(50),
  maxCost(5.00),
  ({ steps }) => !!steps[steps.length - 1]?.toolCalls?.some((tc) => tc.name === 'summarize'),
],

// Log stop reasons
stopWhen: ({ steps }) => {
  if (steps.length >= 10) { console.log('Stopped: step limit'); return true; }
  const totalCost = steps.reduce((sum, step) => sum + (step.cost ?? 0), 0);
  if (totalCost >= 1.00) { console.log('Stopped: cost limit'); return true; }
  return false;
},
```

Test conditions with low limits first (e.g. `stepCountIs(2)`). Recommended production baseline: `[stepCountIs(100), maxCost(10.00), customCondition]`.

#### Migration from `maxToolRounds`

```typescript
// Before
openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Hello', tools: [myTool], maxToolRounds: 5 });
// After
import { stepCountIs } from '@openrouter/agent';
openrouter.callModel({ model: 'openai/gpt-5-nano', input: 'Hello', tools: [myTool], stopWhen: stepCountIs(5) });
```

Stop-related hooks: `Stop` (can `forceResume` / `appendPrompt`, [§2.12](#212-lifecycle-hooks)). Doom-loop `stop` is separate ([§2.13](#213-doom-loop-detection)).

Sources: https://openrouter.ai/docs/agent-sdk/call-model/stop-conditions, https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/lifecycle-hooks, https://openrouter.ai/docs/agent-sdk/overview

### 2.15 Dynamic parameters (per-turn functions)

Pass a function instead of a static value and the SDK resolves it at the start of every turn:

```typescript
type ParameterFunction<T> = (context: TurnContext) => T | Promise<T>;

interface TurnContext {
  toolCall?: OpenResponsesFunctionToolCall;   // the specific tool call being executed (if any)
  numberOfTurns: number;                      // current turn number, 1-indexed
  turnRequest?: OpenResponsesRequest;         // current request: messages (input) and model settings
}
```

The dynamic-parameters page says "any parameter in `callModel` can be a function"; the API reference types `model`, `instructions`, `temperature`, `maxOutputTokens` (and `context`) as function-capable ([§2.3](#23-callmodel-signature-options-input-formats-model-selection)).

```typescript
import { OpenRouter } from '@openrouter/agent';
const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

// Progressive model upgrade
openrouter.callModel({
  model: (ctx) => (ctx.numberOfTurns <= 2 ? 'openai/gpt-5-nano' : 'openai/gpt-5.2'),
  input: 'Let me think through this problem...',
  tools: [analysisTool],
});

// Async functions (fetch external data)
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  temperature: async (ctx) => (await fetchUserPreferences(userId)).preferredTemperature ?? 0.7,
  instructions: async (ctx) => `Follow these rules:\n${(await fetchBusinessRules()).join('\n')}`,
  input: 'Hello!',
});

// Adaptive temperature from the conversation so far
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  temperature: (ctx) => {
    const last = JSON.stringify(ctx.turnRequest?.input).toLowerCase();
    if (last.includes('creative') || last.includes('brainstorm')) return 1.0;
    if (last.includes('code') || last.includes('calculate')) return 0.2;
    return 0.7;
  },
  input: 'Write a creative story',
});

// Context-aware instructions
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  instructions: (ctx) => {
    const base = `You are a helpful assistant.\nThis is turn ${ctx.numberOfTurns} of the conversation.`;
    return ctx.numberOfTurns > 5 ? `${base}\nKeep responses concise - this is a long conversation.` : base;
  },
  input: 'Continue helping me...',
  tools: [helpTool],
});

// Dynamic max tokens
openrouter.callModel({
  model: 'openai/gpt-5-nano',
  maxOutputTokens: (ctx) => {
    const last = JSON.stringify(ctx.turnRequest?.input).toLowerCase();
    if (last.includes('summarize') || last.includes('brief')) return 200;
    if (last.includes('detailed') || last.includes('explain')) return 2000;
    return 500;
  },
  input: 'Give me a detailed explanation',
});

// "Feature flags" via provider (as shown in the docs)
openrouter.callModel({
  model: 'anthropic/claude-sonnet-4.5',
  provider: async (ctx) => (ctx.numberOfTurns > 2
    ? { anthropic: { thinking: { type: 'enabled', budgetTokens: 1000 } } }
    : undefined),
  input: 'Solve this complex problem',
  tools: [analysisTool],
});

// Combined with tools
openrouter.callModel({
  model: (ctx) => (JSON.stringify(ctx.turnRequest?.input).includes('function_call')
    ? 'anthropic/claude-sonnet-4.5' : 'openai/gpt-5-nano'),
  temperature: (ctx) => (ctx.numberOfTurns > 1 ? 0.3 : 0.7),
  input: 'Research and analyze this topic',
  tools: [searchTool, analysisTool],
});
```

The `provider` example's `anthropic.thinking` object is not part of the documented `ProviderPreferences` fields ([§2.3](#23-callmodel-signature-options-input-formats-model-selection)). For reasoning/thinking budgets, prefer the documented `reasoning` option (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) reasoning tokens).

#### Execution order (per turn)

1. Resolve all parameter functions with the current `TurnContext`.
2. Build the request with resolved values.
3. Send to the model.
4. Execute tools (if any).
5. Check stop conditions.
6. Update `TurnContext` for the next turn.
7. Repeat from step 1.

#### Error handling and best practices

- Catch errors inside async parameter functions and return a fallback (e.g. default instructions). The docs show no SDK-level fallback.
- Keep functions pure (no logging-to-DB side effects).
- Cache expensive lookups across turns (module-level variable).
- Always return a sensible default (`preferredModel ?? 'openai/gpt-5-nano'`).
- Related: `nextTurnParams` lets *tools* change parameters for the next turn ([§2.16](#216-nextturnparams-tool-driven-parameter-changes-skills--plugins-pattern)); `context` functions are resolved once at turn 0, not per turn ([§2.9](#29-tools)).

Sources: https://openrouter.ai/docs/agent-sdk/call-model/dynamic-parameters, https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/tools

### 2.16 `nextTurnParams`: tool-driven parameter changes (skills / plugins pattern)

`nextTurnParams` lets a tool modify `callModel` parameters for the **next** turn. Uses: skills/plugins that load domain instructions when activated; progressive context; adaptive model or temperature; tools that own their context requirements.

```typescript
import { tool } from '@openrouter/agent';
import { z } from 'zod';

const expertModeTool = tool({
  name: 'enable_expert_mode',
  description: 'Enable expert mode for detailed technical responses',
  inputSchema: z.object({ domain: z.string().describe('Technical domain (e.g., "kubernetes", "react")') }),
  outputSchema: z.object({ enabled: z.boolean() }),
  nextTurnParams: {
    instructions: (params, context) => `${context.instructions ?? ''}

EXPERT MODE ENABLED for ${params.domain}:
- Provide detailed technical explanations
- Include code examples and best practices`,
    temperature: () => 0.3,
  },
  execute: async () => ({ enabled: true }),
});
```

#### Execution order

1. Model generates tool calls.
2. All tool `execute` functions run.
3. `nextTurnParams` functions run for each tool, **in `tools` array order**.
4. Modified parameters are used for the next model turn.
5. Repeat until the model stops calling tools.

#### Function arguments

Each entry is `(params, context) => newValue`:

- `params`: the validated **input** arguments of the tool call (typed from `inputSchema`), not the tool's output.
- `context`: the current request parameters:

| Property | Type (nextTurnParams page) | Description |
| - | - | - |
| `input` | `OpenResponsesInput` | Current message history |
| `model` | `string \| undefined` | Current model |
| `models` | `string[] \| undefined` | Model fallback array |
| `instructions` | `string \| undefined` | Current system instructions |
| `temperature` | `number \| undefined` | Current temperature |
| `maxOutputTokens` | `number \| undefined` | Current max tokens |
| `topP` | `number \| undefined` | Current top-p |
| `topK` | `number \| undefined` | Current top-k |

The API reference's `NextTurnParamsContext` types these differently: `model: string; models: string[]; temperature: number | null; maxOutputTokens: number | null; topP: number | null; topK?: number; instructions: string | null`. Handle both `null` and `undefined` (`context.instructions ?? ''`).

Modifiable keys shown: `input`, `model`, `instructions`, `temperature`, `maxOutputTokens` ("You can modify `CallModelInput` parameters"):

```typescript
nextTurnParams: {
  input: (params, ctx) => [...ctx.input, newMessage],         // modify message history
  model: (params, ctx) => 'anthropic/claude-sonnet-4.5',      // change model
  instructions: (params, ctx) => `${ctx.instructions}\n\nNew context...`,
  temperature: (params, ctx) => 0.5,
  maxOutputTokens: (params, ctx) => 2000,
},
```

`ctx.input` may be a string or an array. Normalize before spreading: `const current = Array.isArray(ctx.input) ? ctx.input : [ctx.input];`.

#### The Claude Code skills pattern

```typescript
import { tool } from '@openrouter/agent';
import { readFileSync } from 'fs';
import { z } from 'zod';

const skillsTool = tool({
  name: 'skill',
  description: `Load a specialized skill to enhance the assistant's capabilities.
Available skills: pdf-processing, data-analysis, code-review, etc.`,
  inputSchema: z.object({ type: z.string().describe("The skill type to load (e.g., 'pdf-processing')") }),
  outputSchema: z.string(),
  // Runs after all tool calls execute, before responses go to the model; in tools-array order
  nextTurnParams: {
    input: (params, context) => {
      if (JSON.stringify(context.input).includes(`Skill ${params.type} is already loaded`)) {
        return context.input; // prevent duplicate loading
      }
      const skill = readFileSync(`~/.claude/skills/${params.type}/SKILL.md`, 'utf-8');
      return [
        ...context.input,
        { role: 'user', content: `Base directory for this skill: ~/.claude/skills/${params.type}/\n\n${skill}` },
      ];
    },
  },
  execute: async (params, context) => {
    // docs use context.input here; the documented execute-context field is context.turnRequest?.input
    if (JSON.stringify(context.turnRequest?.input ?? []).includes(`Skill ${params.type} is already loaded`)) {
      return `Skill ${params.type} is already loaded`;
    }
    return `Launching skill ${params.type}`;
  },
});

const result = openrouter.callModel({
  model: 'anthropic/claude-sonnet-4.5',
  input: 'Process this PDF and extract the key findings',
  tools: [skillsTool],
});
```

Benefits listed: encapsulation (all skill logic in the tool), idempotency (built-in duplicate check), clean API (callers don't know file locations), composability (multiple skills across turns). Node's `readFileSync` does not expand `~`; the Skills Loader example ([§2.19](#219-examples-weather-tool-and-skills-loader)) resolves the path with `path.join(process.env.HOME, ...)`.

#### Patterns

```typescript
// Research context accumulation
nextTurnParams: {
  instructions: (params, context) =>
    `${context.instructions ?? ''}\n\nPrevious research on "${params.topic}" found important context.\nBuild upon these findings in your response.`,
},

// Model/temperature selection
nextTurnParams: {
  model: (params, context) => (params.complexity === 'high' ? 'anthropic/claude-sonnet-4.5' : context.model ?? 'openai/gpt-5-nano'),
  temperature: (params) => (params.complexity === 'high' ? 0.3 : 0.7),
},

// Locale switching
nextTurnParams: {
  instructions: (params, context) => {
    const lang = { en: 'Respond in English.', es: 'Responde en español.', fr: 'Répondez en français.', de: 'Antworten Sie auf Deutsch.', ja: '日本語で回答してください。' };
    return `${context.instructions ?? ''}\n\n${lang[params.language]}`;
  },
},
```

Doc caveat: the docs' "complexity-based model selection" example reads `params.complexity`, but `complexity` is in that tool's `outputSchema`, not its `inputSchema` (`{ code }`). Because `params` are the tool's **input** arguments, branch only on input fields. Put the decision field in `inputSchema` if `nextTurnParams` needs it.

Multi-skill loading (full version in [§2.19](#219-examples-weather-tool-and-skills-loader)): loop over `params.skills`, skip missing files and already-present markers, append one user message per skill.

#### Best practices

- **Idempotency**: tag injected content with a unique marker (`[Context: ${params.id}]`, `[Skill: name]`) and return `context.input` unchanged if it is already present.
- **Context preservation**: append to existing input; never replace it.
- **Safe access**: `context.instructions ?? 'You are a helpful assistant.'`.
- **Minimal modifications**: `temperature: (params) => params.needsPrecision ? 0.2 : undefined` is preferred over echoing `ctx.temperature`. The docs' preferred example returns `undefined` when no change is wanted, which implies `undefined` means "leave unchanged". This is not stated explicitly.

Sources: https://openrouter.ai/docs/agent-sdk/call-model/next-turn-params, https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/examples/skills-loader

### 2.17 Tool approval and state persistence

Two mechanisms:

- **`requireApproval`**: pause when the model calls sensitive tools, so a human can approve or reject each call.
- **`StateAccessor`**: persist conversation state between `callModel` invocations, so approvals, history, and tool results survive across runs (e.g. separate HTTP request/response cycles).

#### Tool-level approval

```typescript
import { tool } from '@openrouter/agent';
import { z } from 'zod';

// Always require approval
const sendEmailTool = tool({
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
  outputSchema: z.object({ sent: z.boolean() }),
  requireApproval: true,
  execute: async (params) => { await sendEmail(params); return { sent: true }; },
});

// Conditional approval: (parsed args, TurnContext) => boolean | Promise<boolean>
const deleteRecordTool = tool({
  name: 'delete_record',
  description: 'Delete a record from the database',
  inputSchema: z.object({ id: z.string(), environment: z.enum(['staging', 'production']) }),
  outputSchema: z.object({ deleted: z.boolean() }),
  requireApproval: (params, context) => params.environment === 'production',
  execute: async (params) => { await deleteRecord(params.id); return { deleted: true }; },
});
```

#### Call-level approval

```typescript
const result = openrouter.callModel({
  model: 'openai/gpt-4o',
  input: 'Send an email and search for documents',
  tools: [sendEmailTool, searchTool],
  state: myStateAccessor,
  requireApproval: (toolCall, context) =>
    toolCall.name === 'send_email' || toolCall.name === 'delete_record',
});
```

The call-level callback **takes priority** over tool-level settings when both are present. A `PermissionRequest` hook ([§2.12](#212-lifecycle-hooks)) can pre-decide `allow` / `deny` / `ask_user` before the pause.

#### Approval flow

1. The model generates tool calls.
2. The SDK partitions calls into those requiring approval and those that can auto-execute.
3. Auto-execute tools run immediately (in parallel).
4. State is saved with `status: 'awaiting_approval'` and the pending calls stored.
5. Control returns to the caller: check `await result.requiresApproval()`, inspect `await result.getPendingToolCalls()`.
6. Resume: call `callModel` again with the **same `state`**, passing `approveToolCalls` and/or `rejectToolCalls` (arrays of tool-call IDs).
7. Approved tools execute and their results go to the model. Rejected tools send the model an error explaining the rejection.
8. The conversation continues.

#### `StateAccessor`

```typescript
import type { StateAccessor, ConversationState } from '@openrouter/agent';

interface StateAccessor<TTools extends readonly Tool[] = readonly Tool[]> {
  load: () => Promise<ConversationState<TTools> | null>;   // null if none exists
  save: (state: ConversationState<TTools>) => Promise<void>;
}

// In-memory (dev only; use Redis/DB/files in production to survive restarts)
const conversations = new Map<string, ConversationState>();
function createStateAccessor(conversationId: string): StateAccessor {
  return {
    load: async () => conversations.get(conversationId) ?? null,
    save: async (state) => { conversations.set(conversationId, state); },
  };
}
```

`state` is required for deferred async tools ([§2.10](#210-async-tools-background-and-deferred-execution)). It enables `orphaned` persistence for detached background tasks and carries doom-loop streaks ([§2.13](#213-doom-loop-detection)).

#### `ConversationState`

| Field | Type | Description |
| - | - | - |
| `version` | `number?` | Serialization-contract version; absence means `1`; `createInitialState` stamps `1` |
| `id` | `string` | Unique conversation identifier |
| `messages` | `OpenResponsesInputUnion` | Full message history |
| `previousResponseId` | `string?` | Previous response ID for server-side chaining |
| `pendingToolCalls` | `ParsedToolCall[]?` | Calls awaiting human input: approval/rejection, HITL output, or unresolved manual (`execute: false`) calls |
| `unsentToolResults` | `UnsentToolResult[]?` | Executed results not yet sent to the model |
| `partialResponse` | `PartialResponse?` | Data captured during interruption |
| `interruptedBy` | `string?` | Signal from a new request that interrupted this conversation |
| `status` | `ConversationStatus` | Current state |
| `createdAt` | `number` | Creation timestamp (Unix ms) |
| `updatedAt` | `number` | Last update timestamp (Unix ms) |

#### Status values and how to resume each

| `status` | Meaning | Resume by |
| - | - | - |
| `'in_progress'` | Actively processing | n/a |
| `'awaiting_approval'` | Paused for approval/rejection | `callModel({ ..., state, input: [], approveToolCalls, rejectToolCalls })` |
| `'awaiting_hitl'` | A HITL tool's `onToolCalled` returned `null` | `callModel` with a `function_call_output` item per paused call in `input` |
| `'awaiting_client_tools'` (0.8.0+) | Manual tools were called but not resolved; calls in `pendingToolCalls` | `callModel` with **new `input`**; stale pendings are cleared and the run continues as a normal turn (not by call IDs) |
| `'awaiting_async_tools'` | A deferred tool's `run` called `ctx.defer(taskId)` | Any process: `tool.resolve()` / `.fail()` / `.cancel()` (or `resumeToolResults`). Pass `run` to continue immediately; otherwise the result is delivered on the next `callModel({ state })` |
| `'complete'` | Finished normally | Next `callModel` with the same state continues the conversation |
| `'interrupted'` | Interrupted; resumable | `callModel` with the same state; the SDK clears the flag and continues where it left off |

#### Serialization and versioning

```typescript
import {
  serializeConversationState,
  deserializeConversationState,
  UnsupportedStateVersionError,
  InvalidStateError,
} from '@openrouter/agent'; // also '@openrouter/agent/conversation-state'

const state: StateAccessor = {
  load: async () => {
    const blob = await redis.get(`conv:${id}`);
    if (!blob) return null;
    try {
      return deserializeConversationState(blob);
    } catch (err) {
      if (err instanceof UnsupportedStateVersionError) {
        console.error(`State version ${err.found} not in ${err.supported.join(', ')}`); // reset, migrate, or fail
      }
      if (err instanceof InvalidStateError) {
        // malformed JSON or missing required fields
      }
      throw err;
    }
  },
  save: async (s) => { await redis.set(`conv:${id}`, serializeConversationState(s)); },
};
```

- The helpers are **opt-in** wrappers over `JSON.stringify` / `JSON.parse`. `StateAccessor.load/save` are unchanged, and plain JSON round-tripping still works.
- `CONVERSATION_STATE_VERSION = 1`.
- Compatibility policy: treat serialized JSON as **opaque** (do not introspect item shapes across releases); additive field changes are allowed within a major version; migrations on version bumps run inside `deserializeConversationState`.
- `UnsupportedStateVersionError` (`found: number`, `supported: readonly number[]`): blob version not supported by this build.
- `InvalidStateError`: malformed JSON or missing required fields (`id`, `messages`, `status`, `createdAt`, `updatedAt`).
- Other state helpers named in the migration guide: `createInitialState`, `updateState` (exported from the barrel; signatures not documented).

#### Complete approval example

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
import type { ConversationState, StateAccessor } from '@openrouter/agent';
import { z } from 'zod';

const sendEmailTool = tool({
  name: 'send_email',
  description: 'Send an email',
  inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
  outputSchema: z.object({ sent: z.boolean(), messageId: z.string() }),
  requireApproval: true,
  execute: async (params) => {
    const result = await sendEmail(params);
    return { sent: true, messageId: result.id };
  },
});

const store = new Map<string, ConversationState>();
const conversationId = 'conv-123';
const state: StateAccessor = {
  load: async () => store.get(conversationId) ?? null,
  save: async (s) => { store.set(conversationId, s); },
};

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const result = openrouter.callModel({
  model: 'openai/gpt-4o',
  input: 'Send a welcome email to alice@example.com',
  tools: [sendEmailTool] as const,
  state,
});

if (await result.requiresApproval()) {
  const pending = await result.getPendingToolCalls();
  for (const call of pending) {
    console.log(call.name, call.arguments.to, call.arguments.subject, call.id);
  }

  const decisions = await askUserForApproval(pending);
  const approvedIds = decisions.filter((d) => d.decision === 'approve').map((d) => d.id);
  const rejectedIds = decisions.filter((d) => d.decision === 'reject').map((d) => d.id);

  const resumed = openrouter.callModel({
    model: 'openai/gpt-4o',
    input: [],                       // no new user input needed for resumption
    tools: [sendEmailTool] as const,
    state,
    approveToolCalls: approvedIds,
    rejectToolCalls: rejectedIds,
  });
  console.log(await resumed.getText());
} else {
  console.log(await result.getText()); // no approval needed: tool ran automatically
}
```

#### Resumption patterns

```typescript
// From approval (e.g. a later HTTP request): approve all pending
const loaded = await state.load();
if (loaded?.status === 'awaiting_approval') {
  const result = openrouter.callModel({
    model: 'openai/gpt-4o',
    input: [],
    tools: [sendEmailTool] as const,
    state,
    approveToolCalls: (loaded.pendingToolCalls ?? []).map((c) => c.id),
  });
  await result.getText();
}

// From interruption
if (loaded?.status === 'interrupted') {
  const result = openrouter.callModel({
    model: 'openai/gpt-4o',
    input: 'Continue where you left off',
    tools: myTools,
    state,
  });
  await result.getText();
}

// Multi-run conversation: messages accumulate automatically in the shared state
const s = createStateAccessor('conv-456');
await openrouter.callModel({ model: 'openai/gpt-4o', input: 'What is the weather in Tokyo?', tools: [weatherTool] as const, state: s }).getText();
await openrouter.callModel({ model: 'openai/gpt-4o', input: 'And in Paris?', tools: [weatherTool] as const, state: s }).getText();
await openrouter.callModel({ model: 'openai/gpt-4o', input: 'Which city is warmer?', tools: [weatherTool] as const, state: s }).getText();
```

The docs' resume examples pass the same `tools` as the original run. Doom-loop streaks carry over only if the resuming call also passes `doomLoop` ([§2.13](#213-doom-loop-detection)).

Related: the cookbook page "Gate Agent Tool Calls with Jev" (`https://openrouter.ai/docs/cookbook/building-agents/gate-tool-calls-with-jev`) decides `approve` / `block` / `review` per call with a decision model instead of a static `requireApproval` flag (see [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) Jev).

Sources: https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state, https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/lifecycle-hooks, https://openrouter.ai/docs/agent-sdk/agent-migration

### 2.18 API Reference (type signatures and exports, reproduced)

This subsection reproduces the Agent SDK API Reference page. Behavioral notes are in the subsections referenced. The `CallModelInput`, `ProviderPreferences`, and `RequestOptions` tables are reproduced in [§2.3](#23-callmodel-signature-options-input-formats-model-selection); `ToolConfig` is in [§2.9](#29-tools).

#### `callModel`

```typescript
function callModel(request: CallModelInput, options?: RequestOptions): ModelResult
```

#### `ModelResult` methods

```typescript
getText(): Promise<string>                                    // text after tool execution completes
getResponse(): Promise<OpenResponsesNonStreamingResponse>     // full response with usage (inputTokens, outputTokens, cachedTokens)
getTextStream(): AsyncIterableIterator<string>                // text deltas
getReasoningStream(): AsyncIterableIterator<string>           // reasoning deltas
getNewMessagesStream(): AsyncIterableIterator<ResponsesOutputMessage | OpenResponsesFunctionCallOutput> // deprecated
getFullResponsesStream(): AsyncIterableIterator<EnhancedResponseStreamEvent> // all events incl. tool preliminary results
getToolCalls(): Promise<ParsedToolCall[]>                     // all tool calls from initial response
getToolCallsStream(): AsyncIterableIterator<ParsedToolCall>   // tool calls as they complete
getToolStream(): AsyncIterableIterator<ToolStreamEvent>       // tool deltas and preliminary results
getContextUpdates(): AsyncGenerator<ToolContextMap<TTools>>   // context snapshots on setContext(); completes when tool execution finishes
cancel(): Promise<void>                                       // cancel the stream and all consumers
```

Not on the API reference page but documented elsewhere: `getItemsStream()`, `requiresApproval()`, `getPendingToolCalls()`, `getDoomLoopVerdict()`, `getAsyncTasks()`, `sendToTask()`, `cancelTask()` ([§2.4](#24-modelresult-every-accessor-and-method)).

#### Tool types

```typescript
function tool<TInput, TOutput>(config: ToolConfig): Tool

type Tool =
  | ToolWithExecute<ZodObject, ZodType>
  | ToolWithGenerator<ZodObject, ZodType, ZodType>
  | ManualTool<ZodObject, ZodType>
  | HITLTool<ZodObject, ZodType>;

interface ToolWithExecute<TInput, TOutput, TContext, TName> {
  type: ToolType.Function;
  function: {
    name: TName;
    description?: string;
    inputSchema: TInput;
    outputSchema?: TOutput;
    contextSchema?: ZodObject;
    execute: (params: z.infer<TInput>, context: ToolExecuteContext<TName, TContext>) => Promise<z.infer<TOutput>>;
  };
}

interface ToolWithGenerator<TInput, TEvent, TOutput, TContext, TName> {
  type: ToolType.Function;
  function: {
    name: TName;
    description?: string;
    inputSchema: TInput;
    eventSchema: TEvent;
    outputSchema: TOutput;
    contextSchema?: ZodObject;
    execute: (params: z.infer<TInput>, context: ToolExecuteContext<TName, TContext>) => AsyncGenerator<z.infer<TEvent>>;
  };
}

interface ManualTool<TInput, TOutput> {
  type: ToolType.Function;
  function: {
    name: string;
    description?: string;
    inputSchema: TInput;
    outputSchema?: TOutput;
  };
}

interface HITLToolFunction<TInput, TOutput, TContext, TName> {
  name: TName;
  description?: string;
  inputSchema: TInput;
  outputSchema: TOutput;   // required: validates hook return and caller-supplied function_call_output
  contextSchema?: ZodObject;
  onToolCalled: (
    params: z.infer<TInput>,
    context?: ToolExecuteContext<TName, TContext>,
  ) => Promise<z.infer<TOutput> | null> | z.infer<TOutput> | null;
  onResponseReceived?: (
    rawResult: unknown,
    context?: ToolExecuteContext<TName, TContext>,
  ) => Promise<z.infer<TOutput>> | z.infer<TOutput>;
  toModelOutput?: ToModelOutputFunction<z.infer<TInput>, z.infer<TOutput>>;
}

type HITLTool<TInput, TOutput, TContext> = {
  type: ToolType.Function;
  function: HITLToolFunction<TInput, TOutput, TContext>;
};
```

HITL semantics: returning `null` from `onToolCalled` pauses with `'awaiting_hitl'`; throwing from `onToolCalled` gives `{ error: ... }`; throwing from `onResponseReceived` gives `{ error: ..., originalOutput: ... }`.

`ToolConfig` (API reference rows): `name` (string, required), `description` (string), `inputSchema` (`ZodObject`, required), `outputSchema` (`ZodType`), `eventSchema` (`ZodType`; triggers generator mode), `contextSchema` (`ZodObject`), `execute` (`function | false`, required\*), `onToolCalled` (function, required\*), `onResponseReceived` (function; HITL only), `nextTurnParams` (`NextTurnParamsFunctions`). \* Provide exactly one of `execute` / `onToolCalled`.

#### Tool type guards

```typescript
function isManualTool(tool: Tool): tool is ManualTool;          // no execute and no onToolCalled; always pauses
function isHITLTool(tool: Tool): tool is HITLTool;              // has onToolCalled
function isAutoResolvableTool(tool: Tool): tool is ToolWithExecute | ToolWithGenerator | HITLTool;
                                                                // false for manual and server tools
```

#### Context types

```typescript
interface TurnContext {
  toolCall?: OpenResponsesFunctionToolCall;
  numberOfTurns: number;
  turnRequest?: OpenResponsesRequest;
}

type ToolExecuteContext<TName, TContext> =
  TurnContext & {
    tools: {
      readonly [K in TName]: Readonly<TContext>;
    };
    setContext(partial: Partial<TContext>): void;
  };

type ToolContextMap<T extends readonly Tool[]> = {
  [K in T[number] as K['function']['name']]: InferToolContext<K>;
};

type ContextInput<T> =
  | T
  | ((turn: TurnContext) => T)
  | ((turn: TurnContext) => Promise<T>);

interface NextTurnParamsContext {
  input: OpenResponsesInput;
  model: string;
  models: string[];
  temperature: number | null;
  maxOutputTokens: number | null;
  topP: number | null;
  topK?: number | undefined;
  instructions: string | null;
}
```

(The Tools page documents `local` / `shared` / `setSharedContext` on the execute context instead of `tools`; see [§2.9](#29-tools).)

#### Stream event types

```typescript
type EnhancedResponseStreamEvent =
  | OpenResponsesStreamEvent
  | ToolPreliminaryResultEvent;

type ToolStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'preliminary_result'; toolCallId: string; result: unknown };

interface ParsedToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** 'client' for locally-defined tools (result typed from outputSchema); 'mcp' for wrapped MCP tools (result unknown). Also on ToolResultEvent. */
  source: 'client' | 'mcp';   // added in @openrouter/agent 0.8.0 (additive breaking change)
  result: unknown;
  preliminaryResults?: unknown[];
  error?: Error;
}
```

`ToolResultEvent` (from the Tools page) is reproduced in [§2.9](#29-tools).

#### MCP branding

```typescript
function isMcpTool(tool: Tool): tool is McpBranded;          // true for tools branded as from an MCP server
function markMcp<T extends Tool>(tool: T): McpBranded<T>;    // @openrouter/mcp brands its tools automatically
type McpBranded<T extends Tool = Tool> = T & { readonly _mcp: true };
```

#### Conversation state

```typescript
interface ConversationState<TTools extends readonly Tool[] = readonly Tool[]> {
  /** Serialization-contract version. Optional so legacy blobs remain assignable; absence means 1. createInitialState stamps 1. */
  version?: number;
  id: string;
  messages: OpenResponsesInputUnion;
  previousResponseId?: string;
  pendingToolCalls?: ParsedToolCall[];
  unsentToolResults?: UnsentToolResult[];
  partialResponse?: PartialResponse;
  interruptedBy?: string;
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
}

type ConversationStatus =
  | 'in_progress'
  | 'awaiting_approval'
  | 'awaiting_hitl'
  | 'awaiting_client_tools'   // added in 0.8.0 for unresolved manual (execute: false) calls
  | 'awaiting_async_tools'
  | 'complete'
  | 'interrupted';

interface StateAccessor<TTools extends readonly Tool[] = readonly Tool[]> {
  load: () => Promise<ConversationState<TTools> | null>;
  save: (state: ConversationState<TTools>) => Promise<void>;
}

// Serialization helpers (package root and '@openrouter/agent/conversation-state')
const CONVERSATION_STATE_VERSION = 1;
function serializeConversationState<TTools>(state: ConversationState<TTools>): string;
function deserializeConversationState<TTools>(json: string): ConversationState<TTools>;
class UnsupportedStateVersionError extends Error {   // blob version not supported by this build
  readonly found: number;
  readonly supported: readonly number[];
}
class InvalidStateError extends Error {}             // malformed JSON or missing required fields
```

#### Stop conditions

```typescript
type StopWhen = StopCondition | StopCondition[];
type StopCondition = (context: StopConditionContext) => boolean | Promise<boolean>;

interface StopConditionContext {
  steps: StepResult[];
}

interface StepResult {
  stepType: 'initial' | 'continue';
  text: string;
  toolCalls: TypedToolCallUnion[];
  toolResults: ToolExecutionResultUnion[];
  response: OpenResponsesNonStreamingResponse;
  usage?: OpenResponsesUsage;
  finishReason?: string;
  warnings?: Warning[];
  experimental_providerMetadata?: Record<string, unknown>;
}

interface Warning {
  type: string;
  message: string;
}
```

| Function | Signature | Description |
| - | - | - |
| `stepCountIs` | `(n: number) => StopCondition` | Stop after n steps |
| `hasToolCall` | `(name: string) => StopCondition` | Stop when tool is called |
| `maxTokensUsed` | `(n: number) => StopCondition` | Stop after n tokens |
| `maxCost` | `(amount: number) => StopCondition` | Stop after cost limit |
| `finishReasonIs` | `(reason: string) => StopCondition` | Stop on finish reason |

#### Format helpers

```typescript
function fromChatMessages(messages: Message[]): OpenResponsesInput                         // OpenAI chat to OpenResponses input
function toChatMessage(response: OpenResponsesNonStreamingResponse): AssistantMessage      // response to chat message
function fromClaudeMessages(messages: ClaudeMessageParam[]): OpenResponsesInput            // Anthropic Claude to OpenResponses input
function toClaudeMessage(response: OpenResponsesNonStreamingResponse): ClaudeMessage       // response to Claude message
```

#### Type utilities

```typescript
type InferToolInput<T> = T extends { function: { inputSchema: infer S } }
  ? S extends ZodType ? z.infer<S> : unknown
  : unknown;

type InferToolOutput<T> = T extends { function: { outputSchema: infer S } }
  ? S extends ZodType ? z.infer<S> : unknown
  : unknown;

type InferToolEvent<T> = T extends { function: { eventSchema: infer S } }
  ? S extends ZodType ? z.infer<S> : never
  : never;

type TypedToolCall<T extends Tool> = {
  id: string;
  name: T extends { function: { name: infer N } } ? N : string;
  arguments: InferToolInput<T>;
};
```

#### Exports (verbatim list)

```typescript
// Agent client
export { OpenRouter } from '@openrouter/agent';

// Tool helpers
export {
  tool,
  ToolType,
  isManualTool,
  isHITLTool,
  isAutoResolvableTool,
  isMcpTool,
  markMcp,
} from '@openrouter/agent';

// Conversation state helpers
export {
  createInitialState,
  serializeConversationState,
  deserializeConversationState,
  CONVERSATION_STATE_VERSION,
  UnsupportedStateVersionError,
  InvalidStateError,
} from '@openrouter/agent';
// Also available at the subpath: '@openrouter/agent/conversation-state'

// Format helpers
export { fromChatMessages, toChatMessage, fromClaudeMessages, toClaudeMessage } from '@openrouter/agent';

// Stop condition helpers
export { stepCountIs, hasToolCall, maxTokensUsed, maxCost, finishReasonIs } from '@openrouter/agent';

// Final-turn directive appended when allowFinalResponse is on (the default)
export { DEFAULT_FINAL_RESPONSE_DIRECTIVE } from '@openrouter/agent';

// Context helpers
export {
  buildToolExecuteContext,
  ToolContextStore,
} from '@openrouter/agent';

// Lifecycle hooks
export {
  HooksManager,
  HookName,
  isAsyncOutput,
} from '@openrouter/agent';

// Types
export type {
  CallModelInput,
  ContextInput,
  Tool,
  ToolWithExecute,
  ToolWithGenerator,
  ManualTool,
  HITLTool,
  HITLToolFunction,
  McpBranded,
  ToolExecuteContext,
  ToolContextMap,
  TurnContext,
  ParsedToolCall,
  ToolExecutionResult,
  ToolResultEvent,
  ConversationState,
  ConversationStatus,
  StateAccessor,
  StopCondition,
  StopWhen,
  InferToolInput,
  InferToolOutput,
  InferToolEvent,
  InlineHookConfig,
  HookEntry,
  HookHandler,
  HookReturn,
  HooksManagerOptions,
  HookDefinition,
  HookRegistry,
  ToolMatcher,
  EmitResult,
  BuiltInHookDefinitions,
  LifecycleHookContext,
  AsyncOutput,
  PreToolUsePayload,
  PreToolUseResult,
  PostToolUsePayload,
  PostToolUseFailurePayload,
  UserPromptSubmitPayload,
  UserPromptSubmitResult,
  PermissionRequestPayload,
  PermissionRequestResult,
  StopPayload,
  StopResult,
  SessionStartPayload,
  SessionEndPayload,
  PostModelCallPayload,
  ModelCallUsage,
  SessionUsageTotals,
} from '@openrouter/agent';
```

Names used on other pages but **absent** from this export list: `StreamableOutputItem` (type; Items/Streaming pages), `updateState` (migration page), `resumeToolResults`, `ToolTaskAlreadySettledError` (Async Tools page), `hasExecuteFunction`, `isGeneratorTool` (`@openrouter/agent/tool-types`), `TypedToolCall` (defined but not listed), and `tool.agent` (a property of `tool`). Their import paths are not stated, except the two tool-types guards.

Sources: https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/agent-migration, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/items

### 2.19 Examples: weather tool and skills loader

#### Weather tool (external API, validation, error handling, tests)

Prerequisites: `npm install @openrouter/agent zod`; a WeatherAPI (`weatherapi.com`) key in `WEATHER_API_KEY`; `OPENROUTER_API_KEY` set.

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
import { z } from 'zod';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get current weather conditions for any city worldwide',
  inputSchema: z.object({
    city: z.string().describe('City name, e.g., "San Francisco" or "London, UK"'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature units'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    conditions: z.string(),
    humidity: z.number(),
    windSpeed: z.number(),
    windDirection: z.string(),
    location: z.object({ name: z.string(), region: z.string(), country: z.string() }),
  }),
  execute: async ({ city, units }) => {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) throw new Error('WEATHER_API_KEY environment variable not set');

    const response = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}`,
    );
    if (!response.ok) {
      if (response.status === 400) throw new Error(`City not found: ${city}`);
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      temperature: units === 'celsius' ? data.current.temp_c : data.current.temp_f,
      feelsLike: units === 'celsius' ? data.current.feelslike_c : data.current.feelslike_f,
      conditions: data.current.condition.text,
      humidity: data.current.humidity,
      windSpeed: data.current.wind_kph,
      windDirection: data.current.wind_dir,
      location: { name: data.location.name, region: data.location.region, country: data.location.country },
    };
  },
});

// Usage
const text = await openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'What is the weather like in Tokyo?',
  tools: [weatherTool],
}).getText();

// Multiple cities: the model calls the tool twice (in parallel)
await openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'Compare the weather in New York and Los Angeles',
  tools: [weatherTool],
}).getText();
```

Forecast companion tool (condensed; same pattern, `forecast.json` endpoint):

```typescript
const forecastTool = tool({
  name: 'get_forecast',
  description: 'Get weather forecast for the next few days',
  inputSchema: z.object({
    city: z.string().describe('City name'),
    days: z.number().min(1).max(7).default(3).describe('Number of forecast days'),
    units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  outputSchema: z.object({
    location: z.string(),
    forecast: z.array(z.object({
      date: z.string(), maxTemp: z.number(), minTemp: z.number(), conditions: z.string(), chanceOfRain: z.number(),
    })),
  }),
  execute: async ({ city, days, units }) => {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) throw new Error('WEATHER_API_KEY environment variable not set');
    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(city)}&days=${days}`,
    );
    if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
    const data = await response.json();
    return {
      location: `${data.location.name}, ${data.location.country}`,
      forecast: data.forecast.forecastday.map((day: any) => ({
        date: day.date,
        maxTemp: units === 'celsius' ? day.day.maxtemp_c : day.day.maxtemp_f,
        minTemp: units === 'celsius' ? day.day.mintemp_c : day.day.mintemp_f,
        conditions: day.day.condition.text,
        chanceOfRain: day.day.daily_chance_of_rain,
      })),
    };
  },
});

await openrouter.callModel({
  model: 'openai/gpt-5-nano',
  input: 'What is the weather in Paris today and for the next 3 days?',
  tools: [weatherTool, forecastTool],
}).getText();
```

Retry variant (returns an error field instead of throwing): `outputSchema` adds `error: z.string().optional()`. `execute` loops `maxRetries = 3`; on HTTP 429 it waits `1000 * attempt` ms and continues; on other non-OK statuses it throws inside the loop, caught as `lastError`. After all attempts it returns `{ temperature: 0, conditions: 'Unknown', error }`, where `error` is the string "Failed after 3 attempts: " followed by the last error message.

Testing a tool directly (Bun test runner shown in docs). Call `tool.function.execute(params, context)` with a minimal `TurnContext`:

```typescript
import { describe, it, expect, mock } from 'bun:test';

describe('weatherTool', () => {
  it('returns weather data for valid city', async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        current: { temp_c: 22, temp_f: 72, feelslike_c: 24, feelslike_f: 75, condition: { text: 'Sunny' }, humidity: 45, wind_kph: 10, wind_dir: 'NW' },
        location: { name: 'London', region: 'City of London', country: 'UK' },
      }),
    }));

    const result = await weatherTool.function.execute({ city: 'London', units: 'celsius' }, { numberOfTurns: 1 });
    expect(result.temperature).toBe(22);
    expect(result.location.name).toBe('London');
  });

  it('handles city not found', async () => {
    global.fetch = mock(() => Promise.resolve({ ok: false, status: 400 }));
    await expect(
      weatherTool.function.execute({ city: 'InvalidCity123', units: 'celsius' }, { numberOfTurns: 1 }),
    ).rejects.toThrow('City not found');
  });
});
```

(With strict typing, `{ numberOfTurns: 1 }` may not satisfy the full `ToolExecuteContext`; the docs pass it as shown.)

#### Skills loader (Claude Code-style skills via `nextTurnParams`)

Setup: create skill folders, each with a `SKILL.md`, e.g. `mkdir -p ~/.claude/skills/pdf-processing ~/.claude/skills/data-analysis ~/.claude/skills/code-review`.

```typescript
import { OpenRouter, tool, stepCountIs } from '@openrouter/agent';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const SKILLS_DIR = path.join(process.env.HOME || '~', '.claude', 'skills');

const listAvailableSkills = (): string[] => {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
    .map((d) => d.name);
};

const skillsTool = tool({
  name: 'Skill',
  description: `Load a specialized skill to enhance the assistant's capabilities.
Available skills: ${listAvailableSkills().join(', ') || 'none configured'}
Each skill provides domain-specific instructions and capabilities.`,
  inputSchema: z.object({ type: z.string().describe("The skill type to load (e.g., 'pdf-processing')") }),
  outputSchema: z.string(),
  nextTurnParams: {
    input: (params, context) => {
      const skillMarker = `[Skill: ${params.type}]`;
      if (JSON.stringify(context.input).includes(skillMarker)) return context.input; // already loaded

      const skillPath = path.join(SKILLS_DIR, params.type, 'SKILL.md');
      if (!existsSync(skillPath)) return context.input;

      const skill = readFileSync(skillPath, 'utf-8');
      const skillDir = path.join(SKILLS_DIR, params.type);
      const currentInput = Array.isArray(context.input) ? context.input : [context.input];

      return [
        ...currentInput,
        { role: 'user', content: `${skillMarker}\nBase directory for this skill: ${skillDir}\n\n${skill}` },
      ];
    },
  },
  execute: async (params, context) => {
    const skillMarker = `[Skill: ${params.type}]`;
    if (JSON.stringify(context?.turnRequest?.input || []).includes(skillMarker)) {
      return `Skill ${params.type} is already loaded`;
    }
    const skillPath = path.join(SKILLS_DIR, params.type, 'SKILL.md');
    if (!existsSync(skillPath)) {
      return `Skill "${params.type}" not found. Available skills: ${listAvailableSkills().join(', ') || 'none'}`;
    }
    return `Launching skill ${params.type}`;
  },
});

const result = openrouter.callModel({
  model: 'anthropic/claude-sonnet-4.5',
  input: 'I need to process a PDF and extract tables from it',
  tools: [skillsTool],
});
const text = await result.getText();
// The model calls Skill; subsequent turns contain the skill's instructions
```

Example `~/.claude/skills/pdf-processing/SKILL.md` (condensed): a `# PDF Processing Skill` heading, then sections listing available tools (`extract_text`, `extract_tables`, `extract_images`, `split_pdf`), best practices (check size, chunk >50 pages, OCR for scans, tables spanning pages), output formats, and error handling (encrypted PDFs, OCR failure, report page numbers).

Multi-skill loader (one call loads several skills):

```typescript
const multiSkillLoader = tool({
  name: 'load_skills',
  description: 'Load multiple skills at once for complex tasks',
  inputSchema: z.object({ skills: z.array(z.string()).describe('Array of skill names to load') }),
  outputSchema: z.object({
    loaded: z.array(z.string()),
    failed: z.array(z.object({ name: z.string(), reason: z.string() })),
  }),
  nextTurnParams: {
    input: (params, context) => {
      let newInput = Array.isArray(context.input) ? context.input : [context.input];
      for (const skillName of params.skills) {
        const skillMarker = `[Skill: ${skillName}]`;
        if (JSON.stringify(newInput).includes(skillMarker)) continue;
        const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
        if (!existsSync(skillPath)) continue;
        const skillContent = readFileSync(skillPath, 'utf-8');
        newInput = [...newInput, {
          role: 'user',
          content: `${skillMarker}\nBase directory: ${path.join(SKILLS_DIR, skillName)}\n\n${skillContent}`,
        }];
      }
      return newInput;
    },
  },
  execute: async ({ skills }) => {
    const loaded: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];
    for (const skill of skills) {
      if (existsSync(path.join(SKILLS_DIR, skill, 'SKILL.md'))) loaded.push(skill);
      else failed.push({ name: skill, reason: 'Skill not found' });
    }
    return { loaded, failed };
  },
});
// Model might call: load_skills({ skills: ['pdf-processing', 'data-analysis'] })
```

Configurable skill loader (condensed): `name: 'configure_skill'`, input `{ skillName: string, options?: { verbosity: 'minimal'|'normal'|'detailed' (default 'normal'), strictMode: boolean (default false), outputFormat: 'json'|'markdown'|'plain' (default 'markdown') } }`, output `{ status: 'loaded'|'already_loaded'|'not_found', message: string, configuration?: Record<string, unknown> }`. `nextTurnParams.input` injects the skill with a `## Skill Configuration` header listing the options. `nextTurnParams.temperature` returns `0.3` when `params.options?.strictMode`, else `context.temperature`. `execute` returns `not_found` or `loaded` with the configuration.

Skill discovery tool (condensed): `name: 'list_skills'`, input `{ category?: string }`, output `{ skills: Array<{ name, description, hasConfig }>, totalCount }`. `execute` reads each `SKILL.md`, uses the first non-heading line (sliced to 100 chars) as the description, and sets `hasConfig` if `config.json` exists in the skill folder.

Putting it together:

```typescript
const result = openrouter.callModel({
  model: 'anthropic/claude-sonnet-4.5',
  input: `I have a complex task:
1. First, show me what skills are available
2. Load the appropriate skills for PDF analysis
3. Then help me extract and analyze data from report.pdf`,
  tools: [skillDiscoveryTool, skillsTool, multiSkillLoader],
  stopWhen: stepCountIs(10),
});
console.log(await result.getText());
```

Key patterns: idempotency markers (`[Skill: name]`), graceful fallbacks (return "not found, available: ..." instead of throwing), context preservation (normalize `context.input` to an array and append, never replace), clear unique markers.

Sources: https://openrouter.ai/docs/agent-sdk/call-model/examples/weather-tool, https://openrouter.ai/docs/agent-sdk/call-model/examples/skills-loader, https://openrouter.ai/docs/agent-sdk/call-model/next-turn-params

### 2.20 DevTools (telemetry capture and visualization) (pre-release)

> **Status: pre-release, development only.** No complete supported public client integration exists yet. `@openrouter/sdk` cannot attach the DevTools hooks through its typed public options. `@openrouter/agent` `callModel` uses streaming Responses API output that DevTools cannot currently complete or normalize. Never deploy to production.

Components:

1. **SDK telemetry hooks** (`@openrouter/devtools`): normalize supported operations into the DevTools telemetry format.
2. **DevTools viewer** (`openrouter devtools`, from `@openrouter/cli`): web UI for compatible telemetry files. It offers run tracking, step-by-step request/response/timing/error inspection, token usage, error debugging, and dark/light mode.

Install:

```bash
npm install --save-dev @openrouter/devtools      # pnpm add -D | yarn add -D | bun add -d | deno add --dev npm:@openrouter/devtools
npm install --global @openrouter/cli             # provides `openrouter devtools`
```

`@openrouter/devtools` **throws if `NODE_ENV === 'production'`** (error: `DevTools should not be used in production`).

#### Client compatibility (read before using)

- Do **not** attach DevTools to Agent SDK `callModel` and expect complete telemetry. `@openrouter/agent` accepts the hooks, but `callModel` always makes a streaming Responses API request. DevTools tries to parse the response as JSON, does not parse the SSE stream, and does not normalize the Responses API request/response schema.
- The generated `@openrouter/sdk` client is not an alternative: its typed public constructor options cannot attach the plain DevTools hook object.
- Recognized internal operation IDs: `createResponses` (Responses API) and `sendChatCompletionRequest` (chat completions). This is **not** a list of working integrations: the Agent SDK reaches `createResponses`, but its streaming response is unsupported; the Client SDK reaches `sendChatCompletionRequest`, but cannot attach the hooks publicly. All other operations, including embeddings, are ignored.

#### Viewer

```bash
openrouter devtools                              # serves http://localhost:4983
OPENROUTER_DEVTOOLS_PORT=5000 openrouter devtools # alternate port
```

Run it from a project containing a compatible `.devtools/openrouter-generations.json`. The viewer shows runs with timestamps and status, step-by-step request/response details, token usage, error messages and stack traces, and timing, and refreshes automatically when new telemetry is captured.

#### Hook configuration (`createOpenRouterDevtools()`)

| Option | Type | Default | Description |
| - | - | - | - |
| `storagePath` | `string` | `'.devtools/openrouter-generations.json'` | Where captured telemetry is stored |
| `serverUrl` | `string` | `'http://localhost:4983/api/notify'` | Viewer notification endpoint |

```typescript
createOpenRouterDevtools({ serverUrl: 'http://localhost:5000/api/notify' }); // when the viewer runs on 5000
```

The import statement for `createOpenRouterDevtools` is not shown in the docs; it ships in `@openrouter/devtools`.

#### How capture works (with a compatible hook integration)

1. SDK hooks intercept requests before they are sent.
2. Hook processing parses the request or response body.
3. Data is stored in `.devtools/openrouter-generations.json`: **runs** (top-level SDK operations), **steps** (request/response pairs), and **metadata** (timestamps, status, token usage, errors).
4. A notification is sent to the local DevTools server, if running.
5. The viewer updates in real time.

Captured per successful step: request (model, messages/prompts, parameters such as temperature and max_tokens); response (content, prompt + completion token usage, provider and model used, finish reason); metadata (start/completion timestamps, duration ms, status `success` / `error` / `in_progress`, error details).

Failure isolation: hooks return the original SDK request/response. Capture errors (request parsing, response parsing, storage, server notification) are swallowed and never replace the SDK result, though telemetry may be missing. Body parsing runs inside the SDK hook lifecycle (awaited, not zero-cost). Failed writes are silently ignored.

Troubleshooting: `EADDRINUSE :::4983` means stop the other process or use `OPENROUTER_DEVTOOLS_PORT` and update `serverUrl`. If there is no telemetry file, check `.devtools/`, write permissions, and a custom `storagePath`. If the viewer is not updating, confirm the server is running, `serverUrl` matches the port, and the file is being written, then refresh. `Cannot find module '@openrouter/devtools'` means install the dev dependency.

For Client SDK DevTools notes see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go).

Sources: https://openrouter.ai/docs/agent-sdk/dev-tools/devtools

### 2.21 Usage for Agents (skills for AI coding assistants)

OpenRouter publishes an official **`openrouter-typescript-sdk`** skill in the `OpenRouterTeam/skills` GitHub repository (`https://github.com/OpenRouterTeam/skills`). It gives AI coding assistants knowledge of the Agent SDK (`@openrouter/agent`) and the Client SDKs (`@openrouter/sdk`). For Agent SDK work it focuses on `callModel`, `tool()`, stop conditions, streaming, and multi-turn conversations. This section only documents the feature; nothing here needs to be run.

Install methods (as documented):

| Assistant | How |
| - | - |
| Claude Code | `/plugin marketplace add OpenRouterTeam/skills` then `/plugin install openrouter@openrouter` |
| Cursor | Settings > Rules > Add Rule > Remote Rule (Github) with `OpenRouterTeam/skills` |
| Any Agent Skills-compatible assistant via GitHub CLI (v2.90.0+; Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Windsurf, others) | `gh skill install OpenRouterTeam/skills openrouter-typescript-sdk` |

A separate migration skill exists for moving imports from `@openrouter/sdk` to `@openrouter/agent`: `gh skill install OpenRouterTeam/skills openrouter-agent-migration` ([§2.2](#22-migrating-from-openroutersdk-imports-to-openrouteragent)).

Supported assistants (Agent Skills standard, `agentskills.io`): Claude Code, Cursor, OpenCode, GitHub Copilot, Codex, Amp, Roo Code, Antigravity (all listed as "Supported").

What the skill provides: callModel API (described as "the recommended approach for making AI model calls with full type safety and streaming support"), tool definitions with `tool()` and Zod, stop conditions (`stepCountIs`, `maxCost`, ...), streaming, multi-turn conversations/state, and dynamic parameters. The page's example outputs are the standard `new OpenRouter({ apiKey })` + `callModel({ model: '~anthropic/claude-sonnet-latest', input })` + `getText()` pattern and a `tool()` with a Zod `inputSchema` (both shown in [§2.1](#21-what-the-agent-sdk-is-packages-install-relationship-to-openroutersdk)).

Sources: https://openrouter.ai/docs/agent-sdk/usage-for-agents, https://openrouter.ai/docs/agent-sdk/agent-migration

### 2.22 Complete minimal agent, Gotchas, documentation inconsistencies

#### Complete minimal agent (end-to-end, documented APIs only)

Features used: `OpenRouter` client, `tool()` with Zod input/output schemas, a tool error surfaced to the model, an approval-gated tool, a `finish` tool, `stopWhen` with three built-ins, doom-loop detection, inline lifecycle hooks, `StateAccessor` with the versioned serialization helpers, the approval/resume loop, and final text, usage, and verdict.

```typescript
// agent.ts  (npm install @openrouter/agent zod; run with OPENROUTER_API_KEY and WEATHER_API_KEY set)
import * as readline from 'node:readline/promises';
import {
  OpenRouter,
  tool,
  stepCountIs,
  maxCost,
  hasToolCall,
  serializeConversationState,
  deserializeConversationState,
} from '@openrouter/agent';
import type { StateAccessor } from '@openrouter/agent';
import { z } from 'zod';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

// ---------- Tools ----------
const getWeather = tool({
  name: 'get_weather',
  description: 'Get current weather conditions for a city',
  inputSchema: z.object({ city: z.string().describe('City name, e.g. "Paris"') }),
  outputSchema: z.object({ temperatureC: z.number(), conditions: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(city)}`,
    );
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`); // returned to the model as a tool error
    const data = await res.json();
    return { temperatureC: data.current.temp_c, conditions: data.current.condition.text };
  },
});

const sendEmail = tool({
  name: 'send_email',
  description: 'Send an email. A human must approve every call.',
  inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
  outputSchema: z.object({ sent: z.boolean() }),
  requireApproval: true,                       // pauses with status 'awaiting_approval'
  execute: async (params) => {
    console.log('[email] would send:', params);  // replace with your mailer
    return { sent: true };
  },
});

const finish = tool({
  name: 'finish',
  description: 'Call this when the task is complete',
  inputSchema: z.object({ summary: z.string() }),
  outputSchema: z.object({ done: z.boolean() }),
  execute: async () => ({ done: true }),
});

const tools = [getWeather, sendEmail, finish] as const;

// ---------- State persistence (swap the Map for Redis/DB in production) ----------
const blobs = new Map<string, string>();
function stateFor(conversationId: string): StateAccessor {
  return {
    load: async () => {
      const blob = blobs.get(conversationId);
      return blob ? deserializeConversationState(blob) : null;
    },
    save: async (s) => {
      blobs.set(conversationId, serializeConversationState(s));
    },
  };
}

// ---------- One run (initial or resume) ----------
function run(
  conversationId: string,
  input: string | [],
  decisions?: { approve: string[]; reject: string[] },
) {
  return openrouter.callModel({
    model: 'openai/gpt-5-nano',
    instructions: 'You are a concise assistant. Use tools when needed and call finish when done.',
    input,
    tools,
    state: stateFor(conversationId),
    approveToolCalls: decisions?.approve,
    rejectToolCalls: decisions?.reject,
    stopWhen: [stepCountIs(10), maxCost(0.25), hasToolCall('finish')], // any one stops the loop
    doomLoop: true,                                                     // observe@2, block@3, stop@6
    hooks: {
      PostModelCall: [
        {
          handler: (p) => {
            console.error(`[model] ${p.model} ${p.turnType}#${p.turnNumber} ${p.durationMs}ms cost=${p.usage?.cost ?? 'n/a'}`);
          },
        },
      ],
      PostToolUseFailure: [
        { handler: ({ toolName, error }) => { console.error(`[tool] ${toolName} failed:`, error); } },
      ],
    },
  });
}

// ---------- Human approval prompt ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
async function askHuman(name: string, args: unknown): Promise<boolean> {
  const answer = await rl.question(`Approve ${name} ${JSON.stringify(args)}? [y/N] `);
  return answer.trim().toLowerCase() === 'y';
}

// ---------- Main ----------
async function main() {
  const conversationId = 'demo-1';
  let result = run(conversationId, 'What is the weather in Paris? Email a one-line summary to alice@example.com.');

  // Resume as many times as the model requests approval
  while (await result.requiresApproval()) {
    const approve: string[] = [];
    const reject: string[] = [];
    for (const call of await result.getPendingToolCalls()) {
      ((await askHuman(call.name, call.arguments)) ? approve : reject).push(call.id);
    }
    result = run(conversationId, [], { approve, reject }); // same state, no new user input
  }

  console.log(await result.getText()); // streaming alternative: for await (const d of result.getTextStream()) ...

  const verdict = await result.getDoomLoopVerdict();
  if (verdict) console.warn('Stopped by doom-loop detection:', verdict.message);

  const response = await result.getResponse();
  console.log('usage:', response.usage);

  // Follow-up turn in the same conversation: history comes from state
  console.log(await run(conversationId, 'Thanks. Was it warm?').getText());
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Notes on this example:

- `requiresApproval()`, `getPendingToolCalls()`, `getDoomLoopVerdict()` are awaited exactly as in the docs; their formal return types are not published.
- `approveToolCalls` / `rejectToolCalls` are passed as `undefined` on non-resume runs. The docs only show them on resume calls; omit them conditionally if your type checker complains.
- A `stop` verdict from doom-loop detection is cleared by the next fresh user message (the follow-up turn), while streaks persist because `doomLoop` is passed again.

#### Gotchas and common mistakes

1. **Do not `await callModel(...)`.** It returns a `ModelResult` synchronously; await `getText()`, `getResponse()`, or iterate a stream.
2. **Always bound the loop.** With no `stopWhen`, the loop runs until a turn has no tool calls. Use `[stepCountIs(n), maxCost(x)]` at minimum. Array conditions are OR'ed.
3. **The default final turn costs a model call.** `allowFinalResponse` defaults to on: when a stop condition fires mid-tool-call, the SDK executes the pending calls and makes one more `toolChoice: 'none'` turn. Set `false` to end immediately, a string to customize the directive, or `''` for no directive.
4. **Empty text is a valid outcome after tool rounds.** `strictFinalResponse: false` (default) resolves with `''` after one retry. Set `true` if you need an error instead.
5. **`maxToolRounds` is deprecated**, but `maxToolRounds: 0` is still the documented way to get raw tool calls without execution.
6. **`getToolCalls()` returns calls from the initial response only.** Use step data in `stopWhen`, `getFullResponsesStream()` `tool.result` events, or `getResponse()` for later rounds.
7. **Use `tools: [...] as const`** for typed `toolCall.arguments`, typed `context` keys, and typed results.
8. **Tool errors do not throw from `getText()`.** Thrown `execute` errors are sent to the model as tool output. Watch `PostToolUseFailure` if you need to know.
9. **`context` functions run once (turn 0)**, not per turn. Mutate with `setContext()` inside tools, or use dynamic parameters for per-turn values.
10. **`nextTurnParams` receives the tool's input `params`, not its output.** It runs after all tools execute, in `tools` array order. Normalize `context.input` (string or array) before spreading, and add idempotency markers.
11. **HITL tools and async (`background` / `deferred`) tools require `outputSchema`.** Deferred tools also require `state`.
12. **The tool name `task` is reserved** whenever async tools are present (`tool({ name: 'task' })` throws).
13. **Each pause kind resumes differently.** Approval: same `state` + `input: []` + `approveToolCalls` / `rejectToolCalls`. HITL: `function_call_output` items in `input`. Manual (`awaiting_client_tools`): new `input`, not call IDs. Deferred: `tool.resolve/fail/cancel` (optionally with `run`).
14. **Call-level `requireApproval` overrides tool-level `requireApproval`.** For `PermissionRequest` hooks, the last handler's decision wins.
15. **Authenticate webhooks before `tool.resolve()`.** Its output is fed to the model as a trusted tool result. A replayed settle throws `ToolTaskAlreadySettledError`.
16. **Subagents (`tool.agent`) don't inherit hooks** and have no `StateAccessor`. A child that pauses fails the task.
17. **`source` on `ToolResultEvent` / `ToolExecutionResult` (0.8.0) is a breaking change** for exhaustive matching. Narrow on `source === 'client'` to keep typed results when MCP tools are present.
18. **MCP**: remote HTTP/SSE only (no stdio); always `await mcp.close()`. `cacheCredentials: true` puts secrets in snapshots. Without `onElicitation`, elicitations are auto-declined. Use `toolNamePrefix` when combining servers.
19. **Hooks**: inline config accepts only built-in hooks. Matchers apply only to tool-scoped hooks. Return `mutatedInput` / `mutatedPrompt` rather than mutating in place. Handler errors are swallowed unless `throwOnHandlerError: true`. Detached `AsyncOutput` work must honor `context.signal` (default 30 s timeout). `forceResume` alone burns the 3-override budget.
20. **Doom-loop detection is off by default.** Pass `doomLoop` on every resumed call to keep streaks. `block` without `stop` can loop until `stopWhen`. Use `loopKey: false` for polling tools.
21. **`background: true` on `callModel`** is the Responses API background flag, not async tools (`lifecycle: 'background'`).
22. **DevTools does not work with `callModel`** (streaming Responses output is unsupported) and throws when `NODE_ENV === 'production'`.
23. **Migration sed order matters** (`tool-types` before `tool`). Barrel and default `OpenRouter` imports need manual edits. The client import changes from default to named.
24. **Never ship `OPENROUTER_API_KEY` to the browser.** The React examples are illustrative; call `callModel` server-side and stream to the client (e.g. via SSE).
25. **SDK field names are camelCase** (`maxOutputTokens`, `imageUrl`, `toolChoice`, `previousResponseId`, provider `allowFallbacks`), even though the REST API uses snake_case ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)).

#### Documentation inconsistencies found (handle defensively)

| Topic | Conflict | Recommendation |
| - | - | - |
| `callModel` call form | API ref: `callModel(request, options?)`; MCP page: `callModel(client, request)` from `@openrouter/agent/call-model`; everywhere else: `openrouter.callModel(request)` | Prefer the method form |
| `ToolExecuteContext` | API ref: `tools[name]` + `setContext`; Tools page: `local`, `shared`, `setContext`, `setSharedContext` | Follow the Tools page (it has the examples); verify with your type checker |
| `StepResult` | API ref: `stepType`, `text`, `usage?`, `finishReason?`, `warnings?`...; Stop Conditions page: `tokens`, `cost` | Rely on `response`; read `toolCalls` / `toolResults` with optional chaining; guard everything else (`step.cost ?? 0`) |
| `getToolStream()` events | `ToolStreamEvent` = `delta` \| `preliminary_result`; MCP page also reads `tool.result` and `tool.progress` from it | Read `tool.result` from `getFullResponsesStream()` |
| `SessionEnd.reason` | Hooks page: `'user' \| 'error' \| 'max_turns' \| 'complete'`; Doom-Loop page: `'doom_loop'` | Handle unknown reasons |
| `NextTurnParamsContext` | API ref: `null`-able fields; nextTurnParams page: `undefined`-able | Use `??` fallbacks |
| Function-capable params | API ref: only `model`, `instructions`, `temperature`, `maxOutputTokens`; Dynamic Parameters page: "any parameter" | Use functions for the four typed ones when type safety matters |
| `execute` context `input` | nextTurnParams page reads `context.input` in `execute`; Skills Loader uses `context.turnRequest?.input` | Use `context.turnRequest?.input` |
| `nextTurnParams` example | "Complexity" example branches on `params.complexity`, an output field | `params` are tool inputs |
| `DoomLoopDetected` hook | Named on the Doom-Loop page; absent from the hooks table and exports; payload undocumented | Register via `HooksManager` and inspect the payload at runtime |
| Exports | `StreamableOutputItem`, `updateState`, `resumeToolResults`, `ToolTaskAlreadySettledError` used but not in the export list | Import from `@openrouter/agent`; verify |

Sources: https://openrouter.ai/docs/agent-sdk/call-model/api-reference, https://openrouter.ai/docs/agent-sdk/call-model/tools, https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state, https://openrouter.ai/docs/agent-sdk/call-model/stop-conditions, https://openrouter.ai/docs/agent-sdk/call-model/lifecycle-hooks, https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection, https://openrouter.ai/docs/agent-sdk/call-model/async-tools, https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools, https://openrouter.ai/docs/agent-sdk/call-model/next-turn-params, https://openrouter.ai/docs/agent-sdk/call-model/dynamic-parameters, https://openrouter.ai/docs/agent-sdk/call-model/streaming, https://openrouter.ai/docs/agent-sdk/dev-tools/devtools, https://openrouter.ai/docs/agent-sdk/agent-migration
