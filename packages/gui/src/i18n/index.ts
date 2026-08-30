/**
 * Lightweight i18n for the GUI. No framework — a dictionary per language and
 * one registry below.
 *
 * HOW TO ADD A LANGUAGE (e.g. Arabic):
 *   1. Copy `fa.ts` to `ar.ts`, translate the values (keep the keys).
 *   2. Add one entry to `LANGUAGES` below with its endonym and text
 *      direction.
 * That's it — the Settings switcher, RTL/LTR direction, persistence, first
 * run detection and localized digits all derive from `LANGUAGES`. Missing
 * keys are a compile error because every dictionary must implement `Dict`
 * (the shape of `en.ts`).
 */
import en, { type Dict } from './en';
import fa from './fa';

export const LANGUAGES = [
    { code: 'en', name: 'English', dir: 'ltr', dict: en },
    { code: 'fa', name: 'فارسی', dir: 'rtl', dict: fa },
] as const satisfies readonly {
    code: string;
    name: string;
    dir: 'ltr' | 'rtl';
    dict: Dict;
}[];

export type Lang = (typeof LANGUAGES)[number]['code'];
export type TextDirection = (typeof LANGUAGES)[number]['dir'];

const byCode = new Map(LANGUAGES.map((entry) => [entry.code, entry]));
const DEFAULT = byCode.get('en')!;

export type MsgKey = keyof Dict;
/** Values interpolated into `{placeholders}`; numbers use localized digits. */
export type Vars = Record<string, string | number>;

export interface I18n {
    lang: Lang;
    dir: TextDirection;
    /** Translate a message, interpolating `{vars}` into it. */
    t: (key: MsgKey, vars?: Vars) => string;
    /** Format a bare number with the language's own digits. */
    num: (value: number) => string;
}

export function createI18n(lang: Lang): I18n {
    const meta = byCode.get(lang) ?? DEFAULT;
    const numFmt = new Intl.NumberFormat(meta.code);

    const t: I18n['t'] = (key, vars) => {
        let text: string = meta.dict[key] ?? DEFAULT.dict[key];
        if (vars) {
            for (const [name, value] of Object.entries(vars)) {
                text = text.replaceAll(
                    `{${name}}`,
                    typeof value === 'number' ? numFmt.format(value) : value
                );
            }
        }
        return text;
    };

    return {
        lang: meta.code,
        dir: meta.dir,
        t,
        num: (value) => numFmt.format(value),
    };
}

const LANG_KEY = 'dnss.lang';

/** Stored preference, falling back to the OS/webview language on first run. */
export function loadLang(): Lang {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && byCode.has(stored as Lang)) {
        return stored as Lang;
    }
    const osLang = navigator.language?.split('-')[0]?.toLowerCase();
    return osLang && byCode.has(osLang as Lang) ? (osLang as Lang) : 'en';
}

export function saveLang(lang: Lang): void {
    localStorage.setItem(LANG_KEY, lang);
}

/** Mirrors the language onto <html lang> / <html dir> so the whole document
    (fonts, text alignment, flexbox, scrollbars) follows. */
export function applyLang(lang: Lang): void {
    const meta = byCode.get(lang) ?? DEFAULT;
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
}
