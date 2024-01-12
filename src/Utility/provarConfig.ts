import { Config, ConfigPropertyMeta } from '@salesforce/core';
/**
 * The files where provardx config values are stored for projects and the global space.
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
