# Provar Validation Rule Registry

> **Generated** by `scripts/build-validation-rule-registry.cjs`. Do not edit by hand — re-run the script after changing a rule.

Provar test-case validation runs in two layers. This registry is the single canonical list of every rule across both.

- **Layer 1 — structural validity** (hand-coded in `testCaseValidate.ts`): emits `issues[]` with `ERROR`/`WARNING`. `is_valid = error_count === 0`.
- **Layer 2 — best practices** (`provar_best_practices_rules.json`, same engine/weights as the Quality Hub API): emits `best_practices_violations[]` with `critical`/`major`/`minor`/`info` and a weighted `quality_score`.

**Severity taxonomy:** `critical` = the test will not load/render in Provar; `major` = a runtime ERROR (loads, fails at execution); `minor` = warning; `info` = advisory.

**The validity bridge (PDX-509):** a `critical` best-practice violation is surfaced into `issues[]` as an `ERROR` and therefore gates `is_valid` — EXCEPT where a Layer-1 check already owns the concept (then it is suppressed to avoid double-reporting). `major`/`minor`/`info` affect `quality_score` (and the `needs_improvement` status) only. The `status` field is tri-state: `invalid` (a critical) / `needs_improvement` (loads but `quality_score < quality_threshold`) / `valid`.

**Counts:** Layer 1 — 23 rules (18 gating). Layer 2 — 179 rules (critical 64 / major 68 / minor 29 / info 18; 58 bridged to `is_valid`).

## Layer 1 — Structural validity rules

| Rule ID                   | Severity | Gates is_valid? | Applies to | Checks                                                                                         |
| ------------------------- | -------- | --------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `TC_001`                  | ERROR    | Yes             | document   | XML declaration present (<?xml …?> first line).                                                |
| `TC_002`                  | ERROR    | Yes             | document   | XML is well-formed (parses without error).                                                     |
| `TC_003`                  | ERROR    | Yes             | document   | Root element is <testCase>.                                                                    |
| `TC_010`                  | ERROR    | Yes             | testCase   | testCase id, when present, is a non-negative integer (id is optional; guid is the identifier). |
| `TC_011`                  | ERROR    | Yes             | testCase   | testCase has a guid attribute.                                                                 |
| `TC_012`                  | ERROR    | Yes             | testCase   | testCase guid is a valid UUID v4.                                                              |
| `TC_020`                  | ERROR    | Yes             | testCase   | testCase has a <steps> element.                                                                |
| `TC_030`                  | ERROR    | Yes             | apiCall    | Each apiCall has a guid attribute.                                                             |
| `TC_031`                  | ERROR    | Yes             | apiCall    | Each apiCall guid is a valid UUID v4.                                                          |
| `TC_032`                  | ERROR    | Yes             | apiCall    | Each apiCall has an apiId attribute.                                                           |
| `TC_033`                  | WARNING  | No              | apiCall    | Each apiCall has a descriptive name attribute.                                                 |
| `TC_034`                  | ERROR    | Yes             | apiCall    | Each apiCall has a testItemId attribute.                                                       |
| `TC_035`                  | ERROR    | Yes             | apiCall    | apiCall testItemId is a whole number.                                                          |
| `DATA-001`                | WARNING  | No              | testCase   | <dataTable> only iterates under a test plan; flags direct testCase-mode execution.             |
| `VAR-REF-001`             | WARNING  | No              | argument   | A whole-token {Var} stored as valueClass="string" (use class="variable").                      |
| `VAR-REF-002`             | WARNING  | No              | argument   | {Var} tokens embedded in a plain string (use class="compound").                                |
| `UI-TARGET-001`           | ERROR    | Yes             | apiCall    | UiWithScreen/UiWithRow target uses class="uiTarget".                                           |
| `UI-LOCATOR-001`          | ERROR    | Yes             | apiCall    | UI action locator uses class="uiLocator".                                                      |
| `UI-INTERACTION-001`      | ERROR    | Yes             | apiCall    | UiDoAction interaction uses class="uiInteraction".                                             |
| `UI-ASSERT-STRUCTURE-001` | ERROR    | Yes             | apiCall    | UiAssert uses nested field/column/page assertion containers, not a flat argument.              |
| `SETVALUES-STRUCTURE-001` | ERROR    | Yes             | apiCall    | SetValues values argument uses class="valueList" with <namedValues>.                           |
| `ASSERT-001`              | WARNING  | No              | apiCall    | AssertValues namedValues format flagged for variable/Apex comparisons.                         |
| `COMPARISON-TYPE-001`     | ERROR    | Yes             | apiCall    | comparisonType is within the step-scoped enum subset (load-blocking otherwise).                |

