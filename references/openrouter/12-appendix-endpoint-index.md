# OpenRouter Reference — Appendix A. Complete endpoint index

> Part of the OpenRouter Developer Reference for coding agents, compiled from https://openrouter.ai/docs and the OpenAPI spec on 2026-11-06. Live docs and https://openrouter.ai/docs/openapi/openapi.yaml win over this file.
> [Index](00-INDEX.md) · [← Previous: 11-features-ops-integrations.md](11-features-ops-integrations.md)

## Appendix A. Complete endpoint index

All paths are relative to `https://openrouter.ai/api/v1`. Generated from the OpenAPI spec (167 operations). "management key" means the operation's description says a management key is required.

### Anthropic Messages (§5)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/messages` | `createMessages` | Create a message |  |

### Chat (§5)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/chat/completions` | `sendChatCompletionRequest` | Create a chat completion |  |

### Responses (§5)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/responses` | `createResponses` | Create a response |  |

### alpha.decisions (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/api/alpha/decisions` | `createApiAlphaDecisions` | Submit a Decisions request |  |

### alpha.extractions (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/api/alpha/extractions` | `createApiAlphaExtractions` | Submit an Extractions request |  |

### Batch (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/batches` | `listBatches` | List batches |  |
| POST | `/batches` | `createBatches` | Create a batch |  |
| DELETE | `/batches/{id}` | `deleteBatch` | Delete a batch |  |
| GET | `/batches/{id}` | `getBatches` | Get a batch |  |

### Containers (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/containers/{container_id}/files` | `listContainerFiles` | List container files |  |
| GET | `/containers/{container_id}/files/{file_id}` | `getContainerFile` | Retrieve a container file |  |
| GET | `/containers/{container_id}/files/{file_id}/content` | `downloadContainerFileContent` | Download container file content |  |
| POST | `/containers/{container_id}/files/{file_id}/promote` | `promoteContainerFile` | Promote a container file into workspace documents |  |

### Embeddings (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/embeddings` | `createEmbeddings` | Submit an embedding request |  |
| GET | `/embeddings/models` | `listEmbeddingsModels` | List all embeddings models |  |

### Files (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/files` | `listFiles` | List files |  |
| POST | `/files` | `uploadFile` | Upload a file |  |
| DELETE | `/files/{file_id}` | `deleteFile` | Delete a file |  |
| GET | `/files/{file_id}` | `getFileMetadata` | Get file metadata |  |
| GET | `/files/{file_id}/content` | `downloadFileContent` | Download file content |  |

### Images (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/images` | `createImages` | Generate an image |  |
| GET | `/images/models` | `listImageModels` | List image generation models |  |
| GET | `/images/models/{author}/{slug}/endpoints` | `listImageModelEndpoints` | List endpoints for an image model |  |

### Rerank (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/rerank` | `createRerank` | Submit a rerank request |  |

### STT (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/audio/transcriptions` | `createAudioTranscriptions` | Create transcription |  |

### SystemOne (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/systemone` | `createSystemone` | Submit a System One request |  |

### Tools (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/tools` | `listTools` | List server tools |  |
| GET | `/tools/{name}` | `getTool` | Get a server tool |  |

### TTS (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/audio/speech` | `createAudioSpeech` | Create speech |  |

### Video Generation (§6)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/videos` | `createVideos` | Submit a video generation request |  |
| GET | `/videos/models` | `listVideosModels` | List all video generation models |  |
| GET | `/videos/{jobId}` | `getVideos` | Poll video generation status |  |
| GET | `/videos/{jobId}/content` | `listVideosContent` | Download generated video content |  |

### Analytics (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/activity` | `getUserActivity` | Get user activity grouped by endpoint | management key |
| GET | `/analytics/meta` | `getAnalyticsMeta` | Get available analytics metrics and dimensions | management key |
| POST | `/analytics/query` | `queryAnalytics` | Query analytics data | management key |

### API Keys (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/key` | `getCurrentKey` | Get current API key |  |
| GET | `/keys` | `list` | List API keys | management key |
| POST | `/keys` | `createKeys` | Create a new API key | management key |
| DELETE | `/keys/{hash}` | `deleteKeys` | Delete an API key | management key |
| GET | `/keys/{hash}` | `getKey` | Get a single API key | management key |
| PATCH | `/keys/{hash}` | `updateKeys` | Update an API key | management key |

### Benchmarks (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/benchmarks` | `getBenchmarks` | List Benchmarks |  |

