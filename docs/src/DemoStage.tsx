import React, { useCallback, useEffect, useRef, useState } from 'react';
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

/** Virtual dimensions of the embedded desktop app so nothing wraps on desktop,
    while narrow mobile viewports step down smoothly to keep text legible. */
function getVirtualSize(frameWidth: number): { width: number; height: number } {
    if (frameWidth > 0 && frameWidth < 460) {
        return { width: 600, height: 560 };
    }
    return { width: 840, height: 590 };
}

export function DemoStage({ copy }: { copy: CopyDict['demo'] }) {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [accent, setAccent] = useState('#10b981');
    const [demoLang, setDemoLang] = useState<Lang>('en');
    const [demoKey, setDemoKey] = useState(0);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [frameWidth, setFrameWidth] = useState<number>(640);

    useEffect(() => {
        const el = frameRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.clientWidth;
            if (w > 0) setFrameWidth(w);
        };
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => measure());
            ro.observe(el);
            return () => ro.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

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

    const virtual = getVirtualSize(frameWidth);
    const scale = Math.min(1, frameWidth / virtual.width);
    const scaledHeight = Math.round(virtual.height * scale);

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

            <div
                ref={frameRef}
                dir="ltr"
                className="dnss-demo-frame"
                style={{ height: `${scaledHeight}px` }}
            >
                <div
                    className="dnss-demo-scaler"
                    style={{
                        width: `${virtual.width}px`,
                        height: `${virtual.height}px`,
                        transform: `scale(${scale})`,
                    }}
                >
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
            </div>

            <div className="lp-demo-footer">
                <span className="lp-demo-hint">{copy.hint}</span>
            </div>
        </div>
    );
}
