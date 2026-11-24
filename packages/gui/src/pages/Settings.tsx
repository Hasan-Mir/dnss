import { useRef, useState } from 'react';
import {
    ArrowUturnLeftIcon,
    ComputerDesktopIcon,
    MoonIcon,
    SunIcon,
} from '@heroicons/react/24/outline';
import { DNS_PRESETS } from '@seymi/dnss-core/presets';
import { openExternal } from '../api';
import FloatingPanel from '../components/FloatingPanel';
import { LANGUAGES, type I18n, type Lang } from '../i18n';
import type { ThemeMode } from '../theme';

interface SettingsPageProps {
    i18n: I18n;
    onLangChange: (lang: Lang) => void;
    theme: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    busy: boolean;
    resetBusy: boolean;
    onResetAll: () => void;
    hiddenPresets: string[];
    onRestorePresets: () => void;
}

const INSPIRATION_URL = 'https://github.com/DnsChanger/dnsChanger-desktop';

export default function SettingsPage({
    i18n,
    onLangChange,
    theme,
    onThemeChange,
    busy,
    resetBusy,
    onResetAll,
    hiddenPresets,
    onRestorePresets,
}: SettingsPageProps) {
    const { t } = i18n;
    const [confirmReset, setConfirmReset] = useState(false);
    const resetButtonRef = useRef<HTMLButtonElement | null>(null);

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <h2 className="m-0 text-[18px] font-semibold text-[var(--dnss-ink-1)]">
                {t('settings.title')}
            </h2>

            {/* Appearance & Language */}
            <section className="dnss-card divide-y divide-[var(--dnss-border)] rounded-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <div className="text-[13px] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.appearance')}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[var(--dnss-ink-3)]">
                            {t('settings.appearanceDesc')}
                        </div>
                    </div>

                    <div className="inline-flex items-center rounded-xl bg-[var(--dnss-raised)] p-1">
                        {(['light', 'dark', 'system'] as ThemeMode[]).map(
                            (mode) => {
                                const active = theme === mode;
                                return (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => onThemeChange(mode)}
                                        className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
                                            active
                                                ? 'bg-[var(--dnss-surface)] text-[var(--dnss-ink-1)] shadow-xs'
                                                : 'text-[var(--dnss-ink-2)] hover:text-[var(--dnss-ink-1)]'
                                        }`}
                                    >
                                        {mode === 'light' ? (
                                            <SunIcon className="size-4 shrink-0" />
                                        ) : mode === 'dark' ? (
                                            <MoonIcon className="size-4 shrink-0" />
                                        ) : (
                                            <ComputerDesktopIcon className="size-4 shrink-0" />
                                        )}
                                        <span>
                                            {mode === 'light'
                                                ? t('settings.light')
                                                : mode === 'dark'
                                                  ? t('settings.dark')
                                                  : t('settings.system')}
                                        </span>
                                    </button>
                                );
                            }
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <div className="text-[13px] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.language')}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[var(--dnss-ink-3)]">
                            {t('settings.languageHint')}
                        </div>
                    </div>

                    <div className="inline-flex items-center rounded-xl bg-[var(--dnss-raised)] p-1">
                        {LANGUAGES.map((entry) => {
                            const active = i18n.lang === entry.code;
                            return (
                                <button
                                    key={entry.code}
                                    type="button"
                                    onClick={() => onLangChange(entry.code)}
                                    className={`inline-flex h-7 items-center rounded-lg px-3 text-[12px] font-medium transition-colors ${
                                        active
                                            ? 'bg-[var(--dnss-surface)] text-[var(--dnss-ink-1)] shadow-xs'
                                            : 'text-[var(--dnss-ink-2)] hover:text-[var(--dnss-ink-1)]'
                                    }`}
                                >
                                    {entry.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Maintenance */}
            <section className="dnss-card rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.maintenance')}
                        </div>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--dnss-ink-2)]">
                            {t('settings.maintenanceDesc')}
                        </p>
                    </div>

                    <div className="shrink-0">
                        <button
                            ref={resetButtonRef}
                            type="button"
                            disabled={busy}
                            aria-expanded={confirmReset}
                            onClick={() => setConfirmReset(true)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-error-soft)] px-3 text-[12px] font-medium text-[var(--dnss-error)] transition-colors hover:bg-[var(--dnss-error)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {resetBusy ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <ArrowUturnLeftIcon className="size-4 shrink-0" />
                            )}
                            {t('settings.resetAll')}
                        </button>

                        {confirmReset && (
                            <FloatingPanel
                                anchor={resetButtonRef.current}
                                onClose={() => setConfirmReset(false)}
                                placement="bottom"
                                className="dnss-popover w-64 rounded-xl p-3"
                            >
                                <div className="text-[13px] font-medium text-[var(--dnss-ink-1)]">
                                    {t('settings.resetConfirm')}
                                </div>
                                <div className="mt-2.5 flex justify-end gap-1.5">
                                    <button
                                        type="button"
                                        className="rounded-lg px-2.5 py-1 text-[12px] text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)]"
                                        onClick={() => setConfirmReset(false)}
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg bg-[var(--dnss-error)] px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90"
                                        onClick={() => {
                                            setConfirmReset(false);
                                            onResetAll();
                                        }}
                                    >
                                        {t('settings.reset')}
                                    </button>
                                </div>
                            </FloatingPanel>
                        )}
                    </div>
                </div>
            </section>

            {/* Hidden Presets */}
            {hiddenPresets.length > 0 && (
                <section className="dnss-card rounded-2xl p-4">
                    <div className="text-[13px] font-semibold text-[var(--dnss-ink-1)]">
                        {t('settings.hiddenPresets')}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--dnss-ink-2)]">
                        {t('settings.hiddenPresetsDesc')}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {hiddenPresets.map((id) => (
                            <span
                                key={id}
                                className="rounded-md bg-[var(--dnss-raised)] px-2 py-0.5 text-[12px] text-[var(--dnss-ink-2)]"
                            >
                                {DNS_PRESETS.find((p) => p.id === id)?.name ??
                                    id}
                            </span>
                        ))}
                    </div>
                    <div className="mt-3">
                        <button
                            type="button"
                            onClick={onRestorePresets}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-3 text-[12px] font-medium text-[var(--dnss-ink-1)] transition-colors hover:bg-[var(--dnss-hover)]"
                        >
                            <ArrowUturnLeftIcon className="size-4 shrink-0" />
                            {t('settings.restorePresets')}
                        </button>
                    </div>
                </section>
            )}

            {/* About & Privacy */}
            <section className="dnss-card divide-y divide-[var(--dnss-border)] rounded-2xl">
                <div className="p-4">
                    <div className="text-[13px] font-semibold text-[var(--dnss-ink-1)]">
                        {t('settings.about')}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--dnss-ink-2)]">
                        <strong className="font-semibold text-[var(--dnss-ink-1)]">
                            DNSS
                        </strong>
                        {t('settings.aboutSuffix')}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--dnss-ink-3)]">
                        {t('settings.inspirationBefore')}
                        <a
                            className="font-medium text-[var(--dnss-accent)] hover:underline"
                            href={INSPIRATION_URL}
                            onClick={(e) => {
                                e.preventDefault();
                                void openExternal(INSPIRATION_URL);
                            }}
                        >
                            DnsChanger/dnsChanger-desktop
                        </a>
                        {t('settings.inspirationAfter')}
                    </p>
                </div>

                <div className="p-4">
                    <div className="text-[13px] font-semibold text-[var(--dnss-ink-1)]">
                        {t('settings.privacy')}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--dnss-ink-2)]">
                        {t('settings.privacyBody')}
                    </p>
                </div>
            </section>
        </div>
    );
}
