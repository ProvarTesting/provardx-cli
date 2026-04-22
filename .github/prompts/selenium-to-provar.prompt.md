---
mode: agent
description: Convert a Selenium WebDriver test (Java/Python/JS) into a Provar XML test case using the Provar MCP tools for corpus grounding and validation
---

You are a Provar test migration expert. Migrate the Selenium test below to Provar.

## Source format — Selenium WebDriver

Common patterns to recognise:

- `driver.get(url)` / `navigate().to()` → Salesforce login
- `findElement(By.linkText/name).click()` → click by visible label
- `findElement(...).sendKeys(value)` → type into a field
- `Select.selectByVisibleText(val)` → choose a picklist option
- `findElement(...).getText()` + assertion → verify a field value
- `WebDriverWait` / `ExpectedConditions` → wait for element
- `@Before` / `setUp()` → test setup including login
- `@After` / `tearDown()` → cleanup

## Migration workflow

1. **Get examples** — call `provar.qualityhub.examples.retrieve` with keywords describing the test scenario (e.g. "create opportunity", "convert lead"). Use the returned XML examples as the sole reference for Provar format and step patterns.
   If the response has `"count": 0` with a `"warning"` field (API unavailable or not configured), fall back: read the `provar://docs/step-reference` MCP resource for step types and attribute formats, then continue with generation based on that reference.
2. **Generate** — produce valid Provar XML based on the retrieved examples. Omit browser/login setup — Provar handles Salesforce sessions via Connection Manager.
3. **Write** — save the XML to the `tests/` directory in the Provar project.
4. **Validate** — call `provar.testcase.validate` on the saved file. Fix any errors and re-validate until clean.
5. **Report** — summarise what was migrated and flag any unmappable steps as `<!-- TODO: manual step — <original code> -->`.

## Selenium Source

Paste your Selenium test here (Java, Python, or JavaScript):

```
[PASTE SELENIUM TEST HERE]
```
