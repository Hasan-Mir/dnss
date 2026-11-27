export type LandingLang = 'en' | 'fa';

export interface CopyDict {
    nav: {
        demo: string;
        features: string;
        cli: string;
        download: string;
        langToggle: string;
    };
    hero: {
        badge: string;
        title: string;
        highlight: string;
        subtitle: string;
        ctaPrimary: string;
        ctaSecondary: string;
        installHint: string;
    };
    demo: {
        workbenchLabel: string;
        themeLabel: string;
        themes: { dark: string; light: string };
        accentLabel: string;
        demoLangLabel: string;
        reset: string;
        hint: string;
    };
    features: {
        title: string;
        subtitle: string;
        service: {
            title: string;
            desc: string;
            badgePipe: string;
            badgeDirect: string;
            pipeLines: { step: string; detail: string }[];
            directLines: { step: string; detail: string }[];
        };
        presets: {
            title: string;
            desc: string;
            items: { name: string; ip: string; ms: string }[];
        };
        settingsSync: {
            title: string;
            desc: string;
            badge: string;
        };
        safety: {
            title: string;
            desc: string;
            items: { label: string; detail: string }[];
        };
    };
    cli: {
        title: string;
        subtitle: string;
        copyCmd: string;
        copied: string;
        tabs: {
            id: string;
            label: string;
            lines: { cmd: string; out?: string }[];
        }[];
    };
    download: {
        title: string;
        subtitle: string;
        windows: {
            title: string;
            badge: string;
            desc: string;
            btn: string;
        };
        unix: {
            title: string;
            badge: string;
            desc: string;
            btn: string;
        };
        cliPkg: {
            title: string;
            badge: string;
            desc: string;
            cmd: string;
        };
        credits: string;
    };
}

