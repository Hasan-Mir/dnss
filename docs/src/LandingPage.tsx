import React, { useCallback, useEffect, useState } from 'react';
import App from '@gui/App';

// Asset Imports
import appIcon from './assets/images/icon-128.png';
import iconWindows from './assets/icons/brand-windows.svg';
import iconApple from './assets/icons/brand-apple.svg';
import iconLinux from './assets/icons/brand-linux.svg';
import iconNpm from './assets/icons/brand-npm.svg';
import iconGithub from './assets/icons/brand-github.svg';
import iconDownload from './assets/icons/download.svg';
import iconCopy from './assets/icons/copy.svg';
import iconCheck from './assets/icons/check.svg';
import iconBolt from './assets/icons/bolt.svg';
import iconGauge from './assets/icons/gauge.svg';
import iconShieldLock from './assets/icons/shield-lock.svg';

const PRESETS_LIST = [
    { name: 'Cloudflare', ip: '1.1.1.1' },
    { name: 'Google', ip: '8.8.8.8', active: true },
    { name: 'AdGuard', ip: '94.140.14.14' },
    { name: 'Quad9', ip: '9.9.9.9' },
    { name: 'OpenDNS', ip: '208.67.222.222' },
    { name: 'Mullvad', ip: '194.242.2.2' },
    { name: 'Shecan', ip: '178.22.122.100' },
    { name: 'Electro', ip: '78.157.42.100' },
    { name: 'Radar Game', ip: '10.202.10.10' },
    { name: 'Begzar', ip: '185.55.226.26' },
];

function SvgMaskIcon({
    src,
    className = 'size-6',
    color = '#34d399',
}: {
    src: string;
    className?: string;
    color?: string;
}) {
    return (
        <span
            className={`inline-block ${className}`}
            style={{
                backgroundColor: color,
                maskImage: `url("${src}")`,
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                maskSize: 'contain',
                WebkitMaskImage: `url("${src}")`,
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                WebkitMaskSize: 'contain',
            }}
        />
    );
}

