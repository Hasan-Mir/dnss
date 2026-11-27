import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
    AppSettings,
    DnsConfig,
    FontFamilySetting,
    FontSizeSetting,
    LanguageSetting,
    ThemeSetting,
} from './types';
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
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
// Resolved the same way as CONFIG_PATH so that under sudo the invoking
// user's legacy file is read (not root's).
const LEGACY_CONFIG_PATH = path.join(resolveHomeDir(), '.dnschanger.json');

export const SETTINGS_SCHEMA_VERSION = 1;
const DEFAULT_BENCHMARK_TARGET = 'https://www.cloudflare.com';
const DEFAULT_ACCENT_HEX = '#10b981';
const VALID_THEMES = new Set<ThemeSetting>(['light', 'dark', 'system']);
const VALID_FONTS = new Set<FontFamilySetting>([
    'google-sans',
    'inter',
    'dm-sans',
    'manrope',
    'roboto',
]);
const VALID_FONT_SIZES = new Set<FontSizeSetting>([12, 14, 16]);
const VALID_LANGUAGES = new Set<LanguageSetting>(['en', 'fa']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_SETTINGS_IMPORT_BYTES = 512 * 1024;

export function getConfigPath(): string {
    return CONFIG_PATH;
}

export function getSettingsPath(): string {
    return SETTINGS_PATH;
}

export function getDefaultSettings(): AppSettings {
    return {
        'dnss.schemaVersion': SETTINGS_SCHEMA_VERSION,
        'appearance.theme': 'system',
        'appearance.accent': DEFAULT_ACCENT_HEX,
        'appearance.fontFamily': 'google-sans',
        'appearance.fontSize': 14,
        'general.language': 'en',
        'benchmark.target': DEFAULT_BENCHMARK_TARGET,
        'presets.hidden': [],
        'dns.servers': [],
    };
}

function slugifyServerId(name: string, used: Set<string>): string {
    const base =
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48)
            .replace(/-+$/g, '') || 'server';
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
        candidate = `${base}-${suffix++}`;
    }
    used.add(candidate);
    return candidate;
}

function normalizeServerList(configs: DnsConfig[]): DnsConfig[] {
    const usedIds = new Set<string>();
    return configs.map((config) => {
        const trimmedName = config.name.trim();
        const rawId =
            typeof config.id === 'string'
                ? config.id
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                      .slice(0, 64)
                      .replace(/-+$/g, '')
                : '';
        let id: string;
        if (rawId && !usedIds.has(rawId)) {
            usedIds.add(rawId);
            id = rawId;
        } else {
            id = slugifyServerId(trimmedName, usedIds);
        }
        const alt = config.alternative?.trim();
        return {
            id,
            name: trimmedName,
            primary: config.primary.trim(),
            ...(alt ? { alternative: alt } : {}),
        };
    });
}

