// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { z } from "zod";

/** Contract version. Bump on any breaking schema change and note it in packages/contracts/README.md. */
export const CONTRACT_VERSION = "1.11.0";

// ---------------------------------------------------------------------------
// Knowledge base: sources, provenance, workflow graph
// ---------------------------------------------------------------------------

/**
 * `code` (added in 1.3.0) marks flows a model inferred from application source in
 * `heypointer scan --llm`. Every such step still cites a real file, lines and excerpt.
 */
export const SourceTypeSchema = z.enum(["prd", "e2e", "mermaid", "code"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Where a fact came from. Line numbers are 1-based and inclusive. */
export const ProvenanceSchema = z.object({
  sourceType: SourceTypeSchema,
  path: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  excerpt: z.string(),
  /** sha256 (hex, 16 chars) of the whole source file at scan time. */
  sourceHash: z.string().min(1),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const StepActionSchema = z.enum(["click", "type", "select", "navigate", "observe"]);
export type StepAction = z.infer<typeof StepActionSchema>;

/**
 * How to find a live DOM element. Every field is copied from evidence; the
 * server never invents selectors. SDK resolution order: selectors, then
 * role+text, then label, then text.
 */
export const TargetSchema = z.object({
  selectors: z.array(z.string().min(1)).default([]),
  role: z.string().min(1).optional(),
  /** Accessible name or visible text. */
  text: z.string().min(1).optional(),
  /** Associated <label> text, for form controls. */
  label: z.string().min(1).optional(),
});
export type Target = z.infer<typeof TargetSchema>;

export const NodeKindSchema = z.enum(["screen", "action", "outcome", "requirement"]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  kind: NodeKindSchema,
  label: z.string().min(1),
  /** Ordinal of this node in its source sequence (0-based). */
  order: z.number().int().nonnegative(),
  action: StepActionSchema.optional(),
  target: TargetSchema.optional(),
  value: z.string().optional(),
  consequential: z.boolean().default(false),
  provenance: z.array(ProvenanceSchema).min(1),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const EdgeKindSchema = z.enum([
  /** Sequence within one source. */
  "next",
  /** Two nodes from different sources describe the same step. */
  "same_as",
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const WorkflowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: EdgeKindSchema,
  /** Match strength for same_as (0..1); 1 for next. */
  weight: z.number().min(0).max(1),
  label: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sources: z.array(z.string()),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const VectorEntrySchema = z.object({
  nodeId: z.string().min(1),
  text: z.string(),
  vector: z.array(z.number()),
});
export type VectorEntry = z.infer<typeof VectorEntrySchema>;

export const KnowledgeBaseSnapshotSchema = z.object({
  /** Content-addressed: same sources + scanner version => same version. */
  version: z.string().min(1),
  createdAt: z.string(),
  scannerVersion: z.string(),
  embedder: z.string(),
  workflows: z.array(WorkflowSchema),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  vectors: z.array(VectorEntrySchema),
});
export type KnowledgeBaseSnapshot = z.infer<typeof KnowledgeBaseSnapshotSchema>;

// ---------------------------------------------------------------------------
// Walkthrough (what the SDK renders)
// ---------------------------------------------------------------------------

export const EvidenceSchema = z.object({
  nodeId: z.string().min(1),
  sourceType: SourceTypeSchema,
  path: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  excerpt: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const WalkthroughStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  target: TargetSchema,
  action: StepActionSchema,
  /** Text to type or option to select, when evidence supplies it. Suggestion only. */
  value: z.string().optional(),
  /** True for consequential actions (send, delete, pay...). SDK must confirm first. */
  requiresConfirmation: z.boolean(),
  /** Never empty: a step without evidence is rejected by validation. */
  evidence: z.array(EvidenceSchema).min(1),
});
export type WalkthroughStep = z.infer<typeof WalkthroughStepSchema>;

export const WalkthroughStatusSchema = z.enum(["ok", "insufficient_evidence"]);
export type WalkthroughStatus = z.infer<typeof WalkthroughStatusSchema>;

export const PlannerKindSchema = z.enum(["llm", "deterministic", "fallback"]);
export type PlannerKind = z.infer<typeof PlannerKindSchema>;

/** A guide the server can give, offered when it cannot cover the goal. The title works as a goal: ask for it to get the steps. Added in 1.5.0. */
export const FlowSuggestionSchema = z.object({
  workflowId: z.string().min(1),
  title: z.string().min(1).max(200),
});
export type FlowSuggestion = z.infer<typeof FlowSuggestionSchema>;

export const WalkthroughSchema = z
  .object({
    id: z.string().min(1),
    goal: z.string().min(1),
    status: WalkthroughStatusSchema,
    workflowId: z.string().optional(),
    steps: z.array(WalkthroughStepSchema),
    kbVersion: z.string(),
    /** Retrieval confidence 0..1. */
    confidence: z.number().min(0).max(1),
    planner: PlannerKindSchema,
    /** Human-readable note, required for insufficient_evidence. */
    message: z.string().optional(),
    /** What evidence would be needed, for insufficient_evidence. */
    missingEvidence: z.array(z.string()).optional(),
    /** Nearest guides, for insufficient_evidence only. Added in 1.5.0. */
    suggestions: z.array(FlowSuggestionSchema).max(5).optional(),
  })
  .superRefine((w, ctx) => {
    if (w.status === "ok" && w.steps.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "status ok requires at least one step", path: ["steps"] });
    }
    if (w.status === "ok" && w.suggestions?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "suggestions are only for insufficient_evidence", path: ["suggestions"] });
    }
    if (w.status === "insufficient_evidence") {
      if (w.steps.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "insufficient_evidence must not include steps", path: ["steps"] });
      }
      if (!w.message) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "insufficient_evidence requires a message", path: ["message"] });
      }
    }
  });
