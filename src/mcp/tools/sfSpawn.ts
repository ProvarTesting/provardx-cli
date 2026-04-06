/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { spawnSync as _spawnSync } from 'node:child_process';

/**
 * Thin wrapper around spawnSync so tests can stub sfSpawnHelper.spawnSync.
 * ESM named exports are immutable bindings; sinon requires a mutable object property.
 */
export const sfSpawnHelper = {
  spawnSync: _spawnSync,
};