## Layer 2 — Best-practice rules

| Rule ID                                  | Category                   | Severity | Weight | Gates is_valid? | Checks                                                                                               |
| ---------------------------------------- | -------------------------- | -------- | ------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `APEX-ASSERT-LAYOUT-001`                 | ApexAPI                    | major    | 5      | No              | ApexAssertLayout must have object and expected file.                                                 |
| `APEX-CONNECTION-REF-001`                | ApexAPI                    | major    | 5      | No              | Apex API steps must reference a valid connection.                                                    |
| `APEX-CREATE-FIELDS-001`                 | ApexAPI                    | major    | 5      | No              | ApexCreateObject with fields must populate at least one field.                                       |
| `APEX-CREATE-METADATA-001`               | ApexAPI                    | major    | 5      | No              | ApexCreateObject and ApexUpdateObject must include parameter metadata.                               |
| `APEX-CREATE-UPDATE-STRUCTURE-001`       | ApexAPI                    | major    | 5      | No              | ApexUpdateObject/ApexCreateObject field arguments must be direct, not nested in uiObjectFieldValue.  |
| `APEX-DELETE-ID-001`                     | ApexAPI                    | major    | 5      | No              | ApexDeleteObject must have valid record ID.                                                          |
| `APEX-EXTRACT-LAYOUT-001`                | ApexAPI                    | major    | 5      | No              | ApexExtractLayout must have object, file type, and path.                                             |
| `APEX-OBJECT-TYPE-001`                   | ApexAPI                    | major    | 5      | No              | Apex CRUD operations must have valid object types.                                                   |
| `APEX-PARAM-GEN-URI-001`                 | ApexAPI                    | minor    | 2      | No              | Apex CRUD operations should include parameterGeneratorUri.                                           |
| `APEX-READ-ASSERTIONS-001`               | ApexAPI                    | minor    | 3      | No              | ApexReadObject should use resultAssertions instead of separate AssertValues.                         |
| `APEX-READ-FIELDS-STRUCTURE-001`         | ApexAPI                    | major    | 5      | No              | ApexReadObject must use generatedParameters for field references, not fields argument with textType. |
| `APEX-READ-ID-001`                       | ApexAPI                    | major    | 5      | No              | ApexReadObject must have valid record ID.                                                            |
| `APEX-UPDATE-FIELDS-001`                 | ApexAPI                    | major    | 5      | No              | ApexUpdateObject must specify fields to update.                                                      |
| `APEX-UPDATE-ID-001`                     | ApexAPI                    | major    | 5      | No              | ApexUpdateObject must have valid record ID.                                                          |
| `CONN-ARG-001`                           | ApexAPI                    | minor    | 2      | No              | Connection arguments must use correct naming convention.                                             |
| `BUILD-PLAN-001`                         | BuildAndCI                 | major    | 5      | No              | Regression Test Plan exists for CI.                                                                  |
| `APEX-AUTOCLEANUP-001`                   | ConnectionsAndEnvironments | minor    | 2      | No              | Prefer autoCleanup over manual ApexDeleteObject steps.                                               |
| `CONN-APEX-001`                          | ConnectionsAndEnvironments | critical | 8      | Yes             | Apex API calls reference valid connections.                                                          |
| `CONN-DB-001`                            | ConnectionsAndEnvironments | critical | 8      | Yes             | Database operations reference valid connections.                                                     |
| `CONN-DB-002`                            | ConnectionsAndEnvironments | major    | 5      | No              | DbConnect resultName must match dbConnectionName in DB operations.                                   |
| `CONN-UI-001`                            | ConnectionsAndEnvironments | critical | 8      | Yes             | UI operations reference valid connections.                                                           |
| `DB-CONNECT-001`                         | ConnectionsAndEnvironments | critical | 8      | Yes             | DbConnect has connectionName.                                                                        |
| `DB-CONNECT-002`                         | ConnectionsAndEnvironments | critical | 8      | Yes             | DbConnect has resultName.                                                                            |
| `ENV-CONN-001`                           | ConnectionsAndEnvironments | major    | 5      | No              | Admin connection supports Login-As.                                                                  |
| `ENV-CONN-002`                           | ConnectionsAndEnvironments | minor    | 2      | No              | Connection names should not contain environment specifiers.                                          |
| `REST-CONN-001`                          | ConnectionsAndEnvironments | critical | 8      | Yes             | WebConnect has connectionName.                                                                       |
| `REST-CONN-002`                          | ConnectionsAndEnvironments | critical | 8      | Yes             | WebConnect has resultName.                                                                           |
| `UI-CONN-LITERAL-001`                    | ConnectionsAndEnvironments | critical | 8      | Yes             | uiConnectionName must be a literal string.                                                           |
| `UI-CONNECT-ARGS-001`                    | ConnectionsAndEnvironments | critical | 10     | Yes             | UiConnect has invalid arguments (ApexConnect arguments used).                                        |
| `UI-NITROX-CONNECT-ARGS-001`             | ConnectionsAndEnvironments | critical | 10     | Yes             | NitroX MS connect step has invalid arguments.                                                        |
| `UI-NITROX-VARIANT-ARG-001`              | ConnectionsAndEnvironments | minor    | 2      | No              | NitroX MS connect step missing variant-specific argument.                                            |
| `DDT-EXCEL-001`                          | DataDrivenTesting          | major    | 5      | No              | Excel headers match field label or API name.                                                         |
| `DDT-NO-FUNC-001`                        | DataDrivenTesting          | major    | 5      | No              | No Excel functions in data.                                                                          |
| `DDT-VAR-001`                            | DataDrivenTesting          | minor    | 3      | No              | No hardcoded values in steps.                                                                        |
| `VAR-NAMING-001`                         | DataDrivenTesting          | major    | 5      | No              | Variable names must use valid identifiers.                                                           |
| `VAR-USAGE-001`                          | DataDrivenTesting          | minor    | 2      | No              | Variable references use correct syntax.                                                              |
| `UI-BINDING-ORDER-001`                   | LocatorPatterns            | major    | 5      | No              | UI binding parameter order must have object= first.                                                  |
| `MAINT-FOLDER-001`                       | MaintenanceAndFolders      | minor    | 3      | No              | Folder-level setup test per application segment.                                                     |
| `MAINT-VERSION-001`                      | MaintenanceAndFolders      | info     | 1      | No              | Consistent Provar/OS/browser versions.                                                               |
| `APEX-RESULTNAME-001`                    | NamingConventions          | minor    | 2      | No              | ApexConnect resultName is unique.                                                                    |
| `CUSTOM-FIELD-001`                       | NamingConventions          | major    | 5      | No              | Custom fields end with \_\_c.                                                                        |
| `NC-FIELD-001`                           | NamingConventions          | minor    | 2      | No              | Field names use camelCase.                                                                           |
| `NC-FOLDER-001`                          | NamingConventions          | major    | 5      | No              | Folder names are modular and title-cased.                                                            |
| `NC-PARAM-001`                           | NamingConventions          | major    | 5      | No              | Parameters and variables use camelCase.                                                              |
| `NC-PO-001`                              | NamingConventions          | major    | 5      | No              | Page Objects use PascalCase.                                                                         |
| `NC-TESTCASE-001`                        | NamingConventions          | minor    | 2      | No              | Test case names use consistent naming convention.                                                    |
| `SETVALUES-NAME-001`                     | NamingConventions          | critical | 8      | Yes             | SetValues namedValue elements have name attribute.                                                   |
| `CALLABLE-VISIBILITY-001`                | ReusabilityAndCallables    | critical | 8      | Yes             | Called test cases are marked as Callable.                                                            |
| `REUSE-CALL-001`                         | ReusabilityAndCallables    | minor    | 2      | No              | Callable tests reside in Callables folder.                                                           |
| `REUSE-CALL-002`                         | ReusabilityAndCallables    | minor    | 2      | No              | Callable tests are parameterized.                                                                    |
| `REUSE-CALL-003`                         | ReusabilityAndCallables    | minor    | 2      | No              | Callable tests executable in isolation.                                                              |
| `ASSERT-STR-VAR-001`                     | StructureAndGrouping       | major    | 5      | No              | AssertValues must not use string literal to reference a variable.                                    |
| `BDD-AND-LIMIT-001`                      | StructureAndGrouping       | info     | 1      | No              | Limit And/But chain length.                                                                          |
| `BDD-GIVEN-FIRST-001`                    | StructureAndGrouping       | info     | 1      | No              | BDD scenario should start with Given.                                                                |
| `BDD-ORDER-001`                          | StructureAndGrouping       | info     | 1      | No              | BDD steps should follow logical order.                                                               |
| `CONTROL-FINALLY-001`                    | StructureAndGrouping       | major    | 5      | No              | Finally block should be at end of test.                                                              |
| `RENDER-ARG-001`                         | StructureAndGrouping       | critical | 10     | Yes             | All arguments must have value elements.                                                              |
| `RENDER-BOOL-001`                        | StructureAndGrouping       | critical | 10     | Yes             | Boolean values must use lowercase.                                                                   |
| `RENDER-CASE-001`                        | StructureAndGrouping       | critical | 10     | Yes             | valueClass attributes must use lowercase.                                                            |
| `RENDER-ROOT-001`                        | StructureAndGrouping       | minor    | 3      | No              | Test case root element should not have unknown attributes.                                           |
| `SETVALUES-FUNC-STR-001`                 | StructureAndGrouping       | major    | 5      | No              | SetValues must not use string interpolation for function calls.                                      |
| `SETVALUES-INVALID-ELEMENT-001`          | StructureAndGrouping       | critical | 10     | Yes             | SetValues must not contain invalid child elements.                                                   |
| `SETVALUES-ZERO-IDX-001`                 | StructureAndGrouping       | major    | 5      | No              | SetValues string expression must not use [0] index.                                                  |
| `STEP-NAMES-001`                         | StructureAndGrouping       | minor    | 2      | No              | Custom step names for UI asserts and sets.                                                           |
| `STRUCT-GROUP-001`                       | StructureAndGrouping       | minor    | 2      | No              | All steps are inside Group steps or BDD structure.                                                   |
| `STRUCT-SUMMARY-001`                     | StructureAndGrouping       | info     | 1      | No              | Test case has top-level summary.                                                                     |
| `UI-ASSERT-STRUCT-001`                   | StructureAndGrouping       | critical | 8      | Yes             | UiAssert steps must include all required arguments.                                                  |
| `UI-ASSERT-STRUCT-002`                   | StructureAndGrouping       | critical | 10     | Yes             | UiAssert steps must NOT contain generatedParameters.                                                 |
| `VALUE-CLASS-001`                        | StructureAndGrouping       | critical | 10     | Yes             | Value elements must use valid class attribute.                                                       |
| `AI-CONVERSATION-SESSION-001`            | TestCaseDesign             | critical | 8      | Yes             | AIAgentConversation requires valid session.                                                          |
| `AI-IMAGE-CONFIDENCE-001`                | TestCaseDesign             | major    | 5      | No              | ImageValidator confidence should be 0.0-1.0.                                                         |
| `AI-SESSION-WEBCONNECT-001`              | TestCaseDesign             | critical | 8      | Yes             | AIAgentSession requires WebConnect first.                                                            |
| `AI-UTTERANCE-COUNT-001`                 | TestCaseDesign             | info     | 1      | No              | GenerateUtterance count should be reasonable.                                                        |
| `APEX-BULK-LIMIT-001`                    | TestCaseDesign             | info     | 1      | No              | ApexBulk should be used for large data volumes.                                                      |
| `APEX-EXECUTE-SYNTAX-001`                | TestCaseDesign             | critical | 8      | Yes             | ApexExecute code should be valid Apex syntax.                                                        |
| `APEX-REUSE-CONN-001`                    | TestCaseDesign             | major    | 5      | No              | ApexConnect reuseConnectionName should be left blank.                                                |
| `ASSERT-ACTUAL-001`                      | TestCaseDesign             | critical | 8      | Yes             | AssertValues has actualValue.                                                                        |
| `ASSERT-API-001`                         | TestCaseDesign             | critical | 8      | Yes             | Must use AssertValues API, not deprecated Assert API.                                                |
| `ASSERT-ARG-ORDER-001`                   | TestCaseDesign             | info     | 1      | No              | AssertValues arguments must be in correct order.                                                     |
| `ASSERT-COMPARISON-001`                  | TestCaseDesign             | critical | 8      | Yes             | AssertValues has comparisonType.                                                                     |
| `ASSERT-DATE-FORMAT-001`                 | TestCaseDesign             | minor    | 4      | No              | Date/DateTime assertions should use proper format functions.                                         |
| `ASSERT-EXPECTED-001`                    | TestCaseDesign             | critical | 8      | Yes             | AssertValues has expectedValue.                                                                      |
| `ASSERT-VALUES-COMPARISON-001`           | TestCaseDesign             | major    | 5      | No              | AssertValues should have meaningful expected values.                                                 |
| `BDD-GIVEN-001`                          | TestCaseDesign             | major    | 5      | No              | Given steps have description.                                                                        |
| `BDD-THEN-001`                           | TestCaseDesign             | major    | 5      | No              | Then steps have description.                                                                         |
| `BDD-WHEN-001`                           | TestCaseDesign             | major    | 5      | No              | When steps have description.                                                                         |
| `CLEANUP-CONSISTENCY-001`                | TestCaseDesign             | major    | 5      | No              | Manual cleanup matches object creation.                                                              |
| `CLEANUP-ORDER-001`                      | TestCaseDesign             | minor    | 2      | No              | Cleanup deletes objects in reverse order.                                                            |
| `CONTROL-FINALLY-001`                    | TestCaseDesign             | major    | 5      | No              | Finally block must have description and be at end.                                                   |
| `CONTROL-FOREACH-001`                    | TestCaseDesign             | major    | 4      | No              | ForEach loops have valid source collection.                                                          |
| `CONTROL-FOREACH-002`                    | TestCaseDesign             | critical | 8      | Yes             | ForEach loops have valueName to store current item.                                                  |
| `CONTROL-IF-001`                         | TestCaseDesign             | critical | 8      | Yes             | If statements have conditions.                                                                       |
| `CONTROL-SLEEP-001`                      | TestCaseDesign             | major    | 5      | No              | Sleep step duration and frequency issues.                                                            |
| `CONTROL-SLEEP-001`                      | TestCaseDesign             | info     | 1      | No              | Sleep duration should be under 5 seconds.                                                            |
| `CONTROL-SLEEP-002`                      | TestCaseDesign             | critical | 8      | Yes             | Sleep steps have duration specified.                                                                 |
| `CONTROL-SWITCH-001`                     | TestCaseDesign             | critical | 8      | Yes             | Switch statements have value expression.                                                             |
| `CONTROL-WAITFOR-001`                    | TestCaseDesign             | critical | 8      | Yes             | WaitFor steps have condition.                                                                        |
| `CONTROL-WAITFOR-002`                    | TestCaseDesign             | major    | 5      | No              | WaitFor steps have max iterations limit.                                                             |
| `CONTROL-WHILE-001`                      | TestCaseDesign             | critical | 8      | Yes             | While loops have exit conditions.                                                                    |
| `CONTROL-WHILE-MAX-001`                  | TestCaseDesign             | major    | 5      | No              | While loop must have termination condition.                                                          |
| `CREATE-RESULT-001`                      | TestCaseDesign             | major    | 5      | No              | ApexCreateObject steps specify resultIdName.                                                         |
| `DATA-DB-WHERE-001`                      | TestCaseDesign             | critical | 8      | Yes             | DbDelete and DbUpdate should have WHERE clause.                                                      |
| `DATA-REST-BODY-001`                     | TestCaseDesign             | major    | 5      | No              | POST/PUT/PATCH should have request body.                                                             |
| `DATA-REST-METHOD-001`                   | TestCaseDesign             | critical | 8      | Yes             | RestRequest method should be valid HTTP method.                                                      |
| `DATA-REST-STATUS-001`                   | TestCaseDesign             | info     | 1      | No              | Validate REST response status.                                                                       |
| `DATA-SOAP-XML-001`                      | TestCaseDesign             | critical | 8      | Yes             | SOAP request body should be well-formed XML.                                                         |
| `DATA-TYPE-BOOL-001`                     | TestCaseDesign             | critical | 8      | Yes             | Boolean values are 'true' or 'false'.                                                                |
| `DATA-TYPE-NUMBER-001`                   | TestCaseDesign             | info     | 0      | No              | Numeric values are valid numbers.                                                                    |
| `DESIGN-APIUI-001`                       | TestCaseDesign             | minor    | 3      | No              | Prefer API for setup where possible.                                                                 |
| `DESIGN-GROUP-001`                       | TestCaseDesign             | minor    | 2      | No              | Use Group Steps or BDD structure for logical phases.                                                 |
| `FILE-READ-PATH-001`                     | TestCaseDesign             | critical | 8      | Yes             | Read dataUrl should be valid file path.                                                              |
| `FILE-WRITE-PATH-001`                    | TestCaseDesign             | critical | 8      | Yes             | Write dataUrl should be writable.                                                                    |
| `LOG-LEVEL-001`                          | TestCaseDesign             | info     | 1      | No              | Log messages use appropriate log levels.                                                             |
| `MESSAGING-SUBSCRIBE-BEFORE-RECEIVE-001` | TestCaseDesign             | critical | 8      | Yes             | Subscribe before ReceiveMessage.                                                                     |
| `MESSAGING-TIMEOUT-001`                  | TestCaseDesign             | info     | 1      | No              | ReceiveMessage timeout should be reasonable.                                                         |
| `PICKLIST-001`                           | TestCaseDesign             | major    | 7      | No              | Picklist values should match Salesforce metadata.                                                    |
| `PO-FIELD-EXISTS-001`                    | TestCaseDesign             | major    | 5      | No              | Page Object locator references non-existent field.                                                   |
| `REST-REQUEST-001`                       | TestCaseDesign             | critical | 8      | Yes             | RestRequest has connectionName.                                                                      |
| `SETVALUES-STRUCTURE-001`                | TestCaseDesign             | critical | 8      | Yes             | SetValues steps have namedValues container.                                                          |
| `SETVALUES-VALUE-001`                    | TestCaseDesign             | critical | 8      | Yes             | SetValues namedValue elements have value element.                                                    |
| `SF-CONVERT-LEAD-STATUS-001`             | TestCaseDesign             | critical | 8      | Yes             | ConvertLead status must be valid.                                                                    |
| `SF-LAYOUT-EXTRACT-BEFORE-ASSERT-001`    | TestCaseDesign             | minor    | 2      | No              | ExtractSalesforceLayout before AssertSalesforceLayout.                                               |
| `SOQL-IN-LOOP-001`                       | TestCaseDesign             | major    | 5      | No              | SOQL queries must not be inside loops.                                                               |
| `SOQL-QUERY-001`                         | TestCaseDesign             | critical | 8      | Yes             | ApexSoqlQuery has soqlQuery argument.                                                                |
| `SOQL-RESULT-001`                        | TestCaseDesign             | critical | 8      | Yes             | SOQL queries specify resultListName.                                                                 |
| `SOQL-SELECT-ID-001`                     | TestCaseDesign             | minor    | 2      | No              | SOQL queries include Id and Name.                                                                    |
| `SOQL-STRUCTURE-001`                     | TestCaseDesign             | critical | 8      | Yes             | SOQL queries have SELECT and FROM clauses.                                                           |
| `SOQL-WHERE-001`                         | TestCaseDesign             | major    | 5      | No              | SOQL queries include WHERE or LIMIT clause.                                                          |
| `SQL-QUERY-001`                          | TestCaseDesign             | critical | 8      | Yes             | SqlQuery has query argument.                                                                         |
| `SQL-QUERY-002`                          | TestCaseDesign             | critical | 8      | Yes             | SqlQuery has dbConnectionName.                                                                       |
| `STEP-DISABLED-001`                      | TestCaseDesign             | minor    | 2      | No              | Disabled test steps should be removed.                                                               |
| `STEP-ITEMID-001`                        | TestCaseDesign             | critical | 8      | No              | testItemId values are whole numbers. _(Layer-1 owns this concept; not bridged)_                      |
| `TEST-LENGTH-001`                        | TestCaseDesign             | minor    | 3      | No              | Test case should not be excessively long.                                                            |
| `UI-ALERT-HANDLE-001`                    | TestCaseDesign             | info     | 1      | No              | UiHandleAlert should capture alert text.                                                             |
| `UI-ASSERT-COMPOUND-001`                 | TestCaseDesign             | major    | 6      | No              | UiAssert must use compound fields for component field assertions.                                    |
| `UI-ASSERT-FIELDLOCATOR-001`             | TestCaseDesign             | major    | 5      | No              | UiAssert fieldLocator uses object+field binding.                                                     |
| `UI-ASSERT-FIELDLOCATOR-002`             | TestCaseDesign             | major    | 5      | No              | UiAssert fieldAssertion must not wrap fieldLocator in uiLocator.                                     |
| `UI-ASSERT-FIELDLOCATOR-003`             | TestCaseDesign             | critical | 10     | Yes             | UiAssert bare locator in Salesforce metadata context causes render failure.                          |
| `UI-ASSERT-TYPE-001`                     | TestCaseDesign             | minor    | 2      | No              | UiAssert steps specify assertion type.                                                               |
| `UI-DOACTION-VALUE-001`                  | TestCaseDesign             | critical | 8      | Yes             | UiDoAction Set requires value argument.                                                              |
| `UI-FIELD-METADATA-001`                  | TestCaseDesign             | major    | 5      | No              | UiDoAction/UiAssert fields should exist in Salesforce metadata.                                      |
| `UI-FILL-VERIFY-001`                     | TestCaseDesign             | info     | 1      | No              | Verify fields after UiFill.                                                                          |
| `UI-LOCATOR-ACTION-001`                  | TestCaseDesign             | major    | 5      | No              | UiDoAction locator URIs must use valid patterns.                                                     |
| `UI-LOCATOR-BINDING-001`                 | TestCaseDesign             | major    | 5      | No              | Ui locator built-in actions use object binding.                                                      |
| `UI-LOCATOR-BUTTON-CASING-001`           | TestCaseDesign             | major    | 5      | No              | Standard Salesforce flow buttons must use correct locator pattern.                                   |
| `UI-LOCATOR-RECORDTYPE-001`              | TestCaseDesign             | major    | 5      | No              | Record Type field locator must use name=RecordType not name=recordTypeId.                            |
| `UI-LOCATOR-SAVE-001`                    | TestCaseDesign             | major    | 5      | No              | Save button locator must use correct pattern.                                                        |
| `UI-LOOKUP-ID-001`                       | TestCaseDesign             | major    | 6      | No              | UiDoAction lookup fields should use Name values, not IDs.                                            |
| `UI-NAVIGATE-PREFER-SCREEN-001`          | TestCaseDesign             | info     | 1      | No              | Prefer UiWithScreen over UiNavigate for Salesforce.                                                  |
| `UI-SCREEN-CONTEXT-001`                  | TestCaseDesign             | major    | 5      | No              | UI verification or post-save step left under the wrong screen context.                               |
| `UI-SCREEN-NAV-001`                      | TestCaseDesign             | major    | 5      | No              | First UiWithScreen must use navigate=Always or IfNeccessary.                                         |
| `UI-SCREEN-NAV-002`                      | TestCaseDesign             | minor    | 2      | No              | First UiWithScreen should prefer navigate=Always over IfNeccessary.                                  |
| `UI-SCREEN-OBJID-001`                    | TestCaseDesign             | major    | 5      | No              | UiWithScreen with navigate=Always for Edit/View must have sfUiTargetObjectId.                        |
| `UI-SCREEN-TARGET-001`                   | TestCaseDesign             | major    | 5      | No              | UiWithScreen target URIs must use valid patterns.                                                    |
| `UI-TARGET-ACTION-001`                   | TestCaseDesign             | major    | 5      | No              | UiWithScreen target uses invalid action value.                                                       |
| `UI-WAIT-VALUECLASS-001`                 | TestCaseDesign             | major    | 5      | No              | Wait arguments must use uiWait value class.                                                          |
| `UTIL-MATCH-REGEX-001`                   | TestCaseDesign             | critical | 8      | Yes             | Match regex pattern should be valid.                                                                 |
| `UTIL-REPLACE-EMPTY-001`                 | TestCaseDesign             | major    | 5      | No              | Replace searchString should not be empty.                                                            |
| `UTIL-SPLIT-DELIMITER-001`               | TestCaseDesign             | major    | 5      | No              | Split delimiter should not be empty.                                                                 |
| `VALID-GUID-001`                         | TestCaseDesign             | critical | 8      | No              | Test case has valid identifier. _(Layer-1 owns this concept; not bridged)_                           |
| `VALID-STEPS-001`                        | TestCaseDesign             | critical | 8      | No              | Test case has steps element. _(Layer-1 owns this concept; not bridged)_                              |
| `VAR-PROPERTY-001`                       | TestCaseDesign             | major    | 6      | No              | Variable property references must be valid.                                                          |
| `VAR-REFERENCE-001`                      | TestCaseDesign             | major    | 5      | No              | Variables are defined before use.                                                                    |
| `VAR-STRING-LITERAL-001`                 | TestCaseDesign             | major    | 5      | No              | Variable reference stored as plain string.                                                           |
| `APEX-APIPARAM-HALLUCINATION-001`        | XMLSchema                  | critical | 10     | Yes             | Apex CRUD apiParam elements must be self-closing without summary/type children.                      |
| `APEX-CONNECT-ARGS-001`                  | XMLSchema                  | critical | 10     | Yes             | ApexConnect - Only valid argument IDs allowed.                                                       |
| `APEX-CONNECT-CONNID-001`                | XMLSchema                  | critical | 10     | Yes             | ApexConnect connectionId must use valueClass='id'.                                                   |
| `API-UNKNOWN-001`                        | XMLSchema                  | critical | 10     | Yes             | API identifier must be a valid Provar API.                                                           |
| `FUNCCALL-VALID-001`                     | XMLSchema                  | major    | 6      | No              | funcCall id must be a valid Provar function.                                                         |
| `RENDER-DATE-VALUECLASS-001`             | XMLSchema                  | critical | 10     | Yes             | valueClass='date' requires epoch timestamp, not date string.                                         |
| `SCHEMA-EMPTY-001`                       | XMLSchema                  | minor    | 2      | No              | Test case should not be empty.                                                                       |
| `SCHEMA-ID-001`                          | XMLSchema                  | critical | 10     | No              | Test case must have valid identifier. _(Layer-1 owns this concept; not bridged)_                     |
| `SCHEMA-LEGACY-001`                      | XMLSchema                  | info     | 1      | No              | Consider migrating from registryId to id or guid.                                                    |
| `SCHEMA-ROOT-001`                        | XMLSchema                  | critical | 10     | No              | Test case root element must be testCase. _(Layer-1 owns this concept; not bridged)_                  |
| `SCHEMA-STEPS-001`                       | XMLSchema                  | critical | 10     | No              | Test case must have steps element. _(Layer-1 owns this concept; not bridged)_                        |
| `SCHEMA-URI-001`                         | XMLSchema                  | critical | 10     | Yes             | URI attributes must properly encode ampersands.                                                      |
| `SCHEMA-VALUE-001`                       | XMLSchema                  | critical | 10     | Yes             | Value elements must not use text attribute.                                                          |
| `STRUCT-ATTR-001`                        | XMLSchema                  | info     | 1      | No              | Test case should have failureBehaviour attribute.                                                    |
| `UI-NEST-STRUCT-001`                     | XMLSchema                  | major    | 7      | No              | UI action steps must be nested inside a UiWithScreen substeps clause.                                |
