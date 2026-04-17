/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import https from 'node:https';
import { URL as NodeURL } from 'node:url';

/**
 * Quality Hub validation result — our internal normalised shape.
 * Mapped from the raw API response by normaliseApiResponse().
 * Also returned by the local validator so both paths share one shape.
 */
export interface QualityHubValidationResult {
  is_valid: boolean;
  validity_score: number;
  quality_score: number;
  issues: Array<{
    rule_id: string;
    severity: 'ERROR' | 'WARNING';
    message: string;
    applies_to?: string;
    suggestion?: string;
  }>;
}

// ── Raw API response types (confirmed with AWS team, 2026-04-10) ──────────────

interface QualityHubApiViolation {
  severity: 'critical' | 'major' | 'minor' | 'info';
  rule_id: string;
  name: string;
  description: string;
  category: string;
  message: string;
  test_item_id?: string;
  weight: number;
  recommendation: string;
  applies_to: string[];
}

interface QualityHubApiResponse {
  valid: boolean;
  errors: QualityHubApiViolation[];
  warnings: QualityHubApiViolation[];
  metadata: Record<string, unknown>;
  quality_metrics: {
    quality_score: number;
    max_score: number;
    total_violations: number;
    best_practices_grade: number;
  };
  validation_mode: string;
  validated_at: string;
}

/**
 * Map the raw API response to our internal validation result shape.
 * Exported for unit testing; called by validateTestCaseViaApi once the stub is replaced.
 *
 * Mapping rules (from AWS memo 2026-04-10):
 * raw.valid → is_valid
 * raw.errors[].severity "critical" → issues[].severity "ERROR"
 * raw.warnings[].severity * → issues[].severity "WARNING"
 * raw.quality_metrics.quality_score → quality_score
 * validity_score: 100 when valid, else max(0, 100 - errors.length * 20)
 */
export function normaliseApiResponse(raw: QualityHubApiResponse): QualityHubValidationResult {
  const issues = [
    ...raw.errors.map((v) => ({
      rule_id: v.rule_id,
      severity: 'ERROR' as const,
      message: v.message,
      applies_to: v.applies_to?.[0] as string | undefined,
      suggestion: v.recommendation,
    })),
    ...raw.warnings.map((v) => ({
      rule_id: v.rule_id,
      severity: 'WARNING' as const,
      message: v.message,
      applies_to: v.applies_to?.[0] as string | undefined,
      suggestion: v.recommendation,
    })),
  ];

  return {
    is_valid: raw.valid,
    validity_score: raw.valid ? 100 : Math.max(0, 100 - raw.errors.length * 20),
    quality_score: raw.quality_metrics.quality_score,
    issues,
  };
}

/**
 * Typed errors returned when the API call fails in a known way.
 * The MCP tool maps these to appropriate fallback behaviour.
 */
export class QualityHubAuthError extends Error {
  public readonly code = 'AUTH_ERROR';
}

export class QualityHubRateLimitError extends Error {
  public readonly code = 'RATE_LIMITED';
}

/**
 * POST /validate — submit XML to the Quality Hub validation API.
 *
 * Request:
 * POST <baseUrl>/validate
 * x-provar-key: pv_k_... (user auth — no x-api-key infra gate on this endpoint)
 * Content-Type: application/json
 * { "test_case_xml": "<full XML string>" }
 *
 * On failure the MCP tool catches and falls back to local validation
 * (validation_source: "local_fallback"). No user-visible crash.
 */
export async function validateTestCaseViaApi(
  xml: string,
  apiKey: string,
  baseUrl: string
): Promise<QualityHubValidationResult> {
  const body = JSON.stringify({ test_case_xml: xml });
  const { status, responseBody } = await httpsRequest(
    `${baseUrl}/validate`,
    'POST',
    { 'Content-Type': 'application/json', 'x-provar-key': apiKey },
    body
  );

  if (status === 401) {
    throw new QualityHubAuthError(
      'API key is invalid, expired, or revoked. Run `sf provar auth login` to get a new key.'
    );
  }

  if (status === 429) {
    throw new QualityHubRateLimitError('Quality Hub validation rate limit exceeded. Try again later.');
  }

  if (!isOk(status)) {
    throw new Error(`Quality Hub validate failed (${status}): ${responseBody}`);
  }

  return normaliseApiResponse(JSON.parse(responseBody) as QualityHubApiResponse);
}

/**
 * Returns the Quality Hub base URL to use for API calls.
 * Defaults to the dev environment URL; override via PROVAR_QUALITY_HUB_URL for production.
 * Update DEFAULT_QUALITY_HUB_URL when the production URL is confirmed.
 */
const DEFAULT_QUALITY_HUB_URL = 'https://aqqlrlhga7.execute-api.us-east-1.amazonaws.com/dev';

/**
 * Self-service access request page for users who do not yet have a Provar MCP account.
 * Public HTML — no API key or Cognito token required.
 * Update when staging/prod stages are deployed.
 */
export const REQUEST_ACCESS_URL = `${DEFAULT_QUALITY_HUB_URL}/auth/request-access`;

export function getQualityHubBaseUrl(): string {
  return process.env.PROVAR_QUALITY_HUB_URL ?? DEFAULT_QUALITY_HUB_URL;
}

// ── Auth endpoint types ───────────────────────────────────────────────────────

export interface AuthExchangeResponse {
  api_key: string;
  prefix: string;
  tier: string;
  username: string;
  expires_at: string;
}

export interface KeyStatusResponse {
  valid: boolean;
  tier?: string;
  username?: string;
  expires_at?: string;
}

// ── Auth endpoint functions ───────────────────────────────────────────────────

