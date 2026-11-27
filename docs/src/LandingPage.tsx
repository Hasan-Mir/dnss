import React, { useEffect, useRef, useState } from 'react';
import appIcon from './assets/images/icon-128.png';
import { COPY, type LandingLang } from './copy';
import { DemoStage } from './DemoStage';

const RELEASES_URL = 'https://github.com/Hasan-Mir/dnss/releases/latest';
const REPO_URL = 'https://github.com/Hasan-Mir/dnss';
const NPM_CMD = 'npm install -g @seymi/dnss-cli';
const NAV_SECTIONS = ['demo', 'features', 'cli', 'download'] as const;

const SAMPLE_SETTINGS_JSON = `{
  "dnss.schemaVersion": 1,
  "appearance.theme": "dark",
  "appearance.accent": "#10b981",
  "benchmark.target": "https://www.cloudflare.com",
  "dns.servers": [
    {
      "id": "office-dns",
      "name": "Office DNS",
      "primary": "1.1.1.1",
      "alternative": "1.0.0.1"
    }
  ]
}`;

function renderHeroTitle(title: string, highlight: string) {
    const idx = title.indexOf(highlight);
    if (idx < 0) return title;
    return (
        <>
            {title.slice(0, idx)}
            <span className="lp-grad-word" dir="ltr">
                {highlight}
            </span>
            {title.slice(idx + highlight.length)}
        </>
    );
}

