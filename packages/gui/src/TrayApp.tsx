import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    BoltIcon,
    CheckCircleIcon,
    CheckIcon,
    CircleStackIcon,
    ComputerDesktopIcon,
    ExclamationTriangleIcon,
    MagnifyingGlassIcon,
    MoonIcon,
    PlusIcon,
    PowerIcon,
    ShieldCheckIcon,
    SignalIcon,
    SunIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { DNS_PRESETS } from '@seymi/dnss-core/presets';
import { validateIPv4 } from '@seymi/dnss-core/validate';
import {
    api,
    isDesktopApp,
    type Adapter,
    type DnsConfig,
    type DnsStatus,
} from './api';
import CustomSelect, { type SelectOption } from './components/CustomSelect';
import {
    ACCENT_KEY,
    FONT_KEY,
    FONT_SIZE_KEY,
    THEME_KEY,
    applyAccent,
    applyFontFamily,
    applyFontSize,
    applyTheme,
    getResolvedTheme,
    loadAccent,
    loadFontFamily,
    loadFontSize,
    loadTheme,
    saveTheme,
    watchSystemTheme,
    type ThemeMode,
} from './theme';
import { applyLang, createI18n, loadLang, saveLang, type Lang } from './i18n';
import appIcon from './assets/app-icon.png';

const HIDDEN_PRESETS_KEY = 'dnss.hiddenPresets';
const DEFAULT_BENCHMARK_TARGET = 'https://www.cloudflare.com';
const MIN_BUSY_MS = 500;
const VPN_ADAPTER_RE =
    /tun|singbox|sing-box|clash|mihomo|v2ray|xray|wireguard|openvpn|warp|wintun|tailscale|nekoray/i;

type BusyOp =
    | { kind: 'apply'; id: string }
    | { kind: 'flush' }
    | { kind: 'toggle' }
    | null;

interface PingState {
    status: 'testing' | 'ok' | 'timeout' | 'error';
    latencyMs?: number;
    resolveMs?: number;
    connectMs?: number;
    address?: string;
    error?: string;
}

interface TrayEntry {
    key: string;
    name: string;
    primary: string;
    alternative?: string;
    custom: boolean;
}

function loadHiddenPresets(): string[] {
    try {
        const parsed: unknown = JSON.parse(
            localStorage.getItem(HIDDEN_PRESETS_KEY) ?? '[]'
        );
        return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === 'string')
            : [];
    } catch {
        return [];
    }
}

const withMinDuration = async <T,>(
    promise: Promise<T>,
    minMs: number
): Promise<T> => {
    const [result] = await Promise.all([
        promise,
        new Promise((resolve) => setTimeout(resolve, minMs)),
    ]);
    return result;
};

