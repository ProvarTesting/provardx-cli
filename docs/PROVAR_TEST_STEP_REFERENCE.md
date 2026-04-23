# Provar Test Step Reference

> **Source of truth** for AI-assisted test generation in the provardx-cli / Quality Hub MCP toolchain.
> All examples are sourced from the SalesCloud corpus. The `provar.qualityhub.examples.retrieve` tool returns real
> examples for additional grounding; `provar.testcase.validate` enforces all rules documented here.

---

## API ID Reference

| Step Type             | API ID                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| **Connection**        |                                                                          |
| ApexConnect           | `com.provar.plugins.forcedotcom.core.testapis.ApexConnect`               |
| UiConnect             | `com.provar.plugins.forcedotcom.core.ui.UiConnect`                       |
| **Apex CRUD**         |                                                                          |
| ApexCreateObject      | `com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject`          |
| ApexReadObject        | `com.provar.plugins.forcedotcom.core.testapis.ApexReadObject`            |
| ApexUpdateObject      | `com.provar.plugins.forcedotcom.core.testapis.ApexUpdateObject`          |
| ApexDeleteObject      | `com.provar.plugins.forcedotcom.core.testapis.ApexDeleteObject`          |
| ApexSoqlQuery         | `com.provar.plugins.forcedotcom.core.testapis.ApexSoqlQuery`             |
| **Apex Advanced**     |                                                                          |
| ApexBulk              | `com.provar.plugins.forcedotcom.core.testapis.ApexBulk`                  |
| ApexExecute           | `com.provar.plugins.forcedotcom.core.testapis.ApexExecute`               |
| ApexConvertLead       | `com.provar.plugins.forcedotcom.core.testapis.ApexConvertLead`           |
| ApexExtractLayout     | `com.provar.plugins.forcedotcom.core.testapis.ApexExtractLayout`         |
| ApexAssertLayout      | `com.provar.plugins.forcedotcom.core.testapis.ApexAssertLayout`          |
| ApexApproveWorkItem   | `com.provar.plugins.forcedotcom.core.testapis.ApexApproveWorkItem`       |
| ApexSubmitForApproval | `com.provar.plugins.forcedotcom.core.testapis.ApexSubmitForApproval`     |
| ApexLogForCleanup     | `com.provar.plugins.forcedotcom.core.testapis.ApexLogForCleanup`         |
| **UI Steps**          |                                                                          |
| UiWithScreen          | `com.provar.plugins.forcedotcom.core.ui.UiWithScreen`                    |
| UiDoAction            | `com.provar.plugins.forcedotcom.core.ui.UiDoAction`                      |
| UiAssert              | `com.provar.plugins.forcedotcom.core.ui.UiAssert`                        |
| UiWithRow             | `com.provar.plugins.forcedotcom.core.ui.UiWithRow`                       |
| UiHandleAlert         | `com.provar.plugins.forcedotcom.core.ui.UiHandleAlert`                   |
| UiNavigate            | `com.provar.plugins.forcedotcom.core.ui.UiNavigate`                      |
| **Control Flow**      |                                                                          |
| SetValues             | `com.provar.plugins.bundled.apis.control.SetValues`                      |
| StepGroup             | `com.provar.plugins.bundled.apis.control.StepGroup`                      |
| If                    | `com.provar.plugins.bundled.apis.If`                                     |
| ForEach               | `com.provar.plugins.bundled.apis.control.ForEach`                        |
| DoWhile               | `com.provar.plugins.bundled.apis.control.DoWhile`                        |
| WaitFor               | `com.provar.plugins.bundled.apis.control.WaitFor`                        |
| TryCatchFinally       | `com.provar.plugins.bundled.apis.control.TryCatchFinally`                |
| Switch                | `com.provar.plugins.bundled.apis.Switch`                                 |
| Sleep                 | `com.provar.plugins.bundled.apis.control.Sleep`                          |
| Fail                  | `com.provar.plugins.bundled.apis.control.Fail`                           |
| CallTest              | `com.provar.plugins.bundled.apis.control.CallTest`                       |
| **Assertions**        |                                                                          |
| AssertValues          | `com.provar.plugins.bundled.apis.AssertValues`                           |
| **BDD**               |                                                                          |
| Given                 | `com.provar.plugins.bundled.apis.bdd.Given`                              |
| When                  | `com.provar.plugins.bundled.apis.bdd.When`                               |
| Then                  | `com.provar.plugins.bundled.apis.bdd.Then`                               |
| And                   | `com.provar.plugins.bundled.apis.bdd.And`                                |
| But                   | `com.provar.plugins.bundled.apis.bdd.But`                                |
| **Design**            |                                                                          |
| ActualResult          | `com.provar.plugins.bundled.apis.control.ActualResult`                   |
| DesignStep            | `com.provar.plugins.bundled.apis.control.DesignStep`                     |
| **Database**          |                                                                          |
| DbConnect             | `com.provar.plugins.bundled.apis.db.DbConnect`                           |
| DbRead                | `com.provar.plugins.bundled.apis.db.DbRead`                              |
| DbInsert              | `com.provar.plugins.bundled.apis.db.DbInsert`                            |
| DbUpdate              | `com.provar.plugins.bundled.apis.db.DbUpdate`                            |
| DbDelete              | `com.provar.plugins.bundled.apis.db.DbDelete`                            |
| SqlQuery              | `com.provar.plugins.bundled.apis.db.SqlQuery`                            |
| **Web Service**       |                                                                          |
| WebConnect            | `com.provar.plugins.bundled.apis.restservice.WebConnect`                 |
| RestRequest           | `com.provar.plugins.bundled.apis.restservice.RestRequest`                |
| SoapRequest           | `com.provar.plugins.bundled.apis.restservice.SoapRequest`                |
| **Messaging**         |                                                                          |
| PublishMessage        | `com.provar.plugins.bundled.apis.messaging.PublishMessage`               |
| Subscribe             | `com.provar.plugins.bundled.apis.messaging.Subscribe`                    |
| ReceiveMessage        | `com.provar.plugins.bundled.apis.messaging.ReceiveMessage`               |
| SendMessage           | `com.provar.plugins.bundled.apis.messaging.SendMessage`                  |
| **Utility**           |                                                                          |
| ListCompare           | `com.provar.plugins.bundled.apis.list.ListCompare`                       |
| Match                 | `com.provar.plugins.bundled.apis.string.Match`                           |
| Read                  | `com.provar.plugins.bundled.apis.io.Read`                                |
| Write                 | `com.provar.plugins.bundled.apis.io.Write`                               |
| Split                 | `com.provar.plugins.bundled.apis.string.Split`                           |
| Replace               | `com.provar.plugins.bundled.apis.string.Replace`                         |
| **ProvarAI / Labs**   |                                                                          |
| GenerateTestData      | `com.provar.plugins.forcedotcom.core.testapis.generate.GenerateTestData` |
| GenerateTestCase      | `com.provar.plugins.forcedotcom.core.testapis.GenerateTestCase`          |
| PageObjectCleaner     | `com.provar.plugins.bundled.apis.provarlabs.PageObjectCleaner`           |

