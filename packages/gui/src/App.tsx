import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
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
    type AppSettings,
    type DnsConfig,
    type DnsStatus,
} from './api';
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
    saveAccent,
    saveFontFamily,
    saveFontSize,
    saveTheme,
    watchSystemTheme,
    type FontFamilyId,
    type FontSizePx,
    type ThemeMode,
} from './theme';
import { applyLang, createI18n, loadLang, saveLang, type Lang } from './i18n';
import appIcon from './assets/app-icon.png';
import { PortalContext } from './components/PortalContext';
import TitleBar from './components/TitleBar';
import HomePage from './pages/Home';
import ServersPage from './pages/Servers';
import SettingsPage from './pages/Settings';

export type Page = 'home' | 'servers' | 'settings';

/** Where a DNS change should land: every adapter, or an explicit list. */
export type ApplyTargets = 'all' | string[];

/** Which control started the blocking operation that is currently running. */
type BusyOp =
    | { kind: 'apply'; id: string }
    | { kind: 'flush' }
    | { kind: 'reset-all' }
    | null;

const MIN_BUSY_MS = 700;
const HIDDEN_PRESETS_KEY = 'dnss.hiddenPresets';
const BENCHMARK_TARGET_KEY = 'dnss.benchmarkTarget';
const DEFAULT_BENCHMARK_TARGET = 'https://www.cloudflare.com';

