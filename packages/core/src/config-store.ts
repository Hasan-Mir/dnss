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
        if (!Array.isArray(parsed)) {
            try {
                safeBackupCopy(CONFIG_PATH, `${CONFIG_PATH}.corrupt`);
            } catch {
                // Best effort only.
            }
            return [];
        }
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
 * When elevated via sudo, resolve the invoking user's numeric UID/GID so
 * newly created config files and directories can be handed back to them.
 */
function getInvokingUserIds(): { uid: number; gid: number } | null {
    const sudoUid = process.env.SUDO_UID;
    const sudoGid = process.env.SUDO_GID;
    const isRoot =
        typeof process.getuid === 'function' && process.getuid() === 0;
    if (!isRoot || !sudoUid || !sudoGid) {
        return null;
    }
    const uid = Number(sudoUid);
    const gid = Number(sudoGid);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
        return null;
    }
    return { uid, gid };
}

function fchownToInvokingUser(fd: number): void {
    const ids = getInvokingUserIds();
    if (!ids) return;
    try {
        fs.fchownSync(fd, ids.uid, ids.gid);
    } catch {
        // Best effort only.
    }
}

function ensureSafeConfigDir(): void {
    try {
        if (fs.lstatSync(CONFIG_DIR).isSymbolicLink()) {
            throw new Error(
                `Refusing to use symlinked config directory: ${CONFIG_DIR}`
            );
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
            throw err;
        }
    }
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    const ids = getInvokingUserIds();
    if (ids) {
        try {
            if (!fs.lstatSync(CONFIG_DIR).isSymbolicLink()) {
                fs.lchownSync(CONFIG_DIR, ids.uid, ids.gid);
            }
        } catch {
            // Best effort only.
        }
    }
}

/**
 * Atomically write `content` to `destPath` via an exclusive ('wx') temp file
 * in the same directory, fchowning the open fd before rename so no symlink
 * or TOCTOU race can redirect writes or ownership changes.
 */
function atomicWriteFile(
    destPath: string,
    content: Buffer,
    sync = false
): void {
    const tmpPath = `${destPath}.${process.pid}.${Math.random()
        .toString(36)
        .slice(2, 10)}.tmp`;
    const fd = fs.openSync(tmpPath, 'wx', 0o600);
    let writeFailed = false;
    try {
        fs.writeSync(fd, content);
        if (sync) {
            fs.fsyncSync(fd);
        }
        fchownToInvokingUser(fd);
    } catch (error) {
        writeFailed = true;
        throw error;
    } finally {
        fs.closeSync(fd);
        if (writeFailed) {
            try {
                fs.unlinkSync(tmpPath);
            } catch {
                // Ignore: temp cleanup must not mask the original write error.
            }
        }
    }
    try {
        fs.renameSync(tmpPath, destPath);
    } catch (error) {
        try {
            fs.unlinkSync(tmpPath);
        } catch {
            // Ignore: temp cleanup must not mask the original error.
        }
        throw error;
    }
}

/**
 * Copy `src` to `dest` for backup purposes without following symlinks at
 * either `src` or `dest`.
 */
function safeBackupCopy(src: string, dest: string): void {
    ensureSafeConfigDir();
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(src, flags);
    let content: Buffer;
    try {
        if (!fs.fstatSync(fd).isFile()) {
            return;
        }
        content = fs.readFileSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    atomicWriteFile(dest, content);
}

/**
 * Write `data` to `CONFIG_PATH` atomically: create a fresh temp file in the
 * same directory (0600, exclusive), fsync + fchown it, then rename over the
 * target. Existing configs are backed up to `configs.json.bak` first.
 */
function writeConfigFile(data: string): void {
    ensureSafeConfigDir();

    try {
        if (fs.existsSync(CONFIG_PATH)) {
            safeBackupCopy(CONFIG_PATH, `${CONFIG_PATH}.bak`);
        }
    } catch {
        // Best effort only.
    }

    atomicWriteFile(CONFIG_PATH, Buffer.from(data, 'utf-8'), true);
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
    const normalized: DnsConfig = {
        name: config.name.trim(),
        primary: config.primary.trim(),
        alternative: config.alternative?.trim() || undefined,
    };
    const configs = loadConfigs();
    const existingIndex = configs.findIndex(
        (c) => c.name.trim().toLowerCase() === normalized.name.toLowerCase()
    );
    if (existingIndex >= 0) {
        configs[existingIndex] = normalized;
    } else {
        configs.push(normalized);
    }
    saveConfigs(configs);
    return configs;
}

export function removeConfig(name: string): DnsConfig[] {
    const target = name.trim().toLowerCase();
    const configs = loadConfigs().filter(
        (c) => c.name.trim().toLowerCase() !== target
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
        ensureSafeConfigDir();
        let existing: unknown[] = [];
        try {
            if (!fs.lstatSync(quarantinePath).isSymbolicLink()) {
                const parsed: unknown = JSON.parse(
                    fs.readFileSync(quarantinePath, 'utf-8')
                );
                if (Array.isArray(parsed)) existing = parsed;
            }
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
        atomicWriteFile(
            quarantinePath,
            Buffer.from(
                JSON.stringify(
                    existing.slice(-MAX_QUARANTINE_ENTRIES),
                    null,
                    2
                ),
                'utf-8'
            )
        );
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

const MAX_NAME_LEN = 64;

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
    const trimmedName = config.name.trim();
    if (trimmedName.length === 0 || [...trimmedName].length > MAX_NAME_LEN) {
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