---

## Common AI Hallucinations — Do Not Use

The following argument IDs look plausible but are invalid and will fail validation:

| Invalid argument              | Correct alternative                                        |
| ----------------------------- | ---------------------------------------------------------- |
| `autoPopulateRequiredFields`  | Not supported — populate fields explicitly                 |
| `assertObjectFieldsPopulated` | Use `UiAssert` or `ApexReadObject` instead                 |
| `commandTimeout`              | Not a valid argument on any step                           |
| `waitForPageLoad`             | Use `beforeWait`/`afterWait` with `uiWait` URI             |
| `screenshotOnFailure`         | Use `captureBefore`/`captureAfter` (string "true"/"false") |
| `closeAllOtherTabs`           | The correct id is `closeAllPrimaryTabs` (ApexConnect only) |
| `connectionType`              | Not a step argument; connection type is implied by apiId   |

---

## Connection Steps

### ApexConnect

Establishes a Salesforce connection (API + optional UI). Usually the first step in every test. Use `autoCleanup="true"` to automatically log out after the test; omit it only when you want the connection to persist into a parent scope.

> **`connectionId` must use `valueClass="id"`** (a GUID string), not `valueClass="string"`. The validator
> enforces this (rule APEX-CONNECT-CONNID-001).

> **ApexConnect vs UiConnect:** ApexConnect opens both an API connection and (optionally) a UI browser session.
> UiConnect opens only a browser session, using an existing ApexConnect result as its Salesforce credential.
> In most test cases you need only ApexConnect.

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexConnect"
         name="ApexConnect" testItemId="1"
         title="Salesforce Connect: SalesUser (Test)">
  <arguments>
    <argument id="connectionName">
      <value class="value" valueClass="string">SalesUser</value>
    </argument>
    <argument id="connectionId">
      <value class="value" valueClass="id">74c34c63-ad34-43d9-bb12-cd783bd9bcdd</value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="uiApplicationName">
      <value class="value" valueClass="string">LightningSales</value>
    </argument>
    <argument id="quickUiLogin">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="closeAllPrimaryTabs">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="reuseConnectionName"/>
    <argument id="alreadyOpenBehaviour">
      <value class="value" valueClass="string">Fail</value>
    </argument>
    <argument id="privateBrowsingMode"/>
    <argument id="enableObjectIdLogging">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="autoCleanup">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="cleanupConnectionName"/>
    <argument id="lightningMode">
      <value class="value" valueClass="string">enable</value>
    </argument>
    <argument id="webBrowser"/>
  </arguments>
</apiCall>
```

**Valid `alreadyOpenBehaviour` values:** `Reuse` | `Fail`
**Valid `lightningMode` values:** `enable` | `default`
**Valid `resultScope` values:** `Test` | `Global` | `Folder`

### UiConnect

Opens a browser-only UI session. Use this when you have a separate ApexConnect for API operations and need an independent browser window. Fewer arguments than ApexConnect — it does not manage Salesforce API credentials.

> **UiConnect does NOT accept:** `autoCleanup`, `enableObjectIdLogging`, `quickUiLogin`, `closeAllPrimaryTabs`,
> `alreadyOpenBehaviour`, `lightningMode`, `uiApplicationName`, `cleanupConnectionName`.
> Using these on UiConnect will fail validation (rule UI-CONNECT-ARGS-001).

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiConnect"
         name="UiConnect" testItemId="1"
         title="UI Connect: DemoOrg">
  <arguments>
    <argument id="connectionName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="reuseConnectionName"/>
    <argument id="privateBrowsingMode"/>
    <argument id="webBrowser"/>
  </arguments>
</apiCall>
```

---

## UI Steps

UI steps must always be nested inside a `UiWithScreen` block. Never place `UiDoAction` or `UiAssert` directly in the top-level `<steps>` list.

### UiWithScreen

Navigates to (or asserts presence of) a Salesforce screen, then runs substeps against it. All UI actions and assertions go inside the `<clause name="substeps">` block.

**Navigation rules:**

- The first `UiWithScreen` in a test **must** use `navigate="Always"` or `navigate="IfNecessary"`. Never `"Dont"` for the first screen.
- Subsequent screens in the same flow should use `navigate="Dont"` when Salesforce has already navigated there (e.g., after clicking Save the record view is already open).
- `navigate="Always"` on an `Edit` or `View` action **requires** `sfUiTargetObjectId` (the record ID). Without it, Provar cannot navigate to the correct record.
- `sfUiTargetResultName` captures the record ID that Salesforce creates (useful on `New` action screens after save).

**Target URI format:** `sf:ui:target?object=OBJECT&action=ACTION`

Valid `action` values: `ObjectHome` | `New` | `View` | `Edit` | `Delete` | `Clone`

