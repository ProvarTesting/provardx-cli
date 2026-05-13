/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Mask an object (or array of objects) to retain only the specified fields.
 *
 * - Top-level keys: `"name"` keeps only the `name` property
 * - Dot notation:   `"steps.action"` keeps the `steps` array but only `action` within each element
 * - Unknown field names are silently ignored — never an error
 * - Arrays: masking is applied to every element
 *
 * @param obj    Source object or array (typed as unknown; cast internally, never through any)
 * @param fields Parsed field list — each entry is a dot-path string
 */
export function maskFields(obj: unknown, fields: string[]): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => maskFields(item, fields));
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  const source = obj as Record<string, unknown>;

  // Group fields: topLevelKeys contains every key to retain.
  // dotFields[key] holds the sub-paths to drill into for that key.
  const topLevelKeys = new Set<string>();
  const dotFields: Record<string, string[]> = {};

  for (const field of fields) {
    const dotIdx = field.indexOf('.');
    if (dotIdx === -1) {
      topLevelKeys.add(field);
    } else {
      const top = field.slice(0, dotIdx);
      const rest = field.slice(dotIdx + 1);
      topLevelKeys.add(top);
      if (!dotFields[top]) dotFields[top] = [];
      dotFields[top].push(rest);
    }
  }

  const result: Record<string, unknown> = {};
  for (const key of topLevelKeys) {
    if (!(key in source)) continue; // silently ignore unknown fields
    const subPaths = dotFields[key];
    if (subPaths) {
      const val = source[key];
      // Dot-path into a primitive can't be narrowed; omit rather than leak the whole value.
      if (Array.isArray(val) || (val !== null && typeof val === 'object')) {
        result[key] = maskFields(val, subPaths);
      }
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Parse a comma-separated fields string into a trimmed, non-empty field list.
 * Returns null when the string is absent or blank (caller should skip masking).
 */
export function parseFieldsParam(fields: string | undefined): string[] | null {
  if (!fields) return null;
  const parsed = fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}
