import type { ThemeMode } from '../theme';

interface SettingsPageProps {
    theme: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    busy: boolean;
    onResetAll: () => void;
}

export default function SettingsPage({
    theme,
    onThemeChange,
    busy,
    onResetAll,
}: SettingsPageProps) {
    return (
        <div className="page settings-page">
            <div className="page-header">
                <h2>Settings</h2>
            </div>

            <div className="card">
                <div className="field-label">Appearance</div>
                <div className="segmented">
                    {(['light', 'dark', 'system'] as ThemeMode[]).map(
                        (mode) => (
                            <button
                                key={mode}
                                className={`segment ${theme === mode ? 'active' : ''}`}
                                onClick={() => onThemeChange(mode)}
                            >
                                {mode === 'light'
                                    ? '☀ Light'
                                    : mode === 'dark'
                                      ? '☾ Dark'
                                      : '◐ System'}
                            </button>
                        )
                    )}
                </div>
            </div>

            <div className="card">
                <div className="field-label">Maintenance</div>
                <p className="about-text hint">
                    Removes static DNS servers from every adapter and switches
                    them back to automatic (DHCP) configuration.
                </p>
                <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => {
                        if (
                            window.confirm(
                                'Reset DNS to automatic (DHCP) on ALL adapters?'
                            )
                        ) {
                            onResetAll();
                        }
                    }}
                >
                    Reset all adapters to DHCP
                </button>
            </div>

            <div className="card">
                <div className="field-label">About</div>
                <p className="about-text">
                    <strong>DNSS</strong> (DNS Switch) — change your DNS servers
                    in one click. Free and open source, MIT licensed.
                </p>
                <p className="about-text hint">
                    Parts of this app (the DNS latency benchmark algorithm and
                    the curated server preset ideas) are inspired by the
                    open-source{' '}
                    <a
                        href="https://github.com/DnsChanger/dnsChanger-desktop"
                        target="_blank"
                        rel="noreferrer"
                    >
                        DnsChanger/dnsChanger-desktop
                    </a>{' '}
                    project. Thank you!
                </p>
            </div>

            <div className="card">
                <div className="field-label">Privacy</div>
                <p className="about-text hint">
                    DNSS runs completely offline. No telemetry, no analytics, no
                    network requests other than the DNS benchmarks you trigger
                    yourself.
                </p>
            </div>
        </div>
    );
}
