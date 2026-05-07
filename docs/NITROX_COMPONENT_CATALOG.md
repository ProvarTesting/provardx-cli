# NitroX Component Package Catalog

Shipped base NitroX (Hybrid Model) component packages.
Use as a reference when generating new NitroX components — match naming conventions,
type strings, tagNames, interaction titles, and attribute names from these shipped packages.

---

## common (v1.8.21)

Package includes definitions for Generic Fact Component
**Requires Provar:** >=2.10.2

### Components

#### Generic Component

- **name:** `json::/com/provar/common/GenericComponent`
- **type:** `container/genericComponent`
- **tagName:** `*`
- **interactions:** `Clear`, `Set`, `Check`, `Uncheck`, `Click`
- **attributes:** `Class`, `Visible`, `Disabled`, `Name`, `Label`, `Type`, `Checked`, `Required`, `Read only`, `Max length`, `Min length`, `Href`, `Value`

---

## experienceCloud (v1.0.7)

Package includes definitions for Experience Cloud FACT elements
**Requires Provar:** >=2.10.2

### Components

#### Community Leaderboard Item

- **name:** `json::/com/provar/experienceCloud/CommunityLeaderboardItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Click`
- **attributes:** `Class`
- **child elements:** 2

#### CheckBox

- **name:** `json::/com/provar/experienceCloud/ExpCloudCheckBox`
- **type:** `Checkbox`
- **tagName:** `div`
- **interactions:** `Check`, `Uncheck`
- **attributes:** `Class`, `Value`

#### Lookup List

- **name:** `json::/com/provar/experienceCloud/ExpCloudLookupList`
- **type:** `container`
- **tagName:** `a`
- **interactions:** `Click`
- **attributes:** `Name`, `Type`, `Text`, `Class`, `Href`

#### PickList

- **name:** `json::/com/provar/experienceCloud/ExpCloudPickList`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`, `Set By Index`
- **attributes:** `Class`, `Value`

#### Rich Text Area

- **name:** `json::/com/provar/experienceCloud/ExpCloudRichTextArea`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Clear`, `Set`
- **attributes:** `Class`, `Value`

#### Profile Menu

- **name:** `json::/com/provar/experienceCloud/UserProfileMenu`
- **type:** `container`
- **tagName:** `community_user-user-profile-menu`
- **interactions:** `Set`, `Set By Index`, `Click`
- **attributes:** `Class`, `Username`, `Is guest user`, `Login button text`, `Menu Items`

---

## html5 (v1.8.11)

Package includes definitions for HTML5 FACT elements
**Requires Provar:** >=2.10.2

### Components

#### HTML5 Anchor Object

- **name:** `json::/com/provar/html5/AnchorObject`
- **type:** `container`
- **tagName:** `a`
- **interactions:** `Click`
- **attributes:** `Name`, `Visible`, `Type`, `Text`, `Class`, `Href`

#### HTML5 Button

- **name:** `json::/com/provar/html5/Button`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Click`
- **attributes:** `Disabled`, `Visible`, `Text Content`, `Inner Text`, `Label`, `Name`, `Type`, `Title`, `Aria Label`

#### HTML5 Button Input

- **name:** `json::/com/provar/html5/ButtonInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Click`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Name`, `Type`

#### HTML5 Checkbox Input

- **name:** `json::/com/provar/html5/CheckboxInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Check`, `Uncheck`
- **attributes:** `Disabled`, `Name`, `Visible`, `Type`, `Checked`, `Required`, `Read only`

#### HTML5 Color Input

- **name:** `json::/com/provar/html5/ColorInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Name`, `Type`, `Value`

#### HTML5 Date Input

- **name:** `json::/com/provar/html5/DateInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`, `Set Date`
- **attributes:** `Disabled`, `Visible`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Min`, `Max`, `Validation Message`, `Class`

#### HTML5 Datetime-local Input

- **name:** `json::/com/provar/html5/DatetimeLocalInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`, `Set Date Time`
- **attributes:** `Disabled`, `Visible`, `Name`, `Pattern`, `Class`, `Placeholder`, `Read only`, `Required`, `Type`, `Validation Message`, `Value`, `Max`, `Min`

#### HTML5 Div

- **name:** `json::/com/provar/html5/Division`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Click`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Email Input

- **name:** `json::/com/provar/html5/EmailInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Max length`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Class`

#### HTML5 File Input

- **name:** `json::/com/provar/html5/FileInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Upload Files`
- **attributes:** `Disabled`, `Visible`, `Name`, `Type`, `Value`

#### HTML5 Footer

- **name:** `json::/com/provar/html5/Footer`
- **type:** `container`
- **tagName:** `footer`
- **attributes:** `Class`, `Value`

#### HTML5 Form

- **name:** `json::/com/provar/html5/Form`
- **type:** `container`
- **tagName:** `form`
- **attributes:** `Class`, `Name`, `Id`, `Value`

#### HTML5 Header

- **name:** `json::/com/provar/html5/Header`
- **type:** `container`
- **tagName:** `header`
- **attributes:** `Class`, `Value`

#### HTML5 Heading1

- **name:** `json::/com/provar/html5/Header1`
- **type:** `container`
- **tagName:** `h1`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Heading2

- **name:** `json::/com/provar/html5/Header2`
- **type:** `container`
- **tagName:** `h2`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Heading3

- **name:** `json::/com/provar/html5/Header3`
- **type:** `container`
- **tagName:** `h3`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Heading4

- **name:** `json::/com/provar/html5/Header4`
- **type:** `container`
- **tagName:** `h4`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Heading5

- **name:** `json::/com/provar/html5/Header5`
- **type:** `container`
- **tagName:** `h5`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Heading6

- **name:** `json::/com/provar/html5/Header6`
- **type:** `container`
- **tagName:** `h6`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Iframe

- **name:** `json::/com/provar/html5/IFrame`
- **type:** `iframe`
- **tagName:** `iframe`
- **attributes:** `Id`, `Name`

#### HTML5 Image

- **name:** `json::/com/provar/html5/Image`
- **type:** `container`
- **tagName:** `img`
- **attributes:** `Name`, `Visible`, `Source`, `Width`, `Alternate`, `Class`

#### HTML5 Image Input

- **name:** `json::/com/provar/html5/ImageInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Click`
- **attributes:** `Disabled`, `Visible`, `Name`, `Type`, `Value`, `Source`, `Width`

#### HTML5 Label

- **name:** `json::/com/provar/html5/Label`
- **type:** `container`
- **tagName:** `label`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Legend

- **name:** `json::/com/provar/html5/Legend`
- **type:** `container`
- **tagName:** `legend`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 List Item

- **name:** `json::/com/provar/html5/ListItem`
- **type:** `container`
- **tagName:** `li`
- **attributes:** `Visible`, `Class`

#### HTML5 Main

- **name:** `json::/com/provar/html5/Main`
- **type:** `container`
- **tagName:** `main`
- **attributes:** `Class`, `Value`

#### HTML5 Number Input

- **name:** `json::/com/provar/html5/NumberInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Min`, `Max`, `Name`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Class`

#### HTML5 P

- **name:** `json::/com/provar/html5/Paragraph`
- **type:** `container`
- **tagName:** `p`
- **attributes:** `Class`, `Visible`, `Text content`, `Value`

#### HTML5 Password Input

