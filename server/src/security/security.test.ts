import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { csrfProtectionMiddleware } from "../csrf-middleware";
import { isAuthTokenStale, type AuthTokenPayload } from "../auth";
import { replyGenericInviteError } from "../invite-security";
import { readSecurityCounters, securityError } from "../security-utils";
import { createCompetitionSchema, loginSchema } from "../validators";

type MockRes = Partial<Response> & {
  statusCode?: number;
  body?: unknown;
};

function createResponse(): MockRes {
  const res: MockRes = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res as Response;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    return res as Response;
  };
  return res;
}

function createRequest(overrides?: Record<string, unknown>): Request {
  const mergedHeaders = {
    ...((overrides?.headers as Record<string, string | string[] | undefined> | undefined) ?? {}),
  };
  return {
    method: "POST",
    originalUrl: "/predictions",
    url: "/predictions",
    path: "/predictions",
    headers: mergedHeaders,
    header(name: string): string | string[] | undefined {
      const key = name.toLowerCase();
      const value = mergedHeaders[key];
      return value;
    },
    ...overrides,
  } as unknown as Request;
}

test("csrf middleware rechaza mutación sin header/cookie csrf", () => {
  const req = createRequest({
    headers: {
      cookie: "pp_access=token123; pp_csrf=abc123",
    },
  });
  const res = createResponse() as Response;
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };

  csrfProtectionMiddleware(req, res, next);

  assert.equal(called, false);
  assert.equal((res as unknown as MockRes).statusCode, 403);
  assert.deepEqual((res as unknown as MockRes).body, { error: "csrf_invalid" });
});

test("csrf middleware permite mutación con cookie+header válidos", () => {
  const req = createRequest({
    headers: {
      cookie: "pp_access=token123; pp_csrf=abc123",
      "x-csrf-token": "abc123",
    },
  });
  const res = createResponse() as Response;
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };

  csrfProtectionMiddleware(req, res, next);

  assert.equal(called, true);
});

test("csrf middleware exige token cuando llega Bearer sin cookie de sesión", () => {
  const req = createRequest({
    headers: {
      authorization: "Bearer abc.def.ghi",
    },
  });
  const res = createResponse() as Response;
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };

  csrfProtectionMiddleware(req, res, next);

  assert.equal(called, false);
  assert.equal((res as unknown as MockRes).statusCode, 403);
});

test("validators: login normaliza email con espacios", () => {
  const parsed = loginSchema.parse({
    email: "  TEST@EXAMPLE.COM ",
    password: "secret123",
  });
  assert.equal(parsed.email, "test@example.com");
});

test("validators: createCompetition rechaza nombre demasiado largo", () => {
  const parsed = createCompetitionSchema.safeParse({
    name: "a".repeat(26),
    maxMembers: 10,
  });
  assert.equal(parsed.success, false);
});

test("auth: token queda obsoleto si cambia tokenVersion/rol/empresa", () => {
  const payload: AuthTokenPayload = {
    userId: "u1",
    role: "member",
    companyId: "c1",
    tokenVersion: 1,
  };
  assert.equal(isAuthTokenStale(payload, { role: "member", companyId: "c1", tokenVersion: 1 }), false);
  assert.equal(isAuthTokenStale(payload, { role: "org_admin", companyId: "c1", tokenVersion: 1 }), true);
  assert.equal(isAuthTokenStale(payload, { role: "member", companyId: "c2", tokenVersion: 1 }), true);
  assert.equal(isAuthTokenStale(payload, { role: "member", companyId: "c1", tokenVersion: 2 }), true);
});

test("invite security: respuestas públicas son genéricas", () => {
  const res = createResponse() as Response;
  replyGenericInviteError(res);
  assert.equal((res as unknown as MockRes).statusCode, 404);
  assert.deepEqual((res as unknown as MockRes).body, { error: "invalid_invite" });
});

test("security metrics: securityError incrementa contadores clave", () => {
  const res = createResponse() as Response;
  securityError(res, 429, "too_many_requests");
  securityError(res, 403, "csrf_invalid");
  const counters = readSecurityCounters();
  assert.ok((counters.http_429 ?? 0) >= 1);
  assert.ok((counters.http_403 ?? 0) >= 1);
  assert.ok((counters.csrf_invalid ?? 0) >= 1);
});

