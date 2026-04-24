/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
/**
 * Provar Best Practices Engine — TypeScript port of quality-hub-agents/lambda/src/validator/best_practices_engine.py
 *
 * Loads rules from provar_best_practices_rules.json and validates XML test cases,
 * producing violations and a quality score using the exact same weighted deduction
 * formula as the Lambda service to guarantee score parity between API and MCP.
 *
 * Scoring formula (matching Lambda exactly):
 * score = max(0, 100 − Σ(weight × severity_mult × effective_count))
 * severity_mult = { critical:1.0, major:0.75, minor:0.5, info:0.25 }
 * effective_count = count > 1 ? 1 + log2(count) : 1 (diminishing returns)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

// ── Rule / config interfaces ──────────────────────────────────────────────────

interface BPCheck {
  [key: string]: unknown;
  type: string;
}

interface BPRule {
  id: string;
  category: string;
  name: string;
  description: string;
  appliesTo: string[];
  severity: 'critical' | 'major' | 'minor' | 'info';
  weight: number;
  recommendation: string;
  check: BPCheck;
}

interface BPRulesConfig {
  schemaVersion: string;
  rules: BPRule[];
  scoring?: { defaultMaxScore: number };
}

// ── Public output interfaces ──────────────────────────────────────────────────

export interface BPViolation {
  rule_id: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  weight: number;
  message: string;
  recommendation: string;
  applies_to: string[];
  count?: number;
}

export interface BPEngineResult {
  quality_score: number;
  violations: BPViolation[];
  rules_evaluated: number;
}

export interface BPMetadata {
  testName?: string;
  filePath?: string;
}

// ── Rules loading (lazy, module-level singleton) ──────────────────────────────

const dirPath = dirname(fileURLToPath(import.meta.url));
let rulesConfig: BPRulesConfig | null = null;

function getRulesConfig(): BPRulesConfig {
  if (!rulesConfig) {
    try {
      const raw = readFileSync(join(dirPath, '..', 'rules', 'provar_best_practices_rules.json'), 'utf-8');
      rulesConfig = JSON.parse(raw) as BPRulesConfig;
    } catch {
      rulesConfig = { schemaVersion: '1.0', rules: [], scoring: { defaultMaxScore: 100 } };
    }
  }
  return rulesConfig;
}

// ── Valid Provar API IDs (extracted from provar_test_step_schema.json) ────────

const VALID_API_IDS = new Set<string>([
  // Bundled — assertions & control flow
  'com.provar.plugins.bundled.apis.AssertValues',
  'com.provar.plugins.bundled.apis.If',
  'com.provar.plugins.bundled.apis.Switch',
  'com.provar.plugins.bundled.apis.SwitchCase',
  'com.provar.plugins.bundled.apis.control.Break',
  'com.provar.plugins.bundled.apis.control.Fail',
  'com.provar.plugins.bundled.apis.control.Finally',
  'com.provar.plugins.bundled.apis.control.ForEach',
  'com.provar.plugins.bundled.apis.control.StepGroup',
  'com.provar.plugins.bundled.apis.control.SetValues',
  'com.provar.plugins.bundled.apis.control.Sleep',
  'com.provar.plugins.bundled.apis.control.WaitFor',
  'com.provar.plugins.bundled.apis.control.DoWhile',
  'com.provar.plugins.bundled.apis.control.ActualResult',
  'com.provar.plugins.bundled.apis.control.DesignStep',
  'com.provar.plugins.bundled.apis.control.CallTest',
  'com.provar.plugins.bundled.apis.control.TryCatchFinally',
  // Bundled — database
  'com.provar.plugins.bundled.apis.db.DbConnect',
  'com.provar.plugins.bundled.apis.db.DbDelete',
  'com.provar.plugins.bundled.apis.db.DbInsert',
  'com.provar.plugins.bundled.apis.db.DbRead',
  'com.provar.plugins.bundled.apis.db.DbUpdate',
  'com.provar.plugins.bundled.apis.db.SqlQuery',
  // Bundled — REST / SOAP
  'com.provar.plugins.bundled.apis.restservice.WebConnect',
  'com.provar.plugins.bundled.apis.restservice.RestRequest',
  'com.provar.plugins.bundled.apis.restservice.SoapRequest',
  // Bundled — messaging
  'com.provar.plugins.bundled.apis.messaging.PublishMessage',
  'com.provar.plugins.bundled.apis.messaging.ReceiveMessage',
  'com.provar.plugins.bundled.apis.messaging.SendMessage',
  'com.provar.plugins.bundled.apis.messaging.Subscribe',
  // Bundled — BDD
  'com.provar.plugins.bundled.apis.bdd.Given',
  'com.provar.plugins.bundled.apis.bdd.When',
  'com.provar.plugins.bundled.apis.bdd.Then',
  'com.provar.plugins.bundled.apis.bdd.And',
  'com.provar.plugins.bundled.apis.bdd.But',
  // Bundled — I/O, strings, lists
  'com.provar.plugins.bundled.apis.io.Read',
  'com.provar.plugins.bundled.apis.io.Write',
  'com.provar.plugins.bundled.apis.string.Replace',
  'com.provar.plugins.bundled.apis.string.Split',
  'com.provar.plugins.bundled.apis.string.Match',
  'com.provar.plugins.bundled.apis.list.ListCompare',
  // Provar Labs
  'com.provar.plugins.bundled.apis.provarlabs.PageObjectCleaner',
  // Forcedotcom — AI / agent
  'com.provar.plugins.forcedotcom.core.testapis.ai.AIAgentSession',
  'com.provar.plugins.forcedotcom.core.testapis.ai.AIAgentConversation',
  'com.provar.plugins.forcedotcom.core.testapis.ai.GenerateUtterance',
  'com.provar.plugins.forcedotcom.core.testapis.ai.IntentValidator',
  'com.provar.plugins.forcedotcom.core.testapis.ai.ImageValidator',
  'com.provar.plugins.forcedotcom.core.testapis.generate.GenerateTestData',
  'com.provar.plugins.forcedotcom.core.testapis.GenerateTestCase',
  // Forcedotcom — Apex / API
  'com.provar.plugins.forcedotcom.core.testapis.ApexConnect',
  'com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject',
  'com.provar.plugins.forcedotcom.core.testapis.ApexReadObject',
  'com.provar.plugins.forcedotcom.core.testapis.ApexUpdateObject',
  'com.provar.plugins.forcedotcom.core.testapis.ApexDeleteObject',
  'com.provar.plugins.forcedotcom.core.testapis.ApexSoqlQuery',
  'com.provar.plugins.forcedotcom.core.testapis.ApexSoqlBuilder',
  'com.provar.plugins.forcedotcom.core.testapis.ApexExecute',
  'com.provar.plugins.forcedotcom.core.testapis.ApexBulk',
  'com.provar.plugins.forcedotcom.core.testapis.ApexApproveWorkItem',
  'com.provar.plugins.forcedotcom.core.testapis.ApexSubmitForApproval',
  'com.provar.plugins.forcedotcom.core.testapis.ApexConvertLead',
  'com.provar.plugins.forcedotcom.core.testapis.ApexExtractLayout',
  'com.provar.plugins.forcedotcom.core.testapis.ApexAssertLayout',
  'com.provar.plugins.forcedotcom.core.testapis.ApexLogForCleanup',
  // Forcedotcom — UI
  'com.provar.plugins.forcedotcom.core.ui.UiConnect',
  'com.provar.plugins.forcedotcom.core.ui.UiWithScreen',
  'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  'com.provar.plugins.forcedotcom.core.ui.UiNavigate',
  'com.provar.plugins.forcedotcom.core.ui.UiFill',
  'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
  'com.provar.plugins.forcedotcom.core.ui.UiHandleAlert',
]);

// ── XML tree types & helpers ──────────────────────────────────────────────────

type XmlNode = Record<string, unknown>;

/** Normalise a possibly-singular value to an array. */
function toArr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Recursively collect every <apiCall> element in the parsed tree.
 * Works for flat and deeply nested structures (StepGroup, BDD, TryCatch…).
 */
