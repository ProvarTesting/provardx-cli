/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */

/**
 * Offline, known-correct example test cases bundled with the MCP server.
 *
 * `provar_qualityhub_examples_retrieve` returns these (clearly labelled `bundled`)
 * when no Provar API key is configured, so first-test-case generation in a brand-new
 * project has *some* grounded XML to pattern-match against instead of falling back
 * entirely to model recollection.
 *
 * Every example here is validated by test/unit/mcp/bundledExamples.test.ts, which runs
 * it through the same best-practices + structural validators the server exposes and
 * asserts quality_score === 100 with zero violations. If you add or edit an example,
 * that test guards it against drifting out of correctness — it is what caught the
 * original example using UiConnect / interaction=click / flat field assertions.
 */

export interface BundledExample {
  id: string;
  name: string;
  /** Short scenario key used for lightweight query matching. */
  scenario: string;
  salesforce_object: string;
  keywords: string[];
  xml: string;
}

const UI_CREATE_VALIDATE_ACCOUNT = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<testCase guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e6f" id="1" registryId="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e60" name="Create and verify an Account via the Salesforce UI">
  <summary>Creates an Account through the Salesforce UI (mandatory Name field), saves it, and verifies the Name on the record detail page.</summary>
  <steps>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.testapis.ApexConnect" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e01" name="ApexConnect" testItemId="1" title="Salesforce Connect: MyConnection (Test)">
      <arguments>
        <argument id="connectionName"><value class="value" valueClass="string">MyConnection</value></argument>
        <argument id="resultName"><value class="value" valueClass="string">MyConnection</value></argument>
        <argument id="resultScope"><value class="value" valueClass="string">Test</value></argument>
        <argument id="uiApplicationName"><value class="value" valueClass="string">LightningSales</value></argument>
        <argument id="quickUiLogin"><value class="value" valueClass="boolean">true</value></argument>
        <argument id="reuseConnectionName"/>
        <argument id="webBrowser"/>
        <argument id="closeAllPrimaryTabs"/>
        <argument id="alreadyOpenBehaviour"/>
        <argument id="privateBrowsingMode"/>
        <argument id="enableObjectIdLogging"/>
        <argument id="autoCleanup"/>
        <argument id="cleanupConnectionName"/>
        <argument id="logFileLocation"/>
        <argument id="username"/>
        <argument id="password"/>
        <argument id="securityToken"/>
        <argument id="environment"/>
        <argument id="lightningMode"/>
      </arguments>
    </apiCall>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e02" name="On Account Home screen" testItemId="2" title="On SF Account Home screen">
      <arguments>
        <argument id="uiConnectionName"><value class="value" valueClass="string">MyConnection</value></argument>
        <argument id="target"><value class="uiTarget" uri="sf:ui:target?object=Account&amp;action=ObjectHome"/></argument>
        <argument id="navigate"><value class="value" valueClass="string">Always</value></argument>
        <argument id="targetDescription"><value class="value" valueClass="string">On SF Account Home screen</value></argument>
        <argument id="captureBefore"><value class="value" valueClass="string">false</value></argument>
        <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
        <argument id="windowSelection"/>
        <argument id="windowSize"/>
        <argument id="closeWindow"/>
      </arguments>
      <clauses>
        <clause name="substeps" testItemId="3">
          <steps>
            <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e03" name="Click New" testItemId="4" title="Click the New button">
              <arguments>
                <argument id="locator"><value class="uiLocator" uri="ui:locator?name=New&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DAccount%26action%3DNew"/></argument>
                <argument id="interaction"><value class="uiInteraction" uri="ui:interaction?name=action"/></argument>
                <argument id="interactionDescription"><value class="value" valueClass="string">Click the New button</value></argument>
                <argument id="captureBefore"><value class="value" valueClass="string">false</value></argument>
                <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
                <argument id="beforeWait"/>
                <argument id="afterWait"/>
                <argument id="autoRetry"/>
              </arguments>
            </apiCall>
          </steps>
        </clause>
      </clauses>
    </apiCall>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e04" name="On Account New screen" testItemId="5" title="On SF Account New screen">
      <arguments>
        <argument id="uiConnectionName"><value class="value" valueClass="string">MyConnection</value></argument>
        <argument id="target"><value class="uiTarget" uri="sf:ui:target?object=Account&amp;action=New"/></argument>
        <argument id="navigate"><value class="value" valueClass="string">Dont</value></argument>
        <argument id="sfUiTargetResultName"><value class="value" valueClass="string">NewAccountId</value></argument>
        <argument id="captureBefore"><value class="value" valueClass="string">false</value></argument>
        <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
        <argument id="targetDescription"/>
        <argument id="windowSelection"/>
        <argument id="windowSize"/>
        <argument id="closeWindow"/>
      </arguments>
      <clauses>
        <clause name="substeps" testItemId="6">
          <steps>
            <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e05" name="Set Account Name" testItemId="7" title="Set the Account Name field">
              <arguments>
                <argument id="locator"><value class="uiLocator" uri="ui:locator?name=Name&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DAccount%26field%3DName"/></argument>
                <argument id="interaction"><value class="uiInteraction" uri="ui:interaction?name=set"/></argument>
                <argument id="interactionDescription"><value class="value" valueClass="string">Set the Account Name field</value></argument>
                <argument id="captureBefore"><value class="value" valueClass="string">false</value></argument>
                <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
                <argument id="value"><value class="value" valueClass="string">Provar Automation Account</value></argument>
                <argument id="beforeWait"/>
                <argument id="afterWait"/>
                <argument id="autoRetry"/>
              </arguments>
            </apiCall>
            <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiDoAction" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e06" name="Click Save" testItemId="8" title="Click the Save button">
              <arguments>
                <argument id="locator"><value class="uiLocator" uri="ui:locator?name=save&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DAccount%26action%3Dsave"/></argument>
                <argument id="interaction"><value class="uiInteraction" uri="ui:interaction?name=action"/></argument>
                <argument id="interactionDescription"><value class="value" valueClass="string">Click the Save button</value></argument>
                <argument id="captureBefore"><value class="value" valueClass="string">false</value></argument>
                <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
                <argument id="beforeWait"/>
                <argument id="afterWait"/>
                <argument id="autoRetry"/>
              </arguments>
            </apiCall>
          </steps>
        </clause>
      </clauses>
    </apiCall>
    <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiWithScreen" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e07" name="On Account Detail screen" testItemId="9" title="On SF Account View screen">
      <arguments>
        <argument id="uiConnectionName"><value class="value" valueClass="string">MyConnection</value></argument>
        <argument id="target"><value class="uiTarget" uri="sf:ui:target?object=Account&amp;action=View"/></argument>
        <argument id="navigate"><value class="value" valueClass="string">Dont</value></argument>
        <argument id="targetDescription"><value class="value" valueClass="string">On SF Account View screen</value></argument>
        <argument id="captureBefore"><value class="value" valueClass="string">false</value></argument>
        <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
        <argument id="sfUiTargetObjectId"><value class="variable"><path element="NewAccountId"/></value></argument>
        <argument id="windowSelection"/>
        <argument id="windowSize"/>
        <argument id="closeWindow"/>
      </arguments>
      <clauses>
        <clause name="substeps" testItemId="10">
          <steps>
            <apiCall apiId="com.provar.plugins.forcedotcom.core.ui.UiAssert" guid="7c9e6a10-2b3c-4d5e-8f10-1a2b3c4d5e08" name="Verify Account Name" testItemId="11" title="Verify Account Name">
              <arguments>
                <argument id="fieldAssertions">
                  <value class="valueList" mutable="Mutable">
                    <uiFieldAssertion resultName="Name">
                      <fieldLocator uri="ui:locator?name=Name&amp;binding=sf%3Aui%3Abinding%3Aobject%3Fobject%3DAccount%26field%3DName"/>
                      <attributeAssertions>
                        <uiAttributeAssertion attributeName="value" comparisonType="EqualTo">
                          <value class="value" valueClass="string">Provar Automation Account</value>
                        </uiAttributeAssertion>
                      </attributeAssertions>
                    </uiFieldAssertion>
                  </value>
                </argument>
                <argument id="columnAssertions"><value class="valueList" mutable="Mutable"/></argument>
                <argument id="pageAssertions"><value class="valueList" mutable="Mutable"/></argument>
                <argument id="resultName"><value class="value" valueClass="string">AccountNameAssertion</value></argument>
                <argument id="resultScope"><value class="value" valueClass="string">Test</value></argument>
                <argument id="captureAfter"><value class="value" valueClass="string">false</value></argument>
                <argument id="beforeWait"/>
                <argument id="autoRetry"/>
              </arguments>
            </apiCall>
          </steps>
        </clause>
      </clauses>
    </apiCall>
  </steps>
