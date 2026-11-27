export type OsType = 'windows' | 'mac' | 'linux';

/**
 * A user-saved or preset DNS configuration.
 */
export interface DnsConfig {
    /** Stable slug identifier (e.g. "office-dns"), auto-generated when omitted. */
    id?: string;
    name: string;
    primary: string;
    alternative?: string;
}

export type ThemeSetting = 'light' | 'dark' | 'system';
export type FontFamilySetting =
    'google-sans' | 'inter' | 'dm-sans' | 'manrope' | 'roboto';
export type FontSizeSetting = 12 | 14 | 16;
export type LanguageSetting = 'en' | 'fa';

/**
 * Unified VS Code-style settings schema persisted in `~/.dnss/settings.json`
 * and shared between the desktop GUI and CLI.
 */
export interface AppSettings {
    'dnss.schemaVersion': number;
    'appearance.theme': ThemeSetting;
    'appearance.accent': string;
    'appearance.fontFamily': FontFamilySetting;
    'appearance.fontSize': FontSizeSetting;
    'general.language': LanguageSetting;
    'benchmark.target': string;
    'presets.hidden': string[];
    'dns.servers': DnsConfig[];
}

/**
 * A built-in DNS server preset.
 */
export interface DnsPreset {
    id: string;
    name: string;
    primary: string;
    alternative?: string;
    /** Short description, e.g. "Malware blocking" */
    description?: string;
    tags?: string[];
}

/**
 * Result of benchmarking a single DNS preset.
 */
export interface DnsBenchmarkResult {
    id: string;
    name: string;
    primary: string;
    /** Round-trip DNS resolve latency in ms, -1 when the lookup failed */
    latencyMs: number;
    status: 'ok' | 'timeout' | 'error';
    error?: string;
}