- **name:** `json::/com/provar/html5/PasswordInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Max length`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Class`

#### HTML5 Radio

- **name:** `json::/com/provar/html5/RadioInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Check`
- **attributes:** `Disabled`, `Visible`, `Name`, `Type`, `Checked`, `Required`

#### HTML5 Range Input

- **name:** `json::/com/provar/html5/RangeInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`, `Set Range Value`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Name`, `Type`, `Value`, `Max`, `Min`, `Step`

#### HTML5 Reset

- **name:** `json::/com/provar/html5/ResetInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Click`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Name`, `Type`, `Class`, `Value`

#### HTML5 Search Input

- **name:** `json::/com/provar/html5/SearchInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Max length`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Class`

#### HTML5 Section

- **name:** `json::/com/provar/html5/Section`
- **type:** `container`
- **tagName:** `section`
- **attributes:** `Class`, `Value`

#### HTML5 Select

- **name:** `json::/com/provar/html5/Select`
- **type:** `container`
- **tagName:** `select`
- **interactions:** `Set`, `Set By Index`
- **attributes:** `Class`, `Visible`, `Value`, `Selected Index`, `Disabled`, `Name`, `Required`

#### HTML5 Span

- **name:** `json::/com/provar/html5/Span`
- **type:** `container`
- **tagName:** `span`
- **interactions:** `Click`
- **attributes:** `Class`, `Visible`, `Value`

#### HTML5 Submit

- **name:** `json::/com/provar/html5/SubmitInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Click`
- **attributes:** `Disabled`, `Visible`, `Name`, `Validation Message`, `Type`, `Class`, `Value`

#### HTML5 Telephone Input

- **name:** `json::/com/provar/html5/TelephoneInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Disabled`, `Visible`, `Min length`, `Max length`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Validation Message`, `Type`, `Value`, `Class`

#### HTML5 Textarea

- **name:** `json::/com/provar/html5/Textarea`
- **type:** `container`
- **tagName:** `textarea`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Disabled`, `Visible`, `Text Content`, `innerText`, `Name`, `Type`, `Min length`, `Max length`, `Rows`, `Columns`, `Placeholder`, `Read only`, `Required`, `Value`, `Class`

#### HTML5 Text Input

- **name:** `json::/com/provar/html5/TextInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Disabled`, `Visible`, `Validation Message`, `Min length`, `Max length`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Class`

#### HTML5 Time Input

- **name:** `json::/com/provar/html5/TimeInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Name`, `Validation Message`, `Read only`, `Required`, `Type`, `Value`, `Max`, `Min`, `Class`

#### HTML5 Unordered List

- **name:** `json::/com/provar/html5/UnorderedList`
- **type:** `container`
- **tagName:** `ul`
- **attributes:** `Visible`, `Class`

#### HTML5 Url Input

- **name:** `json::/com/provar/html5/UrlInput`
- **type:** `container`
- **tagName:** `input`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Max length`, `Name`, `Pattern`, `Placeholder`, `Read only`, `Required`, `Type`, `Value`, `Class`

---

## msdynamics (v1.0.3)

Package includes definitions for Microsoft Dynamics
**Requires Provar:** >=2.10.2

### Components

#### MS Dynamics Abstract Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/AbstractFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Click`
- **attributes:** `Field Name`, `Label`, `Value`, `Required`, `Read Only`, `Message`

#### MS Dynamics Attach File Button

- **name:** `json::/nitroXPackages/ms-dynamics/AttachFileButton`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Activate`, `Attach File`
- **attributes:** `Label`

#### MS Dynamics Currency Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/CurrencyFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### MS Dynamics Date/Time Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/DateTimeFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`, `Clear`

#### MS Dynamics Decimal Number Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/DecimalNumberFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### MS Dynamics Dialog Button

- **name:** `json::/nitroXPackages/ms-dynamics/DialogButton`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Click`
- **attributes:** `The buttons's label`

#### MS Dynamics Email Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/EmailFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### MS Dynamics Flip Switch Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/FlipSwitchFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Toggle`, `Check`, `Unheck`
- **attributes:** `Switch Value`, `Switch Label`

#### MS Dynamics Flyout Menu item

- **name:** `json::/nitroXPackages/ms-dynamics/FlyoutMenuItem`
- **type:** `container`
- **tagName:** `button,li`
- **interactions:** `Click`, `Locate`
- **attributes:** `Label`

#### MS Dynamics Form Command

- **name:** `json::/nitroXPackages/ms-dynamics/FormCommand`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Click`, `Locate`
- **attributes:** `Label`

#### MS Dynamics Grid Command

- **name:** `json::/nitroXPackages/ms-dynamics/GridCommand`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Click`, `Locate`
- **attributes:** `The command's label.`

#### MS Dynamics Grid Filter

- **name:** `json::/nitroXPackages/ms-dynamics/GridFilter`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`
- **attributes:** `Filter Type`, `Value`

#### MS Dynamics Header Fields Flyout

- **name:** `json::/nitroXPackages/ms-dynamics/HeaderFieldsFlyout`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Activate`

#### MS Dynamics Qualify Lead Dialog

- **name:** `json::/nitroXPackages/ms-dynamics/LeadQualifyDialog`
- **type:** `container`
- **tagName:** `div`

#### MS Grid Control

- **name:** `json::/nitroXPackages/ms-dynamics/LegacyGrid`
- **type:** `table`
- **tagName:** `div`
- **attributes:** `Entity Display Name`, `Entity Type`, `Columns`, `Column Labels`, `ColumnsFields`, `Row Values`

#### Grid Column

- **name:** `json::/nitroXPackages/ms-dynamics/LegacyGridColumn`
- **type:** `abstract`
- **tagName:** `div`
- **interactions:** `Click`
- **attributes:** `Column Name`, `Label`, `Value`, `Column Type`, `Cell Type`

#### Text Column

- **name:** `json::/nitroXPackages/ms-dynamics/LegacyGridTextColumn`
- **type:** `column`

#### MS Dynamics Navigation Bar

- **name:** `json::/nitroXPackages/ms-dynamics/NavigationBar`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Locate`

#### MS Dynamics Option Set Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/OptionSetFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### MS Dynamics Page Section

- **name:** `json::/nitroXPackages/ms-dynamics/PageSection`
- **type:** `container`
- **tagName:** `section`
- **attributes:** `Title`

#### MS Dynamics Phone Number Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/PhoneNumberFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### MS Dynamics Confirm Dialog

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsConfirmDialog`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Confirm`, `Cancel`
- **attributes:** `Title`, `Subtitle`, `Message text`, `Confirm button label`, `Cancel button label`

#### MS Power Apps Grid Control

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGrid`
- **type:** `table`
- **tagName:** `div`
- **attributes:** `Entity Display Name`, `Entity Type`, `Columns`, `Column Labels`, `ColumnsFields`, `ROW Number`, `CheckBox Column`, `Row Values`

#### Checkbox Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridCheckboxColumn`
- **type:** `column`
- **tagName:** `div`
- **interactions:** `Check`, `Uncheck`, `Select All Rows`, `Un-Select All Rows`

#### MS Power Apps Grid Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridColumn`
- **type:** `abstract`
- **tagName:** `div,span`
- **interactions:** `Click`
- **attributes:** `Column Name`, `Data Type`, `Data Format`, `Label`, `Value`, `Column Type`, `Cell Type`

