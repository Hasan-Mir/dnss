import { useRef, useState } from 'react';
import {
    ArrowUturnLeftIcon,
    ComputerDesktopIcon,
    LanguageIcon,
    MoonIcon,
    SunIcon,
} from '@heroicons/react/24/outline';
import { DNS_PRESETS } from '@seymi/dnss-core/presets';
import { openExternal } from '../api';
import FloatingPanel from '../components/FloatingPanel';
import { LANGUAGES, type I18n, type Lang } from '../i18n';
import type { ThemeMode } from '../theme';

interface SettingsPageProps {
    /** Translations + text direction + localized digits. */
    i18n: I18n;
    onLangChange: (lang: Lang) => void;
    theme: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    /** True while ANY blocking operation runs — disables the controls. */
    busy: boolean;
    /** True while the reset-all operation itself is running (spinner). */
    resetBusy: boolean;
    onResetAll: () => void;
    /** Ids of built-in presets the user removed from the Servers list. */
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
    // In-app confirmation instead of window.confirm, which renders as a
    // clashing native dialog inside the webview.
    const [confirmReset, setConfirmReset] = useState(false);
    const resetButtonRef = useRef<HTMLButtonElement | null>(null);

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <h2 className="m-0 text-lg font-bold">{t('settings.title')}</h2>

            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body gap-3 p-4">
                    <div className="text-xs font-semibold opacity-70">
                        {t('settings.appearance')}
                    </div>
                    <div className="join">
                        {(['light', 'dark', 'system'] as ThemeMode[]).map(
                            (mode) => (
                                <button
                                    key={mode}
                                    className={`btn btn-sm join-item ${
                                        theme === mode
                                            ? 'btn-primary'
                                            : 'btn-ghost'
                                    }`}
                                    onClick={() => onThemeChange(mode)}
                                >
                                    {mode === 'light' ? (
                                        <SunIcon className="size-4" />
                                    ) : mode === 'dark' ? (
                                        <MoonIcon className="size-4" />
                                    ) : (
                                        <ComputerDesktopIcon className="size-4" />
                                    )}
                                    {mode === 'light'
                                        ? t('settings.light')
                                        : mode === 'dark'
                                          ? t('settings.dark')
                                          : t('settings.system')}
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body gap-3 p-4">
                    <div className="text-xs font-semibold opacity-70">
                        {t('settings.language')}
                    </div>
                    <div className="join">
                        {LANGUAGES.map((entry) => (
                            <button
                                key={entry.code}
                                className={`btn btn-sm join-item ${
                                    i18n.lang === entry.code
                                        ? 'btn-primary'
                                        : 'btn-ghost'
                                }`}
                                onClick={() => onLangChange(entry.code)}
                            >
                                <LanguageIcon className="size-4" />
                                {entry.name}
                            </button>
                        ))}
                    </div>
                    <p className="m-0 text-xs leading-relaxed opacity-60">
                        {t('settings.languageHint')}
                    </p>
                </div>
            </div>

            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body gap-2 p-4">
                    <div className="text-xs font-semibold opacity-70">
                        {t('settings.maintenance')}
                    </div>
                    <p className="m-0 text-xs leading-relaxed opacity-60">
                        {t('settings.maintenanceDesc')}
                    </p>
                    <div className="flex justify-start">
                        <button
                            ref={resetButtonRef}
                            className="btn btn-error btn-sm"
                            disabled={busy}
                            aria-expanded={confirmReset}
                            onClick={() => setConfirmReset(true)}
                        >
                            {resetBusy ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <ArrowUturnLeftIcon className="size-4" />
                            )}
                            {t('settings.resetAll')}
                        </button>

                        {confirmReset && (
                            <FloatingPanel
                                anchor={resetButtonRef.current}
                                onClose={() => setConfirmReset(false)}
                                placement="top"
                                className="w-64 rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-xl"
                            >
                                <div className="text-sm">
                                    {t('settings.resetConfirm')}
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                    <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => setConfirmReset(false)}
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        className="btn btn-error btn-xs"
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
            </div>

            {hiddenPresets.length > 0 && (
                <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                    <div className="card-body gap-2 p-4">
                        <div className="text-xs font-semibold opacity-70">
                            {t('settings.hiddenPresets')}
                        </div>
                        <p className="m-0 text-xs leading-relaxed opacity-60">
                            {t('settings.hiddenPresetsDesc')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {hiddenPresets.map((id) => (
                                <span
                                    key={id}
                                    className="badge badge-ghost badge-sm"
                                >
                                    {DNS_PRESETS.find((p) => p.id === id)
                                        ?.name ?? id}
                                </span>
                            ))}
                        </div>
                        <div className="flex justify-start">
                            <button
                                className="btn btn-sm"
                                onClick={onRestorePresets}
                            >
                                <ArrowUturnLeftIcon className="size-4" />
                                {t('settings.restorePresets')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body gap-2 p-4">
                    <div className="text-xs font-semibold opacity-70">
                        {t('settings.about')}
                    </div>
                    <p className="m-0 text-sm leading-relaxed">
                        <strong>DNSS</strong>
                        {t('settings.aboutSuffix')}
                    </p>
                    <p className="m-0 text-xs leading-relaxed opacity-60">
                        {t('settings.inspirationBefore')}
                        <a
                            className="link link-primary"
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
            </div>

            <div className="card border border-base-300/40 bg-base-100 shadow-sm">
                <div className="card-body gap-2 p-4">
                    <div className="text-xs font-semibold opacity-70">
                        {t('settings.privacy')}
                    </div>
                    <p className="m-0 text-xs leading-relaxed opacity-60">
                        {t('settings.privacyBody')}
                    </p>
                </div>
            </div>
        </div>
    );
}
