import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    ArrowUturnLeftIcon,
    CheckIcon,
    ClipboardDocumentIcon,
    CodeBracketIcon,
    ComputerDesktopIcon,
    MoonIcon,
    SunIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { DNS_PRESETS } from '@seymi/dnss-core/presets';
import { openExternal } from '../api';
import CustomSelect, { type SelectOption } from '../components/CustomSelect';
import FloatingPanel from '../components/FloatingPanel';
import { usePortalContainer } from '../components/PortalContext';
import { LANGUAGES, type I18n, type Lang } from '../i18n';
import {
    ACCENT_PRESETS,
    DEFAULT_ACCENT_HEX,
    FONT_OPTIONS,
    FONT_SIZE_OPTIONS,
    hexToHsl,
    hslToHex,
    isValidHex,
    type FontFamilyId,
    type FontSizePx,
    type ThemeMode,
} from '../theme';

interface SettingsPageProps {
    i18n: I18n;
    onLangChange: (lang: Lang) => void;
    theme: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    fontFamily: FontFamilyId;
    onFontFamilyChange: (font: FontFamilyId) => void;
    fontSize: FontSizePx;
    onFontSizeChange: (size: FontSizePx) => void;
    accent: string;
    onAccentChange: (hex: string) => void;
    busy: boolean;
    resetBusy: boolean;
    onResetAll: () => void;
    hiddenPresets: string[];
    onRestorePresets: () => void;
    onExportSettings: () => Promise<string | null>;
    onImportSettings: (rawJson: string) => Promise<boolean>;
    showToast: (message: string, kind?: 'success' | 'error') => void;
}

const REPO_URL = 'https://github.com/Hasan-Mir/dnss';
const MAX_IMPORT_BYTES = 512 * 1024;
const INSPIRATION_URL = 'https://github.com/DnsChanger/dnsChanger-desktop';

