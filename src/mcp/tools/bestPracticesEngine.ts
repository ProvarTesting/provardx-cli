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
import { UI_ACTION_API_IDS, UI_SCREEN_CONTAINER_API_IDS } from './uiActionApiIds.js';

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
  'com.provar.plugins.forcedotcom.core.ui.UiRead',
  'com.provar.plugins.forcedotcom.core.ui.UiNavigate',
  'com.provar.plugins.forcedotcom.core.ui.UiFill',
  'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
  'com.provar.plugins.forcedotcom.core.ui.UiHandleAlert',
  // Forcedotcom — NitroX MS variants (Microsoft Dynamics 365 + Power Platform, Provar 3.0.7+)
  'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-dynamics365',
  'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-dataverse',
  'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-powerapp',
  'com.provar.plugins.forcedotcom.core.ui.NitroXConnect:ms-powerpage',
]);

// ── NitroX MS variants — shared tables for UI-NITROX-* rules ─────────────────

const NITROX_MS_BASE = 'com.provar.plugins.forcedotcom.core.ui.NitroXConnect';

const NITROX_MS_VARIANT_REQUIRED_ARGS: Record<string, readonly string[]> = {
  'ms-dynamics365': ['appName'],
  'ms-dataverse': [],
  'ms-powerapp': ['powerAppName'],
  'ms-powerpage': ['environment', 'powerPageName'],
};

const NITROX_MS_SHARED_ALLOWED_ARGS: ReadonlySet<string> = new Set([
  'connectionName',
  'reuseConnectionName',
  'privateBrowsingMode',
  'resultName',
  'resultScope',
  'webBrowser',
]);

const APEX_CONNECT_ONLY_ARGS: ReadonlySet<string> = new Set([
  'autoCleanup',
  'enableObjectIdLogging',
  'quickUiLogin',
  'closeAllPrimaryTabs',
  'alreadyOpenBehaviour',
  'lightningMode',
  'uiApplicationName',
  'cleanupConnectionName',
]);

function getNitroxMsVariant(apiId: string | undefined): string | null {
  if (!apiId) return null;
  const prefix = `${NITROX_MS_BASE}:`;
  if (!apiId.startsWith(prefix)) return null;
  const variant = apiId.slice(prefix.length);
  return variant in NITROX_MS_VARIANT_REQUIRED_ARGS ? variant : null;
}

// ── XML tree types & helpers ──────────────────────────────────────────────────

type XmlNode = Record<string, unknown>;

/** Normalise a possibly-singular value to an array. */
function toArr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Recursively collect every <apiCall> element in the parsed tree.
 * Works for flat and deeply nested structures (StepGroup, BDD, Finally…).
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

      // Read through nodeText: fast-xml-parser yields a NUMBER for a numeric tag
      // value (e.g. <value>123</value>), so a bare `.trim()` would throw.
      const text = nodeText(valElem);
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

// ── UI-NEST-STRUCT-001 — UI actions must be nested under a screen ancestor ────
// Mirrors QH's `UiActionNestingStructureValidator` (best_practices_engine.py).
// A UI action step is valid if SOMEWHERE in its ancestor chain there is a
// UiWithScreen or UiWithRow apiCall AND between the step and that ancestor
// there is at least one <clause name="substeps">. Control-flow wrappers
// (IfThen, ForEach, DoWhile, WaitFor, Switch, SwitchCase) between the step and
// the screen ancestor are allowed. Anything inside <clause name="hidden"> is
// exempt (disabled / settings blocks).

// PDX-497: imported from the shared `uiActionApiIds.ts` so the validator and
// generator (testCaseGenerate.ts) can never drift. UiWithRow is both a UI
// action AND a container — its <clause name="substeps"> satisfies the rule for
// its own descendants.
const UI_ACTION_APIS = UI_ACTION_API_IDS;
const UI_SCREEN_CONTAINERS = UI_SCREEN_CONTAINER_API_IDS;

/** One frame on the parent stack while walking the parsed tree. */
interface ParentFrame {
  tag: string;
  /** Attribute map (e.g. `{ apiId: '…UiWithScreen', name: 'substeps' }`). */
  attrs: Record<string, string>;
}

/**
 * Walk ancestors (immediate parent first, root last) and classify the
 * placement of a UI action step. Returns `null` when the step is validly
 * nested OR is exempt (inside `<clause name="hidden">`), otherwise a
 * human-readable failure-mode string.
 *
 * Algorithmically identical to the Python `_classify` method so QH and local
 * runs de-dup cleanly by (rule_id, test_item_id).
 */
function classifyUiActionPlacement(parents: ParentFrame[]): string | null {
  let sawSubstepsClause = false;
  // Iterate from immediate parent toward the root.
  for (let i = parents.length - 1; i >= 0; i--) {
    const frame = parents[i];
    if (frame.tag === 'clause') {
      const name = frame.attrs['name'] ?? '';
      // Skip steps inside hidden clauses (disabled / settings blocks).
      if (name === 'hidden') return null;
      if (name === 'substeps') sawSubstepsClause = true;
    }
    if (frame.tag === 'apiCall') {
      const ancestorApi = frame.attrs['apiId'] ?? '';
      if (UI_SCREEN_CONTAINERS.has(ancestorApi)) {
        if (sawSubstepsClause) return null;
        const short = ancestorApi.split('.').pop() ?? ancestorApi;
        return `nested under '${short}' but not via a <clause name="substeps"> block`;
      }
      // Any other apiCall (IfThen, ForEach, DoWhile, WaitFor, Switch, SwitchCase) — keep climbing.
    }
  }
  return (
    'not nested inside any UiWithScreen or UiWithRow ancestor ' +
    '(must be a descendant of one via a <clause name="substeps"> path)'
  );
}

/** Extract just the XML attributes from a fast-xml-parser node (stripping the @_ prefix). */
function extractAttrs(node: XmlNode): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('@_') && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      attrs[k.slice(2)] = String(v);
    }
  }
  return attrs;
}

/**
 * Depth-first walk over the parsed tree, invoking `visit` for every <apiCall>
 * along with the chain of enclosing elements (root first, immediate parent
 * last). Used by the UI-NEST-STRUCT-001 validator below.
 */
function walkApiCalls(tc: XmlNode, visit: (call: XmlNode, parents: ParentFrame[]) => void): void {
  function descend(node: unknown, parents: ParentFrame[]): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) descend(item, parents);
      return;
    }
    const n = node as XmlNode;
    for (const [key, val] of Object.entries(n)) {
      if (key.startsWith('@_') || key === '#text') continue;
      const children = toArr(val as XmlNode | XmlNode[] | string);
      for (const child of children) {
        if (!child || typeof child !== 'object') continue;
        const frame: ParentFrame = { tag: key, attrs: extractAttrs(child) };
        if (key === 'apiCall') visit(child, parents);
        descend(child, [...parents, frame]);
      }
    }
  }
  descend(tc, [{ tag: 'testCase', attrs: extractAttrs(tc) }]);
}

/**
 * UI-NEST-STRUCT-001 — flag every UI action step (UiDoAction, UiAssert, UiRead,
 * UiFill, UiNavigate, UiWithRow, UiHandleAlert) that is not nested under a
 * UiWithScreen or UiWithRow ancestor via a `<clause name="substeps">` path.
 *
 * Emits ONE BPViolation per offending step (no consolidation) so that
 * (rule_id, test_item_id) de-dups cleanly against the Quality Hub API.
 */
function validateUiActionNestingStructure(tc: XmlNode, rule: BPRule): BPViolation[] {
  const violations: BPViolation[] = [];

  walkApiCalls(tc, (call, parents) => {
    const apiId = call['@_apiId'] as string | undefined;
    if (!apiId || !UI_ACTION_APIS.has(apiId)) return;
    const verdict = classifyUiActionPlacement(parents);
    if (!verdict) return;
    const title = (call['@_title'] as string | undefined) ?? (call['@_name'] as string | undefined) ?? 'Unknown';
    const tid = call['@_testItemId'] as string | undefined;
    const shortApi = apiId.split('.').pop() ?? apiId;
    const tidSuffix = tid ? ` (testItemId=${tid})` : '';
    const requiredContainer = verdict.includes('UiWithRow') ? 'UiWithRow' : 'UiWithScreen';
    const message =
      `${shortApi} '${title}' is ${verdict} - must be nested inside a parent ` +
      `${requiredContainer}'s <clauses><clause name="substeps"><steps> block${tidSuffix}`;
    violations.push(makeViolation(rule, message));
  });

  return violations;
}

// ── UI-SCREEN-CONTEXT-001 — assert/post-save steps under the wrong screen ─────
// A UiAssert / UiRead that verifies a persisted record while still nested under
// the `action=New` create screen is almost always wrong context: the create
// screen tears down after Save, so the assertion runs against the wrong page.
// Likewise any UI action that follows a Save (`action=save`) inside the SAME
// UiWithScreen substeps block is suspect — Save navigates away, so trailing
// steps belong in a fresh UiWithScreen (typically `action=View`).

