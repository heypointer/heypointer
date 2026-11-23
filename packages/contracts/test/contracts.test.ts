// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { describe, expect, it } from "vitest";
import {
  AuditEntrySchema as OpAuditEntrySchema, AccountUserSchema, InviteInfoResponseSchema,
} from "../src/index.js";
import { WalkthroughSchema, WalkthroughRequestSchema, TargetSchema, PublishKbRequestSchema, PublishKbResponseSchema, CONTRACT_VERSION, CLIENT_ID_HEADER, CLIENT_ID_PATTERN, ClientIdSchema, CreateClientRequestSchema, ErrorResponseSchema,
  ADMIN_KEY_PATTERN, CreateKeyRequestSchema, DEFAULT_PLAN, DEFAULT_TENANT_ID, ENROLL_CODE_PATTERN, GUIDE_KEY_PATTERN, KEY_ID_PATTERN, KeyScopeSchema, MCP_KEY_PATTERN, MCP_SCOPES, McpScopeSchema, KeySummarySchema, CreateKeyResponseSchema, KEY_SECRET_PATTERN, PlanLimitsSchema, PlanNameSchema, TENANT_ID_PATTERN, TENANT_ROUTES, TenantSelfResponseSchema,
  ACCOUNT_ROUTES, CSRF_HEADER, CliLoginResponseSchema, CreateInviteRequestSchema, DEVICE_CODE_PATTERN, DeviceStartRequestSchema, DeviceTokenResponseSchema, ErrorCodeSchema, INVITE_ID_PATTERN, INVITE_TOKEN_PATTERN,
  LoginResponseSchema, PlanUsageSchema, RECOVERY_CODE_PATTERN, RESET_TOKEN_PATTERN, SESSION_COOKIE, USER_CODE_PATTERN, USER_ID_PATTERN, AuditEntrySchema, SessionResponseSchema, TotpVerifyResponseSchema } from "../src/index.js";

const evidence = [{ nodeId: "n1", sourceType: "e2e" as const, path: "fixtures/e2e/a.spec.ts", lineStart: 4, lineEnd: 4, excerpt: "click" }];
const step = {
  id: "s1", title: "Open Team", instruction: "Click Team", target: { role: "link", text: "Team" },
  action: "click" as const, requiresConfirmation: false, evidence,
};
const base = { id: "w1", goal: "invite", kbVersion: "v1", confidence: 0.9, planner: "deterministic" as const };

describe("WalkthroughSchema", () => {
  it("accepts a grounded ok walkthrough and defaults selectors", () => {
    const w = WalkthroughSchema.parse({ ...base, status: "ok", steps: [step] });
    expect(w.steps[0]!.target.selectors).toEqual([]);
  });
  it("rejects steps without evidence", () => {
    expect(WalkthroughSchema.safeParse({ ...base, status: "ok", steps: [{ ...step, evidence: [] }] }).success).toBe(false);
  });
  it("rejects ok with no steps", () => {
    expect(WalkthroughSchema.safeParse({ ...base, status: "ok", steps: [] }).success).toBe(false);
  });
  it("requires a message and no steps for insufficient_evidence", () => {
    expect(WalkthroughSchema.safeParse({ ...base, status: "insufficient_evidence", steps: [] }).success).toBe(false);
    expect(WalkthroughSchema.safeParse({ ...base, status: "insufficient_evidence", steps: [step], message: "x" }).success).toBe(false);
    expect(WalkthroughSchema.safeParse({ ...base, status: "insufficient_evidence", steps: [], message: "No evidence" }).success).toBe(true);
  });
});

describe("requests", () => {
  it("trims and bounds goals", () => {
    expect(WalkthroughRequestSchema.parse({ goal: "  invite  " }).goal).toBe("invite");
    expect(WalkthroughRequestSchema.safeParse({ goal: "   " }).success).toBe(false);
    expect(WalkthroughRequestSchema.safeParse({ goal: "x".repeat(501) }).success).toBe(false);
  });
  it("rejects empty selector strings", () => {
    expect(TargetSchema.safeParse({ selectors: [""] }).success).toBe(false);
  });
});

