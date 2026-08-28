/**
 * Type-safe wrappers around the Tauri backend commands.
 */
import { invoke } from '@tauri-apps/api/core';

export interface Adapter {
    name: string;
    kind: string;
    is_default: boolean;
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

async function invokeCommand<T>(
    cmd: string,
    args?: Record<string, unknown>
): Promise<T> {
    return invoke<T>(cmd, args);
}

export const api = {
    listAdapters: (): Promise<Adapter[]> =>
        invokeCommand<Adapter[]>('list_adapters'),

    getActiveDns: (adapter: string | null): Promise<DnsStatus> =>
        invokeCommand<DnsStatus>('get_active_dns', { adapter }),

    /** Empty servers array => back to DHCP */
    setDns: (adapter: string, servers: string[]): Promise<void> =>
        invokeCommand<void>('set_dns', { adapter, servers }),

    resetAll: (): Promise<void> => invokeCommand<void>('reset_all_dns'),

    flushDns: (): Promise<void> => invokeCommand<void>('flush_dns'),

    detectDefaultAdapter: (): Promise<string | null> =>
        invokeCommand<string | null>('detect_default_adapter'),

    /** Saved custom servers, persisted in ~/.dnss/configs.json (shared with the CLI) */
    getConfigs: (): Promise<DnsConfig[]> =>
        invokeCommand<DnsConfig[]>('get_configs'),

    saveConfigs: (configs: DnsConfig[]): Promise<DnsConfig[]> =>
        invokeCommand<DnsConfig[]>('save_configs', { configs }),

    benchmarkDns: (server: string): Promise<BenchmarkSample> =>
        invokeCommand<BenchmarkSample>('benchmark_dns', { server }),
};