export type Walkthrough = z.infer<typeof WalkthroughSchema>;

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

export const API_ROUTES = {
  health: "GET /api/health",
  ingest: "POST /api/ingest",
  knowledgeBase: "GET /api/kb",
  /** Replace the base knowledge base with a scanned one (CI publish). Added in 1.7.0. */
  publishKnowledgeBase: "PUT /api/kb",
  /** Requires the `X-HeyPointer-Client` header unless the server runs with HEYPOINTER_CLIENT_AUTH=off. Added in 1.8.0. */
  walkthrough: "POST /api/walkthrough",
  transcribe: "POST /api/transcribe",
  /** Key-protected inference metrics. Added in 1.2.0. */
  metrics: "GET /api/metrics",
} as const;

export const IngestRequestSchema = z.object({
  /** Files or directories, relative to the server source root. Default: ["fixtures"]. */
  paths: z.array(z.string().min(1)).min(1).optional(),
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const IngestResponseSchema = z.object({
  version: z.string(),
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  workflows: z.array(z.string()),
  sources: z.array(z.object({ path: z.string(), sourceType: SourceTypeSchema, sourceHash: z.string() })),
  warnings: z.array(z.string()),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

/** Largest knowledge base the server accepts on `PUT /api/kb`, and the CLI refuses to send more. Added in 1.7.0. */
export const MAX_KB_PUBLISH_BYTES = 32 * 1024 * 1024;

/**
 * Body of `PUT /api/kb`: a scanned knowledge base (the `kb.json` the CLI writes), exactly as written.
 * Unknown top-level fields are refused, and the graph must be internally consistent, so a corrupt or
 * hand-edited file fails here instead of half-loading. Added in 1.7.0.
 */
export const PublishKbRequestSchema = KnowledgeBaseSnapshotSchema.strict().superRefine((kb, ctx) => {
  const problem = (message: string, path: Array<string | number> = []) => ctx.addIssue({ code: "custom", message, path });
  if (kb.nodes.length > 20_000) return problem("too many nodes (limit 20000)", ["nodes"]);
  if (kb.edges.length > 100_000) return problem("too many edges (limit 100000)", ["edges"]);
  if (kb.vectors.length > 20_000) return problem("too many vectors (limit 20000)", ["vectors"]);
  const workflows = new Set(kb.workflows.map((w) => w.id));
  if (workflows.size !== kb.workflows.length) problem("duplicate workflow id", ["workflows"]);
  const nodes = new Set<string>();
  kb.nodes.forEach((n, i) => {
    if (nodes.has(n.id)) problem(`duplicate node id ${n.id}`, ["nodes", i, "id"]);
    nodes.add(n.id);
    if (!workflows.has(n.workflowId)) problem(`node ${n.id} names an unknown workflow ${n.workflowId}`, ["nodes", i, "workflowId"]);
  });
  kb.edges.forEach((e, i) => {
    if (!nodes.has(e.from) || !nodes.has(e.to)) problem(`edge ${e.from} -> ${e.to} names an unknown node`, ["edges", i]);
  });
  const dims = new Set(kb.vectors.map((v) => v.vector.length));
  if (dims.size > 1) problem("vectors have different lengths", ["vectors"]);
  kb.vectors.forEach((v, i) => {
    if (!nodes.has(v.nodeId)) problem(`vector for unknown node ${v.nodeId}`, ["vectors", i, "nodeId"]);
    if (v.vector.some((x) => !Number.isFinite(x))) problem("vector has a value that is not a finite number", ["vectors", i, "vector"]);
  });
});
export type PublishKbRequest = z.infer<typeof PublishKbRequestSchema>;

export const PublishKbResponseSchema = z.object({
  /** `unchanged`: the server already serves exactly this knowledge base and nothing was written. */
  status: z.enum(["published", "unchanged"]),
  kbId: z.string().min(1),
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  workflows: z.array(z.string()),
  replaced: z.object({ prevKbId: z.string().nullable() }),
});
export type PublishKbResponse = z.infer<typeof PublishKbResponseSchema>;

export const WalkthroughRequestSchema = z.object({
  goal: z.string().trim().min(1).max(500),
  context: z.object({ url: z.string().max(2048).optional() }).optional(),
});
export type WalkthroughRequest = z.infer<typeof WalkthroughRequestSchema>;

/** Request body: raw audio bytes with Content-Type audio/* (e.g. audio/webm). */
export const TranscribeResponseSchema = z.object({
  text: z.string(),
  provider: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  contractVersion: z.string(),
  kbVersion: z.string().nullable(),
  mode: z.enum(["offline", "openrouter"]),
  transcription: z.boolean(),
  /** True once a knowledge base is loaded and walkthroughs can be served. Added in 1.1.0. */
  ready: z.boolean().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ErrorCodeSchema = z.enum([
  "bad_request",
  /** Missing or wrong API key (HTTP 401). Added in 1.1.0. */
  "unauthorized",
  "not_found",
  "payload_too_large",
  "unsupported_media_type",
  "transcription_unavailable",
  /** Model spend cap reached (HTTP 429). Added in 1.2.0. */
  "spend_cap_exceeded",
  /** Metrics store not readable (HTTP 503). Added in 1.2.0. */
  "metrics_unavailable",
  /** Authenticated but not allowed: disabled client or a model outside the allowlist (HTTP 403). Added in 1.4.0. */
  "forbidden",
  /** Too many requests from one client or address (HTTP 429). Added in 1.4.0. */
  "rate_limited",
  "kb_empty",
  /** A published knowledge base was built with a different embedder than the server's (HTTP 409). Added in 1.7.0. */
  "embedder_mismatch",
  /** A published knowledge base was built by an older scanner than the server accepts (HTTP 422). Added in 1.7.0. */
  "scanner_too_old",
  /** The request is valid but clashes with current state, e.g. a scanned workflow id equal to a published flow (HTTP 409). Added in 1.7.0. */
  "conflict",
  /** `X-HeyPointer-Client` is missing or not a client id (HTTP 401). Added in 1.8.0. */
  "client_required",
  /** The client id is unknown or revoked; the two are not told apart (HTTP 401). Added in 1.8.0. */
  "client_invalid",
  /** The request's Origin is not in the client's allowed origins (HTTP 403). Added in 1.8.0. */
  "client_origin_not_allowed",
  /** The tenant's plan does not allow another client id, key or flow (HTTP 403). The body also carries `limit` and `used`. Added in 1.9.0. */
  "plan_limit_reached",
  /** Wrong email or password, or a disabled account; the three are not told apart (HTTP 401). Added in 1.10.0. */
  "invalid_credentials",
  /** The invite is for an email that already has an account: log in first, then accept it (HTTP 409). Added in 1.10.0. */
  "account_exists_login_first",
  /** User accounts are not enabled on this server (HTTP 404). Added in 1.10.0. */
  "accounts_disabled",
  /** A cookie-authenticated request lacked a valid CSRF token or came from another origin (HTTP 403). Added in 1.10.0. */
  "csrf_failed",
  /** A HeyPointer staff account must turn on two-factor sign-in before it may use the operator routes (HTTP 403). Added in 1.11.0. */
  "operator_2fa_required",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Every non-2xx response has this body. transcription_unavailable uses HTTP 501. */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: ErrorCodeSchema,
  /** Human-readable text. Sent with the client_* codes, whose `error` is the code itself. Added in 1.8.0. */
  message: z.string().optional(),
  /** With `plan_limit_reached`: what the plan allows and how much the tenant already uses. Added in 1.9.0. */
  limit: z.number().int().nonnegative().optional(),
  used: z.number().int().nonnegative().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Inference metrics (added in 1.2.0)
// ---------------------------------------------------------------------------

/**
 * Aggregate inference metrics. Key-protected. Never includes prompts, keys or
 * response content. All numeric fields are finite and nonnegative.
 */
export const MetricsResponseSchema = z.object({
  calls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  p50Ms: z.number().nonnegative().finite(),
  p95Ms: z.number().nonnegative().finite(),
  estCostUsd: z.number().nonnegative().finite(),
  /** Models seen with no price on record, so estCostUsd may understate. */
  unpricedModels: z.array(z.string()),
  spendCapUsd: z.number().nonnegative().finite().nullable(),
  remainingUsd: z.number().nonnegative().finite().nullable(),
});
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

// ---------------------------------------------------------------------------
// Hosted inference ("llm-cloud", added in 1.4.0)
// ---------------------------------------------------------------------------

/** Routes under /api/cloud use `Authorization: Bearer <client token>`. Admin routes use the server API key. */
export const CLOUD_ROUTES = {
  enroll: "POST /api/cloud/enroll",
  me: "GET /api/cloud/me",
  logout: "POST /api/cloud/logout",
  createBatch: "POST /api/cloud/v1/batches",
  getBatch: "GET /api/cloud/v1/batches/{id}",
  decisions: "POST /api/cloud/alpha/decisions",
  adminCreateClient: "POST /api/admin/clients",
  adminListClients: "GET /api/admin/clients",
  adminNewCode: "POST /api/admin/clients/{id}/enrollment-codes",
  adminDisable: "POST /api/admin/clients/{id}/disable",
} as const;

export const CloudModelsSchema = z.object({ scan: z.string(), decision: z.string() });

/** One-time enrollment code in, long-lived client token out. The token is shown once. */
export const CloudEnrollRequestSchema = z.object({
  code: z.string().trim().min(8).max(40),
  deviceName: z.string().trim().max(80).optional(),
});
export type CloudEnrollRequest = z.infer<typeof CloudEnrollRequestSchema>;

export const CloudEnrollResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  token: z.string(),
  budgetUsd: z.number().nonnegative().finite(),
  models: CloudModelsSchema,
});
export type CloudEnrollResponse = z.infer<typeof CloudEnrollResponseSchema>;

export const CloudMeResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  budgetUsd: z.number().nonnegative().finite(),
  spentUsd: z.number().nonnegative().finite(),
  reservedUsd: z.number().nonnegative().finite(),
  remainingUsd: z.number().nonnegative().finite(),
  models: CloudModelsSchema,
});
export type CloudMeResponse = z.infer<typeof CloudMeResponseSchema>;

export const AdminCreateClientRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  budgetUsd: z.number().positive().max(100_000).finite(),
});
export type AdminCreateClientRequest = z.infer<typeof AdminCreateClientRequestSchema>;

export const AdminClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  budgetUsd: z.number().nonnegative().finite(),
  spentUsd: z.number().nonnegative().finite(),
  reservedUsd: z.number().nonnegative().finite(),
  disabled: z.boolean(),
  createdAt: z.string(),
});
export type AdminClient = z.infer<typeof AdminClientSchema>;

