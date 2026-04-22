/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function projectHint(projectPath: string | undefined): string {
  return projectPath
    ? `The Provar project root is: ${projectPath}`
    : 'Ask the user for the Provar project root path if it is needed for file operations.';
}

// ── Prompt: provar.loop.generate ─────────────────────────────────────────────

export function registerLoopGeneratePrompt(server: McpServer): void {
  server.prompt(
    'provar.loop.generate',
    'Generate a Provar XML test case from a user story or acceptance criteria. Retrieves corpus examples for grounding, generates the test, writes it to the project, then validates it with provar.testcase.validate.',
    {
      story: z
        .string()
        .describe(
          'The user story or acceptance criteria to test. Paste the full story text, or a numbered list of acceptance criteria. Include the Salesforce object name and the action being tested (e.g. "As a sales rep, I want to close an opportunity so that revenue is recorded").'
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
          'Optional name for the output test case file (without extension). Inferred from the story if omitted.'
        ),
      objectName: z
        .string()
        .optional()
        .describe(
          'Primary Salesforce object under test (e.g. "Opportunity", "Lead"). Helps scope the corpus query if present.'
        ),
    },
    ({ story, projectPath, testName, objectName }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test automation expert. Generate a Provar XML test case from the user story below.

## Workflow

Follow these steps in order:

1. **Extract keywords** — identify the Salesforce object, the action (create/update/close/delete/view), and key
   scenario details from the story. Use these as the query for step 2.

2. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with the keywords you extracted
   (e.g. "close opportunity" or "create lead"). Use the returned XML examples as the sole reference for
   Provar step structure and argument patterns. Do not invent XML structure from prior knowledge.
   If the response has \`"count": 0\` with a \`"warning"\` field (API unavailable or not configured),
   fall back: read the \`provar://docs/step-reference\` MCP resource for step types and attribute
   formats, then continue.

3. **Map acceptance criteria to steps** — for each acceptance criterion, identify the corresponding Provar
   step type: field fills → UiDoAction (set), button clicks → UiDoAction (action), field checks →
   UiAssert, API data setup → ApexCreateObject, API verification → ApexReadObject.

4. **Generate the test case** — produce a valid Provar XML test case that tests the story's acceptance
   criteria. Base the structure entirely on the corpus examples. Follow these rules:
   - All UI steps must be nested inside UiWithScreen blocks
   - The first UiWithScreen must use navigate="Always"
   - UiAssert requires columnAssertions, pageAssertions, resultScope, captureAfter, beforeWait, autoRetry
   - Use ApexConnect for the connection step (first step in the test)
   - Wrap test body in TryCatchFinally if cleanup is needed (ApexDeleteObject in the finally clause)

5. **Write the file** — save the XML to the tests/ directory in the Provar project.
   ${projectHint(projectPath)}
   ${testName ? `Target file name: ${testName}.testcase` : 'Infer the file name from the story (snake_case).'}

6. **Validate** — call \`provar.testcase.validate\` on the saved file. If it reports errors, fix them
   and re-validate until the file passes clean.

7. **Report** — summarise:
   - Which acceptance criteria were covered and how
   - Any criteria that could not be automated (add \`<!-- TODO: manual verification — <criterion> -->\` in the XML)
   - Any validation warnings

## User Story

${story}

${objectName ? `Primary object: ${objectName}` : ''}

Begin with step 1: extract keywords, then call provar.qualityhub.examples.retrieve.`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.loop.fix ───────────────────────────────────────────────────

export function registerLoopFixPrompt(server: McpServer): void {
  server.prompt(
    'provar.loop.fix',
    'Fix a failing Provar test case using the output from provar.testrun.rca. Reads the current XML, retrieves corpus examples for the failing step type, applies targeted fixes, then re-validates.',
    {
      testcasePath: z
        .string()
        .describe(
          'Absolute path to the failing .testcase XML file. The file must be readable and within the --allowed-paths configured for this MCP server.'
        ),
      rcaOutput: z
        .string()
        .describe(
          'The RCA report text from provar.testrun.rca, or a raw failure message from a test run. Include the full error text — step name, error type, and message. The more detail, the better the fix.'
        ),
      projectPath: z
        .string()
        .optional()
        .describe('Absolute path to the Provar project root. Used to locate adjacent test files if needed.'),
    },
    ({ testcasePath, rcaOutput, projectPath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test automation expert. Fix the failing test case at the path below.

## Failing test case

Path: ${testcasePath}

## RCA output

\`\`\`
${rcaOutput}
\`\`\`

${projectPath ? `Provar project root: ${projectPath}` : ''}

## Workflow

Follow these steps in order:

1. **Read the failing test case** — read the XML file at the path above using your file reading tools.

2. **Parse the failure** — from the RCA output, identify:
   - Which step is failing (step name, testItemId, or title)
   - The failure category (e.g. element not found, assertion mismatch, connection error, XML structure error)
   - The specific error message

3. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with keywords describing the
   failing step's scenario (e.g. "close opportunity UiDoAction" or "assert field value UiAssert").
   Use the returned examples to verify the correct structure for the failing step type.
   If the response has \`"count": 0\` with a \`"warning"\` field, fall back: read the
   \`provar://docs/step-reference\` MCP resource for the correct attribute schema for the failing
   step type, then continue.

4. **Diagnose the root cause** — compare the failing step's XML against the corpus examples. Common issues:
   - Wrong interaction URI (action vs set vs file)
   - Missing required UiAssert arguments (columnAssertions, pageAssertions, resultScope, captureAfter, beforeWait, autoRetry)
   - UiDoAction (set) missing the value argument
   - UiWithScreen navigate="Dont" on the first screen
   - navigate="Always" on Edit/View without sfUiTargetObjectId
   - Incorrect locator URI format
   - connectionId using valueClass="string" instead of valueClass="id"

5. **Apply the fix** — rewrite only the failing step(s). Preserve all other steps unchanged. Write the
   updated XML back to the same file path.

6. **Validate** — call \`provar.testcase.validate\` on the updated file. If new errors appear, fix them
   and re-validate until the file passes clean.

7. **Report** — summarise:
   - The root cause of the failure
   - Exactly what was changed (step name, argument changed, before/after values)
   - Any remaining warnings from validation

Begin with step 1: read the file at: ${testcasePath}`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.loop.review ────────────────────────────────────────────────

export function registerLoopReviewPrompt(server: McpServer): void {
  server.prompt(
    'provar.loop.review',
    'Review a Provar test case for quality before committing. Runs structural validation, checks against corpus best practices, and reports quality gaps: missing assertions, hardcoded data, missing cleanup, and unmapped steps.',
    {
      testcasePath: z
        .string()
        .describe(
          'Absolute path to the .testcase XML file to review. Must be within the --allowed-paths configured for this MCP server.'
        ),
      projectPath: z.string().optional().describe('Absolute path to the Provar project root.'),
    },
    ({ testcasePath, projectPath }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test automation expert. Review the test case at the path below for quality and completeness.

## Test case to review

Path: ${testcasePath}
${projectPath ? `Provar project root: ${projectPath}` : ''}

## Workflow

Follow these steps in order:

1. **Validate** — call \`provar.testcase.validate\` on the file. Note all errors and warnings. Do not stop
   here even if the file is valid — continue the review.

2. **Read the file** — read the XML to understand the test structure: what object is being tested, what
   actions are performed, and what is being asserted.

3. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with keywords describing the
   test scenario (e.g. "create opportunity", "close opportunity"). Use the returned examples as a
   quality baseline. If the response has \`"count": 0\` with a \`"warning"\` field, fall back: read
   the \`provar://docs/step-reference\` MCP resource for step type schemas, then continue the review
   using that as the quality baseline.

4. **Review for quality gaps** — check for each of the following, noting pass or fail:

   **Coverage**
   - [ ] Does the test assert the outcome of each action? (e.g. after clicking Save, is there a UiAssert?)
   - [ ] Are all required fields verified, not just the ones that were set?
   - [ ] Is there at least one UiAssert or ApexReadObject in the test?

   **Data quality**
   - [ ] Are test data values parameterised via SetValues rather than hardcoded in multiple steps?
   - [ ] Are dynamic values (dates, IDs) referenced via variables rather than hardcoded strings?

   **Cleanup**
   - [ ] Is cleanup handled? Either autoCleanup=true on the connection, or ApexDeleteObject steps, or
         a TryCatchFinally with cleanup in the finally clause?

   **Structure**
   - [ ] Does the first UiWithScreen use navigate="Always" or "IfNecessary"?
   - [ ] Do Edit/View UiWithScreen steps with navigate="Always" include sfUiTargetObjectId?
   - [ ] Are all UiDoAction and UiAssert steps inside UiWithScreen substeps clauses?

   **Unmapped steps**
   - [ ] Are there any \`<!-- TODO: -->\` comments indicating steps that couldn't be automated?
         Flag these for manual review.

5. **Report** — produce a structured review with three sections:

   ### Passes
   List what the test does well.

   ### Issues
   For each gap found, state:
   - What is missing or wrong
   - Why it matters (e.g. "assertion missing after Save means the test won't catch a silent failure")
   - A concrete fix (reference the corpus example if relevant)

   ### Suggested improvements
   Any non-blocking suggestions (e.g. parameterising a hardcoded value that appears more than once).

Begin with step 1: call provar.testcase.validate on the file at: ${testcasePath}`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.loop.coverage ─────────────────────────────────────────────

export function registerLoopCoveragePrompt(server: McpServer): void {
  server.prompt(
    'provar.loop.coverage',
    'Analyse test coverage for a Salesforce object. Scans the Provar project test files to identify which CRUD operations, field validations, and UI workflows are covered, then reports gaps with suggested test outlines.',
    {
      objectName: z
        .string()
        .describe(
          'The Salesforce API object name to analyse (e.g. "Opportunity", "Lead", "Contact", "Account"). Used to scan test cases and query the corpus for expected test patterns.'
        ),
      projectPath: z
        .string()
        .describe(
          'Absolute path to the Provar project root. The tests/ subdirectory will be scanned for .testcase files.'
        ),
      targetOrg: z
        .string()
        .optional()
        .describe(
          'SF org alias or username. If provided, also queries provar.qualityhub.testcase.retrieve to include Quality Hub tests in the coverage analysis.'
        ),
    },
    ({ objectName, projectPath, targetOrg }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test automation expert. Analyse test coverage for the Salesforce object "${objectName}".

## Provar project

Root: ${projectPath}
Object to analyse: ${objectName}
${targetOrg ? `Quality Hub org: ${targetOrg}` : ''}

## Workflow

Follow these steps in order:

1. **Scan local test files** — list all .testcase files under ${projectPath}/tests/. For each file that
   references "${objectName}" (search for the string in the file content), read it and extract:
   - The test scenario (from the file name or meta comment)
   - Which operations are covered: API Create, API Read, API Update, API Delete, UI New, UI View,
     UI Edit, UI Delete, UI assertions on fields
   - Which fields are set or asserted

${
  targetOrg
    ? `2. **Query Quality Hub** — call \`provar.qualityhub.testcase.retrieve\` with target_org="${targetOrg}"
   to retrieve test cases linked to the "${objectName}" object from Quality Hub. Add these to the
   coverage inventory.

3. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with "${objectName.toLowerCase()}"
   as the query to understand what test patterns exist in the corpus for this object.
   If the response has \`"count": 0\` with a \`"warning"\` field, fall back: read the
   \`provar://docs/step-reference\` MCP resource for step type schemas, then continue.`
    : `2. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with "${objectName.toLowerCase()}"
   as the query to understand what test patterns exist in the corpus for this object.
   If the response has \`"count": 0\` with a \`"warning"\` field, fall back: read the
   \`provar://docs/step-reference\` MCP resource for step type schemas, then continue.`
}

${targetOrg ? '4' : '3'}. **Build the coverage matrix** — define the standard test scenarios for "${objectName}":

   **API (Apex) operations**
   - Create: ApexCreateObject with required fields
   - Create: ApexCreateObject with optional/edge-case fields
   - Read: ApexReadObject — verify created record
   - Update: ApexUpdateObject — modify field values
   - Delete: ApexDeleteObject — confirm record removed
   - SOQL: ApexSoqlQuery — query by key fields

   **UI operations**
   - New: navigate to New screen, fill required fields, save → assert record created
   - View: navigate to View screen → assert field values
   - Edit: navigate to Edit screen, modify fields, save → assert changes persisted
   - Delete: delete via UI → confirm record no longer visible
   - Related lists: any relationships (e.g. Contacts on Account) that have UI tests

   **Validation rules and required fields**
   - Negative tests: attempt to save with missing required fields → assert error message shown
   - Validation rule triggers: if known validation rules exist, is there a test for each?

${targetOrg ? '5' : '4'}. **Report coverage gaps** — produce a report with three sections:

   ### Covered
   List each scenario that has at least one test, with the test file name.

   ### Gaps
   For each missing scenario, state:
   - What is not covered
   - Why it matters (e.g. "No negative test for required fields means validation rule regressions won't be caught")
   - A brief test outline (inputs, expected outcome, which step types to use)

   ### Suggested next tests
   Rank the top 3-5 gaps by risk. For each, provide:
   - A suggested test case name
   - The key steps (using correct Provar step type names from the reference)
   - Estimated effort (XS / S / M)

Begin with step 1: list the .testcase files in ${projectPath}/tests/ and search for "${objectName}".`,
          },
        },
      ],
    })
  );
}

// ── Prompt: provar.loop.db ────────────────────────────────────────────────────

export function registerLoopDbPrompt(server: McpServer): void {
  server.prompt(
    'provar.loop.db',
    'Generate a Provar XML test case that connects to an external database (SQL Server, Oracle, MySQL, etc.) and verifies query results. Distinct from Salesforce/SOQL flows — this targets DbConnect + SqlQuery steps. Retrieves corpus examples for grounding, enforces correct funcCall/variable-path patterns, generates the test, then validates.',
    {
      story: z
        .string()
        .describe(
          'Description of what the database test should verify. Include the database type (e.g. "SQL Server"), table name, query intent, and what values should be asserted (e.g. "Verify that the Users table contains an active user record with Status=Active after a Salesforce flow runs").'
        ),
      projectPath: z
        .string()
        .optional()
        .describe('Absolute path to the Provar project root. Used to locate the tests/ directory.'),
      testName: z
        .string()
        .optional()
        .describe('Optional file name for the test case (without extension). Inferred from the story if omitted.'),
      dbConnectionName: z
        .string()
        .optional()
        .describe(
          'The name of the database connection as configured in Provar Connection Manager. Used as the connectionName argument on DbConnect. If omitted, the story should describe it.'
        ),
    },
    ({ story, projectPath, testName, dbConnectionName }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are a Provar test automation expert. Generate a Provar XML test case that validates database state using DbConnect and SqlQuery steps.

This is a **database test**, NOT a Salesforce UI or Apex test. Do not use UiConnect, UiWithScreen, ApexConnect, or ApexCreateObject — use the database step types: DbConnect, SqlQuery, SetValues, AssertValues.

## Workflow

Follow these steps in order:

1. **Get corpus examples** — call \`provar.qualityhub.examples.retrieve\` with a query that includes "database DbConnect SqlQuery" plus keywords from the story (e.g. "database SQL Server verify record count"). Use the returned XML examples as the reference for correct step structure.
   If the response has \`"count": 0\` with a \`"warning"\` field (API unavailable or not configured), fall back: read the \`provar://docs/step-reference\` MCP resource — specifically the Database Steps section — for the correct attribute schema, then continue.

2. **Generate the test case** — produce valid Provar XML. Apply these database-specific rules:

   **DbConnect rules:**
   - \`connectionId\` argument MUST use \`valueClass="id"\` — NOT \`"string"\`. Using \`"string"\` causes a runtime type error.
   - \`resultName\` sets the connection handle name (e.g. \`"DbConnection"\`).
   - This name must be reused exactly as \`dbConnectionName\` on every SqlQuery step that uses this connection.
${dbConnectionName ? `   - Use connection name: ${dbConnectionName}` : ''}

   **SqlQuery rules:**
   - \`dbConnectionName\` must exactly equal the \`resultName\` from the DbConnect step above.
   - \`resultName\` names the variable that will hold the query result rows (e.g. \`"DbResults"\`).

   **Accessing results in SetValues/AssertValues — critical:**
   - To count result rows: use \`<value class="funcCall" id="Count">\` — NEVER use \`{Count(Var)}\` string expressions.
   - To access a field from row N (0-based): use the structured variable path with a \`<filter class="index">\` — NEVER use \`{Var[0].Field}\` string expressions.
   - String \`{...}\` expressions are stored verbatim and never evaluated. They will always produce wrong results.

   **Pattern for extracting values from results:**
   \`\`\`xml
   <!-- Count rows -->
   <value class="funcCall" id="Count">
     <argument id="value">
       <value class="variable"><path element="DbResults"/></value>
     </argument>
   </value>

   <!-- Access field from row 0 -->
   <value class="variable">
     <path element="DbResults">
       <filter class="index"><index valueClass="decimal">0</index></filter>
     </path>
     <path element="FieldName"/>
   </value>
   \`\`\`

3. **Write the file** — save the XML to the tests/ directory in the Provar project.
   ${projectHint(projectPath)}
   ${testName ? `Target file name: ${testName}.testcase` : 'Infer the file name from the story (snake_case).'}

4. **Validate** — call \`provar.testcase.validate\` on the saved file. If it reports errors, fix them and re-validate until the file passes clean.

5. **Report** — summarise:
   - Which query/assertion was implemented
   - The DbConnect resultName and SqlQuery dbConnectionName used (confirm they match)
   - Any validation warnings
   - Any aspects of the story that could not be automated (add \`<!-- TODO: manual verification — <reason> -->\` in the XML)

## Database Test Story

${story}

Begin with step 1: call provar.qualityhub.examples.retrieve with "database DbConnect SqlQuery" plus keywords from the story above.`,
          },
        },
      ],
    })
  );
}
