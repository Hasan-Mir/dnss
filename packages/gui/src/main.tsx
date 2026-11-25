import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import TrayApp from './TrayApp';
// Self-hosted @fontsource typefaces so the app works completely offline
// and keeps the strict CSP (font-src 'self' data:).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
// Vazirmatn covers Persian/Arabic script across all Latin font choices.
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import './styles.css';
import { isDesktopApp } from './api';
import { applyLang, loadLang } from './i18n';
import { applyAllAppearance } from './theme';

// Apply persisted language, theme, accent, font, and font size before first paint.
applyLang(loadLang());
applyAllAppearance();

// Disable WebView2 browser context menu, zoom, and browser-only shortcuts
// inside the desktop app (both main and tray windows) while preserving
// standard text editing shortcuts (Ctrl+C/V/X/A/Z/Y). Uses `e.code` as well
// as `e.key` so shortcuts stay blocked under Persian (FA) keyboard layouts.
if (isDesktopApp()) {
    const isDev = import.meta.env.DEV;
    const BLOCKED_MOD_CODES = new Set([
        'KeyP',
        'KeyF',
        'KeyG',
        ...(isDev ? [] : ['KeyR']),
        'KeyS',
        'KeyU',
        'KeyO',
        'KeyJ',
        'KeyH',
        'Equal',
        'Minus',
        'Digit0',
        'NumpadAdd',
        'NumpadSubtract',
        'Numpad0',
    ]);
    const BLOCKED_SHIFT_MOD_CODES = new Set(
        isDev ? ['KeyJ', 'KeyC'] : ['KeyI', 'KeyJ', 'KeyC', 'KeyR']
    );

    window.addEventListener(
        'contextmenu',
        (e) => {
            e.preventDefault();
        },
        { capture: true }
    );

    window.addEventListener(
        'keydown',
        (e) => {
            const key = e.key.toLowerCase();
            const mod = e.ctrlKey || e.metaKey;

            // Function keys: Find (F3), Caret Browsing (F7); Reload (F5) & DevTools (F12) blocked in production
            if (
                key === 'f3' ||
                key === 'f7' ||
                (!isDev && (key === 'f5' || key === 'f12'))
            ) {
                e.preventDefault();
                return;
            }

            // Browser Back / Forward navigation
            if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                return;
            }

            if (mod) {
                if (
                    BLOCKED_MOD_CODES.has(e.code) ||
                    key === '+' ||
                    key === '-' ||
                    key === '=' ||
                    key === '0'
                ) {
                    e.preventDefault();
                    return;
                }
                if (e.shiftKey && BLOCKED_SHIFT_MOD_CODES.has(e.code)) {
                    e.preventDefault();
                    return;
                }
            }
        },
        { capture: true }
    );

    window.addEventListener(
        'wheel',
        (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        },
        { passive: false, capture: true }
    );
}

const isTrayView =
    new URLSearchParams(window.location.search).get('view') === 'tray';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>{isTrayView ? <TrayApp /> : <App />}</React.StrictMode>
);
