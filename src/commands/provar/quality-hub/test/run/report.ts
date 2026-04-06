/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import ManagerTestRunReport from '@provartesting/provardx-plugins-manager/lib/commands/provar/manager/test/run/report.js';

export default class SfProvarQualityHubTestRunReport extends ManagerTestRunReport {
  public static readonly aliases = ['provar:manager:test:run:report'];
  public static readonly deprecateAliases = true;
}