```xml
<!-- First screen: navigate=Always required -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen"
         name="UiWithScreen" testItemId="2"
         title="On SF Opportunity Home screen">
  <arguments>
    <argument id="uiConnectionName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="target">
      <value class="uiTarget" uri="sf:ui:target?object=Opportunity&amp;action=ObjectHome"/>
    </argument>
    <argument id="navigate">
      <value class="value" valueClass="string">Always</value>
    </argument>
    <argument id="targetDescription">
      <value class="value" valueClass="string">On SF Opportunity Home screen</value>
    </argument>
    <argument id="windowSelection">
      <value class="value" valueClass="string">Default</value>
    </argument>
    <argument id="windowSize">
      <value class="value" valueClass="string">Default</value>
    </argument>
    <argument id="closeWindow"/>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="substeps" testItemId="3">
      <steps>
        <!-- UiDoAction and UiAssert steps go here -->
      </steps>
    </clause>
  </clauses>
</apiCall>

<!-- New screen: navigate=Dont (already arrived via New button click), capture resulting record ID -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen"
         name="UiWithScreen" testItemId="5"
         title="On SF Opportunity New screen">
  <arguments>
    <argument id="uiConnectionName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="target">
      <value class="uiTarget" uri="sf:ui:target?object=Opportunity&amp;noOverride=true&amp;action=New"/>
    </argument>
    <argument id="navigate">
      <value class="value" valueClass="string">Dont</value>
    </argument>
    <argument id="targetDescription">
      <value class="value" valueClass="string">On SF Opportunity New screen</value>
    </argument>
    <argument id="windowSelection">
      <value class="value" valueClass="string">Default</value>
    </argument>
    <argument id="windowSize">
      <value class="value" valueClass="string">Default</value>
    </argument>
    <argument id="closeWindow"/>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="sfUiTargetResultName">
      <value class="value" valueClass="string">opportunityId</value>
    </argument>
    <argument id="sfUiTargetResultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="substeps" testItemId="6">
      <steps>
        <!-- fill fields, then Save -->
      </steps>
    </clause>
  </clauses>
</apiCall>

<!-- View screen: navigate=Always requires sfUiTargetObjectId -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen"
         name="UiWithScreen" testItemId="12"
         title="On SF Opportunity View screen">
  <arguments>
    <argument id="uiConnectionName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="target">
      <value class="uiTarget" uri="sf:ui:target?object=Opportunity&amp;noOverride=true&amp;action=View"/>
    </argument>
    <argument id="navigate">
      <value class="value" valueClass="string">Always</value>
    </argument>
    <argument id="targetDescription">
      <value class="value" valueClass="string">On SF Opportunity View screen</value>
    </argument>
    <argument id="windowSelection">
      <value class="value" valueClass="string">Default</value>
    </argument>
    <argument id="windowSize">
      <value class="value" valueClass="string">Default</value>
    </argument>
    <argument id="closeWindow"/>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="sfUiTargetObjectId">
      <value class="variable">
        <path element="opportunityId"/>
      </value>
    </argument>
  </arguments>
  <clauses>
    <clause name="substeps" testItemId="13">
      <steps>
        <!-- UiAssert steps go here -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

### UiDoAction

Performs a single UI interaction on a field or button. The `interaction` URI determines the action type.

**Interaction types:**

- `ui:interaction?name=action` — click a button or link
- `ui:interaction?name=set` — fill/type into a field or select a picklist value
- `ui:interaction?name=file` — upload a file (uses `fileLocation` instead of `value`)

**Locator URI format:** `ui:locator?name=FIELD_OR_BUTTON_NAME&binding=ENCODED_BINDING`

The binding component URL-encodes `sf:ui:binding:object?object=OBJECT&field=FIELD` for field locators, or `sf:ui:binding:object?object=OBJECT&action=ACTION` for action locators.

```xml
<!-- Click a button (interaction=action) -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction"
         name="UiDoAction" testItemId="4"
         title="Click the New button">
  <arguments>
    <argument id="locator">
      <value class="uiLocator" uri="ui:locator?name=New&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DOpportunity%26action%3DNew"/>
    </argument>
    <argument id="interaction">
      <value class="uiInteraction" uri="ui:interaction?name=action"/>
    </argument>
    <argument id="hover">
      <value class="value" valueClass="boolean">false</value>
    </argument>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="beforeWait">
      <value class="uiWait" uri="default"/>
    </argument>
    <argument id="afterWait">
      <value class="uiWait" uri="default"/>
    </argument>
    <argument id="interactionDescription">
      <value class="value" valueClass="string">Click the New button</value>
    </argument>
    <argument id="autoRetry"/>
  </arguments>
</apiCall>

<!-- Set a text/picklist field (interaction=set) -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction"
         name="UiDoAction" testItemId="7"
         title="Set the Opportunity Name field to Test">
  <arguments>
    <argument id="locator">
      <value class="uiLocator" uri="ui:locator?name=Name&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DOpportunity%26field%3DName"/>
    </argument>
    <argument id="interaction">
      <value class="uiInteraction" uri="ui:interaction?name=set"/>
    </argument>
    <argument id="value">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="blur">
      <value class="value" valueClass="boolean">false</value>
    </argument>
    <argument id="pressEnter">
      <value class="value" valueClass="boolean">false</value>
    </argument>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="beforeWait">
      <value class="uiWait" uri="default"/>
    </argument>
    <argument id="afterWait">
      <value class="uiWait" uri="default"/>
    </argument>
    <argument id="interactionDescription">
      <value class="value" valueClass="string">Set the Opportunity Name field to Test</value>
    </argument>
    <argument id="autoRetry"/>
  </arguments>
</apiCall>