// UI action apiIds whose presence AFTER a Save (in the same screen block) is suspect.
const POST_SAVE_SUSPECT_APIS = UI_ACTION_API_IDS;
// Read-only verification steps that should not run on the create (`action=New`) screen.
const ASSERT_ON_NEW_SUSPECT_APIS = new Set<string>([
  'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  'com.provar.plugins.forcedotcom.core.ui.UiRead',
]);
const UI_WITH_SCREEN_API_ID = 'com.provar.plugins.forcedotcom.core.ui.UiWithScreen';

/**
 * Read the URI string carried by a UiWithScreen `target` argument. The value is
 * stored either as the `uri` attribute (`<value class="uiTarget" uri="…"/>`) or,
 * for hand-authored XML, as element text. Returns undefined when absent.
 */
function getUiWithScreenTargetUri(call: XmlNode): string | undefined {
  for (const arg of getCallArguments(call)) {
    if (arg['@_id'] !== 'target') continue;
    const valElem = arg['value'] as XmlNode | undefined;
    if (!valElem || typeof valElem !== 'object') return undefined;
    const uriAttr = valElem['@_uri'] as string | undefined;
    if (uriAttr) return uriAttr;
    return (valElem['#text'] as string | undefined) ?? undefined;
  }
  return undefined;
}

/** Parse the `action` query parameter from a UiWithScreen target URI (e.g. `…?object=Opportunity&action=New`). */
function getScreenAction(targetUri: string | undefined): string | undefined {
  if (!targetUri || !targetUri.includes('?')) return undefined;
  const qs = targetUri.slice(targetUri.indexOf('?') + 1);
  return new URLSearchParams(qs).get('action') ?? undefined;
}

/** Read the `uri` attribute of a named argument's `<value>` element (e.g. locator / interaction). */
function getArgUri(call: XmlNode, argId: string): string | undefined {
  for (const arg of getCallArguments(call)) {
    if (arg['@_id'] !== argId) continue;
    const valElem = arg['value'] as XmlNode | undefined;
    if (!valElem || typeof valElem !== 'object') return undefined;
    return (valElem['@_uri'] as string | undefined) ?? undefined;
  }
  return undefined;
}

/**
 * True when a UiDoAction is a Save click. The locator binding encodes the action
 * percent-encoded (`action%3Dsave`); some authoring paths instead use a `name=save`
 * locator with an `action` interaction. Either signature counts as a Save.
 */
function isSaveAction(call: XmlNode): boolean {
  if (call['@_apiId'] !== 'com.provar.plugins.forcedotcom.core.ui.UiDoAction') return false;
  const locator = getArgUri(call, 'locator')?.toLowerCase() ?? '';
  if (locator.includes('action%3dsave') || locator.includes('action=save')) return true;
  const interaction = getArgUri(call, 'interaction')?.toLowerCase() ?? '';
  return /[?&]name=save(&|$)/.test(locator) && interaction.includes('name=action');
}

/** The direct <apiCall> steps inside a UiWithScreen's `<clause name="substeps"><steps>` block (in document order). */
function getScreenSubstepCalls(screen: XmlNode): XmlNode[] {
  const clauses = screen['clauses'] as XmlNode | undefined;
  if (!clauses || typeof clauses !== 'object') return [];
  for (const clause of toArr(clauses['clause'] as XmlNode | XmlNode[])) {
    if (!clause || typeof clause !== 'object') continue;
    if (clause['@_name'] !== 'substeps') continue;
    const steps = clause['steps'] as XmlNode | undefined;
    if (!steps || typeof steps !== 'object') continue;
    return toArr(steps['apiCall'] as XmlNode | XmlNode[]).filter((c) => c && typeof c === 'object');
  }
  return [];
}

/** Human-readable label for an offending step (`'Title' (testItemId=N)`). */
function describeStep(call: XmlNode): string {
  const ctx = stepContext(call);
  return `${ctx.apiName} '${ctx.title}' (testItemId=${ctx.tid})`;
}

/**
 * Heuristic 1 — a UiAssert/UiRead whose nearest enclosing UiWithScreen targets the
 * create screen (`action=New`). Emits one violation per offending verification step.
 */
function flagAssertsOnNewScreen(screen: XmlNode, rule: BPRule, out: BPViolation[]): void {
  const action = (getScreenAction(getUiWithScreenTargetUri(screen)) ?? '').toLowerCase();
  if (action !== 'new') return;
  for (const step of getScreenSubstepCalls(screen)) {
    const apiId = step['@_apiId'] as string | undefined;
    if (!apiId || !ASSERT_ON_NEW_SUSPECT_APIS.has(apiId)) continue;
    out.push(
      makeViolation(
        rule,
        `${describeStep(step)} verifies a persisted record while nested under the create screen ` +
          '(action=New). The create screen is torn down after Save, so the assertion runs against the ' +
          'wrong page context. Move it into a new UiWithScreen targeting action=View (or the appropriate post-save screen).'
      )
    );
  }
}

/**
 * Heuristic 2 — any UI action step that appears AFTER a Save click inside the SAME
 * UiWithScreen substeps block. Save navigates away, so trailing steps are suspect.
 * Emits one violation per offending trailing step.
 */
function flagStepsAfterSave(screen: XmlNode, rule: BPRule, out: BPViolation[]): void {
  const calls = getScreenSubstepCalls(screen);
  let sawSave = false;
  for (const step of calls) {
    if (!sawSave) {
      if (isSaveAction(step)) sawSave = true;
      continue;
    }
    const apiId = step['@_apiId'] as string | undefined;
    if (!apiId || !POST_SAVE_SUSPECT_APIS.has(apiId)) continue;
    out.push(
      makeViolation(
        rule,
        `${describeStep(step)} appears after a Save (action=save) inside the same UiWithScreen block. ` +
          'Save navigates away from the screen, so this step runs in stale context. Move it into a new ' +
          'UiWithScreen targeting action=View (or the appropriate post-save screen).'
      )
    );
  }
}

/**
 * UI-SCREEN-CONTEXT-001 — flag UiAssert/UiRead steps left under the `action=New`
 * create screen, and any UI action that follows a Save within the same screen
 * block. Both heuristics read data already present in the XML (target URIs and
 * locator bindings) and emit ONE violation per offending step so that
 * (rule_id, test_item_id) de-dups cleanly.
 */
function validateUiAssertScreenContext(tc: XmlNode, rule: BPRule): BPViolation[] {
  const violations: BPViolation[] = [];
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== UI_WITH_SCREEN_API_ID) continue;
    flagAssertsOnNewScreen(call, rule, violations);
    flagStepsAfterSave(call, rule, violations);
  }
  return violations;
}

// ── NitroX MS variant validators (UI-NITROX-CONNECT-ARGS-001, UI-NITROX-VARIANT-ARG-001) ───

/**
 * Return the list of <argument> nodes on an apiCall, navigating through the
 * <arguments> wrapper that fast-xml-parser preserves. Distinct from the
 * pre-existing `getArguments` helper above, which reads `call.argument`
 * directly and does not handle the wrapper.
 */
function getCallArguments(call: XmlNode): XmlNode[] {
  const argsContainer = call['arguments'] as XmlNode | undefined;
  if (!argsContainer || typeof argsContainer !== 'object') return [];
  return toArr(argsContainer['argument'] as XmlNode | XmlNode[]);
}

/** Return the set of <apiParam name="..."> names declared under <generatedParameters>. */
function getGeneratedParamNames(call: XmlNode): Set<string> {
  const container = call['generatedParameters'] as XmlNode | undefined;
  if (!container || typeof container !== 'object') return new Set();
  const params = toArr(container['apiParam'] as XmlNode | XmlNode[]);
  const names = new Set<string>();
  for (const p of params) {
    const name = p['@_name'] as string | undefined;
    if (name) names.add(name);
  }
  return names;
}

