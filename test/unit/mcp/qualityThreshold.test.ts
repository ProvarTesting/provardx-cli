/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { strict as assert } from 'node:assert';
import { describe, it, afterEach } from 'mocha';
import { resolveQualityThreshold, DEFAULT_QUALITY_THRESHOLD } from '../../../src/mcp/utils/qualityThreshold.js';

describe('resolveQualityThreshold (PDX-509)', () => {
  const saved = process.env.PROVAR_MCP_QUALITY_THRESHOLD;

  afterEach(() => {
    if (saved !== undefined) process.env.PROVAR_MCP_QUALITY_THRESHOLD = saved;
    else delete process.env.PROVAR_MCP_QUALITY_THRESHOLD;
  });

  it('defaults to 90', () => {
    delete process.env.PROVAR_MCP_QUALITY_THRESHOLD;
    assert.equal(DEFAULT_QUALITY_THRESHOLD, 90);
    assert.equal(resolveQualityThreshold(), 90);
  });

  it('honours a valid per-call arg over everything', () => {
    process.env.PROVAR_MCP_QUALITY_THRESHOLD = '50';
    assert.equal(resolveQualityThreshold(80), 80);
  });

  it('falls back to the env var when no arg is given', () => {
    process.env.PROVAR_MCP_QUALITY_THRESHOLD = '70';
    assert.equal(resolveQualityThreshold(), 70);
  });

  it('ignores an out-of-range arg and falls through to env, then default', () => {
    process.env.PROVAR_MCP_QUALITY_THRESHOLD = '65';
    assert.equal(resolveQualityThreshold(150), 65, 'arg 150 is out of range → env');
    delete process.env.PROVAR_MCP_QUALITY_THRESHOLD;
    assert.equal(resolveQualityThreshold(-5), 90, 'arg -5 is out of range, no env → default');
  });

  it('ignores an unparseable or out-of-range env var', () => {
    process.env.PROVAR_MCP_QUALITY_THRESHOLD = 'not-a-number';
    assert.equal(resolveQualityThreshold(), 90);
    process.env.PROVAR_MCP_QUALITY_THRESHOLD = '999';
    assert.equal(resolveQualityThreshold(), 90);
  });

  it('accepts the boundary values 0 and 100', () => {
    delete process.env.PROVAR_MCP_QUALITY_THRESHOLD;
    assert.equal(resolveQualityThreshold(0), 0);
    assert.equal(resolveQualityThreshold(100), 100);
  });
});