describe("PublishKbRequestSchema", () => {
  const prov = { sourceType: "prd" as const, path: "flows/a.md", lineStart: 1, lineEnd: 1, excerpt: "x", sourceHash: "abc" };
  const kb = () => ({
    version: "kb1", createdAt: "2026-01-01T00:00:00Z", scannerVersion: "0.1.1", embedder: "hash-v1-512",
    workflows: [{ id: "w1", title: "W", sources: ["flows/a.md"] }],
    nodes: [
      { id: "n1", workflowId: "w1", kind: "action" as const, label: "Click A", order: 0, provenance: [prov] },
      { id: "n2", workflowId: "w1", kind: "action" as const, label: "Click B", order: 1, provenance: [prov] },
    ],
    edges: [{ from: "n1", to: "n2", kind: "next" as const, weight: 1 }],
    vectors: [{ nodeId: "n1", text: "a", vector: [0.1, 0.2] }, { nodeId: "n2", text: "b", vector: [0.3, 0.4] }],
  });

  it("accepts a consistent scanned knowledge base and is version 1.14.0", () => {
    expect(CONTRACT_VERSION).toBe("1.14.0");
    expect(PublishKbRequestSchema.safeParse(kb()).success).toBe(true);
  });
  it("refuses unknown top-level fields", () => {
    expect(PublishKbRequestSchema.safeParse({ ...kb(), extra: 1 }).success).toBe(false);
  });
  it("refuses an inconsistent graph", () => {
    const dupe = kb(); dupe.nodes[1]!.id = "n1";
    const orphan = kb(); orphan.nodes[0]!.workflowId = "nope";
    const edge = kb(); edge.edges[0]!.to = "ghost";
    const vec = kb(); vec.vectors[0]!.nodeId = "ghost";
    const dims = kb(); dims.vectors[1]!.vector = [1];
    const nan = kb(); nan.vectors[0]!.vector = [Number.POSITIVE_INFINITY, 1];
    for (const bad of [dupe, orphan, edge, vec, dims]) expect(PublishKbRequestSchema.safeParse(bad).success).toBe(false);
    // JSON cannot carry Infinity, but a caller may build the object in memory.
    expect(PublishKbRequestSchema.safeParse(nan).success).toBe(false);
  });
  it("shapes the response", () => {
    expect(PublishKbResponseSchema.safeParse({ status: "unchanged", kbId: "kb1", nodes: 2, edges: 1, workflows: ["w1"], replaced: { prevKbId: null } }).success).toBe(true);
    expect(PublishKbResponseSchema.safeParse({ status: "maybe", kbId: "kb1", nodes: 2, edges: 1, workflows: [], replaced: { prevKbId: null } }).success).toBe(false);
  });
});

