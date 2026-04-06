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
import { makeError, makeRequestId } from '../schemas/common.js';
import { log } from '../logging/logger.js';

const VALID_LOCATOR_STRATEGIES = [
  'xpath', 'id', 'css', 'name', 'className', 'tagName',
  'linkText', 'partialLinkText', 'visualforce', 'label',
] as const;

const VALID_ELEMENT_TYPES = [
  'TextType', 'ButtonType', 'LinkType', 'ChoiceListType',
  'RadioType', 'FileType', 'DateType', 'RichTextType', 'BooleanType',
] as const;

const FieldSchema = z.object({
  name: z.string().describe('camelCase WebElement field name'),
  locator_strategy: z.enum(VALID_LOCATOR_STRATEGIES).default('xpath'),
  locator_value: z
    .string()
    .default('')
    .describe('Locator value (empty string is valid — AI healing populates at runtime)'),
  element_type: z.enum(VALID_ELEMENT_TYPES).default('TextType'),
});

export function registerPageObjectGenerate(server: McpServer, config: ServerConfig): void {
  server.tool(
    'provar.pageobject.generate',
    'Generate a Provar Java Page Object skeleton with @Page/@SalesforcePage annotation, standard imports, and @FindBy WebElement fields. Returns Java source. Writes to disk only when dry_run=false.',
    {
      class_name: z.string().describe('PascalCase class name, e.g. AccountDetailPage'),
      package_name: z
        .string()
        .default('pageobjects')
        .describe('Java package, e.g. pageobjects or pageobjects.accounts'),
      page_type: z
        .enum(['standard', 'salesforce'])
        .default('standard')
        .describe('@Page (standard) or @SalesforcePage (salesforce)'),
      title: z
        .string()
        .optional()
        .describe('Page title attribute; defaults to class_name if omitted'),
      connection_name: z
        .string()
        .optional()
        .describe('Salesforce connection name (required when page_type=salesforce)'),
      salesforce_page_attribute: z
        .enum(['page', 'auraComponent', 'object', 'lightningWebComponent'])
        .optional()
        .describe('Page type attribute for @SalesforcePage'),
      fields: z.array(FieldSchema).default([]).describe('WebElement fields to generate'),
      output_path: z
        .string()
        .optional()
        .describe('Suggested file path for the .java file (returned in response)'),
      overwrite: z
        .boolean()
        .default(false)
        .describe('Overwrite existing file when dry_run=false'),
      dry_run: z
        .boolean()
        .default(true)
        .describe('true = return source only (default); false = write to output_path'),
      idempotency_key: z
        .string()
        .optional()
        .describe('Caller-provided key echoed back for deduplication tracking'),
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar.pageobject.generate', {
        requestId,
        class_name: input.class_name,
        dry_run: input.dry_run,
      });

      try {
        const javaSource = buildPageObjectSource(input);
        const filePath: string | undefined = input.output_path
          ? path.resolve(input.output_path)
          : undefined;
        let written = false;

        if (filePath && !input.dry_run) {
          assertPathAllowed(filePath, config.allowedPaths);

          if (fs.existsSync(filePath) && !input.overwrite) {
            const err = makeError(
              'FILE_EXISTS',
              `File already exists: ${filePath}. Set overwrite=true to replace.`,
              requestId
            );
            return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(err) }] };
          }

          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, javaSource, 'utf-8');
          written = true;
          log('info', 'provar.pageobject.generate: wrote file', { requestId, filePath });
        }

        const result = {
          requestId,
          java_source: javaSource,
          file_path: filePath,
          written,
          dry_run: input.dry_run,
          idempotency_key: input.idempotency_key,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : (error.code ?? 'GENERATE_ERROR'),
          error.message,
          requestId,
          false
        );
        log('error', 'provar.pageobject.generate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── Source builder ────────────────────────────────────────────────────────────

function buildPageObjectSource(input: {
  class_name: string;
  package_name: string;
  page_type: 'standard' | 'salesforce';
  title?: string;
  connection_name?: string;
  salesforce_page_attribute?: string;
  fields: Array<z.infer<typeof FieldSchema>>;
}): string {
  const { class_name, package_name, page_type, title, connection_name, salesforce_page_attribute, fields } =
    input;
  const pageTitle = title ?? class_name;

  let annotation: string;
  if (page_type === 'salesforce') {
    const conn = connection_name ? `, connection = "${connection_name}"` : '';
    const sfAttr = salesforce_page_attribute ? `, ${salesforce_page_attribute} = ""` : '';
    annotation = `@SalesforcePage(title = "${pageTitle}"${conn}${sfAttr})`;
  } else {
    annotation = `@Page(title = "${pageTitle}")`;
  }

  const fieldBlocks =
    fields.length > 0
      ? fields
          .map((f) => {
            const locArg =
              f.locator_strategy === 'xpath'
                ? `xpath = "${f.locator_value}"`
                : `${f.locator_strategy} = "${f.locator_value}"`;
            return `    @FindBy(${locArg})\n    @${f.element_type}()\n    public WebElement ${f.name};`;
          })
          .join('\n\n')
      : '    // TODO: Add @FindBy WebElement fields';

  return `package ${package_name};

import com.provar.core.testapi.annotations.*;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

${annotation}
public class ${class_name} {

${fieldBlocks}

}
`;
}
