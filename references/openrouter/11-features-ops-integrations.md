# OpenRouter Reference — 11. Features III — operations, governance & integrations

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 10-features-auth-cost-privacy.md](10-features-auth-cost-privacy.md) · [Next: 12-appendix-endpoint-index.md →](12-appendix-endpoint-index.md)

## 11. Features III — operations, governance & integrations

This section covers the platform features you use to run OpenRouter in production: asynchronous bulk work (Batch API), file storage (Files API, sandbox containers), governance (guardrails, guardrail policies, content moderation, workspaces, budgets, SSO, SCIM), observability (Logs, Activity, Input & Output Logging, Broadcast, notifications, custom classifiers), the hosted OpenRouter MCP server, and third-party framework integrations.

Field-by-field endpoint schemas live elsewhere: batches, files, containers, System One, alpha decisions/extractions in [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs); guardrails, guardrail policies, observability destinations, SCIM, workspaces and budgets in [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise); analytics, generations and API keys in [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data). ZDR, in-region routing, spend-control best practices, management keys and BYOK are in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy). Server tools (shell, bash, files tool) are in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

Conventions in this section:

- Base URL `https://openrouter.ai/api/v1` unless stated otherwise.
- "Management key" = a [Management API key](https://openrouter.ai/docs/guides/overview/auth/management-api-keys) (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). Most governance and admin routes require one; inference routes take a normal API key.
- All `403` responses described for guardrails/budgets/policies are returned to the inference caller before the request reaches a provider.

### 11.1 Batch API

Run many requests asynchronously at a discount. You submit one JSON body with up to thousands of requests, OpenRouter runs them in the background on one provider, and returns all results inline from `GET /api/v1/batches/{id}`.

#### When to use batch vs. sync

| Use batch when | Use the sync API when |
| - | - |
| Nobody waits for the response; cost matters more than speed (evals, classification, data labeling, backlog summarization, embedding a corpus). | A user waits for the answer. |
| Output is text or embeddings. | You need image or audio **output**. |
| Inputs are text, public image URLs, or supported file URLs. | You need base64 images/audio input (outside the allowlist), audio input, or non-YouTube video. |
| — | You need OpenRouter web search (`:online`, `web` plugin, `web_search_options`). |
| — | You need Zero Data Retention (batch keeps data 30 days). |
| — | You need provider `order`/`sort`, or regional data residency (batch runs on US-based infrastructure; use the global endpoint `openrouter.ai`). |
| — | You need streaming (`stream: true`), `speed`, `deferred_tools`, or Anthropic beta features. |

#### Key facts

| Item | Details |
| - | - |
| Price | Typically 50% of the sync per-token price. Each model page shows its batch price (source of truth). |
| Models | Models with a batch variant only ([batch models list](https://openrouter.ai/models?variant=batch)). Use the normal slug (e.g. `anthropic/claude-haiku-5.5`); a model with no batch variant returns `400`. |
| Endpoints | `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/embeddings` |
| Shape | One model and one endpoint per batch. Mix shapes by submitting separate batches. |
| Size | Up to 200 MB request body per batch, plus a per-batch request-count cap (see [Limits](#batch-limits)). |
| Input format | **Requests go inline in the JSON body. There is no JSONL file to upload.** |
| Turnaround | Within 24 hours on most providers; Google AI Studio window 48 h; Google Vertex up to 96 h. Most batches finish in minutes. |
| Results | Returned inline by `GET /api/v1/batches/{id}`; no separate download endpoint. Match results to requests with `custom_id` (results are **not** in input order). |
| Notifications | Optional signed webhook when the batch reaches a final status. |
| Data retention | Requests and results deleted 30 days after submit (then `GET` returns `410 Gone`), or earlier when you delete the batch. Batch endpoints do not train on your data. |
| Visibility | Every API key in a workspace sees the same batches (including batches submitted with other keys). Dashboard: **Batches** tab of [Logs](https://openrouter.ai/logs). |
| Cancel | Not supported (no cancel endpoint). Wait for a final status, then delete. |

#### Endpoints

| Method & path | Purpose |
| - | - |
| `POST /api/v1/batches` | Submit a batch. Returns `202` with `status: "validating"`. |
| `GET /api/v1/batches/{id}` | Read status, counts, usage and (when finished) `results`. |
| `GET /api/v1/batches` | List batches (metadata only, `results` always `null`). |
| `DELETE /api/v1/batches/{id}` | Delete a finished batch and its stored data (and provider-side files). |

Client SDK methods (see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go)): TypeScript `openRouter.batch.createBatches({ batchSubmitBody })`, `openRouter.batch.getBatches({ id })`, `openRouter.batch.list()`, `openRouter.batch.delete({ id })` (TS SDK uses camelCase `customId` in request objects); Python `open_router.batch.create_batches(...)`, `open_router.batch.list()`, etc. Full schemas: [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs).

#### Lifecycle and statuses

```text
validating → in_progress → finalizing → completed
                                     ↘ failed | expired | cancelled
```

| Status | Meaning |
| - | - |
| `validating` | Stored; OpenRouter is checking each request (after the `202`). Vertex batches can sit here a long time while queued. |
| `in_progress` | Submitted to the provider and running. |
| `finalizing` | Provider finished; OpenRouter is collecting results. |
| `completed` | Final. The batch finished. **Individual requests can still have errors.** |
| `failed` | Final. A validation check failed, or the provider rejected the batch. `error.message` says why (and names the offending `custom_id` when applicable). |
| `expired` | Final. The provider did not finish before `expires_at`. |
| `cancelled` | Final. The provider cancelled the batch. |
| `cancelling` | Appears in the spec's status enum; not described in the guides (you cannot cancel a batch yourself). Not accepted as a list filter. |

A `202` means OpenRouter durably stored the batch, **not** that it is valid. Validation happens after acceptance; a failing check moves the batch to `failed`.

#### Build the batch (request format)

| Field | Required | Description |
| - | - | - |
| `endpoint` | Yes | `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, or `/v1/embeddings`. Every request uses it. |
| `model` | Yes | The model for every request. A request `body` may omit `model`; if it sets one, it must match. |
| `requests` | Yes | Non-empty array of `{ custom_id, body }`. `custom_id` must be unique within the batch. `body` = the same body you send to the sync endpoint. |
| `callback_url` | No | Public HTTPS URL that receives a webhook on a final status. Private/internal addresses → `400`. Overrides the workspace **Default batch webhook URL**. |
| `provider` | No | Only `only` (array of provider slugs) and `allow_fallbacks` (boolean). See [Choose a provider](#batch-choose-a-provider). Not accepted on embeddings batches. |
| `completion_window` | No | `"24h"` — the default and only accepted value. |

> **Field order matters.** OpenRouter stream-parses the body so it can accept large batches without buffering. Put `endpoint`, `model`, `provider`, `completion_window`, and `callback_url` **before** `requests`. If `requests` comes first, the submit returns `400`.

```json
{
  "endpoint": "/v1/responses",
  "model": "anthropic/claude-haiku-5.5",
  "callback_url": "https://example.com/webhooks/openrouter-batch",
  "requests": [
    { "custom_id": "review-1", "body": { "input": "Classify: The fit is perfect." } },
    { "custom_id": "review-2", "body": { "input": "Classify: It arrived broken." } }
  ]
}
```

Request-body rules inside each `body`:

- Unknown parameters are dropped before reaching the provider (same as sync).
- Rejected inside a batch: `stream: true`, `speed`, `deferred_tools`, Anthropic beta features, image/audio output (`modalities`, `audio`, `image_config`), OpenRouter web search (`:online`, `web` plugin, `web_search_options`), a web search tool with an `engine` other than `auto` or `native`, a request with no input, a max-output-token cap below 1.
- `access_programs.cyber` other than `standard` (OpenAI Daybreak programs) is supported only on BYOK OpenAI requests served on the Responses API using your own enrolled OpenAI key; otherwise the line is rejected before reaching the provider.
- Use the provider's own search tool instead of OpenRouter web search, e.g. OpenAI `web_search` on `/v1/responses` or Anthropic `web_search_20250305` on `/v1/messages`. Google Vertex rejects web search tools.

#### Submit the batch

```shell
curl https://openrouter.ai/api/v1/batches \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @batch.json
```

```typescript
const headers = {
  Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  'Content-Type': 'application/json',
};

const response = await fetch('https://openrouter.ai/api/v1/batches', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    endpoint: '/v1/responses',
    model: 'anthropic/claude-haiku-5.5',
    callback_url: 'https://example.com/webhooks/openrouter-batch',
    requests: reviews.map((review) => ({
      custom_id: review.id,
      body: { input: `Classify: ${review.text}` },
    })),
  }),
});

if (response.status !== 202) {
  throw new Error((await response.json()).error.message);
}
const batch = await response.json();
```

Note `JSON.stringify` preserves insertion order, so the object literal above (with `requests` last) satisfies the field-order rule.

```python
import os
import requests

response = requests.post(
    "https://openrouter.ai/api/v1/batches",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
    json={
        "endpoint": "/v1/responses",
        "model": "anthropic/claude-haiku-5.5",
        "callback_url": "https://example.com/webhooks/openrouter-batch",
        "requests": [
            {"custom_id": review["id"], "body": {"input": f"Classify: {review['text']}"}}
            for review in reviews
        ],
    },
)
response.raise_for_status()
batch = response.json()
```

`202 Accepted`:

```json
{
  "id": "batch_123",
  "object": "batch",
  "endpoint": "/v1/responses",
  "model": "anthropic/claude-haiku-5.5",
  "completion_window": "24h",
  "status": "validating",
  "created_at": 1782097200,
  "finalized_at": null,
  "provider": "Anthropic",
  "expires_at": 1782183600,
  "request_counts": { "total": 2, "completed": 0, "failed": 0 },
  "usage": null,
  "results": null,
  "error": null
}
```

- Save `id`.
- `provider`: the provider that runs the batch (same naming as sync responses' `provider`). If OpenRouter moves the batch to another provider for capacity before it starts, later reads show the new `provider`.
- `expires_at`: when that provider stops working on the batch, or `null` if the provider has no hard deadline. Most allow 24 h; Google AI Studio 48 h; Google Vertex 96 h. On a capacity move, `expires_at` changes to the new provider's window, still counted from `created_at`.

#### Add images and files

Batch accepts text, public image URLs, and some file URLs, and returns text and embeddings only. Support depends on the provider that runs the batch, so **pin a provider with `provider.only` when you send images or files**.

| Provider | Image URL | File URL |
| - | - | - |
| Anthropic | Yes | Yes |
| DeepInfra (`/v1/chat/completions` only) | Yes | Yes |
| Mistral | Yes | Yes |
| OpenAI | Yes | Models served on the Responses API only |
| Google Vertex | Yes, and `gs://` images with BYOK | No |
| Google AI Studio | Yes | No. Public YouTube URLs work as `video_url` parts. |
| xAI, Together, Sail Research | Yes | No |
| Alibaba (`/v1/chat/completions` only) | Yes | No |
| Fireworks, Parasail, Morph | No | No |

File parts use each endpoint's own type: `input_file` on `/v1/responses`, `file` on `/v1/chat/completions`, `document` on `/v1/messages`. On a chat batch, send `messages` with `image_url` and `file` parts.

Google Vertex image URLs must be HTTPS, end in `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`, or `.heif`, and must not point at Google API, Googleusercontent, or Cloud Storage HTTPS hosts. A provider can disable image URLs for a specific model. File URLs only work on models that list file input.

```json
{
  "custom_id": "photo-1",
  "body": {
    "input": [
      {
        "role": "user",
        "content": [
          { "type": "input_text", "text": "Describe this product photo." },
          { "type": "input_image", "image_url": "https://example.com/shoe.jpg", "detail": "auto" }
        ]
      }
    ]
  }
}
```

```json
{
  "custom_id": "contract-1",
  "body": {
    "input": [
      {
        "role": "user",
        "content": [
          { "type": "input_text", "text": "Summarize this contract." },
          { "type": "input_file", "filename": "contract.pdf", "file_url": "https://example.com/contract.pdf" }
        ]
      }
    ]
  }
}
```

The provider fetches each URL **when it runs the batch**, possibly hours after submit. Keep URLs public until the batch finishes. A request failing these checks moves the whole batch to `failed`, with `error.message` naming the `custom_id`.

**Inline base64 images** (`image/png`, `image/jpeg`, `image/webp`, `image/gif` in `image_url.url` data URIs) are allowlist-only and need a provider whose batch API is verified to read them. Default for other accounts: rejected with `Only public http(s) image URLs are supported in batch; base64/data-URI images are rejected`. Accounts admitted only via an all-accounts rollout get `Inline base64 images need known-CSAM screening, which is not active for this batch; use a public http(s) image URL.` (explicit-allowlist accounts bypass known-CSAM screening until it is wired into batch submit). Per-provider support:

| Provider | Inline image types | Decoded size limits |
| - | - | - |
| Anthropic | all four | 5 MiB per image |
| OpenAI (`/v1/chat/completions` and `/v1/responses`) | all four, animated GIF included | 20 MiB per image and per request (inline files and images share the per-request limit) |
| DeepInfra | `image/png`, `image/jpeg` only (rejects webp/gif with its accepted types); MIME type must be lowercase with no parameters | 20 MiB per image and across all inline media per request |
| Sail Research | all four, static and animated GIF | 20 MiB per image and per request; max 20 images per request (public URL + inline combined) |
| Alibaba | all four | 4 MiB per image and per request; refuses any request whose native line would exceed 6,291,456 bytes (one oversized line fails the whole Alibaba batch) |
| Mistral | png, jpeg, webp (OpenRouter refuses inline gif for Mistral) | 10 MiB per image; 20 MiB inline media per request |
| xAI | PNG, JPEG, WebP (no GIF) | 17 MiB per image and per request (inline files and images share the limit) |
| Every other provider | rejected (error names the provider and its accepted types) | — |

Inline images must be content parts of a `user` message; inline images in `messages[].images`, on assistant/system turns, and in tool results are not supported in batch. Pin the provider at the batch top level (e.g. `provider: { only: ["sail-research"] }`): an unpinned batch can route to a provider that refuses inline images, and that refusal does **not** fall back.

**Inline file bytes and provider file IDs**: provider file IDs are not supported. Send a public file URL, or an inline base64 data URI (`data:<media type>;base64,...`) of a type the provider's batch API is verified to read. For accounts with inline files enabled (individually or via all-accounts rollout):

- PDFs: Anthropic, DeepInfra, Google AI Studio, Google Vertex, Mistral, OpenAI (20 MiB decoded per file and per request), and xAI (17 MiB per file and per request). Limits are per request, so two 12 MiB files in one request fail admission even though each fits alone.
- Plain text, CSV, Markdown, HTML: also Google AI Studio and OpenAI models served on the Responses wire.
- JSON and Word (`.docx`): also OpenAI models served on the Responses wire. OpenAI models still served on Chat Completions (e.g. `gpt-audio`) take PDFs only.
- Audio and video stay rejected as inline bytes.
- Content must match its media type: a PDF starts with `%PDF-`, text types are valid UTF-8, JSON parses, `.docx` is a real Word (OOXML) package (not just any ZIP).
- A type the chosen provider can't take fails the batch (error names provider and accepted types) and is **not** re-routed. If the provider chosen at submit can't take inline files at all, the batch moves to another provider for the model that can, unless `provider.allow_fallbacks` is `false`.
- Other accounts get `Inline base64 files are not enabled for this account in batch`.
- Inline bytes count toward request size and are reserved against your balance **as text** at submit, so a large text file reserves more than its final token cost until the batch finalizes.

**Audio input and non-YouTube video**: use the sync API. A YouTube video on Google AI Studio reserves the model's full input limit against your balance at submit (length unknown); you are billed the tokens the provider reports.

#### Wait for the batch to finish

Most batches finish in minutes and nearly all within 24 h. Recommended: webhook as the primary signal, slow polling as backup. Google Vertex can queue a batch up to 72 h waiting for capacity and then process up to 24 h; a Vertex batch still `validating`/`in_progress` after 24 h is healthy.

##### Option A — webhook

Set `callback_url` on the batch, or **Default batch webhook URL** in workspace settings (the batch-level URL overrides it; must be public HTTPS). One `POST` is sent when the batch reaches a final status:

| Event `type` | Sent when |
| - | - |
| `batch.completed` | Batch finished (some requests may still have errors). |
| `batch.failed` | A check failed or the provider rejected the batch. |
| `batch.expired` | Provider did not finish before `expires_at`. |
| `batch.cancelled` | Provider cancelled the batch. |

```json
{
  "id": "evt_51504673caddb4daeaed47e7de1dde8e",
  "object": "event",
  "type": "batch.completed",
  "created_at": 1792445705,
  "data": { "id": "batch_123" }
}
```

| Header | Value |
| - | - |
| `X-OpenRouter-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>`. Sent only when the workspace has a webhook signing secret. |
| `X-OpenRouter-Idempotency-Key` | `<batch id>-<status>`, e.g. `batch_123-completed`. |

- The event carries only the batch ID; fetch the batch for status and results.
- Repeated deliveries of the same event have the same `id` and idempotency key.
- Signing secret: workspace settings → **Webhook signing secret** → **Generate signing secret**. Video generation webhooks use the same secret.
- Signature = HMAC-SHA256 (hex) over `"<t>," + rawBody` with the signing secret. The documented receiver rejects timestamps older/newer than 300 s.

```typescript
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const signingSecret = process.env.OPENROUTER_WEBHOOK_SECRET;
if (!signingSecret) throw new Error('Set OPENROUTER_WEBHOOK_SECRET');

function isValidSignature(rawBody: Buffer, header: string): boolean {
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signature = parts.find((part) => part.startsWith('v1='))?.slice(3);
  if (!timestamp || !signature) return false;

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Number.isNaN(age) || Math.abs(age) > 300) return false;

  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(Buffer.concat([Buffer.from(`${timestamp},`, 'utf8'), rawBody]))
    .digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

app.post(
  '/webhooks/openrouter-batch',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!isValidSignature(req.body, req.header('X-OpenRouter-Signature') ?? '')) {
      return res.sendStatus(401);
    }

    const event = JSON.parse(req.body.toString('utf8'));
    try {
      // A repeated delivery carries the same event id, so this adds no second job.
      await queue.addIfAbsent(event.id, { batchId: event.data.id });
    } catch {
      return res.sendStatus(500); // OpenRouter retries the delivery
    }
    return res.sendStatus(200);
  },
);
```

Receiver rules:

1. Verify the signature against the **raw body** before parsing JSON (use `express.raw`, not `express.json`).
2. Enqueue the batch ID on a durable queue in one write keyed by event `id` (the `id` is in the signed body, so retries dedupe).
3. If the enqueue fails, return non-`2xx` so OpenRouter retries. A `2xx` marks the delivery successful.
4. From the queue, fetch the batch. The webhook can arrive a few seconds before `GET` shows the final status; if they disagree, wait and retry.

Tip from the docs: point `callback_url` at a temporary [Webhook.site](https://webhook.site) URL to inspect a real delivery (it does not verify signatures).

##### Option B — poll

Call `GET /api/v1/batches/{id}` until status is final (`completed`, `failed`, `expired`, `cancelled`). Once a minute is enough; back off on `429`. If you use both webhook and polling, process each batch once.

```typescript
const FINAL = new Set(['completed', 'failed', 'expired', 'cancelled']);

async function waitForBatch(id: string) {
  for (;;) {
    const response = await fetch(`https://openrouter.ai/api/v1/batches/${id}`, { headers });
    if (response.ok) {
      const batch = await response.json();
      const resultsReady = batch.status !== 'completed' || batch.results !== null;
      if (FINAL.has(batch.status) && resultsReady) return batch;
    } else if (response.status !== 429 && response.status < 500) {
      // 402, 404, and 410 do not clear by retrying.
      const detail = await response.json().then((b) => b?.error?.message).catch(() => null);
      throw new Error(detail ?? `Batch poll failed with ${response.status}`);
    } else {
      await response.body?.cancel();
    }
    const delayMs = response.status === 429 ? 120_000 : 60_000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
```

Note the `resultsReady` guard: treat `completed` as done only once `results` is non-null.

##### List batches

```shell
curl 'https://openrouter.ai/api/v1/batches?status=validating&status=in_progress&limit=100' \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

| Query param | Description |
| - | - |
| `limit` | 1–100. Default 20. |
| `after` | Previous page's `last_id`. Use while `has_more` is `true`. |
| `status` | Repeat to include several statuses. `finalizing` and `cancelling` are not accepted. |
| `created_after`, `created_before` | Unix seconds, or ISO 8601 date/datetime with offset (e.g. `2026-08-20T00:00:00Z`). Both strict (exclusive). When both set, `created_after` must be earlier than `created_before` or `400`. |

```json
{
  "object": "list",
  "data": [
    {
      "id": "batch_123",
      "object": "batch",
      "status": "in_progress",
      "model": "anthropic/claude-haiku-5.5",
      "provider": "Anthropic",
      "request_counts": { "total": 2, "completed": 1, "failed": 0 },
      "results": null
    }
  ],
  "first_id": "batch_123",
  "last_id": "batch_123",
  "has_more": false
}
```

- Newest first. List items carry metadata only (`results` always `null`).
- Page with `after` only; offset and `before` are unsupported.
- Prefer the ID cursor over timestamps: `created_at` has whole-second precision while `created_after` preserves sub-second precision, so a batch created later in the same second can still match `created_after=<created_at>`.

#### Read the results

When `status` is `completed`, `results` holds one entry per request: each has either `response` (with `status_code`, `request_id`, `body`) or `error`. Each `response.body` has the same shape as the sync endpoint's response; its `id` is the generation ID (usable with [Report Feedback](https://openrouter.ai/docs/guides/overview/report-feedback) and generation lookups).

```typescript
const batch = await waitForBatch(batchId);
if (batch.status !== 'completed') {
  throw new Error(batch.error?.message ?? `Batch ended as ${batch.status}`);
}

const retry: string[] = [];
for (const result of batch.results) {
  if (result.error) {
    retry.push(result.custom_id);
    continue;
  }
  if (result.response.body.status !== 'completed') {
    retry.push(result.custom_id);
    continue;
  }
  const message = result.response.body.output.find(
    (item: { type: string }) => item.type === 'message',
  );
  const text = message?.content.find(
    (part: { type: string; text?: string }) => part.type === 'output_text',
  )?.text;
  if (text === undefined) {
    retry.push(result.custom_id);
    continue;
  }
  save(result.custom_id, text);
}
console.log(`Cost $${batch.usage.cost}. ${retry.length} requests to retry.`);
```

Completed batch (one success, one per-request error):

```json
{
  "id": "batch_123",
  "object": "batch",
  "status": "completed",
  "provider": "Anthropic",
  "request_counts": { "total": 2, "completed": 1, "failed": 1 },
  "usage": {
    "prompt_tokens": 40,
    "completion_tokens": 12,
    "total_tokens": 52,
    "cost": 0.000005,
    "is_byok": false
  },
  "results": [
    {
      "id": "batch_req_1",
      "custom_id": "review-1",
      "response": {
        "status_code": 200,
        "request_id": "request_1",
        "body": {
          "id": "gen-batch-1782097200-a1b2c3d4e5f6a7b8c9d0",
          "object": "response",
          "model": "anthropic/claude-haiku-5.5",
          "status": "completed",
          "output": [
            {
              "type": "message",
              "id": "msg_abc123",
              "status": "completed",
              "role": "assistant",
              "content": [{ "type": "output_text", "text": "positive", "annotations": [] }]
            }
          ]
        }
      },
      "error": null
    },
    {
      "id": "batch_req_2",
      "custom_id": "review-2",
      "response": null,
      "error": {
        "type": "invalid_request_error",
        "message": "max_tokens is greater than the model limit",
        "param": "max_tokens",
        "error_type": "invalid_request"
      }
    }
  ],
  "error": null
}
```

Failed batch (validation failure; no results):

```json
{
  "id": "batch_456",
  "object": "batch",
  "status": "failed",
  "request_counts": { "total": 2, "completed": 0, "failed": 0 },
  "usage": null,
  "results": null,
  "error": { "message": "Batch request 'review-2' contains unsupported 'input_audio' content." }
}
```

#### Delete the batch

Deletes stored requests and results early. Only a **finished** batch can be deleted; a running batch returns `409`.

```shell
curl -X DELETE https://openrouter.ai/api/v1/batches/batch_123 \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

```json
{
  "id": "batch_123",
  "object": "batch",
  "deletion": {
    "openrouter": "deleted",
    "upstream": { "provider": "Anthropic", "status": "deleted" }
  }
}
```

| `deletion.upstream.status` | Meaning |
| - | - |
| `deleted` | Provider's batch record deleted too (Anthropic, Fireworks, Google AI Studio, Google Vertex, Mistral support this). |
| `unsupported` | Provider has no batch-delete API. |
| `not_applicable` | The batch never reached the provider. |

`upstream` is omitted when no provider was assigned. Regardless of `upstream.status`, OpenRouter also deletes provider-side files (including input left over from a failed submission):

| Provider | Files deleted |
| - | - |
| OpenAI, Mistral, DeepInfra, Morph, Alibaba, Parasail, xAI | Uploaded input, output, and error files |
| Fireworks | Input and output datasets |
| Google AI Studio | Uploaded input and output files |
| Together | Uploaded input (Together does not allow deleting generated output) |
| Google Vertex | Output in OpenRouter-owned storage. Files in your own GCP bucket (BYOK) stay under your control. |
| Anthropic, Sail Research | None (inline requests, no files) |

- `200` = every cleanup step finished; a later `GET` returns `404`.
- `5xx` = cleanup stopped part-way; send the same `DELETE` again to resume.
- Deleting does **not** refund. Billing, generation, and audit records remain.
- Deleting a BYOK batch requires the provider key it ran on to still be enabled; otherwise `409`.

<a id="batch-choose-a-provider"></a>
#### Choose a provider

A batch runs on exactly one provider. Default selection: the cheapest provider serving the model in batch mode, after your account's provider allowlist, data policy, guardrails, and BYOK keys apply. Providers at the same price share traffic; a BYOK key is preferred over cheaper platform providers. If the chosen provider has no capacity, OpenRouter moves the batch to the next-cheapest allowed provider and bills that provider's price. Guardrail model allowlists match a batch model by its base model (allowing `openai/gpt-5-nano` also allows `openai/gpt-5-nano:batch`).

| Option | Batch | Behavior |
| - | - | - |
| `provider.only` | Supported | Use only these provider slugs, e.g. `["google-vertex"]`. |
| `provider.allow_fallbacks` | Supported | `false` keeps the batch on the provider chosen at submit; if it has no capacity, or can't take the batch's inline files, the batch fails. |
| `provider.order` | Rejected | Put only the provider you want in `only`. |
| `provider.sort` | Rejected | Batch always picks the lowest price first. |
| Other sync preferences | Rejected | Remove them. |

```json
{
  "endpoint": "/v1/chat/completions",
  "model": "google/gemini-3.8-flash",
  "provider": { "only": ["google-vertex"], "allow_fallbacks": false },
  "requests": [
    {
      "custom_id": "ticket-1",
      "body": { "messages": [{ "role": "user", "content": "Summarize this ticket in one sentence." }] }
    }
  ]
}
```

- `provider` must be at the **top level** next to `model`. A `provider` inside a request `body` does not pin the batch (it runs on the default provider).
- If no provider in `only` serves the model in batch mode → `404`.
- Embeddings batches do not accept `provider`.

#### Other endpoints

```json
{
  "endpoint": "/v1/messages",
  "model": "anthropic/claude-haiku-5.5",
  "requests": [
    { "custom_id": "msg-1", "body": { "max_tokens": 64, "messages": [{ "role": "user", "content": "Say hello." }] } }
  ]
}
```

```json
{
  "endpoint": "/v1/chat/completions",
  "model": "anthropic/claude-haiku-5.5",
  "requests": [
    { "custom_id": "chat-1", "body": { "messages": [{ "role": "user", "content": "Say hello." }] } }
  ]
}
```

```json
{
  "endpoint": "/v1/embeddings",
  "model": "openai/text-embedding-3-small",
  "requests": [
    {
      "custom_id": "emb-1",
      "body": {
        "input": [
          "The quick brown fox jumped over the lazy dog.",
          "Pack my box with five dozen liquor jugs."
        ]
      }
    }
  ]
}
```

Embeddings batches: `input` is a string, array of strings, token array, or array of token arrays. Multimodal input, `input_type`, and `provider` are not supported. Each result `body` is a standard embeddings response, one embedding per input string, ordered by `index`:

```json
{
  "id": "batch_req_emb_1",
  "custom_id": "emb-1",
  "response": {
    "status_code": 200,
    "request_id": "request_456",
    "body": {
      "object": "list",
      "data": [
        { "object": "embedding", "embedding": [0.0023064255, -0.009327292, 0.015797347], "index": 0 },
        { "object": "embedding", "embedding": [-0.012282, 0.0034567, -0.0089123], "index": 1 }
      ],
      "model": "openai/text-embedding-3-small",
      "usage": { "prompt_tokens": 18, "total_tokens": 18 }
    }
  },
  "error": null
}
```

#### Pricing and balance check

- Typically 50% of the standard per-token price. Not discounted: web search calls (standard rate); prompt caching rates vary by model. Model page price is authoritative.
- `usage.cost` on a completed batch = amount OpenRouter charged.
- Before accepting, OpenRouter estimates cost; if the estimate exceeds your balance, submit returns `402`. BYOK batches and invoiced accounts skip this check.
- BYOK: the provider bills inference; OpenRouter charges only the BYOK fee. Completed BYOK batches report `usage.is_byok: true` and the provider's inference estimate in `usage.cost_details.upstream_inference_cost`.

#### BYOK details

Batches route through your provider keys like sync requests. With the **BYOK-only** switch on (account or workspace):

- Keys marked fallback-only count, same as sync.
- If none of your keys covers the model → `404` at submit (instead of `202`).
- Keys for providers that can't run a batch on your own key — Fireworks, Mistral, Sail Research, and Claude Platform on AWS — don't count.

Provider notes:

- **Google Vertex**: batches use a bucket in your GCP project for input/output. Omit `bucket` and OpenRouter creates a private bucket on the first batch in each region, or give an existing bucket (permissions: [Google Vertex API keys](https://openrouter.ai/docs/guides/overview/auth/byok#google-vertex-api-keys)). Vertex BYOK accepts `gs://your-bucket/image.jpg` image URLs; your project's Vertex AI service agent must be able to read the image until the batch finishes; names must end in `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`, or `.heif`.
- **Anthropic**: a key declared for the US data region sends `inference_geo: "us"` on Claude 4.6 and later, same as sync.
- **Alibaba**: the key's `endpoint_url` must be a DashScope OpenAI-compatible base ending in `/v1` (e.g. `https://dashscope.aliyuncs.com/compatible-mode/v1`); other URLs → `400` at submit.
- **Keys with invalid header characters** (Unicode dash, invisible copy-paste characters) → `400` at submit. Google Vertex service-account JSON keys are exempt.

<a id="batch-limits"></a>
#### Limits

Limits follow upstream providers' batch limits, are adjusted over time, and can differ per account, so the docs list no fixed numbers. On a limit hit, `error.message` states the current value.

| Limit | Status when exceeded | Fix |
| - | - | - |
| Requests per batch | `413` | Split the batch. |
| Request body size (200 MB) | `413` | Split, or use file URLs instead of inline files. |
| Batches in progress per account | `429` | Wait for running batches to finish. |
| Requests in progress per account | `429` | Wait for running batches to finish. |
| Requests submitted per minute per account | `429` | Wait one minute. |

#### Common errors

| Status | Cause | Fix |
| - | - | - |
| `400` | Bad input; `requests` before other fields; private `callback_url`; model with no batch variant; invalid list query; bad BYOK key/endpoint. | Read `error.message`; pick a batch model. |
| `402` | Estimated cost > balance. | Add credits or split. |
| `403` | (spec) The resolved batch endpoint is blocked by account policy. | Check guardrails/policies. |
| `404` | No provider in `provider.only`, your account allowlist, or your guardrails serves the model in batch mode; or every batch endpoint for the model requires BYOK and no eligible key is configured (error names those providers); or unknown batch id. | Change `provider.only`/provider settings/guardrail; add a provider key; pick a model with a platform-billed batch endpoint. |
| `409` | Deleting a batch still running; BYOK key disabled; state changed during deletion. | Wait until it finishes / re-enable key. |
| `410` | Batch older than 30 days; results deleted. | Not recoverable. |
| `413` | Too many requests or > 200 MB. | Split; use file URLs. |
| `422` | Model targets the `:online` variant, or a feature batch rejects at submit (spec also: custom IDs violating constraints). | Remove it or use sync. |
| `429` | Too many submits, or too many batches/requests in progress. | Wait, then retry. |

**Content screening.** A batch can fail validation after `202` when image screening rejects a request: `status: "failed"`, `error` identifies the request and reports `This request contains prohibited content.`, and no requests in that batch are submitted. Terminal — do not retry the same content. If screening is temporarily unavailable, the batch usually proceeds without waiting; for accounts where screening is required it stays `validating` while OpenRouter retries — keep polling the same batch rather than resubmitting (a replacement could leave both eligible to run). Screening has a time limit: when it runs out, remaining requests usually continue unscreened, but where screening is required the batch fails with `This batch has too many images to screen within the submit window. Split it into smaller batches.` — retrying won't help; split it.

#### Gotchas

- There is **no JSONL upload** (unlike OpenAI's batch API). Everything is inline JSON; results come back inline from `GET`.
- `requests` must be the **last** top-level key or you get `400`.
- `202` ≠ valid. Always wait for a final status; check `request_counts.failed` and each result's `error`.
- `completed` can contain failed requests; for Responses bodies also check `response.body.status === "completed"`.
- Results are unordered — key on `custom_id`, and keep `custom_id` unique.
- Pin `provider.only` (top level, not in `body`) for images/files/inline media.
- Don't expect `provider.order`/`sort` to work; they are rejected.
- No cancel; delete only after finished; delete doesn't refund.
- Save results within 30 days (`410` afterwards).
- Webhook: verify on raw body, dedupe on event `id`, return non-2xx to get a retry, and re-fetch until `GET` reflects the final status.

Sources: https://openrouter.ai/docs/guides/features/batch-api, https://openrouter.ai/docs/batch-quickstart, OpenAPI spec (`openapi.yaml`, Batch tag), https://openrouter.ai/docs/client-sdks/typescript/sdks/batch/README

### 11.2 Files API (beta)

> **Beta.** The API and behavior may change.

Stores files in a **workspace** so you can upload once and reference them in many requests — chiefly by loading them into a sandbox container via `file_ids` (see [§11.3](#113-containers-beta)). **Global endpoint only**: requests through `eu.openrouter.ai` / `us.openrouter.ai` return `403`.

#### Endpoints

| Method & path | Purpose |
| - | - |
| `POST /api/v1/files` | Upload (`multipart/form-data`, file in the `file` field). Returns metadata with an `or_file_...` id. |
| `GET /api/v1/files` | List files in the workspace. |
| `GET /api/v1/files/{file_id}` | File metadata. |
| `GET /api/v1/files/{file_id}/content` | Download — **only** for model-created/promoted files (`downloadable: true`). |
| `DELETE /api/v1/files/{file_id}` | Delete; frees quota. Unknown id → `404`. |

Common query params (all routes): `workspace_id` (UUID; select a workspace), `provider` (`openai` or `anthropic`; see below). SDK ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)): TS `openRouter.files.upload/list/retrieve/download/delete`.

Upload a file. The response's `id` (`or_file_...`) is what you pass later, e.g. in a container's `environment.file_ids` ([§11.3](#113-containers-beta)).

```shell
curl https://openrouter.ai/api/v1/files \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -F "file=@report.pdf"
```

TypeScript SDK (from the SDK reference; `provider: "openai"` routes to OpenAI's Files API with your BYOK key — omit it for OpenRouter storage):

```typescript
import { OpenRouter } from "@openrouter/sdk";
import { openAsBlob } from "node:fs";

const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" });

const file = await openRouter.files.upload({
  // provider: "openai",
  requestBody: { file: await openAsBlob("report.pdf") },
});
```

Python:

```python
import os
import requests

response = requests.post(
    "https://openrouter.ai/api/v1/files",
    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
    files={"file": ("report.pdf", open("report.pdf", "rb"))},
)

print(response.json()["id"])  # or_file_...
```

Plain `fetch` works the same way: `FormData` with a `file` part (`form.append('file', new File([pdfBytes], 'report.pdf'))`), `POST` it with the `Authorization` header, then read `file.id`.

Then attach it to a sandbox container in a request (tool config [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities); rules [§11.3](#113-containers-beta)):

```json
{
  "type": "openrouter:shell",
  "parameters": {
    "environment": { "type": "container_auto", "file_ids": ["or_file_011CNha8iCJcU1wXNR6q4V8w"] }
  }
}
```

#### Upload limits

| Limit | Value / error |
| - | - |
| Max file size | 100 MiB (104,857,600 bytes); larger → `413` |
| Empty file | `400` |
| Workspace storage | 10 GiB total; full → uploads return `403` |

#### Pricing and retention

- No separate charge for the Files API.
- **Workspace files do not expire.**
- Files *inside a container* are different: kept 30 days after the container was last used, then deleted. Promote them to the workspace to keep them ([§11.3](#113-containers-beta)).

#### File types

Type is detected from **content** — not filename or declared content type. Anything else → `400`.

- PDF documents
- PNG, JPEG, GIF, WebP images
- DOCX, XLSX, PPTX documents
- MP3, WAV, FLAC, OGG audio
- UTF-8 text — reported by structure as JSON, NDJSON, CSV, Markdown, or plain text (MIME `application/json`, `application/x-ndjson`, `text/csv`, `text/markdown`, `text/plain`)

#### Filenames and folders

A filename can contain `/` to form a folder path (e.g. `data/report.csv`); the path is part of the filename.

- 1–255 characters.
- Must not start or end with `/`.
- Path segments must not be empty, `.`, or `..`.
- Disallowed characters: `< > : " | ? * \` and control characters.

The web app's [Files page](https://openrouter.ai/workspaces/default/files) lets you upload files and create files inside folders, but **not download** them.

#### List files

- `limit`: 1–1000, default 100.
- Response: `data`, `has_more`, `cursor`. Pass `cursor` to get the next page.
- OpenAI-style `after=<file id>` also works. **Do not mix `cursor` and `after`** in one request. (Spec also lists Anthropic-style `after_id`; `before_id` and `order=desc` are not supported by OpenRouter storage.)
- Response shape is negotiated: default = OpenRouter shape; requests that look like OpenAI SDK requests get the OpenAI shape; requests with an `anthropic-version` header get the Anthropic shape.

```shell
curl "https://openrouter.ai/api/v1/files?limit=100" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### Metadata

```json
{
  "id": "or_file_011CNha8iCJcU1wXNR6q4V8w",
  "type": "file",
  "filename": "data/report.csv",
  "mime_type": "text/csv",
  "size_bytes": 24576,
  "created_at": "2026-08-25T00:00:00Z",
  "downloadable": false
}
```

#### Download rules

- **Files you upload cannot be downloaded.** They can only be used inside OpenRouter sandboxes (shell/bash server tools). `GET /api/v1/files/{file_id}/content` on an uploaded file → `400`. Keep your own copy.
- Files a sandbox command creates: download via the container files endpoints, or promote to a workspace document (`downloadable: true`, then downloadable via `/files/{id}/content`).
- Files written/edited by the [files server tool](https://openrouter.ai/docs/guides/features/server-tools/files) also have `downloadable: true`.

#### Workspace scoping

- Default workspace = the API key's workspace; a key without a workspace uses your default workspace.
- `workspace_id` query param selects a workspace.
- A key scoped to a different workspace → `403`. A file id from another workspace → `404`.

#### Provider-hosted files

`provider=openai` or `provider=anthropic` (query param) proxies the request to that provider's own Files API using the BYOK key you configured for it. No configured key → `400`.

#### Gotchas

- Uploads are write-only from your perspective — don't use the Files API as backup storage.
- `403` can mean: in-region endpoint, workspace quota full, or wrong-workspace key. Read the message.
- File type sniffing ignores extensions: a CSV renamed `.txt` is still CSV; a binary blob named `.pdf` is rejected.

Sources: https://openrouter.ai/docs/guides/features/files-api, OpenAPI spec (`openapi.yaml`, Files tag), https://openrouter.ai/docs/client-sdks/typescript/sdks/files/README

### 11.3 Containers (beta)

> **Beta** (server tools are beta). Global endpoint only; in-region endpoints return an error.

A container is an isolated Linux environment in which the [`openrouter:shell`](https://openrouter.ai/docs/guides/features/server-tools/shell) and [`openrouter:bash`](https://openrouter.ai/docs/guides/features/server-tools/bash) server tools run commands (tool configuration: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). Each container has its own file system; files in the home directory are saved after every command so later requests can reuse them.

#### Container ids and `environment`

The container is chosen by the server tool's `parameters.environment`. Tool results return the id in `container_id`.

```json
{ "type": "openrouter:shell", "parameters": { "environment": { "type": "container_auto" } } }
```

```json
{
  "type": "openrouter:shell",
  "parameters": { "environment": { "type": "container_reference", "container_id": "my-project" } }
}
```

| `environment.type` | Behavior |
| - | - |
| `container_auto` (default when `environment` omitted) | Id derived from the request (below). |
| `container_reference` | Use `container_id` you pass: a `container_id` returned from another session, or a custom id (1–40 chars, letters/digits/`_`/`-`). Same id → same container and files. |

`container_auto` id derivation:

1. If the request has a session id → `sess_` + session id. All requests with the same session id share one container.
2. Else, the most recently returned `container_id` in the replayed conversation, if any (multi-turn conversations keep their files).
3. Else `gen_` + hash of the request id (one container per request).

Session id sources, in priority order: `session_id` body field → `x-session-id` header → `prompt_cache_key` body field. Allowed characters: letters, digits, `_`, `-`; ids with other characters are ignored (falls back to no-session behavior). Ids longer than 20 characters use only the **last 20** characters.

Scoping: containers are scoped to your workspace — two workspaces can use the same id without seeing each other's files. The shell tool and bash tool use **separate compute** environments even for the same container id, but share the same saved files.

#### Lifetime

- Sleeps after **5 minutes idle** (not configurable).
- Sleep keeps home-directory files. The next request with that id starts a new sandbox and loads the saved files first. **Not restored**: open processes, environment variables, installed system state.
- Saved container files are kept **30 days after last use**, then deleted. Promote files to the workspace to keep them; workspace files never expire.

#### File persistence

- Commands run in `/workspace/home` (also `$HOME`). After every command, changed files under home are saved. Deleted files stay deleted. Files outside home are not saved.
- Each tool result's `files` lists created/changed files (max 10; if more changed, the 10 most recent). Deleted files are not reported.

```json
{
  "type": "openrouter_shell_tool_result",
  "container_id": "sess_abc123",
  "files": [
    {
      "type": "container_file_citation",
      "container_id": "sess_abc123",
      "file_id": "cfile_b3V0L3JlcG9ydC5jc3Y",
      "filename": "out/report.csv",
      "start_index": 0,
      "end_index": 0
    }
  ],
  "content": [ ... ]
}
```

#### Attach workspace files (`file_ids`)

Upload with the Files API ([§11.2](#112-files-api-beta)), then list ids in `environment.file_ids`; they are copied into the container before the first command runs.

```json
{
  "type": "openrouter:shell",
  "parameters": {
    "environment": { "type": "container_auto", "file_ids": ["or_file_011CNha8iCJcU1wXNR6q4V8w"] }
  }
}
```

- Up to **20** files per request (`file_ids` array per request, not per container lifetime).
- Each appears in home as a writable copy named `<last 8 chars of id>-<base filename>`: `data/report.csv` with id ending `NR6q4V8w` → `~/NR6q4V8w-report.csv`.
- The copy is independent; container changes don't touch the workspace file.
- Unknown or malformed id → request fails `400` before any command runs.

#### Download container files

| Method & path | Purpose |
| - | - |
| `GET /api/v1/containers/{container_id}/files` | List. `limit` 1–1000 (default 100). While `has_more`, pass `last_id` as `after`. |
| `GET /api/v1/containers/{container_id}/files/{file_id}` | One file's metadata. |
| `GET /api/v1/containers/{container_id}/files/{file_id}/content` | Stream content. |
| `POST /api/v1/containers/{container_id}/files/{file_id}/promote` | Copy into workspace documents. |

```json
{
  "object": "list",
  "data": [
    {
      "id": "cfile_b3V0L3JlcG9ydC5jc3Y",
      "object": "container.file",
      "container_id": "sess_abc123",
      "bytes": 123,
      "created_at": 1755640000,
      "path": "out/report.csv",
      "source": "assistant"
    }
  ],
  "first_id": "cfile_b3V0L3JlcG9ydC5jc3Y",
  "last_id": "cfile_b3V0L3JlcG9ydC5jc3Y",
  "has_more": false
}
```

- Container file ids start with `cfile_`, encode the file path, and match `file_id` in tool results' `files`.
- `last_id` is a resume cursor, not always a listed file's id: a page can return empty `data` with `has_more: true` — keep paging.
- SDK ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)): TS `openRouter.containers.listContainerFiles / getContainerFile / downloadContainerFileContent / promoteContainerFile`.

```shell
curl "https://openrouter.ai/api/v1/containers/sess_abc123/files" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### Promote a container file to the workspace

`POST /api/v1/containers/{container_id}/files/{file_id}/promote` returns a new workspace document (Files API shape, new `or_file_` id, `downloadable: true`):

```shell
curl -X POST "https://openrouter.ai/api/v1/containers/sess_abc123/files/cfile_b3V0L3JlcG9ydC5jc3Y/promote" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

```json
{
  "id": "or_file_011CNha8iCJcU1wXNR6q4V8w",
  "type": "file",
  "filename": "out/report.csv",
  "mime_type": "text/csv",
  "size_bytes": 123,
  "created_at": "2026-08-25T00:00:00Z",
  "downloadable": true
}
```

- Independent copy; later container changes don't affect it.
- Keeps the container path as its filename.
- > 100 MiB → `413`.
- Any sandbox-produced content is accepted; type is read from content, unknown content stored as binary.
- Promoted documents stay downloadable via `GET /api/v1/files/{id}/content` (direct uploads stay non-downloadable). Use the new id in `file_ids` like any upload.

#### Network access

No outbound internet by default. `network_policy` on the shell/bash tool can allow specific domains (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) server tools).

#### Lifecycle summary

```text
upload (POST /files) ──► or_file_… ──file_ids──► container (sess_/gen_/custom id)
                                                   │  commands in /workspace/home
                                                   │  sleeps after 5 min idle; files kept 30 days after last use
                                                   ▼
                              cfile_… ──GET …/content──► download
                              cfile_… ──POST …/promote──► new or_file_… (downloadable, never expires)
```

#### Gotchas

- Long session ids are truncated to the last 20 chars — two sessions whose ids share the same 20-char suffix share a container.
- Use `container_reference` with a stable custom id when you want deterministic reuse across unrelated requests.
- Don't rely on background processes, `export`ed env vars, or `apt install` surviving sleep.
- Only home-directory files persist; write outputs under `~/`.
- Tool results list at most 10 changed files — list the container to find the rest.

Sources: https://openrouter.ai/docs/guides/features/containers, https://openrouter.ai/docs/guides/features/files-api, OpenAPI spec (`openapi.yaml`, Containers tag)

### 11.4 Guardrails

Guardrails let organizations control how members and API keys use OpenRouter: spending limits, model/provider restrictions, data-privacy enforcement, data-region restrictions, and content moderation (prompt injection, sensitive info, custom regex filters). Account-wide settings still apply; guardrails add **tighter** restrictions for individual keys or users.

Guardrails are the original, combined object. [Guardrail Policies](#115-guardrail-policies) ([§11.5](#115-guardrail-policies)) split the same settings into three independently assignable policy types; existing guardrails keep working and are mirrored into policies. Endpoint schemas: [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise).

#### Enabling

1. Open the workspace's **Guardrails** page (default workspace: [Workspaces > Default > Guardrails](https://openrouter.ai/workspaces/default/guardrails)).
2. **New Guardrail**, configure, save.
3. Assign it under the guardrail's **Members** or **API Keys** sections.

Account-wide data policies and provider restrictions live separately in [Settings > Privacy](https://openrouter.ai/settings/privacy); workspaces inherit them and guardrails add more restrictive rules. In an organization, you must be an **org admin** to create and manage guardrails.

#### Guardrail settings

| Setting (dashboard) | API field(s) | Notes |
| - | - | - |
| Budget limit | `limit_usd`, `reset_interval` (`daily`, `weekly`, `monthly`) | Spending cap in USD. Must send both together or `400`. Requests rejected when reached. |
| Include BYOK spend | `include_byok_in_budgets` (default `false`) | Also count BYOK inference spend (what OpenRouter would have charged). |
| Model allowlist | `allowed_models`; also `ignored_models` | Empty/`null` = allow all. Slug or canonical slug accepted on write; stored/returned as canonical slugs. |
| Provider allowlist | `allowed_providers`; also `ignored_providers` | Empty/`null` = allow all. |
| Zero Data Retention per model group | `enforce_zdr_anthropic`, `enforce_zdr_openai`, `enforce_zdr_google`, `enforce_zdr_xai`, `enforce_zdr_other` | Guide groups: Anthropic, OpenAI, Google, SpaceXAI (API field `enforce_zdr_xai`), all other models. `enforce_zdr` is **deprecated**; when sent it is copied into any per-group field not explicitly set. See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) ZDR. |
| Safety Retention | `allow_safety_retention_google`, `allow_safety_retention_other` | When ZDR is enforced: **ZDR only** vs **Allow Safety Retention** for Google and for other models. Safety Retention endpoints may retain prompts/responses only to prevent abuse, not for training. Can only be more restrictive than the account setting; inherits it when omitted. |
| Data regions | `allowed_data_regions`: `global` (`https://openrouter.ai`), `europe` (`https://eu.openrouter.ai`), `us` (`https://us.openrouter.ai`) | Requests through any other domain rejected. `null` = unrestricted. **Business/Enterprise only.** Note: guardrail value for EU is `europe`; the Models API region filter uses `region=eu`. |
| Training / publication | `enable_paid_model_training`, `enable_free_model_training`, `enable_free_model_publication` | Whether endpoints that train on data / publish prompts are allowed. |
| First-party harness models | `enforce_first_party_harness_models` | (spec) Codex lists only OpenAI models; Claude Code/Claude Desktop list only Anthropic models. Affects only the `GET /models` list those harnesses request; a model named directly is still routed. Any `true` across applicable guardrails applies. |
| Security (prompt injection) | `content_filter_builtins` entry with `slug: "regex-prompt-injection"` | See [§11.8](#118-prompt-injection-detection-and-allowlist). |
| Sensitive Info | `content_filter_builtins` (presets) and `content_filters` (custom) | See [§11.6](#116-sensitive-info-detection). |
| Custom content filters | `content_filters: [{ pattern, action, label? }]` | Regex redact/block (see below). |
| Metadata | `name` (1–200 chars, required), `description` (≤1000), `workspace_id` | |

Individual API key credit limits still apply — **the lower limit wins**.

If your plan stops including in-region routing while a data-region guardrail is assigned, governed requests are rejected until you upgrade or clear the restriction (regions not in the list stay blocked; `global` in the list keeps `https://openrouter.ai` open).

#### Assigning guardrails

> **A guardrail enforces nothing until it is assigned.** Passing `workspace_id` on create only *places* it in that workspace for organization. To restrict all traffic in a workspace without per-key/per-member assignments, configure the **workspace default guardrail** (below).

| Level | Effect |
| - | - |
| Member assignment | Baseline for all of that member's API keys and chatroom usage. |
| API key assignment | Granular control; layers on top of the member guardrail. |
| Workspace default guardrail | Applies to all traffic in the workspace without explicit assignment. |
| Account-wide privacy/provider settings | Always enforced as a default guardrail. |

Only **one** guardrail can be directly assigned to a given user or key. All of a member's API keys implicitly follow that member's guardrail, even if the key also has its own guardrail.

API (management key; see [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)): `POST /guardrails/{id}/assignments/keys` and `/members` (bulk assign), `.../keys/remove` and `.../members/remove` (bulk unassign), `GET /guardrails/{id}/assignments/keys|members`, `GET /guardrails/assignments/keys|members` (all assignments).

#### Hierarchy — how multiple guardrails combine

Stricter rules always win:

| Setting | Combination rule |
| - | - |
| Provider allowlists | Intersection across all applicable guardrails. |
| Model allowlists | Intersection. |
| Zero Data Retention | OR per model group — enforced for a group if any guardrail enforces it. |
| Safety Retention | Most restrictive wins per model group — if the account or any guardrail is ZDR-only for Google or other models, Safety Retention endpoints are excluded for that group. |
| Data regions | Intersection across guardrails that set `allowed_data_regions` (unrestricted guardrails don't affect the result). A member/key guardrail can only narrow the workspace default's regions. |
| Sensitive Info / content filters | Union; if the same entity type/pattern has different actions, block beats redact. |
| Prompt injection action | Most restrictive: `block` > `redact` > `flag`. |
| Budget limits | Each guardrail's budget checked independently. |
| First-party harness models | Any `true` applies. |

Example: member guardrail allows providers A, B, C; key guardrail allows A, B → only A, B available for that key.

**Eligibility preview**: when viewing a guardrail, the dashboard shows which providers and models remain available after combining it with your account settings. Programmatically, `GET /api/v1/models/user` lists models filtered by provider preferences, privacy settings, and guardrails ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

#### Enforcement order (as documented)

The docs do not publish a single numbered pipeline, but they establish:

1. **Ingress / region**: a data-region restriction rejects the request before any inference happens.
2. **Policy checks before routing**: budget limits (guardrail, policy, workspace budget, key credit limit) and model/provider allowlists/ZDR are checked before the request is routed; budget checks run before dispatch (in-flight requests already dispatched complete, so spend can slightly exceed a limit).
3. **Runtime content checks** (custom content filters, sensitive info, prompt injection) scan the **input** before forwarding: redact rewrites the request, block returns `403`. Time spent here is reported as `guardrails_ms` in Broadcast router timing ([§11.16](#1116-broadcast)).
4. **Routing** among the remaining eligible providers/models.

The relative order of individual content stages is not documented; the `openrouter_metadata.pipeline` array (router metadata opt-in) shows every guardrail stage that ran for a request.

#### Budget enforcement

Budgets are **per user and per key**, never a shared pool among everyone assigned. A key's usage counts toward both the key's budget and its owning member's budget. Default counts only OpenRouter credit spend; `include_byok_in_budgets: true` adds BYOK inference spend.

- **Example 1**: member guardrail $50/day assigned to Alice, Bob, Carol → each has their own $50/day.
- **Example 2**: Alice's keys A and B each have a $20/day guardrail; A spends $15, B $10 (both within key limits). Alice's member usage is $25; if Alice also has a $20/day member guardrail, her requests are blocked.
- **Example 3**: Bob's member guardrail $100/day; his key's guardrail $30/day → the key can spend $30/day; Bob's total across keys can't exceed $100/day. Both checked on every request.

For a pooled cap on a whole workspace, use workspace budgets ([§11.10](#1110-workspace-budgets)). Structuring guidance: Spend Controls best practices ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

#### Custom content filters

Each guardrail can carry regex patterns, each with an action:

| Action | Behavior |
| - | - |
| `redact` | Matched spans replaced with a placeholder (`[REDACTED]`, or the filter's `label`) before forwarding. |
| `block` | Request rejected with `403` before reaching the model. |
| `flag` | (spec enum) Detect-only; recorded, not enforced. |

Patterns run locally against every user message (negligible latency). JavaScript-flavoured regex.

Supported: character classes (`[a-z]`, `\d`, `\w`, `\s`), quantifiers (`*`, `+`, `?`, `{n,m}`), alternation, non-capturing groups `(?:…)`, named groups `(?<name>…)`, anchors (`^`, `$`, `\b`), escapes (`\.`, `\(`, `\\`).

**Not allowed** in new/edited patterns (rejected with `invalid_regex_pattern` on create and update):

- Lookaheads `(?=…)`, `(?!…)`
- Lookbehinds `(?<=…)`, `(?<!…)`
- Backreferences `\1`, `\k<name>`
- Excessive backtracking, e.g. nested quantifiers `(a+)+`

Limits: up to **100,000 characters per pattern**; multiple patterns per guardrail, each evaluated independently.

```json
{
  "content_filters": [
    { "pattern": "AKIA[0-9A-Z]{16}", "action": "block", "label": "AWS Key" },
    { "pattern": "PROJ-\\d{4,6}", "action": "redact" }
  ]
}
```

#### When a request is blocked

All guardrail blocks return **HTTP 403**. Budget, allowlist, and data-region rejections are 403 too, but only **runtime content checks** include stage details in `openrouter_metadata`.

Data-region rejection (names permitted hostnames):

```json
{
  "error": {
    "code": 403,
    "message": "This request arrived on the global data region, but the key's workspace permits requests only on these OpenRouter hostnames: eu.openrouter.ai. Use one of the permitted hostnames or update the workspace guardrail allowed data regions."
  }
}
```

Prompt-injection block:

```json
{
  "error": {
    "code": 403,
    "message": "Request blocked: prompt injection patterns detected",
    "metadata": { "patterns": ["ignore all previous instructions"] }
  }
}
```

With the router-metadata opt-in header `X-OpenRouter-Experimental-Metadata: enabled` ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) router metadata), the 403 also includes `openrouter_metadata` with a `pipeline` array:

```json
{
  "error": { "code": 403, "message": "Request blocked: prompt injection patterns detected", "metadata": { "patterns": ["ignore all previous instructions"] } },
  "openrouter_metadata": {
    "requested": "openai/gpt-4o",
    "strategy": "direct",
    "region": "iad",
    "summary": "available=1",
    "attempt": 1,
    "is_byok": false,
    "endpoints": { "total": 1, "available": [{ "provider": "OpenAI", "model": "openai/gpt-4o", "selected": false }] },
    "pipeline": [
      {
        "type": "guardrail",
        "name": "regex_pi_detection",
        "guardrail_id": "grd_abc123",
        "guardrail_scope": "api-key",
        "summary": "Blocked: prompt injection detected (1 pattern matched)",
        "data": { "action": "blocked", "detected": true, "engines": ["regex"], "patterns": ["ignore all previous instructions"] }
      }
    ]
  }
}
```

Full shapes: Errors → Guardrail Errors ([§4](04-api-fundamentals.md#4-api-fundamentals)) and Router Metadata → Error Responses ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)).

#### API: update the workspace default guardrail

Each workspace has a **default guardrail** applied to all its traffic. It is named `Workspace <workspace-id> Default` (`<workspace-id>` = workspace UUID).

```bash
# 1. List guardrails in the workspace
curl "https://openrouter.ai/api/v1/guardrails?workspace_id=$WORKSPACE_ID" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"

# 2. Find the one named "Workspace <workspace-id> Default", then PATCH it
curl -X PATCH "https://openrouter.ai/api/v1/guardrails/$GUARDRAIL_ID" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_providers": ["openai", "anthropic"],
    "limit_usd": 100,
    "reset_interval": "monthly",
    "include_byok_in_budgets": true,
    "enforce_zdr_anthropic": true,
    "enforce_zdr_openai": true
  }'
```

`GET /guardrails` defaults to the default workspace when `workspace_id` is omitted; `offset` (default 0) and `limit` (1–100, default 50) paginate. `PATCH` updates only the fields you send. If the Default workspace has been deleted, creating a guardrail without `workspace_id` returns `400`.

#### Gotchas

- Creating a guardrail with `workspace_id` does not apply it. Assign it, or edit the workspace default guardrail.
- A `null` `workspace_id` on a guardrail means an unscoped legacy guardrail — **not** "the default workspace" and not "all workspaces".
- `limit_usd` without `reset_interval` (or vice versa) → `400`.
- Use the per-group `enforce_zdr_*` fields; `enforce_zdr` is deprecated.
- Data-region guardrail value is `europe`, not `eu`.
- Content filters scan **requests only**; model output is not filtered.
- Creating a guardrail with a person-name or address sensitive-info filter can return `403` if the workspace doesn't allow those filters (spec).
- Managing the same rules through both guardrails and Guardrail Policies causes drift — see [§11.5](#115-guardrail-policies) migration.

Sources: https://openrouter.ai/docs/guides/features/guardrails, OpenAPI spec (`openapi.yaml`, Guardrails tag)

### 11.5 Guardrail Policies

Guardrail Policies split a guardrail into **three separate policy types** that are created and assigned independently, so e.g. a team can share one model-access policy while each person has a different budget.

| Policy type (`policy_type`) | Controls | Config fields (same names as guardrails) |
| - | - | - |
| Budget (`budget`) | USD cap resetting daily/weekly/monthly; whether BYOK spend counts. | `limit_usd`, `reset_interval`, `include_byok_in_budgets` |
| Model & provider access (`model_availability`) | Allowed/ignored models and providers, ZDR per model group, Safety Retention, training/publication choices, data regions. | `allowed_providers`, `ignored_providers`, `allowed_models`, `ignored_models`, `enforce_zdr_*`, `allow_safety_retention_*`, training/publication settings, `allowed_data_regions` |
| Content moderation (`moderation`) | Prompt injection protection, sensitive info detection, custom content filters. | `content_filter_builtins`, `content_filters`, prompt-injection and sensitive-info settings |

The spec additionally lists a `rate_limit` policy type on assignment routes and moderation config fields not described in the guides (`armor`, `lakera_injection_protection_mode`, `enable_model_armor_injection_protection`, `model_armor_injection_protection_mode`, `model_armor_injection_confidence_level`, `pii_filters`, `content_filter_patterns`, `content_filter_blocks_requests`, `platform_moderated_providers`, `platform_image_moderated_providers`, `broadcast_model_armor_flagged_requests`). Treat these as undocumented here; see [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise) for their schemas.

#### Where policies apply

1. **Workspace-wide policies** — apply to every member and API key in a workspace; cannot be overridden or loosened, only tightened by member/key policies. One workspace-wide policy can be assigned to multiple workspaces. Managed under [Account > Guardrails](https://openrouter.ai/workspaces/guardrails). **Only org admins** manage workspace-wide policies. Use for whole-workspace rules (max per-person spend, mandatory ZDR).
2. **Member and API key policies** — apply to specific members/keys inside **one** workspace. A member's policy also covers their chatroom usage and the API keys they created. Managed under **Workspace > Guardrails** (Assignments tab).

A member or API key can have **at most one policy of each type** per workspace. Assigning a new budget policy replaces the old budget policy and leaves model-access and moderation policies alone.

An organization API key with no policy of its own follows the member who created it (its spend counts toward that member's budget). If the creator leaves the org, the key falls back to the workspace default.

Permissions: org admins manage every policy; workspace admins can create, edit, delete and assign policies in workspaces they administer.

#### Defaults

Per policy type, at each level:

- **Default workspace-wide policy**: applies to every workspace without its own workspace-wide policy of that type, including workspaces created later.
- **Default member & API key policy within a workspace** (`is_workspace_default`): applies to every member/key in that workspace without its own policy of that type, including ones added later.
- Remove or replace a default per workspace/member/key at the level where it's set (replace with another policy or with none). Account-wide privacy settings always apply; workspace-wide policies still apply after a member-level default is removed.
- Defaults are optional; without one, only direct assignments apply.

#### How policies combine

- Models and providers: only those allowed by **every** applicable policy.
- ZDR: enforced for a model group if **any** applicable policy enforces it.
- Data regions: only regions allowed by every policy that sets them (unrestricted policies don't change the result).
- Sensitive info and content filters: combined; block beats redact for the same filter.
- Budgets: each checked independently; blocked when **any** is used up.
- Account-wide privacy/provider settings and individual API key credit limits always apply on top.

#### Budget enforcement

- Tracked per person and per API key, never pooled.
- Member budget $50/day → each assigned member gets their own $50/day; spend from all their keys adds up.
- API key budget limits that key's own spend.
- A workspace-wide budget limits **each** member and **each** key in that workspace (a $100/month workspace-wide budget means no one spends more than $100/month even if their own budget is higher).
- Total workspace cap → use a workspace budget ([§11.10](#1110-workspace-budgets)).
- Resets at **00:00 UTC**: daily every day, weekly on Monday, monthly on the 1st.
- Check which budgets apply to a key and how much remains with `GET /api/v1/key` ([§4](04-api-fundamentals.md#4-api-fundamentals) limits / [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

Example: workspace-wide $100/month; workspace default budget $50/month; Alice given her own $300/month policy → Alice is still capped at $100/month by the workspace-wide policy. Raise the workspace-wide limit or remove the workspace from it.

#### API routes

Management key required. Base: `https://openrouter.ai/api/v1/guardrails/policies`.

| Route | Purpose |
| - | - |
| `GET`, `POST /account` | List or create workspace-wide policies |
| `PUT`, `DELETE /account/{id}` | Update or delete a workspace-wide policy |
| `GET`, `POST /budget` | List (`?workspace_id=`) or create budget policies |
| `GET`, `PUT`, `DELETE /budget/{id}` | Read, update, delete a budget policy |
| `/moderation`, `/moderation/{id}` | Same routes for content moderation policies |
| `/model-availability`, `/model-availability/{id}` | Same routes for model & provider access policies |
| `GET`, `PUT /assignments/members/{member_id}` | Read/change one member's policy of one type |
| `GET`, `PUT /assignments/api-keys/{key_hash}` | Read/change one API key's policy of one type |

- `GET` and `DELETE` on a workspace policy take `workspace_id` as a query parameter.
- List routes return `{ "data": [...], "total_count": N }`, with optional `offset`/`limit`.
- API keys are identified by **hash** (from List API keys). Member IDs = user IDs from List organization members (`id`) or a workspace's member list (`user_id`).
- SDK ([§3](03-client-sdks.md#3-client-sdks-typescript-python-go)): TypeScript `openRouter.guardrailPolicies.*`, Python `guardrailpolicies`.

Create a budget policy and assign it:

```bash
curl -X POST https://openrouter.ai/api/v1/guardrails/policies/budget \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering monthly budget",
    "policy_type": "budget",
    "workspace_id": "YOUR_WORKSPACE_ID",
    "config": { "limit_usd": 200, "reset_interval": "monthly", "include_byok_in_budgets": false },
    "member_ids": ["user_2abcDEFghiJKLmnoPQRstu"],
    "api_key_hashes": ["YOUR_API_KEY_HASH"]
  }'
```

`"is_workspace_default": true` makes it the workspace default for its type; `opted_out_member_ids` / `opted_out_api_key_hashes` keep specific members/keys off the default.

Create a model & provider access policy:

```bash
curl -X POST https://openrouter.ai/api/v1/guardrails/policies/model-availability \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Approved models",
    "policy_type": "model_availability",
    "workspace_id": "YOUR_WORKSPACE_ID",
    "is_workspace_default": true,
    "config": {
      "allowed_providers": ["openai", "anthropic"],
      "allowed_models": ["openai/gpt-4o", "anthropic/claude-sonnet-4"],
      "enforce_zdr_anthropic": true,
      "enforce_zdr_openai": true
    }
  }'
```

Create a workspace-wide moderation policy for two workspaces:

```bash
curl -X POST https://openrouter.ai/api/v1/guardrails/policies/account \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block secrets",
    "policy_type": "moderation",
    "is_default": false,
    "workspace_ids": ["WORKSPACE_ID_1", "WORKSPACE_ID_2"],
    "config": { "content_filter_builtins": [{ "slug": "secrets", "action": "block" }] }
  }'
```

`"is_default": true` covers every workspace in the account; list exclusions in `opted_out_workspace_ids`.

#### Updating a policy (`PUT` semantics)

- `PUT` **replaces** `name` and `config` — always send the full `config`.
- Assignments: send **both** `member_ids` and `api_key_hashes` with complete new lists to replace them; omit **both** to leave assignments unchanged (e.g. when only changing the limit).

#### Changing one member or API key (optimistic concurrency)

Full-list updates can clobber concurrent changes. The single-subject routes change one member/key at a time with a compare-and-swap:

```bash
curl "https://openrouter.ai/api/v1/guardrails/policies/assignments/members/user_2abcDEFghiJKLmnoPQRstu?workspace_id=YOUR_WORKSPACE_ID&policy_type=budget" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

```json
{
  "data": {
    "policy_ids": [],
    "workspace_default_policy_ids": ["2c6f1a4e-0b7d-4e59-9a61-3f8d2e7c1b90"],
    "opted_out": false
  }
}
```

```bash
curl -X PUT https://openrouter.ai/api/v1/guardrails/policies/assignments/members/user_2abcDEFghiJKLmnoPQRstu \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "YOUR_WORKSPACE_ID",
    "policy_type": "budget",
    "policy_id": "BUDGET_POLICY_ID",
    "assigned": true,
    "expected_assignment": {
      "policy_ids": [],
      "workspace_default_policy_ids": ["2c6f1a4e-0b7d-4e59-9a61-3f8d2e7c1b90"],
      "opted_out": false
    }
  }'
```

- `assigned: true` assigns, `false` removes.
- If the stored assignment differs from `expected_assignment` → **`409 Conflict`**; re-read and retry.
- Same pattern for `/assignments/api-keys/{key_hash}`.

#### Limits

- One create/update request can name up to **10,000** members and API keys total; a policy itself can cover any number.
- Workspace policies belong to one workspace and can only be assigned to that workspace's members/keys.

Blocked requests return the same `403` errors as guardrails ([§11.4](#114-guardrails)), and budget-limit shapes per [§4](04-api-fundamentals.md#4-api-fundamentals).

#### Migrating from guardrails to policies

For teams managing guardrails via API or Terraform.

**The short version**

1. Nothing breaks: existing guardrails keep enforcing the same rules and keep their IDs; the guardrails API and Terraform resources keep working.
2. Each guardrail also appears as up to three policies (one per type it actually sets).
3. Changes made through the guardrails API/Terraform keep flowing into those policies.
4. Changes made in Guardrail Policies do **not** flow back into guardrails. Once you edit a policy for a workspace, manage that policy type there from then on.

**Mapping**

| Guardrails | Guardrail Policies |
| - | - |
| A guardrail with budget, model/provider lists, content filters | Up to three policies, one per type; only parts the guardrail sets become policies. |
| The workspace default guardrail | A workspace-wide policy assigned to that workspace (every member and key checked against it), plus the workspace default for each type it sets. |
| Guardrail assigned to a member | That member's policy of each type the guardrail sets |
| Guardrail assigned to an API key | That key's policy of each type the guardrail sets |
| `limit_usd`, `reset_interval`, `include_byok_in_budgets` | Budget policy `config` |
| `allowed_providers`, `ignored_providers`, `allowed_models`, `ignored_models`, `enforce_zdr_*`, `allow_safety_retention_*`, training/publication, data regions | Model & provider access policy `config` |
| `content_filter_builtins`, `content_filters`, prompt injection & sensitive info | Content moderation policy `config` |

Setting names and values are identical, so a guardrail body splits into policy `config` objects without renaming. Combination rules are unchanged.

**What's different**

- Each type is assigned on its own (no more copying a whole guardrail to change one budget).
- Policies belong to one workspace (use workspace-wide policies for cross-workspace rules).
- Workspace default is optional per type; members/keys can opt out of a default.
- Workspace-wide policies can cover many workspaces (or all).
- API keys are named by hash: `api_key_hashes`, `opted_out_api_key_hashes` (the `hash` from List API keys). Member IDs are the same user IDs.

**Editing a migrated policy**: editing via the Policies API or dashboard makes a **copy** in that workspace with a **new ID** (returned in the `PUT` response `data.id`); use that ID from then on.

- The original guardrail and other workspaces using it are unchanged.
- That policy type in that workspace stops receiving changes from the guardrail; other types stay in sync.
- You can't delete a migrated policy directly — unassign it, or delete the guardrail (`DELETE /api/v1/guardrails/{id}`).

> Pick **one** place to manage each policy type in each workspace; editing the same rules through both causes drift, and the guardrail stops showing what is enforced.

**Who's in charge?** Guardrail member/key assignment responses include:

- `managed_by`: `legacy` when every policy type for the assignment still follows the guardrail; `policies` once at least one type is managed in Guardrail Policies.
- `legacy_policy_types`: types still following the guardrail, e.g. `["budget", "moderation"]`.

**Migration steps** (no deadline; one workspace and one type at a time):

1. List the auto-created policies: `GET /api/v1/guardrails/policies/budget?workspace_id=...` (and `/moderation`, `/model-availability`). They already carry your settings and assignments.
2. Point writes for that type at the policy routes.
3. Store returned IDs (the first edit of a migrated policy returns a new ID).
4. Stop writing that type through guardrail routes for that workspace.
5. Repeat for other types/workspaces.

**Request-shape changes**

| Guardrails | Guardrail Policies |
| - | - |
| One body, all settings top-level | One type's settings inside `config`, plus `name`, `policy_type`, `workspace_id` |
| Separate bulk assign/unassign routes | `member_ids`/`api_key_hashes` on the policy, or single-subject `/assignments` routes |
| `PATCH` updates only sent fields | `PUT` replaces `name` and `config`; omit both `member_ids` and `api_key_hashes` to keep assignments, send both to replace |
| Update the workspace default guardrail | Set `is_workspace_default` on a workspace policy, or manage the workspace-wide policy covering the workspace |

Example — this guardrail:

```json
{
  "name": "Engineering",
  "workspace_id": "YOUR_WORKSPACE_ID",
  "limit_usd": 200,
  "reset_interval": "monthly",
  "allowed_providers": ["openai", "anthropic"],
  "enforce_zdr_openai": true
}
```

becomes two policies, sent to `POST /api/v1/guardrails/policies/budget` and `POST /api/v1/guardrails/policies/model-availability`:

```json
{
  "name": "Engineering budget",
  "policy_type": "budget",
  "workspace_id": "YOUR_WORKSPACE_ID",
  "config": { "limit_usd": 200, "reset_interval": "monthly", "include_byok_in_budgets": false }
}
```

```json
{
  "name": "Engineering models",
  "policy_type": "model_availability",
  "workspace_id": "YOUR_WORKSPACE_ID",
  "config": { "allowed_providers": ["openai", "anthropic"], "enforce_zdr_openai": true }
}
```

**Terraform**

| Terraform resource | Maps to |
| - | - |
| `openrouter_guardrail` | Up to three workspace policies |
| `openrouter_workspace_default_guardrail` | The workspace-wide policy and workspace defaults created from the workspace default |
| `openrouter_guardrail_member_assignment` | That member's policy of each type |
| `openrouter_guardrail_key_assignment` | That API key's policy of each type |

- Don't edit Terraform-managed guardrails in the dashboard or via the Policies API — that creates a copy Terraform can't see (plan shows no change while the copy is enforced).
- Don't edit a Terraform-managed workspace default guardrail in the dashboard — the dashboard saves it to a new workspace-wide policy Terraform can't see.
- The provider has **no Guardrail Policies resources yet**; keep using guardrail resources for Terraform-managed workspaces. To use policy-only features there, first `terraform state rm` that workspace's guardrails, then manage via the Policies API/dashboard.

FAQ: migration is optional; guardrail IDs don't change (only an edited migrated policy gets a new ID).

#### Gotchas

- `PUT` with only `member_ids` (and not `api_key_hashes`), or vice versa, is a partial replacement — send both or neither.
- Use the `/assignments` routes with `expected_assignment` from automation running concurrently; handle `409`.
- A raised personal budget is still capped by any workspace-wide budget.
- Workspace-wide policies are org-admin-only.

Sources: https://openrouter.ai/docs/guides/features/guardrails/policies, https://openrouter.ai/docs/guides/features/guardrails/policies-migration, OpenAPI spec (`openapi.yaml`, Guardrail Policies tag)

### 11.6 Sensitive Info detection

Detects sensitive information (PII, secrets) in requests **before** they reach the provider, and either redacts or blocks. Configured as part of a guardrail (`content_filter_builtins`, `content_filters`) or a content moderation policy.

#### How it works

1. **Detection** — request content is checked against configured presets and patterns.
2. **Action**:
   - **Redact** — matched text replaced with a labeled placeholder (`[EMAIL]`, `[PHONE]`, `[REDACTED]`, …), modified request forwarded.
   - **Block** — whole request rejected with `403 Forbidden`.
   - **Flag** — (spec: every builtin slug supports `"block"`, `"redact"`, and detect-only `"flag"`) recorded without enforcement.
3. **Forwarding** — if nothing detected (or all matches redacted), the request proceeds normally.

Scope: **input side only** — message content, tool call arguments, and prompt strings. Model responses are **not** scanned.

#### Detection methods

- **Regex-based** (fast, deterministic, negligible latency): email, phone, SSN, credit card, IP address, provider-prefixed API keys/secrets, and all custom patterns.
- **NLP-based** (contextual, via [Presidio](https://microsoft.github.io/presidio/)): person names *(beta)*, geographic locations and anchored street addresses *(beta)*. When a location is recognized, address redaction extends over the adjoining street line. NLP adds latency proportional to input size (shown as **Adds latency** in the dashboard). If the NLP check **times out, the request proceeds (not blocked)**.

#### Built-in presets

| Preset | `slug` | Method | Redaction label | Example matches |
| - | - | - | - | - |
| Email address | `email` | Regex | `[EMAIL]` | `user@example.com`, `name+tag@domain.co` |
| Phone number | `phone` | Regex | `[PHONE]` | `914-309-4996`, `914.309.4996`, `9143094996` |
| Social Security number | `ssn` | Regex | `[SSN]` | `123-45-6789` |
| Credit card number | `credit-card` | Regex | `[CREDIT_CARD]` | `4265 5256 0839 8752`, `4265-5256-0839-8752` |
| IP address | `ip-address` | Regex | `[IP_ADDRESS]` | `192.168.0.1`, `10.0.0.1` |
| API keys and secrets | `secrets` | Regex | `[SECRET:<format-id>]` | `sk-or-v1-...`, `ghp_...`, `pypi-...` |
| Person name *(beta)* | `person-name` | NLP | `[PERSON_NAME]` | `John Smith`, `Dr. Sarah Johnson`, `Maria Garcia-Lopez` |
| Address *(beta)* | `address` | NLP | `[ADDRESS]` | `123 Main Street, Springfield`, `London, United Kingdom` |

Full builtin slug enum (spec): `email`, `phone`, `ssn`, `credit-card`, `ip-address`, `secrets`, `person-name`, `address`, `regex-prompt-injection` (the last is the prompt-injection detector, [§11.8](#118-prompt-injection-detection-and-allowlist)). Builtin `label` values are system-assigned and read-only (a `label` sent on input is deprecated and ignored).

**Secrets preset**: well-known provider-prefixed keys and credential formats, low false-positive rate. Default redaction `[SECRET:<format-id>]` (e.g. `[SECRET:github-token]`); a custom label replaces the whole label verbatim, without the format suffix. Full list: [§11.7](#117-detected-secret-formats-secrets-preset).

**NLP limitations**

- Person Name: may miss names without surrounding context; uncommon or non-Western names may be missed; single-word names (e.g. "Cher") are harder.
- Address: a street address without a recognizable city/state/locality anchor may not be detected at all; ambiguous names ("Paris") depend on context; non-standard/abbreviated formats may be missed.

#### Custom patterns

Each needs a **pattern** (valid JavaScript regex) and an **action** (`redact` or `block`); optional `label` for clearer block error messages. Redact replaces matches with `[REDACTED]`.

| Use case | Pattern | Action |
| - | - | - |
| Internal project codes | `PROJ-\d{4,6}` | Redact |
| AWS access keys | `AKIA[0-9A-Z]{16}` | Block |
| Internal URLs | `https?://internal\.company\.com\S*` | Redact |

Pattern validation at creation: (1) syntax must be valid JS regex; (2) must not be ReDoS-vulnerable — nested quantifiers like `(a+)+` or `(a|a)*` are rejected with a descriptive error. (See [§11.4](#114-guardrails) for the full supported/unsupported regex list.)

#### Configure

Dashboard: workspace **Guardrails** → create/edit → **Sensitive Info** section → enable presets and/or add custom patterns → choose **Redact** or **Block** per item → save. **Enable all / Disable all** toggles all presets. Use **Test Preview** in the editor before assigning.

API:

```json
{
  "name": "PII Protection",
  "content_filter_builtins": [
    { "slug": "email", "action": "redact" },
    { "slug": "phone", "action": "redact" },
    { "slug": "ssn", "action": "block" },
    { "slug": "credit-card", "action": "block" },
    { "slug": "ip-address", "action": "redact" },
    { "slug": "secrets", "action": "redact" },
    { "slug": "person-name", "action": "redact" },
    { "slug": "address", "action": "redact" }
  ]
}
```

```json
{
  "name": "Custom Filters",
  "content_filters": [
    { "pattern": "AKIA[0-9A-Z]{16}", "action": "block", "label": "AWS Key" },
    { "pattern": "PROJ-\\d{4,6}", "action": "redact" }
  ]
}
```

#### Interaction with other guardrails

- Content filters are **unioned** (member email filter + key phone filter → both apply).
- **Block wins over redact** for the same entity type across guardrails.
- Custom and built-in filters from all applicable levels (default, member, API key) merge.

#### Error response

```json
{ "error": { "code": 403, "message": "Request blocked by content filter: [LABEL]" } }
```

`[LABEL]` is: the preset label for built-ins (e.g. `Email address`, `Social Security number`); the custom `label` for labeled custom patterns; `[BLOCKED]` for unlabeled custom patterns; the entity type for NLP detections (e.g. `Blocked PII detected: PERSON`).

#### Reporting false positives

On [Logs](https://openrouter.ai/logs), generations with a guardrail event show a shield icon; hover for the guardrail popover. Single entity type → **Mark as false positive** in the popover. Multiple → popover links to the generation detail view; tick the incorrect entity types under **Mark as false positive** → **Submit**. Marking does **not** retroactively unblock a blocked request.

#### Best practices

- Start with **Redact**, evaluate accuracy, then switch to **Block**.
- Use built-in presets for common PII; add custom patterns for domain-specific data.
- If latency matters, use only regex presets (NLP presets add latency).
- Test with Test Preview before assigning.
- Combine with budgets, allowlists, ZDR.
- Add a `label` to custom block patterns so API consumers see a clear reason.

Sources: https://openrouter.ai/docs/guides/features/guardrails/sensitive-info, OpenAPI spec (`openapi.yaml`, `ContentFilterBuiltinSlug`/`ContentFilterBuiltinAction`)

### 11.7 Detected secret formats (Secrets preset)

The `secrets` preset targets recognizable vendor prefixes and structures, not generic high-entropy strings. Default redaction `[SECRET:<format-id>]`; a custom label on the preset replaces the whole label verbatim.

| Format | Recognizable prefix / structure | Redaction label |
| - | - | - |
| AWS access key ID | `AKIA`, `ASIA`, `ABIA`, `ACCA`, or `A3T` + uppercase alphanumeric key body | `[SECRET:aws-access-key-id]` |
| GitHub token | `ghp_`, `gho_`, `ghu_`, `ghs_`, or `ghr_` + token body | `[SECRET:github-token]` |
| GitHub fine-grained PAT | `github_pat_` + token body | `[SECRET:github-fine-grained-pat]` |
| GitLab personal access token | `glpat-` + token body | `[SECRET:gitlab-personal-access-token]` |
| OpenAI API key | `sk-proj-`, `sk-svcacct-`, or `sk-admin-` with the `T3BlbkFJ` marker | `[SECRET:openai-api-key]` |
| OpenAI legacy API key | `sk-` with the `T3BlbkFJ` marker | `[SECRET:openai-legacy-api-key]` |
| Anthropic API key | `sk-ant-api03-` or `sk-ant-admin01-` + token body ending in `AA` | `[SECRET:anthropic-api-key]` |
| OpenRouter API key | `sk-or-v1-` + 64 lowercase hex chars | `[SECRET:openrouter-api-key]` |
| Google API key | `AIza` + key body | `[SECRET:google-api-key]` |
| Google OAuth client secret | `GOCSPX-` + secret body | `[SECRET:google-oauth-client-secret]` |
| Stripe secret key | `sk_live_`, `sk_test_`, `rk_live_`, or `rk_test_` + token body | `[SECRET:stripe-secret-key]` |
| Slack token | `xoxb-`, `xoxp-`, `xoxo-`, or `xoxs-` + numeric segment + token body | `[SECRET:slack-token]` |
| Slack legacy workspace token | `xoxa-` or `xoxr-`, optionally + numeric segment | `[SECRET:slack-legacy-workspace-token]` |
| Slack app token | `xapp-` + app, workspace, and token segments | `[SECRET:slack-app-token]` |
| Slack webhook URL | `https://hooks.slack.com/services/`, `/workflows/`, or `/triggers/` + webhook body | `[SECRET:slack-webhook-url]` |
| npm access token | `npm_` + token body | `[SECRET:npm-access-token]` |
| SendGrid API key | `SG.` + two dot-separated token segments | `[SECRET:sendgrid-api-key]` |
| Hugging Face access token | `hf_` + token body | `[SECRET:huggingface-access-token]` |
| Databricks API token | `dapi` + 32 lowercase hex chars, optional numeric suffix | `[SECRET:databricks-api-token]` |
| Atlassian API token | `ATATT3` + token body | `[SECRET:atlassian-api-token]` |
| Doppler token | `dp.` + a supported token type such as `pt`, `st`, `ct`, `sa`, `scim`, or `audit` | `[SECRET:doppler-token]` |
| Linear API key | `lin_api_` + token body | `[SECRET:linear-api-key]` |
| Shopify access token | `shpat_`, `shpca_`, `shppa_`, or `shpss_` + 32 hex chars | `[SECRET:shopify-access-token]` |
| Telegram bot token | 8–10 digits, a colon, `AA`, and the token body | `[SECRET:telegram-bot-token]` |
| age secret key | `AGE-SECRET-KEY-1` + fixed-length key body | `[SECRET:age-secret-key]` |
| JSON Web Token | `eyJ... .eyJ... .<signature>` (three dot-separated segments) | `[SECRET:json-web-token]` |
| Bitcoin uncompressed WIF | Mainnet WIF beginning `5H`, `5J`, or `5K` | `[SECRET:bitcoin-wif-uncompressed]` |
| Bitcoin compressed WIF | Mainnet WIF beginning `K` or `L` | `[SECRET:bitcoin-wif-compressed]` |
| Bitcoin extended private key | `xprv`, `yprv`, `zprv`, `Yprv`, `Zprv`, `tprv`, `uprv`, `vprv`, or `U/Vprv` + extended key body | `[SECRET:bitcoin-extended-private-key]` |
| Ethereum private key | `0x` + 64 hex chars | `[SECRET:ethereum-private-key]` |
| PEM private key block | `-----BEGIN ... PRIVATE KEY-----` through matching `-----END ... PRIVATE KEY-----` | `[SECRET:private-key-block]` |
| PyPI upload token | `pypi-AgEIcHlwaS5vcmc` + upload token body | `[SECRET:pypi-upload-token]` |
| DigitalOcean token | `dop_v1_`, `doo_v1_`, `dor_v1_`, or `dos_v1_` + 64 lowercase hex chars | `[SECRET:digitalocean-token]` |

**Not detected**: entropy-only detection, bare unprefixed 32-char hex, UUIDs, generic hashes. Use a custom pattern for formats without a supported structure. **Deliberate exception**: Ethereum `0x` + 64 hex is detected even though the same shape can be a transaction hash, block hash, storage slot, or address-related value — expect false positives on blockchain data. Bare unprefixed 64-char hex stays excluded.

Missing format with a distinctive prefix? Request it via [support](https://openrouter.ai/support).

Sources: https://openrouter.ai/docs/guides/features/guardrails/secret-formats

### 11.8 Prompt injection detection and allowlist

Regex-based detection of common injection techniques, evaluated locally before forwarding. **Free**, minimal latency. Enable in a guardrail's **Security** section ([workspace guardrails](https://openrouter.ai/workspaces)) or via API.

#### Actions

| Action | Behavior |
| - | - |
| `flag` | Request passes through **unmodified**; detection recorded for observability (metrics + analytics events) only. Use to measure true-positive rates on your traffic first. |
| `redact` | Matched spans replaced with `[PROMPT_INJECTION]`; sanitized request forwarded. |
| `block` | Whole request rejected with `403` before reaching the model. |

When multiple guardrails apply (e.g. workspace default + API key guardrail), the most restrictive action wins: `block` > `redact` > `flag`.

#### API configuration

Prompt injection is a builtin content filter (spec):

```json
{
  "content_filter_builtins": [
    { "slug": "regex-prompt-injection", "action": "flag", "scan_scope": "user_only" }
  ]
}
```

`scan_scope` (only for `regex-prompt-injection`): `user_only` or `all_messages` (**default `all_messages`**). The guide describes scanning "all user-supplied message content"; the spec's default scans all message roles — set `user_only` explicitly if you want only user turns scanned.

#### Detection patterns

Patterns are derived from the [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) and other resources, checked against all user-supplied message content, case-insensitive unless noted. *(The pattern tables on the source page — pattern names, regexes, typoglycemia target words, misspelled-phrase keyword slots, and the names of the two encoding detectors — did not render in the downloaded copy, so they cannot be reproduced here. Consult the live page.)* A documented example match is `ignore all previous instructions`.

#### Evasion detection

- **Typoglycemia** — catches keywords with scrambled middle letters but correct first/last letters (e.g. "ignroe" for "ignore") for a set of target words.
- **Misspelled phrase detection** — finds candidate phrase shapes word by word, allowing **one edit** (insertion, deletion, substitution, adjacent transposition) **or** a middle-letter scramble per eligible keyword (e.g. "1gnore previous instructions", "ignore previous saefty rules", "revael your system prompt"). In the pattern table, `~` marks a slot that also accepts a misspelling; unmarked slots must match exactly. Rules:
  - A candidate is detected **only when at least one keyword is misspelled and the corrected phrase matches one of the exact regex patterns**, using that candidate's own words (including filler words), not an unrelated exact match elsewhere. So a typo never broadens the exact policy: "delte previous instructions" and "skip the securty rules for now" do not trigger (their corrected forms aren't exact detections).
  - Standalone near-words (`systemd`, `prompt1`, prose correcting a typo like `"promt" should be "prompt"`) don't qualify.
  - Read verbs (`print`, `output`, `reveal`, `expose`) also require exact qualifier and target slots in a read-override candidate; a misspelled verb alone is not enough: "prnit the previous instructions" stays clean in this layer, while "outupt original instructions" qualifies (corrects to "output original instructions", an exact match).
  - Typoglycemia and encoding detectors still run independently.
- **Encoding-based evasion** — decodes Base64 and hex (including space-separated hex pairs like `69 67 6e 6f 72 65`) and checks the decoded text for injection keywords. Two encoding detectors run.
- **Character-spaced evasion** — text like `i g n o r e  p r e v i o u s` is normalized by collapsing spaces and re-scanned against all patterns.

#### False positives and limitations

- Report from [Logs](https://openrouter.ai/logs): shield icon → popover → **Mark as false positive** (single pattern) or the detail view's per-pattern checkboxes → **Submit** (multiple). Does not retroactively unblock.
- Regex detection is **not exhaustive**; novel techniques may be missed.
- `flag` does not enforce — the request is forwarded exactly as submitted.
- Legitimate prompts can match (e.g. security-testing content). Test with representative traffic in `flag` mode first, then use the allowlist for known-safe phrases.

#### Allowlist

Marks specific phrases as safe so the regex detector ignores them (e.g. a security-training bot, or canned support text containing "ignore previous instructions").

How it works:

1. Each allowlisted phrase is located in the message text (case-insensitive).
2. Matched spans are replaced with neutral placeholder text so detection regexes can't match them.
3. Detection runs on the masked text — any remaining (non-allowlisted) patterns are still caught.
4. With `redact`, allowlisted phrases are restored in the final output; only non-allowlisted injection spans become `[PROMPT_INJECTION]`.

Matching rules: case-insensitive; **exact substring** (no wildcards, regex, or fuzzy matching); applies equally to `block`, `flag`, and `redact`.

Scope and management:

- Managed in [Settings > Privacy](https://openrouter.ai/settings/privacy). **Entity-scoped**, not per-guardrail: applies across every guardrail that scans your requests.
- Personal accounts: the owner manages it. Organizations: the entity is the org; **only org admins** can view/manage it (Settings > Privacy and the Logs quick-add banner); non-admins don't see the controls.
- **Add pattern**: live counter against the 1,000-character limit; saved and immediately active. Fails at the 200-pattern cap.
- **Edit** (pencil icon): duplicate check (case-insensitive) rejects identical patterns with a toast.
- **Toggle active/inactive**: inactive patterns are dimmed, not applied, and don't count toward the cap.
- **Delete** (trash icon): permanent.

Quick-add from Logs: in the prompt detail view, prompt-injection events show an **Add to allowlist** banner. Single pattern → one click. Multiple → checkbox picker with **Select all** → **Add *N* patterns**; already-allowlisted patterns are hidden ("N already added" links to Settings > Privacy). The banner appears **only for regex-based detections**; events that include any evasion detection (typoglycemia, misspelled phrase, encoding) don't show it, even if they also include a regex match.

Limits:

| Limit | Value |
| - | - |
| Active patterns | 200 per entity (inactive don't count) |
| Pattern length | 1,000 bytes UTF-8 (multibyte chars count as multiple bytes) |
| Matching | Exact substring only |
| Evasion hits | Not exemptible. Typoglycemia, misspelled-phrase, and Base64/hex detections expose no precise spans, can't be selectively redacted, and allowlisting a regex match doesn't exempt a separate evasion hit in the same message. If an evasion hit remains after masking, the scanned text is still flagged, blocked, or **fully** redacted per the action. |
| Duplicates | Case-insensitive ("Ignore" = "ignore") |

#### Gotchas

- Roll out in `flag` mode, review Logs/Activity → Guardrails, then switch to `redact`/`block`.
- The allowlist is not a regex — add the literal phrase as it appears.
- Evasion detections can block even allowlisted phrases if obfuscated variants also appear.
- Set `scan_scope: "user_only"` if system prompts or tool results legitimately contain injection-like text.

Sources: https://openrouter.ai/docs/guides/features/guardrails/prompt-injection, https://openrouter.ai/docs/guides/features/guardrails/prompt-injection/allowlist, OpenAPI spec (`openapi.yaml`, `PromptInjectionScanScope`)

### 11.9 Workspaces

Workspaces split one account into separate environments — teams, projects, or stages like staging vs. production — each with its own API keys, routing defaults, guardrails, and observability. Existing setups live in the **Default workspace**; if you don't need more, nothing changes. In organizations, all members are automatically added to the Default workspace.

#### Creating

Dashboard: [home dashboard](https://openrouter.ai/workspaces) → workspace picker → **[Create Workspace](https://openrouter.ai/workspaces/new)** → name + description (optionally set budgets and **Include BYOK spend** in the creation form). Only **org admins and account owners** can create and delete workspaces. Programmatic: Workspaces management API (`GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/{id}`, `GET /workspaces/{id}/members`, `POST /workspaces/{id}/members/add|remove`) — [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise).

#### Workspace-scoped vs. account-level

| Scoped to each workspace | Account-level (all workspaces) |
| - | - |
| **API keys** — every key lives in a workspace; members create their own keys in any workspace they belong to; org admins can create **system keys** owned by the workspace rather than a user. | **Activity & Logs** — all account activity, filterable by workspace. |
| **Guardrails** — the workspace default guardrail/policies plus member/key guardrails; inherit account-level policies and can only add restrictions. | **Credits & billing** — unified across workspaces. |
| **BYOK** provider keys — per workspace, or the same key shared across workspaces. | **Organization** — members, roles, workspace assignments. |
| **Routing** defaults (optimize for cost, latency, throughput, or tool-calling quality). | **Management keys** — administrative actions across all workspaces. |
| **Presets**. | **Privacy** — account-level data policies and provider/model restrictions (the ceiling for every workspace). |
| **Plugins** default behavior. | **Preferences**. |
| **Observability** (Broadcast destinations, Input & Output Logging settings). | Prompt-injection **allowlist** (entity-scoped). |
| **Members** (who can access the workspace). | |
| **Budgets** (daily/weekly/monthly/lifetime; [§11.10](#1110-workspace-budgets)). | |
| Also: classifiers ([§11.18](#1118-custom-classifiers)), Files API storage ([§11.2](#112-files-api-beta)), containers ([§11.3](#113-containers-beta)), batches (visible to every key in the workspace), webhook signing secret and default batch webhook URL. | |

#### API key scoping rules (collected)

- An inference key belongs to one workspace; its requests are governed by that workspace's guardrails, budgets, routing, BYOK, presets, plugins, and observability.
- **Unscoped** keys (not assigned to a workspace, including keys created before workspaces existed) use the Default workspace — and are **permanently disabled if the Default workspace is deleted**.
- Management keys operate at the account level across all workspaces (and are unaffected by Default-workspace deletion).
- Files API: a key scoped to a different workspace than `workspace_id` → `403`; file ids from other workspaces → `404`.
- Batches: every key in a workspace sees the same batches.
- Management API calls that omit `workspace_id` (creating API keys, BYOK keys, guardrails, broadcast destinations) default to the Default workspace, and return `400` if it was deleted.
- Removing a member from a workspace requires first deleting the API keys they created there.
- Deleting a workspace with active API keys via the API is refused — remove the keys first (spec).

#### Organization permissions

- **Org admins**: admin across all workspaces (keys, guardrails, BYOK, routing, presets, plugins, observability, members, settings); manage billing, membership/roles, management keys, account-level data policies. With account owners, create/delete workspaces.
- **Workspace admins** (not org admins): manage their workspace (members, classifiers, settings); same **read** access as members — cannot view other people's prompt/response content or classification tags. Assigning workspace roles requires a **Pro or Enterprise** plan.
- **Org members**: member permissions in each workspace they've been added to; can belong to multiple workspaces; all have member access to the Default workspace while they remain in the org.
- What members see: in Activity and Logs, request **metadata** (model, cost, tokens, status, creator) for every request in their workspaces, including others'. Prompt/response **content** only for requests attributed to them (including requests made with keys they created). Only org admins view others' content, see classification tags, and export activity.
- Chat and Fusion requests run in the member's **active workspace** (initially Default).

#### Switching workspaces (Chat / Fusion)

The active workspace determines which workspace's keys, routing defaults, guardrails, and budgets govern Chat/Fusion requests.

1. Open [Chat](https://openrouter.ai/chat) or [Fusion](https://openrouter.ai/fusion).
2. Click the workspace name at the bottom of the sidebar (lists only workspaces you belong to, checkmark on the active one).
3. Select a workspace. The choice persists across sessions.

Switching while a chat response is streaming **cancels** it (you're asked to confirm). Fusion runs keep streaming in the background and are saved to the workspace they started in.

#### Deleting the Default workspace

Possible (org admins/account owners) but has account-wide, irreversible effects:

- **Every unscoped inference API key is permanently disabled immediately** (management keys unaffected). Requests using them start failing at once.
- The Default workspace's settings are deleted: budgets, guardrails, classifiers, broadcast destinations.
- History (activity, logs, billing) is kept; other workspaces are unaffected.
- No default landing workspace afterwards: members whose only workspace was Default (and future joiners) belong to **no** workspace until an admin adds them; members of other workspaces (including Chat/Fusion users) land in one of those; links to Default show a "Default workspace deleted" page.
- **No fallback workspace**: management calls without `workspace_id` return `400` asking for it.
- **OAuth flows** ask the user to choose a workspace for the new key.

Before you delete:

1. Create at least one other workspace (you can't delete the last one).
2. Move production traffic to keys scoped to another workspace; confirm nothing uses unscoped keys.
3. Recreate budgets, guardrails, classifiers, broadcast destinations, BYOK keys, presets, and workspace defaults (e.g. default model) you want to keep.
4. Add org members to the workspaces they need.
5. Delete any **interns** in the Default workspace (deletion is blocked while interns are active).
6. Via API: delete keys scoped to the Default workspace and pass `confirm_default_workspace_deletion=true` on `DELETE /api/v1/workspaces/{id}`.

#### Gotchas

- Create keys inside the intended workspace; a key's workspace decides which guardrails/budgets/observability apply.
- Account-level privacy settings are the ceiling; a workspace can only be stricter.
- Pass `workspace_id` explicitly in automation so scripts survive Default-workspace deletion.

Sources: https://openrouter.ai/docs/guides/features/workspaces, https://openrouter.ai/docs/guides/features/workspaces/switching, https://openrouter.ai/docs/guides/features/files-api, https://openrouter.ai/docs/batch-quickstart, OpenAPI spec (`openapi.yaml`, Workspaces tag)

### 11.10 Workspace budgets

Pooled spending caps for a whole workspace's inference. Available on every plan. Pair with guardrail/policy budgets for per-member limits ([§11.4](#114-guardrails), [§11.5](#115-guardrail-policies); guidance in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) spend controls).

| Interval | Resets | Use case |
| - | - | - |
| `daily` | Every day at midnight UTC | Stop runaway spend from a bad day |
| `weekly` | Every Monday at midnight UTC | Smooth weekly bursts |
| `monthly` | 1st of each month at midnight UTC | Fixed monthly allocation |
| `lifetime` | Never | Hard cap on total workspace spend |

- Up to **four budgets per workspace**, one per interval.
- On each request, current workspace spend is checked against every configured budget. If any is met or exceeded → **`403 Forbidden`**, e.g. `Workspace monthly budget of $500.00 exceeded. Contact your org admin.` The error names the **broadest** exceeded interval.
- **Ordering rule**: limits must be strictly decreasing as the interval narrows: `lifetime > monthly > weekly > daily`. Only set intervals must follow it. Violations → `400`, e.g. `Budget limits must be strictly decreasing as scope narrows: the monthly limit ($500) must be greater than the weekly limit ($600).`
- Spend starts at zero for every interval when a workspace is created; periodic budgets reset automatically; lifetime accumulates.
- Checks run **before routing**; already-dispatched in-flight requests complete, so spend can slightly exceed the limit; the next request after the overage is blocked.

Who can change budgets: personal accounts manage their own; in organizations only **Organization Administrators** (dashboard) — members can view budgets, spend bars, and the BYOK setting. Programmatic management uses organization management keys.

#### Dashboard

`https://openrouter.ai/workspaces/<slug>/settings` → **Budgets** → **Add budget** → interval + amount → repeat → **Save**. Each row shows a progress bar (red with warning when exceeded). The **Include BYOK spend** toggle applies to the whole workspace.

#### API

Routes under `/api/v1/workspaces/{workspace_ref}/budgets` (management key).

```bash
# List
curl https://openrouter.ai/api/v1/workspaces/$WORKSPACE_ID/budgets \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

```json
{
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "workspace_id": "880e8400-e29b-41d4-a716-446655440000",
      "limit_usd": 1000,
      "reset_interval": "monthly",
      "created_at": "2025-08-24T10:30:00Z",
      "updated_at": "2025-08-24T15:45:00Z"
    }
  ],
  "include_byok_in_budgets": false
}
```

```bash
# Create or update (upsert) the monthly budget; also turn on BYOK inclusion
curl -X PUT https://openrouter.ai/api/v1/workspaces/$WORKSPACE_ID/budgets/monthly \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit_usd": 1000, "include_byok_in_budgets": true}'
```

Response echoes the budget under `data` plus the workspace's `include_byok_in_budgets`.

```bash
# Delete (idempotent: deleting a missing budget succeeds)
curl -X DELETE https://openrouter.ai/api/v1/workspaces/$WORKSPACE_ID/budgets/monthly \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
# → {"deleted": true}
```

Valid path intervals: `daily`, `weekly`, `monthly`, `lifetime`. A single-interval `GET /workspaces/{ref}/budgets/{interval}` also exists ([§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)).

`include_byok_in_budgets`:

- Workspace-wide (affects every interval); the interval in the URL doesn't scope it.
- Default `false` (only OpenRouter credit spend counts). `true` adds BYOK inference spend at the amount OpenRouter would have charged.
- **Omit it to leave the setting unchanged**; sending `false` explicitly turns inclusion off.
- Returned by list and upsert, and on `GET /api/v1/workspaces/{id}`.
- API changes apply to enforcement immediately; an open dashboard page may show the old value until reloaded.

#### FAQ highlights

- BYOK requests don't count unless **Include BYOK spend** is on.
- The Default workspace can have budgets.
- Notification ahead of a block: the **Workspace budget limit** alert (Business/Enterprise; fires at chosen percentages, default 80% and 100%) — [§11.17](#1117-notifications).
- Members cannot override a budget; they must ask an org admin.

#### Workspace budget vs. guardrail/policy budget

| | Workspace budget | Guardrail / policy budget |
| - | - | - |
| Scope | Pooled total for the workspace | Per member and per key (never pooled) |
| Intervals | daily, weekly, monthly, lifetime | daily, weekly, monthly |
| Count | Up to 4 per workspace (one per interval) | One guardrail per member/key (one budget each); with policies, at most one budget policy per member/key per workspace, plus any workspace-wide budget |
| Error | `403` naming the workspace interval | `403` (budget limit shape, [§4](04-api-fundamentals.md#4-api-fundamentals)) |

Sources: https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets, https://openrouter.ai/docs/guides/features/guardrails/policies, https://openrouter.ai/docs/guides/features/notifications

### 11.11 Single Sign-On (SSO)

Members sign in to OpenRouter through your identity provider: Okta, Microsoft Entra ID, Google Workspace, or any custom SAML provider. Setup is self-serve from organization settings.

Requirements: **Enterprise** plan; **organization admin**; a verified email address on your account; DNS access for domain verification; admin access to your IdP.

#### Enable and connect

1. While in your organization context, open [Settings > Members](https://openrouter.ai/settings/organization-members?tab=sso) → **SSO** tab.
2. **Enable SSO** — adds a **Security** tab to organization settings. This is a **one-way** action for the org (doesn't change sign-in until a connection is verified and activated).
3. **Configure SSO** → Security tab → add your email domain (e.g. `acme.com`).
4. Publish the shown **TXT record** in DNS; verification usually completes within minutes of propagation.
5. Follow the guided setup for Okta, Entra ID, Google Workspace, or custom SAML to exchange SAML metadata.
6. Test with an account from your domain, then **activate**. Active connections appear in the SSO tab.

> **DNS gotcha**: the TXT record **Host** value ends with your domain. Many registrars (GoDaddy, Namecheap, Squarespace Domains, Porkbun) append the domain automatically — paste only the part before your domain. A doubled domain (`…acme.com.acme.com`) is the usual cause of stalled verification.

#### Connection statuses

| Status | Meaning |
| - | - |
| Pending | Created but not active (domain verification or activation in progress) |
| Active | Members of the domain sign in through your IdP |
| Disabled | Exists but turned off |

Connections are labeled **Self-serve connection** (created via Security tab) or **Configured by OpenRouter** (set up by OpenRouter's team).

#### User lifecycle (with SCIM)

With SCIM provisioning connected, the IdP is the source of truth. Deactivating or deleting a user in the IdP syncs automatically:

- Their org membership is deactivated and they can't sign in through the connection.
- API keys they created **in your organization** are deactivated across all the org's workspaces.
- Scope is the org only: their personal account, personal keys, and other org memberships are unaffected. If their OpenRouter account itself is deleted, all access ends.
- **Deactivated keys are not re-enabled** if the user is later reactivated — an org admin must re-enable them manually.

FAQ: SSO enablement can't be turned off (individual connections can be disabled; contact support@openrouter.ai). Multiple domains are supported, each verified domain gets its own connection entry. Only org admins on Enterprise see the SSO tab; if OpenRouter configured your SSO, contact support for changes.

Sources: https://openrouter.ai/docs/guides/features/sso

### 11.12 SCIM group mappings

Map IdP groups to OpenRouter workspaces so membership and roles provision automatically and stay in sync.

Prerequisites: Enterprise plan; organization admin; an **active SSO connection** ([§11.11](#1111-single-sign-on-sso)); SCIM provisioning enabled for the org with your IdP pushing groups. Self-serve activation requires a **single** active SSO connection (contact support otherwise). Customers previously configured by OpenRouter keep working unchanged.

#### Set up provisioning

1. Org context → [Settings > Members](https://openrouter.ai/settings/organization-members?tab=scim-mappings) → **SCIM Mappings** tab → **Enable SCIM provisioning** (shown when SSO is active and no directory exists). Activation requires a verified email.
2. Choose **Okta**, **Microsoft Entra ID**, or **Custom (SCIM 2.0)**.
3. Enter the **admin group ID** (and optional display name) — the IdP group whose members become OpenRouter **organization admins**. This mapping is created with the directory because group role mappings are applied on every push and a directory without an admin mapping would leave the org without an admin. **Make sure your own account is in that group** — OpenRouter can't verify membership before the first push and applies roles exactly as the IdP reports them. Org role mappings can be changed later.
4. Copy the **SCIM endpoint URL** and bearer **API key**. The key is shown **once**; store it in the IdP now (lost → rotate).

IdP configuration:

- **Okta**: OpenRouter SAML app → **Provisioning** → **SCIM** integration; endpoint URL as **SCIM connector base URL**; **HTTP Header** auth with the API key. Enable **Create Users**, **Update User Attributes**, **Deactivate Users**; assign users; **Push Groups**.
- **Microsoft Entra ID**: OpenRouter enterprise app → **Provisioning** → mode **Automatic**; endpoint URL as **Tenant URL**, API key as **Secret Token**; test connection; assign users and groups; turn provisioning on.
- **Custom (SCIM 2.0)**: point the client at the endpoint URL with `Authorization: Bearer <API key>`; push users and groups.

Ensure the admin group is among the pushed groups. Use **Refresh from IdP** if groups don't appear yet.

#### Rotating the SCIM API key

SCIM provisioning card → **Rotate API key** → confirm. New key shown once; the previous key works only for a short grace period, then provisioning stops until the new key is installed. Rotations are audit-logged.

#### Viewing groups

Pushed groups appear as cards (name + number of mapped workspaces). Filter all/mapped/unmapped; **Refresh from IdP** pulls on demand ("Last synced" timestamp); **View audit log**. Groups also sync automatically on IdP pushes.

#### Mappings

- **Create**: group card → **Add mapping** → workspace + role (**Member** or **Admin**; defaults to Member, or Admin when the group name contains "admin") → **Add mapping**. Everyone in the group gets that role in the workspace. One mapping per group–workspace pair; a group can map to any number of workspaces, each with its own role.
- **Change role**: role selector on the mapping row; provisioned members update to their new effective role. Highest role still wins across groups.
- **Remove**: delete button, then choose:
  - **Keep members** — mapping removed; members it added stay with their current role and become **manually managed** (IdP group changes no longer affect them).
  - **Remove members** — members whose access came from this mapping are removed.
  - Members also entitled via another mapping to the same workspace keep access either way.

#### Membership sync rules

- Added to a mapped group in the IdP → added to mapped workspaces with the mapping's role.
- Removed from the group → access granted by that mapping is removed.
- Multiple mapped groups → highest role wins (Admin > Member).
- Deactivated/deleted in the IdP → org membership and their org API keys deactivated ([§11.11](#1111-single-sign-on-sso)).
- Group deleted in the IdP → once synced, the group is deactivated and stops granting access; members without another entitlement lose access (audit-logged).
- Mappings work **alongside** manual membership; manually added members are unaffected.

#### Audit log

Records SCIM provisioning enablement and key rotations (with admin), mapping creates/role changes/deletes (with admin), and member adds/removes/changes in workspaces including IdP-triggered ones, with links to the affected member and workspace.

#### API equivalent (management key; schemas in §8)

| Route | Purpose |
| - | - |
| `GET /scim/groups` | List SCIM groups |
| `GET`, `POST /scim/group-mappings` | List / create mappings (`scim_group_id`, `workspace_id`, `role`: `admin`\|`member`). Re-creating an identical mapping re-applies it; a different role for an existing mapping → `409`. |
| `GET`, `PATCH`, `DELETE /scim/group-mappings/{id}` | Read / update / delete. `DELETE` **requires** `keep_members=true\|false` (no default; omitting it → `400`). `false` removes members the mapping granted. |
| `POST /scim/sync-jobs`, `GET /scim/sync-jobs/{id}` | Start a directory sync ("Refresh from IdP") and check its status |

Sources: https://openrouter.ai/docs/guides/features/scim-mappings, https://openrouter.ai/docs/guides/features/sso, OpenAPI spec (`openapi.yaml`, SCIM tag)

### 11.13 Logs

The [Logs](https://openrouter.ai/logs) page is the request-level view of OpenRouter's observability suite: each generation with model, provider, latency, cost, and (with Input & Output Logging on) the exact prompt and completion. Account-level, filterable by workspace.

#### Tabs

| Tab | Lists |
| - | - |
| **Generations** (default) | One row per completed generation: date, model, final provider, generation ID, status, attempts, API key, latency. |
| **Upstream Requests** | Individual routing attempts to upstream providers, including retries and fallbacks. Requests that failed before being sent upstream are not included. |
| **Sessions** | Generations grouped by session: primary and supporting models, primary provider, request count, total cost. |
| **Videos** | Async video generation jobs and status. |
| **Batches** | Batch API jobs and status ([§11.1](#111-batch-api)). |

Organization accounts also see an **Org Member** column (who owns the key that made the request).

#### Filtering

Filter bar by user, model, provider, status, region, API key, or modality (depending on tab), or by a specific generation ID. Filters are stored in the URL (bookmarkable/shareable). A request histogram above the table shows volume over the date range.

#### Generation detail sheet

- **Overview**: model, provider, cost, token counts, finish reason, streaming flag, provider latency and throughput, data region, any fallbacks.
- **Provider Responses**: waterfall of each upstream attempt with latency, moderation time, and overhead.
- **Usage**: cost breakdown — cache read discounts, BYOK upstream cost, web search, web fetch, file processing.
- **Prompt** / **Completion**: full content when Input & Output Logging was enabled at generation time.
- **Raw JSON**: the underlying generation record.
- Actions: open in Chatroom, or replay in the Playground with another model/configuration.
- Guardrail events show a shield icon (false-positive reporting, allowlist quick-add — [§11.6](#116-sensitive-info-detection), [§11.8](#118-prompt-injection-detection-and-allowlist)); classified generations show a tag icon ([§11.18](#1118-custom-classifiers)).

#### API access

| Endpoint | Returns |
| - | - |
| `GET /api/v1/generation?id=<generation id>` | Request and usage metadata (model, provider, tokens, cost, latency, finish reason). |
| `GET /api/v1/generation/content` | Stored prompt, completion, and error content. Requires Input & Output Logging to have been enabled when the generation was made. |

Both take the generation ID from the `id` field of a completion response. Schemas: [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) Generations.

Sources: https://openrouter.ai/docs/guides/features/logs

### 11.14 Activity

The [Activity](https://openrouter.ai/activity) page aggregates generations into spend, request, and token metrics sliceable by model, provider, API key, app, or user over any date range.

| Tab | Shows |
| - | - |
| **Overview** | Total spend, requests, token volume, blended cost per million tokens, cache hit rate; top API keys/apps/users; usage by model; token breakdown (prompt, completion, reasoning); prompt caching; usage type (credits vs BYOK). |
| **Trends** | Time series for requests, spend, or tokens, plus a "Trending" card of biggest movers vs. the prior period. |
| **Explore** | Configurable chart/table builder (below). |
| **Guardrails** | Guardrail activity across the org, filterable by model, provider, or status. |

All tabs share date range and filters (stored in the URL). Filter by user, model, provider, API key, modality; orgs can filter by member. Most cards link to **View logs** or **Open in Explorer** with the same filters.

**Explore controls**: **Metric** (spend, requests, tokens…); **Group** and **Subgroup** (one or two dimensions) with **Limit** and **Rank by** (series beyond the limit collapse into "Other"); **Rollup** (time bucket, or none for a flat ranking); **Cumulative sum** (with a time rollup and an additive metric); bar/line/dot views. Save as a named chart visible to you or your whole org. Classifier dimensions appear here too ([§11.18](#1118-custom-classifiers)).

**Exporting**: Explore results download as CSV or PDF, respecting filters and date range (see the Activity Export cookbook). Only org admins can export activity.

**API access** (management key; schemas [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)):

| Endpoint | Returns |
| - | - |
| `GET /api/v1/analytics/meta` | Metrics, dimensions, filter operators, and granularities the query endpoint accepts. |
| `POST /api/v1/analytics/query` | Programmatic Explore: metric(s), dimensions, filters, granularity (and classifier dimensions/filters). |
| `GET /api/v1/activity` | Daily usage and spend grouped by model endpoint. |

Sources: https://openrouter.ai/docs/guides/features/activity

### 11.15 Input & Output Logging (beta)

Privately stores full request and response content so you can review it in [Logs](https://openrouter.ai/logs) (debugging, comparing models, prompt optimization).

#### Enable (opt-in)

Workspace [**Observability**](https://openrouter.ai/workspaces/default/observability) settings → toggle **Input & Output Logging**. In organizations only admins can view and toggle it. **Only generations made after enabling** have stored content.

**API Keys Filter** (same settings page):

- **Included API Keys** — log only these keys; none selected = all keys.
- **Excluded API Keys** — never log these; **exclusions win** over inclusions.
- Org admins can lock these filters so members can't change them.

View: Logs → click a generation → **Prompt** / **Completion** tabs (plus model, provider, tokens, cost). API: `GET /api/v1/generation/content` ([§11.13](#1113-logs)).

#### Storage, retention, privacy, access

- **Storage**: isolated Google Cloud Storage project with separate access controls; encrypted at rest with Google Cloud default encryption (AES-256).
- **Retention**: **minimum 3 months**; may be retained longer at OpenRouter's discretion unless you request deletion. Account owners can request deletion anytime via support@openrouter.ai.
- **Privacy**: not accessed or used by OpenRouter for training, analytics, or any other purpose.
- **Org access**: org admins can view content for every request in the org. Other members (including workspace admins) see content only for requests attributed to them — requests they make in the OpenRouter app and requests made with API keys they created (whoever used the key). Content for requests with no attributed creator is visible only to org admins.

#### Regional limitation

Does **not** apply to requests routed through `eu.openrouter.ai` or `us.openrouter.ai`: those requests work normally but logging is skipped.

#### Compared with Broadcast and with data-discount logging

| | Input & Output Logging | Broadcast | Data discount logging |
| - | - | - | - |
| Where stored | On OpenRouter | Your external platform | OpenRouter (for product improvement) |
| Setup | Single toggle (Observability) | Destinations + credentials (Observability) | Toggle in Privacy settings |
| Access | Logs page | Your observability platform | — |
| Use case | Debugging, evaluating responses, prompt optimization | Production monitoring and analytics | 1% discount on all model usage in exchange for data use |
| Privacy | Always private (org admins + each member for their own requests); never used by OpenRouter | Configurable per destination (Privacy Mode) | OpenRouter may use data to improve the product |

All three are independent; enable any combination.

Sources: https://openrouter.ai/docs/guides/features/input-output-logging

### 11.16 Broadcast

Broadcast ships traces for your OpenRouter requests to external observability/analytics platforms automatically — no instrumentation in your app. Traces are sent **asynchronously after requests complete**, so Broadcast adds no latency to API responses. Destination credentials are encrypted at rest and decrypted only when sending.

#### Enable

1. [Settings > Observability](https://openrouter.ai/settings/observability) (per workspace).
2. Toggle **Enable Broadcast**.
3. Add one or more destinations (credentials, endpoints, project ids as each requires).

Organization accounts: only org admins can edit broadcast settings; admins can set up shared destinations applying to all API keys in the org. Broadcast can be configured at user level and org level.

Programmatic management: `GET/POST /api/v1/observability/destinations`, `GET/PATCH/DELETE /api/v1/observability/destinations/{id}` (management key; full schemas [§8](08-endpoints-governance.md#8-endpoint-reference--governance--enterprise)). Spec notes: max **5 destinations per type**; defaults to the default workspace (`workspace_id` to scope); create fields include `type`, `name`, `config` (type-specific), `enabled` (default `true`), `api_key_hashes` (`null` = all keys), `sampling_rate` (0.0001–1), `privacy_mode` (default `false`), `filter_rules` (groups of rules with `and`/`or` logic), `regions` (data regions the destination applies to; default `["global"]`; `eu` alias normalizes to `europe`), and opt-ins `broadcast_generation_cost`, `broadcast_generation_request_context`, `broadcast_generation_identity`, `broadcast_generation_cost_allocation` (beta) — all default `false`.

#### Supported destinations

| Destination | API `type` (spec, stable types only) |
| - | - |
| Arize AX | `arize` |
| Braintrust | `braintrust` |
| ClickHouse | `clickhouse` |
| Comet Opik | `opik` |
| Datadog | `datadog` |
| Elastic Observability | — (not in the API enum) |
| Google BigQuery *(beta)* | — |
| Grafana Cloud | `grafana` |
| Hugging Face Storage Buckets | — |
| Langfuse | `langfuse` |
| LangSmith | `langsmith` |
| New Relic | `newrelic` |
| OpenTelemetry Collector | `otel-collector` |
| PostHog | `posthog` |
| Raindrop *(beta)* | — |
| Ramp | `ramp` |
| S3 / S3-Compatible (S3, R2, compatible storage) | `s3` |
| Sentry | `sentry` |
| Snowflake | `snowflake` |
| W&B Weave | `weave` |
| Webhook (OTLP JSON to any HTTP endpoint) | `webhook` |

Destinations marked "—" are listed in the guide but not accepted by the destinations API's `type` enum ("Only stable destination types are accepted"); configure them in the dashboard. Per-destination setup walkthroughs are at `https://openrouter.ai/docs/guides/features/broadcast/<destination>` (e.g. `/langfuse`, `/s3`, `/otel-collector`, `/webhook`). Check the dashboard for the current list.

#### Trace contents

Each trace includes:

- **Request & response data**: input messages and model output (multimodal content stripped).
- **Token usage**: prompt, completion, total.
- **Cost**: total cost.
- **Timing**: start, end, latency metrics.
- **Model info**: model slug and provider name.
- **Model parameters** the request set: `temperature`, `top_p`, `top_k`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `min_p`, `top_a`, `seed`, `max_completion_tokens`, `max_tokens`/`max_output_tokens` (as `max_tokens`), `stop` (as `stop_sequences`). OpenTelemetry destinations export them as `gen_ai.request.*` attributes. Privacy Mode keeps them — including `stop`, which is caller-written text.
- **Tool usage**: whether tools were included and whether tool calls were made.

#### Token and cost fields

Use the root `GENERATION` observation for usage reporting; provider-attempt and timing `SPAN` observations don't carry generation totals.

| Observation field | Meaning |
| - | - |
| `promptTokens`, `completionTokens`, `totalTokens` | Accounted tokens (normally from provider usage; may contain fallback estimates when provider usage is missing). |
| `promptTokensDetails.cachedTokens` | Read from prompt cache. |
| `promptTokensDetails.cacheWriteTokens` | Written to prompt cache (provider aggregate when available, else pricing layer's quantity). |
| `promptTokensDetails.cacheCreation.ephemeral_5m_input_tokens` / `.ephemeral_1h_input_tokens` | Cache-write tokens by TTL when the provider reports a complete breakdown. |
| `promptTokensDetails.audioTokens`, `.videoTokens` | Multimodal input breakdowns. |
| `completionTokensDetails.reasoningTokens`, `.imageTokens` | Reasoning and image output breakdowns. |
| `inputCost`, `outputCost` | Prompt/completion portions of inference cost (USD). |
| `totalCost` | Total OpenRouter charge (USD) including fees and plugin charges. |

#### Additional generation metadata (per-destination opt-ins)

Dashboard **Additional generation metadata** checkboxes ↔ API booleans: **Cost** (`broadcast_generation_cost`), **Request context** (`broadcast_generation_request_context`), **Identity** (`broadcast_generation_identity`), **Cost allocation** (`broadcast_generation_cost_allocation`, beta).

**Cost** adds `metadata.openrouter_generation` (still available in Privacy Mode):

| Field | Meaning |
| - | - |
| `cache_write_tokens` | Same as `promptTokensDetails.cacheWriteTokens`. |
| `cache_creation` | Same TTL breakdown as `promptTokensDetails.cacheCreation`. |
| `native_server_tool_use` | Per-tool counts for provider-native server tools (below). |
| `usage_is_estimated` | `true` when accounting used fallback prompt/completion quantities, or fallback pricing after a usage-calculation failure. Omitted = provenance unavailable (older exports, failures without accounting data). An interrupted stream is not automatically estimated. |
| `is_long_context` | `true` when the endpoint's long-context pricing tier applied (prompt exceeded `long_context_threshold`). `null` when no long-context tier or charge not from token rates. Waived charges still report the tier; `cost` shows the waiver. |
| `long_context_threshold` | Threshold that decided `is_long_context` (multi-tier: highest tier exceeded, or lowest when none). |
| `usage` | OpenRouter charge (= generation total cost). |
| `is_byok` | Whether your provider key was used. |
| `byok_usage_inference` | Reference inference cost for BYOK (not an extra charge, not your provider's invoice). |
| `routed_service_tier` | Tier (`default`, `flex`, `priority`, `ultrafast`) of the endpoint routed for the final attempt. |
| `billed_service_tier` | Tier the generation was priced at (provider-reported if it served a different tier, e.g. `priority` shed to `default`). Anthropic fast mode (incl. `*-fast` models) exported as `priority`. BYOK: the tier your provider reported; else routed tier, or `null` for a default endpoint. |
| `cancelled` | Stored cancelled flag (see table below). |
| `upstream_id` | Provider's id for the final attempt as `{ value, source }`; `source` ∈ `response_body_id` (e.g. `chatcmpl-...`), `http_request_id` (`request-id`, `x-request-id`, `x-amzn-requestid`), `task_job_id` (async job id). |
| `gateway_request_id` | Host-specific request id as `{ value, header }` (e.g. Azure `apim-request-id`); absent when only generic headers sent. |
| `endpoint_region` | Where the final attempt was processed (e.g. `eastus2`, `us-east-1`; Bedrock geographic profiles give `us`, `eu`, `apac`). Absent when unknown/global. |
| `endpoint_deployment_type` | `global`, `data_zone`, or `regional`. Absent when unknown. |
| `endpoint_deployment_type_source` | `inferred` (from OpenRouter endpoint config) or `declared` (from your BYOK key's deployment type). |

With **Cost**, `upstream_raw_response_usage` carries the provider's raw usage as received (object = one report; array = several reports in order, e.g. Anthropic stream frames — **don't sum them**, they may be cumulative; `null` = none captured or suppressed). It is evidence, not accounting input. When suppressed, `upstream_raw_response_usage_suppression_reason` is `privacy_mode`, `usage_estimated`, or `size_limit` (> 64 KiB; never truncated). Absent reason + `null` = unavailable; absent field = export predates the feature; a reported `0` is a real provider zero.

**Request context** exports: both tier fields plus `requested_service_tier` (tier asked for after presets, `fast` normalized to `priority`; includes tiers implied by `:nitro` (`priority`), `:floor` (`flex`), `*-fast` models, or tier-suffixed provider slugs like `openai/priority` in `provider.order`/`only` when `service_tier` isn't set — compare with `billed_service_tier` to find tier mismatches); `service_tier` (provider's own reported value; `null` if none; not used for pricing); `provider_preferences` (the request's `provider` routing keys after presets — `sort`, `order`, `only`, `ignore`, `allow_fallbacks`, `quantizations`, `max_price` — exactly as sent, excluding provider-specific `options`; `null` when none set or > 64 KiB; deprecated top-level `max_price` not included; variant/tier-implied sorting not included).

Fields exported with **Cost** because they select or multiply a rate (also Request context fields): `model` (versioned permaslug), `api_type`, `web_search_engine`, `num_search_results`, `num_fetches`, `num_media_prompt`, `num_input_audio_prompt`, `num_media_completion`.

**Provider attempt spans** each carry their own `upstream_id`, `gateway_request_id`, `endpoint_region`, `endpoint_deployment_type`, `endpoint_deployment_type_source` (including failed attempts). `openrouter_generation` fields describe the final attempt (or the last failed one if all fail). `upstream_id`/`gateway_request_id` need **Cost** or **Request context**; endpoint location fields need **Cost**. BYOK attempts (with **Cost**) also carry `byok_provider_key_id`, `byok_provider_key_name` (omitted for unnamed keys), `byok_health_routing_enabled` (present only on enrolled requests), and `byok_demotion_reason` (`rejected` or `degraded`). For BYOK keys pointing at resources you own (Azure OpenAI, OpenAI) or pinning a region (Bedrock, Vertex), location fields are omitted; on Azure keys you can declare **Deployment type** (Global / Data zone / Regional) on the BYOK page to export it with source `declared` (metadata only; no routing/pricing effect).

**Cancelled generations** — exported quantities always match what OpenRouter billed:

| Surface | `cancelled` | Billed quantities |
| - | - | - |
| Chat, completed normally | `false` | Full response. |
| Chat, client disconnected, upstream aborted | `true` | Output delivered before disconnect; provider stopped. |
| Chat, client disconnected, upstream can't be aborted | `false` | Output delivered before disconnect; provider finishes in the background and may bill your BYOK key for more; provider's final usage not exported (looks like a completed row). |
| Text-to-speech, client disconnected | `false` | Provider's final usage (priced on input characters). |
| Streaming image generation, client disconnected | `true` | Provider's final usage after the stream drains. |

`openrouter_generation.tokens_prompt` / `tokens_completion` are OpenRouter's own estimates, not provider counters. A null/omitted quantity means unavailable, not zero.

**Native server-tool counts** (`native_server_tool_use`): `web_search_requests` (provider-native web search incl. Anthropic usage and OpenAI Responses completed search calls), `web_fetch_requests` (Anthropic), `code_execution_requests` (distinct Anthropic code-execution invocations incl. bash/text-editor variants, or completed OpenAI Responses code-interpreter calls), `file_search_requests` (OpenAI Responses), `image_generation_requests` (OpenAI Responses). They exclude client function calls and OpenRouter-orchestrated tool totals and are not universal invoice units (providers may bill by container, session, or duration, or charge for failures).

**Cache TTL / BYOK reconciliation**: Anthropic may report a TTL split at stream start, then raise the cache-write aggregate during server-tool execution without a revised split — Broadcast keeps the later total and exports a `null` TTL breakdown. Iteration usage is included across all iterations. For BYOK reconciliation, apply your provider's rates to cache/native-tool quantities and use `usage_is_estimated` to spot estimates. These exports don't change billing or API usage fields.

**Cost allocation (beta)** — `metadata.openrouter_cost_allocation`, independent of **Cost**, available in Privacy Mode, on the trace metadata and generation observation (not attempt spans). A `trace` field in your request cannot set or override it. Counts/costs only for chat generations (Chat Completions, Responses, Messages, Completions); others carry only `cost_status: "no_sku_items"` and pricing qualifiers.

| Field | Meaning |
| - | - |
| `cost_status` | Always present (see next table). |
| `input_tokens` | All billed input = `non_cache_input_tokens + cache_read_input_tokens + cache_write_input_tokens`. |
| `non_cache_input_tokens`, `cache_read_input_tokens`, `cache_write_input_tokens` | Non-overlapping billed input by kind. |
| `output_tokens`, `reasoning_tokens` | Billed output by kind (`reasoning_tokens` only where priced separately). |
| `non_cache_input_cost`, `cache_read_input_cost`, `cache_write_input_cost`, `output_cost`, `reasoning_cost` | USD as decimal strings. |
| `advisor_cost` | Anthropic advisor-model tokens (not in other counts). |
| `tool_cost` | Provider server tools and OpenRouter plugins (web search, web fetch, file parsing). |
| `unclassified_cost` | Priced rows with no token kind (e.g. Gemini cache storage). |
| `platform_cost` | OpenRouter charge beyond inference and tools (fees, discounts, waivers); can be negative. For BYOK, all OpenRouter charge beyond tools. |
| `is_byok`, `billed_service_tier`, `is_long_context`, `endpoint_region`, `endpoint_deployment_type` | Pricing qualifiers. |

| `cost_status` | Meaning |
| - | - |
| `reconciled` | All count/cost fields present and sum to the billed cost (within float64 rounding). |
| `unreconciled` | Rows don't add up (e.g. provider discount, BYOK requests using OpenRouter web search/fetch). |
| `null_price` | A token row has no price (fallback pricing or provider-reported total). |
| `row_error` | A billed row couldn't be split into non-overlapping quantities. |
| `no_billed_cost` | No upstream cost to reconcile against. |
| `no_sku_items` | Billed rows unavailable (none stored, e.g. failed request, or non-chat generation). |

In a reconciled block, a count is present only when that kind was billed (absent ≠ zero). Shape may change before a dedicated cost-allocation destination ships.

```json
{
  "openrouter_cost_allocation": {
    "cost_status": "reconciled",
    "input_tokens": 1000,
    "non_cache_input_tokens": 600,
    "cache_read_input_tokens": 400,
    "output_tokens": 50,
    "non_cache_input_cost": "0.0012",
    "cache_read_input_cost": "0.0002",
    "output_cost": "0.0005",
    "platform_cost": "0.00019",
    "is_byok": false,
    "billed_service_tier": "default",
    "is_long_context": false,
    "endpoint_region": "us-east-1",
    "endpoint_deployment_type": "global"
  }
}
```

#### Router timing

For Chat Completions, Responses, Messages, and Completions requests (not yet embeddings, rerank, image, video, audio, or batch). Sent on the **root generation only**; when a failed attempt is silently retried on another provider, only the generation that ends the request carries timing. Naming: metadata-bag destinations `openrouter_router_timing_<field>`; OTLP destinations `openrouter.router_timing.<field>` (under the destination's OpenRouter prefix); raw-trace destinations (e.g. S3) a `routerTiming` object. All values whole milliseconds except `attempt_count`. On a completed request the `_ms` fields sum to end-to-end time; no total is sent.

| Field | Measures | Left out when |
| - | - | - |
| `router_ms` | OpenRouter's own time before/after first dispatch, incl. time between fallback attempts (excludes guardrails, tools, routing models, media, provider, client wait). | No dispatch window recorded (then only `attempt_count` is sent). |
| `provider_ms` | Provider time on the attempt that served the response, minus client wait; includes requested prompt-cache creation. | Never reached a provider or no completion time (still sent if a prompt cache was created before dispatch). With >32 attempts or unknown serving attempt, carries all provider time. |
| `provider_failed_ms` | Provider time on attempts that didn't serve the response; all provider time if the last attempt failed. `provider_ms + provider_failed_ms` = total provider time. `0` when none failed. | Never reached provider / no completion time / serving attempt unknown. |
| `client_wait_ms` | Waiting for the client to accept data or end of stream. | Sent only when a wait was recorded (treat absent as `0`). |
| `guardrails_ms`, `tools_ms`, `routing_models_ms`, `media_ms` | Guardrails, server tools, routing models, file/media processing (on incomplete requests, only pre-dispatch part). Measured `0` sent as `0`. | `router_ms` left out, or no pre-dispatch breakdown recorded. |
| `attempt_count` | Provider dispatches incl. failures; `0` = never reached a provider. | Sent whenever a dispatch count exists. |

Unmeasured values are **omitted, never zeroed** — check presence before charting. Time decomposes into OpenRouter (`router_ms`), Provider (`provider_ms + provider_failed_ms`), Client (`client_wait_ms` or 0), Request-specific processing (`guardrails_ms + tools_ms + routing_models_ms + media_ms`). Broadcast waits up to **10 s** for the client to finish reading; slower clients get traces with no router timing. Legacy `openrouter_router_latency_ms` (`openrouter.router_latency_ms`) is still sent (wall-clock minus provider TTFT, successful requests only) but **will be removed after an announcement** — prefer router timing.

Webhook (OTLP JSON) example — first provider errored after 300 ms, fallback served; total 2000 ms:

```json
{
  "attributes": [
    { "key": "trace.metadata.openrouter.router_timing.router_ms", "value": { "doubleValue": 43 } },
    { "key": "trace.metadata.openrouter.router_timing.provider_ms", "value": { "doubleValue": 1600 } },
    { "key": "trace.metadata.openrouter.router_timing.provider_failed_ms", "value": { "doubleValue": 300 } },
    { "key": "trace.metadata.openrouter.router_timing.client_wait_ms", "value": { "doubleValue": 42 } },
    { "key": "trace.metadata.openrouter.router_timing.guardrails_ms", "value": { "doubleValue": 15 } },
    { "key": "trace.metadata.openrouter.router_timing.tools_ms", "value": { "doubleValue": 0 } },
    { "key": "trace.metadata.openrouter.router_timing.routing_models_ms", "value": { "doubleValue": 0 } },
    { "key": "trace.metadata.openrouter.router_timing.media_ms", "value": { "doubleValue": 0 } },
    { "key": "trace.metadata.openrouter.router_timing.attempt_count", "value": { "doubleValue": 2 } }
  ]
}
```

A request blocked by a guardrail after 70 ms carries `router_ms: 30`, `guardrails_ms: 40`, `tools_ms/routing_models_ms/media_ms: 0`, `attempt_count: 0`, and no provider/client fields.

**Derived latency metrics** (computed from `timeline` milestones, root generation only, omitted rather than zeroed): `openrouter_provider_time_to_first_token_ms` (needs `providerRequestMs` and `firstTokenMs`) and `openrouter_inter_token_latency_ms` = `(providerBodyEndMs - firstTokenMs) / (output_tokens - 1)` (needs ≥ 2 output tokens; so non-streamed or `max_tokens: 1` responses have none). OTLP names: `openrouter.provider_time_to_first_token_ms`, `openrouter.inter_token_latency_ms`. Every documented destination receives both.

#### Large trace values

Applies to OpenTelemetry-based destinations (Arize, Elastic, Grafana, Langfuse, LangSmith, New Relic, OTel Collector, Ramp, Sentry, Webhook). Values over the per-attribute limit (currently **10,000,000 characters**) are shortened rather than dropping the trace, with a boolean `<key>.truncated` attribute and an `openrouter_truncated` marker: `{ "omitted_items": N }`, `{ "omitted_keys": N }`, or `{ "reason": "too_large" | "unserializable" }`. Strings keep beginning and end with `[truncated]` in the middle; objects keep keys where possible (equal-share space split, one pass), else leading entries + `omitted_keys`; message arrays keep the first message and newest turns with `omitted_items` in the gap; other arrays keep leading elements. The span gets an `openrouter.trace_truncated` event (affected keys, reason, limit, plain-language message).

#### Optional trace data you can send

| Field | Where | Limit | Purpose |
| - | - | - | - |
| `user` | request body | ≤ 128 chars | Associate traces with an end user. |
| `session_id` | request body, or `x-session-id` header | ≤ 256 chars | Group related requests (conversation, agent workflow). Also drives deterministic sampling. |
| `trace` | request body | any JSON object | Arbitrary metadata passed to all destinations. |

```json
{
  "model": "openai/gpt-4o",
  "messages": [{ "role": "user", "content": "Summarize this document..." }],
  "user": "user_12345",
  "session_id": "session_abc123",
  "trace": {
    "trace_id": "workflow_12345",
    "trace_name": "Document Processing",
    "span_name": "Summarization Step",
    "generation_name": "Generate Summary",
    "environment": "production",
    "feature": "customer-support",
    "version": "1.2.3"
  }
}
```

Common `trace` keys (destination support varies; see each destination guide):

| Key | Description |
| - | - |
| `trace_id` | Group multiple requests into one trace (multi-step workflows). |
| `trace_name` | Root trace name (defaults to the model name). |
| `span_name` | Parent span grouping LLM operations (span contains the generation). |
| `generation_name` | Name of the specific generation (defaults to model name). |
| `parent_span_id` | Nest the OpenRouter trace under a span from your own tracing (e.g. OpenTelemetry). |

```text
Document Processing (trace_id: workflow_12345)
└── Summarization Step (span)
    └── Generate Summary (generation)
```

Link to an existing trace: `"trace": { "trace_id": "your-existing-trace-id", "parent_span_id": "your-existing-span-id" }` → your app trace → your span → `openai/gpt-4o` generation.

#### Fields exported by destination

One trace is built per request, but destinations store different subsets. The table lists fields each destination **does not** receive (everything else in the field groups — trace/account/span identity, timing, content, model/provider, tokens, token breakdowns, cost, unit prices, status, finish reason, cost allocation, metadata/tags — is sent; content fields are stripped under Privacy Mode). *(In the downloaded copy the icons distinguishing "sent" from "sent unless Privacy Mode" did not render; only "not sent" is reliable here.)*

| Destination | Not sent |
| - | - |
| Arize AX | span `parentObservationId`; `timestamp`, `startTime`, `endTime`, `routerLatencyMs`, `timeline`; all token counts and token breakdowns; `inputCost`, `outputCost`, `totalCost`; unit prices; `statusCode`; `version` |
| Braintrust | trace `id`; span `parentObservationId`; `timestamp`, `timeline`; trace-level `input`/`output`; `statusCode`; trace cost allocation; trace `metadata`, `type`, `version` |
| ClickHouse | trace `name`; span `name`; `timestamp`, `startTime`, `endTime`, `timeline`; trace-level `input`/`output`; `audioTokens`, `videoTokens`, `imageTokens`; `statusCode`, `statusMessage`; `finishReason`; trace cost allocation; trace `metadata`, `version` |
| Comet Opik | `userId`, `sessionId`, `apiKeyName`; `entityId`, `organizationId`, `creatorUserId`; span `parentObservationId`; `routerLatencyMs`, `timeline`; `providerSlug`; unit prices; `level`, `statusCode`, `statusMessage`; `normalizedFinishReason`; `type`, `version` |
| Datadog | trace `name`; `timestamp`, `endTime`, `timeline`; trace-level `input`/`output`; `modelParameters`; `level`; trace cost allocation; trace `metadata`, `type`, `version` |
| Google BigQuery *(beta)* | trace `name`; span `name`; `timestamp`, `startTime`, `endTime`, `timeline`; trace-level `input`/`output`; `audioTokens`, `videoTokens`, `imageTokens`; `statusCode`, `statusMessage`; `finishReason`; trace cost allocation; trace `metadata`, `version` |
| Grafana Cloud | span `parentObservationId`; `timestamp`, `timeline`; `statusCode`; `version` |
| Langfuse | `timestamp`, `timeline`; span `parentObservationId`; `statusCode` |
| LangSmith | span `parentObservationId`; `timestamp`, `timeline`; `statusCode`; `type`, `version` |
| New Relic | span `parentObservationId`; `timestamp`, `timeline`; `statusCode`; `version` |
| OpenTelemetry Collector | span `parentObservationId`; `timestamp`, `timeline`; `statusCode`; `version` |
| PostHog | `organizationId`, `creatorUserId`; `timestamp`, `endTime`, `timeline`; trace-level `input`/`output`; `modelParameters`, `providerSlug`; `totalTokens`; unit prices; `level`, `statusCode`; `finishReason`, `normalizedFinishReason`; span cost allocation; `tags`, span `metadata`, `version` |
| Raindrop *(beta)* | `apiKeyName`; all account identity; all span identity; `timestamp`, `startTime`, `endTime`, `timeline`; trace-level `input`/`output`; `modelParameters`, `providerSlug`; all token breakdowns; `inputCost`, `outputCost`; unit prices; all status fields; `normalizedFinishReason`; span cost allocation; `tags`, span `metadata`, `version` |
| Ramp | span `parentObservationId`; `timestamp`, `timeline`; `statusCode`; `version` |
| S3 / S3-Compatible | nothing (stores the raw trace, incl. `timeline` and `routerTiming`) |
| Sentry | `apiKeyName`, trace `name`; all account identity; span `parentObservationId`; `timestamp`, `routerLatencyMs`, `timeline`; trace-level `input`/`output`; `providerName`, `providerSlug`; unit prices; `level`, `statusCode`; `finishReason`; all cost allocation; all metadata/tags/`type`/`version` |
| Snowflake | trace `name`; span `name`; `timeline`; trace-level `input`/`output`; `audioTokens`, `videoTokens`, `imageTokens`; `statusCode`, `statusMessage`; `finishReason`; trace cost allocation; trace `metadata`, `version` |
| W&B Weave | all span identity; `startTime`, `timeline`; trace-level `input`/`output`; all status fields; span cost allocation; `tags`, span `metadata`, `type`, `version` |
| Webhook | span `parentObservationId`; `timestamp`, `timeline`; `statusCode`; `version` |

Every destination that receives `routerLatencyMs` also receives router timing (so Arize AX, Comet Opik, and Sentry get no router timing); every destination receives the two derived latency metrics. Elastic Observability and Hugging Face Storage Buckets are not in the field tables.

#### Per-destination controls

- **API key filtering**: select included keys (only their traces are sent; none selected = all keys **and chatroom requests**) and/or **excluded** keys (never sent; exclusions win). Use to route parts of an app to different platforms, isolate use cases, or sample production keys differently.
- **Sampling rate**: fraction of traces sent (`1.0` = all, `0.5` ≈ half; API range 0.0001–1). Sampling is **deterministic per `session_id`**: whole sessions are included or excluded together per destination (but not necessarily the same sessions across destinations).
- **Privacy Mode** (per destination, **Privacy** section checkbox / `privacy_mode`): strips input messages, output choices, and error text (`statusMessage` and every field of `metadata.openrouter_error` except `code` and `shadow`). Still sent: error level, status code, `openrouter_error.code`, error ownership, token counts, costs, timing, model info, model parameters (incl. `stop` text), custom metadata, Cost and Cost-allocation metadata. Use full traces in one destination for debugging and privacy-redacted traces in another for cost monitoring.

#### Gotchas

- Broadcast is per workspace; set it up in each workspace you use (or point several at the same platform).
- The `trace` object, model parameters (`stop`), and custom metadata are **not** stripped by Privacy Mode — don't put secrets/PII there.
- Use the root `GENERATION` observation for token/cost totals, not attempt spans.
- Don't sum `upstream_raw_response_usage` arrays; don't treat omitted timing fields as zero.
- Some destinations (dashboard-only types) can't be created through the destinations API.

Sources: https://openrouter.ai/docs/guides/features/broadcast, OpenAPI spec (`openapi.yaml`, Observability tag)

### 11.17 Notifications

Alerts when the account needs attention. Configure at [Settings → Notifications](https://openrouter.ai/settings/notifications), except the API key spend alert (set on each key's page).

| Tier | Alerts | Delivery |
| - | - | - |
| Basic (every plan) | Low balance, Model deprecation, Model price drop | Email |
| Advanced (Business & Enterprise) | Workspace budget limit, API key spend limit, New model available | Email; Slack and custom webhook for Workspace budget limit and the model alerts |

#### Alerts and triggers

| Alert | Group | Trigger |
| - | - | - |
| Low balance alert | Budget & Spend | Credit balance drops below a dollar amount (default **$100**). No re-alert while hovering near the line — balance must rise clearly above first. |
| Workspace budget limit | Budget & Spend | A workspace reaches a percentage of an already-configured workspace budget (defaults **80% and 100%**; editable, add/remove thresholds). |
| API key spend limit | Budget & Spend | A key reaches a percentage of its credit limit (defaults 80% and 100%). Requires the key to have a credit limit. |
| Model deprecation alert | Models | A recently used model is scheduled for retirement — names the model, when, and what to move to. Nothing to configure. |
| Model price drop alert | Models | A recently used model endpoint lowers input or output price — collected into a **daily digest** with old/new price per million tokens. |
| New model available | Models | A new model becomes available on OpenRouter. |

Turn on: Settings → Notifications → flip the switch (or open the alert) → set trigger → choose delivery and recipients → **Save**. Switching off stops messages but keeps settings.

API key spend limit: [Settings → API Keys](https://openrouter.ai/settings/keys) → open a key → give it a credit limit if missing (the **Notifications** section says when there's nothing to alert on) → **Notifications** → turn on, set percentages and recipients → **Save**. Each key is configured individually.

#### Recipients

Alerts go to **roles**, so they follow team changes: **Org admins** (whole org), **Workspace admins** (only their workspaces, for Workspace budget limit), **Key owner** (the key's creator, for key alerts). Specific org members can be added on top; only people in the org can be named — use Slack or a webhook for shared inboxes/tools. The **Low balance alert** goes to one chosen email address.

#### Delivery

- **Email**: every alert, no setup.
- **Slack**: paste a channel's Slack webhook URL into the **Slack** card → save.
- **Custom Webhook**: paste an `https://` URL into the **Custom Webhook** card → save.
- Slack/webhook only for Workspace budget limit, Model deprecation, Model price drop, New model available (Business/Enterprise). Low balance and API key spend limit are **email-only**.
- After saving a destination: **Test** sends a test alert; then in each alert enable **Webhook** under **Delivery methods** and tick the destination under **Send to** (Slack destinations are under **Webhook** too).
- A destination that keeps failing is **disabled** (shown on its card) rather than silently dropping alerts; fix it and click **Re-enable**.

The docs do not publish the custom-webhook payload schema.

Sources: https://openrouter.ai/docs/guides/features/notifications

### 11.18 Custom classifiers

Define a taxonomy and a model (OpenRouter recommends fast, inexpensive ones during setup) that tags each generation asynchronously after completion — **zero added latency**. Tags appear in [Logs](https://openrouter.ai/logs) and roll up in [Activity Explore](https://openrouter.ai/activity/explore).

#### Getting started

1. Workspace [Classifiers](https://openrouter.ai/workspaces/default/classifiers) page → **Create classifier**.
2. Pick a preset or build from scratch.
3. Optionally set a **sampling rate** (classify only a fraction of requests).
4. Save and activate.

Only workspace admins and org admins can create/manage classifiers. Each workspace has its own independent classifier(s).

#### Presets

| Preset | What it does |
| - | - |
| **Department** | Business function: Engineering, Sales, Marketing, Legal, HR, Finance, Operations |
| **Audience** | Who the output is for: Internal, Client-facing, Regulator, Public |
| **Engineering work** | Work type: Feature development, Bug fixing, Documentation, Refactoring, Code review, etc. |
| **Agent complexity** | Two dimensions: `difficulty_tier` (7 levels, trivial tool calls → frontier-expert work) and `task_family` (10 categories such as coding, analysis, planning) |
| **Capitalizable software expense** | Requires you to describe which projects/activities are capitalizable. Customers are responsible for the accuracy of any final financial or tax data. |

**Build your own**: up to **eight dimensions** per classifier.

#### What gets classified

The prompt is serialized into one labeled transcript inside a single user message:

```text
SYSTEM: <caller system prompt>
TOOLS: search_web, run_sql, send_email
USER: <first user message>
ASSISTANT: <…>
TOOL_CALL run_sql: <args>
TOOL_RESULT: <…>
USER: <latest user message>
```

- Only tool **names** are sent, not full schemas.
- Each turn truncated to **5,000 characters**, ending in `...[truncated]` when cut.
- If the classifier model's context is meaningfully shorter than the prompt, classification fails (the original request is unaffected). Prefer large-context models.

#### Pipeline, billing, failures

1. Request finishes and returns to your app.
2. A classification job is enqueued with the serialized prompt.
3. The classifier model evaluates it against your taxonomy using **structured outputs** (schema constrained to your dimensions and values) plus your classification prompt.
4. Tags are written to the generation record.

- **Billing**: classifier tokens bill like any generation against workspace credits, **attributed to the admin user who configured the classifier**, not to an API key. Control cost via model choice (e.g. Haiku/Flash-class).
- **Failures** (timeout, model error, invalid output): no tags written; API responses unaffected.
- Recent generations may not be tagged yet; generations skipped by sampling never get tags from that classifier.

#### Viewing

Log rows show a tag icon (hover for summary); the generation detail panel has a **Classifications** section. In organizations **only org admins** see tags — workspace admins who aren't org admins can manage classifiers but don't see the resulting tags.

#### Query classifications via API

Use `POST /api/v1/analytics/query` (management key; same query as Activity Explore).

| Field | Purpose |
| - | - |
| `classifier_dimensions` | Group by tags: `classifier_id`, optional `dimension_names` (up to two, each returned as its own column), `include_nulls: true` to include untagged generations. |
| `classifier_filters` | Filter by tag values: `classifier_id` + `filters` of `{ field, operator, value }` with operator `eq`, `neq`, `in`, `not_in`. Must use the same `classifier_id` as `classifier_dimensions` when both are present. |

Combine with standard `metrics`, `dimensions`, `filters`, `granularity` (schema [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).

**Find the classifier ID**: on the Classifiers page, click a dimension badge; Activity Explore opens with `dimension=clf::<classifier_id>::<dimension_name>` in the URL — the UUID between `clf::` and the next `::` is the id.

Tags per generation:

```bash
curl https://openrouter.ai/api/v1/analytics/query \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": ["total_usage"],
    "dimensions": ["generation_id"],
    "classifier_dimensions": { "classifier_id": "<classifier_id>", "dimension_names": ["department"] },
    "time_range": { "start": "2026-10-01T00:00:00Z", "end": "2026-10-02T00:00:00Z" },
    "limit": 1000
  }'
```

Each row in `data.data` has `generation_id`, a `department` key with the tag, and the metrics. Fetch more metadata with `GET /api/v1/generation`.

Usage by tag, filtered to two departments:

```bash
curl https://openrouter.ai/api/v1/analytics/query \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": ["request_count", "total_usage"],
    "classifier_dimensions": { "classifier_id": "<classifier_id>", "dimension_names": ["department"] },
    "classifier_filters": {
      "classifier_id": "<classifier_id>",
      "filters": [{ "field": "department", "operator": "in", "value": ["Engineering", "Sales"] }]
    },
    "granularity": "day",
    "time_range": { "start": "2026-10-01T00:00:00Z", "end": "2026-10-08T00:00:00Z" }
  }'
```

#### Tips and gotchas

- Start with a preset (Department, Engineering work) and customize later.
- Use a cheap model with a large context window.
- Verify tags are appearing in recent Logs after enabling.
- Classifiers are workspace-scoped (different workspaces can run different classifiers, or none); deleting a workspace deletes/disables its classifiers.
- Classification content (system prompt, tool names, turns) is sent to the classifier model you pick — consider its data policy.

Sources: https://openrouter.ai/docs/guides/features/classifiers

### 11.19 OpenRouter MCP server

A **remote** MCP server hosted by OpenRouter at `https://mcp.openrouter.ai/mcp` (HTTP transport; nothing installed locally). It gives coding assistants live OpenRouter data — models, prices, endpoints, your credits, rankings, benchmarks, docs — and lets them send quick test messages. It is a **development aid**: to run models in your application, call the OpenRouter API directly.

#### Connect (configuration for coding agents — document only)

Claude Code:

```bash
claude mcp add --transport http openrouter https://mcp.openrouter.ai/mcp
claude mcp login openrouter
# or inside a session: /mcp → select "openrouter" → Authenticate
```

Codex CLI:

```bash
codex mcp add openrouter --url https://mcp.openrouter.ai/mcp
codex mcp login openrouter   # opens the browser OAuth flow
```

OpenCode (`~/.config/opencode/opencode.json`; OAuth runs automatically on first use):

```json
{
  "mcp": {
    "openrouter": { "type": "remote", "url": "https://mcp.openrouter.ai/mcp", "enabled": true }
  }
}
```

Cursor CLI / IDE (`~/.cursor/mcp.json`; verify with `cursor-agent mcp list`; authenticate in Cursor MCP settings or on first tool use):

```json
{ "mcpServers": { "openrouter": { "url": "https://mcp.openrouter.ai/mcp" } } }
```

Claude Desktop / Web (not in Claude's connector directory): **Settings > Connectors > Customize > Connectors** → **+** → **Add custom connector** → Name `OpenRouter MCP`, Remote MCP server URL `https://mcp.openrouter.ai/mcp`, leave OAuth fields blank → **Add** → open it → **Connect**. Some organizations disallow custom connectors.

#### Authentication and the dedicated key

1. An unauthenticated request returns `401` pointing the client to OpenRouter's OAuth authorization server; the client registers, you approve a consent page in the browser, and a token is issued via **PKCE**.
2. The token is a standard OpenRouter API key labeled `OpenRouter MCP: <app name>`, **dedicated to that connection** (separate from your other keys), visible/revocable in [Settings > Keys](https://openrouter.ai/settings/keys).
3. Expiry: **7 days**, fixed and enforced (a client-requested expiry is ignored), so a leaked key stops working on its own. If your account/org sets a shorter **maximum API key lifetime** in privacy settings, the MCP key gets the shorter of that and 7 days.
4. Spend cap: starts at **$10** (editable on the approval screen).
5. Some clients don't pop the login automatically; trigger the per-client login step.

Tools proxy the public OpenRouter API with that key. No local state; no source code leaves your machine unless you call `send-message`, `generate-image`, or `send-feedback`.

#### Tools

Most are read-only. Billable: `send-message`, `generate-image`. Writes: `send-feedback`.

| Tool | What it does |
| - | - |
| `send-message` | Send a message to any model and get the reply (test prompts, compare models). **Billable.** Understands slug suffixes `:online`, `:nitro`, `:floor`, `:free`. Every reply includes the generation id. Grounded so the assistant won't name models from memory — defers to live lookup tools. |
| `generate-image` | Text-to-image; returns an inline image content block. **Billable.** |
| `list-models` | Search the live catalog: free text, sort (incl. Artificial Analysis intelligence/coding/agentic indexes, Design Arena ELO), filter by use case, prompt/completion price, min context, model age, benchmark ranges, tool-calling success rate, family, author, provider, input/output modality, supported parameters, ZDR or region. |
| `get-model` | Full details for one `author/slug` (supports `:variant` suffixes and aliases). |
| `list-model-endpoints` | Providers serving a model with price, latency, throughput, data policy. |
| `list-providers` | Providers available for routing preferences. |
| `list-daily-model-rankings` | Most-used and trending models by token volume. |
| `list-app-rankings` | Apps driving the most traffic, filterable by category. |
| `get-credits` | Remaining account credit. |
| `get-generation` | Cost, token counts, and serving provider for a generation id. |
| `list-benchmarks` | Artificial Analysis (intelligence, coding, agentic indexes) and Design Arena (elo, win rate) scores. |
| `list-task-classifications` | Market share by task type with top models per task and macro-category (Code, Data, Agent, General) aggregates. |
| `search-docs` | Search the OpenRouter docs. |
| `send-feedback` | Report a problem with one of **your own** generations (category + optional comment). **Writes.** |
| `spawn-ori-eval` | Returns instructions for running a model eval with Ori (your agent on your prompts, pinned harness and model) for the assistant to follow. |
| `install-ori-harness` | Returns an argument-free recipe for installing the Ori harness for the assistant to follow. |
| `ping` | Connection health check. |

Usage tips from the docs: ask "which model should I use for X" questions so the assistant consults `list-benchmarks`, `list-daily-model-rankings`, and `list-models`; pass a reply's generation id to `get-generation` to see exact cost and provider; pin a provider only when you need zero variance (evals, reproductions).

#### Troubleshooting and gotchas

- Auth errors on tool calls → re-run the client's authenticate step (key expired after 7 days or was disconnected).
- Login didn't pop up → use the manual per-client login command.
- `send-message`/`generate-image` spend real credits against the $10-capped key.
- `spawn-ori-eval` / `install-ori-harness` return instructions for the agent to execute; review them like any other tool output before running commands.

Sources: https://openrouter.ai/docs/guides/overview/mcp-server

### 11.20 Framework integrations

OpenRouter exposes an OpenAI-compatible API (plus Anthropic-compatible `/messages`), so most frameworks integrate either through a dedicated OpenRouter provider package or by pointing their OpenAI/Anthropic client at OpenRouter's base URL.

| Framework | Language | Package(s) | Integration style |
| - | - | - | - |
| OpenAI SDK | TS, Python | `openai` | Base URL swap → `https://openrouter.ai/api/v1` |
| Vercel AI SDK | TS | `ai`, `@openrouter/ai-sdk-provider` | Dedicated provider (`createOpenRouter`) |
| LangChain | Python, JS | `langchain-openrouter`, `@langchain/openrouter` | Dedicated `ChatOpenRouter` |
| Mastra | TS | `@mastra/core`, `@openrouter/ai-sdk-provider` | AI SDK provider inside Mastra `Agent` |
| PydanticAI | Python | `pydantic-ai-slim[openai]` | OpenAI-compatible model with base URL |
| TanStack AI | TS (React, Solid, Preact) | `@tanstack/ai`, `@tanstack/ai-openrouter` | Dedicated adapter (`openRouterText`) |
| Effect AI SDK | TS | `effect`, `@effect/ai`, `@effect/ai-openrouter`, `@effect/platform` | Dedicated `OpenRouterClient` / `OpenRouterLanguageModel` |
| Anthropic Agent SDK | TS, Python | `@anthropic-ai/claude-agent-sdk`, `claude-agent-sdk` | Env vars → `ANTHROPIC_BASE_URL=https://openrouter.ai/api` |
| TypeSafe SDK (Jev) | TS, Python | `@typesafe-ai/sdk`, `typesafe_sdk` | Base URL swap → `https://openrouter.ai/api` (System One API) |
| Extractions API | HTTP | — | `POST /api/alpha/extractions` |
| LlamaIndex | Python, TS | (external docs) | See [LlamaIndex OpenRouter](https://developers.llamaindex.ai/python/framework-api-reference/llms/openrouter/) |

Other listed integrations (external docs): [Aider](https://aider.chat/docs/llms/openrouter.html), [Cline](https://docs.cline.bot/provider-config/openrouter), [Deep Agents CLI](https://docs.langchain.com/oss/python/deepagents/cli/providers), [Junie CLI](https://openrouter.ai/docs/cookbook/coding-agents/junie), [Kilo Code](https://kilocode.ai/docs/providers/openrouter), [Langfuse](https://openrouter.ai/docs/guides/community/langfuse), [Roo Code](https://docs.roocode.com/providers/openrouter), [VSCode Copilot](https://code.visualstudio.com/docs/copilot/customization/language-models#_bring-your-own-language-model-key), [Xcode](https://openrouter.ai/docs/guides/community/xcode). More examples: [OpenRouterTeam/openrouter-examples](https://github.com/OpenRouterTeam/openrouter-examples). For OpenRouter's own SDKs see [§2](02-agent-sdk.md#2-agent-sdk-openrouteragent) (`@openrouter/agent`) and [§3](03-client-sdks.md#3-client-sdks-typescript-python-go) (`@openrouter/sdk`, Python, Go).

> In the examples below, doc placeholders like `'<OPENROUTER_API_KEY>'` / `"sk-or-..."` are replaced with environment-variable reads. Never hard-code keys.

#### OpenAI SDK

Install: `pip install openai` / `npm i openai`. Set `baseURL`/`base_url` to `https://openrouter.ai/api/v1`. Optional app-attribution headers `HTTP-Referer` and `X-OpenRouter-Title` ([§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) app attribution). OpenRouter-only parameters go in `extra_body` (Python). The docs also mention auto-migrating code with Grit (`npx @getgrit/launcher openrouter`).

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "<YOUR_SITE_URL>", // Optional. Site URL for rankings on openrouter.ai.
    "X-OpenRouter-Title": "<YOUR_SITE_NAME>", // Optional. Site title for rankings on openrouter.ai.
  },
});

const response = await openai.responses.create({
  model: "openai/gpt-4o",
  input: "Say this is a test",
});
console.log(response.output_text);
```

```python
from os import getenv
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=getenv("OPENROUTER_API_KEY"),
)

response = client.responses.create(
    model="openai/gpt-4o",
    extra_headers={
        "HTTP-Referer": "<YOUR_SITE_URL>",       # Optional
        "X-OpenRouter-Title": "<YOUR_SITE_NAME>", # Optional
    },
    # OpenRouter-only arguments go in extra_body, e.g. model fallbacks:
    # extra_body={"models": ["openai/gpt-4o", "mistralai/mixtral-8x22b-instruct"]},
    input="Say this is a test",
)
print(response.output_text)
```

Gotchas: use OpenRouter model slugs (`author/model`); OpenAI's Chat Completions API (`chat.completions.create`) works the same way against the same base URL ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)).

#### Vercel AI SDK (`@openrouter/ai-sdk-provider`)

Install (with the `ai` package):

```bash
npm install @openrouter/ai-sdk-provider   # pnpm add / yarn add / bun add @openrouter/ai-sdk-provider
deno add npm:@openrouter/ai-sdk-provider
```

Text streaming and tools:

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { z } from 'zod';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export const getLasagnaRecipe = async (modelName: string) => {
  const response = streamText({
    model: openrouter(modelName),
    prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  });
  await response.consumeStream();
  return response.text;
};

export const getWeather = async (modelName: string) => {
  const response = streamText({
    model: openrouter(modelName),
    prompt: 'What is the weather in San Francisco, CA in Fahrenheit?',
    tools: {
      getCurrentWeather: {
        description: 'Get the current weather in a given location',
        parameters: z.object({
          location: z.string().describe('The city and state, e.g. San Francisco, CA'),
          unit: z.enum(['celsius', 'fahrenheit']).optional(),
        }),
        execute: async ({ location, unit = 'celsius' }) => {
          const weatherData = {
            'Boston, MA': { celsius: '15°C', fahrenheit: '59°F' },
            'San Francisco, CA': { celsius: '18°C', fahrenheit: '64°F' },
          };
          const weather = weatherData[location];
          if (!weather) return `Weather data for ${location} is not available.`;
          return `The current weather in ${location} is ${weather[unit]}.`;
        },
      },
    },
  });
  await response.consumeStream();
  return response.text;
};
```

The docs' tool snippet uses the `parameters` key; confirm the tool-definition key expected by your installed `ai` major version.

**Video generation** via `experimental_generateVideo` — the provider handles async submit → poll → download ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) video generation):

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { experimental_generateVideo as generateVideo } from 'ai';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const { video } = await generateVideo({
  model: openrouter.videoModel('google/veo-3.1'),
  prompt: 'A golden retriever playing fetch on a sunny beach with waves crashing in the background',
  aspectRatio: '16:9',
  duration: 4,
});
console.log(video.mediaType);             // 'video/mp4'
console.log(video.uint8Array.byteLength); // size in bytes
```

Passthrough options: model-specific parameters go in `extraBody.provider.options`, keyed by provider slug (allowed keys per model: `allowed_passthrough_parameters` in the video docs):

```typescript
const { video } = await generateVideo({
  model: openrouter.videoModel('google/veo-3.1', {
    generateAudio: true,
    extraBody: {
      provider: {
        options: {
          'google-vertex': { parameters: { personGeneration: 'allow_all', enhancePrompt: true } },
        },
      },
    },
  }),
  prompt: 'A timelapse of a flower blooming in a sunlit garden',
  aspectRatio: '16:9',
});

// Wan 2.7 via Atlas Cloud
const { video: wan } = await generateVideo({
  model: openrouter.videoModel('alibaba/wan-2.7', {
    extraBody: { provider: { options: { 'atlas-cloud': { negative_prompt: 'blurry, low quality, distorted, watermark' } } } },
  }),
  prompt: 'A character walking through a forest',
  aspectRatio: '16:9',
  duration: 4,
});
```

| `videoModel` setting | Type | Default | Description |
| - | - | - | - |
| `generateAudio` | boolean | `false` | Generate audio alongside the video |
| `pollIntervalMs` | number | `2000` | Polling interval (ms) |
| `maxPollTimeMs` | number | `600000` | Max wait before timing out (ms) |
| `extraBody` | object | — | Default body params merged into every request for this model |

Image-to-video: pass `image: new URL('https://example.com/first-frame.png')` (with e.g. `resolution: '1920x1080'`) to `generateVideo`. Provider metadata: `result.providerMetadata?.openrouter` → `{ generationId: 'gen-...', cost: 0.25 }`.

#### LangChain

Packages: Python [`langchain-openrouter`](https://pypi.org/project/langchain-openrouter/) (`pip install langchain-openrouter`), JS [`@langchain/openrouter`](https://www.npmjs.com/package/@langchain/openrouter) (`npm install @langchain/openrouter`). Both expose `ChatOpenRouter`.

```typescript
import { ChatOpenRouter } from "@langchain/openrouter";

const model = new ChatOpenRouter("anthropic/claude-sonnet-4.6", { temperature: 0.8 });

const response = await model.invoke([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello, how are you?" },
]);
```

```python
from langchain_openrouter import ChatOpenRouter

model = ChatOpenRouter(model="anthropic/claude-sonnet-4.6", temperature=0.8)
response = model.invoke("What NFL team won the Super Bowl in the year Justin Bieber was born?")
print(response.content)
```

The snippets don't show key configuration; the package reads your OpenRouter key per LangChain's integration docs (typically from the environment). Streaming, tool calling, structured output, reasoning, multimodal input, and provider routing are documented in LangChain's [Python](https://docs.langchain.com/oss/python/integrations/chat/openrouter) and [JavaScript](https://docs.langchain.com/oss/javascript/integrations/chat/openrouter) `ChatOpenRouter` guides.

#### Mastra

Mastra uses the AI SDK provider.

1. Create a project: `npx create-mastra@latest` (e.g. name `my-mastra-openrouter-app`, component **Agents**, default provider OpenAI — replaced below; example code optional).
2. In `.env.development`, remove `OPENAI_API_KEY` and add `OPENROUTER_API_KEY=...`. Optionally `npm uninstall @ai-sdk/openai`, then `npm install @openrouter/ai-sdk-provider`.
3. Replace the agent file (e.g. `src/mastra/agents/agent.ts`):

```typescript
import { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export const assistant = new Agent({
  model: openrouter('~anthropic/claude-opus-latest'),
  name: 'Assistant',
  instructions: 'You are a helpful assistant with expertise in technology and science.',
});
```

4. Register it in `src/mastra/index.ts`:

```typescript
import { Mastra } from '@mastra/core';
import { assistant } from './agents/agent';

export const mastra = new Mastra({ agents: { assistant } });
```

5. `npm run dev` → REST endpoint `http://localhost:4111/api/agents/assistant/generate`, playground `http://localhost:4111`:

```bash
curl -X POST http://localhost:4111/api/agents/assistant/generate \
  -H "Content-Type: application/json" \
  -d '{"messages": ["What are the latest advancements in quantum computing?"]}'
```

Direct use and options:

```typescript
const response = await assistant.generate([
  { role: 'user', content: 'Tell me about renewable energy sources.' },
]);
console.log(response.text);

// Provider-level and model-level extra body (e.g. reasoning budget)
const openrouterWithReasoning = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  extraBody: { reasoning: { max_tokens: 10 } },
});
const chefAgent = new Agent({
  model: openrouterWithReasoning('~anthropic/claude-sonnet-latest', {
    extraBody: { reasoning: { max_tokens: 10 } },
  }),
  name: 'Chef',
  instructions: 'You are a chef assistant specializing in French cuisine.',
});

// Per-message provider options: key can be 'anthropic' or 'openrouter'
await chefAgent.generate([
  {
    role: 'system',
    content: 'You are Chef Michel, a culinary expert specializing in ketogenic (keto) diet...',
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  },
  { role: 'user', content: 'Can you suggest a keto breakfast?' },
]);
```

Multiple models: create several `Agent`s with different `openrouter('<slug>')` models (e.g. `~anthropic/claude-opus-latest`, `openai/gpt-4`). The `~author/...-latest` slugs are OpenRouter aliases tracking the newest model in a family ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

#### PydanticAI

```bash
pip install 'pydantic-ai-slim[openai]'
```

```python
import os
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIModel

model = OpenAIModel(
    "anthropic/claude-sonnet-4.6",  # any OpenRouter model
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

agent = Agent(model)
result = await agent.run("What is the meaning of life?")  # inside an async function
print(result)
```

This is the form the OpenRouter docs show; PydanticAI's model/provider constructor signatures change between releases, so check the [PydanticAI docs](https://ai.pydantic.dev/models/#api_key-argument) for your installed version.

#### TanStack AI (`@tanstack/ai-openrouter`)

```bash
npm install @tanstack/ai @tanstack/ai-openrouter
# env: OPENROUTER_API_KEY=sk-or-...
```

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("openai/gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

Explicit configuration:

```typescript
import { createOpenRouter, type OpenRouterConfig } from "@tanstack/ai-openrouter";

const config: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1", // optional
  httpReferer: "https://your-app.com",     // optional, for rankings
  xTitle: "Your App Name",                 // optional, for rankings
};
const adapter = createOpenRouter(config.apiKey, config);
```

Server route streaming SSE:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

export async function POST(request: Request) {
  const { messages } = await request.json();
  const stream = chat({ adapter: openRouterText("openai/gpt-5.2"), messages });
  return toServerSentEventsResponse(stream);
}
```

Tools:

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
});
const getWeather = getWeatherDef.server(async ({ location }) => ({ temperature: 72, conditions: "sunny" }));

const stream = chat({
  adapter: openRouterText("openai/gpt-5.2"),
  messages: [{ role: "user", content: "What's the weather in NYC?" }],
  tools: [getWeather],
});
```

OpenRouter routing via `modelOptions` (passed through as request fields; semantics in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)):

```typescript
// Model fallbacks
chat({ adapter: openRouterText("openai/gpt-5.2"), messages,
  modelOptions: { models: ["anthropic/claude-sonnet-4.5", "google/gemini-3.1-pro-preview"], route: "fallback" } });

// Provider sorting
chat({ adapter: openRouterText("openai/gpt-5.2"), messages, modelOptions: { provider: { sort: "throughput" } } });

// Explicit provider order
chat({ adapter: openRouterText("anthropic/claude-sonnet-4.5"), messages,
  modelOptions: { provider: { order: ["anthropic", "amazon-bedrock", "google-vertex"], allow_fallbacks: true } } });

// Data privacy
chat({ adapter: openRouterText("openai/gpt-5.2"), messages, modelOptions: { provider: { data_collection: "deny", zdr: true } } });

// Include/exclude providers, quantizations
chat({ adapter: openRouterText("meta-llama/llama-3.3-70b-instruct"), messages,
  modelOptions: { provider: { only: ["together", "fireworks"], ignore: ["azure"], quantizations: ["fp16", "bf16"] } } });

// Price ceiling
chat({ adapter: openRouterText("z-ai/glm-4.7"), messages,
  modelOptions: { provider: { max_price: { prompt: 0.5, completion: 2 } } } });
```

#### Effect AI SDK (`@effect/ai-openrouter`)

```bash
npm install effect @effect/ai @effect/ai-openrouter @effect/platform
```

```typescript
import { LanguageModel } from "@effect/ai"
import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { FetchHttpClient } from "@effect/platform"
import { Config, Effect, Layer, Stream } from "effect"

const Gpt4o = OpenRouterLanguageModel.model("openai/gpt-4o")

const program = LanguageModel.streamText({
  prompt: [
    { role: "system", content: "You are a comedian with a penchant for groan-inducing puns" },
    { role: "user", content: [{ type: "text", text: "Tell me a dad joke" }] }
  ]
}).pipe(
  Stream.filter((part) => part.type === "text-delta"),
  Stream.runForEach((part) => Effect.sync(() => process.stdout.write(part.delta))),
  Effect.provide(Gpt4o)
)

const OpenRouter = OpenRouterClient.layerConfig({
  apiKey: Config.redacted("OPENROUTER_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

program.pipe(Effect.provide(OpenRouter), Effect.runPromise)
```

`Config.redacted("OPENROUTER_API_KEY")` reads the key from the environment as a redacted value.

#### Anthropic Agent SDK

The Agent SDK runs on Claude Code's runtime, so it uses the same environment variables to target OpenRouter's Anthropic-compatible API:

```bash
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
export ANTHROPIC_API_KEY=""   # Important: must be explicitly empty
```

TypeScript (`npm install @anthropic-ai/claude-agent-sdk`):

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] },
})) {
  if (message.type === "assistant") console.log(message.message.content);
}
```

Python (`pip install claude-agent-sdk`):

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
    ):
        print(message)

asyncio.run(main())
```

Model overrides work as in Claude Code: `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, etc. route to other OpenRouter models (Claude Code integration cookbook).

Gotchas: base URL is `https://openrouter.ai/api` (the SDK appends its own path) — not `/api/v1`. The docs require `ANTHROPIC_API_KEY` to be set **explicitly empty**; don't leave a real Anthropic key in it. The OpenRouter key goes in `ANTHROPIC_AUTH_TOKEN`.

#### Jev and the TypeSafe SDK (System One / decision models)

**Jev** (`typesafe/jev-1.14`; alias `~typesafe/jev-latest`; `typesafe/jev-1.13` still available) is a structured **decision model** from TypeSafe — the first "System One" model. You send application `state` plus typed `questions`; it returns typed answers with probabilities, not text. It produces no reasoning, explanations, or prose, and is not a drop-in chat model: it replaces "prompt an LLM, parse a label". Available to any OpenRouter API key, billed to your OpenRouter account, no TypeSafe account needed.

| Primitive (`type`) | Question | Returns |
| - | - | - |
| `choice` | Which one of these options? (`criteria` map of option → description) | Selected option, per-option probability, confidence |
| `noul` | Does this condition hold? | Probability of yes (e.g. `{ "type": "noul", "noul": 0.98 }`) |
| `score` | Where on an ordered scale? | Probability-weighted position, per-level probability, confidence |
| `box` | Where in this image is the described thing? | `box: { top, bottom, left, right }` as fractions of image height/width (from top-left), plus `confidence` |

Key facts: input text and images (`state` + `questions`); context 262,144 tokens; **output tokens free**, pay per input token; every response has `usage.cost` (USD); provider TypeSafe. Requests with > ~32,000 bytes of text, and every request with an image, run in TypeSafe's long-context mode (slower, less accurate per TypeSafe).

Box questions: take `type` and `instructions` (no `criteria`); write `instructions` as a description of the target (not a command) and name the image. **Jev 1.14 only** — Jev 1.13 returns `400`, and no other decision model supports Box. Box always returns four edges (no "not found"); ask a Noul question about presence in the same request. Image input and Box are early features whose format and limits can change.

```json
{
  "model": "typesafe/jev-1.14",
  "state": [
    "Product photo from the listing:",
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }
  ],
  "questions": { "product": { "type": "box", "instructions": "the product in the listing photo" } }
}
```

```json
{ "product": { "type": "box", "box": { "top": 0.49, "bottom": 0.89, "left": 0.58, "right": 0.96 }, "confidence": 0.93 } }
```

Two API surfaces (same key, same billing; schemas in [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs)):

| Surface | Endpoint | Use when |
| - | - | - |
| Decisions API (alpha) | `POST https://openrouter.ai/api/alpha/decisions` | Plain HTTP from any language, or OpenRouter TS/Python/Go SDK `decisions` resource |
| System One API | `POST https://openrouter.ai/api/v1/systemone` | You already use the TypeSafe JS/Python SDK and want to switch by base URL |

**TypeSafe SDK pointed at OpenRouter** — packages `@typesafe-ai/sdk` (JS/TS) and `typesafe_sdk` (Python). Base URL `https://openrouter.ai/api` (the SDK appends `/v1/systemone`). Auth: your OpenRouter key as `Authorization: Bearer`, set via `apiKey`/`api_key` or `TYPESAFE_API_KEY`. Both SDKs also read `TYPESAFE_BASE_URL`, so you can set `TYPESAFE_BASE_URL=https://openrouter.ai/api` and `TYPESAFE_API_KEY=<OpenRouter key>` without code changes.

```typescript
import { TypeSafeClient } from '@typesafe-ai/sdk';

const client = new TypeSafeClient({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api',
});

const result = await client.systemOne({
  model: 'jev-1.13',
  state: 'I was charged twice for my subscription.',
  questions: {
    refund: { type: 'noul', instructions: 'Is the customer asking for money back?' },
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' },
    },
  },
});
console.log(result.answers.refund); // { type: 'noul', noul: 0.98 }
```

```python
import os
from typesafe_sdk import TypeSafeClient

client = TypeSafeClient(api_key=os.environ["OPENROUTER_API_KEY"], base_url="https://openrouter.ai/api")

result = client.system_one(
    model="jev-1.13",
    state="I was charged twice for my subscription.",
    questions={
        "refund": {"type": "noul", "instructions": "Is the customer asking for money back?"},
        "department": {
            "type": "choice",
            "instructions": "Which team should handle this?",
            "criteria": {"billing": "Charges and refunds", "technical": "Bugs and outages"},
        },
    },
)
print(result.answers["refund"])
```

```bash
curl https://openrouter.ai/api/v1/systemone \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev-1.13",
    "state": "I was charged twice for my subscription.",
    "questions": { "refund": { "type": "noul", "instructions": "Is the customer asking for money back?" } }
  }'
```

```json
{
  "id": "gen-dec-1789738314-X5e5eKGQdvR9rblyX250",
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": { "refund": { "type": "noul", "noul": 0.98 } },
  "usage": { "input_tokens": 275, "output_tokens": 20, "cost": 0.00003 }
}
```

- Requests require `model`, `state`, `questions`; responses contain `model`, `answers`, `usage`, plus OpenRouter's `id`, `provider`, `usage.cost` (SDKs pass them through).
- Model ID mapping: `jev-1.13` → `typesafe/jev-1.13`; `jev-latest` → `~typesafe/jev-latest`; ids with an author prefix used as-is. Response `model` is the OpenRouter id that served it.
- Only `POST /api/v1/systemone` is supported. The SDK's `client.models.list()` calls OpenRouter's `GET /api/v1/models`, whose shape differs, so the **SDK rejects it** — browse models on the site or call the Models API directly.

**Other decision models** (same Decisions API; change `model`): as of Oct 16, 2026, 22 decision models from 13 makers, e.g. `openai/gpt-6-luna-decisions`, `microsoft/microsoft-decision-1`, `perplexity/pplx-decider-v1.2`, `perplexity/pplx-decider-flash-v1.2`, `cloudflare/clef`, `cloudflare/clef-flash`, `cloudflare/clef-omni` (adds audio/video), `inception/mercury-decide`, `liquid/d1`, `liquid/d1-ultra`, `upstage/solar-decide`, `upstage/solar-decide-flash`; Nace.AI, Respan, ScaleDown, Together, and Jared Palmer also serve some. Box is Jev-only; ScaleDown Classify-1 and Respan Span-01 take their own `state` shapes. **Probabilities differ between models — re-pick thresholds per model.** List: [decision models](https://openrouter.ai/models?output_modalities=decisions). Related: Jev Router ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) routers), cookbooks (tool-call gating, verified cascades, classification at scale, auto-approving coding-agent permission prompts), [Jev Lab](https://openrouter.ai/labs/jev), [Decisions Lab](https://openrouter.ai/labs/decisions), [TypeSafe docs](https://docs.typesafe.ai).

#### Extractions API (alpha)

`POST /api/alpha/extractions` returns typed **fields** (invoice number, total as a number, due date, list of names, estimates with distributions) from text, images, and PDFs, with the probability that the source contains nothing for each field. **Alpha** — shape can change. Uses the Decisions envelope (`model`, `state`, `assets`, `provider`, `user`, `session_id`, `trace`) with a `fields` map instead of `questions`; field specs are **not** Decisions question types, so porting means rewriting each question as a field. A top-level `questions` key on this route → `400`. Full schema: [§6](06-endpoints-other-inference.md#6-endpoint-reference--other-inference--async-jobs).

| Model | Reads | Field types | Provider options |
| - | - | - | - |
| `cloudflare/clairic` | Text and up to 4 PNG/JPEG images | All types | `include_quantiles`, `return_state_text` under `provider.options.cloudflare` |
| `inception/mercury-decide` | Text only | `text`, and `list` with `items: "text"` | `snap_to_words`, `threshold`, `group_fields` under `provider.options.inception` |
| `scaledown/extract` | Text, **or** one PDF or image | `text`, and `list` with `items: "text"` | `threshold`, `top_n` under `provider.options.scaledown` |

A request a model can't serve (e.g. a `date` field on Mercury Decide, an image on a text-only model, a fifth image on Clairic) fails `400` before reaching the provider. List supporting models: `curl "https://openrouter.ai/api/v1/models?endpoints=/api/alpha/extractions"` (`output_modalities` can't select them).

```bash
curl https://openrouter.ai/api/alpha/extractions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cloudflare/clairic",
    "state": "Invoice INV-2291 issued 2026-09-02, net 30. Contacts: Dana Ruiz, Priya Shah. Total $1080.",
    "fields": {
      "invoice_number": { "type": "text" },
      "due_date": { "type": "date", "instructions": "Issue date plus the net payment days" },
      "total": { "type": "number", "decimals": 2, "unit": "USD" },
      "contacts": { "type": "list", "items": "text" },
      "days_to_pay": { "type": "estimate", "min": 0, "max": 120, "step": 1 }
    },
    "reference_date": "2026-10-28"
  }'
```

```json
{
  "id": "gen-dec-1793251006-X5e5eKGQdvR9rblyX250",
  "model": "cloudflare/clairic",
  "provider": "Cloudflare",
  "answers": {
    "invoice_number": { "type": "text", "value": "INV-2291", "span": [8, 16], "guess": "INV-2291", "p_null": 3.8e-10, "confidence": 1 },
    "due_date": { "type": "date", "value": "2026-10-02", "guess": "2026-10-02", "p_null": 1.9e-8 },
    "total": { "type": "number", "value": 1080, "guess": 1080, "p_null": 2.3e-8, "confidence": 0.9999 },
    "contacts": { "type": "list", "value": ["Dana Ruiz", "Priya Shah"], "spans": [[53, 62], [64, 74]], "confidence": 0.9999 },
    "days_to_pay": { "type": "estimate", "value": 30, "mean": 29.5, "median": 30, "p10": 21, "p90": 38 }
  },
  "truncated": false,
  "usage": { "input_tokens": 655, "output_tokens": 0, "cost": 0.0000655, "state_tokens": 61, "image_tokens": 0, "schema_tokens": 472, "passes": 3 }
}
```

Request fields:

- `model` (from the table), `state` (text; may be empty only when the request carries assets), `fields` (≥ 1 field).
- Unknown keys at top level or inside a field → `400` (never silently ignored).
- `reference_date` (`YYYY-MM-DD`) anchors year-less dates; models without date fields reject it.
- `assets`, `provider`, `user`, `session_id`, `trace` as on `/api/alpha/decisions`.

Field types (every field takes `type`, optional `instructions`, optional `null_threshold` — probability of null above which `value` is `null`, default `0.5`; `?` = optional):

| `type` | Field keys | Answer keys |
| - | - | - |
| `text` | `instructions?`, `null_threshold?` | `value`, `guess?`, `span?`, `p_null?`, `confidence?`, `source?`, `spell_confidence?` |
| `number` | + `unit?`, `integer?`, `decimals?` | same as text |
| `date` | `instructions?`, `null_threshold?` | same as text |
| `time` | `instructions?`, `null_threshold?` | same as text |
| `datetime` | `instructions?`, `null_threshold?` | same as text |
| `duration` | + `unit?`, `integer?`, `decimals?` | + `unit?` |
| `list` | + `items` (required), `decimals?` | `value`, `guess?`, `spans?`, `confidences?`, `p_null?`, `confidence?`, `source?`, `spell_confidence?` |
| `estimate` | + `unit?`, `min`, `max`, `step?`, `scale?` | `value`, `guess?`, `mean?`, `median?`, `p10?`, `p90?`, `p_below?`, `p_above?`, `quantiles?`, `p_null?`, `confidence?`, `source?`, `spell_confidence?` |
| `forecast` | + `unit?`, `min`, `max`, `step?`, `scale?`, `horizon`, `interval` | `value`, `guess?`, `mean?`, `median?`, `p10?`, `p90?`, `steps?`, `p_null?`, `confidence?`, `source?`, `spell_confidence?` |

- `decimals`: 0–6 places kept in `value`. `duration.unit`: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years`.
- `list.items`: `text`, `number`, or `date`.
- `estimate`/`forecast`: `min`/`max` numbers (or ISO dates for date estimates); `step` positive number (days for date estimates) or `"month"`/`"year"`; `scale` `linear` or `log`. `forecast.horizon` 1–64 steps; `interval` ∈ `step`, `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`.

Answers: `value` (typed, or `null` when `p_null` crossed the threshold) and `guess` (most likely value even then); `p_null` (probability of nothing), `confidence`; `span`/`spans` = `[start, end)` **Unicode code point** offsets into the state (`return_state_text` on Clairic returns the exact `state_text` they index); `source` = `image` or `document` when read from an asset, with `spell_confidence`; estimate/forecast distributions (`p_below`/`p_above` = mass outside `min`/`max`, `quantiles` when requested, per-step `steps`); top-level `truncated: true` when only a prefix of the state was read; `usage.passes` = upstream calls needed when fields didn't fit in one.

Assets: top-level `assets` map, each `{ "type"?: "image"|"document", "format": "png"|"jpg"|"jpeg"|"pdf", "data_base64": "..." }` (standard base64, **no `data:` prefix**). Every asset key must be referenced in `state` or a field's `instructions`, else `400` naming the unused key. A `state` that is exactly the sole asset's key is file-only.

```json
{
  "model": "cloudflare/clairic",
  "state": "Receipt photos, front then back: receipt-front, receipt-back",
  "assets": {
    "receipt-front": { "format": "jpg", "data_base64": "/9j/4AAQSkZJRg..." },
    "receipt-back": { "format": "jpg", "data_base64": "/9j/4AAQSkZJRg..." }
  },
  "fields": {
    "total": { "type": "number", "decimals": 2 },
    "return_policy": { "type": "text", "instructions": "The return policy printed on receipt-back" }
  }
}
```

- Clairic: ≤ 4 PNG/JPEG images, each ≤ 4 MiB decoded, ≤ 8 MiB decoded total, body ≤ 16 MiB; no PDFs. Reads images **positionally** in `assets` key order (no in-text reference syntax). With ≥ 2 images, using a key as the whole `state` or whole field `instructions` → `400` (ambiguous) — name each image inside longer text.
- ScaleDown Extract: one PDF or image per request, and reads either text **or** the document, not both — use the file-only `state` form.
- Mercury Decide: text only; any asset → `400`.

Provider options (`provider.options.<slug>`; each model accepts only its own keys, else `400` listing accepted keys): `cloudflare` — `include_quantiles` (adds 99 percentiles to estimates as `quantiles`), `return_state_text`; `inception` — `snap_to_words`, `threshold`, `group_fields` (send all fields in one question, up to 26 per upstream pass: fewer state copies, but a token can belong to only one field); `scaledown` — `threshold`, `top_n` (Extract reports no null probability, so `null_threshold` on a field → `400`).

#### Integration gotchas

- Base URL differs by compatibility layer: OpenAI-compatible clients use `https://openrouter.ai/api/v1`; Anthropic Agent SDK and TypeSafe SDK use `https://openrouter.ai/api` (they append their own paths).
- Always use OpenRouter model slugs (`author/model`, or `~author/...-latest` aliases).
- OpenRouter-specific request fields (`models`, `provider`, `reasoning`, `plugins`, …) go through each framework's passthrough: `extra_body` (OpenAI Python), `extraBody` (AI SDK provider / Mastra), `modelOptions` (TanStack AI).
- Decision and extraction models are not chat models — don't send them through chat frameworks; use the Decisions/Extractions/System One routes.

Sources: https://openrouter.ai/docs/guides/community/frameworks-and-integrations-overview, https://openrouter.ai/docs/guides/community/openai-sdk, https://openrouter.ai/docs/guides/community/vercel-ai-sdk, https://openrouter.ai/docs/guides/community/langchain, https://openrouter.ai/docs/guides/community/mastra, https://openrouter.ai/docs/guides/community/pydantic-ai, https://openrouter.ai/docs/guides/community/tanstack-ai, https://openrouter.ai/docs/guides/community/effect-ai-sdk, https://openrouter.ai/docs/guides/community/anthropic-agent-sdk, https://openrouter.ai/docs/guides/community/jev, https://openrouter.ai/docs/guides/community/typesafe-sdk, https://openrouter.ai/docs/guides/community/extractions
