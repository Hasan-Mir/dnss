import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircleIcon,
    Cog6ToothIcon,
    ComputerDesktopIcon,
    ExclamationTriangleIcon,
    HomeIcon,
    MoonIcon,
    ServerStackIcon,
    SunIcon,
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
import {
    applyTheme,
    loadTheme,
    saveTheme,
    watchSystemTheme,
    type ThemeMode,
} from './theme';
import { applyLang, createI18n, loadLang, saveLang, type Lang } from './i18n';
import HomePage from './pages/Home';
import ServersPage from './pages/Servers';
import SettingsPage from './pages/Settings';

export type Page = 'home' | 'servers' | 'settings';

/** Where a DNS change should land: every adapter, or an explicit list. */
export type ApplyTargets = 'all' | string[];

/** Which control started the blocking operation that is currently running.
    Only the initiating control renders a spinner; everything else merely
    disables, so clicking one button never makes unrelated buttons pretend
    to be working. */
type BusyOp =
    | { kind: 'apply'; id: string }
    | { kind: 'flush' }
    | { kind: 'reset-all' }
    | null;

/** Short OS commands (DNS cache flush) finish faster than a spinner can be
    perceived; hold the busy state for at least this long so the indicator
    reads as feedback instead of a flicker. */
const MIN_BUSY_MS = 700;

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

function ThemeIcon({
    mode,
    className,
}: {
    mode: ThemeMode;
    className?: string;
}) {
    return mode === 'light' ? (
        <SunIcon className={className} />
    ) : mode === 'dark' ? (
        <MoonIcon className={className} />
    ) : (
        <ComputerDesktopIcon className={className} />
    );
}