function getAllApiCalls(node: XmlNode): XmlNode[] {
  const results: XmlNode[] = [];

  function collect(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) collect(item);
      return;
    }
    const n = obj as XmlNode;
    for (const [key, val] of Object.entries(n)) {
      if (key === 'apiCall') {
        for (const call of toArr(val as XmlNode | XmlNode[])) {
          if (call && typeof call === 'object') results.push(call);
        }
      }
      if (val && typeof val === 'object') collect(val);
    }
  }

  collect(node);
  return results;
}

/** Return the DIRECT <apiCall> children of <steps> (not nested). */
function getDirectSteps(tc: XmlNode): XmlNode[] {
  const steps = tc['steps'] as XmlNode | undefined;
  if (!steps || typeof steps !== 'object') return [];
  return toArr(steps['apiCall'] as XmlNode | XmlNode[]).filter((c) => c && typeof c === 'object');
}

/**
 * Get the text value for a named argument from an apiCall.
 * Handles simple (class="value"), variable (class="variable"), and compound values.
 */
function getArgValue(call: XmlNode, argId: string): string | undefined {
  for (const arg of toArr(call['argument'] as XmlNode | XmlNode[])) {
    if (!arg || typeof arg !== 'object') continue;
    const a = arg;
    if (a['@_id'] !== argId) continue;
    const valElem = a['value'] as XmlNode | undefined;
    if (!valElem || typeof valElem !== 'object') continue;
    const vClass = valElem['@_class'] as string | undefined;
    if (vClass === 'variable') {
      const firstPath = toArr(valElem['path'] as XmlNode | XmlNode[])[0] as XmlNode | undefined;
      return firstPath?.['@_element'] as string | undefined;
    }
    if (vClass === 'compound') {
      const partsNode = (valElem['parts'] as XmlNode | undefined)?.['value'];
      const texts = toArr(partsNode as XmlNode | XmlNode[])
        .filter((p) => p && typeof p === 'object')
        .map((p) => p['#text'] as string | undefined)
        .filter(Boolean) as string[];
      return texts.join('') || undefined;
    }
    return (valElem['#text'] as string | undefined) ?? undefined;
  }
  return undefined;
}