#### Currency Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridCurrencyColumn`
- **type:** `column`

#### Date Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridDateColumn`
- **type:** `column`

#### DateTime Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridDateTimeColumn`
- **type:** `column`

#### Decimal Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridDecimalColumn`
- **type:** `column`

#### Email Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridEmailColumn`
- **type:** `column`

#### Integer Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridIntegerColumn`
- **type:** `column`

#### Lookup Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridLookupColumn`
- **type:** `column`

#### OptionSet Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridOptionSetColumn`
- **type:** `column`

#### Phone Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridPhoneColumn`
- **type:** `column`

#### Text Column

- **name:** `json::/nitroXPackages/ms-dynamics/PowerAppsGridTextColumn`
- **type:** `column`

#### MS Dynamics Process Bread Crumb Stage

- **name:** `json::/nitroXPackages/ms-dynamics/ProcessBreadCrumbStage`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Activate`
- **attributes:** `Stage Title`, `Stage's GUID'`

#### MS Dynamics Quick Create Button

- **name:** `json::/nitroXPackages/ms-dynamics/QuickCreateButton`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Click`, `Click and Confirm`
- **attributes:** `Label`

#### MS Dynamics Quick Create Menu Item

- **name:** `json::/nitroXPackages/ms-dynamics/QuickCreateMenuItem`
- **type:** `container`
- **tagName:** `button`
- **interactions:** `Click`, `Locate`
- **attributes:** `Label`

#### MS Dynamics Related Entity Menu Item

- **name:** `json::/nitroXPackages/ms-dynamics/RelatedEntityMenuItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Click`, `Locate`
- **attributes:** `The item's label`

#### MS Dynamics Related Entity Tab

- **name:** `json::/nitroXPackages/ms-dynamics/RelatedEntityTabPanel`
- **type:** `container`
- **tagName:** `li,div`
- **interactions:** `Activate`, `Locate`
- **attributes:** `Title`, `Selected`, `Tab Name`

#### MS Dynamics Rich Text Editor

- **name:** `json::/nitroXPackages/ms-dynamics/RichTextEditor`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set Text`, `Clear`, `Insert Text`
- **attributes:** `Label`, `Value`

#### MS Dynamics Selection Tree Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/SelectionTreeFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`, `Clear`

#### MS Dynamics Simple Lookup Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/SimpleLookupFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`, `Clear`, `New`

#### MS Dynamics Site Map Group Area

- **name:** `json::/nitroXPackages/ms-dynamics/SiteMapAreaGroup`
- **type:** `container`
- **tagName:** `lix`
- **attributes:** `Label`

#### MS Dynamics Site Map Entity

- **name:** `json::/nitroXPackages/ms-dynamics/SiteMapEntity`
- **type:** `container`
- **tagName:** `li`
- **interactions:** `Click`
- **attributes:** `Label`

#### MS Dynamics Site Map Group Area

- **name:** `json::/nitroXPackages/ms-dynamics/SiteMapEntityAreaGroup`
- **type:** `container`
- **tagName:** `li`
- **interactions:** `Click`
- **attributes:** `Label`

#### MS Dynamics Site Pinned Group

- **name:** `json::/nitroXPackages/ms-dynamics/SiteMapEntityPinnedGroup`
- **type:** `container`
- **tagName:** `li,div`
- **interactions:** `Activate`
- **attributes:** `Label`

#### MS Dynamics Site Recent Group

- **name:** `json::/nitroXPackages/ms-dynamics/SiteMapEntityRecentGroup`
- **type:** `container`
- **tagName:** `li,div`
- **interactions:** `Activate`
- **attributes:** `Label`

#### MS Dynamics Tab

- **name:** `json::/nitroXPackages/ms-dynamics/TabPanel`
- **type:** `container`
- **tagName:** `li,div`
- **interactions:** `Activate`, `Locate`
- **attributes:** `Title`, `Accessibility Label`, `Selected`, `Tab Name`

#### MS Dynamics Text Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/TextFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### MS Dynamics Whole Number Field Section Item

