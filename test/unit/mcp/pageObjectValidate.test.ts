import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { validatePageObject } from '../../../src/mcp/tools/pageObjectValidate.js';

const VALID_PO = `package pageobjects;

import com.provar.core.testapi.annotations.*;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

@Page(title = "Account Detail Page")
public class AccountDetailPage {

    @FindBy(xpath = "//input[@name='accountName']")
    @TextType()
    public WebElement accountName;

    @FindBy(css = "[data-testid='save-button']")
    @ButtonType()
    public WebElement saveButton;

}`;

describe('validatePageObject', () => {
  describe('valid Page Object', () => {
    it('returns is_valid=true and score >= 80', () => {
      const r = validatePageObject(VALID_PO, 'AccountDetailPage');
      assert.equal(r.is_valid, true);
      assert.ok(r.quality_score >= 80, `Expected score >= 80, got ${r.quality_score}`);
      assert.equal(r.error_count, 0);
      assert.equal(r.class_name, 'AccountDetailPage');
      assert.equal(r.package_name, 'pageobjects');
      assert.equal(r.field_count, 2);
    });
  });

  describe('package rules', () => {
    it('PO_001: flags missing package declaration', () => {
      const r = validatePageObject('public class MyPage {}');
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_001'), 'Expected PO_001');
      assert.equal(r.is_valid, false);
    });

    it('PO_002: flags invalid package name with uppercase', () => {
      const r = validatePageObject('package PageObjects;\npublic class T {}');
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_002'), 'Expected PO_002');
    });
  });

  describe('class rules', () => {
    it('PO_003: flags missing class declaration', () => {
      const r = validatePageObject('package pageobjects;');
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_003'), 'Expected PO_003');
    });

    it('PO_004: flags non-PascalCase class name', () => {
      const r = validatePageObject('package pageobjects;\npublic class myPage {}');
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_004'), 'Expected PO_004');
    });

    it('PO_006: flags class name mismatch', () => {
      const r = validatePageObject(VALID_PO, 'WrongName');
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_006'), 'Expected PO_006');
    });

    it('PO_060: flags mismatched braces', () => {
      const r = validatePageObject(
        'package pageobjects;\n@Page(title="T") public class T {\n// missing close'
      );
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_060'), 'Expected PO_060');
    });
  });

  describe('field / locator rules', () => {
    it('PO_036: flags CheckboxType (invalid element type)', () => {
      const src = `package pageobjects;
import com.provar.core.testapi.annotations.*;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
@Page(title = "T") public class T {
    @FindBy(xpath = "//input") @CheckboxType() public WebElement f;
}`;
      const r = validatePageObject(src);
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_036'), 'Expected PO_036');
    });

    it('PO_071: flags absolute XPath /html/...', () => {
      const src = `package pageobjects;
import com.provar.core.testapi.annotations.*;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
@Page(title = "T") public class T {
    @FindBy(xpath = "/html/body/div[1]/input") @TextType() public WebElement f;
}`;
      const r = validatePageObject(src);
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_071'), 'Expected PO_071');
    });

    it('PO_072: flags indexed XPath [1]', () => {
      const src = `package pageobjects;
import com.provar.core.testapi.annotations.*;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
@Page(title = "T") public class T {
    @FindBy(xpath = "//div[1]/input") @TextType() public WebElement f;
}`;
      const r = validatePageObject(src);
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_072'), 'Expected PO_072');
    });

    it('PO_073: flags data-aura-rendered-by', () => {
      const src = `package pageobjects;
import com.provar.core.testapi.annotations.*;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
@Page(title = "T") public class T {
    @FindBy(xpath = "//*[@data-aura-rendered-by='123']") @TextType() public WebElement f;
}`;
      const r = validatePageObject(src);
      assert.ok(r.issues.some((i) => i.rule_id === 'PO_073'), 'Expected PO_073');
    });
  });

  describe('score boundaries', () => {
    it('score is never negative', () => {
      const r = validatePageObject('// empty file with nothing valid');
      assert.ok(r.quality_score >= 0);
    });

    it('score is never above 100', () => {
      const r = validatePageObject(VALID_PO);
      assert.ok(r.quality_score <= 100);
    });
  });
});
