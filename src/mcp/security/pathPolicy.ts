/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import path from 'node:path';

export class PathPolicyError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(message);
    this.name = 'PathPolicyError';
    this.code = code;
  }
}

/**
 * Asserts that filePath is within at least one of allowedPaths.
 *
 * Throws PathPolicyError with code:
 * - PATH_TRAVERSAL  — path contains `..` segments
 * - PATH_NOT_ALLOWED — resolved path is outside all allowed roots
 *
 * When allowedPaths is empty, all paths are permitted (unrestricted mode).
 */
export function assertPathAllowed(filePath: string, allowedPaths: string[]): void {
  if (filePath.includes('..')) {
    throw new PathPolicyError('PATH_TRAVERSAL', `Path traversal detected: ${filePath}`);
  }
  const resolved = path.resolve(filePath);
  const resolvedAllowed = allowedPaths.map((p) => path.resolve(p));
  if (
    resolvedAllowed.length > 0 &&
    !resolvedAllowed.some((base) => resolved === base || resolved.startsWith(base + path.sep))
  ) {
    throw new PathPolicyError(
      'PATH_NOT_ALLOWED',
      `Path "${resolved}" is not within allowed paths: [${resolvedAllowed.join(', ')}]`
    );
  }
}
