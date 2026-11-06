# OpenRouter Reference — 1. Orientation & quick start

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [Next: 02-agent-sdk.md →](02-agent-sdk.md)

## 1. Orientation & quick start

### 1.1 What OpenRouter is

OpenRouter is a single HTTP API in front of hundreds of AI models (400+ per the SDK docs) from many providers. One API key and one base URL give access to every model; OpenRouter routes each request to a provider endpoint, handles provider fallbacks, normalizes request/response formats, and bills from one credit balance.

| Item | Value |
|---|---|
| Base URL | `https://openrouter.ai/api/v1` |
| EU in-region base URL (Business/Enterprise, EU-eligible models) | `https://eu.openrouter.ai/api/v1` (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)) |
| Auth | `Authorization: Bearer <OPENROUTER_API_KEY>` (see [§4](04-api-fundamentals.md#4-api-fundamentals), [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)) |
| Optional attribution headers | `HTTP-Referer: <your site URL>`, `X-OpenRouter-Title: <your app name>` (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) App attribution) |
| Request formats | OpenAI Chat Completions (`POST /chat/completions`), OpenAI Responses (`POST /responses`), Anthropic Messages (`POST /messages`) (see [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)) |
| Model IDs | `author/slug` (e.g. `openai/gpt-5.2`), optional variant suffix (`:free`, `:nitro`, `:online`…), or a latest alias `~author/family-latest` (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) |
| Machine-readable spec | `https://openrouter.ai/docs/openapi/openapi.yaml` (OpenAPI 3.1, the source of truth for every endpoint) |
| Docs index for LLMs | `https://openrouter.ai/docs/llms.txt` (every page is also available as `.md` by appending `.md` to its URL) |
| Hosted MCP server (docs + live catalog for coding assistants) | `https://mcp.openrouter.ai/mcp` (see [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)) |

### 1.2 Choose an integration surface

| Approach | Package(s) | Languages | Best for | You handle |
|---|---|---|---|---|
| **Raw REST API** | none | any | Full control, no dependencies | HTTP, SSE parsing, tool loop, retries |
| **Client SDKs** ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)) | `@openrouter/sdk` (npm), `openrouter` (PyPI), `github.com/OpenRouterTeam/go-sdk` | TypeScript, Python, Go | Type-safe 1:1 wrapper over every REST endpoint (inference, embeddings, video, rerank, keys, credits, admin) | Conversation loop, tool dispatch, state |
| **Agent SDK** ([§2](02-agent-sdk.md#2-agent-sdk-openrouteragent)) | `@openrouter/agent` (npm); ports: `openrouter-agent-sdk` (PyPI), `github.com/OpenRouterTeam/go-agent` | TypeScript (primary docs); Python/Go ports | Agents: multi-turn loops, automatic tool execution, stop conditions, streaming items, hooks, MCP, HITL approvals, state persistence | Defining tools and policies |
| **OpenAI SDK, drop-in** ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)) | `openai` | any OpenAI SDK language | Existing OpenAI-SDK code | Set `baseURL` + key |
| **Frameworks** ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)) | Vercel AI SDK provider, LangChain, Mastra, PydanticAI, TanStack AI, Effect… | various | Apps already on a framework | Framework config |

Decision rules:
- Need agent loops with tools → **Agent SDK** (`callModel`). It depends on and installs `@openrouter/sdk`; its `OpenRouter` class takes the same client options. Add `@openrouter/sdk` to your own dependencies too if you also call REST endpoints directly, so you control its version.
- Need single calls, streaming, embeddings, or account/admin endpoints → **Client SDK**.
- Non-TS/Python/Go language, or minimal dependencies → **REST**.
- Docs disagree on Agent SDK language coverage: the Agent SDK overview lists TypeScript, Python and Go packages (Python/Go are auto-synced ports); the Client SDK comparison table lists the Agent SDK as TypeScript only. All Agent SDK documentation and examples are TypeScript.

### 1.3 First request in each surface

All examples read the key from the environment. Never ship an OpenRouter key in client-side code (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) spend controls).

**REST (curl), Responses API**

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://example.com" \
  -H "X-OpenRouter-Title: My App" \
  -d '{
    "model": "~openai/gpt-sol-latest",
    "input": "What is the meaning of life?"
  }'
```

**REST (curl), Chat Completions**

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "openai/gpt-5.2",
    "messages": [{"role": "user", "content": "What is the meaning of life?"}]
  }'
```

**TypeScript Client SDK (`@openrouter/sdk`)**

```typescript
import { OpenRouter } from '@openrouter/sdk';

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  httpReferer: 'https://example.com', // optional, attribution
  appTitle: 'My App',                 // optional, attribution
});

const response = await client.responses.send({
  responsesRequest: {
    model: '~openai/gpt-sol-latest',
    input: 'What is the meaning of life?',
  },
});

if (!('output' in response)) throw new Error('Expected a non-streaming response');
if (response.status !== 'completed') {
  throw new Error(response.error?.message ?? `Response ended as ${response.status}`);
}
const message = [...response.output].reverse().find((item) => item.type === 'message');
console.log(message?.content.find((part) => part.type === 'output_text')?.text);
```