<!-- Upload a file (interaction=file) -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction"
         name="UiDoAction" testItemId="15"
         title="Upload attachment file">
  <arguments>
    <argument id="locator">
      <value class="uiLocator" uri="ui:locator?name=AttachFile&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DOpportunity%26action%3DAttachFile%26relationship%3DCombinedAttachments"/>
    </argument>
    <argument id="interaction">
      <value class="uiInteraction" uri="ui:interaction?name=file"/>
    </argument>
    <argument id="fileLocation">
      <value class="value" valueClass="string">templates/TestData.xlsx</value>
    </argument>
    <argument id="fileContents"/>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="beforeWait">
      <value class="uiWait" uri="default"/>
    </argument>
    <argument id="afterWait">
      <value class="uiWait" uri="default"/>
    </argument>
    <argument id="interactionDescription">
      <value class="value" valueClass="string">Upload attachment file</value>
    </argument>
    <argument id="autoRetry">
      <value class="uiWait" uri="ui:wait:autoRetry:timeout=10"/>
    </argument>
  </arguments>
</apiCall>
```

> **Rule UI-DOACTION-VALUE-001:** When `interaction` is `set`, the `value` argument is required.
> When `interaction` is `action`, the `value` argument must be absent.

### UiAssert

Verifies field values or element state on the current screen. Must always include `columnAssertions`, `pageAssertions`, `resultScope`, `captureAfter`, `beforeWait`, and `autoRetry` — even when empty.

> **Rule UI-ASSERT-STRUCT-001:** All six arguments above are required. Omitting any will fail validation.
>
> **Rule UI-ASSERT-STRUCT-002:** Do NOT include `generatedParameters` on `UiAssert`. Unlike `UiDoAction`,
> `UiAssert` does not use `generatedParameters` for its field assertions.
>
> **Rule UI-ASSERT-FIELDLOCATOR-002:** The `uiFieldAssertion` uses a bare `<fieldLocator uri="..."/>` element,
> NOT a `<value class="uiLocator">` wrapper.

```xml
<!-- Assert a field value -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert"
         name="UiAssert" testItemId="14"
         title="UI Assert: Name">
  <arguments>
    <argument id="resultName">
      <value class="value" valueClass="string">Values</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="fieldAssertions">
      <value class="valueList" mutable="Mutable">
        <uiFieldAssertion resultName="Name">
          <fieldLocator uri="ui:locator?name=Name&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DOpportunity%26field%3DName"/>
          <attributeAssertions>
            <uiAttributeAssertion attributeName="value" comparisonType="EqualTo" normalize="true">
              <value class="value" valueClass="string">Test</value>
            </uiAttributeAssertion>
          </attributeAssertions>
        </uiFieldAssertion>
      </value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="columnAssertions">
      <value class="valueList" mutable="Mutable"/>
    </argument>
    <argument id="pageAssertions">
      <value class="valueList" mutable="Mutable"/>
    </argument>
    <argument id="beforeWait"/>
    <argument id="autoRetry"/>
  </arguments>
</apiCall>

<!-- Assert a related list row count -->
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert"
         name="UiAssert" testItemId="16"
         title="UI Assert: Attachment count">
  <arguments>
    <argument id="resultName">
      <value class="value" valueClass="string">Values</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="fieldAssertions">
      <value class="valueList" mutable="Mutable">
        <uiFieldAssertion resultName="CombinedAttachments">
          <fieldLocator uri="ui:locator?name=CombinedAttachments&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DOpportunity%26relationship%3DCombinedAttachments"/>
          <attributeAssertions>
            <uiAttributeAssertion attributeName="totalRowCount" comparisonType="EqualTo">
              <value class="value" valueClass="string">1</value>
            </uiAttributeAssertion>
            <uiAttributeAssertion attributeName="value" comparisonType="None"/>
          </attributeAssertions>
        </uiFieldAssertion>
      </value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="columnAssertions">
      <value class="valueList" mutable="Mutable"/>
    </argument>
    <argument id="pageAssertions">
      <value class="valueList" mutable="Mutable"/>
    </argument>
    <argument id="beforeWait"/>
    <argument id="autoRetry"/>
  </arguments>
</apiCall>
```

**Valid `comparisonType` values:** `EqualTo` | `NotEqualTo` | `Contains` | `NotContains` | `StartsWith` | `EndsWith` | `None`

### UiWithRow

Targets a specific row in a related list or table. Substeps inside the clause operate in the row context (locators can use `rowLocator` parameter for scoping).

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithRow"
         name="UiWithRow" testItemId="22"
         title="With Roles rows 1">
  <arguments>
    <argument id="uiConnectionName">
      <value class="value" valueClass="string">DemoOrg</value>
    </argument>
    <argument id="locator">
      <value class="uiLocator" uri="sf:ui:locator:row?table=roleBlock%2Froles"/>
    </argument>
    <argument id="uiRowLocator">
      <value class="value" valueClass="string">1</value>
    </argument>
    <argument id="locatorDescription">
      <value class="value" valueClass="string">With Roles rows 1</value>
    </argument>
    <argument id="failIfNotFound">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="debugRowLocator">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">Row</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Local</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="substeps" testItemId="23">
      <steps>
        <!-- UiDoAction steps scoped to this row -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

**Row locator URI format:** `sf:ui:locator:row?table=RELATED_LIST_NAME`

The `uiRowLocator` can be a row number (1-based) or a field-value match expression.

### UiHandleAlert

Handles browser-level alert/confirm dialogs. Place this immediately after the step that triggers the dialog (e.g., a Delete button click).

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiHandleAlert"
         name="UiHandleAlert" testItemId="46"
         title="Handle UI Alerts">
  <arguments>
    <argument id="alerts">
      <value class="valueList" mutable="Mutable">
        <namedValues mutable="Mutable">
          <namedValue name="expectedMessage"/>
          <namedValue name="response">
            <value class="value" valueClass="string">OK</value>
          </namedValue>
          <namedValue name="beforeWait"/>
          <namedValue name="afterWait"/>
          <namedValue name="autoRetry"/>
        </namedValues>
      </value>
    </argument>
    <argument id="captureBefore">
      <value class="value" valueClass="string">false</value>
    </argument>
    <argument id="captureAfter">
      <value class="value" valueClass="string">false</value>
    </argument>
  </arguments>
</apiCall>
```