export const AdminCodeResponseSchema = z.object({
  client: AdminClientSchema,
  /** Shown once. Valid for a short time and a single use. */
  enrollmentCode: z.string(),
  expiresAt: z.string(),
});
export type AdminCodeResponse = z.infer<typeof AdminCodeResponseSchema>;

// ---------------------------------------------------------------------------
// Flows API (added in 1.6.0): add, edit and publish flows on a running server
// ---------------------------------------------------------------------------

/** Routes use `Authorization: Bearer <server API key>` when the server has one. */
export const FLOW_ROUTES = {
  list: "GET /api/flows",
  create: "POST /api/flows",
  get: "GET /api/flows/{id}",
  update: "PUT /api/flows/{id}",
  delete: "DELETE /api/flows/{id}",
  publish: "POST /api/flows/{id}/publish",
  unpublish: "POST /api/flows/{id}/unpublish",
  rollback: "POST /api/flows/{id}/rollback",
  validate: "POST /api/flows/validate",
} as const;

/** One step is a sentence in PRD style that quotes the control: `Click "Change plan"`. */
export const FlowInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  steps: z.array(z.string().trim().min(1).max(240)).min(1).max(40),
  /** Why this version was saved. Shown in the history. */
  note: z.string().trim().max(200).optional(),
});
export type FlowInput = z.infer<typeof FlowInputSchema>;

