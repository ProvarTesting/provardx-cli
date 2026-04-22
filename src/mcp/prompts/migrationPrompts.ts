/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Source-framework context injected into each migration prompt.
// Lightweight: just enough to interpret the source. Format knowledge lives
// in the corpus (provar.qualityhub.examples.retrieve) and the validator
// (provar.testcase.validate) — not hardcoded here.

const CRT_CONTEXT = `
CRT (Copado Robotic Testing) is a keyword-driven framework built on Robot Framework.
Tests are authored in QEditor using QWords:
- ClickText <label>         → click an element by visible label
- TypeText <field> <value>  → type a value into a field
- VerifyText <text>         → assert text is present on the page
- SelectDropdown <field> <val> → choose a picklist option
- OpenBrowser <url>         → open a browser session (maps to Salesforce login)

Robot Framework sections: *** Keywords *** define reusable blocks; *** Test Cases *** are the test entries.
Suite Setup/Teardown → login at the start and cleanup at the end.
`.trim();

const SELENIUM_CONTEXT = `
Selenium WebDriver test patterns (Java/Python/JavaScript):
- driver.get(url) / navigate().to() → navigate to a URL (maps to Salesforce login)
- findElement(By.linkText/name).click() → click by visible label
- findElement(...).sendKeys(value) → type into a field
- Select.selectByVisibleText(val) → select a picklist option
- findElement(...).getText() + assertion → verify a field value
- WebDriverWait / ExpectedConditions → wait for element visibility
- @Before / setUp() → test setup including login
- @After / tearDown() → cleanup
`.trim();

const PLAYWRIGHT_CONTEXT = `
Playwright test patterns (TypeScript/JavaScript):
- page.goto(url) / login fixture → navigate to Salesforce (maps to login)
- getByLabel(label).click() → click by visible label
- getByRole('button', {name}).click() → click by button name
- getByLabel(label).fill(value) → fill a field by label
- locator(selector).fill(value) → fill by XPath/CSS selector
- locator.selectOption(value) → choose a picklist option
- expect(locator).toHaveValue(val) → assert a field value
- expect(locator).toBeVisible() → assert element is visible
- expect(page).toContainText(text) → assert text on page
- page.waitForLoadState() / waitForSelector() → wait conditions
- beforeEach → test setup including login
`.trim();

// ── Shared orchestration instructions ────────────────────────────────────────

function migrationOrchestration(projectPath: string | undefined): string {
  const projectHint = projectPath
    ? `The target Provar project is at: ${projectPath}`
    : 'Ask the user for the Provar project path if needed.';

  return `
## Migration workflow

Follow these steps in order:

1. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with keywords that
   describe the source test's main scenario (e.g. "create opportunity", "close case", "convert lead").
   Use the returned examples as few-shot grounding for the Provar XML format and step patterns.
   If the response has \`"count": 0\` with a \`"warning"\` field (API unavailable or not configured),
   fall back: read the \`provar://docs/step-reference\` MCP resource for step types and attribute
   formats, then continue with generation based on that reference.

2. **Generate the test case** — produce a valid Provar XML test case that faithfully captures
   the intent of the source test. Base the structure entirely on the corpus examples, not on
   prior knowledge of Provar XML. Omit Salesforce login/navigation setup — Provar handles
   that via Connection Manager.

3. **Write the file** — save the generated XML to the appropriate \`tests/\` subdirectory
   inside the Provar project. ${projectHint}

4. **Validate** — call \`provar.testcase.validate\` on the saved file. If it reports errors,
   fix them and re-validate until the file passes clean.

5. **Report** — summarise what was migrated, any steps that could not be mapped (add them
   as \`<!-- TODO: manual step -->\` comments in the XML), and any validation warnings.
`.trim();
}

// ── Prompt: provar.migrate.crt ────────────────────────────────────────────────

