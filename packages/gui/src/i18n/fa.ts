/**

* Persian (فارسی) messages. Must implement every key of `Dict` — the
* compiler fails the build when a key is missing here but present in `en.ts`.
* Placeholder order may differ from English (e.g. «{name}» at the start);
* interpolation handles it. Use ZWNJ (نیم‌فاصله) where orthography requires.
  */
import type { Dict } from './en';

const fa: Dict = {
    // Header / dock
    'app.tagline': 'تغییر DNS',
    'app.toggleTheme': 'تغییر تم',
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
    'common.delete': 'حذف',
    'common.remove': 'حذف',
    'common.save': 'ذخیره',
    'common.update': 'به‌روزرسانی',
    'common.edit': 'ویرایش',
    'common.add': 'افزودن',
    'common.default': 'پیش‌فرض',
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
    'toast.badPrimary': 'DNS اصلی باید یک آدرس IPv4 معتبر باشد',
    'toast.badAlt': 'DNS جایگزین باید یک آدرس IPv4 معتبر باشد',
    'toast.duplicate': 'سروری با نام «{name}» از قبل وجود دارد',
    'toast.updated': '«{name}» به‌روزرسانی شد',
    'toast.added': '«{name}» اضافه شد',
    'toast.presetRemoved': '«{name}» از سرورهای آماده حذف شد',

    // Home
    'home.customActive': 'DNS سفارشی فعال است',
    'home.dhcpDefault': 'DHCP (پیش‌فرض)',
    'home.hintReset': 'برای بازگشت به DHCP کلیک کنید — DNS فعلی ذخیره می‌شود',
    'home.hintRestore': 'برای بازگرداندن «{name}» کلیک کنید',
    'home.hintApplyFirst': 'ابتدا از بخش سرورها یک DNS را اعمال کنید',
    'home.hintNoAdapter': 'هیچ آداپتور شبکهٔ فعالی پیدا نشد',
    'home.noActiveAdapter': 'آداپتور فعالی نیست',
    'home.automatic': 'خودکار (بدون DNS سفارشی)',
    'home.refreshStatus': 'به‌روزرسانی وضعیت',
    'home.inUse': 'سرورهای DNS مورد استفاده',
    'home.noAdapters': 'هیچ آداپتوری پیدا نشد',
    'home.flush': 'پاک کردن کش DNS',
    'home.activeAdapterTitle': 'آداپتور فعال (مسیر پیش‌فرض)',
    'home.staticTitle': 'سرورهای DNS به‌صورت دستی تنظیم شده‌اند (نه از DHCP)',
    'home.staticBadge': 'ثابت',

    // Servers
    'servers.title': 'سرورها',
    'servers.search': 'جست‌وجو در سرورها بر اساس نام یا آدرس…',
    'servers.sortTitle': 'مرتب‌سازی سرورها',
    'servers.sortDefault': 'ترتیب پیش‌فرض',
    'servers.sortName': 'نام',
    'servers.sortPing': 'پینگ',
    'servers.benchmark': 'بنچمارک همهٔ سرورها',
    'servers.benchmarking': 'در حال بنچمارک…',
    'servers.benchTarget': 'هدف بنچمارک',
    'servers.benchTargetHint':
        'دامنه‌ای که از هر سرور DNS خواسته می‌شود آن را resolve کند — همان تنظیم «هدف بنچمارک» در CLI.',
    'servers.saved': 'سرورهای ذخیره‌شده',
    'servers.presets': 'سرورهای آماده',
    'servers.noSavedMatch': 'هیچ سرور ذخیره‌شده‌ای با «{query}» پیدا نشد',
    'servers.noSavedYet':
        'هنوز سروری ذخیره نشده — با دکمهٔ بالا یک سرور اضافه کنید',
    'servers.noPresetMatch': 'هیچ سرور آماده‌ای با «{query}» پیدا نشد',
    'servers.pingBadge': 'پینگ',
    'servers.timeoutBadge': 'بدون پاسخ',
    'servers.errorBadge': 'خطا',
    'servers.measuring': 'در حال اندازه‌گیری تأخیر…',
    'servers.pingTitle': 'پینگ این سرور',
    'servers.ms': '{n} ms',
    'servers.applyTo': 'اعمال DNS روی آداپتورها',
    'servers.allAdapters': 'همهٔ آداپتورها',
    'servers.deleteConfirm': '«{name}» حذف شود؟',
    'servers.removePresetConfirm': '«{name}» از سرورهای آماده حذف شود؟',
    'servers.removePresetHint': 'بعداً می‌توانید از تنظیمات برگردانیدش.',
    'form.new': 'سرور جدید',
    'form.edit': 'ویرایش «{name}»',
    'form.namePh': 'نام (مثلاً DNS منزل)',
    'form.primaryPh': 'DNS اصلی (IPv4)',
    'form.altPh': 'DNS جایگزین (اختیاری)',

    // Settings
    'settings.title': 'تنظیمات',
    'settings.appearance': 'ظاهر',
    'settings.light': 'روشن',
    'settings.dark': 'تاریک',
    'settings.system': 'سیستم',
    'settings.language': 'زبان',
    'settings.languageHint':
        'تغییرات بلافاصله اعمال می‌شوند — نیازی به راه‌اندازی دوباره نیست.',
    'settings.maintenance': 'نگهداری',
    'settings.maintenanceDesc':
        'تنظیمات دستی DNS را از همهٔ آداپتورها حذف می‌کند و آن‌ها را به حالت خودکار (DHCP) برمی‌گرداند.',
    'settings.resetAll': 'برگرداندن همهٔ آداپتورها به DHCP',
    'settings.resetConfirm':
        'DNS همهٔ آداپتورها به حالت خودکار (DHCP) برگردانده شود؟',
    'settings.reset': 'بازنشانی',
    'settings.hiddenPresets': 'سرورهای آمادهٔ حذف‌شده',
    'settings.hiddenPresetsDesc':
        'این سرورهای آماده از لیست سرورها حذف شده‌اند:',
    'settings.restorePresets': 'بازگردانی سرورهای آماده',
    'settings.about': 'درباره',
    'settings.aboutSuffix':
        ' (تغییر DNS) — تغییر DNSها با یک کلیک. رایگان و متن‌باز با مجوز MIT.',
    'settings.inspirationBefore':
        'بخش‌هایی از این برنامه (الگوریتم بنچمارک تأخیر DNS و ایده‌های مربوط به سرورهای آماده) از پروژهٔ متن‌باز ',
    'settings.inspirationAfter': ' الهام گرفته است. سپاسگزاریم!',
    'settings.privacy': 'حریم خصوصی',
    'settings.privacyBody':
        'DNSS کاملاً آفلاین اجرا می‌شود: هیچ تله‌متری یا تحلیل آماری انجام نمی‌شود و هیچ درخواست شبکه‌ای ارسال نمی‌کند، به‌جز بنچمارک‌های DNS که خودتان اجرا می‌کنید.',
};

export default fa;