export default function LandingPage() {
    const [landingLang, setLandingLang] = useState<'en' | 'fa'>(() => {
        const stored = localStorage.getItem('dnss.lang');
        if (stored === 'en' || stored === 'fa') {
            return stored;
        }
        return 'en';
    });
    const [landingTheme, setLandingTheme] = useState<'dark' | 'light'>(() => {
        const stored = localStorage.getItem('dnss.theme');
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
        return 'dark';
    });
    const [copied, setCopied] = useState(false);

    const toggleLandingLang = () => {
        const next = landingLang === 'en' ? 'fa' : 'en';
        setLandingLang(next);
        localStorage.setItem('dnss.lang', next);
        document.documentElement.lang = next;
        document.documentElement.dir = next === 'fa' ? 'rtl' : 'ltr';
    };

    const toggleLandingTheme = () => {
        const next = landingTheme === 'dark' ? 'light' : 'dark';
        setLandingTheme(next);
        localStorage.setItem('dnss.theme', next);
        document.documentElement.setAttribute('data-landing-theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

    const handleAppThemeChange = useCallback(
        (th: 'light' | 'dark' | 'system') => {
            const resolved =
                th === 'system'
                    ? window.matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : 'light'
                    : th;
            setLandingTheme(resolved);
            localStorage.setItem('dnss.theme', resolved);
            document.documentElement.setAttribute(
                'data-landing-theme',
                resolved
            );
            document.documentElement.setAttribute('data-theme', resolved);
        },
        []
    );

    const handleAppLangChange = useCallback((l: 'en' | 'fa') => {
        setLandingLang(l);
        localStorage.setItem('dnss.lang', l);
        document.documentElement.lang = l;
        document.documentElement.dir = l === 'fa' ? 'rtl' : 'ltr';
    }, []);

    useEffect(() => {
        localStorage.setItem('dnss.lang', landingLang);
        localStorage.setItem('dnss.theme', landingTheme);
        document.documentElement.lang = landingLang;
        document.documentElement.dir = landingLang === 'fa' ? 'rtl' : 'ltr';
        document.documentElement.setAttribute(
            'data-landing-theme',
            landingTheme
        );
        document.documentElement.setAttribute('data-theme', landingTheme);
    }, [landingLang, landingTheme]);

    const handleCopyCli = () => {
        navigator.clipboard.writeText('npx @seymi/dnss-cli');
        setCopied(true);
        setTimeout(() => {
            setCopied(false);
        }, 2000);
    };

    const isFa = landingLang === 'fa';
    const isLight = landingTheme === 'light';

    return (
        <div
            className={`landing-page-root min-h-screen transition-colors duration-200 ${
                isFa ? 'font-vazirmatn' : 'font-space-grotesk'
            }`}
            style={{ backgroundColor: 'var(--lp-bg)' }}
        >
            {/* Header / Navbar */}
            <header
                className="sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-200"
                style={{
                    borderColor: 'var(--lp-border)',
                    backgroundColor: isLight
                        ? 'rgba(255, 255, 255, 0.88)'
                        : 'rgba(11, 15, 25, 0.88)',
                }}
            >
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
                    {/* Brand */}
                    <div className="flex items-center gap-3">
                        <img
                            src={appIcon}
                            alt="DNSS"
                            className="size-8 rounded-lg select-none"
                        />
                        <span
                            className="text-xl font-bold tracking-tight"
                            style={{ color: 'var(--lp-text-title)' }}
                        >
                            DNSS
                        </span>
                    </div>

                    {/* Nav Links */}
                    <nav className="hidden items-center gap-2 text-sm font-medium opacity-80 md:flex">
                        <a
                            href="#features"
                            className="rounded-full px-4 py-1.5 transition-all duration-150 hover:text-[#34d399] hover:bg-[#34d399]/10 cursor-pointer"
                        >
                            {isFa ? 'قابلیت‌ها' : 'Features'}
                        </a>
                        <a
                            href="#download"
                            className="rounded-full px-4 py-1.5 transition-all duration-150 hover:text-[#34d399] hover:bg-[#34d399]/10 cursor-pointer"
                        >
                            {isFa ? 'دانلود' : 'Download'}
                        </a>
                        <a
                            href="#cli"
                            className="rounded-full px-4 py-1.5 transition-all duration-150 hover:text-[#34d399] hover:bg-[#34d399]/10 cursor-pointer"
                        >
                            {isFa ? 'ترمینال' : 'CLI'}
                        </a>
                    </nav>

                    {/* Top Action Controls */}
                    <div className="flex items-center gap-2.5">
                        {/* Language Switcher Pill */}
                        <button
                            type="button"
                            onClick={toggleLandingLang}
                            className={`flex h-[34px] cursor-pointer items-center justify-center rounded-full border border-[var(--lp-border)] px-4 text-xs font-semibold shadow-xs transition-all duration-150 hover:border-[#059669] hover:text-[#059669] active:scale-95 ${
                                isFa ? 'font-space-grotesk' : 'font-vazirmatn'
                            }`}
                            style={{
                                backgroundColor: 'var(--lp-card)',
                                color: 'var(--lp-text-title)',
                            }}
                        >
                            {isFa ? 'English' : 'فارسی'}
                        </button>

                        {/* Theme Toggle Button */}
                        <button
                            type="button"
                            onClick={toggleLandingTheme}
                            className="flex size-[34px] h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-[var(--lp-border)] shadow-xs transition-all duration-150 hover:border-[#059669] active:scale-95"
                            style={{ backgroundColor: 'var(--lp-card)' }}
                            title="Toggle theme"
                        >
                            {landingTheme === 'dark' ? (
                                /* Moon Icon when Dark mode is active (matching the app) */
                                <svg
                                    className="size-4 text-slate-300 transition-colors"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                    />
                                </svg>
                            ) : (
                                /* Sun Icon when Light mode is active (matching the app) */
                                <svg
                                    className="size-4 transition-colors"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        cx="12"
                                        cy="12"
                                        r="4"
                                        strokeWidth="2"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeWidth="2"
                                        d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m14.14-14.14l-1.41 1.41"
                                    />
                                </svg>
                            )}
                        </button>

                        {/* GitHub Button */}
                        <a
                            href="https://github.com/Hasan-Mir/dnss"
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-[var(--lp-border)] px-4 text-xs font-semibold shadow-xs transition-all duration-150 hover:border-[#059669] hover:text-[#059669] active:scale-95"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                                color: 'var(--lp-text-title)',
                            }}
                        >
                            <SvgMaskIcon
                                src={iconGithub}
                                className="size-4"
                                color="currentColor"
                            />
                            <span>GitHub</span>
                        </a>
                    </div>
                </div>
            </header>

            {/* HERO SECTION */}
            <section className="mx-auto max-w-7xl px-6 pt-12 pb-20 lg:pt-16">
                <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
                    {/* Left Column: Ambient Aura placed directly behind text */}
                    <div className="relative text-center lg:col-span-5 lg:text-start">
                        {/* 1. Teal / Emerald Ambient Aura */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-12 z-0 h-[380px] w-[380px] rounded-full transition-opacity duration-300"
                            style={{
                                [isFa ? 'right' : 'left']: '-2rem',
                                backgroundColor: '#10b981',
                                filter: 'blur(95px)',
                                WebkitFilter: 'blur(95px)',
                                opacity: isLight ? 0.28 : 0.44,
                            }}
                        />

                        {/* 2. Royal Blue Ambient Aura */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute top-28 z-0 h-[360px] w-[360px] rounded-full transition-opacity duration-300"
                            style={{
                                [isFa ? 'right' : 'left']: '3rem',
                                backgroundColor: '#2563eb',
                                filter: 'blur(95px)',
                                WebkitFilter: 'blur(95px)',
                                opacity: isLight ? 0.22 : 0.36,
                            }}
                        />

                        {/* Text and Actions */}
                        <div className="relative z-10">
                            {/* Pill Badge */}
                            <div
                                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wider"
                                style={{
                                    backgroundColor: 'var(--lp-badge-bg)',
                                    borderColor: 'var(--lp-badge-border)',
                                    color: 'var(--lp-badge-text)',
                                }}
                            >
                                <span>
                                    {isFa
                                        ? 'رایگان و متن‌باز'
                                        : 'FREE & OPEN SOURCE'}
                                </span>
                            </div>

                            {/* Heading */}
                            <h1
                                className="mt-5 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                {isFa ? (
                                    <>
                                        <span>
                                            تغییر <bdi>DNS</bdi> شما
                                        </span>
                                        <br />
                                        <span className="text-[#34d399]">
                                            تنها با یک کلیک.
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span>Switch your DNS</span>
                                        <br />
                                        <span className="text-[#34d399]">
                                            in one click.
                                        </span>
                                    </>
                                )}
                            </h1>

                            {/* Subtitle */}
                            <p
                                className="mt-5 text-base leading-relaxed sm:text-lg"
                                style={{ color: 'var(--lp-text-body)' }}
                            >
                                {isFa
                                    ? 'برنامهٔ دسکتاپ رایگان و متن‌باز برای جابه‌جایی میان کلودفلر، گوگل، ادگارد، شکن و غیره. بدون دستورات netsh و جست‌وجو در تنظیمات.'
                                    : 'A free, open-source desktop app that switches between Cloudflare, Google, AdGuard, Shecan, and more. No netsh, no settings digging.'}
                            </p>

                            {/* Action Buttons */}
                            <div className="mt-8 flex flex-wrap justify-center gap-3.5 lg:justify-start">
                                {/* Download Button */}
                                <a
                                    href="https://github.com/Hasan-Mir/dnss/releases"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-[#34d399] px-6 py-2.5 text-sm font-bold text-[#04120c] shadow-md shadow-[#34d399]/25 transition-all duration-200 hover:bg-[#4ade80] hover:shadow-lg hover:shadow-[#34d399]/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                                >
                                    <SvgMaskIcon
                                        src={iconDownload}
                                        className="size-4"
                                        color="#04120c"
                                    />
                                    <span>
                                        {isFa ? 'دانلود مستقیم' : 'Download'}
                                    </span>
                                </a>

                                {/* View on GitHub Button: no hover border color change */}
                                <a
                                    href="https://github.com/Hasan-Mir/dnss"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-[var(--lp-border)] px-5 py-2.5 text-sm font-semibold shadow-xs transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                                    style={{
                                        backgroundColor: 'var(--lp-card)',
                                        color: 'var(--lp-text-title)',
                                    }}
                                >
                                    <SvgMaskIcon
                                        src={iconGithub}
                                        className="size-4"
                                        color="currentColor"
                                    />
                                    <span>
                                        {isFa
                                            ? 'مشاهده در گیت‌هاب'
                                            : 'View on GitHub'}
                                    </span>
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Desktop Mockup */}
                    <div className="lg:col-span-7">
                        <div
                            className="mx-auto w-full max-w-[640px] overflow-hidden rounded-2xl border border-[var(--lp-border)] shadow-2xl transition-colors duration-200"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                            }}
                        >
                            {/* Window Chrome */}
                            <div
                                dir="ltr"
                                className="flex select-none items-center justify-between border-b px-4 py-2.5 transition-colors duration-200"
                                style={{
                                    borderColor: 'var(--lp-border)',
                                    backgroundColor: 'var(--lp-card-header)',
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="size-3 rounded-full bg-[#ff5f56]" />
                                    <div className="size-3 rounded-full bg-[#ffbd2e]" />
                                    <div className="size-3 rounded-full bg-[#27c93f]" />
                                </div>
                                <div className="font-mono text-xs font-semibold opacity-60">
                                    DNSS
                                </div>
                                <div className="w-12 text-end">
                                    <span
                                        className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                                        style={{
                                            backgroundColor:
                                                'var(--lp-badge-bg)',
                                            color: 'var(--lp-badge-text)',
                                        }}
                                    >
                                        LIVE
                                    </span>
                                </div>
                            </div>

                            {/* Rectangular App Shell: Controlled without unmounting key */}
                            <div
                                id="mockup-app-container"
                                className="mockup-app-container h-[420px] w-full overflow-hidden text-start"
                            >
                                <App
                                    theme={landingTheme}
                                    onThemeChange={handleAppThemeChange}
                                    lang={landingLang}
                                    onLangChange={handleAppLangChange}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 2: Platform Downloads with Subtle Default Border & Glowing Hover */}
            <section
                id="download"
                className="border-t py-16 transition-colors duration-200"
                style={{
                    borderColor: 'var(--lp-border)',
                    backgroundColor: 'var(--lp-bg-alt)',
                }}
            >
                <div className="mx-auto max-w-7xl px-6">
                    <div>
                        <h2
                            className="text-2xl font-bold tracking-tight sm:text-3xl"
                            style={{ color: 'var(--lp-text-title)' }}
                        >
                            {isFa
                                ? 'دریافت DNSS برای سیستم‌عامل شما'
                                : 'Get DNSS for your platform'}
                        </h2>
                        <p className="mt-2 text-sm opacity-70">
                            {isFa
                                ? 'برای تمامی پلتفرم‌ها بیلد رسمی خودکار در گیت‌هاب منتشر می‌شود.'
                                : 'Every release ships installers for all three systems, built automatically on GitHub.'}
                        </p>
                    </div>

                    <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {/* Windows Card */}
                        <a
                            href="https://github.com/Hasan-Mir/dnss/releases"
                            target="_blank"
                            rel="noreferrer"
                            className="group flex cursor-pointer flex-col rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-card)] p-7 sm:p-8 shadow-xs transition-all duration-200 hover:border-[#34d399] hover:shadow-[0_0_25px_rgba(52,211,153,0.25)] hover:-translate-y-1 active:translate-y-0"
                        >
                            <div className="mb-4">
                                <SvgMaskIcon
                                    src={iconWindows}
                                    className="size-7"
                                    color="#34d399"
                                />
                            </div>
                            <span
                                className="text-base font-bold transition-colors group-hover:text-[#34d399]"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                Windows
                            </span>
                            <span
                                className="mt-1.5 text-xs opacity-70"
                                dir={isFa ? 'rtl' : 'ltr'}
                            >
                                {isFa
                                    ? 'نصب‌کننده‌های EXE و MSI'
                                    : 'EXE and MSI installers'}
                            </span>
                        </a>

                        {/* macOS Card */}
                        <a
                            href="https://github.com/Hasan-Mir/dnss/releases"
                            target="_blank"
                            rel="noreferrer"
                            className="group flex cursor-pointer flex-col rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-card)] p-7 sm:p-8 shadow-xs transition-all duration-200 hover:border-[#34d399] hover:shadow-[0_0_25px_rgba(52,211,153,0.25)] hover:-translate-y-1 active:translate-y-0"
                        >
                            <div className="mb-4">
                                <SvgMaskIcon
                                    src={iconApple}
                                    className="size-7"
                                    color="#34d399"
                                />
                            </div>
                            <span
                                className="text-base font-bold transition-colors group-hover:text-[#34d399]"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                macOS
                            </span>
                            <span
                                className="mt-1.5 text-xs opacity-70"
                                dir={isFa ? 'rtl' : 'ltr'}
                            >
                                {isFa
                                    ? 'فایل DMG برای اینتل و اپل سیلیکون'
                                    : 'DMGs for Intel and Apple Silicon'}
                            </span>
                        </a>

                        {/* Linux Card */}
                        <a
                            href="https://github.com/Hasan-Mir/dnss/releases"
                            target="_blank"
                            rel="noreferrer"
                            className="group flex cursor-pointer flex-col rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-card)] p-7 sm:p-8 shadow-xs transition-all duration-200 hover:border-[#34d399] hover:shadow-[0_0_25px_rgba(52,211,153,0.25)] hover:-translate-y-1 active:translate-y-0"
                        >
                            <div className="mb-4">
                                <SvgMaskIcon
                                    src={iconLinux}
                                    className="size-7"
                                    color="#34d399"
                                />
                            </div>
                            <span
                                className="text-base font-bold transition-colors group-hover:text-[#34d399]"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                Linux
                            </span>
                            <span
                                className="mt-1.5 text-xs opacity-70"
                                dir={isFa ? 'rtl' : 'ltr'}
                            >
                                {isFa
                                    ? 'پکیج‌های AppImage، DEB و RPM'
                                    : 'AppImage, DEB and RPM'}
                            </span>
                        </a>

                        {/* CLI Card */}
                        <a
                            href="#cli"
                            className="group flex cursor-pointer flex-col rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-card)] p-7 sm:p-8 shadow-xs transition-all duration-200 hover:border-[#34d399] hover:shadow-[0_0_25px_rgba(52,211,153,0.25)] hover:-translate-y-1 active:translate-y-0"
                        >
                            <div className="mb-4">
                                <SvgMaskIcon
                                    src={iconNpm}
                                    className="size-7"
                                    color="#34d399"
                                />
                            </div>
                            <span
                                className="text-base font-bold transition-colors group-hover:text-[#34d399]"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                CLI
                            </span>
                            <span
                                className="mt-1.5 text-xs opacity-70"
                                dir={isFa ? 'rtl' : 'ltr'}
                            >
                                {isFa ? (
                                    <span>
                                        اجرا با npx؛ نیازمند <bdi>Node 18+</bdi>
                                    </span>
                                ) : (
                                    'Runs with npx; Node 18+'
                                )}
                            </span>
                        </a>
                    </div>
                </div>
            </section>

            {/* SECTION 3: Bento Grid */}
            <section
                id="features"
                className="py-20 transition-colors duration-200"
            >
                <div className="mx-auto max-w-7xl px-6">
                    <div>
                        <h2
                            className="text-2xl font-bold tracking-tight sm:text-3xl"
                            style={{ color: 'var(--lp-text-title)' }}
                        >
                            {isFa
                                ? 'تمام آنچه از یک تغییردهندهٔ DNS انتظار دارید'
                                : 'Everything a DNS switcher needs'}
                        </h2>
                        <p className="mt-2 text-sm opacity-70">
                            {isFa
                                ? 'برنامه دسکتاپ و خط فرمان هر دو از یک هسته مشترک استفاده می‌کنند.'
                                : 'The app and the CLI share one core, so what you see here is what you get in the terminal.'}
                        </p>
                    </div>

                    <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-12">
                        {/* Bento 1: Presets */}
                        <div
                            className="rounded-2xl border border-[var(--lp-border)] p-6 shadow-xs md:col-span-8"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                            }}
                        >
                            <h3
                                className="text-lg font-bold"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                {isFa
                                    ? '۱۷ سرور آماده داخلی'
                                    : '17 presets built in'}
                            </h3>
                            <p className="mt-1 text-sm opacity-70">
                                {isFa
                                    ? 'سرورهای محبوب جهانی در کنار گزینه‌های تحریم‌شکن ایرانی مانند شکن، الکترو و رادار بازی.'
                                    : 'Pick a provider and hit apply — global resolvers alongside Iranian services like Shecan, Electro and Radar Game.'}
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                {PRESETS_LIST.map((preset) => (
                                    <div
                                        key={preset.name}
                                        style={{ lineHeight: 1 }}
                                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-mono transition-all ${
                                            preset.active
                                                ? isLight
                                                    ? 'border-[#a7f3d0] bg-[#ecfdf5] text-[#059669] font-bold'
                                                    : 'border-[#34d399]/40 bg-[#34d399]/15 text-[#34d399]'
                                                : isLight
                                                  ? 'border-[#e2e8f0] bg-[#f8fafc] text-slate-700'
                                                  : 'border-slate-800 bg-slate-900/40 text-slate-300'
                                        }`}
                                    >
                                        <span className="font-sans font-semibold">
                                            {preset.name}
                                        </span>
                                        <span className="opacity-60">
                                            {preset.ip}
                                        </span>
                                    </div>
                                ))}
                                <span
                                    className="rounded-lg border px-2.5 py-1.5 text-xs opacity-70"
                                    style={{
                                        borderColor: 'var(--lp-border)',
                                        backgroundColor: isLight
                                            ? '#f8fafc'
                                            : 'rgba(15, 23, 42, 0.4)',
                                    }}
                                >
                                    +7 more
                                </span>
                            </div>
                        </div>

                        {/* Bento 2: One click */}
                        <div
                            className="flex flex-col justify-between rounded-2xl border border-[var(--lp-border)] p-6 shadow-xs md:col-span-4"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                            }}
                        >
                            <div>
                                <div className="mb-3">
                                    <SvgMaskIcon
                                        src={iconBolt}
                                        className="size-6"
                                        color="#34d399"
                                    />
                                </div>
                                <h3
                                    className="text-lg font-bold"
                                    style={{ color: 'var(--lp-text-title)' }}
                                >
                                    {isFa
                                        ? 'تغییر وضعیت با یک کلیک'
                                        : 'One click to switch'}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed opacity-70">
                                    {isFa
                                        ? 'صفحه اصلی یک دکمهٔ پاور بزرگ است. برای بازگشت به DHCP یا بازیابی DNS قبلی کلیک کنید.'
                                        : 'The home screen is one big power button. Tap it to restore DHCP or jump back to your last DNS.'}
                                </p>
                            </div>
                        </div>

                        {/* Bento 3: Benchmark */}
                        <div
                            className="flex flex-col justify-between rounded-2xl border border-[var(--lp-border)] p-6 shadow-xs md:col-span-4"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                            }}
                        >
                            <div>
                                <div className="mb-3">
                                    <SvgMaskIcon
                                        src={iconGauge}
                                        className="size-6"
                                        color="#34d399"
                                    />
                                </div>
                                <h3
                                    className="text-lg font-bold"
                                    style={{ color: 'var(--lp-text-title)' }}
                                >
                                    {isFa
                                        ? 'بنچمارک پینگ قبل از انتخاب'
                                        : 'Benchmark before you switch'}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed opacity-70">
                                    {isFa
                                        ? 'تأخیر واقعی Resolve و Connect را برای هر سرور بسنجید و سریع‌ترین گزینه را اعمال کنید.'
                                        : 'Measure resolve and connect times for every preset and pick the fastest for your line.'}
                                </p>
                            </div>
                        </div>

                        {/* Bento 4: Fine-grained control */}
                        <div
                            className="rounded-2xl border border-[var(--lp-border)] p-6 shadow-xs md:col-span-4"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                            }}
                        >
                            <h3
                                className="text-lg font-bold"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                {isFa
                                    ? 'کنترل دقیق آداپتورها'
                                    : 'Fine-grained control'}
                            </h3>
                            <ul className="mt-4 space-y-2.5 text-sm opacity-85">
                                <li className="flex items-center gap-2">
                                    <SvgMaskIcon
                                        src={iconCheck}
                                        className="size-4 shrink-0"
                                        color="#34d399"
                                    />
                                    <span>
                                        {isFa
                                            ? 'اعمال روی یک آداپتور یا همهٔ آن‌ها'
                                            : 'Apply to one adapter or to all of them'}
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <SvgMaskIcon
                                        src={iconCheck}
                                        className="size-4 shrink-0"
                                        color="#34d399"
                                    />
                                    <span>
                                        {isFa
                                            ? 'ذخیرهٔ کانفیگ‌های سفارشی با نام دلخواه'
                                            : 'Save your own named configurations'}
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <SvgMaskIcon
                                        src={iconCheck}
                                        className="size-4 shrink-0"
                                        color="#34d399"
                                    />
                                    <span>
                                        {isFa
                                            ? 'بازنشانی آداپتورها به DHCP'
                                            : 'Reset adapters to DHCP'}
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <SvgMaskIcon
                                        src={iconCheck}
                                        className="size-4 shrink-0"
                                        color="#34d399"
                                    />
                                    <span>
                                        {isFa
                                            ? 'پاک‌سازی کش DNS سیستم‌عامل'
                                            : 'Flush the OS DNS cache'}
                                    </span>
                                </li>
                            </ul>
                        </div>

                        {/* Bento 5: Private and light */}
                        <div
                            className="rounded-2xl border border-[var(--lp-border)] p-6 shadow-xs md:col-span-4"
                            style={{
                                backgroundColor: 'var(--lp-card)',
                            }}
                        >
                            <div className="mb-3">
                                <SvgMaskIcon
                                    src={iconShieldLock}
                                    className="size-6"
                                    color="#34d399"
                                />
                            </div>
                            <h3
                                className="text-lg font-bold"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                {isFa
                                    ? 'حفظ حریم خصوصی و سبک'
                                    : 'Private and light'}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed opacity-70">
                                {isFa
                                    ? 'بدون تله‌متری، بدون حساب کاربری و با حجم حدود ۱۰ مگابایت بدون الکترون. پشتیبانی از تم تاریک و روشن و زبان فارسی.'
                                    : 'No telemetry, no analytics, no accounts. Around 10 MB with no Electron in sight. Dark and light themes, English and Persian.'}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 4: CLI Terminal */}
            <section
                id="cli"
                className="border-t py-20 transition-colors duration-200"
                style={{
                    borderColor: 'var(--lp-border)',
                    backgroundColor: 'var(--lp-bg-alt)',
                }}
            >
                <div className="mx-auto max-w-7xl px-6">
                    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
                        <div className="lg:col-span-5">
                            <h2
                                className="text-2xl font-bold tracking-tight sm:text-3xl"
                                style={{ color: 'var(--lp-text-title)' }}
                            >
                                {isFa
                                    ? 'در ترمینال هم همراه شماست'
                                    : 'Runs in your terminal too'}
                            </h2>
                            <p className="mt-3 text-sm leading-relaxed opacity-70">
                                {isFa
                                    ? 'نسخه CLI از همان تنظیمات و سرورها استفاده می‌کند. با npx مستقیماً اجرا می‌شود.'
                                    : 'The CLI shares the core with the app: same presets, same config file, same benchmark. Start it with npx, nothing to install. Requires Node 18+.'}
                            </p>
                            <div className="mt-6">
                                <a
                                    href="https://www.npmjs.com/package/@seymi/dnss-cli"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--lp-border)] px-4 py-2 text-xs font-semibold shadow-xs transition-all duration-150 hover:border-[#059669] hover:scale-105"
                                    style={{
                                        backgroundColor: 'var(--lp-card)',
                                        color: 'var(--lp-text-title)',
                                    }}
                                >
                                    📦{' '}
                                    <span>
                                        {isFa
                                            ? 'مشاهده در npm'
                                            : 'open package'}
                                    </span>
                                </a>
                            </div>
                        </div>

                        {/* Terminal Window */}
                        <div className="lg:col-span-7">
                            <div
                                className="overflow-hidden rounded-2xl border shadow-xl transition-colors duration-200"
                                style={{
                                    borderColor: 'var(--lp-border)',
                                    backgroundColor: isLight
                                        ? '#ffffff'
                                        : '#0f172a',
                                }}
                            >
                                <div
                                    dir="ltr"
                                    className="flex items-center justify-between border-b px-4 py-2.5 transition-colors duration-200"
                                    style={{
                                        borderColor: 'var(--lp-border)',
                                        backgroundColor: isLight
                                            ? '#f8fafc'
                                            : '#1e293b',
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="size-3 rounded-full bg-[#ff5f56]" />
                                        <div className="size-3 rounded-full bg-[#ffbd2e]" />
                                        <div className="size-3 rounded-full bg-[#27c93f]" />
                                    </div>
                                    <div className="font-mono text-xs text-slate-400">
                                        bash
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyCli}
                                        className="flex cursor-pointer items-center gap-1.5 text-xs text-[#34d399] transition-opacity hover:opacity-80"
                                    >
                                        <SvgMaskIcon
                                            src={copied ? iconCheck : iconCopy}
                                            className="size-3.5"
                                            color="#34d399"
                                        />
                                        <span>
                                            {copied
                                                ? isFa
                                                    ? 'کپی شد!'
                                                    : 'Copied!'
                                                : isFa
                                                  ? 'کپی'
                                                  : 'Copy'}
                                        </span>
                                    </button>
                                </div>
                                <pre
                                    dir="ltr"
                                    className="overflow-x-auto p-5 font-mono text-xs leading-relaxed"
                                    style={{
                                        color: isLight ? '#334155' : '#cbd5e1',
                                    }}
                                >
                                    <code>
                                        <span className="text-[#34d399] font-bold">
                                            $
                                        </span>{' '}
                                        <span
                                            className={
                                                isLight
                                                    ? 'text-slate-900 font-semibold'
                                                    : 'text-white'
                                            }
                                        >
                                            npx @seymi/dnss-cli
                                        </span>
                                        {'\n'}
                                        <span className="text-slate-400">
                                            ? What would you like to do?
                                        </span>
                                        {'\n'}
                                        <span className="text-[#34d399] font-semibold">
                                            ❯ Change DNS settings
                                        </span>
                                        {'\n'}
                                        {'  '}Benchmark DNS servers{'\n'}
                                        {'  '}Show currently used DNS configs
                                        {'\n'}
                                        {'\n'}
                                        {'  '}Reset all adapters to DHCP{'\n'}
                                        {'  '}Exit
                                    </code>
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer - Statically English & LTR */}
            <footer
                dir="ltr"
                className="border-t py-10 text-xs opacity-70 transition-colors duration-200"
                style={{ borderColor: 'var(--lp-border)' }}
            >
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6">
                    <div className="flex items-center gap-2">
                        <img
                            src={appIcon}
                            alt="DNSS"
                            className="size-5 rounded"
                        />
                        <span>
                            DNSS — A free, open-source DNS changer for Windows,
                            macOS and Linux. MIT License.
                        </span>
                    </div>
                    <div className="flex gap-4">
                        <a
                            href="https://github.com/Hasan-Mir/dnss"
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                        >
                            GitHub
                        </a>
                        <a
                            href="https://github.com/Hasan-Mir/dnss/releases"
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                        >
                            Releases
                        </a>
                        <a
                            href="https://www.npmjs.com/package/@seymi/dnss-cli"
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                        >
                            npm
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
