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
import { desc } from './descHelper.js';

const VALID_LOCATOR_STRATEGIES = [
  'xpath',
  'id',
  'css',
  'name',
  'className',
  'tagName',
  'linkText',
  'partialLinkText',
  'visualforce',
  'label',
] as const;

const VALID_ELEMENT_TYPES = [
  'TextType',
  'ButtonType',
  'LinkType',
  'ChoiceListType',
  'RadioType',
  'FileType',
  'DateType',
  'RichTextType',
  'BooleanType',
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

type ToolResult = { isError: true; content: Array<{ type: 'text'; text: string }> } | null;

function preflightAndWrite(
  filePath: string,
  javaSource: string,
  ssoFilePath: string | undefined,
  ssoSource: string | undefined,
  overwrite: boolean,
  requestId: string
): ToolResult {
  if (fs.existsSync(filePath) && !overwrite) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            makeError('FILE_EXISTS', `File already exists: ${filePath}. Set overwrite=true to replace.`, requestId)
          ),
        },
      ],
    };
  }
  if (ssoSource && ssoFilePath && fs.existsSync(ssoFilePath) && !overwrite) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            makeError(
              'FILE_EXISTS',
              `SSO stub file already exists: ${ssoFilePath}. Set overwrite=true to replace.`,
              requestId
            )
          ),
        },
      ],
    };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, javaSource, 'utf-8');
  log('info', 'provar_pageobject_generate: wrote file', { requestId, filePath });
  if (ssoSource && ssoFilePath) {
    fs.writeFileSync(ssoFilePath, ssoSource, 'utf-8');
    log('info', 'provar_pageobject_generate: wrote SSO stub', { requestId, ssoFilePath });
  }
  return null;
}

