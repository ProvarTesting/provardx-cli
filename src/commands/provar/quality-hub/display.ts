/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import ManagerDisplay from '@provartesting/provardx-plugins-manager/lib/commands/provar/manager/display.js';

export default class SfProvarQualityHubDisplay extends ManagerDisplay {
  public static readonly aliases = ['provar:manager:display'];
  public static readonly deprecateAliases = true;
}