export const FlowVersionSchema = z.object({
  version: z.number().int().positive(),
  title: z.string(),
  steps: z.array(z.string()),
  note: z.string().optional(),
  savedAt: z.string(),
});
export type FlowVersion = z.infer<typeof FlowVersionSchema>;

/**
 * A flow as the API shows it. `version` is the latest saved one. Users are served only the
 * published version: saving more edits never changes what they see until the flow is published again.
 */
export const FlowSchema = z.object({
  id: z.string().regex(/^fl_[0-9a-f]{12}$/),
  title: z.string(),
  steps: z.array(z.string()),
  version: z.number().int().positive(),
  published: z.boolean(),
  publishedVersion: z.number().int().positive().optional(),
  hasUnpublishedChanges: z.boolean(),
  /** Why the latest saved version cannot be published yet. Empty when it can. */
  problems: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Flow = z.infer<typeof FlowSchema>;

export const FlowDetailSchema = FlowSchema.extend({
  /** Newest first. */
  versions: z.array(FlowVersionSchema),
});
export type FlowDetail = z.infer<typeof FlowDetailSchema>;

export const FlowListResponseSchema = z.object({ flows: z.array(FlowSchema) });
export type FlowListResponse = z.infer<typeof FlowListResponseSchema>;

export const FlowRollbackRequestSchema = z.object({ version: z.number().int().positive() });
export type FlowRollbackRequest = z.infer<typeof FlowRollbackRequestSchema>;

/** Dry run: how the server reads these steps, without saving anything. */
export const FlowValidateResponseSchema = z.object({
  ok: z.boolean(),
  problems: z.array(z.string()),
  steps: z.array(z.object({
    text: z.string(),
    action: StepActionSchema.optional(),
    target: z.string().optional(),
    /** The user is asked to confirm before this step. */
    gated: z.boolean(),
  })),
});
export type FlowValidateResponse = z.infer<typeof FlowValidateResponseSchema>;

// ---------------------------------------------------------------------------
// App clients (added in 1.8.0): who may ask for walkthroughs
// ---------------------------------------------------------------------------

/**
 * The header every walkthrough request carries. The value is a client id, which is a PUBLISHABLE
 * identifier: it ships in web pages and app packages, so it is not a secret and must not be
 * treated as one. It names who is asking (for revocation, origin limits, rate limits and
 * usage counts); it does not prove who is asking.
 */
export const CLIENT_ID_HEADER = "X-HeyPointer-Client";

/** `gfc_` and 24 lowercase hex characters (96 random bits). */
export const CLIENT_ID_PATTERN = /^gfc_[0-9a-f]{24}$/;
export const ClientIdSchema = z.string().regex(CLIENT_ID_PATTERN);

/** Routes use `Authorization: Bearer <server API key>`. */
export const CLIENT_ROUTES = {
  create: "POST /api/clients",
  list: "GET /api/clients",
  /** Revokes: the row stays, the id stops working. Repeating it is fine. */
  revoke: "DELETE /api/clients/{id}",
} as const;

export const MAX_CLIENT_ORIGINS = 20;

/** `scheme://host[:port]` with no path, query or fragment, exactly as a browser sends `Origin`. No wildcard. */
export const ClientOriginSchema = z.string().max(300).refine((v) => {
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.origin === v;
  } catch {
    return false;
  }
}, "an origin is scheme://host[:port] with no path (no wildcard)");

export const CreateClientRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).refine((v) => !/[\u0000-\u001f\u007f-\u009f]/.test(v), "name must not contain control characters"),
  /** Browser origins allowed to use this client. Empty or absent means any origin (native apps send none). */
  origins: z.array(ClientOriginSchema).max(MAX_CLIENT_ORIGINS).optional(),
});
export type CreateClientRequest = z.infer<typeof CreateClientRequestSchema>;