export const COPY: Record<LandingLang, CopyDict> = {
    en: {
        nav: {
            demo: 'Live Demo',
            features: 'Features',
            cli: 'CLI',
            download: 'Download',
            langToggle: 'فارسی',
        },
        hero: {
            badge: 'Windows · macOS · Linux · Free & Open Source',
            title: 'Switch your DNS in one click.',
            highlight: 'DNS',
            subtitle:
                'A calm, native Rust + Tauri v2 desktop app and CLI to switch between Cloudflare, Google, AdGuard, Shecan, or custom resolvers — zero UAC prompts, real-time benchmarking, and unified settings.json sync.',
            ctaPrimary: 'Download for Windows',
            ctaSecondary: 'Explore Features',
            installHint: 'Or run instantly via npm CLI:',
        },
        demo: {
            workbenchLabel: 'Live Interactive Demo',
            themeLabel: 'Demo theme',
            themes: { dark: 'Dark', light: 'Light' },
            accentLabel: 'Accent color',
            demoLangLabel: 'Switch demo UI language',
            reset: 'Reset demo state',
            hint: 'Try toggling DNS, opening the Servers dropdown, adding a custom server, or editing settings.json in Settings — all dialogs stay inside this frame.',
        },
        features: {
            title: 'Built for speed, clarity, and zero friction',
            subtitle:
                'Native OS network integration paired with a quiet, tactile desktop interface and a shared CLI engine.',
            service: {
                title: 'UAC-Free Windows Service & Per-Adapter Control',
                desc: 'Install once and switch DNS on any single adapter or all adapters simultaneously without repeated UAC dialogs.',
                badgePipe: 'DnssService (Pipe)',
                badgeDirect: 'Per-Adapter Mode',
                pipeLines: [
                    {
                        step: '1. GUI / CLI (asInvoker)',
                        detail: 'Sends typed JSON over \\\\.\\pipe\\dnss-service (SDDL restricted)',
                    },
                    {
                        step: '2. DnssService (LocalSystem)',
                        detail: 'Validates IPv4s & adapter names, applies via Set-DnsClientServerAddress',
                    },
                    {
                        step: '3. Instant Sync',
                        detail: 'Main window, System Tray popover, and CLI stay synchronized',
                    },
                ],
                directLines: [
                    {
                        step: 'Wi-Fi (default)',
                        detail: 'Static · 1.1.1.1 · 1.0.0.1 (Cloudflare)',
                    },
                    {
                        step: 'Ethernet',
                        detail: 'DHCP · 192.168.1.1 (Automatic)',
                    },
                    {
                        step: 'vEthernet (WSL)',
                        detail: 'Select individually or target all adapters in one click',
                    },
                ],
            },
            presets: {
                title: '17+ Presets & Live Benchmark',
                desc: 'Measure real UDP resolve + TCP connect latency and rank resolvers smoothly in place.',
                items: [
                    { name: 'Cloudflare', ip: '1.1.1.1', ms: '18 ms' },
                    { name: 'Google', ip: '8.8.8.8', ms: '24 ms' },
                    { name: 'AdGuard', ip: '94.140.14.14', ms: '31 ms' },
                    { name: 'Shecan', ip: '178.22.122.100', ms: '42 ms' },
                    { name: 'Electro', ip: '78.157.42.100', ms: '47 ms' },
                ],
            },
            settingsSync: {
                title: 'VS Code-Style settings.json',
                desc: 'Export, import, or edit one unified ~/.dnss/settings.json file — every preference and custom DNS server stays synced between GUI and CLI.',
                badge: 'GUI ↔ CLI Synced',
            },
            safety: {
                title: 'Rust + Tauri v2 + Privacy First',
                desc: 'Engineered with strict input validation, atomic config writes, and zero background telemetry.',
                items: [
                    {
                        label: '100% Offline',
                        detail: 'Zero analytics, zero tracking — only the DNS benchmarks you trigger.',
                    },
                    {
                        label: 'System Tray Popover',
                        detail: 'Frameless quick-switcher anchored to your taskbar with pin & search.',
                    },
                    {
                        label: 'Atomic Config Store',
                        detail: 'Exclusive temp-file writes with .bak recovery and symlink protection.',
                    },
                    {
                        label: 'MIT Open Source',
                        detail: 'Auditable Rust backend, TypeScript core, and reproducible releases.',
                    },
                ],
            },
        },
        cli: {
            title: 'Full-featured CLI, synced with the desktop app',
            subtitle:
                'Manage custom servers, benchmark resolvers, and import/export settings.json straight from your terminal.',
            copyCmd: 'Copy',
            copied: 'Copied',
            tabs: [
                {
                    id: 'switch',
                    label: 'Quick Switch',
                    lines: [
                        {
                            cmd: 'npx @seymi/dnss-cli',
                            out: '✔ Connected to DnssService (UAC-free mode)',
                        },
                        {
                            cmd: '# Select "Change DNS settings" → Wi-Fi → Cloudflare (1.1.1.1)',
                            out: '✔ DNS settings updated successfully.',
                        },
                    ],
                },
                {
                    id: 'benchmark',
                    label: 'Benchmark',
                    lines: [
                        {
                            cmd: '# Select "Benchmark DNS servers" (uses benchmark.target from settings.json)',
                            out: 'Cloudflare (1.1.1.1)  18 ms  ok\nGoogle     (8.8.8.8)  24 ms  ok\nAdGuard    (94.140.14.14) 31 ms ok',
                        },
                    ],
                },
                {
                    id: 'settings',
                    label: 'settings.json',
                    lines: [
                        {
                            cmd: '# Select "Import / Export settings (settings.json)"',
                            out: 'Unified settings file: ~/.dnss/settings.json\n✔ Exported settings.json to ./dnss-settings.json',
                        },
                        {
                            cmd: '# Import on another machine (syncs custom servers + preferences)',
                            out: '✔ Imported settings.json (3 custom server(s), theme: dark, language: en).',
                        },
                    ],
                },
                {
                    id: 'install',
                    label: 'Install',
                    lines: [
                        {
                            cmd: 'npm install -g @seymi/dnss-cli',
                            out: 'added 1 package — run `dnss` from any terminal',
                        },
                    ],
                },
            ],
        },
        download: {
            title: 'Get DNSS',
            subtitle:
                'Choose the native desktop installer or run the lightweight CLI anywhere Node.js is installed.',
            windows: {
                title: 'Windows Installer',
                badge: 'Recommended · .exe',
                desc: 'Installs DNSS desktop app, System Tray popover, and DnssService once for UAC-free DNS switching.',
                btn: 'Download Windows .exe',
            },
            unix: {
                title: 'macOS & Linux',
                badge: 'GitHub Releases',
                desc: 'Native Tauri desktop bundles for macOS (networksetup) and Linux (NetworkManager / nmcli).',
                btn: 'Browse Releases',
            },
            cliPkg: {
                title: 'CLI Package',
                badge: 'npm · Node 18+',
                desc: 'Interactive terminal UI sharing ~/.dnss/settings.json and DnssService with the desktop app.',
                cmd: 'npm install -g @seymi/dnss-cli',
            },
            credits: 'MIT Licensed · Built with Rust, Tauri v2, and React.',
        },
    },
    fa: {
        nav: {
            demo: 'دموی زنده',
            features: 'قابلیت‌ها',
            cli: 'ترمینال',
            download: 'دانلود',
            langToggle: 'English',
        },
        hero: {
            badge: 'ویندوز · مک · لینوکس · رایگان و متن‌باز',
            title: 'تغییر DNS شما تنها با یک کلیک.',
            highlight: 'DNS',
            subtitle:
                'برنامهٔ دسکتاپ سریع با Rust و Tauri v2 همراه با CLI یکپارچه برای جابه‌جایی بین کلودفلر، گوگل، ادگارد، شکن و سرورهای سفارشی — بدون پنجرهٔ تکراری UAC، با بنچمارک واقعی و همگام‌سازی settings.json.',
            ctaPrimary: 'دانلود برای ویندوز',
            ctaSecondary: 'مشاهدهٔ قابلیت‌ها',
            installHint: 'یا اجرای مستقیم از طریق CLI:',
        },
        demo: {
            workbenchLabel: 'دموی تعاملی زنده',
            themeLabel: 'تم دمو',
            themes: { dark: 'تاریک', light: 'روشن' },
            accentLabel: 'رنگ اصلی',
            demoLangLabel: 'تغییر زبان رابط دمو',
            reset: 'بازنشانی دمو',
            hint: 'تغییر DNS، منوی انتخاب آداپتورها، افزودن سرور سفارشی یا ویرایش settings.json در تنظیمات را امتحان کنید — تمام مودال‌ها درون همین کادر باز می‌شوند.',
        },
        features: {
            title: 'ساخته‌شده برای سرعت، شفافیت و سادگی',
            subtitle:
                'یکپارچگی بومی با شبکهٔ سیستم‌عامل در کنار رابط کاربری آرام و موتور مشترک با CLI.',
            service: {
                title: 'سرویس ویندوز بدون UAC و کنترل تک‌آداپتوری',
                desc: 'فقط یک‌بار نصب کنید و بدون پنجره‌های تکراری دسترسی ادمین، DNS را روی یک آداپتور یا همهٔ آداپتورها تغییر دهید.',
                badgePipe: 'DnssService (Pipe)',
                badgeDirect: 'حالت تک‌آداپتوری',
                pipeLines: [
                    {
                        step: '۱. رابط کاربری / CLI',
                        detail: 'ارسال درخواست JSON تایپ‌شده از طریق \\\\.\\pipe\\dnss-service با محدودیت SDDL',
                    },
                    {
                        step: '۲. سرویس DnssService',
                        detail: 'اعتبارسنجی IPv4 و نام آداپتور و اعمال امن با Set-DnsClientServerAddress',
                    },
                    {
                        step: '۳. همگام‌سازی آنی',
                        detail: 'پنجرهٔ اصلی، پنل سینی سیستم و CLI هم‌زمان به‌روز می‌شوند',
                    },
                ],
                directLines: [
                    {
                        step: 'Wi-Fi (پیش‌فرض)',
                        detail: 'ثابت · 1.1.1.1 · 1.0.0.1 (Cloudflare)',
                    },
                    {
                        step: 'Ethernet',
                        detail: 'DHCP · 192.168.1.1 (خودکار)',
                    },
                    {
                        step: 'vEthernet (WSL)',
                        detail: 'انتخاب جداگانهٔ هر آداپتور یا اعمال روی همه با یک کلیک',
                    },
                ],
            },
            presets: {
                title: 'بیش از ۱۷ سرور آماده و بنچمارک زنده',
                desc: 'سنجش واقعی زمان Resolve و اتصال TCP و مرتب‌سازی نرم سرورها بر اساس کمترین تأخیر.',
                items: [
                    { name: 'Cloudflare', ip: '1.1.1.1', ms: '18 ms' },
                    { name: 'Google', ip: '8.8.8.8', ms: '24 ms' },
                    { name: 'AdGuard', ip: '94.140.14.14', ms: '31 ms' },
                    { name: 'Shecan', ip: '178.22.122.100', ms: '42 ms' },
                    { name: 'Electro', ip: '78.157.42.100', ms: '47 ms' },
                ],
            },
            settingsSync: {
                title: 'فایل یکپارچهٔ settings.json',
                desc: 'خروجی، ورودی و ویرایش مستقیم ~/.dnss/settings.json مشابه VS Code — تنظیمات و DNSهای سفارشی بین GUI و CLI کاملاً یکسان می‌مانند.',
                badge: 'همگام بین GUI و CLI',
            },
            safety: {
                title: 'Rust + Tauri v2 + اولویت حریم خصوصی',
                desc: 'طراحی‌شده با اعتبارسنجی سخت‌گیرانه، ذخیره‌سازی اتمیک تنظیمات و صفر تله‌متری.',
                items: [
                    {
                        label: 'کاملاً آفلاین',
                        detail: 'بدون ردیابی و آنالیتیکس — تنها درخواست شبکه‌ای بنچمارک‌هایی است که خودتان اجرا می‌کنید.',
                    },
                    {
                        label: 'پنل سینی سیستم',
                        detail: 'پاپ‌اوور سریع کنار ساعت ویندوز با جست‌وجو، بنچمارک و سنجاق پنجره.',
                    },
                    {
                        label: 'ذخیره‌سازی اتمیک',
                        detail: 'نوشتن امن با فایل موقت اختصاصی، نسخهٔ پشتیبان .bak و محافظت در برابر Symlink.',
                    },
                    {
                        label: 'متن‌باز با مجوز MIT',
                        detail: 'بک‌اند قابل ممیزی با Rust، هستهٔ TypeScript و انتشار شفاف روی گیت‌هاب.',
                    },
                ],
            },
        },
        cli: {
            title: 'ابزار ترمینال کامل، همگام با نسخهٔ دسکتاپ',
            subtitle:
                'مدیریت سرورهای سفارشی، بنچمارک و انتقال settings.json مستقیم از خط فرمان.',
            copyCmd: 'کپی',
            copied: 'کپی شد',
            tabs: [
                {
                    id: 'switch',
                    label: 'تغییر سریع',
                    lines: [
                        {
                            cmd: 'npx @seymi/dnss-cli',
                            out: '✔ Connected to DnssService (UAC-free mode)',
                        },
                        {
                            cmd: '# Select "Change DNS settings" → Wi-Fi → Cloudflare (1.1.1.1)',
                            out: '✔ DNS settings updated successfully.',
                        },
                    ],
                },
                {
                    id: 'benchmark',
                    label: 'بنچمارک',
                    lines: [
                        {
                            cmd: '# Select "Benchmark DNS servers" (uses benchmark.target from settings.json)',
                            out: 'Cloudflare (1.1.1.1)  18 ms  ok\nGoogle     (8.8.8.8)  24 ms  ok\nAdGuard    (94.140.14.14) 31 ms ok',
                        },
                    ],
                },
                {
                    id: 'settings',
                    label: 'settings.json',
                    lines: [
                        {
                            cmd: '# Select "Import / Export settings (settings.json)"',
                            out: 'Unified settings file: ~/.dnss/settings.json\n✔ Exported settings.json to ./dnss-settings.json',
                        },
                        {
                            cmd: '# Import on another machine (syncs custom servers + preferences)',
                            out: '✔ Imported settings.json (3 custom server(s), theme: dark, language: en).',
                        },
                    ],
                },
                {
                    id: 'install',
                    label: 'نصب',
                    lines: [
                        {
                            cmd: 'npm install -g @seymi/dnss-cli',
                            out: 'added 1 package — run `dnss` from any terminal',
                        },
                    ],
                },
            ],
        },
        download: {
            title: 'دریافت DNSS',
            subtitle:
                'نصاب دسکتاپ بومی را دانلود کنید یا CLI سبک را روی هر سیستمی با Node.js اجرا کنید.',
            windows: {
                title: 'نصاب ویندوز',
                badge: 'پیشنهادی · .exe',
                desc: 'نصب نسخهٔ دسکتاپ، پنل سینی سیستم و سرویس DnssService برای تغییر DNS بدون پنجرهٔ UAC.',
                btn: 'دانلود نسخهٔ ویندوز (.exe)',
            },
            unix: {
                title: 'مک و لینوکس',
                badge: 'انتشارهای گیت‌هاب',
                desc: 'بسته‌های بومی دسکتاپ برای macOS (networksetup) و Linux (NetworkManager / nmcli).',
                btn: 'مشاهدهٔ نسخه‌ها',
            },
            cliPkg: {
                title: 'پکیج CLI',
                badge: 'npm · Node 18+',
                desc: 'رابط ترمینال تعاملی با فایل مشترک ~/.dnss/settings.json و اتصال به DnssService.',
                cmd: 'npm install -g @seymi/dnss-cli',
            },
            credits:
                'منتشرشده با مجوز MIT · ساخته‌شده با Rust، Tauri v2 و React.',
        },
    },
};
