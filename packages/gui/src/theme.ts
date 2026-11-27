export type ThemeMode = 'light' | 'dark' | 'system';

export type FontFamilyId =
    'inter' | 'google-sans' | 'dm-sans' | 'manrope' | 'roboto';

export type FontSizePx = 12 | 14 | 16;

export interface FontOption {
    id: FontFamilyId;
    label: string;
    stack: string;
}

export interface AccentPreset {
    id: string;
    label: string;
    hex: string;
}

export const THEME_KEY = 'dnss.theme';
export const FONT_KEY = 'dnss.font';
export const FONT_SIZE_KEY = 'dnss.fontSize';
export const ACCENT_KEY = 'dnss.accent';

export const DEFAULT_ACCENT_HEX = '#10b981';

export const FONT_OPTIONS: FontOption[] = [
    {
        id: 'inter',
        label: 'Inter',
        stack: "'Inter', 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, sans-serif",
    },
    {
        id: 'google-sans',
        label: 'Google Sans',
        stack: "'Google Sans', 'Plus Jakarta Sans', 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, sans-serif",
    },
    {
        id: 'dm-sans',
        label: 'DM Sans',
        stack: "'DM Sans', 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, sans-serif",
    },
    {
        id: 'manrope',
        label: 'Manrope',
        stack: "'Manrope', 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, sans-serif",
    },
    {
        id: 'roboto',
        label: 'Roboto',
        stack: "'Roboto', 'Vazirmatn', 'Segoe UI', system-ui, -apple-system, sans-serif",
    },
];

export const FONT_SIZE_OPTIONS: FontSizePx[] = [12, 14, 16];

export const ACCENT_PRESETS: AccentPreset[] = [
    { id: 'emerald', label: 'Emerald', hex: '#10b981' },
    { id: 'teal', label: 'Teal', hex: '#06b6d4' },
    { id: 'blue', label: 'Ocean', hex: '#3b82f6' },
    { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
    { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
    { id: 'rose', label: 'Rose', hex: '#f43f5e' },
    { id: 'amber', label: 'Amber', hex: '#f59e0b' },
];

/* --------------------------------------------------------------------------
 * Color conversion helpers for accessible dynamic accent tokens
 * -------------------------------------------------------------------------- */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: string): boolean {
    return HEX_RE.test(value.trim());
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    const n = Number.parseInt(clean, 16);
    return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
    };
}

export function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    return (
        '#' +
        [clamp(r), clamp(g), clamp(b)]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')
    );
}

