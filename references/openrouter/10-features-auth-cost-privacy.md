# OpenRouter Reference — 10. Features II — auth, cost & privacy

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 09-features-routing-capabilities.md](09-features-routing-capabilities.md) · [Next: 11-features-ops-integrations.md →](11-features-ops-integrations.md)

## 10. Features II — auth, cost & privacy

This section covers how requests are authenticated and attributed (quickstart, app attribution, OAuth PKCE, workload identity federation, management keys, security settings, BYOK), how cost is controlled (prompt caching, response caching, reasoning tokens, service tiers, context compression, router metadata, zero completion insurance, presets, spend controls), and how data is governed (data collection, provider logging, ZDR, in-region routing). Endpoint-level field catalogs live in [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) (OAuth, API keys, BYOK, credits, organization) and [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise) (guardrails, presets, workspaces & budgets); provider routing (`provider.*`, variants, fallbacks) is in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

Quick map of the request-level knobs in this section:

| Knob | Where | Purpose | Subsection |
| - | - | - | - |
| `Authorization: Bearer <key>` | header | API key, OAuth-issued key, or WIF access token | 10.1, 10.3, 10.4 |
| `HTTP-Referer`, `X-OpenRouter-Title` (`X-Title`), `X-OpenRouter-Categories`, `X-OpenRouter-App-Visibility` | headers | App attribution / rankings | 10.2 |
| `cache_control`, `prompt_cache_breakpoint`, `prompt_cache_options`, `prompt_cache_key` | body | Provider prompt caching | 10.8 |
| `session_id` / `x-session-id` | body / header | Sticky routing + session grouping | 10.8 |
| `X-OpenRouter-Cache`, `X-OpenRouter-Cache-TTL`, `X-OpenRouter-Cache-Clear` | headers | OpenRouter response caching | 10.9 |
| `reasoning` (`effort`, `max_tokens`, `enabled`, `exclude`, `summary`, `context`, `mode`), `reasoning_effort` | body | Reasoning tokens | 10.10 |
| `service_tier`, `speed`, `:nitro` / `:floor` | body / model suffix | Capacity tier (flex / priority / ultrafast) | 10.11 |
| `plugins: [{ id: "context-compression" }]` | body | Middle-out context compression | 10.12 |
| `X-OpenRouter-Metadata: enabled` | header | `openrouter_metadata` routing trace | 10.13 |
| `model: "@preset/<slug>"`, `preset` | body | Server-stored configuration | 10.15 |
| `provider.zdr`, `provider.data_collection` | body | Privacy routing filters | 10.16, 10.17 |
| `https://eu.openrouter.ai` / `https://us.openrouter.ai` | base URL | In-region routing | 10.18 |

### 10.1 Quickstart: the canonical first request

OpenRouter exposes hundreds of models behind one endpoint. Three integration approaches:

| Approach | Best for | Package |
| - | - | - |
| Raw HTTP API | Full control, any language, no dependencies | — |
| Client SDKs | Type-safe model calls, thin layer over REST | `@openrouter/sdk` (npm/pnpm/yarn/bun/deno), `openrouter` (pip) — see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go) |
| Agent SDK | Agents with tool loops and state (`callModel`) | `@openrouter/agent` — see [§2](02-agent-sdk.md#2-agent-sdk-openrouteragent) |

The quickstart examples target the **Responses API** (`POST https://openrouter.ai/api/v1/responses`) and the model `~openai/gpt-sol-latest`, a *latest alias* that always resolves to the newest model in the OpenAI GPT Sol family (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) for `~` latest-resolution). Any model slug works; list them with `GET /api/v1/models`. Attribution headers are optional (see 10.2). An interactive Request Builder exists at `https://openrouter.ai/request-builder`.

#### Raw HTTP

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
  "model": "~openai/gpt-sol-latest",
  "input": "What is the meaning of life?"
}'
```

```typescript
// TypeScript (fetch)
fetch('https://openrouter.ai/api/v1/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': '<YOUR_SITE_URL>',        // Optional. Site URL for rankings on openrouter.ai.
    'X-OpenRouter-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '~openai/gpt-sol-latest',
    input: 'What is the meaning of life?',
  }),
});
```

```python
# Python (requests)
import json, os, requests

response = requests.post(
    url="https://openrouter.ai/api/v1/responses",
    headers={
        "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        "HTTP-Referer": "<YOUR_SITE_URL>",        # Optional
        "X-OpenRouter-Title": "<YOUR_SITE_NAME>", # Optional
    },
    data=json.dumps({
        "model": "~openai/gpt-sol-latest",
        "input": "What is the meaning of life?",
    }),
)
```

#### Client SDK (TypeScript `@openrouter/sdk`)

```typescript
import { OpenRouter } from '@openrouter/sdk';

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  httpReferer: '<YOUR_SITE_URL>', // Optional attribution
  appTitle: '<YOUR_SITE_NAME>',   // Optional attribution
});

const response = await client.responses.send({
  responsesRequest: {
    model: '~openai/gpt-sol-latest',
    input: 'What is the meaning of life?',
  },
});

// The return type is a union of streaming / non-streaming results; narrow it.
if (!('output' in response)) {
  throw new Error('Expected a non-streaming response');
}
if (response.status !== 'completed') {
  throw new Error(response.error?.message ?? `Response ended as ${response.status}`);
}

const message = response.output.find((item) => item.type === 'message');
console.log(message?.content.find((part) => part.type === 'output_text')?.text);
```

#### Client SDK (Python `openrouter`)

```python
import os
from openrouter import OpenRouter

with OpenRouter(api_key=os.getenv("OPENROUTER_API_KEY")) as client:
    response = client.responses.send(
        model="~openai/gpt-sol-latest",
        input="What is the meaning of life?",
    )

    if response.status != "completed":
        message = response.error.message if response.error else f"Response ended as {response.status}"
        raise RuntimeError(message)

    message = next(item for item in response.output if item.type == "message")
    print(next(part.text for part in message.content if part.type == "output_text"))
```

#### Agent SDK (`@openrouter/agent`)

```typescript
import { OpenRouter, tool } from '@openrouter/agent';
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
});

console.log(await result.getText()); // tool call, execution and final answer in one callModel
```

#### OpenAI SDK as a drop-in client

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>',
    'X-OpenRouter-Title': '<YOUR_SITE_NAME>',
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
    extra_headers={
        "HTTP-Referer": "<YOUR_SITE_URL>",
        "X-OpenRouter-Title": "<YOUR_SITE_NAME>",
    },
    model="~openai/gpt-sol-latest",
    input="What is the meaning of life?",
)
print(response.output_text)
```

#### Other quickstart notes

- **EU in-region routing** (Business/Enterprise): send to `https://eu.openrouter.ai/api/v1/responses` or set the SDK base URL to `https://eu.openrouter.ai/api/v1`, with an EU-eligible model (see 10.18).
- Streaming is supported ([§4](04-api-fundamentals.md#4-api-fundamentals)). Third-party frameworks: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations).
- **Coding assistants**: the hosted OpenRouter MCP server (`https://mcp.openrouter.ai/mcp`, OAuth login) lets tools like Claude Code/Cursor/Codex query live model, pricing, credit and docs data while you build; it is not for running inference in your app ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)).
- The quickstart page also points to an `OpenRouterTeam/skills` repository (`create-agent-tui`) as a starting point for building an agent.

Gotchas:
- TS SDK `responses.send` returns a union; narrow with `'output' in response` before reading `output`, and check `status === 'completed'`.
- In the TS SDK the request body is wrapped: `responses.send({ responsesRequest: {...} })`; the Python SDK takes keyword args directly.
- `~...-latest` aliases can change the served model without a deploy; pin an exact slug when reproducibility matters.

Sources: https://openrouter.ai/docs/quickstart

### 10.2 App attribution

Attribution associates your usage with your app so it appears in public rankings (`openrouter.ai/rankings`), in the "Apps" tab of each model page, and gets an analytics page at `openrouter.ai/apps?url=<your-app-url>`.

#### Headers

| Header | Required | Value | Effect |
| - | - | - | - |
| `HTTP-Referer` | **Yes** for attribution | Your app URL (primary domain, e.g. `https://myapp.com`) | Primary identifier. Without it no app page is created and usage does not appear in rankings. The URL becomes the app's unique ID. |
| `X-OpenRouter-Title` | No | Display name | Sets/modifies the app's display name. Does not create an app on its own; must be paired with `HTTP-Referer`. `X-Title` is still accepted for backwards compatibility. |
| `X-OpenRouter-Categories` | No | Comma-separated list, max **2** per request | Assigns marketplace categories. Lowercase, hyphen-separated, each ≤ 30 chars. Unrecognized values are dropped silently (no error). Merged with existing categories, up to **10** total. |
| `X-OpenRouter-App-Visibility` | No | `hidden` | Only when the request **creates a brand-new app**: creates it hidden (excluded from public rankings, marketplace and public app pages; attribution and your own analytics still work). Any other value or absence → public. Ignored on every later request. |

SDK option names:

| SDK | URL | Title | Categories |
| - | - | - | - |
| TypeScript `@openrouter/sdk` (`new OpenRouter({...})`) | `httpReferer` | `appTitle` | `appCategories` |
| Python `openrouter` (`OpenRouter(...)`) | `http_referer` | `x_open_router_title` | `x_open_router_categories` |
| OpenAI SDK | `defaultHeaders` (TS) / `extra_headers` (Python) with the raw header names | | |

#### Recognized categories

| Group | Category values |
| - | - |
| Coding | `cli-agent` (terminal coding assistants), `ide-extension`, `cloud-agent`, `programming-app`, `native-app-builder` (mobile/desktop app builders) |
| Creative | `creative-writing`, `video-gen`, `image-gen`, `audio-gen` |
| Productivity | `writing-assistant`, `general-chat`, `personal-agent`, `legal` |
| Entertainment | `roleplay`, `game` |

Only these are accepted; contact OpenRouter for new categories.

#### Examples

```typescript
// TypeScript SDK
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  httpReferer: 'https://myapp.com',
  appTitle: 'My AI Assistant',
  appCategories: 'cli-agent,cloud-agent',
});

const response = await openRouter.responses.send({
  responsesRequest: { model: 'openai/gpt-5.2', input: 'Hello, world!', stream: false },
});
```

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://myapp.com" \
  -H "X-OpenRouter-Title: My AI Assistant" \
  -H "X-OpenRouter-Categories: cli-agent,cloud-agent" \
  -d '{"model": "openai/gpt-5.2", "input": "Hello, world!"}'
```

```python
# OpenAI Python SDK
response = client.responses.create(
    extra_headers={
        "HTTP-Referer": "https://myapp.com",
        "X-OpenRouter-Title": "My AI Assistant",
        "X-OpenRouter-Categories": "cli-agent,cloud-agent",
    },
    model="openai/gpt-5.2",
    input="Hello, world!",
)
```

Hidden app for internal telemetry (set once in a shared client; every new URL lands hidden on its first request):

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://internal-service.example.com" \
  -H "X-OpenRouter-Title: Internal Service" \
  -H "X-OpenRouter-App-Visibility: hidden" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o", "input": "Hello"}'
```

#### Where the app appears

- **App rankings**: top public apps by token usage; daily/weekly/monthly views; total tokens across models.
- **Model "Apps" tab**: apps using that model most, updated weekly.
- **App analytics** (`openrouter.ai/apps?url=<url>`): model usage over time, prompt/completion token breakdown, historical patterns.

Gotchas:
- `HTTP-Referer` is the minimum. Title alone creates nothing.
- `localhost` URLs are only tracked if `X-OpenRouter-Title` is also sent. (OAuth localhost callbacks get a fixed `localhost:<port>` title and never appear in rankings — see 10.3.)
- Avoid subdomains unless they are distinct apps; use the real product name, not "AI App"/"Chatbot".
- Visibility is fixed at creation: an `HTTP-Referer` that resolves to an existing app (including via origin grouping or a prior OAuth authorization) keeps its visibility; you cannot hide someone else's app or un-hide yours via headers — contact support.
- Attribution headers are **not** part of the response-cache key (10.9) and don't expose request content.

Sources: https://openrouter.ai/docs/app-attribution, https://openrouter.ai/docs/quickstart, https://openrouter.ai/docs/api_reference/authentication, https://openrouter.ai/docs/client-sdks/python/sdks/chat/README

### 10.3 OAuth PKCE (users bring their own OpenRouter key)

Use OAuth PKCE so each end user signs in to OpenRouter, authorizes your app, and your app receives an API key tied to **their** account; their usage is billed to their credits. Your app never sees their password.

#### Step 1 — redirect to `https://openrouter.ai/auth`

```txt
# S256 (recommended)
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256
# plain
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=plain
# no challenge (allowed, not recommended)
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>
# headless (no callback; challenge REQUIRED)
https://openrouter.ai/auth?code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256&key_label=<YOUR_APP_NAME>
```

| Query param | Required | Description |
| - | - | - |
| `callback_url` | Yes, except headless mode | Where the user is redirected with `?code=...`. HTTPS URLs, or `localhost`/`127.0.0.1` on **any port** (e.g. `http://localhost:51423/callback`). |
| `code_challenge` | Optional (required in headless mode) | PKCE challenge. For `S256`: base64url of SHA-256(`code_verifier`). |
| `code_challenge_method` | With `code_challenge` | `S256` (recommended) or `plain`. |
| `key_label` | No | Prefills the label of the API key to be created. |
| `workspace_id` | No | UUID; preselects the workspace for the new key (user may change it). Ignored (nothing preselected) if not in the user's active account. |
| `required_workspace_id` | No | UUID; locks the picker to this workspace. If not in the user's active account, the page errors until they switch accounts. Takes precedence over `workspace_id`. |
| `state` | No | Returned unchanged as `state` on the callback (CSRF protection / request matching). Not returned on deny or in headless mode. |

Workspace IDs are validated server-side against the authorizing account; a workspace the user cannot access is rejected regardless of the URL.

Generate the challenge (TypeScript, from the docs — Buffer needs a bundler in the browser):

```typescript
import { Buffer } from 'buffer';

async function createSHA256CodeChallenge(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hash).toString('base64url');
}

// Use a high-entropy random verifier and keep it (e.g. sessionStorage) for Step 2.
const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const codeChallenge = await createSHA256CodeChallenge(codeVerifier);
const state = crypto.randomUUID();
sessionStorage.setItem('or_pkce', JSON.stringify({ codeVerifier, state }));

location.href =
  `https://openrouter.ai/auth?callback_url=${encodeURIComponent('https://myapp.com/callback')}` +
  `&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&key_label=MyApp`;
```

Equivalent challenge generation in Python (standard library):

```python
import base64, hashlib, secrets

code_verifier = secrets.token_urlsafe(32)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).rstrip(b"=").decode()
```

**Localhost apps**: any port works. Localhost apps get a fixed title matching host:port (e.g. `localhost:3000`) and never appear in marketplace/rankings. For production attribution switch the callback to a public URL (project site or GitHub repo).

**Headless apps** (SSH sessions, remote dev boxes, containers): omit `callback_url`. After authorization the page shows the code on screen; the user pastes it into your app; exchange it as usual. `code_challenge` is required in this mode. Codes are single-use and expire after **10 minutes**.

#### Step 2 — exchange the code: `POST https://openrouter.ai/api/v1/auth/keys`

```typescript
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const { codeVerifier, state } = JSON.parse(sessionStorage.getItem('or_pkce')!);
if (urlParams.get('state') !== state) throw new Error('state mismatch');

const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,                              // required
    code_verifier: codeVerifier,       // if code_challenge was used
    code_challenge_method: 'S256',     // if code_challenge was used; must match Step 1
  }),
});
const { key, user_id } = await response.json();
```

| Body field | Type | Required | Description |
| - | - | - | - |
| `code` | string | Yes | Code from the redirect (or pasted in headless mode). |
| `code_verifier` | string | If a challenge was used | The original verifier. |
| `code_challenge_method` | `"S256"` \| `"plain"` \| null | If a challenge was used | Must be the same method as Step 1. |

Response `200`: `{ "key": "<user API key>", "user_id": "<string|null>" }`. The documented example sends no `Authorization` header.

SDK equivalents:

```typescript
const result = await openRouter.oAuth.exchangeAuthCodeForAPIKey({
  requestBody: { code, codeChallengeMethod: 'S256', codeVerifier },
});
```

```python
res = open_router.o_auth.exchange_auth_code_for_api_key(
    code=code, code_challenge_method="S256", code_verifier=code_verifier,
)
```

#### Step 3 — use the key