export const CreateClientResponseSchema = z.object({
  clientId: ClientIdSchema,
  name: z.string(),
  origins: z.array(z.string()),
  createdAt: z.string(),
  revoked: z.literal(false),
});
export type CreateClientResponse = z.infer<typeof CreateClientResponseSchema>;

export const AppClientSchema = z.object({
  clientId: ClientIdSchema,
  name: z.string(),
  origins: z.array(z.string()),
  createdAt: z.string(),
  revoked: z.boolean(),
  revokedAt: z.string().optional(),
  /** Last time a walkthrough request passed the gate. Updated about every 5 seconds, not per request. */
  lastUsedAt: z.string().nullable(),
  /** Walkthrough requests that passed the gate. */
  requests: z.number().int().nonnegative(),
});
export type AppClient = z.infer<typeof AppClientSchema>;

export const ClientListResponseSchema = z.object({ clients: z.array(AppClientSchema) });
export type ClientListResponse = z.infer<typeof ClientListResponseSchema>;

// ---------------------------------------------------------------------------
// Tenants and keys (added in 1.9.0): isolation between customers of one server
// ---------------------------------------------------------------------------

/**
 * A tenant owns its keys, app clients, flows and knowledge base. Nothing is shared between tenants.
 * The server operator (the server API key) creates tenants; a tenant's owner exchanges a one-time
 * enrollment code for a secret admin key and manages the tenant with it.
 */
export const TENANT_ID_PATTERN = /^tn_[0-9a-f]{12}$/;
export const TenantIdSchema = z.string().regex(TENANT_ID_PATTERN);
/** The tenant every pre-1.9.0 install is migrated into. Requests that name no tenant act on it. */
export const DEFAULT_TENANT_ID = "tn_000000000000";

/** A secret key: `gfk_a_` (admin) or `gfk_g_` (guide) and 48 lowercase hex characters (192 random bits). Shown once. */
export const KEY_SECRET_PATTERN = /^gfk_[ag]_[0-9a-f]{48}$/;
export const ADMIN_KEY_PATTERN = /^gfk_a_[0-9a-f]{48}$/;
export const GUIDE_KEY_PATTERN = /^gfk_g_[0-9a-f]{48}$/;
/** A key handle (not a secret): used to list and revoke keys. */
export const KEY_ID_PATTERN = /^kid_[0-9a-f]{12}$/;
export const KeyIdSchema = z.string().regex(KEY_ID_PATTERN);
/** A one-time enrollment code: `gfe_` and 32 lowercase hex characters. Valid for 15 minutes. */
export const ENROLL_CODE_PATTERN = /^gfe_[0-9a-f]{32}$/;
export const ENROLLMENT_TTL_MS = 15 * 60 * 1000;

export const KeyScopeSchema = z.enum(["admin", "guide"]);
export type KeyScope = z.infer<typeof KeyScopeSchema>;

/**
 * Tenant routes use a tenant admin key (`Authorization: Bearer gfk_a_...`). A guide key (`gfk_g_...`) may only fetch walkthroughs.
 */
export const TENANT_ROUTES = {
  /** No authentication: the code is the credential. Rate limited like failed key checks. */
  enroll: "POST /api/tenant/enroll",
  self: "GET /api/tenant",
  createKey: "POST /api/keys",
  listKeys: "GET /api/keys",
  /** Revokes. A tenant cannot revoke its last active admin key. Repeating it is fine. */
  revokeKey: "DELETE /api/keys/{id}",
} as const;

const NameSchema = z.string().trim().min(1).max(80).refine((v) => !/[\u0000-\u001f\u007f-\u009f]/.test(v), "name must not contain control characters");

/**
 * A plan names a set of limits. Plans are data on the server (`HEYPOINTER_PLAN_LIMITS_JSON` adds or changes
 * them), so a new tier needs no code. New tenants start on `free`; the migrated default tenant is `internal`.
 */