**Python Client SDK (`openrouter`)**

```python
import os
from openrouter import OpenRouter

with OpenRouter(api_key=os.getenv("OPENROUTER_API_KEY")) as client:
    response = client.responses.send(
        model="~openai/gpt-sol-latest",
        input="What is the meaning of life?",
    )
    if response.status != "completed":
        raise RuntimeError(response.error.message if response.error else f"Response ended as {response.status}")
    message = next(item for item in reversed(response.output) if item.type == "message")
    print(next(part.text for part in message.content if part.type == "output_text"))
```

**Agent SDK (`@openrouter/agent`) with a tool**

```typescript
import { OpenRouter, tool, stepCountIs, maxCost } from '@openrouter/agent';
import { z } from 'zod';

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: z.object({ location: z.string().describe('City name') }),
  execute: async ({ location }) => ({ temperature: 72, condition: 'sunny', location }),
});

const result = openrouter.callModel({
  model: '~anthropic/claude-sonnet-latest',
  input: 'What is the weather in San Francisco?',
  tools: [weatherTool],
  stopWhen: [stepCountIs(10), maxCost(0.5)],
});

console.log(await result.getText()); // tool call, execution, and final answer in one call
```

**OpenAI SDK pointed at OpenRouter**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://example.com', // optional
    'X-OpenRouter-Title': 'My App',        // optional
  },
});

const response = await openai.responses.create({
  model: '~openai/gpt-sol-latest',
  input: 'What is the meaning of life?',
});
console.log(response.output_text);
```

```python
import os
from openai import OpenAI

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
response = client.responses.create(
    extra_headers={"HTTP-Referer": "https://example.com", "X-OpenRouter-Title": "My App"},
    model="~openai/gpt-sol-latest",
    input="What is the meaning of life?",
)
print(response.output_text)
```

### 1.4 Core concepts glossary

| Term | Meaning | Where |
|---|---|---|
| Model slug | `author/model` identifier from `GET /models` | [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data), [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Latest alias | `~author/family-latest`, always resolves to the newest model in a family | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Variant | Suffix changing routing/behavior: `:free`, `:nitro`, `:floor`, `:online`, `:thinking`, `:extended`, `:exacto` | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Provider / endpoint | A provider serving a model; each model has one or more endpoints with their own price, latency, quantization, supported params | [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data), [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Provider routing | The `provider` request object (order, only/ignore, sort, fallbacks, data policy, max price…) | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Model fallbacks | `models: [...]` list tried in order when the primary fails | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Routers | Meta-models that choose a model for you (Auto, Pareto, Fusion, Free, Switchyard, Jev, Body Builder) | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Server tools | Tools OpenRouter executes for the model (web search, web fetch, datetime, image generation, shell, bash, apply patch, tool search, advisor, subagent, fusion) | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities), [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs) |
| Plugins | `plugins: [...]` request add-ons (web search, response healing, alignment, armor) | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| Presets | Saved, versioned request configurations referenced by slug | [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) |
| BYOK | Bring your own provider keys; OpenRouter routes with them | [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data), [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) |
| Management key | Admin key type required for key/credit/workspace/guardrail/analytics management endpoints | [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data), [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) |
| Workspaces | Partitions of an organization with their own keys, budgets, policies | [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) |
| Guardrails / guardrail policies | Budget, model-availability, moderation, and sensitive-info policies applied to keys/members/workspaces | [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise), [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) |
| ZDR | Zero data retention routing (account-wide or per request) | [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) |
| Generation | One billed request; look it up by ID with `GET /generation` for exact cost and token stats | [§4](04-api-fundamentals.md#4-api-fundamentals), [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) |

### 1.5 How to read this document

- [§2](02-agent-sdk.md#2-agent-sdk-openrouteragent) and [§3](03-client-sdks.md#3-client-sdks-typescript-python-go) cover the SDKs. [§4](04-api-fundamentals.md#4-api-fundamentals) covers behavior shared by every endpoint (auth, parameters, streaming, limits, errors). [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)–[§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise) are the field-level endpoint reference. [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)–[§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) explain platform features and how to turn them on in requests.
- The Appendix lists every API operation (method, path, operationId) with the section that documents it.
- Each subsection ends with `Sources:` links to the official pages. When a detail matters for production (prices, limits, model lists), re-check the live source or the OpenAPI spec: OpenRouter ships changes often (see [§4](04-api-fundamentals.md#4-api-fundamentals) Versioning and Recent API changes).
- Content was compiled from the official OpenRouter documentation and OpenAPI spec as published on 2026-11-06.

Sources: https://openrouter.ai/docs/quickstart · https://openrouter.ai/docs/client-sdks/overview · https://openrouter.ai/docs/agent-sdk/overview · https://openrouter.ai/docs/api_reference/authentication · https://openrouter.ai/docs/guides/routing/routers/latest-resolution