Store it securely (user's browser or your DB) and use it as a normal bearer key:

```typescript
import { OpenRouter } from '@openrouter/sdk';
const userClient = new OpenRouter({ apiKey: key });
const r = await userClient.responses.send({
  responsesRequest: { model: '~openai/gpt-sol-latest', input: 'Hello!', stream: false },
});
```

#### Deep-link to the user's key pages

Hash the key with SHA-256 (lowercase hex) and build:

```typescript
async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
const keyHash = await sha256Hex(key);
const logsUrl = `https://openrouter.ai/logs?api_key_hash=${keyHash}`;
const settingsUrl = `https://openrouter.ai/keys/${keyHash}`;
```

Links work only for the signed-in key owner; otherwise the page returns `404` (never unfiltered data).

#### Headless CLI example (Python)

```python
import base64, hashlib, secrets, requests

verifier = secrets.token_urlsafe(32)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
print(f"Open: https://openrouter.ai/auth?code_challenge={challenge}&code_challenge_method=S256&key_label=my-cli")
code = input("Paste the authorization code: ").strip()   # single-use, expires in 10 minutes

r = requests.post("https://openrouter.ai/api/v1/auth/keys", json={
    "code": code, "code_verifier": verifier, "code_challenge_method": "S256",
})
r.raise_for_status()
api_key = r.json()["key"]
```

#### Limits and expiry on OAuth-issued keys

The PKCE guide itself does not expose limit parameters on `/auth`. Two documented mechanisms constrain OAuth keys:

1. **`POST /api/v1/auth/keys/code` ("Create authorization code", SDK `oAuth.createAuthCode` / `o_auth.create_auth_code`)** — bearer-authenticated; creates a PKCE authorization code server-side with key settings attached. Body: `callback_url` (required, https or localhost/127.0.0.1 any port), `code_challenge`, `code_challenge_method` (`S256`|`plain`), `limit` (credit limit, USD), `usage_limit_type` (`daily`|`weekly`|`monthly` reset interval), `expires_at` (ISO 8601 UTC **with seconds**; minute precision rejected), `key_label` (≤100 chars; defaults to app name), `workspace_id` (UUID). Response: `{ data: { id, app_id, created_at } }` where `id` is "the authorization code ID to use in the exchange request". The guide does not describe how this endpoint fits the browser flow; treat it as an advanced/server-side variant (see [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).
2. **Maximum key lifetime** (Security settings → privacy settings, 10.6): applies to keys issued through OAuth consent too. OpenRouter MCP keys are capped at 7 days on their own and get the shorter lifetime if the policy is stricter.

```typescript
const code = await openRouter.oAuth.createAuthCode({
  requestBody: {
    callbackUrl: 'https://myapp.com/auth/callback',
    codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    codeChallengeMethod: 'S256',
    limit: 100,
  },
});
```

#### Errors

| Status | Message | Fix |
| - | - | - |
| 400 | `Invalid code_challenge_method` | Use the same method in Step 1 and Step 2. |
| 403 | `Invalid code or code_verifier` | User must be logged in; verify `code_verifier` and `code_challenge_method`. |
| 403 | `Authorization code expired` | Codes expire 10 minutes after issuance; restart the flow. |
| 405 | `Method Not Allowed` | Use `POST` over HTTPS. |

Gotchas:
- Store the `code_verifier` across the redirect (sessionStorage/server session); it is needed for the exchange.
- `S256` challenge = base64url (no padding) of the SHA-256 digest of the verifier.
- `state` is not echoed in headless mode or on deny — don't rely on it there.
- The first OAuth authorization from a callback URL can create the app record; that app's visibility then cannot be changed with `X-OpenRouter-App-Visibility` (10.2).

Sources: https://openrouter.ai/docs/guides/overview/auth/oauth, https://openrouter.ai/docs/api/api-reference/oauth/exchange-authorization-code-for-api-key, https://openrouter.ai/docs/api/api-reference/oauth/create-authorization-code, https://openrouter.ai/docs/client-sdks/typescript/sdks/oauth/README, https://openrouter.ai/docs/client-sdks/python/sdks/oauth/README, https://openrouter.ai/docs/guides/overview/auth/security-settings

### 10.4 Workload identity federation (WIF)

Lets a workload that already holds a JWT from **your** identity provider call OpenRouter without a long-lived OpenRouter key. The workload exchanges its JWT for a short-lived OpenRouter access token (RFC 8693 token exchange) and uses it as the bearer for inference, or for organization management (e.g. the Terraform provider). **Business and Enterprise plans only**; configured under **Settings → Workload identity** by an organization admin.

#### How it works

1. Your IdP signs a JWT for the workload (service account, CI job, Kubernetes pod).
2. The workload posts it to `POST https://openrouter.ai/api/v1/oauth/token`.
3. OpenRouter verifies the signature against the issuer's published keys, finds the **federation policy** matching the token's `sub`/`aud`, and mints an access token that **acts as the API key the policy targets**.
4. The workload calls `https://openrouter.ai/api/v1/...` with `Authorization: Bearer <access_token>` until expiry, then exchanges again.

Access tokens live **at most 15 minutes** and never longer than the exchanged JWT. Usage is attributed to the target API key exactly as if it had been used directly.

#### Trust setup

**Issuer** (an IdP your org trusts):

| Field | Meaning |
| - | - |
| Name | Label for the settings page. |
| Issuer URL | Must equal the token's `iss` exactly. `https://` only. |
| JWKS URL (optional) | Signing keys location. If empty, OpenRouter reads `jwks_uri` from `<issuer>/.well-known/openid-configuration`. |

**Policy** (which tokens may exchange, and as which key):

| Field | Meaning |
| - | - |
| Issuer | The issuer signing the tokens. |
| Subject | Optional. If set, must equal `sub` exactly. |
| Audience | Required. Must equal one of the token's `aud` values exactly. |
| Condition | Optional CEL expression that must evaluate to `true`. |
| Acts as API key | A **workspace API key** (→ `inference` scope) or a **management key** (→ `management` scope) owned by your org. Personal keys cannot be targeted. |

- A policy must set at least one of Subject or Condition.
- Each policy has an id (shown under its name); the workload sends it as `federation_policy_id`, binding the exchange to your org even if another org trusts the same issuer/subject/audience.
- Policies can be paused via the **Enabled** switch.

**Claim checks** (Token must match → Add claim check; each addable once):

| Check | Required subject-token claim |
| - | - |
| Scopes | `scopes` must be an **array of strings** containing the configured value (a space-separated `scope` string is not used). |
| Token type | `token_type` claim (string) must equal the configured value, e.g. `service_account`. Not the JWT header `typ`. |

All checks are case-sensitive; missing/wrongly typed claims fail. They validate the incoming token only — they do not change the issued token's scope, and sending `scope` in the exchange request doesn't satisfy them.

**CEL conditions** — evaluated after signature, expiry, subject, audience and claim checks. Variables:

| Variable | Type | Source claim |
| - | - | - |
| `subject` | `string` | `sub` |
| `audience` | `list<string>` | `aud` (string → one-element list) |
| `scopes` | `list<string>` | `scopes` (empty list if absent) |
| `token_type` | `string` | `token_type` (empty string if absent) |

```text
subject.startsWith("repo:acme/")
"inference" in scopes && audience.size() == 1
token_type == "service_account" || subject.endsWith("@ci.acme.dev")
```

Limits: ≤ 2,000 chars; only the variables above; must type-check to boolean at save time; `matches()` (regex) unavailable; comprehension macros (`all`, `exists`, `filter`, `map`, …) cannot be nested. At exchange time, `false`, an evaluation error, or wrongly typed `scopes`/`token_type` → `invalid_grant`. Tokens whose `sub` or any `aud` value exceeds 512 chars, or whose `scopes` has > 16 entries or an entry > 512 chars, are rejected before rules run.

#### Token exchange

```bash
curl https://openrouter.ai/api/v1/oauth/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d subject_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d federation_policy_id="$FEDERATION_POLICY_ID" \
  -d subject_token="$IDP_JWT"
```

```json
{
  "access_token": "<short-lived JWT>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "inference"
}
```

Request (`application/x-www-form-urlencoded`, body < 32 KB):

| Field | Required | Value |
| - | - | - |
| `grant_type` | Yes | `urn:ietf:params:oauth:grant-type:token-exchange` |
| `subject_token_type` | Yes | `urn:ietf:params:oauth:token-type:jwt` |
| `subject_token` | Yes | The IdP JWT (≤ 16 KB; must look like `header.payload.signature`) |
| `federation_policy_id` | Yes | Policy UUID |
| `requested_token_type` | No | If sent, must be `urn:ietf:params:oauth:token-type:access_token` |
| `scope` | No | If sent, must equal the policy's scope (`inference` for workspace key, `management` for management key); omitted → policy's scope |
| `audience`, `resource` | No | Accepted and ignored |

Response fields: `access_token`, `issued_token_type`, `token_type` (`Bearer`), `expires_in` (seconds; ≤ 900 and ≤ subject-token lifetime), `scope` (`inference` | `management`).

Use the token:

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o-mini", "input": "Hello"}'

# management-scoped token (policy targets a management key)
curl https://openrouter.ai/api/v1/workspaces -H "Authorization: Bearer $ACCESS_TOKEN"
```

SDK:

```typescript
const tok = await openRouter.oAuth.createOauthToken({
  tokenExchangeRequest: {
    federationPolicyId: process.env.FEDERATION_POLICY_ID!,
    grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subjectToken: idpJwt,
    subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
  },
});
```

```python
res = open_router.o_auth.create_oauth_token(
    federation_policy_id=os.environ["FEDERATION_POLICY_ID"],
    grant_type="urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token=idp_jwt,
    subject_token_type="urn:ietf:params:oauth:token-type:jwt",
)
```

Token-caching pattern (refresh before the ≤ 15 min expiry):

```typescript
let cached: { token: string; expiresAt: number } | null = null;

export async function openRouterBearer(getIdpJwt: () => Promise<string>) {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const res = await fetch('https://openrouter.ai/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      federation_policy_id: process.env.FEDERATION_POLICY_ID!,
      subject_token: await getIdpJwt(),
    }),
  });
  if (res.status === 429) throw new Error(`rate limited; retry after ${res.headers.get('Retry-After')}s`);
  if (!res.ok) throw new Error(`token exchange failed: ${JSON.stringify(await res.json())}`);
  const body = await res.json();
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cached.token;
}
```

#### Scopes

- `inference` token (policy → workspace key): inference endpoints only; refused on management endpoints.
- `management` token (policy → management key): same access level and permissions as that key (a read-only management key yields a read-only token); refused on inference endpoints.
- Management keys can create/delete keys, change guardrails, manage workspaces org-wide — pin such policies to the narrowest subject (e.g. a protected CI branch) plus claim checks/conditions.

#### Subject-token requirements

- Signed `ES256` or `RS256` by a key at the issuer's JWKS.
- Carries `iss`, `sub`, `aud`, `exp`; not expired.
- `iss` = policy issuer URL; one `aud` = policy audience; `sub` = policy subject if set.
- Satisfies all claim checks and the condition.

#### Errors (RFC 6749 §5.2)

| HTTP | `error` | Meaning |
| - | - | - |
| 400 | `invalid_request` | Missing/malformed field, or `subject_token` not a JWT. |
| 400 | `unsupported_grant_type` | `grant_type` isn't token-exchange. |
| 400 | `invalid_scope` | Scope not `inference`/`management`, or not the policy's scope. |
| 400 | `invalid_grant` | Generic rejection: policy missing/paused, claims don't match, bad signature, or expired (one message for all, to prevent probing). |
| 413 | `invalid_request` | Body > 32 KB. |
| 429 | `invalid_request` | Too many exchanges from one address; honor `Retry-After`. |
| 503 | `temporarily_unavailable` | Issuer discovery doc or JWKS unreachable; retry shortly. |

#### Verifying OpenRouter access tokens

Access tokens are JWTs (`typ: at+jwt`) signed by OpenRouter with `ES256`; public keys at `GET https://openrouter.ai/api/v1/oauth/jwks` (RFC 7517 JWK Set; keys have `alg: ES256`, `crv: P-256`, `kty: EC`, `use: sig`, `kid`, `x`, `y`). Claims: `sub` = the exchanged JWT's `sub`; `federation_policy_id` and `federation_issuer_id` name the authorizing policy/issuer (for your audit; OpenRouter doesn't read them when authorizing).

#### Revocation

Deleting/pausing a policy, deleting an issuer, or losing the entitlement stops **new** exchanges immediately; outstanding tokens remain valid until expiry (≤ 15 min). To cut off access within that window, **disable or delete the target API key** — key state is checked on every request.

Gotchas:
- The exchange is form-encoded, not JSON.
- `federation_policy_id` is mandatory on every exchange.
- Audience must match exactly; tokens minted for other services are never accepted.
- Don't put a `scope` you hope to "upgrade" to — it must equal the policy's scope.

Sources: https://openrouter.ai/docs/guides/overview/auth/workload-identity-federation, https://openrouter.ai/docs/api/api-reference/oauth/exchange-a-workload-identity-token, https://openrouter.ai/docs/api/api-reference/oauth/openrouter-access-token-signing-keys, https://openrouter.ai/docs/client-sdks/typescript/sdks/oauth/README, https://openrouter.ai/docs/client-sdks/python/sdks/oauth/README

### 10.5 Management API keys

A **management key** is an administrative credential for programmatic key, workspace, guardrail, BYOK, analytics and org management. It **cannot call completion/inference endpoints**.

#### Creating one

1. Go to `https://openrouter.ai/settings/management-keys`.
2. Click "Create New Key".
3. Enter a name and choose an expiration.
4. Copy the key immediately — it is shown once.

There is no documented API to mint management keys; they are created in the dashboard (or used indirectly through a WIF `management`-scoped token, 10.4).

#### Scope and permissions

- Account-level; in organizations only **Organization Admins** can create them. The guide calls them unscoped (one key covers all the account's workspaces). The `/api/v1/keys` spec also mentions *workspace-scoped* management keys (which default to and are confined to their own workspace) versus organization-scoped ones (default workspace unless `workspace_id` is given).
- Endpoints for workspace members (`POST /api/v1/workspaces/{id}/members/add`), keys and budgets require a management key. Members added via API inherit their org role (Org Admin → Workspace Admin; Org Member → Workspace Member).
- In the dashboard, Workspace Admins can add members without a management key; assigning workspace roles there requires a Pro or Enterprise plan.
- The Enterprise IP allowlist (10.6) does **not** currently restrict management-key requests.

#### Expiration

- Strongly recommended. A leaked management key can create/edit/delete all API keys in the account (except those provisioned by a Connect client).
- Fixed at creation; cannot be changed. To extend, create a new key and delete the old.
- After expiry every request fails `401 Unauthorized` with message `API key expired`. Expired keys still show on the page until deleted.
- Rotate automations **before** the expiration shown next to the key.

#### Key CRUD (`/api/v1/keys`, management key required)

| Method & path | Purpose | Notable inputs |
| - | - | - |
| `GET /api/v1/keys` | List (most recent 100 per page) | Query: `offset`, `include_disabled`, `include_expired` (expired excluded by default), `workspace_id` |
| `POST /api/v1/keys` | Create; response includes plaintext `key` **once** (`201`) | `name` (required, 1–256), `limit` (USD, 0 ≤ x < 1,000,000), `limit_reset` (`daily`\|`weekly`\|`monthly`\|null; resets midnight UTC, weeks Mon–Sun), `include_byok_in_limit`, `expires_at` (ISO 8601 UTC with seconds), `workspace_id`, `creator_user_id` (omit for a workspace-owned key), `external` (`{ user, api_key? }` partner identity) |
| `GET /api/v1/keys/{hash}` | Get one | `hash` |
| `PATCH /api/v1/keys/{hash}` | Update | `name`, `disabled`, `limit`, `limit_reset`, `include_byok_in_limit`, `workspace_id` (moves the key; guardrail selections move, presets/BYOK/broadcast/routing rules don't). Unknown fields ignored; no accepted field → `400 No update fields provided`. Expiry is **not** updatable. |
| `DELETE /api/v1/keys/{hash}` | Delete | `hash` → `{ "deleted": true }` |

Key object fields: `hash`, `name`, `label` (e.g. `sk-or-v1-abc...123`), `disabled`, `limit`, `limit_remaining`, `limit_reset`, `include_byok_in_limit`, `usage`, `usage_daily`, `usage_weekly`, `usage_monthly`, `byok_usage`, `byok_usage_daily`, `byok_usage_weekly`, `byok_usage_monthly`, `created_at`, `updated_at`, `expires_at`, `last_used_at`, `creator_user_id`, `workspace_id`, `external_user`. Full schema: [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data).

Any key (not only management) can call `GET /api/v1/key` for its own metadata, including `budgets[]`, `effective_budget`, `allowed_data_regions`, `is_management_key`, `expires_at` (see 10.19).

#### TypeScript SDK (generated method shapes)

```typescript
import { OpenRouter } from '@openrouter/sdk';

const admin = new OpenRouter({ apiKey: process.env.OPENROUTER_MANAGEMENT_KEY });

const page1 = await admin.apiKeys.list();

const created = await admin.apiKeys.create({
  requestBody: {
    name: 'Customer Instance Key',
    limit: 50,
    limitReset: 'monthly',
    includeByokInLimit: true,
    expiresAt: new Date('2027-12-31T23:59:59Z'),
  },
});
// created.key is the plaintext key (only time it is returned); created.data.hash identifies it.

const one = await admin.apiKeys.get({ hash: created.data.hash });

await admin.apiKeys.update({
  hash: created.data.hash,
  requestBody: { name: 'Updated', disabled: false, limit: 75, limitReset: 'daily', includeByokInLimit: true },
});

await admin.apiKeys.delete({ hash: created.data.hash });
```

> Docs discrepancy: the management-keys guide shows `apiKeys.get(keyHash)`, `apiKeys.update(keyHash, {...})`, `apiKeys.delete(keyHash)`, `apiKeys.list({ offset: 100 })` and `create({ name, limit })` without `requestBody`. The generated SDK reference uses `{ hash }` / `{ hash, requestBody }` / `{ requestBody }` as above. Prefer the SDK reference ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)).

#### Python (requests) — from the guide

```python
import os, requests

BASE_URL = "https://openrouter.ai/api/v1/keys"
H = {"Authorization": f"Bearer {os.environ['OPENROUTER_MANAGEMENT_KEY']}", "Content-Type": "application/json"}

keys = requests.get(BASE_URL, headers=H).json()                        # first 100
keys_p2 = requests.get(f"{BASE_URL}?offset=100", headers=H).json()     # pagination
new = requests.post(BASE_URL, headers=H, json={"name": "Customer Instance Key", "limit": 1000}).json()
key_hash = new["data"]["hash"]
requests.get(f"{BASE_URL}/{key_hash}", headers=H)
requests.patch(f"{BASE_URL}/{key_hash}", headers=H, json={
    "name": "Updated Key Name",
    "disabled": True,
    "include_byok_in_limit": False,
    "limit_reset": "daily",
})
requests.delete(f"{BASE_URL}/{key_hash}", headers=H)
```

#### Rotation script (composed from the documented endpoints)

```typescript
const BASE = 'https://openrouter.ai/api/v1/keys';
const H = {
  Authorization: `Bearer ${process.env.OPENROUTER_MANAGEMENT_KEY}`,
  'Content-Type': 'application/json',
};

async function rotate(oldHash: string, name: string, deploy: (key: string) => Promise<void>) {
  const old = (await (await fetch(`${BASE}/${oldHash}`, { headers: H })).json()).data;

  // 1. New key with the same caps and an expiration (expiry cannot be changed later).
  const expiresAt = new Date(Date.now() + 90 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z'); // seconds precision
  const res = await fetch(BASE, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      name: `${name} ${new Date().toISOString().slice(0, 10)}`,
      limit: old.limit,
      limit_reset: old.limit_reset,
      include_byok_in_limit: old.include_byok_in_limit,
      expires_at: expiresAt,
      workspace_id: old.workspace_id,
    }),
  });
  const { key, data } = await res.json(); // `key` is returned only here

  // 2. Ship the new key to its consumers.
  await deploy(key);

  // 3. Disable (reversible) the old key; delete it after a grace period.
  await fetch(`${BASE}/${oldHash}`, { method: 'PATCH', headers: H, body: JSON.stringify({ disabled: true }) });
  return data.hash;
}
```

#### Organization settings (`/api/v1/organization/settings`)

A management key created in an organization can read/update that org's settings (the key's own org; not selectable per request). Personal-account management keys get `404`.

- `is_filtered_model_catalog_enabled` (default `false`) — same as Settings → Privacy → "Filter the model catalog for API keys". When on, `GET /api/v1/models` with an org API key returns only models that key can use (the `/api/v1/models/user` catalog); the dashboard shows the same list; keyless requests still get the public catalog. Visibility is driven by the active workspace's guardrails and provider preferences.

```bash
curl https://openrouter.ai/api/v1/organization/settings -H "Authorization: Bearer $MANAGEMENT_API_KEY"
curl -X PATCH https://openrouter.ai/api/v1/organization/settings \
  -H "Authorization: Bearer $MANAGEMENT_API_KEY" -H "Content-Type: application/json" \
  -d '{"is_filtered_model_catalog_enabled": true}'
# → {"data": {"id": "org_...", "is_filtered_model_catalog_enabled": true}}
```

#### Routes that require a management key

Regular API keys are rejected on these route groups (full per-route tables in [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)/[§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)):

| Group | Routes |
| - | - |
| Analytics | `GET /activity`, `GET /analytics/meta`, `POST /analytics/query` |
| API Keys | `GET/POST /keys`, `GET/PATCH/DELETE /keys/{hash}` |
| BYOK | `GET/POST /byok`, `GET/PATCH/DELETE /byok/{id}` |
| Credits | `GET /credits` |
| External Users | `GET/POST /external-users`, `GET/PATCH/DELETE /external-users/{user}` |
| Generations | `POST /generation/feedback` |
| Guardrail Policies | `/guardrails/policies/account[/{id}]`, `/guardrails/policies/assignments/api-keys/{hash}`, `/guardrails/policies/assignments/members/{member_id}`, `/guardrails/policies/budget[/{id}]`, `/guardrails/policies/model-availability[/{id}]`, `/guardrails/policies/moderation[/{id}]` |
| Guardrails | `/guardrails[/{id}]`, `/guardrails/{id}/assignments/keys[/remove]`, `/guardrails/{id}/assignments/members[/remove]`, `/guardrails/assignments/keys`, `/guardrails/assignments/members` |
| Observability | `/observability/destinations[/{id}]` |
| Organization | `GET /organization/members`, `GET/PATCH /organization/settings` |
| Private Endpoints | `/private-endpoints[/{id}]`, `POST /private-endpoints/{id}/activate|disable|enable|validate` |
| Private Providers | `/private-providers[/{slug}]` |
| SCIM | `/scim/group-mappings[/{id}]`, `GET /scim/groups`, `POST /scim/sync-jobs`, `GET /scim/sync-jobs/{id}` |
| Workspaces | `/workspaces[/{id}]`, `GET /workspaces/{id}/members`, `POST /workspaces/{id}/members/add|remove`, `/workspaces/{workspace_ref}/budgets[/{interval}]` |

(All paths are under `https://openrouter.ai/api/v1`.)

Use cases: per-customer keys for SaaS instances, scheduled key rotation, usage monitoring with auto-disable (with daily/weekly/monthly limit resets).

Gotchas:
- Management keys on `/chat/completions`, `/responses`, etc. fail — use a regular key for inference.
- The plaintext key is only in the create response; persist it then.
- `expires_at` must include seconds (`YYYY-MM-DDTHH:MM:SSZ`).
- Omit `creator_user_id` to create a workspace-owned (system) key — such keys escape member guardrail budgets (10.20).
- `PATCH` with only unrecognized fields → `400 No update fields provided`.

Sources: https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/client-sdks/typescript/sdks/apikeys/README, https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key, OpenAPI spec (`/keys`, `/key`)

### 10.6 Security settings

The Security settings page (`https://openrouter.ai/settings/security`) has three tabs: **Overview**, **Key safety**, **IP allowlist**. Personal accounts and org admins can edit the maximum key lifetime; on Enterprise they can also edit the IP allowlist. Org admins see all org keys and can copy an owner list; org members see only their own keys.

#### Overview

Cards (click to filter Key safety):
- **No spend limit** — keys without a credit limit.
- **Never expires** — keys valid until removed.
- **Never used or idle 90+ days**.
- **Safe to remove** — idle keys with little/no lifetime usage.

Members with unlimited/non-expiring keys get a warning to set both. Recommendations: remove unused keys (confirm with owners, then archive), set a spend limit, review keys without expiration, **enforce a maximum key lifetime** (set in privacy settings; OpenRouter then rejects requests from keys that never expire or exceed the max lifetime, **including existing keys** and OAuth-consent keys; OpenRouter MCP keys are capped at 7 days by themselves; choose **No expiration** to allow any lifetime). Admins can **Copy owner list** (CSV of owners and key names).

#### Key safety tab

