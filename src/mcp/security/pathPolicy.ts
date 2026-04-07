/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
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
 *
 * Symlinks are resolved via fs.realpathSync so that a symlink inside an allowed
 * directory pointing to a location outside it cannot bypass containment.
 * If the path does not yet exist (e.g. an output file to be created), the parent
 * directory is resolved instead and the basename re-attached.
 */
export function assertPathAllowed(filePath: string, allowedPaths: string[]): void {
  // Check the original path for `..` segments before any normalization resolves them away
  const rawSegments = filePath.split(/[/\\]+/).filter((s) => s.length > 0);
  if (rawSegments.some((s) => s === '..')) {
    throw new PathPolicyError('PATH_TRAVERSAL', `Path traversal detected: ${filePath}`);
  }

  // Resolve symlinks so a symlink inside an allowed dir that points outside cannot bypass
  // the containment check. Fall back to lexical resolution when the path doesn't exist yet.
  let resolved: string;
  try {
    resolved = fs.realpathSync(filePath);
  } catch {
    // Path doesn't exist — resolve the parent (which should exist) to catch symlinks there
    const parent = path.dirname(path.resolve(filePath));
    try {
      resolved = path.join(fs.realpathSync(parent), path.basename(filePath));
    } catch {
      resolved = path.resolve(filePath);
    }
  }

  const resolvedAllowed = allowedPaths.map((p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(path.normalize(p));
    }
  });

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