/** Return all <argument> elements from an apiCall. */
function getArguments(call: XmlNode): XmlNode[] {
  return toArr(call['argument'] as XmlNode | XmlNode[]).filter((a) => a && typeof a === 'object');
}

/** Return true if the apiCall has a <tags><string>disabled</string></tags>. */
function isDisabledCall(call: XmlNode): boolean {
  const tags = call['tags'] as XmlNode | undefined;
  if (!tags || typeof tags !== 'object') return false;
  const strings = toArr(tags['string'] as string | string[]);
  return strings.some((s) => typeof s === 'string' && s.trim().toLowerCase() === 'disabled');
}

// ── Scoring formula (exact Lambda match) ─────────────────────────────────────

const SEVERITY_MULT: Record<string, number> = {
  critical: 1.0,
  major: 0.75,
  minor: 0.5,
  info: 0.25,
};

export function calculateBPScore(violations: BPViolation[]): number {
  let total = 0;
  for (const v of violations) {
    const mult = SEVERITY_MULT[v.severity] ?? 0.5;
    const rawCount = v.count ?? 1;
    const effectiveCount = rawCount > 1 ? 1 + Math.log2(rawCount) : 1;
    total += v.weight * mult * effectiveCount;
  }
  return Math.max(0, Math.round((100 - total) * 100) / 100);
}

// ── Violation factory ─────────────────────────────────────────────────────────

function makeViolation(rule: BPRule, message: string, count?: number): BPViolation {
  const v: BPViolation = {
    rule_id: rule.id,
    name: rule.name,
    description: rule.description,
    category: rule.category,
    severity: rule.severity,
    weight: rule.weight,
    message,
    recommendation: rule.recommendation,
    applies_to: rule.appliesTo ?? [],
  };
  if (count !== undefined && count > 1) v.count = count;
  return v;
}

// ── Validator implementations ─────────────────────────────────────────────────

