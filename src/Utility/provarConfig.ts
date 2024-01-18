import { Config, ConfigPropertyMeta, SfError } from '@salesforce/core';
import ErrorHandler from './errorHandler';

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

  public static async loadConfig(errorHandler: ErrorHandler): Promise<ProvarConfig> {
    try {
      const config = await ProvarConfig.create();
      await config.read();
      return config;
    } catch (error) {
      if (error instanceof SfError) {
        // eslint-disable-next-line
        errorHandler.addErrorsToList(error.code, error.message);
      }
      throw error;
    }
  }
}
