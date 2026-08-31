import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    ArrowsUpDownIcon,
    BoltIcon,
    CheckIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    PlusIcon,
    SignalIcon,
    TrashIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { DNS_PRESETS, type DnsPreset } from '@seymi/dnss-core/presets';
import { validateIPv4 } from '@seymi/dnss-core/validate';
import { api, type Adapter, type DnsConfig } from '../api';
import FloatingPanel from '../components/FloatingPanel';
import type { I18n, MsgKey } from '../i18n';

interface PingState {
    status: 'idle' | 'testing' | 'ok' | 'timeout' | 'error';
    latencyMs?: number;
    error?: string;
}

interface ServersPageProps {
    /** Translations + text direction + localized digits. */
    i18n: I18n;
    adapters: Adapter[];
    activeAdapterName: string | null;
    configs: DnsConfig[];
    persistConfigs: (next: DnsConfig[]) => Promise<boolean>;
    /** Ids of built-in presets the user removed from this list. */
    hiddenPresets: string[];
    onHidePreset: (id: string) => void;
    /** True while ANY blocking operation runs — disables the controls. */
    busy: boolean;
    /** Key of the config whose Apply is running: that button spins, the
        other Apply buttons merely disable. */
    applyBusyId: string | null;
    onApply: (
        servers: string[],
        targets: 'all' | string[],
        busyId: string
    ) => void;
    showToast: (message: string, kind?: 'success' | 'error') => void;
}

const DEFAULT_BENCHMARK_TARGET = 'https://www.cloudflare.com';

type SortMode = 'default' | 'name' | 'latency';

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

/** Collapsible list section (accordion) with a header count and an optional
    header action. Floating panels opened from inside portal out of this
    wrapper, so the collapsed-size clipping never cuts them off. */
function Section({
    title,
    count,
    open,
    onToggle,
    action,
    /** Rotation applied to the chevron while collapsed — flipped for RTL
        so it points toward the reading direction either way. */
    closedRotate,
    children,
}: {
    title: string;
    count: string;
    open: boolean;
    onToggle: () => void;
    action?: ReactNode;
    closedRotate: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-base-300/40 bg-base-100 shadow-sm">
            <div
                role="button"
                tabIndex={0}
                className="flex w-full cursor-pointer select-none items-center gap-2 px-4 py-3 outline-none"
                onClick={onToggle}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle();
                    }
                }}
            >
                <ChevronDownIcon
                    className={`size-4 opacity-60 transition-transform duration-200 ${
                        open ? '' : closedRotate
                    }`}
                />
                <span className="text-sm font-semibold">{title}</span>
                <span className="badge badge-ghost badge-sm">{count}</span>
                <span className="grow" />
                {action && (
                    <span onClick={(e) => e.stopPropagation()}>{action}</span>
                )}
            </div>
            <div
                className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
            >
                <div className="min-h-0">
                    <div className="flex flex-col gap-2 px-3 pb-3">
                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
}

