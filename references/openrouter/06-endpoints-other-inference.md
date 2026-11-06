# OpenRouter Reference — 6. Endpoint reference — other inference & async jobs

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 05-endpoints-core-inference.md](05-endpoints-core-inference.md) · [Next: 07-endpoints-platform.md →](07-endpoints-platform.md)

## 6. Endpoint reference — other inference & async jobs

This section documents every non-text inference and async-job operation in the OpenRouter OpenAPI spec: Embeddings, Rerank, Images, Video Generation, TTS, STT, Batch, Files, Containers, SystemOne, `alpha.decisions`, `alpha.extractions`, and the server-tools catalog (Tools). That is 30 operations. The core text endpoints (`/chat/completions`, `/responses`, `/messages`) are in [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference). Batch request bodies reuse those schemas, so they are not repeated here. Concept guides for batch, files, containers, and the Jev/Extractions community integrations are in [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations). Server-tool usage inside inference requests is in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

### 6.1 Conventions for this section

**Base URL:** `https://openrouter.ai/api/v1`. Every path below is relative to it, except the two alpha routes:

| Route | Real URL |
| - | - |
| `POST /api/alpha/decisions` | `https://openrouter.ai/api/alpha/decisions` |
| `POST /api/alpha/extractions` | `https://openrouter.ai/api/alpha/extractions` |

> The spec lists these two paths as `/api/alpha/...` while its single server is `https://openrouter.ai/api/v1`. Joined naively that gives `.../api/v1/api/alpha/decisions`, which is wrong. Every guide and curl example uses `https://openrouter.ai/api/alpha/decisions` and `https://openrouter.ai/api/alpha/extractions`. With raw HTTP, use those full URLs. The TS SDK exposes the routes as `openRouter.alpha.decisions.create` and `openRouter.alpha.extractions.create`, and each method accepts an optional `options.serverURL` override.