function loadConfigsFromLegacyStore(): DnsConfig[] {
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

export function loadConfigs(): DnsConfig[] {
    if (fs.existsSync(SETTINGS_PATH)) {
        try {
            const data = fs.readFileSync(SETTINGS_PATH, 'utf-8').trim();
            if (data) {
                const parsed: unknown = JSON.parse(data);
                if (
                    typeof parsed === 'object' &&
                    parsed !== null &&
                    !Array.isArray(parsed) &&
                    Array.isArray(
                        (parsed as Record<string, unknown>)['dns.servers']
                    )
                ) {
                    return normalizeSettingsRecord(
                        parsed as Record<string, unknown>,
                        false
                    )['dns.servers'];
                }
            }
        } catch {
            // Fall back to configs.json below.
        }
    }
    return loadConfigsFromLegacyStore();
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

function writeJsonTarget(destPath: string, data: string): void {
    ensureSafeConfigDir();
    try {
        if (fs.existsSync(destPath)) {
            safeBackupCopy(destPath, `${destPath}.bak`);
        }
    } catch {
        // Best effort only.
    }
    atomicWriteFile(destPath, Buffer.from(data, 'utf-8'), true);
}

export function saveConfigs(configs: DnsConfig[]): void {
    // Persist trimmed values with stable IDs so the stored form equals what
    // later gets handed to OS commands and stays synced with settings.json.
    const normalized = normalizeServerList(configs);
    writeConfigFile(JSON.stringify(normalized, null, 2));
    // Mirror into settings.json without triggering a recursive configs write.
    try {
        const current = loadSettings({ skipLegacyConfigRead: true });
        current['dns.servers'] = normalized;
        writeJsonTarget(SETTINGS_PATH, JSON.stringify(current, null, 2));
    } catch {
        // Best effort only: configs.json is already safely persisted.
    }
}

function normalizeSettingsRecord(
    raw: Record<string, unknown>,
    strict: boolean
): AppSettings {
    const defaults = getDefaultSettings();

    const theme = raw['appearance.theme'];
    const accent = raw['appearance.accent'];
    const fontFamily = raw['appearance.fontFamily'];
    const fontSize = raw['appearance.fontSize'];
    const language = raw['general.language'];
    const benchTarget = raw['benchmark.target'];
    const hiddenRaw = raw['presets.hidden'];
    const serversRaw = raw['dns.servers'];

    let servers: DnsConfig[] = defaults['dns.servers'];
    if (serversRaw !== undefined) {
        if (!Array.isArray(serversRaw)) {
            if (strict) {
                throw new Error('"dns.servers" must be an array');
            }
        } else {
            const valid: DnsConfig[] = [];
            for (const entry of serversRaw) {
                if (isDnsConfig(entry)) {
                    valid.push(entry);
                } else if (strict) {
                    throw new Error(
                        'One or more entries in "dns.servers" are invalid (check name and IPv4 addresses)'
                    );
                }
            }
            servers = normalizeServerList(valid);
        }
    }

    let hiddenPresets: string[] = defaults['presets.hidden'];
    if (Array.isArray(hiddenRaw)) {
        const seen = new Set<string>();
        hiddenPresets = [];
        for (const item of hiddenRaw) {
            if (typeof item === 'string') {
                const trimmed = item.trim();
                if (trimmed && trimmed.length <= 64 && !seen.has(trimmed)) {
                    seen.add(trimmed);
                    hiddenPresets.push(trimmed);
                }
            }
        }
    } else if (hiddenRaw !== undefined && strict) {
        throw new Error('"presets.hidden" must be an array of preset IDs');
    }

    const cleanTarget =
        typeof benchTarget === 'string' &&
        benchTarget.trim().length > 0 &&
        benchTarget.trim().length <= 2000
            ? benchTarget.trim()
            : defaults['benchmark.target'];

    return {
        'dnss.schemaVersion': SETTINGS_SCHEMA_VERSION,
        'appearance.theme':
            typeof theme === 'string' && VALID_THEMES.has(theme as ThemeSetting)
                ? (theme as ThemeSetting)
                : defaults['appearance.theme'],
        'appearance.accent':
            typeof accent === 'string' && HEX_COLOR_RE.test(accent.trim())
                ? accent.trim().toLowerCase()
                : defaults['appearance.accent'],
        'appearance.fontFamily':
            typeof fontFamily === 'string' &&
            VALID_FONTS.has(fontFamily as FontFamilySetting)
                ? (fontFamily as FontFamilySetting)
                : defaults['appearance.fontFamily'],
        'appearance.fontSize':
            typeof fontSize === 'number' &&
            VALID_FONT_SIZES.has(fontSize as FontSizeSetting)
                ? (fontSize as FontSizeSetting)
                : defaults['appearance.fontSize'],
        'general.language':
            typeof language === 'string' &&
            VALID_LANGUAGES.has(language as LanguageSetting)
                ? (language as LanguageSetting)
                : defaults['general.language'],
        'benchmark.target': cleanTarget,
        'presets.hidden': hiddenPresets,
        'dns.servers': servers,
    };
}

export function loadSettings(opts?: {
    skipLegacyConfigRead?: boolean;
}): AppSettings {
    if (!fs.existsSync(SETTINGS_PATH)) {
        const defaults = getDefaultSettings();
        if (!opts?.skipLegacyConfigRead) {
            defaults['dns.servers'] = normalizeServerList(
                loadConfigsFromLegacyStore()
            );
        }
        return defaults;
    }
    try {
        const data = fs.readFileSync(SETTINGS_PATH, 'utf-8').trim();
        if (!data) {
            const defaults = getDefaultSettings();
            if (!opts?.skipLegacyConfigRead) {
                defaults['dns.servers'] = normalizeServerList(
                    loadConfigsFromLegacyStore()
                );
            }
            return defaults;
        }
        const parsed: unknown = JSON.parse(data);
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)
        ) {
            try {
                safeBackupCopy(SETTINGS_PATH, `${SETTINGS_PATH}.corrupt`);
            } catch {
                // Best effort only.
            }
            const defaults = getDefaultSettings();
            if (!opts?.skipLegacyConfigRead) {
                defaults['dns.servers'] = normalizeServerList(
                    loadConfigsFromLegacyStore()
                );
            }
            return defaults;
        }
        const record = parsed as Record<string, unknown>;
        const normalized = normalizeSettingsRecord(record, false);
        if (
            !Array.isArray(record['dns.servers']) &&
            !opts?.skipLegacyConfigRead
        ) {
            normalized['dns.servers'] = normalizeServerList(
                loadConfigsFromLegacyStore()
            );
        }
        return normalized;
    } catch {
        try {
            safeBackupCopy(SETTINGS_PATH, `${SETTINGS_PATH}.corrupt`);
        } catch {
            // Best effort only.
        }
        const defaults = getDefaultSettings();
        if (!opts?.skipLegacyConfigRead) {
            defaults['dns.servers'] = normalizeServerList(
                loadConfigsFromLegacyStore()
            );
        }
        return defaults;
    }
}