/** API-UNKNOWN-001 — check all apiCall apiId values against the known-valid set. */
function validateUnknownApiId(tc: XmlNode, rule: BPRule): BPViolation | null {
  const calls = getAllApiCalls(tc);
  const unknowns: Array<{ apiId: string; tid?: string }> = [];

  for (const call of calls) {
    const apiId = call['@_apiId'] as string | undefined;
    if (!apiId) continue;
    // Custom and third-party APIs are always allowed
    if (apiId.startsWith('customapis.') || apiId.includes('.customapis.')) continue;
    if (!VALID_API_IDS.has(apiId)) {
      unknowns.push({ apiId, tid: call['@_testItemId'] as string | undefined });
    }
  }

  if (!unknowns.length) return null;

  const MAX = 5;
  const msgs = unknowns.slice(0, 3).map((v) => `'${v.apiId}'${v.tid ? ` (testItemId=${v.tid})` : ''}`);
  let message = `Unknown apiId(s) detected — these APIs do not exist in Provar: ${msgs.join('; ')}`;
  if (unknowns.length > 3) message += ` (+${unknowns.length - 3} more)`;
  return makeViolation(rule, message, Math.min(unknowns.length, MAX));
}

/** VALID-GUID-001 — test case must have at least one valid identifier. */
function validateValidIdentifier(tc: XmlNode, rule: BPRule): BPViolation | null {
  const guid = tc['@_guid'] as string | undefined;
  const id = tc['@_id'] as string | undefined;
  const rid = tc['@_registryId'] as string | undefined;
  if (!guid && !id && !rid) {
    return makeViolation(rule, 'Test case missing valid identifier (guid, id, or registryId)');
  }
  return null;
}

/** VALID-STEPS-001 / mustExist — element must exist (and not be empty). */
function validateMustExist(tc: XmlNode, rule: BPRule): BPViolation | null {
  const target = (rule.check['target'] as string | undefined) ?? '';
  const elementName = target.split('.').pop() ?? target;
  const elem = tc[elementName];
  if (elem === undefined || elem === null) {
    return makeViolation(rule, `${target} is missing`);
  }
  if (typeof elem === 'object' && !Array.isArray(elem)) {
    const obj = elem as XmlNode;
    const hasText = typeof obj['#text'] === 'string' && obj['#text'].trim().length > 0;
    const hasChildren = Object.keys(obj).some((k) => !k.startsWith('@_') && k !== '#text');
    if (!hasText && !hasChildren) {
      return makeViolation(rule, `${target} exists but is empty`);
    }
  } else if (typeof elem === 'string' && !elem.trim()) {
    return makeViolation(rule, `${target} exists but is empty`);
  }
  return null;
}

/** STRUCT-SUMMARY-001 / mustExistAndNotEmpty — same as mustExist. */
const validateMustExistAndNotEmpty = validateMustExist;

/** STEP-ITEMID-001 — all testItemId attributes must be positive integers. */
function validateWholeNumberTestItemId(tc: XmlNode, rule: BPRule): BPViolation | null {
  const calls = getAllApiCalls(tc);
  const invalid: string[] = [];

  for (const call of calls) {
    const tid = call['@_testItemId'] as string | undefined;
    if (!tid) continue;
    const n = parseInt(tid, 10);
    if (isNaN(n) || n <= 0 || String(n) !== tid.trim()) {
      invalid.push(tid);
    }
  }

  if (!invalid.length) return null;
  return makeViolation(rule, `Invalid testItemId values: ${invalid.slice(0, 3).join(', ')}`, invalid.length);
}

