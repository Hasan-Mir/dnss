/**
 * Persian (فارسی) messages. Must implement every key of `Dict` — the
 * compiler fails the build when a key is missing here but present in `en.ts`.
 * Placeholder order may differ from English (e.g. «{name}» at the start);
 * interpolation handles it. Use ZWNJ (نیم‌فاصله) where orthography requires.
 */
import type { Dict } from './en';

const fa: Dict = {
    // Window chrome
    'window.minimize': 'کوچک کردن',
    'window.maximize': 'بزرگ کردن',
    'window.restore': 'بازگرداندن اندازه',
    'window.close': 'بستن به سینی سیستم',

    // Header / navigation
    'app.tagline': 'تغییر DNS',
    'app.toggleTheme': 'تغییر تم',
    'app.toggleLang': 'تغییر زبان',
    'app.working': 'در حال انجام…',
    'dock.home': 'خانه',
    'dock.servers': 'سرورها',
    'dock.settings': 'تنظیمات',

    // "Open in a browser" fallback card
    'nodesktop.title': 'برنامهٔ دسکتاپ DNSS',
    'nodesktop.body':
        'این رابط باید داخل پنجرهٔ دسکتاپ DNSS اجرا شود — مرورگر نمی‌تواند به تنظیمات شبکهٔ سیستم دسترسی داشته باشد.',
    'nodesktop.devPrefix': 'این برگهٔ مرورگر را ببندید و برنامه را با ',
    'nodesktop.devSuffix':
        ' اجرا کنید (حالت توسعه) یا برنامهٔ نصب‌شدهٔ DNSS را باز کنید.',

    // Shared words
    'common.cancel': 'انصراف',
    'common.apply': 'اعمال',
    'common.applied': 'اعمال‌شده',
    'common.delete': 'حذف',
    'common.remove': 'حذف',
    'common.save': 'ذخیره',
    'common.update': 'به‌روزرسانی',
    'common.edit': 'ویرایش',
    'common.add': 'افزودن',
    'common.default': 'پیش‌فرض',
    'common.active': 'فعال',
    'common.na': 'نامشخص',

    // Toasts (error/details values come from the OS and may stay English)
    'toast.loadSavedFailed': 'بارگذاری سرورهای ذخیره‌شده ناموفق بود: {error}',
    'toast.noAdaptersToConfigure': 'هیچ آداپتوری برای پیکربندی پیدا نشد',
    'toast.failed': 'عملیات ناموفق بود: {details}',
    'toast.appliedOne': 'DNS برای «{adapter}» اعمال شد',
    'toast.appliedMany': 'DNS روی {count} آداپتور اعمال شد',
    'toast.dhcpOne': '«{adapter}» به DHCP برگردانده شد',
    'toast.dhcpMany': '{count} آداپتور به DHCP برگردانده شد',
    'toast.noActiveAdapter': 'هیچ آداپتور فعالی پیدا نشد',
    'toast.noRememberedDns': 'DNS قبلی برای این آداپتور ذخیره نشده است',
    'toast.flushed': 'کش DNS پاک شد',
    'toast.flushFailed': 'پاک کردن کش ناموفق بود: {error}',
    'toast.noAdaptersToReset': 'هیچ آداپتوری برای بازنشانی پیدا نشد',
    'toast.allReset': 'همهٔ آداپتورها به DHCP برگردانده شدند',
    'toast.resetFailed': 'بازنشانی ناموفق بود: {error}',
    'toast.saveFailed': 'ذخیره ناموفق بود: {error}',
    'toast.nameRequired': 'وارد کردن نام و DNS اصلی الزامی است',
    'toast.nameTooLong': 'نام نباید بیشتر از ۶۴ کاراکتر باشد',
    'toast.badPrimary': 'DNS اصلی باید یک آدرس IPv4 معتبر باشد',
    'toast.badAlt': 'DNS جایگزین باید یک آدرس IPv4 معتبر باشد',
    'toast.duplicate': 'سروری با نام «{name}» از قبل وجود دارد',
    'toast.updated': '«{name}» به‌روزرسانی شد',
    'toast.added': '«{name}» اضافه شد',
    'toast.presetRemoved': '«{name}» از سرورهای آماده پنهان شد',

    // Home
    'home.customActive': 'DNS سفارشی فعال است',
    'home.dhcpDefault': 'خودکار (DHCP)',
    'home.protectAction': 'بازگردانی DNS',
    'home.disconnectAction': 'قطع و بازگشت به DHCP',
    'home.disconnectTooltip':
        'آداپتور فعال را به DNS خودکار مودم/اینترنت (DHCP) برمی‌گرداند و DNS فعلی را برای بازگردانی سریع نگه می‌دارد. عملکرد آن دقیقاً مشابه خاموش کردن کلید بالای صفحه است.',
    'home.restoreTooltip':
        'آخرین DNS سفارشی ذخیره‌شده را دوباره روی آداپتور فعال اعمال می‌کند. عملکرد آن دقیقاً مشابه روشن کردن کلید بالای صفحه است.',
    'home.chooseServer': 'انتخاب سرور',
    'home.hintReset': 'بازگشت به DHCP خودکار — DNS فعلی ذخیره می‌ماند',
    'home.hintRestore': 'بازگرداندن «{name}» روی این آداپتور',
    'home.hintApplyFirst': 'برای شروع یک سرور از بخش سرورها انتخاب کنید',
    'home.hintNoAdapter': 'هیچ آداپتور شبکهٔ فعالی پیدا نشد',
    'home.noActiveAdapter': 'آداپتور فعالی نیست',
    'home.automatic': 'خودکار (بدون DNS سفارشی)',
    'home.refreshStatus': 'به‌روزرسانی',
    'home.inUse': 'آداپتورهای شبکه',
    'home.noAdapters': 'هیچ آداپتوری پیدا نشد',
    'home.flush': 'پاک کردن کش DNS',
    'home.activeAdapterTitle': 'آداپتور فعال (مسیر پیش‌فرض)',
    'home.staticTitle': 'سرورهای DNS به‌صورت دستی تنظیم شده‌اند (نه از DHCP)',
    'home.staticBadge': 'ثابت',
    'home.dhcpBadge': 'DHCP',

    // Servers
    'servers.title': 'سرورها',
    'servers.search': 'جست‌وجو بر اساس نام یا IPv4…',
    'servers.filterAll': 'همه',
    'servers.filterCustom': 'سفارشی',
    'servers.filterBuiltin': 'آماده',
    'servers.sortTitle': 'مرتب‌سازی سرورها',
    'servers.sortDefault': 'پیش‌فرض',
    'servers.sortName': 'نام',
    'servers.sortPing': 'تأخیر',
    'servers.benchmark': 'بنچمارک همه',
    'servers.benchmarking': 'در حال بنچمارک…',
    'servers.benchTarget': 'دامنهٔ تست',
    'servers.benchTargetHint':
        'دامنه‌ای که هنگام سنجش تأخیر بررسی می‌شود (مشترک با CLI).',
    'servers.vpnFakeIpWarning':
        'حالت FakeIP در VPN (رنج 198.18.x.x) درخواست‌های بنچمارک را رهگیری کرده است. برای سنجش واقعی تأخیر سرورها، حالت TUN / FakeIP را موقتاً غیرفعال کنید.',
    'servers.vpnHijackWarning':
        'چند سرور مختلف با تأخیر کمتر از ۵ میلی‌ثانیه و IP یکسان پاسخ دادند. آداپتور VPN/TUN فعال ({adapter}) احتمالاً ترافیک DNS و TCP را به‌صورت محلی پاسخ می‌دهد — برای نتیجهٔ دقیق، حالت TUN را موقتاً خاموش کنید.',
    'servers.benchFailedSummary': 'بنچمارک ناموفق بود: {reason}',
    'servers.breakdownTooltip':
        '{address} · DNS {resolve} ms + TCP {connect} ms',
    'servers.noSavedMatch': 'هیچ سرور سفارشی با «{query}» پیدا نشد',
    'servers.noSavedYet':
        'هنوز سرور سفارشی ذخیره نشده — یک سرور جدید اضافه کنید',
    'servers.noPresetMatch': 'هیچ سرور آماده‌ای با «{query}» پیدا نشد',
    'servers.pingBadge': '—',
    'servers.timeoutBadge': 'بدون پاسخ',
    'servers.errorBadge': 'خطا',
    'servers.measuring': 'در حال اندازه‌گیری تأخیر…',
    'servers.pingTitle': 'پینگ این سرور',
    'servers.ms': '{n} ms',
    'servers.applyTo': 'آداپتورهای هدف',
    'servers.applyChooseAdapters': 'انتخاب آداپتورهای هدف',
    'servers.allAdapters': 'همهٔ آداپتورها',
    'servers.deleteConfirm': '«{name}» حذف شود؟',
    'servers.removePresetConfirm': '«{name}» از فهرست آماده پنهان شود؟',
    'servers.removePresetHint': 'بعداً می‌توانید از تنظیمات بازگردانید.',
    'form.new': 'افزودن سرور سفارشی',
    'form.edit': 'ویرایش «{name}»',
    'form.nameLabel': 'نام',
    'form.primaryLabel': 'DNS اصلی (IPv4)',
    'form.altLabel': 'DNS جایگزین (اختیاری)',
    'form.namePh': 'مثلاً DNS دفتر',
    'form.primaryPh': '1.1.1.1',
    'form.altPh': '1.0.0.1',

    // Settings
    'settings.title': 'تنظیمات',
    'settings.appearance': 'ظاهر',
    'settings.appearanceDesc': 'نمای ظاهری DNSS را روی دسکتاپ انتخاب کنید.',
    'settings.light': 'روشن',
    'settings.dark': 'تاریک',
    'settings.system': 'سیستم',
    'settings.accent': 'رنگ اصلی (Accent)',
    'settings.accentDesc':
        'از رنگ‌های آماده انتخاب کنید یا هر طیف رنگی دلخواه بسازید.',
    'settings.accentHue': 'طیف رنگ',
    'settings.accentSat': 'اشباع رنگ',
    'settings.accentReset': 'بازنشانی',
    'settings.font': 'فونت برنامه',
    'settings.fontDesc':
        'فونت رابط کاربری را انتخاب کنید (متن فارسی همواره با وزیرمتن نمایش داده می‌شود).',
    'settings.fontSize': 'اندازهٔ فونت',
    'settings.fontSizeDesc':
        'اندازهٔ نوشته‌ها را در پنجرهٔ اصلی و پنل سینی سیستم تنظیم کنید.',
    'settings.language': 'زبان',
    'settings.languageHint':
        'بلافاصله اعمال می‌شود و نیازی به راه‌اندازی مجدد نیست.',
    'settings.maintenance': 'نگهداری شبکه',
    'settings.maintenanceDesc':
        'تنظیمات دستی DNS را از همهٔ آداپتورها پاک می‌کند و آن‌ها را به DHCP خودکار برمی‌گرداند.',
    'settings.resetAll': 'بازنشانی همه به DHCP',
    'settings.resetConfirm':
        'DNS همهٔ آداپتورها به حالت خودکار (DHCP) برگردانده شود؟',
    'settings.reset': 'بازنشانی همه',
    'settings.hiddenPresets': 'سرورهای آمادهٔ پنهان‌شده',
    'settings.hiddenPresetsDesc':
        'این سرورهای آماده از فهرست سرورها پنهان شده‌اند:',
    'settings.restorePresets': 'بازگردانی سرورها',
    'settings.about': 'درباره',
    'settings.repoLabel': 'مخزن گیت‌هاب',
    'settings.aboutSuffix':
        ' (تغییر DNS) — تغییر سرورهای DNS با یک کلیک. رایگان و متن‌باز با مجوز MIT.',
    'settings.inspirationBefore':
        'الگوریتم سنجش تأخیر و فهرست سرورهای آماده با الهام از پروژهٔ متن‌باز ',
    'settings.inspirationAfter': ' ساخته شده است.',
    'settings.privacy': 'حریم خصوصی',
    'settings.privacyBody':
        'DNSS کاملاً آفلاین اجرا می‌شود؛ هیچ تله‌متری یا تحلیل آماری وجود ندارد و به‌جز بنچمارک‌هایی که خودتان اجرا می‌کنید، درخواست شبکه‌ای ارسال نمی‌شود.',

    // System Tray Popover
    'tray.pin': 'سنجاق کردن پنجره (با کلیک بیرون بسته نشود)',
    'tray.unpin': 'برداشتن سنجاق (با کلیک بیرون بسته شود)',
    'tray.openApp': 'باز کردن برنامهٔ کامل',
    'tray.quit': 'خروج از DNSS',
    'tray.protected': 'محافظت‌شده',
    'tray.dhcp': 'DHCP',
    'tray.targetActive': 'فعال ({name})',
    'tray.targetAll': 'همهٔ آداپتورها ({count})',
    'tray.targetTooltip':
        'آداپتور یا آداپتورهای شبکه‌ای که با زدن «اعمال»، DNS روی آن‌ها تنظیم می‌شود',
    'tray.addCustom': 'سفارشی',
    'tray.benchmark': 'بنچمارک همه',
    'tray.benchmarking': 'در حال بنچمارک…',
    'tray.customTitle': 'افزودن سرور سفارشی',
    'tray.resetDhcp': 'بازگشت DHCP',
    'tray.restore': 'بازگردانی',
    'tray.flush': 'پاکسازی کش',
    'tray.noMatches': 'سروری با «{query}» پیدا نشد',
};

export default fa;