/** True when the <argument> has a real <value> child (not just an empty self-closing tag). */
function argumentHasValue(arg: XmlNode): boolean {
  const value = arg['value'];
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * UI-NITROX-CONNECT-ARGS-001 — reject ApexConnect-only args and cross-variant args
 * on NitroX MS connect steps. One violation per offending (step, arg) pair so
 * de-dup against the Quality Hub API is straightforward.
 */
function validateNitroxConnectInvalidArgs(tc: XmlNode, rule: BPRule): BPViolation[] {
  const violations: BPViolation[] = [];

  for (const call of getAllApiCalls(tc)) {
    const apiId = call['@_apiId'] as string | undefined;
    const variant = getNitroxMsVariant(apiId);
    if (!variant) continue;

    const variantArgs = NITROX_MS_VARIANT_REQUIRED_ARGS[variant] ?? [];
    const ownVariantArgs = new Set<string>(variantArgs);
    const otherVariantArgs = new Set<string>();
    for (const [v, args] of Object.entries(NITROX_MS_VARIANT_REQUIRED_ARGS)) {
      if (v === variant) continue;
      for (const a of args) otherVariantArgs.add(a);
    }

    const title = (call['@_title'] as string | undefined) ?? (call['@_name'] as string | undefined) ?? '(unnamed)';
    const tid = call['@_testItemId'] as string | undefined;
    const tidSuffix = tid ? ` (testItemId=${tid})` : '';

    for (const arg of getCallArguments(call)) {
      const argId = arg['@_id'] as string | undefined;
      if (!argId) continue;

      if (APEX_CONNECT_ONLY_ARGS.has(argId)) {
        violations.push(
          makeViolation(
            rule,
            `NitroX MS step '${title}' (variant ${variant}) uses ApexConnect-only argument '${argId}' — ` +
              `not supported on NitroXConnect:${variant}${tidSuffix}`
          )
        );
        continue;
      }
      if (otherVariantArgs.has(argId) && !ownVariantArgs.has(argId)) {
        violations.push(
          makeViolation(
            rule,
            `NitroX MS step '${title}' (variant ${variant}) uses argument '${argId}' that belongs to a sibling ` +
              `variant — check whether the apiId variant suffix is correct${tidSuffix}`
          )
        );
        continue;
      }
      if (!NITROX_MS_SHARED_ALLOWED_ARGS.has(argId) && !ownVariantArgs.has(argId)) {
        violations.push(
          makeViolation(
            rule,
            `NitroX MS step '${title}' (variant ${variant}) uses unknown argument '${argId}'${tidSuffix}`
          )
        );
      }
    }
  }

  return violations;
}

/**
 * UI-NITROX-VARIANT-ARG-001 — warn when a variant-specific argument is absent or empty
 * UNLESS it is declared as a runtime-bound parameter under <generatedParameters>
 * (the data-driven pattern used in the Provar regression fixture).
 */
function validateNitroxVariantArgRequired(tc: XmlNode, rule: BPRule): BPViolation[] {
  const violations: BPViolation[] = [];

  for (const call of getAllApiCalls(tc)) {
    const apiId = call['@_apiId'] as string | undefined;
    const variant = getNitroxMsVariant(apiId);
    if (!variant) continue;

    const required = NITROX_MS_VARIANT_REQUIRED_ARGS[variant] ?? [];
    if (required.length === 0) continue;

    const argsById = new Map<string, XmlNode>();
    for (const a of getCallArguments(call)) {
      const id = a['@_id'] as string | undefined;
      if (id) argsById.set(id, a);
    }
    const generatedParams = getGeneratedParamNames(call);

    const title = (call['@_title'] as string | undefined) ?? (call['@_name'] as string | undefined) ?? '(unnamed)';
    const tid = call['@_testItemId'] as string | undefined;
    const tidSuffix = tid ? ` (testItemId=${tid})` : '';

    for (const reqArg of required) {
      if (generatedParams.has(reqArg)) continue; // data-driven — explicitly OK
      const arg = argsById.get(reqArg);
      if (arg && argumentHasValue(arg)) continue;
      violations.push(
        makeViolation(
          rule,
          `NitroX MS step '${title}' (variant ${variant}) is missing required argument '${reqArg}' ` +
            `and no matching <generatedParameters> entry is declared${tidSuffix}`
        )
      );
    }
  }

  return violations;
}

/**
 * Value `class` attributes that, when present on a condition/expression argument,
 * are themselves meaningful content — comparison and boolean-logic operators that
 * Provar emits for `If`/`DoWhile`/`WaitFor` conditions (e.g. `{Count(Rows) > 0}`
 * is stored as `<value class="gt">`). Mirrors the backend operator allow-list.
 */
const MEANINGFUL_VALUE_OPERATOR_CLASSES: ReadonlySet<string> = new Set([
  'gt',
  'lt',
  'eq',
  'ne',
  'ge',
  'le',
  'and',
  'or',
  'not',
]);

/**
 * True when an `<argument>` carries a *meaningful* value, mirroring the Quality
 * Hub `MustContainArgumentValidator` content checks exactly. A `variable` value
 * counts only if it references a `<path>` (or has non-empty text) — a bare
 * `<value class="variable"/>` is effectively empty; `funcCall` and the comparison
 * / logic operator classes always count; `compound` counts only if `<parts>` has
 * children; any other (simple) value counts only if it has non-empty text. An
 * `<argument>` with no `<value>` child, or an empty `<value/>`, is NOT meaningful
 * and is treated as a missing required argument.
 */
function argumentHasMeaningfulValue(arg: XmlNode): boolean {
  for (const value of toArr(arg['value'] as XmlNode | string | Array<XmlNode | string>)) {
    if (value == null) continue;
    if (typeof value === 'string') {
      if (value.trim().length > 0) return true;
      continue;
    }
    if (typeof value !== 'object') continue;
    const v = value;
    const vClass = (v['@_class'] as string | undefined) ?? '';
    // nodeText coerces a numeric #text to string first — a bare `.trim()` throws on it.
    const text = nodeText(v);

    if (vClass === 'variable') {
      if (v['path'] != null || text.length > 0) return true;
      continue; // bare <value class="variable"/> — not meaningful
    }
    if (vClass === 'funcCall' || MEANINGFUL_VALUE_OPERATOR_CLASSES.has(vClass)) return true;
    if (vClass === 'compound') {
      const parts = v['parts'];
      if (parts && typeof parts === 'object' && Object.keys(parts).some((k) => !k.startsWith('@_'))) return true;
      continue;
    }
    if (text.length > 0) return true;
  }
  return false;
}

/** Find an `<argument id=…>` for a call, tolerating both the `<arguments>` wrapper and direct children. */
function findArgumentById(call: XmlNode, argId: string): XmlNode | undefined {
  return getCallArguments(call).find((a) => a['@_id'] === argId) ?? getArguments(call).find((a) => a['@_id'] === argId);
}

/** Human-readable step label for a violation message: `'<title|name>' (testItemId=N)`. */
function stepLabel(call: XmlNode): string {
  const label = (call['@_title'] as string | undefined) ?? (call['@_name'] as string | undefined) ?? '(unnamed)';
  const tid = call['@_testItemId'] as string | undefined;
  return `'${label}'${tid ? ` (testItemId=${tid})` : ''}`;
}

/**
 * True when `call` satisfies a `mustContainArgument` requirement — either the
 * argument is present with a meaningful value, or (for `If`/`DoWhile` conditions)
 * the legacy condition-in-title format is used.
 */
function callSatisfiesRequiredArg(call: XmlNode, requiredArg: string, conditionInTitleAllowed: boolean): boolean {
  const arg = findArgumentById(call, requiredArg);
  if (arg && argumentHasMeaningfulValue(arg)) return true;
  if (!arg && conditionInTitleAllowed) {
    const title = (call['@_title'] as string | undefined) ?? '';
    if (title.includes('{') && title.includes('}')) return true; // legacy condition-in-title format
  }
  return false;
}

/**
 * mustContainArgument — every apiCall whose apiId equals `check.apiId` must carry a
 * populated `<argument id="check.argument">`. Faithful TypeScript port of the
 * Quality Hub `MustContainArgumentValidator`, so the local (offline) result and
 * the back-end agree: present-AND-non-empty semantics via
 * {@link argumentHasMeaningfulValue} (an absent argument OR an empty
 * `<argument/>`/`<value/>` is a violation); exact apiId match (no substring /
 * variant widening); the legacy exception where `If`/`DoWhile` may carry the
 * condition in the step `title` (`If: {expr}`) instead of a `condition` argument;
 * disabled steps are NOT skipped (a missing required argument is load/exec
 * blocking regardless of the disabled flag); and one violation per rule (the
 * back-end returns the first offender), so the weighted-deduction score stays in
 * parity with the Lambda. The message still names every offending step without
 * inflating `count`.
 */
function validateMustContainArgument(tc: XmlNode, rule: BPRule): BPViolation | null {
  const targetApiId = (rule.check['apiId'] as string | undefined) ?? '';
  const requiredArg = (rule.check['argument'] as string | undefined) ?? '';
  if (!targetApiId || !requiredArg) return null;

  const conditionInTitleAllowed =
    requiredArg === 'condition' &&
    (targetApiId === 'com.provar.plugins.bundled.apis.If' ||
      targetApiId === 'com.provar.plugins.bundled.apis.control.DoWhile');

  const offending: string[] = [];
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== targetApiId) continue;
    if (callSatisfiesRequiredArg(call, requiredArg, conditionInTitleAllowed)) continue;
    offending.push(stepLabel(call));
  }

  if (!offending.length) return null;
  const apiName = targetApiId.split('.').pop() ?? targetApiId;
  let msg = `${apiName} step missing required '${requiredArg}' argument: ${offending.slice(0, 2).join(', ')}`;
  if (offending.length > 2) msg += ` (and ${offending.length - 2} more)`;
  // Intentionally no `count`: the back-end reports a single violation per rule, so
  // omitting count keeps the weighted-deduction score in parity with the Lambda.
  return makeViolation(rule, msg);
}

// ── Render / load-blocking validators (Tier 2) ───────────────────────────────
// Faithful ports of the Quality Hub XMLRendering / InvalidValueClass /
// DateValueClassFormat / ApexConnect* / SetValuesInvalidElements validators.
// These check types map 1:1 to load-blocking rules (mostly `critical`) that
// stop a test case rendering or loading in the Provar IDE. Each returns a
// single BPViolation per rule (the back-end reports the first offender and sets
// `count = len(offenders)` only when > 1), so the weighted-deduction score stays
// in parity with the Lambda.