/** VAR-NAMING-001 — variable names must match the identifier pattern. */
function validateVariableNaming(tc: XmlNode, rule: BPRule): BPViolation | null {
  const patternStr = (rule.check['pattern'] as string | undefined) ?? '^[A-Za-z_][A-Za-z0-9_]*$';
  const re = new RegExp(patternStr);
  const violations: string[] = [];

  function checkName(name: string, label: string): void {
    if (name && !re.test(name) && violations.length < 7) {
      violations.push(`${label} '${name}'`);
    }
  }

  const calls = getAllApiCalls(tc);
  for (const call of calls) {
    const apiId = call['@_apiId'] as string | undefined;

    // Result name attributes on the apiCall element itself
    for (const attr of ['@_resultName', '@_resultIdName', '@_sfUiTargetResultName']) {
      const v = call[attr] as string | undefined;
      if (v) checkName(v, attr.slice(2));
    }

    // SetValues variable names
    if (apiId === 'com.provar.plugins.bundled.apis.control.SetValues') {
      const nvContainer = call['namedValues'] as XmlNode | undefined;
      if (nvContainer && typeof nvContainer === 'object') {
        for (const nv of toArr(nvContainer['namedValue'] as XmlNode | XmlNode[])) {
          if (!nv || typeof nv !== 'object') continue;
          const name = nv['@_name'] as string | undefined;
          if (name && !['valuePath', 'value', 'valueScope'].includes(name)) {
            checkName(name, 'SetValues variable');
          }
        }
      }
    }
  }

  if (!violations.length) return null;
  const shown = violations.slice(0, 3);
  let msg = shown.join('; ');
  if (violations.length > 3) msg += ` (+${violations.length - 3} more)`;
  return makeViolation(rule, msg, violations.length);
}

/** STRUCT-GROUP-001 — direct steps should be wrapped in grouping elements. */
function validateMustAllBeInGroups(tc: XmlNode, rule: BPRule): BPViolation | null {
  const check = rule.check;
  const acceptBdd = (check['acceptBddSteps'] as boolean | undefined) ?? true;
  const acceptFinally = (check['acceptFinallyBlocks'] as boolean | undefined) ?? true;

  const GROUPING_IDS = new Set<string>(['com.provar.plugins.bundled.apis.control.StepGroup']);
  if (acceptBdd) {
    for (const id of [
      'com.provar.plugins.bundled.apis.bdd.Given',
      'com.provar.plugins.bundled.apis.bdd.When',
      'com.provar.plugins.bundled.apis.bdd.Then',
      'com.provar.plugins.bundled.apis.bdd.And',
      'com.provar.plugins.bundled.apis.bdd.But',
    ])
      GROUPING_IDS.add(id);
  }
  if (acceptFinally) GROUPING_IDS.add('com.provar.plugins.bundled.apis.control.Finally');

  const directSteps = getDirectSteps(tc);
  if (directSteps.length < 5) return null; // exemption: tiny tests

  let apiCallCount = 0;
  const ungrouped: string[] = [];

  for (const step of directSteps) {
    const apiId = (step['@_apiId'] as string | undefined) ?? '';
    if (/\.apex[a-z]|\.soql[a-z]|\.rest[a-z]|\.db[A-Z]|\.web[A-Z]/i.test(apiId)) apiCallCount++;
    if (!GROUPING_IDS.has(apiId)) {
      const title =
        (step['@_title'] as string | undefined) ??
        (step['@_name'] as string | undefined) ??
        apiId.split('.').pop() ??
        '';
      ungrouped.push(title.substring(0, 30));
    }
  }

  // Exemption: API-heavy tests (≥80% are API calls)
  if (directSteps.length > 0 && apiCallCount / directSteps.length >= 0.8) return null;

  if (ungrouped.length > 3) {
    return makeViolation(rule, `${ungrouped.length} steps not in groups: ${ungrouped.slice(0, 3).join(', ')}...`);
  }
  return null;
}

/** STEP-DISABLED-001 — flag any apiCall tagged as disabled. */
function validateDisabledStep(tc: XmlNode, rule: BPRule): BPViolation | null {
  for (const call of getAllApiCalls(tc)) {
    if (!isDisabledCall(call)) continue;
    const tid = call['@_testItemId'] as string | undefined;
    const apiId = (call['@_apiId'] as string | undefined) ?? 'unknown';
    const name =
      (call['@_name'] as string | undefined) ??
      (call['@_title'] as string | undefined) ??
      apiId.split('.').pop() ??
      'unnamed';
    return makeViolation(rule, `Disabled step found: "${name}"${tid ? ` (testItemId=${tid})` : ''}`);
  }
  return null;
}