- **name:** `json::/nitroXPackages/ms-dynamics/WholeNumberFieldSectionItem`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Set`

#### Ms Dynamics Column

- **name:** `json::/nitroXPackages/ms-dynamics/WorkListColumn`
- **type:** `Column`
- **tagName:** `xxx`
- **interactions:** `Click`
- **attributes:** `Column Name`, `Label`, `Value`, `Column Type`, `Cell Type`

#### MS Work List

- **name:** `json::/nitroXPackages/ms-dynamics/WorkListTable`
- **type:** `table`
- **tagName:** `div`
- **attributes:** `Columns`, `Column Key`, `ColumnsData`, `Row Values`, `Row Count`, `CheckBox Column`

#### Text Column

- **name:** `json::/nitroXPackages/ms-dynamics/WorkListTextColumn`
- **type:** `column`
- **tagName:** `div`

---

## omnistudio (v1.0.0)

Package includes definitions for Omnistudio FACT elements
**Requires Provar:** >=2.10.2

### Components

#### Omnistudio Select

- **name:** `json::/com/provar/omnistudio/OmnistudioSelect`
- **type:** `container`
- **tagName:** `omnistudio-omniscript-select`
- **interactions:** `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Options`, `Label`, `Message`, `Name`, `Placeholder`, `Value Label`, `Read only`, `Required`, `Options`, `Options List`, `Value`
- **child elements:** 2

---

## runtimeOmnistudio (v1.0.0)

Package includes definitions for Runtime Omnistudio FACT elements
**Requires Provar:** >=2.10.2

### Components

#### Runtime Omnistudio Radio

- **name:** `json::/com/provar/runtimeOmnistudio/RuntimeOmnistudioRadio`
- **type:** `container`
- **tagName:** `runtime_omnistudio_omniscript-omniscript-radio`
- **interactions:** `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Required`, `Value`, `Type`

---

## salesforce-lwc (v1.9.23)

Package includes definitions for Salesforce Lightning Web Components FACT elements
**Requires Provar:** >=2.10.2

### Components

#### CheckBox Column

- **name:** `json::/com/provar/salesforce/lwc/CheckBoxColumn`
- **type:** `container`
- **tagName:** `*`
- **interactions:** `Check`, `Uncheck`, `Select All Rows`, `Un-Select All Rows`

#### Currency Column

- **name:** `json::/com/provar/salesforce/lwc/CurrencyColumn`
- **type:** `container`
- **tagName:** `*`
- **attributes:** `Format style`

#### Date Column

- **name:** `json::/com/provar/salesforce/lwc/DateColumn`
- **type:** `container`
- **tagName:** `*`
- **interactions:** ` Inline Edit setDate`
- **attributes:** `Day`, `Era`, `Hour`, `Hour12`, `Minute`, `Month`, `Second`, `Weekday`, `Year`

#### Lightning Accordion

- **name:** `json::/com/provar/salesforce/lwc/LightningAccordion`
- **type:** `container`
- **tagName:** `lightning-accordion`

#### Lightning Accordion Section

- **name:** `json::/com/provar/salesforce/lwc/LightningAccordionSection`
- **type:** `container`
- **tagName:** `lightning-accordion-section`
- **interactions:** `Activate`, `Expand Section`, `Collapse Section`
- **attributes:** `Label`, `Name`, `Visible`
- **child elements:** 1

#### Lightning Address Input

- **name:** `json::/com/provar/salesforce/lwc/LightningAddressInput`
- **type:** `container`
- **tagName:** `lightning-input-address`
- **interactions:** `Set`, `Set Street`, `Set City`, `Set Province`, `Set Country`, `Set Postal Code`
- **attributes:** `Address label`, `Address lookup placeholder`, `City`, `City label`, `City placeholder`, `Country`, `Country disabled`, `Country label`, `Country options`, `Country placeholder`, `Disabled`, `Field level help`, `Postal code`, `Postal code label`, `Postal code placeholder`, `Province`, `Province label`, `Province options`, `Province placeholder`, `Read only`, `Required`, `Show address lookup`, `Street`, `Street label`, `Street placeholder`, `Visible`
- **child elements:** 14

#### Lightning Button

- **name:** `json::/com/provar/salesforce/lwc/LightningButton`
- **type:** `container`
- **tagName:** `lightning-button`
- **interactions:** `Click`
- **attributes:** `Icon name`, `Label`, `Name`, `Title`, `Class`, `Variant`, `Disabled`, `Visible`

#### Lightning Button Group

- **name:** `json::/com/provar/salesforce/lwc/LightningButtonGroup`
- **type:** `container`
- **tagName:** `lightning-button-group`

#### Lightning Button Icon

- **name:** `json::/com/provar/salesforce/lwc/LightningButtonIcon`
- **type:** `container`
- **tagName:** `lightning-button-icon`
- **interactions:** `Click`
- **attributes:** `Icon name`, `Alternative Text`, `Tooltip`, `Name`, `Title`, `Class`, `Disabled`, `Variant`, `Size`, `Visible`

#### Lightning Button Icon Stateful

- **name:** `json::/com/provar/salesforce/lwc/LightningButtonIconStateful`
- **type:** `container`
- **tagName:** `lightning-button-icon-stateful`
- **interactions:** `Toggle On`, `Toggle Off`, `Toggle`
- **attributes:** `Name`, `Title`, `Icon name`, `Alternative Text`, `Size`, `Disabled`, `Class`, `Selected`, `Variant`, `Visible`

#### Lightning Button Menu

- **name:** `json::/com/provar/salesforce/lwc/LightningButtonMenu`
- **type:** `container`
- **tagName:** `lightning-button-menu`
- **interactions:** `Click`, `Activate`
- **attributes:** `Value`, `Label`, `Tooltip`, `Access key`, `Title`, `Icon name`, `Icon Size`, `Visible`

#### Lightning Button Stateful

- **name:** `json::/com/provar/salesforce/lwc/LightningButtonStateful`
- **type:** `container`
- **tagName:** `lightning-button-stateful`
- **interactions:** `Toggle On`, `Toggle Off`, `Toggle`
- **attributes:** `Icon name when hover`, `Icon name when off`, `Icon name when on`, `Label when hover`, `Label when off`, `Label when on`, `Disabled`, `Class`, `Selected`, `Variant`, `Visible`

#### Lightning Card

- **name:** `json::/com/provar/salesforce/lwc/LightningCard`
- **type:** `container`
- **tagName:** `lightning-card`
- **attributes:** `Title`, `Icon name`, `Class`, `Visible`
- **child elements:** 1

#### Lightning Checkbox Button Input

- **name:** `json::/com/provar/salesforce/lwc/LightningCheckboxButtonInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Check`, `Uncheck`, `Toggle`
- **attributes:** `Name`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Checked`, `Type`, `Message`, `Visible`
- **child elements:** 2

#### Lightning Checkbox Group

- **name:** `json::/com/provar/salesforce/lwc/LightningCheckboxGroup`
- **type:** `container`
- **tagName:** `lightning-checkbox-group`
- **interactions:** `Check`, `Uncheck`
- **attributes:** `Name`, `Label`, `Disabled`, `Class`, `Required`, `Message when value missing`, `Visible`
- **child elements:** 2

#### Lightning Checkbox Input

- **name:** `json::/com/provar/salesforce/lwc/LightningCheckboxInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Check`, `Uncheck`, `Toggle`, `Set`
- **attributes:** `Name`, `Label`, `Disabled`, `Class`, `Required`, `Checked`, `Type`, `Visible`
- **child elements:** 2

#### Lightning Column

- **name:** `json::/com/provar/salesforce/lwc/LightningColumn`
- **type:** `Column`
- **tagName:** `*`
- **interactions:** `Sort Column`, `Wrap Text`, ` Inline Edit set`, `Append Inline Edit`, `Clear Inline Edit`, `Clip Text`
- **attributes:** `Column Key`, `Label`, `Value`, `Column Type`, `Cell Type`

#### Lightning Combobox

- **name:** `json::/com/provar/salesforce/lwc/LightningCombobox`
- **type:** `container`
- **tagName:** `lightning-combobox`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Field level help`, `Label`, `Options`, `Options List`, `Message`, `Name`, `Placeholder`, `Read only`, `Required`, `Value Label`, `Value`, `Visible`
- **child elements:** 2

#### Lightning Datatable

- **name:** `json::/com/provar/Table/LightningDatatable`
- **type:** `table`
- **tagName:** `lightning-datatable`
- **attributes:** `Columns`, `ColumnsFields`, `ROW Number`, `CheckBox Column`

#### Lightning Date Input

- **name:** `json::/com/provar/salesforce/lwc/LightningDateInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`, `Set Date`, `Set Today`
- **attributes:** `Name`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Min`, `Max`, `Value`, `Formatted Value`, `Placeholder`, `Type`, `Message`, `Visible`
- **child elements:** 2

#### Lightning Date Time Input

- **name:** `json::/com/provar/salesforce/lwc/LightningDateTimeInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`, `Set Now`, `Set Date and Time`, `Set Date`, `Set Time`
- **attributes:** `Name`, `Label`, `Disabled`, `Visible`, `Read only`, `Class`, `Required`, `Min`, `Max`, `Value`, `Type`, `Timezone`, `Message`, `Formatted Time Value`, `Formatted Date Value`
- **child elements:** 6

#### Lightning Dual Listbox

- **name:** `json::/com/provar/salesforce/lwc/LightningDualListbox`
- **type:** `container`
- **tagName:** `lightning-dual-listbox`
- **interactions:** `Set`
- **attributes:** `Add button label`, `Visible`, `Disable reordering`, `Disabled`, `Down button label`, `Field level help`, `Label`, `Max`, `Message when range overflow`, `Message when range underflow`, `Message when value missing`, `Min`, `Name`, `Remove button label`, `Required`, `Selected label`, `Source label`, `Up button label`, `Value`, `Required options`
- **child elements:** 6

#### Lightning Email Input

- **name:** `json::/com/provar/salesforce/lwc/LightningEmailInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Multiple`, `Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Lightning File Input

- **name:** `json::/com/provar/salesforce/lwc/LightningFileInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Upload Files`
- **attributes:** `Accepted File Types`, `Visible`, `Disabled`, `Label`, `Multiple Files Allowed`, `Name`, `Message`

#### Lightning File Upload

- **name:** `json::/com/provar/salesforce/lwc/LightningFileUpload`
- **type:** `container`
- **tagName:** `lightning-file-upload`
- **interactions:** `Upload Files`
- **attributes:** `Accepted File Types`, `Visible`, `Disabled`, `Label`, `Multiple Files Allowed`, `Name`, `Message`

#### Lightning Formatted Address

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedAddress`
- **type:** `container`
- **tagName:** `lightning-formatted-address`
- **interactions:** `Click`
- **attributes:** `City`, `Visible`, `Country`, `Disabled`, `Latitude`, `Longitude`, `Postal Code`, `Province`, `Show static map`, `Street`