const APEX_CONNECT_API_ID = 'com.provar.plugins.forcedotcom.core.testapis.ApexConnect';
const SETVALUES_API_ID = 'com.provar.plugins.bundled.apis.control.SetValues';

/**
 * Recursively collect every element that appears under `tag` anywhere in the
 * subtree (the fast-xml-parser equivalent of ElementTree's `.//tag`). Returns
 * the raw values (object, string, or — for repeated tags — each array member);
 * callers filter to objects when they need attributes. Mirrors the back-end's
 * descendant search so nested-step double-counting matches exactly.
 */
function collectElementsByTag(node: unknown, tag: string): unknown[] {
  const out: unknown[] = [];
  function walk(n: unknown): void {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
      return;
    }
    for (const [k, v] of Object.entries(n as XmlNode)) {
      if (k.startsWith('@_') || k === '#text') continue;
      if (k === tag) for (const item of toArr(v)) out.push(item);
      walk(v);
    }
  }
  walk(node);
  return out;
}

/** Object-form `<value>` descendants of a node (string-only text values are skipped). */
function collectValueElements(node: unknown): XmlNode[] {
  return collectElementsByTag(node, 'value').filter((v): v is XmlNode => v != null && typeof v === 'object');
}

/**
 * Trimmed text of an element's `#text`, coercing to string first. fast-xml-parser
 * parses numeric tag text to a `number` (e.g. an epoch-millis date), so a raw
 * `.trim()` on `#text` would throw — always read element text through here.
 */
function nodeText(node: XmlNode): string {
  const t = node['#text'];
  return t == null ? '' : String(t).trim();
}

/** Step context used in load-blocking violation messages, mirroring the back-end defaults. */
function stepContext(call: XmlNode): { apiName: string; title: string; tid: string } {
  const apiId = (call['@_apiId'] as string | undefined) ?? '';
  const apiName = apiId ? apiId.split('.').pop() ?? apiId : 'Unknown';
  const title = (call['@_title'] as string | undefined) ?? apiName;
  const tid = (call['@_testItemId'] as string | undefined) ?? 'N/A';
  return { apiName, title, tid };
}

/** A `<value>` element paired with the id of the `<argument>` that encloses it (`unknown` if none). */
interface StepValueElem {
  value: XmlNode;
  argId: string;
}

/**
 * Every `<value>` element within an apiCall, tagged with its parent `<argument id>`.
 * Replicates the back-end's "find the first enclosing argument" lookup so violation
 * messages name the right argument. Values not inside any argument get `unknown`.
 */
function getStepValueElements(call: XmlNode): StepValueElem[] {
  const argOf = new Map<XmlNode, string>();
  for (const arg of collectElementsByTag(call, 'argument')) {
    if (!arg || typeof arg !== 'object') continue;
    const id = ((arg as XmlNode)['@_id'] as string | undefined) ?? 'unknown';
    for (const v of collectValueElements(arg)) if (!argOf.has(v)) argOf.set(v, id);
  }
  return collectValueElements(call).map((value) => ({ value, argId: argOf.get(value) ?? 'unknown' }));
}

/** Trimmed text of an argument's direct `<value>` child (handles string and object forms). */
function directValueText(arg: XmlNode): string {
  const v = Array.isArray(arg['value']) ? (arg['value'] as unknown[])[0] : arg['value'];
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v !== 'object') return String(v).trim();
  return nodeText(v as XmlNode);
}

// RENDER-CASE-001 — the valueClass values that actually exist. This validator only
// inspects the `valueClass` attribute, and a full-corpus scan (AllPOCProjects) shows
// exactly SIX distinct valueClass values: string, boolean, decimal, id, date, dateTime
// — matching the back-end's VALID_VALUE_CLASSES. (The earlier list also carried
// `class="..."` tokens — variable/compound/funcCall/value/valueList/operators — and
// `integer`; none of those ever appear as a valueClass, so they were dead entries, and
// `id` — a real corpus valueClass — was missing. Coordinated with the QH back-end.)
const VALUE_CLASS_CASING_VALID: ReadonlySet<string> = new Set([
  'string',
  'boolean',
  'decimal',
  'id',
  'date',
  'datetime',
]);

// Canonical Provar spelling for valueClasses whose correct form is NOT all-lowercase.
// The corpus uses camelCase `dateTime` exclusively (lowercase `datetime` never appears),
// so the casing check must expect `dateTime`; every other valueClass is all-lowercase.
const VALUE_CLASS_CANONICAL_CASE: Record<string, string> = { datetime: 'dateTime' };

/** RENDER-CASE-001 — a known valueClass spelled with wrong case (e.g. `Boolean` → `boolean`). */
function validateValueClassCasing(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ valueClass: string; expected: string }> = [];
  for (const v of collectValueElements(tc)) {
    const vc = v['@_valueClass'] as string | undefined;
    if (!vc) continue;
    const lower = vc.toLowerCase();
    if (!VALUE_CLASS_CASING_VALID.has(lower)) continue;
    const expected = VALUE_CLASS_CANONICAL_CASE[lower] ?? lower;
    if (vc !== expected) offenders.push({ valueClass: vc, expected });
  }
  if (!offenders.length) return null;
  const MAX = 5;
  const reported = Math.min(offenders.length, MAX);
  let msg = offenders
    .slice(0, 3)
    .map((o) => `valueClass='${o.valueClass}' should be '${o.expected}'`)
    .join('; ');
  if (reported > 3) msg += ` (+${reported - 3} more)`;
  if (offenders.length > MAX) msg += ` (total: ${offenders.length})`;
  return makeViolation(rule, msg, reported);
}

const BOOLEAN_CASING_BAD: ReadonlySet<string> = new Set(['True', 'False', 'TRUE', 'FALSE']);

/** RENDER-BOOL-001 — `<value valueClass="boolean">` text must be lowercase `true`/`false`. */
function validateBooleanCasing(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: string[] = [];
  for (const v of collectValueElements(tc)) {
    if (v['@_valueClass'] !== 'boolean') continue;
    const text = nodeText(v);
    if (BOOLEAN_CASING_BAD.has(text)) offenders.push(text);
  }
  if (!offenders.length) return null;
  const MAX = 5;
  const reported = Math.min(offenders.length, MAX);
  let msg = `Boolean values must be lowercase: ${offenders
    .slice(0, 3)
    .map((t) => `'${t}' should be '${t.toLowerCase()}'`)
    .join('; ')}`;
  if (reported > 3) msg += ` (+${reported - 3} more)`;
  if (offenders.length > MAX) msg += ` (total: ${offenders.length})`;
  return makeViolation(rule, msg, reported);
}

// VALUE-CLASS-001 — the back-end HARDCODES these sets and ignores the rule JSON's
// validClasses list, so we mirror the hardcoded sets (note `invalid` and
// `namedValues` are accepted, and `dateTime` is camelCase) to stay score-exact.
const VALID_VALUE_ELEMENT_CLASSES: ReadonlySet<string> = new Set([
  'value',
  'variable',
  'compound',
  'funcCall',
  'valueList',
  'namedValues',
  'uiWait',
  'uiLocator',
  'uiTarget',
  'uiInteraction',
  'restTarget',
  'excelTarget',
  'csvTarget',
  'url',
  'template',
  'add',
  'sub',
  'mult',
  'div',
  'eq',
  'ne',
  'gt',
  'lt',
  'ge',
  'le',
  'and',
  'or',
  'match',
  'invalid',
]);
const VALID_VALUE_CLASS_TYPES: ReadonlySet<string> = new Set([
  'string',
  'boolean',
  'decimal',
  'id',
  'date',
  'dateTime',
]);

/** Classify one `<value>` for VALUE-CLASS-001, or `null` when it is valid / unattributed. */
function classifyInvalidValueClass(v: XmlNode): { kind: 'class' | 'valueClass'; bad: string } | null {
  const cls = (v['@_class'] as string | undefined) ?? '';
  if (!cls) return null;
  if (!VALID_VALUE_ELEMENT_CLASSES.has(cls)) return { kind: 'class', bad: cls };
  const vc = (v['@_valueClass'] as string | undefined) ?? '';
  if (cls === 'value' && vc && !VALID_VALUE_CLASS_TYPES.has(vc)) return { kind: 'valueClass', bad: vc };
  return null;
}