// Arguments that should NOT be checked for duplicate literals
const LITERAL_EXCLUDE_ARGS = new Set([
  'uiConnectionName',
  'apexConnectionName',
  'resultScope',
  'resultName',
  'sfUiTargetResultScope',
  'sfUiTargetResultName',
  'objectType',
  'connectionId',
  'connectionName',
  'comparisonType',
  'assertionType',
  'httpMethod',
  'controlType',
  'loopType',
  'navigate',
  'windowSelection',
  'windowSize',
  'alreadyOpenBehaviour',
  'captureBefore',
  'captureAfter',
  'interactionDescription',
  'targetDescription',
  'title',
]);
const METADATA_FIELDS = new Set([
  'status',
  'stage',
  'recordtype',
  'recordtypeid',
  'type',
  'subtype',
  'category',
  'priority',
  'source',
  'origin',
  'reason',
  'result',
  'state',
  'severity',
  'casestatus',
  'leadstatus',
  'opportunitystage',
  'accounttype',
  'industry',
]);
const DEFAULT_LITERAL_VALUES = new Set([
  '0',
  '1',
  '0.0',
  '1.0',
  '',
  'N/A',
  'n/a',
  'NA',
  'None',
  'Default',
  'default',
  'Test',
  'Global',
  'Local',
  'Folder',
  'GroupStep',
]);

/** DDT-VAR-001 — detect hardcoded literal values repeated ≥2 times. */
// eslint-disable-next-line complexity
function validateDetectDuplicatesLiterals(tc: XmlNode, rule: BPRule): BPViolation | null {
  const literals: string[] = [];

  for (const call of getAllApiCalls(tc)) {
    for (const arg of getArguments(call)) {
      const argId = (arg['@_id'] as string | undefined) ?? '';
      if (LITERAL_EXCLUDE_ARGS.has(argId)) continue;
      if (METADATA_FIELDS.has(argId.toLowerCase())) continue;

      const valElem = arg['value'] as XmlNode | undefined;
      if (!valElem || typeof valElem !== 'object') continue;
      if ((valElem['@_class'] as string | undefined) !== 'value') continue; // skip variables/compounds

      const text = ((valElem['#text'] as string | undefined) ?? '').trim();
      if (!text || text.length <= 3) continue;
      if (DEFAULT_LITERAL_VALUES.has(text)) continue;
      if (text.toLowerCase() === 'true' || text.toLowerCase() === 'false') continue;
      if (text.startsWith('{') && text.endsWith('}')) continue; // inline variable ref

      literals.push(text);
    }
  }

  const counts = new Map<string, number>();
  for (const lit of literals) counts.set(lit, (counts.get(lit) ?? 0) + 1);

  const dups = [...counts.entries()].filter(([, c]) => c >= 2);
  if (!dups.length) return null;

  const MAX = 3;
  const examples = dups.slice(0, MAX).map(([v, c]) => `'${v}' (×${c})`);
  const msg =
    dups.length > MAX
      ? `Found ${dups.length} hardcoded values used multiple times (showing ${MAX}): ${examples.join(', ')}`
      : `Found ${dups.length} hardcoded value(s) used multiple times: ${examples.join(', ')}`;
  return makeViolation(rule, msg, Math.min(dups.length, MAX));
}

/** NC-FOLDER-001 / NC-PARAM-001 — regex check on target value. */
function validateRegex(tc: XmlNode, rule: BPRule, metadata: BPMetadata): BPViolation | null {
  const check = rule.check;
  const target = (check['target'] as string | undefined) ?? '';
  const pattern = (check['pattern'] as string | undefined) ?? '';
  if (!pattern) return null;

  const targetType = target.split('.')[0];
  let value: string | undefined;

  if (targetType === 'testCase') {
    value = metadata.testName;
  }
  // folder.name requires filesystem paths — not available in MCP context, skip silently
  // parameter.name — check first argument ID found
  else if (targetType === 'parameter') {
    outer: for (const call of getAllApiCalls(tc)) {
      for (const arg of getArguments(call)) {
        const argId = arg['@_id'] as string | undefined;
        if (argId) {
          value = argId;
          break outer;
        }
      }
    }
  }

  if (!value) return null;

  try {
    if (!new RegExp(pattern).test(value)) {
      return makeViolation(rule, `${target} '${value}' does not match expected naming pattern`);
    }
  } catch {
    // invalid regex in rules — silently skip
  }
  return null;
}

