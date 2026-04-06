/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../server.js';
import { assertPathAllowed, PathPolicyError } from '../security/pathPolicy.js';
import { makeError, makeRequestId, type ValidationIssue } from '../schemas/common.js';
import { log } from '../logging/logger.js';

export function registerPageObjectValidate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.pageobject.validate',
    'Validate a Provar Java Page Object against naming conventions, locator best practices, and structural requirements. Returns quality score (0–100) and list of issues.',
    {
      content: z.string().optional().describe('Java source code to validate directly'),
      file_path: z.string().optional().describe('Path to .java Page Object file'),
      expected_class_name: z
        .string()
        .optional()
        .describe('Expected class name for PO_006 check; inferred from file_path when omitted'),
    },
    ({ content, file_path, expected_class_name }) => {
      const requestId = makeRequestId();
      log('info', 'provar.pageobject.validate', { requestId, has_content: !!content, file_path });

      try {
        let source = content;
        let inferredClassName = expected_class_name;

        if (!source && file_path) {
          assertPathAllowed(file_path, config.allowedPaths);
          const resolved = path.resolve(file_path);
          if (!fs.existsSync(resolved)) {
            const err = makeError('FILE_NOT_FOUND', `File not found: ${resolved}`, requestId);
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }
          source = fs.readFileSync(resolved, 'utf-8');
          if (!inferredClassName) {
            inferredClassName = path.basename(resolved, '.java');
          }
        }

        if (!source) {
          const err = makeError('MISSING_INPUT', 'Provide either content or file_path.', requestId);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
        }

        const validation = validatePageObject(source, inferredClassName);
        const result = { requestId, ...validation };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : 'VALIDATE_ERROR',
          error.message,
          requestId,
          false
        );
        log('error', 'provar.pageobject.validate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── Validator (ported from quality-hub-agents/lambda/src/validator/page_object_validator.py) ──

const VALID_LOCATOR_STRATEGIES = new Set([
  'xpath', 'id', 'css', 'name', 'className', 'tagName',
  'linkText', 'partialLinkText', 'visualforce', 'label',
]);
const VALID_ELEMENT_TYPES = new Set([
  'TextType', 'ButtonType', 'LinkType', 'ChoiceListType',
  'RadioType', 'FileType', 'DateType', 'RichTextType', 'BooleanType',
]);
const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/;
const VALID_JAVA_IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const JAVA_RESERVED = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
  'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final',
  'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public',
  'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while',
]);
const SF_DYNAMIC_ATTRS_RE = /data-aura-rendered-by|data-aura-class|aura-id|data-component-id/i;
const INDEXED_XPATH_RE = /\[\d+\]/;
const POSITION_FN_RE = /\b(last|first|position)\s*\(\s*\)/;

// Rule ID → penalty points (from page_object_validation_rules.json)
const RULE_PENALTIES: Record<string, number> = {
  PO_001: 20, PO_002: 18, PO_003: 25, PO_004: 8,  PO_005: 20, PO_006: 18,
  PO_012: 10, PO_020: 12, PO_021: 8,  PO_022: 18, PO_023: 10,
  PO_030: 12, PO_031: 20, PO_032: 18, PO_033: 20, PO_034: 18, PO_036: 10,
  PO_060: 25, PO_070: 15, PO_071: 20, PO_072: 8,  PO_073: 18, PO_074: 18,
  PO_075: 5,  PO_076: 12, PO_078: 3,  PO_079: 10, PO_080: 2,
};

export interface PageObjectValidationResult {
  is_valid: boolean;
  quality_score: number;
  class_name: string | null;
  package_name: string | null;
  field_count: number;
  frame_count: number;
  error_count: number;
  warning_count: number;
  info_count: number;
  issues: ValidationIssue[];
}

