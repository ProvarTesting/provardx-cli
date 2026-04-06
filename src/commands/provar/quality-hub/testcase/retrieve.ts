/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import ManagerTestcaseRetrieve from '@provartesting/provardx-plugins-manager/lib/commands/provar/manager/testcase/retrieve.js';

export default class SfProvarQualityHubTestcaseRetrieve extends ManagerTestcaseRetrieve {
  public static readonly aliases = ['provar:manager:testcase:retrieve'];
  public static readonly deprecateAliases = true;
}
