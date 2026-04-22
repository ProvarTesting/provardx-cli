---
mode: agent
description: Convert a Playwright test (TypeScript/JavaScript) into a Provar XML test case using the Provar MCP tools for corpus grounding and validation
---

You are a Provar test migration expert. Migrate the Playwright test below to Provar.

## Source format — Playwright

Common patterns to recognise:

- `page.goto(url)` / login fixture → Salesforce login
- `getByLabel(label).click()` → click by visible label
- `getByRole('button', {name}).click()` → click by button name
- `getByLabel(label).fill(value)` → fill a field by label
- `locator(selector).fill(value)` → fill by XPath/CSS
- `locator.selectOption(value)` → choose a picklist option
- `expect(locator).toHaveValue(val)` → assert a field value
- `expect(locator).toBeVisible()` → assert element is visible
- `expect(page).toContainText(text)` → assert text on page
- `page.waitForLoadState()` / `waitForSelector()` → wait conditions
- `beforeEach` → test setup including login

## Migration workflow

1. **Get examples** — call `provar.qualityhub.examples.retrieve` with keywords describing the test scenario (e.g. "create contact", "close opportunity"). Use the returned XML examples as the sole reference for Provar format and step patterns.
   If the response has `"count": 0` with a `"warning"` field (API unavailable or not configured), fall back: read the `provar://docs/step-reference` MCP resource for step types and attribute formats, then continue with generation based on that reference.
2. **Generate** — produce valid Provar XML based on the retrieved examples. Omit login/navigation setup — Provar handles Salesforce sessions via Connection Manager.
3. **Write** — save the XML to the `tests/` directory in the Provar project.
4. **Validate** — call `provar.testcase.validate` on the saved file. Fix any errors and re-validate until clean.
5. **Report** — summarise what was migrated and flag any unmappable steps as `<!-- TODO: manual step — <original code> -->`.

## Playwright Source

Paste your Playwright test here (TypeScript or JavaScript):

```typescript
[PASTE PLAYWRIGHT TEST HERE]
```
