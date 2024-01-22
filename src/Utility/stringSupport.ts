/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Deals with the custom operations on strings.
 *
 * @author Palak Bansal
 */

export function substringAfter(str: string, separator: string): string {
  if (!str) {
    return str;
  }
  if (separator == null) {
    return '';
  }
  const pos = str.indexOf(separator);
  if (pos === -1) {
    return '';
  }

  return str.substring(pos + separator.length);
}
export function addQuotesAround(array: string[]): string[] {
  return array.map((item) => "'" + item + "'");
}