#### Lightning Formatted Date Time

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedDateTime`
- **type:** `container`
- **tagName:** `lightning-formatted-date-time`
- **attributes:** `Day`, `Visible`, `Era`, `Hour`, `Hour12`, `Minute`, `Month`, `Second`, `Value`, `Weekday`, `Year`

#### Lightning Formatted Email

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedEmail`
- **type:** `container`
- **tagName:** `lightning-formatted-email`
- **interactions:** `Click`
- **attributes:** `Value`, `Visible`, `Label`, `Hide-icon`

#### Lightning Formatted Lookup

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedLookup`
- **type:** `container`
- **tagName:** `lightning-formatted-lookup`
- **interactions:** `Click`
- **attributes:** `Visible`, `Display value`

#### Lightning Formatted Name

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedName`
- **type:** `container`
- **tagName:** `lightning-formatted-name`
- **attributes:** `Salutation`, `Visible`, `First Name`, `Middle Name`, `Last Name`, `Suffix`, `Informal Name`, `Format`, `Inner Text`

#### Lightning Formatted Number

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedNumber`
- **type:** `container`
- **tagName:** `lightning-formatted-number`
- **attributes:** `Value`, `Visible`, `Inner text`, `Format style`, `Currency code`, `Currency display as`, `Maximum fraction digits`, `Maximum significant digits`, `Minimum fraction digits`, `Minimum integer digits`, `Minimum significant digits`

#### Lightning Formatted Phone

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedPhone`
- **type:** `container`
- **tagName:** `lightning-formatted-phone`
- **attributes:** `Value`, `Visible`, `Disabled`

#### Lightning Formatted Rich Text

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedRichText`
- **type:** `container`
- **tagName:** `lightning-formatted-rich-text`
- **attributes:** `Value`, `Visible`, `Text Content`, `innerText`

#### Lightning Formatted Text

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedText`
- **type:** `container`
- **tagName:** `lightning-formatted-text`
- **interactions:** `Click`
- **attributes:** `Value`, `Visible`, `Linkify`

#### Lightning Formatted Url

- **name:** `json::/com/provar/salesforce/lwc/LightningFormattedUrl`
- **type:** `container`
- **tagName:** `lightning-formatted-url`
- **interactions:** `Click`
- **attributes:** `Value`, `Visible`, `Label`, `Tooltip`

#### Lightning Grouped Combobox

- **name:** `json::/com/provar/salesforce/lwc/LightningGroupedCombobox`
- **type:** `container`
- **tagName:** `lightning-grouped-combobox`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Field level help`, `Label`, `Message`, `Name`, `Placeholder`, `Read only`, `Required`, `Value Label`, `Value`
- **child elements:** 2

#### Lightning Helptext

- **name:** `json::/com/provar/salesforce/lwc/LightningHelptext`
- **type:** `container`
- **tagName:** `lightning-helptext`
- **interactions:** `Hover`
- **attributes:** `Content`, `Visible`, `Icon name`

#### Lightning Icon

- **name:** `json::/com/provar/salesforce/lwc/LightningIcon`
- **type:** `container`
- **tagName:** `lightning-icon`
- **interactions:** `Click`
- **attributes:** `Icon name`, `Visible`, `Title`, `Class`, `Size`

#### Lightning Input Field

- **name:** `json::/com/provar/salesforce/lwc/LightningInputField`
- **type:** `container`
- **tagName:** `lightning-input-field`
- **attributes:** `Field name`

#### Lightning Layout

- **name:** `json::/com/provar/salesforce/lwc/LightningLayout`
- **type:** `container`
- **tagName:** `lightning-layout`

#### Lightning Layout Item

- **name:** `json::/com/provar/salesforce/lwc/LightningLayoutItem`
- **type:** `container`
- **tagName:** `lightning-layout-item`

#### Lightning Location Input

- **name:** `json::/com/provar/salesforce/lwc/LightningLocationInput`
- **type:** `container`
- **tagName:** `lightning-input-location`
- **interactions:** `Set`, `Set Latitude`, `Set Longitude`
- **attributes:** `Label`, `Visible`, `Disabled`, `Read only`, `Class`, `Required`, `Field level help`, `Latitude`, `Longitude`
- **child elements:** 5

#### Lightning Lookup

- **name:** `json::/com/provar/salesforce/lwc/LightningLookup`
- **type:** `container`
- **tagName:** `lightning-lookup`
- **interactions:** `Set`, `Show All Results`
- **attributes:** `Field name`, `Class`, `Visible`, `Disabled`, `Label`, `Required`, `Value`, `Text Value`

#### Lightning Lookup Address

- **name:** `json::/com/provar/salesforce/lwc/LightningLookupAddress`
- **type:** `container`
- **tagName:** `lightning-lookup-address`
- **interactions:** `Enter and Select`
- **attributes:** `Disabled`, `Visible`, `Placeholder`

#### Lightning Menu Item

- **name:** `json::/com/provar/salesforce/lwc/LightningMenuItem`
- **type:** `container`
- **tagName:** `lightning-menu-item`
- **interactions:** `Click`, `Deactivate`
- **attributes:** `Checked`, `Visible`, `Disabled`, `Download`, `Href`, `Icon name`, `Label`, `Value`

#### Lightning Number Input

- **name:** `json::/com/provar/salesforce/lwc/LightningNumberInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Formatted Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Lightning Output Field

- **name:** `json::/com/provar/salesforce/lwc/LightningOutputField`
- **type:** `container`
- **tagName:** `lightning-output-field`
- **attributes:** `Field class`, `Field name`
- **child elements:** 4

#### Lightning Password Input

- **name:** `json::/com/provar/salesforce/lwc/LightningPasswordInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Placeholder`, `Type`, `Pattern`, `Message`
- **child elements:** 2

#### Lightning PickList

- **name:** `json::/com/provar/salesforce/lwc/LightningPicklist`
- **type:** `container`
- **tagName:** `lightning-picklist`
- **interactions:** `Set`, `Set By Index`
- **attributes:** `Disabled`, `Visible`, `Label`, `Name`, `Read only`, `Required`, `Value`, `Options List`, `Options`, `Message`
- **child elements:** 2

#### Lightning Pill

- **name:** `json::/com/provar/salesforce/lwc/LightningPill`
- **type:** `container`
- **tagName:** `lightning-pill`
- **interactions:** `Click`, `Remove`
- **attributes:** `Name`, `Visible`, `Label`, `Href`, `Has error`, `Role`

#### Lightning Progress Indicator

- **name:** `json::/com/provar/salesforce/lwc/LightningProgressIndicator`
- **type:** `container`
- **tagName:** `lightning-progress-indicator`
- **attributes:** `Has error`, `Current step`, `Variant`, `Type`

#### Lightning Progress Step

- **name:** `json::/com/provar/salesforce/lwc/LightningProgressStep`
- **type:** `container`
- **tagName:** `lightning-progress-step`
- **interactions:** `Select Step`
- **attributes:** `Label`, `Visible`, `Value`

