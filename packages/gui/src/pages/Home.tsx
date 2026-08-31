import { useState } from 'react';
import {
    ArrowPathIcon,
    ChevronDownIcon,
    CircleStackIcon,
    ClockIcon,
    GlobeAltIcon,
    PowerIcon,
    ServerStackIcon,
} from '@heroicons/react/24/outline';
import type { Adapter, DnsStatus } from '../api';
import type { I18n } from '../i18n';
import { getResolvedTheme, ThemeMode } from '../theme';

interface HomePageProps {
    /** Translations + text direction + localized digits. */
    i18n: I18n;
    /** The adapter currently in use (default gateway detection). */
    activeAdapter: Adapter | null;
    activeDns: DnsStatus | null;
    isCustomDnsActive: boolean;
    /** Servers remembered for the active adapter — clicking the power
        circle while on DHCP restores these. */
    rememberedServers: string[];
    /** Every known adapter with the servers each one currently uses. */
    adapters: Adapter[];
    /** True while ANY blocking operation runs — disables the controls. */
    busy: boolean;
    /** True while the power circle's own toggle is running (spinner). */
    toggleBusy: boolean;
    /** True while a DNS flush triggered from here is running (spinner). */
    flushBusy: boolean;
    /** True while a user-initiated status refresh is in flight. */
    refreshing: boolean;
    /** Toggle: custom DNS -> DHCP (remembering), or DHCP -> remembered DNS. */
    onToggleDns: () => void;
    onFlushDns: () => void;
    refreshStatus: () => void;
    /** Address -> display name (saved configs + presets). */
    dnsNameLookup: Map<string, string>;
    themeMode: ThemeMode;
}

/** One row of the "DNS servers in use" panel: adapter identity at the start,
    the resolvers it currently uses (annotated with configured names) at the
    end — the GUI counterpart of the CLI's "Show currently used DNS configs"
    table. */
