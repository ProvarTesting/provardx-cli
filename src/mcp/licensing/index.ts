/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export { LicenseError } from './licenseError.js';
export { validateLicense } from './licenseValidator.js';
export type { LicenseValidationResult } from './licenseValidator.js';
export { findActivatedIdeLicense, readIdeLicenses } from './ideDetection.js';
export type { IdeLicenseState } from './ideDetection.js';
