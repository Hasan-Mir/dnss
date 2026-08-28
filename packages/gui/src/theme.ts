export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'dnss.theme';

export function loadTheme(): ThemeMode {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
    }
    return 'system';
}

export function saveTheme(mode: ThemeMode): void {
    localStorage.setItem(THEME_KEY, mode);
}

export function applyTheme(mode: ThemeMode): void {
    const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
    ).matches;
    const effective =
        mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', effective);
}

export function watchSystemTheme(onChange: () => void): () => void {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
}