**Valid `response` values:** `OK` | `Cancel`

Set `expectedMessage` to a string value to assert the alert text matches before responding.

---

## Apex CRUD Operations

### ApexCreateObject

Creates a Salesforce record via the API. Requires `parameterGeneratorUri`, `parameterGeneratorProperties`, and `generatedParameters` — these are always present on Apex CRUD steps and the validator checks for them.

> **`parameterGeneratorProperties` key format:** The full command class name prefix is required, e.g.
> `com.provar.plugins.forcedotcom.ui.commands.CreateCustomObjectTestStepCommand.ConnectionName`
> (not just `.ConnectionName`).

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexCreateObject"
         name="ApexCreateObject"
         parameterGeneratorUri="command:com.provar.plugins.forcedotcom.ui.commands.CreateCustomObjectTestStepCommand"
         testItemId="3"
         title="Create Object: Lead=&gt;LeadId">
  <arguments>
    <argument id="objectType">
      <value class="value" valueClass="string">Lead</value>
    </argument>
    <argument id="resultIdName">
      <value class="value" valueClass="string">LeadId</value>
    </argument>
    <argument id="apexConnectionName">
      <value class="value" valueClass="string">Admin</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="LastName">
      <value class="value" valueClass="string">Smith</value>
    </argument>
    <argument id="Company">
      <value class="value" valueClass="string">Acme</value>
    </argument>
  </arguments>
  <parameterGeneratorProperties>
    <propertyValue name="com.provar.plugins.forcedotcom.ui.commands.CreateCustomObjectTestStepCommand.ConnectionName">Admin</propertyValue>
    <propertyValue name="com.provar.plugins.forcedotcom.ui.commands.CreateCustomObjectTestStepCommand.CustomObjectName">Lead</propertyValue>
  </parameterGeneratorProperties>
  <generatedParameters>
    <apiParam group="fields" modelBinding="sf:ui:binding:object?object=Lead&amp;field=LastName" name="LastName" title="LastName"/>
    <apiParam group="fields" modelBinding="sf:ui:binding:object?object=Lead&amp;field=Company" name="Company" title="Company"/>
  </generatedParameters>
</apiCall>
```

### ApexReadObject

Reads fields from an existing record by ID. `objectId` takes a variable reference to an ID stored from a prior `ApexCreateObject` or `sfUiTargetResultName` capture.

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexReadObject"
         name="ApexReadObject"
         parameterGeneratorUri="command:com.provar.plugins.forcedotcom.ui.commands.ReadCustomObjectTestStepCommand"
         testItemId="1"
         title="Read Object: Account = {AccountId}">
  <arguments>
    <argument id="apexConnectionName">
      <value class="value" valueClass="string">Admin</value>
    </argument>
    <argument id="objectType">
      <value class="value" valueClass="string">Account</value>
    </argument>
    <argument id="objectId">
      <value class="variable">
        <path element="AccountId"/>
      </value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">AccountRecord</value>
    </argument>
  </arguments>
  <parameterGeneratorProperties>
    <propertyValue name="com.provar.plugins.forcedotcom.ui.commands.ReadCustomObjectTestStepCommand.ConnectionName">Admin</propertyValue>
    <propertyValue name="com.provar.plugins.forcedotcom.ui.commands.ReadCustomObjectTestStepCommand.CustomObjectName">Account</propertyValue>
  </parameterGeneratorProperties>
  <generatedParameters>
    <apiParam group="fields" modelBinding="sf:ui:binding:object?object=Account&amp;field=Name" name="Name" title="Name"/>
    <apiParam group="fields" modelBinding="sf:ui:binding:object?object=Account&amp;field=Phone" name="Phone" title="Phone"/>
  </generatedParameters>
</apiCall>
```

### ApexUpdateObject

Updates fields on an existing record. `objectId` is required and must reference a variable.

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexUpdateObject"
         name="ApexUpdateObject"
         parameterGeneratorUri="command:com.provar.plugins.forcedotcom.ui.commands.UpdateCustomObjectTestStepCommand"
         testItemId="1"
         title="Update Object: Account = {AccountId}">
  <arguments>
    <argument id="apexConnectionName">
      <value class="value" valueClass="string">Admin</value>
    </argument>
    <argument id="objectType">
      <value class="value" valueClass="string">Account</value>
    </argument>
    <argument id="objectId">
      <value class="variable">
        <path element="AccountId"/>
      </value>
    </argument>
    <argument id="Industry">
      <value class="value" valueClass="string">Technology</value>
    </argument>
  </arguments>
  <parameterGeneratorProperties>
    <propertyValue name="com.provar.plugins.forcedotcom.ui.commands.UpdateCustomObjectTestStepCommand.ConnectionName">Admin</propertyValue>
    <propertyValue name="com.provar.plugins.forcedotcom.ui.commands.UpdateCustomObjectTestStepCommand.CustomObjectName">Account</propertyValue>
  </parameterGeneratorProperties>
  <generatedParameters>
    <apiParam group="fields" modelBinding="sf:ui:binding:object?object=Account&amp;field=Industry" name="Industry" title="Industry"/>
  </generatedParameters>
</apiCall>
```

### ApexDeleteObject

Deletes a record by ID. No `parameterGeneratorUri` required.

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexDeleteObject"
         name="ApexDeleteObject" testItemId="1"
         title="Delete Object: {AccountId}">
  <arguments>
    <argument id="apexConnectionName">
      <value class="value" valueClass="string">Admin</value>
    </argument>
    <argument id="objectId">
      <value class="variable">
        <path element="AccountId"/>
      </value>
    </argument>
  </arguments>
</apiCall>
```

### ApexSoqlQuery

