import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
    ArrowsUpDownIcon,
    BoltIcon,
    CheckIcon,
    ChevronDownIcon,
    ExclamationTriangleIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    PlusIcon,
    SignalIcon,
    TrashIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { DNS_PRESETS, type DnsPreset } from '@seymi/dnss-core/presets';
import { validateIPv4 } from '@seymi/dnss-core/validate';
import { api, type Adapter, type DnsConfig, type DnsStatus } from '../api';
import CustomSelect, { type SelectOption } from '../components/CustomSelect';
import FloatingPanel from '../components/FloatingPanel';
import { usePortalContainer } from '../components/PortalContext';
import type { I18n, MsgKey } from '../i18n';

interface PingState {
    status: 'idle' | 'testing' | 'ok' | 'timeout' | 'error';
    latencyMs?: number;
    resolveMs?: number;
    connectMs?: number;
    address?: string;
    error?: string;
}

interface ServersPageProps {
    i18n: I18n;
    adapters: Adapter[];
    activeAdapter: Adapter | null;
    activeAdapterName: string | null;
    activeDns: DnsStatus | null;
    configs: DnsConfig[];
    persistConfigs: (next: DnsConfig[]) => Promise<boolean>;
    hiddenPresets: string[];
    onHidePreset: (id: string) => void;
    benchmarkTarget?: string;
    onBenchmarkTargetChange?: (target: string) => void;
    busy: boolean;
    applyBusyId: string | null;
    onApply: (
        servers: string[],
        targets: 'all' | string[],
        busyId: string
    ) => void;
    showToast: (message: string, kind?: 'success' | 'error') => void;
}

const DEFAULT_BENCHMARK_TARGET = 'https://www.cloudflare.com';
const VPN_ADAPTER_RE =
    /tun|singbox|sing-box|clash|mihomo|v2ray|xray|wireguard|openvpn|warp|wintun|tailscale|nekoray/i;

type SortMode = 'default' | 'name' | 'latency';
type FilterTab = 'all' | 'custom' | 'builtin';

const SORT_OPTIONS: { value: SortMode; label: MsgKey }[] = [
    { value: 'default', label: 'servers.sortDefault' },
    { value: 'name', label: 'servers.sortName' },
    { value: 'latency', label: 'servers.sortPing' },
];

interface Entry {
    key: string;
    preset: DnsPreset;
    custom: boolean;
    /** Index into configs; -1 for built-in presets. */
    customIndex: number;
}

interface FormState {
    mode: 'add' | 'edit';
    index: number;
}

function isVpnAdapter(adapter: Adapter | null): boolean {
    if (!adapter) return false;
    return VPN_ADAPTER_RE.test(`${adapter.name} ${adapter.kind ?? ''}`);
}

function serversMatchEntry(servers: string[], entry: Entry): boolean {
    if (servers.length === 0 || servers[0] !== entry.preset.primary) {
        return false;
    }
    if (entry.preset.alternative) {
        return servers.length === 2 && servers[1] === entry.preset.alternative;
    }
    return servers.length === 1;
}

function entryMatchesAdapter(entry: Entry, adapter: Adapter): boolean {
    if (!adapter.dns_static) {
        return false;
    }
    return serversMatchEntry(adapter.dns_servers, entry);
}

function LatencyPill({ i18n, ping }: { i18n: I18n; ping?: PingState }) {
    if (ping?.status === 'testing') {
        return (
            <span
                className="inline-flex h-6 min-w-[54px] items-center justify-center rounded-md bg-[var(--dnss-raised)] px-2 text-[length:var(--dnss-fs-2xs)] text-[var(--dnss-ink-3)]"
                title={i18n.t('servers.measuring')}
            >
                <span className="loading loading-spinner loading-xs" />
            </span>
        );
    }
    if (ping?.status === 'ok') {
        const ms = ping.latencyMs ?? 0;
        const tone =
            ms < 60
                ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                : ms < 150
                  ? 'bg-[var(--dnss-warning-soft)] text-[var(--dnss-warning)]'
                  : 'bg-[var(--dnss-error-soft)] text-[var(--dnss-error)]';
        const breakdown =
            ping.address !== undefined &&
            ping.resolveMs !== undefined &&
            ping.connectMs !== undefined
                ? i18n.t('servers.breakdownTooltip', {
                      address: ping.address,
                      resolve: ping.resolveMs,
                      connect: ping.connectMs,
                  })
                : undefined;
        return (
            <span
                dir="ltr"
                title={breakdown}
                className={`inline-flex h-6 min-w-[54px] items-center justify-center rounded-md px-2 font-mono text-[length:var(--dnss-fs-2xs)] font-medium tabular-nums ${tone}`}
            >
                {i18n.t('servers.ms', { n: ms })}
            </span>
        );
    }
    if (ping?.status === 'timeout') {
        return (
            <span
                className="inline-flex h-6 min-w-[54px] items-center justify-center rounded-md bg-[var(--dnss-warning-soft)] px-2 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-warning)]"
                title={ping.error}
            >
                {i18n.t('servers.timeoutBadge')}
            </span>
        );
    }
    if (ping?.status === 'error') {
        return (
            <span
                className="inline-flex h-6 min-w-[54px] items-center justify-center rounded-md bg-[var(--dnss-error-soft)] px-2 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-error)]"
                title={ping.error}
            >
                {i18n.t('servers.errorBadge')}
            </span>
        );
    }
    return (
        <span className="inline-flex h-6 min-w-[54px] items-center justify-center rounded-md bg-[var(--dnss-raised)] px-2 font-mono text-[length:var(--dnss-fs-2xs)] text-[var(--dnss-ink-3)]">
            {i18n.t('servers.pingBadge')}
        </span>
    );
}

