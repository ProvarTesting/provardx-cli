/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Config, ConfigPropertyMeta } from '@salesforce/core';

/**
 * sfdxConfig extended class that deals with any operation over .sf/config.json.
 * ex: what all properties we can add to config.json.
 *
 */

export class ProvarConfig extends Config {
  public constructor() {
    const option = { isGlobal: true, isState: true, filename: 'config.json', stateFolder: '.provardx' };
    const allowedProeprties: ConfigPropertyMeta[] = [];
    allowedProeprties.push({ key: 'PROVARDX_PROPERTIES_FILE_PATH', description: '' });
    ProvarConfig.addAllowedProperties(allowedProeprties);
    super(
      Object.assign(
        {
          isGlobal: true,
        },
        option
      )
    );
  }
}