/** VALUE-CLASS-001 — `<value class="…">` must use a valid class (and valueClass when class="value"). */
function validateInvalidValueClass(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{
    argId: string;
    ctx: ReturnType<typeof stepContext>;
    kind: 'class' | 'valueClass';
    bad: string;
  }> = [];
  for (const call of getAllApiCalls(tc)) {
    const ctx = stepContext(call);
    for (const { value, argId } of getStepValueElements(call)) {
      const c = classifyInvalidValueClass(value);
      if (c) offenders.push({ argId, ctx, kind: c.kind, bad: c.bad });
    }
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  const message =
    f.kind === 'class'
      ? `Step '${f.ctx.title}' has invalid class="${f.bad}" in argument '${f.argId}'. Valid class values: value, ` +
        'variable, compound, funcCall, valueList, uiWait, uiLocator, uiTarget, etc. For empty arguments, omit ' +
        `<value> entirely: <argument id="${f.argId}"/> (testItemId=${f.ctx.tid})`
      : `Step '${f.ctx.title}' has invalid valueClass="${f.bad}" in argument '${f.argId}'. Valid valueClass values: ` +
        `string, boolean, decimal, id, date, dateTime. (testItemId=${f.ctx.tid})`;
  return makeViolation(rule, message, offenders.length);
}

/** RENDER-DATE-VALUECLASS-001 — `valueClass="date"|"dateTime"` text must be an epoch-millis integer. */
function validateDateValueClassFormat(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ argId: string; ctx: ReturnType<typeof stepContext>; vc: string; text: string }> = [];
  for (const call of getAllApiCalls(tc)) {
    const ctx = stepContext(call);
    for (const { value, argId } of getStepValueElements(call)) {
      if (value['@_class'] !== 'value') continue;
      const vc = (value['@_valueClass'] as string | undefined) ?? '';
      if (vc !== 'date' && vc !== 'dateTime') continue;
      const text = nodeText(value);
      if (!text || /^\d+$/.test(text)) continue;
      offenders.push({ argId, ctx, vc, text: text.slice(0, 50) });
    }
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  const message =
    `Step '${f.ctx.title}' uses valueClass='${f.vc}' with invalid string value '${f.text}' in argument ` +
    `'${f.argId}'. valueClass='${f.vc}' requires an epoch timestamp (milliseconds), not a date string. This ` +
    `causes test case loading failures in Provar. (testItemId=${f.ctx.tid})`;
  return makeViolation(rule, message, offenders.length);
}

/** Return the ApexConnect calls in a test case (exact apiId match, nested-aware). */
function getApexConnectCalls(tc: XmlNode): XmlNode[] {
  return getAllApiCalls(tc).filter((c) => c['@_apiId'] === APEX_CONNECT_API_ID);
}

/** APEX-REUSE-CONN-001 — ApexConnect `reuseConnectionName` must be blank. */
function validateApexConnectReuseConnection(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; value: string }> = [];
  for (const call of getApexConnectCalls(tc)) {
    const arg = getCallArguments(call).find((a) => a['@_id'] === 'reuseConnectionName');
    if (!arg) continue;
    const text = directValueText(arg);
    if (text) offenders.push({ ctx: stepContext(call), value: text });
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  const message =
    `ApexConnect step '${f.ctx.title}' has non-empty reuseConnectionName value '${f.value}'. The ` +
    `reuseConnectionName argument should be left blank: <argument id="reuseConnectionName"/> (testItemId=${f.ctx.tid})`;
  return makeViolation(rule, message, offenders.length);
}

const APEX_CONNECT_VALID_ARGS_DEFAULT: readonly string[] = [
  'connectionName',
  'resultName',
  'resultScope',
  'uiApplicationName',
  'quickUiLogin',
  'closeAllPrimaryTabs',
  'reuseConnectionName',
  'alreadyOpenBehaviour',
  'autoCleanup',
  'cleanupConnectionName',
  'logFileLocation',
  'connectionId',
  'enableObjectIdLogging',
  'privateBrowsingMode',
  'lightningMode',
  'username',
  'password',
  'securityToken',
  'environment',
  'webBrowser',
];

/** APEX-CONNECT-ARGS-001 — every ApexConnect `<argument id>` must be in the valid whitelist. */
function validateApexConnectValidArguments(tc: XmlNode, rule: BPRule): BPViolation | null {
  const validIds = new Set<string>(
    (rule.check['validArgumentIds'] as string[] | undefined) ?? APEX_CONNECT_VALID_ARGS_DEFAULT
  );
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; id: string }> = [];
  for (const call of getApexConnectCalls(tc)) {
    if (!call['arguments'] || typeof call['arguments'] !== 'object') continue;
    for (const arg of getCallArguments(call)) {
      const id = arg['@_id'] as string | undefined;
      if (id && !validIds.has(id)) offenders.push({ ctx: stepContext(call), id });
    }
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  const message =
    `ApexConnect step '${f.ctx.title}' uses invalid argument ID(s): ${offenders.map((o) => o.id).join(', ')}. ` +
    'Only the documented ApexConnect argument IDs are valid (connectionName, resultName, resultScope, …, ' +
    'webBrowser). Leave unused arguments empty (e.g. <argument id="username"/>) rather than inventing IDs. ' +
    `(testItemId=${f.ctx.tid})`;
  return makeViolation(rule, message, offenders.length);
}

/** APEX-CONNECT-CONNID-001 — `connectionId` value must use `valueClass="id"`, not string/other. */
function validateApexConnectConnectionIdValueClass(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; wrong: string; value: string }> = [];
  for (const call of getApexConnectCalls(tc)) {
    const arg = getCallArguments(call).find((a) => a['@_id'] === 'connectionId');
    if (!arg) continue;
    const ve = Array.isArray(arg['value']) ? (arg['value'] as unknown[])[0] : arg['value'];
    if (!ve || typeof ve !== 'object') continue;
    const v = ve as XmlNode;
    const vc = (v['@_valueClass'] as string | undefined) ?? '';
    if (v['@_class'] !== 'value' || !vc || vc === 'id') continue;
    offenders.push({ ctx: stepContext(call), wrong: vc, value: nodeText(v) });
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  const message =
    `ApexConnect step '${f.ctx.title}' uses incorrect valueClass='${f.wrong}' for connectionId argument. The ` +
    "connectionId must use valueClass='id' with a GUID value, NOT valueClass='string'. Current value: " +
    `'${f.value}'. If you have no specific connection GUID, leave it empty: <argument id="connectionId"/> ` +
    `(testItemId=${f.ctx.tid})`;
  return makeViolation(rule, message, offenders.length);
}

/** Tags found directly under a `<namedValues>` container that are not the allowed `namedValue`. */
function namedValuesInvalidChildren(nv: XmlNode): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(nv)) {
    if (k.startsWith('@_') || k === '#text' || k === 'namedValue') continue;
    const instances = toArr(v).length; // one entry per element instance (mirrors the back-end count)
    for (let i = 0; i < instances; i++) bad.push(k);
  }
  return bad;
}

/** SETVALUES-INVALID-ELEMENT-001 — reject hallucinated `<namedValueSet>`/`<name>` and bad namedValues children. */
function validateSetValuesInvalidElements(tc: XmlNode, rule: BPRule): BPViolation | null {
  const invalidElements = (rule.check['invalidElements'] as string[] | undefined) ?? ['namedValueSet', 'name'];
  let count = 0;
  let first: { ctx: ReturnType<typeof stepContext>; elem: string; context?: string } | null = null;
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== SETVALUES_API_ID) continue;
    const ctx = stepContext(call);
    for (const elem of invalidElements) {
      if (collectElementsByTag(call, elem).length) {
        count++;
        first ??= { ctx, elem };
      }
    }
    for (const nv of collectElementsByTag(call, 'namedValues')) {
      if (!nv || typeof nv !== 'object') continue;
      for (const childTag of namedValuesInvalidChildren(nv as XmlNode)) {
        count++;
        first ??= { ctx, elem: childTag, context: 'inside <namedValues>' };
      }
    }
  }
  if (!first) return null;
  const ctxStr = first.context ? ` ${first.context}` : '';
  const message =
    `SetValues step '${first.ctx.title}' contains invalid element <${first.elem}>${ctxStr}. SetValues must use ` +
    '<namedValues mutable="Mutable"> with <namedValue name="valuePath|value|valueScope"> children. Do not use ' +
    `<namedValueSet> or <name> elements. (testItemId=${first.ctx.tid})`;
  return makeViolation(rule, message, count);
}

// ── Back-end-only rules (Tier 4) ─────────────────────────────────────────────
// Ports of seven Quality Hub validators that existed only in the back-end rule
// set. All seven rules are severity=major / weight=5. Score parity: six emit a
// single violation (the back-end returns the first offender; `count` is set only
// for the two UI-locator checks, and only when >1 offender); `varStringLiteral`
// emits ONE violation per offending value (the back-end returns a list, scored
// linearly) — do not collapse it.

const ASSERT_VALUES_API_ID = 'com.provar.plugins.bundled.apis.AssertValues';
const DB_CONNECT_API_ID = 'com.provar.plugins.bundled.apis.db.DbConnect';
const UI_DO_ACTION_API_ID = 'com.provar.plugins.forcedotcom.core.ui.UiDoAction';

// DB operation steps whose dbConnectionName must reference a DbConnect resultName
// (both the modern `db.*` and legacy `data.*` namespaces, mirroring the back-end).
const DB_OPERATION_API_IDS: ReadonlySet<string> = new Set([
  'com.provar.plugins.bundled.apis.db.SqlQuery',
  'com.provar.plugins.bundled.apis.db.DbRead',
  'com.provar.plugins.bundled.apis.db.DbInsert',
  'com.provar.plugins.bundled.apis.db.DbUpdate',
  'com.provar.plugins.bundled.apis.db.DbDelete',
  'com.provar.plugins.bundled.apis.data.SqlQuery',
  'com.provar.plugins.bundled.apis.data.DbRead',
  'com.provar.plugins.bundled.apis.data.DbInsert',
  'com.provar.plugins.bundled.apis.data.DbUpdate',
  'com.provar.plugins.bundled.apis.data.DbDelete',
]);