- Lists active keys (disabled/expired/archived hidden; management keys hidden unless **Show management keys**).
- Filters: search by name/label (admins: owner); risk **No limit** / **No expiry**; inactivity **Unused 30+** … **180+ days** or never used; owner or no recorded owner; **Safe to remove** only.
- **Risk** column: missing safeguards (No limit, No expiry, No limit or expiry); keys with limit ≥ $1,000 or expiration > 365 days out are also flagged; compounding risks sort higher.
- **Status** column: **Safe to remove**, **Review before removing**, **In use**.
- Actions per row: disable, archive, **Set limit** (if unlimited); bulk **Set limit / Disable / Archive**.
- Expiration of an existing key cannot be changed: create a new expiring key, migrate, then disable/archive the old one.
- **Disable** is reversible; **Archive** is permanent (type `archive` to confirm).

#### IP allowlist (Enterprise)

- Restricts which client IPs may send **inference** requests with the account's keys (all covered keys, including existing ones). Does **not** currently restrict management-key requests.
- Empty list = any IP accepted. With ≥ 1 entry, other IPs get `403 Forbidden`.
- Entries: single IPv4/IPv6 (e.g. `203.0.113.42`) or CIDR (e.g. `10.0.0.0/8`), optional label. Changes apply immediately. Remove all entries to disable.
- Before adding the first entry, include every server, office network and CI runner, or their requests start failing.
- Only personal accounts and org admins can edit.

Hardening checklist:
- [ ] Every key has a `limit` (and `limit_reset` if it should roll over).
- [ ] Every key has an `expires_at`; set a maximum key lifetime to enforce it account-wide.
- [ ] Idle 90+ day keys archived after owner confirmation.
- [ ] Management keys expire and are rotated by automation before expiry (10.5).
- [ ] Enterprise: IP allowlist populated with all egress IPs/CIDRs.
- [ ] Prefer WIF (10.4) over long-lived keys in CI/cloud workloads.
- API equivalents: API key audit and rotation cookbooks (`/docs/cookbook/administration/api-key-audit`, `/api-key-rotation`).

Sources: https://openrouter.ai/docs/guides/overview/auth/security-settings

### 10.7 BYOK (bring your own provider keys)

BYOK lets requests routed to a provider use **your** provider credential, giving you direct control of that provider's rate limits and costs. Keys are encrypted and used for all requests routed through that provider. Manage them in workspace BYOK settings (`https://openrouter.ai/integrations`; per-provider pages like `/settings/integrations/openai`) or via the BYOK management API (`/api/v1/byok`, management key; full schema in [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

#### Fees

- BYOK usage costs **5% of what the same model/provider would normally cost on OpenRouter**, deducted from OpenRouter credits.
- A plan-dependent free allowance applies, measured by list-price inference cost (not request count): Pay-as-you-go includes **$25,000 per month**; Enterprise allowances are custom. See the pricing page.

#### Key priority and fallback

Each key is in one section:
- **Prioritized** — tried in order **before** OpenRouter shared endpoints (unless the request sets `provider.order`).
- **Fallback** — tried, in order, only **after** OpenRouter endpoints.

Order: Prioritized keys (in order) → OpenRouter shared endpoints → Fallback keys. When a key fails (rate limit/error), OpenRouter falls through to the next matching key. If all keys fail, OpenRouter falls back to shared endpoints by default.

**Shared capacity fallback** (per prioritized key; controls what happens when the key can't serve — failed, or model outside the key's Models filter):

| UI setting | API fields | Behavior |
| - | - | - |
| Use shared capacity (default) | `is_required: false`, `is_byok_only: false` | Key first, then OpenRouter endpoints on failure. |
| Never use shared capacity for models this key applies to | `is_required: true` | Models in the key's filter (default All) never fall back to shared endpoints on this provider (possible rate-limit errors). Models outside the filter may still use shared capacity on this provider. |
| Never use shared capacity for any model on this provider | `is_byok_only: true` | Never spend OpenRouter credits on this provider. If no key allows the model or all fail, the provider is **skipped**. Other providers can still serve unless restricted (e.g. `provider.only`). |

API rules: both default `false` on create; omitted on update = unchanged. `is_byok_only` + `is_fallback: true` → `400` (same request or with stored flag). `is_required` and `is_byok_only` may both be true; `is_byok_only` wins.

#### BYOK with provider ordering

With `provider.order`, your order decides which provider goes first; within each named provider, your BYOK endpoint precedes shared capacity; unnamed providers follow (BYOK first, then shared).

Example: BYOK keys for Amazon Bedrock and Google Vertex, none for Anthropic.

```json
{ "provider": { "allow_fallbacks": true, "order": ["anthropic"] } }
```
Routing: 1) Anthropic (shared) 2) Bedrock (your key) 3) Vertex (your key) 4) Bedrock (shared) 5) Vertex (shared).

With `order: ["amazon-bedrock", "google-vertex", "anthropic"]`: 1) Bedrock (key) 2) Bedrock (shared) 3) Vertex (key) 4) Vertex (shared) 5) Anthropic (shared).

- A Fallback key keeps its behavior inside its slot: shared first, then your key.
- A **Never use shared capacity** key removes the shared endpoint from its slot.
- **Without `order`**: every provider with a prioritized key is tried on your key before any shared capacity; shared capacity follows in normal router order. To put a specific provider first regardless of keys, name it in `order`.

#### BYOK and regional endpoints

- Region-pinned endpoints (e.g. `amazon-bedrock/us`, `google-vertex/europe-west1`) carry a premium. For **closed-weight** models, the global API (`openrouter.ai`) skips them unless targeted via `provider.order`/`provider.only` ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). Open-weight models' regional endpoints stay in default routing.
- A **prioritized** BYOK key can route to a closed-weight model's regional endpoint only if the provider has **no** standard-priced endpoint for it (premium billed to your provider account). If both exist, your key goes to the standard one. Fallback keys never unlock regional endpoints.
- Regional APIs (`us.openrouter.ai`, `eu.openrouter.ai`) route in-region by design (10.18).

#### BYOK with data policies

Your provider/account/guardrail data policies still apply to BYOK endpoints — a key changes the credential, not the eligible endpoint set. A BYOK key does not exempt a provider from `data_collection` restrictions, nor (by default) from ZDR. With ZDR enforced (`provider.zdr`, account settings or guardrail), an endpoint that retains prompts stays blocked even with your key — unless the key declares ZDR.

**Declaring ZDR on a key** (key card → **Provider agreement** → **Zero data retention**; API `declared_zdr`):

| Option | API value | Effect under ZDR enforcement |
| - | - | - |
| Use OpenRouter's default (default) | `null` | Follows OpenRouter's tracked policy for the endpoint. |
| My account has ZDR | `true` | Requests through this key are treated as ZDR, even if the shared endpoint retains. |
| My account does not have ZDR | `false` | Treated as retaining; blocked under ZDR even if the shared endpoint is ZDR. |

Rules:
- Self-attested, not verified. Affects retention only; `data_collection` (training) still follows OpenRouter's endpoint policy.
- Judged per key (two keys, one declared → only that one passes ZDR).
- Prioritized and Fallback keys both count: if the shared endpoint retains and a key declares ZDR, the shared endpoint is removed and your key's copy stays eligible (a Fallback copy still ranks behind other providers' ZDR endpoints; with `allow_fallbacks: false` only the endpoint that led the pool before your key was added is used).
- Applies only when the key's **This key applies to** filters match.
- Fallback-key limit: if a Prioritized key for the same provider has no declaration and **Never use shared capacity for models this key applies to**, shared capacity is removed and the Fallback key isn't used → ZDR error if no other ZDR endpoint remains.
- Private endpoints keep their recorded data policy.
- Also covers **Safety Retention**: a ZDR-declared key is treated as ZDR even under **ZDR only** — declare only if your agreement excludes the provider's safety retention.
- To use a provider only via your key under ZDR, also set **Never use shared capacity for any model on this provider**.
- **Video generation is never covered**: every video endpoint is treated as retaining; a ZDR guardrail blocks video models on your key too.

**Declaring a data region on a key** (OpenAI, Azure, Anthropic keys; API `declared_region` = `global` | `europe` | `us` | `null`):

| Option | Hostname | Effect |
| - | - | - |
| Global (default) | `openrouter.ai` | Follows the region OpenRouter tracks for the endpoint (same as undeclared). |
| European Union | `eu.openrouter.ai` | Requests to `eu.openrouter.ai` may use this key for that provider's model even without an in-region record for the shared endpoint. |
| United States | `us.openrouter.ai` | Same for `us.openrouter.ai`. |

Anthropic keys offer only Global and United States. Rules:
- Self-attested. For OpenAI it also routes the key to the matching OpenAI regional API host; for Anthropic a US declaration adds `inference_geo: "us"` to qualifying requests (10.18). Regional domains still require a plan with in-region routing.
- Doesn't change key priority: keys that can't serve the request's region are removed, the rest tried in configured order. On `openrouter.ai`, Global/EU/US keys are all eligible.
- **OpenAI and Azure keys require a matching declaration on regional domains** — an undeclared/Global OpenAI or Azure key is never used on `eu.`/`us.openrouter.ai`.
- Judged per key; Prioritized/Fallback both count (declared Prioritized ranks ahead of eligible shared endpoints; declared Fallback behind). Same Fallback-key limitation as ZDR → data region error.
- OpenAI regional keys are pinned to their host: a US key serves `openrouter.ai` and `us.openrouter.ai`, not `eu.`; EU is the inverse; a Global OpenAI key uses `api.openai.com` and never satisfies a regional request.
- Applies only when filters match; doesn't change retention policy (ZDR still needs a ZDR declaration/endpoint).
- Takes effect within a few minutes (short-lived per-account cache).
- API: omit `declared_region` on update to keep it; `null` clears. For OpenAI and Fireworks the value must match the region in the key material — change it by sending a key with that region.
- Not honored (fails closed) for: private endpoints; endpoints OpenRouter pins to a cloud region outside the declared one (e.g. a shared US Bedrock/Azure endpoint when you declare EU); cross-region inference profiles (Bedrock `global.`); video models.
- Guardrails with `allowed_data_regions` don't yet recognize declarations — under such a guardrail your key's endpoint for an out-of-region shared endpoint is still removed.

#### BYOK and budgets

- **Guardrail budgets**: BYOK spend is **not** counted by default. Enable **Include BYOK spend** (API `include_byok_in_budgets: true`) — then the amount OpenRouter *would have charged* is added. Works on all guardrail budgets including the workspace default; no effect without a budget limit.
- **Workspace budgets**: same default (not counted); enable **Include BYOK spend** or `include_byok_in_budgets: true` on the workspace budget endpoint; applies to every interval at once.
- **Key credit limits**: `include_byok_in_limit` on the key (10.5, 10.20).

#### Multiple keys, filters, names

- Multiple keys per provider are supported; each matching key produces its own endpoint copy pinned to that key for the request lifecycle. Example with OpenAI keys (Prioritized: First, Second; Fallback: Backup) → First → Second → OpenRouter endpoints → Backup.
- **This key applies to** filters (all active filters must match; none = available to all):

| UI filter | API field | Type | Semantics |
| - | - | - | - |
| Model filter | `allowed_models` | `string[] \| null` | Model slug allowlist, e.g. `["openai/gpt-4o"]`; `null` = no restriction |
| API key filter | `allowed_api_key_hashes` | `string[] \| null` | OpenRouter key `hash` allowlist; `null` = no restriction |
| Member filter | `allowed_user_ids` | `string[] \| null` | User (Clerk) ID allowlist; `null` = no restriction |

- Each accepts ≤ 100 entries. **Create**: omitted = no restriction. **Update**: omitted = unchanged; `null` clears; array replaces.
- `allowed_api_key_hashes` validation: strings of exactly 64 lowercase hex chars; ≤ 100; `[]` rejected with `400` (use `null`); every hash must be a live key owned by your account (else `400`).
- Optional key **name** (e.g. "Production", "Team A").

```bash
# Create a restricted BYOK credential
curl -X POST https://openrouter.ai/api/v1/byok \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "key": "'"$OPENAI_API_KEY"'",
    "name": "Production GPT-4o Key",
    "allowed_models": ["openai/gpt-4o", "openai/gpt-4o-mini"],
    "allowed_api_key_hashes": ["f01d52606dc8f0a8303a7b5cc3fa07109c2e346cec7c0a16b40de462992ce943"],
    "allowed_user_ids": ["user_2abc123"]
  }'

# Clear the API-key restriction
curl -X PATCH https://openrouter.ai/api/v1/byok/11111111-2222-3333-4444-555555555555 \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"allowed_api_key_hashes": null}'

# Never use shared capacity on this provider
curl -X PATCH https://openrouter.ai/api/v1/byok/11111111-2222-3333-4444-555555555555 \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"is_byok_only": true}'
```

Read-back shape (`GET /api/v1/byok/{id}`): `id`, `provider`, `workspace_id`, `label` (masked, e.g. `sk-...AbCd`), `name`, `disabled`, `is_fallback`, `is_required`, `is_byok_only`, `allowed_models`, `allowed_api_key_hashes`, `allowed_user_ids`, `sort_order`, `created_at` (plus `declared_zdr`, `declared_region` per the spec). The raw `key` is write-only and never returned. Create body fields: `provider` (required slug, e.g. `openai`, `anthropic`, `amazon-bedrock`), `key` (required), `name`, `disabled`, `is_fallback`, `is_required`, `is_byok_only`, `allowed_*`, `declared_zdr`, `declared_region`, `workspace_id` (default workspace if omitted; `400` if that was deleted).

Combining filters example — Key A: OpenAI, `allowed_models: ["openai/gpt-4o"]`, `is_required: true`; Key B: OpenAI, no filter. `openai/gpt-4o` → Key A then Key B (no shared capacity); `openai/gpt-4o-mini` → Key B, then shared capacity.

#### Provider-specific credential formats

**Azure** — two resource types: Azure AI Foundry (`*.services.ai.azure.com`, model catalog, no per-model deployments) and Azure OpenAI (`*.openai.azure.com`, per-model deployments).

Foundry configuration (recommended; works for all models in the resource):

```json
[
  { "api_key": "your-azure-api-key", "resource_name": "your-resource-name", "resource_type": "ai_foundry" }
]
```
- `api_key`: from "Keys and Endpoint" in the Azure portal. `resource_name`: subdomain of the endpoint. `resource_type`: `"ai_foundry"` or `"openai"` (default `"openai"`).

Per-deployment configuration (legacy):

```json
[
  {
    "model_slug": "openai/gpt-5.2",
    "endpoint_url": "https://example-project.openai.azure.com/openai/deployments/gpt-5.2/chat/completions?api-version=2024-08-01-preview",
    "api_key": "your-azure-api-key",
    "model_id": "gpt-5.2"
  }
]
```
- Requires `endpoint_url` (full URL including `/chat/completions` and API version), `api_key`, `model_id` (deployment name), `model_slug` (OpenRouter model ID). Foundry and per-deployment entries can be mixed; per-deployment wins when the slug matches.
- In-region: create the resource in a region inside your data region, use regional (not global) deployment types, and declare the key's Data region (10.18).

**AWS Bedrock**
- Option 1 (recommended): a **Bedrock API key** as a plain string. Tied to one AWS region; can't change regions.
- Option 2: AWS credentials JSON (lets you choose region):