export function registerPageObjectGenerate(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'provar_pageobject_generate',
    {
      title: 'Generate Page Object',
      description: desc(
        [
          'Generate a Provar Java Page Object skeleton with @Page/@SalesforcePage annotation, standard imports, and @FindBy WebElement fields.',
          'Returns Java source. Writes to disk only when dry_run=false.',
          'SSO support: set sso_class to also generate an ILoginPage implementation stub for non-SF SSO pages.',
          'Example: sso_class="LoginPageSso" generates a LoginPageSso.java that implements ILoginPage with loginAs() and logout() stubs.',
          'The ILoginPage stub is written to the same directory as output_path when dry_run=false.',
        ].join(' '),
        'Generate a Provar Java Page Object skeleton with @Page/@FindBy fields.'
      ),
      inputSchema: {
        class_name: z
          .string()
          .describe(desc('PascalCase class name, e.g. AccountDetailPage', 'string, PascalCase class name')),
        package_name: z
          .string()
          .default('pageobjects')
          .describe(
            desc('Java package, e.g. pageobjects or pageobjects.accounts', 'string, optional; Java package name')
          ),
        page_type: z
          .enum(['standard', 'salesforce'])
          .default('standard')
          .describe(desc('@Page (standard) or @SalesforcePage (salesforce)', 'enum standard|salesforce')),
        title: z
          .string()
          .optional()
          .describe(
            desc('Page title attribute; defaults to class_name if omitted', 'string, optional; page title attribute')
          ),
        connection_name: z
          .string()
          .optional()
          .describe(
            desc(
              'Salesforce connection name (required when page_type=salesforce)',
              'string, optional; SF connection name'
            )
          ),
        salesforce_page_attribute: z
          .enum(['page', 'auraComponent', 'object', 'lightningWebComponent'])
          .optional()
          .describe(
            desc('Page type attribute for @SalesforcePage', 'enum page|auraComponent|object|lightningWebComponent')
          ),
        fields: z
          .array(FieldSchema)
          .default([])
          .describe(desc('WebElement fields to generate', 'array, optional; WebElement fields')),
        sso_class: z
          .string()
          .optional()
          .describe(
            desc(
              'PascalCase class name for an ILoginPage implementation stub (non-SF SSO pages). ' +
                'When provided, an additional Java class implementing ILoginPage is generated alongside the page object. ' +
                'Example: "LoginPageSso" → LoginPageSso.java with loginAs() and logout() method stubs.',
              'string, optional; PascalCase class name for ILoginPage SSO stub'
            )
          ),
        output_path: z
          .string()
          .optional()
          .describe(
            desc(
              'Suggested file path for the .java file (returned in response)',
              'string, optional; output .java file path'
            )
          ),
        overwrite: z
          .boolean()
          .default(false)
          .describe(desc('Overwrite existing file when dry_run=false', 'bool, optional; overwrite if exists')),
        dry_run: z
          .boolean()
          .default(true)
          .describe(
            desc(
              'true = return source only (default); false = write to output_path',
              'bool, optional; default true, skip write'
            )
          ),
        idempotency_key: z
          .string()
          .optional()
          .describe(
            desc(
              'Caller-provided key echoed back for deduplication tracking',
              'string, optional; deduplication key echoed in response'
            )
          ),
      },
    },
    (input) => {
      const requestId = makeRequestId();
      log('info', 'provar_pageobject_generate', {
        requestId,
        class_name: input.class_name,
        dry_run: input.dry_run,
        sso_class: input.sso_class,
      });

      try {
        const javaSource = buildPageObjectSource(input);
        const filePath: string | undefined = input.output_path ? path.resolve(input.output_path) : undefined;
        let written = false;

        const ssoSource = input.sso_class ? buildSsoLoginPageSource(input.sso_class, input.package_name) : undefined;
        const ssoFilePath: string | undefined =
          ssoSource && filePath ? path.join(path.dirname(filePath), `${input.sso_class}.java`) : undefined;

        if (filePath && !input.dry_run) {
          assertPathAllowed(filePath, config.allowedPaths);
          if (ssoFilePath) assertPathAllowed(ssoFilePath, config.allowedPaths);

          const preflightErr = preflightAndWrite(
            filePath,
            javaSource,
            ssoFilePath,
            ssoSource,
            input.overwrite,
            requestId
          );
          if (preflightErr) return preflightErr;
          written = true;
        }

        const result: Record<string, unknown> = {
          requestId,
          java_source: javaSource,
          file_path: filePath,
          written,
          dry_run: input.dry_run,
          idempotency_key: input.idempotency_key,
        };
        if (ssoSource) {
          result['sso_stub_source'] = ssoSource;
          result['sso_stub_file_path'] = ssoFilePath;
          result['sso_stub_written'] = written && !!ssoFilePath;
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err: unknown) {
        const error = err as Error & { code?: string };
        const errResult = makeError(
          error instanceof PathPolicyError ? error.code : error.code ?? 'GENERATE_ERROR',
          error.message,
          requestId,
          false
        );
        log('error', 'provar_pageobject_generate failed', { requestId, error: error.message });
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errResult) }] };
      }
    }
  );
}

// ── Source builders ───────────────────────────────────────────────────────────

function buildPageObjectSource(input: {
  class_name: string;
  package_name: string;
  page_type: 'standard' | 'salesforce';
  title?: string;
  connection_name?: string;
  salesforce_page_attribute?: string;
  fields: Array<z.infer<typeof FieldSchema>>;
}): string {
  const { class_name, package_name, page_type, title, connection_name, salesforce_page_attribute, fields } = input;
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

function buildSsoLoginPageSource(ssoClass: string, packageName: string): string {
  return `package ${packageName};

import com.provar.core.testapi.annotations.sso.ILoginPage;

public class ${ssoClass} implements ILoginPage {

    @Override
    public void loginAs(String username, String password) {
        // TODO: implement SSO login
    }

    @Override
    public void logout() {
        // TODO: implement SSO logout
    }

}
`;
}
