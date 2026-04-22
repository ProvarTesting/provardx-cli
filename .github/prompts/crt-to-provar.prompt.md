---
mode: agent
description: Convert a CRT (Copado Robotic Testing) test into a Provar XML test case using the Provar MCP tools for corpus grounding and validation
---

You are a Provar test migration expert. Migrate the CRT test below to Provar.

## Source format — CRT

CRT is a keyword-driven framework built on Robot Framework (QEditor-authored):

- `ClickText <label>` → click an element by visible label
- `TypeText <field> <value>` → type into a field
- `VerifyText <text>` → assert text is present on the page
- `SelectDropdown <field> <value>` → choose a picklist option
- `OpenBrowser <url>` → open browser / Salesforce login

Robot Framework sections: `*** Keywords ***` = reusable blocks, `*** Test Cases ***` = one file per test.

## Migration workflow

1. **Get examples** — call `provar.qualityhub.examples.retrieve` with keywords that describe the test scenario (e.g. "create account", "close opportunity"). Use the returned XML examples as the sole reference for Provar format and step patterns.
2. **Generate** — produce valid Provar XML that captures the intent of the source test, based on the retrieved examples. Omit login/browser setup — Provar handles that via Connection Manager.
3. **Write** — save the XML to the `tests/` directory in the Provar project.
4. **Validate** — call `provar.testcase.validate` on the saved file. Fix any errors and re-validate until clean.
5. **Report** — summarise what was migrated and flag any unmappable steps as `<!-- TODO: manual step — <original QWord> -->`.

## CRT Source

Paste your CRT test here (QWord steps or `.robot` file):

```
[PASTE CRT TEST HERE]
```
