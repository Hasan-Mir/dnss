import { useCallback, useEffect, useState } from 'react';
import { DNS_PRESETS, type DnsPreset } from '@dnss/core/presets';
import { validateIPv4 } from '@dnss/core/validate';
import { api, type DnsConfig } from '../api';

interface PingState {
    status: 'idle' | 'testing' | 'ok' | 'timeout' | 'error';
    latencyMs?: number;
    error?: string;
}

interface ServersPageProps {
    busy: boolean;
    onApply: (servers: string[]) => void;
    showToast: (message: string) => void;
}

export default function ServersPage({
    busy,
    onApply,
    showToast,
}: ServersPageProps) {
    const [custom, setCustom] = useState<DnsConfig[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [name, setName] = useState('');
    const [primary, setPrimary] = useState('');
    const [alternative, setAlternative] = useState('');
    const [pings, setPings] = useState<Record<string, PingState>>({});
    const [benchmarking, setBenchmarking] = useState(false);

    // Custom servers live in ~/.dnss/configs.json (shared with the CLI),
    // not in webview localStorage.
    useEffect(() => {
        api.getConfigs()
            .then(setCustom)
            .catch((error) =>
                showToast(`Failed to load saved servers: ${String(error)}`)
            );
    }, [showToast]);

    // Stable, content-derived keys: a bare index key ("custom-0") makes
    // benchmark results latch onto the WRONG server after removing an entry
    // that is not the last one. Keeping the index in the key still resets
    // stale results when the list shifts (they render as idle, never
    // misattributed).
    const entries = [
        ...DNS_PRESETS.map((p) => ({
            key: p.id,
            preset: p,
            custom: false,
            customIndex: -1,
        })),
        ...custom.map((c, i) => {
            const preset: DnsPreset = {
                id: `custom-${i}`,
                name: c.name,
                primary: c.primary,
                alternative: c.alternative,
                description: undefined,
            };
            return {
                key: `custom:${i}:${c.name}:${c.primary}:${c.alternative ?? ''}`,
                preset,
                custom: true,
                customIndex: i,
            };
        }),
    ];

    // Persist first, update state only on success: an optimistic update made
    // entries that failed to save look stored (and applyable) until reload.
    const persist = useCallback(
        async (servers: DnsConfig[]) => {
            try {
                const saved = await api.saveConfigs(servers);
                setCustom(saved);
                return true;
            } catch (error) {
                showToast(`Failed to save: ${String(error)}`);
                return false;
            }
        },
        [showToast]
    );

    // Bounded concurrency runner: firing one IPC per entry all at once
    // would spawn that many blocking threads and sockets on the backend.
    const runBounded = async (items: typeof entries) => {
        const concurrency = Math.min(4, items.length);
        const queue = [...items];
        const worker = async () => {
            let entry = queue.shift();
            while (entry) {
                const { key, preset } = entry;
                try {
                    // The backend hardcodes the probe hostname/port on purpose.
                    const sample = await api.benchmarkDns(preset.primary);
                    setPings((prev) => ({
                        ...prev,
                        [key]: {
                            status: 'ok',
                            latencyMs:
                                sample.resolve_ms + (sample.connect_ms ?? 0),
                        },
                    }));
                } catch (error) {
                    const message = String(error);
                    // Backend refusals (invalid server, suspicious resolved
                    // address) are errors, not timeouts.
                    const isTimeout = /timed?\s?out|timeout/i.test(message);
                    setPings((prev) => ({
                        ...prev,
                        [key]: {
                            status: isTimeout ? 'timeout' : 'error',
                            error: message,
                        },
                    }));
                }
                entry = queue.shift();
            }
        };
        await Promise.all(
            Array.from({ length: Math.max(1, concurrency) }, () => worker())
        );
    };

    const runBenchmark = useCallback(async () => {
        setBenchmarking(true);
        setPings(
            Object.fromEntries(
                entries.map((e) => [e.key, { status: 'testing' as const }])
            )
        );
        await runBounded(entries);
        setBenchmarking(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries.map((e) => e.key).join(',')]);

    const addCustom = async () => {
        const trimmedName = name.trim();
        const trimmedPrimary = primary.trim();
        const trimmedAlternative = alternative.trim();
        if (!trimmedName || !trimmedPrimary) {
            showToast('Name and primary DNS are required');
            return;
        }
        // Validate locally so obviously wrong input never reaches the
        // backend (which would reject the whole save).
        if (!validateIPv4(trimmedPrimary)) {
            showToast('Primary DNS must be a valid IPv4 address');
            return;
        }
        if (trimmedAlternative && !validateIPv4(trimmedAlternative)) {
            showToast('Alternative DNS must be a valid IPv4 address');
            return;
        }
        if (
            custom.some(
                (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
            )
        ) {
            showToast(`A server named "${trimmedName}" already exists`);
            return;
        }
        const saved = await persist([
            ...custom,
            {
                name: trimmedName,
                primary: trimmedPrimary,
                alternative: trimmedAlternative || undefined,
            },
        ]);
        if (!saved) {
            return;
        }
        setName('');
        setPrimary('');
        setAlternative('');
        setShowAdd(false);
        showToast(`Added "${trimmedName}"`);
    };

    const removeCustom = async (index: number) => {
        await persist(custom.filter((_, i) => i !== index));
    };

    return (
        <div className="page servers-page">
            <div className="page-header">
                <h2>Servers</h2>
                <div className="header-actions">
                    <button
                        className="btn secondary"
                        onClick={runBenchmark}
                        disabled={benchmarking}
                    >
                        {benchmarking ? 'Benchmarking…' : 'Benchmark all'}
                    </button>
                    <button
                        className="btn"
                        onClick={() => setShowAdd((v) => !v)}
                    >
                        {showAdd ? 'Cancel' : '+ Add custom'}
                    </button>
                </div>
            </div>

            {showAdd && (
                <div className="card add-form">
                    <input
                        className="input"
                        placeholder="Name (e.g. My provider)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        className="input"
                        placeholder="Primary DNS (IPv4)"
                        value={primary}
                        onChange={(e) => setPrimary(e.target.value)}
                    />
                    <input
                        className="input"
                        placeholder="Alternative DNS (optional)"
                        value={alternative}
                        onChange={(e) => setAlternative(e.target.value)}
                    />
                    <button className="btn" onClick={addCustom}>
                        Save
                    </button>
                </div>
            )}

            <div className="server-grid">
                {entries.map(({ key, preset, custom, customIndex }) => {
                    const ping = pings[key];
                    return (
                        <div className="card server-card" key={key}>
                            <div className="server-info">
                                <div className="server-name">{preset.name}</div>
                                <div className="server-addr">
                                    {preset.primary}
                                    {preset.alternative
                                        ? ` · ${preset.alternative}`
                                        : ''}
                                </div>
                                {preset.description && (
                                    <div className="server-desc">
                                        {preset.description}
                                    </div>
                                )}
                            </div>
                            <div className="server-side">
                                <span
                                    className={`badge ${
                                        ping?.status === 'ok'
                                            ? 'badge-ok'
                                            : ping?.status === 'testing'
                                              ? 'badge-testing'
                                              : ping?.status === 'error'
                                                ? 'badge-error'
                                                : 'badge-idle'
                                    }`}
                                    title={ping?.error || undefined}
                                >
                                    {ping?.status === 'ok'
                                        ? `${ping.latencyMs} ms`
                                        : ping?.status === 'testing'
                                          ? '…'
                                          : ping?.status === 'timeout'
                                            ? 'timeout'
                                            : ping?.status === 'error'
                                              ? 'error'
                                              : 'ping'}
                                </span>
                                <button
                                    className="btn small"
                                    disabled={busy}
                                    onClick={() =>
                                        onApply(
                                            [
                                                preset.primary,
                                                preset.alternative,
                                            ].filter((s): s is string =>
                                                Boolean(s)
                                            )
                                        )
                                    }
                                >
                                    Apply
                                </button>
                                {custom && (
                                    <button
                                        className="icon-btn danger"
                                        title="Remove"
                                        onClick={() =>
                                            removeCustom(customIndex)
                                        }
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
