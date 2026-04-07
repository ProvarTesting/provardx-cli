/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import ManagerConnect from '@provartesting/provardx-plugins-manager/lib/commands/provar/manager/connect.js';

export default class SfProvarQualityHubConnect extends ManagerConnect {
  public static readonly aliases = ['provar:manager:connect'];
  public static readonly deprecateAliases = true;
}