/** VS Code-style settings.json viewer/editor modal, scoped to demo container when embedded. */
function SettingsJsonModal({
    i18n,
    initialJson,
    saving,
    onCopy,
    onApply,
    onClose,
}: {
    i18n: I18n;
    initialJson: string;
    saving: boolean;
    onCopy: (text: string) => void;
    onApply: (text: string) => Promise<boolean>;
    onClose: () => void;
}) {
    const portalContainer = usePortalContainer();
    const [text, setText] = useState(initialJson);
    const [closing, setClosing] = useState(false);
    const closeTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    const requestClose = useCallback(() => {
        if (saving || closing) return;
        setClosing(true);
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            onClose();
        }, 140);
    }, [saving, closing, onClose]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                requestClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [requestClose]);

    return createPortal(
        <div
            className={`${portalContainer ? 'absolute' : 'fixed'} inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] ${
                closing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
            }`}
            onClick={requestClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={`dnss-popover flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl p-5 ${
                    closing ? 'modal-exit' : 'modal-enter'
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <CodeBracketIcon className="size-4 shrink-0 text-[var(--dnss-accent)]" />
                        <h3 className="m-0 font-mono text-[length:var(--dnss-fs-md)] font-semibold text-[var(--dnss-ink-1)]">
                            {i18n.t('settings.jsonModalTitle')}
                        </h3>
                    </div>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={requestClose}
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--dnss-ink-3)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                    >
                        <XMarkIcon className="size-4 shrink-0" />
                    </button>
                </div>

                <p className="mt-1.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-3)]">
                    {i18n.t('settings.jsonModalHint')}
                </p>

                <textarea
                    dir="ltr"
                    spellCheck={false}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={12}
                    className="dnss-input mt-3 min-h-[160px] w-full flex-1 resize-none rounded-xl p-3 font-mono text-[length:var(--dnss-fs-xs)] leading-relaxed"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => onCopy(text)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)]"
                    >
                        <ClipboardDocumentIcon className="size-3.5 shrink-0" />
                        {i18n.t('settings.copyJson')}
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={requestClose}
                            className="inline-flex h-8 items-center rounded-lg px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                        >
                            {i18n.t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                                if (await onApply(text)) {
                                    requestClose();
                                }
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-accent)] px-3.5 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-accent-ink)] hover:bg-[var(--dnss-accent-hover)] disabled:opacity-50"
                        >
                            {saving ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <CheckIcon className="size-3.5 shrink-0" />
                            )}
                            {i18n.t('settings.applyJson')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        portalContainer ?? document.body
    );
}

export default function SettingsPage({
    i18n,
    onLangChange,
    theme,
    onThemeChange,
    fontFamily,
    onFontFamilyChange,
    fontSize,
    onFontSizeChange,
    accent,
    onAccentChange,
    busy,
    resetBusy,
    onResetAll,
    hiddenPresets,
    onRestorePresets,
    onExportSettings,
    onImportSettings,
    showToast,
}: SettingsPageProps) {
    const { t, num } = i18n;
    const [confirmReset, setConfirmReset] = useState(false);
    const [hexDraft, setHexDraft] = useState<string | null>(null);
    const [jsonModalText, setJsonModalText] = useState<string | null>(null);
    const [jsonSaving, setJsonSaving] = useState(false);
    const resetButtonRef = useRef<HTMLButtonElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleDownloadJson = async () => {
        const json = await onExportSettings();
        if (!json) return;
        const blob = new Blob([`${json}\n`], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dnss-settings.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(t('toast.settingsExported'));
    };

    const handleOpenJsonModal = async () => {
        const json = await onExportSettings();
        if (json) {
            setJsonModalText(json);
        }
    };

    const handleCopyJson = async (raw: string) => {
        try {
            await navigator.clipboard.writeText(raw);
            showToast(t('toast.settingsCopied'));
        } catch {
            showToast(t('toast.settingsCopyFailed'), 'error');
        }
    };

    const handleImportFile = async (file: File) => {
        if (file.size > MAX_IMPORT_BYTES) {
            showToast(
                t('toast.settingsImportFailed', {
                    error: 'Settings file exceeds 512 KiB size limit',
                }),
                'error'
            );
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }
        setJsonSaving(true);
        try {
            const raw = await file.text();
            await onImportSettings(raw);
        } catch (error) {
            showToast(
                t('toast.settingsImportFailed', { error: String(error) }),
                'error'
            );
        } finally {
            setJsonSaving(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const hsl = useMemo(() => hexToHsl(accent), [accent]);

    const fontOptions: SelectOption<FontFamilyId>[] = useMemo(
        () =>
            FONT_OPTIONS.map((f) => ({
                value: f.id,
                label: f.label,
                style: { fontFamily: f.stack },
            })),
        []
    );

    const handleHueChange = (nextHue: number) => {
        const sat = Math.max(48, hsl.s);
        const light = Math.max(45, Math.min(58, hsl.l || 52));
        const nextHex = hslToHex(nextHue, sat, light);
        setHexDraft(null);
        onAccentChange(nextHex);
    };

    const handleSatChange = (nextSat: number) => {
        const light = Math.max(45, Math.min(58, hsl.l || 52));
        const nextHex = hslToHex(hsl.h, nextSat, light);
        setHexDraft(null);
        onAccentChange(nextHex);
    };

    const handleHexInput = (raw: string) => {
        setHexDraft(raw);
        const normalized = raw.startsWith('#') ? raw : `#${raw}`;
        if (isValidHex(normalized)) {
            onAccentChange(normalized.toLowerCase());
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <h2 className="m-0 text-[length:var(--dnss-fs-lg)] font-semibold text-[var(--dnss-ink-1)]">
                {t('settings.title')}
            </h2>

            {/* Appearance, Accent Color, Typography & Language */}
            <section className="dnss-card divide-y divide-[var(--dnss-border)] rounded-2xl">
                {/* Theme Mode */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.appearance')}
                        </div>
                        <div className="mt-0.5 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
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
                                        className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[length:var(--dnss-fs-xs)] font-medium ${
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

                {/* Accent Color Presets + Professional Color Range Picker */}
                <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                                {t('settings.accent')}
                            </div>
                            <div className="mt-0.5 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                                {t('settings.accentDesc')}
                            </div>
                        </div>

                        {accent.toLowerCase() !== DEFAULT_ACCENT_HEX && (
                            <button
                                type="button"
                                onClick={() => {
                                    setHexDraft(null);
                                    onAccentChange(DEFAULT_ACCENT_HEX);
                                }}
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--dnss-raised)] px-2.5 text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)] hover:text-[var(--dnss-ink-1)]"
                            >
                                <ArrowUturnLeftIcon className="size-3.5 shrink-0" />
                                {t('settings.accentReset')}
                            </button>
                        )}
                    </div>

                    {/* Curated Preset Swatches */}
                    <div className="flex flex-wrap items-center gap-2">
                        {ACCENT_PRESETS.map((preset) => {
                            const selected =
                                accent.toLowerCase() ===
                                preset.hex.toLowerCase();
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    title={preset.label}
                                    aria-label={preset.label}
                                    aria-pressed={selected}
                                    onClick={() => {
                                        setHexDraft(null);
                                        onAccentChange(preset.hex);
                                    }}
                                    style={{ backgroundColor: preset.hex }}
                                    className={`grid size-7 place-items-center rounded-full border-2 transition-transform hover:scale-105 ${
                                        selected
                                            ? 'border-[var(--dnss-ink-1)] ring-2 ring-[var(--dnss-accent-soft)] ring-offset-2 ring-offset-[var(--dnss-surface)]'
                                            : 'border-transparent'
                                    }`}
                                >
                                    {selected && (
                                        <CheckIcon className="size-3.5 stroke-[2.6] text-white drop-shadow-xs" />
                                    )}
                                </button>
                            );
                        })}

                        {/* Live Hex Value + Preview */}
                        <div
                            dir="ltr"
                            className="ms-auto flex items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-2 py-1 ring-1 ring-[var(--dnss-border)]"
                        >
                            <span
                                className="size-3.5 shrink-0 rounded-full border border-black/15"
                                style={{
                                    backgroundColor: 'var(--dnss-accent)',
                                }}
                            />
                            <input
                                type="text"
                                aria-label="Hex accent color"
                                value={hexDraft ?? accent.toUpperCase()}
                                maxLength={7}
                                onChange={(e) => handleHexInput(e.target.value)}
                                onBlur={() => setHexDraft(null)}
                                className="w-[66px] bg-transparent font-mono text-[length:var(--dnss-fs-2xs)] font-medium uppercase text-[var(--dnss-ink-1)] outline-none"
                            />
                        </div>
                    </div>

                    {/* Custom Hue & Saturation Range Pickers */}
                    <div className="grid gap-2.5 rounded-xl bg-[var(--dnss-raised)] p-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-ink-2)]">
                                <span>{t('settings.accentHue')}</span>
                                <span
                                    dir="ltr"
                                    className="font-mono tabular-nums text-[var(--dnss-ink-3)]"
                                >
                                    {hsl.h}°
                                </span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={359}
                                value={hsl.h}
                                onChange={(e) =>
                                    handleHueChange(Number(e.target.value))
                                }
                                className="dnss-hue-slider w-full"
                            />
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[length:var(--dnss-fs-2xs)] font-medium text-[var(--dnss-ink-2)]">
                                <span>{t('settings.accentSat')}</span>
                                <span
                                    dir="ltr"
                                    className="font-mono tabular-nums text-[var(--dnss-ink-3)]"
                                >
                                    {hsl.s}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min={38}
                                max={95}
                                value={Math.max(38, Math.min(95, hsl.s))}
                                onChange={(e) =>
                                    handleSatChange(Number(e.target.value))
                                }
                                style={{
                                    background: `linear-gradient(to right, ${hslToHex(hsl.h, 38, 52)}, ${hslToHex(hsl.h, 95, 52)})`,
                                }}
                                className="dnss-sat-slider w-full"
                            />
                        </label>
                    </div>
                </div>

                {/* Font Family Selector */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                        <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.font')}
                        </div>
                        <div className="mt-0.5 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                            {t('settings.fontDesc')}
                        </div>
                    </div>

                    <CustomSelect
                        value={fontFamily}
                        options={fontOptions}
                        onChange={onFontFamilyChange}
                        ariaLabel={t('settings.font')}
                        className="w-44"
                    />
                </div>

                {/* Font Size Selector (12 / 14 / 16) */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.fontSize')}
                        </div>
                        <div className="mt-0.5 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
                            {t('settings.fontSizeDesc')}
                        </div>
                    </div>

                    <div className="inline-flex items-center rounded-xl bg-[var(--dnss-raised)] p-1">
                        {FONT_SIZE_OPTIONS.map((sz) => {
                            const active = fontSize === sz;
                            return (
                                <button
                                    key={sz}
                                    type="button"
                                    onClick={() => onFontSizeChange(sz)}
                                    className={`inline-flex h-7 min-w-[48px] items-center justify-center rounded-lg px-2.5 text-[length:var(--dnss-fs-xs)] font-medium tabular-nums ${
                                        active
                                            ? 'bg-[var(--dnss-surface)] text-[var(--dnss-ink-1)] shadow-xs'
                                            : 'text-[var(--dnss-ink-2)] hover:text-[var(--dnss-ink-1)]'
                                    }`}
                                >
                                    {num(sz)}px
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Language */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.language')}
                        </div>
                        <div className="mt-0.5 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-3)]">
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
                                    className={`inline-flex h-7 items-center rounded-lg px-3 text-[length:var(--dnss-fs-xs)] font-medium ${
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

            {/* Settings & Backup (settings.json) */}
            <section className="dnss-card rounded-2xl p-4">
                <div className="flex flex-col gap-3">
                    <div>
                        <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.backup')}
                        </div>
                        <p className="mt-0.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-2)]">
                            {t('settings.backupDesc')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={busy || jsonSaving}
                            onClick={() => void handleDownloadJson()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)] disabled:opacity-50"
                        >
                            <ArrowDownTrayIcon className="size-3.5 shrink-0 text-[var(--dnss-accent)]" />
                            {t('settings.exportJson')}
                        </button>

                        <button
                            type="button"
                            disabled={busy || jsonSaving}
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)] disabled:opacity-50"
                        >
                            <ArrowUpTrayIcon className="size-3.5 shrink-0 text-[var(--dnss-accent)]" />
                            {t('settings.importJson')}
                        </button>

                        <button
                            type="button"
                            disabled={busy || jsonSaving}
                            onClick={() => void handleOpenJsonModal()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dnss-border-strong)] bg-[var(--dnss-surface)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-raised)] disabled:opacity-50"
                        >
                            <CodeBracketIcon className="size-3.5 shrink-0 text-[var(--dnss-ink-2)]" />
                            {t('settings.editJson')}
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    void handleImportFile(file);
                                }
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* Maintenance */}
            <section className="dnss-card rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                            {t('settings.maintenance')}
                        </div>
                        <p className="mt-0.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-2)]">
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
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-error-soft)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-error)] hover:bg-[var(--dnss-error)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {resetBusy ? (
                                <span className="loading loading-spinner loading-xs" />
                            ) : (
                                <ArrowUturnLeftIcon className="size-4 shrink-0" />
                            )}
                            {t('settings.resetAll')}
                        </button>

                        <FloatingPanel
                            anchor={resetButtonRef.current}
                            open={confirmReset}
                            onClose={() => setConfirmReset(false)}
                            placement="bottom"
                            className="dnss-popover w-64 rounded-xl p-3"
                        >
                            <div className="text-[length:var(--dnss-fs-sm)] font-medium text-[var(--dnss-ink-1)]">
                                {t('settings.resetConfirm')}
                            </div>
                            <div className="mt-2.5 flex justify-end gap-1.5">
                                <button
                                    type="button"
                                    className="rounded-lg px-2.5 py-1 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-2)] hover:bg-[var(--dnss-hover)]"
                                    onClick={() => setConfirmReset(false)}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    className="rounded-lg bg-[var(--dnss-error)] px-2.5 py-1 text-[length:var(--dnss-fs-xs)] font-medium text-white hover:opacity-90"
                                    onClick={() => {
                                        setConfirmReset(false);
                                        onResetAll();
                                    }}
                                >
                                    {t('settings.reset')}
                                </button>
                            </div>
                        </FloatingPanel>
                    </div>
                </div>
            </section>

            {/* Hidden Presets */}
            {hiddenPresets.length > 0 && (
                <section className="dnss-card rounded-2xl p-4">
                    <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                        {t('settings.hiddenPresets')}
                    </div>
                    <p className="mt-0.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-2)]">
                        {t('settings.hiddenPresetsDesc')}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {hiddenPresets.map((id) => (
                            <span
                                key={id}
                                className="rounded-md bg-[var(--dnss-raised)] px-2 py-0.5 text-[length:var(--dnss-fs-xs)] text-[var(--dnss-ink-2)]"
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
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--dnss-raised)] px-3 text-[length:var(--dnss-fs-xs)] font-medium text-[var(--dnss-ink-1)] hover:bg-[var(--dnss-hover)]"
                        >
                            <ArrowUturnLeftIcon className="size-4 shrink-0" />
                            {t('settings.restorePresets')}
                        </button>
                    </div>
                </section>
            )}

            {jsonModalText !== null && (
                <SettingsJsonModal
                    i18n={i18n}
                    initialJson={jsonModalText}
                    saving={jsonSaving}
                    onCopy={(raw) => void handleCopyJson(raw)}
                    onApply={async (raw) => {
                        setJsonSaving(true);
                        try {
                            return await onImportSettings(raw);
                        } finally {
                            setJsonSaving(false);
                        }
                    }}
                    onClose={() => setJsonModalText(null)}
                />
            )}

            {/* About & Privacy */}
            <section className="dnss-card divide-y divide-[var(--dnss-border)] rounded-2xl">
                <div className="p-4">
                    <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                        {t('settings.about')}
                    </div>
                    <p className="mt-1 text-[length:var(--dnss-fs-sm)] leading-relaxed text-[var(--dnss-ink-2)]">
                        <strong className="font-semibold text-[var(--dnss-ink-1)]">
                            DNSS
                        </strong>
                        {t('settings.aboutSuffix')}
                    </p>
                    <p className="mt-1.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-2)]">
                        {t('settings.repoLabel')}:{' '}
                        <a
                            dir="ltr"
                            className="font-medium text-[var(--dnss-accent-text)] hover:underline"
                            href={REPO_URL}
                            onClick={(e) => {
                                e.preventDefault();
                                void openExternal(REPO_URL);
                            }}
                        >
                            github.com/Hasan-Mir/dnss
                        </a>
                    </p>
                    <p className="mt-1.5 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-3)]">
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
                    <div className="text-[length:var(--dnss-fs-sm)] font-semibold text-[var(--dnss-ink-1)]">
                        {t('settings.privacy')}
                    </div>
                    <p className="mt-1 text-[length:var(--dnss-fs-xs)] leading-relaxed text-[var(--dnss-ink-2)]">
                        {t('settings.privacyBody')}
                    </p>
                </div>
            </section>
        </div>
    );
}
