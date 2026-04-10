/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */

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
      applies_to: v.applies_to[0] as string | undefined,
      suggestion: v.recommendation,
    })),
    ...raw.warnings.map((v) => ({
      rule_id: v.rule_id,
      severity: 'WARNING' as const,
      message: v.message,
      applies_to: v.applies_to[0] as string | undefined,
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
 * STUB: throws until the Phase 1 API URL is provided by the AWS team.
 * When this throws, the MCP tool catches it and falls back to local validation
 * (validation_source: "local_fallback"). No user-visible crash.
 *
 * Replace this stub with a real fetch() call once PROVAR_QUALITY_HUB_URL is set.
 * Expected request (from AWS memo 2026-04-10):
 * POST <baseUrl>/validate
 * Headers: x-api-key: <getInfraKey()> (infra gate), x-provar-key: pv_k_... (user auth)
 * Body: { test_case_xml: xml }
 *
 * Map response status:
 * 401 → throw new QualityHubAuthError(...)
 * 429 → throw new QualityHubRateLimitError(...)
 * 5xx/network error → throw Error(...) [triggers "unreachable" fallback]
 *
 * Normalise response via normaliseApiResponse(raw).
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export function validateTestCaseViaApi(
  _xml: string,
  _apiKey: string,
  _baseUrl: string
): Promise<QualityHubValidationResult> {
  // TODO: replace with real HTTP call after Phase 1 handoff from AWS team
  return Promise.reject(
    new Error('Quality Hub API URL not configured yet. Set PROVAR_QUALITY_HUB_URL. (Stub — pending Phase 1 handoff)')
  );
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * Returns the Quality Hub base URL to use for API calls.
 * Reads PROVAR_QUALITY_HUB_URL env var; falls back to empty string until production URL is known.
 */
export function getQualityHubBaseUrl(): string {
  return process.env.PROVAR_QUALITY_HUB_URL ?? '';
}

/**
 * Returns the shared AWS API Gateway infra key.
 * This is NOT the per-user pv_k_ key — it is a shared constant for all CLI users,
 * used as the outer API Gateway gate (spam protection). Read from PROVAR_INFRA_KEY env var;
 * the production value will be bundled as a default constant after Phase 1 handoff.
 */
export function getInfraKey(): string {
  return process.env.PROVAR_INFRA_KEY ?? '';
}

/**
 * Indirection object used by the MCP tool and testable via sinon.
 * testCaseValidate.ts calls qualityHubClient.validateTestCaseViaApi(...)
 * so tests can replace the property with a stub without ESM re-export issues.
 */
export const qualityHubClient = {
  validateTestCaseViaApi,
};