function serializeSettings(settings: AppSettings): string {
    return JSON.stringify({
        'dnss.schemaVersion': 1,
        'appearance.theme': settings['appearance.theme'],
        'appearance.accent': settings['appearance.accent'],
        'appearance.fontFamily': settings['appearance.fontFamily'],
        'appearance.fontSize': settings['appearance.fontSize'],
        'general.language': settings['general.language'],
        'benchmark.target':
            settings['benchmark.target'].trim() || DEFAULT_BENCHMARK_TARGET,
        'presets.hidden': settings['presets.hidden'],
        'dns.servers': settings['dns.servers'],
    });
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

export interface AppProps {
    theme?: ThemeMode;
    onThemeChange?: (theme: ThemeMode) => void;
    lang?: Lang;
    onLangChange?: (lang: Lang) => void;
    accent?: string;
    onAccentChange?: (accent: string) => void;
    /** Hide the frameless desktop TitleBar and scope portals/tokens inside the demo container. */
    embedded?: boolean;
}

export default function App({
    theme: externalTheme,
    onThemeChange: onExternalThemeChange,
    lang: externalLang,
    onLangChange: onExternalLangChange,
    accent: externalAccent,
    onAccentChange: onExternalAccentChange,
    embedded = false,
}: AppProps = {}) {
    const [page, setPage] = useState<Page>('home');
    const [theme, setTheme] = useState<ThemeMode>(
        () => externalTheme ?? loadTheme()
    );
    const [lang, setLang] = useState<Lang>(() => externalLang ?? loadLang());
    const [fontFamily, setFontFamily] = useState<FontFamilyId>(loadFontFamily);
    const [fontSize, setFontSize] = useState<FontSizePx>(loadFontSize);
    const [accent, setAccent] = useState<string>(
        () => externalAccent ?? loadAccent()
    );
    const [adapters, setAdapters] = useState<Adapter[]>([]);
    const [activeAdapter, setActiveAdapter] = useState<Adapter | null>(null);
    const [activeDns, setActiveDns] = useState<DnsStatus | null>(null);
    const [configs, setConfigs] = useState<DnsConfig[]>([]);
    const [hiddenPresets, setHiddenPresets] =
        useState<string[]>(loadHiddenPresets);
    const [benchmarkTarget, setBenchmarkTarget] = useState<string>(() => {
        const stored = localStorage.getItem(BENCHMARK_TARGET_KEY)?.trim();
        return stored || DEFAULT_BENCHMARK_TARGET;
    });
    const [appRootEl, setAppRootEl] = useState<HTMLDivElement | null>(null);
    const lastSyncedSettingsRef = useRef<string | null>(null);
    const externalThemeRef = useRef(externalTheme);
    externalThemeRef.current = externalTheme;
    const externalAccentRef = useRef(externalAccent);
    externalAccentRef.current = externalAccent;
    const externalLangRef = useRef(externalLang);
    externalLangRef.current = externalLang;
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyOp, setBusyOp] = useState<BusyOp>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [toast, setToast] = useState<{
        message: string;
        kind: 'success' | 'error';
    } | null>(null);
    const toastTimer = useRef<number | null>(null);

    const isEmbeddedDemo = embedded || Boolean(onExternalThemeChange);

    // Sync language & accent from external props (e.g. landing page workbench)
    useEffect(() => {
        if (externalLang && externalLang !== lang) {
            setLang(externalLang);
        }
    }, [externalLang, lang]);

    useEffect(() => {
        if (externalAccent && externalAccent !== accent) {
            setAccent(externalAccent);
        }
    }, [externalAccent, accent]);

    // Apply language changes (scoped to appRootEl in embedded demo mode)
    useEffect(() => {
        const target = isEmbeddedDemo ? appRootEl : document.documentElement;
        if (!target) return;
        applyLang(lang, target);
        if (!isEmbeddedDemo) {
            saveLang(lang);
        }
    }, [lang, isEmbeddedDemo, appRootEl]);

    const handleLangChange = useCallback(
        (newLang: Lang) => {
            setLang(newLang);
            if (onExternalLangChange) {
                onExternalLangChange(newLang);
            }
        },
        [onExternalLangChange]
    );

    const handleAccentChange = useCallback(
        (newAccent: string) => {
            setAccent(newAccent);
            if (onExternalAccentChange) {
                onExternalAccentChange(newAccent);
            }
        },
        [onExternalAccentChange]
    );

    const i18n = useMemo(() => createI18n(lang), [lang]);
    const { t } = i18n;
    const tRef = useRef(t);
    tRef.current = t;

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

    useEffect(() => {
        return () => {
            if (toastTimer.current !== null) {
                window.clearTimeout(toastTimer.current);
            }
        };
    }, []);

    // Sync theme from external prop
    useEffect(() => {
        if (externalTheme && externalTheme !== theme) {
            setTheme(externalTheme);
        }
    }, [externalTheme, theme]);

    // Apply theme, font, size, and accent changes (scoped to appRootEl when embedded)
    useEffect(() => {
        const target = isEmbeddedDemo ? appRootEl : document.documentElement;
        if (!target) return;
        applyTheme(theme, target, accent);
        if (!isEmbeddedDemo) {
            saveTheme(theme);
        }
    }, [theme, accent, isEmbeddedDemo, appRootEl]);

    useEffect(() => {
        const target = isEmbeddedDemo ? appRootEl : document.documentElement;
        if (!target) return;
        applyFontFamily(fontFamily, target);
        if (!isEmbeddedDemo) {
            saveFontFamily(fontFamily);
        }
    }, [fontFamily, isEmbeddedDemo, appRootEl]);

    useEffect(() => {
        const target = isEmbeddedDemo ? appRootEl : document.documentElement;
        if (!target) return;
        applyFontSize(fontSize, target);
        if (!isEmbeddedDemo) {
            saveFontSize(fontSize);
        }
    }, [fontSize, isEmbeddedDemo, appRootEl]);

    useEffect(() => {
        const target = isEmbeddedDemo ? appRootEl : document.documentElement;
        if (!target) return;
        applyAccent(accent, getResolvedTheme(theme), target);
        if (!isEmbeddedDemo) {
            saveAccent(accent);
        }
    }, [accent, theme, isEmbeddedDemo, appRootEl]);

    const handleThemeChange = useCallback(
        (newTheme: ThemeMode) => {
            setTheme(newTheme);
            if (onExternalThemeChange) {
                onExternalThemeChange(newTheme);
            }
        },
        [onExternalThemeChange]
    );

    useEffect(() => {
        if (isEmbeddedDemo) return;
        return watchSystemTheme(() => {
            applyTheme(loadTheme());
        });
    }, [isEmbeddedDemo]);

    // Sync appearance, language, and hidden presets if modified from the tray window.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === THEME_KEY && !externalTheme) {
                setTheme(loadTheme());
            } else if (e.key === 'dnss.lang' && !externalLang) {
                setLang(loadLang());
            } else if (e.key === FONT_KEY) {
                setFontFamily(loadFontFamily());
            } else if (e.key === FONT_SIZE_KEY) {
                setFontSize(loadFontSize());
            } else if (e.key === ACCENT_KEY) {
                setAccent(loadAccent());
            } else if (e.key === HIDDEN_PRESETS_KEY) {
                setHiddenPresets(loadHiddenPresets());
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [externalTheme, externalLang]);

    const updateSyncedConfigs = useCallback((nextConfigs: DnsConfig[]) => {
        if (!lastSyncedSettingsRef.current) return;
        try {
            const prev = JSON.parse(
                lastSyncedSettingsRef.current
            ) as AppSettings;
            lastSyncedSettingsRef.current = serializeSettings({
                ...prev,
                'dns.servers': nextConfigs,
            });
        } catch {
            // Ignore malformed snapshot
        }
    }, []);

    const loadConfigs = useCallback(() => {
        if (!isDesktopApp()) return;
        api.getConfigs()
            .then((loaded) => {
                updateSyncedConfigs(loaded);
                setConfigs(loaded);
            })
            .catch((error) => {
                showToast(
                    tRef.current('toast.loadSavedFailed', {
                        error: String(error),
                    }),
                    'error'
                );
            });
    }, [showToast, updateSyncedConfigs]);

    const applyHydratedSettings = useCallback(
        (settings: AppSettings, opts?: { propagateExternal?: boolean }) => {
            const propagate = opts?.propagateExternal ?? false;
            const effectiveTheme =
                propagate || !externalThemeRef.current
                    ? settings['appearance.theme']
                    : externalThemeRef.current;
            const effectiveAccent =
                propagate || !externalAccentRef.current
                    ? settings['appearance.accent']
                    : externalAccentRef.current;
            const effectiveLang =
                propagate || !externalLangRef.current
                    ? settings['general.language']
                    : externalLangRef.current;
            const effectiveTarget =
                settings['benchmark.target']?.trim() ||
                DEFAULT_BENCHMARK_TARGET;

            lastSyncedSettingsRef.current = serializeSettings({
                ...settings,
                'appearance.theme': effectiveTheme,
                'appearance.accent': effectiveAccent,
                'general.language': effectiveLang,
                'benchmark.target': effectiveTarget,
            });

            if (propagate) {
                handleThemeChange(effectiveTheme);
                handleAccentChange(effectiveAccent);
                handleLangChange(effectiveLang);
            } else {
                if (!externalThemeRef.current) {
                    setTheme(effectiveTheme);
                }
                if (!externalAccentRef.current) {
                    setAccent(effectiveAccent);
                }
                if (!externalLangRef.current) {
                    setLang(effectiveLang);
                }
            }
            setFontFamily(settings['appearance.fontFamily']);
            setFontSize(settings['appearance.fontSize']);
            setBenchmarkTarget(effectiveTarget);
            setHiddenPresets(settings['presets.hidden']);
            setConfigs(settings['dns.servers']);
        },
        [handleAccentChange, handleLangChange, handleThemeChange]
    );

    useEffect(() => {
        if (!isDesktopApp()) return;
        let cancelled = false;
        api.getSettings()
            .then((settings) => {
                if (cancelled) return;
                applyHydratedSettings(settings);
            })
            .catch(() => {
                if (cancelled) return;
                loadConfigs();
            });
        return () => {
            cancelled = true;
        };
        // Hydrate once on mount so external demo prop toggles never re-fetch stale settings.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist preference updates to unified ~/.dnss/settings.json only when changed.
    useEffect(() => {
        if (!isDesktopApp() || lastSyncedSettingsRef.current === null) return;
        const payload: AppSettings = {
            'dnss.schemaVersion': 1,
            'appearance.theme': theme,
            'appearance.accent': accent,
            'appearance.fontFamily': fontFamily,
            'appearance.fontSize': fontSize,
            'general.language': lang,
            'benchmark.target':
                benchmarkTarget.trim() || DEFAULT_BENCHMARK_TARGET,
            'presets.hidden': hiddenPresets,
            'dns.servers': configs,
        };
        const serialized = serializeSettings(payload);
        if (serialized === lastSyncedSettingsRef.current) return;

        const timer = window.setTimeout(() => {
            const prevSynced = lastSyncedSettingsRef.current;
            lastSyncedSettingsRef.current = serialized;
            void api
                .saveSettings(payload)
                .then((saved) => {
                    lastSyncedSettingsRef.current = serializeSettings(saved);
                })
                .catch(() => {
                    if (lastSyncedSettingsRef.current === serialized) {
                        lastSyncedSettingsRef.current = prevSynced;
                    }
                });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [
        theme,
        accent,
        fontFamily,
        fontSize,
        lang,
        benchmarkTarget,
        hiddenPresets,
        configs,
    ]);

    const handleExportSettings = useCallback(async (): Promise<
        string | null
    > => {
        try {
            return await api.exportSettingsJson();
        } catch (error) {
            showToast(
                tRef.current('toast.settingsExportFailed', {
                    error: String(error),
                }),
                'error'
            );
            return null;
        }
    }, [showToast]);

    const handleImportSettings = useCallback(
        async (rawJson: string): Promise<boolean> => {
            try {
                const imported = await api.importSettingsJson(rawJson);
                applyHydratedSettings(imported, { propagateExternal: true });
                showToast(
                    tRef.current('toast.settingsImported', {
                        count: imported['dns.servers'].length,
                    })
                );
                return true;
            } catch (error) {
                showToast(
                    tRef.current('toast.settingsImportFailed', {
                        error: String(error),
                    }),
                    'error'
                );
                return false;
            }
        },
        [applyHydratedSettings, showToast]
    );

    const refreshSeq = useRef(0);

    const refreshStatus = useCallback(async (opts?: { silent?: boolean }) => {
        const seq = ++refreshSeq.current;
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
            setActiveAdapter(null);
            setActiveDns(null);
            setLoadError(String(error));
        } finally {
            if (seq === refreshSeq.current) {
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        if (!isDesktopApp()) return;
        refreshStatus();
    }, [refreshStatus]);

    // Stay in sync when the tray popover mutates DNS state or requests a tab.
    useEffect(() => {
        if (!isDesktopApp()) return;
        let disposed = false;
        let unlistenState: (() => void) | null = null;
        let unlistenNav: (() => void) | null = null;

        void listen('dnss:state-changed', () => {
            void refreshStatus({ silent: true });
            loadConfigs();
        })
            .then((fn) => {
                if (disposed) fn();
                else unlistenState = fn;
            })
            .catch(() => {});

        void listen<string>('dnss:navigate', (event) => {
            const target = event.payload;
            if (
                target === 'home' ||
                target === 'servers' ||
                target === 'settings'
            ) {
                setPage(target);
            }
        })
            .then((fn) => {
                if (disposed) fn();
                else unlistenNav = fn;
            })
            .catch(() => {});

        return () => {
            disposed = true;
            unlistenState?.();
            unlistenNav?.();
        };
    }, [refreshStatus, loadConfigs]);

    const handleApplyServers = useCallback(
        async (servers: string[], targets: ApplyTargets, busyId: string) => {
            try {
                setBusyOp({ kind: 'apply', id: busyId });
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

    const dnsMemoryKey = (adapter: string) => `dnss.lastDns.${adapter}`;

    const readDnsMemory = useCallback((adapter: string | null): string[] => {
        if (!adapter) {
            return [];
        }
        try {
            const parsed: unknown = JSON.parse(
                localStorage.getItem(dnsMemoryKey(adapter)) ?? 'null'
            );
            if (!Array.isArray(parsed)) {
                return [];
            }
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

    const handleToggleHomeDns = useCallback(async () => {
        if (!activeAdapter || !activeDns) {
            showToast(t('toast.noActiveAdapter'), 'error');
            return;
        }
        if (activeDns.static_servers.length > 0) {
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
                            .map(
                                (f) =>
                                    `${f.adapter}: ${f.error || 'Unknown error'}`
                            )
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

    const persistConfigs = useCallback(
        async (next: DnsConfig[]): Promise<boolean> => {
            try {
                const saved = await api.saveConfigs(next);
                updateSyncedConfigs(saved);
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
        [showToast, t, updateSyncedConfigs]
    );

    useEffect(() => {
        if (isEmbeddedDemo) return;
        localStorage.setItem(HIDDEN_PRESETS_KEY, JSON.stringify(hiddenPresets));
    }, [hiddenPresets, isEmbeddedDemo]);

    useEffect(() => {
        if (isEmbeddedDemo) return;
        localStorage.setItem(BENCHMARK_TARGET_KEY, benchmarkTarget);
    }, [benchmarkTarget, isEmbeddedDemo]);

    const hidePreset = useCallback((id: string) => {
        setHiddenPresets((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }, []);

    const restorePresets = useCallback(() => {
        setHiddenPresets([]);
    }, []);

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

    if (!isDesktopApp()) {
        return (
            <div className="flex h-full items-center justify-center bg-[var(--dnss-canvas)] p-6">
                <div className="dnss-card w-full max-w-md rounded-2xl p-5">
                    <div className="flex items-center gap-2.5">
                        <img
                            src={appIcon}
                            alt="DNSS"
                            className="size-7 shrink-0 select-none"
                            draggable={false}
                        />
                        <h2 className="m-0 text-[length:var(--dnss-fs-md)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('nodesktop.title')}
                        </h2>
                    </div>
                    <p className="mt-2.5 text-[length:var(--dnss-fs-sm)] leading-relaxed text-[var(--dnss-ink-2)]">
                        {t('nodesktop.body')}
                    </p>
                    <p className="mt-2 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-3)]">
                        {t('nodesktop.devPrefix')}
                        <code className="rounded bg-[var(--dnss-raised)] px-1.5 py-0.5 font-mono text-[length:var(--dnss-fs-2xs)] text-[var(--dnss-ink-1)]">
                            npm run dev
                        </code>
                        {t('nodesktop.devSuffix')}
                    </p>
                </div>
            </div>
        );
    }

    const activeProviderName = activeDns?.static_servers[0]
        ? (dnsNameLookup.get(activeDns.static_servers[0]) ??
          activeDns.static_servers[0])
        : t('home.dhcpBadge');

    const toastMessage = toast?.message ?? loadError;
    const toastIsError = toast ? toast.kind === 'error' : true;

    const navItems: {
        id: Page;
        label: string;
        icon: typeof HomeIcon;
    }[] = [
        { id: 'home', label: t('dock.home'), icon: HomeIcon },
        { id: 'servers', label: t('dock.servers'), icon: ServerStackIcon },
        { id: 'settings', label: t('dock.settings'), icon: Cog6ToothIcon },
    ];

    return (
        <PortalContext.Provider value={isEmbeddedDemo ? appRootEl : null}>
            <div
                ref={setAppRootEl}
                className="@container relative flex h-full w-full flex-col overflow-hidden bg-[var(--dnss-canvas)] text-[var(--dnss-ink-1)]"
            >
                {!isEmbeddedDemo && (
                    <TitleBar
                        title="DNSS - DNS Switcher"
                        minimizeLabel={t('window.minimize')}
                        maximizeLabel={t('window.maximize')}
                        restoreLabel={t('window.restore')}
                        closeLabel={t('window.close')}
                        onError={(msg) => showToast(msg, 'error')}
                    />
                )}

                <div className="flex min-h-0 flex-1 overflow-hidden">
                    {/* Full-height Sidebar Navigation Rail */}
                    <aside className="flex h-full w-[196px] shrink-0 select-none flex-col border-e border-[var(--dnss-border)] bg-[var(--dnss-sidebar)] @max-[680px]:w-[148px]">
                        {/* Brand Lockup */}
                        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
                            <img
                                src={appIcon}
                                alt="DNSS"
                                className="size-7 shrink-0 select-none"
                                draggable={false}
                            />
                            <div className="min-w-0">
                                <div className="truncate text-[length:var(--dnss-fs-base)] font-bold leading-tight text-[var(--dnss-ink-1)]">
                                    DNSS
                                </div>
                                <div className="truncate text-[length:var(--dnss-fs-2xs)] leading-tight text-[var(--dnss-ink-3)]">
                                    {t('app.tagline')}
                                </div>
                            </div>
                        </div>

                        {/* Primary Navigation */}
                        <nav className="flex flex-1 flex-col gap-1 px-2.5 py-2">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const active = page === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setPage(item.id)}
                                        className={`flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-[length:var(--dnss-fs-sm)] font-medium ${
                                            active
                                                ? 'border border-[var(--dnss-border-strong)] bg-[var(--dnss-nav-active)] text-[var(--dnss-ink-1)] shadow-xs'
                                                : 'border border-transparent text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]'
                                        }`}
                                    >
                                        <Icon
                                            className={`size-4 shrink-0 ${
                                                active
                                                    ? 'text-[var(--dnss-accent)]'
                                                    : 'text-[var(--dnss-ink-3)]'
                                            }`}
                                        />
                                        <span className="truncate">
                                            {item.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Compact Status & Utility Footer */}
                        <div className="border-t border-[var(--dnss-border)] p-2.5">
                            <div
                                className={`mb-2 flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors ${
                                    isCustomDnsActive
                                        ? 'border-[var(--dnss-accent)]/25 bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                                        : 'border-[var(--dnss-border)] bg-[var(--dnss-surface)] text-[var(--dnss-ink-2)]'
                                }`}
                            >
                                <span
                                    className={`size-2 shrink-0 rounded-full ${
                                        isCustomDnsActive
                                            ? 'bg-[var(--dnss-accent)]'
                                            : 'bg-[var(--dnss-ink-3)]'
                                    }`}
                                />
                                <span className="truncate text-[length:var(--dnss-fs-xs)] font-semibold">
                                    {activeProviderName}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-1">
                                <button
                                    type="button"
                                    title={t('app.toggleTheme')}
                                    onClick={() => {
                                        const currentResolved =
                                            getResolvedTheme(theme);
                                        handleThemeChange(
                                            currentResolved === 'dark'
                                                ? 'light'
                                                : 'dark'
                                        );
                                    }}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                                >
                                    <ThemeIcon
                                        mode={theme}
                                        className="size-4 shrink-0"
                                    />
                                </button>

                                <button
                                    type="button"
                                    title={t('app.toggleLang')}
                                    onClick={() =>
                                        handleLangChange(
                                            lang === 'en' ? 'fa' : 'en'
                                        )
                                    }
                                    className="inline-flex h-7 items-center rounded-lg px-2 text-[length:var(--dnss-fs-2xs)] font-semibold uppercase text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                                >
                                    {lang === 'en' ? 'FA' : 'EN'}
                                </button>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content Column */}
                    <div className="relative flex min-w-0 flex-1 flex-col">
                        {(busy || refreshing) && (
                            <div
                                className="loading-bar absolute inset-x-0 top-0 z-20"
                                role="status"
                                aria-label={t('app.working')}
                            />
                        )}

                        <main className="dnss-scroll-stable min-h-0 flex-1 overflow-y-auto px-6 py-5 @max-[680px]:px-3.5 @max-[680px]:py-3.5">
                            <div
                                hidden={page !== 'home'}
                                className={page === 'home' ? 'page-fade' : ''}
                            >
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
                                    onOpenServers={() => setPage('servers')}
                                    dnsNameLookup={dnsNameLookup}
                                />
                            </div>
                            <div
                                hidden={page !== 'servers'}
                                className={
                                    page === 'servers' ? 'page-fade' : ''
                                }
                            >
                                <ServersPage
                                    i18n={i18n}
                                    adapters={adapters}
                                    activeAdapter={activeAdapter}
                                    activeAdapterName={
                                        activeAdapter?.name ?? null
                                    }
                                    activeDns={activeDns}
                                    configs={configs}
                                    persistConfigs={persistConfigs}
                                    hiddenPresets={hiddenPresets}
                                    onHidePreset={hidePreset}
                                    benchmarkTarget={benchmarkTarget}
                                    onBenchmarkTargetChange={setBenchmarkTarget}
                                    busy={busy}
                                    applyBusyId={
                                        busyOp?.kind === 'apply'
                                            ? busyOp.id
                                            : null
                                    }
                                    onApply={handleApplyServers}
                                    showToast={showToast}
                                />
                            </div>
                            <div
                                hidden={page !== 'settings'}
                                className={
                                    page === 'settings' ? 'page-fade' : ''
                                }
                            >
                                <SettingsPage
                                    i18n={i18n}
                                    onLangChange={handleLangChange}
                                    theme={theme}
                                    onThemeChange={handleThemeChange}
                                    fontFamily={fontFamily}
                                    onFontFamilyChange={setFontFamily}
                                    fontSize={fontSize}
                                    onFontSizeChange={setFontSize}
                                    accent={accent}
                                    onAccentChange={handleAccentChange}
                                    busy={busy}
                                    resetBusy={busyOp?.kind === 'reset-all'}
                                    onResetAll={handleResetAll}
                                    hiddenPresets={hiddenPresets}
                                    onRestorePresets={restorePresets}
                                    onExportSettings={handleExportSettings}
                                    onImportSettings={handleImportSettings}
                                    showToast={showToast}
                                />
                            </div>
                        </main>

                        {toastMessage && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
                                <div
                                    className={`dnss-popover toast-pop pointer-events-auto flex items-center gap-2 rounded-xl px-3.5 py-2 text-[length:var(--dnss-fs-sm)] font-medium ${
                                        toastIsError
                                            ? 'border-[var(--dnss-error)]/40 text-[var(--dnss-error)]'
                                            : 'border-[var(--dnss-accent)]/40 text-[var(--dnss-ink-1)]'
                                    }`}
                                >
                                    {toastIsError ? (
                                        <ExclamationTriangleIcon className="size-4 shrink-0 text-[var(--dnss-error)]" />
                                    ) : (
                                        <CheckCircleIcon className="size-4 shrink-0 text-[var(--dnss-accent)]" />
                                    )}
                                    <span>{toastMessage}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PortalContext.Provider>
    );
}