Runs a SOQL query and stores results as a list variable. Always include `Id` and `Name` in the SELECT clause. Always specify `resultListName` and `resultScope`.

```xml
<apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexSoqlQuery"
         name="ApexSoqlQuery" testItemId="1"
         title="SOQL Query: SELECT Id, Name FROM Account=&gt;AccountRows">
  <arguments>
    <argument id="apexConnectionName">
      <value class="value" valueClass="string">Admin</value>
    </argument>
    <argument id="soqlQuery">
      <value class="value" valueClass="string">SELECT Id, Name FROM Account WHERE Name = 'Test Account'</value>
    </argument>
    <argument id="resultListName">
      <value class="value" valueClass="string">AccountRows</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
  </arguments>
</apiCall>
```

---

## Control Flow

### SetValues

Sets one or more test variables. Use this for all test data instead of hardcoding values across multiple steps. Variable names must match `^[A-Za-z_][A-Za-z0-9_]*$`.

> **`dataTable` binding is ignored by the CLI.** Always use `SetValues` for parameterized data when tests
> run via `sf provar automation testrun` or Quality Hub.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.SetValues"
         name="SetValues" testItemId="1"
         title="Set Test Data Variables">
  <arguments>
    <argument id="values">
      <value class="valueList" mutable="Mutable">
        <namedValues mutable="Mutable">
          <namedValue name="AccountName">
            <value class="value" valueClass="string">Acme Corporation</value>
          </namedValue>
          <namedValue name="PhoneNumber">
            <value class="value" valueClass="string">555-123-4567</value>
          </namedValue>
          <namedValue name="IsActive">
            <value class="value" valueClass="boolean">true</value>
          </namedValue>
        </namedValues>
      </value>
    </argument>
  </arguments>
</apiCall>
```

### StepGroup

Groups steps with a shared label. Substeps go in `<clause name="hidden">`.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.StepGroup"
         name="StepGroup" testItemId="1"
         title="Setup - Create Connection">
  <arguments>
    <argument id="description">
      <value class="value" valueClass="string">Establish connection to Salesforce</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="hidden" testItemId="2">
      <steps>
        <!-- Steps go here -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

### If

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.If"
         name="If" testItemId="1"
         title="If: {IsActive}">
  <arguments>
    <argument id="condition">
      <value class="value" valueClass="string">{IsActive} == true</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="then" testItemId="2">
      <steps>
        <!-- Steps if condition is true -->
      </steps>
    </clause>
    <clause name="else" testItemId="3">
      <steps>
        <!-- Steps if condition is false -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

### ForEach

Iterates over a list variable. `list` must reference an existing variable. `valueName` must be unique within scope.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.ForEach"
         name="ForEach" testItemId="1"
         title="For Each: {AccountRows}=&gt;CurrentRow">
  <arguments>
    <argument id="list">
      <value class="variable">
        <path element="AccountRows"/>
      </value>
    </argument>
    <argument id="fromItem">
      <value class="value" valueClass="decimal">1</value>
    </argument>
    <argument id="valueName">
      <value class="value" valueClass="string">CurrentRow</value>
    </argument>
    <argument id="continueOnFailure">
      <value class="value" valueClass="boolean">false</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="substeps" testItemId="2">
      <steps>
        <!-- Loop body -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

### TryCatchFinally

Wraps steps with error handling. The `finally` clause always runs, making it the right place for cleanup steps (e.g., delete records created during the test).

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.TryCatchFinally"
         name="TryCatchFinally" testItemId="1"
         title="Try/Catch/Finally">
  <clauses>
    <clause name="try" testItemId="2">
      <steps>
        <!-- Main test steps -->
      </steps>
    </clause>
    <clause name="catch" testItemId="3">
      <steps>
        <!-- Steps to run on failure (optional) -->
      </steps>
    </clause>
    <clause name="finally" testItemId="4">
      <steps>
        <!-- Cleanup: always runs, even on failure -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

### WaitFor

Polls a condition at intervals until true or max iterations are reached.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.WaitFor"
         name="WaitFor" testItemId="1"
         title="Wait For: {IsComplete}">
  <arguments>
    <argument id="condition">
      <value class="value" valueClass="string">{IsComplete} == true</value>
    </argument>
    <argument id="testAtStart">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="maxIterations">
      <value class="value" valueClass="decimal">10</value>
    </argument>
    <argument id="sleepSecs">
      <value class="value" valueClass="decimal">2</value>
    </argument>
    <argument id="continueOnFailure">
      <value class="value" valueClass="boolean">false</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="substeps" testItemId="2">
      <steps>
        <!-- Steps to check the condition -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

> **Rule CONTROL-WAITFOR-002:** `maxIterations` is required — omitting it produces an infinite loop.

### Sleep

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.Sleep"
         name="Sleep" testItemId="1"
         title="Sleep for 5 seconds">
  <arguments>
    <argument id="sleepSecs">
      <value class="value" valueClass="decimal">5</value>
    </argument>
  </arguments>
</apiCall>
```

### CallTest

Calls another test case as a step (callable tests have `visibility="Internal"`). Use this to share setup logic across test cases.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.CallTest"
         name="CallTest" testItemId="1"
         title="Call: Create Lead API">
  <arguments>
    <argument id="testCase">
      <value class="value" valueClass="string">Callables/Create Lead API</value>
    </argument>
    <argument id="LastName">
      <value class="value" valueClass="string">Smith</value>
    </argument>
    <argument id="Company">
      <value class="value" valueClass="string">Acme</value>
    </argument>
  </arguments>
