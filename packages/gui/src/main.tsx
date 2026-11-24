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
import { applyLang, loadLang } from './i18n';
import { applyAllAppearance } from './theme';

// Apply persisted language, theme, accent, font, and font size before first paint.
applyLang(loadLang());
applyAllAppearance();

const isTrayView =
    new URLSearchParams(window.location.search).get('view') === 'tray';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>{isTrayView ? <TrayApp /> : <App />}</React.StrictMode>
);