/** Pure function — exported for unit testing */
export function validatePageObject(
  source: string,
  expectedClassName?: string
): PageObjectValidationResult {
  const issues: ValidationIssue[] = [];
  const stripped = stripComments(source);

  // ── Package ──────────────────────────────────────────────────────────────────
  const packageMatch = /^\s*package\s+([\w.]+)\s*;/m.exec(stripped);
  const packageName = packageMatch ? packageMatch[1] : null;
  if (!packageMatch) {
    issues.push({
      rule_id: 'PO_001', severity: 'ERROR',
      message: 'Missing package declaration.',
      applies_to: 'class',
      suggestion: "Add 'package pageobjects;' at the top of the file.",
    });
  } else if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(packageName!)) {
    issues.push({
      rule_id: 'PO_002', severity: 'ERROR',
      message: `Invalid package name: "${packageName}".`,
      applies_to: 'class',
      suggestion: 'Package names should be valid lower-case Java identifiers separated by dots.',
    });
  }

  // ── Class declaration ────────────────────────────────────────────────────────
  const className = checkClassDeclaration(stripped, expectedClassName, issues);

  // ── Brace balance ────────────────────────────────────────────────────────────
  const openBraces = (stripped.match(/\{/g) ?? []).length;
  const closeBraces = (stripped.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    issues.push({
      rule_id: 'PO_060', severity: 'ERROR',
      message: `Mismatched braces: ${openBraces} opening vs ${closeBraces} closing.`,
      applies_to: 'class',
      suggestion: 'Check for missing or extra curly braces.',
    });
  }

  // ── Imports ──────────────────────────────────────────────────────────────────
  if (!stripped.includes('import com.provar.core.testapi.annotations')) {
    issues.push({
      rule_id: 'PO_012', severity: 'WARNING',
      message: 'Missing import for Provar annotations.',
      applies_to: 'class',
      suggestion: "Add 'import com.provar.core.testapi.annotations.*;'",
    });
  }

  // ── Page annotation ──────────────────────────────────────────────────────────
  const hasSalesforceAnnotation = checkAnnotations(stripped, issues);

  // ── Fields ───────────────────────────────────────────────────────────────────
  // Use original source (not stripped) so XPath "//" inside string literals
  // is not mistakenly treated as a line comment by stripComments.
  const fields = extractFields(source);
  if (fields.length === 0 && !issues.some((i) => i.rule_id === 'PO_003')) {
    issues.push({
      rule_id: 'PO_030', severity: 'WARNING',
      message: 'No WebElement or WebComponent fields found.',
      applies_to: 'class',
      suggestion: 'Add at least one WebElement field with @FindBy locator and type annotation.',
    });
  }
  validateFields(fields, hasSalesforceAnnotation, issues);

  // ── Frames ───────────────────────────────────────────────────────────────────
  const frameCount = (stripped.match(/@PageFrame\b/g) ?? []).length;

  // ── Commented code ───────────────────────────────────────────────────────────
  if (/\/\/\s*(public|private|protected|@FindBy|WebElement|@\w+Type)/.test(source)) {
    issues.push({
      rule_id: 'PO_080', severity: 'INFO',
      message: 'Commented-out code detected.',
      applies_to: 'class',
      suggestion: 'Remove commented code. Use version control to track history.',
    });
  }

  // ── Quality score (sum penalties, capped at 100) ──────────────────────────
  let penalty = 0;
  for (const issue of issues) {
    penalty += RULE_PENALTIES[issue.rule_id] ?? 5;
  }

  return {
    is_valid: issues.filter((i) => i.severity === 'ERROR').length === 0,
    quality_score: Math.max(0, Math.min(100, 100 - penalty)),
    class_name: className,
    package_name: packageName,
    field_count: fields.length,
    frame_count: frameCount,
    error_count: issues.filter((i) => i.severity === 'ERROR').length,
    warning_count: issues.filter((i) => i.severity === 'WARNING').length,
    info_count: issues.filter((i) => i.severity === 'INFO').length,
    issues,
  };
}

function checkClassDeclaration(
  stripped: string,
  expectedClassName: string | undefined,
  issues: ValidationIssue[]
): string | null {
  const classMatch = /public\s+class\s+(\w+)/.exec(stripped);
  const className = classMatch ? classMatch[1] : null;
  if (!classMatch) {
    issues.push({
      rule_id: 'PO_003', severity: 'ERROR',
      message: 'Missing public class declaration.',
      applies_to: 'class',
      suggestion: "Ensure the file has a 'public class ClassName' declaration.",
    });
  } else {
    if (!PASCAL_CASE_RE.test(className!)) {
      issues.push({
        rule_id: 'PO_004', severity: 'WARNING',
        message: `Class name "${className}" is not PascalCase.`,
        applies_to: 'class',
        suggestion: "Rename to PascalCase (e.g., 'MyPageObject').",
      });
    }
    if (!VALID_JAVA_IDENT_RE.test(className!)) {
      issues.push({
        rule_id: 'PO_005', severity: 'ERROR',
        message: `Class name "${className}" is not a valid Java identifier.`,
        applies_to: 'class',
        suggestion: 'Class names must start with a letter, $, or _ and contain only letters, digits, $, or _.',
      });
    }
    if (expectedClassName && className !== expectedClassName) {
      issues.push({
        rule_id: 'PO_006', severity: 'ERROR',
        message: `Class name "${className}" does not match expected "${expectedClassName}".`,
        applies_to: 'class',
        suggestion: 'Class name must match the filename.',
      });
    }
  }
  return className;
}