```json
{ "accessKeyId": "your-aws-access-key-id", "secretAccessKey": "your-aws-secret-access-key", "region": "us-east-1" }
```
- IAM needs `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` (streaming); use a dedicated least-privilege IAM user.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], "Resource": "*" }
  ]
}
```

**Google Vertex AI** — service account key JSON (standard fields) plus optional `region`:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service-account@your-project.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com",
  "region": "global"
}
```
- `region`: `"global"` (any region) or a location like `"us-central1"` / `"europe-west1"`. A `"global"`/empty region doesn't pin: if routed to a regional endpoint (e.g. on `us.openrouter.ai`) that endpoint's region is used. A specific region always wins.
- Permissions: `aiplatform.endpoints.predict` (sync), `aiplatform.batchPredictionJobs.*` (Batch API uses `create`, `get`); `roles/aiplatform.user` covers both.
- **Vertex Batch storage** (Batch API only; sync requests ignore it): default is bucketless — omit `bucket` and OpenRouter creates `or-batch-<project>-<region>` on the first batch per region (uniform bucket-level access, public access prevention, 30-day lifecycle, soft delete disabled). Production custom role at project scope: `storage.buckets.create|get|list`, `storage.objects.create|get|list|delete` (`roles/storage.admin` also works but is broader). To manage storage yourself set `bucket` to a name or `gs://` URI (object paths like `gs://bucket/prefix` rejected; must be in the key's project) and grant the key SA object read/write + bucket get/list, and the project's Vertex AI service agent (`service-<PROJECT_NUMBER>@gcp-sa-aiplatform.iam.gserviceaccount.com`) object + bucket metadata access; create the agent first if missing: `gcloud beta services identity create --service=aiplatform.googleapis.com --project=YOUR_PROJECT`.

**OpenAI (data-residency projects)** — enter the key as JSON with `region` (`eu` | `us`) to use `https://eu.api.openai.com` / `https://us.api.openai.com`; a plain string key is a Global project (`api.openai.com`):

```json
{ "api_key": "sk-...", "region": "eu" }
```

**Anthropic** — declare **United States** on the key for `inference_geo: "us"` (10.18). **Baseten** — regional dedicated deployments are added as private endpoints (10.18, [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

#### Debugging BYOK

1. Activity page → open the generation → **View Raw Metadata**.
2. Inspect `provider_responses` (array of each provider attempt with provider name and HTTP status; also returned by `GET /api/v1/generation`).

| Status | Typical cause |
| - | - |
| 400 | Request/model/key configuration invalid for the provider |
| 401 | Provider key invalid or revoked |
| 403 | Missing permissions — Bedrock `bedrock:InvokeModel(WithResponseStream)`, model not enabled in that AWS region; Vertex `aiplatform.endpoints.predict` / `aiplatform.batchPredictionJobs.*` |
| 429 | Your provider account's rate limit |
| 500 | Provider-side error (usually transient) |

Test permissions by invoking the model directly in the provider console. Router metadata (`X-OpenRouter-Metadata: enabled`, 10.13) shows `is_byok` and per-attempt statuses.

Gotchas:
- BYOK spend bypasses guardrail/workspace budgets and key limits unless each layer's BYOK toggle is on.
- `is_byok_only` can make a provider disappear from routing (skipped) rather than error — pair with `provider.only` if you need a hard failure.
- An OpenAI/Azure key without a matching Data region declaration is never used on regional domains.
- ZDR/region declarations are your legal attestation; OpenRouter routes on them without verification.
- `usage.is_byok` in responses tells you whether your key served the request.

Sources: https://openrouter.ai/docs/guides/overview/auth/byok, https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/api/api-reference/byok/create-a-byok-provider-credential, OpenAPI spec (`/byok`)

### 10.8 Prompt caching (provider-side)

Prompt caching reuses a provider's cached prefix to cut input cost and prefill latency. Most providers cache **automatically**; some (Anthropic explicit mode, Alibaba, Gemini explicit) need per-block `cache_control`. OpenRouter adds **provider sticky routing** to keep caches warm. This is distinct from OpenRouter **response** caching (10.9); both can be used together.

#### Provider sticky routing

- After a request that used prompt caching, OpenRouter remembers which provider served it and routes later requests **for the same model** to that provider.
- Activates only when that provider's cache-read price is cheaper than its regular prompt price.
- If the sticky provider is unavailable, it falls back to the next-best provider.
- **Disabled when you set `provider.order`** (your explicit order wins).
- Sticky sessions expire after **10 minutes** of inactivity; each successful request resets the timer; a provider error does not update the pin (the next request can re-route).
- Granularity: per account, per model, per conversation. Default conversation key = hash of the first system/developer message + the first non-system message, so different conversations stick to different providers (better load-balancing).
- Auto Exacto ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) can move tool-calling requests off the pinned provider.

**`session_id`** — explicit sticky key:

| Input | Where | Notes |
| - | - | - |
| `session_id` | top-level request body (Chat Completions, Responses, Messages) | Wins if both body and header are set. ≤ 256 chars. |
| `x-session-id` | HTTP header | Same key; the only input on non-chat endpoints (below). |
| `prompt_cache_key` | request body (OpenAI-style) | Used as the sticky key when neither of the above is set. |

With `session_id`, stickiness starts on the **first successful request** (before any cache hit is observed); without it, only after a cache hit. With router models (Auto Router, Pareto Router), stickiness also tries to reuse the **resolved model** while it stays in the current candidate set (best-effort; otherwise the router may pick a different model).

```json
{
  "model": "anthropic/claude-sonnet-5.5",
  "session_id": "my-agent-session-abc123",
  "messages": [{ "role": "user", "content": "Continue our conversation..." }]
}
```

**Session grouping across modalities**: `session_id` also groups requests in the Logs → Sessions view (`https://openrouter.ai/logs?tab=sessions`). Chat and Responses accept body `session_id` or `x-session-id`; embeddings, rerank, STT, TTS, image and video generation accept only the `x-session-id` header (grouping only, no sticky routing). The Batch API does not yet group by `session_id`. Generation records expose `session_id`.

#### Inspecting cache usage

1. Activity page → generation detail.
2. `GET /api/v1/generation?id=...` — includes `cache_discount` (amount saved by caching; Anthropic cache writes produce a negative discount, reads a positive one) and `native_tokens_cached`.
3. `usage` on every response:

```json
{
  "usage": {
    "prompt_tokens": 10339,
    "completion_tokens": 60,
    "total_tokens": 10399,
    "prompt_tokens_details": { "cached_tokens": 10318, "cache_write_tokens": 0 }
  }
}
```

- `cached_tokens` — tokens read from cache (hit). `cache_write_tokens` — tokens written (appears when establishing a cache entry; per the spec only returned for models with explicit caching and cache-write pricing).
- Chat Completions: `usage.prompt_tokens_details`; Responses: `usage.input_tokens_details`.

#### Per-provider summary

Multipliers are relative to the model's normal input price.

| Provider | Mode | Cache write | Cache read | Config / notes |
| - | - | - | - | - |
| OpenAI (automatic) | Automatic | Free before GPT-5.6; **1.25x** on GPT-5.6+ (no opt-in) | 0.25x or 0.50x (model-dependent) | Min prompt 1024 tokens |
| OpenAI (explicit, GPT-5.6+) | `prompt_cache_breakpoint` + `prompt_cache_options` | 1.25x (30m TTL, default); **2.5x** (12h TTL) | Model's cache-read rate (any TTL) | Chat Completions and Responses |
| Grok | Automatic | Free | 0.25x | — |
| Moonshot AI | Automatic | Free | 0.25x | — |
| Groq | Automatic | Free | 0.5x | Currently Kimi K2 models |
| Alibaba Qwen | Explicit `cache_control` | 1.25x | 0.1x | 5-minute TTL; models listed below |
| Anthropic Claude | Automatic (top-level `cache_control`) or explicit per-block | **1.25x** (5m TTL), **2x** (1h TTL) | **0.1x** | ≤ 4 explicit breakpoints; per-model minimum length |
| DeepSeek | Automatic | 1x (same as input) | 0.1x | — |
| Z.AI | Automatic | Free (listed as limited-time free) | Discounted rate on model page (~0.2x) | OpenRouter sends a session affinity key (account + `session_id`) |
| Google Gemini (implicit) | Automatic, Gemini 2.5+ | Free (no storage cost) | 0.25x | TTL avg 3–5 min; min 1024 (2.5 Flash) / 4096 (2.5 Pro) |
| Google Gemini (explicit) | `cache_control` breakpoints | Input price + 5 min of storage | 0.25x | 5-min TTL, not refreshed; only the **last** breakpoint is used |

#### OpenAI

- Automatic caching needs no configuration; minimum prompt size 1024 tokens.
- **Explicit prompt caching** (GPT-5.6 and newer only), on Chat Completions and Responses:
  - `prompt_cache_breakpoint` on a text block (`input_text` in Responses, `text` in Chat): `{ "mode": "explicit", "ttl"?: "30m" | "12h" }`. Marks the end of a reusable prefix (everything through that block is the candidate cached prefix). Automatic caching stays on.
  - `prompt_cache_options` at the request root: `{ "mode": "explicit", "ttl"?: "30m" | "12h" }`. `mode: "explicit"` **disables OpenAI-managed breakpoints** so only marked blocks are cached; `ttl` is the minimum lifetime for every breakpoint the request writes (default `30m`). A block-level `ttl` overrides it for that boundary.
  - Tokens written with a 12h TTL bill at the 12h write rate; the rest at the 30m rate; both are counted in `cache_write_tokens`.

```json
{
  "model": "openai/...",
  "prompt_cache_key": "my-session-key",
  "prompt_cache_options": { "mode": "explicit", "ttl": "30m" },
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "<REUSABLE_PREFIX>", "prompt_cache_breakpoint": { "mode": "explicit" } },
        { "type": "input_text", "text": "<TASK_SPECIFIC_SUFFIX>" }
      ]
    }
  ]
}
```

Chat Completions with a 12-hour system prompt and a 30-minute conversation prefix:

```json
{
  "model": "openai/...",
  "prompt_cache_options": { "mode": "explicit", "ttl": "30m" },
  "messages": [
    {
      "role": "system",
      "content": [
        { "type": "text", "text": "<SHARED_INSTRUCTIONS_AND_TOOLS>", "prompt_cache_breakpoint": { "mode": "explicit", "ttl": "12h" } }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "<CONVERSATION_SO_FAR>", "prompt_cache_breakpoint": { "mode": "explicit" } }
      ]
    }
  ]
}
```

**Disabling caching per request** (GPT-5.6+, to avoid the 1.25x write charge on one-off prompts ≥ 1024 tokens): set `prompt_cache_options.mode: "explicit"` and mark **no** blocks. Billed at the plain input rate; `cache_write_tokens` reads `0`. Prompts under 1024 tokens are never cached; pre-5.6 models have no write cost, so nothing to disable.

```json
{ "model": "openai/...", "prompt_cache_options": { "mode": "explicit" }, "messages": [{ "role": "user", "content": "<ONE_OFF_PROMPT>" }] }
```

**Cross-provider translation**: a text block with Anthropic-style `cache_control` gets a `prompt_cache_breakpoint` when routed to a supporting OpenAI model; a block with `prompt_cache_breakpoint` gets a default (5-minute) `cache_control` when routed to Anthropic or Google. TTLs are **not** translated (dropped in both directions), and `prompt_cache_options` stays OpenAI-only.

#### Alibaba Qwen

Requires explicit breakpoints (`cache_control: { "type": "ephemeral" }`, same syntax as Anthropic); writes use a 5-minute TTL. Available on `deepseek/deepseek-v3.2`, `qwen/qwen3-max`, `qwen/qwen-plus`, `qwen/qwen3.6-plus`, `qwen/qwen3-coder-plus`, `qwen/qwen3-coder-flash`. Snapshot endpoints (e.g. `qwen/qwen3.5-plus-02-15`, `qwen/qwen3.5-flash-02-23`) don't support explicit caching.

```json
{
  "model": "qwen/qwen3-coder-plus",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Use the reference below when answering." },
      { "type": "text", "text": "HUGE TEXT BODY", "cache_control": { "type": "ephemeral" } },
      { "type": "text", "text": "Summarize the main implementation details." }
    ]
  }]
}
```

#### Anthropic Claude

Two modes:
- **Automatic caching** — one top-level `cache_control`; the breakpoint is applied to the last cacheable block and advances as the conversation grows. Best for multi-turn. Supported on the Anthropic, Google Vertex AI, Azure and Amazon Bedrock providers, and Claude Platform on AWS (on Bedrock OpenRouter translates it into a trailing cache breakpoint, since Bedrock InvokeModel doesn't accept the top-level field).
- **Explicit breakpoints** — `cache_control` on individual content blocks; **max 4**; reserve for large bodies (character cards, CSV, RAG data, book chapters). Works across all Anthropic-compatible providers including Bedrock and Vertex.

`cache_control` shape: `{ "type": "ephemeral", "ttl"?: "5m" | "1h" }`. Default TTL 5 minutes; `"ttl": "1h"` gives 1 hour (2x write cost vs 1.25x, but avoids repeated writes over long sessions; 1h is supported on Anthropic, Bedrock and Vertex).

**Responses API**: supports automatic caching via top-level `cache_control` only; Anthropic-style per-block `cache_control` inside `input` is not exposed — use `prompt_cache_breakpoint` (converted to a default `cache_control` when routed to Anthropic/Google; carries no TTL). To set a TTL, use Chat Completions or the Anthropic Messages API.

Minimum cacheable prompt length (shorter prompts aren't cached):

| Minimum | Models |
| - | - |
| 512 tokens | Claude Fable 5.1, Claude Opus 5.5, Claude Opus 5, Claude Sonnet 5.5, Claude Fable 5, Claude Haiku 5.5 |
| 1,024 tokens | Claude Opus 4.8, Claude Sonnet 5, Claude Sonnet 4.6, Claude Sonnet 4.5, Claude Opus 4.1, Claude Opus 4, Claude Sonnet 4 |
| 2,048 tokens | Claude Opus 4.7, Claude Haiku 3.5 |
| 4,096 tokens | Claude Opus 4.6, Claude Opus 4.5, Claude Haiku 4.5 |

**Batch API**: breakpoints work on Anthropic `:batch` endpoints, but lines in one batch may run concurrently/out of order, so a cache written by one line isn't guaranteed visible to others. Use `"ttl": "1h"` breakpoints on a shared prefix reused across successive batches (or warm the cache with a sync request first).

```json
// Automatic (recommended for multi-turn)
{
  "model": "~anthropic/claude-sonnet-latest",
  "cache_control": { "type": "ephemeral" },
  "messages": [
    { "role": "system", "content": "You are a historian studying the fall of the Roman Empire. You know the following book very well: HUGE TEXT BODY" },
    { "role": "user", "content": "What triggered the collapse?" }
  ]
}
```

```json
// Automatic with 1-hour TTL
{ "model": "~anthropic/claude-sonnet-latest", "cache_control": { "type": "ephemeral", "ttl": "1h" }, "messages": [ /* ... */ ] }
```

```json
// Explicit breakpoint (system message, default 5-minute TTL)
{
  "messages": [
    {
      "role": "system",
      "content": [
        { "type": "text", "text": "You are a historian studying the fall of the Roman Empire. You know the following book very well:" },
        { "type": "text", "text": "HUGE TEXT BODY", "cache_control": { "type": "ephemeral" } }
      ]
    },
    { "role": "user", "content": [{ "type": "text", "text": "What triggered the collapse?" }] }
  ]
}
```

```json
// Explicit breakpoint (user message, 1-hour TTL)
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Given the book below:" },
      { "type": "text", "text": "HUGE TEXT BODY", "cache_control": { "type": "ephemeral", "ttl": "1h" } },
      { "type": "text", "text": "Name all the characters in the above book" }
    ]
  }]
}
```

#### Google Gemini

- **Implicit caching** (Gemini 2.5+): automatic, no breakpoints, no write/storage cost, reads 0.25x. TTL averages 3–5 minutes (varies). Minimum 1024 tokens (2.5 Flash) / 4096 (2.5 Pro). Keep the start of the message array stable; push variable content (user questions, dynamic context) to the end.
- **Explicit caching via `cache_control`** (insert breakpoints in message content, like Anthropic): write cost = `Input token price + (Cache storage price × (5 minutes / 60 minutes))`; reads 0.25x; 5-minute TTL that does **not** refresh. Typically a 4096-token minimum (2.5 Pro 4096, 2.5 Flash 1024). Cached tokens count toward the model's max token usage. OpenRouter creates/updates/deletes caches and manages names/TTL for you. Only certain Gemini models support it (see Google's pricing docs).
- Any number of breakpoints is allowed, but OpenRouter uses only the **last** one for Gemini (multiple are fine for Anthropic compatibility).
- Gemini's single `systemInstruction` is immutable in cached content: `cache_control` inside the first `system`/`developer` message caches the normalized system prompt but cannot keep an uncached dynamic tail in that same message — put dynamic content in a later `user` message.

#### DeepSeek, Grok, Moonshot, Groq, Z.AI

Automatic; no configuration. Z.AI cache reads appear in `prompt_tokens_details.cached_tokens`; pass `session_id` to keep multi-turn sessions on the same Z.AI cache.

Gotchas:
- Byte-identical prefixes: system prompt, tool definitions, repository maps first; timestamps/dynamic data last.
- Changing the model slug (even adding `:nitro`) or setting `provider.order` breaks stickiness.
- Changing request-level reasoning effort alters the prefix and invalidates caches — use mid-conversation effort updates instead (10.10).
- Anthropic cache writes cost more than plain input; caching one-off prompts loses money. Same for OpenAI GPT-5.6+ automatic caching on prompts ≥ 1024 tokens — disable with explicit mode.
- Anthropic: at most 4 explicit breakpoints. Gemini: only the last breakpoint counts.
- In-memory provider caching is not considered "retention" for ZDR purposes (10.17).

Sources: https://openrouter.ai/docs/guides/best-practices/prompt-caching, https://openrouter.ai/docs/guides/best-practices/latency-and-performance, OpenAPI spec (`PromptCacheOptions`, `PromptCacheBreakpoint`, `AnthropicCacheControlDirective`, `ChatUsage`, `/generation`)

### 10.9 Response caching (OpenRouter-side)

OpenRouter can return a stored response for an **identical** request with no provider call and **no billing** (all billable usage counters are `0`). It is model-agnostic: it works for every model/provider on the supported endpoints because it runs before the request is forwarded; no provider support needed.

- Streaming and non-streaming are both eligible (cached separately). Streams are replayed through the same pipeline; each chunk's `id`, `created`, and the `X-Generation-Id` header identify the new cache-hit generation.
- Only `200 OK` responses are cached. Errors, rate limits and partial results never are. Tool-call responses are cached normally.

#### Enabling

1. **Per request**: header `X-OpenRouter-Cache: true`.
2. **Via a preset** (10.15): `cache_enabled: true` (+ optional `cache_ttl_seconds`, 1–86400, default 300). Every request referencing that preset is cached without headers.

```json
{ "name": "cached-tests", "cache_enabled": true, "cache_ttl_seconds": 600 }
```

Per-request header examples (add `X-OpenRouter-Cache-TTL: <seconds>` to change the 300 s default):

```bash
curl -i https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-OpenRouter-Cache: true" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "input": "What is the meaning of life?"
  }'
```

```python
# Python (OpenAI SDK)
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

response = client.responses.create(
    extra_headers={
        "X-OpenRouter-Cache": "true",
    },
    model="google/gemini-2.5-flash",
    input="What is the meaning of life?",
)
```

```typescript
// TypeScript (OpenAI SDK): caching on for every request from this client
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'X-OpenRouter-Cache': 'true',
  },
});

const response = await openai.responses.create({
  model: 'google/gemini-2.5-flash',
  input: 'What is the meaning of life?',
});
```

#### Request headers

| Header | Value | Effect |
| - | - | - |
| `X-OpenRouter-Cache` | `true` | Enable for this request |
| `X-OpenRouter-Cache` | `false` | Disable for this request (overrides a preset that enables it) |
| `X-OpenRouter-Cache-TTL` | seconds | TTL 1–86400 (default 300). Not starting with digits → ignored (falls through to preset/default); `60abc` → 60; `1.5` → 1; out-of-range values clamped to `[1, 86400]`. |
| `X-OpenRouter-Cache-Clear` | `true` | Delete the entry for this cache key, call the provider, store the new response (TTL from this request's header → preset → default). Only works when caching is enabled for the request; clears only the matching entry. |

#### Response headers

| Header | Value | Notes |
| - | - | - |
| `X-OpenRouter-Cache-Status` | `HIT` \| `MISS` | |
| `X-OpenRouter-Cache-Age` | seconds | HIT only |
| `X-OpenRouter-Cache-TTL` | seconds | Remaining TTL on HIT; full TTL on MISS |
| `X-OpenRouter-Cache-Source-Id` | generation id | HIT only: the generation that populated the entry |
| `X-Generation-Id` | generation id | Always present (not cache-specific); unique per hit |

Miss → `X-OpenRouter-Cache-Status: MISS`, `X-OpenRouter-Cache-TTL: 300`, billed normally. Hit → e.g. `HIT`, `X-OpenRouter-Cache-Age: 12`, `X-OpenRouter-Cache-TTL: 288`, `X-Generation-Id: gen-def456`, `X-OpenRouter-Cache-Source-Id: gen-abc123`; body `id: "gen-def456"` with `usage` all zeros. The generation record exposes `response_cache_source_id`.

#### Cache key and scope

- Key = **API key** + **model** + **endpoint type** + **streaming mode** + **SHA-256 of the normalized request body**.
- Whitespace is normalized, but **JSON property order matters** (`{"model":"x","input":[]}` ≠ `{"input":[],"model":"x"}`); omitting an optional field vs sending its default (`temperature: 1.0`) gives different keys.
- Attribution headers (`HTTP-Referer`, `X-Title`) and provider-specific headers are **not** part of the key.
- Multimodal bodies (base64 images/audio/video/files) are hashed in full and are cacheable.
- Scoped to the API key: different keys (even same org) don't share; rotating a key starts with an empty cache.
- Stochastic params are irrelevant on hits (responses are returned verbatim regardless of `temperature`).

#### Precedence

1. Preset `cache_enabled: false` → disabled; no header can override.
2. `X-OpenRouter-Cache: false` → disabled even if the preset enables it.
3. `X-OpenRouter-Cache: true` → enabled when the preset doesn't configure caching (`cache_enabled` absent).
4. `X-OpenRouter-Cache-TTL` overrides preset `cache_ttl_seconds` (default 300).
5. Neither header nor preset → off.

#### Supported endpoints

| Endpoint | Format | Zeroed usage fields on HIT |
| - | - | - |
| `/api/v1/chat/completions` | OpenAI Chat Completions | `prompt_tokens`, `completion_tokens`, `total_tokens` |
| `/api/v1/responses` | OpenAI Responses | `input_tokens`, `output_tokens`, `total_tokens` |
| `/api/v1/messages` | Anthropic Messages | `input_tokens`, `output_tokens` |
| `/api/v1/embeddings` | OpenAI Embeddings | `prompt_tokens`, `total_tokens` |

Cache keys include an endpoint discriminator (identical bodies on different endpoints don't collide).

#### Billing, limits, retention

- Hits are free and don't count toward provider rate limits. Only the populating MISS is billed.
- **No request coalescing**: identical concurrent requests that arrive before the first is stored are both MISS and both billed.
- **Disabled under account-level ZDR** (caching temporarily stores response data). Per-request `provider.zdr` does not affect eligibility.
- Entries may be evicted before TTL under memory pressure; no entry-count limit.
- Stored in edge infrastructure for at most the TTL; only the enabling API key can read them; not used for training or shared.
- Cache hits never include `openrouter_metadata` (10.13).
- The Activity log marks cached entries (each hit is its own entry) and can filter cached / non-cached.

Use cases: resuming failed agent workflows without re-paying earlier identical steps (an evicted step simply runs again); repeatable, zero-cost unit tests (use `temperature: 0` or a fixed `seed` for determinism after a miss); repeated identical requests.

Gotchas:
- Serialize request bodies deterministically (stable key order) or you'll miss.
- Don't use for requests that must be fresh unless you send `X-OpenRouter-Cache-Clear: true` or use a short TTL.
- `X-OpenRouter-Cache-Clear` without caching enabled does nothing.
- Provider prompt caching (10.8) is separate and still applies on misses.

Sources: https://openrouter.ai/docs/guides/features/response-caching, OpenAPI spec (`/generation`)

### 10.10 Reasoning tokens

Reasoning ("thinking") tokens are **output tokens** and billed as such; on most providers they also count against the output limit. They're returned by default when the model emits them (some models, like the OpenAI o-series, don't return them). On **Responses** they appear as `reasoning` items in `output`; on **Chat Completions** as `message.reasoning` (string) and `message.reasoning_details` (array). OpenRouter normalizes the different provider controls into one `reasoning` parameter.

#### The `reasoning` parameter

```jsonc
{
  "model": "your-model",
  "input": "...",
  "reasoning": {
    "effort": "high",        // OR max_tokens — never both
    // "max_tokens": 2000,
    // "enabled": true,      // reasoning with defaults
    // "exclude": true,      // Chat Completions only
    // "summary": "auto",
    // "context": "all_turns", // OpenAI GPT-5.6+
    // "mode": "pro"           // OpenAI GPT-5.6+ on OpenAI/Azure
  }
}
```

| Field | Type / values | APIs | Description |
| - | - | - | - |
| `effort` | `max` \| `xhigh` \| `high` \| `medium` \| `low` \| `minimal` \| `none` | Chat, Responses | OpenAI-style effort. Native on OpenAI reasoning models (o1, o3, GPT-5 series) and Grok; translated for others. `none` disables reasoning. |
| `max_tokens` | integer | Chat, Responses | Anthropic-style reasoning budget. Native on Gemini thinking models, Anthropic, some Alibaba Qwen (mapped to `thinking_budget`). For effort-only models it's converted to an effort level. **Can't be combined with `effort`** (or top-level `reasoning_effort`) → rejected with "Only one of "reasoning.effort" and "reasoning.max_tokens" can be specified". |
| `enabled` | boolean | Chat, Responses | `true` enables reasoning at **medium** effort with no exclusion. Default is inferred from `effort`/`max_tokens`. |
| `exclude` | boolean | **Chat only** | Model still reasons (billed; counts toward `max_tokens`) but reasoning is omitted from the response. The Responses API ignores it — filter `reasoning` items client-side. |
| `summary` | `auto` \| `concise` \| `detailed` \| null | Chat, Responses (spec) | Reasoning summary verbosity. |
| `context` | `auto` \| `all_turns` \| `current_turn` | OpenAI GPT-5.6+ | Which echoed reasoning the model may use. |
| `mode` | `standard` \| `pro` | OpenAI GPT-5.6+ via OpenAI/Azure | `pro` routes to the `*-pro` variant. |

Chat Completions also accepts top-level **`reasoning_effort`** (same enum) as shorthand for `reasoning.effort`; it can't differ from `reasoning.effort` if both are sent.

> Spec note: the OpenAPI `ChatRequest.reasoning` schema lists only `effort`, `max_tokens`, `summary`; `enabled` and `exclude` come from the guide. The Responses `ReasoningConfig` lists `effort`, `max_tokens`, `enabled`, `summary`, `context`, `mode`.

**Effort → reasoning share of the output limit** (`max_output_tokens`, or `max_tokens` on Chat): `max` ≈ 95%, `xhigh` ≈ 95%, `high` ≈ 80%, `medium` ≈ 50%, `low` ≈ 20%, `minimal` ≈ 10%, `none` = off. Models that only take `max_tokens` get a budget computed from these ratios.

#### Examples

**Basic usage (Responses API).** Raw reasoning arrives in a `reasoning` item's `content`; OpenAI models return a summary in `summary` instead, so read both.

```typescript
// TypeScript SDK
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const response = await openRouter.responses.send({
  responsesRequest: {
    model: 'openai/o3',
    input: "How would you build the world's tallest skyscraper?",
    reasoning: {
      effort: 'high',
      summary: 'detailed',
    },
    stream: false,
  },
});

if (!('output' in response)) {
  throw new Error('Expected a non-streaming response');
}

const reasoning = [...response.output].reverse().find((item) => item.type === 'reasoning');
const message = [...response.output].reverse().find((item) => item.type === 'message');

// Raw reasoning arrives in `content`; OpenAI models return a summary in `summary` instead.
const reasoningText = [...(reasoning?.content ?? []), ...(reasoning?.summary ?? [])]
  .map((part) => part.text)
  .join('');
console.log('REASONING:', reasoningText);
console.log('CONTENT:', message?.content.find((part) => part.type === 'output_text')?.text);
```

```python
# Python (OpenAI SDK)
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

response = client.responses.create(
    model="openai/o3",
    input="How would you build the world's tallest skyscraper?",
    reasoning={
        "effort": "high",
        "summary": "detailed",
    },
)

for item in response.output:
    if item.type == "reasoning":
        # Raw reasoning arrives in `content`; OpenAI models return a summary in `summary` instead.
        parts = [*(item.content or []), *item.summary]
        print("REASONING:", "".join(part.text for part in parts))
print("CONTENT:", response.output_text)
```

**Reasoning token budget (`max_tokens`).** With the OpenAI SDK, `reasoning.max_tokens` is an OpenRouter extension: pass it in `extra_body` (Python), or suppress the type error (TypeScript).

```python
# client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
response = client.responses.create(
    model="~anthropic/claude-sonnet-latest",
    input="What's the most efficient algorithm for sorting a large dataset?",
    extra_body={
        "reasoning": {
            "max_tokens": 2000
        }
    },
)

for item in response.output:
    if item.type == "reasoning":
        print("REASONING:", "".join(part.text for part in item.content or []))
print("CONTENT:", response.output_text)
```

```typescript
// const openai = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });
const response = await openai.responses.create({
  model: '~anthropic/claude-sonnet-latest',
  input: "How would you build the world's tallest skyscraper?",
  reasoning: {
    // @ts-expect-error max_tokens is an OpenRouter extension
    max_tokens: 2000,
  },
});

for (const item of response.output) {
  if (item.type === 'reasoning') {
    console.log('REASONING:', item.content?.map((part) => part.text).join(''));
  }
}
console.log('CONTENT:', response.output_text);
```

**Excluding reasoning from the response (Chat Completions only).**

```python
response = client.chat.completions.create(
    model="deepseek/deepseek-r1-0528",
    messages=[
        {"role": "user", "content": "Explain quantum computing in simple terms."}
    ],
    extra_body={
        "reasoning": {
            "effort": "high",
            "exclude": True
        }
    },
)

print(response.choices[0].message.content)
```

```typescript
const response = await openai.chat.completions.create({
  model: 'deepseek/deepseek-r1-0528',
  messages: [
    {
      role: 'user',
      content: "How would you build the world's tallest skyscraper?",
    },
  ],
  // @ts-expect-error reasoning is an OpenRouter extension
  reasoning: {
    effort: 'high',
    exclude: true,
  },
});

console.log('CONTENT:', response.choices[0].message.content);
```

#### Reasoning vs the output limit

- On most providers `max_output_tokens` (Responses) / `max_tokens` or `max_completion_tokens` (Chat; same budget) covers reasoning **plus** visible output.
- If reasoning consumes everything: Responses returns `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"`, and no `message` item; Chat returns `finish_reason: "length"` with empty `content` (with `exclude: true` there's no text at all — only `finish_reason` and `usage`). Reasoning is still billed.
- Detect: visible tokens = `usage.output_tokens − usage.output_tokens_details.reasoning_tokens` (Responses) or `usage.completion_tokens − usage.completion_tokens_details.reasoning_tokens` (Chat). Example: `max_tokens: 300` → `completion_tokens: 302`, `reasoning_tokens: 301` → one visible token.
- Avoid: set the output limit well above expected reasoning, or cap with `reasoning.max_tokens` / a lower `effort`.

#### Discovering per-model options (`GET /api/v1/models`)

```json
{
  "id": "google/gemini-3.5-flash",
  "reasoning": {
    "supported_efforts": ["high", "medium", "low", "minimal"],
    "default_effort": "medium",
    "default_enabled": true,
    "mandatory": true
  }
}
```

| Field | Client-UI use |
| - | - |
| `supported_efforts` | Allowed efforts, highest first. `null` = all gateway values accepted; omitted = no effort selection exposed. |
| `default_effort` | Preselect when enabling reasoning. If `"none"`, treat as "off by default" (don't preselect disable when the user turns reasoning on). |
| `default_enabled` | Default on/off when the user hasn't set `reasoning.enabled`. |
| `supports_max_tokens` | Present and `true` → show a token-budget control and send `reasoning.max_tokens`. Omitted otherwise. |
| `mandatory` | `true` → hide disable controls and never send `effort: "none"` (rejected). |

Non-reasoning models and dynamic routers (`openrouter/auto`, `openrouter/free`) omit `reasoning`.

#### Provider-specific behavior

**Anthropic** (e.g. `~anthropic/claude-sonnet-latest`): enable **only** via the unified `reasoning` (`effort` or `max_tokens`).
- `reasoning.max_tokens` is used directly, minimum 1024.
- With `effort`: `budget_tokens = max(min(max_output_tokens * effort_ratio, 128000), 1024)`; `effort_ratio` = 0.95 (max, xhigh), 0.8 (high), 0.5 (medium), 0.2 (low), 0.1 (minimal).
- `max_output_tokens` (`max_tokens` on Chat) must be **strictly greater** than the reasoning budget.
- **Summarized thinking**: for Claude models supporting `thinking.display`, OpenRouter defaults to `'summarized'` so the trace isn't lost on newer models; with the Messages API you can send `thinking.display: 'omitted'` for no trace (the spec enum also lists `updates`). Token use and billing are the same either way; the summary may contain fewer tokens than reported reasoning tokens.

**Google Gemini 3** (`thinkingLevel` API; Gemini 2.5 uses `thinkingBudget`):

| `reasoning.effort` | Google `thinkingLevel` |
| - | - |
| `minimal` | `minimal` |
| `low` | `low` |
| `medium` | `medium` |
| `high` | `high` |
| `xhigh` | `high` (mapped down) |

Token use per level is decided by Google (`low` may still be several hundred tokens). Unsupported levels map to the nearest supported one. `reasoning.max_tokens` is passed as `thinkingBudget`, but Gemini 3 maps it to a level internally — no precise control.

```python
# Python (OpenAI SDK; client as in Examples above)
response = client.responses.create(
    model="google/gemini-3.1-pro-preview",
    input="Explain the implications of quantum entanglement.",
    reasoning={
        "effort": "low"  # Maps to thinkingLevel: "low"
    },
)

for item in response.output:
    if item.type == "reasoning":
        print("REASONING:", "".join(part.text for part in item.content or []))
print("CONTENT:", response.output_text)
```

```typescript
// TypeScript (OpenAI SDK)
const response = await openai.responses.create({
  model: 'google/gemini-3.1-pro-preview',
  input: 'Explain the implications of quantum entanglement.',
  reasoning: {
    effort: 'low', // Maps to thinkingLevel: "low"
  },
});

for (const item of response.output) {
  if (item.type === 'reasoning') {
    console.log('REASONING:', item.content?.map((part) => part.text).join(''));
  }
}
console.log('CONTENT:', response.output_text);
```

**Alibaba Qwen**: some thinking models map `reasoning.max_tokens` to `thinking_budget` (check each model description).

**OpenAI o-series**: reason but don't return reasoning text.

#### Anthropic Messages API mapping (`POST /api/v1/messages`)

| Messages API request | Unified equivalent |
| - | - |
| `output_config: { effort }` | `reasoning: { effort }` |
| `thinking: { type: "enabled", budget_tokens }` | `reasoning: { max_tokens: budget_tokens }` |
| `thinking: { type: "adaptive" }` | `reasoning: { enabled: true }` |
| `thinking: { type: "disabled" }` | `reasoning: { enabled: false }` |

- Works on every reasoning model, not only Claude.
- `output_config.effort` beats `thinking.type: "adaptive"` (adaptive + `effort: "high"` = high everywhere; Claude gets both fields unchanged, other models get e.g. `reasoning_effort: "high"`).
- `thinking.enabled` + `output_config.effort`: Claude gets both; other models get only the effort (budget not forwarded). Send only `thinking.budget_tokens` to control other models by budget.
- `adaptive` without effort: Claude runs native adaptive thinking; other models use their `reasoning.default_effort`.
- `disabled` wins even when an effort is present (Claude still receives `output_config.effort`, which Anthropic applies to the whole response; other models get no effort).
- `output_config.effort` maps only to OpenAI `reasoning.effort`, never `text.verbosity` (use the `verbosity` parameter on Chat/Responses). Anthropic `xhigh`/`max` are translated to the target's supported efforts.
- `output_config.effort` enum: `low`, `medium`, `high`, `xhigh`, `max`.

#### Changing effort mid-conversation

Changing request-level effort between turns changes the request prefix and breaks prompt caching. Supporting models accept an **in-history effort update** that applies from that point on, leaves earlier items untouched, and keeps the cache warm. Keep the item at the same position in later requests.

```jsonc
// Responses API
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

```jsonc
// Chat Completions (OpenRouter extension)
{
  "model": "anthropic/claude-fable-5.1",
  "reasoning": { "effort": "high" },
  "messages": [
    { "role": "user", "content": "Plan the migration." },
    { "role": "assistant", "content": "Here's the plan: ..." },
    { "role": "system", "content": "", "configuration_update": { "reasoning": { "effort": "low" } } },
    { "role": "user", "content": "Now rename the config file." }
  ]
}
```

```jsonc
// Anthropic Messages API
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

Rules:
- The three forms are interchangeable; OpenRouter re-emits the provider's native form (a Responses `configuration_update` to Claude becomes a per-message `output_config`; Chat/Messages updates to OpenAI become `configuration_update` items). Request-level effort is the baseline before the first update.
- `configuration_update.reasoning.effort` enum: `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`. Claude accepts `low`, `medium`, `high`, `xhigh`, `max` (`minimal` → `low`; `none` rejected); OpenAI models accept their `supported_efforts` (others → 400).
- Place directly before the user turn it applies to: a content-less system message (Chat/Messages) or a `configuration_update` item (Responses). Allowed before the first user turn (on Claude it stays inline while ordinary system text goes to top-level `system`; a system message with both text and an update is split in two).
- No two adjacent updates (rejected on all APIs).
- An update after the last user turn applies to this request's response.
- Not combinable with Responses `truncation: "auto"`, `reasoning.mode: "pro"`, or pro variants such as `openai/gpt-6-astra-pro` → 400.
- Not accepted on the Batch API (rejected per line).
- Per-model support, rolling out (first: Claude Fable 5.1 and OpenAI GPT-6 Astra; Claude Opus 5 too). Requests with an update route only to endpoints that accept it; unsupported models → 400 (never silently dropped).

#### Reasoning context mode (`reasoning.context`, OpenAI GPT-5.6+)

- `auto` (same as omitted): model default — may vary by model, so set explicitly when it matters.
- `all_turns`: may reference reasoning from all turns present in the input.
- `current_turn`: only the current turn's reasoning; prior reasoning items are ignored.

With manual Responses state (echoing output items as input), OpenRouter automatically requests encrypted reasoning content from reasoning-capable providers — replay `encrypted_content` unchanged; no `include` field needed.

```json
{
  "model": "~openai/gpt-sol-latest",
  "input": [
    { "role": "user", "content": "Solve this math problem step by step: ..." },
    { "type": "reasoning", "id": "rs_abc123", "encrypted_content": "...", "summary": [{ "type": "summary_text", "text": "Analyzed the equation..." }] },
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "The answer is 42." }] },
    { "role": "user", "content": "Now explain it differently." }
  ],
  "reasoning": { "effort": "high", "context": "all_turns" }
}
```

#### Reasoning mode (`reasoning.mode`, OpenAI GPT-5.6+ on OpenAI or Azure)

- `standard` (default) or `pro` (deeper multi-pass reasoning). Two equivalent ways: send `reasoning.mode: "pro"` with the standard model (rerouted to the matching `*-pro` model), or call the `*-pro` model directly. Bedrock's OpenAI-compatible API silently ignores the field, so pro requests only route to providers that honor it.
- Independent of `effort`; billed at standard per-token rates but usually uses more tokens. Can't combine with mid-conversation effort updates (400).

```json
{ "model": "~openai/gpt-sol-latest", "input": "Prove that there are infinitely many primes.", "reasoning": { "mode": "pro" } }
```

#### Preserving reasoning across turns (tool calling)

**Responses API**: send the previous response's `output` items back in the next `input` **in the order returned**, then append your `function_call_output` items. Keep each `reasoning` item's `content`, `summary`, `signature` and `encrypted_content` unchanged.

```json
{
  "model": "anthropic/claude-sonnet-4.5",
  "reasoning": { "max_tokens": 2000 },
  "tools": [{ "type": "function", "name": "get_weather", "parameters": { "type": "object", "properties": { "city": { "type": "string" } }, "required": ["city"] } }],
  "input": [
    { "role": "user", "content": "What's the weather in Boston?" },
    { "type": "reasoning", "id": "rs_abc123", "summary": [], "content": [{ "type": "reasoning_text", "text": "The user wants the current weather, so I should call get_weather." }], "signature": "..." },
    { "type": "function_call", "id": "fc_abc123", "call_id": "call_abc123", "name": "get_weather", "arguments": "{\"city\":\"Boston\"}" },
    { "type": "function_call_output", "call_id": "call_abc123", "output": "{\"temperature_f\":62,\"conditions\":\"cloudy\"}" }
  ]
}
```

**Chat Completions**: pass reasoning back on the assistant message as either
1. `reasoning` (string; `reasoning_content` is an identical alias) — fine for models returning plain reasoning strings, or
2. `reasoning_details` (array) — required for encrypted/summarized/signed reasoning; preserves full structure.

The entire sequence of consecutive reasoning blocks must match the original output — no reordering or modification. Works the same across OpenAI and Anthropic reasoning models (e.g. switch between `~openai/gpt-sol-latest` and `~anthropic/claude-sonnet-latest` without code changes). Why it matters: a model calling a tool pauses mid-response; returning reasoning preserves reasoning continuity and context when it resumes.

Official example: preserving `reasoning_details` across a tool turn with Claude (OpenAI SDK pointed at OpenRouter). `reasoning_details` is an OpenRouter extension, so the OpenAI SDK types don't declare it. Note that the second call doesn't resend `reasoning`; the preserved blocks let Claude continue from where it left off.

```python
import os
from openai import OpenAI
from openai.types.chat import ChatCompletionToolParam

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

# Define tools once and reuse
tools: list[ChatCompletionToolParam] = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string"}
            },
            "required": ["location"]
        }
    }
}]

# First API call with tools
# Note: You can use '~openai/gpt-sol-latest' instead of '~anthropic/claude-sonnet-latest' - they're completely interchangeable
response = client.chat.completions.create(
    model="~anthropic/claude-sonnet-latest",
    messages=[
        {"role": "user", "content": "What's the weather like in Boston? Then recommend what to wear."}
    ],
    tools=tools,
    extra_body={"reasoning": {"max_tokens": 2000}}
)

# Extract the assistant message with reasoning_details (an OpenRouter extension,
# so the OpenAI SDK types do not declare it)
message = response.choices[0].message
if not message.tool_calls:
    raise RuntimeError("Expected the model to request a tool call")

# Preserve the complete reasoning_details when passing back
messages = [
    {"role": "user", "content": "What's the weather like in Boston? Then recommend what to wear."},
    {
        "role": "assistant",
        "content": message.content,
        "tool_calls": message.tool_calls,
        "reasoning_details": getattr(message, "reasoning_details", None)  # Pass back unmodified
    },
    {
        "role": "tool",
        "tool_call_id": message.tool_calls[0].id,
        "content": '{"temperature": 45, "condition": "rainy", "humidity": 85}'
    }
]

# Second API call - Claude continues reasoning from where it left off
response2 = client.chat.completions.create(
    model="~anthropic/claude-sonnet-latest",
    messages=messages,  # Includes preserved thinking blocks
    tools=tools
)
```

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Define tools once and reuse
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
        required: ['location'],
      },
    },
  },
] satisfies OpenAI.Chat.ChatCompletionTool[];

// First API call with tools
const response = await client.chat.completions.create({
  model: '~anthropic/claude-sonnet-latest',
  messages: [
    {
      role: 'user',
      content: "What's the weather like in Boston? Then recommend what to wear.",
    },
  ],
  tools,
  // @ts-expect-error reasoning is an OpenRouter extension
  reasoning: { max_tokens: 2000 },
});

// Extract the assistant message with reasoning_details
type ORChatMessage = (typeof response)['choices'][number]['message'] & {
  reasoning_details?: unknown;
};
const message = response.choices[0].message as ORChatMessage;
const toolCallId = message.tool_calls?.[0]?.id;
if (!toolCallId) {
  throw new Error('Expected the model to request a tool call');
}

// Preserve the complete reasoning_details when passing back
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: 'user',
    content: "What's the weather like in Boston? Then recommend what to wear.",
  },
  {
    role: 'assistant',
    content: message.content,
    tool_calls: message.tool_calls,
    // @ts-expect-error reasoning_details is an OpenRouter extension
    reasoning_details: message.reasoning_details, // Pass back unmodified
  },
  {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify({
      temperature: 45,
      condition: 'rainy',
      humidity: 85,
    }),
  },
];