**Auth:** every operation here uses a regular OpenRouter API key, `Authorization: Bearer $OPENROUTER_API_KEY`. None of them need a management key. The spec sets the global `apiKey` bearer scheme on all of them except `GET /tools` and `GET /tools/{name}`, which declare the `bearer` scheme explicitly. It is the same header, but the TS SDK takes it as a per-call `{ bearer }` security argument for those two (see [§6.14](#614-server-tools-catalog-get-tools-get-toolsname)). The image and video model-listing guides call `GET /images/models`, `GET /images/models/{author}/{slug}/endpoints`, and `GET /videos/models` with plain unauthenticated `curl`.

**Global-only endpoints:** the Files API and Containers work only on `https://openrouter.ai`. The in-region hosts (`eu.openrouter.ai`, `us.openrouter.ai`) return `403` for Files, and an error for containers. Batch runs on US-based infrastructure; use the global endpoint for it (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) for in-region routing).

**Operation index**

| # | Method & path | operationId | TS SDK call (`@openrouter/sdk`) | Request → response content type |
| - | - | - | - | - |
| 1 | `POST /embeddings` | `createEmbeddings` | `openRouter.embeddings.generate({ requestBody })` | JSON → JSON |
| 2 | `GET /embeddings/models` | `listEmbeddingsModels` | `openRouter.embeddings.listModels()` (paginated iterator) | — → JSON |
| 3 | `POST /rerank` | `createRerank` | `openRouter.rerank.rerank({ requestBody })` | JSON → JSON |
| 4 | `POST /images` | `createImages` | `openRouter.images.generate({ imageGenerationRequest })` | JSON → JSON, or SSE when `stream: true` |
| 5 | `GET /images/models` | `listImageModels` | `openRouter.images.listModels()` | — → JSON |
| 6 | `GET /images/models/{author}/{slug}/endpoints` | `listImageModelEndpoints` | `openRouter.images.listModelEndpoints({ author, slug })` | — → JSON |
| 7 | `POST /videos` | `createVideos` | `openRouter.videoGeneration.generate({ videoGenerationRequest })` | JSON → JSON (`202`) |
| 8 | `GET /videos/{jobId}` | `getVideos` | `openRouter.videoGeneration.getGeneration({ jobId })` | — → JSON |
| 9 | `GET /videos/{jobId}/content` | `listVideosContent` | `openRouter.videoGeneration.getVideoContent({ jobId, index? })` | — → `video/mp4` bytes |
| 10 | `GET /videos/models` | `listVideosModels` | `openRouter.videoGeneration.listVideosModels()` | — → JSON |
| 11 | `POST /audio/speech` | `createAudioSpeech` | `openRouter.tts.createSpeech({ speechRequest })` → `ReadableStream<Uint8Array>` | JSON → `audio/*` bytes |
| 12 | `POST /audio/transcriptions` | `createAudioTranscriptions` | `openRouter.stt.createTranscription({ sttRequest })` / `openRouter.stt.createTranscriptionMultipart({ requestBody })` | JSON or `multipart/form-data` → JSON |
| 13 | `POST /batches` | `createBatches` | `openRouter.batch.createBatches({ batchSubmitBody })` | JSON → JSON (`202`) |
| 14 | `GET /batches` | `listBatches` | `openRouter.batch.list({...})` | — → JSON |
| 15 | `GET /batches/{id}` | `getBatches` | `openRouter.batch.getBatches({ id })` | — → JSON |
| 16 | `DELETE /batches/{id}` | `deleteBatch` | `openRouter.batch.delete({ id })` | — → JSON |
| 17 | `GET /files` | `listFiles` | `openRouter.files.list({...})` | — → JSON |
| 18 | `POST /files` | `uploadFile` | `openRouter.files.upload({ requestBody: { file }, provider? })` | `multipart/form-data` → JSON |
| 19 | `GET /files/{file_id}` | `getFileMetadata` | `openRouter.files.retrieve({...})` | — → JSON |
| 20 | `GET /files/{file_id}/content` | `downloadFileContent` | `openRouter.files.download({...})` | — → `application/octet-stream` |
| 21 | `DELETE /files/{file_id}` | `deleteFile` | `openRouter.files.delete({...})` | — → JSON |
| 22 | `GET /containers/{container_id}/files` | `listContainerFiles` | `openRouter.containers.listContainerFiles({ containerId })` | — → JSON |
| 23 | `GET /containers/{container_id}/files/{file_id}` | `getContainerFile` | `openRouter.containers.getContainerFile({ containerId, fileId })` | — → JSON |
| 24 | `GET /containers/{container_id}/files/{file_id}/content` | `downloadContainerFileContent` | `openRouter.containers.downloadContainerFileContent({...})` | — → `application/octet-stream` |
| 25 | `POST /containers/{container_id}/files/{file_id}/promote` | `promoteContainerFile` | `openRouter.containers.promoteContainerFile({...})` | — → JSON |
| 26 | `POST /systemone` | `createSystemone` | `openRouter.systemOne.create({ decisionsRequest })` | JSON → JSON |
| 27 | `POST /api/alpha/decisions` **(alpha)** | `createApiAlphaDecisions` | `openRouter.alpha.decisions.create({ decisionsRequest })` | JSON → JSON |
| 28 | `POST /api/alpha/extractions` **(alpha)** | `createApiAlphaExtractions` | `openRouter.alpha.extractions.create({ extractionsRequest })` | JSON → JSON |
| 29 | `GET /tools` | `listTools` | `openRouter.tools.listTools({ bearer }, {...})` | — → JSON |
| 30 | `GET /tools/{name}` | `getTool` | `openRouter.tools.getTool({ bearer }, { name })` | — → JSON (`308` for aliases) |

(Python and Go SDK names are in [§3](03-client-sdks.md#3-client-sdks-typescript-python-go). The TS SDK uses camelCase field names, for example `aspectRatio` and `customId`. The HTTP API uses snake_case.)

**Fields shared by most inference requests here.** Embeddings, rerank, images, video, TTS, STT, SystemOne, Decisions, and Extractions all accept these:

| Field | Type | Notes |
| - | - | - |
| `session_id` | string, maxLength 256 | Groups related requests for Broadcast and private logging. It is never sent to the provider. If both the body and the `x-session-id` header are set, the body wins. |
| `trace` | `TraceConfig` object | Known keys: `trace_id`, `trace_name`, `span_name`, `generation_name`, `parent_span_id`. Any other keys pass through as custom metadata to broadcast destinations. In STT multipart it is a JSON-encoded string. |
| `user` | string (maxLength 256 on every endpoint except embeddings) | End-user ID, forwarded to Broadcast and private logging and never sent to the provider. On `POST /images` it is folded into a hashed, per-account upstream user ID for providers that require user IDs. |
| `provider` | object | Routing preferences. The accepted subset differs by endpoint; see the table below and [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities). |

**`provider` shape per endpoint**

| Endpoint | `provider` schema | Accepted keys |
| - | - | - |
| `/embeddings`, `/rerank`, `/systemone`, `/api/alpha/decisions`, `/api/alpha/extractions` | full `ProviderPreferences` (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)) | `allow_fallbacks`, `data_collection`, `enforce_distillable_text`, `ignore`, `only`, `order`, `max_price{prompt,completion,image,audio,request}`, `options`, `preferred_max_latency`, `preferred_min_throughput`, `quantizations`, `require_parameters`, `sort`, `zdr` |
| `/images` | `ImageGenerationProviderPreferences` | `allow_fallbacks`, `ignore`, `only`, `options`, `order`, `sort` |
| `/videos` | inline object | `ignore`, `only`, `options`, `order` |
| `/audio/speech`, `/audio/transcriptions` | inline object | `allow_fallbacks`, `data_collection`, `ignore`, `only`, `options`, `order`, `zdr`. **Contradiction:** the TTS and STT guides say only `zdr`, `data_collection`, and `options` apply, and that `order`/`only`/`ignore` "are not applied" to speech or transcription requests. |
| `/batches` | `BatchProviderPreferences` (`additionalProperties: false`) | `only`, `allow_fallbacks` only. Embeddings batches accept no `provider`. |

`provider.options` is a map keyed by provider slug, for example `{"black-forest-labs": {"steps": 40}}`. The provider segment is case-insensitive. An endpoint tag after `/` must match the endpoint slug exactly. Only the matched provider's options are forwarded. On most endpoints unrecognized keys are silently dropped; Extractions rejects them with `400`.

**Error bodies** use the standard `{ "error": { "code", "message", "metadata" }, "openrouter_metadata", "user_id" }` envelope (see [§4](04-api-fundamentals.md#4-api-fundamentals)). Common status meanings in this section:

| Status | Meaning (spec wording) |
| - | - |
| `400` | Invalid request parameters or malformed input |
| `401` | Authentication required or invalid credentials |
| `402` | Insufficient credits or quota |
| `403` | Authenticated but insufficient permissions (also: workspace storage full on Files, in-region host on Files) |
| `404` | Resource does not exist |
| `408` | Operation exceeded time limit |
| `409` | Resource conflict or concurrent modification |
| `410` | Gone |
| `413` | Payload exceeds size limits |
| `422` | Unprocessable (Batch constraints) |
| `429` | Rate limit exceeded |
| `499` | Client closed request |
| `500` | Unexpected server error |
| `502` | Provider/upstream failure |
| `503` | Service temporarily unavailable |
| `504` | Provider did not respond before the upstream deadline |
| `524` | Provider request timed out at the edge network |
| `529` | Provider overloaded |

Sources: https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request, https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request, https://openrouter.ai/docs/guides/community/jev, https://openrouter.ai/docs/guides/community/extractions, https://openrouter.ai/docs/guides/features/files-api, https://openrouter.ai/docs/guides/features/containers, https://openrouter.ai/docs/guides/features/batch-api, https://openrouter.ai/docs/guides/overview/multimodal/tts, https://openrouter.ai/docs/guides/overview/multimodal/stt, https://openrouter.ai/docs/client-sdks/typescript/sdks/tools/README

### 6.2 Embeddings

#### `POST /embeddings`: create embeddings

- **operationId:** `createEmbeddings`. TS SDK: `openRouter.embeddings.generate({ requestBody })`.
- **Purpose:** send text, token, or multimodal input to the embeddings router and get vectors back.
- **Request:** `application/json`, required.

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | string | yes | — | Embedding model slug, e.g. `openai/text-embedding-3-small`. |
| `input` | see below | yes | — | Text, token, or multimodal input(s) to embed. |
| `dimensions` | integer, min 1 | no | — | Number of dimensions for the output embeddings. |
| `encoding_format` | enum `"float"`, `"base64"` | no | — | Output format. With `base64`, `data[].embedding` is a string. |
| `input_type` | string | no | — | Input role hint, e.g. `search_query`, `search_document`. |
| `provider` | `ProviderPreferences` | no | — | Full routing preferences ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). |
| `session_id`, `trace`, `user` | | no | — | See [§6.1](#61-conventions-for-this-section). Here `user` has no maxLength. |

`input` accepts any of these forms (`anyOf`):

1. `string` (minLength 1)
2. `string[]` (each minLength 1), for several texts in one request
3. `number[]`, a single token array
4. `number[][]`, several token arrays
5. `object[]`, multimodal inputs. Each object is `{ "content": [part, ...] }` with `content` minItems 1, and each part is one of:
   - `{ "type": "text", "text": "<min 1 char>" }`
   - `{ "type": "image_url", "image_url": { "url": "<http(s) or data URL>" } }`
   - `{ "type": "input_audio", "input_audio": { "data": "data:audio/wav;base64,...", "format": "wav" } }`
   - `{ "type": "input_video", "input_video": { "data": "data:video/mp4;base64,...", "format": "mp4" } }`
   - `{ "type": "input_file", "input_file": { "data": "data:application/pdf;base64,...", "format": "pdf" } }`

   (`MultimodalMedia` is `{ data: string (required), format?: string }`.) Putting text and image parts in one `content` array gives one joint embedding.

**Response `200` (`application/json`)**

| Field | Type | Description |
| - | - | - |
| `object` | `"list"` | |
| `id` | string | e.g. `embd-1234567890` |
| `model` | string | Model that served the request |
| `data[]` | array | One item per input |
| `data[].object` | `"embedding"` | |
| `data[].embedding` | `number[]` or `string` | Float vector, or base64 string when `encoding_format: "base64"` |
| `data[].index` | integer | Position in the input list |
| `usage.prompt_tokens` | integer (required) | Input tokens |
| `usage.total_tokens` | integer (required) | |
| `usage.cost` | number | Cost in credits |
| `usage.is_byok` | boolean | BYOK request |
| `usage.cost_details` | `CostDetails` | `upstream_inference_cost`, `upstream_inference_prompt_cost`, `upstream_inference_completions_cost`, `server_tool_cost` |
| `usage.prompt_tokens_details` | object | `text_tokens`, `image_tokens`, `audio_tokens`, `video_tokens`, `file_tokens`. Present only when the input has 2+ modalities and the provider reports per-modality usage. Only non-zero counts are included. |

The spec also lists a `text/event-stream` 200 media type, but its description says "Not used for embeddings - embeddings do not support streaming" (example body `data: [DONE]`).

**Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `408`, `413`, `429`, `499`, `500`, `502`, `503`, `504`, `524`, `529`.

```bash
curl https://openrouter.ai/api/v1/embeddings \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": ["The quick brown fox jumps over the lazy dog", "Pack my box with five dozen liquor jugs."],
    "dimensions": 1536
  }'
```

```typescript
const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/text-embedding-3-small',
    input: [
      {
        content: [
          { type: 'text', text: 'A red panda on a branch' },
          { type: 'image_url', image_url: { url: 'https://example.com/panda.jpg' } },
        ],
      },
    ],
    provider: { order: ['openai', 'azure'], allow_fallbacks: true, data_collection: 'deny' },
  }),
});
const { data, usage } = await res.json(); // data[i].embedding: number[]
```

```json
{
  "data": [{ "embedding": [0.0023064255, -0.009327292, 0.015797347], "index": 0, "object": "embedding" }],
  "model": "openai/text-embedding-3-small",
  "object": "list",
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

Notes:
- No streaming, temperature, or randomness. Same input gives the same vector, so cache results. The guide recommends cosine similarity.
- Inputs longer than the model's context limit are truncated or rejected, depending on the model.
- Batch embedding is also available through `POST /batches` with `endpoint: "/v1/embeddings"`. Batch rejects multimodal input, `input_type`, and `provider` ([§6.8](#68-batch-api-async-jobs)).
- The concept guide (use cases, semantic-search walkthrough) is in [§4](04-api-fundamentals.md#4-api-fundamentals).

#### `GET /embeddings/models`: list embedding models

- **operationId:** `listEmbeddingsModels`. TS SDK: `openRouter.embeddings.listModels()`, an async page iterator (`for await (const page of result)`). Speakeasy pagination type is `offsetLimit` over `$.data`.
- **Purpose:** list all embedding models and their properties.

| Query param | Type | Default | Constraints | Description |
| - | - | - | - | - |
| `offset` | integer or null | `0` | min 0 | Records to skip |
| `limit` | integer | `500` | 1–1000 | Max records. **If both `offset` and `limit` are omitted, the full list is returned.** |

**Response `200`:** `ModelsListResponse`, the same shape as `GET /models` ([§7.2](07-endpoints-platform.md#72-models)). Top level: `data[]` (model objects with `id`, `canonical_slug`, `name`, `created`, `description`, `context_length`, `architecture{input_modalities, output_modalities, modality, tokenizer, instruct_type}`, `pricing`, `top_provider`, `per_request_limits`, `supported_parameters`, `default_parameters`, `endpoints` (the request paths that serve the model), `links.details`, `supported_voices`, `reasoning`, `benchmarks`, `expiration_date`, `knowledge_cutoff`, `hugging_face_id`, `alias_target`), `links.next` (string or null, e.g. `/api/v1/models?offset=500&limit=500`), and `total_count`.

**Status codes:** `200`, `400`, `500`.

```bash
curl "https://openrouter.ai/api/v1/embeddings/models?limit=100" -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

Sources: https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request, https://openrouter.ai/docs/api/api-reference/embeddings/list-all-embeddings-models, https://openrouter.ai/docs/api_reference/embeddings, https://openrouter.ai/docs/client-sdks/typescript/sdks/embeddings/README, https://openrouter.ai/docs/batch-quickstart

### 6.3 Rerank

#### `POST /rerank`: rerank documents against a query

- **operationId:** `createRerank`. TS SDK: `openRouter.rerank.rerank({ requestBody })`.
- **Purpose:** score and sort documents by relevance to a query through the rerank router.
- **Request:** `application/json`, required.

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | string | yes | — | Rerank model, e.g. `cohere/rerank-v3.5`. |
| `query` | string | yes | — | Search query. |
| `documents` | array, minItems 1 | yes | — | Each item is a plain `string`, or `{ "text"?: string, "image"?: string }` (at least one of `text`/`image`). `image` is an http(s) URL or a `data:image/...` base64 URI, for multimodal rerank models. |
| `top_n` | integer, min 1 | no | — | Number of most relevant documents to return. |
| `provider` | `ProviderPreferences` | no | — | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities). |
| `session_id`, `trace`, `user` (maxLength 256) | | no | — | [§6.1](#61-conventions-for-this-section). |

**Response `200` (`application/json`)**

| Field | Type | Description |
| - | - | - |
| `id` | string | ORID format, e.g. `gen-rerank-1234567890-abc` |
| `model` | string (required) | |
| `provider` | string | e.g. `Cohere` |
| `results[]` | array (required) | Sorted by relevance, highest first |
| `results[].index` | integer | Index in the original `documents` array |
| `results[].relevance_score` | number | |
| `results[].document` | object | Echo of the input: `{ text?, image? }` |
| `usage.cost` | number | Credits |
| `usage.search_units` | integer | Cohere billing unit |
| `usage.total_tokens` | integer | |

A `text/event-stream` media type is listed but documented as "Not used for rerank - rerank does not support streaming".

**Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `524`, `529`.

```bash
curl https://openrouter.ai/api/v1/rerank \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cohere/rerank-v3.5",
    "query": "What is the capital of France?",
    "documents": ["Paris is the capital of France.", "Berlin is the capital of Germany."],
    "top_n": 3
  }'
```

```json
{
  "id": "gen-rerank-1234567890-abc",
  "model": "cohere/rerank-v3.5",
  "provider": "Cohere",
  "results": [{ "document": { "text": "Paris is the capital of France." }, "index": 0, "relevance_score": 0.98 }],
  "usage": { "search_units": 1, "total_tokens": 150 }
}
```

Gotcha: `results` only holds the top `top_n` items, in relevance order. Map them back to your data with `results[].index`, not array position.

Sources: https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request, https://openrouter.ai/docs/client-sdks/typescript/sdks/rerank/README

### 6.4 Images

OpenRouter has a dedicated Image API for model discovery, per-endpoint capabilities, and generation. Image output through chat models (`modalities`) is covered in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

#### `POST /images`: generate an image

- **operationId:** `createImages`. TS SDK: `openRouter.images.generate({ imageGenerationRequest })`.
- **Purpose:** text-to-image and image-to-image generation through the image router.
- **Request:** `application/json` (`ImageGenerationRequest`), required.

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | string | yes | — | e.g. `bytedance-seed/seedream-4.5`, `openai/gpt-image-1`, `google/gemini-2.5-flash-image`, `black-forest-labs/flux.2-pro`. |
| `prompt` | string, minLength 1 | yes | — | Text description. |
| `n` | integer | no | — | Upper bound on images to generate (1–10). Providers may return fewer. Single-image providers reject `n > 1`. |
| `resolution` | enum `"512"`, `"768"`, `"1K"`, `"1.5K"`, `"2K"`, `"4K"` | no | — | Normalized resolution tier. Pixel dimensions are derived per provider. |
| `aspect_ratio` | enum `"1:1"`, `"1:2"`, `"1:4"`, `"1:8"`, `"2:1"`, `"2:3"`, `"2.35:1"`, `"3:2"`, `"3:4"`, `"4:1"`, `"4:3"`, `"4:5"`, `"5:2"`, `"5:4"`, `"5:7"`, `"7:5"`, `"8:1"`, `"9:16"`, `"16:9"`, `"9:19.5"`, `"19.5:9"`, `"9:20"`, `"20:9"`, `"9:21"`, `"21:9"`, `"auto"` | no | — | Providers clamp to the subset they support. `auto` lets the provider choose. |
| `size` | string | no | — | Shorthand. A tier (`"2K"`, `"4K"`) is the same as setting `resolution` and combines with `aspect_ratio`. Explicit pixels (`"2048x2048"`) are provider-dependent: providers that accept them treat them as authoritative and return `400` if a mismatched `resolution` or `aspect_ratio` is also sent. xAI and Sourceful V2/V2.5 reject pixel sizes. Sourceful V2.6 accepts them within its limits and does not allow combining them with `resolution`/`aspect_ratio`. |
| `quality` | enum `"auto"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"` | no | — | Ignored by providers without a quality knob. (The guide lists only `auto`, `low`, `medium`, `high`; the spec adds `xhigh` and `max`.) |
| `output_format` | enum `"png"`, `"jpeg"`, `"webp"`, `"svg"`, `"gif"` | no | provider default | `svg` only on vectorization models (e.g. Quiver, Recraft vector); the SVG markup is UTF-8, base64-encoded in `b64_json`. `gif` produces an animation on models that support it (OpenAI gpt-image-2.6). |
| `background` | enum `"auto"`, `"transparent"`, `"opaque"` | no | — | `transparent` needs an alpha-capable format (`png`, `webp`). |
| `output_compression` | integer 0–100 | no | — | For jpeg/webp. Ignored by providers without a compression knob. Providers that honor it may reject it for other formats (OpenAI requires `jpeg` or `webp`). |
| `frame_count` | integer | no | — | Animation frames (2–64) when `output_format: "gif"`. Each model has its own accepted range and rejects values outside it. Ignored otherwise. |
| `frame_duration_ms` | integer | no | — | Per-frame display time (20–2000 ms) for `gif`. |
| `input_references` | `ContentPartImage[]`, maxItems 16 | no | — | Reference images for image-to-image: `{ "type": "image_url", "image_url": { "url": "<https or data URL>" } }`. The number accepted varies by provider. |
| `markup` | `ContentPartImage` | no | — | A transparent PNG overlay (arrows, circles) with the same dimensions as the first reference image, marking where an edit applies. Image-to-image only. Honored by markup-guided editing models (OpenAI gpt-image-2.6), ignored elsewhere. |
| `seed` | integer | no | — | Deterministic sampling where supported (not guaranteed). |
| `stream` | boolean | no | `false` | Stream partial images over SSE. Only providers with native streaming (currently OpenAI) honor it. Others ignore it and return a buffered response. |
| `provider` | `ImageGenerationProviderPreferences` | no | — | `only`, `order`, `ignore`, `sort` (`price`/`throughput`/`latency`/`exacto` or `{by, partition}`), `allow_fallbacks`, `options` (e.g. `{"black-forest-labs": {"guidance": 3, "steps": 40}}`). Use an endpoint's `provider_tag` as the base slug for routing, and its `provider_slug` as the key under `options`. |
| `session_id`, `trace`, `user` (maxLength 256) | | no | — | [§6.1](#61-conventions-for-this-section) |

**Response `200`, buffered (`application/json`, `ImageGenerationResponse`)**

| Field | Type | Description |
| - | - | - |
| `created` | integer (required) | Unix seconds |
| `data[]` | array (required) | Generated images |
| `data[].b64_json` | string (required) | Base64 image bytes (or base64 UTF-8 SVG markup) |
| `data[].media_type` | string | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`, ... Omitted only when the format could not be determined. |
| `usage` | `ImageGenerationUsage` | `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost` (USD), `is_byok`, `cost_details`, `completion_tokens_details{image_tokens, reasoning_tokens, audio_tokens}`, `prompt_tokens_details{cached_tokens, cache_write_tokens, audio_tokens, file_tokens, video_tokens}`, `server_tool_use`, `service_tier`, `speed`, `cache_creation`, `iterations` (same usage object as chat; see [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)) |

**Response `200`, streaming (`text/event-stream`)**: each `data:` line is a JSON event, and the stream ends with `data: [DONE]`.

| Event `type` | Fields |
| - | - |
| `image_generation.partial_image` | `b64_json`, `partial_image_index` (0-based) |
| `image_generation.text_chunk` | `text` (partial markup, e.g. SVG), `phase`: `content` (renderable) / `reasoning` / `draft` |
| `image_generation.completed` | `b64_json`, `created`, `media_type?`, `usage` (includes `cost` in USD, same as buffered) |
| `error` | `error{ message (required), code?, param?, type? }`. Sent when generation fails after the SSE response has started. |

(The spec models each SSE message as `ImageStreamingResponse` = `{ "data": <event> }`, i.e. the JSON after `data: ` on the wire is the event object itself, as in the guide examples: `data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"<base64>"}`.)

**Billing:** all-or-nothing. A completed generation is billed in full. A failed or cancelled generation is not billed and the request returns `502 Bad Gateway`. Partial preview images from a stream never create charges. A stream that ends early (disconnect or mid-stream error) is billed as a failed generation, which means not at all.

**Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `524`, `529`.

```bash
curl -X POST https://openrouter.ai/api/v1/images \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bytedance-seed/seedream-4.5",
    "prompt": "a red panda astronaut floating in space, studio lighting",
    "resolution": "2K",
    "aspect_ratio": "16:9"
  }'
```

```typescript
import { writeFile } from 'node:fs/promises';

const res = await fetch('https://openrouter.ai/api/v1/images', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-image-1',
    prompt: 'make this scene look like a watercolor painting',
    input_references: [{ type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } }],
    quality: 'high',
    output_format: 'png',
  }),
});
const result = await res.json();
for (const [i, img] of result.data.entries()) {
  await writeFile(`out-${i}.png`, Buffer.from(img.b64_json, 'base64'));
}
```

Streaming client (TS). The guide's version splits each chunk on newlines without buffering; production code should buffer partial lines:

```typescript
const res = await fetch('https://openrouter.ai/api/v1/images', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai/gpt-image-1', prompt: 'a detailed landscape painting', stream: true }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === 'image_generation.completed') console.log('final', event.media_type, event.usage?.cost);
    else if (event.type === 'error') throw new Error(event.error.message);
  }
}
```

#### `GET /images/models`: list image generation models

- **operationId:** `listImageModels`. TS SDK: `openRouter.images.listModels()`. No parameters.
- **Purpose:** discovery. Returns each image model with the union of supported parameters across its endpoints, plus a URL to the per-endpoint records.

**Response `200` (`ImageModelsListResponse`)**: `data[]` of `ImageModelListItem`:

| Field | Type | Description |
| - | - | - |
| `id` | string | Model slug to use in `POST /images` |
| `name` | string | Display name |
| `description` | string | |
| `created` | integer | Unix seconds |
| `architecture.input_modalities` | `ImageInputModality[]` | `text`, `image`, `file`, `audio`, `video` |
| `architecture.output_modalities` | `ImageOutputModality[]` | `text`, `image`, `embeddings`, `audio`, `video`, `rerank`, `decisions`, `speech`, `transcription` |
| `supported_parameters` | `SupportedParameters` map | Request field name → capability descriptor. This is the union across endpoints, for coarse discovery only. |
| `supports_streaming` | boolean | True if any endpoint supports `stream: true` |
| `endpoints` | string | Relative URL, e.g. `/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints` |

**Capability descriptors** (`CapabilityDescriptor`, discriminated on `type`):

| `type` | Shape | Meaning |
| - | - | - |
| `enum` | `{ "type": "enum", "values": ["1K","2K","4K"] }` | Discrete allowlist of string values |
| `range` | `{ "type": "range", "min": 0, "max": 100 }` | Any value in `[min, max]` |
| `boolean` | `{ "type": "boolean" }` | Present means supported |

A key that is absent means that endpoint does not support the parameter.

**Status codes:** `200`, `500`.

#### `GET /images/models/{author}/{slug}/endpoints`: per-endpoint records

- **operationId:** `listImageModelEndpoints`. TS SDK: `openRouter.images.listModelEndpoints({ author, slug })`.
- **Path params:** `author` (string, required, e.g. `bytedance-seed`) and `slug` (string, required, e.g. `seedream-4.5`).

**Response `200` (`ImageModelEndpointsResponse`)**: `{ id, endpoints[] }`, where each `ImageEndpoint` has:

| Field | Type | Description |
| - | - | - |
| `provider_name` | string | Display name, e.g. `Bytedance` |
| `provider_slug` | string | Key to use under `provider.options[slug]` |
| `provider_tag` | string or null | Use to pin requests to this provider. `null` when provider-level routing is unavailable. |
| `supported_parameters` | `SupportedParameters` | The definitive set this endpoint accepts (a subset of the model-level union) |
| `allowed_passthrough_parameters` | `string[]` | Provider-specific keys accepted under `provider.options[provider_slug]` |
| `supports_streaming` | boolean | This endpoint honors `stream: true` |
| `pricing[]` | `ImagePricingEntry[]` | `billable`: `output_image`, `input_image`, `input_font`, `input_reference`, `input_text`. `unit`: `request`, `image`, `megapixel`, `token`. `cost_usd`: number. `variant?`: string tier, e.g. `2k`, `4k`. |

**Status codes:** `200`, `404`, `500`.

```bash
curl "https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-4.5/endpoints"
```

```json
{
  "id": "bytedance-seed/seedream-4.5",
  "endpoints": [{
    "provider_name": "Bytedance", "provider_slug": "bytedance", "provider_tag": "bytedance",
    "supported_parameters": { "resolution": { "type": "enum", "values": ["1K", "2K", "4K"] }, "seed": { "type": "boolean" } },
    "allowed_passthrough_parameters": [], "supports_streaming": false,
    "pricing": [{ "billable": "output_image", "unit": "image", "cost_usd": 0.05 }]
  }]
}
```

Image models are also discoverable with `GET /models?output_modalities=image` ([§7.2](07-endpoints-platform.md#72-models)).

Sources: https://openrouter.ai/docs/api/api-reference/images/generate-an-image, https://openrouter.ai/docs/api/api-reference/images/list-image-generation-models, https://openrouter.ai/docs/api/api-reference/images/list-endpoints-for-an-image-model, https://openrouter.ai/docs/guides/overview/multimodal/image-generation, https://openrouter.ai/docs/client-sdks/typescript/sdks/images/README

### 6.5 Video generation (async jobs)

Video generation is **asynchronous**. You submit a job, get a job ID and polling URL right away, then poll (or receive a webhook) until the status is terminal, and finally download the bytes.

```text
POST /videos ──202──▶ { id, polling_url, status: "pending" }
      │
      ▼  poll GET /videos/{jobId} (≈ every 30 s), or wait for the callback_url webhook