function checkAnnotations(stripped: string, issues: ValidationIssue[]): boolean {
  const hasPageAnnotation = /@Page\s*\(/.test(stripped);
  const hasSalesforceAnnotation = /@SalesforcePage\s*\(/.test(stripped);
  if (!hasPageAnnotation && !hasSalesforceAnnotation) {
    issues.push({
      rule_id: 'PO_020', severity: 'WARNING',
      message: 'Missing @Page or @SalesforcePage annotation.',
      applies_to: 'annotation',
      suggestion: 'Add @Page annotation before the class declaration.',
    });
  } else if (hasPageAnnotation) {
    const m = /@Page\s*\(([^)]*)\)/.exec(stripped);
    if (m && !m[1].includes('title')) {
      issues.push({
        rule_id: 'PO_021', severity: 'WARNING',
        message: '@Page annotation missing title attribute.',
        applies_to: 'annotation',
        suggestion: 'Add title attribute to @Page annotation.',
      });
    }
  } else if (hasSalesforceAnnotation) {
    const m = /@SalesforcePage\s*\(([^)]*)\)/.exec(stripped);
    if (m) {
      if (!m[1].includes('title') || !m[1].includes('connection')) {
        issues.push({
          rule_id: 'PO_022', severity: 'ERROR',
          message: '@SalesforcePage missing required title or connection attribute.',
          applies_to: 'annotation',
          suggestion: 'Add required attributes to @SalesforcePage annotation.',
        });
      }
      const pageTypes = ['page', 'auraComponent', 'object', 'lightningWebComponent'];
      if (!pageTypes.some((t) => m[1].includes(t))) {
        issues.push({
          rule_id: 'PO_023', severity: 'WARNING',
          message: '@SalesforcePage should specify page type attribute.',
          applies_to: 'annotation',
          suggestion: 'Add one of: page, auraComponent, object, or lightningWebComponent.',
        });
      }
    }
  }
  return hasSalesforceAnnotation;
}

function validateFields(
  fields: FieldInfo[],
  hasSalesforceAnnotation: boolean,
  issues: ValidationIssue[]
): void {
  const fieldNames = new Set<string>();
  for (const field of fields) {
    if (fieldNames.has(field.name)) {
      issues.push({
        rule_id: 'PO_031', severity: 'ERROR',
        message: `Duplicate field name: "${field.name}".`,
        applies_to: 'field',
        suggestion: 'Rename one of the duplicate fields.',
      });
    } else {
      fieldNames.add(field.name);
    }
    if (!VALID_JAVA_IDENT_RE.test(field.name)) {
      issues.push({
        rule_id: 'PO_032', severity: 'ERROR',
        message: `Invalid field name: "${field.name}".`,
        applies_to: 'field',
        suggestion: 'Field names must be valid Java identifiers.',
      });
    }
    if (JAVA_RESERVED.has(field.name)) {
      issues.push({
        rule_id: 'PO_033', severity: 'ERROR',
        message: `Field name "${field.name}" is a Java reserved word.`,
        applies_to: 'field',
        suggestion: 'Rename field to avoid Java reserved words.',
      });
    }
    if (field.locatorStrategy && !VALID_LOCATOR_STRATEGIES.has(field.locatorStrategy)) {
      issues.push({
        rule_id: 'PO_034', severity: 'ERROR',
        message: `Invalid locator strategy: "${field.locatorStrategy}".`,
        applies_to: 'field',
        suggestion:
          'Use one of: xpath, id, css, name, className, tagName, linkText, partialLinkText, visualforce, label.',
      });
    }
    if (field.elementType && !VALID_ELEMENT_TYPES.has(field.elementType)) {
      issues.push({
        rule_id: 'PO_036', severity: 'WARNING',
        message: `Invalid element type: "@${field.elementType}". (CheckboxType is not valid — use BooleanType.)`,
        applies_to: 'field',
        suggestion:
          'Use a valid Provar element type: TextType, ButtonType, LinkType, ChoiceListType, RadioType, FileType, DateType, RichTextType, BooleanType.',
      });
    }
    checkLocatorQuality(field, hasSalesforceAnnotation, issues);
  }
}