/**
 * POST /auth/exchange — exchange a Cognito access token for a pv_k_ key.
 * Called immediately after PKCE callback; Cognito tokens are discarded after this call.
 */
export async function exchangeTokenForKey(cognitoAccessToken: string, baseUrl: string): Promise<AuthExchangeResponse> {
  const body = JSON.stringify({ access_token: cognitoAccessToken });
  const { status, responseBody } = await httpsRequest(
    `${baseUrl}/auth/exchange`,
    'POST',
    { 'Content-Type': 'application/json' },
    body
  );
  if (status === 401)
    throw new QualityHubAuthError(
      `Account not found or no active subscription.\nRequest access at: ${REQUEST_ACCESS_URL}`
    );
  if (!isOk(status)) throw new Error(`Auth exchange failed (${status}): ${responseBody}`);
  return JSON.parse(responseBody) as AuthExchangeResponse;
}

/**
 * GET /auth/status — verify a stored pv_k_ key is still valid server-side.
 * Best-effort: callers should catch and fall back to locally cached values on failure.
 */
export async function fetchKeyStatus(apiKey: string, baseUrl: string): Promise<KeyStatusResponse> {
  const { status, responseBody } = await httpsRequest(`${baseUrl}/auth/status`, 'GET', {
    'x-provar-key': apiKey,
  });
  if (!isOk(status)) throw new Error(`Auth status check failed (${status})`);
  return JSON.parse(responseBody) as KeyStatusResponse;
}

/**
 * POST /auth/revoke — invalidate a pv_k_ key on the server.
 * Best-effort: callers should catch, log a note, then delete the local file regardless.
 */
export async function revokeKey(apiKey: string, baseUrl: string): Promise<void> {
  const { status, responseBody } = await httpsRequest(`${baseUrl}/auth/revoke`, 'POST', {
    'x-provar-key': apiKey,
    'Content-Length': '0',
  });
  if (!isOk(status)) throw new Error(`Key revocation failed (${status}): ${responseBody}`);
}

/**
 * POST /auth/rotate — atomically replace the current pv_k_ key with a new one.
 * The old key is invalidated immediately. Returns the same shape as /auth/exchange.
 * On 401: key is invalid/expired — caller should direct user to sf provar auth login.
 */
export async function rotateKey(apiKey: string, baseUrl: string): Promise<AuthExchangeResponse> {
  const { status, responseBody } = await httpsRequest(`${baseUrl}/auth/rotate`, 'POST', {
    'x-provar-key': apiKey,
    'Content-Length': '0',
  });
  if (status === 401)
    throw new QualityHubAuthError('API key is invalid or expired. Run `sf provar auth login` to get a new key.');
  if (!isOk(status)) throw new Error(`Key rotation failed (${status}): ${responseBody}`);
  return JSON.parse(responseBody) as AuthExchangeResponse;
}

// ── Corpus retrieval types ────────────────────────────────────────────────────

export interface CorpusExample {
  id: string;
  name: string;
  xml: string;
  similarity_score: number;
  salesforce_object: string;
  quality_tier: string;
  full_content?: boolean;
}

export interface CorpusRetrievalResponse {
  retrieval_id: string;
  examples: CorpusExample[];
  count: number;
  query_truncated: boolean;
}

export interface CorpusRetrievalOptions {
  n?: number;
  app_filter?: string;
  prefer_high_quality?: boolean;
}

// ── Corpus retrieval function ─────────────────────────────────────────────────

/**
 * POST /corpus/retrieve — fetch N similar Provar test examples from the Bedrock KB corpus.
 * Used by provar.qualityhub.examples.retrieve as the few-shot grounding step before
 * the client LLM synthesises a new test case.
 *
 * Throws QualityHubAuthError on 401, QualityHubRateLimitError on 429.
 * All other non-2xx responses throw a generic Error with status + body.
 */
export async function retrieveCorpusExamples(
  query: string,
  apiKey: string,
  baseUrl: string,
  options: CorpusRetrievalOptions = {}
): Promise<CorpusRetrievalResponse> {
  const n = Math.min(Math.max(options.n ?? 5, 1), 10);
  const body = JSON.stringify({
    query,
    n,
    ...(options.app_filter !== undefined ? { app_filter: options.app_filter } : {}),
    prefer_high_quality: options.prefer_high_quality ?? true,
  });

  const { status, responseBody } = await httpsRequest(
    `${baseUrl}/corpus/retrieve`,
    'POST',
    { 'Content-Type': 'application/json', 'x-provar-key': apiKey },
    body
  );

  if (status === 401) {
    throw new QualityHubAuthError(
      'API key is invalid, expired, or revoked. Run `sf provar auth login` to get a new key.'
    );
  }

  if (status === 429) {
    throw new QualityHubRateLimitError('Quality Hub corpus retrieval rate limit exceeded. Try again later.');
  }

  if (!isOk(status)) {
    throw new Error(`Corpus retrieval failed (${status}): ${responseBody}`);
  }

  return JSON.parse(responseBody) as CorpusRetrievalResponse;
}

// ── Internal HTTPS helper ─────────────────────────────────────────────────────

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

const REQUEST_TIMEOUT_MS = 30_000;

function httpsRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; responseBody: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new NodeURL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        ...headers,
        ...(body ? { 'Content-Length': Buffer.byteLength(body).toString() } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, responseBody: data }));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Quality Hub API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Indirection object used by MCP tools and testable via sinon ───────────────

/**
 * MCP tools and auth commands call qualityHubClient.X() so tests can replace
 * properties with stubs without ESM re-export issues.
 */
export const qualityHubClient = {
  validateTestCaseViaApi,
  exchangeTokenForKey,
  fetchKeyStatus,
  revokeKey,
  rotateKey,
  retrieveCorpusExamples,
};