// Second API call - Claude continues reasoning from where it left off
const response2 = await client.chat.completions.create({
  model: '~anthropic/claude-sonnet-latest',
  messages, // Includes preserved thinking blocks
  tools,
});
```

#### `reasoning_details` shape (Chat Completions)

Location: `choices[].message.reasoning_details` (non-streaming) or `choices[].delta.reasoning_details` (streaming).

Common fields: `type`, `id` (string|null), `format`, `index` (number, optional).

`format` values: `unknown`, `openai-responses-v1`, `azure-openai-responses-v1`, `bedrock-openai-responses-v1`, `bedrock-xai-responses-v1`, `xai-responses-v1`, `meta-responses-v1`, `openrouter-stealth-v1`, `anthropic-claude-v1` (default), `google-gemini-v1`.

| `type` | Extra fields | Meaning |
| - | - | - |
| `reasoning.summary` | `summary` (string) | High-level summary of the reasoning |
| `reasoning.encrypted` | `data` (string) | Encrypted/redacted reasoning (may appear as `[REDACTED]` while streaming) |
| `reasoning.text` | `text`, `signature` (string\|null) | Raw reasoning text with optional signature |
| `reasoning.server_tool_call` | `tool_name`, `arguments`, `result`, `tool_call_id` | Spec-only (not in the guide): record of an OpenRouter server-tool call (e.g. `openrouter:fusion`) so it can be rehydrated in a later turn |

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Based on my analysis, I recommend the following approach...",
      "reasoning_details": [
        { "type": "reasoning.summary", "summary": "Analyzed the problem by breaking it into components", "id": "reasoning-summary-1", "format": "anthropic-claude-v1", "index": 0 },
        { "type": "reasoning.text", "text": "Let me work through this systematically:\n1. First consideration...", "signature": null, "id": "reasoning-text-1", "format": "anthropic-claude-v1", "index": 1 }
      ]
    }
  }]
}
```

#### Streaming reasoning

- **Chat Completions**: `choices[].delta.reasoning` (string deltas) and `choices[].delta.reasoning_details` chunks. Each chunk may contain one or more objects; concatenate all chunks in order to rebuild the sequence.

```json
{ "choices": [{ "delta": { "reasoning_details": [{ "type": "reasoning.text", "text": "Let me think about this step by step...", "signature": null, "id": "reasoning-text-1", "format": "anthropic-claude-v1", "index": 0 }] } }] }
```

