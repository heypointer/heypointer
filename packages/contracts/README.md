# @heypointerhq/contracts

The shared schemas and types every other package agrees on, as [zod](https://zod.dev) schemas with inferred TypeScript types. If two packages talk to each other, the shape of the message is defined here.

```ts
import { WalkthroughSchema, CONTRACT_VERSION, type Walkthrough } from "@heypointerhq/contracts";
const walkthrough = WalkthroughSchema.parse(json);   // throws on an invalid walkthrough
```

## Install

```bash
npm install @heypointerhq/contracts
```

ESM only, types included, one runtime dependency (`zod`). Version 0.2.1. Install it with `npm install @heypointerhq/contracts`. See [docs/PACKAGES.md](../../docs/PACKAGES.md).

## What is in it

| Area | Exports |
|---|---|
| Knowledge base | `ProvenanceSchema`, `TargetSchema`, `WorkflowNodeSchema`, `WorkflowEdgeSchema`, `WorkflowSchema`, `KnowledgeBaseSnapshotSchema`; `SourceType` is `prd`, `e2e`, `mermaid` or `code` |
| Walkthrough | `EvidenceSchema`, `WalkthroughStepSchema`, `WalkthroughSchema` (status `ok` or `insufficient_evidence`) |
| HTTP API | `API_ROUTES`, request and response schemas for ingest, walkthrough, transcribe, health, metrics, and `ErrorResponseSchema` with `ErrorCode` |
| App clients | `CLIENT_ID_HEADER`, `ClientIdSchema`, `CLIENT_ROUTES`, `CreateClientRequestSchema`, `AppClientSchema` |
| Publish a knowledge base | `PublishKbRequestSchema`, `PublishKbResponseSchema`, `MAX_KB_PUBLISH_BYTES` |
| Tenants, keys, plans | `TENANT_ID_PATTERN`, `TENANT_ROUTES`, key and enrollment-code patterns, `PlanNameSchema`, `PlanLimitsSchema`, `TenantSelfResponseSchema`, key schemas |
| Accounts and login | `ACCOUNT_ROUTES`, session, invite, member, device-login, CLI-login and audit schemas |
| Hosted inference | `CLOUD_ROUTES`, `CloudEnroll*`, `CloudMe*`, `Admin*` schemas |

Two rules the schemas enforce: a step without evidence is invalid, and `insufficient_evidence` never carries steps. The SDK also refuses a walkthrough that breaks them.

## Changing a contract

A schema change is a contract change. Bump `CONTRACT_VERSION` in `src/index.ts`, add a line to the history below, and prefer additive changes (a new optional field or enum value) so existing knowledge bases and clients keep working. Consumers that switch on an enum must handle a new value.

| Version | Change |
|---|---|
| 1.14.0 | New identifier prefixes: client ids `hpc_`, admin keys `hpk_a_`, guide keys `hpk_g_`, enrollment codes `hpe_`, invite tokens `hpi_`, reset tokens `hpr_` and device codes `hpd_` (MCP keys were already `hpk_m_`). Every pattern (`CLIENT_ID_PATTERN`, `KEY_SECRET_PATTERN`, `ADMIN_KEY_PATTERN`, `GUIDE_KEY_PATTERN`, `ENROLL_CODE_PATTERN`, `INVITE_TOKEN_PATTERN`, `RESET_TOKEN_PATTERN`, `DEVICE_CODE_PATTERN`) still accepts the old `gfc_`, `gfk_a_`, `gfk_g_`, `gfe_`, `gfi_`, `gfr_` and `gfd_` values, so nothing issued before stays invalid. Additive. |
| 1.13.0 | Choosable access for the hosted MCP endpoint: `McpScopeSchema` (`mcp:read`, `mcp:write`, `MCP_SCOPES`); `CreateKeyRequest.mcpScopes` (MCP keys only, must include `mcp:read`, default read only); `CreateKeyResponse` and `KeySummary` gain optional `expiresAt` (an MCP key stops working at that time; `null` for keys that do not expire) and `mcpScopes`. Additive. |
| 1.12.0 | A read-only key kind for the hosted MCP endpoint: `KeyScopeSchema` gains `mcp`, key secrets `hpk_m_` + 48 hex (`MCP_KEY_PATTERN`; `KEY_SECRET_PATTERN` now matches `hpk_m_` besides `hpk_a_` and `hpk_g_`). An MCP key works only on `POST /mcp`; every other route refuses it with 403. `POST /api/keys` accepts `scope: "mcp"`. Additive. |
| 1.11.0 | Staff accounts as the public API shows them: `AccountUser.operator`, `SessionResponse.operator`, `InviteInfoResponse.kind: "operator"`, the `operator_2fa_required` error code, and `byStaff` and `description` on audit entries, so a tenant sees "HeyPointer staff viewed your flows" without a name. The operator routes and their schemas are not part of this package (they live in an internal package). |
| 1.10.0 | Accounts and login: people sign in to the console with an email and password (OIDC providers later) and get a session cookie (`SESSION_COOKIE` `hp_session`, sent as `__Host-hp_session` over https; `SESSION_IDLE_MS` 12 hours, `SESSION_ABSOLUTE_MS` 7 days). Signup is invite-only: `POST /api/invites` (owners and admins; the first owner of a tenant is invited by the operator), invite links `hpi_` + 32 hex (`INVITE_TOKEN_PATTERN`, `INVITE_TTL_MS` 7 days), reset links `hpr_` + 32 hex (`RESET_TTL_MS` 1 hour). Users `usr_` + 12 hex, members with roles `owner`/`admin`/`member` (`MemberRoleSchema`). A request that changes state with the cookie must send `X-HeyPointer-CSRF` (`CSRF_HEADER`) and a same-origin `Origin`. Two-factor sign-in (TOTP) with ten recovery codes, command-line login two ways (`POST /api/auth/device` + `/token` with a short `ABCD-EFGH` code and a browser approval, or `POST /api/auth/cli-login` with email and password) that both end in a revocable tenant admin key, an audit log (`GET /api/audit`), `ACCOUNT_ROUTES` with every request and response schema. New error codes `invalid_credentials`, `account_exists_login_first`, `accounts_disabled`, `csrf_failed`. Plans may set `members` (team members plus pending invites; `PlanLimitsSchema.members` and `PlanUsageSchema.members` are optional, defaults free 3 and internal 100). |
| 1.9.0 | Tenants and keys: `TENANT_ID_PATTERN` / `DEFAULT_TENANT_ID` (`tn_` + 12 hex), key secrets `hpk_a_` (admin) / `hpk_g_` (guide) + 48 hex (`KEY_SECRET_PATTERN`, `ADMIN_KEY_PATTERN`, `GUIDE_KEY_PATTERN`), key handles `kid_` + 12 hex (`KEY_ID_PATTERN`), one-time enrollment codes `hpe_` + 32 hex (`ENROLL_CODE_PATTERN`, `ENROLLMENT_TTL_MS` 15 minutes), `TENANT_ROUTES` (`POST /api/tenant/enroll`, `GET /api/tenant`, `POST/GET /api/keys`, `DELETE /api/keys/{id}`) with their request and response schemas. Walkthrough requests may also authenticate with a guide key (`Authorization: Bearer hpk_g_...`) from a tenant's backend proxy. Every tenant has its own keys, clients, flows and knowledge base. Plans (`PlanNameSchema`, `PlanLimitsSchema`, `TenantPlanSchema`, `DEFAULT_PLAN` `free`) set per-tenant limits on clients, keys and flows; `GET /api/tenant` carries `plan`, `limits` and `usage`; error code `plan_limit_reached` (403) with `limit` and `used` on error responses. |
| 1.8.0 | App clients: the `X-HeyPointer-Client` header (`CLIENT_ID_HEADER`) on walkthrough requests, `CLIENT_ID_PATTERN` / `ClientIdSchema` (`hpc_` + 24 hex; a publishable id, not a secret), admin routes `CLIENT_ROUTES` (`POST /api/clients`, `GET /api/clients`, `DELETE /api/clients/{id}`) with `CreateClientRequestSchema`, `CreateClientResponseSchema`, `AppClientSchema`, `ClientListResponseSchema`; error codes `client_required` (401), `client_invalid` (401), `client_origin_not_allowed` (403); optional `message` on error responses. A server with the default `HEYPOINTER_CLIENT_AUTH=required` refuses walkthroughs without a valid client id. |
| 1.7.0 | Publish a scanned knowledge base: `PUT /api/kb` (`API_ROUTES.publishKnowledgeBase`), `PublishKbRequestSchema` (the `kb.json` body, strict, with graph consistency checks), `PublishKbResponseSchema`, `MAX_KB_PUBLISH_BYTES`; error codes `embedder_mismatch`, `scanner_too_old`, `conflict`. Additive. |
| 1.6.0 | Flows API: `FLOW_ROUTES`, `FlowInput`, `Flow`, `FlowDetail`, `FlowVersion`, `FlowValidateResponse`. Add, edit, publish, unpublish, roll back and delete flows on a running server. Additive. |
| 1.5.0 | `suggestions` (up to 5 `{workflowId, title}`) on a walkthrough: the nearest guides, allowed only with `insufficient_evidence`. Optional and additive. The server does not produce it yet; it is the contract for the planned decision step. |
| 1.4.0 | Hosted inference: routes under `/api/cloud/*` (client token) and `/api/admin/*` (server API key), `CloudEnroll*`, `CloudMe*`, `Admin*` schemas, error codes `forbidden` (403) and `rate_limited` (429). Routes return 404 unless the server runs with `HEYPOINTER_CLOUD=1`. |
| 1.3.0 | `sourceType` gains `code`: flows a model inferred from application source by `heypointer scan --llm`. Planner evidence order is e2e, prd, mermaid, code. |
| 1.2.0 | Inference metrics (`GET /api/metrics`), error codes `spend_cap_exceeded` and `metrics_unavailable`. |
| 1.1.0 | `unauthorized` error code; `ready` on the health response. |
| 1.0.0 | Knowledge base, walkthrough, ingest, transcribe and health. |

## Test

`npm test -w packages/contracts`

---

[Website](https://heypointer.com/) · [Docs](https://heypointer.com/docs/) · [X](https://x.com/heypointer) · [Instagram](https://www.instagram.com/heypointer/) · Support: [Buy Me a Coffee](https://buymeacoffee.com/heypointer) · [Ko-fi](https://ko-fi.com/heypointer)
