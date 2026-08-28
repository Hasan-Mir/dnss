export type OsType = 'windows' | 'mac' | 'linux';

/**
 * A user-saved or preset DNS configuration.
 */
export interface DnsConfig {
    name: string;
    primary: string;
    alternative?: string;
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
