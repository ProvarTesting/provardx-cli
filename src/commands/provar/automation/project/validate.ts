/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { validateProjectFromPath, ProjectValidationError, type ProjectValidationResult } from '../../../../services/projectValidation.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.automation.project.validate');

export default class SfProvarAutomationProjectValidate extends SfCommand<ProjectValidationResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'project-path': Flags.string({
      char: 'p',
      summary: messages.getMessage('flags.project-path.summary'),
      default: process.cwd(),
    }),
    'quality-threshold': Flags.integer({
      char: 'q',
      summary: messages.getMessage('flags.quality-threshold.summary'),
      default: 80,
      min: 0,
      max: 100,
    }),
    'save-results': Flags.boolean({
      summary: messages.getMessage('flags.save-results.summary'),
      default: true,
      allowNo: true,
    }),
    'results-dir': Flags.string({
      char: 'd',
      summary: messages.getMessage('flags.results-dir.summary'),
    }),
  };

  public async run(): Promise<ProjectValidationResult> {
    const { flags } = await this.parse(SfProvarAutomationProjectValidate);

    try {
      const result = validateProjectFromPath({
        project_path: flags['project-path'],
        quality_threshold: flags['quality-threshold'],
        save_results: flags['save-results'],
        results_dir: flags['results-dir'],
      });

      if (!this.jsonEnabled()) {
        this.log(messages.getMessage('success_message', [result.project_name, result.quality_score, result.quality_grade]));
        if (result.saved_to) {
          this.log(messages.getMessage('saved_to_message', [result.saved_to]));
        }
      }

      const threshold = flags['quality-threshold'];
      if (result.quality_score < threshold) {
        this.error(
          `Quality score ${result.quality_score}/100 is below the required threshold of ${threshold}/100`,
          { exit: 1 }
        );
      }

      return result;
    } catch (err: unknown) {
      if (err instanceof ProjectValidationError) {
        this.error(err.message, { exit: 1 });
      }
      throw err;
    }
  }
}
