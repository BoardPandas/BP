# OpenRouter Reference — 8. Endpoint reference — governance & enterprise

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 07-endpoints-platform.md](07-endpoints-platform.md) · [Next: 09-features-routing-capabilities.md →](09-features-routing-capabilities.md)

## 8. Endpoint reference — governance & enterprise

This section documents every operation in the OpenAPI tags **Guardrails**, **Guardrail Policies**, **Observability**, **Presets**, **Private Endpoints**, **Private Providers**, **SCIM**, **Vault**, and **Workspaces**. The conceptual guides for these features (how guardrails combine at request time, Broadcast trace contents, SSO/SCIM setup, spend-control strategy) are in [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) and [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations); this section is the wire-level reference: paths, auth, parameters, bodies, responses, status codes, and examples.

### 8.1 Conventions used by these endpoints

**Base URL:** `https://openrouter.ai/api/v1` (all paths below are relative to it).

**Auth header:** `Authorization: Bearer <key>` for every route. Two kinds of key are involved:

| Key kind | Used by tags | Notes |
| - | - | - |
| **Management API key** | Guardrails, Guardrail Policies, Observability, Private Endpoints, Private Providers, SCIM, Workspaces | Created at `https://openrouter.ai/settings/management-keys` (organization admins only for orgs). Account-level and unscoped: one key covers all workspaces. Cannot call inference endpoints. Expired keys get `401` with message `API key expired`. Private Endpoints/Providers require an **organization** management key (personal-account keys are rejected) and the Private Endpoints entitlement. See [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) (management keys). |
| **Regular API key** (spec security scheme `apiKey`) | Presets, Vault | Presets: any inference API key. Vault: scope comes from the key's active workspace (or the intern the key belongs to); requires access to the Intern API programme; provisioning keys are rejected (`401`). |

In the spec, the Management-key operations carry no explicit `security` block (they inherit the global bearer scheme) and say "Management key required" in their descriptions; Presets and Vault declare `security: [{apiKey: []}]`.

**Error envelope** (all tags):

```json
{ "error": { "code": 403, "message": "Only management keys can perform this operation" } }
```

Typical status codes: `400` invalid input, `401` missing/invalid/expired key, `403` key lacks permission (e.g. not a management key, workspace not owned by the account), `404` not found, `409` conflict, `422` semantic validation failure, `500` server error. Endpoint-specific codes are listed per operation.

**Pagination styles** (they differ by tag):

| Style | Query params | Response | Used by |
| - | - | - | - |
| Offset/limit with defaults | `offset` (int ≥0, default `0`), `limit` (int 1–100, default `50`) | `{ data: [...], total_count }` | Guardrails lists, Observability list, Presets lists, SCIM lists, Workspaces list + members |
| Offset/limit, optional | `offset` (≥0), `limit` (1–100); **omit both → full list** | `{ data: [...], total_count }` | Guardrail Policies lists |
| Vault paging | `limit` (1–100, default `100`), `offset` (0–10000, default `0`) | `{ data: [...], has_more }` | Vault secret lists |
| None | — | `{ data: [...] }` | Private Endpoints list, Private Providers list, Workspace budgets list |

The TypeScript SDK exposes offset/limit-paginated list methods as async iterables (`for await (const page of result)`).