### BYOK (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/byok` | `listBYOKKeys` | List BYOK provider credentials | management key |
| POST | `/byok` | `createBYOKKey` | Create a BYOK provider credential | management key |
| DELETE | `/byok/{id}` | `deleteBYOKKey` | Delete a BYOK provider credential | management key |
| GET | `/byok/{id}` | `getBYOKKey` | Get a BYOK provider credential | management key |
| PATCH | `/byok/{id}` | `updateBYOKKey` | Update a BYOK provider credential | management key |

### Classifications (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/classifications/task` | `getTaskClassifications` | Task classification market share |  |

### Credits (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/credits` | `getCredits` | Get remaining credits | management key |
| POST | `/credits/coinbase` | `createCoinbaseCharge` | Deprecated Coinbase Commerce charge endpoint | deprecated, no auth |

### Datasets (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/datasets/app-rankings` | `getAppRankings` | Top apps by token usage |  |
| GET | `/datasets/rankings-daily` | `getRankingsDaily` | Daily token totals for top 50 models |  |
| GET | `/datasets/session-cost` | `getSessionCost` | Cost per session by harness and model |  |

### Endpoints (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/endpoints/zdr` | `listEndpointsZdr` | Preview the impact of ZDR on the available endpoints |  |
| GET | `/models/{author}/{slug}/endpoints` | `listEndpoints` | List all endpoints for a model |  |

### External Users (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/external-users` | `listExternalUsers` | List registered external users | management key |
| POST | `/external-users` | `createExternalUser` | Register an external user | management key |
| DELETE | `/external-users/{user}` | `deleteExternalUser` | Deactivate a registered external user | management key |
| GET | `/external-users/{user}` | `getExternalUser` | Get a registered external user | management key |
| PATCH | `/external-users/{user}` | `updateExternalUser` | Update a registered external user | management key |

### Generations (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/generation` | `getGeneration` | Get request & usage metadata for a generation |  |
| GET | `/generation/content` | `listGenerationContent` | Get stored prompt, completion, and error content for a generation |  |
| POST | `/generation/feedback` | `submitGenerationFeedback` | Submit feedback for a generation | management key |

### Models (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/model/{author}/{slug}` | `getModel` | Get a model by its slug |  |
| GET | `/models` | `getModels` | List all models and their properties |  |
| GET | `/models/count` | `listModelsCount` | Get total count of available models |  |
| GET | `/models/user` | `listModelsUser` | List models filtered by user provider preferences, privacy settings, and guardrails |  |

### OAuth (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| POST | `/auth/keys` | `exchangeAuthCodeForAPIKey` | Exchange authorization code for API key |  |
| POST | `/auth/keys/code` | `createAuthKeysCode` | Create authorization code |  |
| GET | `/oauth/jwks` | `listOauthJwks` | OpenRouter access token signing keys |  |
| POST | `/oauth/token` | `createOauthToken` | Exchange a workload identity token |  |

### Organization (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/organization/members` | `listOrganizationMembers` | List organization members | management key |
| GET | `/organization/settings` | `getOrganizationSettings` | Get organization settings | management key |
| PATCH | `/organization/settings` | `updateOrganizationSettings` | Update organization settings | management key |

### Providers (§7)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/providers` | `listProviders` | List all providers |  |

### Guardrail Policies (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/guardrails/policies/account` | `listAccountPolicies` | List workspace-wide policies | management key |
| POST | `/guardrails/policies/account` | `createAccountPolicy` | Create a workspace-wide policy | management key |
| DELETE | `/guardrails/policies/account/{id}` | `deleteAccountPolicy` | Delete a workspace-wide policy | management key |
| PUT | `/guardrails/policies/account/{id}` | `updateAccountPolicy` | Update a workspace-wide policy | management key |
| GET | `/guardrails/policies/assignments/api-keys/{hash}` | `getApiKeyPolicyAssignment` | Get an API key policy assignment | management key |
| PUT | `/guardrails/policies/assignments/api-keys/{hash}` | `changeApiKeyPolicyAssignment` | Change an API key policy assignment | management key |
| GET | `/guardrails/policies/assignments/members/{member_id}` | `getMemberPolicyAssignment` | Get a member policy assignment | management key |
| PUT | `/guardrails/policies/assignments/members/{member_id}` | `changeMemberPolicyAssignment` | Change a member policy assignment | management key |
| GET | `/guardrails/policies/budget` | `listBudgetPolicies` | List budget policies | management key |
| POST | `/guardrails/policies/budget` | `createBudgetPolicy` | Create a budget policy | management key |
| DELETE | `/guardrails/policies/budget/{id}` | `deleteBudgetPolicy` | Delete a budget policy | management key |
| GET | `/guardrails/policies/budget/{id}` | `getBudgetPolicy` | Get a budget policy | management key |
| PUT | `/guardrails/policies/budget/{id}` | `updateBudgetPolicy` | Update a budget policy | management key |
| GET | `/guardrails/policies/model-availability` | `listModelAvailabilityPolicies` | List model availability policies | management key |
| POST | `/guardrails/policies/model-availability` | `createModelAvailabilityPolicy` | Create a model availability policy | management key |
| DELETE | `/guardrails/policies/model-availability/{id}` | `deleteModelAvailabilityPolicy` | Delete a model availability policy | management key |
| GET | `/guardrails/policies/model-availability/{id}` | `getModelAvailabilityPolicy` | Get a model availability policy | management key |
| PUT | `/guardrails/policies/model-availability/{id}` | `updateModelAvailabilityPolicy` | Update a model availability policy | management key |
| GET | `/guardrails/policies/moderation` | `listModerationPolicies` | List moderation policies | management key |
| POST | `/guardrails/policies/moderation` | `createModerationPolicy` | Create a moderation policy | management key |
| DELETE | `/guardrails/policies/moderation/{id}` | `deleteModerationPolicy` | Delete a moderation policy | management key |
| GET | `/guardrails/policies/moderation/{id}` | `getModerationPolicy` | Get a moderation policy | management key |
| PUT | `/guardrails/policies/moderation/{id}` | `updateModerationPolicy` | Update a moderation policy | management key |

