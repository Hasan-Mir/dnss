/**
 * Type-safe wrappers around the Tauri backend commands.
 */
import { invoke } from '@tauri-apps/api/core';

export interface Adapter {
    name: string;
    kind: string;
    is_default: boolean;
    /** Servers the adapter currently resolves through (static or
        DHCP-provided); empty when none are known. */
    dns_servers: string[];
    /** True when the servers were pinned statically, false for DHCP. */
    dns_static: boolean;
}

export interface DnsStatus {
    /** Servers configured as static on the interface (empty = DHCP) */
    static_servers: string[];
    /** Servers currently in use (from DHCP when no static config) */
    in_use: string[];
}

export interface BenchmarkSample {
    /** DNS resolve round-trip in ms */
    resolve_ms: number;
    /** TCP connect time to the resolved IP in ms, null when it failed */
    connect_ms: number | null;
    /** First resolved IPv4 address */
    address: string;
}

export interface DnsConfig {
    name: string;
    primary: string;
    alternative?: string;
}

/** Adapters + default-route adapter + its DNS status, one round trip. */
export interface NetworkStatus {
    adapters: Adapter[];
    default_adapter: string | null;
    active_dns: DnsStatus | null;
}

/** Per-adapter result of a bulk DNS change. */
export interface SetDnsOutcome {
    adapter: string;
    ok: boolean;
    error: string;
}

/**
 * True when this page runs inside the DNSS desktop window, where Tauri
 * injects its IPC bridge. When the frontend is opened in a regular browser
 * (e.g. http://localhost:1420 in VS Code's simple browser) the bridge does
 * not exist and every invoke() would fail with
 * "Cannot read properties of undefined (reading 'invoke')".
 */
export function isDesktopApp(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invokeCommand<T>(
    cmd: string,
    args?: Record<string, unknown>
): Promise<T> {
    if (!isDesktopApp()) {
        throw new Error(
            'DNSS is running outside its desktop window. Start the app with `npm run tauri dev` (or the installed DNSS app) instead of opening localhost in a browser.'
        );
    }
    return invoke<T>(cmd, args);
}

/**
 * Open a URL in the user's real browser. The Tauri webview cannot navigate
 * to external sites itself (a plain <a target="_blank"> is silently
 * swallowed), so inside the desktop window the OS opener plugin handles it.
 */
export async function openExternal(url: string): Promise<void> {
    if (!isDesktopApp()) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
    }
    try {
        await invokeCommand('plugin:opener|open_url', { url });
    } catch (error) {
        // Best effort only: in the desktop window window.open is a no-op,
        // but the failure is at least visible in the devtools console.
        console.error('Failed to open URL:', error);
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

export const api = {
    /** Adapters, the default-route adapter and its DNS status in one call
        (one OS process instead of four on Windows). */
    getNetworkStatus: (): Promise<NetworkStatus> =>
        invokeCommand<NetworkStatus>('get_network_status'),

    /** Apply `servers` to the named adapters; `null` targets every adapter.
        Empty servers => back to DHCP. Per-adapter outcomes keep one failed
        adapter from hiding the success of the others. */
    setDnsMany: (
        adapters: string[] | null,
        servers: string[]
    ): Promise<SetDnsOutcome[]> =>
        invokeCommand<SetDnsOutcome[]>('set_dns_many', { adapters, servers }),

    /** Reset every adapter to DHCP. */
    resetAll: (): Promise<SetDnsOutcome[]> =>
        invokeCommand<SetDnsOutcome[]>('reset_all_dns'),

    flushDns: (): Promise<void> => invokeCommand<void>('flush_dns'),

    /** Saved custom servers, persisted in ~/.dnss/configs.json (shared with the CLI) */
    getConfigs: (): Promise<DnsConfig[]> =>
        invokeCommand<DnsConfig[]>('get_configs'),

    saveConfigs: (configs: DnsConfig[]): Promise<DnsConfig[]> =>
        invokeCommand<DnsConfig[]>('save_configs', { configs }),

    /** Benchmark one DNS server against a target URL (same as the CLI's benchmark). */
    benchmarkDns: (server: string, target: string): Promise<BenchmarkSample> =>
        invokeCommand<BenchmarkSample>('benchmark_dns', { server, target }),
};