function AdapterRow({
    i18n,
    adapter,
    dnsNameLookup,
}: {
    i18n: I18n;
    adapter: Adapter;
    dnsNameLookup: Map<string, string>;
}) {
    return (
        <li className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    {adapter.is_default && (
                        <span
                            className="size-1.5 shrink-0 rounded-full bg-success"
                            title={i18n.t('home.activeAdapterTitle')}
                        />
                    )}

                    <span
                        title={adapter.name}
                        className="truncate text-sm font-medium"
                    >
                        {adapter.name}
                    </span>

                    {adapter.dns_static && (
                        <span
                            className="badge badge-ghost badge-xs shrink-0 font-semibold text-primary"
                            title={i18n.t('home.staticTitle')}
                        >
                            {i18n.t('home.staticBadge')}
                        </span>
                    )}
                </div>

                {adapter.kind && (
                    <div
                        title={adapter.kind}
                        className="truncate text-[11px] opacity-50"
                    >
                        {adapter.kind}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {adapter.dns_servers.length === 0 ? (
                    <span className="text-xs opacity-40">
                        {i18n.t('common.na')}
                    </span>
                ) : (
                    adapter.dns_servers.map((ip) => (
                        <span
                            key={ip}
                            dir="ltr"
                            className="badge badge-ghost badge-sm gap-1.5 font-mono text-xs"
                        >
                            <span dir="ltr">{ip}</span>

                            {dnsNameLookup.get(ip) && (
                                <span className="font-sans opacity-60">
                                    {dnsNameLookup.get(ip)}
                                </span>
                            )}
                        </span>
                    ))
                )}
            </div>
        </li>
    );
}

export default function HomePage({
    i18n,
    activeAdapter,
    activeDns,
    isCustomDnsActive,
    rememberedServers,
    adapters,
    busy,
    toggleBusy,
    flushBusy,
    refreshing,
    onToggleDns,
    onFlushDns,
    refreshStatus,
    dnsNameLookup,
    themeMode,
}: HomePageProps) {
    const { t, dir, num } = i18n;
    const statusLabel = isCustomDnsActive
        ? t('home.customActive')
        : t('home.dhcpDefault');

    // Prefer the statically configured servers; fall back to whatever is
    // currently in use (DHCP-provided). De-duplicated for display.
    const displayServers = Array.from(
        new Set(
            activeDns?.static_servers.length
                ? activeDns.static_servers
                : (activeDns?.in_use ?? [])
        )
    );

    const canRestore = rememberedServers.length > 0;
    const restoreLabel = (() => {
        const firstName = dnsNameLookup.get(rememberedServers[0] ?? '');
        if (firstName) return firstName;
        // The saved config behind the remembered addresses may have been
        // deleted since; the bare addresses are still restorable.
        return rememberedServers.join(' · ');
    })();

    // ON: custom DNS in use -> click resets to DHCP (remembering it).
    // restore: on DHCP with a remembered DNS -> click brings it back.
    // off: nothing to toggle yet.
    const circleState = isCustomDnsActive
        ? 'on'
        : canRestore
          ? 'restore'
          : 'off';
    const circleHint = isCustomDnsActive
        ? t('home.hintReset')
        : canRestore
          ? t('home.hintRestore', { name: restoreLabel })
          : activeAdapter
            ? t('home.hintApplyFirst')
            : t('home.hintNoAdapter');

    const [showAdapters, setShowAdapters] = useState(true);

    return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body items-center gap-3 py-8">
                    <button
                        type="button"
                        title={circleHint}
                        aria-label={circleHint}
                        onClick={onToggleDns}
                        disabled={
                            busy || !activeAdapter || circleState === 'off'
                        }
                        className={`grid size-36 place-items-center rounded-full transition-all ${
                            circleState === 'on'
                                ? 'bg-success text-success-content ring-glow-success'
                                : circleState === 'restore'
                                  ? getResolvedTheme(themeMode) === 'dark'
                                      ? 'text-white bg-gray-500 ring-gray-500'
                                      : 'text-white bg-gray-300 ring-gray-300'
                                  : 'bg-base-300 text-base-content/70 ring-glow-base'
                        } ${
                            busy
                                ? 'cursor-wait'
                                : circleState === 'off'
                                  ? 'cursor-not-allowed'
                                  : 'cursor-pointer hover:scale-[1.03] active:scale-95'
                        } disabled:cursor-not-allowed`}
                    >
                        {toggleBusy ? (
                            <span className="loading loading-spinner size-14" />
                        ) : circleState === 'on' ? (
                            <GlobeAltIcon className="size-16" />
                        ) : circleState === 'restore' ? (
                            <ClockIcon className="size-16" />
                        ) : (
                            <PowerIcon className="size-16" />
                        )}
                    </button>

                    <div
                        style={{ marginTop: 10 }}
                        className={`text-xl font-bold ${isCustomDnsActive ? 'text-success' : 'opacity-60'}`}
                    >
                        {statusLabel}
                    </div>

                    <div className="text-xs opacity-60">{circleHint}</div>

                    <div dir="ltr" className="flex items-center gap-2 text-sm">
                        <span className="font-medium">
                            {activeAdapter
                                ? activeAdapter.name
                                : t('home.noActiveAdapter')}
                        </span>
                        {activeAdapter?.kind && (
                            <span className="badge badge-ghost badge-sm">
                                {activeAdapter.kind}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        {displayServers.length > 0 ? (
                            displayServers.map((ip) => (
                                <div
                                    dir="ltr"
                                    key={ip}
                                    className="font-mono text-sm opacity-80"
                                >
                                    {dnsNameLookup.get(ip) && (
                                        <strong className="me-2 badge badge-soft badge-primary">
                                            {dnsNameLookup.get(ip)}
                                        </strong>
                                    )}

                                    <span dir="ltr">{ip}</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm opacity-60">
                                {t('home.automatic')}
                            </div>
                        )}
                    </div>

                    <button
                        className="btn btn-ghost btn-xs"
                        onClick={refreshStatus}
                        disabled={busy || refreshing}
                    >
                        <ArrowPathIcon
                            className={`size-3.5 ${
                                refreshing ? 'animate-spin' : ''
                            }`}
                        />
                        {t('home.refreshStatus')}
                    </button>
                </div>
            </div>

            {/* Per-adapter DNS overview, the GUI version of the CLI's
                "Show currently used DNS configs" table. No floating panels
                live inside, so the collapsed-size wrapper can always clip. */}
            <section className="rounded-xl border border-base-300/40 bg-base-100 shadow-sm">
                <div
                    role="button"
                    tabIndex={0}
                    className="flex w-full cursor-pointer select-none items-center gap-2 px-4 py-3 outline-none"
                    onClick={() => setShowAdapters((v) => !v)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowAdapters((v) => !v);
                        }
                    }}
                >
                    <ChevronDownIcon
                        className={`size-4 opacity-60 transition-transform duration-200 ${
                            showAdapters
                                ? ''
                                : dir === 'rtl'
                                  ? 'rotate-90'
                                  : '-rotate-90'
                        }`}
                    />
                    <ServerStackIcon className="size-4 opacity-70" />
                    <span className="text-sm font-semibold">
                        {t('home.inUse')}
                    </span>
                    <span className="badge badge-ghost badge-sm">
                        {num(adapters.length)}
                    </span>
                    <span className="grow" />
                </div>
                <div
                    className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${
                        showAdapters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                >
                    <div className="min-h-0">
                        <ul className="divide-y divide-base-300/40 px-4 pb-2">
                            {adapters.map((adapter) => (
                                <AdapterRow
                                    key={adapter.name}
                                    i18n={i18n}
                                    adapter={adapter}
                                    dnsNameLookup={dnsNameLookup}
                                />
                            ))}

                            {adapters.length === 0 && (
                                <li className="py-2 text-center text-xs opacity-60">
                                    {t('home.noAdapters')}
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </section>

            <div className="flex justify-center">
                <button
                    className="btn btn-ghost"
                    onClick={onFlushDns}
                    disabled={busy}
                >
                    {/* Same icon slot as the Benchmark button: the spinner
                        replaces the icon so the label never shifts. */}
                    {flushBusy ? (
                        <span className="loading loading-spinner loading-xs" />
                    ) : (
                        <CircleStackIcon className="size-4" />
                    )}
                    {t('home.flush')}
                </button>
            </div>
        </div>
    );
}