- **Responses API**: reasoning arrives as SSE events: `response.reasoning_text.delta` / `response.reasoning_text.done` (raw reasoning), `response.reasoning_summary_text.delta` / `response.reasoning_summary_text.done` (summaries), and `response.reasoning_summary_part.added` / `response.reasoning_summary_part.done`. Visible text streams as `response.output_text.delta`. The reasoning-tokens guide's official example and the OpenAPI spec agree on these names. The separate Responses API reasoning reference page (`/docs/api_reference/responses/reasoning`) still checks `response.reasoning.delta`; treat that as outdated, but handling both costs nothing. The final response contains a `reasoning` output item (`id`, `encrypted_content`, `summary`) and `usage.output_tokens_details.reasoning_tokens`.

Official example: streaming Anthropic reasoning through the Responses API (OpenAI SDK). `max_output_tokens` (10000) exceeds the reasoning budget (8000), as Anthropic requires.

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

def response_with_reasoning(input):
    return client.responses.create(
        model="~anthropic/claude-sonnet-latest",
        input=input,
        max_output_tokens=10000,
        extra_body={
            "reasoning": {
                "max_tokens": 8000
            }
        },
        stream=True
    )

for event in response_with_reasoning("What's bigger, 9.9 or 9.11?"):
    if event.type in {
        "response.reasoning_text.delta",
        "response.reasoning_summary_text.delta",
    }:
        print(f"REASONING: {event.delta}")
    elif event.type == "response.output_text.delta":
        print(f"CONTENT: {event.delta}")
```

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

async function responseWithReasoning(input: string) {
  return openai.responses.create({
    model: '~anthropic/claude-sonnet-latest',
    input,
    max_output_tokens: 10000,
    reasoning: {
      // @ts-expect-error max_tokens is an OpenRouter extension
      max_tokens: 8000,
    },
    stream: true,
  });
}

(async () => {
  for await (const event of await responseWithReasoning("What's bigger, 9.9 or 9.11?")) {
    if (
      event.type === 'response.reasoning_text.delta' ||
      event.type === 'response.reasoning_summary_text.delta'
    ) {
      console.log(`REASONING: ${event.delta}`);
    } else if (event.type === 'response.output_text.delta') {
      console.log(`CONTENT: ${event.delta}`);
    }
  }
})();
```

#### Legacy parameters (Chat Completions only)

- `include_reasoning: true` ≡ `reasoning: {}`
- `include_reasoning: false` ≡ `reasoning: { exclude: true }`

Not accepted on the Responses API. Prefer `reasoning`.

#### Advanced: chain-of-thought injection

Official example: take a reasoning model's reasoning and inject it into a cheaper model's prompt to improve its answer. `stop: "</think>"` is sent through `extra_body` so the reasoning model stops before answering.

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

question = "Which is bigger: 9.11 or 9.9?"

def do_req(model: str, content: str, reasoning_config: dict | None = None):
    extra_body = {"stop": "</think>"}
    if reasoning_config:
        extra_body.update(reasoning_config)
    return client.responses.create(model=model, input=content, extra_body=extra_body)

def get_reasoning(response) -> str:
    return "".join(
        part.text
        for item in response.output
        if item.type == "reasoning"
        for part in item.content or []
    )

# Get reasoning from a capable model
content = f"{question} Please think this through, but don't output an answer"
reasoning_response = do_req("deepseek/deepseek-r1-0528", content)
reasoning = get_reasoning(reasoning_response)

# Let's test! Here's the naive response:
simple_response = do_req("~openai/gpt-mini-latest", question)
print(simple_response.output_text)

# Here's the response with the reasoning token injected:
content = f"{question}. Here is some context to help you: {reasoning}"
smart_response = do_req("~openai/gpt-mini-latest", content)
print(smart_response.output_text)
```

Gotchas:
- Don't send both `effort` and `max_tokens`.
- Anthropic: output limit must exceed the reasoning budget; budget clamped to [1024, 128000].
- `mandatory: true` models reject `effort: "none"`.
- `exclude` still bills reasoning; it's ignored on the Responses API.
- Never modify or reorder `reasoning_details` / reasoning items when echoing them back.
- Mid-conversation effort updates: no adjacent updates; not on Batch; not with pro.

Sources: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/docs/api_reference/responses/reasoning, OpenAPI spec (`ChatRequest`, `ReasoningConfig`, `ReasoningDetailUnion`, `ModelReasoning`, `ConfigurationUpdateReasoning`, Responses stream events)

### 10.11 Service tiers

Some providers sell one model at several capacity grades. OpenRouter lists each tier as its **own endpoint** of the model; you're billed at the price of the endpoint that actually served the request, and the response reports that tier.

| Tier | Also called | Tradeoff |
| - | - | - |
| `default` | `standard` | Provider's regular capacity and pricing |
| `flex` | — | Lower price; lower processing priority |
| `priority` | `fast` (provider labels: `fast`, `turbo`, `highspeed`, `prime`) | Priority processing; higher price |
| `ultrafast` | — | OpenAI Ultrafast mode, above priority; select OpenAI models; opt-in only |

Default traffic uses standard endpoints — except **priority endpoints of open-weight models**, which also compete in default routing (you may be served by one without asking).

#### Ways to opt in

**1. Model variants** (recommended starting point). `:nitro` sorts every endpoint by throughput and admits priority endpoints; `:floor` sorts by price and admits flex endpoints. A tier endpoint serves only if it wins that sort; fallbacks keep working at each endpoint's own rate. `provider.order` replaces the sort and disables tier admission (name a tier slug in the list to include it). Explicit `service_tier: "default"` also disables admission (use the variant purely for sorting). Full variant docs: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

```json
{ "model": "openai/gpt-5:nitro" }
```

**2. `service_tier` request parameter** (top-level; Responses, Chat Completions, Anthropic Messages):
- `default` — pins standard; also keeps open-weight priority endpoints out (so a `provider.sort: "throughput"` or `provider.only` request is served at the standard rate).
- `flex` — flex endpoints first, sorted by price. Fallback only to endpoints priced at or below a flex endpoint on **both** input and output (you never pay more than the flex rate). If the flex endpoint is the cheapest option (e.g. a single provider's flex tier), nothing qualifies and a flex capacity error surfaces. If the pool has no flex endpoints at all, the request routes normally at standard rates.
- `priority` / `fast` — matching endpoints first, then fallback to others; each group sorted by throughput unless `provider.order`/`provider.sort` is set. An off-tier fallback is billed at that endpoint's standard rate.
- `ultrafast` — ultrafast → priority → default endpoints. If the model has no ultrafast endpoint, behaves like `priority`. Reachable only by naming it (`service_tier: "ultrafast"` or the `openai/ultrafast` slug) — never via `:nitro`, `priority`/`fast`, or `provider.sort`.
- Combine with `provider.allow_fallbacks: false` to use only the top endpoint of that tier.
- The spec's request enum additionally lists `auto` and `scale` (not described in the guide).

Official example: request the `flex` tier from `openai/gpt-5` on the Responses API and read back which tier served it (top-level `service_tier`).

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5",
    "service_tier": "flex",
    "input": "What is the meaning of life?"
  }'
```

```python
# Python (OpenAI SDK)
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

response = client.responses.create(
    model="openai/gpt-5",
    service_tier="flex",
    input="What is the meaning of life?",
)

print(response.output_text)
print("Served by tier:", response.service_tier)
```

```typescript
// TypeScript (OpenAI SDK)
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const response = await openai.responses.create({
  model: 'openai/gpt-5',
  service_tier: 'flex',
  input: 'What is the meaning of life?',
});

console.log(response.output_text);
console.log('Served by tier:', response.service_tier);
```

The same parameter on the Anthropic Messages API (the tier comes back inside `usage`):

```bash
curl https://openrouter.ai/api/v1/messages \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-5", "service_tier": "flex", "max_tokens": 1024,
       "messages": [{"role": "user", "content": "What is the meaning of life?"}]}'
```

```json
{ "model": "openai/gpt-6-astra", "service_tier": "ultrafast" }
```

**3. Tier endpoint slugs** in `provider.order` / `provider.only`: the tier is appended as the last segment, after any variant or region segment — `openai/fast`, `openai/ultrafast`, `google-vertex/global/flex`, `baseten/fp4/us/priority`. `fast` and `priority` suffixes are interchangeable (`openai/priority` = `openai/fast`).

```json
{ "provider": { "only": ["openai/fast"] } }
```

Requests using none of these never reach flex, ultrafast, or closed-weight tier endpoints.

#### Fast mode spellings

`service_tier: "priority"`, `service_tier: "fast"` (OpenAI's Fast mode name for priority processing) and `speed: "fast"` (Anthropic's native field; Messages API `speed` enum `fast` | `standard`) are fully interchangeable on all APIs and providers. Provider labels (`turbo`, `highspeed`, `prime`) name endpoints, not request values.
- The response always reports `priority`, never `fast` (matching OpenAI).
- Anthropic: a fast-served request reports `service_tier: "priority"` plus `usage.speed: "fast"` on the Messages API (Anthropic's own API would echo `standard`). On models supporting fast mode, the request routes to the model's `fast` tier endpoint.
- Conflicting explicit values (`speed: "standard"` + `service_tier: "priority"`) are both honored as written.
- Dedicated `*-fast` models (e.g. `anthropic/claude-opus-5-fast`) are **deprecated**; they still work on the same capacity but new code should target the regular model.
- Anthropic itself has deprecated purchasing Priority Tier capacity commitments.

#### Workspace controls

- **Workspace default service tier** (workspace Routing settings, `https://openrouter.ai/workspaces/default/routing`): fills `service_tier` for requests that set none. Precedence: request `service_tier` (or `speed: "fast"`) → `service_tier` in a referenced preset → workspace default. A default of `default` pins standard and turns off `:nitro`/`:floor` tier admission for that workspace.
- **Allowed service tiers** (admin-only, same page): all allowed by default; `default` is always allowed. For a disallowed tier: explicit selection (`service_tier`, the `fast` alias, `speed: "fast"`, or a tier slug such as `openai/priority`/`openai/fast` in `provider.order`/`provider.only`) → **403**; its endpoints are never routed to (`:nitro`/`:floor` skip them silently; model pages show **Not routable** while signed in). The workspace default must be an allowed tier.

#### Comparison

| Option | Eligible pool | Ordering | Fallback |
| - | - | - | - |
| `:nitro` | default + priority | whole pool by throughput, no tier preference | next-fastest default/priority |
| `:floor` | default + flex | whole pool by price, no tier preference | next-cheapest of any tier |
| `service_tier: "priority"`/`"fast"` | default + priority | priority first; groups by throughput unless order/sort set | default endpoints |
| `service_tier: "ultrafast"` | default + priority + ultrafast | ultrafast → priority → default | priority, then default |
| `service_tier: "flex"` | flex + endpoints priced ≤ flex on input and output | flex first, by price | only to ≤-priced endpoints; otherwise capacity error |
| `provider.only` + tier slug | only named endpoints (tier slugs opt in) | default routing unless a sort is set | within named endpoints only |
| `provider.order` + tier slug | unchanged (named tier endpoints opted in) | listed first, in your order | unlisted endpoints unless disabled |
| `provider.sort` (`throughput`/`price`) | unchanged (no tier opt-in) | whole pool by metric | next in sorted order |

Billing always follows the tier that served the request (a provider shedding a tier request to default bills default).

#### Finding tier endpoints and reading the result

- Model page: tier badge (`Fast`, `Turbo`, `Flex`, …; `Fast`/`Turbo`/`Highspeed`/`Prime` are all priority).
- `GET /api/v1/models/{author}/{slug}/endpoints`: `service_tier` (`priority` | `flex` | `ultrafast` | `null` for standard) and a tier-suffixed `tag` (e.g. `openai/fast`, `deepinfra/turbo`); `pricing` is what that endpoint bills. Providers implement tiers either as a parameter on the same upstream model or as a dedicated upstream model id — behavior on OpenRouter is identical.
- Response `service_tier`: `default`, `flex`, `priority`, `ultrafast`, or `null` (no tier reported upstream). Google's `standard` and similar base labels are normalized to `default`.
- Placement: **top level** on Responses and Chat Completions; **inside `usage`** on the Messages API, where the base tier is reported as `standard` (Anthropic spec), other values unchanged.
- Generation records (`GET /api/v1/generation`) include `service_tier`.

Gotchas:
- Ultrafast pre-flight: before each endpoint OpenRouter checks your balance covers the request's maximum output at that endpoint's price; at ultrafast rates the default output limit can fail and the request drops to priority — set `max_output_tokens` (`max_tokens` on Chat) to what you need.
- `flex` can fail with a capacity error rather than silently costing more.
- `provider.order` disables variant tier admission.
- Disallowed tiers → 403 on explicit requests, silent skipping for variants.

Sources: https://openrouter.ai/docs/guides/features/service-tiers, OpenAPI spec (`ServiceTier`, `AnthropicSpeed`, `PublicServiceTier`, `/generation`)

### 10.12 Message transforms (context compression, `middle-out`)

For prompts exceeding a model's context window, enable the **context-compression plugin**, which removes or truncates messages from the **middle** of the prompt until it fits (LLMs pay less attention to the middle of sequences). Useful where perfect recall isn't required.

```typescript
{
  plugins: [{ id: "context-compression" }], // compress prompts that are > context size
  messages: [...],
  model // works with any model
}
```

`ContextCompressionPlugin` schema: `id: "context-compression"` (required); `engine: "middle-out"` (default and only value); `enabled: boolean` (default `true`; `false` disables). Accepted in `plugins` on Chat Completions, Responses and Messages.

Behavior:
- Also handles **message-count** limits: e.g. Anthropic Claude's maximum of 100,000 messages — when exceeded with compression on, half the messages are kept from the start and half from the end.
- Model selection with compression on: first considers models whose context length is at least half of total required tokens (input + completion) — e.g. 10,000 required → models with ≥ 5,000 context. If none qualify, the model with the highest available context length is used.
- Compression off and tokens over the limit → error suggesting you reduce length or enable compression.
- **On by default** for all endpoints with ≤ 8k (8,192 tokens) context. Disable with `plugins: [{ "id": "context-compression", "enabled": false }]`.
- Skipped for image-generation models that output only images (preserves `image_url` reference images in image-to-image requests). Multimodal models with text output (e.g. Gemini, gpt-image) still compress.
- When it actually runs, router metadata (10.13) shows a `context_compression` pipeline stage (`engine`, `input_type` `messages`|`prompt`, `original_count`, `compressed_count`).
- Plugins can also be enabled as account defaults on the Plugins settings page ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

> The current docs and OpenAPI spec define no top-level `transforms` request field; context compression is configured only through `plugins`.

```json
{
  "model": "meta-llama/llama-3.3-70b-instruct",
  "plugins": [{ "id": "context-compression", "engine": "middle-out" }],
  "messages": [ /* very long history */ ]
}
```

Gotchas:
- Middle content is dropped — don't use where every message matters (e.g. legal/audit transcripts).
- Small-context (≤ 8k) endpoints compress silently unless you disable it.

Sources: https://openrouter.ai/docs/guides/features/message-transforms, https://openrouter.ai/docs/guides/features/router-metadata, OpenAPI spec (`ContextCompressionPlugin`, `ContextCompressionEngine`)

### 10.13 Router metadata (`openrouter_metadata`)

Per-request opt-in that adds an `openrouter_metadata` object describing what the router did: provider choice, compression, guardrails, server tools, retries. For debugging routing, attributing latency/cost, and auditing.

#### Enabling

Header `X-OpenRouter-Metadata` (values matched case-insensitively): `enabled` → include; `disabled`, any other value (misspellings, empty) or absent → not included. The legacy header `X-OpenRouter-Experimental-Metadata` is still accepted.

Routes: `/api/v1/chat/completions`, `/api/v1/messages`, `/api/v1/responses`, `/api/v1/completions` (legacy). Streaming: delivered on the **final chunk before `data: [DONE]`** (Chat/Responses) or in the terminal `message_stop` event (Messages).

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-OpenRouter-Metadata: enabled" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "input": "Hello"
  }'
```

```python
import os
import requests

response = requests.post(
    'https://openrouter.ai/api/v1/responses',
    headers={
        'Authorization': f'Bearer {os.environ["OPENROUTER_API_KEY"]}',
        'Content-Type': 'application/json',
        'X-OpenRouter-Metadata': 'enabled',
    },
    json={
        'model': 'openai/gpt-4o-mini',
        'input': 'Hello',
    },
)
```

```json
{
  "id": "gen-...",
  "object": "response",
  "model": "openai/gpt-4o-mini",
  "status": "completed",
  "openrouter_metadata": {
    "requested": "openai/gpt-4o-mini",
    "strategy": "direct",
    "region": "iad",
    "summary": "available=1, selected=OpenAI",
    "attempt": 1,
    "is_byok": false,
    "endpoints": { "total": 1, "available": [{ "provider": "OpenAI", "model": "openai/gpt-4o-mini", "selected": true }] },
    "attempts": [{ "provider": "OpenAI", "model": "openai/gpt-4o-mini", "status": 200 }],
    "pipeline": [{
      "type": "context_compression",
      "name": "context-compression",
      "data": { "engine": "middle-out", "input_type": "messages", "original_count": 42, "compressed_count": 30 }
    }]
  }
}
```

#### Fields

| Field | Type | Description |
| - | - | - |
| `requested` | string | Slug/alias the client sent (may differ from what served it) |
| `strategy` | `direct` \| `auto` \| `free` \| `latest` \| `alias` \| `fallback` \| `pareto` \| `bodybuilder` \| `fusion` | Routing strategy used |
| `region` | string \| null | Edge region that handled the request (e.g. `iad`) |
| `summary` | string | One-line routing summary |
| `attempt` | integer | 1-indexed successful attempt (> 1 = earlier attempts failed over) |
| `is_byok` | boolean | A BYOK provider key was used |
| `endpoints` | `{ total, available: [{ provider, model, selected }] }` | Candidates considered and the selected one |
| `params` | object (optional) | Router parameters that influenced selection, e.g. `quality_floor`, `throughput_floor` (spec also: `version_group`) |
| `attempts` | `[{ provider, model, status }]` (optional) | Per-attempt results when the router retried |
| `pipeline` | `PipelineStage[]` (optional) | Plugins that materially altered the request/response |
| `generation_time` | integer ms (spec only) | Upstream dispatch → end of response body; completion tokens ÷ this ≈ throughput. Absent when nothing was dispatched |

`PipelineStage`: `type`, `name`, optional `summary`, `data` (free-form), `guardrail_id`, `guardrail_scope`, `cost_usd` (spec).

| `type` | `name` values | What `data` tells you |
| - | - | - |
| `guardrail` | `content-filter`, `moderation` (e.g. also `regex_pi_detection`) | `flagged`, engine verdict (`decision`, `confidence_level`, `matched_entity_types`, `action`, …) |
| `plugin` | `web-search`, `file-parser` | Plugin telemetry (result counts, page counts) |
| `server_tools` | `server-tools` | Mode (`native` / `sdk`) and tools invoked |
| `response_healing` | `response-healing` | Mode (`json_schema` / `json_object`), whether healing improved the response, lengths |
| `context_compression` | `context-compression` | Engine, input type (`messages`/`prompt`), original vs compressed counts |

A plugin emits a stage only if it actually ran (no-ops are omitted). Match on both `type` and `name`; select all guardrails with `pipeline.filter(s => s.type === 'guardrail')`. Treat unknown stage types as opaque.

```typescript
const meta = response.openrouter_metadata;
if (meta) {
  if (meta.attempt > 1) console.warn('fell back:', meta.attempts);
  const blocked = meta.pipeline?.filter((s) => s.type === 'guardrail' && s.data?.action === 'blocked');
  const compressed = meta.pipeline?.find((s) => s.type === 'context_compression');
}
```

#### Errors and cache hits

- **Cache hits never include it** (streaming or not) — metadata from a miss may not describe the routing that produced the cached payload.
- Opted-in **error** responses carry `openrouter_metadata` at the **top level** (sibling of `error`) on all four routes, streaming and non-streaming:
  - `404` no allowed providers: `attempt: 0`, no endpoint `selected`.
  - `403` guardrail block (content filter, prompt-injection detector, …): full metadata with a `pipeline` showing every guardrail that ran including the blocker (e.g. `type: "guardrail"`, `name: "regex_pi_detection"`, `guardrail_id: "grd_abc123"`, `guardrail_scope: "api-key"`, `data.action: "blocked"`); no `selected` endpoint, no `attempts`.
- `attempt: 0` = never reached a provider (all candidates filtered — `provider.only`, allowed providers, max price). `≥ 1` on an error = every attempted provider failed and fallbacks were exhausted.
- `500` responses are scrubbed to a generic message and **omit** metadata; `502`, `503`, `504`, `529` include it.
- Auth/rate-limit failures and edge validation rejections don't include it; for post-mortems use `GET /api/v1/generation` with the `X-Generation-Id` response header.

```json
{
  "error": {
    "code": 404,
    "message": "No allowed providers are available for the selected model. Providers serving openai/gpt-4o-mini: openai, but your request's provider.only preference permits only: azure."
  },
  "openrouter_metadata": {
    "requested": "openai/gpt-4o-mini",
    "strategy": "direct",
    "attempt": 0,
    "endpoints": { "total": 1, "available": [{ "provider": "OpenAI", "model": "openai/gpt-4o-mini", "selected": false }] }
  }
}
```

Stability: additive — new optional fields and stage types may appear without deprecation; existing fields are stable. Decode permissively.

Sources: https://openrouter.ai/docs/guides/features/router-metadata, OpenAPI spec (`OpenRouterMetadata`, `PipelineStage`, `PipelineStageType`, `RoutingStrategy`, `RouterParams`, `MetadataLevel`)

### 10.14 Zero completion insurance

Automatic for all accounts, models and providers — no configuration. You are **not charged** for the model's prompt, completion or reasoning tokens when a response:
- has **zero completion tokens AND a blank/null finish reason**, or
- has an **error finish reason**

— even if the provider charged OpenRouter for prompt processing.

Modality specifics:
- **Text-to-speech**: usable output = format-valid audio (≥ 1 complete MPEG frame for MP3, ≥ 1 complete sample for PCM). Empty, invalid and truncated output isn't billed. Character-priced requests bill the full input once usable audio is delivered, including when the client cancels after partial audio.
- **Image generation**: usable = at least one image whose base64 payload is non-empty and decodable. No image data, an empty payload, or invalid base64 → treated as an upstream failure, not billed. Only base64 decodability is checked (all valid formats incl. AVIF/HEIC are delivered).

Not covered: auxiliary services that already ran — web search (per-request fees), file parsing / PDF OCR, web fetch — may be billed for work performed even if the model then errors (sometimes skipped too, e.g. an upstream failure producing no tokens). These appear in the request's usage breakdown. On the Activity page, protected requests show zero credits for token usage (plus any auxiliary charges).

Sources: https://openrouter.ai/docs/guides/features/zero-completion-insurance

### 10.15 Presets

Presets are named, server-side configurations (dashboard: `https://openrouter.ai/settings/presets`, new: `/settings/presets/new`) that requests reference, so model/prompt/routing changes ship without code deploys. Endpoint reference: [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise).

