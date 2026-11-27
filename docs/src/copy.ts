export type LandingLang = 'en' | 'fa';

export type ChalkTone =
    | 'plain'
    | 'blueBold'
    | 'blueBright'
    | 'cyan'
    | 'cyanBold'
    | 'green'
    | 'greenBright'
    | 'yellow'
    | 'gray'
    | 'bold';

export interface ChalkSpan {
    text: string;
    tone?: ChalkTone;
}

export interface CliLine {
    cmd?: string;
    spans?: ChalkSpan[];
}

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
        crossPlatform: {
            title: string;
            desc: string;
            badge: string;
            platforms: {
                id: 'windows' | 'mac' | 'linux';
                name: string;
                detail: string;
            }[];
        };
        quickSwitch: {
            title: string;
            desc: string;
            items: { label: string; detail: string }[];
        };
        presets: {
            title: string;
            desc: string;
            badge: string;
            items: { name: string; ip: string; ms: string }[];
        };
        backupPrivacy: {
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
        adminTipTitle: string;
        adminTipBody: string;
        tabs: {
            id: string;
            label: string;
            copyText: string;
            lines: CliLine[];
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

const ASCII_BANNER = `  ██████╗ ███╗   ██╗███████╗███████╗
  ██╔══██╗████╗  ██║██╔════╝██╔════╝
  ██║  ██║██╔██╗ ██║███████╗███████╗
  ██║  ██║██║╚██╗██║╚════██║╚════██║
  ██████╔╝██║ ╚████║███████║███████║
  ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚══════╝`;

const CLI_TABS_SHARED: CopyDict['cli']['tabs'] = [
    {
        id: 'menu',
        label: 'Main Menu',
        copyText: 'dnss',
        lines: [
            { cmd: 'dnss' },
            {
                spans: [
                    { text: `${ASCII_BANNER}\n`, tone: 'blueBold' },
                    {
                        text: '                 DNS SWITCHER\n\n',
                        tone: 'blueBright',
                    },
                    { text: '? ', tone: 'green' },
                    { text: 'What would you like to do? ', tone: 'bold' },
                    { text: '(Use arrow keys)\n', tone: 'gray' },
                    { text: '❯ Change DNS settings\n', tone: 'cyan' },
                    {
                        text:
                            '  Add a DNS configuration\n' +
                            '  Remove a DNS configuration\n' +
                            '  Edit a DNS configuration\n' +
                            '  Reset all adapters to DHCP (No DNS)\n' +
                            '  Show currently used DNS configs\n' +
                            '  Benchmark DNS servers\n' +
                            '  Import / Export settings (settings.json)\n' +
                            '  Exit',
                        tone: 'plain',
                    },
                ],
            },
        ],
    },
    {
        id: 'switch',
        label: 'Switch DNS',
        copyText: 'npx @seymi/dnss-cli',
        lines: [
            { cmd: 'npx @seymi/dnss-cli' },
            {
                spans: [
                    { text: '? ', tone: 'green' },
                    {
                        text: 'Select the network adapter to change: ',
                        tone: 'bold',
                    },
                    { text: 'Wi-Fi\n', tone: 'cyan' },
                    { text: 'Using adapter: Wi-Fi\n\n', tone: 'greenBright' },
                    { text: '? ', tone: 'green' },
                    {
                        text: 'Select a DNS configuration to apply:\n',
                        tone: 'bold',
                    },
                    { text: '  No DNS (Use DHCP)\n', tone: 'plain' },
                    {
                        text: '  ── Saved configurations ──\n',
                        tone: 'cyanBold',
                    },
                    {
                        text: '  Office DNS: 10.10.0.53, alt: 10.10.0.54  ● active\n',
                        tone: 'green',
                    },
                    { text: '  ── Built-in presets ──\n', tone: 'cyanBold' },
                    {
                        text: '❯ Cloudflare: 1.1.1.1, alt: 1.0.0.1\n',
                        tone: 'cyan',
                    },
                    {
                        text: '  Google: 8.8.8.8, alt: 8.8.4.4\n',
                        tone: 'plain',
                    },
                    {
                        text: '  AdGuard DNS: 94.140.14.14, alt: 94.140.15.15\n\n',
                        tone: 'plain',
                    },
                    { text: '? ', tone: 'green' },
                    {
                        text: 'Apply the selected DNS setting to adapter "Wi-Fi"? ',
                        tone: 'bold',
                    },
                    { text: 'Yes\n', tone: 'cyan' },
                    {
                        text: 'Setting DNS to 1.1.1.1 on adapter "Wi-Fi"...\n',
                        tone: 'yellow',
                    },
                    {
                        text: '✔ DNS settings updated successfully.',
                        tone: 'green',
                    },
                ],
            },
        ],
    },
    {
        id: 'status',
        label: 'Current DNS',
        copyText: 'dnss',
        lines: [
            {
                spans: [
                    { text: '? ', tone: 'green' },
                    { text: 'What would you like to do? ', tone: 'bold' },
                    {
                        text: 'Show currently used DNS configs\n\n',
                        tone: 'cyan',
                    },
                    {
                        text:
                            '┌─────────┬─────────────────┬──────────────────────────────┬──────────────────────────────┐\n' +
                            '│ (index) │ Adapter         │ Primary DNS                  │ Alternative DNS              │\n' +
                            '├─────────┼─────────────────┼──────────────────────────────┼──────────────────────────────┤\n' +
                            "│    0    │ 'Wi-Fi'         │ '10.10.0.53 (Office DNS)'    │ '10.10.0.54 (Office DNS)'    │\n" +
                            "│    1    │ 'Ethernet'      │ '192.168.1.1'                │ 'N/A'                        │\n" +
                            "│    2    │ 'vEthernet'     │ 'N/A'                        │ 'N/A'                        │\n" +
                            '└─────────┴─────────────────┴──────────────────────────────┴──────────────────────────────┘\n',
                        tone: 'plain',
                    },
                    {
                        text: '? Press ENTER to return to the main menu...',
                        tone: 'gray',
                    },
                ],
            },
        ],
    },
    {
        id: 'benchmark',
        label: 'Benchmark',
        copyText: 'dnss',
        lines: [
            {
                spans: [
                    { text: '? ', tone: 'green' },
                    {
                        text: 'Target URL used for the benchmark: ',
                        tone: 'bold',
                    },
                    { text: 'https://www.cloudflare.com\n', tone: 'cyan' },
                    {
                        text: 'Benchmarking saved configurations and DNS presets (this can take a while)...\n\n',
                        tone: 'greenBright',
                    },
                    {
                        text:
                            '┌─────────┬──────────────┬─────────────────┬──────────────┬────────┐\n' +
                            '│ (index) │ Name         │ Server          │ Latency (ms) │ Status │\n' +
                            '├─────────┼──────────────┼─────────────────┼──────────────┼────────┤\n' +
                            "│    0    │ 'Cloudflare' │ '1.1.1.1'       │      18      │ 'ok'   │\n" +
                            "│    1    │ 'Google'     │ '8.8.8.8'       │      24      │ 'ok'   │\n" +
                            "│    2    │ 'AdGuard'    │ '94.140.14.14'  │      31      │ 'ok'   │\n" +
                            "│    3    │ 'Shecan'     │ '178.22.122.100'│      42      │ 'ok'   │\n" +
                            '└─────────┴──────────────┴─────────────────┴──────────────┴────────┘',
                        tone: 'plain',
                    },
                ],
            },
        ],
    },
    {
        id: 'backup',
        label: 'Backup & Sync',
        copyText: 'npm install -g @seymi/dnss-cli',
        lines: [
            { cmd: 'npm install -g @seymi/dnss-cli' },
            {
                spans: [
                    {
                        text: 'Unified settings file: ~/.dnss/settings.json\n',
                        tone: 'gray',
                    },
                    { text: '? ', tone: 'green' },
                    {
                        text: 'Settings & Backup (settings.json): ',
                        tone: 'bold',
                    },
                    { text: 'Export settings.json to a file\n', tone: 'cyan' },
                    { text: '? ', tone: 'green' },
                    { text: 'Export destination path: ', tone: 'bold' },
                    { text: './dnss-settings.json\n', tone: 'cyan' },
                    {
                        text: '✔ Exported settings.json to ./dnss-settings.json\n\n',
                        tone: 'green',
                    },
                    { text: '? ', tone: 'green' },
                    { text: 'Path to settings.json to import: ', tone: 'bold' },
                    { text: './dnss-settings.json\n', tone: 'cyan' },
                    {
                        text: '✔ Imported settings.json (3 custom server(s), theme: dark, language: en).',
                        tone: 'green',
                    },
                ],
            },
        ],
    },
];

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
            badge: 'Cross-Platform · Windows · macOS · Linux · Open Source',
            title: 'Switch DNS in one click.',
            highlight: 'DNS',
            subtitle:
                'A fast, quiet desktop app and terminal CLI for Windows, macOS, and Linux. Switch between Cloudflare, Google, AdGuard, Shecan, or custom DNS servers with live latency benchmarks, tray quick-switching, and effortless backup.',
            ctaPrimary: 'Download for Windows',
            ctaSecondary: 'Explore Features',
            installHint: 'Or run from your terminal:',
        },
        demo: {
            workbenchLabel: 'Live Interactive Demo',
            themeLabel: 'Demo theme',
            themes: { dark: 'Dark', light: 'Light' },
            accentLabel: 'Accent color',
            demoLangLabel: 'Switch demo UI language',
            reset: 'Reset demo state',
            hint: 'Try toggling DNS, opening Servers, benchmarking, adding a custom server, or exporting settings — everything works right inside this frame.',
        },
        features: {
            title: 'Everything you need to manage DNS without friction',
            subtitle:
                'A calm desktop experience and full-featured CLI built around real day-to-day DNS control.',
            crossPlatform: {
                title: 'Cross-Platform Support',
                desc: 'Works natively across Windows, macOS, and Linux with the same clean workflow everywhere.',
                badge: 'Windows · macOS · Linux',
                platforms: [
                    {
                        id: 'windows',
                        name: 'Windows',
                        detail: 'Switch one adapter or all adapters together, with a one-time background service so switching stays prompt-free.',
                    },
                    {
                        id: 'mac',
                        name: 'macOS',
                        detail: 'Updates active Wi-Fi, Ethernet, or USB network services cleanly with smart fallback when a VPN tunnel is running.',
                    },
                    {
                        id: 'linux',
                        name: 'Linux',
                        detail: 'Integrates with NetworkManager and disables auto-learned IPv6 DNS so ISP resolvers cannot bypass your selection.',
                    },
                ],
            },
            quickSwitch: {
                title: 'One-Click Control & System Tray',
                desc: 'Designed for instant switching without digging through OS network menus.',
                items: [
                    {
                        label: 'Smart Power Toggle',
                        detail: 'Switch back to automatic DHCP anytime while keeping your active DNS saved for one-click restore.',
                    },
                    {
                        label: 'Per-Adapter Selection',
                        detail: 'Target Wi-Fi, Ethernet, WSL, or every adapter at once from a single click.',
                    },
                    {
                        label: 'System Tray Popover',
                        detail: 'Quick-switch next to your clock with search, pin-to-stay-open, and live ping.',
                    },
                    {
                        label: 'Instant Cache Flush',
                        detail: 'Clear your OS DNS cache right after switching so changes apply immediately.',
                    },
                ],
            },
            presets: {
                title: '17+ Built-In Providers & Live Benchmark',
                desc: 'Measure real resolve + connection latency against any site and sort smoothly from fastest to slowest — with automatic VPN/FakeIP interference warnings.',
                badge: 'Live Latency Sort',
                items: [
                    { name: 'Cloudflare', ip: '1.1.1.1', ms: '18 ms' },
                    { name: 'Google', ip: '8.8.8.8', ms: '24 ms' },
                    { name: 'AdGuard', ip: '94.140.14.14', ms: '31 ms' },
                    { name: 'Shecan', ip: '178.22.122.100', ms: '42 ms' },
                    { name: 'Electro', ip: '78.157.42.100', ms: '47 ms' },
                ],
            },
            backupPrivacy: {
                title: 'Backup, Sync & Complete Privacy',
                desc: 'Your servers, look, and preferences stay yours — portable and private.',
                items: [
                    {
                        label: 'Export & Import Backup',
                        detail: 'Export your custom DNS servers, theme, accent color, and preferences to a file and import them on any machine.',
                    },
                    {
                        label: 'GUI & CLI Stay Synced',
                        detail: 'Servers and settings added in the desktop app show up automatically in the CLI, and vice versa.',
                    },
                    {
                        label: 'Custom Look & Languages',
                        detail: 'Light and dark themes, custom accent color picker, multiple fonts, font sizes, and full English/Persian UI.',
                    },
                    {
                        label: '100% Offline & Private',
                        detail: 'Zero accounts, zero analytics, zero background tracking — only the benchmarks you trigger.',
                    },
                ],
            },
        },
        cli: {
            title: 'Interactive CLI, synced with the desktop app',
            subtitle:
                'Inspect active adapters, switch presets or custom servers, run benchmarks, and export or import your setup right from your terminal.',
            copyCmd: 'Copy',
            copied: 'Copied',
            adminTipTitle:
                'On a non-admin account or tired of elevation prompts?',
            adminTipBody:
                'If you run the CLI standalone via npm, changing DNS prompts for admin rights (UAC on Windows, sudo on macOS/Linux). On Windows, if you are not an admin or want prompt-free switching, install the DNSS desktop app first instead of standalone npm — its one-time installer sets up the background service so both the desktop app and the `dnss` CLI switch DNS silently without repeated UAC prompts.',
            tabs: CLI_TABS_SHARED,
        },
        download: {
            title: 'Get DNSS',
            subtitle:
                'Download the desktop installer for your OS or run the interactive CLI from your terminal.',
            windows: {
                title: 'Windows Installer',
                badge: 'Recommended · .exe',
                desc: 'Installs DNSS desktop app, System Tray quick-switcher, and the one-time background service for prompt-free DNS switching.',
                btn: 'Download Windows .exe',
            },
            unix: {
                title: 'macOS & Linux',
                badge: 'GitHub Releases',
                desc: 'Native desktop installers for macOS (Apple Silicon & Intel) and Linux (DEB, RPM, AppImage).',
                btn: 'Browse Releases',
            },
            cliPkg: {
                title: 'CLI Package',
                badge: 'npm · Node 18+',
                desc: 'Full interactive terminal interface sharing saved servers and preferences with the desktop app.',
                cmd: 'npm install -g @seymi/dnss-cli',
            },
            credits: 'Built by SeyMi · Free & Open Source (MIT)',
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
            badge: 'کراس‌پلتفرم · ویندوز · مک · لینوکس · رایگان و متن‌باز',
            title: 'مدیریت راحت و سریع DNS',
            highlight: 'DNS',
            subtitle:
                'یه برنامه دسکتاپ سبک و سریع برای ویندوز، مک و لینوکس همراه با ابزار ترمینال (CLI). راحت بین کلودفلر، گوگل، ادگارد، شکن یا سرورهای دلخواه جابه‌جا بشید، پینگ واقعی سرورها رو بسنجید و هر وقت خواستید با یک کلیک برگردید به حالت عادی.',
            ctaPrimary: 'دانلود برای ویندوز',
            ctaSecondary: 'دیدن قابلیت‌ها',
            installHint: 'یا اجرای مستقیم از ترمینال:',
        },
        demo: {
            workbenchLabel: 'دموی تعاملی زنده',
            themeLabel: 'تم دمو',
            themes: { dark: 'تاریک', light: 'روشن' },
            accentLabel: 'رنگ اصلی',
            demoLangLabel: 'تغییر زبان دمو',
            reset: 'بازنشانی دمو',
            hint: 'عوض کردن DNS، انتخاب آداپتور، افزودن سرور سفارشی، پینگ گرفتن یا تغییر تم و رنگ رو همین جا امتحان کنید. همه پنجره‌ها توی همین کادر باز می‌شن.',
        },
        features: {
            title: 'همه چیز برای مدیریت بی‌دردسر DNS',
            subtitle:
                'یه تجربه آروم، سریع و کاربردی روی دسکتاپ و ترمینال، بدون شلوغی و تنظیمات گیج‌کننده.',
            crossPlatform: {
                title: 'پشتیبانی کامل از همه سیستم‌عامل‌ها',
                desc: 'روی ویندوز، مک و لینوکس دقیقاً با همون سادگی و سرعت روی شبکه سیستم کار می‌کنه.',
                badge: 'ویندوز · مک · لینوکس',
                platforms: [
                    {
                        id: 'windows',
                        name: 'ویندوز',
                        detail: 'اعمال DNS روی یک آداپتور یا همه آداپتورها با هم، همراه با سرویس پس‌زمینه تا موقع تغییر دیگه معطل تایید ادمین نشید.',
                    },
                    {
                        id: 'mac',
                        name: 'مک (macOS)',
                        detail: 'تنظیم تمیز سرویس‌های شبکه مثل Wi-Fi و Ethernet با پشتیبانی هوشمند وقتی VPN فعاله.',
                    },
                    {
                        id: 'linux',
                        name: 'لینوکس',
                        detail: 'هماهنگ با NetworkManager و جلوگیری خودکار از نشت DNS از طریق IPv6 اینترنت.',
                    },
                ],
            },
            quickSwitch: {
                title: 'تغییر با یک کلیک و پنل کنار ساعت',
                desc: 'دیگه نیازی به گشتن توی تنظیمات شبکه ویندوز یا زدن دستورات دستی نیست.',
                items: [
                    {
                        label: 'کلید هوشمند قطع و وصل',
                        detail: 'هر وقت خواستید به DHCP برگردید، آخرین DNS فعال ذخیره می‌مونه تا با یک کلیک برگرده.',
                    },
                    {
                        label: 'کنترل جداگانه آداپتورها',
                        detail: 'انتخاب کنید DNS فقط روی وای‌فای، کابل شبکه یا روی همه آداپتورها هم‌زمان تنظیم بشه.',
                    },
                    {
                        label: 'پنل سریع سینی سیستم',
                        detail: 'پاپ‌اوور جمع‌وجور کنار ساعت با جست‌وجو، پینگ و امکان سنجاق کردن پنجره روی صفحه.',
                    },
                    {
                        label: 'پاکسازی کش DNS',
                        detail: 'با یک کلیک کش سیستم‌عامل رو خالی کنید تا DNS جدید بلافاصله اثر کنه.',
                    },
                ],
            },
            presets: {
                title: 'بیش از ۱۷ سرور آماده و پینگ واقعی',
                desc: 'سرعت واقعی اتصال هر سرور رو به دامنه دلخواه بسنجید و لیست رو از سریع‌ترین به کندترین مرتب کنید. اگر VPN روی تست اثر بذاره هم بهتون هشدار می‌ده.',
                badge: 'مرتب‌سازی بر اساس سرعت',
                items: [
                    { name: 'Cloudflare', ip: '1.1.1.1', ms: '18 ms' },
                    { name: 'Google', ip: '8.8.8.8', ms: '24 ms' },
                    { name: 'AdGuard', ip: '94.140.14.14', ms: '31 ms' },
                    { name: 'Shecan', ip: '178.22.122.100', ms: '42 ms' },
                    { name: 'Electro', ip: '78.157.42.100', ms: '47 ms' },
                ],
            },
            backupPrivacy: {
                title: 'بکاپ راحت، همگام با CLI و کاملاً خصوصی',
                desc: 'تنظیمات و سرورها همیشه بین دسکتاپ و ترمینال هماهنگه و به‌راحتی قابل انتقاله.',
                items: [
                    {
                        label: 'بکاپ و انتقال تنظیمات (Export / Import)',
                        detail: 'از همه سرورهای سفارشی، تم، رنگ و تنظیمات یه خروجی بگیرید و روی هر سیستم دیگه‌ای به‌راحتی برگردونید.',
                    },
                    {
                        label: 'هماهنگی خودکار با CLI',
                        detail: 'هر سروری که توی نسخه دسکتاپ اضافه کنید، همون لحظه توی ترمینال هم در دسترسه و برعکس.',
                    },
                    {
                        label: 'شخصی‌سازی کامل ظاهر',
                        detail: 'تم روشن و تاریک، انتخاب‌گر رنگ دلخواه، فونت‌های متنوع، تغییر سایز نوشته و رابط فارسی کامل.',
                    },
                    {
                        label: 'کاملاً آفلاین و بدون ردیابی',
                        detail: 'هیچ اکانت یا ردیابی وجود نداره؛ تنها ارتباط شبکه همون تست سرعتیه که خودتون می‌زنید.',
                    },
                ],
            },
        },
        cli: {
            title: 'نسخه ترمینال کامل، هماهنگ با برنامه دسکتاپ',
            subtitle:
                'دیدن وضعیت فعلی آداپتورها، تغییر سریع، تست پینگ سرورها و خروجی یا ورودی گرفتن از تنظیمات مستقیم از خط فرمان.',
            copyCmd: 'کپی',
            copied: 'کپی شد',
            adminTipTitle:
                'دسترسی ادمین ندارید یا نمی‌خواهید هر بار پنجره مجوز باز بشه؟',
            adminTipBody:
                'اگر ابزار CLI رو مستقیم از npm نصب کنید، موقع تغییر DNS توی ویندوز هر بار پنجره UAC (و توی لینوکس و مک درخواست sudo) باز می‌شه. اگر سیستم طوریه که دسترسی ادمین ندارید یا نمی‌خواهید هر سری برای تغییر DNS مجوز تایید کنید، به‌جای استفاده تنها از npm، اول خود برنامه دسکتاپ رو نصب کنید؛ با نصب برنامه، سرویس پس‌زمینه یک‌بار فعال می‌شه و بعد از اون هم برنامه دسکتاپ و هم دستور `dnss` در ترمینال بدون نیاز به دسترسی مجدد یا پنجره ادمین کار می‌کنن.',
            tabs: [
                { ...CLI_TABS_SHARED[0], label: 'منوی اصلی' },
                { ...CLI_TABS_SHARED[1], label: 'تغییر DNS' },
                { ...CLI_TABS_SHARED[2], label: 'وضعیت فعلی' },
                { ...CLI_TABS_SHARED[3], label: 'بنچمارک' },
                { ...CLI_TABS_SHARED[4], label: 'بکاپ و انتقال' },
            ],
        },
        download: {
            title: 'دریافت DNSS',
            subtitle:
                'نسخه دسکتاپ سیستم‌عامل خودتون رو دانلود کنید یا ابزار CLI رو توی ترمینال اجرا کنید.',
            windows: {
                title: 'نصاب ویندوز',
                badge: 'پیشنهادی · .exe',
                desc: 'نصب برنامه دسکتاپ، پنل سینی سیستم و فعال‌سازی سرویس پس‌زمینه تا تغییر DNS همیشه سریع و بدون پنجره ادمین انجام بشه.',
                btn: 'دانلود نسخه ویندوز (.exe)',
            },
            unix: {
                title: 'مک و لینوکس',
                badge: 'انتشارهای گیت‌هاب',
                desc: 'فایل نصاب دسکتاپ برای macOS (اپل سیلیکون و اینتل) و لینوکس (DEB، RPM و AppImage).',
                btn: 'مشاهده نسخه‌ها',
            },
            cliPkg: {
                title: 'نسخه ترمینال (CLI)',
                badge: 'npm · Node 18+',
                desc: 'رابط تعاملی ترمینال با لیست کامل سرورها، تست سرعت و هماهنگی خودکار با برنامه دسکتاپ.',
                cmd: 'npm install -g @seymi/dnss-cli',
            },
            credits: 'ساخته شده توسط SeyMi · رایگان و متن‌باز (MIT)',
        },
    },
};