pending ─▶ in_progress ─▶ completed │ failed │ cancelled │ expired
      │
      ▼  completed
GET /videos/{jobId}/content?index=0   (API key)   or   urls[i] (signed, no key, until expires_at)
```

#### `POST /videos`: submit a video generation job

- **operationId:** `createVideos`. TS SDK: `openRouter.videoGeneration.generate({ videoGenerationRequest })`.
- **Request:** `application/json` (`VideoGenerationRequest`), required. Only `model` is required by the schema.

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | string | yes | — | e.g. `google/veo-3.1`, `alibaba/wan-2.7`, `bytedance/seedance-2.0`, `minimax/hailuo-3`. |
| `prompt` | string | conditional | — | Optional only for models that can generate from image input alone. Every other model requires it. |
| `duration` | integer, min 1 | no | — | Seconds. Must be in the model's `supported_durations`. |
| `resolution` | enum `"360p"`, `"480p"`, `"720p"`, `"768p"`, `"1080p"`, `"1K"`, `"2K"`, `"4K"` | no | — | Must be in `supported_resolutions`. (The guide's list omits `360p`.) |
| `aspect_ratio` | enum `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:4"`, `"3:2"`, `"2:3"`, `"21:9"`, `"9:21"` | no | — | Must be in `supported_aspect_ratios`. |
| `size` | string `"WIDTHxHEIGHT"` | no | — | Exact pixels, e.g. `"1280x720"`. Interchangeable with `resolution` + `aspect_ratio`. |
| `frame_images` | `FrameImage[]` | no | — | Image-to-video. Each item is `{ "type": "image_url", "image_url": { "url" }, "frame_type": "first_frame" \| "last_frame" }` (`frame_type` required). |
| `input_references` | `InputReference[]` | no | — | Reference-to-video (style/content guidance), discriminated on `type`: `{type:"image_url", image_url:{url}}`, `{type:"audio_url", audio_url:{url}}`, `{type:"video_url", video_url:{url}}`. Audio and video references are honored only by providers that support them (including BytePlus Seedance generation 2 and newer). Other providers use image references and ignore the rest. |
| `generate_audio` | boolean | no | endpoint's `generate_audio` capability flag, `false` if unset | Generate an audio track. The guide says it defaults to `true` for models that support audio output. |
| `seed` | integer | no | — | Deterministic sampling where supported (not guaranteed). |
| `previous_job_id` | string, pattern `^gen-vid-\d+-[0-9A-Za-z]{20}$` | no | — | ID of a **completed** job to edit or extend. The new job runs on the same model and endpoint. Only models that support continuation accept it. |
| `callback_url` | string (uri, **HTTPS**) | no | workspace default | Webhook for job completion. Overrides the workspace-level default callback URL. |
| `creativity` | integer | no | — | **Video upscaling models only.** Not supported by generation models. |
| `upscale_factor` | number > 0 | no | — | **Video upscaling models only.** |
| `provider` | object | no | — | `only`, `order`, `ignore`, and `options` (passthrough keyed by provider slug, e.g. `{"google-vertex": {"output_config": {"effort": "low"}}}`). |
| `session_id`, `trace`, `user` (maxLength 256) | | no | — | [§6.1](#61-conventions-for-this-section) |

**Images:** `frame_images` triggers **image-to-video** (exact first/last frames). `input_references` triggers **reference-to-video** (visual guidance). If both are present, `frame_images` wins and the request is treated as image-to-video.

**Provider options:** Google Veo models are the only video models that nest options inside a `parameters` object:

```json
{ "model": "google/veo-3.1", "prompt": "A time-lapse of a flower blooming",
  "provider": { "options": { "google-vertex": { "parameters": { "personGeneration": "allow", "negativePrompt": "blurry, low quality" } } } } }
```

All other video models, including other Google video models, take their allowed passthrough keys directly under the routed provider's slug. A `parameters` object sent to them is not forwarded. For example, Seedance 2.0 via the Seed provider is `{"provider":{"options":{"seed":{"watermark":false}}}}`, and via BytePlus the slug is `byteplus`. Runway video upscale rejects any provider options. The allowed keys per model are in `allowed_passthrough_parameters` from `GET /videos/models`.

**Response `202` (`VideoGenerationResponse`)**, the same object returned by polling:

| Field | Type | Description |
| - | - | - |
| `id` | string (required) | Job ID in `gen-vid-<timestamp>-<20 alphanumerics>` format. Pass it as `previous_job_id` to continue. (Older examples show IDs like `job-abc123`/`abc123`.) |
| `polling_url` | string (required) | Spec examples give a relative path (`/api/v1/videos/<id>`). The guide shows an absolute URL. Resolve against `https://openrouter.ai`. |
| `status` | enum (required) | `pending`, `in_progress`, `completed`, `failed`, `cancelled`, `expired` |
| `generation_id` | string | Generation ID, available once the job has been processed |
| `unsigned_urls` | `string[]` | OpenRouter content URLs (e.g. `https://openrouter.ai/api/v1/videos/<id>/content?index=0`). They **need your API key** in `Authorization` and work as long as the output is available. |
| `urls` | `string[]` | **Signed** download URLs for OpenRouter's stored copy, usable **without** an API key until `expires_at`. Anyone with the URL can download, so treat it as a secret. Present only when a stored copy exists. |
| `expires_at` | integer | Unix seconds when the stored copy stops being available. Present only when it exists. |
| `usage.cost` | number or null | USD. Available once completed. |
| `usage.is_byok` | boolean | |
| `error` | string | Failure reason (for `failed`, etc.) |

**Status codes:** `202`, `400` (also returned for unsupported `duration`/`resolution`/`aspect_ratio`, with the supported values listed), `401`, `402`, `403`, `404`, `413`, `429`, `499`, `500`, `503`.

**ZDR:** video generation is **not eligible** for Zero Data Retention, because the provider must keep the output briefly for async retrieval. If ZDR is enforced (account settings or per-request `zdr`), OpenRouter will not route video requests.

```bash
curl https://openrouter.ai/api/v1/videos \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/veo-3.1",
    "prompt": "A serene mountain landscape at sunset",
    "duration": 8,
    "resolution": "720p",
    "aspect_ratio": "16:9"
  }'
# → 202 {"id":"gen-vid-1789480874-Ab3dEf9hIjKlMnOpQrSt","polling_url":"/api/v1/videos/gen-vid-1789480874-Ab3dEf9hIjKlMnOpQrSt","status":"pending"}
```

#### `GET /videos/{jobId}`: poll job status

- **operationId:** `getVideos`. TS SDK: `openRouter.videoGeneration.getGeneration({ jobId })`.
- **Path:** `jobId` (string, minLength 1, required).
- **Response `200`:** `VideoGenerationResponse` (table above). Content URLs appear once `status` is `completed`.
- **Status codes:** `200`, `401`, `403`, `404`, `500`.

| Status | Terminal | Meaning |
| - | - | - |
| `pending` | no | Submitted and queued |
| `in_progress` | no | Generating |
| `completed` | yes | Ready to download (`unsigned_urls`, and possibly `urls`) |
| `failed` | yes | Generation failed. Read `error`. |
| `cancelled` | yes | Job was cancelled (webhook `error`: "Job was cancelled") |
| `expired` | yes | Job exceeded its maximum time to live |

(The guide's status table lists only the first four. The spec enum and the webhook events also include `cancelled` and `expired`.)

#### `GET /videos/{jobId}/content`: download video bytes

- **operationId:** `listVideosContent`. TS SDK: `openRouter.videoGeneration.getVideoContent({ jobId, index })` → `ReadableStream<Uint8Array>`.
- **Params:** `jobId` (path, required, minLength 1) and `index` (query, integer or null, default `0`, min 0) to pick one of several outputs.
- **Response `200`:** `video/mp4`. The raw bytes are proxied from the upstream provider, and `Content-Type` reflects the provider's media type.
- **Status codes:** `200`, `400`, `401`, `403`, `404`, `409`, `410`, `500`, `502`. The spec gives only generic descriptions for `409` ("Resource conflict") and `410` ("Gone").

```bash
curl "https://openrouter.ai/api/v1/videos/$JOB_ID/content?index=0" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" --output video.mp4
```

Use `urls[i]` (signed) where you cannot set headers, such as a `<video>` tag, `ffmpeg`, or a URL-only tool. Do not log or share signed URLs.

#### `GET /videos/models`: list video models

- **operationId:** `listVideosModels`. TS SDK: `openRouter.videoGeneration.listVideosModels()`. No parameters.
- **Response `200` (`VideoModelsListResponse`):** `data[]` of `VideoModel`:

| Field | Type | Description |
| - | - | - |
| `id`, `canonical_slug`, `name`, `created`, `description?`, `hugging_face_id?` | | Identity |
| `supported_durations` | `integer[]` or null | Seconds, e.g. `[4, 6, 8]` |
| `supported_resolutions` | enum[] or null | Values from the `resolution` enum |
| `supported_aspect_ratios` | enum[] or null | Values from the `aspect_ratio` enum |
| `supported_sizes` | enum[] or null | `WIDTHxHEIGHT` values. The spec enum: `360x360, 360x480, 360x540, 360x640, 360x840, 480x360, 480x480, 480x640, 480x720, 480x854, 480x1120, 496x864, 540x360, 560x752, 640x360, 640x480, 640x640, 720x480, 720x720, 720x960, 720x1080, 720x1280, 720x1680, 752x560, 768x768, 768x1024, 768x1152, 768x1366, 768x1792, 834x1112, 840x360, 854x480, 864x496, 960x720, 960x960, 992x432, 1024x768, 1080x720, 1080x1080, 1080x1440, 1080x1620, 1080x1920, 1080x2520, 1112x834, 1120x480, 1152x768, 1280x720, 1366x768, 1440x1080, 1440x1440, 1440x1920, 1440x2160, 1440x2560, 1440x3360, 1470x630, 1620x1080, 1680x720, 1792x768, 1920x1080, 1920x1440, 2160x1440, 2160x2160, 2160x2880, 2160x3240, 2160x3840, 2160x5040, 2520x1080, 2560x1440, 2880x2160, 3240x2160, 3360x1440, 3840x2160, 5040x2160` |
| `supported_frame_images` | enum[] or null | `first_frame`, `last_frame` |
| `generate_audio` | boolean or null | Can generate audio |
| `seed` | boolean or null | Supports `seed` |
| `pricing_skus` | map string→string, or null | SKU → USD price string with the provider prefix stripped, e.g. `{"per-video-second":"0.50","per-video-second-1080p":"0.75"}` |
| `allowed_passthrough_parameters` | `string[]` | Keys accepted under `provider.options[slug]` |
| `creativity` | `integer[]` or null | Upscaling models only |
| `upscale_factor` | `{min, max}` or null | Upscaling models only |

**Status codes:** `200`, `400`, `500`. Video models are also listed by `GET /models?output_modalities=video`.

#### Webhooks for video jobs

Configure one of two ways: per request with `callback_url` (takes priority), or with a default callback URL in workspace settings. When a job reaches a terminal state, OpenRouter `POST`s an event envelope:

```json
{
  "type": "video.generation.completed",
  "created_at": "2026-04-24T12:00:00.000Z",
  "data": {
    "id": "abc123",
    "status": "completed",
    "generation_id": "gen-xyz789",
    "model": "google/veo-3.1",
    "unsigned_urls": ["https://openrouter.ai/api/v1/videos/abc123/content?index=0"],
    "usage": { "cost": 0.5, "is_byok": false }
  }
}
```

| Event `type` | `data.status` | Extra `data` fields |
| - | - | - |
| `video.generation.completed` | `completed` | `unsigned_urls`, `usage` |
| `video.generation.failed` | `failed` | `error` (e.g. `"Content policy violation"`) |
| `video.generation.cancelled` | `cancelled` | `error` (`"Job was cancelled"`) |
| `video.generation.expired` | `expired` | `error` (`"Job exceeded maximum time to live"`) |

`data.generation_id` and `data.model` may be `null` when a job fails before they are assigned (e.g. early validation failure). Note that `created_at` is an ISO string here, while batch webhooks use Unix seconds.

**Headers:**
- `X-OpenRouter-Idempotency-Key: <job_id>-<status>`. Use it to deduplicate retries.
- `X-OpenRouter-Signature: t=<unix>,v1=<hex>`. Sent only when the workspace has a webhook signing secret (the same secret is used for batch webhooks). Verify it as HMAC-SHA256 with the secret over `` `${t},${rawBody}` ``, compared against `v1`. Use the **raw** request bytes, because re-serializing the JSON breaks the signature. Reject timestamps older than 5 minutes.

```typescript
import crypto from 'node:crypto';

export function verifyWebhookSignature(rawBody: string, header: string, secret: string): boolean {
  const parts = header.split(',');
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!t || !v1) return false;
  const age = Math.floor(Date.now() / 1000) - Number(t);
  if (Number.isNaN(age) || age > 300) return false; // replay protection
  const expected = crypto.createHmac('sha256', secret).update(`${t},${rawBody}`).digest('hex');
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

**Polling loop (TS):**

```typescript
const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' };
const submit = await fetch('https://openrouter.ai/api/v1/videos', {
  method: 'POST', headers,
  body: JSON.stringify({
    model: 'alibaba/wan-2.7',
    prompt: 'A character walking through a forest',
    frame_images: [{ type: 'image_url', image_url: { url: 'https://example.com/first-frame.png' }, frame_type: 'first_frame' }],
    resolution: '1080p',
  }),
});
let job = await submit.json(); // 202
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired']);
while (!TERMINAL.has(job.status)) {
  await new Promise((r) => setTimeout(r, 30_000));
  job = await (await fetch(new URL(job.polling_url, 'https://openrouter.ai'), { headers })).json();
}
if (job.status !== 'completed') throw new Error(job.error ?? job.status);
const video = await fetch(job.unsigned_urls[0], { headers }); // needs the API key
```

Sources: https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request, https://openrouter.ai/docs/api/api-reference/video-generation/poll-video-generation-status, https://openrouter.ai/docs/api/api-reference/video-generation/download-generated-video-content, https://openrouter.ai/docs/api/api-reference/video-generation/list-all-video-generation-models, https://openrouter.ai/docs/guides/overview/multimodal/video-generation, https://openrouter.ai/docs/client-sdks/typescript/sdks/videogeneration/README

### 6.6 Text-to-speech (`POST /audio/speech`)

- **operationId:** `createAudioSpeech`. TS SDK: `openRouter.tts.createSpeech({ speechRequest })`, which returns `ReadableStream<Uint8Array>`.
- **Purpose:** synthesize audio from text. Compatible with the OpenAI Audio Speech API, so the OpenAI SDK works when pointed at `https://openrouter.ai/api/v1`. The response is a **raw audio byte stream, not JSON**.
- **Request:** `application/json` (`SpeechRequest`), required.

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | string | yes | — | e.g. `openai/gpt-4o-mini-tts-2025-12-15`, `mistralai/voxtral-mini-tts-2603`, `google/gemini-3.8-flash-lite-tts`, `fish-audio/s2.1-pro`, `heygen/heygen-voice-1`, `bytedance-seed/seed-audio-1-0`, `microsoft/mai-voice-2.1`. Use the full slug (not `gpt-4o-mini-tts`). |
| `input` | `string` or `SpeechTurn[]` (minItems 1) | yes | — | Text to speak, or turns for multi-speaker input. A `SpeechTurn` is `{ text (required), voice?: string (minLength 1, defaults to top-level voice), instructions?: string (overrides top-level) }`. |
| `voice` | string, minLength 1 | provider-dependent | provider default if one is documented | Provider-specific voice ID, e.g. `alloy` (OpenAI), `Kore`/`Puck` (Gemini), `en_paul_neutral` (Mistral), `en-US-Harper:MAI-Voice-2.1` (Azure MAI). When it is omitted, the request is only forwarded to providers with a provider-side default voice, and is otherwise rejected with a validation error. Per-model lists are in `supported_voices` from `GET /models?output_modalities=speech` ([§7.2](07-endpoints-platform.md#72-models)). |
| `instructions` | string | no | — | Delivery directions (tone, pacing, emotion). Supported by OpenAI `gpt-4o-mini-tts`, Gemini TTS, and Fish Audio. Ignored elsewhere. |
| `response_format` | enum `"mp3"`, `"pcm"` | no | **`"pcm"`** | `mp3` → `Content-Type: audio/mpeg`. `pcm` → `audio/pcm`, raw 16-bit little-endian. HeyGen Voice and Gemini TTS return only `pcm`, and MiniMax returns only `mp3`; requesting the other format gives `400`. |
| `speed` | number | no | `1.0` (per guide) | Playback speed multiplier. Honored where supported (e.g. OpenAI). Other providers ignore it or return `400` for a non-default value. Seed Audio needs 0.5–2.0. |
| `input_references` | `SpeechInputReference[]` | no | — | Stateless voice cloning or voice design. See below. An empty array means no reference. |
| `provider` | object | no | — | `options` passthrough and data-policy routing (`zdr`, `data_collection`). See the [§6.1](#61-conventions-for-this-section) note on `order`/`only`/`ignore`. |
| `session_id`, `trace`, `user` (maxLength 256) | | no | — | [§6.1](#61-conventions-for-this-section) |

**`input_references` parts** (discriminated on `type`):

| Part | Shape | Limits |
| - | - | - |
| `input_audio` | `{ "type": "input_audio", "input_audio": { "data"?: base64 or data URI, "url"?: public http(s) URL, "format"?: "wav" \| "mp3" \| ... } }`. Exactly one of `data`/`url`. | `data` up to 20 MiB of base64 (15 MiB decoded; larger gives `400`). `url` maxLength 2048. OpenRouter downloads it (15 MiB max; larger gives `413`) and forwards only the bytes, never the URL. Up to **3** clips; the Nth clip can be addressed as `@AudioN` on providers that support multiple references. |
| `text` | `{ "type": "text", "text": "<transcript>" }` | maxLength 10,000. With one clip it may come before or after the clip. With several clips each transcript must immediately follow its clip. |
| `image_url` | `{ "type": "image_url", "image_url": { "url": "<data URI or public https URL>" } }` | JPEG/PNG/WebP. Max one per request. On its own it means voice design. Next to an `input_audio` clip it is a scene image. Downloads are capped at 15 MiB. |

Requests that carry references are routed only to endpoints whose capability flags allow them. Check `supports_voice_cloning`, `supports_multiple_audio_references`, and `supports_image_reference` on the endpoints API ([§7.3](07-endpoints-platform.md#73-endpoints-per-model-provider-endpoints-zdr-preview)).

**Provider-specific behavior (from the guide):**
- **Multi-speaker** (`input` as turns) is supported by Gemini TTS and by Fish Audio models other than S1. Everything else returns `400`. Gemini builds `multiSpeakerVoiceConfig` from the turn voices. A custom `speechConfig` in `provider.options` replaces it, and its `speaker` values must use the turns' resolved voice names.
- **Gemini TTS** reads `input` verbatim (directions in the text may be spoken aloud), so use `instructions`. It is sent upstream as `speech_metadata.style`. Other provider options are forwarded as generation config, e.g. `{"google-ai-studio":{"temperature":0.7}}`.
- **Fish Audio** puts directions in brackets inside the text (`[whispering] ...`). OpenRouter adds `instructions` that way and bills the added characters. S1 rejects multi-speaker input and cannot combine reference audio with it.
- **Seed Audio 1.0** treats `input` as a prompt, so it can describe non-speech audio (sound effects, ambience). `input` is limited to 3000 chars, output is capped at 120 s, and `speed` must be 0.5–2.0. It rejects `voice` together with `input_references`. It takes no provider options. With multiple clips, every `@AudioN` must be referenced and must point at a clip that was sent. Its rejections come back as `400` with a message starting `Provider rejected the request:`.
- **HeyGen Voice** clones the reference recording on each request (WAV/MP3, first 3 minutes used). An optional scene image goes next to the clip. Omit `voice`. Language is set with `provider.options.heygen.language`. It rejects an image without a recording.
- **Azure MAI-Voice** (`microsoft/mai-voice-2`, `-2.1`, `-2.1-flash`): the voice ID carries a model suffix (`:MAI-Voice-2`, `:MAI-Voice-2.1`, `:MAI-Voice-2.1-Flash`), and the voice's locale sets the language. `pcm` output is 24 kHz mono.
- **OpenAI** example passthrough: `{"provider":{"options":{"openai":{"stream_format":"audio"}}}}`.

**Response `200`:** `audio/*` binary (`audio/mpeg` for mp3, `audio/pcm` for pcm). Headers: `Content-Type` and `X-Generation-Id` (use it for tracking). Non-200 responses have **JSON** error bodies. There is no SSE mode: the body itself is a byte stream you can pipe to a player, and `pcm` is the low-latency choice for real-time pipelines.

**Pricing:** most TTS models are priced per input character. Some (e.g. Seed Audio 1.0) are priced per second of generated audio, reported under `pricing.completion` on the Models API.

**Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `524`, `529`.

```bash
curl https://openrouter.ai/api/v1/audio/speech \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4o-mini-tts-2025-12-15","input":"Hello world","voice":"alloy","response_format":"mp3","instructions":"Speak in a warm and friendly tone."}' \
  --output hello.mp3
```

```typescript
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3.8-flash-lite-tts',
    input: [
      { text: "How's it going today, Jane?", voice: 'Kore' },
      { text: 'Not too bad, how about you?', voice: 'Puck', instructions: 'tired, yawning' },
    ],
    instructions: 'cheerful',
    response_format: 'pcm',
  }),
});
if (!res.ok) throw new Error(JSON.stringify(await res.json())); // errors are JSON
console.log('generation', res.headers.get('x-generation-id'));
Readable.fromWeb(res.body as any).pipe(createWriteStream('dialog.pcm')); // raw 16-bit LE PCM
```

Voice cloning example (Fish Audio):

```json
{
  "model": "fish-audio/s2.1-pro",
  "input": "Hello from my cloned voice!",
  "response_format": "mp3",
  "input_references": [
    { "type": "input_audio", "input_audio": { "data": "data:audio/wav;base64,UklGRuQXDAB..." } },
    { "type": "text", "text": "This is the transcript of the reference audio." }
  ]
}
```

Sources: https://openrouter.ai/docs/api/api-reference/tts/create-speech, https://openrouter.ai/docs/guides/overview/multimodal/tts, https://openrouter.ai/docs/client-sdks/typescript/sdks/tts/README

### 6.7 Speech-to-text (`POST /audio/transcriptions`)

- **operationId:** `createAudioTranscriptions`. TS SDK: `openRouter.stt.createTranscription({ sttRequest })` for JSON and `openRouter.stt.createTranscriptionMultipart({ requestBody: { file, model, ... } })` for multipart.
- **Purpose:** transcribe audio to text. There are **three input modes**:

| Mode | Content type | How audio is sent | Size limit |
| - | - | - | - |
| Inline base64 | `application/json` | `input_audio: { data, format }` | On OpenAI and Groq models, base64 JSON goes past the 25 MB multipart cap (the large body is offloaded through a Durable Object). On other providers, base64 JSON larger than the multipart cap is rejected. |
| URL | `application/json` | `input_audio: { url, format? }` | No OpenRouter-side limit, because the provider downloads it. Only some providers support this. |
| OpenAI-style multipart | `multipart/form-data` | `file` part, **or** `source_url` | `file` max **25 MB** (same as OpenAI) |

**JSON body (`STTRequest`)**

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `model` | string | yes | — | e.g. `openai/whisper-large-v3`, `openai/whisper-1`, `openai/gpt-4o-transcribe`, `microsoft/mai-transcribe-2`. |
| `input_audio` | `STTInlineInputAudio` or `STTUrlInputAudio` | yes | — | **Inline:** `data` (required; base64 of the raw bytes, **not a data URI**) and `format` (required, pattern `^[a-zA-Z0-9][a-zA-Z0-9+._-]{0,15}$`, e.g. `wav`, `mp3`, `flac`, `m4a`, `ogg`, `webm`, `aac`; `pcm` means headerless signed 16-bit LE mono at 16 kHz). **URL:** `url` (required, public http(s), maxLength 8000) and `format` (optional; defaults to the URL path extension and is required when the path has none). |
| `language` | string | no | auto-detect | ISO-639-1, e.g. `en`, `ja`. |
| `temperature` | number | no | — | Sampling temperature (guide: 0–1). |
| `response_format` | enum `"json"`, `"verbose_json"` | no | `"json"` | `json` gives `{ text, usage }`. `verbose_json` adds `task`, `language`, `duration`, and `segments`. Only OpenAI-compatible/structured providers support it; others return `400`, as do some models (e.g. `openai/gpt-4o-transcribe`, `microsoft/mai-transcribe-1.5`). |
| `timestamp_granularities` | array of `"segment"` / `"word"` | no | — | Only used with `verbose_json`. `word` adds a `words[]` array. |
| `diarize` | boolean | no | — | Label each word with its speaker (`words[].speaker`, `speaker_label`). **Requires `verbose_json`** (`json` gives `400`). Word timestamps are included even without `"word"` in granularities. Returns `400` if the model cannot diarize. Providers may charge extra. |
| `keyterms` | `string[]`, maxItems 1000, each 1–100 chars | no | — | Terms to bias recognition toward. Returns `400` if the model cannot use keyterms. Providers may cap them or charge extra. |
| `provider` | object | no | — | `options` (sent under the provider's own field names) and `zdr`/`data_collection`. See the [§6.1](#61-conventions-for-this-section) note. |
| `session_id`, `trace`, `user` (maxLength 256) | | no | — | [§6.1](#61-conventions-for-this-section) |

**Multipart body** (required: `model`; exactly one of `file` or `source_url`):

| Part | Type | Description |
| - | - | - |
| `file` | binary | Audio file. Format comes from the filename extension or the part's content type. Max 25 MB. |
| `source_url` | string (uri, maxLength 8000) | Public URL the provider downloads. Format comes from the path extension. Only some providers support it. |
| `model` | string | Required |
| `language` | string | ISO-639-1 |
| `temperature` | number, 0–1 | |
| `response_format` | `json` \| `verbose_json` | `text`, `srt`, and `vtt` are rejected with `400`. |
| `timestamp_granularities[]` | repeated `word`/`segment` | |
| `diarize` | boolean | Same rules as JSON |
| `keyterms[]` | repeated string (≤1000, each ≤100 chars) | `keyterms=...` is also accepted |
| `provider` | **JSON-encoded string** that must decode to an object | e.g. `{"zdr":true,"data_collection":"deny","options":{"<slug>":{...}}}` |
| `trace` | **JSON-encoded string** | |
| `session_id`, `user` | string (≤256) | |
| `prompt` | — | Accepted but **ignored** (per the guide; not in the spec) |

**Response `200` (`STTResponse`, `application/json`)**

| Field | Type | Present when |
| - | - | - |
| `text` | string (required) | always |
| `usage` | `{ seconds?, input_tokens?, output_tokens?, total_tokens?, cost? }` | `cost` in USD, `seconds` is the input duration |
| `task` | string (`transcribe`) | `verbose_json`, if the provider reports it |
| `language` | string | `verbose_json` |
| `duration` | number (s) | `verbose_json` |
| `confidence` | number 0–1 | `verbose_json`, if the provider scores the whole transcript |
| `language_confidence` | number 0–1 | `verbose_json`, if scored |
| `segments[]` | `{ id, start, end, text` (required)`, avg_logprob?, compression_ratio?, no_speech_prob?, seek?, temperature?, tokens?, channel?, speaker?, speaker_label? }` | `verbose_json` |
| `words[]` | `{ word, start, end` (required)`, type?: "word" \| "audio_event", confidence?, speaker?, speaker_label?, channel? }`. For `audio_event`, `word` is a tag like `(laughter)`. | word timestamps requested, or `diarize` |
| `entities[]` | `{ text, type, start_char, end_char }`, where offsets are character offsets into `text` (not seconds) | the provider runs entity detection |

Header: `X-Generation-Id`. Which verbose fields appear varies by provider.

**Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `504`, `524`, `529`.

**Diarization via provider options:** the guide (which does not mention the top-level `diarize` field) enables diarization through provider-native options under `provider.options`, e.g. Azure `{"azure":{"diarization":{"enabled":true}}}` or Deepgram `diarize`. Integrations differ: some forward only an allowlist and silently drop the rest (Deepgram accepts `punctuate`, `diarize`, `smart_format`, `detect_language`), while others such as Azure forward most fields as-is. The `provider.options` key is the endpoint `tag` from `GET /models/{author}/{slug}/endpoints`.

```bash
# JSON + base64
AUDIO_BASE64=$(base64 < audio.mp3 | tr -d '\n')
curl https://openrouter.ai/api/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"microsoft/mai-transcribe-2","input_audio":{"data":"'"$AUDIO_BASE64"'","format":"mp3"},
       "response_format":"verbose_json","timestamp_granularities":["segment","word"]}'

# OpenAI-style multipart
curl https://openrouter.ai/api/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -F file="@audio.wav" -F model="openai/whisper-large-v3" \
  -F response_format=verbose_json -F "timestamp_granularities[]=word"
```

```python
import os
from openai import OpenAI

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
with open("audio.wav", "rb") as f:
    result = client.audio.transcriptions.create(model="openai/whisper-large-v3", file=f)
print(result.text)
```

```typescript
import { readFile } from 'node:fs/promises';

const audio = await readFile('audio.wav');
const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/whisper-large-v3',
    input_audio: { data: audio.toString('base64'), format: 'wav' }, // raw base64, NOT "data:audio/wav;base64,..."
    language: 'en',
    provider: { options: { groq: { prompt: 'Expected vocabulary: OpenRouter, API' } } },
  }),
});
const { text, usage } = await res.json();
```

Operational notes: upstream providers time out after **60 seconds** per request, so split recordings that take longer than about a minute to process. Prefer `mp3`/`opus` over WAV for long audio (25 MB is about 26 min of 128 kbps MP3, but only about 13 min of 16 kHz mono WAV). STT supports BYOK. For conversational audio understanding, send `input_audio` to `/responses` or `/chat/completions` instead ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference), [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

Sources: https://openrouter.ai/docs/api/api-reference/stt/create-transcription, https://openrouter.ai/docs/guides/overview/multimodal/stt, https://openrouter.ai/docs/client-sdks/typescript/sdks/stt/README

### 6.8 Batch API (async jobs)

Batch runs many requests against **one model and one endpoint** in the background, typically at about **50%** of the sync per-token price, with results returned **inline** in `GET /batches/{id}`. There is no JSONL file upload and no separate results download. Use it when nobody is waiting on the answer (evals, classification, labeling, backlog summarization, corpus embedding). The concept guide and quickstart are summarized in [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations). This subsection is the endpoint contract.

**Lifecycle**

```text
POST /batches ─202─▶ validating ─▶ in_progress ─▶ finalizing ─▶ completed
                         │              │
                         └──────────────┴──▶ failed │ expired │ cancelled      (terminal)
(cancelling also exists in the status enum; there is no cancel endpoint)
```

| Status | Terminal | Meaning |
| - | - | - |
| `validating` | no | Stored; OpenRouter is checking every request (and screening images). A `202` means *stored*, not *valid*. |
| `in_progress` | no | Submitted to the provider |
| `finalizing` | no | Provider finished; results are being collected |
| `completed` | yes | Finished. **Individual requests can still have errors.** Check `request_counts.failed`. |
| `failed` | yes | A check failed or the provider rejected the batch. `error.message` says why (e.g. names the offending `custom_id`). |
| `expired` | yes | The provider did not finish before `expires_at` |
| `cancelling` | no | In the enum. Not accepted as a list filter. |
| `cancelled` | yes | The provider cancelled the batch |

**Turnaround windows (`expires_at`):** most providers 24 h. Google AI Studio 48 h. Google Vertex up to 96 h (it can queue up to 72 h, then process up to 24 h, so a Vertex batch still `validating`/`in_progress` after 24 h is healthy). `expires_at` is `null` when the provider documents no hard expiry. If OpenRouter moves the batch to another provider for capacity before it starts, `provider` and `expires_at` change; `expires_at` is still counted from `created_at`.

#### `POST /batches`: create a batch

- **operationId:** `createBatches`. TS SDK: `openRouter.batch.createBatches({ batchSubmitBody })`. The SDK retries `429` with backoff (`x-speakeasy-retries`: statusCodes `["429"]`, strategy `backoff`, no retry on connection errors).
- **Request:** `application/json` (`BatchSubmitBody`), required.

| Field | Type | Required | Default | Description |
| - | - | - | - | - |
| `endpoint` | enum `"/v1/chat/completions"`, `"/v1/responses"`, `"/v1/messages"`, `"/v1/embeddings"` | yes | — | Request shape for **every** `body`. To mix shapes, submit separate batches. |
| `model` | string, minLength 1 | yes | — | Normal slug of a model with a batch variant (see `https://openrouter.ai/models?variant=batch`). A model without one gives `400`. A `body` may omit `model`; if it sets one, it must match. |
| `requests` | array, minItems 1 | yes | — | Items `{ custom_id: string (minLength 1, unique in the batch), body: object }`. `body` is the same payload you would send to the sync endpoint ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) for chat/responses/messages, [§6.2](#62-embeddings) for embeddings). |
| `callback_url` | string (uri) | no | workspace "Default batch webhook URL" | **Public HTTPS** URL that receives a `batch.completed`, `batch.failed`, `batch.cancelled`, or `batch.expired` webhook. A private or internal address gives `400`. |
| `provider` | `BatchProviderPreferences` or null | no | — | `{ only?: string[], allow_fallbacks?: boolean }` only. `order`, `sort`, and every other sync preference are **rejected**. Not accepted on embeddings batches. |
| `completion_window` | enum `"24h"` | no | `"24h"` | The only accepted value. |

> **Field order matters.** OpenRouter stream-parses the body. Put `endpoint`, `model`, `provider`, `completion_window`, and `callback_url` **before** `requests`, or the submit returns `400`. `JSON.stringify` keeps insertion order, so build the object in that order.

**Response `202` (`BatchObject`)**

| Field | Type | Description |
| - | - | - |
| `id` | string | e.g. `batch_123` |
| `object` | `"batch"` | |
| `endpoint`, `model` | string | |
| `completion_window` | `"24h"` | |
| `status` | enum | `validating` on create |
| `created_at` | integer | Unix seconds |
| `finalized_at` | integer or null | |
| `expires_at` | integer or null | See windows above |
| `provider` | string or null | Provider OpenRouter assigned (same naming as the sync `provider` field, e.g. `Anthropic`) |
| `request_counts` | `{ total, completed, failed }` | |
| `usage` | usage object or null | Same shape as chat usage (`prompt_tokens`, `completion_tokens`, `total_tokens`, `cost`, `is_byok`, `cost_details`, `prompt_tokens_details`, `completion_tokens_details`, `server_tool_use`, `service_tier`, ...). `cost` is what OpenRouter charged. |
| `results` | array or null | `null` until terminal (see `GET /batches/{id}`) |
| `error` | `{ message }` or null | Batch-level failure reason |

**Status codes (batch-specific descriptions):**

| Code | Meaning |
| - | - |
| `202` | Payload durably persisted and queued for async validation and provider submission |
| `400` | Malformed input, an unknown or incompatible batch model, `requests` placed before the other fields, or a private `callback_url` |
| `401` | Missing or invalid API key |
| `402` | Estimated batch cost exceeds the available balance (BYOK and invoiced accounts skip this check) |
| `403` | Resolved batch endpoint is blocked by account policy |
| `404` | No provider in `provider.only`, your allowlist, or your guardrails serves the model in batch mode, or every batch endpoint needs a BYOK key you have not configured (the error names those providers) |
| `413` | Too many requests in the batch, or body larger than 200 MB. `error.message` states the limit. |
| `422` | Model variant or custom IDs violate Batch constraints (e.g. an `:online` variant, or a feature batch rejects at submit) |
| `429` | Batch API rate limit for the billable entity (submits per minute, batches in progress, requests in progress) |
| `500` | Unexpected error in the ingress or upstream batch API |
| `502` | Batch service unavailable, or an upstream provider operation failed |

**What batch does not support** (fails at submit or moves the batch to `failed`):

| Not supported | Do instead |
| - | - |
| Cancelling a batch | Wait for a terminal status, then delete it |
| Image or audio **output** (`modalities`, `audio`, `image_config`) | Sync API. Batch returns text and embeddings only. |
| `stream: true`, `speed`, `deferred_tools`, Anthropic beta features | Remove them |
| OpenRouter web search (`:online`, `web` plugin, `web_search_options`), or a web search tool with `engine` other than `auto`/`native` | Use the provider's own search tool (OpenAI `web_search` on `/v1/responses`, Anthropic `web_search_20250305` on `/v1/messages`). Google Vertex rejects web search tools. |
| Audio input, and video other than YouTube | Sync API. Public YouTube URLs work as `video_url` parts on Google AI Studio, and reserve the model's full input limit at submit. |
| Base64/data-URI images and inline file bytes | Public `https` URLs. Inline media is allowlist-only and provider-verified (see below). |
| Zero Data Retention | Sync API. Batch keeps data for 30 days. |
| Provider `order`/`sort` | `provider.only` |
| Regional data residency | Global endpoint (batch runs on US infrastructure) |
| `access_programs.cyber` other than `standard` | Only on BYOK OpenAI Responses-API requests enrolled in that program |
| Requests with no input, or a max output token cap below 1 | Fix the request |

Unknown parameters inside a `body` are dropped before reaching the provider, the same as sync.

**Image/file URL support by provider** (pin with `provider.only` when you send media):

| Provider | Image URL | File URL |
| - | - | - |
| Anthropic | yes | yes |
| DeepInfra (`/v1/chat/completions` only) | yes | yes |
| Mistral | yes | yes |
| OpenAI | yes | Responses-API-served models only |
| Google Vertex | yes (plus `gs://` with BYOK) | no |
| Google AI Studio | yes | no (YouTube `video_url` works) |
| xAI, Together, Sail Research | yes | no |
| Alibaba (`/v1/chat/completions` only) | yes | no |
| Fireworks, Parasail, Morph | no | no |

File parts use each endpoint's own type: `input_file` on `/v1/responses`, `file` on `/v1/chat/completions`, `document` on `/v1/messages`. Google Vertex image URLs must be HTTPS, end in `.png`/`.jpg`/`.jpeg`/`.webp`/`.heic`/`.heif`, and not point at Google API, Googleusercontent, or Cloud Storage HTTPS hosts. Providers fetch URLs when the batch runs, possibly hours later, so keep them public until it finishes.

Inline base64 media (allowlisted accounts only, and only on verified providers). Images must be content parts of a `user` message. Per-provider decoded caps: Anthropic 5 MiB per image; OpenAI 20 MiB per image and per request; DeepInfra png/jpeg only, 20 MiB; Sail Research 20 MiB, up to 20 images per request; Alibaba 4 MiB, plus a 6,291,456-byte line cap; Mistral png/jpeg/webp, 10 MiB per image and 20 MiB per request; xAI png/jpeg/webp, 17 MiB. Inline PDFs work on Anthropic, DeepInfra, Google AI Studio, Google Vertex, Mistral, and OpenAI (20 MiB) and on xAI (17 MiB). Text, CSV, Markdown, and HTML also work on Google AI Studio and on OpenAI Responses-served models, which also take JSON and `.docx`. Contents must match their media type (a PDF starts with `%PDF-`, etc.). Other accounts get errors such as `Only public http(s) image URLs are supported in batch; base64/data-URI images are rejected` or `Inline base64 files are not enabled for this account in batch`. An unpinned batch can land on a provider that refuses inline images, and that refusal does **not** fall back.

**Provider selection:** by default OpenRouter picks the cheapest provider that serves the model in batch mode, after your allowlist, data policy, guardrails (which match `model:batch` by base model), and BYOK keys apply. Providers at the same price share traffic, and a BYOK key is preferred. If capacity is missing, the batch moves to the next-cheapest allowed provider at that provider's price, unless `allow_fallbacks: false`, in which case the batch fails. `provider` inside a request `body` does **not** pin the batch.

**Content screening:** image screening can fail a batch after `202` with `This request contains prohibited content.` This is terminal; do not retry the same content. If screening is required and temporarily unavailable, the batch stays `validating`. Keep polling it rather than resubmitting. Too many images to screen in the submit window gives `This batch has too many images to screen within the submit window. Split it into smaller batches.`

**Limits:** these follow upstream provider limits, vary by account, and are not published as fixed numbers. Exceeding requests-per-batch or 200 MB gives `413`. Exceeding batches in progress, requests in progress, or submits per minute gives `429`. `error.message` states the current value. Data (requests and results) is deleted **30 days after submit**, after which `GET` returns `410`.

```typescript
const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' };
const response = await fetch('https://openrouter.ai/api/v1/batches', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    // header fields FIRST, `requests` LAST
    endpoint: '/v1/responses',
    model: 'anthropic/claude-haiku-5.5',
    callback_url: 'https://example.com/webhooks/openrouter-batch',
    requests: reviews.map((r) => ({ custom_id: r.id, body: { input: `Classify: ${r.text}` } })),
  }),
});
if (response.status !== 202) throw new Error((await response.json()).error.message);
const batch = await response.json(); // { id: "batch_123", status: "validating", ... }
```

```bash
curl https://openrouter.ai/api/v1/batches \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/v1/chat/completions",
    "model": "google/gemini-3.8-flash",
    "provider": { "only": ["google-vertex"], "allow_fallbacks": false },
    "requests": [
      { "custom_id": "ticket-1", "body": { "messages": [{ "role": "user", "content": "Summarize this ticket in one sentence." }] } }
    ]
  }'
```

#### `GET /batches`: list batches

- **operationId:** `listBatches`. TS SDK: `openRouter.batch.list({...})` (cursor pagination: `after` ← `$.last_id`).
- Lists batches in the **workspace** of the calling key, **newest first**. Every key in the workspace sees the same batches, including ones submitted with other keys. List items always have `results: null`.

| Query param | Type | Description |
| - | - | - |
| `limit` | integer 1–100 | Page size. The guide gives a default of 20. |
| `after` | string, minLength 1 | Previous page's `last_id`. Use it while `has_more` is true. Offset and `before` are not supported. |
| `status` | `BatchListStatus[]`, repeated param | `validating`, `in_progress`, `completed`, `failed`, `expired`, `cancelled`. **`finalizing` and `cancelling` are not accepted**, because stored jobs collapse them into `in_progress`. |
| `created_after` | `BatchListTimestamp` | Strictly after. Unix seconds as a digit string (`^\d+$`), or ISO 8601 date/date-time with offset (e.g. `2026-08-20T00:00:00Z`). |
| `created_before` | `BatchListTimestamp` | Strictly before. If both are set, `created_after` must be earlier, or you get `400`. |

**Response `200` (`BatchListResponse`):** `{ object: "list", data: BatchListItem[], first_id: string|null, last_id: string|null, has_more: boolean }`. `BatchListItem` has the `BatchObject` fields with `results` always `null`.

**Status codes:** `200`, `400` (malformed or unsupported query params), `401`, `429`, `500`, `502`.

Prefer the ID cursor over timestamps. `created_at` has whole-second precision while `created_after` keeps subsecond precision, so a batch created later in the same second can still match `created_after=<created_at>`.

```bash
curl 'https://openrouter.ai/api/v1/batches?status=validating&status=in_progress&limit=100' \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### `GET /batches/{id}`: get a batch (and its results)

- **operationId:** `getBatches`. TS SDK: `openRouter.batch.getBatches({ id })`.
- **Path:** `id` (string, minLength 1), the batch ID from submit.
- **Response `200` (`BatchObject`):** status and counts. **Terminal batches include `results`. There is no separate download endpoint.** Results are **not in input order**, so match on `custom_id`.

`results[]` items (all keys required):

| Field | Type | Description |
| - | - | - |
| `id` | string | Result ID, e.g. `batch_req_1` |
| `custom_id` | string | Your request ID |
| `response` | object or null | `{ status_code: integer, request_id: string|null, body }`. `body` is the normal sync response for the batch endpoint: a chat completion object, a Responses API result (`OpenResponsesResult`), an Anthropic message, or an embeddings list ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference), [§6.2](#62-embeddings)). `body.id` is the generation ID (usable with Report Feedback). |
| `error` | object or null | `{ type: string, message: string, param: string|null, error_type?: ApiErrorType }` |

`ApiErrorType` enum: `context_length_exceeded`, `max_tokens_exceeded`, `token_limit_exceeded`, `string_too_long`, `authentication`, `permission_denied`, `payment_required`, `rate_limit_exceeded`, `provider_overloaded`, `provider_unavailable`, `invalid_request`, `invalid_prompt`, `not_found`, `precondition_failed`, `payload_too_large`, `unprocessable`, `content_policy_violation`, `refusal`, `invalid_image`, `image_too_large`, `image_too_small`, `unsupported_image_format`, `image_not_found`, `image_download_failed`, `server`, `timeout`, `unmapped`.

**Status codes:**

| Code | Meaning |
| - | - |
| `200` | Current batch status |
| `401` | Missing or invalid API key |
| `402` | Finalized batch cost exceeds the available balance. Metadata is returned with `results: null`. Top up and poll again to get the persisted results. |
| `404` | No batch with this ID (also after a successful delete) |
| `410` | Results deleted after the 30-day retention window. They cannot be recovered. |
| `429` | Rate limited. Back off (the guide's poller waits 120 s). |
| `500`, `502` | Server or upstream errors. Retry. |

```typescript
const FINAL = new Set(['completed', 'failed', 'expired', 'cancelled']);
async function waitForBatch(id: string) {
  for (;;) {
    const r = await fetch(`https://openrouter.ai/api/v1/batches/${id}`, { headers });
    if (r.ok) {
      const b = await r.json();
      const resultsReady = b.status !== 'completed' || b.results !== null;
      if (FINAL.has(b.status) && resultsReady) return b;
    } else if (r.status !== 429 && r.status < 500) {
      throw new Error((await r.json().catch(() => null))?.error?.message ?? `poll failed ${r.status}`); // 402/404/410
    }
    await new Promise((res) => setTimeout(res, r.status === 429 ? 120_000 : 60_000)); // ~1/min
  }
}

const b = await waitForBatch(batch.id);
if (b.status !== 'completed') throw new Error(b.error?.message ?? b.status);
for (const result of b.results) {
  if (result.error) { retry(result.custom_id); continue; }
  const msg = result.response.body.output?.find((i: any) => i.type === 'message'); // /v1/responses shape
  save(result.custom_id, msg?.content?.find((p: any) => p.type === 'output_text')?.text);
}
```

#### `DELETE /batches/{id}`: delete a batch

- **operationId:** `deleteBatch`. TS SDK: `openRouter.batch.delete({ id })`.
- Deletes a batch in a **terminal** status (`completed`, `failed`, `expired`, `cancelled`) together with its stored requests and results. **Billing, generation, and audit records are kept, and nothing is refunded.**
- **Response `200` (`BatchDeletedObject`):**

```json
{ "id": "batch_123", "object": "batch",
  "deletion": { "openrouter": "deleted", "upstream": { "provider": "Anthropic", "status": "deleted" } } }
```

| Field | Values |
| - | - |
| `deletion.openrouter` | `"deleted"`: OpenRouter-held request and result artifacts were purged |
| `deletion.upstream` | Omitted when no provider was assigned. `provider` is the stored provider name. `status` is a `BatchDeletionOutcome`: `deleted` (provider batch record removed; supported by Anthropic, Fireworks, Google AI Studio, Google Vertex, and Mistral), `unsupported` (the provider has no batch-delete API, but file cleanup still runs), or `not_applicable` (the batch never reached the provider) |

OpenRouter also deletes provider-side files regardless of `upstream.status`: uploaded input/output/error files on OpenAI, Mistral, DeepInfra, Morph, Alibaba, Parasail, and xAI; datasets on Fireworks; input/output files on Google AI Studio; input only on Together; and OpenRouter-owned output on Vertex (your own BYOK GCS bucket is left alone).

**Status codes:** `200` (every cleanup step finished, and a later `GET` gives `404`), `401`, `404`, **`409`** (the batch is still processing, its required BYOK provider key is unavailable or disabled, or its state changed during deletion), `429`, `500`, `502`. A `5xx` means cleanup stopped part-way; send the same `DELETE` again to resume.

```bash
curl -X DELETE https://openrouter.ai/api/v1/batches/batch_123 -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

#### Batch webhooks

Set via `callback_url` or the workspace "Default batch webhook URL". There is one `POST` when the batch reaches a final status:

```json
{ "id": "evt_51504673caddb4daeaed47e7de1dde8e", "object": "event", "type": "batch.completed",
  "created_at": 1792445705, "data": { "id": "batch_123" } }
```

- Event types: `batch.completed`, `batch.failed`, `batch.expired`, `batch.cancelled`.
- The event carries **only the batch ID**. Fetch `GET /batches/{id}` for status and results. The webhook can arrive a few seconds before `GET` shows the final status, so retry until it matches.
- Headers: `X-OpenRouter-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>` (only when a workspace signing secret exists; generate it in workspace settings under **Webhook signing secret**, shared with video webhooks) and `X-OpenRouter-Idempotency-Key: <batch id>-<status>` (e.g. `batch_123-completed`). A repeated delivery has the same event `id` and idempotency key.
- Verify over the **raw body** as `HMAC-SHA256(secret, "<t>," + rawBody)` and reject `|age| > 300 s`. Return non-2xx to make OpenRouter retry the delivery. Return 2xx only after you durably enqueue the work (key the queue by event `id`).

```typescript
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const secret = process.env.OPENROUTER_WEBHOOK_SECRET!;
function isValid(rawBody: Buffer, header: string): boolean {
  const parts = header.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const sig = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!t || !sig) return false;
  const age = Math.floor(Date.now() / 1000) - Number(t);
  if (Number.isNaN(age) || Math.abs(age) > 300) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${t},`, 'utf8'), rawBody])).digest('hex');
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
app.post('/webhooks/openrouter-batch', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!isValid(req.body, req.header('X-OpenRouter-Signature') ?? '')) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString('utf8'));
  try { await queue.addIfAbsent(event.id, { batchId: event.data.id }); } catch { return res.sendStatus(500); }
  return res.sendStatus(200);
});
```

**BYOK:** batches route through your provider keys like sync requests. Completed BYOK batches report `usage.is_byok: true` and the provider's estimate in `usage.cost_details.upstream_inference_cost`. With BYOK-only enabled, a model none of your keys cover gives `404` at submit. Keys for Fireworks, Mistral, Sail Research, and Claude Platform on AWS cannot run batches on your own key. Vertex BYOK uses a bucket in your GCP project, created automatically per region if you do not supply one. An Alibaba key's `endpoint_url` must be a DashScope OpenAI-compatible base ending in `/v1`. Keys with characters that are invalid in HTTP headers give `400` (see [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) for BYOK).

Sources: https://openrouter.ai/docs/api/api-reference/batch/create-a-batch, https://openrouter.ai/docs/api/api-reference/batch/list-batches, https://openrouter.ai/docs/api/api-reference/batch/get-a-batch, https://openrouter.ai/docs/api/api-reference/batch/delete-a-batch, https://openrouter.ai/docs/batch-quickstart, https://openrouter.ai/docs/guides/features/batch-api, https://openrouter.ai/docs/client-sdks/typescript/sdks/batch/README

### 6.9 Files API (beta)

**Beta:** the API and behavior may change. **Global endpoint only:** in-region hosts return `403`. Files are stored per **workspace** with IDs that start with `or_file_`. There is no separate charge, and workspace files do not expire. Their main consumer is sandbox containers (`file_ids`, [§6.10](#610-containers-sandbox-container-files-beta)) and the `openrouter:files` server tool ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)).

**Common query params (all five operations)**

| Param | Type | Description |
| - | - | - |
| `workspace_id` | string (uuid) | Workspace to scope to. Defaults to the key's workspace, or the default workspace for a key without one. A key scoped to a different workspace gets `403`. A file ID from another workspace gives `404`. |
| `provider` | `FileProvider` enum `"openai"`, `"anthropic"` | Store or read the file on that provider's own Files API using your **BYOK** key. Without a configured key you get `400`. Omit it to use OpenRouter storage. |

**Path `file_id`:** string, 1–256 chars, pattern `^[\w-]+$`.

**Response-shape negotiation.** Every Files response is one of three shapes, discriminated by `_shape`. The default is the **OpenRouter** shape. Requests that look like OpenAI SDK requests get the **OpenAI** shape. Requests with an `anthropic-version` header get the **Anthropic** shape.

| Shape | File object fields | Delete result | List page |
| - | - | - | - |
| `openrouter` (`OpenRouterFile`) | `_shape`, `id`, `type: "file"`, `filename`, `mime_type`, `size_bytes`, `created_at` (ISO string), `downloadable` (boolean) | `{ _shape, id, type: "file_deleted" }` | `{ _shape, data[], cursor: string|null, first_id, last_id, has_more }` |
| `openai` (`OpenAIFile`) | `_shape`, `id`, `object: "file"`, `filename`, `bytes`, `created_at` (Unix int), `purpose` (`assistants`, `batch`, `fine-tune`, `vision`, `user_data`, `evals`, `assistants_output`, `batch_output`, `fine-tune-results`), `status: "processed"` | `{ _shape, id, object: "file", deleted: true }` | `{ _shape, object: "list", data[], first_id, last_id, has_more }` |
| `anthropic` (`AnthropicFile`) | same fields as OpenRouter (`type`, `filename`, `mime_type`, `size_bytes`, `created_at` ISO, `downloadable`) | `{ _shape, id, type: "file_deleted" }` | `{ _shape, data[], first_id, last_id, has_more }` |

#### `POST /files`: upload a file

- **operationId:** `uploadFile`. TS SDK: `openRouter.files.upload({ requestBody: { file: await openAsBlob('x.pdf') }, provider? })`.
- **Request:** `multipart/form-data` with one required part, `file` (binary).
- **Limits and validation:**
  - Max **100 MiB** (104,857,600 bytes); larger gives `413`. Empty files give `400`.
  - Workspace quota is **10 GiB** total; uploads give `403` when it is full.
  - The type is detected from the **content**, not the filename or declared content type. Allowed: PDF; PNG/JPEG/GIF/WebP; DOCX/XLSX/PPTX; MP3/WAV/FLAC/OGG; UTF-8 text, reported by structure as `application/json`, `application/x-ndjson`, `text/csv`, `text/markdown`, or `text/plain`. Anything else gives `400`.
  - Filename: 1–255 chars. `/` makes folder paths (e.g. `data/report.csv`), but it may not start or end the name. No empty, `.`, or `..` segments. `< > : " | ? * \` and control characters are not allowed.
- **Response `200`:** `FileResponse` (negotiated shape). Uploaded files have `downloadable: false`.
- **Status codes:** `200`, `400`, `401`, `403`, `413`, `429`, `499`, `500`, `502`, `503`.

```bash
curl https://openrouter.ai/api/v1/files \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -F "file=@data/report.csv;filename=data/report.csv"
# → {"_shape":"openrouter","id":"or_file_011CNha8iCJcU1wXNR6q4V8w","type":"file","filename":"data/report.csv",
#    "mime_type":"text/csv","size_bytes":24576,"created_at":"2026-08-25T00:00:00Z","downloadable":false}
```

#### `GET /files`: list files

- **operationId:** `listFiles`. TS SDK: `openRouter.files.list({...})` (cursor pagination: `cursor` ← `$.cursor`).

| Query param | Type | Description |
| - | - | - |
| `limit` | integer 1–1000 | Page size (guide default 100) |
| `cursor` | string | Opaque cursor from the previous response (OpenRouter shape) |
| `after` | string | OpenAI-style forward cursor (a file ID). **Do not mix it with `cursor`.** |
| `after_id` | string | Anthropic-style forward cursor |
| `before_id` | string | Anthropic-style reverse cursor. **Not supported by OpenRouter storage.** |
| `order` | enum `asc`, `desc` | Only `asc` is supported by OpenRouter storage |
| `workspace_id`, `provider` | | See above |

**Response `200`:** `FileListResponse` (negotiated shape). **Status codes:** `200`, `400`, `401`, `403`, `429`, `500`, `502`, `503`.

#### `GET /files/{file_id}`: file metadata

- **operationId:** `getFileMetadata`. TS SDK: `openRouter.files.retrieve({...})`. **Response `200`:** `FileResponse`.
- **Status codes:** `200`, `401`, `403`, `404`, `429`, `500`, `502`, `503`.

#### `GET /files/{file_id}/content`: download bytes

- **operationId:** `downloadFileContent`. TS SDK: `openRouter.files.download({...})`.
- **Response `200`:** `application/octet-stream`.
- **Only server-created files are downloadable** (`downloadable: true`): container files promoted to the workspace ([§6.10](#610-containers-sandbox-container-files-beta)) and files written or edited by the `openrouter:files` server tool. **Directly uploaded files return `400`**; keep your own copy.
- **Status codes:** `200`, `400`, `401`, `403`, `404`, `429`, `500`, `502`, `503`.

#### `DELETE /files/{file_id}`: delete a file

- **operationId:** `deleteFile`. TS SDK: `openRouter.files.delete({...})`. Irreversible, and the freed space returns to the workspace quota.
- **Response `200`:** `FileDeleteResponse` (negotiated shape). **Status codes:** `200`, `401`, `403`, `404` (no such file), `429`, `500`, `502`, `503`.

Sources: https://openrouter.ai/docs/api/api-reference/files/upload-a-file, https://openrouter.ai/docs/api/api-reference/files/list-files, https://openrouter.ai/docs/api/api-reference/files/get-file-metadata, https://openrouter.ai/docs/api/api-reference/files/download-file-content, https://openrouter.ai/docs/api/api-reference/files/delete-a-file, https://openrouter.ai/docs/guides/features/files-api, https://openrouter.ai/docs/client-sdks/typescript/sdks/files/README

### 6.10 Containers (sandbox container files, beta)

Containers are the isolated Linux sandboxes behind the `openrouter:shell` and `openrouter:bash` server tools ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). They are **beta** and work on the **global endpoint only**. These four endpoints read files the sandbox produced and promote them into durable workspace storage. Container behavior in brief (details in [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)):

- **Container ID:** returned in shell/bash tool results as `container_id`.
  - With `environment.type: "container_auto"` (the default) and a session ID (from body `session_id`, then the `x-session-id` header, then `prompt_cache_key`; letters, digits, `_`, `-` only; last 20 chars used), the ID is `sess_<sanitized key>`.
  - Without a session, it is the last `container_id` in the replayed conversation, or else `gen_<hash of request id>`.
  - With `container_reference`, it is your own ID (1–40 chars, `[A-Za-z0-9_-]`).
  - A restarted session has its own `-r<nonce>`-suffixed ID.
  - Containers are scoped to the workspace.
- **Lifetime:** the container sleeps after 5 idle minutes. Files under `/workspace/home` are saved after every command and restored on the next request. Processes, environment variables, and system state are not restored. Saved files are kept **30 days after last use**.
- **Container file ID:** `cfile_` + base64url of the container-relative path (e.g. `cfile_b3V0L3JlcG9ydC5jc3Y` = `out/report.csv`). It matches `files[].file_id` in tool results (tool results list at most 10 changed files).
- **Attach workspace files:** `environment.file_ids` takes up to 20 `or_file_` IDs per request. Each appears as `~/<last 8 chars of id>-<basename>`. An unknown ID gives `400`.

**`ContainerFile` object**

| Field | Type | Description |
| - | - | - |
| `id` | string | `cfile_…` |
| `object` | `"container.file"` | |
| `container_id` | string | Echoes the path parameter (OpenAI field name) |
| `path` | string | Container-relative path |
| `bytes` | integer | Size |
| `created_at` | integer | Unix seconds when the file was last synced |
| `source` | `"assistant"` | Always produced by the assistant sandbox |

**Path params (all four):** `container_id` (string, the canonical ID exactly as returned in a bash/shell tool result; a session-derived ID is `sess_` + the *sanitized* session key, which is not necessarily the raw session ID you sent) and `file_id` (string, `cfile_…`).

#### `GET /containers/{container_id}/files`: list container files

- **operationId:** `listContainerFiles`. TS SDK: `openRouter.containers.listContainerFiles({ containerId, limit?, after? })`.
- **Query:** `limit` (integer 1–1000, default 100) and `after` (forward cursor: the previous page's `last_id` or any container file ID; listing resumes strictly after that path).
- Files are listed in **lexicographic path order**.
- **Response `200` (`ContainerFileListResponse`):** `{ object: "list", data: ContainerFile[], first_id, last_id, has_more }`. `has_more: true` always means another page can be fetched with `after=last_id`, and `last_id` is non-null whenever `has_more` is true. **Quirk:** when a page stops at the per-request scan bound on hidden bookkeeping objects, `last_id` names the scan position (possibly a directory marker ending in `/`), may not appear in `data`, and `data` can be **empty while `has_more` is true**. Keep paging. `last_id` is null only when `has_more` is false and `data` is empty.
- **Status codes:** `200`, `400`, `401`, `403`, `429`, `500`, `503`.

#### `GET /containers/{container_id}/files/{file_id}`: file metadata

- **operationId:** `getContainerFile`. **Response `200`:** `ContainerFile`. **Status codes:** `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503`.

#### `GET /containers/{container_id}/files/{file_id}/content`: download bytes

- **operationId:** `downloadContainerFileContent`. **Response `200`:** `application/octet-stream` (streamed raw bytes). **Status codes:** `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503`.

#### `POST /containers/{container_id}/files/{file_id}/promote`: copy into workspace documents

- **operationId:** `promoteContainerFile`. No request body.
- Copies the file from the container's sandbox prefix into durable workspace document storage so it outlives the container (container files are deleted 30 days after last use).
- **Response `200`:** a `FileResponse` (Files API shape, [§6.9](#69-files-api-beta)) with a **new `or_file_` ID**, `filename` equal to the container path, and **`downloadable: true`**. It is downloadable later with `GET /files/{file_id}/content` and usable in `file_ids`.
- The copy is independent of the container file and counts against the workspace storage quota. Files over 100 MiB give `413`. The type is read from content, and unknown content is stored as binary.
- **Status codes:** `200`, `400`, `401`, `403`, `404`, `413`, `429`, `499`, `500`, `503`.

```bash
CID=sess_abc123
curl "https://openrouter.ai/api/v1/containers/$CID/files?limit=100" -H "Authorization: Bearer $OPENROUTER_API_KEY"
curl "https://openrouter.ai/api/v1/containers/$CID/files/cfile_b3V0L3JlcG9ydC5jc3Y/content" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" --output report.csv
curl -X POST "https://openrouter.ai/api/v1/containers/$CID/files/cfile_b3V0L3JlcG9ydC5jc3Y/promote" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
# → {"id":"or_file_…","type":"file","filename":"out/report.csv","mime_type":"text/csv","size_bytes":123,
#    "created_at":"2026-08-25T00:00:00Z","downloadable":true}
```

```typescript
// Page through every file in a container. Handles empty pages with has_more=true.
async function* listAll(containerId: string) {
  let after: string | undefined;
  for (;;) {
    const url = new URL(`https://openrouter.ai/api/v1/containers/${encodeURIComponent(containerId)}/files`);
    url.searchParams.set('limit', '1000');
    if (after) url.searchParams.set('after', after);
    const page = await (await fetch(url, { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } })).json();
    yield* page.data;
    if (!page.has_more) return;
    after = page.last_id;
  }
}
```

Sources: https://openrouter.ai/docs/api/api-reference/containers/list-container-files, https://openrouter.ai/docs/api/api-reference/containers/retrieve-a-container-file, https://openrouter.ai/docs/api/api-reference/containers/download-container-file-content, https://openrouter.ai/docs/api/api-reference/containers/promote-a-container-file-into-workspace-documents, https://openrouter.ai/docs/guides/features/containers, https://openrouter.ai/docs/client-sdks/typescript/sdks/containers/README

### 6.11 SystemOne (`POST /systemone`)

- **operationId:** `createSystemone`. TS SDK: `openRouter.systemOne.create({ decisionsRequest })`. URL: `https://openrouter.ai/api/v1/systemone`.
- **Purpose:** send `state` and typed `questions` to a System One model such as TypeSafe's **Jev**, and get typed answers with probabilities. It implements TypeSafe's own request and response shapes, so the official TypeSafe SDKs work with a base-URL change. Unlike the Decisions route, the spec does not mark it alpha.
- **Request/response schemas:** identical to Decisions (`DecisionsRequest` → `DecisionsResponse`; see [§6.12](#612-decisions-post-apialphadecisions-alpha) for every field). OpenRouter additionally returns `id`, `provider`, and `usage.cost`, which both TypeSafe SDKs pass through.
- **Model ID mapping:** bare TypeSafe IDs are mapped into the `typesafe/` namespace before routing. `jev-1.13` becomes `typesafe/jev-1.13`, and `jev-latest` becomes `~typesafe/jev-latest` (the OpenRouter alias for the newest Jev). IDs that already have an author prefix are used as-is. The response `model` is the concrete OpenRouter ID, e.g. `typesafe/jev-1.13-20260917`.
- **Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `524`, `529`.

**TypeSafe SDK setup** (`@typesafe-ai/sdk` for JS/TS, `typesafe_sdk` for Python). The SDK base URL is `https://openrouter.ai/api`; the SDK appends `/v1/systemone`. Auth is your OpenRouter key via `apiKey`/`api_key` or `TYPESAFE_API_KEY`. The base URL can also come from `TYPESAFE_BASE_URL=https://openrouter.ai/api`.

```typescript
import { TypeSafeClient } from '@typesafe-ai/sdk';

const client = new TypeSafeClient({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api' });
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
    questions={"refund": {"type": "noul", "instructions": "Is the customer asking for money back?"}},
)
print(result.answers["refund"])
```

```bash
curl https://openrouter.ai/api/v1/systemone \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"jev-1.13","state":"I was charged twice for my subscription.",
       "questions":{"refund":{"type":"noul","instructions":"Is the customer asking for money back?"}}}'
# → {"id":"gen-dec-1789738314-X5e5eKGQdvR9rblyX250","model":"typesafe/jev-1.13-20260917","provider":"TypeSafe",
#    "answers":{"refund":{"type":"noul","noul":0.98}},"usage":{"input_tokens":275,"output_tokens":20,"cost":0.00003}}
```

Gotcha: the TypeSafe SDK's `client.models.list()` calls `GET /api/v1/models`, which returns OpenRouter's shape rather than TypeSafe's, so the SDK rejects the response. Browse models through the OpenRouter Models API instead ([§7.2](07-endpoints-platform.md#72-models)).

Sources: https://openrouter.ai/docs/api/api-reference/systemone/submit-a-system-one-request, https://openrouter.ai/docs/guides/community/typesafe-sdk, https://openrouter.ai/docs/guides/community/jev, https://openrouter.ai/docs/client-sdks/typescript/sdks/systemone/README

### 6.12 Decisions (`POST /api/alpha/decisions`), **alpha**

> **Alpha. The shape may change.** URL: `https://openrouter.ai/api/alpha/decisions` (not under `/api/v1`).

- **operationId:** `createApiAlphaDecisions`. TS SDK: `openRouter.alpha.decisions.create({ decisionsRequest })`.
- **Purpose:** ask a decision model typed questions (`noul`, `choice`, `score`, `box`) about `state`, and get one typed answer per question with probabilities. It is meant for routing, classification, verification, ranking, and gating, where you need a typed value your code can branch on instead of prose. Decision models return **no text, reasoning, or explanations**.
- **Request (`DecisionsRequest`):**

| Field | Type | Required | Description |
| - | - | - | - |
| `model` | string | yes | e.g. `typesafe/jev-1.14`, `~typesafe/jev-latest`, `typesafe/jev-1.13`, `openai/gpt-6-luna-decisions`, `cloudflare/clef`, `liquid/d1`. |
| `state` | `string` \| `object` \| `array` | yes | The content to evaluate: a plain string, or a JSON object/array of related context. **Multimodal:** put `image_url`, `input_audio`, and `video_url` content parts as items of a top-level `state` array (which media each endpoint accepts depends on the provider). |
| `questions` | map name → question | yes | One answer is returned per key. Question shapes are below. |
| `assets` | map key → `DecisionsImageAsset` | no | Images sent once and referenced by key. `{ data_base64: string (standard base64, no "data:" prefix; required), format: "png" \| "jpg" \| "jpeg" (required), type?: "image" }`. Every asset must be referenced at least once in `state`, `instructions`, or `criteria`, or you get `400` naming the unused key. TypeSafe Jev endpoints receive `assets` as written and read a reference as a whole string value or inside longer text. All other providers have each whole-string reference resolved to an `image_url` part before sending, so it is accepted only where that provider reads `image_url` parts (top-level `state` items); a reference inside longer text gives `400`. `image_url` parts and `assets` can be mixed. TypeSafe's multipart `part` field is not accepted. |
| `provider` | `ProviderPreferences` | no | [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) |
| `session_id`, `trace`, `user` (≤256) | | no | [§6.1](#61-conventions-for-this-section) |

**Guidance values.** `instructions` and `criteria` entries are a plain string, or a JSON object or array of structured guidance (`null` allowed where noted).

**Question types (discriminated on `type`)**

| `type` | Request fields | Answer (`answers[name]`) |
| - | - | - |
| `noul` (boolean: "does this condition hold?") | `instructions?` (guidance or null); `criteria?: { "true"?: guidance\|null, "false"?: guidance\|null }` | `{ type: "noul", noul: number }`, the **probability of yes** |
| `choice` ("which one of these options?") | `instructions?`; `criteria` (**required**): map option name → guidance | `{ type: "choice", choice: string, probabilities?: { [option]: number }, confidence?: number }` |
| `score` ("where on an ordered scale?") | `instructions?`; `criteria` (**required**): ordered array of levels (minItems 1), lowest first | `{ type: "score", score: number, probabilities?: { "0": p, "1": p, ... }, legend?: { "0": level0, ... }, confidence?: number }`. `score` is the probability-weighted position (e.g. `1.99` on a 0–2 scale). |
| `box` (image bounding box) | `instructions` (**required**): a *description* of the target that names which image in `state` it is in (not a command). No `criteria`. | `{ type: "box", box: { top, bottom, left, right }, confidence?: number }`. Edges are fractions of the image's height (`top`/`bottom`) and width (`left`/`right`), measured from the top-left. **TypeSafe Jev only** (`typesafe/jev-1.14` or `~typesafe/jev-latest`); `jev-1.13` and every other model return `400`. There is no "not found" result, since four edges always come back, so pair it with a `noul` question to check presence. |
| *(any)* | — | `{ type: "refusal" }` when the provider declines that question. No value or probabilities. Other questions can still be answered. |

**Response `200` (`DecisionsResponse`)**

| Field | Type | Description |
| - | - | - |
| `id` | string | e.g. `gen-dec-1789738314-X5e5eKGQdvR9rblyX250` |
| `model` | string (required) | Concrete model that served the request |
| `provider` | string | e.g. `TypeSafe` |
| `answers` | map (required) | One answer per question key (table above) |
| `annotations[]` | `DecisionsUrlCitationAnnotation[]` | `{ type: "url_citation", url_citation: { url, title?, content? } }`. Sources for the whole request, not attributed to individual answers. |
| `usage.input_tokens` | integer (required) | |
| `usage.output_tokens` | integer (required) | |
| `usage.input_tokens_details.cached_tokens` | integer | Input served from the provider's prompt cache |
| `usage.cost` | number | Credits charged. On BYOK this is the OpenRouter fee only. |
| `usage.is_byok`, `usage.cost_details` | | |

**Status codes:** `200`, `400` (also returned *before anything is sent upstream* when an endpoint cannot serve a question type, media part, or asset reference), `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `524`, `529`.

```bash
curl https://openrouter.ai/api/alpha/decisions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "typesafe/jev-1.13",
    "state": { "customer_tier": "enterprise",
               "ticket": "My checkout page shows a blank screen after I click Pay. I have tried two browsers." },
    "questions": {
      "is_bug": { "type": "noul", "instructions": "Is the customer reporting a software defect?",
                  "criteria": { "true": "The customer describes broken or unexpected product behavior.",
                                "false": "The customer is asking a question or requesting a feature." } },
      "team":   { "type": "choice", "instructions": "Which team should own this ticket?",
                  "criteria": { "account": "Login, permissions, or profile issues.",
                                "frontend": "Rendering, layout, or browser compatibility issues.",
                                "payments": "Checkout, billing, or payment processing issues." } },
      "urgency": { "type": "score", "instructions": "How urgent is this ticket?",
                   "criteria": ["Can wait for the next release", "Should be fixed this week", "Blocking revenue right now"] }
    }
  }'
```

```json
{
  "id": "gen-dec-1789738314-X5e5eKGQdvR9rblyX250",
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": {
    "is_bug": { "type": "noul", "noul": 0.96 },
    "team": { "type": "choice", "choice": "payments", "confidence": 0.75,
              "probabilities": { "account": 0, "frontend": 0.16, "payments": 0.84 } },
    "urgency": { "type": "score", "score": 1.99, "confidence": 0.99,
                 "probabilities": { "0": 0, "1": 0.01, "2": 0.99 },
                 "legend": { "0": "Can wait for the next release", "1": "Should be fixed this week", "2": "Blocking revenue right now" } }
  },
  "usage": { "cost": 1.9992e-05, "input_tokens": 476, "output_tokens": 70 }
}
```

Box question with an image in `state` (Jev 1.14):

```json
{
  "model": "typesafe/jev-1.14",
  "state": ["Product photo from the listing:", { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }],
  "questions": { "product": { "type": "box", "instructions": "the product in the listing photo" } }
}
```

TS with the OpenRouter SDK, thresholding a `noul`:

```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? '' });
const res = await openRouter.alpha.decisions.create({
  decisionsRequest: {
    model: '~typesafe/jev-latest',
    state: 'Run `rm -rf build/` in the repo root',
    questions: { reversible: { type: 'noul', instructions: 'Is this action easily reversible?' } },
  },
});
const a = res.answers.reversible;
if (a.type === 'refusal') escalateToHuman();
else if (a.type === 'noul' && a.noul > 0.9) autoApprove();
```

**Models and facts (from the Jev guide):**
- **Jev:** `typesafe/jev-1.14` (`~typesafe/jev-latest` tracks the newest, and `typesafe/jev-1.13` is still available). Text and image input. **262,144-token** context. **Output tokens are free**; you pay per input token. Requests with more than about 32,000 bytes of text, or any image, run in TypeSafe's long-context mode, which TypeSafe says is slower and less accurate. TypeSafe marks image input and Box as early features.
- **Other decision models** use the same API (22 models from 13 makers as of 2026-10-16). Examples: `openai/gpt-6-luna-decisions` (text+images), `microsoft/microsoft-decision-1` (text), `perplexity/pplx-decider-v1.2` and `perplexity/pplx-decider-flash-v1.2` (text+images), `cloudflare/clef`, `cloudflare/clef-flash`, `cloudflare/clef-omni` (Omni adds audio and video), `inception/mercury-decide`, `liquid/d1`, `liquid/d1-ultra`, `upstage/solar-decide`, `upstage/solar-decide-flash` (text). Nace.AI, Respan, ScaleDown, Together, and Jared Palmer also serve decision models. ScaleDown Classify-1 and Respan Span-01 take their own `state` shapes.
- Discover them with `GET /models?output_modalities=decisions` ([§7.2](07-endpoints-platform.md#72-models)). The per-provider table of question types, media, and asset references is in the Multimodal Decisions guide (`https://openrouter.ai/docs/guides/community/multimodal-decisions`, not reproduced here).
- **Probabilities differ between models** on the same question. Re-pick thresholds whenever you change `model`.

Sources: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request, https://openrouter.ai/docs/guides/community/jev, https://openrouter.ai/docs/guides/community/typesafe-sdk, https://openrouter.ai/docs/client-sdks/typescript/sdks/decisions/README

### 6.13 Extractions (`POST /api/alpha/extractions`), **alpha**

> **Alpha. The shape is not stable.** URL: `https://openrouter.ai/api/alpha/extractions` (not under `/api/v1`).

- **operationId:** `createApiAlphaExtractions`. TS SDK: `openRouter.alpha.extractions.create({ extractionsRequest })`.
- **Purpose:** extract, compute, estimate, or forecast **typed fields** (text, numbers, dates, times, durations, lists, estimates, forecasts) from a `state` string and image/PDF assets. Each answer includes the probability that the source contains nothing for that field.
- It uses the Decisions envelope (`model`, `state`, `assets`, `provider`, `user`, `session_id`, `trace`) with `fields` **in place of** `questions`. The specs inside are different, so a Decisions question cannot be reused as a field. Sending `questions` here gives `400`.
- **Strict schema:** `additionalProperties: false`. Unknown keys at the top level or inside a field are **rejected with `400`**, not ignored.

**Request (`ExtractionsRequest`)**

| Field | Type | Required | Description |
| - | - | - | - |
| `model` | string | yes | `cloudflare/clairic`, `inception/mercury-decide`, or `scaledown/extract` (see the model table) |
| `state` | string | yes | Text to read from. May be empty only when the request carries assets. A `state` that is exactly the sole asset's key is read as **file-only**. |
| `fields` | map name → field spec | yes | At least one field |
| `reference_date` | string `^\d{4}-\d{2}-\d{2}$` | no | Anchors dates written without a year. Models without date fields reject it. |
| `assets` | map key → `ExtractionAsset` | no | `{ format: "png" \| "jpg" \| "jpeg" \| "pdf" (required), data_base64 (required, standard base64, no "data:" prefix), type?: "image" \| "document" }`. PDF is read by document models only. Every asset must be referenced in `state` or a field's `instructions`, or you get `400`. A model that reads either text or a document per request, not both (ScaleDown Extract with a PDF), needs the file-only form; any other text around the key is state text and gives `400`. |
| `provider` | `ProviderPreferences` | no | Model-specific options under `provider.options.<slug>`. Each model accepts only its own keys, and anything else gives `400` naming the accepted keys. |
| `session_id`, `trace`, `user` (≤256) | | no | [§6.1](#61-conventions-for-this-section) |

**Field specs (discriminated on `type`).** Every field takes `type`, `instructions?: string`, and `null_threshold?: number 0–1` (default **0.5**; if the null probability is above it, `value` is `null`).

| `type` | Extra keys | Notes |
| - | - | - |
| `text` | — | |
| `number` | `unit?: string`, `integer?: boolean`, `decimals?: 0–6` | `decimals` = decimal places kept in `value` |
| `date` | — | ISO date strings |
| `time` | — | |
| `datetime` | — | |
| `duration` | `unit?` (`seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years`), `integer?`, `decimals?: 0–6` | |
| `list` | `items` (**required**): `"text"` \| `"number"` \| `"date"`; `decimals?` | |
| `estimate` | `min`, `max` (**required**; numbers, or ISO dates for date estimates), `unit?`, `step?` (number > 0, in days for dates, or `"month"` / `"year"`), `scale?`: `"linear"` \| `"log"` | Returns a distribution |
| `forecast` | as `estimate`, plus `horizon` (**required**, integer 1–64 steps) and `interval` (**required**): `step`, `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year` | Per-step values |

**Answers (`answers[name]`, discriminated on `type`; `type` and `value` always present)**

| Key | Applies to | Meaning |
| - | - | - |
| `value` | all | Typed answer, or `null` when `p_null` crossed `null_threshold`. `list`/`forecast` give arrays. |
| `guess` | all | Most likely value even when `value` is `null` |
| `p_null` | all | Probability the state contains nothing for the field |
| `confidence` | all | Confidence in `value` |
| `span` | scalar types | `[start, end)` **Unicode code point** offsets into the state text (not UTF-16 units or bytes) |
| `spans`, `confidences` | `list` | One span and one confidence per item |
| `unit` | `duration` | Unit `value` is expressed in |
| `source` | all | `state`, `image`, or `document` (set to `image`/`document` when read from an asset) |
| `spell_confidence` | all | Spelling confidence for text read from an image |
| `mean`, `median`, `p10`, `p90` | `estimate` (scalars), `forecast` (arrays) | Distribution summary |
| `p_below`, `p_above` | `estimate` | Probability mass below `min` / above `max` |
| `quantiles` | `estimate` | 99 percentiles, when requested (Clairic `include_quantiles`) |
| `steps[]` | `forecast` | Per-step `{ value, mean?, median?, p10?, p90?, p_below?, p_above?, quantiles? }` |

**Response `200` (`ExtractionsResponse`):** `id`, `model` (required), `provider`, `answers` (required), `truncated` (true when the provider read only a prefix of the state), `state_text` (the text spans index into, when requested via provider options), and `usage` (required): `{ input_tokens, output_tokens` (required)`, cost?, state_tokens?, image_tokens?, schema_tokens?, passes? }`. `passes` counts upstream calls when the fields did not fit in one.

**Status codes:** `200`, `400`, `401`, `402`, `403`, `404`, `413`, `429`, `500`, `502`, `503`, `524`, `529`.

**Supported models**

| Model | Reads | Field types | `provider.options` keys |
| - | - | - | - |
| `cloudflare/clairic` | Text and up to **4** PNG/JPEG images (each ≤4 MiB decoded, ≤8 MiB total, body ≤16 MiB). No PDFs. | all | `cloudflare`: `include_quantiles` (adds 99 percentiles as `quantiles`), `return_state_text` (returns `state_text`) |
| `inception/mercury-decide` | Text only (any asset gives `400`) | `text`, and `list` with `items: "text"` | `inception`: `snap_to_words`, `threshold`, `group_fields` (sends all fields in one question, up to 26 per upstream pass: fewer state copies, but a token can belong to only one field) |
| `scaledown/extract` | Text, **or** one PDF/image (not both; use file-only `state`) | `text`, and `list` with `items: "text"` | `scaledown`: `threshold`, `top_n`. It reports no null probability, so `null_threshold` gives `400`. |

A request a model cannot serve (e.g. a `date` field on Mercury Decide, or a fifth image on Clairic) fails with `400` before anything goes upstream. List the models with `GET /models?endpoints=/api/alpha/extractions` (`output_modalities` cannot select them).

**Clairic reads images positionally**, in `assets` key order, and has no in-text reference syntax. With one image the file-only `state` works. With two or more, a key used as the *whole* `state` or the *whole* `instructions` of a field gives `400`, so name each key inside longer text instead.

```bash
curl https://openrouter.ai/api/alpha/extractions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
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

Two images referenced inside text (Clairic):

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

Span offsets are code points. In JS, slice with `Array.from(state).slice(start, end).join('')`, not `state.slice(start, end)`, when the text can contain emoji or astral characters.

Sources: https://openrouter.ai/docs/api/api-reference/alphaextractions/submit-an-extractions-request, https://openrouter.ai/docs/guides/community/extractions, https://openrouter.ai/docs/client-sdks/typescript/sdks/extractions/README

### 6.14 Server tools catalog (`GET /tools`, `GET /tools/{name}`)

These endpoints describe the server tools OpenRouter can run for a model: which `tools[].type` spellings each API format accepts, which engines back each tool, who executes them, how they are priced, and which endpoints run them natively. How to *use* server tools in requests is in [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

#### `GET /tools`: list server tools

- **operationId:** `listTools`. Security: `bearer` (your API key). TS SDK: `openRouter.tools.listTools({ bearer: process.env.OPENROUTER_API_KEY }, { offset?, limit?, apiFormat? })`.

| Query param | Type | Default | Description |
| - | - | - | - |
| `offset` | integer or null, min 0 | `0` | Records to skip |
| `limit` | integer 1–100 | `50` | Page size. **If both `offset` and `limit` are omitted, the full list is returned.** |
| `api_format` | enum `responses`, `chat-completions`, `anthropic-messages` | — | Only tools usable on this API format |

**Response `200` (`ListToolsResponse`):** `{ data: ServerTool[], links: { next: string|null }, total_count: integer }`.

**`ServerTool` fields (all required)**

| Field | Type | Description |
| - | - | - |
| `id` | string | Canonical `openrouter:*` name, e.g. `openrouter:web_search`. It is the stable `tools[].type` on every format in `supported_api_formats`. |
| `name` | string | e.g. `Web search` |
| `summary` | string | One sentence for cards and search. Never sent to a model. |
| `tool_description` | string | The description sent upstream as the function tool description |
| `status` | enum `active`, `deprecated` | |
| `docs_url` | uri | |
| `supported_api_formats` | enum[] | `responses`, `chat-completions`, `anthropic-messages` |
| `aliases[]` | `ServerToolInputName[]` | **Every spelling accepted in `tools[].type`**, including the canonical `id`: `{ type, api_formats[], output_names[] }`. `output_names[]` gives what the call surfaces as on each format: `{ api_format, type, name? }`. `type` is the Responses output item type, the Anthropic content-block type, or the Chat Completions `reasoning_details[].type`. `name` is the Anthropic `server_tool_use` block name. A format is absent when the call is not visible to the caller. Example alias type: `web_search_20250305`. |
| `input_schema` | JSON Schema object | Arguments the model emits when calling the tool |
| `output_schema` | JSON Schema or null | Result returned to the model (null when undeclared) |
| `parameters_schema` | JSON Schema object | Schema for the caller-side `tools[].parameters` object |
| `default_engine` | string or null | Engine used when `parameters.engine` is absent or `"auto"`. `native` applies where the endpoint runs the tool itself, otherwise `fallback_engine`. A request pinned to a data region skips an engine whose `data_regions` lack that region. Null for tools without an engine parameter. |
| `fallback_engine` | string or null | Engine for unpinned requests when `default_engine` is `native` and the endpoint has no native version (e.g. `exa`) |
| `engines[]` | `ServerToolEngine[]` | See below |
| `native_support` | `{ endpoint_count, model_count }` | Endpoints whose provider runs the tool natively (0 if none) |

**`ServerToolEngine` fields (all required)**

| Field | Type | Description |
| - | - | - |
| `id` | string or null | The `parameters.engine` value that selects it. Null for the single engine of a tool without an engine parameter. |
| `name` | string | |
| `executed_by` | enum `provider`, `openrouter`, `client` | `provider`: the model provider runs it during inference. `openrouter`: OpenRouter runs it. `client`: your application runs it after the call is returned. |
| `data_regions` | enum[] `global`, `europe`, `us` | Regions this engine serves without leaving the region. `global` is always listed. A region-pinned request can only use engines that list its region. |
| `byok` | enum `required`, `optional`, `none` | Whether the engine needs your own key saved in plugin settings: `required` (OpenRouter holds none), `optional` (OpenRouter's key unless you saved one), or `none` |
| `pricing_source` | enum `openrouter`, `provider`, `byok`, `none` | Who bills beyond model tokens. `openrouter`: the `pricing` rows, from your credits. `provider`: a per-call tool fee from the model provider at its own rates. `byok`: the engine's vendor, on your key. `none`: no charge. |
| `pricing[]` | `ServerToolPrice[]` | Non-empty exactly when `pricing_source` is `openrouter`: `{ mode: string|null, unit: string, price: string (USD per unit, decimal string), max_units_per_call: integer }`. A request bills exactly one `request` row. |
| `pricing_doc_url` | string or null | Where rates are documented for `provider`/`byok` sources |
| `default_mode` | string or null | The `parameters.mode` an unmoded request runs and bills as (e.g. `auto`). The `pricing[]` row with this `mode` is what it bills. |

**Status codes:** `200`, `401`, `403`, `404`, `500`.

#### `GET /tools/{name}`: get one server tool

- **operationId:** `getTool`. Security: `bearer`. TS SDK: `openRouter.tools.getTool({ bearer: process.env.OPENROUTER_API_KEY }, { name: 'openrouter:web_search' })`.
- **Path `name`:** canonical `openrouter:*` name or **any** accepted `tools[].type` alias.
- **Response `200` (`GetToolResponse`):** `{ data: ServerToolDetails }`. This is `ServerTool` plus `native_support.models[]`: `{ slug: string, providers: string[] }`, the models (and their providers) that run the tool natively.
- **`308`:** an alias was given. The `Location` header holds the canonical tool URL (e.g. `/api/v1/tools/openrouter:web_search`). `fetch` follows 308 automatically by default. With `redirect: 'manual'`, read `Location` yourself.
- **Status codes:** `200`, `308`, `401`, `403`, `404`, `500`.

```bash
curl "https://openrouter.ai/api/v1/tools?api_format=anthropic-messages" -H "Authorization: Bearer $OPENROUTER_API_KEY"
curl -L "https://openrouter.ai/api/v1/tools/web_search_20250305" -H "Authorization: Bearer $OPENROUTER_API_KEY"  # alias → 308 → canonical
```

```typescript
// Which spelling should I put in tools[].type for the Messages API, and what will the call come back as?
const res = await fetch('https://openrouter.ai/api/v1/tools?api_format=anthropic-messages', {
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
});
const { data } = await res.json();
for (const tool of data) {
  const spellings = tool.aliases
    .filter((a: any) => a.api_formats.includes('anthropic-messages'))
    .map((a: any) => a.type);
  const engines = tool.engines.map((e: any) => `${e.id ?? '(single)'}:${e.executed_by}:${e.pricing_source}`);
  console.log(tool.id, tool.status, spellings, engines);
}
```

**Canonical server tool IDs seen in the docs** (see [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities) for usage): `openrouter:web_search`, `openrouter:web_fetch`, `openrouter:datetime`, `openrouter:image_generation`, `openrouter:apply_patch` (Responses only), `openrouter:shell` (Responses and Messages), `openrouter:bash` (Messages only), `openrouter:fusion`, `openrouter:advisor`, `openrouter:subagent`, `openrouter:experimental__search_models`, `openrouter:tool_search` (Responses and Messages), and `openrouter:files`. The catalog endpoint is the source of truth, because it lists every tool and its accepted aliases.

Native support per endpoint also appears as `native_tools` on the endpoints API ([§7.3](07-endpoints-platform.md#73-endpoints-per-model-provider-endpoints-zdr-preview)), e.g. `{"openrouter:web_search": {"type": "web_search_20260209"}, "openrouter:bash": {"type": "bash_20250124"}}`.

Sources: https://openrouter.ai/docs/api/api-reference/tools/list-server-tools, https://openrouter.ai/docs/api/api-reference/tools/get-a-server-tool, https://openrouter.ai/docs/guides/features/server-tools, https://openrouter.ai/docs/client-sdks/typescript/sdks/tools/README

### 6.15 Gotchas and common mistakes

**URLs and auth**
- **Alpha routes are not under `/api/v1`.** Use `https://openrouter.ai/api/alpha/decisions` and `https://openrouter.ai/api/alpha/extractions`. Joining the spec's server URL and path gives a wrong `/api/v1/api/alpha/...`. SystemOne *is* under v1 (`/api/v1/systemone`), and the TypeSafe SDK's base URL is `https://openrouter.ai/api` (no `/v1`).
- Batch `endpoint` values carry a `/v1/` prefix (`"/v1/chat/completions"`), not `/api/v1/`, and they are enum strings, not URLs.
- No endpoint in this section takes a management key. Use a normal API key.
- Files and Containers fail on `eu.`/`us.openrouter.ai`. Batch has no regional residency. Use `https://openrouter.ai`.
- The TS SDK's `tools.listTools` and `tools.getTool` take a `{ bearer }` security object as the **first** argument, because the operations declare `bearer` security explicitly.

**Content types and binary responses**
- `POST /audio/speech` returns **raw audio bytes** (`audio/mpeg` or `audio/pcm`), not JSON. The default `response_format` is **`pcm`**, not mp3. Saving PCM with a `.mp3` extension gives "corrupted" audio. Errors are still JSON, so check `res.ok` before writing bytes.
- STT inline `input_audio.data` must be **raw base64, not a data URI** (`data:audio/...` is wrong here), while TTS reference audio *does* accept data URIs. In multipart STT, `provider` and `trace` are JSON-encoded **strings**.
- STT `response_format` supports only `json`/`verbose_json`. `text`, `srt`, and `vtt` give `400`. `diarize: true` with `json` gives `400`.
- `GET /videos/{jobId}/content` and `GET /files/{id}/content` return bytes. Stream them to disk instead of calling `.json()`.
- Embeddings and rerank list a `text/event-stream` 200 response in the spec, but neither supports streaming.

**Async jobs**
- Video job IDs are `gen-vid-<ts>-<20 alnum>`. `polling_url` may be **relative**. `unsigned_urls` need the API key header, while `urls` are signed and public until `expires_at`, so treat them as secrets.
- Treat video `cancelled` and `expired` as terminal too. The guide's status table omits them, but the spec and webhooks include them.
- Video generation is **not ZDR-eligible**. With ZDR enforced, video requests are not routed at all.
- Batch: a `202` means **stored, not valid**. Validation failures show up later as `status: "failed"` with `error.message`. Poll about once a minute, or use the webhook plus a slow poll.
- Batch: **put `requests` last** in the JSON body, or you get `400`.
- Batch `completed` does not mean every request succeeded. Check `request_counts.failed` and each `results[].error`, and match results by `custom_id` (order is not preserved).
- Batch has **no cancel endpoint**. `DELETE` works only on terminal batches (otherwise `409`), deletes results permanently, and does not refund. Results also disappear after **30 days** (`410`).
- Batch `GET /batches/{id}` can return `402` for a finished batch when the final cost exceeds your balance. Top up and poll again; the results are preserved.
- `provider` inside a batch request `body` is ignored for routing. Set `provider.only` at the top level. `order`/`sort` are rejected, and embeddings batches accept no `provider`.
- Batch list `status` filters reject `finalizing` and `cancelling`.
- The batch webhook payload holds only the batch ID, and can arrive before `GET` reflects the final status. Video webhook `created_at` is an ISO string, while batch webhook `created_at` is Unix seconds. Both use the workspace signing secret and `X-OpenRouter-Idempotency-Key`. Verify the signature over the raw body.

**Files and containers**
- Uploaded files are **not downloadable** (`GET /files/{id}/content` gives `400`). Only promoted container files and files written by the `openrouter:files` tool (`downloadable: true`) can be downloaded.
- Files API responses change shape with the client (`_shape` = `openrouter` | `openai` | `anthropic`). An OpenAI SDK gets `bytes`/Unix `created_at`; the default shape gets `size_bytes`/ISO `created_at`. Branch on `_shape`.
- Do not mix `cursor` and `after` when listing files. `before_id` and `order=desc` are not supported by OpenRouter storage.
- File type is sniffed from content (100 MiB max, 10 GiB per workspace, which gives `403` when full).
- Container listing can return an **empty page with `has_more: true`**. Keep paging with `last_id`. Use the container ID exactly as returned in tool results, since `sess_` IDs use the *sanitized* session key and restarted sessions get a `-r<nonce>` suffix.
- Container files are deleted 30 days after the container was last used. Promote anything you need to keep.

**Images, audio, video parameters**
- Check `supported_parameters` (images) or `supported_*` (videos) before sending a value. Unsupported video values give `400`. Image `size` in explicit pixels plus a mismatched `resolution`/`aspect_ratio` gives `400` on providers that accept pixel sizes.
- Image `n` is an *upper bound*, and single-image providers reject `n > 1`. Image streaming only works on endpoints with `supports_streaming: true` (currently OpenAI). Others silently return a buffered JSON body even with `stream: true`, so handle both content types.
- Image billing is all-or-nothing. A failed or cancelled generation gives `502` and no charge.
- Video `provider.options` nest under `parameters` **only** for Google Veo. Everywhere else the keys go directly under the provider slug.
- TTS and STT `provider.order`/`only`/`ignore` exist in the spec but the guides say they are not applied. Rely on `zdr`, `data_collection`, and `options`.
- TTS `voice` IDs are provider-specific (`supported_voices` on `GET /models`). If you omit `voice`, only providers with a default voice are eligible.

**Decisions and extractions**
- Decisions `box` questions need `typesafe/jev-1.14` (or `~typesafe/jev-latest`). Every other model, including Jev 1.13, returns `400`. Box always returns four edges, so ask a `noul` question to check that the target is present.
- Handle `{ "type": "refusal" }` answers for any question.
- Every `assets` key must be referenced, or you get `400`. For non-TypeSafe providers an asset reference must be a whole top-level `state` item, not embedded in text.
- Extractions rejects unknown keys (strict schema). Spans are Unicode **code point** offsets. On Clairic, with two or more images, never use a bare asset key as the whole `state`/`instructions`.
- Decision probabilities are model-specific. Re-tune thresholds when you switch models.

Sources: https://openrouter.ai/docs/guides/community/jev, https://openrouter.ai/docs/guides/community/extractions, https://openrouter.ai/docs/batch-quickstart, https://openrouter.ai/docs/guides/features/batch-api, https://openrouter.ai/docs/guides/features/files-api, https://openrouter.ai/docs/guides/features/containers, https://openrouter.ai/docs/guides/overview/multimodal/video-generation, https://openrouter.ai/docs/guides/overview/multimodal/image-generation, https://openrouter.ai/docs/guides/overview/multimodal/tts, https://openrouter.ai/docs/guides/overview/multimodal/stt