</apiCall>
```

---

## Assertions

### AssertValues

Variable-to-variable or variable-to-literal comparison. For UI field assertions use `UiAssert` instead.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.AssertValues"
         name="AssertValues" testItemId="1"
         title="Assert: {Expected} EqualTo {Actual}">
  <arguments>
    <argument id="expectedValue">
      <value class="variable">
        <path element="ExpectedValue"/>
      </value>
    </argument>
    <argument id="comparisonType">
      <value class="value" valueClass="string">EqualTo</value>
    </argument>
    <argument id="actualValue">
      <value class="variable">
        <path element="ActualValue"/>
      </value>
    </argument>
    <argument id="caseSensitive">
      <value class="value" valueClass="boolean">false</value>
    </argument>
    <argument id="numeric">
      <value class="value" valueClass="boolean">false</value>
    </argument>
    <argument id="failureMessage">
      <value class="value" valueClass="string">Values do not match</value>
    </argument>
  </arguments>
</apiCall>
```

---

## BDD Steps

`Given`, `When`, `Then`, `And`, `But` all share the same structure: a `description` argument and a `hidden` clause for substeps. Use them to add a BDD narrative layer over standard steps.

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.bdd.Given"
         name="Given" testItemId="1"
         title="Given: The user is logged in to Salesforce">
  <arguments>
    <argument id="description">
      <value class="value" valueClass="string">The user is logged in to Salesforce</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="hidden" testItemId="2">
      <steps>
        <!-- ApexConnect or UiConnect steps go here -->
      </steps>
    </clause>
  </clauses>
</apiCall>

<!-- And / But follow the same structure -->
<apiCall apiId="com.provar.plugins.bundled.apis.bdd.And"
         name="And" testItemId="5"
         title="And: The opportunity stage is set to Closed Won">
  <arguments>
    <argument id="description">
      <value class="value" valueClass="string">The opportunity stage is set to Closed Won</value>
    </argument>
  </arguments>
  <clauses>
    <clause name="hidden" testItemId="6">
      <steps>
        <!-- Steps -->
      </steps>
    </clause>
  </clauses>
</apiCall>
```

---

## Database Steps

> **Critical constraints — read before generating any Database step XML:**
>
> 1. **`connectionId` must use `valueClass="id"`** — not `"string"`. Using `"string"` causes a runtime type error.
> 2. **`DbConnect.resultName` must exactly equal `SqlQuery.dbConnectionName`** — these two values are the coupling point between the steps. A mismatch causes "connection not found" at runtime.
> 3. **Never use `{Count(Var)}` or `{Var[0].Field}` string expressions in SetValues/AssertValues** — these are stored verbatim and never evaluated. Use `<value class="funcCall">` for Count and the structured `<value class="variable"><path>` form for indexed field access. See the examples below.

### DbConnect

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.db.DbConnect"
         name="DbConnect" testItemId="1"
         title="DB Connect: DbConnection">
  <arguments>
    <argument id="connectionName">
      <value class="value" valueClass="string">MyDatabase</value>
    </argument>
    <argument id="connectionId">
      <!-- MUST be valueClass="id" — not "string" -->
      <value class="value" valueClass="id">database-connection-uuid</value>
    </argument>
    <argument id="autoCommit">
      <value class="value" valueClass="boolean">true</value>
    </argument>
    <argument id="resultName">
      <!-- This value must exactly match dbConnectionName on every SqlQuery that uses this connection -->
      <value class="value" valueClass="string">DbConnection</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
  </arguments>
</apiCall>
```

### SqlQuery

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.db.SqlQuery"
         name="SqlQuery" testItemId="1"
         title="SQL Query: DbConnection=&gt;DbResults">
  <arguments>
    <argument id="dbConnectionName">
      <!-- Must exactly equal the resultName on the DbConnect step above -->
      <value class="value" valueClass="string">DbConnection</value>
    </argument>
    <argument id="query">
      <value class="value" valueClass="string">SELECT Id, Name, Status FROM Users WHERE Status = 'Active'</value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">DbResults</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
  </arguments>
</apiCall>
```

### Accessing Database Results — funcCall and structured variable paths

After `SqlQuery`, the result variable (e.g. `DbResults`) is a list of rows. To use the results in `SetValues` or `AssertValues`, you must use structured XML — not `{...}` string expressions.

#### Count the result rows (funcCall)

```xml
<!-- ✅ CORRECT — funcCall element evaluates at runtime -->
<argument id="value">
  <value class="funcCall" id="Count">
    <argument id="value">
      <value class="variable">
        <path element="DbResults"/>
      </value>
    </argument>
  </value>
</argument>

<!-- ❌ WRONG — string expression stored verbatim, never evaluated -->
<argument id="value">
  <value class="value" valueClass="string">{Count(DbResults)}</value>
</argument>
```

#### Access a field from a specific row (structured variable path)

```xml
<!-- ✅ CORRECT — structured path with index filter (0-based) -->
<argument id="value">
  <value class="variable">
    <path element="DbResults">
      <filter class="index">
        <index valueClass="decimal">0</index>
      </filter>
    </path>
    <path element="Status"/>
  </value>
</argument>

<!-- ❌ WRONG — string expression stored verbatim, never evaluated -->
<argument id="value">
  <value class="value" valueClass="string">{DbResults[0].Status}</value>
</argument>
```

#### Full SetValues example — extract row count and first-row field

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.control.SetValues"
         name="SetValues" testItemId="3"
         title="Extract DB result values">
  <arguments>
    <argument id="values">
      <value class="list">
        <!-- Row count into RowCount variable -->
        <value class="namedValue" name="RowCount">
          <value class="funcCall" id="Count">
            <argument id="value">
              <value class="variable">
                <path element="DbResults"/>
              </value>
            </argument>
          </value>
        </value>
        <!-- First row Status field into FirstStatus variable -->
        <value class="namedValue" name="FirstStatus">
          <value class="variable">
            <path element="DbResults">
              <filter class="index">
                <index valueClass="decimal">0</index>
              </filter>
            </path>
            <path element="Status"/>
          </value>
        </value>
      </value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
  </arguments>
</apiCall>
```

---

## Web Service Steps

