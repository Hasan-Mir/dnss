import type { Adapter, DnsStatus } from '../api';

interface HomePageProps {
    adapters: Adapter[];
    selectedAdapter: string;
    onSelectAdapter: (value: string) => void;
    activeDns: DnsStatus | null;
    isCustomDnsActive: boolean;
    busy: boolean;
    onApplyDhcp: () => void;
    onFlushDns: () => void;
    refreshStatus: () => void;
}

export default function HomePage({
    adapters,
    selectedAdapter,
    onSelectAdapter,
    activeDns,
    isCustomDnsActive,
    busy,
    onApplyDhcp,
    onFlushDns,
    refreshStatus,
}: HomePageProps) {
    const statusLabel = isCustomDnsActive
        ? 'Custom DNS active'
        : 'DHCP (default)';

    // Prefer the statically configured servers; fall back to whatever is
    // currently in use (DHCP-provided).
    const displayServers = activeDns?.static_servers.length
        ? activeDns.static_servers
        : activeDns?.in_use;

    const dnsText =
        displayServers && displayServers.length > 0
            ? displayServers.join(', ')
            : 'Automatic';

    return (
        <div className="page home-page">
            <div className="status-area">
                <div
                    className={`status-circle ${isCustomDnsActive ? 'on' : 'off'}`}
                >
                    <span className="status-icon">
                        {isCustomDnsActive ? '⇅' : '⏻'}
                    </span>
                </div>
                <div
                    className={`status-label ${isCustomDnsActive ? 'on' : ''}`}
                >
                    {statusLabel}
                </div>
                <div className="status-dns">{dnsText}</div>
                <button
                    className="link-btn"
                    onClick={refreshStatus}
                    disabled={busy}
                >
                    ↻ Refresh status
                </button>
            </div>

            <div className="card">
                <label className="field-label" htmlFor="adapter-select">
                    Network adapter
                </label>
                <select
                    id="adapter-select"
                    className="select"
                    value={selectedAdapter}
                    onChange={(e) => onSelectAdapter(e.target.value)}
                >
                    <option value="auto">Auto (detect default gateway)</option>
                    {adapters.map((a) => (
                        <option key={a.name} value={a.name}>
                            {a.name} {a.kind ? `(${a.kind})` : ''}
                        </option>
                    ))}
                </select>
                {selectedAdapter === 'auto' && (
                    <p className="hint">
                        The adapter with the default gateway is detected
                        automatically.
                    </p>
                )}
            </div>

            <div className="actions-row">
                <button className="btn" onClick={onApplyDhcp} disabled={busy}>
                    Reset to DHCP
                </button>
                <button
                    className="btn secondary"
                    onClick={onFlushDns}
                    disabled={busy}
                >
                    Flush DNS cache
                </button>
            </div>
        </div>
    );
}
