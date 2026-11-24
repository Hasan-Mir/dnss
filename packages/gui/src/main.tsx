import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import TrayApp from './TrayApp';
// Roboto is bundled locally (@fontsource) so the app keeps working fully
// offline — no Google Fonts CDN request, and the CSP stays 'self'.
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
// Vazirmatn covers the Persian script, which Roboto has no glyphs for.
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';
import './styles.css';
import { applyLang, loadLang } from './i18n';
import { applyTheme, loadTheme } from './theme';

// Apply the persisted/OS language and theme before the first render so
// neither window paints one frame in the wrong direction or palette.
applyLang(loadLang());
applyTheme(loadTheme());

const isTrayView =
    new URLSearchParams(window.location.search).get('view') === 'tray';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>{isTrayView ? <TrayApp /> : <App />}</React.StrictMode>
);