export default function LandingPage() {
    const [lang, setLang] = useState<LandingLang>(() => {
        try {
            return localStorage.getItem('dnss_lp_lang') === 'fa' ? 'fa' : 'en';
        } catch {
            return 'en';
        }
    });
    const [activeSection, setActiveSection] = useState<string>('demo');
    const [cliTab, setCliTab] = useState('switch');
    const [serviceMode, setServiceMode] = useState<'pipe' | 'direct'>('pipe');
    const [copiedInstall, setCopiedInstall] = useState(false);
    const [copiedCli, setCopiedCli] = useState(false);
    const [copiedDlCli, setCopiedDlCli] = useState(false);
    const copyTimersRef = useRef<
        Record<'install' | 'cli' | 'dl-cli', number | null>
    >({
        install: null,
        cli: null,
        'dl-cli': null,
    });

    useEffect(() => {
        return () => {
            for (const key of ['install', 'cli', 'dl-cli'] as const) {
                const id = copyTimersRef.current[key];
                if (id !== null) {
                    window.clearTimeout(id);
                    copyTimersRef.current[key] = null;
                }
            }
        };
    }, []);

    useEffect(() => {
        const updateActive = () => {
            const atBottom =
                window.innerHeight + window.scrollY >=
                document.documentElement.scrollHeight - 4;
            if (atBottom) {
                setActiveSection(NAV_SECTIONS[NAV_SECTIONS.length - 1]);
                return;
            }
            const probe = window.scrollY + 180;
            let current: string = 'demo';
            for (const id of NAV_SECTIONS) {
                const el = document.getElementById(id);
                if (!el) continue;
                const top = el.getBoundingClientRect().top + window.scrollY;
                if (top <= probe) {
                    current = id;
                }
            }
            setActiveSection(current);
        };
        updateActive();
        window.addEventListener('scroll', updateActive, { passive: true });
        window.addEventListener('resize', updateActive, { passive: true });
        return () => {
            window.removeEventListener('scroll', updateActive);
            window.removeEventListener('resize', updateActive);
        };
    }, []);

    const copy = COPY[lang];
    const dir = lang === 'fa' ? 'rtl' : 'ltr';

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const toggleLang = () => {
        const next: LandingLang = lang === 'en' ? 'fa' : 'en';
        setLang(next);
        try {
            localStorage.setItem('dnss_lp_lang', next);
        } catch {
            // ignore
        }
    };

    const copyToClipboard = async (
        text: string,
        which: 'install' | 'cli' | 'dl-cli'
    ) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            return;
        }
        const prev = copyTimersRef.current[which];
        if (prev !== null) {
            window.clearTimeout(prev);
        }
        const setFlag =
            which === 'install'
                ? setCopiedInstall
                : which === 'dl-cli'
                  ? setCopiedDlCli
                  : setCopiedCli;
        setFlag(true);
        copyTimersRef.current[which] = window.setTimeout(() => {
            copyTimersRef.current[which] = null;
            setFlag(false);
        }, 1600);
    };

    const activeCli =
        copy.cli.tabs.find((t) => t.id === cliTab) ?? copy.cli.tabs[0];

    return (
        <div className="lp-page" dir={dir} data-lp-lang={lang}>
            {/* ───────── Sticky Workbench Navbar ───────── */}
            <header className="lp-nav-wrap">
                <div className="lp-container lp-nav">
                    <a href="#top" className="lp-brand">
                        <img src={appIcon} alt="DNSS" />
                        <span>DNSS</span>
                        <span className="lp-ver">v1.0.0</span>
                    </a>

                    <nav className="lp-nav-links" aria-label="Main navigation">
                        <a
                            href="#demo"
                            className={activeSection === 'demo' ? 'active' : ''}
                        >
                            {copy.nav.demo}
                        </a>
                        <a
                            href="#features"
                            className={
                                activeSection === 'features' ? 'active' : ''
                            }
                        >
                            {copy.nav.features}
                        </a>
                        <a
                            href="#cli"
                            className={activeSection === 'cli' ? 'active' : ''}
                        >
                            {copy.nav.cli}
                        </a>
                        <a
                            href="#download"
                            className={
                                activeSection === 'download' ? 'active' : ''
                            }
                        >
                            {copy.nav.download}
                        </a>
                    </nav>

                    <div className="lp-nav-actions">
                        <button
                            type="button"
                            className="lp-ghost-btn"
                            onClick={toggleLang}
                        >
                            {copy.nav.langToggle}
                        </button>
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="lp-ghost-btn lp-gh-btn"
                            aria-label="GitHub"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                            >
                                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.26 5.67.42.36.79 1.06.79 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.79.55A11.51 11.51 0 0023.5 12C23.5 5.65 18.35.5 12 .5z" />
                            </svg>
                            <span>GitHub</span>
                        </a>
                        <a
                            href={RELEASES_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="lp-primary-btn small"
                        >
                            {copy.nav.download}
                        </a>
                    </div>
                </div>
            </header>

            <main id="top">
                {/* ───────── Hero + Live Synced Interactive App Demo ───────── */}
                <section className="lp-hero">
                    <div className="lp-container lp-hero-grid">
                        <div className="lp-hero-copy">
                            <div className="lp-hero-pill">
                                <span
                                    className="lp-pill-dot"
                                    aria-hidden="true"
                                />
                                <span>{copy.hero.badge}</span>
                            </div>

                            <h1>
                                {renderHeroTitle(
                                    copy.hero.title,
                                    copy.hero.highlight
                                )}
                            </h1>
                            <p className="lp-hero-sub">{copy.hero.subtitle}</p>

                            <div className="lp-hero-ctas">
                                <a
                                    href={RELEASES_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="lp-primary-btn"
                                >
                                    {copy.hero.ctaPrimary}
                                </a>
                                <a
                                    href="#features"
                                    className="lp-secondary-btn"
                                >
                                    {copy.hero.ctaSecondary}
                                </a>
                            </div>

                            <div className="lp-install-strip">
                                <span className="lp-install-label">
                                    {copy.hero.installHint}
                                </span>
                                <div className="lp-install-box" dir="ltr">
                                    <code>{NPM_CMD}</code>
                                    <button
                                        type="button"
                                        className="lp-copy-mini"
                                        onClick={() =>
                                            void copyToClipboard(
                                                NPM_CMD,
                                                'install'
                                            )
                                        }
                                    >
                                        {copiedInstall
                                            ? copy.cli.copied
                                            : copy.cli.copyCmd}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="lp-hero-demo-col">
                            <DemoStage copy={copy.demo} />
                        </div>
                    </div>
                </section>

                {/* ───────── Feature Architecture Bento ───────── */}
                <section className="lp-section" id="features">
                    <div className="lp-container">
                        <div className="lp-section-head">
                            <h2>{copy.features.title}</h2>
                            <p>{copy.features.subtitle}</p>
                        </div>

                        <div className="lp-bento">
                            {/* Card 1: UAC-Free Service & Per-Adapter Control */}
                            <article className="lp-bento-card span-2">
                                <div className="lp-bento-top">
                                    <h3>{copy.features.service.title}</h3>
                                    <button
                                        type="button"
                                        className={`lp-bento-toggle${
                                            serviceMode === 'pipe' ? ' on' : ''
                                        }`}
                                        onClick={() =>
                                            setServiceMode((m) =>
                                                m === 'pipe' ? 'direct' : 'pipe'
                                            )
                                        }
                                    >
                                        {serviceMode === 'pipe'
                                            ? copy.features.service.badgePipe
                                            : copy.features.service.badgeDirect}
                                    </button>
                                </div>
                                <p>{copy.features.service.desc}</p>
                                <div className="lp-arch-list">
                                    {(serviceMode === 'pipe'
                                        ? copy.features.service.pipeLines
                                        : copy.features.service.directLines
                                    ).map((row) => (
                                        <div
                                            key={row.step}
                                            className="lp-arch-row"
                                        >
                                            <span className="lp-sm-badge">
                                                {row.step}
                                            </span>
                                            <span className="lp-arch-detail">
                                                {row.detail}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </article>

                            {/* Card 2: Built-in Presets & Latency Benchmark */}
                            <article className="lp-bento-card">
                                <h3>{copy.features.presets.title}</h3>
                                <p>{copy.features.presets.desc}</p>
                                <div className="lp-search-modes">
                                    {copy.features.presets.items.map((item) => (
                                        <div
                                            key={item.name}
                                            className="lp-sm-row"
                                            dir="ltr"
                                        >
                                            <span className="lp-sm-name-strong">
                                                {item.name}
                                            </span>
                                            <code className="lp-sm-sample">
                                                {item.ip}
                                            </code>
                                            <span className="lp-sm-badge">
                                                {item.ms}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </article>

                            {/* Card 3: Unified VS Code-Style settings.json */}
                            <article className="lp-bento-card">
                                <div className="lp-bento-top">
                                    <h3>{copy.features.settingsSync.title}</h3>
                                    <span className="lp-dl-badge accent">
                                        {copy.features.settingsSync.badge}
                                    </span>
                                </div>
                                <p>{copy.features.settingsSync.desc}</p>
                                <div className="lp-rich-compare" dir="ltr">
                                    <pre className="lp-code-rich">
                                        {SAMPLE_SETTINGS_JSON}
                                    </pre>
                                </div>
                            </article>

                            {/* Card 4: Rust + Tauri v2 + Privacy */}
                            <article className="lp-bento-card span-2">
                                <h3>{copy.features.safety.title}</h3>
                                <p>{copy.features.safety.desc}</p>
                                <div className="lp-safety-grid">
                                    {copy.features.safety.items.map((item) => (
                                        <div
                                            key={item.label}
                                            className="lp-safety-item"
                                        >
                                            <strong>{item.label}</strong>
                                            <span>{item.detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        </div>
                    </div>
                </section>

                {/* ───────── CLI Showcase ───────── */}
                <section className="lp-section" id="cli">
                    <div className="lp-container">
                        <div className="lp-section-head">
                            <h2>{copy.cli.title}</h2>
                            <p>{copy.cli.subtitle}</p>
                        </div>

                        <div className="lp-cli-shell" dir="ltr">
                            <div className="lp-cli-head">
                                <div className="lp-cli-tabs" role="tablist">
                                    {copy.cli.tabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={cliTab === tab.id}
                                            className={`lp-cli-tab${
                                                cliTab === tab.id
                                                    ? ' active'
                                                    : ''
                                            }`}
                                            onClick={() => setCliTab(tab.id)}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="lp-copy-mini"
                                    onClick={() =>
                                        void copyToClipboard(
                                            activeCli.lines
                                                .map((l) => l.cmd)
                                                .join('\n'),
                                            'cli'
                                        )
                                    }
                                >
                                    {copiedCli
                                        ? copy.cli.copied
                                        : copy.cli.copyCmd}
                                </button>
                            </div>

                            <div className="lp-cli-body">
                                {activeCli.lines.map((line, i) => (
                                    <div key={i} className="lp-cli-block">
                                        <div className="lp-cli-cmd">
                                            <span className="lp-cli-prompt">
                                                $
                                            </span>
                                            <code>{line.cmd}</code>
                                        </div>
                                        {line.out && (
                                            <div className="lp-cli-out">
                                                {line.out}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ───────── Download ───────── */}
                <section
                    className="lp-section lp-download-section"
                    id="download"
                >
                    <div className="lp-container">
                        <div className="lp-section-head">
                            <h2>{copy.download.title}</h2>
                            <p>{copy.download.subtitle}</p>
                        </div>

                        <div className="lp-dl-grid">
                            <div className="lp-dl-card featured">
                                <div className="lp-dl-head">
                                    <h3>{copy.download.windows.title}</h3>
                                    <span className="lp-dl-badge accent">
                                        {copy.download.windows.badge}
                                    </span>
                                </div>
                                <p>{copy.download.windows.desc}</p>
                                <a
                                    href={RELEASES_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="lp-primary-btn"
                                >
                                    {copy.download.windows.btn}
                                </a>
                            </div>

                            <div className="lp-dl-card">
                                <div className="lp-dl-head">
                                    <h3>{copy.download.unix.title}</h3>
                                    <span className="lp-dl-badge">
                                        {copy.download.unix.badge}
                                    </span>
                                </div>
                                <p>{copy.download.unix.desc}</p>
                                <a
                                    href={RELEASES_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="lp-secondary-btn"
                                >
                                    {copy.download.unix.btn}
                                </a>
                            </div>

                            <div className="lp-dl-card">
                                <div className="lp-dl-head">
                                    <h3>{copy.download.cliPkg.title}</h3>
                                    <span className="lp-dl-badge">
                                        {copy.download.cliPkg.badge}
                                    </span>
                                </div>
                                <p>{copy.download.cliPkg.desc}</p>
                                <div className="lp-install-box" dir="ltr">
                                    <code>{copy.download.cliPkg.cmd}</code>
                                    <button
                                        type="button"
                                        className="lp-copy-mini"
                                        onClick={() =>
                                            void copyToClipboard(
                                                copy.download.cliPkg.cmd,
                                                'dl-cli'
                                            )
                                        }
                                    >
                                        {copiedDlCli
                                            ? copy.cli.copied
                                            : copy.cli.copyCmd}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="lp-footer">
                <div className="lp-container lp-footer-inner">
                    <div className="lp-footer-brand">
                        <img src={appIcon} alt="" />
                        <span>DNSS</span>
                    </div>
                    <p>{copy.download.credits}</p>
                    <div className="lp-footer-links">
                        <a href={REPO_URL} target="_blank" rel="noreferrer">
                            GitHub
                        </a>
                        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                            Releases
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