### Guardrails (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/guardrails` | `listGuardrails` | List guardrails | management key |
| POST | `/guardrails` | `createGuardrail` | Create a guardrail | management key |
| GET | `/guardrails/assignments/keys` | `listKeyAssignments` | List all key assignments | management key |
| GET | `/guardrails/assignments/members` | `listMemberAssignments` | List all member assignments | management key |
| DELETE | `/guardrails/{id}` | `deleteGuardrail` | Delete a guardrail | management key |
| GET | `/guardrails/{id}` | `getGuardrail` | Get a guardrail | management key |
| PATCH | `/guardrails/{id}` | `updateGuardrail` | Update a guardrail | management key |
| GET | `/guardrails/{id}/assignments/keys` | `listGuardrailKeyAssignments` | List key assignments for a guardrail | management key |
| POST | `/guardrails/{id}/assignments/keys` | `bulkAssignKeysToGuardrail` | Bulk assign keys to a guardrail | management key |
| POST | `/guardrails/{id}/assignments/keys/remove` | `bulkUnassignKeysFromGuardrail` | Bulk unassign keys from a guardrail | management key |
| GET | `/guardrails/{id}/assignments/members` | `listGuardrailMemberAssignments` | List member assignments for a guardrail | management key |
| POST | `/guardrails/{id}/assignments/members` | `bulkAssignMembersToGuardrail` | Bulk assign members to a guardrail | management key |
| POST | `/guardrails/{id}/assignments/members/remove` | `bulkUnassignMembersFromGuardrail` | Bulk unassign members from a guardrail | management key |

### Observability (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/observability/destinations` | `listObservabilityDestinations` | List observability destinations | management key |
| POST | `/observability/destinations` | `createObservabilityDestination` | Create an observability destination | management key |
| DELETE | `/observability/destinations/{id}` | `deleteObservabilityDestination` | Delete an observability destination | management key |
| GET | `/observability/destinations/{id}` | `getObservabilityDestination` | Get an observability destination | management key |
| PATCH | `/observability/destinations/{id}` | `updateObservabilityDestination` | Update an observability destination | management key |

### Presets (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/presets` | `listPresets` | List presets |  |
| GET | `/presets/{slug}` | `getPreset` | Get a preset |  |
| POST | `/presets/{slug}/chat/completions` | `createPresetsChatCompletions` | Create a preset from a chat-completions request body |  |
| POST | `/presets/{slug}/messages` | `createPresetsMessages` | Create a preset from a messages request body |  |
| POST | `/presets/{slug}/responses` | `createPresetsResponses` | Create a preset from a responses request body |  |
| GET | `/presets/{slug}/versions` | `listPresetVersions` | List versions of a preset |  |
| GET | `/presets/{slug}/versions/{version}` | `getPresetVersion` | Get a specific version of a preset |  |