export function saveSettings(settings: AppSettings): AppSettings {
    const normalized = normalizeSettingsRecord(
        settings as unknown as Record<string, unknown>,
        true
    );
    writeJsonTarget(SETTINGS_PATH, JSON.stringify(normalized, null, 2));
    writeConfigFile(JSON.stringify(normalized['dns.servers'], null, 2));
    return normalized;
}

export function exportSettingsJson(): string {
    return JSON.stringify(loadSettings(), null, 2);
}

export function importSettingsJson(rawJson: string): AppSettings {
    if (Buffer.byteLength(rawJson, 'utf-8') > MAX_SETTINGS_IMPORT_BYTES) {
        throw new Error('Settings file exceeds 512 KiB size limit');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawJson);
    } catch (error) {
        throw new Error(`Invalid JSON: ${String(error)}`);
    }
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error('Settings JSON must be an object');
    }
    const normalized = normalizeSettingsRecord(
        parsed as Record<string, unknown>,
        true
    );
    return saveSettings(normalized);
}

export function upsertConfig(config: DnsConfig): DnsConfig[] {
    const configs = loadConfigs();
    const trimmedName = config.name.trim();
    const existingIndex = configs.findIndex(
        (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    const entry: DnsConfig = {
        id:
            config.id ??
            (existingIndex >= 0 ? configs[existingIndex].id : undefined),
        name: trimmedName,
        primary: config.primary.trim(),
        alternative: config.alternative?.trim() || undefined,
    };
    if (existingIndex >= 0) {
        configs[existingIndex] = entry;
    } else {
        configs.push(entry);
    }
    const persisted = normalizeServerList(configs);
    saveConfigs(persisted);
    return persisted;
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
        (config.id !== undefined &&
            config.id !== null &&
            typeof config.id !== 'string') ||
        (config.alternative !== undefined &&
            config.alternative !== null &&
            typeof config.alternative !== 'string')
    ) {
        return false;
    }
    const trimmedName = config.name.trim();
    if (trimmedName.length === 0 || [...trimmedName].length > MAX_NAME_LEN) {
        return false;
    }
    const alt =
        typeof config.alternative === 'string' ? config.alternative.trim() : '';
    // Persisted data is user-controlled: never trust it without validating
    // the addresses, since these values are later handed to OS commands.
    return validateIPv4(config.primary) && (alt === '' || validateIPv4(alt));
}