#### What a preset can store

- Provider routing preferences (sort by price/latency, include/exclude providers)
- Model selection (single model or a fallback array)
- System prompt
- Generation parameters (`temperature`, `top_p`, …)
- `tools` — function/custom tools (stored and forwarded verbatim) and OpenRouter server tools (`openrouter:web_search`, `openrouter:advisor`, `openrouter:subagent`, …); advisor and subagent may appear multiple times as named instances
- Response caching: `cache_enabled`, `cache_ttl_seconds` (10.9)
- `service_tier` (precedence: request → preset → workspace default; 10.11)

#### Referencing a preset

```json
{ "model": "@preset/email-copywriter", "input": "Write a marketing email about our new feature" }
```

```json
{ "model": "openai/gpt-4", "preset": "@preset/email-copywriter", "input": "Write a marketing email about our new feature" }
```

```json
{ "model": "openai/gpt-4@preset/email-copywriter", "input": "Write a marketing email about our new feature" }
```

The `preset` field takes the same `@preset/{slug}` form as `model` — a bare slug without `@preset/` is **ignored**.

#### Merge rules

- Request parameters take priority; the merge is **shallow** — request-level fields replace matching preset fields wholesale; preset fields absent from the request are kept.
- `tools` arrays are **unioned**; a request tool overrides the preset tool with the same identity:
  - `openrouter:advisor` / `openrouter:subagent`: type + `parameters.name` (override one named instance, keep the others)
  - function tools: function name
  - other server tools (e.g. `openrouter:web_search`): singletons keyed by type
- Preset tools keep their relative order; request-only tools are appended after them.

A preset bundling a roster of named subagents (any client referencing `@preset/{slug}` gets them server-side):

```json
{
  "tools": [
    { "type": "openrouter:subagent", "parameters": { "name": "ideator", "model": "anthropic/claude-fable-5", "instructions": "You brainstorm creative directions, naming, and copy. Return several distinct options." } },
    { "type": "openrouter:subagent", "parameters": { "name": "mockup artist", "instructions": "You generate images and UI mockups for the concepts you are given.", "tools": [{ "type": "openrouter:image_generation", "parameters": { "model": "openai/gpt-5.4-image-2" } }] } },
    { "type": "openrouter:subagent", "parameters": { "name": "frontend designer", "model": "moonshotai/kimi-k3", "instructions": "You turn approved mockups into clean, responsive frontend code." } }
  ]
}
```

#### Creating presets from request bodies

POST the exact body you'd send to the matching inference route. Only fields overlapping the preset config are persisted (e.g. `model`, `temperature`, `provider`, `top_p`, `system`, `tools`); transient fields (`messages`, `input`, `prompt`, `stream`) are silently ignored. If the slug exists in your workspace, a **new version** is created and designated active; otherwise a new preset is created.

| Endpoint | System prompt taken from |
| - | - |
| `POST /api/v1/presets/{slug}/chat/completions` | the system message in `messages` |
| `POST /api/v1/presets/{slug}/messages` | top-level `system` |
| `POST /api/v1/presets/{slug}/responses` | `instructions` |

```bash
curl https://openrouter.ai/api/v1/presets/email-copywriter/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "temperature": 0.7,
    "provider": { "sort": "price" },
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Write a marketing email." }
    ]
  }'

curl https://openrouter.ai/api/v1/presets/code-reviewer/messages \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-4.6-sonnet", "max_tokens": 1024, "system": "You are a senior code reviewer.",
       "messages": [{"role": "user", "content": "Review this PR."}]}'

curl https://openrouter.ai/api/v1/presets/inbound-classifier/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o", "instructions": "Classify the inbound message.", "input": "Hello, I need a refund."}'
```

Response (all three):

```json
{
  "data": {
    "id": "650e8400-e29b-41d4-a716-446655440001",
    "name": "email-copywriter",
    "slug": "email-copywriter",
    "status": "active",
    "designated_version_id": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2026-04-20T10:00:00Z",
    "updated_at": "2026-04-20T10:00:00Z",
    "designated_version": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "version": 1,
      "system_prompt": "You are a helpful assistant.",
      "config": { "model": "openai/gpt-4o", "temperature": 0.7, "provider": { "sort": "price" } },
      "created_at": "2026-04-20T10:00:00Z",
      "updated_at": "2026-04-20T10:00:00Z"
    }
  }
}
```

#### Versioning and reading

- Version history is kept (understand changes, roll back), but requests addressing a preset through the API always use the **latest (designated) version**.
- Read endpoints ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)): `GET /api/v1/presets` (`offset`, `limit` 1–100, default 50), `GET /api/v1/presets/{slug}` (designated version inline), `GET /api/v1/presets/{slug}/versions`, `GET /api/v1/presets/{slug}/versions/{version}`.
- Organization presets are available to all org members. Presets are workspace-scoped (moving an API key to another workspace does not move presets).

Suggested workflow: iterate on a raw `/chat/completions` (or `/messages`, `/responses`) body → POST the same body to `/api/v1/presets/{slug}/...` → reference `@preset/{slug}` in production code.

Gotchas:
- `"preset": "email-copywriter"` (no `@preset/`) is silently ignored.
- A preset with `cache_enabled: false` can't be overridden by `X-OpenRouter-Cache: true`.
- Shallow merge: sending a `provider` object replaces the preset's entire `provider` object.

Sources: https://openrouter.ai/docs/guides/features/presets, https://openrouter.ai/docs/guides/features/response-caching, https://openrouter.ai/docs/guides/features/service-tiers, https://openrouter.ai/docs/api/api-reference/presets/list-presets, OpenAPI spec (`/presets`, `/keys/{hash}`)

### 10.16 Privacy: data collection and provider logging

#### What OpenRouter stores

OpenRouter does **not** store prompts or responses unless you opt in, or content is flagged as potential CSAM:

| Opt-in | Effect | Default | Where |
| - | - | - | - |
| Private Input & Output Logging | Prompts/completions visible in your logs (debugging, comparing models, prompt tuning). OpenRouter doesn't access or use it. Org admins see all logged data; members see their own. | Off | Observability settings (`/workspaces/default/observability`); see [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) |
| OpenRouter use of inputs/outputs | OpenRouter may use prompts/completions to improve the product; you get a **1% discount** on all model usage | Off | Privacy settings (`/workspaces/default/settings`) |

- **CSAM screening**: inference requests, including ZDR traffic, are screened in flight; flagged content may be retained for human review, reporting (e.g. NCMEC) and legal preservation. Not general retention or training. (The ZDR page notes this as a planned update effective October 27, 2026.)
- **Anonymous input categorization**: a small sample of prompts is categorized (by a ZDR model) for rankings/reporting; if you haven't opted in to OpenRouter use of I/O, the categorization is stored fully anonymously, never tied to your account.
- **Metadata** is always stored (token counts, latency, etc. — no content) for reporting, model rankings and your logs.
- OpenRouter has never sold or licensed prompt data; shares only to deliver the service or meet legal duties.
- **Safety Retention** endpoints are the exception to "no storage": OpenRouter or the provider may retain prompts/responses from any request, only for abuse prevention, not training. Exclude them with **ZDR only** (10.17).
- Regional domains skip OpenRouter's own input/output logging entirely (10.18).

#### Provider training and retention policies

- Each endpoint carries structured data-policy metadata reflecting the provider's terms (training, retention). If OpenRouter can't establish a clear policy, it conservatively marks the endpoint as both retaining and training.
- **Account setting**: allow or disallow routing to providers that may train on your data — separate settings for **paid** and **free** models (`https://openrouter.ai/settings/privacy`). Opting out means OpenRouter won't route to providers that train. This setting doesn't change OpenRouter's own handling.
- **Per request**: `provider.data_collection`:
  - `"allow"` (default) — allow providers that store data non-transiently and may train on it.
  - `"deny"` — only providers that don't collect user data. If none qualifies, the request errors.

```json
{ "model": "meta-llama/llama-3.3-70b-instruct", "messages": [{ "role": "user", "content": "..." }], "provider": { "data_collection": "deny" } }
```

- OpenRouter has **no routing rule based on provider retention** alone (other than ZDR enforcement, 10.17); the provider logging page lists each provider's retention policy using three tiers — **Zero retention (ZDR)**, **Safety Retention**, and retention for a stated period (possibly with training). Providers' terms of service are linked from provider pages and aggregated in the provider routing docs ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).
- Server tools and plugins that call third-party services (search engines, sandboxes) follow those services' policies.
- To see which models are available for regional routing, call `/api/v1/models/user` on the regional hostname (10.18).

Sources: https://openrouter.ai/docs/guides/privacy/data-collection, https://openrouter.ai/docs/guides/privacy/provider-logging, OpenAPI spec (`ProviderPreferences.data_collection`)

### 10.17 Zero Data Retention (ZDR)

ZDR means no routine storage of prompts or responses after processing (apart from the CSAM exception). Providers that don't retain also can't train; some don't train but do retain (abuse scanning, legal).

#### Data policy tiers

| Tier | Meaning | Trained on? |
| - | - | - |
| **ZDR** | No routine storage after processing | No |
| **Safety Retention** | OpenRouter or provider may retain prompts/responses from **any** request (flagged or not), only to detect/investigate/prevent abuse | No |
| **Retention and Training** | May be stored and used for training per provider policy | Possibly |

#### Safety Retention choice

When ZDR is enforced (privacy settings or guardrail), choose separately for **Google** models and **All other models**:
- **Allow Safety Retention** — ZDR-enforced requests can use ZDR and Safety Retention endpoints.
- **ZDR only** — Safety Retention endpoints excluded (some models become unavailable).

Defaults if unset: self-serve accounts allow Safety Retention; enterprise accounts use ZDR only. A guardrail can only be stricter than the account (account ZDR only → guardrail can't allow it). Guardrail API fields: `allow_safety_retention_google`, `allow_safety_retention_other`. When ZDR isn't enforced, Safety Retention endpoints are routable like any non-training endpoint.

**Google Safety Retention** (from October 18, 2026): Google requires Safety Retention for Google models on Vertex — not retained by default, but classifier-flagged prompts may be kept up to 90 days for abuse monitoring, not for training. These endpoints don't meet strict ZDR. Under **ZDR only**, most Google models become unavailable. Model pages show **ZDR compatible: Only with Safety Retention allowed** for such endpoints. If your own Google Cloud agreement includes ZDR, use Vertex via BYOK with a ZDR declaration (10.7).

#### Where ZDR can be enforced

| Level | How | Semantics |
| - | - | - |
| Account | Privacy settings (`/settings/privacy`), per model group | Applies to all your requests |
| Guardrail | `enforce_zdr_anthropic`, `enforce_zdr_openai`, `enforce_zdr_google`, `enforce_zdr_xai`, `enforce_zdr_other` ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)) | Per key / member / workspace |
| Request | `provider.zdr: true` | **OR** with account/guardrail: can only turn ZDR on, never off |

Model groups:

| Group | Effect when enabled |
| - | - |
| Anthropic | Removes first-party Anthropic endpoints (Bedrock and Vertex remain) |
| OpenAI | Removes first-party OpenAI endpoints (Azure remains) |
| Google | Removes AI Studio endpoints; Vertex Safety Retention endpoints remain only if Safety Retention is allowed |
| SpaceXAI | Removes non-ZDR SpaceXAI endpoints (the ZDR SpaceXAI endpoint remains) |
| All other models | Removes all other non-ZDR endpoints |

Use case: enforce ZDR for "all other models" while keeping first-party Anthropic/OpenAI/Google available. The legacy guardrail field `enforce_zdr` is **deprecated** — when sent, its value is copied into any per-group field not explicitly set.

```json
{
  "model": "gpt-4",
  "messages": [{ "role": "user", "content": "..." }],
  "provider": { "zdr": true }
}
```

With `zdr: true`, the request routes only to ZDR endpoints (plus Safety Retention endpoints if your settings allow them). `false`/omitted → account/guardrail enforcement still applies.

#### Interactions

- **BYOK**: keys follow the same rules by default; declare ZDR on the key (`declared_zdr: true`) if your provider agreement includes it (not for video) — 10.7.
- **Prompt caching**: in-memory provider caching is not considered retention; implicitly-caching endpoints remain eligible under ZDR.
- **Response caching** (10.9): unavailable under **account-level** ZDR; per-request `provider.zdr` doesn't affect it.
- **Plugins and tools**: ZDR enforcement covers provider routing for inference only — not plugins/tools like web search, which may use third parties with their own retention. One rule: when ZDR is enforced in account settings or a guardrail, the Web Search and Web Fetch server tools and the Web Search plugin **reject the Firecrawl engine**.
- **Private endpoints** ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)): classification comes from your declaration — **Not declared** (treated as retaining; not ZDR-eligible), **Declared ZDR** (stays in your org's ZDR pool; all other constraints still apply; doesn't affect other orgs or public endpoints), **Declared non-ZDR** (treated as retaining; explicit attestation for audit). Pre-existing private endpoints keep their classification until edited. An explicit OpenRouter data-policy override beats your declaration. Declarations aren't verified.
- **OpenRouter's own retention**: for ZDR-covered content, nothing retained after processing except when you opt in to storage or for CSAM review/reporting/preservation.

#### Finding ZDR endpoints

`GET https://openrouter.ai/api/v1/endpoints/zdr` (`listEndpointsZdr`) lists ZDR-eligible endpoints (auto-updated as provider policies change; includes Safety Retention endpoints, used only if allowed). Latency stats in the response are only visible when authenticated. The provider logging table shows which providers use Safety Retention.

Gotchas:
- Per-request `zdr: false` cannot disable account or guardrail ZDR.
- Under ZDR only, Google models largely disappear (since Oct 18, 2026).
- Video generation endpoints are always treated as retaining.
- If OpenRouter can't determine an endpoint's policy, it's treated as retaining + training.

Sources: https://openrouter.ai/docs/guides/features/zdr, https://openrouter.ai/docs/guides/overview/auth/byok, https://openrouter.ai/docs/guides/features/response-caching, https://openrouter.ai/docs/api/api-reference/endpoints/preview-the-impact-of-zdr-on-the-available-endpoints

### 10.18 In-region routing (EU / US data residency)

In-Region Routing (IRR) keeps prompt and completion processing inside a region: the request is decrypted in-region and routed only to shared provider endpoints in that region. **Europe** (EU/EEA, UK, Switzerland) for `eu.openrouter.ai`; **US** for `us.openrouter.ai`. If no eligible endpoint (shared, BYOK, or private) can serve it, the request **errors instead of leaving the region** (fails closed). BYOK-served requests go to your deployment's region (your responsibility).

Availability: **Business and Enterprise plans** (EU routing is self-serve on Business: no contract, no minimum). No setting to toggle — choose the region per request via the base URL. Org admins upgrade at Settings → Manage plan.

#### Base URLs

| Region | Base URL | API base |
| - | - | - |
| Global | `https://openrouter.ai` | `https://openrouter.ai/api/v1` |
| Europe | `https://eu.openrouter.ai` | `https://eu.openrouter.ai/api/v1` |
| United States | `https://us.openrouter.ai` | `https://us.openrouter.ai/api/v1` |

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  serverURL: 'https://eu.openrouter.ai/api/v1',
});
const response = await openRouter.responses.send({
  responsesRequest: { model: 'anthropic/claude-sonnet-5', input: 'Hello', stream: false },
});
```

```python
import os, requests
response = requests.post(
    "https://eu.openrouter.ai/api/v1/responses",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"},
    json={"model": "anthropic/claude-sonnet-5", "input": "Hello"},
)
```

```bash
curl https://eu.openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-sonnet-5", "input": "Hello"}'
```

OpenAI SDK: set `baseURL` / `base_url` to `https://eu.openrouter.ai/api/v1` (or `us.`).

#### Routing rules

- Candidates are filtered to endpoints whose infrastructure is in the region **and** that OpenRouter has onboarded for that region. Not onboarded → error (no out-of-region fallback).
- Always excluded on regional domains: global/cross-region deployments (Bedrock `global.` inference profiles, Vertex `global` locations) and multi-model routers (e.g. Auto Router).
- Generation records report `data_region` (`global` | `europe` | `us`).

**Regional-surcharge endpoints on the global domain**: a regional endpoint priced above the provider's standard endpoint (same model and tier), or above the cheapest standard endpoint when the provider has none, is a surcharge endpoint (parity-priced ones are treated normally; only default-usable endpoints set the reference price). For **closed-weight** models, default routing on `openrouter.ai` skips surcharge endpoints when a standard-priced endpoint exists (model page: **Not used in Standard routing**). Open-weight models' (Hugging Face id) regional endpoints stay in default routing. A surcharge endpoint is used when: the request comes via a regional domain; it's pinned by its regional slug in `provider.only`/`provider.order` (e.g. `amazon-bedrock/eu-west-1` — a bare `amazon-bedrock` doesn't pin regional endpoints); or your prioritized BYOK key routes to a provider whose only endpoints are regional. If all endpoints are surcharge-priced, they all stay in default routing.

#### Finding in-region models

- `GET https://eu.openrouter.ai/api/v1/models` (regional domain), or `GET https://openrouter.ai/api/v1/models?region=eu|us`.
- `/api/v1/models/user` through the regional hostname (filtered by your preferences/guardrails).
- Models page **In-Region Routing** filter (`/models?region=eu`, `/models?region=us`); live EU list with prices at `/business/eu`.

#### Enforcing regions with guardrails

`allowed_data_regions` on a guardrail lists the domains requests must arrive through:

| Value | Base URL |
| - | - |
| `global` | `https://openrouter.ai` |
| `europe` | `https://eu.openrouter.ai` |
| `us` | `https://us.openrouter.ai` |

- A request arriving through another domain → **403 Forbidden** before any inference or endpoint selection. `null` = unrestricted.
- Applies to every API surface: chat, embeddings, rerank, image/audio/video generation, server tools, Batch API, generation lookups.
- Multiple governing guardrails (workspace default, member, API key) → **intersection** (lower levels can only narrow). E.g. workspace default `["europe","us"]` + key guardrail `["europe"]` → that key must use `eu.openrouter.ai`.
- Whole-workspace EU residency: set `allowed_data_regions: ["europe"]` on the workspace default guardrail (editor **Data regions** or Guardrails API, [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)).
- The guardrail value is `europe`; the Models API filter is `region=eu` — not interchangeable.
- Data-region guardrails need Business/Enterprise. If the plan lapses while a region guardrail is assigned, the guardrail still enforces, but regional domains reject accounts without IRR → requests are rejected until you upgrade or clear the restriction (`global` in the list keeps `openrouter.ai` open).
- `GET /api/v1/key` returns `allowed_data_regions` for the calling key (guardrails + entitlement).

#### What stays outside the region (for `eu.openrouter.ai`)

