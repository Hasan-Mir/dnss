import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Adapter, type DnsStatus } from './api';
import {
    applyTheme,
    loadTheme,
    saveTheme,
    watchSystemTheme,
    type ThemeMode,
} from './theme';
import HomePage from './pages/Home';
import ServersPage from './pages/Servers';
import SettingsPage from './pages/Settings';

export type Page = 'home' | 'servers' | 'settings';

export default function App() {
    const [page, setPage] = useState<Page>('home');
    const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
    const [adapters, setAdapters] = useState<Adapter[]>([]);
    const [selectedAdapter, setSelectedAdapter] = useState<string>(
        () => localStorage.getItem('dnss.adapter') || 'auto'
    );
    const [activeDns, setActiveDns] = useState<DnsStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    // Keep the active timer handle so consecutive toasts don't dismiss each
    // other after a fraction of their display time.
    const toastTimer = useRef<number | null>(null);

    const showToast = useCallback((message: string) => {
        if (toastTimer.current !== null) {
            window.clearTimeout(toastTimer.current);
        }
        setToast(message);
        toastTimer.current = window.setTimeout(() => {
            toastTimer.current = null;
            setToast(null);
        }, 3500);
    }, []);

    // Theme
    useEffect(() => {
        applyTheme(theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => watchSystemTheme(() => applyTheme(loadTheme())), []);

    const resolveAdapter = useCallback(
        async (list: Adapter[]): Promise<string> => {
            // A stored selection can go stale (USB dock unplugged, adapter
            // renamed, ...). Trusting it blindly made every refresh fail with
            // a raw backend error until the user manually switched to Auto.
            if (
                selectedAdapter !== 'auto' &&
                list.some((a) => a.name === selectedAdapter)
            ) {
                return selectedAdapter;
            }
            const detected = await api.detectDefaultAdapter();
            // The detection result must still be a known adapter; a
            // mismatch (filtered loopback device, disconnected alias, ...)
            // would fail backend validation and surface a raw error.
            if (detected && list.some((a) => a.name === detected)) {
                return detected;
            }
            if (list.length > 0) return list[0].name;
            throw new Error('No network adapter found');
        },
        [selectedAdapter]
    );

    // Overlapping refreshes (rapid clicks, apply + refresh) used to be able
    // to apply out of order; only the latest invocation may update state.
    const refreshSeq = useRef(0);

    const refreshStatus = useCallback(async () => {
        const seq = ++refreshSeq.current;
        try {
            const list = await api.listAdapters();
            const adapter = await resolveAdapter(list);
            const dns = await api.getActiveDns(adapter);
            if (seq !== refreshSeq.current) {
                return;
            }
            setAdapters(list);
            setActiveDns(dns);
            setLoadError(null);
        } catch (error) {
            if (seq !== refreshSeq.current) {
                return;
            }
            // Surface backend/OS failures instead of silently showing an
            // empty state that looks like "nothing configured".
            setActiveDns(null);
            setLoadError(String(error));
        }
    }, [resolveAdapter]);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    const handleSelectAdapter = useCallback((value: string) => {
        setSelectedAdapter(value);
        localStorage.setItem('dnss.adapter', value);
    }, []);

    const handleApplyServers = useCallback(
        async (servers: string[]) => {
            try {
                setBusy(true);
                const list = await api.listAdapters();
                const adapter = await resolveAdapter(list);
                await api.setDns(adapter, servers);
                showToast(
                    servers.length > 0
                        ? `DNS applied to "${adapter}"`
                        : `Adapter "${adapter}" reset to DHCP`
                );
                await refreshStatus();
            } catch (error) {
                showToast(`Failed: ${String(error)}`);
            } finally {
                setBusy(false);
            }
        },
        [resolveAdapter, refreshStatus, showToast]
    );

    const handleFlushDns = useCallback(async () => {
        try {
            setBusy(true);
            await api.flushDns();
            showToast('DNS cache flushed');
        } catch (error) {
            showToast(`Flush failed: ${String(error)}`);
        } finally {
            setBusy(false);
        }
    }, [showToast]);

    const handleResetAll = useCallback(async () => {
        try {
            setBusy(true);
            await api.resetAll();
            showToast('All adapters reset to DHCP');
            await refreshStatus();
        } catch (error) {
            showToast(`Reset failed: ${String(error)}`);
        } finally {
            setBusy(false);
        }
    }, [refreshStatus, showToast]);

    const isCustomDnsActive = Boolean(
        activeDns && activeDns.static_servers.length > 0
    );

    return (
        <div className="app">
            <header className="header">
                <div className="brand">
                    <span className="brand-mark">D</span>
                    <span className="brand-name">DNSS</span>
                    <span className="brand-sub">DNS Switch</span>
                </div>
                <button
                    className="icon-btn"
                    title="Toggle theme"
                    onClick={() =>
                        setTheme((t) =>
                            t === 'light'
                                ? 'dark'
                                : t === 'dark'
                                  ? 'system'
                                  : 'light'
                        )
                    }
                >
                    {theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◐'}
                </button>
            </header>

            <main className="content">
                {/* Pages stay mounted (hidden instead of unmounted) so
                    in-flight work like a benchmark run survives tab switches
                    instead of being dropped with the component state. */}
                <div hidden={page !== 'home'}>
                    <HomePage
                        adapters={adapters}
                        selectedAdapter={selectedAdapter}
                        onSelectAdapter={handleSelectAdapter}
                        activeDns={activeDns}
                        isCustomDnsActive={isCustomDnsActive}
                        busy={busy}
                        onApplyDhcp={() => handleApplyServers([])}
                        onFlushDns={handleFlushDns}
                        refreshStatus={refreshStatus}
                    />
                </div>
                <div hidden={page !== 'servers'}>
                    <ServersPage
                        busy={busy}
                        onApply={handleApplyServers}
                        showToast={showToast}
                    />
                </div>
                <div hidden={page !== 'settings'}>
                    <SettingsPage
                        theme={theme}
                        onThemeChange={setTheme}
                        busy={busy}
                        onResetAll={handleResetAll}
                    />
                </div>
            </main>

            <nav className="bottom-nav">
                <button
                    className={`nav-btn ${page === 'home' ? 'active' : ''}`}
                    onClick={() => setPage('home')}
                >
                    ⌂<span>Home</span>
                </button>
                <button
                    className={`nav-btn ${page === 'servers' ? 'active' : ''}`}
                    onClick={() => setPage('servers')}
                >
                    ◎<span>Servers</span>
                </button>
                <button
                    className={`nav-btn ${page === 'settings' ? 'active' : ''}`}
                    onClick={() => setPage('settings')}
                >
                    ⚙<span>Settings</span>
                </button>
            </nav>

            {(toast || loadError) && (
                <div className="toast">{toast || loadError}</div>
            )}
        </div>
    );
}
