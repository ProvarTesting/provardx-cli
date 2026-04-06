/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import ManagerOpen from '@provartesting/provardx-plugins-manager/lib/commands/provar/manager/open.js';

export default class SfProvarQualityHubOpen extends ManagerOpen {
  public static readonly aliases = ['provar:manager:open'];
  public static readonly deprecateAliases = true;
}