/** One server row: identity + status badge + ping/apply (+ edit/delete). */
function ServerCard({
    i18n,
    entry,
    ping,
    busy,
    applyBusy,
    applyOpen,
    applyButtonRef,
    onPing,
    onApplyClick,
    applyMenu,
    extraButtons,
}: {
    i18n: I18n;
    entry: Entry;
    ping?: PingState;
    busy: boolean;
    applyBusy: boolean;
    applyOpen: boolean;
    /** Registers the apply button as the anchor of its floating menu. */
    applyButtonRef: (el: HTMLButtonElement | null) => void;
    onPing: () => void;
    onApplyClick: () => void;
    applyMenu: ReactNode;
    extraButtons?: ReactNode;
}) {
    return (
        <div className="card border border-base-300/40 bg-base-100 shadow-sm">
            <div className="card-body flex-row items-center gap-3 p-3.5">
                <div className="min-w-0 grow">
                    <div className="truncate text-sm font-semibold">
                        {entry.preset.name}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs opacity-70">
                        <span dir="ltr">
                            {entry.preset.primary}
                            {entry.preset.alternative
                                ? ` · ${entry.preset.alternative}`
                                : ''}
                        </span>
                    </div>
                    {entry.preset.description && (
                        <div className="mt-1 text-xs opacity-60">
                            {entry.preset.description}
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {ping?.status === 'ok' ? (
                        <span
                            dir="ltr"
                            className="badge badge-sm badge-success"
                        >
                            {i18n.t('servers.ms', {
                                n: ping.latencyMs ?? 0,
                            })}
                        </span>
                    ) : ping?.status === 'testing' ? (
                        <span
                            className="badge badge-sm badge-ghost"
                            title={i18n.t('servers.measuring')}
                        >
                            {/* <span className="loading loading-dots loading-xs" /> */}
                            <span className="loading loading-spinner loading-xs" />
                        </span>
                    ) : ping?.status === 'timeout' ? (
                        <span
                            className="badge badge-sm badge-warning"
                            title={ping.error}
                        >
                            {i18n.t('servers.timeoutBadge')}
                        </span>
                    ) : ping?.status === 'error' ? (
                        <span
                            className="badge badge-sm badge-error"
                            title={ping.error}
                        >
                            {i18n.t('servers.errorBadge')}
                        </span>
                    ) : (
                        <span className="badge badge-sm badge-ghost">
                            {i18n.t('servers.pingBadge')}
                        </span>
                    )}

                    <button
                        className="btn btn-circle btn-ghost btn-sm"
                        title={i18n.t('servers.pingTitle')}
                        disabled={busy || ping?.status === 'testing'}
                        onClick={onPing}
                    >
                        <SignalIcon className="size-4" />
                    </button>

                    <button
                        ref={applyButtonRef}
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-expanded={applyOpen}
                        onClick={onApplyClick}
                    >
                        {applyBusy && (
                            <span className="loading loading-spinner loading-xs" />
                        )}
                        {i18n.t('common.apply')}
                    </button>

                    {applyMenu}

                    {extraButtons}
                </div>
            </div>
        </div>
    );
}

/** Inline add/edit form, rendered directly below the affected server. */
function ServerForm({
    i18n,
    mode,
    initialName,
    name,
    primary,
    alternative,
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
    onName: (v: string) => void;
    onPrimary: (v: string) => void;
    onAlternative: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="card border border-dashed border-base-300 bg-base-200/40">
            <div className="card-body gap-2 p-3">
                <div className="text-xs font-semibold opacity-70">
                    {mode === 'edit'
                        ? i18n.t('form.edit', { name: initialName })
                        : i18n.t('form.new')}
                </div>
                <input
                    className="input input-sm w-full"
                    placeholder={i18n.t('form.namePh')}
                    value={name}
                    onChange={(e) => onName(e.target.value)}
                />
                <input
                    dir="ltr"
                    className="input input-sm w-full font-mono"
                    placeholder={i18n.t('form.primaryPh')}
                    value={primary}
                    onChange={(e) => onPrimary(e.target.value)}
                />
                <input
                    dir="ltr"
                    className="input input-sm w-full font-mono"
                    placeholder={i18n.t('form.altPh')}
                    value={alternative}
                    onChange={(e) => onAlternative(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={onCancel}>
                        <XMarkIcon className="size-4" />
                        {i18n.t('common.cancel')}
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={onSubmit}
                    >
                        <CheckIcon className="size-4" />
                        {mode === 'edit'
                            ? i18n.t('common.update')
                            : i18n.t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ServersPage({
    i18n,
    adapters,
    activeAdapterName,
    configs,
    persistConfigs,
    hiddenPresets,
    onHidePreset,
    busy,
    applyBusyId,
    onApply,
    showToast,
}: ServersPageProps) {
    const { t, num } = i18n;
    // Collapsed accordions point toward the reading direction.
    const closedChevron = i18n.dir === 'rtl' ? 'rotate-90' : '-rotate-90';
    const [pings, setPings] = useState<Record<string, PingState>>({});
    const [benchmarking, setBenchmarking] = useState(false);
    const [benchmarkTarget, setBenchmarkTarget] = useState(
        () =>
            localStorage.getItem('dnss.benchmarkTarget') ??
            DEFAULT_BENCHMARK_TARGET
    );
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<SortMode>('default');
    const [sortOpen, setSortOpen] = useState(false);
    const [savedOpen, setSavedOpen] = useState(true);
    const [presetsOpen, setPresetsOpen] = useState(true);

    // null = closed; { mode: 'add' } renders at the end of the saved list,
    // { mode: 'edit', index } renders right below the edited server.
    const [form, setForm] = useState<FormState | null>(null);
    const [name, setName] = useState('');
    const [primary, setPrimary] = useState('');
    const [alternative, setAlternative] = useState('');

    // Floating panels (apply menu / delete confirm), one open at a time.
    const [applyMenuKey, setApplyMenuKey] = useState<string | null>(null);
    const [applyAll, setApplyAll] = useState(false);
    const [applySelection, setApplySelection] = useState<Set<string>>(
        new Set()
    );
    const [confirmKey, setConfirmKey] = useState<string | null>(null);

    // On-screen anchors for the portaled panels, keyed per trigger; the
    // panels render in a portal but must align to their own button.
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

    const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy);

    // Stable, content-derived keys: a bare index key ("custom-0") makes
    // benchmark results latch onto the WRONG server after removing an entry
    // that is not the last one. Keeping the index in the key still resets
    // stale results when the list shifts (they render as idle, never
    // misattributed).
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

    // Type-to-find across name and addresses, then optional sorting.
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
            const ping = pings[entry.key];
            return ping?.status === 'ok'
                ? (ping.latencyMs ?? Number.MAX_SAFE_INTEGER)
                : Number.MAX_SAFE_INTEGER;
        },
        [pings]
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

    const visibleSaved = orderEntries(savedEntries.filter(matches));
    const visiblePresets = orderEntries(presetEntries.filter(matches));

    const setPing = useCallback((key: string, state: PingState) => {
        setPings((prev) => ({ ...prev, [key]: state }));
    }, []);

    // Bounded concurrency runner: firing one IPC per entry all at once
    // would spawn that many blocking threads and sockets on the backend.
    const runBounded = async (items: Entry[], target: string) => {
        const concurrency = Math.min(4, items.length);
        const queue = [...items];
        const worker = async () => {
            let entry = queue.shift();
            while (entry) {
                try {
                    const sample = await api.benchmarkDns(
                        entry.preset.primary,
                        target
                    );
                    setPing(entry.key, {
                        status: 'ok',
                        latencyMs: sample.resolve_ms + (sample.connect_ms ?? 0),
                    });
                } catch (error) {
                    const message = String(error);
                    // Backend refusals (invalid server, suspicious resolved
                    // address) are errors, not timeouts.
                    const isTimeout = /timed?\s?out|timeout/i.test(message);
                    setPing(entry.key, {
                        status: isTimeout ? 'timeout' : 'error',
                        error: message,
                    });
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
                allEntries.map((e) => [e.key, { status: 'testing' as const }])
            )
        );
        await runBounded(allEntries, benchmarkTarget);
        setBenchmarking(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allEntries, benchmarkTarget]);

    const pingOne = useCallback(
        async (entry: Entry) => {
            setPing(entry.key, { status: 'testing' });
            try {
                const sample = await api.benchmarkDns(
                    entry.preset.primary,
                    benchmarkTarget
                );
                setPing(entry.key, {
                    status: 'ok',
                    latencyMs: sample.resolve_ms + (sample.connect_ms ?? 0),
                });
            } catch (error) {
                const message = String(error);
                const isTimeout = /timed?\s?out|timeout/i.test(message);
                setPing(entry.key, {
                    status: isTimeout ? 'timeout' : 'error',
                    error: message,
                });
            }
        },
        [benchmarkTarget, setPing]
    );

    const openApplyMenu = useCallback(
        (entryKey: string) => {
            setConfirmKey(null);
            setApplyMenuKey(entryKey);
            setApplyAll(false);
            // Preselect the adapter currently in use so a plain
            // open -> Apply applies to the active adapter.
            const initial = activeAdapterName ?? adapters[0]?.name;
            setApplySelection(new Set(initial ? [initial] : []));
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

    const openAdd = () => {
        closePanels();
        setForm({ mode: 'add', index: -1 });
        setName('');
        setPrimary('');
        setAlternative('');
        setSavedOpen(true);
    };

    const openEdit = (index: number) => {
        const config = configs[index];
        if (!config) return;
        closePanels();
        setForm({ mode: 'edit', index });
        setName(config.name);
        setPrimary(config.primary);
        setAlternative(config.alternative ?? '');
        setSavedOpen(true);
    };

    const closeForm = () => {
        setForm(null);
        setName('');
        setPrimary('');
        setAlternative('');
    };

    const submitForm = async () => {
        if (!form) return;
        const trimmedName = name.trim();
        const trimmedPrimary = primary.trim();
        const trimmedAlternative = alternative.trim();
        if (!trimmedName || !trimmedPrimary) {
            showToast(t('toast.nameRequired'), 'error');
            return;
        }
        // Validate locally so obviously wrong input never reaches the
        // backend (which would reject the whole save).
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
        if (await persistConfigs(next)) {
            closeForm();
            showToast(
                form.mode === 'edit'
                    ? t('toast.updated', { name: trimmedName })
                    : t('toast.added', { name: trimmedName })
            );
        }
    };

    const removeConfig = async (index: number) => {
        if (await persistConfigs(configs.filter((_, i) => i !== index))) {
            setConfirmKey(null);
        }
    };

    const handleTargetChange = (value: string) => {
        setBenchmarkTarget(value);
        localStorage.setItem('dnss.benchmarkTarget', value);
    };

    const closePanels = () => {
        setApplyMenuKey(null);
        setConfirmKey(null);
    };

    const toggleSaved = () => {
        closePanels();
        setSavedOpen((v) => !v);
    };

    const togglePresets = () => {
        closePanels();
        setPresetsOpen((v) => !v);
    };

    const renderCard = (entry: Entry) => {
        const ping = pings[entry.key];
        const isEditingThis =
            form?.mode === 'edit' &&
            entry.custom &&
            form.index === entry.customIndex;
        return (
            <div key={entry.key} className="flex flex-col gap-2">
                <ServerCard
                    i18n={i18n}
                    entry={entry}
                    ping={ping}
                    busy={busy}
                    applyBusy={applyBusyId === entry.key}
                    applyOpen={applyMenuKey === entry.key}
                    applyButtonRef={setTrigger(entry.key)}
                    onPing={() => pingOne(entry)}
                    onApplyClick={() => {
                        if (applyMenuKey === entry.key) {
                            setApplyMenuKey(null);
                        } else {
                            openApplyMenu(entry.key);
                        }
                    }}
                    applyMenu={
                        applyMenuKey === entry.key ? (
                            <FloatingPanel
                                anchor={
                                    triggerEls.current.get(entry.key) ?? null
                                }
                                onClose={() => setApplyMenuKey(null)}
                                placement="top"
                                className="w-64 rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-xl"
                            >
                                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide opacity-60">
                                    {t('servers.applyTo')}
                                </div>
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-base-200">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm checkbox-primary"
                                        checked={applyAll}
                                        onChange={() => setApplyAll((v) => !v)}
                                    />
                                    <span className="text-sm font-medium">
                                        {t('servers.allAdapters')}
                                    </span>
                                    <span className="ms-auto text-[11px] opacity-50">
                                        {num(adapters.length)}
                                    </span>
                                </label>
                                <div className="my-1 border-t border-base-300/60" />
                                <div className="max-h-40 overflow-y-auto">
                                    {adapters.map((a) => (
                                        <label
                                            key={a.name}
                                            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-base-200 ${
                                                applyAll
                                                    ? 'pointer-events-none opacity-50'
                                                    : ''
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="checkbox checkbox-sm checkbox-primary"
                                                disabled={applyAll}
                                                checked={
                                                    applyAll ||
                                                    applySelection.has(a.name)
                                                }
                                                onChange={() =>
                                                    toggleApplyAdapter(a.name)
                                                }
                                            />
                                            <span className="truncate text-sm">
                                                {a.name}
                                            </span>
                                            {a.is_default && (
                                                <span className="badge badge-ghost badge-xs ms-auto shrink-0">
                                                    {t('common.default')}
                                                </span>
                                            )}
                                        </label>
                                    ))}
                                    {adapters.length === 0 && (
                                        <div className="px-2 py-2 text-xs opacity-60">
                                            {t('home.noAdapters')}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                    <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => setApplyMenuKey(null)}
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        className="btn btn-primary btn-xs"
                                        disabled={
                                            !applyAll &&
                                            applySelection.size === 0
                                        }
                                        onClick={() => submitApply(entry)}
                                    >
                                        {t('common.apply')}
                                    </button>
                                </div>
                            </FloatingPanel>
                        ) : null
                    }
                    extraButtons={
                        entry.custom ? (
                            <>
                                <button
                                    className="btn btn-circle btn-ghost btn-sm"
                                    title={t('common.edit')}
                                    onClick={() => openEdit(entry.customIndex)}
                                >
                                    <PencilSquareIcon className="size-4" />
                                </button>
                                <button
                                    ref={setTrigger(`del:${entry.key}`)}
                                    className="btn btn-circle btn-ghost btn-sm text-error hover:bg-error hover:text-error-content"
                                    title={t('common.delete')}
                                    onClick={() => {
                                        setApplyMenuKey(null);
                                        setConfirmKey(entry.key);
                                    }}
                                >
                                    <TrashIcon className="size-4" />
                                </button>
                                {confirmKey === entry.key && (
                                    <FloatingPanel
                                        anchor={
                                            triggerEls.current.get(
                                                `del:${entry.key}`
                                            ) ?? null
                                        }
                                        onClose={() => setConfirmKey(null)}
                                        placement="top"
                                        className="w-52 rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-xl"
                                    >
                                        <div className="text-sm">
                                            {t('servers.deleteConfirm', {
                                                name: entry.preset.name,
                                            })}
                                        </div>
                                        <div className="mt-2 flex justify-end gap-2">
                                            <button
                                                className="btn btn-ghost btn-xs"
                                                onClick={() =>
                                                    setConfirmKey(null)
                                                }
                                            >
                                                {t('common.cancel')}
                                            </button>
                                            <button
                                                className="btn btn-error btn-xs"
                                                onClick={() =>
                                                    removeConfig(
                                                        entry.customIndex
                                                    )
                                                }
                                            >
                                                {t('common.delete')}
                                            </button>
                                        </div>
                                    </FloatingPanel>
                                )}
                            </>
                        ) : (
                            // Built-in preset: removable from the list
                            // (restorable in Settings), never editable.
                            <>
                                <button
                                    ref={setTrigger(`del:${entry.key}`)}
                                    className="btn btn-circle btn-ghost btn-sm text-error hover:bg-error hover:text-error-content"
                                    title={t('common.remove')}
                                    aria-label={t('common.remove')}
                                    disabled={busy}
                                    onClick={() => {
                                        setApplyMenuKey(null);
                                        setConfirmKey(entry.key);
                                    }}
                                >
                                    <TrashIcon className="size-4" />
                                </button>
                                {confirmKey === entry.key && (
                                    <FloatingPanel
                                        anchor={
                                            triggerEls.current.get(
                                                `del:${entry.key}`
                                            ) ?? null
                                        }
                                        onClose={() => setConfirmKey(null)}
                                        placement="top"
                                        className="w-60 rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-xl"
                                    >
                                        <div className="text-sm">
                                            {t('servers.removePresetConfirm', {
                                                name: entry.preset.name,
                                            })}
                                        </div>
                                        <div className="mt-1 text-xs opacity-60">
                                            {t('servers.removePresetHint')}
                                        </div>
                                        <div className="mt-2 flex justify-end gap-2">
                                            <button
                                                className="btn btn-ghost btn-xs"
                                                onClick={() =>
                                                    setConfirmKey(null)
                                                }
                                            >
                                                {t('common.cancel')}
                                            </button>
                                            <button
                                                className="btn btn-error btn-xs"
                                                onClick={() => {
                                                    onHidePreset(
                                                        entry.preset.id
                                                    );
                                                    setConfirmKey(null);
                                                    showToast(
                                                        t(
                                                            'toast.presetRemoved',
                                                            {
                                                                name: entry
                                                                    .preset
                                                                    .name,
                                                            }
                                                        )
                                                    );
                                                }}
                                            >
                                                {t('common.remove')}
                                            </button>
                                        </div>
                                    </FloatingPanel>
                                )}
                            </>
                        )
                    }
                />
                {isEditingThis && (
                    <ServerForm
                        i18n={i18n}
                        mode="edit"
                        initialName={configs[entry.customIndex]?.name ?? ''}
                        name={name}
                        primary={primary}
                        alternative={alternative}
                        onName={setName}
                        onPrimary={setPrimary}
                        onAlternative={setAlternative}
                        onSubmit={submitForm}
                        onCancel={closeForm}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <h2 className="m-0 text-lg font-bold">{t('servers.title')}</h2>

            <div className="flex flex-wrap items-center gap-2">
                <label className="input input-sm flex grow items-center gap-2">
                    <MagnifyingGlassIcon className="size-4 opacity-60" />
                    <input
                        type="search"
                        className="grow"
                        placeholder={t('servers.search')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </label>
                <button
                    ref={setTrigger('sort')}
                    className="btn btn-sm w-40 justify-between font-normal"
                    title={t('servers.sortTitle')}
                    aria-expanded={sortOpen}
                    onClick={() => setSortOpen((v) => !v)}
                >
                    <span className="flex items-center gap-1.5">
                        <ArrowsUpDownIcon className="size-4 opacity-60" />
                        {currentSort && t(currentSort.label)}
                    </span>
                    <ChevronDownIcon
                        className={`size-3.5 opacity-60 transition-transform ${
                            sortOpen ? 'rotate-180' : ''
                        }`}
                    />
                </button>
                {sortOpen && (
                    <FloatingPanel
                        anchor={triggerEls.current.get('sort') ?? null}
                        onClose={() => setSortOpen(false)}
                        placement="bottom"
                        className="w-44 rounded-xl border border-base-300/60 bg-base-100 p-1.5 shadow-xl"
                    >
                        {SORT_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm hover:bg-base-200 ${
                                    sortBy === option.value
                                        ? 'font-semibold'
                                        : ''
                                }`}
                                onClick={() => {
                                    setSortBy(option.value);
                                    setSortOpen(false);
                                }}
                            >
                                <CheckIcon
                                    className={`size-4 ${
                                        sortBy === option.value
                                            ? 'text-primary'
                                            : 'opacity-0'
                                    }`}
                                />
                                {t(option.label)}
                            </button>
                        ))}
                    </FloatingPanel>
                )}
                <button
                    className="btn btn-primary btn-sm"
                    onClick={runBenchmark}
                    disabled={benchmarking}
                >
                    {benchmarking ? (
                        <span className="loading loading-spinner loading-xs" />
                    ) : (
                        <BoltIcon className="size-4" />
                    )}
                    {benchmarking
                        ? t('servers.benchmarking')
                        : t('servers.benchmark')}
                </button>
            </div>

            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body gap-1.5 p-3.5">
                    <div className="text-xs font-semibold opacity-70">
                        {t('servers.benchTarget')}
                    </div>
                    <input
                        dir="ltr"
                        className="input input-sm w-full font-mono"
                        placeholder={DEFAULT_BENCHMARK_TARGET}
                        value={benchmarkTarget}
                        onChange={(e) => handleTargetChange(e.target.value)}
                    />
                    <p className="text-xs opacity-60">
                        {t('servers.benchTargetHint')}
                    </p>
                </div>
            </div>

            <Section
                title={t('servers.saved')}
                count={num(visibleSaved.length)}
                open={savedOpen}
                onToggle={toggleSaved}
                closedRotate={closedChevron}
                action={
                    <button
                        className="btn btn-outline btn-xs"
                        onClick={openAdd}
                    >
                        <PlusIcon className="size-3.5" />
                        {t('common.add')}
                    </button>
                }
            >
                {form?.mode === 'add' && (
                    <ServerForm
                        i18n={i18n}
                        mode="add"
                        initialName=""
                        name={name}
                        primary={primary}
                        alternative={alternative}
                        onName={setName}
                        onPrimary={setPrimary}
                        onAlternative={setAlternative}
                        onSubmit={submitForm}
                        onCancel={closeForm}
                    />
                )}

                {visibleSaved.length > 0 ? (
                    visibleSaved.map(renderCard)
                ) : (
                    <div className="py-3 text-center text-xs opacity-60">
                        {query
                            ? t('servers.noSavedMatch', { query })
                            : t('servers.noSavedYet')}
                    </div>
                )}
            </Section>

            <Section
                title={t('servers.presets')}
                count={num(visiblePresets.length)}
                open={presetsOpen}
                onToggle={togglePresets}
                closedRotate={closedChevron}
            >
                {visiblePresets.length > 0 ? (
                    visiblePresets.map(renderCard)
                ) : (
                    <div className="py-3 text-center text-xs opacity-60">
                        {t('servers.noPresetMatch', { query })}
                    </div>
                )}
            </Section>
        </div>
    );
}