function checkLocatorQuality(
  field: FieldInfo,
  hasSalesforceAnnotation: boolean,
  issues: ValidationIssue[]
): void {
  const lv = field.locatorValue ?? '';
  const strat = field.locatorStrategy ?? '';
  if (!lv) return;
  if ((strat === 'xpath' || strat === '') && /^\/html|^\/body/i.test(lv)) {
    issues.push({
      rule_id: 'PO_071', severity: 'ERROR',
      message: `Absolute XPath for field "${field.name}".`,
      applies_to: 'field',
      suggestion: 'Use relative XPath starting with // or .//',
    });
  }
  if (SF_DYNAMIC_ATTRS_RE.test(lv)) {
    issues.push({
      rule_id: 'PO_073', severity: 'ERROR',
      message: `Salesforce dynamic attribute in locator for "${field.name}".`,
      applies_to: 'field',
      suggestion: 'Use stable identifiers like labels, data-testid, or semantic selectors.',
    });
  }
  if (strat === 'id' && hasSalesforceAnnotation) {
    issues.push({
      rule_id: 'PO_070', severity: 'WARNING',
      message: `ID-based locator on Salesforce page for "${field.name}". IDs may be dynamic.`,
      applies_to: 'field',
      suggestion: 'Prefer xpath/css with stable attributes like data-testid, aria-label, name.',
    });
  }
  if (INDEXED_XPATH_RE.test(lv)) {
    issues.push({
      rule_id: 'PO_072', severity: 'WARNING',
      message: `Indexed XPath [n] for field "${field.name}".`,
      applies_to: 'field',
      suggestion: 'Prefer attribute-based selection over positional indexes.',
    });
  }
  if (strat === 'xpath') {
    const segments = (lv.match(/\/{2}/g) ?? []).length;
    if (segments > 4) {
      issues.push({
        rule_id: 'PO_076', severity: 'WARNING',
        message: `Complex XPath (${segments} descent operators) for "${field.name}".`,
        applies_to: 'field',
        suggestion: 'Simplify with a more direct path or data-testid attributes.',
      });
    }
  }
  if (POSITION_FN_RE.test(lv)) {
    issues.push({
      rule_id: 'PO_079', severity: 'WARNING',
      message: `Position function (last/first/position) in XPath for "${field.name}".`,
      applies_to: 'field',
      suggestion: 'Use unique identifiers instead of position-based selection.',
    });
  }
  if (strat === 'css' && /[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/.test(lv)) {
    issues.push({
      rule_id: 'PO_075', severity: 'INFO',
      message: `Possibly autogenerated CSS class pattern for "${field.name}".`,
      applies_to: 'field',
      suggestion: 'Prefer stable attributes over autogenerated CSS classes.',
    });
  }
  if (lv.length > 200) {
    issues.push({
      rule_id: 'PO_078', severity: 'INFO',
      message: `Very long locator (${lv.length} chars) for "${field.name}".`,
      applies_to: 'field',
      suggestion: 'Consider a shorter, more maintainable locator.',
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/[^\n]*/g, '');         // line comments
}

interface FieldInfo {
  name: string;
  locatorStrategy?: string;
  locatorValue?: string;
  elementType?: string;
}

/**
 * Extract @FindBy WebElement field declarations from stripped source.
 * Regex captures: FindBy attrs | optional type annotation | field name.
 */
function extractFields(source: string): FieldInfo[] {
  const fields: FieldInfo[] = [];
  const re =
    /@FindBy\s*\(([^)]*)\)[^;]*?(?:@(\w+)\s*\(\s*\)\s*)?(?:public|private|protected)?\s+(?:WebElement|WebComponent)\s+(\w+)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const attrs = m[1] ?? '';
    const stratMatch = /(\w+)\s*=\s*"([^"]*)"/.exec(attrs);
    fields.push({
      name: m[3],
      locatorStrategy: stratMatch ? stratMatch[1] : undefined,
      locatorValue: stratMatch ? stratMatch[2] : undefined,
      elementType: m[2],
    });
  }
  return fields;
}
