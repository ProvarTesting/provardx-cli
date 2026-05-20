/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { WARNING_CODES, formatWarning } from '../../../../src/mcp/utils/warningCodes.js';

describe('WARNING_CODES', () => {
  const expected: Record<string, string> = {
    PROVARHOME_001: 'PROVARHOME-001',
    DATA_001: 'DATA-001',
    PARALLEL_001: 'PARALLEL-001',
    SCHEMA_001: 'SCHEMA-001',
    RUN_001: 'RUN-001',
    JUNIT_001: 'JUNIT-001',
  };

  it('maps each key to its expected wire string', () => {
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(
        (WARNING_CODES as Record<string, string>)[key],
        value,
        `WARNING_CODES.${key} should equal '${value}'`
      );
    }
  });

  // Guards against silent enum drift: a new code added without updating this test,
  // or an accidentally-removed code, must fail the build.
  it('contains exactly the expected key set (no additions, no omissions)', () => {
    assert.deepEqual(Object.keys(WARNING_CODES).sort(), Object.keys(expected).sort());
  });

  it('contains exactly the expected value set (no additions, no omissions)', () => {
    assert.deepEqual(Object.values(WARNING_CODES).sort(), Object.values(expected).sort());
  });
});

describe('formatWarning', () => {
  it('returns the prefixed message exactly when no suggestion is provided', () => {
    assert.equal(
      formatWarning(WARNING_CODES.PROVARHOME_001, 'provarHome is missing'),
      'WARNING [PROVARHOME-001]: provarHome is missing'
    );
  });

  it('appends the "Did you mean" suffix exactly when a suggestion is provided', () => {
    assert.equal(
      formatWarning(WARNING_CODES.SCHEMA_001, "unknown key 'parralelMode'", 'parallelMode'),
      "WARNING [SCHEMA-001]: unknown key 'parralelMode' Did you mean 'parallelMode'?"
    );
  });

  it('omits the suffix when suggestion is an empty string', () => {
    assert.equal(
      formatWarning(WARNING_CODES.DATA_001, 'data-table iteration not bound', ''),
      'WARNING [DATA-001]: data-table iteration not bound'
    );
  });
});