| Processed in Europe | May be stored/processed in the US | Your responsibility |
| - | - | - |
| Prompt and completion processing | Account data | BYOK deployment region |
| Provider inference on shared EU endpoints (EU/EEA, UK, Switzerland) | Billing records | Broadcast and observability destinations you configure |
| OpenRouter's request handling | Authentication data | |
| | Security logs | |
| | Abuse-monitoring metadata | |
| | Other operational records | |

OpenRouter supports GDPR programs with a DPA and SCCs; the DPA's EU-only processing addendum (Exhibit A) for API payloads applies when elected in writing.

#### Feature availability on regional domains

Features whose infrastructure or vendors process data out of region are rejected (error, never silent). Each server tool and plugin engine must be resident in the region.

| Feature | `eu.openrouter.ai` | `us.openrouter.ai` |
| - | - | - |
| Web search plugin / `web_search` server tool | Not available (no engine) | Only Exa: `engine: "exa"`, `"auto"`, or omitted (these skip native search); everything else rejected |
| `web_fetch` server tool | No | No |
| Files, image generation, Fusion, shell, sandboxed bash (`engine: "openrouter"`) server tools | No | No |
| Tool search, apply patch, datetime, advisor, subagent, search models, client-side bash | Yes | Yes |
| PDF parsing engines | `native` only | `native`, `mistral-ocr` (`cloudflare-ai` global only); unavailable engine → 400 |
| Batch API | No (submit via `openrouter.ai`) | No |
| Multi-model routers (Auto Router) | No | No |
| ZDR enforcement, data-collection controls | Yes | Yes |
| OpenRouter input/output logging | Skipped (requests still work) | Skipped |

Perplexity, Parallel and Firecrawl search engines process queries out of region; `engine: "native"` isn't covered by providers' regional commitments.

**Observability**: Broadcast destinations are configured with the data regions they receive (global, EU, US) in Settings → Observability; regional traces are delivered from inside the region, held in memory only (never queued out of region), best-effort (no global retry queue). Host the destination in-region for end-to-end residency.

#### BYOK with in-region routing

OpenRouter filters shared endpoints by region but sends BYOK requests to the resource your key targets — you must provision in-region. Your key is used for a model only when the provider's shared endpoint for that model is region-eligible, unless you declare the key's **Data region** (10.7).

| Provider | Requirement |
| - | - |
| AWS Bedrock (credentials JSON with `region`) | In-region configured region (e.g. `eu-west-1`, `us-east-1`) is used. Out-of-region or unset → OpenRouter invokes a default in-region location (`eu-west-1` EU, `us-east-1` US) — your credentials need Bedrock + model access there. |
| AWS Bedrock API key | Tied to its creation region; create it inside your data region. |
| Bedrock `global.` profiles | Excluded from regional routing. |
| Azure (Foundry / Azure OpenAI) | Resource must be created in an in-region Azure location (e.g. Sweden Central, West Europe for EU); use regional (not global) deployment types; **declare the key's Data region** — a Global Azure key is never used on regional domains. |
| Google Vertex AI | Set key `region` to an in-region location (e.g. `europe-west1`, `us-central1`). For most Vertex models OpenRouter enforces it (out-of-region → error; unset/`"global"` → default in-region location). Exceptions: Vertex OpenAI-compatible endpoint models (incl. Llama, DeepSeek) and Vertex Interactions API models use the key's region directly (default `global`, unenforced) — always set an explicit in-region location, never `"global"`. |
| OpenAI | Key JSON `{ "api_key": "sk-...", "region": "eu" \| "us" }` → `https://eu.api.openai.com` / `https://us.api.openai.com`; saving declares the region. EU key serves only `eu.openrouter.ai` (plus its own host on `openrouter.ai`), US key only `us.`; plain string key = Global project (`api.openai.com`), never used regionally. APIs OpenAI doesn't serve on the regional host fail rather than fall back. |
| Anthropic | Declare **United States** on the key. Claude 4.6+: OpenRouter adds `inference_geo: "us"` on `openrouter.ai` and `us.openrouter.ai` (Anthropic's US-only rate billed to your account). Claude 4.5 and earlier reject the parameter: unpinned on `openrouter.ai`; on `us.openrouter.ai` they fail unless another eligible US provider serves them. Batches follow the same rule. No EU option (a US-declared key isn't used on `eu.`). Files stay global: the Files API works on `openrouter.ai` only. |
| Baseten | Create a regional Dedicated Deployment and add its URL as a private endpoint; region derived from `model-{model_id}-region-{us|eu}.api.baseten.co`. Shared Model APIs, non-regional hosts and regional environments are global-only. |

Gotchas:
- IRR is a base-URL choice per request; enforce it with `allowed_data_regions` guardrails.
- Expect errors (not fallbacks) for models/features not onboarded in-region.
- Batch API, Auto Router, web fetch, most web search, and several server tools don't work on regional domains.
- A regional OpenRouter domain does not regionalize your BYOK cloud deployments.

Sources: https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/guides/privacy/provider-logging, https://openrouter.ai/docs/guides/overview/auth/byok, https://openrouter.ai/docs/quickstart, OpenAPI spec (`/models` `region` param, `/key`, `/generation`)

### 10.19 Spend controls (best practices)

Two independent, layered controls:

| Layer | Scope | What it does |
| - | - | - |
| **Workspace budget** | Whole workspace | Pooled cap on collective spend (all members and keys) |
| **Guardrail budget** | Per member or per API key | Individual limit stacking with workspace budgets |

Plus each key's own credit limit (`limit` / `limit_reset` / `include_byok_in_limit`, 10.5).

Enforcement order: workspace budgets first, then all applicable guardrail budgets; each guardrail budget is enforced independently; the first limit reached blocks the request. `GET /api/v1/key` exposes the layers for the calling key as `budgets[]` (in check order) and `effective_budget` (the layer that blocks first). Each budget entry: `scope` (`workspace_default_member`, `workspace_default_key`, `member`, `api_key`, `workspace`, `key_limit`), `limit_usd`, `spend_usd`, `remaining_usd` (≤ 0 → that layer returns 403 until reset), `reset_interval` (`daily`/`weekly`/`monthly`/null = lifetime; UTC, weeks start Monday), `resets_at`, `include_byok`, `guardrail_id`, `budget_id`.

```bash
curl https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

Example: engineer with a `$100/week` member guardrail in a workspace with a `$5,000/month` budget can spend ≤ $100/week individually, and the team stops at $5,000/month regardless.

#### Recommended structure

1. Put model, provider, privacy (ZDR) and region policy on the **workspace default guardrail** (checked first for every request).
2. Set the default guardrail budget to the **highest** per-member/per-key limit you allow (it is the ceiling: a member on a `$500/week` guardrail is still blocked by a `$100/week` default).
3. Use a **workspace budget** for the pooled team cap / emergency stop ("everything is on fire").
4. Create additional guardrails with **lower** budgets for teams/roles/individuals.
5. Assign each person at most one additional tier when they need a lower limit; remove it to give them the default maximum.

Tiered example:

```
Workspace budget       → $10,000/month
Default guardrail      → $1,000/day per user
Power-user guardrail   → $500/day per user
Special-user guardrail → $200/day per user
New-user guardrail     → $50/day per user
```

Keep reset intervals consistent across tiers (or state differences). Reuse tier guardrails across members; don't create one per person unless lifecycle/ownership requires it.

#### How member guardrail budgets behave

- Aggregates usage across **all eligible org-owned keys the member created** (multiple keys share one member budget).
- Counts within the reset window (daily/weekly/monthly); no manual reset — only interval rollover.
- Raising a limit doesn't reset the counter; the member is unblocked only if accumulated usage is below the new limit.

#### Attribution follows the key creator

- A member-created key's spend counts toward that member's guardrail budget.
- An admin-created **workspace-owned key** (no `creator_user_id`) resolves to no member guardrail — cap it with a direct key guardrail, the default guardrail budget, or the workspace budget + key limit (10.20).
- Direct key guardrail assignment = an independent per-key budget check in addition to member checks; only one guardrail can be directly assigned to a key at a time.
- A shared admin-owned key used by a team draws against the admin's member budget — per-person enforcement needs per-person keys.
- Creating a new key to dodge a limit doesn't reset the member counter.

#### BYOK accounting

Guardrail budgets count only OpenRouter credit spend unless **Include BYOK spend** is enabled on that guardrail (and separately on the workspace budget, and `include_byok_in_limit` on keys). BYOK spend is counted at OpenRouter's recorded inference-cost value, not your provider's invoice.

#### Workspace budget API

`PUT /api/v1/workspaces/{workspace_ref}/budgets/{interval}` (management key; `workspace_ref` = UUID or slug; `interval` = `daily` | `weekly` | `monthly` | `lifetime`), body `{ "limit_usd": number > 0, "include_byok_in_budgets"?: boolean }`. Limits must **strictly decrease** as the interval narrows (lifetime > monthly > weekly > daily). `include_byok_in_budgets` is workspace-wide (applies to all intervals; omit to leave unchanged). Also `GET .../budgets`, `GET`/`DELETE .../budgets/{interval}` ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)). Workspace budgets: every plan; only org admins change them.

#### Terraform

The Terraform provider manages guardrails and API keys; workspace budget resources and guardrail member/key assignments are not yet supported (use dashboard or Management API).

```hcl
resource "openrouter_guardrail" "budget_100_weekly" {
  name           = "budget-100-weekly"
  limit_usd      = 100
  reset_interval = "weekly"
}
```

#### Common pitfalls

| Mistake | Why it fails |
| - | - |
| Default guardrail below a higher tier | Default is checked on every request — it stays the ceiling |
| Expecting a new key to bypass a member budget | New key spend accrues to the same member counter |
| Assuming a pooled guardrail across members | Guardrail budgets are per assignment; each member/key has its own counter |
| Not enabling Include BYOK spend | BYOK traffic bypasses budgets that count only credit spend |
| Shared key for per-person enforcement | Spend is attributed to the key creator, not the caller |

Checklist:
- [ ] Workspace budget set (with **Include BYOK spend** if using BYOK) as the pooled emergency stop.
- [ ] Workspace default guardrail holds model/provider/ZDR/region policy and the maximum per-member/key budget.
- [ ] Lower-tier guardrails reused across members; each member has ≤ 1 extra tier.
- [ ] Each person uses their own key; workspace-owned keys have a key guardrail or key `limit`.
- [ ] Every key has `limit` (+ `limit_reset`, + `include_byok_in_limit` with BYOK).
- [ ] Agents monitor `GET /api/v1/key` → `effective_budget.remaining_usd` and back off before 403s.

Sources: https://openrouter.ai/docs/guides/best-practices/spend-controls, https://openrouter.ai/docs/guides/overview/auth/byok, OpenAPI spec (`/key`, `/workspaces/{workspace_ref}/budgets/{interval}`)

### 10.20 Capping shared agent keys (best practices)

Agents, CI jobs and service accounts usually run on a **workspace-owned key** (created by an admin with **Owner → Workspace**, a.k.a. system key). It has no creator, so member guardrail budgets never apply — it can look uncapped even in a strictly governed workspace.

| Control | Applies to a workspace-owned key? |
| - | - |
| Member guardrail | No (no member to resolve) |
| Workspace default guardrail | Yes (all workspace traffic) |
| Guardrail assigned directly to the key | Yes (per-key budget) |
| Workspace budget | Yes (pooled) |
| Key credit limit (`limit`, `limit_reset`, `include_byok_in_limit`) | Yes (hard per-key cap) |

Recommended three controls (cover credit and BYOK spend with no member assignment):

**Step 1 — one workspace per team.** The workspace is the budget unit. With SSO + SCIM, map the team's IdP group to the workspace via a SCIM group mapping (Enterprise + active SSO; [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). Create agent keys in that workspace as workspace-owned: dashboard (workspace **Keys** → **Create API Key** → **Owner: Workspace**) or `POST /api/v1/keys` with the team's `workspace_id` and **no** `creator_user_id`.

```bash
curl -X POST https://openrouter.ai/api/v1/keys \
  -H "Authorization: Bearer $MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"name": "ci-agent", "workspace_id": "<team-workspace-uuid>", "limit": 200, "limit_reset": "monthly", "include_byok_in_limit": true}'
```

**Step 2 — workspace budget that counts BYOK.** Any combination of daily/weekly/monthly/lifetime; the next request after any limit is reached gets `403 Forbidden`. Available on every plan; only org admins change it.

```bash
curl -X PUT https://openrouter.ai/api/v1/workspaces/{workspace_id}/budgets/monthly \
  -H "Authorization: Bearer $MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"limit_usd": 2000, "include_byok_in_budgets": true}'
```

With BYOK included, the budget counts what OpenRouter would have charged without your key.

**Step 3 — credit limit on each agent key** (every plan): `limit` (USD cap), `limit_reset` (`daily`/`weekly`/`monthly`, resets midnight UTC; unset = lifetime), `include_byok_in_limit` (default `false` — a BYOK-only key would otherwise never hit its limit). At the cap, requests fail `403 Forbidden` with `Key limit exceeded` until reset or a raise.

```bash
curl -X PATCH https://openrouter.ai/api/v1/keys/{key_hash} \
  -H "Authorization: Bearer $MANAGEMENT_KEY" -H "Content-Type: application/json" \
  -d '{"limit": 200, "limit_reset": "monthly", "include_byok_in_limit": true}'
```

Dashboard: key dialog → **Key limit** (Credit limit, reset interval, **Include BYOK usage in limit** — shown once BYOK keys exist). Key limit and workspace budget have separate BYOK toggles; enable both.

**Several teams in one workspace**: impossible to give them separate pooled budgets today (one pooled limit per workspace; guardrail budgets are per key/member) — split into separate workspaces.

Checklist:
- [ ] Each agent-running team has its own workspace (mapped from its IdP group with SCIM where used).
- [ ] Agent keys are workspace-owned (Workspace owner option, or API without `creator_user_id`).
- [ ] Workspace budget exists with **Include BYOK spend** on (if BYOK).
- [ ] Every agent key has `limit`, `limit_reset` if rolling, and `include_byok_in_limit: true` (if BYOK).
- [ ] Handle `403 Key limit exceeded` / budget 403s in the agent loop (stop, alert — don't retry blindly).

Sources: https://openrouter.ai/docs/guides/best-practices/capping-shared-agent-keys, https://openrouter.ai/docs/guides/best-practices/spend-controls

### 10.21 Latency and performance (best practices)

OpenRouter adds minimal latency: edge compute on Cloudflare Workers, edge caching of user/API key data, optimized routing logic.

Latency factors:
- **Cold edge caches**: first 1–2 minutes in a new region may be slightly slower.
- **Credit balance checks**: when your balance is low (single-digit dollars) or a key nears its credit limit, caches expire more aggressively and extra DB checks run — higher latency until you add credits.
- **Fallbacks**: a failed first attempt adds latency to that request; OpenRouter tracks provider failures and routes around unavailable providers.

#### Metrics

- **TTFT** = network + provider queue + prompt prefill. **Streaming time** = first → last token (decode speed).
- OpenRouter's **throughput (TPS)** includes TTFT: per request, output tokens ÷ (time from sending to provider until response end). Short outputs and slow first tokens lower per-request TPS. Aggregates for model pages, `sort: "throughput"` and `preferred_min_throughput` exclude very short completions.

```text
TPS ≈ Output Tokens / (TTFT + Streaming Time)
Total Latency ≈ TTFT + Streaming Time ≈ Output Tokens / TPS
```

(Router metadata `generation_time` gives per-request upstream time; 10.13.)

#### Recipes (provider routing fields in §9)

1. **Bound peak-hour queue latency** — `preferred_max_latency` with a percentile (rolling 5-minute window; soft reordering: qualifying providers move to the front, never a hard failure):

```json
{ "model": "deepseek/deepseek-chat", "messages": [{ "role": "user", "content": "Explain continuous batching in 3 sentences." }],
  "provider": { "preferred_max_latency": { "p90": 2.5 } } }
```

2. **Fastest provider on a budget** — cheapest provider among those sustaining ≥ 40 tok/s at p90 over the last 5 minutes:

```json
{ "model": "meta-llama/llama-3.3-70b-instruct", "messages": [{ "role": "user", "content": "Refactor this function to be async." }],
  "provider": { "sort": { "by": "price" }, "preferred_min_throughput": { "p90": 40 } } }
```

3. **Agent loops and large contexts** (20k–90k+ input tokens; cold prefill adds ~5–10 s per step):

```json
{ "model": "~anthropic/claude-sonnet-latest", "session_id": "workspace-session-984a-4e21",
  "messages": [
    { "role": "system", "content": "You are a helpful coding assistant with access to local tools." },
    { "role": "user", "content": "Run test suite and fix failing cases." }
  ] }
```

Golden rules: (1) consistent `session_id` (10-minute best-effort pin to the endpoint holding the warm KV cache); (2) static, byte-identical prefix (system prompt, repo map, tool definitions first; timestamps/session metadata last); (3) identical model slug (switching to `:nitro` mid-conversation invalidates the sticky key); (4) avoid hardcoded `provider.order` (disables sticky reordering; Auto Exacto may also move tool-calling requests); (5) shrink tool-heavy prefixes with the `openrouter:tool_search` server tool and `defer_loading: true` on all but the most-used tools.

4. **Multi-model latency flattening** — by default all endpoints of model A are tried before model B; `partition: "none"` pools all endpoints across listed models and picks the highest current throughput:

```json
{ "models": ["~anthropic/claude-haiku-latest", "meta-llama/llama-3.3-70b-instruct", "google/gemini-2.5-flash"],
  "messages": [{ "role": "user", "content": "Format this JSON object." }],
  "provider": { "sort": { "by": "throughput", "partition": "none" } } }
```

| Goal | Configuration | Impact |
| - | - | - |
| Bound worst-case peak delays | `preferred_max_latency: { p90: 2.5 }` | Avoids congested queues (5-min rolling percentiles) |
| Fastest generation on a budget | `sort: "price"` + `preferred_min_throughput: { p90: 40 }` | Avoids oversubscribed slow hosts |
| Agent loops / long contexts | Stable `session_id` + static prefix | Cuts prefill time and cost (up to 80–90%) via KV cache |
| Tool-heavy prefixes | `openrouter:tool_search` + `defer_loading: true` | Lean, stable cacheable prefix |
| Global speed across models | `models: [...]` + `sort: { by: "throughput", partition: "none" }` | Fastest endpoint across candidates |

Checklist:
- [ ] Keep credit balance and key headroom above single digits (avoid slow-path billing checks).
- [ ] Stream responses for perceived latency.
- [ ] Stable `session_id` + static prefix for agents; enable prompt caching (10.8).
- [ ] Use `:nitro` / `service_tier: "priority"` when speed matters more than price (10.11).
- [ ] Use `preferred_max_latency` / `preferred_min_throughput` instead of hard provider pins.
- [ ] Use response caching for repeated identical calls (10.9).
- [ ] Set realistic `max_output_tokens` / reasoning effort (reasoning adds decode time, 10.10).
- [ ] Inspect `openrouter_metadata` (`attempt`, `attempts`, `generation_time`) to diagnose slow requests.

Sources: https://openrouter.ai/docs/guides/best-practices/latency-and-performance

### 10.22 Uptime optimization (best practices)

OpenRouter continuously tracks response times, error rates and availability for every provider in real time, routes on that feedback, and publishes it for transparency (the guide shows example uptime charts for Claude Sonnet 4.6 and GLM 5.1). You can customize provider selection with request parameters while still benefiting from automatic fallback ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) Provider routing).

Actionable checklist (each item is a documented feature; details in the referenced subsections):
- [ ] **Don't over-pin**: leave `provider.allow_fallbacks` at its default `true`; prefer `provider.order` (falls back to unlisted providers) over `provider.only` ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).
- [ ] **Model fallbacks**: pass a `models` array so another model serves when all endpoints of the first fail ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)); consider `partition: "none"` (10.21).
- [ ] **Soft performance preferences** (`preferred_max_latency`, `preferred_min_throughput`) reorder without failing closed (10.21).
- [ ] **BYOK**: keep **Use shared capacity** (default) on keys unless you need strict BYOK-only; use Fallback keys for backups; multiple keys per provider fail over in order (10.7). `is_byok_only` can remove a provider entirely.
- [ ] **Service tiers**: `priority` falls back to default endpoints; `flex` can surface capacity errors — avoid strict `flex` for availability-critical paths (10.11).
- [ ] **In-region / ZDR / data-collection filters** shrink the pool and fail closed — expect errors, not fallbacks, when nothing qualifies (10.17, 10.18).
- [ ] **Observe**: send `X-OpenRouter-Metadata: enabled` and alert on `attempt > 1`; inspect `provider_responses` in `GET /api/v1/generation` (10.13, 10.7).
- [ ] **Avoid empty-response charges**: zero completion insurance covers empty/error completions automatically (10.14); retry those client-side.
- [ ] **Agents**: keep stickiness (`session_id`) but don't hardcode `provider.order`, so a failed sticky provider can fail over (10.8).

Sources: https://openrouter.ai/docs/guides/best-practices/uptime-optimization, https://openrouter.ai/docs/guides/best-practices/latency-and-performance