export function rgbToHsl(
    r: number,
    g: number,
    b: number
): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rn:
                h = (gn - bn) / d + (gn < bn ? 6 : 0);
                break;
            case gn:
                h = (bn - rn) / d + 2;
                break;
            default:
                h = (rn - gn) / d + 4;
                break;
        }
        h *= 60;
    }

    return {
        h: Math.round(h) % 360,
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

export function hslToRgb(
    h: number,
    s: number,
    l: number
): { r: number; g: number; b: number } {
    const hn = ((h % 360) + 360) % 360;
    const sn = Math.max(0, Math.min(100, s)) / 100;
    const ln = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = ln - c / 2;
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hn < 60) {
        r1 = c;
        g1 = x;
    } else if (hn < 120) {
        r1 = x;
        g1 = c;
    } else if (hn < 180) {
        g1 = c;
        b1 = x;
    } else if (hn < 240) {
        g1 = x;
        b1 = c;
    } else if (hn < 300) {
        r1 = x;
        b1 = c;
    } else {
        r1 = c;
        b1 = x;
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
    const safe = isValidHex(hex) ? hex : DEFAULT_ACCENT_HEX;
    const { r, g, b } = hexToRgb(safe);
    return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
    const { r, g, b } = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
}

function relativeLuminance(r: number, g: number, b: number): number {
    const toLinear = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/* --------------------------------------------------------------------------
 * Theme mode
 * -------------------------------------------------------------------------- */

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

export function getResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
    const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
    ).matches;

    return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

export function applyTheme(
    mode: ThemeMode,
    target: HTMLElement = document.documentElement,
    accentHex?: string
): void {
    const resolved = getResolvedTheme(mode);
    target.setAttribute('data-theme', resolved);
    // Re-compute accent palette whenever light/dark polarity changes.
    applyAccent(accentHex ?? loadAccent(), resolved, target);
}

export function watchSystemTheme(onChange: () => void): () => void {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
}

/* --------------------------------------------------------------------------
 * Font family & font size
 * -------------------------------------------------------------------------- */

export function loadFontFamily(): FontFamilyId {
    const stored = localStorage.getItem(FONT_KEY);
    if (FONT_OPTIONS.some((f) => f.id === stored)) {
        return stored as FontFamilyId;
    }
    return 'google-sans';
}

export function saveFontFamily(font: FontFamilyId): void {
    localStorage.setItem(FONT_KEY, font);
}

export function applyFontFamily(
    font: FontFamilyId,
    target: HTMLElement = document.documentElement
): void {
    const option = FONT_OPTIONS.find((f) => f.id === font) ?? FONT_OPTIONS[0];
    target.style.setProperty('--dnss-font-sans', option.stack);
}

export function loadFontSize(): FontSizePx {
    const stored = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (stored === 12 || stored === 14 || stored === 16) {
        return stored;
    }
    return 14;
}

export function saveFontSize(size: FontSizePx): void {
    localStorage.setItem(FONT_SIZE_KEY, String(size));
}

export function applyFontSize(
    size: FontSizePx,
    target: HTMLElement = document.documentElement
): void {
    const scale = size === 12 ? 0.87 : size === 16 ? 1.13 : 1;
    target.style.setProperty('--dnss-text-scale', String(scale));
    target.setAttribute('data-dnss-size', String(size));
}

/* --------------------------------------------------------------------------
 * Accent color (presets + custom spectrum picker)
 * -------------------------------------------------------------------------- */

export function loadAccent(): string {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (stored && isValidHex(stored)) {
        return stored.toLowerCase();
    }
    return DEFAULT_ACCENT_HEX;
}

export function saveAccent(hex: string): void {
    const safe = isValidHex(hex) ? hex.toLowerCase() : DEFAULT_ACCENT_HEX;
    localStorage.setItem(ACCENT_KEY, safe);
}

export function applyAccent(
    hex: string,
    resolvedTheme?: 'light' | 'dark',
    target: HTMLElement = document.documentElement
): void {
    const safe = isValidHex(hex) ? hex.toLowerCase() : DEFAULT_ACCENT_HEX;
    const mode =
        resolvedTheme ??
        (target.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

    const { h, s, l } = hexToHsl(safe);
    const sat = Math.max(38, Math.min(95, s));

    // Clamp lightness per theme polarity so every custom hue stays legible.
    const mainL =
        mode === 'dark'
            ? Math.max(54, Math.min(68, l < 54 ? 58 : l))
            : Math.max(36, Math.min(48, l > 48 ? 42 : l));
    const hoverL =
        mode === 'dark' ? Math.max(46, mainL - 6) : Math.max(28, mainL - 6);
    let textL =
        mode === 'dark' ? Math.max(62, mainL + 4) : Math.min(36, mainL - 4);

    const mainRgb = hslToRgb(h, sat, mainL);
    const hoverRgb = hslToRgb(h, sat, hoverL);

    // Ensure --dnss-accent-text meets WCAG AA (4.5:1) on tinted/raised surfaces.
    const refSurface =
        mode === 'dark' ? { r: 32, g: 37, b: 48 } : { r: 248, g: 249, b: 251 };
    const refBg = {
        r: Math.round(mainRgb.r * 0.2 + refSurface.r * 0.8),
        g: Math.round(mainRgb.g * 0.2 + refSurface.g * 0.8),
        b: Math.round(mainRgb.b * 0.2 + refSurface.b * 0.8),
    };
    const refBgLum = relativeLuminance(refBg.r, refBg.g, refBg.b);
    let textRgb = hslToRgb(h, sat, textL);
    for (let step = 0; step < 30; step++) {
        const textLum = relativeLuminance(textRgb.r, textRgb.g, textRgb.b);
        const ratio =
            (Math.max(textLum, refBgLum) + 0.05) /
            (Math.min(textLum, refBgLum) + 0.05);
        if (ratio >= 4.5) break;
        textL =
            mode === 'dark' ? Math.min(92, textL + 2) : Math.max(14, textL - 2);
        textRgb = hslToRgb(h, sat, textL);
    }

    const mainHex = rgbToHex(mainRgb.r, mainRgb.g, mainRgb.b);
    const hoverHex = rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);
    const textHex = rgbToHex(textRgb.r, textRgb.g, textRgb.b);

    // Choose the higher-contrast ink over filled accent buttons (WCAG 2.x).
    const lum = relativeLuminance(mainRgb.r, mainRgb.g, mainRgb.b);
    const darkInkLum = relativeLuminance(7, 19, 15);
    const darkContrast = (lum + 0.05) / (darkInkLum + 0.05);
    const lightContrast = 1.05 / (lum + 0.05);
    const inkHex = darkContrast >= lightContrast ? '#07130f' : '#ffffff';

    const softAlpha = mode === 'dark' ? 0.14 : 0.11;
    const glowAlpha = mode === 'dark' ? 0.34 : 0.22;

    const root = target.style;
    root.setProperty('--dnss-accent', mainHex);
    root.setProperty('--dnss-accent-hover', hoverHex);
    root.setProperty('--dnss-accent-text', textHex);
    root.setProperty('--dnss-accent-ink', inkHex);
    root.setProperty(
        '--dnss-accent-soft',
        `rgba(${mainRgb.r}, ${mainRgb.g}, ${mainRgb.b}, ${softAlpha})`
    );
    root.setProperty(
        '--dnss-accent-glow',
        `rgba(${mainRgb.r}, ${mainRgb.g}, ${mainRgb.b}, ${glowAlpha})`
    );
    root.setProperty('--color-primary', mainHex);
    root.setProperty('--color-primary-content', inkHex);
}

/** Apply all persisted appearance settings before first paint. */
export function applyAllAppearance(): void {
    applyTheme(loadTheme());
    applyFontFamily(loadFontFamily());
    applyFontSize(loadFontSize());
}
