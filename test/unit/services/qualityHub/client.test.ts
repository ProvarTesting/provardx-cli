/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { strict as assert } from 'node:assert';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { describe, it } from 'mocha';
import sinon from 'sinon';
import {
  normaliseApiResponse,
  retrieveCorpusExamples,
  QualityHubAuthError,
  QualityHubRateLimitError,
} from '../../../../src/services/qualityHub/client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_RESPONSE = {
  valid: true,
  errors: [] as Array<typeof ERROR_VIOLATION>,
  warnings: [] as Array<typeof WARNING_VIOLATION>,
  metadata: {},
  quality_metrics: { quality_score: 92, max_score: 100, total_violations: 0, best_practices_grade: 92 },
  validation_mode: 'both',
  validated_at: '2026-04-10T21:00:00Z',
};

const ERROR_VIOLATION = {
  severity: 'critical' as const,
  rule_id: 'TC_001',
  name: 'XML Declaration',
  description: 'Missing XML declaration',
  category: 'Structure',
  message: 'File must start with <?xml version="1.0"?>',
  weight: 5,
  recommendation: 'Add XML declaration as the first line.',
  applies_to: ['testcase'],
};

const WARNING_VIOLATION = {
  severity: 'major' as const,
  rule_id: 'BP-STEP-001',
  name: 'Step Description Required',
  description: 'Step missing description attribute',
  category: 'StepQuality',
  message: 'Step 1 is missing a description',
  weight: 3,
  recommendation: 'Add a description attribute to the step.',
  applies_to: ['testcase', 'step'],
};

// ── normaliseApiResponse ──────────────────────────────────────────────────────

describe('normaliseApiResponse', () => {
  it('maps valid:true → is_valid:true and validity_score:100', () => {
    const r = normaliseApiResponse(BASE_RESPONSE);
    assert.equal(r.is_valid, true);
    assert.equal(r.validity_score, 100);
  });

  it('maps valid:false → is_valid:false and validity_score < 100', () => {
    const r = normaliseApiResponse({ ...BASE_RESPONSE, valid: false, errors: [ERROR_VIOLATION] });
    assert.equal(r.is_valid, false);
    assert.ok(r.validity_score < 100);
  });

  it('validity_score is never negative regardless of error count', () => {
    const manyErrors = Array.from({ length: 10 }, () => ERROR_VIOLATION);
    const r = normaliseApiResponse({ ...BASE_RESPONSE, valid: false, errors: manyErrors });
    assert.ok(r.validity_score >= 0);
  });

  it('maps quality_metrics.quality_score → quality_score', () => {
    const r = normaliseApiResponse(BASE_RESPONSE);
    assert.equal(r.quality_score, 92);
  });

  it('maps errors[] → issues with severity ERROR', () => {
    const r = normaliseApiResponse({ ...BASE_RESPONSE, valid: false, errors: [ERROR_VIOLATION] });
    const issue = r.issues.find((i) => i.rule_id === 'TC_001');
    assert.ok(issue, 'Expected TC_001 in issues');
    assert.equal(issue.severity, 'ERROR');
    assert.equal(issue.message, ERROR_VIOLATION.message);
    assert.equal(issue.suggestion, ERROR_VIOLATION.recommendation);
    assert.equal(issue.applies_to, 'testcase');
  });

  it('maps warnings[] → issues with severity WARNING', () => {
    const r = normaliseApiResponse({ ...BASE_RESPONSE, warnings: [WARNING_VIOLATION] });
    const issue = r.issues.find((i) => i.rule_id === 'BP-STEP-001');
    assert.ok(issue, 'Expected BP-STEP-001 in issues');
    assert.equal(issue.severity, 'WARNING');
    assert.equal(issue.message, WARNING_VIOLATION.message);
    assert.equal(issue.suggestion, WARNING_VIOLATION.recommendation);
    // applies_to: first element of the array
    assert.equal(issue.applies_to, 'testcase');
  });

  it('combines errors and warnings into a single issues array in order (errors first)', () => {
    const r = normaliseApiResponse({
      ...BASE_RESPONSE,
      valid: false,
      errors: [ERROR_VIOLATION],
      warnings: [WARNING_VIOLATION],
    });
    assert.equal(r.issues.length, 2);
    assert.equal(r.issues[0].severity, 'ERROR');
    assert.equal(r.issues[1].severity, 'WARNING');
  });

  it('returns empty issues array when both arrays are empty', () => {
    const r = normaliseApiResponse(BASE_RESPONSE);
    assert.equal(r.issues.length, 0);
  });

  it('handles violation with empty applies_to array gracefully', () => {
    const violation = { ...ERROR_VIOLATION, applies_to: [] };
    assert.doesNotThrow(() => normaliseApiResponse({ ...BASE_RESPONSE, valid: false, errors: [violation] }));
    const r = normaliseApiResponse({ ...BASE_RESPONSE, valid: false, errors: [violation] });
    assert.equal(r.issues[0].applies_to, undefined);
  });
});

// ── retrieveCorpusExamples ────────────────────────────────────────────────────

const MOCK_CORPUS_RESPONSE = JSON.stringify({
  retrieval_id: 'ret-abc123',
  examples: [
    {
      id: 'tier4/SalesCloud/create_opportunity.xml',
      name: 'create_opportunity',
      xml: '<testCase guid="abc"><steps/></testCase>',
      similarity_score: 0.94,
      salesforce_object: 'Opportunity',
      quality_tier: 'tier4',
    },
  ],
  count: 1,
  query_truncated: false,
});