### Private Endpoints (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/private-endpoints` | `listPrivateEndpoints` | List private endpoints | management key |
| POST | `/private-endpoints` | `createPrivateEndpoint` | Create a private endpoint | management key |
| DELETE | `/private-endpoints/{id}` | `deletePrivateEndpoint` | Delete a private endpoint | management key |
| GET | `/private-endpoints/{id}` | `getPrivateEndpoint` | Get a private endpoint | management key |
| PATCH | `/private-endpoints/{id}` | `updatePrivateEndpoint` | Update a private endpoint | management key |
| POST | `/private-endpoints/{id}/activate` | `activatePrivateEndpoint` | Activate a validated private endpoint | management key |
| POST | `/private-endpoints/{id}/disable` | `disablePrivateEndpoint` | Disable a private endpoint | management key |
| POST | `/private-endpoints/{id}/enable` | `enablePrivateEndpoint` | Enable a private endpoint | management key |
| POST | `/private-endpoints/{id}/validate` | `validatePrivateEndpoint` | Validate a draft private endpoint | management key |

### Private Providers (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/private-providers` | `listPrivateProviders` | List private providers | management key |
| POST | `/private-providers` | `createPrivateProvider` | Create a private provider | management key |
| DELETE | `/private-providers/{slug}` | `deletePrivateProvider` | Delete a private provider | management key |
| GET | `/private-providers/{slug}` | `getPrivateProvider` | Get a private provider | management key |
| PATCH | `/private-providers/{slug}` | `updatePrivateProvider` | Update a private provider | management key |

### SCIM (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/scim/group-mappings` | `listScimGroupMappings` | List SCIM group mappings | management key |
| POST | `/scim/group-mappings` | `createScimGroupMapping` | Create a SCIM group mapping | management key |
| DELETE | `/scim/group-mappings/{id}` | `deleteScimGroupMapping` | Delete a SCIM group mapping | management key |
| GET | `/scim/group-mappings/{id}` | `getScimGroupMapping` | Get a SCIM group mapping | management key |
| PATCH | `/scim/group-mappings/{id}` | `updateScimGroupMapping` | Update a SCIM group mapping | management key |
| GET | `/scim/groups` | `listScimGroups` | List SCIM groups | management key |
| POST | `/scim/sync-jobs` | `createScimSyncJob` | Start a SCIM directory sync | management key |
| GET | `/scim/sync-jobs/{id}` | `getScimSyncJob` | Get SCIM directory sync status | management key |

### Vault (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/vault/interns/{internId}/connections` | `listInternConnections` | List the connections an intern can use |  |
| GET | `/vault/interns/{internId}/effective-secrets` | `listInternEffectiveVaultSecrets` | List the secrets an intern receives |  |
| GET | `/vault/interns/{internId}/secrets` | `listInternVaultSecrets` | List intern secrets |  |
| POST | `/vault/interns/{internId}/secrets/copy` | `copyVaultSecretsToIntern` | Copy workspace secrets to an intern |  |
| DELETE | `/vault/interns/{internId}/secrets/{name}` | `deleteInternVaultSecret` | Delete an intern secret |  |
| PUT | `/vault/interns/{internId}/secrets/{name}` | `storeInternVaultSecret` | Store an intern secret |  |
| GET | `/vault/secrets` | `listVaultSecrets` | List workspace secrets |  |
| DELETE | `/vault/secrets/{name}` | `deleteVaultSecret` | Delete a workspace secret |  |
| PUT | `/vault/secrets/{name}` | `storeVaultSecret` | Store a workspace secret |  |

### Workspaces (§8)

| Method | Path | operationId | Summary | Notes |
|---|---|---|---|---|
| GET | `/workspaces` | `listWorkspaces` | List workspaces | management key |
| POST | `/workspaces` | `createWorkspace` | Create a workspace | management key |
| DELETE | `/workspaces/{id}` | `deleteWorkspace` | Delete a workspace | management key |
| GET | `/workspaces/{id}` | `getWorkspace` | Get a workspace | management key |
| PATCH | `/workspaces/{id}` | `updateWorkspace` | Update a workspace | management key |
| GET | `/workspaces/{id}/members` | `listWorkspaceMembers` | List workspace members | management key |
| POST | `/workspaces/{id}/members/add` | `bulkAddWorkspaceMembers` | Bulk add members to a workspace | management key |
| POST | `/workspaces/{id}/members/remove` | `bulkRemoveWorkspaceMembers` | Bulk remove members from a workspace | management key |
| GET | `/workspaces/{workspace_ref}/budgets` | `listWorkspaceBudgets` | List workspace budgets | management key |
| DELETE | `/workspaces/{workspace_ref}/budgets/{interval}` | `deleteWorkspaceBudget` | Delete a workspace budget | management key |
| GET | `/workspaces/{workspace_ref}/budgets/{interval}` | `getWorkspaceBudget` | Get a workspace budget | management key |
| PUT | `/workspaces/{workspace_ref}/budgets/{interval}` | `upsertWorkspaceBudget` | Create or update a workspace budget | management key |
