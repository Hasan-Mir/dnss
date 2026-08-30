/* DNSS landing page interactions: theme, EN/FA language switch, copy button,
   scroll reveal. No dependencies. */
(function () {
    'use strict';

    var docEl = document.documentElement;
    docEl.classList.add('js');

    /* ---------- Theme ---------- */

    var THEME_KEY = 'dnss-site-theme';

    function storedTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (e) {
            return null;
        }
    }

    function applyTheme(theme) {
        docEl.dataset.theme = theme;
    }

    var initialTheme =
        storedTheme() ||
        (window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark');
    applyTheme(initialTheme);

    document
        .getElementById('theme-toggle')
        .addEventListener('click', function () {
            var next = docEl.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try {
                localStorage.setItem(THEME_KEY, next);
            } catch (e) {
                /* private mode: theme just won't persist */
            }
        });

    /* ---------- Language ---------- */

    var LANG_KEY = 'dnss-site-lang';

    var dict = {
        en: {
            'a11y.skip': 'Skip to content',
            'nav.features': 'Features',
            'nav.download': 'Download',
            'nav.cli': 'CLI',
            'lang.switch': 'فارسی',
            'theme.aria': 'Toggle theme',
            'hero.eyebrow': 'Free & open source',
            'hero.title.a': 'Switch your DNS in',
            'hero.title.b': 'one click.',
            'hero.sub':
                'A free, open-source desktop app that switches between Cloudflare, Google, AdGuard, Shecan and more. No netsh, no settings digging.',
            'hero.cta.download': 'Download',
            'hero.cta.github': 'View on GitHub',
            'hero.shot.alt':
                'The DNSS home screen: a large green power button, Custom DNS active, with the Cloudflare 1.1.1.1 and 1.0.0.1 servers listed for the Wi-Fi adapter.',
            'dl.title': 'Get DNSS for your platform',
            'dl.sub':
                'Every release ships installers for all three systems, built automatically on GitHub.',
            'dl.windows.name': 'Windows',
            'dl.windows.hint': 'EXE and MSI installers',
            'dl.macos.name': 'macOS',
            'dl.macos.hint': 'DMG for Intel and Apple silicon',
            'dl.linux.name': 'Linux',
            'dl.linux.hint': 'AppImage, DEB and RPM',
            'dl.cli.name': 'CLI',
            'dl.cli.hint': 'Runs with npx, Node 18+',
            'ft.title': 'Everything a DNS switcher needs',
            'ft.sub':
                'The app and the CLI share one core, so what you see here is what you get in the terminal.',
            'ft.presets.h': '17 presets built in',
            'ft.presets.p':
                'Pick a provider and hit Apply. Global resolvers alongside Iranian services like Shecan, Electro and Radar Game.',
            'ft.presets.more': '+7 more',
            'ft.oneclick.h': 'One click to switch',
            'ft.oneclick.p':
                'The home screen is one big power button. Tap it to restore DHCP or jump back to your last DNS.',
            'ft.bench.h': 'Benchmark before you switch',
            'ft.bench.p':
                'Measure resolve and connect times for every preset and pick the fastest for your line.',
            'ft.shot.alt':
                'The DNSS Servers tab: a search field, saved configurations, built-in presets with their addresses, ping buttons and Apply buttons.',
            'ft.control.h': 'Fine-grained control',
            'ft.control.a': 'Apply to one adapter or to all of them',
            'ft.control.b': 'Save your own named configurations',
            'ft.control.c': 'Reset adapters to DHCP',
            'ft.control.d': 'Flush the OS DNS cache',
            'ft.privacy.h': 'Private and light',
            'ft.privacy.p':
                'No telemetry, no analytics, no accounts. Around 10 MB with no Electron in sight. Dark and light themes, English and Persian.',
            'cli.title': 'Runs in your terminal too',
            'cli.p':
                'The CLI shares the core with the app: same presets, same configs file, same benchmark. Start it with npx, nothing to install. Requires Node 18+.',
            'cli.npm': 'npm package',
            'cli.copy.aria': 'Copy command',
            'footer.tag':
                'A free, open-source DNS changer for Windows, macOS and Linux.',
            'footer.releases': 'Releases',
            'footer.license': 'License (MIT)',
            'footer.rights':
                '© 2026 SeyMi. DNSS collects nothing: no telemetry, no analytics.',
        },
        fa: {
            'a11y.skip': 'پرش به محتوا',
            'nav.features': 'ویژگی‌ها',
            'nav.download': 'دانلود',
            'nav.cli': 'خط فرمان',
            'lang.switch': 'English',
            'theme.aria': 'تغییر تم',
            'hero.eyebrow': 'آزاد و متن‌باز',
            'hero.title.a': 'تغییر DNS با',
            'hero.title.b': 'یک کلیک.',
            'hero.sub':
                'اپ دسکتاپ آزاد و متن‌بازی که میان Cloudflare، Google، AdGuard، Shecan و بقیه جابه‌جا می‌شود. نه netsh، نه گشتن در تنظیمات.',
            'hero.cta.download': 'دانلود',
            'hero.cta.github': 'مشاهده در گیت‌هاب',
            'hero.shot.alt':
                'صفحه‌ی خانه‌ی DNSS: دکمه‌ی پاور سبز بزرگ، فعال بودن DNS سفارشی، و نمایش سرورهای Cloudflare 1.1.1.1 و 1.0.0.1 روی آداپتور Wi-Fi.',
            'dl.title': 'دانلود برای سیستم‌عامل شما',
            'dl.sub':
                'هر نسخه برای هر سه سیستم‌عامل فایل نصب دارد؛ همه به‌صورت خودکار روی گیت‌هاب ساخته می‌شوند.',
            'dl.windows.name': 'ویندوز',
            'dl.windows.hint': 'نصب‌کننده‌ی EXE و MSI',
            'dl.macos.name': 'مک',
            'dl.macos.hint': 'DMG برای اینتل و اپل سیلیکون',
            'dl.linux.name': 'لینوکس',
            'dl.linux.hint': 'AppImage، DEB و RPM',
            'dl.cli.name': 'خط فرمان',
            'dl.cli.hint': 'اجرا با npx؛ نیازمند Node 18+',
            'ft.title': 'هر آنچه از یک سوییچر DNS انتظار دارید',
            'ft.sub':
                'اپ و CLI یک هسته‌ی مشترک دارند؛ چیزی که اینجا می‌بینید، در ترمینال هم همان است.',
            'ft.presets.h': '۱۷ پیش‌فرض آماده',
            'ft.presets.p':
                'ارائه‌دهنده را انتخاب کنید و Apply را بزنید. رزولورهای جهانی در کنار سرویس‌های ایرانی مثل Shecan، Electro و Radar Game.',
            'ft.presets.more': '+۷ مورد دیگر',
            'ft.oneclick.h': 'تغییر با یک کلیک',
            'ft.oneclick.p':
                'صفحه‌ی خانه یک دکمه‌ی پاور بزرگ است؛ با یک لمس به DHCP برگردید یا به DNS قبلی وصل شوید.',
            'ft.bench.h': 'قبل از تغییر، تست کنید',
            'ft.bench.p':
                'زمان resolve و connect هر پیش‌فرض را بسنجید و سریع‌ترین را برای اینترنت خودتان انتخاب کنید.',
            'ft.shot.alt':
                'تب Servers در DNSS: جست‌وجو، کانفیگ‌های ذخیره‌شده، پیش‌فرض‌های داخلی با آدرس‌ها، دکمه‌ی پینگ و Apply.',
            'ft.control.h': 'کنترل ریز و دقیق',
            'ft.control.a': 'اعمال روی یک آداپتور یا همه‌ی آن‌ها',
            'ft.control.b': 'ذخیره‌ی کانفیگ‌های دلخواه با نام',
            'ft.control.c': 'بازگرداندن آداپتورها به DHCP',
            'ft.control.d': 'پاک کردن کش DNS سیستم',
            'ft.privacy.h': 'خصوصی و سبک',
            'ft.privacy.p':
                'بدون تله‌متری، بدون آنالیتیکس، بدون حساب کاربری. حدود ۱۰ مگابایت، بدون Electron. تم تاریک و روشن، انگلیسی و فارسی.',
            'cli.title': 'در ترمینال هم اجرا می‌شود',
            'cli.p':
                'CLI همان هسته‌ی اپ را به اشتراک می‌گذارد: همان پیش‌فرض‌ها، همان فایل کانفیگ، همان بنچمارک. با npx اجرا کنید؛ نیازی به نصب نیست. نیازمند Node 18+.',
            'cli.npm': 'بسته‌ی npm',
            'cli.copy.aria': 'کپی دستور',
            'footer.tag': 'سوییچر DNS آزاد و متن‌باز برای ویندوز، مک و لینوکس.',
            'footer.releases': 'نسخه‌ها',
            'footer.license': 'مجوز (MIT)',
            'footer.rights':
                '© ۲۰۲۶ حسن میر. DNSS هیچ داده‌ای جمع نمی‌کند: نه تله‌متری، نه آنالیتیکس.',
        },
    };

    function applyLang(lang) {
        var entries = dict[lang] || dict.en;
        docEl.lang = lang;
        docEl.dir = lang === 'fa' ? 'rtl' : 'ltr';

        var nodes = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute('data-i18n');
            if (entries[key] !== undefined) {
                nodes[i].textContent = entries[key];
            }
        }

        var ariaNodes = document.querySelectorAll('[data-i18n-aria]');
        for (var j = 0; j < ariaNodes.length; j++) {
            var ariaKey = ariaNodes[j].getAttribute('data-i18n-aria');
            if (entries[ariaKey] !== undefined) {
                ariaNodes[j].setAttribute('aria-label', entries[ariaKey]);
            }
        }

        var altNodes = document.querySelectorAll('[data-i18n-alt]');
        for (var k = 0; k < altNodes.length; k++) {
            var altKey = altNodes[k].getAttribute('data-i18n-alt');
            if (entries[altKey] !== undefined) {
                altNodes[k].setAttribute('alt', entries[altKey]);
            }
        }

        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch (e) {
            /* ignore */
        }
    }

    var initialLang = (function () {
        var stored = null;
        try {
            stored = localStorage.getItem(LANG_KEY);
        } catch (e) {
            /* ignore */
        }
        if (stored === 'fa' || stored === 'en') return stored;
        return (navigator.language || '').toLowerCase().indexOf('fa') === 0
            ? 'fa'
            : 'en';
    })();
    applyLang(initialLang);

    document
        .getElementById('lang-toggle')
        .addEventListener('click', function () {
            applyLang(docEl.lang === 'en' ? 'fa' : 'en');
        });

    /* ---------- Copy command ---------- */

    var copyBtn = document.getElementById('copy-cmd');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            var text = copyBtn.getAttribute('data-copy') || '';
            function done() {
                copyBtn.classList.add('copied');
                window.setTimeout(function () {
                    copyBtn.classList.remove('copied');
                }, 1600);
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, done);
            } else {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                } catch (e) {
                    /* ignore */
                }
                document.body.removeChild(ta);
                done();
            }
        });
    }

    /* ---------- Reveal on scroll ---------- */

    var reveals = document.querySelectorAll('.reveal');
    var reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
        for (var r = 0; r < reveals.length; r++) {
            reveals[r].classList.add('in');
        }
    } else {
        var io = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('in');
                        io.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );
        for (var v = 0; v < reveals.length; v++) {
            io.observe(reveals[v]);
        }
    }
})();
