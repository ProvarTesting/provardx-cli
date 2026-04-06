/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { randomUUID } from 'node:crypto';

/** Stable error shape returned in every isError=true response */
export interface ErrorResponse {
  error_code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  requestId: string;
}

/** Single validation finding produced by the PO / TC validators */
export interface ValidationIssue {
  rule_id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  applies_to: string;
  suggestion?: string;
  line_number?: number;
}

export function makeError(
  code: string,
  message: string,
  requestId: string,
  retryable = false,
  details?: Record<string, unknown>
): ErrorResponse {
  return { error_code: code, message, retryable, details, requestId };
}

/** Generate a correlation ID for each tool invocation */
export function makeRequestId(): string {
  return randomUUID();
}