describe("app clients", () => {
  it("names the header and the id format", () => {
    expect(CLIENT_ID_HEADER).toBe("X-HeyPointer-Client");
    expect(CLIENT_ID_PATTERN.test("hpc_0123456789abcdef01234567")).toBe(true);
    for (const bad of ["", "hpc_", "hpc_0123456789ABCDEF01234567", "hpc_0123456789abcdef0123456", "hpc_0123456789abcdef012345678", "xfc_0123456789abcdef01234567", " hpc_0123456789abcdef01234567"]) {
      expect(ClientIdSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("validates a create request: name, origins, no wildcard, no paths", () => {
    expect(CreateClientRequestSchema.parse({ name: "  Shop  ", origins: ["https://shop.example.com", "http://localhost:5175"] }).name).toBe("Shop");
    expect(CreateClientRequestSchema.safeParse({ name: "Android app" }).success).toBe(true);
    for (const bad of [{ name: "" }, { name: "x".repeat(81) }, { name: "a\u0007b" }, { name: "ok", origins: ["*"] }, { name: "ok", origins: ["https://a.example.com/path"] }, { name: "ok", origins: ["ftp://a.example.com"] }, { name: "ok", origins: ["https://A.example.com"] }, { name: "ok", origins: Array.from({ length: 21 }, (_, i) => `https://a${i}.example.com`) }]) {
      expect(CreateClientRequestSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });
  it("lets an error response carry a message", () => {
    expect(ErrorResponseSchema.parse({ error: "client_required", code: "client_required", message: "send the header" }).message).toBe("send the header");
    expect(ErrorResponseSchema.safeParse({ error: "x", code: "client_invalid" }).success).toBe(true);
  });
});

describe("tenants, keys and plans", () => {
  const hex = (n: number, c = "a") => c.repeat(n);
  it("has patterns that accept exactly the issued shapes", () => {
    expect(TENANT_ID_PATTERN.test(DEFAULT_TENANT_ID)).toBe(true);
    expect(TENANT_ID_PATTERN.test(`tn_${hex(12)}`)).toBe(true);
    for (const bad of [`tn_${hex(11)}`, `tn_${hex(13)}`, `TN_${hex(12)}`, `tn_${hex(12, "g")}`]) expect(TENANT_ID_PATTERN.test(bad), bad).toBe(false);
    expect(ADMIN_KEY_PATTERN.test(`hpk_a_${hex(48)}`)).toBe(true);
    expect(GUIDE_KEY_PATTERN.test(`hpk_g_${hex(48)}`)).toBe(true);
    expect(KEY_SECRET_PATTERN.test(`hpk_a_${hex(48)}`) && KEY_SECRET_PATTERN.test(`hpk_g_${hex(48)}`)).toBe(true);
    for (const bad of [`hpk_x_${hex(48)}`, `hpk_a_${hex(47)}`, `hpk_a_${hex(49)}`, `hpk_a_${hex(48, "G")}`, `hpc_${hex(24)}`]) expect(KEY_SECRET_PATTERN.test(bad), bad).toBe(false);
    expect(ADMIN_KEY_PATTERN.test(`hpk_g_${hex(48)}`)).toBe(false);
    expect(MCP_KEY_PATTERN.test(`hpk_m_${hex(48)}`)).toBe(true);
    expect(KEY_SECRET_PATTERN.test(`hpk_m_${hex(48)}`)).toBe(true);
    for (const bad of [`hpk_m_${hex(47)}`, `hpk_m_${hex(49)}`, `hpk_m_${hex(48, "G")}`, `hpk_a_${hex(48)}`, `hpk_g_${hex(48)}`]) expect(MCP_KEY_PATTERN.test(bad), bad).toBe(false);
    expect(ADMIN_KEY_PATTERN.test(`hpk_m_${hex(48)}`) || GUIDE_KEY_PATTERN.test(`hpk_m_${hex(48)}`)).toBe(false);
    expect(KEY_ID_PATTERN.test(`kid_${hex(12)}`)).toBe(true);
    expect(ENROLL_CODE_PATTERN.test(`hpe_${hex(32)}`)).toBe(true);
    expect(ENROLL_CODE_PATTERN.test(`hpe_${hex(31)}`)).toBe(false);
  });

  it("has an mcp key kind besides admin and guide, and the key request accepts it (1.12.0)", () => {
    expect(KeyScopeSchema.options).toEqual(["admin", "guide", "mcp"]);
    expect(CreateKeyRequestSchema.safeParse({ name: "agent", scope: "mcp" }).success).toBe(true);
    expect(CreateKeyRequestSchema.safeParse({ name: "agent", scope: "agent" }).success).toBe(false);
  });

  it("still accepts every identifier issued before the hp prefixes (gf*), and refuses mixed or malformed ones", () => {
    expect(CLIENT_ID_PATTERN.test("gfc_0123456789abcdef01234567")).toBe(true);
    expect(CLIENT_ID_PATTERN.test("gfc_ea6fae0123456789abcdef01")).toBe(true);
    expect(ADMIN_KEY_PATTERN.test(`gfk_a_${hex(48)}`)).toBe(true);
    expect(GUIDE_KEY_PATTERN.test(`gfk_g_${hex(48)}`)).toBe(true);
    expect(KEY_SECRET_PATTERN.test(`gfk_a_${hex(48)}`) && KEY_SECRET_PATTERN.test(`gfk_g_${hex(48)}`)).toBe(true);
    expect(ENROLL_CODE_PATTERN.test(`gfe_${hex(32)}`)).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test(`gfi_${hex(32)}`)).toBe(true);
    expect(RESET_TOKEN_PATTERN.test(`gfr_${hex(32)}`)).toBe(true);
    expect(DEVICE_CODE_PATTERN.test(`gfd_${hex(40)}`)).toBe(true);
    // the MCP key never had a legacy form, and a legacy admin key is not a guide key
    expect(KEY_SECRET_PATTERN.test(`gfk_m_${hex(48)}`)).toBe(false);
    expect(GUIDE_KEY_PATTERN.test(`gfk_a_${hex(48)}`)).toBe(false);
    expect(ADMIN_KEY_PATTERN.test(`gfk_g_${hex(48)}`)).toBe(false);
    for (const bad of ["gfc_short", `gfk_x_${hex(48)}`, `gfq_${hex(24)}`, `hpc-${hex(24)}`, `gfc_${hex(23)}`]) {
      expect(CLIENT_ID_PATTERN.test(bad) || KEY_SECRET_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("lets an MCP key choose its access and carries its expiry (1.13.0), all optional so older clients still parse", () => {
    expect(MCP_SCOPES).toEqual(["mcp:read", "mcp:write"]);
    expect(McpScopeSchema.safeParse("mcp:admin").success).toBe(false);
    expect(CreateKeyRequestSchema.safeParse({ name: "agent", scope: "mcp", mcpScopes: ["mcp:read", "mcp:write"] }).success).toBe(true);
    expect(CreateKeyRequestSchema.safeParse({ name: "agent", scope: "mcp", mcpScopes: [] }).success).toBe(false);
    expect(CreateKeyRequestSchema.safeParse({ name: "agent", scope: "mcp", mcpScopes: ["write"] }).success).toBe(false);
    const summary = { keyId: "kid_0123456789ab", scope: "mcp", name: "n", prefix: "hpk_m_12345678", createdAt: "2026-11-22T00:00:00Z", lastUsedAt: null, revoked: false };
    expect(KeySummarySchema.safeParse(summary).success).toBe(true);
    expect(KeySummarySchema.safeParse({ ...summary, expiresAt: "2026-11-29T00:00:00Z", mcpScopes: ["mcp:read"] }).success).toBe(true);
    expect(KeySummarySchema.safeParse({ ...summary, expiresAt: null }).success).toBe(true);
    const created = { keyId: "kid_0123456789ab", scope: "mcp", secret: `hpk_m_${hex(48)}`, name: "n", createdAt: "2026-11-22T00:00:00Z" };
    expect(CreateKeyResponseSchema.safeParse(created).success).toBe(true);
    expect(CreateKeyResponseSchema.safeParse({ ...created, expiresAt: "2026-11-29T00:00:00Z", mcpScopes: ["mcp:read"] }).success).toBe(true);
  });

  it("has the enrollment and key routes, and none of the operator ones", () => {
    expect(Object.values(TENANT_ROUTES)).toEqual(expect.arrayContaining(["POST /api/tenant/enroll", "GET /api/tenant", "POST /api/keys", "GET /api/keys", "DELETE /api/keys/{id}"]));
    expect(Object.values(TENANT_ROUTES).some((r) => /\/api\/tenants/.test(r))).toBe(false);
  });

  it("validates names, scopes and plans", () => {
    expect(CreateKeyRequestSchema.safeParse({ name: "k", scope: "guide" }).success).toBe(true);
    expect(CreateKeyRequestSchema.safeParse({ name: "k", scope: "root" }).success).toBe(false);
    expect(DEFAULT_PLAN).toBe("free");
    expect(PlanNameSchema.safeParse("pro-2").success).toBe(true);
    expect(PlanNameSchema.safeParse("2pro").success).toBe(false);
    expect(PlanLimitsSchema.safeParse({ clients: 2, keys: 5, flows: 100 }).success).toBe(true);
    expect(PlanLimitsSchema.safeParse({ clients: 0, keys: 5, flows: 100 }).success).toBe(false);
  });

  it("describes a tenant with its plan, limits and usage, and a plan-limit error with the numbers", () => {
    const plan = { plan: "free", limits: { clients: 2, keys: 5, flows: 100 }, usage: { clients: 0, keys: 1, flows: 0 } };
    expect(TenantSelfResponseSchema.safeParse({ tenantId: DEFAULT_TENANT_ID, name: "x", createdAt: "t", counts: plan.usage, ...plan }).success).toBe(true);
    expect(ErrorResponseSchema.parse({ error: "plan_limit_reached", code: "plan_limit_reached", message: "m", limit: 2, used: 2 })).toMatchObject({ limit: 2, used: 2 });
  });
});

describe("accounts and login (1.10.0)", () => {
  const hex = (n: number) => "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718".slice(0, n);

  it("names the identifiers and their lifetimes", () => {
    expect(USER_ID_PATTERN.test(`usr_${hex(12)}`)).toBe(true);
    expect(USER_ID_PATTERN.test(`usr_${hex(11)}`)).toBe(false);
    expect(INVITE_ID_PATTERN.test(`inv_${hex(12)}`)).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test(`hpi_${hex(32)}`)).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test(`hpi_${hex(31)}`)).toBe(false);
    expect(RESET_TOKEN_PATTERN.test(`hpr_${hex(32)}`)).toBe(true);
    expect(DEVICE_CODE_PATTERN.test(`hpd_${hex(40)}`)).toBe(true);
    expect(RECOVERY_CODE_PATTERN.test("0a1b2-3c4d5")).toBe(true);
    expect(RECOVERY_CODE_PATTERN.test("0A1B2-3C4D5")).toBe(false);
    expect([SESSION_COOKIE, CSRF_HEADER]).toEqual(["hp_session", "X-HeyPointer-CSRF"]);
  });

  it("writes the device user code without vowels or look-alikes", () => {
    for (const ok of ["BCDF-GHJK", "XZ23-4567", "2222-9999"]) expect(USER_CODE_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ["ABCD-EFGH", "BCDF-GHJ0", "BCDF-GHJ1", "BCDFGHJK", "bcdf-ghjk", "BCD-FGHJK"]) expect(USER_CODE_PATTERN.test(bad), bad).toBe(false);
  });

  it("lists the new error codes", () => {
    for (const code of ["invalid_credentials", "account_exists_login_first", "accounts_disabled", "csrf_failed"]) expect(ErrorCodeSchema.safeParse(code).success, code).toBe(true);
    expect(ErrorCodeSchema.safeParse("totally_new").success).toBe(false);
  });

  it("lowercases and validates invite emails and roles", () => {
    expect(CreateInviteRequestSchema.parse({ email: "  Ann@Example.COM ", role: "admin" })).toEqual({ email: "ann@example.com", role: "admin" });
    for (const bad of [{ email: "nope", role: "admin" }, { email: "a@b.co", role: "root" }, { email: "a@b.co" }, { email: `${"x".repeat(250)}@b.co`, role: "member" }]) expect(CreateInviteRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("answers a login either signed in or asking for the second factor, and nothing else", () => {
    const ok = { status: "ok", user: { userId: `usr_${hex(12)}`, email: "a@b.co" }, tenants: [{ tenantId: DEFAULT_TENANT_ID, name: "x", role: "owner" }], activeTenantId: null, csrfToken: "t" };
    expect(LoginResponseSchema.safeParse(ok).success).toBe(true);
    expect(LoginResponseSchema.safeParse({ status: "totp_required" }).success).toBe(true);
    expect(LoginResponseSchema.safeParse({ ...ok, status: "maybe" }).success).toBe(false);
    expect(LoginResponseSchema.safeParse({ ...ok, tenants: [{ tenantId: "tn_x", name: "x", role: "owner" }] }).success).toBe(false);
    expect(SessionResponseSchema.safeParse({ user: ok.user, tenants: ok.tenants, activeTenantId: DEFAULT_TENANT_ID, role: "owner", csrfToken: "t", plan: "free", limits: { clients: 2, keys: 5, flows: 100, members: 3 }, usage: { clients: 0, keys: 0, flows: 0, members: 1 } }).success).toBe(true);
  });

  it("delivers a device key only when approved, and only an admin key", () => {
    const key = { keyId: `kid_${hex(12)}`, scope: "admin", secret: `hpk_a_${hex(48)}` };
    expect(DeviceTokenResponseSchema.safeParse({ status: "approved", tenantId: DEFAULT_TENANT_ID, tenantName: "x", key }).success).toBe(true);
    expect(DeviceTokenResponseSchema.safeParse({ status: "approved", tenantId: DEFAULT_TENANT_ID, tenantName: "x", key: { ...key, scope: "guide", secret: `hpk_g_${hex(48)}` } }).success).toBe(false);
    expect(DeviceTokenResponseSchema.safeParse({ status: "approved", tenantId: DEFAULT_TENANT_ID, tenantName: "x" }).success).toBe(false);
    expect(DeviceTokenResponseSchema.safeParse({ status: "pending", interval: 5 }).success).toBe(true);
    expect(DeviceTokenResponseSchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(DeviceTokenResponseSchema.safeParse({ status: "denied" }).success).toBe(true);
    expect(CliLoginResponseSchema.safeParse({ status: "tenant_required", tenants: [{ tenantId: DEFAULT_TENANT_ID, name: "x", role: "admin" }] }).success).toBe(true);
    expect(CliLoginResponseSchema.safeParse({ status: "totp_required" }).success).toBe(true);
  });

  it("limits device names to 60 characters without control characters", () => {
    expect(DeviceStartRequestSchema.parse({ deviceName: "  Ann's laptop " })).toEqual({ deviceName: "Ann's laptop" });
    for (const bad of ["", "x".repeat(61), "a\u0007b"]) expect(DeviceStartRequestSchema.safeParse({ deviceName: bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it("keeps the members limit and usage optional, so a 1.9.0 plan table still parses", () => {
    expect(PlanLimitsSchema.safeParse({ clients: 2, keys: 5, flows: 100 }).success).toBe(true);
    expect(PlanLimitsSchema.safeParse({ clients: 2, keys: 5, flows: 100, members: 3 }).success).toBe(true);
    expect(PlanLimitsSchema.safeParse({ clients: 2, keys: 5, flows: 100, members: 0 }).success).toBe(false);
    expect(PlanUsageSchema.safeParse({ clients: 0, keys: 0, flows: 0 }).success).toBe(true);
    expect(PlanUsageSchema.safeParse({ clients: 0, keys: 0, flows: 0, members: 2 }).success).toBe(true);
  });

  it("describes audit entries and recovery codes", () => {
    expect(AuditEntrySchema.safeParse({ id: 1, ts: "t", tenantId: null, actor: { type: "anonymous", id: "-" }, action: "login.failed", target: "a@b.co", result: "failed" }).success).toBe(true);
    expect(AuditEntrySchema.safeParse({ id: 0, ts: "t", tenantId: null, actor: { type: "anonymous", id: "-" }, action: "x", target: null, result: "ok" }).success).toBe(false);
    expect(AuditEntrySchema.safeParse({ id: 1, ts: "t", tenantId: null, actor: { type: "robot", id: "-" }, action: "x", target: null, result: "ok" }).success).toBe(false);
    const codes = Array.from({ length: 10 }, (_, i) => `0a1b${i}-3c4d5`);
    expect(TotpVerifyResponseSchema.safeParse({ recoveryCodes: codes }).success).toBe(true);
    expect(TotpVerifyResponseSchema.safeParse({ recoveryCodes: codes.slice(1) }).success).toBe(false);
  });

  it("lists every route", () => {
    expect(Object.values(ACCOUNT_ROUTES)).toEqual(expect.arrayContaining(["POST /api/auth/login", "POST /api/auth/accept-invite", "POST /api/auth/device/token", "POST /api/auth/cli-login", "GET /api/members", "POST /api/invites", "GET /api/audit"]));
  });
});

describe("staff accounts as the public API shows them (1.11.0)", () => {
  it("knows the staff error code", () => {
    expect(ErrorCodeSchema.safeParse("operator_2fa_required").success).toBe(true);
  });

  it("keeps 1.10.0 clients working: the new fields are optional", () => {
    expect(AccountUserSchema.safeParse({ userId: "usr_0123456789ab", email: "a@b.co" }).success).toBe(true);
    expect(AccountUserSchema.safeParse({ userId: "usr_0123456789ab", email: "a@b.co", operator: true }).success).toBe(true);
    expect(SessionResponseSchema.safeParse({ user: { userId: "usr_0123456789ab", email: "a@b.co" }, tenants: [], activeTenantId: null, role: null, csrfToken: "c" }).success).toBe(true);
    expect(SessionResponseSchema.safeParse({ user: { userId: "usr_0123456789ab", email: "a@b.co", operator: true }, tenants: [], activeTenantId: null, role: null, csrfToken: "c", operator: true }).success).toBe(true);
    expect(InviteInfoResponseSchema.safeParse({ email: "a@b.co", tenantName: "T", role: "owner" }).success).toBe(true);
    expect(InviteInfoResponseSchema.safeParse({ email: "a@b.co", tenantName: "HeyPointer staff", role: "admin", kind: "operator" }).success).toBe(true);
    expect(OpAuditEntrySchema.safeParse({ id: 1, ts: "t", tenantId: "tn_000000000000", actor: { type: "operator", id: "operator" }, action: "operator.view_flows", target: "3 flows", result: "ok", byStaff: true, description: "HeyPointer staff viewed your flow list" }).success).toBe(true);
  });
});
