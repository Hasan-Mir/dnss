import os from 'node:os';

import type { OsType } from './types';

/**
 * Detect the current operating system in the normalized form used across DNSS.
 */
export function getOsType(): OsType {
    const platform = os.platform();
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'mac';
    if (platform === 'linux') return 'linux';
    throw new Error(`Unsupported operating system: ${platform}`);
}