#### Lightning Radio Group

- **name:** `json::/com/provar/salesforce/lwc/LightningRadioGroup`
- **type:** `container`
- **tagName:** `lightning-radio-group`
- **interactions:** `Check`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Class`, `Required`, `Message when value missing`
- **child elements:** 2

#### Lightning Record Edit Form

- **name:** `json::/com/provar/salesforce/lwc/LightningRecordEditForm`
- **type:** `container`
- **tagName:** `lightning-record-edit-form`
- **attributes:** `Object API name`, `Record id`, `Record type id`

#### Lightning Record Form

- **name:** `json::/com/provar/salesforce/lwc/LightningRecordForm`
- **type:** `container`
- **tagName:** `lightning-record-form`

#### Lightning Record Picker

- **name:** `json::/com/provar/salesforce/lwc/LightningRecordPicker`
- **type:** `container`
- **tagName:** `lightning-record-picker`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Label`, `Name`, `Read only`, `Required`, `Value`, `Message`
- **child elements:** 2

#### Lightning Record View Form

- **name:** `json::/com/provar/salesforce/lwc/LightningRecordViewForm`
- **type:** `container`
- **tagName:** `lightning-record-view-form`

#### Lightning Rich Text Input

- **name:** `json::/com/provar/salesforce/lwc/LightningRichTextInput`
- **type:** `container`
- **tagName:** `lightning-input-rich-text`
- **interactions:** `Clear`, `Set`
- **attributes:** `Label`, `Visible`, `Disabled`, `Class`, `Required`, `Value`, `Placeholder`
- **child elements:** 2

#### Lightning Search Input

- **name:** `json::/com/provar/salesforce/lwc/LightningSearchInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Placeholder`, `Type`
- **child elements:** 2

#### Lightning Select

- **name:** `json::/com/provar/salesforce/lwc/LightningSelect`
- **type:** `container`
- **tagName:** `lightning-select`
- **interactions:** `Set`
- **attributes:** `Disabled`, `Visible`, `Label`, `Name`, `Read only`, `Required`, `Value`, `Message`
- **child elements:** 2

#### Lightning Slider

- **name:** `json::/com/provar/salesforce/lwc/LightningSlider`
- **type:** `container`
- **tagName:** `lightning-slider`
- **interactions:** `Set Slider Value`
- **attributes:** `Label`, `Visible`, `Disabled`, `Min`, `Max`, `Step`, `Value`
- **child elements:** 3

#### Lightning Tab

- **name:** `json::/com/provar/salesforce/lwc/LightningTab`
- **type:** `container`
- **tagName:** `lightning-tab`
- **interactions:** `Activate`, `Select Tab`
- **attributes:** `End icon name`, `Visible`, `Icon name`, `Title`, `Label`, `Show error indicator`

#### Lightning Tabset

- **name:** `json::/com/provar/salesforce/lwc/LightningTabset`
- **type:** `container`
- **tagName:** `lightning-tabset`
- **interactions:** `Set`
- **attributes:** `Active tab value`, `Visible`, `Title`

#### Lightning Telephone Input

- **name:** `json::/com/provar/salesforce/lwc/LightningTelephoneInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Lightning Text Area

- **name:** `json::/com/provar/salesforce/lwc/LightningTextArea`
- **type:** `container`
- **tagName:** `lightning-textarea`
- **interactions:** `Clear`, `Set`, `Set Text`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Placeholder`, `Message`, `Max length`
- **child elements:** 2

#### Lightning Text Input

- **name:** `json::/com/provar/salesforce/lwc/LightningTextInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Append`, `Set`
- **attributes:** `Name`, `Data-id`, `Message when value missing`, `Message when pattern mismatch`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Message`, `Value`, `Placeholder`, `Type`, `Visible`
- **child elements:** 2

#### Lightning Tile

- **name:** `json::/com/provar/salesforce/lwc/LightningTile`
- **type:** `container`
- **tagName:** `lightning-tile`
- **interactions:** `Click`
- **attributes:** `Label`, `Visible`, `Actions`, `Link`

#### Lightning Time Input

- **name:** `json::/com/provar/salesforce/lwc/LightningTimeInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Placeholder`, `Value`, `Formatted Value`, `Min`, `Max`, `Type`, `Visible`, `Message`
- **child elements:** 2

#### Lightning Toggle Input

- **name:** `json::/com/provar/salesforce/lwc/LightningToggleInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Check`, `Uncheck`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Checked`, `Type`, `Message`
- **child elements:** 2

#### Lightning Url Input

- **name:** `json::/com/provar/salesforce/lwc/LightningUrlInput`
- **type:** `container`
- **tagName:** `lightning-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Lightning Vertical Navigation

- **name:** `json::/com/provar/salesforce/lwc/LightningVerticalNavigation`
- **type:** `container`
- **tagName:** `lightning-vertical-navigation`
- **attributes:** `Selected item`

#### Lightning Vertical Navigation Item

- **name:** `json::/com/provar/salesforce/lwc/LightningVerticalNavigationItem`
- **type:** `container`
- **tagName:** `lightning-vertical-navigation-item`
- **interactions:** `Click`
- **attributes:** `Label`, `Visible`, `Name`

#### Lightning Vertical Navigation Item Badge

- **name:** `json::/com/provar/salesforce/lwc/LightningVerticalNavigationItemBadge`
- **type:** `container`
- **tagName:** `lightning-vertical-navigation-item-badge`
- **interactions:** `Click`
- **attributes:** `Label`, `Visible`, `Name`, `Badge count`

#### Lightning Vertical Navigation Item Icon

- **name:** `json::/com/provar/salesforce/lwc/LightningVerticalNavigationItemIcon`
- **type:** `container`
- **tagName:** `lightning-vertical-navigation-item-icon`
- **interactions:** `Click`
- **attributes:** `Label`, `Visible`, `Name`, `Icon name`

#### Lightning Vertical Navigation Overflow

- **name:** `json::/com/provar/salesforce/lwc/LightningVerticalNavigationOverflow`
- **type:** `container`
- **tagName:** `lightning-vertical-navigation-overflow`
- **interactions:** `Click`
- **attributes:** `Text`, `Visible`, `Label`

#### Lightning Vertical Navigation Section

- **name:** `json::/com/provar/salesforce/lwc/LightningVerticalNavigationSection`
- **type:** `container`
- **tagName:** `lightning-vertical-navigation-section`
- **attributes:** `Visible`, `Label`

#### Number Column

- **name:** `json::/com/provar/salesforce/lwc/NumberColumn`
- **type:** `container`
- **tagName:** `*`
- **attributes:** `Format style`, `Currency code`, `Currency display as`, `Maximum fraction digits`, `Maximum significant digits`, `Minimum fraction digits`, `Minimum integer digits`, `Minimum significant digits`

#### Phone column

- **name:** `json::/com/provar/salesforce/lwc/PhoneColumn`
- **type:** `container`
- **tagName:** `*`
- **attributes:** `Disabled`

#### Text Column

- **name:** `json::/com/provar/salesforce/lwc/TextColumn`
- **type:** `container`
- **tagName:** `*`
- **attributes:** `Linkify`

#### Url Column

- **name:** `json::/com/provar/salesforce/lwc/UrlColumn`
- **type:** `container`
- **tagName:** `*`
- **interactions:** `Click`
- **attributes:** `Tooltip`

---

## screenflow (v1.4.14)

Package includes definitions for Fact Component
**Requires Provar:** >=2.9.0

### Components

#### Screen Flow Address

- **name:** `json::/com/provar/Screenflows/ScreenFlowAddress`
- **type:** `container`
- **tagName:** `flowruntime-address`
- **interactions:** `Clear`, `Set`, `Set Street`, `Set City`, `Set Province`, `Set Country`, `Set Postal Code`
- **attributes:** `Address label`, `Visible`, `City`, `Country`, `Postal code`, `Province`, `Street`

#### Screen Flow Announcer

- **name:** `json::/com/provar/Screenflows/ScreenFlowAnnouncer`
- **type:** `container`
- **tagName:** `flowruntime-a11y-announcer`

#### Screen Flow Checkbox Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowCheckboxInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Check`, `Uncheck`, `Toggle`, `Set`
- **attributes:** `Name`, `DataType`, `Label`, `Visible`, `Class`, `Value`

