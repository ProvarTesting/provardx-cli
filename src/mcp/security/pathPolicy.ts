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
    // Path doesn't exist — walk up the ancestor hierarchy to find the deepest existing directory,
    // resolve symlinks there, then re-attach the non-existent tail segments. This handles macOS
    // where os.tmpdir() returns /var/... (a symlink to /private/var/...) and intermediate dirs
    // for a new output path may not yet exist.
    const full = path.resolve(filePath);
    let cur = full;
    const tail: string[] = [];
    while (!fs.existsSync(cur) && cur !== path.dirname(cur)) {
      tail.unshift(path.basename(cur));
      cur = path.dirname(cur);
    }
    try {
      resolved = path.join(fs.realpathSync(cur), ...tail);
    } catch {
      resolved = full;
    }
  }

  const resolvedAllowed = allowedPaths.map((p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(path.normalize(p));
    }
  });

  // Windows file paths are case-insensitive; fs.realpathSync does not always
  // canonicalize drive-letter case (e.g. `c:\` vs `C:\`), so compare case-insensitively.
  const isWindows = process.platform === 'win32';
  const normalizeForCompare = (p: string): string => (isWindows ? p.toLowerCase() : p);
  const resolvedKey = normalizeForCompare(resolved);

  if (
    resolvedAllowed.length > 0 &&
    !resolvedAllowed.some((base) => {
      const rawBaseKey = normalizeForCompare(base);
      // Strip trailing separator unless base is a filesystem root (/ on Unix, C:\ on Windows).
      // A trailing sep from user input like "/tmp/" would otherwise cause double-sep prefix
      // checks ("startsWith('/tmp//')") and equality mismatches ("/tmp" !== "/tmp/").
      const isRoot = rawBaseKey === path.sep || (isWindows && /^[a-z]:[/\\]$/.test(rawBaseKey));
      const baseKey = !isRoot && rawBaseKey.endsWith(path.sep) ? rawBaseKey.slice(0, -1) : rawBaseKey;
      return resolvedKey === baseKey || resolvedKey.startsWith(baseKey + path.sep);
    })
  ) {
    throw new PathPolicyError(
      'PATH_NOT_ALLOWED',
      `Path "${resolved}" is not within allowed paths: [${resolvedAllowed.join(', ')}]`
    );
  }
}