**Identifiers:** API keys are always referenced by their `hash` (from [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) List API keys), members by their organization user ID (Clerk ID such as `user_2abcDEFghiJKLmnoPQRstu`; from [§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) List organization members `id`, or a workspace member's `user_id`). Workspaces accept a UUID or a slug where the parameter says "ID (UUID) or slug".

**SDK namespaces** (`@openrouter/sdk` TypeScript, `openrouter` Python, Go SDK; see [§3](03-client-sdks.md#3-client-sdks-typescript-python-go) for setup):

| Tag | TypeScript | Python | Go |
| - | - | - | - |
| Guardrails | `openRouter.guardrails.*` | `open_router.guardrails.*` | `s.Guardrails.*` |
| Guardrail Policies | `openRouter.guardrailPolicies.*` | `open_router.guardrail_policies.*` | (no Go README in sources) |
| Observability | `openRouter.observability.*` | `open_router.observability.*` | `s.Observability.*` |
| Presets | `openRouter.presets.*` | `open_router.presets.*` | `s.Presets.*` |
| Private Endpoints | `openRouter.privateEndpoints.*` | `open_router.private_endpoints.*` | `s.PrivateEndpoints.*` |
| Private Providers | `openRouter.privateProviders.*` | `open_router.private_providers.*` | `s.PrivateProviders.*` |
| SCIM | `openRouter.scim.*` | `open_router.scim.*` | `s.Scim.*` |
| Vault | `openRouter.vault.*` | `open_router.vault.*` | `s.Vault.*` |
| Workspaces | `openRouter.workspaces.*` | `open_router.workspaces.*` | `s.Workspaces.*` |

TypeScript methods take one object: path/query params as camelCase keys plus the JSON body wrapped under a key named after the request schema (e.g. `{ id, updateGuardrailRequest: {...} }`); body fields are camelCase (`limitUsd`, `resetInterval`), and so are query params (`workspaceId`, `keepMembers`, `workspaceRef`) and, by the SDK's generated-model convention, response fields (e.g. `has_more` → `hasMore`). Python methods take the body fields as flattened snake_case keyword arguments. Method names per operation are listed below.

Shared TypeScript setup used by the examples in this section:

```typescript
import { OpenRouter } from "@openrouter/sdk";

// Management-key client (Guardrails, Policies, Observability, Private*, SCIM, Workspaces)
const admin = new OpenRouter({ apiKey: process.env.OPENROUTER_MANAGEMENT_KEY ?? "" });

// Regular API-key client (Presets, Vault)
const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" });
```

Sources: https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/guides/routing/private-endpoints, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrails/README, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrailpolicies/README, https://openrouter.ai/docs/client-sdks/python/sdks/workspaces/README, https://openrouter.ai/docs/client-sdks/python/sdks/guardrailpolicies/README, https://openrouter.ai/docs/api/api-reference/vault/list-workspace-secrets

### 8.2 Guardrails (v1 / legacy guardrail objects)

A **guardrail** is one object that bundles a budget, model/provider allow- and deny-lists, ZDR and data-policy settings, data-region restrictions, and content filters. Guardrails remain fully supported; since the introduction of **Guardrail Policies** ([§8.3](#83-guardrail-policies-v2)) every guardrail is also mirrored as up to three policies, and changes made through these routes keep flowing into those mirrored policies (but not the reverse). Request-time combination rules, block responses and content-filter semantics are in [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) (Guardrails guide).

Key behaviors (from the spec and guide):

- **A new guardrail enforces nothing until it is assigned** to API keys or members. `workspace_id` only *places* (organizes) the guardrail in a workspace; it does not apply it to the workspace's traffic.
- **Workspace default guardrail:** each workspace has a default guardrail that applies to all traffic in that workspace without assignment. Its ID is deterministic (`Workspace.default_guardrail_id`, derived from the workspace ID) and it is **materialized when its configuration is first written** (`PATCH /guardrails/{id}`). Until then `GET /guardrails/{id}` returns `404`. In `GET /guardrails?workspace_id=…` it appears with the name `Workspace <workspace-id> Default`; its name is derived and cannot be changed (`400`; sending the current name unchanged is accepted). To restrict a whole workspace, patch this default guardrail.
- **One guardrail per subject:** a key or member can hold at most one directly assigned guardrail; assigning replaces the previous assignment. A member's guardrail also governs their chatroom usage and all API keys they created.
- **Hierarchy:** account-wide privacy settings → workspace default guardrail → member guardrail → API key guardrail; the stricter rule always wins (intersection of allow-lists and data regions, OR for ZDR, union of filters with block > redact, each budget checked independently). Details in [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations).
- `workspace_id: null` on a returned guardrail means an **unscoped legacy guardrail predating workspaces**, not "default workspace" and not "all workspaces".

#### Guardrail object

Returned in `data` by create/get/update and in `data[]` by list.

| Field | Type | Req | Description |
| - | - | - | - |
| `id` | string (uuid) | ✓ | Guardrail ID |
| `name` | string | ✓ | Name |
| `description` | string \| null | | Description |
| `workspace_id` | string \| null | ✓ | Owning workspace; `null` = unscoped legacy guardrail |
| `limit_usd` | number \| null (double) | | Spending limit in USD |
| `reset_interval` | `"daily"` \| `"weekly"` \| `"monthly"` \| null | | When the limit resets (`GuardrailInterval`) |
| `include_byok_in_budgets` | boolean | ✓ | Whether BYOK inference spend (what OpenRouter would have charged) counts toward `limit_usd` in addition to credit spend |
| `allowed_providers` | string[] \| null | | Allowed provider IDs |
| `ignored_providers` | string[] \| null | | Provider IDs excluded from routing |
| `allowed_models` | string[] \| null | | Allowed models, returned as **canonical_slugs** (immutable IDs) |
| `ignored_models` | string[] \| null | | Excluded models (canonical_slugs) |
| `enforce_zdr` | boolean \| null | | **Deprecated.** Legacy all-provider ZDR switch (see below) |
| `enforce_zdr_anthropic` / `enforce_zdr_openai` / `enforce_zdr_google` / `enforce_zdr_xai` / `enforce_zdr_other` | boolean \| null | | Enforce ZDR for that model group (`other` = models not from Anthropic, OpenAI, Google, or xAI) |
| `allow_safety_retention_google` | boolean \| null | | Whether ZDR-only requests to `google/*` models may also use Safety Retention endpoints (may retain prompts/responses only to prevent abuse; not used for training). `false` = ZDR endpoints only. Can only be more restrictive than the account setting; inherits it when not provided |
| `allow_safety_retention_other` | boolean \| null | | Same, for models outside the named providers (e.g. open-weight models on Vertex) |
| `enable_free_model_publication` | boolean \| null | | Allow free endpoints that publish prompts |
| `enable_free_model_training` | boolean \| null | | Allow free endpoints that train on request data |
| `enable_paid_model_training` | boolean \| null | | Allow paid endpoints that train on request data |
| `enforce_first_party_harness_models` | boolean \| null | | Coding harnesses list only their vendor's models (Codex → OpenAI; Claude Code / Claude Desktop → Anthropic). Affects only the model list those harnesses fetch from `GET /models`; a model named directly is still routed. Any `true` across workspace default, member and key guardrails applies |
| `allowed_data_regions` | (`"global"` \| `"europe"` \| `"us"`)[] \| null | | Ingress regions requests must arrive through: `global` = `https://openrouter.ai`, `europe` = `https://eu.openrouter.ai`, `us` = `https://us.openrouter.ai`. Others are rejected (`403`). `null` = unrestricted. Effective set across applicable guardrails = intersection of every non-null value. Requires Business/Enterprise plan |
| `content_filter_builtins` | ContentFilterBuiltinEntry[] \| null | | Builtin filters (PII detectors, secret detectors, regex prompt-injection detector) |
| `content_filters` | ContentFilterEntry[] \| null | | Custom regex filters on request messages |
| `created_at` | string (ISO 8601) | ✓ | Creation time |
| `updated_at` | string \| null | | Last update |

**`ContentFilterBuiltinEntry`** (response) / **`ContentFilterBuiltinEntryInput`** (request):

| Field | Type | Req | Description |
| - | - | - | - |
| `slug` | enum `email`, `phone`, `ssn`, `credit-card`, `ip-address`, `secrets`, `person-name`, `address`, `regex-prompt-injection` | ✓ | Builtin filter ID. `person-name` and `address` are NLP-based (beta) |
| `action` | enum `redact`, `block`, `flag` | ✓ | Every slug supports all three; `flag` is detect-only (no enforcement) |
| `scan_scope` | enum `user_only`, `all_messages` | | Only for `regex-prompt-injection`; default `all_messages` |
| `label` | string (≤100) | | **Read-only**, system-assigned redaction placeholder (e.g. `[EMAIL]`, `[PHONE]`). On input it is deprecated, accepted, and silently ignored |

**`ContentFilterEntry`** (custom regex):

| Field | Type | Req | Description |
| - | - | - | - |
| `pattern` | string (min 1) | ✓ | JavaScript-flavoured regex matched against request content. Lookaheads, lookbehinds, backreferences and nested quantifiers like `(a+)+` are rejected with `invalid_regex_pattern`; up to 100,000 characters per pattern (guide) |
| `action` | enum `redact`, `block`, `flag` | ✓ | Action on match |
| `label` | string \| null (≤100) | | Placeholder used for redaction / in error messages (e.g. `[API_KEY]`) |

**`enforce_zdr` deprecation:** when `enforce_zdr` is sent, its value is copied into each `enforce_zdr_*` field that is *not* explicitly specified in the same request; each `enforce_zdr_*` "falls back to enforce_zdr when not provided".

#### `GET /guardrails` — List guardrails

- operationId `listGuardrails` · TS `guardrails.list()` · Python `guardrails.list()` · Management key · paginated

| Query param | Type | Default | Description |
| - | - | - | - |
| `offset` | integer \| null (≥0) | `0` | Records to skip |
| `limit` | integer (1–100) | `50` | Page size |
| `workspace_id` | string (uuid) | default workspace | Filter by workspace; by default guardrails in the default workspace are returned |

Response `200`: `{ data: Guardrail[], total_count: integer }`. Errors: `400`, `401`, `403`, `500`.

```bash
curl "https://openrouter.ai/api/v1/guardrails?workspace_id=$WORKSPACE_ID" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

#### `POST /guardrails` — Create a guardrail

- operationId `createGuardrail` · TS `guardrails.create({ createGuardrailRequest })` · Management key

Body `CreateGuardrailRequest`:

| Field | Type | Req | Default / constraints | Description |
| - | - | - | - | - |
| `name` | string | ✓ | 1–200 chars | Guardrail name |
| `description` | string \| null | | ≤1000 chars | Description |
| `workspace_id` | string (uuid) | | default workspace | Workspace to create it in. If the default workspace was deleted and this is omitted → `400` (pass it explicitly). Placement only; does not enforce on the workspace |
| `limit_usd` | number \| null | | | Spending limit. **Must be sent together with `reset_interval`**; sending only one of the two → `400` |
| `reset_interval` | `daily`\|`weekly`\|`monthly`\|null | | | Reset cadence |
| `include_byok_in_budgets` | boolean | | `false` | Count BYOK spend toward `limit_usd` |
| `allowed_providers` | string[] \| null | | minItems 1 | Allowed provider IDs |
| `ignored_providers` | string[] \| null | | minItems 1 | Excluded provider IDs |
| `allowed_models` | string[] \| null | | minItems 1 | Model identifiers (slug **or** canonical_slug accepted; stored/returned as canonical_slug) |
| `ignored_models` | string[] \| null | | minItems 1 | Excluded models (slug or canonical_slug) |
| `allowed_data_regions` | (`global`\|`europe`\|`us`)[] \| null | | minItems 1; empty array rejected | Ingress region restriction |
| `enforce_zdr_anthropic`, `enforce_zdr_openai`, `enforce_zdr_google`, `enforce_zdr_xai`, `enforce_zdr_other` | boolean \| null | | | Per-group ZDR |
| `enforce_zdr` | boolean \| null | | deprecated | Copied into unspecified `enforce_zdr_*` |
| `allow_safety_retention_google`, `allow_safety_retention_other` | boolean \| null | | inherits account setting | Safety Retention choices |
| `enable_free_model_publication`, `enable_free_model_training`, `enable_paid_model_training` | boolean \| null | | | Data-policy choices |
| `enforce_first_party_harness_models` | boolean \| null | | | See object table |
| `content_filter_builtins` | ContentFilterBuiltinEntryInput[] \| null | | | Builtin filters |
| `content_filters` | ContentFilterEntry[] \| null | | | Custom regex filters |

Response `201`: `{ data: Guardrail }`. Errors: `400`; `401`; `403` — key lacks permission, the workspace is not owned by this account, **or the workspace does not allow a `person-name` or `address` sensitive-info filter**; `500`.

```bash
curl -X POST https://openrouter.ai/api/v1/guardrails \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Guardrail",
    "description": "A guardrail for limiting API usage",
    "workspace_id": "0df9e665-d932-5740-b2c7-b52af166bc11",
    "limit_usd": 50,
    "reset_interval": "monthly",
    "allowed_providers": ["openai", "anthropic", "deepseek"],
    "enforce_zdr_anthropic": true,
    "enforce_zdr_openai": true,
    "content_filter_builtins": [{ "slug": "regex-prompt-injection", "action": "block" }],
    "content_filters": [{ "pattern": "\\b(sk-[a-zA-Z0-9]{48})\\b", "action": "redact", "label": "[API_KEY]" }]
  }'
```

```typescript
const { data: guardrail } = await admin.guardrails.create({
  createGuardrailRequest: {
    name: "My New Guardrail",
    limitUsd: 50,
    resetInterval: "monthly",
    allowedProviders: ["openai", "anthropic", "deepseek"],
    allowedDataRegions: ["europe"],
    enforceZdrAnthropic: true,
    enforceZdrOpenai: true,
  },
});
```

#### `GET /guardrails/{id}` — Get a guardrail

- operationId `getGuardrail` · TS `guardrails.get({ id })` · Management key
- Path `id` (uuid, required).
- Response `200`: `{ data: Guardrail }`. Errors: `401`, `403`, `404` (not found, **or the workspace default guardrail has not been configured yet**), `500`.

#### `PATCH /guardrails/{id}` — Update a guardrail

- operationId `updateGuardrail` · TS `guardrails.update({ id, updateGuardrailRequest })` · Management key
- Updates an existing guardrail **or materializes an unconfigured workspace default guardrail** (use `Workspace.default_guardrail_id` as `id`).
- **Collection fields use replace semantics** — send the full desired array every time.

Body `UpdateGuardrailRequest` — every field optional; same fields and constraints as create **except** no `workspace_id`, plus:

| Field | Difference from create |
| - | - |
| `name` | 1–200; cannot change a workspace default guardrail's name (`400`) |
| `content_filter_builtins`, `content_filters` | Send `null` to remove |
| `include_byok_in_budgets` | Omit to leave unchanged |
| `allowed_providers` | "New list of allowed provider IDs" (replaces) |

Response `200`: `{ data: Guardrail }`. Errors: `400` (invalid, or renaming a workspace default guardrail); `401`; `403` (no permission, or the update would add a `person-name`/`address` filter to a workspace that does not allow it); `404`; `409` (another guardrail in this workspace already uses the requested name); `500`.

```bash
# Restrict all traffic in a workspace: patch its default guardrail
curl -X PATCH https://openrouter.ai/api/v1/guardrails/$DEFAULT_GUARDRAIL_ID \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_providers": ["openai", "anthropic"],
    "limit_usd": 100,
    "reset_interval": "monthly",
    "include_byok_in_budgets": true,
    "enforce_zdr_anthropic": true,
    "enforce_zdr_openai": true,
    "allowed_data_regions": ["europe"]
  }'
```

#### `DELETE /guardrails/{id}` — Delete a guardrail

- operationId `deleteGuardrail` · TS `guardrails.delete({ id })` · Management key
- Response `200`: `{ deleted: true }`. Errors: `401`, `403`, `404`, `500`.
- Deleting a guardrail is also the way to remove a migrated (legacy-synced) policy ([§8.3](#83-guardrail-policies-v2)).

#### Guardrail assignment endpoints

All Management key. Assignment objects:

- **`KeyAssignment`**: `id` (uuid), `key_hash`, `key_name`, `key_label`, `guardrail_id` (uuid), `assigned_by` (user ID \| null), `created_at` — all required.
- **`MemberAssignment`**: `id` (uuid), `user_id` (Clerk user ID), `organization_id`, `guardrail_id` (uuid), `assigned_by` (\| null), `created_at` — all required.

| Method & path | operationId | TS method | Body | Success response |
| - | - | - | - | - |
| `GET /guardrails/{id}/assignments/keys` | `listGuardrailKeyAssignments` | `guardrails.listGuardrailKeyAssignments({ id })` | — (query `offset`, `limit`) | `200 { data: KeyAssignment[], total_count }` |
| `POST /guardrails/{id}/assignments/keys` | `bulkAssignKeysToGuardrail` | `guardrails.bulkAssignKeys({ id, bulkAssignKeysRequest })` | `{ key_hashes: string[] }` (1–500, required) | `200 { assigned_count }` |
| `POST /guardrails/{id}/assignments/keys/remove` | `bulkUnassignKeysFromGuardrail` | `guardrails.bulkUnassignKeys({ id, bulkUnassignKeysRequest })` | `{ key_hashes: string[] }` (1–500) | `200 { unassigned_count }` |
| `GET /guardrails/{id}/assignments/members` | `listGuardrailMemberAssignments` | `guardrails.listGuardrailMemberAssignments({ id })` | — (query `offset`, `limit`) | `200 { data: MemberAssignment[], total_count }` |
| `POST /guardrails/{id}/assignments/members` | `bulkAssignMembersToGuardrail` | `guardrails.bulkAssignMembers({ id, bulkAssignMembersRequest })` | `{ member_user_ids: string[] }` (1–500) | `200 { assigned_count }` |
| `POST /guardrails/{id}/assignments/members/remove` | `bulkUnassignMembersFromGuardrail` | `guardrails.bulkUnassignMembers({ id, bulkUnassignMembersRequest })` | `{ member_user_ids: string[] }` (1–500) | `200 { unassigned_count }` |
| `GET /guardrails/assignments/keys` | `listKeyAssignments` | `guardrails.listKeyAssignments()` | — (query `offset`, `limit`) | `200 { data: KeyAssignment[], total_count }` (all guardrails) |
| `GET /guardrails/assignments/members` | `listMemberAssignments` | `guardrails.listMemberAssignments()` | — (query `offset`, `limit`) | `200 { data: MemberAssignment[], total_count }` (all guardrails) |

Status codes: lists `401`, `403`, `404`, `500` (account-wide lists also `400`); bulk writes `400`, `401`, `403`, `404`, `500`. `POST …/assignments/keys` returns `403` also when the guardrail has no workspace and carries a `person-name`/`address` sensitive-info filter while at least one target key belongs to a workspace that does not allow that filter.

Semantics: **a key may hold at most one guardrail; assigning replaces any existing assignment.** The counts report how many keys/members were successfully (un)assigned.

```bash
curl -X POST https://openrouter.ai/api/v1/guardrails/$GUARDRAIL_ID/assignments/keys \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "key_hashes": ["c56454edb818d6b14bc0d61c46025f1450b0f4012d12304ab40aacb519fcbc93"] }'
# → { "assigned_count": 1 }
```

```typescript
await admin.guardrails.bulkAssignMembers({
  id: guardrailId,
  bulkAssignMembersRequest: { memberUserIds: ["user_abc123", "user_def456"] },
});
for await (const page of await admin.guardrails.listKeyAssignments()) {
  console.log(page);
}
```

> Doc discrepancy: the migration guide says guardrail member/API-key assignment responses include `managed_by` (`legacy` | `policies`) and `legacy_policy_types` (e.g. `["budget","moderation"]`) to show whether the guardrail or a policy is in charge. These fields are **not** in the OpenAPI `KeyAssignment`/`MemberAssignment` schemas; treat them as optional if present.

Sources: https://openrouter.ai/docs/api/api-reference/guardrails/list-guardrails, https://openrouter.ai/docs/api/api-reference/guardrails/create-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/get-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/update-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/delete-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/list-key-assignments-for-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/bulk-assign-keys-to-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/bulk-unassign-keys-from-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/list-member-assignments-for-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/bulk-assign-members-to-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/bulk-unassign-members-from-a-guardrail, https://openrouter.ai/docs/api/api-reference/guardrails/list-all-key-assignments, https://openrouter.ai/docs/api/api-reference/guardrails/list-all-member-assignments, https://openrouter.ai/docs/guides/features/guardrails, https://openrouter.ai/docs/guides/features/guardrails/policies-migration, https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrails/README

### 8.3 Guardrail Policies (v2)

Guardrail Policies split a guardrail into **three independent policy types** that are assigned separately, so a team can share one model-access policy while each person has a different budget. All routes live under `/guardrails/policies` and need a Management key. Conceptual guide: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations).

| `policy_type` | Route segment | Controls | Legacy guardrail fields it holds |
| - | - | - | - |
| `budget` | `/budget` | USD cap that resets daily/weekly/monthly; BYOK inclusion | `limit_usd`, `reset_interval`, `include_byok_in_budgets` |
| `model_availability` ("Model & provider access") | `/model-availability` | Model/provider allow/deny lists, per-group ZDR, Safety Retention, training/publication, data regions, first-party harness models | `allowed_providers`, `ignored_providers`, `allowed_models`, `ignored_models`, `enforce_zdr*`, `allow_safety_retention_*`, `enable_*_training`/`publication`, `allowed_data_regions`, `enforce_first_party_harness_models` |
| `moderation` ("Content moderation") | `/moderation` | Prompt-injection protection, sensitive-info detection, custom regex filters, Armor tool-call classifier | `content_filter_builtins`, `content_filters`, prompt-injection and sensitive-info settings |

The assignment routes' `policy_type` enum also contains **`rate_limit`**, but no rate-limit policy CRUD routes or config schema exist in the spec.

#### Levels, defaults and combination

- **Workspace-wide policies** (`/guardrails/policies/account`, spec name "account policies"): apply to every member and API key of each covered workspace and **cannot be overridden or loosened**; member/key policies can only add restrictions. One workspace-wide policy can cover many workspaces (explicit `workspace_ids`) or be the **account default** (`is_default: true`) covering every workspace except `opted_out_workspace_ids`, including workspaces created later. Only organization admins can manage them.
- **Workspace (member & API key) policies** (`/budget`, `/model-availability`, `/moderation`): belong to **one** workspace and can only be assigned to members and keys in that workspace. A policy can be the **workspace default** for its type (`is_workspace_default: true`), applying to every member/key without their own policy of that type (including ones added later), minus `opted_out_member_ids` / `opted_out_api_key_hashes`. Organization admins manage all policies; workspace admins can manage policies in workspaces they administer.
- A member or API key has **at most one policy of each type per workspace**; assigning a new budget policy replaces the old budget policy but leaves the other types alone. A member's policy covers their chatroom use and the keys they created. An org API key with no policy of its own follows its creator (its spend counts toward the creator's budget); if the creator leaves, it falls back to the workspace default.
- Defaults are optional at both levels; without one, subjects only get a policy of that type if assigned directly.
- **Combination (stricter wins):** models/providers = intersection; ZDR enforced if any policy enforces it; data regions = intersection of policies that set them (unrestricted policies don't change the result); sensitive-info/content filters = union, block beats redact; budgets each checked independently. Account privacy settings and per-key credit limits always apply on top.
- **Budgets are per subject, never pooled:** a $50/day member budget gives each assigned member their own $50/day (all their keys add up); a key budget limits that key; a workspace-wide budget limits each member and each key in the workspace. For a pooled workspace cap use workspace budgets ([§8.10](#810-workspaces-members-and-workspace-budgets)). Budgets reset at 00:00 UTC (daily; weekly on Monday; monthly on the 1st). `GET /api/v1/key` shows which budgets apply to a key and what is left ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data)).
- Blocked requests return the same `403` errors as guardrails ([§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations), [§4](04-api-fundamentals.md#4-api-fundamentals) errors).
- Limits: one create/update request can name up to **10,000 members and API keys in total**; a policy itself can cover any number.

#### Relationship to guardrails and migration

- **Nothing breaks:** existing guardrails keep enforcing, keep their IDs, and the guardrails API and Terraform resources keep working. There is no migration deadline; you can move one workspace and one policy type at a time.
- Each guardrail is mirrored as **up to three policies** (only the parts it actually sets). A **workspace default guardrail** becomes a workspace-wide policy assigned to that workspace plus the workspace default for each type it sets. A guardrail assigned to a member/key becomes that subject's policy of each type it sets.
- **Sync is one-way:** edits through `/guardrails` keep flowing into the mirrored policies; edits through `/guardrails/policies` (or the dashboard) do not flow back.
- **Editing a migrated policy copies it:** the first `PUT` to a migrated policy creates a copy in that workspace with a **new ID returned in `data.id`** — store and use that ID from then on. The original guardrail and other workspaces are unchanged, and from then on changes to the guardrail no longer reach that policy type in that workspace (other types stay synced).
- **Migrated policies can't be deleted directly:** unassign them, or delete the source guardrail with `DELETE /guardrails/{id}`. A workspace copy that replaced a still-existing v1 workspace default guardrail (`replaces_legacy_default: true`) cannot be deleted.
- Setting names and values are identical, so a guardrail body splits into policy `config` objects without renaming. Request-shape changes: settings go inside `config` (plus `name`, `policy_type`, `workspace_id`); assignments are `member_ids`/`api_key_hashes` on the policy or the single-subject `/assignments` routes instead of bulk assign/unassign routes; **`PUT` replaces** `name` and `config` (vs guardrail `PATCH`); workspace defaults use `is_workspace_default` or a workspace-wide policy instead of patching the default guardrail.
- Migration steps: (1) list what was auto-created (`GET /guardrails/policies/budget?workspace_id=…`, and `/moderation`, `/model-availability`) — migrated policies already carry settings and assignments; (2) point writes for one type at the policy routes; (3) store returned IDs (first edit returns a new ID); (4) stop writing that type through guardrail routes for that workspace; (5) repeat per type/workspace.
- Pick **one** place to manage each policy type in each workspace; changing the same rules through both makes them drift.
- **Terraform** (`openrouter_guardrail` → up to three workspace policies; `openrouter_workspace_default_guardrail` → workspace-wide policy + defaults; `openrouter_guardrail_member_assignment` / `openrouter_guardrail_key_assignment` → that subject's policy of each type) still manages guardrails only; the provider has no policy resources yet. Editing Terraform-managed guardrails via the Policies API/dashboard creates copies Terraform can't see. To use policy-only features in a Terraform-managed workspace, `terraform state rm` its guardrails first.
- Response flags that reveal migration state: summaries `is_legacy_mapped`, `legacy_guardrail_ids`, `replaced_legacy_guardrail_ids`; details `reference` (`legacy_mapping` \| `account_default` \| null) and `replaces_legacy_default`; workspace-wide policies `is_synced` ("kept in sync with a v1 guardrail; saving changes creates an account copy") and `is_workspace_default_synced` ("synced from a v1 workspace default guardrail").

Example split:

```jsonc
// Guardrail
{ "name": "Engineering", "workspace_id": "WS", "limit_usd": 200, "reset_interval": "monthly",
  "allowed_providers": ["openai", "anthropic"], "enforce_zdr_openai": true }

// → POST /guardrails/policies/budget
{ "name": "Engineering budget", "policy_type": "budget", "workspace_id": "WS",
  "config": { "limit_usd": 200, "reset_interval": "monthly", "include_byok_in_budgets": false } }

// → POST /guardrails/policies/model-availability
{ "name": "Engineering models", "policy_type": "model_availability", "workspace_id": "WS",
  "config": { "allowed_providers": ["openai", "anthropic"], "enforce_zdr_openai": true } }
```

#### Policy config schemas

All three config objects set `additionalProperties: false` — unknown keys are not allowed.

**Budget — `GuardrailBudgetPolicyAuthoringConfig` (request) / `GuardrailBudgetPolicyConfig` (response)**

| Field | Type | Req (request) | Description |
| - | - | - | - |
| `limit_usd` | number \| null; request: `> 0` (exclusiveMinimum 0) | ✓ | Spending limit in USD; must be provided together with `reset_interval` |
| `reset_interval` | `daily` \| `weekly` \| `monthly` \| null | ✓ | Reset cadence |
| `include_byok_in_budgets` | boolean | ✓ | Count BYOK inference spend; response doc says default `false` |

All three fields are **required** in the authoring (request) config, unlike legacy guardrails where everything is optional.

**Model availability — `GuardrailModelAvailabilityPolicyAuthoringConfig` (request) / `GuardrailModelAvailabilityPolicyConfig` (response)** — every field optional and nullable. The spec gives no per-field descriptions here; per the migration guide they have the same names and meanings as the guardrail fields in [§8.2](#82-guardrails-v1--legacy-guardrail-objects):

| Field | Type | Meaning |
| - | - | - |
| `allowed_providers`, `ignored_providers` | string[] \| null | Provider allow/deny lists |
| `allowed_models`, `ignored_models` | string[] \| null | Model allow/deny lists |
| `enforce_zdr_anthropic`, `enforce_zdr_openai`, `enforce_zdr_google`, `enforce_zdr_xai`, `enforce_zdr_other` | boolean \| null | Per-group ZDR enforcement |
| `enforce_zdr` | boolean \| null | Legacy all-group switch (deprecated on guardrails) |
| `allow_safety_retention_google`, `allow_safety_retention_other` | boolean \| null | Safety Retention choices |
| `enable_free_model_publication`, `enable_free_model_training`, `enable_paid_model_training` | boolean \| null | Training/publication choices |
| `enforce_first_party_harness_models` | boolean \| null | Harness model-list restriction |
| `allowed_data_regions` | string[] \| null (request: minItems 1) | Ingress regions (`global`, `europe`, `us`; the policy schema types items as plain strings) |
| `platform_banned_authors`, `platform_banned_models`, `platform_banned_providers` | string[] \| null | In the schema but **undocumented** (no description in spec or guides) |
| `require_eu_data_region` | boolean \| null | In the schema but **undocumented** |

**Moderation — `GuardrailModerationPolicyConfig`** (same schema for request and response):

| Field | Type | Description |
| - | - | - |
| `content_filter_builtins` | array \| null of `{ slug, action, label?, scan_scope? }` | Same as guardrail builtins: `slug` ∈ `email`, `phone`, `ssn`, `credit-card`, `ip-address`, `secrets`, `person-name`, `address`, `regex-prompt-injection`; `action` ∈ `redact`, `block`, `flag`; `label` ≤100; `scan_scope` ∈ `user_only`, `all_messages` |
| `content_filters` | array \| null of `{ pattern, action, label? }` | Custom regex: `pattern` 1–100,000 chars; `action` ∈ `redact`, `block`, `flag`; `label` ≤100 \| null |
| `content_filter_patterns` | string[] \| null | Undocumented |
| `content_filter_blocks_requests` | boolean | Undocumented |
| `pii_filters` | array \| null of `{ entity_type: string, action: redact\|block\|flag, score_threshold?: number 0–1 }` | Undocumented in spec (by shape: entity-type filters with a confidence threshold) |
| `lakera_injection_protection_mode` | `block` \| `flag` \| null | Undocumented |
| `enable_model_armor_injection_protection` | boolean \| null | Undocumented |
| `model_armor_injection_protection_mode` | `block` \| `flag` \| null | Undocumented |
| `model_armor_injection_confidence_level` | `low` \| `medium` \| `high` | Undocumented |
| `broadcast_model_armor_flagged_requests` | boolean \| null | Undocumented |
| `platform_moderated_providers`, `platform_image_moderated_providers` | string[] \| null | Undocumented |
| `armor` | object \| null | **Armor** tool-call classifier (below) |

`armor` object (`additionalProperties: false`):

| Field | Type | Default | Description |
| - | - | - | - |
| `mode` | `enforce` \| `audit` | `enforce` | `enforce` withholds blocked calls; `audit` evaluates and reports the same verdicts without withholding any call, regardless of `on_error` |
| `on_error` | `log` \| `block` | `block` | When the classifier can't answer (timeout, upstream error, context too long) the call is reported `unavailable`; `block` rejects it, `log` releases it |
| `use_cc_style_default_rules` | boolean | `true` on the Anthropic Messages API, `false` elsewhere | Prepend Claude Code's built-in auto-mode rule set (1 hard-deny, 72 soft-deny, 17 allow, 21 environment slots) ahead of every configured rule |
| `classifier_context` | `ArmorContext` | | Claude Code's `classifier_context` (v1): `{ v: 1 (required), auto_mode?: ArmorAutoMode }`; any other keys are carried unchanged |

`ArmorAutoMode`: `hard_deny`, `soft_deny`, `allow` — arrays whose items are either a string (1–8122 chars) or an `ArmorRule` object; `environment` — array of `"Name: value"` strings (1–4122) or `{ name (1–120), value (≤4000) }` objects. `ArmorRule`: `id` (required, 1–64, `^[a-z0-9][a-z0-9_-]*$`, unique within its source, reported as the deciding rule), `instructions` (required, 1–8000, written for the classifier), `name` (1–120, display name, defaults to the id), `threshold` (double; match probability; defaults **0.6** for hard/soft-deny and **0.7** for allow rules, so an exception needs stronger evidence to clear a matched soft deny). `threshold` applies when Armor evaluates; when the provider evaluates natively (Anthropic dangerous-tool-use beta) rules are judged at the provider's own boundary.

```json
{
  "armor": {
    "mode": "enforce",
    "on_error": "block",
    "classifier_context": {
      "v": 1,
      "auto_mode": {
        "hard_deny": [],
        "soft_deny": [{ "id": "secrets-in-vcs",
          "instructions": "Staging, committing or pushing a file that holds secrets, including indirectly through git add -A when the tree shows one." }],
        "allow": [],
        "environment": ["Trusted repo: github.com/acme/app"]
      }
    }
  }
}
```

#### Policy response objects

- **Write response** (`BudgetGuardrailPolicy` / `ModelAvailabilityGuardrailPolicy` / `ModerationGuardrailPolicy`, returned by create/update): `{ id (uuid), name, policy_type, config }`.
- **Summary** (`*GuardrailPolicySummary`, list items): required `id`, `name` (1–255), `policy_type`, `config`, `member_count` (≥0), `api_key_count` (≥0), `updated_at` (\| null); optional `is_workspace_default`, `is_legacy_mapped` (kept in sync with a v1 guardrail), `legacy_guardrail_ids` (v1 guardrails it was migrated from), `replaced_legacy_guardrail_ids` (v1 guardrails it replaced).
- **Detail** (`*GuardrailPolicyDetail`, get): required `id`, `name`, `policy_type`, `config`, `member_ids`, `api_key_hashes`, `opted_out_api_key_hashes`, `overridden_api_key_hashes` (keys with a *different* policy of this type assigned directly), `updated_at`; optional `is_workspace_default`, `opted_out_member_ids`, `overridden_member_ids`, `reference` (`legacy_mapping` = synced from a v1 guardrail, `account_default` = account-wide default, else `null`; default `null`), `replaces_legacy_default` (this workspace copy replaced a v1 workspace default guardrail that still exists; it cannot be deleted). Moderation detail additionally has `is_account_policy` (account-owned rather than a workspace policy).
- **Workspace-wide policy** (`AccountGuardrailPolicy`, discriminated by `policy_type`): `id`, `name`, `policy_type`, `config`, `is_default`, `workspace_ids`, `opted_out_workspace_ids`, `workspace_count` (≥0), `is_synced`, `is_workspace_default_synced`, `created_at`, `updated_at` (\| null) — all required.

#### Workspace-wide policy endpoints

| Method & path | operationId | TS method | Notes |
| - | - | - | - |
| `GET /guardrails/policies/account` | `listAccountPolicies` | `guardrailPolicies.listAccountPolicies()` | Query `offset`, `limit` (omit both → full list). `200 { data: AccountGuardrailPolicy[], total_count }` |
| `POST /guardrails/policies/account` | `createAccountPolicy` | `guardrailPolicies.createAccountPolicy({ accountGuardrailPolicyRequest })` | `201 { data: AccountGuardrailPolicy }` |
| `PUT /guardrails/policies/account/{id}` | `updateAccountPolicy` | `guardrailPolicies.updateAccountPolicy({ id, accountGuardrailPolicyRequest })` | **Replaces** the policy and its workspace coverage. `200 { data: AccountGuardrailPolicy }` |
| `DELETE /guardrails/policies/account/{id}` | `deleteAccountPolicy` | `guardrailPolicies.deleteAccountPolicy({ id })` | No `workspace_id` param. `200 { data: boolean }` (whether deleted) |

Status codes: list `400`, `401`, `403`, `404`, `500`; create/update/delete add `409` (conflict or concurrent modification).

Body `AccountGuardrailPolicyRequest` (oneOf, discriminator `policy_type`):

| Field | Type | Req | Description |
| - | - | - | - |
| `name` | string (1–255) | ✓ | Policy name |
| `policy_type` | `budget` \| `moderation` \| `model_availability` | ✓ | Selects the `config` schema |
| `config` | budget authoring / moderation / model-availability authoring config | ✓ | See config schemas above |
| `is_default` | boolean | | Cover every workspace in the account except `opted_out_workspace_ids`. On update, `false` on the current default unsets it |
| `workspace_ids` | uuid[] | | Workspaces covered when the policy is **not** the default |
| `opted_out_workspace_ids` | uuid[] | | Workspaces left out of a default policy |
| `released_floor_workspace_ids` | uuid[] | | Workspaces whose own workspace-wide policy of this type is dropped so they inherit this default |
| `keep_previous_default_workspaces` | boolean | | Keep workspaces that inherited the replaced default on that policy. Cannot be combined with `released_floor_workspace_ids` |
| `floor_reassignment` | `{ policy_id: uuid, workspace_ids: uuid[] (≥1) }` (both required) | | Move workspaces off this policy onto another workspace-wide policy in the same write |

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

Set `"is_default": true` instead to cover every workspace, listing exclusions in `opted_out_workspace_ids`.

#### Workspace policy endpoints (budget, model availability, moderation)

The three types share an identical route shape. Replace `{type}` with `budget`, `model-availability`, or `moderation` and `{Type}` with `Budget`, `ModelAvailability`, or `Moderation`:

| Method & path | operationId | TS method | Params | Body | Success |
| - | - | - | - | - | - |
| `GET /guardrails/policies/{type}` | `list{Type}Policies` | `guardrailPolicies.list{Type}Policies({ workspaceId })` | query `workspace_id` (uuid, **required**), `offset`, `limit` (omit both → full list) | — | `200 { data: {Type}GuardrailPolicySummary[], total_count }` |
| `POST /guardrails/policies/{type}` | `create{Type}Policy` | `guardrailPolicies.create{Type}Policy({ create{Type}GuardrailPolicyRequest })` | — | Create body | `201 { data: {Type}GuardrailPolicy }` |
| `GET /guardrails/policies/{type}/{id}` | `get{Type}Policy` | `guardrailPolicies.get{Type}Policy({ id, workspaceId })` | path `id` (uuid); query `workspace_id` (**required**) | — | `200 { data: {Type}GuardrailPolicyDetail }` (includes member and key assignments) |
| `PUT /guardrails/policies/{type}/{id}` | `update{Type}Policy` | `guardrailPolicies.update{Type}Policy({ id, update{Type}GuardrailPolicyRequest })` | path `id` | Update body (`workspace_id` goes in the **body**) | `200 { data: {Type}GuardrailPolicy }` |
| `DELETE /guardrails/policies/{type}/{id}` | `delete{Type}Policy` | `guardrailPolicies.delete{Type}Policy({ id, workspaceId })` | path `id`; query `workspace_id` (**required**) | — | `200 { data: boolean }` |

Expanded operationIds (TS method names are identical; Python is snake_case, e.g. `guardrail_policies.list_budget_policies(workspace_id=…)`):

| Type | List | Create | Get | Update | Delete |
| - | - | - | - | - | - |
| budget | `listBudgetPolicies` | `createBudgetPolicy` | `getBudgetPolicy` | `updateBudgetPolicy` | `deleteBudgetPolicy` |
| model availability | `listModelAvailabilityPolicies` | `createModelAvailabilityPolicy` | `getModelAvailabilityPolicy` | `updateModelAvailabilityPolicy` | `deleteModelAvailabilityPolicy` |
| moderation | `listModerationPolicies` | `createModerationPolicy` | `getModerationPolicy` | `updateModerationPolicy` | `deleteModerationPolicy` |

TS body wrapper keys: `createBudgetGuardrailPolicyRequest` / `updateBudgetGuardrailPolicyRequest`, `createModelAvailabilityGuardrailPolicyRequest` / `updateModelAvailabilityGuardrailPolicyRequest`, `createModerationGuardrailPolicyRequest` / `updateModerationGuardrailPolicyRequest`. Status codes: list/get `400`, `401`, `403`, `404`, `500`; create/update/delete also `409`.

Create body (`CreateBudgetGuardrailPolicyRequest`, `CreateModelAvailabilityGuardrailPolicyRequest`, `CreateModerationGuardrailPolicyRequest`):

| Field | Type | Req | Default | Description |
| - | - | - | - | - |
| `name` | string (1–255) | ✓ | | Policy name |
| `policy_type` | `"budget"` / `"model_availability"` / `"moderation"` (must match the route) | ✓ | | Type |
| `workspace_id` | uuid | ✓ | | Workspace the policy belongs to |
| `config` | type-specific config | ✓ | | Budget/MA use the *authoring* configs; moderation uses `GuardrailModerationPolicyConfig` |
| `is_workspace_default` | boolean | | `false` | Make it the workspace default for its type |
| `member_ids` | string[] | | | Organization member user IDs to assign |
| `api_key_hashes` | string[] | | | API key hashes to assign |
| `opted_out_member_ids` | string[] | | | Members that should not inherit it when it is the workspace default |
| `opted_out_api_key_hashes` | string[] | | | Keys that should not inherit it when it is the workspace default |

Update body (`Update{Type}GuardrailPolicyRequest`) — **replace semantics**, no `policy_type`:

| Field | Req | Description |
| - | - | - |
| `name` | ✓ | Replaces name |
| `config` | ✓ | Replaces the whole config — always send the full config |
| `workspace_id` | ✓ | Workspace the policy belongs to |
| `member_ids`, `api_key_hashes` | | Complete new assignment lists. **Send both together** to replace assignments, or **omit both** to keep the stored assignments |
| `is_workspace_default` | | Omit to keep the stored default status; `false` unsets it as workspace default |
| `opted_out_member_ids`, `opted_out_api_key_hashes` | | Opt-out lists |

```bash
# Budget: $200/month for one member and one key
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

# Model & provider access as the workspace default
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

```typescript
// Change only the limit, keep assignments (omit memberIds AND apiKeyHashes)
const res = await admin.guardrailPolicies.updateBudgetPolicy({
  id: policyId,
  updateBudgetGuardrailPolicyRequest: {
    name: "Engineering monthly budget",
    workspaceId,
    config: { limitUsd: 300, resetInterval: "monthly", includeByokInBudgets: false },
  },
});
policyId = res.data.id; // a migrated policy gets a NEW id on its first edit
```

```python
res = open_router.guardrail_policies.create_budget_policy(
    config={"include_byok_in_budgets": False, "limit_usd": 200.0, "reset_interval": "monthly"},
    name="Engineering monthly budget",
    policy_type="budget",
    workspace_id="0df9e665-d932-5740-b2c7-b52af166bc11",
)
```

#### Single-subject assignment endpoints (optimistic concurrency)

Use these when several people/scripts manage assignments concurrently; full-list `PUT`s can overwrite each other.

| Method & path | operationId | TS method | Params / body | Success |
| - | - | - | - | - |
| `GET /guardrails/policies/assignments/api-keys/{hash}` | `getApiKeyPolicyAssignment` | `guardrailPolicies.getApiKeyPolicyAssignment({ hash, workspaceId, policyType })` | path `hash` (min 1); query `workspace_id` (uuid, req), `policy_type` (req) | `200 { data: GuardrailPolicyAssignmentState }` |
| `PUT /guardrails/policies/assignments/api-keys/{hash}` | `changeApiKeyPolicyAssignment` | `guardrailPolicies.changeApiKeyPolicyAssignment({ hash, changeGuardrailPolicyAssignmentRequest })` | body below | `200 { data: boolean }` (whether it changed) |
| `GET /guardrails/policies/assignments/members/{member_id}` | `getMemberPolicyAssignment` | `guardrailPolicies.getMemberPolicyAssignment({ memberId, workspaceId, policyType })` | path `member_id` (min 1); query `workspace_id`, `policy_type` (both req) | `200 { data: GuardrailPolicyAssignmentState }` |
| `PUT /guardrails/policies/assignments/members/{member_id}` | `changeMemberPolicyAssignment` | `guardrailPolicies.changeMemberPolicyAssignment({ memberId, changeGuardrailPolicyAssignmentRequest })` | body below | `200 { data: boolean }` |

`policy_type` enum: `budget`, `model_availability`, `moderation`, `rate_limit`. The GET routes say they **require a management key with write access**. Status codes: GET `400`, `401`, `403`, `404`, `500`; PUT adds **`409` when `expected_assignment` no longer matches the stored state**.

`GuardrailPolicyAssignmentState`: `policy_ids` (policies of this type assigned directly), `workspace_default_policy_ids` (workspace defaults of this type the subject inherits), `opted_out` (subject opted out of the workspace default) — all required.

`ChangeGuardrailPolicyAssignmentRequest` (all required): `workspace_id` (uuid), `policy_type`, `policy_id` (uuid), `assigned` (`true` assigns, `false` removes), `expected_assignment` (the state you last read; `409` if it changed since).

```bash
# 1) read
curl "https://openrouter.ai/api/v1/guardrails/policies/assignments/members/user_2abcDEFghiJKLmnoPQRstu?workspace_id=$WS&policy_type=budget" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
# → {"data":{"policy_ids":[],"workspace_default_policy_ids":["2c6f1a4e-0b7d-4e59-9a61-3f8d2e7c1b90"],"opted_out":false}}

# 2) write with the state you read; on 409 re-read and retry
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

```typescript
// Read-modify-write with retry on 409 (plain fetch; the SDK equivalents are
// guardrailPolicies.getMemberPolicyAssignment / changeMemberPolicyAssignment)
const BASE = "https://openrouter.ai/api/v1/guardrails/policies/assignments/members";
const headers = {
  Authorization: `Bearer ${process.env.OPENROUTER_MANAGEMENT_KEY}`,
  "Content-Type": "application/json",
};

async function assignBudget(memberId: string, workspaceId: string, policyId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const q = new URLSearchParams({ workspace_id: workspaceId, policy_type: "budget" });
    const state = (await (await fetch(`${BASE}/${memberId}?${q}`, { headers })).json()).data;
    const res = await fetch(`${BASE}/${memberId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        workspace_id: workspaceId,
        policy_type: "budget",
        policy_id: policyId,
        assigned: true,
        expected_assignment: state,
      }),
    });
    if (res.status !== 409) return res.json(); // { data: true | false }
  }
  throw new Error("assignment kept changing concurrently");
}
```

Sources: https://openrouter.ai/docs/api/api-reference/guardrail-policies/list-workspace-wide-policies, https://openrouter.ai/docs/api/api-reference/guardrail-policies/create-a-workspace-wide-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/update-a-workspace-wide-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/delete-a-workspace-wide-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/list-budget-policies, https://openrouter.ai/docs/api/api-reference/guardrail-policies/create-a-budget-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/get-a-budget-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/update-a-budget-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/delete-a-budget-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/list-model-availability-policies, https://openrouter.ai/docs/api/api-reference/guardrail-policies/create-a-model-availability-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/get-a-model-availability-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/update-a-model-availability-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/delete-a-model-availability-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/list-moderation-policies, https://openrouter.ai/docs/api/api-reference/guardrail-policies/create-a-moderation-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/get-a-moderation-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/update-a-moderation-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/delete-a-moderation-policy, https://openrouter.ai/docs/api/api-reference/guardrail-policies/get-an-api-key-policy-assignment, https://openrouter.ai/docs/api/api-reference/guardrail-policies/change-an-api-key-policy-assignment, https://openrouter.ai/docs/api/api-reference/guardrail-policies/get-a-member-policy-assignment, https://openrouter.ai/docs/api/api-reference/guardrail-policies/change-a-member-policy-assignment, https://openrouter.ai/docs/guides/features/guardrails/policies, https://openrouter.ai/docs/guides/features/guardrails/policies-migration, https://openrouter.ai/docs/client-sdks/typescript/sdks/guardrailpolicies/README, https://openrouter.ai/docs/client-sdks/python/sdks/guardrailpolicies/README

### 8.4 Observability destinations (Broadcast)

These routes manage **Broadcast** destinations: third-party observability/analytics sinks that receive a trace per request (trace contents, Privacy Mode details, per-destination field matrices: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) Broadcast). Management key required for all five operations. Destinations are **workspace-scoped**; when no workspace is given, the authenticated entity's default workspace is used.

#### Destination object (`ObservabilityDestination`, discriminated by `type`)

Every variant has the same top-level fields (all required in responses); only `config` differs by type.

| Field | Type | Description |
| - | - | - |
| `id` | string (uuid) | Stable public ID |
| `type` | enum (see table below) | Destination type |
| `name` | string \| null | Human-readable name |
| `workspace_id` | string (uuid) | Owning workspace |
| `enabled` | boolean | Currently enabled |
| `config` | object | Type-specific config. **Secrets come back masked** (e.g. `"secretKey": "sk-l...AbCd"`) |
| `api_key_hashes` | string[] \| null | Allowlist of API key hashes whose traffic is forwarded; `null` = all keys |
| `privacy_mode` | boolean | When `true`, request/response bodies are not forwarded — metadata only |
| `sampling_rate` | number (double) | 0.0001–1 (1 = 100%). Sampling is deterministic per `session_id` (whole sessions are kept or dropped together) |
| `regions` | (`global` \| `europe` \| `us`)[] (minItems 1) | Data regions the destination applies to; requests served in a region only fan out to destinations that include it |
| `filter_rules` | `ObservabilityFilterRulesConfig` \| null | Structured rules controlling which events are forwarded |
| `broadcast_generation_cost` | boolean | Include cost and billing generation metadata |
| `broadcast_generation_cost_allocation` | boolean | **Beta.** Include `openrouter_cost_allocation` (per-token-kind usage and cost, sent only when they reconcile with the billed cost) |
| `broadcast_generation_identity` | boolean | Include identity generation metadata |
| `broadcast_generation_request_context` | boolean | Include request-context generation metadata |
| `created_at`, `updated_at` | string (ISO) | Timestamps |

**`ObservabilityFilterRulesConfig`** (nullable):

```jsonc
{
  "enabled": true,            // boolean, default true
  "groups": [                 // required
    {
      "logic": "and",         // "and" | "or", default "and" (combines rules within the group)
      "rules": [              // required
        { "field": "model", "operator": "equals", "value": "openai/gpt-4o" }
      ]
    }
  ]
}
```

- `field` (required): `model`, `provider`, `session_id`, `user_id`, `api_key_name`, `finish_reason`, `input`, `output`, `total_cost`, `total_tokens`, `prompt_tokens`, `completion_tokens`.
- `operator` (required): `equals`, `not_equals`, `contains`, `not_contains`, `regex`, `starts_with`, `ends_with`, `gt`, `lt`, `gte`, `lte`, `exists`, `not_exists`.
- `value`: string or number (omit for `exists`/`not_exists`).
- How multiple groups combine with each other is not specified in the spec.

#### Destination types and `config` fields

Only **stable** destination types are accepted on create and surfaced by list (17 types). All types also accept an optional `headers` object (`map<string,string>`, custom HTTP headers sent to the destination). Defaults shown are from the spec.

| `type` | Required config | Optional config (default) |
| - | - | - |
| `arize` | `apiKey`, `spaceKey`, `modelId` (name of the tracing project in Arize AX) | `baseUrl` (`https://otlp.arize.com`) |
| `braintrust` | `apiKey`, `projectId` | `baseUrl` (`https://api.braintrust.dev`) |
| `clickhouse` | `host`, `database`, `username` (use `default` if none set), `password` | `table` (`OPENROUTER_TRACES`), `shouldIncludeCacheWriteTokens` (`false`; sends the `cache_write_tokens` column, schema v2 — enable after the table has it) |
| `datadog` | `apiKey` (needs LLM Observability permissions), `mlApp` (app name in Datadog LLM Observability) | `url` (`https://api.datadoghq.com`; regional e.g. `https://api.us3.datadoghq.com`, `https://api.us5.datadoghq.com`, `https://api.datadoghq.eu`) |
| `grafana` | `apiKey`, `instanceId` | `baseUrl` (`https://otlp-gateway-prod-us-west-0.grafana.net`) |
| `langfuse` | `publicKey`, `secretKey` | `baseUrl` (`https://us.cloud.langfuse.com`) |
| `langsmith` | `apiKey` | `endpoint` (`https://api.smith.langchain.com`), `project` (`main`), `workspaceId` (required for org-scoped LangSmith keys) |
| `newrelic` | `licenseKey` | `region` (`us` \| `eu`, default `us`) |
| `opik` | `apiKey`, `workspace`, `projectName` | — |
| `otel-collector` | `endpoint` | `headers` (e.g. Axiom: `{"Authorization": "Bearer xaat-xxx", "X-Axiom-Dataset": "your-dataset"}`) |
| `posthog` | `apiKey` | `endpoint` (`https://us.i.posthog.com`) |
| `ramp` | `apiKey` (generated in Ramp integration settings) | `baseUrl` (`https://api.ramp.com/developer/v1/ai-usage/openrouter`) |
| `s3` | `bucketName` | `provider` (`aws` \| `cloudflare_r2` \| `gcs` \| `other`); `authMode` (`access_keys` \| `iam_role`, default `access_keys`); `accessKeyId`, `secretAccessKey`, `sessionToken`; `region` (required for IAM role; with access keys AWS detects it); `roleArn` (pattern `^arn:aws:iam::\d{12}:role\/…`); `externalId` (generated by OpenRouter on save); `endpoint` (URI, only for S3-compatible services such as Cloudflare R2 `https://account-id.r2.cloudflarestorage.com` or MinIO); `prefix` (`openrouter-traces`); `pathTemplate` (`{prefix}/{date}`; variables `{prefix}`, `{date}`, `{year}`, `{month}`, `{day}`, `{apiKeyName}`; filename `{traceId}-{timestamp}.json` is appended) |
| `sentry` | `otlpEndpoint`, `dsn` (pattern `https://<key>@<host>/…/<project-id>`) | — |
| `snowflake` | `account` (1–255, `^[a-zA-Z0-9_]+(?:[.-][a-zA-Z0-9_]+)*$`), `token` | `database` (`SNOWFLAKE_LEARNING_DB`), `schema` (`PUBLIC`), `table` (`OPENROUTER_TRACES`), `warehouse` (`COMPUTE_WH`), `shouldIncludeCacheWriteTokens` (`false`) |
| `weave` | `apiKey`, `entity`, `project` | `baseUrl` (`https://trace.wandb.ai`) |
| `webhook` | `url` | `method` (`POST` \| `PUT`, default `POST`), `headers` |

S3 IAM-role mode: OpenRouter assumes a role in your AWS account with short-lived STS credentials. The role's trust policy must allow `sts:AssumeRole` from `arn:aws:iam::536697249728:role/openrouter-broadcast-exporter` and require the generated `externalId` as `sts:ExternalId`; its permissions must allow `s3:PutObject` on the bucket/prefix (plus `kms:GenerateDataKey` for SSE-KMS buckets).

#### `GET /observability/destinations` — List destinations

- operationId `listObservabilityDestinations` · TS `observability.list()` · paginated
- Query: `offset` (default 0), `limit` (1–100, default 50), `workspace_id` (uuid; defaults to the authenticated entity's default workspace).
- Only destinations with stable release status are returned; other types are excluded.
- `200 { data: ObservabilityDestination[], total_count }`. Errors `400`, `401`, `403`, `500`.

#### `POST /observability/destinations` — Create a destination

- operationId `createObservabilityDestination` · TS `observability.create({ createObservabilityDestinationRequest })`
- **Max 5 destinations per type.** Defaults to the default workspace; pass `workspace_id` to scope elsewhere.

| Field | Type | Req | Default | Description |
| - | - | - | - | - |
| `type` | enum of the 17 types | ✓ | | Only stable types accepted |
| `name` | string | ✓ | | Display name |
| `config` | object | ✓ | | Type-specific, validated server-side |
| `workspace_id` | uuid | | default workspace | Target workspace |
| `enabled` | boolean | | `true` | Enable immediately |
| `api_key_hashes` | string[] \| null (minItems 1) | | `null` (all keys) | Key allowlist; must contain ≥1 hash if provided |
| `privacy_mode` | boolean | | `false` | Metadata only |
| `sampling_rate` | number | | | 0.0001–1 |
| `regions` | (`global`\|`europe`\|`us`\|`eu`)[] (minItems 1) | | `["global"]` | `eu` is an alias normalized to `europe`; must be non-empty |
| `filter_rules` | FilterRulesConfig \| null | | | Event filters |
| `broadcast_generation_cost` | boolean | | `false` | Cost/billing metadata |
| `broadcast_generation_cost_allocation` | boolean | | `false` | Beta cost allocation |
| `broadcast_generation_identity` | boolean | | `false` | Identity metadata |
| `broadcast_generation_request_context` | boolean | | `false` | Request-context metadata |

`201 { data: ObservabilityDestination }`. Errors `400`, `401`, `403`, `409`, `500`.

```bash
curl -X POST https://openrouter.ai/api/v1/observability/destinations \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "langfuse",
    "name": "Production Langfuse",
    "config": {
      "publicKey": "'"$LANGFUSE_PUBLIC_KEY"'",
      "secretKey": "'"$LANGFUSE_SECRET_KEY"'",
      "baseUrl": "https://us.cloud.langfuse.com"
    },
    "sampling_rate": 0.25,
    "privacy_mode": false,
    "regions": ["global", "eu"],
    "broadcast_generation_cost": true,
    "filter_rules": {
      "groups": [{ "logic": "and", "rules": [{ "field": "model", "operator": "starts_with", "value": "anthropic/" }] }]
    }
  }'
```

```typescript
const { data: dest } = await admin.observability.create({
  createObservabilityDestinationRequest: {
    type: "webhook",
    name: "Audit webhook",
    config: { url: "https://example.com/openrouter-events", method: "POST" },
    privacyMode: true,
    apiKeyHashes: [prodKeyHash],
  },
});
```

#### `GET /observability/destinations/{id}` — Get a destination

- operationId `getObservabilityDestination` · TS `observability.get({ id })`
- `200 { data: ObservabilityDestination }`. Errors `401`, `403`, `404`, `500`.

#### `PATCH /observability/destinations/{id}` — Update a destination

- operationId `updateObservabilityDestination` · TS `observability.update({ id, updateObservabilityDestinationRequest })`
- Only fields present are updated. `type` and `workspace_id` cannot be changed (not in the body).

| Field | Notes |
| - | - |
| `name`, `enabled`, `privacy_mode`, `sampling_rate` | Plain replace |
| `config` | **Partial merge:** provider fields to update; **masked values are ignored** and unset fields keep their current value (so you can round-trip a GET response safely) |
| `api_key_hashes` | `null` clears the filter (all keys); omitted leaves current; ≥1 hash if an array |
| `regions` | Omit to keep; **cannot be cleared**; `eu` alias accepted |
| `filter_rules` | FilterRulesConfig \| null |
| `broadcast_generation_cost`, `broadcast_generation_cost_allocation`, `broadcast_generation_identity`, `broadcast_generation_request_context` | booleans |

`200 { data: ObservabilityDestination }`. Errors `400`, `401`, `403`, `404`, `409`, `500`.

```bash
curl -X PATCH https://openrouter.ai/api/v1/observability/destinations/$DEST_ID \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false, "name": "Updated Langfuse" }'
```

#### `DELETE /observability/destinations/{id}` — Delete a destination

- operationId `deleteObservabilityDestination` · TS `observability.delete({ id })`
- **Soft delete.** `200 { deleted: true }`. Errors `401`, `403`, `404`, `500`.

Sources: https://openrouter.ai/docs/api/api-reference/observability/list-observability-destinations, https://openrouter.ai/docs/api/api-reference/observability/create-an-observability-destination, https://openrouter.ai/docs/api/api-reference/observability/get-an-observability-destination, https://openrouter.ai/docs/api/api-reference/observability/update-an-observability-destination, https://openrouter.ai/docs/api/api-reference/observability/delete-an-observability-destination, https://openrouter.ai/docs/guides/features/broadcast, https://openrouter.ai/docs/client-sdks/typescript/sdks/observability/README

### 8.5 Presets

Presets are named, versioned LLM configurations (model(s), provider routing, system prompt, generation parameters, tools including OpenRouter server tools) referenced at inference time as `@preset/<slug>`. Conceptual guide and dashboard workflow: [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy) (presets guide). All preset routes use a **regular API key** (security `apiKey`); presets live in a workspace (`workspace_id`) and organization members can all access organization presets.

#### Objects

**`Preset`** (all fields required):

| Field | Type | Description |
| - | - | - |
| `id` | string | Preset ID |
| `slug` | string | URL-safe identifier used in `@preset/<slug>` |
| `name` | string | Display name (in the spec/guide examples of the create-from-request routes it equals the slug) |
| `description` | string \| null | Description |
| `status` | `active` \| `disabled` \| `archived` | Preset status (`PresetStatus`) |
| `status_updated_at` | string \| null | When status last changed |
| `designated_version_id` | string \| null | The version currently designated (used at inference) |
| `workspace_id` | string \| null | Owning workspace |
| `creator_user_id` | string \| null | Creator |
| `created_at`, `updated_at` | string | Timestamps |

**`PresetDesignatedVersion`** (a version; schema type `object | null`):

| Field | Type | Description |
| - | - | - |
| `id` | string | Version ID |
| `preset_id` | string | Parent preset |
| `version` | integer | Version number (1, 2, …) |
| `system_prompt` | string \| null | Stored system prompt |
| `config` | object (`map<string, any>`) | Stored request configuration, e.g. `{ "model": "openai/gpt-4o", "temperature": 0.7, "provider": { "sort": "price" } }` |
| `creator_id` | string | Version author |
| `created_at`, `updated_at` | string | Timestamps |

**`PresetWithDesignatedVersion`** = `Preset` + `designated_version: PresetDesignatedVersion` (required key).

#### Read endpoints

| Method & path | operationId | TS method | Params | Success |
| - | - | - | - | - |
| `GET /presets` | `listPresets` | `presets.list()` | `offset` (0), `limit` (1–100, 50) | `200 { data: Preset[], total_count }` — most recently updated first |
| `GET /presets/{slug}` | `getPreset` | `presets.get({ slug })` | path `slug` (min 1) | `200 { data: PresetWithDesignatedVersion }` |
| `GET /presets/{slug}/versions` | `listPresetVersions` | `presets.listVersions({ slug })` | path `slug`; `offset`, `limit` | `200 { data: PresetDesignatedVersion[], total_count }` — ascending by version (oldest first) |
| `GET /presets/{slug}/versions/{version}` | `getPresetVersion` | `presets.getVersion({ slug, version })` | path `slug`; path `version` (**string**, min 1, the version number e.g. `"1"`) | `200 { data: PresetDesignatedVersion }` |

Status codes: `400`, `401`, `403`, `500`, `503` (service temporarily unavailable); single-resource routes also `404`.

There are **no** update/delete/rename/status/rollback routes for presets in the API; only the create-from-request routes below write presets. Everything else (editing, rolling back to an earlier version, status changes) is done in the dashboard at `https://openrouter.ai/settings/presets`.

#### Create a preset (or new version) from an inference request body

| Method & path | operationId | TS method | Body schema (same as) |
| - | - | - | - |
| `POST /presets/{slug}/chat/completions` | `createPresetsChatCompletions` | `presets.createPresetsChatCompletions({ slug, chatRequest })` | `ChatRequest` = body of `POST /chat/completions` ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)) |
| `POST /presets/{slug}/messages` | `createPresetsMessages` | `presets.createPresetsMessages({ slug, messagesRequest })` | `MessagesRequest` = body of `POST /messages` ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)) |
| `POST /presets/{slug}/responses` | `createPresetsResponses` | `presets.createPresetsResponses({ slug, responsesRequest })` | `ResponsesRequest` = body of `POST /responses` ([§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference)) |

The request bodies are **exactly** the [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) inference bodies; nothing preset-specific is added. Preset-specific behavior:

- Path `slug` (string, min 1, URL-safe): **created if it does not exist**; if a preset with that slug already exists in the workspace, a **new version** is created and **designated as the active version**.
- **Only fields that overlap with the preset config are persisted** (e.g. `model`, `temperature`, `provider`, `top_p`, `system`, `tools`). Transient fields — `messages`, `input`, `prompt`, `stream` — are **silently ignored**.
- **System prompt extraction** into `designated_version.system_prompt`:
  - Chat Completions: the `system`-role message content (the spec example turns `{"role":"system","content":"You are a helpful assistant."}` into `system_prompt`).
  - Messages: the top-level `system` field.
  - Responses: the `instructions` field.
- Schema-required fields still apply even though they're discarded: `ChatRequest` requires `messages`; `MessagesRequest` requires `model` and `messages`. Send a placeholder message if you only want to store config.
- Response `200 { data: PresetWithDesignatedVersion }` (note: `200`, not `201`, for both create and new version). Errors `400`, `401`, `403`, `404`, `409`, `500`.

```bash
curl https://openrouter.ai/api/v1/presets/email-copywriter/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "temperature": 0.7,
    "provider": { "sort": "price" },
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Write a marketing email." }
    ]
  }'
```

Response:

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

(The spec's full response also includes `description`, `status_updated_at`, `workspace_id`, `creator_user_id`, and `designated_version.preset_id` / `creator_id`.)

```typescript
await openRouter.presets.createPresetsMessages({
  slug: "code-reviewer",
  messagesRequest: {
    model: "anthropic/claude-4.6-sonnet",
    maxTokens: 1024,
    system: "You are a senior code reviewer.",      // → system_prompt
    messages: [{ role: "user", content: "Review this PR." }], // ignored
  },
});

await openRouter.presets.createPresetsResponses({
  slug: "inbound-classifier",
  responsesRequest: {
    model: "openai/gpt-4o",
    instructions: "Classify the inbound message.",   // → system_prompt
    input: "Hello, I need a refund.",                // ignored
  },
});
```

#### Using a preset at inference time

Three equivalent ways (any of the [§5](05-endpoints-core-inference.md#5-endpoint-reference--core-text-inference) inference endpoints; examples use Responses):

```jsonc
{ "model": "@preset/email-copywriter", "input": "Write a marketing email about our new feature" }
{ "model": "openai/gpt-4", "preset": "@preset/email-copywriter", "input": "…" }   // preset field
{ "model": "openai/gpt-4@preset/email-copywriter", "input": "…" }                  // combined
```

- The `preset` field takes the full `@preset/{slug}` reference; **a bare slug without `@preset/` is ignored**. (The `preset` field is documented in the presets guide but does not appear in the OpenAPI request schemas.)
- Request parameters **shallow-merge over** the preset: request-level fields override matching preset fields; preset fields absent from the request are kept.
- Preset `tools` are **unioned** with request `tools`; a request tool overrides the preset's tool of the same identity — `openrouter:advisor`/`openrouter:subagent` keyed by type + `parameters.name`, function tools by function name, other server tools (e.g. `openrouter:web_search`) are singletons keyed by type. Preset tools keep their order; request-only tools are appended.
- The guide states "when addressing a preset through the API, the latest version is always used", while the API exposes a `designated_version_id`; creating a version via these routes designates it, so the two coincide for API-created versions.

Suggested workflow: iterate on a request against `/chat/completions` (or `/messages`, `/responses`), `POST` the same body to the matching `/presets/{slug}/…` route, then switch production code to `@preset/{slug}`.

Sources: https://openrouter.ai/docs/api/api-reference/presets/list-presets, https://openrouter.ai/docs/api/api-reference/presets/get-a-preset, https://openrouter.ai/docs/api/api-reference/presets/list-versions-of-a-preset, https://openrouter.ai/docs/api/api-reference/presets/get-a-specific-version-of-a-preset, https://openrouter.ai/docs/api/api-reference/presets/create-a-preset-from-a-chat-completions-request-body, https://openrouter.ai/docs/api/api-reference/presets/create-a-preset-from-a-messages-request-body, https://openrouter.ai/docs/api/api-reference/presets/create-a-preset-from-a-responses-request-body, https://openrouter.ai/docs/guides/features/presets, https://openrouter.ai/docs/client-sdks/typescript/sdks/presets/README

### 8.6 Private endpoints

A **private endpoint** routes an existing catalog model to your own dedicated or fine-tuned deployment of it. It is added to that model's provider list (no new model slug), visible and routable only for your organization, preferred for callers with access, and hidden from public lists, rankings and benchmarks. Requests to it are authenticated with **your own BYOK provider key**, so each workspace that calls it needs a BYOK key for that provider ([§7](07-endpoints-platform.md#7-endpoint-reference--account--platform-data) BYOK, [§10](10-features-auth-cost-privacy.md#10-features-ii--auth-cost--privacy)). Routing behaviour: [§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities).

Requirements: Enterprise Plan **Private Endpoints add-on** (the "private endpoints entitlement"); **organization** Management key (personal-account keys rejected); the hosting provider must be supported for BYOK; the deployment must serve a model already in the catalog with the same request/response shape and behavior. **Limit: 10 private endpoints per organization by default, drafts included** (check reason `endpoint_limit_reached`); ask your account rep to raise it.

#### Lifecycle

```text
POST /private-endpoints ──► draft ──POST /{id}/validate (passed)──► validated draft ──POST /{id}/activate──► active
   (or create with "activate": {...} to do all three)                                                     │  ▲
                                                                              POST /{id}/disable ◄────────┘  │
                                                                              disabled ──POST /{id}/enable───┘
DELETE /{id} at any state (draft_only=true refuses once activated)
```

- `draft`: not routable, hidden from workspaces. `active`: routable. `disabled`: activated but temporarily not routable.
- Any change to the upstream (`upstream_model_id`, `base_url`) or data-policy declarations of a **draft** clears earlier validation (activate then returns `409` "validation stale").
- On an **active** endpoint, `upstream_model_id` and `base_url` are immutable (`409 already_active`); delete and re-create instead. Pricing, declared parameters, settings, `declared_zdr` and `declared_region` can still change.

#### Objects

**`PrivateEndpointSummary`** (list items) — all required: `id` (uuid), `status` (`draft` \| `active` \| `disabled`), `model_permaslug` (string), `model_slug` (string \| null — null when the model is no longer listed), `model_name` (string \| null), `provider_name` (string), `created_at` (ISO).

**`ManagedPrivateEndpoint`** (create/activate/disable/enable responses) = Summary + `declared_zdr` (boolean \| null, required; null = undeclared), `declared_region` (`global` \| `europe` \| `us` \| null, required; `global` = not regional, null = undeclared), `max_completion_tokens` (integer \| null; null = no cap beyond the model context length). Does **not** echo `declared_parameters`/`tested_parameters` — read them with `GET /private-endpoints/{id}`.

**`PrivateEndpoint`** (get/update responses) — required unless noted:

| Field | Type | Description |
| - | - | - |
| `id` | uuid | Stable ID |
| `status` | `draft`\|`active`\|`disabled` | Lifecycle state |
| `model_permaslug` | string | Permanent slug of the served model |
| `model_slug`, `model_name` | string \| null | Public slug / display name (null if no longer listed) |
| `provider_slug` | string \| null | Upstream provider slug (null if no longer listed) |
| `provider_name` | string | Provider display name |
| `base_url` | string \| null | HTTPS base URL; `null` for providers whose URL derives from the BYOK credential (Azure, Amazon Bedrock, Google Vertex) |
| `upstream_model_id` | string | Model/deployment ID sent upstream |
| `declared_zdr` | boolean \| null | ZDR attestation |
| `declared_region` | `global`\|`europe`\|`us`\|null | Data-processing region attestation |
| `pricing` | `PrivateEndpointPricing` | Reported per-token rates |
| `tested_parameters` | string[] | Read-only: parameters a validation run proved the upstream honors (`tools`, `tool_choice`, `response_format`, `structured_outputs`, `stop`); cleared when the upstream config changes |
| `declared_parameters` | string[] | Parameters you declared; requests using a parameter only route here when it is tested or declared |
| `settings` | `PrivateEndpointSettings` | Capabilities/limits routing uses |
| `max_completion_tokens` | integer \| null | (optional) Effective completion cap |

**`PrivateEndpointPricing`** — decimal strings matching `^\d+(\.\d+)?$`, USD **per token**:

| Field | Req | Description |
| - | - | - |
| `prompt` | ✓ | Per prompt token |
| `completion` | ✓ | Per completion token |
| `cache_read` | | Per cache-read prompt token. If omitted, inherited from the public endpoint of the same model+provider (scaled by its cache-read:prompt ratio), or the pricing-strategy default if it publishes none. Required when there's no such public endpoint and the provider bills cache reads |
| `cache_write` | | Same rules for cache writes |

**`PrivateEndpointSettings`** (all keys required in responses; in requests all optional and only named fields change). A new endpoint copies these from the public endpoint for the same model+provider, or from the model. Rate limits are not part of it (billed to your own upstream key).

| Field | Type | Description |
| - | - | - |
| `context_length` | integer ≥1 \| null | Longest prompt+completion; `null` keeps the model default |
| `max_prompt_tokens` | integer ≥1 \| null | Longest prompt; `null` = no cap below context length. Cannot exceed `context_length` (or the model context length when that is null) |
| `max_completion_tokens` | integer ≥1 \| null | Longest completion; `null` keeps model default |
| `quantization` | `int4`, `int8`, `fp4`, `mxfp4`, `nvfp4`, `fp6`, `fp8`, `mxfp8`, `fp16`, `bf16`, `fp32`, `unknown` | Weight precision (`unknown` when not stated) |
| `completions` | `{ chat: boolean\|null, text: boolean\|null }` | Serves `/chat/completions` / `/completions`; `null` = provider default. Turning both off → `400 settings_invalid` |
| `inputs` | `{ image_urls, base64_images, file_urls, base64_files, audio }` each boolean \| null | Accepted input kinds; `null` keeps provider default |
| `reasoning` | `{ supported: boolean, return_mechanism: "reasoning"\|"reasoning-content"\|"content-string"\|"none"\|null }` | Whether requests with `reasoning` route here; where reasoning appears in the upstream response (`reasoning`/`reasoning-content` = response fields, `content-string` = inline in the message, `none` = no reasoning, `null` = provider default) |
| `tool_choice` | `{ none, auto, required, function }` booleans | Which `tool_choice` forms are accepted |
| `excluded_parameters` | enum[] | Parameters the upstream rejects even though the model supports them; requests using one don't route here. **Cannot name a tested parameter** (`400 settings_invalid`). Enum: `temperature`, `top_p`, `top_k`, `min_p`, `top_a`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `max_tokens`, `max_completion_tokens`, `logit_bias`, `logprobs`, `top_logprobs`, `prediction`, `seed`, `response_format`, `structured_outputs`, `stop`, `tools`, `tool_choice`, `parallel_tool_calls`, `include_reasoning`, `reasoning`, `reasoning_effort`, `web_search_options`, `verbosity` |

**`PrivateEndpointDeclaredParameter`** enum (for `declared_parameters`, max 25 entries): `temperature`, `top_p`, `top_k`, `min_p`, `top_a`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `max_tokens`, `max_completion_tokens`, `logit_bias`, `logprobs`, `top_logprobs`, `prediction`, `seed`, `response_format`, `structured_outputs`, `stop`, `tools`, `tool_choice`, `parallel_tool_calls`, `reasoning`, `reasoning_effort`, `web_search_options`, `verbosity`. Order and repeats are ignored (but repeats count toward the cap). **`tool_choice` requires `tools` to be tested or declared** (`400 parameters_invalid`).

**`PrivateEndpointValidation`**: `passed` (boolean, all checks passed), `checks` (array of `PrivateEndpointCheck`), `parameters` (optional array of `{ parameter: string, supported: boolean }` — parameters probed after checks passed; supported ones are recorded in `tested_parameters`; absent on a failed run and for providers that run no probes; empty when every probe group was already proven).

`PrivateEndpointCheck`: `name` (string, e.g. `auth_ok`), `passed` (boolean), `reason` (on failure, enum below), `upstream_status` (int 400–599, when the call failed), `upstream_message` (string \| null), `actual_model` (**deprecated**, never returned — validation no longer compares the model the upstream reports).

`PrivateEndpointCheckReason`: `database_error`, `endpoint_limit_reached`, `invalid_base_url`, `model_not_found`, `provider_not_found`, `endpoint_not_found`, `workspace_not_found`, `no_byok_key`, `key_decryption_failed`, `upstream_error`, `invalid_response`, `invalid_stream`, `missing_usage`, `model_mismatch`, `not_validated`, `validation_stale`.

> Doc discrepancy: the guide says the Test step confirms "the served model ID matches what you entered"; the spec says validation no longer compares the reported model (`actual_model` deprecated). `model_mismatch` remains in the reason enum.

#### Endpoint operations

| Method & path | operationId | TS method | Success |
| - | - | - | - |
| `GET /private-endpoints` | `listPrivateEndpoints` | `privateEndpoints.list()` | `200 { data: PrivateEndpointSummary[] }` (includes drafts; not paginated) |
| `POST /private-endpoints` | `createPrivateEndpoint` | `privateEndpoints.create({ createPrivateEndpointRequest })` | `201 { data: ManagedPrivateEndpoint }` (draft, or active when `activate` passed) |
| `GET /private-endpoints/{id}` | `getPrivateEndpoint` | `privateEndpoints.get({ id })` | `200 { data: PrivateEndpoint }` (upstream config + current pricing) |
| `PATCH /private-endpoints/{id}` | `updatePrivateEndpoint` | `privateEndpoints.update({ id, updatePrivateEndpointRequest })` | `200 { data: PrivateEndpoint }` (whole endpoint) |
| `POST /private-endpoints/{id}/validate` | `validatePrivateEndpoint` | `privateEndpoints.validate({ id, validatePrivateEndpointRequest })` | `200 { data: PrivateEndpointValidation }` — **failed checks also return 200 with `passed: false`** |
| `POST /private-endpoints/{id}/activate` | `activatePrivateEndpoint` | `privateEndpoints.activate({ id })` | `200 { data: ManagedPrivateEndpoint }` |
| `POST /private-endpoints/{id}/disable` | `disablePrivateEndpoint` | `privateEndpoints.disable({ id })` | `200 { data: ManagedPrivateEndpoint }` — stop routing without deleting |
| `POST /private-endpoints/{id}/enable` | `enablePrivateEndpoint` | `privateEndpoints.enable({ id })` | `200 { data: ManagedPrivateEndpoint }` — resume routing a disabled endpoint |
| `DELETE /private-endpoints/{id}` | `deletePrivateEndpoint` | `privateEndpoints.delete({ id, draftOnly? })` (HTTP query `draft_only`; the TS key name follows the SDK's camelCase convention but is not shown in the SDK docs) | `200 { data: { id } }` — deletes and stops routing |

Path `id` is a uuid everywhere. Status codes: list/get `401`, `403`, `404` (get), `408` (request timeout), `500`; write operations `400`, `401`, `403`, `404`, `408`, `409`, `422`, `500`, `502` (upstream failure).

##### `POST /private-endpoints` — create

Header `Idempotency-Key` (optional, 1–255 chars): a repeated create with the same key from the same organization returns the endpoint the first request created (as it is now). Reusing the key with a different body (model, provider, base URL, upstream model ID, declared ZDR or region, pricing, or declared parameters — declared parameters compared as a set) → `422 idempotency_key_reused`. `activate` and `settings` are not compared; later edits don't affect the comparison; `settings` is still validated before replay (invalid → `400 settings_invalid`).

Body `CreatePrivateEndpointRequest`:

| Field | Type | Req | Description |
| - | - | - | - |
| `model_permaslug` | string (min 1) | ✓ | Permanent slug of the catalog model served (e.g. `openai/gpt-4o-2024-08-06`) |
| `provider_slug` | string (min 1) | ✓ | Upstream provider slug: a catalog provider (`openai`, `azure`, …) or your private provider's slug ([§8.7](#87-private-providers)) |
| `upstream_model_id` | string (min 1) | ✓ | Model/deployment ID sent upstream |
| `base_url` | string (min 1) | | HTTPS base URL. Required unless the provider derives its URL from the BYOK credential (Azure, Amazon Bedrock, Google Vertex), or the private provider has a `base_url` |
| `pricing` | PrivateEndpointPricing | | Negotiated rates reported for cost |
| `declared_zdr` | boolean \| null | | Attest no prompt/completion retention |
| `declared_region` | `global`\|`europe`\|`us`\|null | | Attest processing region (enables in-region routing when no region can be derived from `base_url`) |
| `declared_parameters` | DeclaredParameter[] (≤25) | | Parameters supported beyond tested ones |
| `settings` | settings (partial) | | Overrides over the copied settings; omitted fields keep copied values |
| `activate` | `{ workspace_id: uuid }` | | Validate **and** activate in the same call using that workspace's BYOK key |

Create errors when `activate` was passed and the draft was created: `404`, `409`, `422` (validation failed), `500`, `502` return **`CreatePrivateEndpointValidationFailedResponse`**: `{ error: { code, message }, data: { endpoint: ManagedPrivateEndpoint, validation: PrivateEndpointValidation | null } }`. The draft is kept — fix it with `PATCH` and call `/validate` + `/activate` instead of creating again. Other create errors: `400 parameters_invalid` (`tool_choice` declared without `tools`), `404` (model, provider, or validation workspace not found).

```bash
curl https://openrouter.ai/api/v1/private-endpoints \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: gpt-4o-prod" \
  -d '{
    "model_permaslug": "openai/gpt-4o-2024-08-06",
    "provider_slug": "openai",
    "base_url": "https://api.openai.com/v1",
    "upstream_model_id": "gpt-4o-2024-08-06",
    "pricing": { "prompt": "0.0000025", "completion": "0.00001" },
    "activate": { "workspace_id": "<workspace-id>" }
  }'
```

```typescript
const { data: ep } = await admin.privateEndpoints.create({
  createPrivateEndpointRequest: {
    modelPermaslug: "openai/gpt-4o-2024-08-06",
    providerSlug: "azure",                // base_url derived from the Azure BYOK credential
    upstreamModelId: "gpt-4o-prod",
    declaredZdr: true,
    declaredRegion: "us",
    pricing: { prompt: "0.0000025", completion: "0.00001" },
  },
});
const { data: v } = await admin.privateEndpoints.validate({
  id: ep.id,
  validatePrivateEndpointRequest: { workspaceId },
});
if (v.passed) await admin.privateEndpoints.activate({ id: ep.id });
else console.error(v.checks.filter((c) => !c.passed)); // e.g. reason "no_byok_key"
```

##### `PATCH /private-endpoints/{id}` — update

Body `UpdatePrivateEndpointRequest` (all optional; only present fields change; response is the whole endpoint): `base_url`, `upstream_model_id`, `pricing`, `declared_parameters`, `declared_zdr`, `declared_region`, `settings` — same types as create.

- `pricing` and `declared_parameters` **replace** their stored value (tested parameters stay).
- `settings` changes **only the fields it names**; `null` clears a limit or restores the provider default.
- Routing picks up pricing/parameters/settings for subsequent requests on drafts and active endpoints alike (the guide: once the private catalog republishes).
- `declared_zdr` / `declared_region` change on drafts and active endpoints; on an active endpoint the change keeps validation and tested parameters.
- `upstream_model_id` / `base_url` re-point a **draft**: omitted ones keep the stored value; omitted data-policy declarations are kept while the upstream is unchanged and **cleared when it changes**; any change to the upstream or declarations of a draft clears earlier validation.
- Naming `upstream_model_id` or `base_url` on an **active** endpoint → `409 already_active`, nothing written (even alongside other fields).
- All groups are validated before anything is written: `400 parameters_invalid` (`tool_choice` without `tools` tested or declared); `400 settings_invalid` (`max_prompt_tokens` exceeds the context length, both completion APIs off, or `excluded_parameters` names a tested parameter); `422 pricing_invalid` (rates the provider pricing strategy cannot represent).

```bash
curl -X PATCH https://openrouter.ai/api/v1/private-endpoints/$EP_ID \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "declared_parameters": ["seed"], "settings": { "context_length": 128000 } }'
```

##### `POST /private-endpoints/{id}/validate`

Body `{ workspace_id: uuid }` (required) — the workspace whose BYOK credential for the endpoint's provider is used for a **live test request**; must belong to your account. A passing validation is required before activation.

##### `POST /private-endpoints/{id}/activate`

No body. `409` when the endpoint was never validated, the validation is stale, or it is already active.

##### `DELETE /private-endpoints/{id}`

Query `draft_only` (`"true"` \| `"false"`): when `true`, delete only if still a draft — `409` if it has ever been activated.

Terraform: resource `openrouter_private_endpoint` wraps the same API (`apply` creates, validates, activates; changing `pricing` updates in place; changing model, provider, base URL, upstream model ID, declarations or `activate` workspace replaces; `destroy` disables then deletes; `terraform import openrouter_private_endpoint.<name> <endpoint-id>` adopts).

Sources: https://openrouter.ai/docs/api/api-reference/private-endpoints/list-private-endpoints, https://openrouter.ai/docs/api/api-reference/private-endpoints/create-a-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/get-a-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/update-a-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/validate-a-draft-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/activate-a-validated-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/disable-a-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/enable-a-private-endpoint, https://openrouter.ai/docs/api/api-reference/private-endpoints/delete-a-private-endpoint, https://openrouter.ai/docs/guides/routing/private-endpoints, https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/client-sdks/typescript/sdks/privateendpoints/README

### 8.7 Private providers

A **private provider** is a bring-your-own-key provider visible only to your organization, used as `provider_slug` for private endpoints whose deployment you host yourself (or that has no public provider). Its slug also works wherever a provider slug is accepted: BYOK keys, and `provider.order` / `only` / `ignore` on requests ([§9](09-features-routing-capabilities.md#9-features-i--models-routing--capabilities)). Included with Private Endpoints (same entitlement and organization Management key). **Limit: 5 private providers per organization.**

Data policy: OpenRouter records a newly created private provider as retaining no prompts, training on none, and publishing none (so its endpoints stay eligible under every data-policy setting and guardrail) — OpenRouter does not verify the upstream's actual handling. This policy is fixed and not editable via the API (older providers keep their original policy; ask support to change it). An explicit OpenRouter override on an endpoint always wins, and video endpoints are classified as retaining.

**`PrivateProvider`** (all required):

| Field | Type | Description |
| - | - | - |
| `name` | string | Shown in your activity, logs and Broadcast output; immutable |
| `slug` | string | Unique within your account; immutable; use as `provider_slug` |
| `display_name` | string | UI name |
| `base_url` | string \| null | HTTPS base URL of an OpenAI-compatible API used by endpoints under this provider that set no URL of their own; without it each endpoint must set its own |
| `created_at` | string | Timestamp |

| Method & path | operationId | TS method | Body | Success |
| - | - | - | - | - |
| `GET /private-providers` | `listPrivateProviders` | `privateProviders.list()` | — | `200 { data: PrivateProvider[] }` |
| `POST /private-providers` | `createPrivateProvider` | `privateProviders.create({ createPrivateProviderRequest })` | see below | `201 { data: PrivateProvider }` |
| `GET /private-providers/{slug}` | `getPrivateProvider` | `privateProviders.get({ slug })` | — | `200 { data: PrivateProvider }` |
| `PATCH /private-providers/{slug}` | `updatePrivateProvider` | `privateProviders.update({ slug, updatePrivateProviderRequest })` | `display_name` (1–80), `base_url` (min 1) | `200 { data: PrivateProvider }` |
| `DELETE /private-providers/{slug}` | `deletePrivateProvider` | `privateProviders.delete({ slug })` | — | `200 { data: { slug } }` |

Create body `CreatePrivateProviderRequest`:

| Field | Type | Req | Description |
| - | - | - | - |
| `name` | string, 2–64, `^[A-Za-z0-9][A-Za-z0-9 ._-]*$` | ✓ | Letters, numbers, spaces, dots, underscores, hyphens. Cannot be changed later. Neither the name nor its slug may match a public provider name/slug (case-insensitive); other customers may reuse the same name |
| `slug` | string, 2–64, `^[a-z0-9]+(?:-[a-z0-9]+)*$` | | Lowercase alphanumerics separated by single hyphens; immutable. Defaults to the name lowercased with each run of other characters replaced by `-` (`Acme Inference` → `acme-inference`) |
| `display_name` | string, 1–80 | | Defaults to `name` |
| `base_url` | string (min 1) | | HTTPS base URL of an OpenAI-compatible API. Private, internal, metadata and OpenRouter hosts are rejected |

Rules: `PATCH` can change only `display_name` and `base_url`; a body with no editable field → `400`. A new `base_url` applies only to endpoints created afterwards. `DELETE` refuses with `409 provider_has_endpoints` while any private endpoint still runs under the provider — delete those first. Write status codes: `400`, `401`, `403`, `404`, `408`, `409`, `422`, `429`, `500`, `502`; list/get: `401`, `403`, `404` (get), `500`.

```bash
curl https://openrouter.ai/api/v1/private-providers \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme", "slug": "acme", "display_name": "Acme", "base_url": "https://inference.example.com/v1" }'
# then create endpoints with "provider_slug": "acme"
```

Sources: https://openrouter.ai/docs/api/api-reference/private-providers/list-private-providers, https://openrouter.ai/docs/api/api-reference/private-providers/create-a-private-provider, https://openrouter.ai/docs/api/api-reference/private-providers/get-a-private-provider, https://openrouter.ai/docs/api/api-reference/private-providers/update-a-private-provider, https://openrouter.ai/docs/api/api-reference/private-providers/delete-a-private-provider, https://openrouter.ai/docs/guides/routing/private-endpoints, https://openrouter.ai/docs/client-sdks/typescript/sdks/privateproviders/README

### 8.8 SCIM group mappings, groups and sync jobs (management API)

> These are **management endpoints authenticated with a Management key**, used to map identity-provider groups to OpenRouter workspaces. They are **not** the SCIM 2.0 connector endpoints your IdP talks to. The IdP connector uses the SCIM endpoint URL and bearer API key shown when you enable provisioning under Settings > Members > SCIM Mappings (setup, Okta/Entra configuration, key rotation, audit log: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations) SCIM mappings / SSO).

Prerequisites: Enterprise plan, organization admin, an active SSO connection, and SCIM provisioning enabled with the IdP pushing groups. Groups appear once the IdP pushes them.

Membership semantics: members of a mapped group are granted the mapping's role in the mapped workspace; removed from the group → access granted by that mapping is removed; multiple mapped groups to one workspace → highest role wins (`admin` > `member`); IdP deactivation/deletion deactivates org membership and the API keys the user created. A group can map to any number of workspaces, one mapping per group–workspace pair. Mappings coexist with manually managed members (manual members are unaffected).

**Objects**

- `ScimGroup`: `id` (uuid), `organization_id`, `display_name`, `external_id` (string \| null — e.g. the IdP group object ID such as an Entra ID group ID), `created_at`, `updated_at` — all required.
- `ScimGroupMapping`: `id` (uuid), `organization_id`, `scim_group_id` (uuid), `workspace_id` (uuid), `role` (`admin` \| `member`), `created_at`, `updated_at` — all required.
- `ScimSyncJob`: `id` (uuid), `status` (`queued` \| `running` \| `succeeded` \| `failed`), `created_at`, `started_at` (\| null), `finished_at` (\| null), `synced_groups` (int \| null; set when succeeded), `deleted_groups` (int \| null; set when succeeded), `error_message` (string \| null; stable message when failed) — all required.

| Method & path | operationId | TS method | Params / body | Success |
| - | - | - | - | - |
| `GET /scim/groups` | `listScimGroups` | `scim.listGroups()` | `offset` (0), `limit` (1–100, 50), `display_name` (exact match), `external_id` (exact match) — empty/omitted = unfiltered; both present → both must match | `200 { data: ScimGroup[], total_count }` |
| `GET /scim/group-mappings` | `listScimGroupMappings` | `scim.listMappings()` | `offset`, `limit` | `200 { data: ScimGroupMapping[], total_count }` |
| `POST /scim/group-mappings` | `createScimGroupMapping` | `scim.create({ createScimGroupMappingRequest })` | body `{ scim_group_id: uuid, workspace_id: uuid, role: "admin"\|"member" }` (all required) | `201 { data: ScimGroupMapping }` |
| `GET /scim/group-mappings/{id}` | `getScimGroupMapping` | `scim.read({ id })` | path `id` (uuid) | `200 { data: ScimGroupMapping }` |
| `PATCH /scim/group-mappings/{id}` | `updateScimGroupMapping` | `scim.update({ id, updateScimGroupMappingRequest })` | body `{ role: "admin"\|"member" }` (required) | `200 { data: ScimGroupMapping }` |
| `DELETE /scim/group-mappings/{id}` | `deleteScimGroupMapping` | `scim.delete({ id, keepMembers })` | query **`keep_members` (required)**: `"true"` \| `"false"` \| boolean | `200 { deleted: true }` |
| `POST /scim/sync-jobs` | `createScimSyncJob` | `scim.createSyncJob()` | no body | **`202`** `{ data: ScimSyncJob }` (queued) |
| `GET /scim/sync-jobs/{id}` | `getScimSyncJob` | `scim.getSyncJob({ id })` | path `id` (uuid) | `200 { data: ScimSyncJob }` |

Status codes: lists/get/sync `401`, `403`, `404`, `500`; create/update/delete also `400`; create also `409`.

Behaviors:

- **Create is idempotent for the same role:** creating a mapping that already exists with the same role succeeds and **re-applies** the mapping to the group's members. Requesting a **different** role for an existing mapping → `409` (use `PATCH`).
- **Update role:** existing members provisioned by the mapping move to their new effective role (highest role across mappings still wins).
- **Delete requires `keep_members`, deliberately with no default** (omitting it → `400`): `false` **removes** the members this mapping granted access to; `true` deletes the mapping and keeps those members as manually managed (current role). Members who also get access from another mapped group keep it either way.
- **Sync jobs:** `POST /scim/sync-jobs` queues a directory sync and returns `202`; poll `GET /scim/sync-jobs/{id}` until `status` is `succeeded` or `failed`. The job reports group counts (`synced_groups`, `deleted_groups`), so it is the programmatic counterpart of pulling the latest groups (the dashboard's "Refresh from IdP"); the spec itself only says "Start a SCIM directory sync".
- SCIM-managed workspace members can't be removed with `POST /workspaces/{id}/members/remove` ([§8.10](#810-workspaces-members-and-workspace-budgets)); change them in the IdP.

```bash
# Find the OpenRouter group for an Entra ID group, then map it
curl "https://openrouter.ai/api/v1/scim/groups?external_id=$ENTRA_GROUP_OBJECT_ID" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"

curl -X POST https://openrouter.ai/api/v1/scim/group-mappings \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "scim_group_id": "550e8400-e29b-41d4-a716-446655440000", "workspace_id": "660e8400-e29b-41d4-a716-446655440000", "role": "member" }'

curl -X DELETE "https://openrouter.ai/api/v1/scim/group-mappings/$MAPPING_ID?keep_members=true" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
```

```typescript
const { data: job } = await admin.scim.createSyncJob();
let status = job.status;
while (status === "queued" || status === "running") {
  await new Promise((r) => setTimeout(r, 2000));
  status = (await admin.scim.getSyncJob({ id: job.id })).data.status;
}
```

Sources: https://openrouter.ai/docs/api/api-reference/scim/list-scim-groups, https://openrouter.ai/docs/api/api-reference/scim/list-scim-group-mappings, https://openrouter.ai/docs/api/api-reference/scim/create-a-scim-group-mapping, https://openrouter.ai/docs/api/api-reference/scim/get-a-scim-group-mapping, https://openrouter.ai/docs/api/api-reference/scim/update-a-scim-group-mapping, https://openrouter.ai/docs/api/api-reference/scim/delete-a-scim-group-mapping, https://openrouter.ai/docs/api/api-reference/scim/start-a-scim-directory-sync, https://openrouter.ai/docs/api/api-reference/scim/get-scim-directory-sync-status, https://openrouter.ai/docs/guides/features/scim-mappings, https://openrouter.ai/docs/client-sdks/typescript/sdks/scim/README

### 8.9 Vault (host-bound secrets for workspaces and interns)

The Vault stores **host-bound secrets** that are injected into outbound requests made by *interns* (agents run through OpenRouter's Intern API programme) — each secret is released only to the exact hostnames it is bound to. There are two storage scopes: the **workspace vault** and a per-**intern** vault (interns can also have an **attached** vault). **Responses carry metadata only — secret values are never returned.**

Scope and access rules (apply to every Vault route):

- Auth is a **regular API key** (security `apiKey`), not a management key. **Provisioning keys cannot call vault routes** (`401`).
- **The API key selects the scope:** workspace routes act on the key's **active workspace**; intern routes act on one intern inside that workspace. There is **no default workspace and no fallback** to another scope. A key with no usable workspace scope → `403` (`Vault scope is unavailable`).
- **Every vault route, including reads, requires access to the Intern API programme and returns `404` outside it.**
- A member key without an admin role sees only interns its member created or interns in workspaces they administer (others → `404`).
- **An intern's own API key is confined to that intern:** it can always read that intern's secrets and effective secrets, its writes "follow the rules above" (the spec's wording; no further rule is spelled out), and every other intern route and every workspace route answers `404`.
- **Regional hostnames are refused** (`eu.openrouter.ai` etc.): `403` "The Intern API does not support regional data residency yet. Please use the global endpoint at openrouter.ai."
- Writes return `503` (`Vault writes are not enabled`) while vault writes are disabled for the caller.

#### Secret names, host binding and values

- **Name** (path `{name}`): 1–255 chars, pattern `^(?!.*__)[a-z]([a-z0-9_]*[a-z0-9])?$` — lowercase letters, digits and single underscores; starts with a letter; doesn't end with `_`; no `__`. DELETE also accepts legacy names stored before the 255-character write bound.
- **`hosts`** (write, required): 1–100 **exact DNS hostnames**. Each entry is lowercased and a trailing dot removed (`API.Example.com.` → `api.example.com`); schemes, ports, paths, wildcards and empty values are rejected; duplicates after normalization collapse. **Matching is exact:** a secret bound to `api.example.com` is never released to `example.com` or any other host.
- **`value`** (write, required): 1–65,536 characters; a **header-set credential** (a JSON object of header name → value) may be up to 985,721 characters. Encrypted at rest, never returned. JSON body limit 1,309,643 bytes (`413`).
- **Legacy secrets:** lists include secrets stored from the dashboard or at provisioning before workspace-scoped storage. Where both exist under one name, the one stored through this API is listed. Legacy secrets **cannot be deleted or copied** through this API; storing the same name through the API replaces them. Legacy rows written before host binding was required have `hosts: null` and `fingerprint: null`; storing the secret again assigns hosts.
- **Fingerprints:** `fingerprint` = `sha256:<64 hex>` HMAC-SHA-256 of the value keyed with **that vault's own data key** — comparable only within one vault (equal fingerprints in one vault ⇒ equal values; rewriting the same value keeps its fingerprint). The same value in two vaults (e.g. a workspace secret and its intern copy) has **different** fingerprints, so fingerprints can't prove a copy matches or a rotation propagated.
- **Connection-owned secrets** (e.g. created by an MCP or GitHub connection) can only be replaced or removed by reconnecting/disconnecting that connection (`409` on store/delete).

#### Objects

- **`VaultSecret`**: `name` (string), `hosts` (string[] 1–100, each ≤254 \| null), `fingerprint` (string \| null), `created_at` (date-time) — all required.
- **`VaultEffectiveSecret`**: `VaultSecret` fields + `scope` (`intern` \| `attached` \| `workspace` — which vault the delivered secret comes from). The intern receives it only on requests to a hostname in `hosts`, **or on any request when `hosts` is `null`**; a request to any other hostname receives no secret under this name, even when another vault holds one.
- **Write body `VaultSecretWriteRequest`**: `{ hosts: string[], value: string }` (both required).
- **Copy body `VaultSecretCopyRequest`**: `{ names: string[] }` — 1–100 unique names, required.

#### Operations

| Method & path | operationId | TS method | Success |
| - | - | - | - |
| `GET /vault/secrets` | `listVaultSecrets` | `vault.listVaultSecrets({ limit?, offset? })` | `200 { data: VaultSecret[] (≤100), has_more }` |
| `PUT /vault/secrets/{name}` | `storeVaultSecret` | `vault.storeVaultSecret({ name, vaultSecretWriteRequest })` | `200 { data: VaultSecret }` |
| `DELETE /vault/secrets/{name}` | `deleteVaultSecret` | `vault.deleteVaultSecret({ name })` | **`204`**, no body |
| `GET /vault/interns/{internId}/secrets` | `listInternVaultSecrets` | `vault.listInternVaultSecrets({ internId, limit?, offset? })` | `200 { data: VaultSecret[], has_more }` |
| `PUT /vault/interns/{internId}/secrets/{name}` | `storeInternVaultSecret` | `vault.storeInternVaultSecret({ internId, name, vaultSecretWriteRequest })` | `200 { data: VaultSecret }` |
| `DELETE /vault/interns/{internId}/secrets/{name}` | `deleteInternVaultSecret` | `vault.deleteInternVaultSecret({ internId, name })` | **`204`**, no body |
| `POST /vault/interns/{internId}/secrets/copy` | `copyVaultSecretsToIntern` | `vault.copyVaultSecretsToIntern({ internId, vaultSecretCopyRequest })` | `200 { data: VaultSecret[] }` |
| `GET /vault/interns/{internId}/effective-secrets` | `listInternEffectiveVaultSecrets` | `vault.listInternEffectiveVaultSecrets({ internId, limit?, offset? })` | `200 { data: VaultEffectiveSecret[], has_more }` |
| `GET /vault/interns/{internId}/connections` | `listInternConnections` | `vault.listInternConnections({ internId })` | `200 { data: [{ key }], routing, routing_text }` |

Common parameters: `internId` (path, uuid — an intern in the workspace selected by the key); list paging `limit` (1–100, default 100), `offset` (0–10000, default 0); results ordered by name; when `has_more` is `true`, request the next page with `offset` increased by the number of returned entries.

Per-operation semantics:

- **Store (workspace / intern):** creates or replaces; value encrypted at rest and released only to the exact `hosts`. Intern store also returns `409` while the intern is being transferred to another workspace and its vault hasn't moved yet.
- **Delete:** `204` on success; `404` when the secret does not exist **in the selected scope**; `409` when it belongs to a connection.
- **Copy (workspace → intern):** copies the named workspace secrets into the intern's scope, **replacing** any intern secret with the same name; each copy keeps the source value and host bindings. **All-or-nothing:** every name must exist in the workspace scope (`404`, nothing copied); a workspace secret with `hosts: null` can't be copied (`409`, nothing copied, until it is stored again with hosts); `409` also when the intern already holds a same-name secret owned by a connection, or the intern is being transferred.
- **Effective secrets:** one entry per name — what the intern's outbound requests actually receive — merged from the intern's own vault, an attached vault, and the workspace vault (including pre-workspace-scoped secrets). **Precedence: intern > attached > workspace.** The same resolution decides outbound injection, so this list and the intern's requests agree. Returns `404` when the intern's attached vault is no longer available (the intern then receives no secrets).
- **Connections:** lists connections in scope for the intern by the key of their card on the dashboard's Connections tab: `github`, `slack`, `google`, a catalog MCP server (e.g. `linear`, `notion`), or `mcp:<host>` for a custom MCP server. A connection is listed when stored, enabled, and not turned off or hidden for this intern (whether its last test passed doesn't matter). `ori features add` checks a feature's `ori.requires.connections` against this list. Never returns credentials. `404` for an intern the key can't see.
  - `routing` (`VaultRoutingTable` \| null): the vault's routing table — the credentials it holds and what it would inject each for, from the same lookups the egress proxy uses (GitHub repository coverage read through the installation token and cached). **Only for the intern's own key**; `null` for any other caller or when the vault couldn't build it in time (the `data` keys still list). Top-level keys (all required): `agent_id`, `read_at` (date-time), `secrets` (`{ name, hosts, scope, created_at }[]`), `host_rules` (built-in hosts the vault injects a named secret for: `{ host, secret_name, holds_secret }`), `custom_origins` (`{ host, path_prefix, status: { state: usable|no_credential|failing, failure } }[]`), `mcp_origins` (`{ host, account_key, is_personal, routes: [{ host, path_prefix }], status }[]`; `status` null for members' own accounts, decided per acting member), `github` (`apps[]` with `app_id`, `app_slug`, `scope` (`workspace`\|`intern`), `installations[]` (`account`, `account_type`, `coverage` {`checked_at`, `repository_count`, `selection`: all\|selected}, `credential_id`, `holds_token`, `is_enabled`, `is_off_for_intern`, `shadowed_by`: installation\|token\|null), `member_links[]` (`login`, `holds_token`, `via`: app_link\|token\|any_link); `tokens[]` with `login`, `owner`, `repository_count`, `holds_token`, `scope`), `google` (`accounts[]`: `email`, `holds_grant`, `is_delegated_to_intern`, `delegated_capabilities`, `scope`), `slack` (`member_links[]`: `slack_user_id`, `holds_token`).
  - `routing_text` (string \| null): the routing table as the plain lines the intern reads in its instructions' Connections section (or a notice that it couldn't be read); `null` for callers other than the intern.

Error catalog (all vault routes; message strings from the spec's named examples):

| Status | Meaning / example message |
| - | - |
| `400` | Name, path, query or JSON body failed validation (`Invalid vault request`) |
| `401` | Missing/unknown API key; provisioning keys (`Invalid or missing API key`) |
| `403` | No usable workspace scope (`Vault scope is unavailable`) or regional hostname |
| `404` | Intern not in scope/not visible, secret not in the selected scope, attached vault gone (effective-secrets), or caller outside the Intern programme (`Not found`) |
| `408` | Route deadline passed (`Vault request timed out`) or request body stopped arriving (`Request body timed out`) |
| `409` | Connection-owned secret; copy conflicts; intern transfer in progress (`Vault request conflicts with existing secrets`) |
| `413` | JSON body > 1,309,643 bytes (`Request body too large`) — store/copy |
| `429` | Vault rate limit (`Too many vault requests`) |
| `500` | Scope lookup failed |
| `502` | Vault unreachable or unexpected response (`Vault request failed`, `Invalid vault response`) |
| `503` | Vault writes disabled for caller (`Vault writes are not enabled`) or vault not configured (`Vault service is unavailable`) |
| `504` | Vault did not answer in time (`Vault request timed out`) |

```bash
# Store a workspace secret bound to one host (key's active workspace)
curl -X PUT https://openrouter.ai/api/v1/vault/secrets/github_token \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "hosts": ["api.github.com"], "value": "'"$GITHUB_TOKEN"'" }'
# → {"data":{"name":"github_token","hosts":["api.github.com"],"fingerprint":"sha256:9f86…","created_at":"2026-09-15T17:44:00.000Z"}}

# Copy it into one intern's vault
curl -X POST https://openrouter.ai/api/v1/vault/interns/$INTERN_ID/secrets/copy \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "names": ["github_token"] }'
```

```typescript
await openRouter.vault.storeInternVaultSecret({
  internId,
  name: "linear_api_key",
  vaultSecretWriteRequest: { hosts: ["api.linear.app"], value: process.env.LINEAR_API_KEY ?? "" },
});

// Page through what the intern will actually receive
let offset = 0;
for (;;) {
  const page = await openRouter.vault.listInternEffectiveVaultSecrets({ internId, limit: 100, offset });
  for (const s of page.data) console.log(s.name, s.scope, s.hosts ?? "ANY HOST (legacy)");
  if (!page.hasMore) break; // `has_more` in the HTTP response; camelCase TS name inferred, verify against your SDK version
  offset += page.data.length;
}

await openRouter.vault.deleteVaultSecret({ name: "old_token" }); // resolves with no body (204)
```

Sources: https://openrouter.ai/docs/api/api-reference/vault/list-workspace-secrets, https://openrouter.ai/docs/api/api-reference/vault/store-a-workspace-secret, https://openrouter.ai/docs/api/api-reference/vault/delete-a-workspace-secret, https://openrouter.ai/docs/api/api-reference/vault/list-intern-secrets, https://openrouter.ai/docs/api/api-reference/vault/store-an-intern-secret, https://openrouter.ai/docs/api/api-reference/vault/delete-an-intern-secret, https://openrouter.ai/docs/api/api-reference/vault/copy-workspace-secrets-to-an-intern, https://openrouter.ai/docs/api/api-reference/vault/list-the-secrets-an-intern-receives, https://openrouter.ai/docs/api/api-reference/vault/list-the-connections-an-intern-can-use, https://openrouter.ai/docs/client-sdks/typescript/sdks/vault/README

### 8.10 Workspaces, members and workspace budgets

Workspaces separate API keys, guardrails/policies, BYOK keys, routing defaults, presets, plugins, observability and members into environments under one account (concepts: [§11](11-features-ops-integrations.md#11-features-iii--operations-governance--integrations)). All routes require a Management key. `{id}` / `{workspace_ref}` accept the workspace **UUID or slug**.

#### Workspace object

| Field | Type | Req | Description |
| - | - | - | - |
| `id` | uuid | ✓ | Workspace ID |
| `name` | string | ✓ | Name |
| `slug` | string | ✓ | URL-friendly slug |
| `description` | string \| null | ✓ | Description |
| `created_by` | string \| null | ✓ | Creator user ID |
| `default_guardrail_id` | uuid | ✓ | Deterministic ID derived from the workspace ID; the default guardrail is materialized when its configuration is first written (`PATCH /guardrails/{id}`, [§8.2](#82-guardrails-v1--legacy-guardrail-objects)) |
| `default_text_model` | string \| null | ✓ | Default text model |
| `default_image_model` | string \| null | ✓ | Default image model |
| `default_provider_sort` | string \| null | ✓ | Default provider sort (`price`, `throughput`, `latency`, `exacto`) |
| `disabled_server_tools` | string[] \| null | | OpenRouter server tools requests in this workspace may not invoke; `null` = none disabled |
| `io_logging_api_key_ids` | array \| null | ✓ | API key **IDs** to filter I/O logging; `null` = all keys logged |
| `io_logging_sampling_rate` | number (double) | ✓ | I/O logging sampling rate, 0.0001–1 |
| `is_data_discount_logging_enabled` | boolean | ✓ | Data discount logging enabled |
| `is_observability_broadcast_enabled` | boolean | ✓ | Broadcast enabled |
| `is_observability_io_logging_enabled` | boolean | ✓ | Private (I/O) logging enabled |
| `include_byok_in_budgets` | boolean | | Whether BYOK spend counts toward workspace budgets (set via the budget endpoints) |
| `created_at` | string | ✓ | ISO 8601 |
| `updated_at` | string \| null | ✓ | ISO 8601 |

`disabled_server_tools` enum: `openrouter:advisor`, `openrouter:apply_patch`, `openrouter:bash`, `openrouter:datetime`, `openrouter:fusion`, `openrouter:image_generation`, `openrouter:mcp`, `openrouter:experimental__search_models`, `openrouter:shell`, `openrouter:subagent`, `openrouter:tool_search`, `openrouter:web_fetch`, `openrouter:web_search`. Requests naming a disabled tool are rejected with `403`.

**`WorkspaceMember`**: `id` (membership uuid), `workspace_id` (uuid), `user_id` (Clerk user ID), `role` (`admin` \| `member` \| `viewer` \| `restricted_viewer`; `viewer` and `restricted_viewer` are read-only — `viewer` sees the whole workspace, `restricted_viewer` only their own activity), `created_at` — all required.

#### Workspace CRUD

| Method & path | operationId | TS method | Success | Errors |
| - | - | - | - | - |
| `GET /workspaces` | `listWorkspaces` | `workspaces.list()` | `200 { data: Workspace[], total_count }` (`offset` 0, `limit` 1–100 default 50) | `401`, `403`, `500` |
| `POST /workspaces` | `createWorkspace` | `workspaces.create({ createWorkspaceRequest })` | `201 { data: Workspace }` | `400`, `401`, `403`, `500` |
| `GET /workspaces/{id}` | `getWorkspace` | `workspaces.get({ id })` | `200 { data: Workspace }` | `401`, `403`, `404`, `500` |
| `PATCH /workspaces/{id}` | `updateWorkspace` | `workspaces.update({ id, updateWorkspaceRequest })` | `200 { data: Workspace }` | `400`, `401`, `403`, `404`, `500` |
| `DELETE /workspaces/{id}` | `deleteWorkspace` | `workspaces.delete({ id, confirmDefaultWorkspaceDeletion? })` (HTTP query `confirm_default_workspace_deletion`; TS key name inferred from the SDK's camelCase convention, not shown in the SDK docs) | `200 { deleted: true }` | `400`, `401`, `403`, `404`, `500` |

Create body `CreateWorkspaceRequest` (update body `UpdateWorkspaceRequest` has the same fields, all optional):

| Field | Type | Req (create) | Constraints / description |
| - | - | - | - |
| `name` | string | ✓ | 1–100 chars |
| `slug` | string | ✓ | 1–50 chars, `^[a-z0-9]+(?:-[a-z0-9]+)*$` (lowercase alphanumeric segments separated by single hyphens) |
| `description` | string \| null | | ≤500 chars |
| `default_text_model` | string \| null | | Default text model |
| `default_image_model` | string \| null | | Default image model |
| `default_provider_sort` | string \| null | | `price`, `throughput`, `latency`, `exacto` |
| `disabled_server_tools` | enum[] \| null | | Server tools to block; an empty array or `null` clears the list |
| `io_logging_api_key_ids` | array \| null | | API key IDs to filter I/O logging |
| `io_logging_sampling_rate` | number | | 0.0001–1 |
| `is_data_discount_logging_enabled` | boolean | | Data discount logging |
| `is_observability_broadcast_enabled` | boolean | | Broadcast |
| `is_observability_io_logging_enabled` | boolean | | Private logging |

Delete rules:

- Workspaces **with active API keys cannot be deleted** — remove the keys first. Per the workspaces guide (default-workspace checklist), you can't delete your last remaining workspace, and deletion is blocked while interns are active in the workspace.
- Deleting **any** workspace permanently deletes its budgets and guardrails and disables its classifiers and broadcast destinations.
- Deleting the **default** workspace requires query `confirm_default_workspace_deletion=true` (enum `"true"`\|`"false"`; ignored for non-default workspaces). It **permanently disables the account's unscoped inference API keys** (management/provisioning keys are retained) and its budgets, guardrails, classifiers and broadcast destinations. Afterwards there is no fallback workspace: management calls that omit `workspace_id` (creating API keys, BYOK keys, guardrails, broadcast destinations) return `400` asking for an explicit `workspace_id`. Not undoable.

```bash
curl -X POST https://openrouter.ai/api/v1/workspaces \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production",
    "slug": "production",
    "description": "Production environment workspace",
    "default_text_model": "openai/gpt-4o",
    "default_provider_sort": "price",
    "disabled_server_tools": ["openrouter:bash", "openrouter:shell"]
  }'
```

#### Members

| Method & path | operationId | TS method | Body | Success |
| - | - | - | - | - |
| `GET /workspaces/{id}/members` | `listWorkspaceMembers` | `workspaces.listMembers({ id })` | — (`offset`, `limit`) | `200 { data: WorkspaceMember[], total_count }` |
| `POST /workspaces/{id}/members/add` | `bulkAddWorkspaceMembers` | `workspaces.bulkAddMembers({ id, bulkAddWorkspaceMembersRequest })` | `{ user_ids: string[] }` (1–100, required) | `200 { added_count, data: WorkspaceMember[] }` (`added_count` = memberships created or updated) |
| `POST /workspaces/{id}/members/remove` | `bulkRemoveWorkspaceMembers` | `workspaces.bulkRemoveMembers({ id, bulkRemoveWorkspaceMembersRequest })` | `{ user_ids: string[] }` (1–100, required) | `200 { removed_count }` |

Status codes: list `401`, `403`, `404`, `500`; add/remove `400`, `401`, `403`, `404`, `500`.

- For the **default workspace**, the member list returns **all organization members** (implicit membership; all org members always have access to it).
- Added members get **the same role they hold in the organization** (org admins → workspace admins, org members → workspace members); the API has no role parameter.
- Members **with active API keys in the workspace cannot be removed** (delete their keys first); **SCIM-managed members cannot be removed** — change them in the identity provider ([§8.8](#88-scim-group-mappings-groups-and-sync-jobs-management-api)).

#### Workspace budgets

Pooled spending caps for the whole workspace (contrast with per-subject guardrail/policy budgets). Up to **four budgets per workspace, one per interval**:

| Path `{interval}` (`WorkspaceBudgetInterval`) | Stored `reset_interval` | Resets |
| - | - | - |
| `daily` | `"daily"` | Every day 00:00 UTC |
| `weekly` | `"weekly"` | Mondays 00:00 UTC |
| `monthly` | `"monthly"` | 1st of month 00:00 UTC |
| `lifetime` | `null` | Never (one-time cap) |

**`WorkspaceBudget`**: `id` (uuid), `workspace_id` (uuid), `limit_usd` (number), `reset_interval` (`daily`\|`weekly`\|`monthly`\|null — `null` = lifetime), `created_at`, `updated_at` — all required. Budget responses also carry top-level **`include_byok_in_budgets`** (workspace-wide; applies to all intervals).

| Method & path | operationId | TS method | Success |
| - | - | - | - |
| `GET /workspaces/{workspace_ref}/budgets` | `listWorkspaceBudgets` | `workspaces.listBudgets({ workspaceRef })` | `200 { data: WorkspaceBudget[], include_byok_in_budgets }` (not paginated) |
| `GET /workspaces/{workspace_ref}/budgets/{interval}` | `getWorkspaceBudget` | `workspaces.getBudget({ workspaceRef, interval })` | `200 { data: WorkspaceBudget, include_byok_in_budgets }` |
| `PUT /workspaces/{workspace_ref}/budgets/{interval}` | `upsertWorkspaceBudget` | `workspaces.setBudget({ workspaceRef, interval, upsertWorkspaceBudgetRequest })` | `200 { data: WorkspaceBudget, include_byok_in_budgets }` |
| `DELETE /workspaces/{workspace_ref}/budgets/{interval}` | `deleteWorkspaceBudget` | `workspaces.deleteBudget({ workspaceRef, interval })` | `200 { deleted: true }` — **idempotent**: also when the budget did not exist |

Status codes: list `401`, `403`, `404`, `500`; get/put/delete `400`, `401`, `403`, `404`, `500`.

Upsert body `UpsertWorkspaceBudgetRequest`:

| Field | Type | Req | Description |
| - | - | - | - |
| `limit_usd` | number (double) | ✓ | Must be > 0 |
| `include_byok_in_budgets` | boolean | | **Workspace-wide**: applies to every interval (daily, weekly, monthly, lifetime), not just the one in the URL. **Omit to leave unchanged**; sending `false` turns inclusion off. BYOK spend counted = what OpenRouter would have charged |

Upsert semantics:

- `PUT` creates the budget for that interval or updates it if it exists.
- **Ordering rule:** limits must be **strictly decreasing** as the interval narrows: `lifetime > monthly > weekly > daily` (only for intervals that are set). Violations → `400`, e.g. `Budget limits must be strictly decreasing as scope narrows: the monthly limit ($500) must be greater than the weekly limit ($600).`
- Changes apply to enforcement **immediately**; an already-open dashboard settings page may show the old value until reloaded.

Enforcement: each request is checked against every configured budget **before routing**; if any is met or exceeded the request gets `403` naming the broadest exceeded interval (e.g. `Workspace monthly budget of $500.00 exceeded. Contact your org admin.`). Already-dispatched in-flight requests complete, so spend can slightly exceed the limit. By default only OpenRouter credit spend counts. Budgets work on every plan and on the Default workspace.

```bash
curl -X PUT https://openrouter.ai/api/v1/workspaces/production/budgets/monthly \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "limit_usd": 1000, "include_byok_in_budgets": true }'
# → {"data":{"id":"770e8400-…","workspace_id":"880e8400-…","limit_usd":1000,"reset_interval":"monthly",
#            "created_at":"…","updated_at":"…"},"include_byok_in_budgets":true}

curl -X DELETE https://openrouter.ai/api/v1/workspaces/production/budgets/lifetime \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_KEY"
# → {"deleted":true}
```

```typescript
// Set budgets from widest to narrowest so each write satisfies the ordering rule
for (const [interval, limitUsd] of [["lifetime", 50000], ["monthly", 5000], ["weekly", 1500], ["daily", 300]] as const) {
  await admin.workspaces.setBudget({ workspaceRef: "production", interval, upsertWorkspaceBudgetRequest: { limitUsd } });
}
```

```python
res = open_router.workspaces.set_budget(
    workspace_ref="production", interval="monthly", limit_usd=100.0, include_byok_in_budgets=True
)
```

Sources: https://openrouter.ai/docs/api/api-reference/workspaces/list-workspaces, https://openrouter.ai/docs/api/api-reference/workspaces/create-a-workspace, https://openrouter.ai/docs/api/api-reference/workspaces/get-a-workspace, https://openrouter.ai/docs/api/api-reference/workspaces/update-a-workspace, https://openrouter.ai/docs/api/api-reference/workspaces/delete-a-workspace, https://openrouter.ai/docs/api/api-reference/workspaces/list-workspace-members, https://openrouter.ai/docs/api/api-reference/workspaces/bulk-add-members-to-a-workspace, https://openrouter.ai/docs/api/api-reference/workspaces/bulk-remove-members-from-a-workspace, https://openrouter.ai/docs/api/api-reference/workspaces/list-workspace-budgets, https://openrouter.ai/docs/api/api-reference/workspaces/get-a-workspace-budget, https://openrouter.ai/docs/api/api-reference/workspaces/create-or-update-a-workspace-budget, https://openrouter.ai/docs/api/api-reference/workspaces/delete-a-workspace-budget, https://openrouter.ai/docs/guides/features/workspaces, https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets, https://openrouter.ai/docs/guides/overview/auth/management-api-keys, https://openrouter.ai/docs/client-sdks/typescript/sdks/workspaces/README, https://openrouter.ai/docs/client-sdks/python/sdks/workspaces/README

### 8.11 Gotchas

**Keys and scope**
- Management keys can't call inference, and **Presets and Vault need a regular API key**, not a management key. Vault additionally needs Intern API programme access and answers `404` (not `403`) outside it.
- Private Endpoints/Providers reject management keys created on a personal account; they need an organization key plus the Private Endpoints add-on.
- API keys are referenced by **hash** everywhere in these APIs — except workspace `io_logging_api_key_ids`, which the spec describes as API key **IDs**.
- Vault and the region check: call `https://openrouter.ai`, never `eu.openrouter.ai`/`us.openrouter.ai` (`403`).

**Guardrails (v1)**
- Creating a guardrail with `workspace_id` does **not** restrict that workspace. Assign it to keys/members, or `PATCH` the workspace default guardrail (`Workspace.default_guardrail_id`), which returns `404` on `GET` until first written.
- `PATCH` array fields are **replace**, not merge — resend the complete list. Send `limit_usd` and `reset_interval` together (`400` otherwise).
- `allowed_models` accepts slugs but returns **canonical slugs**; don't diff input vs output naively.
- Region values: guardrails/policies use `europe` (not `eu`); observability destinations accept `eu` as an alias; the Models API filter uses `region=eu`.
- A key holds at most one guardrail; bulk-assigning silently replaces a previous assignment.

**Guardrail Policies (v2)**
- `PUT` replaces `name` and the **entire `config`**; send `member_ids` and `api_key_hashes` **both or neither** (neither keeps assignments).
- The first edit of a migrated (guardrail-synced) policy returns a **new `data.id`** — persist it. Migrated policies can't be deleted directly; delete the guardrail or unassign.
- `workspace_id` is a **query** param on workspace-policy GET/DELETE/list but a **body** field on PUT/POST; workspace-wide (`/account`) policies take none.
- Lists return everything when both `offset` and `limit` are omitted (unlike other tags, which default to 50).
- Concurrent assignment edits: use `/assignments/...` with `expected_assignment` and retry on `409`.
- Policy and guardrail budgets are **per member / per key**, never pooled; for a team cap use workspace budgets.
- `rate_limit` is accepted by the assignment routes' `policy_type` enum but there is no rate-limit policy API.
- Several moderation and model-availability config fields (`pii_filters`, `lakera_*`, `model_armor_*`, `platform_*`, `require_eu_data_region`, `content_filter_patterns`, `content_filter_blocks_requests`) are schema-only with no documentation; configs reject unknown keys (`additionalProperties: false`).

**Observability**
- Max **5 destinations per type**; only stable types are accepted/listed (types mentioned as beta in the Broadcast guide, e.g. Google BigQuery or Raindrop, are not in the API enum).
- Responses mask secrets; `PATCH` ignores masked values and merges `config` partially. `regions` can't be cleared; delete is a soft delete.

**Presets**
- The create-from-request routes return `200` and **create a new designated version** when the slug exists; transient fields (`messages`, `input`, `prompt`, `stream`) are dropped, but schema-required fields (`messages` for chat, `model`+`messages` for messages) must still be sent.
- At inference, the `preset` field needs the full `@preset/<slug>` form; a bare slug is ignored. Request fields override preset fields (shallow merge).

**Private endpoints / providers**
- `/validate` returns `200` even when checks fail — **check `data.passed`**. Activation needs a fresh passing validation (`409` if never validated, stale, or already active).
- Once active, `upstream_model_id`/`base_url` are immutable (`409 already_active`); delete and re-create. On drafts, changing the upstream or declarations clears validation, and omitted `declared_zdr`/`declared_region` are **cleared** when the upstream changes — resend them.
- Every calling workspace needs a BYOK key for the endpoint's provider; validation uses the BYOK key of the `workspace_id` you pass (`no_byok_key` otherwise).
- Use `Idempotency-Key` on create; the create/activate responses don't include `declared_parameters`/`tested_parameters` — `GET` the endpoint.
- 10 endpoints per org including drafts; 5 private providers per org; provider `name`/`slug` are immutable and can't collide with public providers; delete endpoints before their provider (`409 provider_has_endpoints`).

**SCIM**
- These are management routes, not the IdP's SCIM 2.0 connector. `DELETE /scim/group-mappings/{id}` **requires** `keep_members` (`false` removes the members it granted). Re-creating a mapping with a different role returns `409` — `PATCH` the role instead.

**Vault**
- Values are never returned; verify by fingerprint only **within the same vault**.
- Legacy secrets with `hosts: null` are delivered to **any** host (effective-secrets semantics) and can't be copied (`409`) — re-store them with explicit `hosts`.
- Copy is all-or-nothing; connection-owned secrets can only be changed by reconnecting/disconnecting the connection.

**Workspaces**
- Can't delete a workspace with active API keys; deleting the default workspace needs `confirm_default_workspace_deletion=true`, disables all unscoped inference keys, and makes `workspace_id` mandatory on later management creates.
- Bulk-add assigns the member's org role (no role parameter); members with active keys in the workspace and SCIM-managed members can't be removed via the API.
- Workspace budget `PUT` uses `lifetime` in the path but returns `reset_interval: null`; limits must strictly decrease lifetime > monthly > weekly > daily; `include_byok_in_budgets` is workspace-wide and should be **omitted** unless you mean to change it.

Sources: https://openrouter.ai/docs/guides/features/guardrails, https://openrouter.ai/docs/guides/features/guardrails/policies, https://openrouter.ai/docs/guides/features/guardrails/policies-migration, https://openrouter.ai/docs/guides/features/broadcast, https://openrouter.ai/docs/guides/features/presets, https://openrouter.ai/docs/guides/routing/private-endpoints, https://openrouter.ai/docs/guides/features/scim-mappings, https://openrouter.ai/docs/guides/features/workspaces, https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets, https://openrouter.ai/docs/guides/features/in-region-routing, https://openrouter.ai/docs/api/api-reference/vault/list-the-secrets-an-intern-receives