#### Screen Flow Choice Lookup

- **name:** `json::/com/provar/Screenflows/ScreenFlowChoiceLookup`
- **type:** `container`
- **tagName:** `flowruntime-choice-lookup`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Class`, `Required`, `Value`, `Message`

#### Screen Flow Currency Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowCurrencyInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `FieldDataType`, `Label`, `Class`, `Required`, `Visible`, `Value`, `Message`
- **child elements:** 2

#### Screen Flow Date Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowDateInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`, `Set Date`, `Set Today`
- **attributes:** `Name`, `Visible`, `FieldDataType`, `Label`, `Class`, `Required`, `Value`, `Placeholder`, `Message`

#### Screen Flow Date Time Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowDateTimeInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`, `Set Now`, `Set Date and Time`, `Set Date`, `Set Time`
- **attributes:** `Name`, `Visible`, `FieldDataType`, `Label`, `Class`, `Required`, `Value`, `Message`

#### Screen Flow Display Text

- **name:** `json::/com/provar/Screenflows/ScreenFlowDisplayText`
- **type:** `container`
- **tagName:** `flowruntime-display-text-lwc`
- **attributes:** `Name`, `Visible`, `Class`, `Value`, `FieldType`, `Label`

#### Screen Flow Email

- **name:** `json::/com/provar/Screenflows/ScreenFlowEmail`
- **type:** `container`
- **tagName:** `flowruntime-email`
- **interactions:** `Clear`, `Set`
- **attributes:** `Label`, `Visible`, `Class`, `Required`, `Disabled`, `Read only`, `Value`

#### Screen Flow Error Content

- **name:** `json::/com/provar/Screenflows/ScreenFlowErrorContent`
- **type:** `container`
- **tagName:** `flowruntime-error-content`
- **attributes:** `Visible`, `Error`

#### Screen Flow Long Text Area Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowLongTextAreaInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Class`, `Required`, `Value`, `FieldType`, `Message`
- **child elements:** 2

#### Screen Flow Lwc Body

- **name:** `json::/com/provar/Screenflows/ScreenFlowLwcBody`
- **type:** `container`
- **tagName:** `flowruntime-lwc-body`
- **attributes:** `FlowLabel`, `Screen Developer Name`, `Current Flow Version Id`

#### Screen Flow Lwc Header

- **name:** `json::/com/provar/Screenflows/ScreenFlowLwcHeader`
- **type:** `container`
- **tagName:** `flowruntime-lwc-header`

#### Screen Flow Multi Checkbox Lwc

- **name:** `json::/com/provar/Screenflows/ScreenFlowMultiCheckboxLwc`
- **type:** `container`
- **tagName:** `flowruntime-multi-checkbox-lwc`
- **interactions:** `Set`, `Clear`, `Select All`
- **attributes:** `Name`, `Visible`, `Label`, `Required`, `Class`, `Value`, `Message`

#### Screen Flow Name

- **name:** `json::/com/provar/Screenflows/ScreenFlowName`
- **type:** `container`
- **tagName:** `flowruntime-name`
- **interactions:** `Clear`, `Set`, `Set`, `Set`, `Set`, `Set`, `Set`, `Set`
- **attributes:** `Label`, `Visible`, `Disabled`, `Read only`, `Class`, `First Name`, `Last Name`, `Message`

#### Screen Flow Navigation Bar

- **name:** `json::/com/provar/Screenflows/ScreenFlowNavigationBar`
- **type:** `container`
- **tagName:** `flowruntime-navigation-bar`

#### Screen Flow Number Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowNumberInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Class`, `Required`, `Value`, `FieldDataType`, `Message`

#### Screen Flow Password Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowPasswordInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Class`, `Required`, `Value`, `FieldType`

#### Screen Flow Phone

- **name:** `json::/com/provar/Screenflows/ScreenFlowPhone`
- **type:** `container`
- **tagName:** `flowruntime-phone`
- **interactions:** `Clear`, `Set`
- **attributes:** `Label`, `Visible`, `Class`, `Required`, `Read only`, `Value`, `Placeholder`

#### Screen Flow Picklist Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowPicklistInput`
- **type:** `container`
- **tagName:** `flowruntime-picklist-input-lwc`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Class`, `Options`, `Options List`, `Required`, `Value`, `Message`

#### Screen Flow Radio Button Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowRadioButtonInput`
- **type:** `container`
- **tagName:** `flowruntime-radio-button-input-lwc`
- **interactions:** `Set`, `Clear`
- **attributes:** `Name`, `Label`, `Required`, `Class`, `Value`, `Visible`, `Message`

#### Screen Flow Screen Field

- **name:** `json::/com/provar/Screenflows/ScreenFlowScreenField`
- **type:** `container`
- **tagName:** `flowruntime-screen-field`
- **attributes:** `Field Name`

#### Screen Flow Section With Header

- **name:** `json::/com/provar/Screenflows/ScreenFlowSectionWithHeader`
- **type:** `container`
- **tagName:** `flowruntime-section-with-header`
- **attributes:** `Section Name`, `Visible`, `Section Heading`

#### Screen Flow Slider

- **name:** `json::/com/provar/Screenflows/ScreenFlowSlider`
- **type:** `container`
- **tagName:** `flowruntime-slider`
- **interactions:** `Set Slider Value`
- **attributes:** `Label`, `Visible`, `Disabled`, `Min`, `Max`, `Step`, `Value`

#### Screen Flow Text Input

- **name:** `json::/com/provar/Screenflows/ScreenFlowTextInput`
- **type:** `container`
- **tagName:** `flowruntime-flow-screen-input`
- **interactions:** `Clear`, `Set`
- **attributes:** `Name`, `Visible`, `Label`, `Class`, `Required`, `Value`, `FieldDataType`, `Message`

#### Screen Flow Toggle

- **name:** `json::/com/provar/Screenflows/ScreenFlowToggle`
- **type:** `container`
- **tagName:** `flowruntime-toggle`
- **interactions:** `Check`, `Uncheck`, `Toggle`, `Set`
- **attributes:** `Label`, `Visible`, `Message Toggle Active`, `Message Toggle Inactive`, `Class`, `Disabled`, `Value`

#### Screen Flow Url