export default function App() {
    const [page, setPage] = useState<Page>('home');
    const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
    const [lang, setLang] = useState<Lang>(loadLang);
    const [adapters, setAdapters] = useState<Adapter[]>([]);
    const [activeAdapter, setActiveAdapter] = useState<Adapter | null>(null);
    const [activeDns, setActiveDns] = useState<DnsStatus | null>(null);
    const [configs, setConfigs] = useState<DnsConfig[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyOp, setBusyOp] = useState<BusyOp>(null);
    // Status refreshes run outside `busy` (they also happen on app start),
    // but the refresh button and loading bar must still reflect them.
    const [refreshing, setRefreshing] = useState(false);
    const [toast, setToast] = useState<{
        message: string;
        kind: 'success' | 'error';
    } | null>(null);
    // Keep the active timer handle so consecutive toasts don't dismiss each
    // other after a fraction of their display time.
    const toastTimer = useRef<number | null>(null);

    // Language / direction: mirrors onto <html> and persists on change.
    useEffect(() => {
        applyLang(lang);
        saveLang(lang);
    }, [lang]);

    const i18n = useMemo(() => createI18n(lang), [lang]);
    const { t } = i18n;

    const showToast = useCallback(
        (message: string, kind: 'success' | 'error' = 'success') => {
            if (toastTimer.current !== null) {
                window.clearTimeout(toastTimer.current);
            }
            setToast({ message, kind });
            toastTimer.current = window.setTimeout(() => {
                toastTimer.current = null;
                setToast(null);
            }, 3500);
        },
        []
    );

    // Theme
    useEffect(() => {
        applyTheme(theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => watchSystemTheme(() => applyTheme(loadTheme())), []);

    // Saved custom servers live in ~/.dnss/configs.json (shared with the
    // CLI); the app owns the list so Home can annotate addresses with their
    // configured names and Servers can edit the list in place.
    useEffect(() => {
        api.getConfigs()
            .then(setConfigs)
            .catch((error) =>
                showToast(
                    t('toast.loadSavedFailed', { error: String(error) }),
                    'error'
                )
            );
    }, [showToast, t]);

    // Overlapping refreshes (rapid clicks, apply + refresh) must not apply
    // out of order; only the latest invocation may update state.
    const refreshSeq = useRef(0);

    const refreshStatus = useCallback(async (opts?: { silent?: boolean }) => {
        const seq = ++refreshSeq.current;
        // Silent refreshes (after an apply/reset) update the data while the
        // initiating control's own spinner is showing; only user-initiated
        // refreshes spin the Refresh status icon.
        if (!opts?.silent) {
            setRefreshing(true);
        }

        try {
            const status = await api.getNetworkStatus();
            if (seq !== refreshSeq.current) {
                return;
            }
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
            setLoadError(null);
        } catch (error) {
            if (seq !== refreshSeq.current) {
                return;
            }
            // Surface backend/OS failures instead of silently showing an
            // empty state that looks like "nothing configured".
            setActiveAdapter(null);
            setActiveDns(null);
            setLoadError(String(error));
        } finally {
            // A stale call must not clear a newer invocation's flag. The
            // latest call always clears, silent or not: no refresh is in
            // flight anymore at that point.
            if (seq === refreshSeq.current) {
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    const handleApplyServers = useCallback(
        async (servers: string[], targets: ApplyTargets, busyId: string) => {
            try {
                setBusyOp({ kind: 'apply', id: busyId });
                // One backend round trip for any number of adapters; the
                // backend validates the names against the OS and reports
                // per-adapter outcomes.
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
                                .map((f) => `${f.adapter}: ${f.error}`)
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

                await refreshStatus({ silent: true });
            } catch (error) {
                showToast(
                    t('toast.failed', { details: String(error) }),
                    'error'
                );
            } finally {
                setBusyOp(null);
            }
        },
        [refreshStatus, showToast, t]
    );

    // The Home power circle: remembers the DNS an adapter was using so the
    // same click that resets to DHCP can later restore it. Memory is keyed
    // per adapter (switching networks must not restore the wrong servers).
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

    // Track the adapter's current custom DNS: whenever one is observed in
    // use, it becomes the restore candidate. This keeps the memory correct
    // no matter where a change came from — the power circle, the Servers
    // tab, or even the CLI editing the same adapter.
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAdapter, activeDns]);

    const rememberedServers = useMemo(
        () => readDnsMemory(activeAdapter?.name ?? null),
        // Re-read whenever the status changes so a toggle reflects immediately.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activeAdapter, activeDns, readDnsMemory]
    );

    const handleToggleHomeDns = useCallback(async () => {
        if (!activeAdapter || !activeDns) {
            showToast(t('toast.noActiveAdapter'), 'error');
            return;
        }
        if (activeDns.static_servers.length > 0) {
            // Custom DNS is ON: remember it, then reset to DHCP. The memory
            // write is what makes the next click able to restore.
            localStorage.setItem(
                dnsMemoryKey(activeAdapter.name),
                JSON.stringify(activeDns.static_servers)
            );
            await handleApplyServers([], [activeAdapter.name], 'home-circle');
        } else {
            const servers = readDnsMemory(activeAdapter.name);

            if (servers.length === 0) {
                showToast(t('toast.noRememberedDns'), 'error');
                return;
            }

            // Restore works with the bare remembered addresses even if the
            // saved configuration behind them was deleted in the meantime.
            await handleApplyServers(
                servers,
                [activeAdapter.name],
                'home-circle'
            );
        }
    }, [
        activeAdapter,
        activeDns,
        handleApplyServers,
        readDnsMemory,
        showToast,
        t,
    ]);

    const handleFlushDns = useCallback(async () => {
        try {
            setBusyOp({ kind: 'flush' });
            // ipconfig /flushdns often finishes in well under a second;
            // the minimum duration keeps its spinner readable.
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

    const handleResetAll = useCallback(async () => {
        try {
            setBusyOp({ kind: 'reset-all' });
            const outcomes = await api.resetAll();
            const failures = outcomes.filter((o) => !o.ok);
            if (outcomes.length === 0) {
                showToast(t('toast.noAdaptersToReset'), 'error');
            } else if (failures.length > 0) {
                showToast(
                    t('toast.failed', {
                        details: failures
                            .map((f) => `${f.adapter}: ${f.error}`)
                            .join('; '),
                    }),
                    'error'
                );
            } else {
                showToast(t('toast.allReset'));
            }
            await refreshStatus({ silent: true });
        } catch (error) {
            showToast(
                t('toast.resetFailed', { error: String(error) }),
                'error'
            );
        } finally {
            setBusyOp(null);
        }
    }, [refreshStatus, showToast, t]);

    // Persist first, update state only on success: an optimistic update made
    // entries that failed to save look stored (and applyable) until reload.
    const persistConfigs = useCallback(
        async (next: DnsConfig[]): Promise<boolean> => {
            try {
                const saved = await api.saveConfigs(next);
                setConfigs(saved);
                return true;
            } catch (error) {
                showToast(
                    t('toast.saveFailed', { error: String(error) }),
                    'error'
                );
                return false;
            }
        },
        [showToast, t]
    );

    // Address -> display name lookup (saved configs + built-in presets), so
    // Home can show e.g. "1.1.1.1 — Cloudflare" like the CLI tables do.
    const dnsNameLookup = useMemo(() => {
        const lookup = new Map<string, string>();
        const add = (address: string | undefined, name: string) => {
            if (address && !lookup.has(address)) {
                lookup.set(address, name);
            }
        };
        for (const config of configs) {
            add(config.primary, config.name);
            add(config.alternative, config.name);
        }
        for (const preset of DNS_PRESETS) {
            add(preset.primary, preset.name);
            add(preset.alternative, preset.name);
        }
        return lookup;
    }, [configs]);

    const busy = busyOp !== null;

    const isCustomDnsActive = Boolean(
        activeDns && activeDns.static_servers.length > 0
    );

    // The UI depends on the Tauri IPC bridge, which only exists inside the
    // desktop window. In a plain browser (localhost:1420) every command
    // would fail, so explain that up front instead of a screen of
    // "Cannot read properties of undefined (reading 'invoke')" errors.
    if (!isDesktopApp()) {
        return (
            <div className="flex h-full flex-col">
                <main className="grow overflow-y-auto p-6">
                    <div className="card mx-auto mt-16 w-full max-w-md border border-base-300/40 bg-base-100 shadow-sm">
                        <div className="card-body gap-3">
                            <h2 className="card-title">
                                {t('nodesktop.title')}
                            </h2>
                            <p className="text-sm leading-relaxed">
                                {t('nodesktop.body')}
                            </p>
                            <p className="text-xs leading-relaxed opacity-60">
                                {t('nodesktop.devPrefix')}
                                <code className="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">
                                    npm run dev
                                </code>
                                {t('nodesktop.devSuffix')}
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const toastMessage = toast?.message ?? loadError;
    const toastIsError = toast ? toast.kind === 'error' : true;

    return (
        <div className="flex h-full flex-col">
            <header className="flex select-none items-center justify-between border-b border-base-300/60 bg-base-100 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-content">
                        D
                    </div>
                    <span className="text-lg font-bold tracking-wide">
                        DNSS
                    </span>
                    <span className="text-xs opacity-60">
                        {t('app.tagline')}
                    </span>
                </div>
                <button
                    className="btn btn-circle btn-ghost btn-sm"
                    title={t('app.toggleTheme')}
                    onClick={() =>
                        setTheme((th) =>
                            th === 'light'
                                ? 'dark'
                                : th === 'dark'
                                  ? 'system'
                                  : 'light'
                        )
                    }
                >
                    <ThemeIcon mode={theme} className="size-5" />
                </button>
            </header>

            {/* App-wide busy indicator: DNS changes run OS commands that take
                a moment; without this the UI can look frozen mid-apply. */}
            {(busy || refreshing) && (
                <div
                    className="loading-bar shrink-0"
                    role="status"
                    aria-label={t('app.working')}
                />
            )}

            <main className="grow overflow-y-auto px-4 py-5 pb-24">
                <div className="flex w-full flex-col gap-4">
                    {/* Pages stay mounted (hidden instead of unmounted) so
                        in-flight work like a benchmark run survives tab
                        switches instead of being dropped with the state.
                        Each page picks its own comfortable max width. */}
                    <div hidden={page !== 'home'}>
                        <HomePage
                            i18n={i18n}
                            activeAdapter={activeAdapter}
                            activeDns={activeDns}
                            isCustomDnsActive={isCustomDnsActive}
                            rememberedServers={rememberedServers}
                            adapters={adapters}
                            busy={busy}
                            toggleBusy={
                                busyOp?.kind === 'apply' &&
                                busyOp.id === 'home-circle'
                            }
                            flushBusy={busyOp?.kind === 'flush'}
                            refreshing={refreshing}
                            onToggleDns={handleToggleHomeDns}
                            onFlushDns={handleFlushDns}
                            refreshStatus={refreshStatus}
                            dnsNameLookup={dnsNameLookup}
                        />
                    </div>
                    <div hidden={page !== 'servers'}>
                        <ServersPage
                            i18n={i18n}
                            adapters={adapters}
                            activeAdapterName={activeAdapter?.name ?? null}
                            configs={configs}
                            persistConfigs={persistConfigs}
                            busy={busy}
                            applyBusyId={
                                busyOp?.kind === 'apply' ? busyOp.id : null
                            }
                            onApply={handleApplyServers}
                            showToast={showToast}
                        />
                    </div>
                    <div hidden={page !== 'settings'}>
                        <SettingsPage
                            i18n={i18n}
                            onLangChange={setLang}
                            theme={theme}
                            onThemeChange={setTheme}
                            busy={busy}
                            resetBusy={busyOp?.kind === 'reset-all'}
                            onResetAll={handleResetAll}
                        />
                    </div>
                </div>
            </main>

            {/* Centered, width-capped dock: on a maximized window the nav
                stays a compact bar instead of icons drifting apart across
                the full screen width. */}
            <nav className="dock mx-auto max-w-lg rounded-t-2xl">
                <button
                    className={page === 'home' ? 'dock-active' : ''}
                    onClick={() => setPage('home')}
                >
                    <HomeIcon className="size-5" />
                    <span className="dock-label">{t('dock.home')}</span>
                </button>
                <button
                    className={page === 'servers' ? 'dock-active' : ''}
                    onClick={() => setPage('servers')}
                >
                    <ServerStackIcon className="size-5" />
                    <span className="dock-label">{t('dock.servers')}</span>
                </button>
                <button
                    className={page === 'settings' ? 'dock-active' : ''}
                    onClick={() => setPage('settings')}
                >
                    <Cog6ToothIcon className="size-5" />
                    <span className="dock-label">{t('dock.settings')}</span>
                </button>
            </nav>

            {toastMessage && (
                /* Plain centered fixed positioning instead of daisyUI's
                   .toast-center, whose inset-inline + translate combo
                   double-flips under RTL and throws the toast off to the
                   wrong side of the window. */
                <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
                    <div
                        className={`alert pointer-events-auto shadow-lg ${toastIsError ? 'alert-error' : 'alert-success'}`}
                    >
                        {toastIsError ? (
                            <ExclamationTriangleIcon className="size-4" />
                        ) : (
                            <CheckCircleIcon className="size-4" />
                        )}
                        <span className="text-sm">{toastMessage}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