function makeHttpsStub(statusCode: number, body: string): sinon.SinonStub {
  const stub = sinon.stub(https, 'request');
  (stub as any).callsFake((_opts: unknown, cb: (res: EventEmitter & { statusCode: number }) => void) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = statusCode;
    const req = new EventEmitter() as EventEmitter & {
      write: sinon.SinonStub;
      end: sinon.SinonStub;
      setTimeout: sinon.SinonStub;
      destroy: sinon.SinonStub;
    };
    req.write = sinon.stub();
    req.end = sinon.stub().callsFake(() => {
      if (cb) cb(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    req.setTimeout = sinon.stub();
    req.destroy = sinon.stub();
    return req;
  });
  return stub;
}

describe('retrieveCorpusExamples', () => {
  afterEach(() => sinon.restore());

  it('returns parsed corpus response on 200', async () => {
    makeHttpsStub(200, MOCK_CORPUS_RESPONSE);

    const result = await retrieveCorpusExamples('Create an Opportunity', 'pv_k_test', 'https://api.example.com');

    assert.equal(result.retrieval_id, 'ret-abc123');
    assert.equal(result.count, 1);
    assert.equal(result.examples[0].name, 'create_opportunity');
    assert.equal(result.query_truncated, false);
  });

  it('throws QualityHubAuthError on 401', async () => {
    makeHttpsStub(401, '{"error":"Unauthorized"}');

    await assert.rejects(
      () => retrieveCorpusExamples('query', 'bad_key', 'https://api.example.com'),
      QualityHubAuthError
    );
  });

  it('throws QualityHubRateLimitError on 429', async () => {
    makeHttpsStub(429, '{"error":"Too Many Requests"}');

    await assert.rejects(
      () => retrieveCorpusExamples('query', 'pv_k_test', 'https://api.example.com'),
      QualityHubRateLimitError
    );
  });

  it('throws generic Error on 500', async () => {
    makeHttpsStub(500, '{"error":"Internal Server Error"}');

    await assert.rejects(
      () => retrieveCorpusExamples('query', 'pv_k_test', 'https://api.example.com'),
      (err: Error) => err.message.includes('500')
    );
  });

  it('clamps n to [1, 10] — n=50 becomes 10', async () => {
    let capturedBody = '';
    const stub = sinon.stub(https, 'request');
    (stub as any).callsFake((_opts: unknown, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & {
        write: (data: string) => void;
        end: sinon.SinonStub;
        setTimeout: sinon.SinonStub;
        destroy: sinon.SinonStub;
      };
      req.write = (data: string): void => {
        capturedBody += data;
      };
      req.end = sinon.stub().callsFake(() => {
        if (cb) cb(res);
        res.emit('data', Buffer.from(MOCK_CORPUS_RESPONSE));
        res.emit('end');
      });
      req.setTimeout = sinon.stub();
      req.destroy = sinon.stub();
      return req;
    });

    await retrieveCorpusExamples('query', 'pv_k_test', 'https://api.example.com', { n: 50 });

    const parsed = JSON.parse(capturedBody) as { n: number };
    assert.equal(parsed.n, 10);
  });

  it('sends app_filter and prefer_high_quality when provided', async () => {
    let capturedBody = '';
    const stub = sinon.stub(https, 'request');
    (stub as any).callsFake((_opts: unknown, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & {
        write: (data: string) => void;
        end: sinon.SinonStub;
        setTimeout: sinon.SinonStub;
        destroy: sinon.SinonStub;
      };
      req.write = (data: string): void => {
        capturedBody += data;
      };
      req.end = sinon.stub().callsFake(() => {
        if (cb) cb(res);
        res.emit('data', Buffer.from(MOCK_CORPUS_RESPONSE));
        res.emit('end');
      });
      req.setTimeout = sinon.stub();
      req.destroy = sinon.stub();
      return req;
    });

    await retrieveCorpusExamples('query', 'pv_k_test', 'https://api.example.com', {
      app_filter: 'SalesCloud',
      prefer_high_quality: false,
    });

    const parsed = JSON.parse(capturedBody) as { app_filter: string; prefer_high_quality: boolean };
    assert.equal(parsed.app_filter, 'SalesCloud');
    assert.equal(parsed.prefer_high_quality, false);
  });

  it('omits app_filter from request body when not provided', async () => {
    let capturedBody = '';
    const stub = sinon.stub(https, 'request');
    (stub as any).callsFake((_opts: unknown, cb: (res: EventEmitter & { statusCode: number }) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter() as EventEmitter & {
        write: (data: string) => void;
        end: sinon.SinonStub;
        setTimeout: sinon.SinonStub;
        destroy: sinon.SinonStub;
      };
      req.write = (data: string): void => {
        capturedBody += data;
      };
      req.end = sinon.stub().callsFake(() => {
        if (cb) cb(res);
        res.emit('data', Buffer.from(MOCK_CORPUS_RESPONSE));
        res.emit('end');
      });
      req.setTimeout = sinon.stub();
      req.destroy = sinon.stub();
      return req;
    });

    await retrieveCorpusExamples('query', 'pv_k_test', 'https://api.example.com');

    const parsed = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.ok(!('app_filter' in parsed), 'app_filter should not be in request body when not specified');
  });
});
