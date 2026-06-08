/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { makeError } from '../schemas/common.js';
import { log } from '../logging/logger.js';

// Defense in depth: runSfCommand streams child output to disk, so a maxBuffer
// overflow can no longer raise ENOBUFS. Should a residual ENOBUFS still surface
// (e.g. an exotic OS-level pipe condition), translate the opaque
// `spawnSync … ENOBUFS` into something the agent can act on rather than retry.
// Kept tool-agnostic because this handler is shared by every sf-backed tool
// (automation + Quality Hub); the test-run example is illustrative, not assumed.
const ENOBUFS_MESSAGE =
  'The sf command produced more output than could be captured. Its full output was written to disk ' +
  '(for test runs, under the resultsPath configured in your provardx-properties.json). ' +
  'Re-run the command directly in a terminal with --json, or reduce its output verbosity ' +
  '(for test runs, lower testOutputLevel, e.g. DETAILED → BASIC).';
const ENOBUFS_SUGGESTION =
  'Re-run the sf command directly with --json, or reduce its output verbosity ' +
  '(for test runs, lower testOutputLevel in provardx-properties.json).';

/**
 * Shared error handler for the sf-CLI-backed tools (automation + Quality Hub).
 * Surfaces a thrown spawn error as an MCP error response, translating a residual
 * ENOBUFS into actionable remediation and otherwise preserving the error's own
 * code (falling back to SF_ERROR).
 */
export function handleSpawnError(
  err: unknown,
  requestId: string,
  toolName: string
): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  const error = err as Error & { code?: string };
  log('error', `${toolName} failed`, { requestId, error: error.message });
  if (error.code === 'ENOBUFS') {
    return {
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            makeError('ENOBUFS', ENOBUFS_MESSAGE, requestId, false, { suggestion: ENOBUFS_SUGGESTION })
          ),
        },
      ],
    };
  }
  return {
    isError: true as const,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(makeError(error.code ?? 'SF_ERROR', error.message, requestId, false)),
      },
    ],
  };
}
