/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { BUNDLED_EXAMPLES, selectBundledExamples } from '../../../src/mcp/examples/bundledExamples.js';
import { runBestPractices } from '../../../src/mcp/tools/bestPracticesEngine.js';
import { validateTestCase } from '../../../src/mcp/tools/testCaseValidate.js';

// Every bundled example MUST pass the same validators the server exposes — otherwise
// we would be shipping the exact "looks right but is wrong" XML the fix set out to prevent.

describe('bundled examples', () => {
  it('ships at least one example', () => {
    assert.ok(BUNDLED_EXAMPLES.length >= 1);
  });

  for (const ex of BUNDLED_EXAMPLES) {
    describe(`example: ${ex.id}`, () => {
      it('is structurally valid (validity_score 100, is_valid)', () => {
        const meta = validateTestCase(ex.xml, undefined, {});
        assert.equal(meta.is_valid, true, `structural errors: ${JSON.stringify(meta.issues ?? [])}`);
        assert.equal(meta.validity_score, 100);
      });

      it('scores 100 with zero best-practice violations', () => {
        const bp = runBestPractices(ex.xml);
        assert.equal(
          bp.violations.length,
          0,
          `violations: ${bp.violations.map((v) => `${v.rule_id}: ${v.message}`).join(' | ')}`
        );
        assert.equal(bp.quality_score, 100);
      });
    });
  }

  it('selectBundledExamples returns up to n, labelled bundled, with full XML', () => {
    const picked = selectBundledExamples('create and validate an account via ui', 5);
    assert.ok(picked.length >= 1 && picked.length <= 5);
    assert.ok(picked.every((p) => p.source === 'bundled' && p.quality_tier === 'bundled'));
    assert.ok(picked[0].xml.includes('<testCase'));
  });

  // Relevance gate: the bundle is Salesforce-UI shaped only. Handing an Account UI
  // example back for a REST/database/NitroX query is worse than returning nothing —
  // the caller pattern-matches whatever it receives. An empty result routes it to
  // provar_step_schema, which does cover those step types.
  it('returns NOTHING for a query with zero keyword overlap', () => {
    assert.deepEqual(selectBundledExamples('zzz nothing matches here', 1), []);
    assert.deepEqual(selectBundledExamples('rest api soap request database insert', 5), []);
  });

  it('ranks a keyword-matching example and keeps similarity_score below a real corpus match', () => {
    const onTopic = selectBundledExamples('ui account create validate', 1)[0];
    assert.ok(onTopic, 'an on-topic query must still return the bundled example');
    assert.ok(onTopic.similarity_score > 0, 'on-topic match scores above zero');
    assert.ok(onTopic.similarity_score < 1, 'keyword proxy must never claim a perfect corpus-grade match');
  });
});