// Steps that WRITE to resultName (not just read)
const RESULT_WRITE_STEPS = new Set([
  'ApexConnect',
  'UiConnect',
  'DbConnect',
  'WebConnect',
  'ApexCreateObject',
  'ApexUpdateObject',
  'ApexReadObject',
  'ApexSoqlQuery',
  'ApexSoqlBuilder',
  'RestRequest',
  'SoapRequest',
  'SqlQuery',
  'DbInsert',
  'DbRead',
  'DbUpdate',
  'UiWithScreen',
  'UiWithRow',
]);
// Patterns to exclude from result-name tracking
const RESULT_EXCLUDE_PATTERNS = [
  'StepGroup',
  'control.If',
  'control.While',
  'control.ForEach',
  'control.Try',
  'control.Finally',
  'control.SetValues',
];

/** APEX-RESULTNAME-001 — detect duplicate resultNames within the same scope. */
function validateUniqueResultNames(tc: XmlNode, rule: BPRule): BPViolation | null {
  // scope → resultName → list of step types that wrote it
  const byScope = new Map<string, Map<string, string[]>>();

  for (const call of getAllApiCalls(tc)) {
    if (isDisabledCall(call)) continue;
    const apiId = (call['@_apiId'] as string | undefined) ?? '';
    if (RESULT_EXCLUDE_PATTERNS.some((p) => apiId.includes(p))) continue;

    const resultName = (getArgValue(call, 'resultName') ?? '').trim();
    if (!resultName) continue;

    const scope = (getArgValue(call, 'resultScope') ?? 'Test').trim() || 'Test';

    const stepType = apiId.split('.').pop() ?? 'Unknown';
    if (!RESULT_WRITE_STEPS.has(stepType)) continue;

    if (!byScope.has(scope)) byScope.set(scope, new Map());
    const names = byScope.get(scope)!;
    if (!names.has(resultName)) names.set(resultName, []);
    names.get(resultName)!.push(stepType);
  }

  const violations: string[] = [];
  for (const [scope, names] of byScope) {
    for (const [name, steps] of names) {
      if (steps.length > 1) {
        violations.push(`'${name}' in ${scope} scope: written ${steps.length} times (${steps.slice(0, 2).join(', ')})`);
      }
    }
  }

  if (!violations.length) return null;

  const MAX = 3;
  let msg = violations.slice(0, 2).join('; ');
  if (violations.length > 2) msg += ` (and ${violations.length - 2} more)`;
  return makeViolation(rule, msg, Math.min(violations.length, MAX));
}

// ── UiWithScreen target URI validator ─────────────────────────────────────────

const VALID_SF_UI_PARAMS = new Set([
  'object',
  'action',
  'lightningComponent',
  'lightningWebComponent',
  'auraComponent',
  'application',
  'lookup',
  'fieldService',
  'tab',
]);

/** Read the "target" argument from a UiWithScreen call via the <arguments> wrapper. */
function getUiWithScreenTarget(call: XmlNode): string | undefined {
  const argsNode = call['arguments'] as XmlNode | undefined;
  if (!argsNode || typeof argsNode !== 'object') return undefined;
  for (const arg of toArr(argsNode['argument'] as XmlNode | XmlNode[])) {
    if (!arg || typeof arg !== 'object') continue;
    if (arg['@_id'] !== 'target') continue;
    const valElem = arg['value'] as XmlNode | undefined;
    if (!valElem || typeof valElem !== 'object') return undefined;
    return (valElem['#text'] as string | undefined) ?? undefined;
  }
  return undefined;
}

