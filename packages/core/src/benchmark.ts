import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';

import type { DnsBenchmarkResult, DnsPreset } from './types';

/**
 * DNS latency benchmark.
 *
 * Algorithm ported from the open-source DnsChanger desktop app
 * (https://github.com/DnsChanger/dnsChanger-desktop), MIT licensed.
 * For each server it measures the time to resolve a hostname through that
 * specific DNS server, then the time to fetch a small page from the resolved
 * IP. Servers that return 403 are flagged as "blocked" (useful for
 * sanction/censorship circumvention presets).
 */

const DEFAULT_TIMEOUT = 6000;
const DEFAULT_CONCURRENCY = 6;

interface ParsedTarget {
    hostname: string;
    path: string;
    isHttps: boolean;
}

function parseTargetUrl(target: string): ParsedTarget {
    const normalized = /^https?:\/\//i.test(target)
        ? target
        : `https://${target}`;
    const url = new URL(normalized);

    return {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}` || '/',
        isHttps: url.protocol === 'https:',
    };
}

function resolveWithServer(
    nameServers: string[],
    hostname: string,
    timeout: number
): Promise<{ address: string; time: number }> {
    return new Promise((resolve, reject) => {
        const resolver = new dns.Resolver({ timeout });
        resolver.setServers(nameServers);

        const started = Date.now();
        const timer = setTimeout(() => {
            resolver.cancel();
            reject(new Error('DNS_TIMEOUT'));
        }, timeout);

        resolver.resolve4(hostname, (err, addresses) => {
            clearTimeout(timer);
            if (err) return reject(err);
            if (!addresses?.length) return reject(new Error('DNS_NO_ANSWER'));
            resolve({ address: addresses[0], time: Date.now() - started });
        });
    });
}

function requestThroughIp(
    ip: string,
    hostname: string,
    targetPath: string,
    isHttps: boolean,
    timeout: number
): Promise<{ statusCode: number; time: number }> {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const client = isHttps ? https : http;

        const req = client.request(
            {
                host: ip,
                port: isHttps ? 443 : 80,
                path: targetPath,
                method: 'GET',
                headers: { Host: hostname, Connection: 'close' },
                servername: hostname,
                timeout,
            },
            (res) => {
                resolve({
                    statusCode: res.statusCode || 0,
                    time: Date.now() - started,
                });
                res.destroy();
            }
        );

        req.on('timeout', () => req.destroy(new Error('REQUEST_TIMEOUT')));
        req.on('error', reject);
        req.end();
    });

    // NOTE: certificate verification is intentionally left enabled (default).
    // We connect to the resolved IP but send the correct SNI (hostname), so a
    // legitimate resolver will present a certificate matching the hostname.
    // A MITM or a malicious resolver will fail TLS validation, which we report
    // as a benchmark error instead of silently trusting the connection.
}

export async function benchmarkPreset(
    preset: DnsPreset,
    targetUrl: string,
    timeout: number = DEFAULT_TIMEOUT
): Promise<DnsBenchmarkResult> {
    const base = { id: preset.id, name: preset.name, primary: preset.primary };
    const nameServers = [preset.primary, preset.alternative].filter(
        (s): s is string => Boolean(s)
    );

    if (nameServers.length === 0) {
        return {
            ...base,
            latencyMs: -1,
            status: 'error',
            error: 'No DNS address',
        };
    }

    let target: ParsedTarget;
    try {
        target = parseTargetUrl(targetUrl);
    } catch {
        return {
            ...base,
            latencyMs: -1,
            status: 'error',
            error: 'Invalid target URL',
        };
    }

    let resolved: { address: string; time: number };
    try {
        resolved = await resolveWithServer(
            nameServers,
            target.hostname,
            timeout
        );
    } catch {
        return {
            ...base,
            latencyMs: -1,
            status: 'timeout',
            error: 'DNS resolve failed',
        };
    }

    try {
        const response = await requestThroughIp(
            resolved.address,
            target.hostname,
            target.path,
            target.isHttps,
            timeout
        );
        const latencyMs = resolved.time + response.time;

        if (response.statusCode === 403) {
            return {
                ...base,
                latencyMs,
                status: 'error',
                error: 'Blocked (403)',
            };
        }
        if (response.statusCode >= 500 || response.statusCode === 0) {
            return {
                ...base,
                latencyMs,
                status: 'error',
                error: `Server error (${response.statusCode})`,
            };
        }
        return { ...base, latencyMs, status: 'ok' };
    } catch {
        return {
            ...base,
            latencyMs: resolved.time,
            status: 'error',
            error: 'Request failed',
        };
    }
}

/**
 * Benchmark multiple presets with bounded concurrency and sort the results:
 * working servers first (fastest first), then broken ones.
 */
export async function benchmarkPresets(
    presets: DnsPreset[],
    targetUrl: string,
    concurrency: number = DEFAULT_CONCURRENCY
): Promise<DnsBenchmarkResult[]> {
    const results: DnsBenchmarkResult[] = [];
    const queue = [...presets];

    async function worker(): Promise<void> {
        let preset = queue.shift();
        while (preset) {
            results.push(await benchmarkPreset(preset, targetUrl));
            preset = queue.shift();
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, presets.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return results.sort((a, b) => {
        if (a.status === 'ok' && b.status !== 'ok') return -1;
        if (a.status !== 'ok' && b.status === 'ok') return 1;
        return a.latencyMs - b.latencyMs;
    });
}
