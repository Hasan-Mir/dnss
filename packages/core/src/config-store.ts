import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DnsConfig } from './types';
import { validateIPv4 } from './validate';

/**
 * Persistent storage for user-saved DNS configurations.
 *
 * Storage layout:
 *   ~/.dnss/configs.json
 *
 * Migration: the original CLI stored configs in ~/.dnschanger.json. If that
 * file exists and no new-style config exists yet, it is imported once.
 */

/**
 * Resolve the home directory of the *invoking* user when this process runs
 * under sudo/doas. `os.homedir()` would otherwise resolve to /root, which
 * both hides saved configs from the real user and pollutes /root with
 * root-owned state. Returns `os.homedir()` unchanged when not elevated.
 */
function resolveHomeDir(): string {
    const elevatedUser = process.env.SUDO_USER || process.env.DOAS_USER;
    if (!elevatedUser || process.platform === 'win32') {
        return os.homedir();
    }

    const candidates: string[] = [];
    try {
        if (process.platform === 'darwin') {
            const output = execFileSync(
                'dscl',
                ['.', '-read', `/Users/${elevatedUser}`, 'NFSHomeDirectory'],
                { encoding: 'utf-8' }
            );
            const home = output.split(':').pop()?.trim();
            if (home) candidates.push(home);
        } else {
            // "user:x:1000:1000:Full Name:/home/user:/bin/bash"
            const output = execFileSync('getent', ['passwd', elevatedUser], {
                encoding: 'utf-8',
            });
            const home = output.trim().split(':')[5];
            if (home) candidates.push(home);
        }
    } catch {
        // Fall through to the platform's default layout below.
    }
    candidates.push(
        process.platform === 'darwin'
            ? `/Users/${elevatedUser}`
            : `/home/${elevatedUser}`
    );

    // Only use a directory that actually exists: a wrong guess must never
    // make us create a fresh home for a non-existent user.
    const existing = candidates.find((candidate) => {
        try {
            return fs.existsSync(candidate);
        } catch {
            return false;
        }
    });
    return existing ?? os.homedir();
}

const CONFIG_DIR = path.join(resolveHomeDir(), '.dnss');
const CONFIG_PATH = path.join(CONFIG_DIR, 'configs.json');
// Resolved the same way as CONFIG_PATH so that under sudo the invoking
// user's legacy file is read (not root's).
const LEGACY_CONFIG_PATH = path.join(resolveHomeDir(), '.dnschanger.json');

export function getConfigPath(): string {
    return CONFIG_PATH;
}

export function loadConfigs(): DnsConfig[] {
    if (!fs.existsSync(CONFIG_PATH)) {
        return loadLegacyConfigs();
    }
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8').trim();
        if (!data) return [];
        const parsed: unknown = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return partitionConfigs(parsed);
    } catch {
        // Quarantine the broken file instead of silently returning an empty
        // list: the next save() would otherwise overwrite it and destroy
        // every saved configuration permanently.
        try {
            safeBackupCopy(CONFIG_PATH, `${CONFIG_PATH}.corrupt`);
        } catch {
            // Best effort only.
        }
        return loadLegacyConfigs();
    }
}

/**
 * When elevated via sudo, hand `targetPath` back to the invoking user so
 * later non-elevated runs and the GUI can still write it. Best effort only.
 */
function chownToInvokingUser(targetPath: string): void {
    const sudoUid = process.env.SUDO_UID;
    const sudoGid = process.env.SUDO_GID;
    const isRoot =
        typeof process.getuid === 'function' && process.getuid() === 0;
    if (!isRoot || !sudoUid || !sudoGid) {
        return;
    }
    const uid = Number(sudoUid);
    const gid = Number(sudoGid);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
        return;
    }
    try {
        if (fs.existsSync(targetPath)) {
            fs.chownSync(targetPath, uid, gid);
        }
    } catch {
        // Best effort only.
    }
}

/**
 * Defense-in-depth against symlink planting in `~/.dnss` (a badly
 * configured multi-user home can leave the directory writable by others):
 * auxiliary files must never be written *through* a symlink — that would
 * clobber an arbitrary attacker-chosen target. If the destination is a
 * symlink it is removed so the following write recreates a real file.
 */
function removeSymlink(targetPath: string): void {
    try {
        if (fs.lstatSync(targetPath).isSymbolicLink()) {
            fs.unlinkSync(targetPath);
        }
    } catch {
        // Missing file or unreadable parent: the subsequent write surfaces
        // real errors on its own.
    }
}

/**
 * Copy `src` to `dest` for backup purposes, symlink-safe.
 */
function safeBackupCopy(src: string, dest: string): void {
    removeSymlink(dest);
    fs.copyFileSync(src, dest);
    chownToInvokingUser(dest);
}

/**
 * Atomically replace the config file: write to a temp file in the same
 * directory, rename over the target, and keep a `.bak` of the previous
 * known-good state. A crash mid-write can no longer truncate the file, and
 * a bad write never destroys the last good configuration.
 */