export default function TrayApp() {
    const [trayListRef] = useAutoAnimate<HTMLUListElement>({
        duration: 220,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });

    const [theme, setTheme] = useState<ThemeMode>(loadTheme);
    const [lang, setLang] = useState<Lang>(loadLang);
    const [adapters, setAdapters] = useState<Adapter[]>([]);
    const [activeAdapter, setActiveAdapter] = useState<Adapter | null>(null);
    const [activeDns, setActiveDns] = useState<DnsStatus | null>(null);
    const [configs, setConfigs] = useState<DnsConfig[]>([]);
    const [hiddenPresets, setHiddenPresets] =
        useState<string[]>(loadHiddenPresets);
    // '__active__' = default-route adapter, '__all__' = all adapters, or an exact adapter name
    const [targetMode, setTargetMode] = useState<string>('__active__');
    const [search, setSearch] = useState('');
    const [pings, setPings] = useState<Record<string, PingState>>({});
    const [sortPings, setSortPings] = useState<Record<string, PingState>>({});
    const [benchmarking, setBenchmarking] = useState(false);
    const [sortByLatency, setSortByLatency] = useState(false);
    const [pinned, setPinned] = useState(false);

    useEffect(() => {
        if (!isDesktopApp()) return;
        let disposed = false;
        void api
            .getTrayPinned()
            .then((val) => {
                if (!disposed) setPinned(val);
            })
            .catch(() => {});
        return () => {
            disposed = true;
        };
    }, []);

    // Inline "+ Custom" server drawer inside the tray popover
    const [customOpen, setCustomOpen] = useState(false);
    const [customName, setCustomName] = useState('');
    const [customPrimary, setCustomPrimary] = useState('');
    const [customAlt, setCustomAlt] = useState('');
    const [savingCustom, setSavingCustom] = useState(false);

    const [busyOp, setBusyOp] = useState<BusyOp>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [toast, setToast] = useState<{
        message: string;
        kind: 'success' | 'error';
    } | null>(null);
    const toastTimer = useRef<number | null>(null);
    const benchRunIdRef = useRef(0);

    const i18n = useMemo(() => createI18n(lang), [lang]);
    const { t, num } = i18n;
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        applyTheme(theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => {
        return watchSystemTheme(() => {
            applyTheme(loadTheme());
        });
    }, []);

    useEffect(() => {
        applyLang(lang);
        saveLang(lang);
    }, [lang]);

    // Sync all appearance & preference changes from the main window.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === THEME_KEY) {
                setTheme(loadTheme());
            } else if (e.key === 'dnss.lang') {
                setLang(loadLang());
            } else if (e.key === FONT_KEY) {
                applyFontFamily(loadFontFamily());
            } else if (e.key === FONT_SIZE_KEY) {
                applyFontSize(loadFontSize());
            } else if (e.key === ACCENT_KEY) {
                applyAccent(loadAccent());
            } else if (e.key === HIDDEN_PRESETS_KEY) {
                setHiddenPresets(loadHiddenPresets());
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Escape closes inline custom form first, otherwise hides the tray popover.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (customOpen) {
                setCustomOpen(false);
                return;
            }
            if (!pinned && isDesktopApp()) {
                void api.hideTrayWindow();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [customOpen, pinned]);

    const showToast = useCallback(
        (message: string, kind: 'success' | 'error' = 'success') => {
            if (toastTimer.current !== null) {
                window.clearTimeout(toastTimer.current);
            }
            setToast({ message, kind });
            toastTimer.current = window.setTimeout(() => {
                toastTimer.current = null;
                setToast(null);
            }, 3400);
        },
        []
    );

    const togglePin = useCallback(() => {
        const next = !pinned;
        if (!isDesktopApp()) {
            setPinned(next);
            return;
        }
        void api
            .setTrayPinned(next)
            .then((confirmed) => setPinned(confirmed))
            .catch((err) => showToast(String(err), 'error'));
    }, [pinned, showToast]);

    useEffect(() => {
        return () => {
            if (toastTimer.current !== null) {
                window.clearTimeout(toastTimer.current);
            }
        };
    }, []);

    const refreshSeq = useRef(0);

    const refreshAll = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!isDesktopApp()) return;
            const seq = ++refreshSeq.current;
            if (!opts?.silent) {
                setRefreshing(true);
            }
            try {
                const [status, saved] = await Promise.all([
                    api.getNetworkStatus(),
                    api.getConfigs(),
                ]);
                if (seq !== refreshSeq.current) return;
                const active = status.default_adapter
                    ? (status.adapters.find(
                          (a) => a.name === status.default_adapter
                      ) ??
                      status.adapters.find((a) => a.is_default) ??
                      null)
                    : (status.adapters.find((a) => a.is_default) ?? null);
                setAdapters(status.adapters);
                setActiveAdapter(active);
                setActiveDns(status.active_dns);
                setConfigs(saved);
            } catch (error) {
                if (seq !== refreshSeq.current) return;
                showToast(
                    tRef.current('toast.failed', { details: String(error) }),
                    'error'
                );
            } finally {
                if (seq === refreshSeq.current) {
                    setRefreshing(false);
                }
            }
        },
        [showToast]
    );

    useEffect(() => {
        if (!isDesktopApp()) return;
        void refreshAll();
    }, [refreshAll]);

    // Stay synchronized with main window & refresh whenever popover opens/focuses.
    useEffect(() => {
        if (!isDesktopApp()) return;
        let disposed = false;
        let unlisten: (() => void) | null = null;

        void listen('dnss:state-changed', () => {
            void refreshAll({ silent: true });
        })
            .then((fn) => {
                if (disposed) fn();
                else unlisten = fn;
            })
            .catch(() => {});

        const onFocus = () => {
            setHiddenPresets(loadHiddenPresets());
            applyFontFamily(loadFontFamily());
            applyFontSize(loadFontSize());
            applyAccent(loadAccent());
            void refreshAll({ silent: true });
        };
        window.addEventListener('focus', onFocus);

        return () => {
            disposed = true;
            unlisten?.();
            window.removeEventListener('focus', onFocus);
        };
    }, [refreshAll]);

    const dnsMemoryKey = (adapter: string) => `dnss.lastDns.${adapter}`;

    const readDnsMemory = useCallback((adapter: string | null): string[] => {
        if (!adapter) return [];
        try {
            const parsed: unknown = JSON.parse(
                localStorage.getItem(dnsMemoryKey(adapter)) ?? 'null'
            );
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((s): s is string => typeof s === 'string')
                .map((s) => s.trim())
                .filter((s) => s !== '' && validateIPv4(s));
        } catch {
            return [];
        }
    }, []);

    useEffect(() => {
        if (
            activeAdapter &&
            activeDns &&
            activeDns.static_servers.length > 0 &&
            activeDns.static_servers.every(validateIPv4)
        ) {
            localStorage.setItem(
                dnsMemoryKey(activeAdapter.name),
                JSON.stringify(activeDns.static_servers)
            );
        }
    }, [activeAdapter, activeDns]);

    const rememberedServers = useMemo(
        () => readDnsMemory(activeAdapter?.name ?? null),
        [activeAdapter, activeDns, readDnsMemory]
    );

    const dnsNameLookup = useMemo(() => {
        const lookup = new Map<string, string>();
        const add = (address: string | undefined, name: string) => {
            if (address && !lookup.has(address)) {
                lookup.set(address, name);
            }
        };
        for (const c of configs) {
            add(c.primary, c.name);
            add(c.alternative, c.name);
        }
        for (const p of DNS_PRESETS) {
            add(p.primary, p.name);
            add(p.alternative, p.name);
        }
        return lookup;
    }, [configs]);

    const applyServers = useCallback(
        async (
            servers: string[],
            targets: 'all' | string[],
            op: NonNullable<BusyOp>
        ) => {
            try {
                setBusyOp(op);
                const outcomes = await api.setDnsMany(
                    targets === 'all' ? null : targets,
                    servers
                );
                if (outcomes.length === 0) {
                    showToast(t('toast.noAdaptersToConfigure'), 'error');
                    return;
                }
                const failures = outcomes.filter((o) => !o.ok);
                if (failures.length > 0) {
                    showToast(
                        t('toast.failed', {
                            details: failures
                                .map(
                                    (f) =>
                                        `${f.adapter}: ${f.error || 'Unknown error'}`
                                )
                                .join('; '),
                        }),
                        'error'
                    );
                } else {
                    const first = outcomes[0];
                    showToast(
                        servers.length > 0
                            ? outcomes.length === 1
                                ? t('toast.appliedOne', {
                                      adapter: first.adapter,
                                  })
                                : t('toast.appliedMany', {
                                      count: outcomes.length,
                                  })
                            : outcomes.length === 1
                              ? t('toast.dhcpOne', { adapter: first.adapter })
                              : t('toast.dhcpMany', {
                                    count: outcomes.length,
                                })
                    );
                }
                await refreshAll({ silent: true });
            } catch (error) {
                showToast(
                    t('toast.failed', { details: String(error) }),
                    'error'
                );
            } finally {
                setBusyOp(null);
            }
        },
        [refreshAll, showToast, t]
    );

    const effectiveTargetMode =
        targetMode === '__active__' ||
        targetMode === '__all__' ||
        adapters.some((a) => a.name === targetMode)
            ? targetMode
            : '__active__';

    const adapterOptions: SelectOption<string>[] = useMemo(
        () => [
            {
                value: '__active__',
                label: activeAdapter
                    ? t('tray.targetActive', { name: activeAdapter.name })
                    : t('home.noActiveAdapter'),
            },
            {
                value: '__all__',
                label: t('tray.targetAll', { count: num(adapters.length) }),
            },
            ...adapters.map((a) => ({
                value: a.name,
                label: a.name,
                badge: a.is_default ? t('common.default') : undefined,
            })),
        ],
        [activeAdapter, adapters, t, num]
    );

    const resolveTargets = useCallback((): 'all' | string[] => {
        if (effectiveTargetMode === '__all__') return 'all';
        if (effectiveTargetMode === '__active__') {
            const name = activeAdapter?.name ?? adapters[0]?.name;
            return name ? [name] : 'all';
        }
        return [effectiveTargetMode];
    }, [effectiveTargetMode, activeAdapter, adapters]);

    const handleToggle = useCallback(async () => {
        if (!activeAdapter || !activeDns) {
            showToast(t('toast.noActiveAdapter'), 'error');
            return;
        }
        if (activeDns.static_servers.length > 0) {
            localStorage.setItem(
                dnsMemoryKey(activeAdapter.name),
                JSON.stringify(activeDns.static_servers)
            );
            await applyServers([], [activeAdapter.name], { kind: 'toggle' });
        } else {
            const servers = readDnsMemory(activeAdapter.name);
            if (servers.length === 0) {
                showToast(t('toast.noRememberedDns'), 'error');
                return;
            }
            await applyServers(servers, [activeAdapter.name], {
                kind: 'toggle',
            });
        }
    }, [activeAdapter, activeDns, applyServers, readDnsMemory, showToast, t]);

    const handleFlush = useCallback(async () => {
        try {
            setBusyOp({ kind: 'flush' });
            await withMinDuration(api.flushDns(), MIN_BUSY_MS);
            showToast(t('toast.flushed'));
        } catch (error) {
            showToast(
                t('toast.flushFailed', { error: String(error) }),
                'error'
            );
        } finally {
            setBusyOp(null);
        }
    }, [showToast, t]);

    const getBenchmarkTarget = () =>
        localStorage.getItem('dnss.benchmarkTarget')?.trim() ||
        DEFAULT_BENCHMARK_TARGET;

    const pingEntry = useCallback(async (entry: TrayEntry) => {
        const target = getBenchmarkTarget();
        setPings((prev) => ({ ...prev, [entry.key]: { status: 'testing' } }));
        try {
            const sample = await api.benchmarkDns(entry.primary, target);
            if (sample.connect_ms === null) {
                setPings((prev) => ({
                    ...prev,
                    [entry.key]: {
                        status: 'error',
                        resolveMs: sample.resolve_ms,
                        address: sample.address,
                        error: `Resolved ${sample.address} in ${sample.resolve_ms} ms, but TCP connect failed`,
                    },
                }));
            } else {
                setPings((prev) => ({
                    ...prev,
                    [entry.key]: {
                        status: 'ok',
                        latencyMs: sample.resolve_ms + sample.connect_ms!,
                        resolveMs: sample.resolve_ms,
                        connectMs: sample.connect_ms!,
                        address: sample.address,
                    },
                }));
            }
        } catch (error) {
            const message = String(error);
            const isTimeout = /timed?\s?out|timeout/i.test(message);
            setPings((prev) => ({
                ...prev,
                [entry.key]: {
                    status: isTimeout ? 'timeout' : 'error',
                    error: message,
                },
            }));
        }
    }, []);

    const baseEntries: TrayEntry[] = useMemo(() => {
        const customEntries: TrayEntry[] = configs.map((c, i) => ({
            key: `custom:${i}:${c.name}:${c.primary}`,
            name: c.name,
            primary: c.primary,
            alternative: c.alternative,
            custom: true,
        }));
        const builtinEntries: TrayEntry[] = DNS_PRESETS.filter(
            (p) => !hiddenPresets.includes(p.id)
        ).map((p) => ({
            key: p.id,
            name: p.name,
            primary: p.primary,
            alternative: p.alternative,
            custom: false,
        }));
        const q = search.trim().toLowerCase();
        const combined = [...customEntries, ...builtinEntries];
        if (!q) return combined;
        return combined.filter((e) =>
            `${e.name} ${e.primary} ${e.alternative ?? ''}`
                .toLowerCase()
                .includes(q)
        );
    }, [configs, hiddenPresets, search]);

    const entries: TrayEntry[] = useMemo(() => {
        if (!sortByLatency) return baseEntries;
        return [...baseEntries].sort((a, b) => {
            const pa = sortPings[a.key];
            const pb = sortPings[b.key];
            const la =
                pa?.status === 'ok'
                    ? (pa.latencyMs ?? Number.MAX_SAFE_INTEGER)
                    : Number.MAX_SAFE_INTEGER;
            const lb =
                pb?.status === 'ok'
                    ? (pb.latencyMs ?? Number.MAX_SAFE_INTEGER)
                    : Number.MAX_SAFE_INTEGER;
            return la - lb;
        });
    }, [baseEntries, sortPings, sortByLatency]);

    // Run full benchmark right inside the tray popover!
    const runTrayBenchmark = useCallback(async () => {
        if (benchmarking || baseEntries.length === 0) return;
        const myRunId = ++benchRunIdRef.current;
        const target = getBenchmarkTarget();

        setBenchmarking(true);
        setPings((prev) => ({
            ...prev,
            ...Object.fromEntries(
                baseEntries.map((e) => [e.key, { status: 'testing' as const }])
            ),
        }));

        const results: PingState[] = [];
        const batchStates: Record<string, PingState> = {};
        try {
            const concurrency = Math.min(4, baseEntries.length);
            const queue = [...baseEntries];
            const worker = async () => {
                let entry = queue.shift();
                while (entry) {
                    const current = entry;
                    let state: PingState;
                    try {
                        const sample = await api.benchmarkDns(
                            current.primary,
                            target
                        );
                        if (sample.connect_ms === null) {
                            state = {
                                status: 'error',
                                resolveMs: sample.resolve_ms,
                                address: sample.address,
                                error: `Resolved ${sample.address} in ${sample.resolve_ms} ms, but TCP connect failed`,
                            };
                        } else {
                            state = {
                                status: 'ok',
                                latencyMs:
                                    sample.resolve_ms + sample.connect_ms,
                                resolveMs: sample.resolve_ms,
                                connectMs: sample.connect_ms,
                                address: sample.address,
                            };
                        }
                    } catch (error) {
                        const message = String(error);
                        const isTimeout = /timed?\s?out|timeout/i.test(message);
                        state = {
                            status: isTimeout ? 'timeout' : 'error',
                            error: message,
                        };
                    }
                    results.push(state);
                    batchStates[current.key] = state;
                    if (benchRunIdRef.current === myRunId) {
                        setPings((prev) => ({ ...prev, [current.key]: state }));
                    }
                    entry = queue.shift();
                }
            };
            await Promise.all(
                Array.from({ length: Math.max(1, concurrency) }, () => worker())
            );

            if (benchRunIdRef.current !== myRunId) return;

            setSortPings((prev) => ({ ...prev, ...batchStates }));
            setSortByLatency(true);

            const fakeIpHit = results.find(
                (r) =>
                    r.status === 'error' &&
                    Boolean(r.error && /FakeIP|198\.18\./i.test(r.error))
            );
            if (fakeIpHit) {
                showToast(t('servers.vpnFakeIpWarning'), 'error');
                return;
            }

            const okResults = results.filter((r) => r.status === 'ok');
            const fastHits = okResults.filter((r) => (r.latencyMs ?? 999) <= 5);
            const fastIps = new Set(
                fastHits.map((r) => r.address).filter(Boolean)
            );
            if (
                activeAdapter &&
                VPN_ADAPTER_RE.test(
                    `${activeAdapter.name} ${activeAdapter.kind ?? ''}`
                ) &&
                fastHits.length >= 3 &&
                fastIps.size === 1
            ) {
                showToast(
                    t('servers.vpnHijackWarning', {
                        adapter: activeAdapter.name,
                    }),
                    'error'
                );
                return;
            }

            if (okResults.length === 0 && results.length > 0) {
                const firstErr = results.find((r) => r.error)?.error;
                if (firstErr) {
                    showToast(
                        t('servers.benchFailedSummary', { reason: firstErr }),
                        'error'
                    );
                }
            }
        } finally {
            if (benchRunIdRef.current === myRunId) {
                setBenchmarking(false);
            }
        }
    }, [benchmarking, baseEntries, activeAdapter, showToast, t]);

    // Save a custom DNS server directly inside the tray popover!
    const handleSaveCustom = useCallback(async () => {
        if (savingCustom) return;
        const trimmedName = customName.trim();
        const trimmedPrimary = customPrimary.trim();
        const trimmedAlt = customAlt.trim();

        if (!trimmedName || !trimmedPrimary) {
            showToast(t('toast.nameRequired'), 'error');
            return;
        }
        if ([...trimmedName].length > 64) {
            showToast(t('toast.nameTooLong'), 'error');
            return;
        }
        if (!validateIPv4(trimmedPrimary)) {
            showToast(t('toast.badPrimary'), 'error');
            return;
        }
        if (trimmedAlt && !validateIPv4(trimmedAlt)) {
            showToast(t('toast.badAlt'), 'error');
            return;
        }
        const duplicate = configs.some(
            (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (duplicate) {
            showToast(t('toast.duplicate', { name: trimmedName }), 'error');
            return;
        }

        const next: DnsConfig[] = [
            ...configs,
            {
                name: trimmedName,
                primary: trimmedPrimary,
                alternative: trimmedAlt || undefined,
            },
        ];

        setSavingCustom(true);
        try {
            const saved = await api.saveConfigs(next);
            setConfigs(saved);
            setCustomName('');
            setCustomPrimary('');
            setCustomAlt('');
            setCustomOpen(false);
            showToast(t('toast.added', { name: trimmedName }));
        } catch (error) {
            showToast(t('toast.saveFailed', { error: String(error) }), 'error');
        } finally {
            setSavingCustom(false);
        }
    }, [
        savingCustom,
        customName,
        customPrimary,
        customAlt,
        configs,
        showToast,
        t,
    ]);

    const busy = busyOp !== null;
    const isCustomDnsActive = Boolean(
        activeDns && activeDns.static_servers.length > 0
    );
    const activeStaticPrimary = activeDns?.static_servers[0] ?? null;

    const displayServers = Array.from(
        new Set(
            activeDns?.static_servers.length
                ? activeDns.static_servers
                : (activeDns?.in_use ?? [])
        )
    );
    const activeProvider = displayServers[0]
        ? (dnsNameLookup.get(displayServers[0]) ?? displayServers[0])
        : t('home.dhcpDefault');

    const canToggle =
        Boolean(activeAdapter) &&
        (isCustomDnsActive || rememberedServers.length > 0);

    return (
        <div className="flex h-screen w-screen select-none flex-col overflow-hidden border border-[var(--dnss-border-strong)] bg-[var(--dnss-canvas)] text-[var(--dnss-ink-1)]">
            {/* Compact Header */}
            <header
                data-tauri-drag-region
                onMouseDownCapture={(e) => {
                    if (e.button !== 0) return;
                    if ((e.target as HTMLElement).closest('button')) return;
                    void api.notifyTrayDragStart().catch(() => {});
                }}
                className="flex h-11 shrink-0 cursor-grab items-center justify-between gap-2 border-b border-[var(--dnss-border)] bg-[var(--dnss-sidebar)] px-3 active:cursor-grabbing"
            >
                <div
                    data-tauri-drag-region
                    className="flex min-w-0 flex-1 items-center gap-2"
                >
                    <img
                        src={appIcon}
                        alt="DNSS"
                        className="pointer-events-none size-5 shrink-0"
                        draggable={false}
                    />
                    <span
                        data-tauri-drag-region
                        className="text-[length:var(--dnss-fs-sm)] font-bold text-[var(--dnss-ink-1)]"
                    >
                        DNSS
                    </span>
                    <span
                        data-tauri-drag-region
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium ${
                            isCustomDnsActive
                                ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                                : 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-3)]'
                        }`}
                    >
                        <span
                            className={`size-1.5 rounded-full ${
                                isCustomDnsActive
                                    ? 'bg-[var(--dnss-accent)]'
                                    : 'bg-[var(--dnss-ink-3)]'
                            }`}
                        />
                        {isCustomDnsActive
                            ? t('tray.protected')
                            : t('tray.dhcp')}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        aria-pressed={pinned}
                        title={pinned ? t('tray.unpin') : t('tray.pin')}
                        onClick={togglePin}
                        className={`grid size-7 shrink-0 place-items-center rounded-lg transition-colors ${
                            pinned
                                ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                                : 'text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]'
                        }`}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill={pinned ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform duration-150 ${pinned ? '-rotate-45' : ''}`}
                            aria-hidden="true"
                        >
                            <path d="M12 17v5" />
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        title={t('tray.openApp')}
                        onClick={() => void api.showMainWindow('home')}
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                    >
                        <ArrowTopRightOnSquareIcon className="size-4 shrink-0" />
                    </button>
                    <button
                        type="button"
                        title={t('tray.quit')}
                        onClick={() => void api.quitApp()}
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-3)] hover:bg-[var(--dnss-error-soft)] hover:text-[var(--dnss-error)]"
                    >
                        <PowerIcon className="size-4 shrink-0" />
                    </button>
                </div>
            </header>

            {(busy || refreshing || benchmarking) && (
                <div
                    className="loading-bar shrink-0"
                    role="status"
                    aria-label={t('app.working')}
                />
            )}

            {/* Quick-Toggle Hero Card */}
            <div className="shrink-0 p-3 pb-2">
                <div className="dnss-card rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div
                                className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                                    isCustomDnsActive
                                        ? 'bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)]'
                                        : 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-3)]'
                                }`}
                            >
                                <ShieldCheckIcon className="size-4 shrink-0" />
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[length:var(--dnss-fs-sm)] font-semibold leading-tight text-[var(--dnss-ink-1)]">
                                    {activeProvider}
                                </div>
                                <div
                                    dir="ltr"
                                    className="mt-0.5 truncate font-mono text-[length:var(--dnss-fs-2xs)] tabular-nums text-[var(--dnss-ink-2)]"
                                >
                                    {displayServers.length > 0
                                        ? displayServers.join(' · ')
                                        : t('home.automatic')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={busy || !canToggle}
                            onClick={() => void handleToggle()}
                            className={`inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[length:var(--dnss-fs-xs)] font-medium ${
                                isCustomDnsActive
                                    ? 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)]'
                                    : 'bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]'
                            } disabled:cursor-not-allowed disabled:opacity-45`}
                        >
                            {busyOp?.kind === 'toggle' && (
                                <span className="loading loading-spinner loading-xs" />
                            )}
                            {isCustomDnsActive
                                ? t('tray.resetDhcp')
                                : t('tray.restore')}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleFlush()}
                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--dnss-raised)] px-2.5 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)] disabled:opacity-45"
                        >
                            {busyOp?.kind === 'flush' ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <CircleStackIcon className="size-3.5 shrink-0 text-[var(--dnss-ink-2)]" />
                            )}
                            {t('tray.flush')}
                        </button>
                    </div>
                </div>

                {/* Custom Adapter Switcher + In-Tray Custom & Benchmark Actions */}
                <div className="mt-2 flex items-center gap-1.5">
                    <CustomSelect
                        value={effectiveTargetMode}
                        options={adapterOptions}
                        onChange={setTargetMode}
                        ariaLabel={t('servers.applyTo')}
                        title={t('tray.targetTooltip')}
                        size="sm"
                        className="min-w-0 flex-1"
                        panelClassName="max-h-48"
                    />

                    <button
                        type="button"
                        aria-expanded={customOpen}
                        onClick={() => setCustomOpen((v) => !v)}
                        className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[length:var(--dnss-fs-2xs)] font-medium ring-1 ${
                            customOpen
                                ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)] ring-[var(--dnss-accent)]/40'
                                : 'bg-[var(--dnss-surface)] text-[var(--dnss-ink-2)] ring-[var(--dnss-border)] hover:bg-[var(--dnss-raised)] hover:text-[var(--dnss-ink-1)]'
                        }`}
                    >
                        <PlusIcon
                            className={`size-3.5 shrink-0 transition-transform duration-200 ${
                                customOpen ? 'rotate-45' : ''
                            }`}
                        />
                        {t('tray.addCustom')}
                    </button>

                    <button
                        type="button"
                        disabled={benchmarking}
                        onClick={() => void runTrayBenchmark()}
                        title={
                            benchmarking
                                ? t('tray.benchmarking')
                                : t('tray.benchmark')
                        }
                        className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--dnss-surface)] text-[var(--dnss-accent)] ring-1 ring-[var(--dnss-border)] hover:bg-[var(--dnss-raised)] disabled:opacity-60"
                    >
                        {benchmarking ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : (
                            <BoltIcon className="size-3.5 shrink-0" />
                        )}
                    </button>
                </div>

                {/* Smooth Inline "+ Custom" Drawer inside the Tray Popover */}
                <div
                    aria-hidden={!customOpen}
                    className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        customOpen
                            ? 'visible mt-2 grid-rows-[1fr] opacity-100'
                            : 'invisible pointer-events-none mt-0 grid-rows-[0fr] opacity-0'
                    }`}
                >
                    <div className="min-h-0">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                void handleSaveCustom();
                            }}
                            className="dnss-card flex flex-col gap-2 rounded-xl p-2.5"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[length:var(--dnss-fs-2xs)] font-semibold text-[var(--dnss-ink-1)]">
                                    {t('tray.customTitle')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCustomOpen(false)}
                                    className="grid size-5 place-items-center rounded text-[var(--dnss-ink-3)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                                >
                                    <XMarkIcon className="size-3.5" />
                                </button>
                            </div>

                            <input
                                type="text"
                                value={customName}
                                maxLength={64}
                                onChange={(e) => setCustomName(e.target.value)}
                                placeholder={t('form.namePh')}
                                className="dnss-input h-7 rounded-lg px-2 text-[length:var(--dnss-fs-2xs)]"
                            />

                            <div className="grid grid-cols-2 gap-1.5">
                                <input
                                    type="text"
                                    dir="ltr"
                                    value={customPrimary}
                                    onChange={(e) =>
                                        setCustomPrimary(e.target.value)
                                    }
                                    placeholder={t('form.primaryPh')}
                                    className="dnss-input h-7 rounded-lg px-2 font-mono text-[length:var(--dnss-fs-2xs)] tabular-nums"
                                />
                                <input
                                    type="text"
                                    dir="ltr"
                                    value={customAlt}
                                    onChange={(e) =>
                                        setCustomAlt(e.target.value)
                                    }
                                    placeholder={t('form.altPh')}
                                    className="dnss-input h-7 rounded-lg px-2 font-mono text-[length:var(--dnss-fs-2xs)] tabular-nums"
                                />
                            </div>

                            <div className="flex justify-end gap-1.5">
                                <button
                                    type="button"
                                    disabled={savingCustom}
                                    onClick={() => setCustomOpen(false)}
                                    className="h-6 rounded-md px-2 text-[length:var(--dnss-fs-2xs)] text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)]"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingCustom}
                                    className="inline-flex h-6 items-center gap-1 rounded-md bg-[var(--dnss-accent)] px-2.5 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)] disabled:opacity-50"
                                >
                                    {savingCustom ? (
                                        <span className="loading loading-spinner loading-xs" />
                                    ) : (
                                        <CheckIcon className="size-3 shrink-0" />
                                    )}
                                    {t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Quick Search */}
                <label className="dnss-input mt-2 flex h-7 items-center gap-1.5 rounded-lg px-2.5">
                    <MagnifyingGlassIcon className="size-3.5 shrink-0 text-[var(--dnss-ink-3)]" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('servers.search')}
                        className="w-full bg-transparent text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-1)] outline-none placeholder:text-[var(--dnss-ink-3)]"
                    />
                </label>
            </div>

            {/* Scrollable Server List with AutoAnimate */}
            <div className="dnss-scroll-stable min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                <div className="dnss-card overflow-hidden rounded-xl">
                    {entries.length > 0 ? (
                        <ul
                            ref={trayListRef}
                            className="divide-y divide-[var(--dnss-border)]"
                        >
                            {entries.map((entry) => {
                                const isActive =
                                    activeStaticPrimary === entry.primary;
                                const isApplying =
                                    busyOp?.kind === 'apply' &&
                                    busyOp.id === entry.key;
                                const ping = pings[entry.key];

                                const breakdown =
                                    ping?.status === 'ok' &&
                                    ping.address !== undefined &&
                                    ping.resolveMs !== undefined &&
                                    ping.connectMs !== undefined
                                        ? t('servers.breakdownTooltip', {
                                              address: ping.address,
                                              resolve: ping.resolveMs,
                                              connect: ping.connectMs,
                                          })
                                        : undefined;

                                return (
                                    <li
                                        key={entry.key}
                                        className={`flex items-center justify-between gap-2 px-2.5 py-2 transition-colors hover:bg-[var(--dnss-hover)] ${
                                            isActive
                                                ? 'bg-[var(--dnss-accent-soft)]/50'
                                                : ''
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`size-1.5 shrink-0 rounded-full ${
                                                        isActive
                                                            ? 'bg-[var(--dnss-accent)]'
                                                            : 'bg-transparent'
                                                    }`}
                                                />
                                                <span className="truncate text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)]">
                                                    {entry.name}
                                                </span>
                                                {entry.custom && (
                                                    <span className="shrink-0 rounded bg-[var(--dnss-raised)] px-1 py-0.5 text-[10px] text-[var(--dnss-ink-3)]">
                                                        {t(
                                                            'servers.filterCustom'
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="truncate ps-3 font-mono text-[length:var(--dnss-fs-2xs)] tabular-nums text-[var(--dnss-ink-3)]">
                                                <bdi dir="ltr">
                                                    {entry.primary}
                                                    {entry.alternative
                                                        ? ` · ${entry.alternative}`
                                                        : ''}
                                                </bdi>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1">
                                            {ping?.status === 'ok' && (
                                                <span
                                                    dir="ltr"
                                                    title={breakdown}
                                                    className={`rounded px-1.5 py-0.5 font-mono text-[length:var(--dnss-fs-2xs)] font-medium tabular-nums ${
                                                        (ping.latencyMs ?? 0) <
                                                        60
                                                            ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                                                            : (ping.latencyMs ??
                                                                    0) < 150
                                                              ? 'bg-[var(--dnss-warning-soft)] text-[var(--dnss-warning)]'
                                                              : 'bg-[var(--dnss-error-soft)] text-[var(--dnss-error)]'
                                                    }`}
                                                >
                                                    {t('servers.ms', {
                                                        n: ping.latencyMs ?? 0,
                                                    })}
                                                </span>
                                            )}
                                            {(ping?.status === 'timeout' ||
                                                ping?.status === 'error') && (
                                                <span
                                                    title={ping.error}
                                                    className={`rounded px-1.5 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium ${
                                                        ping.status ===
                                                        'timeout'
                                                            ? 'bg-[var(--dnss-warning-soft)] text-[var(--dnss-warning)]'
                                                            : 'bg-[var(--dnss-error-soft)] text-[var(--dnss-error)]'
                                                    }`}
                                                >
                                                    {ping.status === 'timeout'
                                                        ? t(
                                                              'servers.timeoutBadge'
                                                          )
                                                        : t(
                                                              'servers.errorBadge'
                                                          )}
                                                </span>
                                            )}

                                            <button
                                                type="button"
                                                title={t('servers.pingTitle')}
                                                disabled={
                                                    busy ||
                                                    ping?.status === 'testing'
                                                }
                                                onClick={() =>
                                                    void pingEntry(entry)
                                                }
                                                className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--dnss-ink-3)] hover:bg-[var(--dnss-raised)] hover:text-[var(--dnss-ink-1)] disabled:opacity-40"
                                            >
                                                {ping?.status === 'testing' ? (
                                                    <span className="loading loading-spinner loading-xs" />
                                                ) : (
                                                    <SignalIcon className="size-3.5 shrink-0" />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void applyServers(
                                                        [
                                                            entry.primary,
                                                            entry.alternative,
                                                        ].filter(
                                                            (s): s is string =>
                                                                Boolean(s)
                                                        ),
                                                        resolveTargets(),
                                                        {
                                                            kind: 'apply',
                                                            id: entry.key,
                                                        }
                                                    )
                                                }
                                                className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[length:var(--dnss-fs-2xs)] font-medium ${
                                                    isActive
                                                        ? 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-1)]'
                                                        : 'bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]'
                                                } disabled:opacity-45`}
                                            >
                                                {isApplying && (
                                                    <span className="loading loading-spinner loading-xs" />
                                                )}
                                                {t('common.apply')}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="px-3 py-6 text-center text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                            {t('tray.noMatches', { query: search.trim() })}
                        </div>
                    )}
                </div>
            </div>

            {/* Compact Footer with Inline Toast Feedback */}
            <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-[var(--dnss-border)] bg-[var(--dnss-sidebar)] px-3">
                <div className="min-w-0 flex-1">
                    {toast ? (
                        <div
                            title={toast.message}
                            className={`toast-pop flex items-center gap-1.5 truncate text-[length:var(--dnss-fs-2xs)] font-medium ${
                                toast.kind === 'error'
                                    ? 'text-[var(--dnss-error)]'
                                    : 'text-[var(--dnss-accent-text)]'
                            }`}
                        >
                            {toast.kind === 'error' ? (
                                <ExclamationTriangleIcon className="size-3.5 shrink-0" />
                            ) : (
                                <CheckCircleIcon className="size-3.5 shrink-0" />
                            )}
                            <span className="truncate">{toast.message}</span>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={busy || refreshing}
                            onClick={() => void refreshAll()}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)] disabled:opacity-45"
                        >
                            <ArrowPathIcon
                                className={`size-3.5 shrink-0 ${
                                    refreshing ? 'animate-spin' : ''
                                }`}
                            />
                            {t('home.refreshStatus')}
                        </button>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        title={t('app.toggleTheme')}
                        onClick={() => {
                            const resolved = getResolvedTheme(theme);
                            setTheme(resolved === 'dark' ? 'light' : 'dark');
                        }}
                        className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                    >
                        {theme === 'light' ? (
                            <SunIcon className="size-3.5 shrink-0" />
                        ) : theme === 'dark' ? (
                            <MoonIcon className="size-3.5 shrink-0" />
                        ) : (
                            <ComputerDesktopIcon className="size-3.5 shrink-0" />
                        )}
                    </button>

                    <button
                        type="button"
                        title={t('app.toggleLang')}
                        onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
                        className="inline-flex h-6 items-center rounded-md px-1.5 text-[length:var(--dnss-fs-2xs)] font-semibold uppercase text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                    >
                        {lang === 'en' ? 'FA' : 'EN'}
                    </button>
                </div>
            </footer>
        </div>
    );
}