export const PlanNameSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,29}$/, "a plan name is lowercase letters, digits, - or _ (30 characters at most)");
export type PlanName = z.infer<typeof PlanNameSchema>;
export const DEFAULT_PLAN = "free";
const Count = z.number().int().nonnegative();
/** What a tenant may hold at once. Revoked clients and keys do not count; they stay on record. */
export const PlanLimitsSchema = z.object({
  clients: z.number().int().positive(),
  keys: z.number().int().positive(),
  flows: z.number().int().positive(),
  /** Team members plus pending invites. Added in 1.10.0; a plan that omits it gets the server default (free 3, internal 100). */
  members: z.number().int().positive().optional(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;
export const PlanUsageSchema = z.object({ clients: Count, keys: Count, flows: Count, /** Members plus pending invites. Added in 1.10.0. */ members: Count.optional() });
export type PlanUsage = z.infer<typeof PlanUsageSchema>;
/** A tenant's plan, what it allows, and what the tenant uses now. */
export const TenantPlanSchema = z.object({ plan: PlanNameSchema, limits: PlanLimitsSchema, usage: PlanUsageSchema });
export type TenantPlan = z.infer<typeof TenantPlanSchema>;

export const EnrollTenantRequestSchema = z.object({ code: z.string().max(100) });
export type EnrollTenantRequest = z.infer<typeof EnrollTenantRequestSchema>;

export const CreatedKeySchema = z.object({
  keyId: KeyIdSchema,
  scope: KeyScopeSchema,
  /** Shown once; only its hash is stored. */
  secret: z.string().regex(KEY_SECRET_PATTERN),
});
export type CreatedKey = z.infer<typeof CreatedKeySchema>;

export const EnrollTenantResponseSchema = z.object({
  tenantId: TenantIdSchema,
  name: z.string(),
  key: CreatedKeySchema.extend({ scope: z.literal("admin") }),
});
export type EnrollTenantResponse = z.infer<typeof EnrollTenantResponseSchema>;

export const CreateKeyRequestSchema = z.object({ name: NameSchema, scope: KeyScopeSchema });
export type CreateKeyRequest = z.infer<typeof CreateKeyRequestSchema>;

export const CreateKeyResponseSchema = CreatedKeySchema.extend({ name: z.string(), createdAt: z.string() });
export type CreateKeyResponse = z.infer<typeof CreateKeyResponseSchema>;

export const KeySummarySchema = z.object({
  keyId: KeyIdSchema,
  scope: KeyScopeSchema,
  name: z.string(),
  /** The first characters of the secret (e.g. `gfk_a_1a2b3c4d`), enough to recognise it. Not usable as a key. */
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revoked: z.boolean(),
});
export type KeySummary = z.infer<typeof KeySummarySchema>;

export const KeyListResponseSchema = z.object({ keys: z.array(KeySummarySchema) });
export type KeyListResponse = z.infer<typeof KeyListResponseSchema>;

export const TenantSelfResponseSchema = z.object({
  tenantId: TenantIdSchema,
  name: z.string(),
  createdAt: z.string(),
  /** Same as `usage`. */
  counts: PlanUsageSchema,
  /** `plan`, `limits` and `usage`. */
  ...TenantPlanSchema.shape,
});
export type TenantSelfResponse = z.infer<typeof TenantSelfResponseSchema>;

// ---------------------------------------------------------------------------
// Accounts and login (added in 1.10.0): people, sessions, invites, device login, audit
// ---------------------------------------------------------------------------

/**
 * People sign in to the web console with an email and password (OIDC providers come later) and get a session
 * cookie instead of pasting a key. Signup is invite-only. A user belongs to one or more tenants with a role.
 * Accounts exist only when the operator sets `HEYPOINTER_PUBLIC_URL` and `HEYPOINTER_AUTH_SECRET`; otherwise every
 * account route answers 404 `accounts_disabled` and keys keep working as before.
 */
export const USER_ID_PATTERN = /^usr_[0-9a-f]{12}$/;
export const UserIdSchema = z.string().regex(USER_ID_PATTERN);
export const SESSION_ID_PATTERN = /^ses_[0-9a-f]{12}$/;
export const INVITE_ID_PATTERN = /^inv_[0-9a-f]{12}$/;
/** An invite link token: shown once to the inviter inside the link. */
export const INVITE_TOKEN_PATTERN = /^gfi_[0-9a-f]{32}$/;
/** A password reset token: shown once inside the reset link; valid one hour. */
export const RESET_TOKEN_PATTERN = /^gfr_[0-9a-f]{32}$/;
/** The device code the CLI polls with. A secret: only its hash is stored. */
export const DEVICE_CODE_PATTERN = /^gfd_[0-9a-f]{40}$/;
/** What the person types in the browser: `ABCD-EFGH`, no vowels and no look-alike characters. */
export const USER_CODE_PATTERN = /^[BCDFGHJKLMNPQRSTVWXZ2-9]{4}-[BCDFGHJKLMNPQRSTVWXZ2-9]{4}$/;
export const RECOVERY_CODE_PATTERN = /^[0-9a-f]{5}-[0-9a-f]{5}$/;
/** The session cookie. With an https public URL the server sends it as `__Host-hp_session` (Secure). */
export const SESSION_COOKIE = "hp_session";
/** Every state-changing request authenticated by the session cookie must send the session's CSRF token here. */
export const CSRF_HEADER = "X-HeyPointer-CSRF";
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const DEVICE_TTL_SECONDS = 600;
export const DEVICE_POLL_INTERVAL_SECONDS = 5;

export const MemberRoleSchema = z.enum(["owner", "admin", "member"]);
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export const EmailSchema = z.string().trim().toLowerCase().max(254).email();

/** The routes added in 1.10.0. Session routes need the cookie and, when they change anything, the CSRF header and a same-origin `Origin`. */
export const ACCOUNT_ROUTES = {
  config: "GET /api/auth/config",
  login: "POST /api/auth/login",
  logout: "POST /api/auth/logout",
  session: "GET /api/auth/session",
  switchTenant: "POST /api/auth/tenant",
  inviteInfo: "GET /api/auth/invite/{token}",
  acceptInvite: "POST /api/auth/accept-invite",
  changePassword: "POST /api/auth/password",
  reset: "POST /api/auth/reset",
  totpEnroll: "POST /api/auth/totp/enroll",
  totpVerify: "POST /api/auth/totp/verify",
  totpDisable: "DELETE /api/auth/totp",
  listSessions: "GET /api/auth/sessions",
  revokeSession: "DELETE /api/auth/sessions/{id}",
  deviceStart: "POST /api/auth/device",
  deviceLookup: "GET /api/auth/device/lookup?userCode=",
  deviceApprove: "POST /api/auth/device/approve",
  deviceDeny: "POST /api/auth/device/deny",
  deviceToken: "POST /api/auth/device/token",
  cliLogin: "POST /api/auth/cli-login",
  listMembers: "GET /api/members",
  updateMember: "PATCH /api/members/{userId}",
  removeMember: "DELETE /api/members/{userId}",
  resetMember: "POST /api/members/{userId}/reset",
  listInvites: "GET /api/invites",
  createInvite: "POST /api/invites",
  revokeInvite: "DELETE /api/invites/{id}",
  audit: "GET /api/audit",
} as const;

/** A server without accounts answers `GET /api/auth/config` with 200 `{accounts:false}` (every other account route is a 404). */
export const AuthConfigDisabledSchema = z.object({ accounts: z.literal(false) });
export const AuthConfigResponseSchema = z.object({
  accounts: z.literal(true),
  passwordLogin: z.boolean(),
  /** OIDC providers the operator configured. Empty until OIDC login ships. */
  providers: z.array(z.object({ id: z.string(), name: z.string() })),
  publicUrl: z.string(),
});
export type AuthConfigResponse = z.infer<typeof AuthConfigResponseSchema>;

export const AccountUserSchema = z.object({ userId: UserIdSchema, email: z.string(), totpEnabled: z.boolean().optional(), /** Present and true for a HeyPointer staff account. Added in 1.11.0. */ operator: z.boolean().optional() });
export type AccountUser = z.infer<typeof AccountUserSchema>;
export const MembershipSchema = z.object({ tenantId: TenantIdSchema, name: z.string(), role: MemberRoleSchema });
export type Membership = z.infer<typeof MembershipSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().max(254),
  password: z.string().max(200),
  /** A 6-digit code from the authenticator app, or a recovery code (`xxxxx-xxxxx`). */
  totp: z.string().max(32).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    user: AccountUserSchema,
    tenants: z.array(MembershipSchema),
    /** The tenant the session acts on; null when the user belongs to several (choose one with `POST /api/auth/tenant`). */
    activeTenantId: TenantIdSchema.nullable(),
    csrfToken: z.string(),
  }),
  /** The password was right and the account has 2FA: repeat the request with `totp`. No cookie was set. */
  z.object({ status: z.literal("totp_required") }),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const SessionResponseSchema = z.object({
  user: AccountUserSchema,
  tenants: z.array(MembershipSchema),
  activeTenantId: TenantIdSchema.nullable(),
  /** The user's role in the active tenant. */
  role: MemberRoleSchema.nullable(),
  csrfToken: z.string(),
  /** True for a HeyPointer staff account (it may use the staff tools once two-factor sign-in is on). Added in 1.11.0. */
  operator: z.boolean().optional(),
  /** Of the active tenant. */
  plan: PlanNameSchema.optional(),
  limits: PlanLimitsSchema.optional(),
  usage: PlanUsageSchema.optional(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const SwitchTenantRequestSchema = z.object({ tenantId: TenantIdSchema });
export type SwitchTenantRequest = z.infer<typeof SwitchTenantRequestSchema>;

export const InviteInfoResponseSchema = z.object({
  email: z.string(),
  tenantName: z.string(),
  role: MemberRoleSchema,
  /** `operator` for a HeyPointer staff invite (then `tenantName` is "HeyPointer staff" and `role` is only a placeholder). Absent for a tenant invite. Added in 1.11.0. */
  kind: z.literal("operator").optional(),
});
export type InviteInfoResponse = z.infer<typeof InviteInfoResponseSchema>;

export const AcceptInviteRequestSchema = z.object({
  token: z.string().max(100),
  /** Required for a new account. An existing account logs in first and sends no password. */
  password: z.string().max(200).optional(),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;

export const ChangePasswordRequestSchema = z.object({ current: z.string().max(200), next: z.string().max(200) });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({ token: z.string().max(100), password: z.string().max(200) });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const TotpEnrollResponseSchema = z.object({ secretBase32: z.string(), otpauthUri: z.string() });
export type TotpEnrollResponse = z.infer<typeof TotpEnrollResponseSchema>;
export const TotpVerifyRequestSchema = z.object({ code: z.string().max(16) });
export type TotpVerifyRequest = z.infer<typeof TotpVerifyRequestSchema>;
/** Shown once. Each works once in place of an authenticator code. */
export const TotpVerifyResponseSchema = z.object({ recoveryCodes: z.array(z.string().regex(RECOVERY_CODE_PATTERN)).length(10) });
export type TotpVerifyResponse = z.infer<typeof TotpVerifyResponseSchema>;
export const TotpDisableRequestSchema = z.object({ password: z.string().max(200) });
export type TotpDisableRequest = z.infer<typeof TotpDisableRequestSchema>;

export const SessionSummarySchema = z.object({
  sessionId: z.string().regex(SESSION_ID_PATTERN),
  current: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  /** Coarse: the address with its last part removed, and the first 120 characters of the user agent. */
  ip: z.string(),
  userAgent: z.string(),
  tenantId: TenantIdSchema.nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export const SessionListResponseSchema = z.object({ sessions: z.array(SessionSummarySchema) });
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const MemberSchema = z.object({
  userId: UserIdSchema,
  email: z.string(),
  role: MemberRoleSchema,
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  totpEnabled: z.boolean(),
});
export type Member = z.infer<typeof MemberSchema>;
export const MemberListResponseSchema = z.object({ members: z.array(MemberSchema) });
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;
export const UpdateMemberRequestSchema = z.object({ role: MemberRoleSchema });
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequestSchema>;

export const CreateInviteRequestSchema = z.object({ email: EmailSchema, role: MemberRoleSchema });
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;
/** The link is shown once: the server sends no email, so the inviter passes it on. */
export const CreateInviteResponseSchema = z.object({
  inviteId: z.string().regex(INVITE_ID_PATTERN),
  email: z.string(),
  role: MemberRoleSchema,
  inviteLink: z.string(),
  expiresAt: z.string(),
});
export type CreateInviteResponse = z.infer<typeof CreateInviteResponseSchema>;
export const InviteSummarySchema = z.object({
  inviteId: z.string().regex(INVITE_ID_PATTERN),
  email: z.string(),
  role: MemberRoleSchema,
  invitedBy: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  status: z.enum(["pending", "expired"]),
});
export type InviteSummary = z.infer<typeof InviteSummarySchema>;
export const InviteListResponseSchema = z.object({ invites: z.array(InviteSummarySchema) });
export type InviteListResponse = z.infer<typeof InviteListResponseSchema>;
export const ResetLinkResponseSchema = z.object({ resetLink: z.string(), expiresAt: z.string() });
export type ResetLinkResponse = z.infer<typeof ResetLinkResponseSchema>;

const DeviceNameSchema = z.string().trim().min(1).max(60).refine((v) => !/[\u0000-\u001f\u007f-\u009f]/.test(v), "name must not contain control characters");
export const DeviceStartRequestSchema = z.object({ deviceName: DeviceNameSchema });
export type DeviceStartRequest = z.infer<typeof DeviceStartRequestSchema>;
export const DeviceStartResponseSchema = z.object({
  deviceCode: z.string().regex(DEVICE_CODE_PATTERN),
  userCode: z.string().regex(USER_CODE_PATTERN),
  verificationUri: z.string(),
  verificationUriComplete: z.string(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive(),
});
export type DeviceStartResponse = z.infer<typeof DeviceStartResponseSchema>;
export const DeviceLookupResponseSchema = z.object({ deviceName: z.string(), requestedAt: z.string() });
export type DeviceLookupResponse = z.infer<typeof DeviceLookupResponseSchema>;
export const DeviceDecisionRequestSchema = z.object({ userCode: z.string().max(20), tenantId: TenantIdSchema.optional() });
export type DeviceDecisionRequest = z.infer<typeof DeviceDecisionRequestSchema>;
export const DeviceTokenRequestSchema = z.object({ deviceCode: z.string().max(100) });
export type DeviceTokenRequest = z.infer<typeof DeviceTokenRequestSchema>;
export const DeviceTokenResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending"), interval: z.number().int().positive() }),
  z.object({ status: z.literal("slow_down"), interval: z.number().int().positive() }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("expired") }),
  /** Delivered once; the server forgets the key after this reply. */
  z.object({ status: z.literal("approved"), tenantId: TenantIdSchema, tenantName: z.string(), key: CreatedKeySchema.extend({ scope: z.literal("admin") }) }),
]);
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;

export const CliLoginRequestSchema = z.object({
  email: z.string().max(254),
  password: z.string().max(200),
  totp: z.string().max(32).optional(),
  tenantId: TenantIdSchema.optional(),
  deviceName: DeviceNameSchema,
});
export type CliLoginRequest = z.infer<typeof CliLoginRequestSchema>;
export const CliLoginResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), tenantId: TenantIdSchema, tenantName: z.string(), key: CreatedKeySchema.extend({ scope: z.literal("admin") }) }),
  z.object({ status: z.literal("totp_required") }),
  /** The user belongs to several tenants where they may mint keys: repeat with `tenantId`. */
  z.object({ status: z.literal("tenant_required"), tenants: z.array(MembershipSchema) }),
]);
export type CliLoginResponse = z.infer<typeof CliLoginResponseSchema>;

export const AuditActorSchema = z.object({ type: z.enum(["user", "key", "operator", "anonymous"]), id: z.string() });
export const AuditEntrySchema = z.object({
  id: z.number().int().positive(),
  ts: z.string(),
  tenantId: TenantIdSchema.nullable(),
  actor: AuditActorSchema,
  action: z.string(),
  target: z.string().nullable(),
  result: z.enum(["ok", "denied", "failed"]),
  /** In a tenant's own audit log: true when HeyPointer staff (the operator) did it. The staff member's identity is never shown to the tenant. Added in 1.11.0. */
  byStaff: z.boolean().optional(),
  /** A plain sentence for entries staff made on the tenant, e.g. "HeyPointer staff viewed your flow list". Added in 1.11.0. */
  description: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
/** Newest first. Pass `next` back as `before` for the following page; null when there is none. */
export const AuditListResponseSchema = z.object({ entries: z.array(AuditEntrySchema), next: z.number().int().positive().nullable() });
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;