function writeConfigFile(data: string): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    chownToInvokingUser(CONFIG_DIR);

    try {
        if (fs.existsSync(CONFIG_PATH)) {
            safeBackupCopy(CONFIG_PATH, `${CONFIG_PATH}.bak`);
        }
    } catch {
        // Best effort only.
    }

    // Unpredictable name plus exclusive creation ('wx'): a pre-planted file
    // or symlink at a predictable temp path (e.g. by another local user)
    // makes openSync fail instead of silently writing through it. Mode 0600
    // keeps the config private on POSIX systems.
    const tmpPath = `${CONFIG_PATH}.${process.pid}.${Math.random()
        .toString(36)
        .slice(2, 10)}.tmp`;
    const fd = fs.openSync(tmpPath, 'wx', 0o600);
    try {
        fs.writeSync(fd, Buffer.from(data, 'utf-8'));
        // Flush to stable storage before the rename so a crash right after
        // it can never leave a truncated configs.json behind.
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    try {
        fs.renameSync(tmpPath, CONFIG_PATH);
    } catch (error) {
        try {
            fs.unlinkSync(tmpPath);
        } catch {
            // Ignore: the temp file must not mask the original error.
        }
        throw error;
    }
    chownToInvokingUser(CONFIG_PATH);
}

export function saveConfigs(configs: DnsConfig[]): void {
    // Persist trimmed values so the stored form equals what later gets
    // handed to OS commands (mirrors the GUI's Rust config store).
    const normalized = configs.map((config) => ({
        name: config.name.trim(),
        primary: config.primary.trim(),
        alternative: config.alternative?.trim() || undefined,
    }));
    writeConfigFile(JSON.stringify(normalized, null, 2));
}

export function upsertConfig(config: DnsConfig): DnsConfig[] {
    const configs = loadConfigs();
    const existingIndex = configs.findIndex(
        (c) => c.name.toLowerCase() === config.name.toLowerCase()
    );
    if (existingIndex >= 0) {
        configs[existingIndex] = config;
    } else {
        configs.push(config);
    }
    saveConfigs(configs);
    return configs;
}

export function removeConfig(name: string): DnsConfig[] {
    const configs = loadConfigs().filter(
        (c) => c.name.toLowerCase() !== name.toLowerCase()
    );
    saveConfigs(configs);
    return configs;
}

/**
 * Split parsed entries into valid configs and everything else. Invalid
 * entries are appended to `<configs.json>.invalid` instead of being
 * dropped silently: the next save() would otherwise erase them
 * permanently (e.g. entries written by a newer version that this build
 * cannot fully validate yet).
 */
function partitionConfigs(entries: unknown[]): DnsConfig[] {
    const valid: DnsConfig[] = [];
    const invalid: unknown[] = [];
    for (const entry of entries) {
        if (isDnsConfig(entry)) {
            valid.push(entry);
        } else {
            invalid.push(entry);
        }
    }
    if (invalid.length > 0) {
        quarantineEntries(invalid);
    }
    return valid;
}

const MAX_QUARANTINE_ENTRIES = 50;

function quarantineEntries(invalid: unknown[]): void {
    try {
        const quarantinePath = `${CONFIG_PATH}.invalid`;
        // Never write through a planted symlink (see removeSymlink).
        removeSymlink(quarantinePath);
        let existing: unknown[] = [];
        try {
            const parsed: unknown = JSON.parse(
                fs.readFileSync(quarantinePath, 'utf-8')
            );
            if (Array.isArray(parsed)) existing = parsed;
        } catch {
            // Start a fresh quarantine file.
        }
        // Skip duplicates and cap the file so a hostile config cannot grow
        // it without bound.
        const known = new Set(existing.map((entry) => JSON.stringify(entry)));
        for (const entry of invalid) {
            const key = JSON.stringify(entry);
            if (!known.has(key)) {
                existing.push(entry);
                known.add(key);
            }
        }
        fs.writeFileSync(
            quarantinePath,
            JSON.stringify(existing.slice(-MAX_QUARANTINE_ENTRIES), null, 2),
            'utf-8'
        );
        // Under sudo the quarantine file would otherwise become root-owned
        // and break later non-elevated writes.
        chownToInvokingUser(quarantinePath);
    } catch {
        // Best effort only: a failed quarantine write must never break
        // loading.
    }
}

function loadLegacyConfigs(): DnsConfig[] {
    if (!fs.existsSync(LEGACY_CONFIG_PATH)) return [];
    try {
        const data = fs.readFileSync(LEGACY_CONFIG_PATH, 'utf-8').trim();
        if (!data) return [];
        const parsed: unknown = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        const configs = parsed.filter(isDnsConfig);
        // Only persist the migration when there is something to migrate.
        if (configs.length > 0) {
            saveConfigs(configs);
        }
        return configs;
    } catch {
        return [];
    }
}

function isDnsConfig(value: unknown): value is DnsConfig {
    if (typeof value !== 'object' || value === null) return false;
    const config = value as Record<string, unknown>;
    if (
        typeof config.name !== 'string' ||
        typeof config.primary !== 'string' ||
        (config.alternative !== undefined &&
            typeof config.alternative !== 'string')
    ) {
        return false;
    }
    // Persisted data is user-controlled: never trust it without validating
    // the addresses, since these values are later handed to OS commands.
    return (
        validateIPv4(config.primary) &&
        (config.alternative === undefined ||
            config.alternative === '' ||
            validateIPv4(config.alternative))
    );
}