/** Escape a literal for safe embedding in a RegExp (mirrors Python's re.escape). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve an argument's text value, mirroring the back-end `get_argument_value`:
 * `variable` → first `<path>` element name, `compound` → concatenated `<parts>`
 * text, otherwise the element text. Wrapper-aware (handles both the `<arguments>`
 * wrapper and direct `<argument>` children) via {@link findArgumentById}.
 */
function resolvedArgText(call: XmlNode, argId: string): string {
  const arg = findArgumentById(call, argId);
  if (!arg) return '';
  const raw = arg['value'];
  const ve = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  if (ve == null) return '';
  if (typeof ve === 'string') return ve.trim();
  if (typeof ve !== 'object') return String(ve).trim();
  const v = ve as XmlNode;
  const cls = v['@_class'] as string | undefined;
  if (cls === 'variable') {
    const firstPath = toArr(v['path'] as XmlNode | XmlNode[])[0] as XmlNode | undefined;
    return ((firstPath?.['@_element'] as string | undefined) ?? '').trim();
  }
  if (cls === 'compound') {
    const partsNode = (v['parts'] as XmlNode | undefined)?.['value'];
    return toArr(partsNode as XmlNode | XmlNode[])
      .filter((p) => p && typeof p === 'object')
      .map((p) => nodeText(p))
      .join('');
  }
  return nodeText(v);
}

// Matches a bare variable token only: `{Name}` or `{Obj.Field}`. The character
// class `[\w.]` excludes `:`, so binding-style expressions such as
// `{targetUrl:object}` never match — they are inherently safe and need no
// argument-name exemption.
const VAR_LITERAL_PATTERN = /^\{[\w.]+\}$/;

/**
 * VAR-STRING-LITERAL-001 — a `{Var}`/`{Obj.Field}` token stored as
 * `class="value" valueClass="string"` instead of `class="variable"`. Provar does
 * not resolve it at runtime, so the API silently receives the literal text. Emits
 * ONE violation per offending value (the back-end returns a list).
 *
 * Local correction (PDX-508): the back-end exempts `sfUiTargetObjectId` /
 * `sfUiTargetResultName` from this check, but field evidence shows a bare
 * `{Variable}` in those UI-target args is NOT interpolated — it lands in the URL
 * as `%7B…%7D` and the step hard-fails (a load/exec stopper, not a warning). We
 * therefore do NOT exempt those args. Binding-style `{ns:key}` expressions stay
 * safe because {@link VAR_LITERAL_PATTERN} already excludes them (the colon). A
 * matching change is queued for the Quality Hub back-end so the score parity is
 * restored once both ship.
 */
function validateVarStringLiteral(tc: XmlNode, rule: BPRule): BPViolation[] {
  const violations: BPViolation[] = [];
  for (const call of getAllApiCalls(tc)) {
    const ctx = stepContext(call);
    for (const { value } of getStepValueElements(call)) {
      if (value['@_class'] !== 'value' || value['@_valueClass'] !== 'string') continue;
      const text = nodeText(value);
      if (!VAR_LITERAL_PATTERN.test(text)) continue;
      violations.push(
        makeViolation(
          rule,
          `Argument value "${text}" looks like a variable reference but is stored as a plain string — Provar ` +
            'will not resolve it at runtime. Use <value class="variable"> instead ' +
            `(step '${ctx.title}', testItemId=${ctx.tid})`
        )
      );
    }
  }
  return violations;
}

/** CONN-DB-002 — every DB operation's dbConnectionName must match a DbConnect resultName in the test. */
function validateDbConnectResultNameMismatch(tc: XmlNode, rule: BPRule): BPViolation | null {
  const calls = getAllApiCalls(tc);
  const resultNames = new Set<string>();
  for (const call of calls) {
    if (call['@_apiId'] !== DB_CONNECT_API_ID) continue;
    const rn = resolvedArgText(call, 'resultName');
    if (rn) resultNames.add(rn);
  }
  if (!resultNames.size) return null; // no DbConnect resultName — CONN-DB-001 covers a missing DbConnect

  const offenders: string[] = [];
  for (const call of calls) {
    if (!DB_OPERATION_API_IDS.has(call['@_apiId'] as string)) continue;
    const ref = resolvedArgText(call, 'dbConnectionName');
    if (!ref || resultNames.has(ref)) continue;
    offenders.push(`'${stepContext(call).title.slice(0, 40)}' uses dbConnectionName='${ref}'`);
  }
  if (!offenders.length) return null;
  const names = [...resultNames].sort().join(', ');
  return makeViolation(
    rule,
    `DbConnect resultName does not match dbConnectionName in ${offenders.length} DB operation(s): ` +
      `${offenders[0]} but DbConnect resultName(s) are: ${names}`
  );
}

/** The `<value>` children of a SetValues `<namedValue name="value">` (the assigned-value slot). */
function getSetValuesValueElements(call: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  for (const nv of collectElementsByTag(call, 'namedValue')) {
    if (!nv || typeof nv !== 'object' || (nv as XmlNode)['@_name'] !== 'value') continue;
    for (const v of toArr((nv as XmlNode)['value'] as XmlNode | XmlNode[])) {
      if (v && typeof v === 'object') out.push(v);
    }
  }
  return out;
}

const SETVALUES_FUNC_EXPR = /\{[A-Za-z][A-Za-z0-9]*\s*\([^)]*\)\s*\}/;
const SETVALUES_ZERO_IDX = /\{[^}]*\[0\][^}]*\}/;

/** First SetValues `valueClass="string"` value whose text matches `re` (string-template anti-patterns). */
function firstSetValuesStringMatch(
  tc: XmlNode,
  re: RegExp
): { ctx: ReturnType<typeof stepContext>; text: string } | null {
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== SETVALUES_API_ID) continue;
    for (const ve of getSetValuesValueElements(call)) {
      if (ve['@_class'] !== 'value' || ve['@_valueClass'] !== 'string') continue;
      const text = nodeText(ve);
      if (re.test(text)) return { ctx: stepContext(call), text };
    }
  }
  return null;
}

/** SETVALUES-FUNC-STR-001 — SetValues uses `{Func(args)}` string interpolation instead of a `funcCall` value. */
function validateSetValuesFuncCallString(tc: XmlNode, rule: BPRule): BPViolation | null {
  const hit = firstSetValuesStringMatch(tc, SETVALUES_FUNC_EXPR);
  if (!hit) return null;
  return makeViolation(
    rule,
    'SetValues uses string interpolation for a function call — the value will not be evaluated: ' +
      `'${hit.ctx.title.slice(0, 50)}' value='${hit.text.slice(0, 60)}' (testItemId=${hit.ctx.tid})`
  );
}

/** SETVALUES-ZERO-IDX-001 — SetValues string template uses a 0 index (templates are 1-indexed). */
function validateSetValuesZeroIndexString(tc: XmlNode, rule: BPRule): BPViolation | null {
  const hit = firstSetValuesStringMatch(tc, SETVALUES_ZERO_IDX);
  if (!hit) return null;
  return makeViolation(
    rule,
    'SetValues string expression uses a [0] index — Provar string templates are 1-indexed, causing an ' +
      `out-of-bounds error at runtime: '${hit.ctx.title.slice(0, 50)}' value='${hit.text.slice(0, 60)}' — use ` +
      `[1] for the first item (testItemId=${hit.ctx.tid})`
  );
}

const ASSERT_WHOLE_EXPR = /^\s*\{[^{}]+\}\s*$/;

/** The direct `<value>` element child of an argument (wrapper-aware), or undefined. */
function directArgValueElement(call: XmlNode, argId: string): XmlNode | undefined {
  const arg = findArgumentById(call, argId);
  if (!arg) return undefined;
  const raw = arg['value'];
  const ve = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  return ve && typeof ve === 'object' ? (ve as XmlNode) : undefined;
}

/** ASSERT-STR-VAR-001 — AssertValues references a variable via a `{Var}` string literal instead of `class="variable"`. */
function validateAssertValuesStringExpr(tc: XmlNode, rule: BPRule): BPViolation | null {
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== ASSERT_VALUES_API_ID) continue;
    for (const argId of ['expectedValue', 'actualValue']) {
      const v = directArgValueElement(call, argId);
      if (!v || v['@_class'] !== 'value' || v['@_valueClass'] !== 'string') continue;
      const text = nodeText(v);
      if (!ASSERT_WHOLE_EXPR.test(text)) continue;
      const ctx = stepContext(call);
      return makeViolation(
        rule,
        'AssertValues uses a string literal to reference a variable — the assertion compares the literal text, ' +
          `not the variable value: '${ctx.title.slice(0, 50)}' ${argId}='${text.slice(0, 60)}' should use ` +
          `<value class="variable"> (testItemId=${ctx.tid})`
      );
    }
  }
  return null;
}

