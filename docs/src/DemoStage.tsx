import React, { useCallback, useState } from 'react';
import App from '@gui/App';
import type { Lang } from '@gui/i18n';
import type { ThemeMode } from '@gui/theme';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { CopyDict } from './copy';
import { resetMockTauriState } from './mock-ipc';

const ACCENTS = [
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Ocean', hex: '#3b82f6' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'Rose', hex: '#f43f5e' },
];

export function DemoStage({ copy }: { copy: CopyDict['demo'] }) {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [accent, setAccent] = useState('#10b981');
    const [demoLang, setDemoLang] = useState<Lang>('en');
    const [demoKey, setDemoKey] = useState(0);

    const handleAppThemeChange = useCallback((next: ThemeMode) => {
        if (next === 'system') {
            setTheme(
                window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light'
            );
        } else {
            setTheme(next);
        }
    }, []);

    const handleReset = () => {
        resetMockTauriState();
        setTheme('dark');
        setAccent('#10b981');
        setDemoLang('en');
        setDemoKey((k) => k + 1);
    };

    return (
        <div className="lp-demo-stage" id="demo">
            <div className="lp-workbench-bar">
                <div className="lp-wb-group">
                    <span className="lp-wb-dot" aria-hidden="true" />
                    <span className="lp-wb-title">{copy.workbenchLabel}</span>
                </div>

                <div className="lp-wb-controls">
                    <div
                        className="lp-wb-seg"
                        role="group"
                        aria-label={copy.themeLabel}
                    >
                        {(['dark', 'light'] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={`lp-wb-pill${theme === mode ? ' active' : ''}`}
                                onClick={() => setTheme(mode)}
                            >
                                {copy.themes[mode]}
                            </button>
                        ))}
                    </div>

                    <div
                        className="lp-wb-swatches"
                        role="group"
                        aria-label={copy.accentLabel}
                    >
                        {ACCENTS.map((a) => (
                            <button
                                key={a.hex}
                                type="button"
                                title={a.name}
                                aria-label={`${copy.accentLabel}: ${a.name}`}
                                className={`lp-wb-swatch${
                                    accent.toLowerCase() === a.hex.toLowerCase()
                                        ? ' active'
                                        : ''
                                }`}
                                style={{ background: a.hex }}
                                onClick={() => setAccent(a.hex)}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        className="lp-wb-btn"
                        onClick={() =>
                            setDemoLang((l) => (l === 'en' ? 'fa' : 'en'))
                        }
                        title={copy.demoLangLabel}
                    >
                        <span>{demoLang === 'en' ? 'UI: EN' : 'UI: فا'}</span>
                    </button>

                    <button
                        type="button"
                        className="lp-wb-btn subtle"
                        onClick={handleReset}
                        title={copy.reset}
                        aria-label={copy.reset}
                    >
                        <ArrowPathIcon className="size-3.5 shrink-0" />
                    </button>
                </div>
            </div>

            <div className="dnss-demo-frame">
                <App
                    key={`dnss-demo-${demoKey}`}
                    embedded
                    theme={theme}
                    onThemeChange={handleAppThemeChange}
                    lang={demoLang}
                    onLangChange={setDemoLang}
                    accent={accent}
                    onAccentChange={setAccent}
                />
            </div>

            <div className="lp-demo-footer">
                <span className="lp-demo-hint">{copy.hint}</span>
            </div>
        </div>
    );
}