</testCase>
`;

export const BUNDLED_EXAMPLES: BundledExample[] = [
  {
    id: 'bundled-ui-create-validate-account',
    name: 'Create and verify an Account via the Salesforce UI',
    scenario: 'ui-create-validate',
    salesforce_object: 'Account',
    keywords: ['ui', 'create', 'new', 'account', 'validate', 'verify', 'assert', 'save', 'record', 'detail'],
    xml: UI_CREATE_VALIDATE_ACCOUNT,
  },
];

export interface BundledExampleResult {
  id: string;
  name: string;
  xml: string;
  similarity_score: number;
  salesforce_object: string;
  quality_tier: string;
  full_content: boolean;
  source: 'bundled';
}

/**
 * Pick up to `n` bundled examples for a query, ranked by keyword overlap.
 *
 * Relevance-gated: an example with ZERO keyword overlap is not returned. The bundle
 * is small and Salesforce-UI shaped, so answering a REST, database or NitroX query
 * with an unrelated Account UI example is worse than answering honestly with nothing
 * — the caller pattern-matches whatever it is handed. An empty result routes the
 * caller to provar_step_schema instead, which does cover those step types.
 *
 * `similarity_score` is a keyword-overlap proxy, NOT the corpus's cosine similarity.
 * It is reported on the same field for shape compatibility but deliberately capped
 * below 1 so it can never outrank a real corpus match if the two are ever merged.
 */
export function selectBundledExamples(query: string, n?: number): BundledExampleResult[] {
  const q = query.toLowerCase();
  // Tolerate a missing/invalid n (callers that bypass the tool's zod default): return all.
  const limit = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : BUNDLED_EXAMPLES.length;
  const scored = BUNDLED_EXAMPLES.map((ex) => ({
    ex,
    hits: ex.keywords.filter((k) => q.includes(k)).length,
  }))
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits);

  return scored.slice(0, Math.max(0, limit)).map(({ ex, hits }) => ({
    id: ex.id,
    name: ex.name,
    xml: ex.xml,
    similarity_score: Math.min(0.95, 0.5 + hits * 0.05),
    salesforce_object: ex.salesforce_object,
    quality_tier: 'bundled',
    full_content: true,
    source: 'bundled',
  }));
}