/** The `uri` of a UiDoAction's `locator` argument value (`class="uiLocator"`), or '' if absent. */
function getUiDoActionLocatorUri(call: XmlNode): string {
  const arg = getCallArguments(call).find((a) => a['@_id'] === 'locator');
  if (!arg) return '';
  for (const v of toArr(arg['value'] as XmlNode | XmlNode[])) {
    if (v && typeof v === 'object' && v['@_class'] === 'uiLocator') {
      return (v['@_uri'] as string | undefined) ?? '';
    }
  }
  return '';
}

// Standard SF flow buttons whose locator name must use the corpus-validated casing/path.
const UI_WRONG_BUTTONS: ReadonlyArray<readonly [string, string]> = [
  ['Cancel', "use 'name=cancel' (lowercase)"],
  ['continue', "the Continue button on record type selection screens uses 'name=save&path=selectRecordType'"],
  ['Continue', "the Continue button on record type selection screens uses 'name=save&path=selectRecordType'"],
];

/** UI-LOCATOR-BUTTON-CASING-001 — Cancel/Continue flow buttons must use the correct locator name. */
function validateUiLocatorButtonCasing(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; wrong: string; explanation: string; uri: string }> = [];
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== UI_DO_ACTION_API_ID) continue;
    const uri = getUiDoActionLocatorUri(call);
    if (!uri) continue;
    for (const [wrong, explanation] of UI_WRONG_BUTTONS) {
      if (new RegExp(`name=${escapeRegExp(wrong)}(&|$)`).test(uri)) {
        offenders.push({ ctx: stepContext(call), wrong, explanation, uri });
        break; // only report the first match per step (mirrors the back-end)
      }
    }
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  return makeViolation(
    rule,
    `Step '${f.ctx.title}' uses incorrect button name 'name=${f.wrong}': ${f.explanation}. Incorrect button ` +
      `names cause Provar to show 'Not Available' and fail at runtime. Current URI: ${f.uri.slice(0, 120)} ` +
      `(testItemId=${f.ctx.tid})`,
    offenders.length
  );
}

const UI_RECORDTYPE_WRONG = /name=recordType(Id)?(&|$)/;

/** UI-LOCATOR-RECORDTYPE-001 — the Record Type picker locator must use `name=RecordType`, not `name=recordType(Id)`. */
function validateUiLocatorRecordTypeField(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; uri: string }> = [];
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== UI_DO_ACTION_API_ID) continue;
    const uri = getUiDoActionLocatorUri(call);
    if (!uri || !UI_RECORDTYPE_WRONG.test(uri)) continue;
    offenders.push({ ctx: stepContext(call), uri });
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  return makeViolation(
    rule,
    `Step '${f.ctx.title}' uses an incorrect Record Type field locator. The Record Type picker must use ` +
      "'name=RecordType' (not 'name=recordTypeId' or 'name=recordType') with 'field=RecordTypeId' in the binding. " +
      `Current URI: ${f.uri.slice(0, 150)} (testItemId=${f.ctx.tid})`,
    offenders.length
  );
}

// ── Structural / load-affecting check types (Tier 5) ─────────────────────────
// Faithful ports of nine Quality Hub structural validators. Six emit a single
// first-offender violation with no `count`; validFuncCallId, the two UiAssert
// structure checks, and bindingParameterOrder collect every offender and emit
// one violation carrying `count` (capped at 5 for funcCall), matching the
// back-end so the weighted-deduction score stays in parity with the Lambda.

const UI_ASSERT_API_ID = 'com.provar.plugins.forcedotcom.core.ui.UiAssert';

// FUNCCALL-VALID-001 — Provar's built-in funcCall ids (exact back-end whitelist, 20 entries).
const VALID_FUNCCALL_IDS: ReadonlySet<string> = new Set([
  'TestCaseName',
  'TestCasePath',
  'TestCaseOutcome',
  'TestCaseSuccessful',
  'TestCaseErrors',
  'TestRunErrors',
  'StringReplace',
  'StringTrim',
  'StringNormalize',
  'DateAdd',
  'DateFormat',
  'DateParse',
  'Count',
  'Round',
  'NumberFormat',
  'Not',
  'IsSorted',
  'GetEnvironmentVariable',
  'GetSelectedEnvironment',
  'UniqueId',
]);

/** FUNCCALL-VALID-001 — every `<value class="funcCall">` `id` must be a real Provar built-in function. */
function validateValidFuncCallId(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: string[] = [];
  for (const v of collectValueElements(tc)) {
    if (v['@_class'] !== 'funcCall') continue;
    const id = (v['@_id'] as string | undefined) ?? '';
    if (id && !VALID_FUNCCALL_IDS.has(id)) offenders.push(id);
  }
  if (!offenders.length) return null;
  const MAX = 5;
  let msg = `Unknown funcCall id(s) — these functions do not exist in Provar: ${offenders
    .slice(0, 3)
    .map((id) => `'${id}'`)
    .join(', ')}`;
  if (offenders.length > 3) msg += ` (+${offenders.length - 3} more)`;
  msg +=
    '. Valid functions include Count, DateAdd, DateFormat, Round, StringReplace, UniqueId, etc. ' +
    'For string concatenation use <value class="compound"><parts>…</parts></value>.';
  return makeViolation(rule, msg, Math.min(offenders.length, MAX));
}

// RENDER-ROOT-001 — the only attributes allowed on the root <testCase> element.
const VALID_ROOT_ATTRS: ReadonlySet<string> = new Set([
  'guid',
  'id',
  'name',
  'visibility',
  'registryId',
  'failureBehaviour',
]);

/** RENDER-ROOT-001 — the root `<testCase>` element must not carry unknown attributes. */
function validateRootAttributes(tc: XmlNode, rule: BPRule): BPViolation | null {
  const unknown = Object.keys(tc)
    .filter((k) => k.startsWith('@_'))
    .map((k) => k.slice(2))
    .filter((a) => !VALID_ROOT_ATTRS.has(a));
  if (!unknown.length) return null;
  return makeViolation(rule, `Unknown root attributes: ${unknown.join(', ')}`);
}

/** SETVALUES-STRUCTURE-001 — every SetValues step must contain a `<namedValues>` container. */
function validateSetValuesStructure(tc: XmlNode, rule: BPRule): BPViolation | null {
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== SETVALUES_API_ID) continue;
    // Data-driven SetValues pull their values from an external source declared in
    // <parameterValueSources> (e.g. an Excel/CSV binding) and legitimately carry an
    // empty <value class="valueList"/> with no inline <namedValues>. Not a defect.
    if (call['parameterValueSources'] != null) continue;
    if (collectElementsByTag(call, 'namedValues').length) continue;
    return makeViolation(rule, `SetValues step missing <namedValues> container (testItemId=${stepContext(call).tid})`);
  }
  return null;
}

/** SETVALUES-NAME-001 — every `<namedValue>` in a SetValues step must carry a `name` attribute. */
function validateNamedValueName(tc: XmlNode, rule: BPRule): BPViolation | null {
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== SETVALUES_API_ID) continue;
    for (const nv of collectElementsByTag(call, 'namedValue')) {
      if (!nv || typeof nv !== 'object' || (nv as XmlNode)['@_name']) continue;
      return makeViolation(
        rule,
        `namedValue in SetValues step missing name attribute (testItemId=${stepContext(call).tid})`
      );
    }
  }
  return null;
}

// The QEditor SetValues form stores each assignment as a triple of namedValue slots:
// `valuePath` (target field), `value` (data), `valueScope`. Any of these may be left
// empty — a blank `value` sets the field to blank, and a wholly-blank row is an unused
// row Provar simply ignores. So an empty structural slot is NOT a "missing value" defect.
const SETVALUES_BLANKABLE_SLOTS: ReadonlySet<string> = new Set(['valuePath', 'value', 'valueScope']);

/** SETVALUES-VALUE-001 — every `<namedValue>` in a SetValues step must contain a child `<value>`. */
function validateNamedValueValue(tc: XmlNode, rule: BPRule): BPViolation | null {
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== SETVALUES_API_ID) continue;
    for (const nv of collectElementsByTag(call, 'namedValue')) {
      if (!nv || typeof nv !== 'object') continue;
      const node = nv as XmlNode;
      if (node['value'] != null) continue;
      // A blank structural slot (valuePath/value/valueScope) is valid (empty value /
      // unused row). Only a non-standard namedValue missing its value is a real defect.
      if (SETVALUES_BLANKABLE_SLOTS.has((node['@_name'] as string | undefined) ?? '')) continue;
      return makeViolation(
        rule,
        `namedValue in SetValues step missing value element (testItemId=${stepContext(call).tid})`
      );
    }
  }
  return null;
}

/** UI-ASSERT-STRUCT-002 — UiAssert steps must not contain a (hallucinated) `<generatedParameters>` element. */
function validateUiAssertHallucinatedGeneratedParameters(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<ReturnType<typeof stepContext>> = [];
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== UI_ASSERT_API_ID || call['generatedParameters'] == null) continue;
    offenders.push(stepContext(call));
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  return makeViolation(
    rule,
    `UiAssert step '${f.title}' contains a hallucinated <generatedParameters> element — UiAssert steps never ` +
      `contain generatedParameters; remove the entire section (testItemId=${f.tid})`,
    offenders.length
  );
}