- **name:** `json::/com/provar/Screenflows/ScreenFlowUrl`
- **type:** `container`
- **tagName:** `flowruntime-url`
- **interactions:** `Clear`, `Set`
- **attributes:** `Label`, `Visible`, `Class`, `Required`, `Disabled`, `Read only`, `Value`, `Message`

---

## vlocityIns (v1.0.13)

Package includes definitions for Vlocity Ins Components FACT elements
**Requires Provar:** >=2.10.2

### Components

#### Vlocity Ins Block

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsBlock`
- **type:** `container`
- **tagName:** `vlocity_ins-block`
- **attributes:** `Data Style Id`, `Data Action Index`, `Data Omni Key`

#### Vlocity Ins Button

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsButton`
- **type:** `container`
- **tagName:** `vlocity_ins-button`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Title`, `Variant`

#### Vlocity Button Group

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsButtonGroup`
- **type:** `container`
- **tagName:** `c-atlas-d-x-radio-extended-s`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`

#### Vlocity Flex Card State

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsCardState`
- **type:** `container`
- **tagName:** `vlocity_ins-flex-card-state`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`

#### Vlocity Ins Checkbox

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsCheckbox`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-checkbox`
- **interactions:** `Check`, `Uncheck`, `Toggle`, `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Disabled`, `Class`, `Required`, `Checked`, `Type`
- **child elements:** 2

#### Vlocity Ins Combobox

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsCombobox`
- **type:** `container`
- **tagName:** `vlocity_ins-combobox`
- **interactions:** `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Options`, `Label`, `Message`, `Name`, `Placeholder`, `Value Label`, `Read only`, `Required`, `Options`, `Options List`, `Value`
- **child elements:** 2

#### Vlocity Ins Currency

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsCurrency`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-currency`
- **interactions:** `Clear`, `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Required`, `Value`, `Message`
- **child elements:** 2

#### Vlocity Ins Custom Lwc

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsCustomLwc`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-custom-lwc`
- **attributes:** `Data Omni Key`, `Visible`

#### Vlocity Ins Date

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsDate`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-date`
- **interactions:** `Set`, `Set Date`, `Set Today`, `Clear`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Placeholder`, `Read only`, `Required`, `Display Value`, `Min`, `Max`, `Value`
- **child elements:** 2

#### Vlocity Ins Dr Extract Action

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsDrExtractAction`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-dr-extract-action`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Class`, `Visible`, `Disabled`, `Label`, `Name`, `Title`, `Variant`

#### Vlocity Ins Edit Block

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsEditBlock`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-edit-block`
- **attributes:** `Data Omni Key`
- **child elements:** 1

#### Vlocity Ins Edit Block Wrapper

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsEditBlockWrapper`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-edit-block-wrapper`
- **attributes:** `Visible`, `Data Omni Key`
- **child elements:** 1

#### Vlocity Ins Email

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsEmail`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-email`
- **interactions:** `Clear`, `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Multiple`, `Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Vlocity Ins Flex Action

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsFlexAction`
- **type:** `container`
- **tagName:** `vlocity_ins-flex-action`
- **interactions:** `Click`
- **attributes:** `Data Style Id`, `Data Action Index`, `Data Omni Key`, `Data Omni Key`, `Visible`

#### Vlocity Form Add Botton

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsFormAddBotton`
- **type:** `container`
- **tagName:** `div`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`

#### Vlocity Ins Formula

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsFormula`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-formula`
- **interactions:** `Clear`, `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Required`, `Value`, `Message`
- **child elements:** 2

#### Vlocity Ins Input

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsInput`
- **type:** `container`
- **tagName:** `vlocity_ins-input`
- **interactions:** `Clear`, `Set`, `Append`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Placeholder`, `Read only`, `Required`, `Message`, `Value`
- **child elements:** 2

#### Vlocity Ip Action

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsIpAction`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-ip-action`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Title`, `Variant`

#### Vlocity Ins Lookup

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsLookup`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-lookup`
- **interactions:** `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Options`, `Label`, `Message`, `Name`, `Placeholder`, `Value Label`, `Read only`, `Required`, `Options`, `Options List`, `Value`
- **child elements:** 2

#### Vlocity Ins Multi Select

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsMultiSelect`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-multiselect`
- **interactions:** `Check`, `Uncheck`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Disabled`, `Required`

#### Vlocity Ins Navigate Action

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsNavigateAction`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-navigate-action`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Title`, `Variant`

#### Vlocity Ins Number

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsNumber`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-number`
- **interactions:** `Clear`, `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Disabled`, `Read only`, `Required`, `Value`, `Formatted Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Vlocity Ins Omniscript Block

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsOmniscriptBlock`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-block`
- **attributes:** `Data Style Id`, `Data Action Index`, `Data Omni Key`

#### Vlocity Ins Output Field

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsOutputField`
- **type:** `container`
- **tagName:** `vlocity_ins-output-field`
- **attributes:** `Data Style Id`, `Data Omni Key`

#### Vlocity Ins Places Type Ahead

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsPlacesTypeAhead`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-places-typeahead`
- **interactions:** `Clear`, `Set`, `Append`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Placeholder`, `Required`, `Message`, `Value`
- **child elements:** 2

#### Vlocity Ins Radio

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsRadio`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-radio`
- **interactions:** `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Required`, `Value`, `Type`

#### Vlocity Ins Select

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsSelect`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-select`
- **interactions:** `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Options`, `Label`, `Message`, `Name`, `Placeholder`, `Value Label`, `Read only`, `Required`, `Options`, `Options List`, `Value`
- **child elements:** 2

#### Vlocity Ins Set Values

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsSetValues`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-set-values`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Title`, `Variant`

#### Vlocity Ins Step

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsStep`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-step`
- **attributes:** `Data Omni Key`

#### Vlocity Ins Telephone

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsTelephone`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-telephone`
- **interactions:** `Clear`, `Set`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Disabled`, `Read only`, `Required`, `Value`, `Formatted Value`, `Placeholder`, `Type`, `Message`
- **child elements:** 2

#### Vlocity Ins Text

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsText`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-text`
- **interactions:** `Clear`, `Set`, `Append`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Placeholder`, `Read only`, `Required`, `Message`, `Value`
- **child elements:** 2

#### Vlocity Ins Text Area

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsTextArea`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-textarea`
- **interactions:** `Clear`, `Set`, `Append`
- **attributes:** `Data Omni Key`, `Visible`, `Name`, `Label`, `Disabled`, `Read only`, `Class`, `Required`, `Value`, `Placeholder`, `Message`, `Max length`
- **child elements:** 2

#### Vlocity Ins Transform Action

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsTransformAction`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-dr-transform-action`
- **interactions:** `Click`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Title`, `Variant`

#### Vlocity Ins Type Ahead

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsTypeAhead`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-typeahead`
- **interactions:** `Clear`, `Set`, `Append`
- **attributes:** `Data Omni Key`, `Visible`, `Disabled`, `Label`, `Name`, `Placeholder`, `Required`, `Message`, `Value`
- **child elements:** 2

#### Vlocity Ins Type Ahead Block

- **name:** `json::/com/provar/vlocityInsCloud/VlocityInsTypeAheadBlock`
- **type:** `container`
- **tagName:** `vlocity_ins-omniscript-typeahead-block`
- **attributes:** `Data Omni Key`
- **child elements:** 1

---