/** UI-SCREEN-TARGET — validate UiWithScreen target URIs (SF and page object formats). */
function validateUiWithScreenTarget(tc: XmlNode, rule: BPRule): BPViolation | null {
  const targetApiId = rule.check['apiId'] as string | undefined;
  const violations: string[] = [];

  for (const call of getAllApiCalls(tc)) {
    const apiId = call['@_apiId'] as string | undefined;
    if (!apiId) continue;
    if (targetApiId && !apiId.includes(targetApiId)) continue;

    const target = getUiWithScreenTarget(call);
    if (!target) continue;

    if (target.startsWith('sf:')) {
      const qs = target.includes('?') ? target.split('?')[1] : '';
      const hasValidParam = [...new URLSearchParams(qs).keys()].some((k) => VALID_SF_UI_PARAMS.has(k));
      if (!hasValidParam) {
        violations.push(`UiWithScreen target "${target}" has no recognised SF parameters`);
      }
    } else if (target.startsWith('ui:pageobject:target')) {
      if (!target.includes('?')) {
        violations.push(`UiWithScreen target "${target}" uses colon format — use ?pageId=pageobjects.<ClassName>`);
      } else {
        const pageId = new URLSearchParams(target.split('?')[1]).get('pageId');
        if (!pageId?.startsWith('pageobjects.')) {
          violations.push(`UiWithScreen target "${target}" pageId must start with "pageobjects."`);
        }
      }
    }
  }

  if (!violations.length) return null;
  let msg = violations.slice(0, 2).join('; ');
  if (violations.length > 2) msg += ` (and ${violations.length - 2} more)`;
  return makeViolation(rule, msg, Math.min(violations.length, 3));
}

// ── Validator dispatch map ────────────────────────────────────────────────────

type ValidatorFn = (tc: XmlNode, rule: BPRule) => BPViolation | null;

const VALIDATOR_REGISTRY: Record<string, ValidatorFn> = {
  unknownApiId: validateUnknownApiId,
  validIdentifier: validateValidIdentifier,
  mustExist: validateMustExist,
  mustExistAndNotEmpty: validateMustExistAndNotEmpty,
  wholeNumberTestItemId: validateWholeNumberTestItemId,
  variableNaming: validateVariableNaming,
  mustAllBeInGroups: validateMustAllBeInGroups,
  disabledStep: validateDisabledStep,
  detectDuplicatesLiterals: validateDetectDuplicatesLiterals,
  uniqueResultNames: validateUniqueResultNames,
  uiWithScreenTarget: validateUiWithScreenTarget,
  // 'regex' is dispatched separately (needs metadata)
};

// ── XML parser (shared settings) ─────────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
});

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run all active best-practice rules against a single test case XML string.
 *
 * @param xmlContent  Raw XML of the test case file.
 * @param metadata    Optional context (testName used for regex rules).
 * @returns           Quality score (0–100) + list of violations.
 */
export function runBestPractices(xmlContent: string, metadata: BPMetadata = {}): BPEngineResult {
  let parsed: XmlNode;
  try {
    parsed = XML_PARSER.parse(xmlContent) as XmlNode;
  } catch {
    return { quality_score: 0, violations: [], rules_evaluated: 0 };
  }

  const tc = parsed['testCase'] as XmlNode | undefined;
  if (!tc || typeof tc !== 'object') {
    return { quality_score: 0, violations: [], rules_evaluated: 0 };
  }

  const config = getRulesConfig();
  const violations: BPViolation[] = [];
  let rulesEvaluated = 0;

  for (const rule of config.rules) {
    const checkType = rule.check?.type;
    if (!checkType) continue;

    // Schema-compliance rules are handled by testCaseValidate.ts — skip here
    if (checkType === 'disabled') continue;

    // Weight-0 rules are purely informational — skip from scoring
    if (rule.weight === 0) continue;

    let violation: BPViolation | null;

    if (checkType === 'regex') {
      rulesEvaluated++;
      violation = validateRegex(tc, rule, metadata);
    } else {
      const fn = VALIDATOR_REGISTRY[checkType];
      if (!fn) continue; // unimplemented validator → silently pass
      rulesEvaluated++;
      violation = fn(tc, rule);
    }

    if (violation) violations.push(violation);
  }

  const quality_score = calculateBPScore(violations);
  return { quality_score, violations, rules_evaluated: rulesEvaluated };
}