/** Add/Edit modal dialog rendered in a portal with smooth enter/exit motion. */
function ServerModal({
    i18n,
    mode,
    initialName,
    name,
    primary,
    alternative,
    saving,
    onName,
    onPrimary,
    onAlternative,
    onSubmit,
    onCancel,
}: {
    i18n: I18n;
    mode: 'add' | 'edit';
    initialName: string;
    name: string;
    primary: string;
    alternative: string;
    saving: boolean;
    onName: (v: string) => void;
    onPrimary: (v: string) => void;
    onAlternative: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    const portalContainer = usePortalContainer();
    const [closing, setClosing] = useState(false);
    const closeTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    const requestClose = useCallback(() => {
        if (saving || closing) return;
        setClosing(true);
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            onCancel();
        }, 140);
    }, [saving, closing, onCancel]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                requestClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [requestClose]);

    return createPortal(
        <div
            className={`${portalContainer ? 'absolute' : 'fixed'} inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] ${
                closing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
            }`}
            onClick={requestClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={`dnss-popover w-full max-w-md rounded-2xl p-5 ${
                    closing ? 'modal-exit' : 'modal-enter'
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3">
                    <h3 className="m-0 text-[length:var(--dnss-fs-md)] font-semibold text-[var(--dnss-ink-1)]">
                        {mode === 'edit'
                            ? i18n.t('form.edit', { name: initialName })
                            : i18n.t('form.new')}
                    </h3>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={requestClose}
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-3)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                    >
                        <XMarkIcon className="size-4 shrink-0" />
                    </button>
                </div>

                <form
                    className="mt-4 flex flex-col gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit();
                    }}
                >
                    <label className="flex flex-col gap-1">
                        <span className="text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-2)]">
                            {i18n.t('form.nameLabel')}
                        </span>
                        <input
                            autoFocus
                            className="dnss-input h-9 rounded-lg px-3 text-[length:var(--dnss-fs-sm)]"
                            placeholder={i18n.t('form.namePh')}
                            value={name}
                            maxLength={64}
                            onChange={(e) => onName(e.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-2)]">
                            {i18n.t('form.primaryLabel')}
                        </span>
                        <input
                            dir="ltr"
                            className="dnss-input h-9 rounded-lg px-3 font-mono text-[length:var(--dnss-fs-sm)] tabular-nums"
                            placeholder={i18n.t('form.primaryPh')}
                            value={primary}
                            onChange={(e) => onPrimary(e.target.value)}
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-2)]">
                            {i18n.t('form.altLabel')}
                        </span>
                        <input
                            dir="ltr"
                            className="dnss-input h-9 rounded-lg px-3 font-mono text-[length:var(--dnss-fs-sm)] tabular-nums"
                            placeholder={i18n.t('form.altPh')}
                            value={alternative}
                            onChange={(e) => onAlternative(e.target.value)}
                        />
                    </label>

                    <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={requestClose}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                        >
                            {i18n.t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-accent)] px-3.5 text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)] disabled:opacity-50"
                        >
                            {saving ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <CheckIcon className="size-4 shrink-0" />
                            )}
                            {mode === 'edit'
                                ? i18n.t('common.update')
                                : i18n.t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        portalContainer ?? document.body
    );
}

export default function ServersPage({
    i18n,
    adapters,
    activeAdapter,
    activeAdapterName,
    activeDns,
    configs,
    persistConfigs,
    hiddenPresets,
    onHidePreset,
    benchmarkTarget: controlledBenchmarkTarget,
    onBenchmarkTargetChange,
    busy,
    applyBusyId,
    onApply,
    showToast,
}: ServersPageProps) {
    const { t, num } = i18n;
    const [listRef] = useAutoAnimate<HTMLUListElement>({
        duration: 240,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });

    const [pings, setPings] = useState<Record<string, PingState>>({});
    const [sortPings, setSortPings] = useState<Record<string, PingState>>({});
    const [benchmarking, setBenchmarking] = useState(false);
    const [benchWarning, setBenchWarning] = useState<string | null>(null);
    const [localBenchmarkTarget, setLocalBenchmarkTarget] = useState(() => {
        const stored = localStorage.getItem('dnss.benchmarkTarget')?.trim();
        return stored || DEFAULT_BENCHMARK_TARGET;
    });
    const benchmarkTarget = controlledBenchmarkTarget ?? localBenchmarkTarget;
    const [search, setSearch] = useState('');
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [sortBy, setSortBy] = useState<SortMode>('default');

    const [form, setForm] = useState<FormState | null>(null);
    const [name, setName] = useState('');
    const [primary, setPrimary] = useState('');
    const [alternative, setAlternative] = useState('');
    const [saving, setSaving] = useState(false);

    const [applyMenuKey, setApplyMenuKey] = useState<string | null>(null);
    const [applyAll, setApplyAll] = useState(false);
    const [applySelection, setApplySelection] = useState<Set<string>>(
        new Set()
    );
    const [confirmKey, setConfirmKey] = useState<string | null>(null);

    const runIdRef = useRef(0);
    const triggerEls = useRef(new Map<string, HTMLElement>());
    const setTrigger = useCallback(
        (key: string) => (el: HTMLElement | null) => {
            if (el) {
                triggerEls.current.set(key, el);
            } else {
                triggerEls.current.delete(key);
            }
        },
        []
    );

    const sortOptions: SelectOption<SortMode>[] = useMemo(
        () =>
            SORT_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
            })),
        [t]
    );

    const activeStaticServers = activeDns?.static_servers ?? [];

    const savedEntries: Entry[] = useMemo(
        () =>
            configs.map((c, i) => ({
                key: `custom:${i}:${c.name}:${c.primary}:${c.alternative ?? ''}`,
                preset: {
                    id: `custom-${i}`,
                    name: c.name,
                    primary: c.primary,
                    alternative: c.alternative,
                    description: undefined,
                },
                custom: true,
                customIndex: i,
            })),
        [configs]
    );

    const presetEntries: Entry[] = useMemo(
        () =>
            DNS_PRESETS.filter((p) => !hiddenPresets.includes(p.id)).map(
                (p) => ({
                    key: p.id,
                    preset: p,
                    custom: false,
                    customIndex: -1,
                })
            ),
        [hiddenPresets]
    );

    const allEntries = useMemo(
        () => [...savedEntries, ...presetEntries],
        [savedEntries, presetEntries]
    );

    const query = search.trim().toLowerCase();
    const matches = useCallback(
        (entry: Entry) =>
            !query ||
            `${entry.preset.name} ${entry.preset.primary} ${entry.preset.alternative ?? ''}`
                .toLowerCase()
                .includes(query),
        [query]
    );

    const latencyOf = useCallback(
        (entry: Entry) => {
            const ping = sortPings[entry.key];
            return ping?.status === 'ok'
                ? (ping.latencyMs ?? Number.MAX_SAFE_INTEGER)
                : Number.MAX_SAFE_INTEGER;
        },
        [sortPings]
    );

    const orderEntries = useCallback(
        (list: Entry[]) => {
            const arr = [...list];
            if (sortBy === 'name') {
                arr.sort((a, b) => a.preset.name.localeCompare(b.preset.name));
            } else if (sortBy === 'latency') {
                arr.sort((a, b) => latencyOf(a) - latencyOf(b));
            }
            return arr;
        },
        [sortBy, latencyOf]
    );

    const visibleSaved = useMemo(
        () => orderEntries(savedEntries.filter(matches)),
        [orderEntries, savedEntries, matches]
    );
    const visiblePresets = useMemo(
        () => orderEntries(presetEntries.filter(matches)),
        [orderEntries, presetEntries, matches]
    );

    const visibleEntries = useMemo(() => {
        if (filterTab === 'custom') return visibleSaved;
        if (filterTab === 'builtin') return visiblePresets;
        return [...visibleSaved, ...visiblePresets];
    }, [filterTab, visibleSaved, visiblePresets]);

    const setPing = useCallback((key: string, state: PingState) => {
        setPings((prev) => ({ ...prev, [key]: state }));
    }, []);

    const runBenchmark = useCallback(async () => {
        const targets = visibleEntries.length > 0 ? visibleEntries : allEntries;
        if (targets.length === 0) return;

        const effectiveTarget =
            benchmarkTarget.trim() || DEFAULT_BENCHMARK_TARGET;
        const myRunId = ++runIdRef.current;

        setBenchWarning(null);
        setBenchmarking(true);
        setPings((prev) => ({
            ...prev,
            ...Object.fromEntries(
                targets.map((e) => [e.key, { status: 'testing' as const }])
            ),
        }));

        const results: PingState[] = [];
        const batchStates: Record<string, PingState> = {};

        try {
            const concurrency = Math.min(4, targets.length);
            const queue = [...targets];
            const worker = async () => {
                let entry = queue.shift();
                while (entry) {
                    let state: PingState;
                    try {
                        const sample = await api.benchmarkDns(
                            entry.preset.primary,
                            effectiveTarget
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
                    batchStates[entry.key] = state;
                    if (runIdRef.current === myRunId) {
                        setPing(entry.key, state);
                    }
                    entry = queue.shift();
                }
            };
            await Promise.all(
                Array.from({ length: Math.max(1, concurrency) }, () => worker())
            );

            if (runIdRef.current !== myRunId) return;

            // Apply latency sort once at the end for a single smooth glide.
            setSortPings((prev) => ({ ...prev, ...batchStates }));

            // Diagnose VPN / FakeIP / uniform failure patterns so instant
            // ~28ms completions always surface a clear explanation.
            const fakeIpHits = results.filter(
                (r) =>
                    r.status === 'error' &&
                    Boolean(r.error && /FakeIP|198\.18\./i.test(r.error))
            );
            if (fakeIpHits.length > 0) {
                const msg = t('servers.vpnFakeIpWarning');
                setBenchWarning(msg);
                showToast(msg, 'error');
                return;
            }

            const okResults = results.filter((r) => r.status === 'ok');
            const fastLocalHits = okResults.filter(
                (r) => (r.latencyMs ?? 999) <= 5
            );
            const distinctFastIps = new Set(
                fastLocalHits.map((r) => r.address).filter(Boolean)
            );
            if (
                isVpnAdapter(activeAdapter) &&
                fastLocalHits.length >= 3 &&
                distinctFastIps.size === 1
            ) {
                setBenchWarning(
                    t('servers.vpnHijackWarning', {
                        adapter: activeAdapter?.name ?? 'VPN',
                    })
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
            if (runIdRef.current === myRunId) {
                setBenchmarking(false);
            }
        }
    }, [
        visibleEntries,
        allEntries,
        benchmarkTarget,
        setPing,
        activeAdapter,
        showToast,
        t,
    ]);

    const pingOne = useCallback(
        async (entry: Entry) => {
            const effectiveTarget =
                benchmarkTarget.trim() || DEFAULT_BENCHMARK_TARGET;
            setPing(entry.key, { status: 'testing' });
            try {
                const sample = await api.benchmarkDns(
                    entry.preset.primary,
                    effectiveTarget
                );
                const nextState: PingState =
                    sample.connect_ms === null
                        ? {
                              status: 'error',
                              resolveMs: sample.resolve_ms,
                              address: sample.address,
                              error: `Resolved ${sample.address} in ${sample.resolve_ms} ms, but TCP connect failed`,
                          }
                        : {
                              status: 'ok',
                              latencyMs: sample.resolve_ms + sample.connect_ms,
                              resolveMs: sample.resolve_ms,
                              connectMs: sample.connect_ms,
                              address: sample.address,
                          };
                setPing(entry.key, nextState);
                setSortPings((prev) => ({ ...prev, [entry.key]: nextState }));
            } catch (error) {
                const message = String(error);
                const isTimeout = /timed?\s?out|timeout/i.test(message);
                const errState: PingState = {
                    status: isTimeout ? 'timeout' : 'error',
                    error: message,
                };
                setPing(entry.key, errState);
                setSortPings((prev) => ({ ...prev, [entry.key]: errState }));
                if (/FakeIP|198\.18\./i.test(message)) {
                    setBenchWarning(t('servers.vpnFakeIpWarning'));
                }
            }
        },
        [benchmarkTarget, setPing, t]
    );

    const quickApply = useCallback(
        (entry: Entry) => {
            const servers = [
                entry.preset.primary,
                entry.preset.alternative,
            ].filter((s): s is string => Boolean(s));
            const defaultTarget = activeAdapterName ?? adapters[0]?.name;
            onApply(
                servers,
                defaultTarget ? [defaultTarget] : 'all',
                entry.key
            );
        },
        [activeAdapterName, adapters, onApply]
    );

    const openApplyMenu = useCallback(
        (entry: Entry) => {
            setConfirmKey(null);
            setApplyMenuKey(entry.key);
            setApplyAll(false);
            const matched = adapters
                .filter((a) => entryMatchesAdapter(entry, a))
                .map((a) => a.name);
            if (matched.length > 0) {
                setApplySelection(new Set(matched));
            } else {
                const initial = activeAdapterName ?? adapters[0]?.name;
                setApplySelection(new Set(initial ? [initial] : []));
            }
        },
        [activeAdapterName, adapters]
    );

    const toggleApplyAdapter = (adapterName: string) => {
        setApplySelection((prev) => {
            const next = new Set(prev);
            if (next.has(adapterName)) {
                next.delete(adapterName);
            } else {
                next.add(adapterName);
            }
            return next;
        });
    };

    const submitApply = (entry: Entry) => {
        onApply(
            [entry.preset.primary, entry.preset.alternative].filter(
                (s): s is string => Boolean(s)
            ),
            applyAll ? 'all' : [...applySelection],
            entry.key
        );
        setApplyMenuKey(null);
    };

    const closePanels = () => {
        setApplyMenuKey(null);
        setConfirmKey(null);
    };

    const openAdd = () => {
        closePanels();
        setForm({ mode: 'add', index: -1 });
        setName('');
        setPrimary('');
        setAlternative('');
    };

    const openEdit = (index: number) => {
        const config = configs[index];
        if (!config) return;
        closePanels();
        setForm({ mode: 'edit', index });
        setName(config.name);
        setPrimary(config.primary);
        setAlternative(config.alternative ?? '');
    };

    const closeForm = () => {
        setForm(null);
        setName('');
        setPrimary('');
        setAlternative('');
    };

    const submitForm = async () => {
        if (!form || saving) return;
        const trimmedName = name.trim();
        const trimmedPrimary = primary.trim();
        const trimmedAlternative = alternative.trim();
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
        if (trimmedAlternative && !validateIPv4(trimmedAlternative)) {
            showToast(t('toast.badAlt'), 'error');
            return;
        }
        const duplicate = configs.some(
            (c, i) =>
                i !== form.index &&
                c.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (duplicate) {
            showToast(t('toast.duplicate', { name: trimmedName }), 'error');
            return;
        }
        const next = [...configs];
        const config: DnsConfig = {
            name: trimmedName,
            primary: trimmedPrimary,
            alternative: trimmedAlternative || undefined,
        };
        if (form.mode === 'edit') {
            next[form.index] = config;
        } else {
            next.push(config);
        }
        setSaving(true);
        try {
            if (await persistConfigs(next)) {
                closeForm();
                showToast(
                    form.mode === 'edit'
                        ? t('toast.updated', { name: trimmedName })
                        : t('toast.added', { name: trimmedName })
                );
            }
        } finally {
            setSaving(false);
        }
    };

    const removeConfig = async (index: number) => {
        if (await persistConfigs(configs.filter((_, i) => i !== index))) {
            setConfirmKey(null);
            if (form?.mode === 'edit') {
                if (form.index === index) {
                    closeForm();
                } else if (form.index > index) {
                    setForm({ mode: 'edit', index: form.index - 1 });
                }
            }
        }
    };

    const handleTargetChange = (value: string) => {
        if (onBenchmarkTargetChange) {
            onBenchmarkTargetChange(value);
        } else {
            setLocalBenchmarkTarget(value);
            localStorage.setItem('dnss.benchmarkTarget', value);
        }
    };

    const renderRow = (entry: Entry): ReactNode => {
        const ping = pings[entry.key];
        const isActive = serversMatchEntry(activeStaticServers, entry);
        const isApplying = applyBusyId === entry.key;

        return (
            <li
                key={entry.key}
                className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--dnss-hover)] ${
                    isActive ? 'bg-[var(--dnss-accent-soft)]/50' : ''
                }`}
            >
                <div className="min-w-0 grow">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {entry.preset.name}
                        </span>
                        {entry.custom && (
                            <span className="shrink-0 rounded-md bg-[var(--dnss-raised)] px-1.5 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-ink-3)]">
                                {t('servers.filterCustom')}
                            </span>
                        )}
                        {isActive && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--dnss-accent-soft)] px-2 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-accent-text)]">
                                <span className="size-1.5 rounded-full bg-[var(--dnss-accent)]" />
                                {t('common.active')}
                            </span>
                        )}
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        <span
                            dir="ltr"
                            className="font-mono text-[length:var(--dnss-fs-xs)] tabular-nums text-[var(--dnss-ink-2)]"
                        >
                            {entry.preset.primary}
                            {entry.preset.alternative
                                ? ` · ${entry.preset.alternative}`
                                : ''}
                        </span>
                        {entry.preset.description && (
                            <span className="truncate text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                                {entry.preset.description}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <LatencyPill i18n={i18n} ping={ping} />

                    <button
                        type="button"
                        title={t('servers.pingTitle')}
                        disabled={busy || ping?.status === 'testing'}
                        onClick={() => pingOne(entry)}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-raised)] hover:text-[var(--dnss-ink-1)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <SignalIcon className="size-4 shrink-0" />
                    </button>

                    {/* Split Apply control */}
                    <div
                        className={`inline-flex items-stretch overflow-hidden rounded-lg ${
                            isActive
                                ? 'ring-1 ring-inset ring-[var(--dnss-accent)]/35'
                                : ''
                        }`}
                    >
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => quickApply(entry)}
                            className={`inline-flex h-8 items-center gap-1.5 px-3 text-[length:var(--dnss-fs-xs)] font-medium ${
                                isActive
                                    ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)] hover:bg-[var(--dnss-accent)]/20'
                                    : 'bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {isApplying ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                isActive && (
                                    <CheckIcon className="size-3.5 shrink-0 stroke-[2.2]" />
                                )
                            )}
                            {isActive ? t('common.applied') : t('common.apply')}
                        </button>
                        <button
                            ref={setTrigger(entry.key)}
                            type="button"
                            disabled={busy}
                            title={t('servers.applyChooseAdapters')}
                            aria-label={t('servers.applyChooseAdapters')}
                            aria-expanded={applyMenuKey === entry.key}
                            onClick={() => {
                                if (applyMenuKey === entry.key) {
                                    setApplyMenuKey(null);
                                } else {
                                    openApplyMenu(entry);
                                }
                            }}
                            className={`grid w-6 shrink-0 place-items-center border-s ${
                                isActive
                                    ? 'border-[var(--dnss-accent)]/25 bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)] hover:bg-[var(--dnss-accent)]/20'
                                    : 'border-black/15 bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            <ChevronDownIcon className="size-3.5 shrink-0" />
                        </button>
                    </div>

                    <FloatingPanel
                        anchor={triggerEls.current.get(entry.key) ?? null}
                        open={applyMenuKey === entry.key}
                        onClose={() => setApplyMenuKey(null)}
                        placement="bottom"
                        className="dnss-popover w-64 rounded-xl p-3"
                    >
                        <div className="mb-2 text-[length:var(--dnss-fs-xs)] font-semibold text-[var(--dnss-ink-2)]">
                            {t('servers.applyTo')}
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--dnss-hover)]">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-xs checkbox-primary"
                                checked={applyAll}
                                onChange={() => setApplyAll((v) => !v)}
                            />
                            <span className="text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-1)]">
                                {t('servers.allAdapters')}
                            </span>
                            <span className="ms-auto text-[length:var(--dnss-fs-2xs)] tabular-nums text-[var(--dnss-ink-3)]">
                                {num(adapters.length)}
                            </span>
                        </label>
                        <div className="my-1.5 border-t border-[var(--dnss-border)]" />
                        <div className="max-h-40 overflow-y-auto">
                            {adapters.map((a) => (
                                <label
                                    key={a.name}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--dnss-hover)] ${
                                        applyAll
                                            ? 'pointer-events-none opacity-45'
                                            : ''
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-xs checkbox-primary"
                                        disabled={applyAll}
                                        checked={
                                            applyAll ||
                                            applySelection.has(a.name)
                                        }
                                        onChange={() =>
                                            toggleApplyAdapter(a.name)
                                        }
                                    />
                                    <span className="truncate text-[length:var(--dnss-fs-sm)] text-[var(--dnss-ink-1)]">
                                        {a.name}
                                    </span>
                                    {a.is_default && (
                                        <span className="ms-auto shrink-0 rounded-md border border-[var(--dnss-accent)]/30 bg-[var(--dnss-accent-soft)] px-1.5 py-0.5 text-[length:var(--dnss-fs-2xs)] font-semibold text-[var(--dnss-accent-text)]">
                                            {t('common.default')}
                                        </span>
                                    )}
                                </label>
                            ))}
                            {adapters.length === 0 && (
                                <div className="px-2 py-2 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                                    {t('home.noAdapters')}
                                </div>
                            )}
                        </div>
                        <div className="mt-2.5 flex justify-end gap-1.5">
                            <button
                                type="button"
                                className="rounded-lg px-2.5 py-1 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)]"
                                onClick={() => setApplyMenuKey(null)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-[var(--dnss-accent)] px-3 py-1 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)] disabled:opacity-45"
                                disabled={
                                    !applyAll && applySelection.size === 0
                                }
                                onClick={() => submitApply(entry)}
                            >
                                {t('common.apply')}
                            </button>
                        </div>
                    </FloatingPanel>

                    {entry.custom && (
                        <button
                            type="button"
                            title={t('common.edit')}
                            onClick={() => openEdit(entry.customIndex)}
                            className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-raised)] hover:text-[var(--dnss-ink-1)]"
                        >
                            <PencilSquareIcon className="size-4 shrink-0" />
                        </button>
                    )}

                    <button
                        ref={setTrigger(`del:${entry.key}`)}
                        type="button"
                        title={
                            entry.custom
                                ? t('common.delete')
                                : t('common.remove')
                        }
                        aria-label={
                            entry.custom
                                ? t('common.delete')
                                : t('common.remove')
                        }
                        disabled={busy}
                        onClick={() => {
                            setApplyMenuKey(null);
                            setConfirmKey(entry.key);
                        }}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-3)] hover:bg-[var(--dnss-error-soft)] hover:text-[var(--dnss-error)] disabled:opacity-40"
                    >
                        <TrashIcon className="size-4 shrink-0" />
                    </button>

                    <FloatingPanel
                        anchor={
                            triggerEls.current.get(`del:${entry.key}`) ?? null
                        }
                        open={confirmKey === entry.key}
                        onClose={() => setConfirmKey(null)}
                        placement="bottom"
                        className="dnss-popover w-56 rounded-xl p-3"
                    >
                        <div className="text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-1)]">
                            {entry.custom
                                ? t('servers.deleteConfirm', {
                                      name: entry.preset.name,
                                  })
                                : t('servers.removePresetConfirm', {
                                      name: entry.preset.name,
                                  })}
                        </div>
                        {!entry.custom && (
                            <div className="mt-1 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                                {t('servers.removePresetHint')}
                            </div>
                        )}
                        <div className="mt-2.5 flex justify-end gap-1.5">
                            <button
                                type="button"
                                className="rounded-lg px-2.5 py-1 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)]"
                                onClick={() => setConfirmKey(null)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-[var(--dnss-error)] px-2.5 py-1 text-[length:var(--dnss-fs-xs)] font-medium text-white hover:opacity-90"
                                onClick={() => {
                                    if (entry.custom) {
                                        void removeConfig(entry.customIndex);
                                    } else {
                                        onHidePreset(entry.preset.id);
                                        setConfirmKey(null);
                                        showToast(
                                            t('toast.presetRemoved', {
                                                name: entry.preset.name,
                                            })
                                        );
                                    }
                                }}
                            >
                                {entry.custom
                                    ? t('common.delete')
                                    : t('common.remove')}
                            </button>
                        </div>
                    </FloatingPanel>
                </div>
            </li>
        );
    };

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5">
            {/* Header & Primary Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-[length:var(--dnss-fs-lg)] font-semibold text-[var(--dnss-ink-1)]">
                    {t('servers.title')}
                </h2>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={runBenchmark}
                        disabled={benchmarking}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-surface)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] ring-1 ring-[var(--dnss-border-strong)] hover:bg-[var(--dnss-raised)] disabled:opacity-50"
                    >
                        {benchmarking ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : (
                            <BoltIcon className="size-4 shrink-0 text-[var(--dnss-accent)]" />
                        )}
                        {benchmarking
                            ? t('servers.benchmarking')
                            : t('servers.benchmark')}
                    </button>

                    <button
                        type="button"
                        onClick={openAdd}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-accent)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]"
                    >
                        <PlusIcon className="size-4 shrink-0" />
                        {t('common.add')}
                    </button>
                </div>
            </div>

            {/* Search, Filter Pills & Custom Sort Selector */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="dnss-input flex h-9 min-w-[180px] grow items-center gap-2 rounded-xl px-3">
                    <MagnifyingGlassIcon className="size-4 shrink-0 text-[var(--dnss-ink-3)]" />
                    <input
                        type="search"
                        className="w-full bg-transparent text-[length:var(--dnss-fs-sm)] text-[var(--dnss-ink-1)] outline-none placeholder:text-[var(--dnss-ink-3)]"
                        placeholder={t('servers.search')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </label>

                {/* Filter Pills */}
                <div className="inline-flex items-center rounded-xl bg-[var(--dnss-surface)] p-1 ring-1 ring-[var(--dnss-border)]">
                    {(
                        [
                            {
                                id: 'all',
                                label: t('servers.filterAll'),
                                count:
                                    visibleSaved.length + visiblePresets.length,
                            },
                            {
                                id: 'custom',
                                label: t('servers.filterCustom'),
                                count: visibleSaved.length,
                            },
                            {
                                id: 'builtin',
                                label: t('servers.filterBuiltin'),
                                count: visiblePresets.length,
                            },
                        ] as const
                    ).map((tab) => {
                        const active = filterTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setFilterTab(tab.id)}
                                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[length:var(--dnss-fs-xs)] font-medium ${
                                    active
                                        ? 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-1)]'
                                        : 'text-[var(--dnss-ink-2)] hover:text-[var(--dnss-ink-1)]'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className="text-[length:var(--dnss-fs-2xs)] tabular-nums text-[var(--dnss-ink-3)]">
                                    {num(tab.count)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Custom Notion-smooth Sort Selector */}
                <CustomSelect
                    value={sortBy}
                    options={sortOptions}
                    onChange={setSortBy}
                    icon={<ArrowsUpDownIcon className="size-4 shrink-0" />}
                    ariaLabel={t('servers.sortTitle')}
                    title={t('servers.sortTitle')}
                    className="min-w-[128px] bg-[var(--dnss-surface)]"
                />
            </div>

            {/* Compact Benchmark Target Strip */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--dnss-surface)] px-3 py-2 ring-1 ring-[var(--dnss-border)]">
                <span className="shrink-0 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-2)]">
                    {t('servers.benchTarget')}:
                </span>
                <input
                    dir="ltr"
                    className="min-w-[180px] grow bg-transparent font-mono text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-1)] outline-none placeholder:text-[var(--dnss-ink-3)]"
                    placeholder={DEFAULT_BENCHMARK_TARGET}
                    title={t('servers.benchTargetHint')}
                    value={benchmarkTarget}
                    onChange={(e) => handleTargetChange(e.target.value)}
                />
            </div>

            {/* VPN / TUN Benchmark Diagnostic Banner */}
            {benchWarning && (
                <div className="toast-pop flex items-start gap-2.5 rounded-xl border border-[var(--dnss-warning)]/30 bg-[var(--dnss-warning-soft)] px-3.5 py-2.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-warning)]">
                    <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1">{benchWarning}</span>
                    <button
                        type="button"
                        onClick={() => setBenchWarning(null)}
                        aria-label={t('common.cancel')}
                        className="grid size-5 shrink-0 place-items-center rounded hover:bg-black/10"
                    >
                        <XMarkIcon className="size-3.5" />
                    </button>
                </div>
            )}

            {/* Server List with AutoAnimate smooth row reordering */}
            <section className="dnss-card overflow-hidden rounded-2xl">
                {visibleEntries.length > 0 ? (
                    <ul
                        ref={listRef}
                        className="divide-y divide-[var(--dnss-border)]"
                    >
                        {visibleEntries.map(renderRow)}
                    </ul>
                ) : (
                    <div className="px-4 py-10 text-center text-[length:var(--dnss-fs-sm)] text-[var(--dnss-ink-3)]">
                        {filterTab === 'custom'
                            ? query
                                ? t('servers.noSavedMatch', { query })
                                : t('servers.noSavedYet')
                            : t('servers.noPresetMatch', { query })}
                    </div>
                )}
            </section>

            {/* Add / Edit Modal */}
            {form && (
                <ServerModal
                    key={`${form.mode}:${form.index}`}
                    i18n={i18n}
                    mode={form.mode}
                    initialName={
                        form.mode === 'edit'
                            ? (configs[form.index]?.name ?? '')
                            : ''
                    }
                    name={name}
                    primary={primary}
                    alternative={alternative}
                    saving={saving}
                    onName={setName}
                    onPrimary={setPrimary}
                    onAlternative={setAlternative}
                    onSubmit={submitForm}
                    onCancel={closeForm}
                />
            )}
        </div>
    );
}