export function registerCrtMigrationPrompt(server: McpServer): void {
  server.prompt(
    'provar.migrate.crt',
    'Convert a Copado Robotic Testing (CRT) test — either a QWord step sequence or a Robot Framework .robot file — into a Provar XML test case. Retrieves corpus examples for grounding, generates the test case, then validates it with provar.testcase.validate.',
    {
      source: z
        .string()
        .describe(
          'The CRT test content to migrate. Accepts either: (1) a numbered QWord step sequence (e.g. "Step 1: ClickText Accounts"), or (2) a Robot Framework .robot file with *** Settings ***, *** Keywords ***, and *** Test Cases *** sections.'
        ),
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the Provar project root. Used to locate the tests/ directory when writing the output file.'
        ),
      testName: z
        .string()
        .optional()
        .describe('Optional name for the output Provar test case. Inferred from the source if omitted.'),
    },
    ({ source, projectPath, testName }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test migration expert. Migrate the following CRT test to Provar.

## Source format — CRT

${CRT_CONTEXT}

${migrationOrchestration(projectPath)}

## Source CRT Test

\`\`\`
${source}
\`\`\`

${testName ? `Target test case name: ${testName}` : 'Infer the test case name from the source content.'}

Begin with step 1: call provar.qualityhub.examples.retrieve.`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.migrate.selenium ──────────────────────────────────────────

export function registerSeleniumMigrationPrompt(server: McpServer): void {
  server.prompt(
    'provar.migrate.selenium',
    'Convert a Selenium WebDriver test (Java, Python, or JavaScript) that tests a Salesforce org into a Provar XML test case. Retrieves corpus examples for grounding, generates the test case, then validates it with provar.testcase.validate.',
    {
      source: z
        .string()
        .describe(
          'The Selenium test file content to migrate. Accepts Java (JUnit/TestNG), Python (unittest/pytest), or JavaScript (Jest/Mocha) with selenium-webdriver. Include the full file or the relevant test method(s).'
        ),
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the Provar project root. Used to locate the tests/ directory when writing the output file.'
        ),
      testName: z
        .string()
        .optional()
        .describe(
          'Optional name for the output Provar test case. Inferred from the source class/method name if omitted.'
        ),
    },
    ({ source, projectPath, testName }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test migration expert. Migrate the following Selenium WebDriver test to Provar.

## Source format — Selenium WebDriver

${SELENIUM_CONTEXT}

${migrationOrchestration(projectPath)}

## Source Selenium Test

\`\`\`
${source}
\`\`\`

${testName ? `Target test case name: ${testName}` : 'Infer the test case name from the class and method name.'}

Begin with step 1: call provar.qualityhub.examples.retrieve.`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.migrate.playwright ────────────────────────────────────────

export function registerPlaywrightMigrationPrompt(server: McpServer): void {
  server.prompt(
    'provar.migrate.playwright',
    'Convert a Playwright test (TypeScript or JavaScript) that tests a Salesforce org into a Provar XML test case. Retrieves corpus examples for grounding, generates the test case, then validates it with provar.testcase.validate.',
    {
      source: z
        .string()
        .describe(
          'The Playwright test file content to migrate. Accepts TypeScript or JavaScript using @playwright/test or the playwright library. Include the full file or the relevant test block(s).'
        ),
      projectPath: z
        .string()
        .optional()
        .describe(
          'Absolute path to the Provar project root. Used to locate the tests/ directory when writing the output file.'
        ),
      testName: z
        .string()
        .optional()
        .describe(
          'Optional name for the output Provar test case. Inferred from the test() block description if omitted.'
        ),
    },
    ({ source, projectPath, testName }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test migration expert. Migrate the following Playwright test to Provar.

## Source format — Playwright

${PLAYWRIGHT_CONTEXT}

${migrationOrchestration(projectPath)}

## Source Playwright Test

\`\`\`
${source}
\`\`\`

${testName ? `Target test case name: ${testName}` : 'Infer the test case name from the test() block description.'}

Begin with step 1: call provar.qualityhub.examples.retrieve.`,
          },
        },
      ],
    })
  );
}