### WebConnect

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.restservice.WebConnect"
         name="WebConnect" testItemId="1"
         title="Web Connect: WebServiceConnection">
  <arguments>
    <argument id="connectionName">
      <value class="value" valueClass="string">MyWebService</value>
    </argument>
    <argument id="connectionId">
      <value class="value" valueClass="string">web-service-connection-id</value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">WebServiceConnection</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
  </arguments>
</apiCall>
```

### RestRequest

```xml
<apiCall apiId="com.provar.plugins.bundled.apis.restservice.RestRequest"
         name="RestRequest" testItemId="1"
         title="Web Request (REST): GET /api/users=&gt;RestResponse">
  <arguments>
    <argument id="connectionName">
      <value class="value" valueClass="string">WebServiceConnection</value>
    </argument>
    <argument id="targetValue">
      <value class="value" valueClass="string">GET</value>
    </argument>
    <argument id="resultName">
      <value class="value" valueClass="string">RestResponse</value>
    </argument>
    <argument id="resultScope">
      <value class="value" valueClass="string">Test</value>
    </argument>
    <argument id="statusResultName">
      <value class="value" valueClass="string">RestStatus</value>
    </argument>
    <argument id="restResourceUrl">
      <value class="value" valueClass="string">/api/users</value>
    </argument>
  </arguments>
</apiCall>
```

---

## Value Types Reference

```xml
<!-- String literal -->
<value class="value" valueClass="string">Text content</value>

<!-- Boolean -->
<value class="value" valueClass="boolean">true</value>

<!-- Number -->
<value class="value" valueClass="decimal">123.45</value>

<!-- GUID / record ID — required for connectionId on ApexConnect -->
<value class="value" valueClass="id">74c34c63-ad34-43d9-bb12-cd783bd9bcdd</value>

<!-- Variable reference -->
<value class="variable">
  <path element="VariableName"/>
</value>

<!-- Nested object field access -->
<value class="variable">
  <path element="ObjectName"/>
  <path element="FieldName"/>
</value>

<!-- String concatenation (compound) -->
<value class="compound">
  <parts>
    <value class="value" valueClass="string">Prefix </value>
    <value class="variable">
      <path element="DynamicPart"/>
    </value>
    <value class="value" valueClass="string"> suffix</value>
  </parts>
</value>

<!-- UI wait (use on beforeWait / afterWait) -->
<value class="uiWait" uri="default"/>

<!-- UI wait with custom timeout (use on autoRetry) -->
<value class="uiWait" uri="ui:wait:autoRetry:timeout=10"/>
```

---

## Callable Test Structure

A callable test (used by `CallTest`) declares its interface via `<params>`, `<outputParams>`, `<args>`, and `<outputArgs>` elements. Set `visibility="Internal"` on the `<testCase>` root.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<testCase guid="..." visibility="Internal">
  <summary/>
  <steps>
    <!-- Steps that use input params as variables -->
  </steps>
  <params>
    <param name="LastName" title="Last Name" passwordVariableAllowed="true">
      <summary/>
    </param>
  </params>
  <outputParams>
    <param name="RecordId" title="Record Id" passwordVariableAllowed="true">
      <summary/>
      <sourceValue class="variable">
        <path element="RecordId"/>
      </sourceValue>
    </param>
  </outputParams>
  <args>
    <argument id="LastName"/>
  </args>
  <outputArgs>
    <outputArgument id="RecordId">
      <name class="value" valueClass="string">RecordId</name>
    </outputArgument>
  </outputArgs>
</testCase>
```

---

## Validation Checklist

- [ ] **API IDs** — exact match from the reference table above (no variations, no `<UI4SF:*>` elements)
- [ ] **Connections** — first step is `ApexConnect` or `UiConnect`; `resultName` is referenced consistently by all subsequent steps
- [ ] **`connectionId`** — uses `valueClass="id"` (GUID), not `valueClass="string"`
- [ ] **UI nesting** — `UiDoAction` and `UiAssert` are always inside `<clause name="substeps">` of a `UiWithScreen`
- [ ] **First UiWithScreen** — `navigate` is `Always` or `IfNecessary`, never `Dont`
- [ ] **UiWithScreen on Edit/View with `navigate=Always`** — includes `sfUiTargetObjectId` referencing a variable
- [ ] **UiAssert required arguments** — `columnAssertions`, `pageAssertions`, `resultScope`, `captureAfter`, `beforeWait`, `autoRetry` all present (may be empty)
- [ ] **UiAssert no generatedParameters** — do not add a `<generatedParameters>` block to `UiAssert`
- [ ] **UiConnect arguments** — does NOT include `autoCleanup`, `quickUiLogin`, `closeAllPrimaryTabs`, `alreadyOpenBehaviour`, `lightningMode`, `uiApplicationName`, `cleanupConnectionName`
- [ ] **SOQL** — queries include `SELECT` and `FROM`; include `Id` and `Name`; use `resultListName`
- [ ] **CRUD result capture** — `ApexCreateObject` has `resultIdName`; `ApexReadObject` has `objectId` (variable)
- [ ] **CRUD generator metadata** — `ApexCreateObject`, `ApexReadObject`, `ApexUpdateObject` include `parameterGeneratorUri`, `parameterGeneratorProperties`, and `generatedParameters`
- [ ] **Variable definition** — variables used as `<value class="variable">` are defined by a prior step in scope
- [ ] **Control flow** — `If` has `condition`; `ForEach` has `list` and `valueName`; `WaitFor` has `maxIterations`
- [ ] **SetValues structure** — `values` argument contains `<value class="valueList">` wrapping `<namedValues>` wrapping `<namedValue>` elements
- [ ] **Data types** — booleans are string `"true"`/`"false"` inside `valueClass="boolean"`; numbers use `valueClass="decimal"`
- [ ] **Cleanup** — either `autoCleanup="true"` on the connection, or explicit `ApexDeleteObject` / `TryCatchFinally` finally block
- [ ] **No hallucinated arguments** — see the Common AI Hallucinations table at the top of this doc
