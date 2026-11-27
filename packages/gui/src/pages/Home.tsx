import { useState } from 'react';
import {
    ArrowPathIcon,
    ChevronDownIcon,
    CircleStackIcon,
    PowerIcon,
    ServerStackIcon,
    ShieldCheckIcon,
    SignalIcon,
} from '@heroicons/react/24/outline';
import type { Adapter, DnsStatus } from '../api';
import type { I18n } from '../i18n';

interface HomePageProps {
    /** Translations + text direction + localized digits. */
    i18n: I18n;
    /** The adapter currently in use (default gateway detection). */
    activeAdapter: Adapter | null;
    activeDns: DnsStatus | null;
    isCustomDnsActive: boolean;
    /** Servers remembered for the active adapter — toggling while on DHCP restores these. */
    rememberedServers: string[];
    /** Every known adapter with the servers each one currently uses. */
    adapters: Adapter[];
    /** True while ANY blocking operation runs — disables the controls. */
    busy: boolean;
    /** True while the hero toggle is running (spinner). */
    toggleBusy: boolean;
    /** True while a DNS flush triggered from here is running (spinner). */
    flushBusy: boolean;
    /** True while a user-initiated status refresh is in flight. */
    refreshing: boolean;
    /** Toggle: custom DNS -> DHCP (remembering), or DHCP -> remembered DNS. */
    onToggleDns: () => void;
    onFlushDns: () => void;
    refreshStatus: () => void;
    /** Jump to Servers tab when the user has no remembered DNS yet. */
    onOpenServers: () => void;
    /** Address -> display name (saved configs + presets). */
    dnsNameLookup: Map<string, string>;
}

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
        <li className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span
                        className={`size-2 shrink-0 rounded-full ${
                            adapter.is_default
                                ? 'bg-[var(--dnss-accent)]'
                                : 'bg-[var(--dnss-border-strong)]'
                        }`}
                        title={
                            adapter.is_default
                                ? i18n.t('home.activeAdapterTitle')
                                : undefined
                        }
                    />
                    <span
                        title={adapter.name}
                        className="truncate text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-1)]"
                    >
                        {adapter.name}
                    </span>
                    <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium ${
                            adapter.dns_static
                                ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                                : 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-3)]'
                        }`}
                        title={
                            adapter.dns_static
                                ? i18n.t('home.staticTitle')
                                : undefined
                        }
                    >
                        {adapter.dns_static
                            ? i18n.t('home.staticBadge')
                            : i18n.t('home.dhcpBadge')}
                    </span>
                </div>

                {adapter.kind && (
                    <div
                        title={adapter.kind}
                        className="mt-0.5 truncate ps-4 text-[length:var(--dnss-fs-2xs)] text-[var(--dnss-ink-3)]"
                    >
                        {adapter.kind}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {adapter.dns_servers.length === 0 ? (
                    <span className="text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                        {i18n.t('common.na')}
                    </span>
                ) : (
                    adapter.dns_servers.map((ip) => {
                        const provider = dnsNameLookup.get(ip);
                        return (
                            <span
                                key={ip}
                                dir="ltr"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-2 py-1 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-1)]"
                            >
                                <span className="font-mono tabular-nums">
                                    {ip}
                                </span>
                                {provider && (
                                    <span className="font-sans text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-accent-text)]">
                                        {provider}
                                    </span>
                                )}
                            </span>
                        );
                    })
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
    onOpenServers,
    dnsNameLookup,
}: HomePageProps) {
    const { t, dir, num } = i18n;
    const [showAdapters, setShowAdapters] = useState(true);

    const displayServers = Array.from(
        new Set(
            activeDns?.static_servers.length
                ? activeDns.static_servers
                : (activeDns?.in_use ?? [])
        )
    );

    const primaryName = displayServers[0]
        ? dnsNameLookup.get(displayServers[0])
        : undefined;

    const canRestore = rememberedServers.length > 0;
    const restoreLabel = (() => {
        const firstName = dnsNameLookup.get(rememberedServers[0] ?? '');
        if (firstName) return firstName;
        return rememberedServers.join(' · ');
    })();

    const canToggle =
        Boolean(activeAdapter) && (isCustomDnsActive || canRestore);

    const statusHeadline = isCustomDnsActive
        ? primaryName || t('home.customActive')
        : t('home.dhcpDefault');

    const statusSubtitle = isCustomDnsActive
        ? t('home.hintReset')
        : canRestore
          ? t('home.hintRestore', { name: restoreLabel })
          : activeAdapter
            ? t('home.hintApplyFirst')
            : t('home.hintNoAdapter');

    return (
        <div className="@container mx-auto flex w-full max-w-2xl flex-col gap-4">
            {/* Active Connection Hero Panel */}
            <section className="dnss-card rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        <div
                            className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors ${
                                isCustomDnsActive
                                    ? 'bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)]'
                                    : 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-3)]'
                            }`}
                        >
                            {toggleBusy ? (
                                <span className="loading loading-spinner loading-sm" />
                            ) : isCustomDnsActive ? (
                                <ShieldCheckIcon className="size-6 shrink-0" />
                            ) : (
                                <SignalIcon className="size-6 shrink-0" />
                            )}
                        </div>

                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="m-0 text-[length:var(--dnss-fs-lg)] font-semibold leading-snug text-[var(--dnss-ink-1)]">
                                    {statusHeadline}
                                </h2>
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium ${
                                        isCustomDnsActive
                                            ? 'bg-[var(--dnss-accent-soft)] text-[var(--dnss-accent-text)]'
                                            : 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-2)]'
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
                                        ? t('home.customActive')
                                        : t('home.dhcpBadge')}
                                </span>
                            </div>

                            <p className="mt-1 text-[length:var(--dnss-fs-sm)] leading-snug text-[var(--dnss-ink-2)]">
                                {statusSubtitle}
                            </p>
                        </div>
                    </div>

                    {/* Tactile Power Switch with dark circular knob + power icon */}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={isCustomDnsActive}
                        aria-label={
                            isCustomDnsActive
                                ? t('home.disconnectAction')
                                : t('home.protectAction')
                        }
                        title={statusSubtitle}
                        disabled={busy || !canToggle}
                        onClick={onToggleDns}
                        style={
                            isCustomDnsActive
                                ? {
                                      boxShadow:
                                          '0 0 20px var(--dnss-accent-glow)',
                                  }
                                : undefined
                        }
                        className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full p-1 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dnss-accent)] active:scale-95 ${
                            isCustomDnsActive
                                ? 'bg-[var(--dnss-accent)]'
                                : 'bg-[var(--dnss-border-strong)]'
                        } ${
                            busy || !canToggle
                                ? 'cursor-not-allowed opacity-50'
                                : 'cursor-pointer'
                        }`}
                    >
                        <span
                            className={`grid size-7 place-items-center rounded-full bg-[var(--dnss-switch-knob)] shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                                isCustomDnsActive
                                    ? dir === 'rtl'
                                        ? '-translate-x-7'
                                        : 'translate-x-7'
                                    : 'translate-x-0'
                            }`}
                        >
                            {toggleBusy ? (
                                <span className="loading loading-spinner loading-xs text-[var(--dnss-accent)]" />
                            ) : (
                                <PowerIcon
                                    className={`size-4 shrink-0 stroke-[2.2] transition-colors duration-200 ${
                                        isCustomDnsActive
                                            ? 'text-[var(--dnss-accent)]'
                                            : 'text-[#94a3b8]'
                                    }`}
                                />
                            )}
                        </span>
                    </button>
                </div>

                {/* Active Adapter & IPv4 Resolvers Strip */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--dnss-raised)] px-3.5 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full bg-[var(--dnss-accent)]" />
                        <span
                            dir="ltr"
                            className="truncate text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-1)]"
                        >
                            {activeAdapter
                                ? activeAdapter.name
                                : t('home.noActiveAdapter')}
                        </span>
                        {activeAdapter?.kind && (
                            <span className="min-w-0 truncate rounded-md bg-[var(--dnss-surface)] px-1.5 py-0.5 text-[length:var(--dnss-fs-2xs)] text-[var(--dnss-ink-3)]">
                                {activeAdapter.kind}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {displayServers.length > 0 ? (
                            displayServers.map((ip) => (
                                <span
                                    key={ip}
                                    dir="ltr"
                                    className="rounded-lg bg-[var(--dnss-surface)] px-2.5 py-1 font-mono text-[length:var(--dnss-fs-xs)] font-medium tabular-nums text-[var(--dnss-ink-1)]"
                                >
                                    {ip}
                                </span>
                            ))
                        ) : (
                            <span className="text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                                {t('home.automatic')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Primary Action Row */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canToggle ? (
                        <div className="group/dhcp relative inline-flex">
                            <button
                                type="button"
                                aria-describedby="dnss-dhcp-tooltip"
                                disabled={busy}
                                onClick={onToggleDns}
                                className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[length:var(--dnss-fs-sm)] font-medium ${
                                    isCustomDnsActive
                                        ? 'bg-[var(--dnss-raised)] text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)]'
                                        : 'bg-[var(--dnss-accent)] text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                {toggleBusy && (
                                    <span className="loading loading-spinner loading-xs" />
                                )}
                                {isCustomDnsActive
                                    ? t('home.disconnectAction')
                                    : t('home.protectAction')}
                            </button>
                            <div
                                id="dnss-dhcp-tooltip"
                                role="tooltip"
                                className="dnss-popover pointer-events-none absolute bottom-full start-0 z-30 mb-2 w-72 max-w-[calc(100cqi-2.5rem)] translate-y-1 rounded-xl px-3 py-2 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-1)] opacity-0 transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/dhcp:translate-y-0 group-hover/dhcp:opacity-100 group-focus-within/dhcp:translate-y-0 group-focus-within/dhcp:opacity-100"
                            >
                                {isCustomDnsActive
                                    ? t('home.disconnectTooltip')
                                    : t('home.restoreTooltip')}
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={onOpenServers}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--dnss-accent)] px-3.5 text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)]"
                        >
                            <ServerStackIcon className="size-4 shrink-0" />
                            {t('home.chooseServer')}
                        </button>
                    )}

                    <button
                        type="button"
                        disabled={busy}
                        onClick={onFlushDns}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--dnss-raised)] px-3 text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {flushBusy ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : (
                            <CircleStackIcon className="size-4 shrink-0 text-[var(--dnss-ink-2)]" />
                        )}
                        {t('home.flush')}
                    </button>

                    <button
                        type="button"
                        disabled={busy || refreshing}
                        onClick={refreshStatus}
                        className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <ArrowPathIcon
                            className={`size-4 shrink-0 ${
                                refreshing ? 'animate-spin' : ''
                            }`}
                        />
                        {t('home.refreshStatus')}
                    </button>
                </div>
            </section>

            {/* Network Adapters Overview */}
            <section className="dnss-card overflow-hidden rounded-2xl">
                <button
                    type="button"
                    className="dnss-no-press flex w-full cursor-pointer select-none items-center gap-2 px-4 py-3 text-start transition-colors hover:bg-[var(--dnss-hover)]"
                    onClick={() => setShowAdapters((v) => !v)}
                    aria-expanded={showAdapters}
                >
                    <ChevronDownIcon
                        className={`size-4 shrink-0 text-[var(--dnss-ink-3)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                            showAdapters
                                ? ''
                                : dir === 'rtl'
                                  ? 'rotate-90'
                                  : '-rotate-90'
                        }`}
                    />
                    <ServerStackIcon className="size-4 shrink-0 text-[var(--dnss-ink-2)]" />
                    <span className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                        {t('home.inUse')}
                    </span>
                    <span className="rounded-md bg-[var(--dnss-raised)] px-1.5 py-0.5 text-[length:var(--dnss-fs-2xs)] font-medium tabular-nums text-[var(--dnss-ink-2)]">
                        {num(adapters.length)}
                    </span>
                </button>

                <div
                    className={`grid overflow-hidden transition-[grid-template-rows] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        showAdapters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                >
                    <div className="min-h-0">
                        <ul className="divide-y divide-[var(--dnss-border)] border-t border-[var(--dnss-border)]">
                            {adapters.map((adapter) => (
                                <AdapterRow
                                    key={adapter.name}
                                    i18n={i18n}
                                    adapter={adapter}
                                    dnsNameLookup={dnsNameLookup}
                                />
                            ))}

                            {adapters.length === 0 && (
                                <li className="px-4 py-4 text-center text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                                    {t('home.noAdapters')}
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </section>
        </div>
    );
}