// UI-ASSERT-STRUCT-001 — arguments every UiAssert step must declare (even if empty).
const UI_ASSERT_REQUIRED_ARGS: readonly string[] = [
  'fieldAssertions',
  'columnAssertions',
  'pageAssertions',
  'resultScope',
  'captureAfter',
  'beforeWait',
  'autoRetry',
];

/** UI-ASSERT-STRUCT-001 — a UiAssert step is missing one or more of its required arguments. */
function validateUiAssertMissingArguments(tc: XmlNode, rule: BPRule): BPViolation | null {
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; missing: string[] }> = [];
  for (const call of getAllApiCalls(tc)) {
    if (call['@_apiId'] !== UI_ASSERT_API_ID) continue;
    const argsNode = call['arguments'];
    let missing: string[];
    if (!argsNode || typeof argsNode !== 'object') {
      missing = [...UI_ASSERT_REQUIRED_ARGS];
    } else {
      const existing = new Set<string>();
      for (const a of getCallArguments(call)) {
        const id = a['@_id'] as string | undefined;
        if (id) existing.add(id);
      }
      missing = UI_ASSERT_REQUIRED_ARGS.filter((r) => !existing.has(r));
    }
    if (missing.length) offenders.push({ ctx: stepContext(call), missing });
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  return makeViolation(
    rule,
    `UiAssert step '${f.ctx.title}' is missing required arguments: ${f.missing.join(', ')}. All UiAssert steps ` +
      'must include fieldAssertions, columnAssertions, pageAssertions, resultScope, captureAfter, beforeWait, and ' +
      `autoRetry (even if empty) (testItemId=${f.ctx.tid})`,
    offenders.length
  );
}

// UI-BINDING-ORDER-001 — binding URIs must list object= before action=/field= (percent-encoded).
const BINDING_WRONG_ACTION_FIRST = /object%3Faction%3D[^%]+%26object%3D/;
const BINDING_WRONG_FIELD_FIRST = /object%3Ffield%3D[^%]+%26object%3D/;
const BINDING_ACTION_EXTRACT = /action%3D([^%&]+)%26object%3D([^%&"]+)/;
const BINDING_FIELD_EXTRACT = /field%3D([^%&]+)%26object%3D([^%&"]+)/;

/** Classify a binding URI's parameter order, returning the wrong/correct pair or null when fine. */
function classifyBindingOrder(uri: string): { wrong: string; correct: string } | null {
  if (BINDING_WRONG_ACTION_FIRST.test(uri)) {
    const m = BINDING_ACTION_EXTRACT.exec(uri);
    if (m) {
      const o = m[2].replace(/&amp;/g, '').replace(/&/g, '');
      return { wrong: `action=${m[1]}&object=${o}`, correct: `object=${o}&action=${m[1]}` };
    }
  } else if (BINDING_WRONG_FIELD_FIRST.test(uri)) {
    const m = BINDING_FIELD_EXTRACT.exec(uri);
    if (m) {
      const o = m[2].replace(/&amp;/g, '').replace(/&/g, '');
      return { wrong: `field=${m[1]}&object=${o}`, correct: `object=${o}&field=${m[1]}` };
    }
  }
  return null;
}

/** UI-BINDING-ORDER-001 — a `uiLocator` binding lists object= after action=/field= (non-standard order). */
function validateBindingParameterOrder(tc: XmlNode, rule: BPRule): BPViolation | null {
  const seen = new Set<XmlNode>();
  const offenders: Array<{ ctx: ReturnType<typeof stepContext>; wrong: string; correct: string }> = [];
  for (const call of getAllApiCalls(tc)) {
    const ctx = stepContext(call);
    for (const v of collectValueElements(call)) {
      if (v['@_class'] !== 'uiLocator' || seen.has(v)) continue;
      seen.add(v);
      const uri = (v['@_uri'] as string | undefined) ?? '';
      if (!uri || !uri.includes('binding=')) continue;
      const verdict = classifyBindingOrder(uri);
      if (verdict) offenders.push({ ctx, ...verdict });
    }
  }
  if (!offenders.length) return null;
  const f = offenders[0];
  return makeViolation(
    rule,
    `UI binding in step '${f.ctx.title}' lists parameters in a non-standard order: found '${f.wrong}', the ` +
      `corpus-majority convention lists object= first ('${f.correct}'). (testItemId=${f.ctx.tid})`,
    offenders.length
  );
}

// UI-CONN-LITERAL-001 — UI step types whose uiConnectionName must be a literal, not a variable.
const UI_CONN_LITERAL_APIS: ReadonlySet<string> = new Set([
  'com.provar.plugins.forcedotcom.core.ui.UiWithScreen',
  'com.provar.plugins.forcedotcom.core.ui.UiDoAction',
  'com.provar.plugins.forcedotcom.core.ui.UiAssert',
  'com.provar.plugins.forcedotcom.core.ui.UiWithRow',
]);

/** UI-CONN-LITERAL-001 — a UI step's `uiConnectionName` uses a `class="variable"` value instead of a literal. */
function validateUiConnectionNameLiteral(tc: XmlNode, rule: BPRule): BPViolation | null {
  for (const call of getAllApiCalls(tc)) {
    if (!UI_CONN_LITERAL_APIS.has(call['@_apiId'] as string)) continue;
    const v = directArgValueElement(call, 'uiConnectionName');
    if (!v || v['@_class'] !== 'variable') continue;
    const ctx = stepContext(call);
    return makeViolation(
      rule,
      `UI step '${ctx.title}' uses a variable reference for uiConnectionName; it must be a literal string ` +
        `(testItemId=${ctx.tid})`
    );
  }
  return null;
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
  mustContainArgument: validateMustContainArgument,
  // Tier 2 — render / load-blocking check types (ports of the QH load-blocking validators)
  valueClassCasing: validateValueClassCasing,
  booleanCasing: validateBooleanCasing,
  invalidValueClass: validateInvalidValueClass,
  dateValueClassFormat: validateDateValueClassFormat,
  apexConnectReuseConnection: validateApexConnectReuseConnection,
  apexConnectValidArguments: validateApexConnectValidArguments,
  apexConnectConnectionIdValueClass: validateApexConnectConnectionIdValueClass,
  setValuesInvalidElements: validateSetValuesInvalidElements,
  // Tier 4 — back-end-only rules (single-violation ports)
  dbConnectResultNameMismatch: validateDbConnectResultNameMismatch,
  setValuesFuncCallString: validateSetValuesFuncCallString,
  setValuesZeroIndexString: validateSetValuesZeroIndexString,
  assertValuesStringExpr: validateAssertValuesStringExpr,
  uiLocatorButtonCasing: validateUiLocatorButtonCasing,
  uiLocatorRecordTypeField: validateUiLocatorRecordTypeField,
  // Tier 5 — structural / load-affecting check types
  validFuncCallId: validateValidFuncCallId,
  rootAttributes: validateRootAttributes,
  setValuesStructure: validateSetValuesStructure,
  namedValueName: validateNamedValueName,
  namedValueValue: validateNamedValueValue,
  uiAssertHallucinatedGeneratedParameters: validateUiAssertHallucinatedGeneratedParameters,
  uiAssertMissingArguments: validateUiAssertMissingArguments,
  bindingParameterOrder: validateBindingParameterOrder,
  uiConnectionNameLiteral: validateUiConnectionNameLiteral,
  // 'regex' is dispatched separately (needs metadata)
  // 'uiActionNestingStructure' is dispatched separately (emits one violation per offending step)
};

/** Validators that may emit multiple violations from a single check (one per offending element). */
type MultiValidatorFn = (tc: XmlNode, rule: BPRule) => BPViolation[];

const MULTI_VALIDATOR_REGISTRY: Record<string, MultiValidatorFn> = {
  uiActionNestingStructure: validateUiActionNestingStructure,
  uiAssertScreenContext: validateUiAssertScreenContext,
  nitroxConnectInvalidArgs: validateNitroxConnectInvalidArgs,
  nitroxVariantArgRequired: validateNitroxVariantArgRequired,
  // Tier 4 — emits one violation per offending value (back-end returns a list)
  varStringLiteral: validateVarStringLiteral,
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

    if (checkType === 'regex') {
      rulesEvaluated++;
      const v = validateRegex(tc, rule, metadata);
      if (v) violations.push(v);
      continue;
    }

    const multiFn = MULTI_VALIDATOR_REGISTRY[checkType];
    if (multiFn) {
      rulesEvaluated++;
      for (const v of multiFn(tc, rule)) violations.push(v);
      continue;
    }

    const fn = VALIDATOR_REGISTRY[checkType];
    if (!fn) continue; // unimplemented validator → silently pass
    rulesEvaluated++;
    const v = fn(tc, rule);
    if (v) violations.push(v);
  }

  const quality_score = calculateBPScore(violations);
  return { quality_score, violations, rules_evaluated: rulesEvaluated };
}
