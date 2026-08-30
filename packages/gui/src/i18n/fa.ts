/**
 * Persian (فارسی) messages. Must implement every key of `Dict` — the
 * compiler fails the build when a key is missing here but present in `en.ts`.
 * Placeholder order may differ from English (e.g. «{name}» at the start);
 * interpolation handles it. Use ZWNJ (نیم‌فاصله) where orthography requires.
 */
import type { Dict } from './en';

const fa: Dict = {
    // Header / dock
    'app.tagline': 'سوییچ DNS',
    'app.toggleTheme': 'تغییر پوسته',
    'app.working': 'در حال کار…',
    'dock.home': 'خانه',
    'dock.servers': 'سرورها',
    'dock.settings': 'تنظیمات',

    // "Open in a browser" fallback card
    'nodesktop.title': 'برنامهٔ دسکتاپ DNSS',
    'nodesktop.body':
        'این رابط باید داخل پنجرهٔ دسکتاپ DNSS اجرا شود — مرورگر نمی‌تواند با تنظیمات شبکهٔ سیستم کار کند.',
    'nodesktop.devPrefix': 'این برگهٔ مرورگر را ببندید و برنامه را با ',
    'nodesktop.devSuffix':
        ' اجرا کنید (حالت توسعه) یا برنامهٔ نصب‌شدهٔ DNSS را باز کنید.',

    // Shared words
    'common.cancel': 'انصراف',
    'common.apply': 'اعمال',
    'common.delete': 'حذف',
    'common.save': 'ذخیره',
    'common.update': 'به‌روزرسانی',
    'common.edit': 'ویرایش',
    'common.add': 'افزودن',
    'common.default': 'پیش‌فرض',
    'common.na': 'نامشخص',

    // Toasts (error/details values come from the OS and may stay English)
    'toast.loadSavedFailed': 'خطا در بارگذاری سرورهای ذخیره‌شده: {error}',
    'toast.noAdaptersToConfigure': 'هیچ آداپتوری برای پیکربندی پیدا نشد',
    'toast.failed': 'ناموفق: {details}',
    'toast.appliedOne': 'DNS روی «{adapter}» اعمال شد',
    'toast.appliedMany': 'DNS روی {count} آداپتور اعمال شد',
    'toast.dhcpOne': '«{adapter}» به DHCP برگردانده شد',
    'toast.dhcpMany': '{count} آداپتور به DHCP برگردانده شد',
    'toast.noActiveAdapter': 'هیچ آداپتور فعالی پیدا نشد',
    'toast.noRememberedDns': 'برای این آداپتور DNS قبلی به خاطر سپرده نشده است',
    'toast.flushed': 'حافظهٔ نهان DNS پاک شد',
    'toast.flushFailed': 'پاک‌سازی ناموفق بود: {error}',
    'toast.noAdaptersToReset': 'هیچ آداپتوری برای بازنشانی پیدا نشد',
    'toast.allReset': 'همهٔ آداپتورها به DHCP برگردانده شدند',
    'toast.resetFailed': 'بازنشانی ناموفق بود: {error}',
    'toast.saveFailed': 'ذخیره ناموفق بود: {error}',
    'toast.nameRequired': 'نام و DNS اصلی الزامی است',
    'toast.badPrimary': 'DNS اصلی باید یک نشانی IPv4 معتبر باشد',
    'toast.badAlt': 'DNS جایگزین باید یک نشانی IPv4 معتبر باشد',
    'toast.duplicate': 'سروری با نام «{name}» از قبل وجود دارد',
    'toast.updated': '«{name}» به‌روزرسانی شد',
    'toast.added': '«{name}» اضافه شد',

    // Home
    'home.customActive': 'DNS سفارشی فعال است',
    'home.dhcpDefault': 'DHCP (پیش‌فرض)',
    'home.hintReset':
        'برای بازگشت به DHCP کلیک کنید — این DNS به خاطر سپرده می‌شود',
    'home.hintRestore': 'برای بازگردانی «{name}» کلیک کنید',
    'home.hintApplyFirst': 'ابتدا از برگهٔ سرورها یک DNS اعمال کنید',
    'home.hintNoAdapter': 'هیچ آداپتور شبکهٔ فعالی پیدا نشد',
    'home.noActiveAdapter': 'آداپتور فعالی نیست',
    'home.automatic': 'خودکار (بدون DNS سفارشی)',
    'home.refreshStatus': 'به‌روزرسانی وضعیت',
    'home.inUse': 'سرورهای DNS در حال استفاده',
    'home.noAdapters': 'هیچ آداپتوری پیدا نشد',
    'home.flush': 'پاک‌کردن حافظهٔ نهان DNS',
    'home.activeAdapterTitle': 'آداپتور فعال (مسیر پیش‌فرض)',
    'home.staticTitle': 'سرورها به‌صورت دستی تنظیم شده‌اند (نه از DHCP)',
    'home.staticBadge': 'ثابت',

    // Servers
    'servers.title': 'سرورها',
    'servers.search': 'جست‌وجوی سرور بر اساس نام یا آدرس…',
    'servers.sortTitle': 'مرتب‌سازی سرورها',
    'servers.sortDefault': 'ترتیب پیش‌فرض',
    'servers.sortName': 'نام',
    'servers.sortPing': 'پینگ',
    'servers.benchmark': 'بنچمارک همه',
    'servers.benchmarking': 'در حال بنچمارک…',
    'servers.benchTarget': 'نشانی هدف بنچمارک',
    'servers.benchTargetHint':
        'نام میزبانی که از هر سرور DNS خواسته می‌شود resolve کند — همان تنظیم «هدف بنچمارک» در CLI.',
    'servers.saved': 'پیکربندی‌های ذخیره‌شده',
    'servers.presets': 'پیش‌تنظیم‌های داخلی',
    'servers.noSavedMatch': 'هیچ سرور ذخیره‌شده‌ای با «{query}» پیدا نشد',
    'servers.noSavedYet':
        'هنوز سروری ذخیره نشده — با دکمهٔ بالا یکی اضافه کنید',
    'servers.noPresetMatch': 'هیچ پیش‌تنظیمی با «{query}» پیدا نشد',
    'servers.pingBadge': 'پینگ',
    'servers.timeoutBadge': 'بدون پاسخ',
    'servers.errorBadge': 'خطا',
    'servers.measuring': 'در حال سنجش تأخیر…',
    'servers.pingTitle': 'پینگ این سرور',
    'servers.ms': '{n} ms',
    'servers.applyTo': 'اعمال روی آداپتورها',
    'servers.allAdapters': 'همهٔ آداپتورها',
    'servers.deleteConfirm': '«{name}» حذف شود؟',
    'form.new': 'سرور جدید',
    'form.edit': 'ویرایش «{name}»',
    'form.namePh': 'نام (مثلاً ارائه‌دهندهٔ من)',
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
        'بی‌درنگ اعمال می‌شود — نیازی به راه‌اندازی دوباره نیست.',
    'settings.maintenance': 'نگه‌داری',
    'settings.maintenanceDesc':
        'تنظیم‌های دستی DNS را از همهٔ آداپتورها برمی‌دارد و آن‌ها را به پیکربندی خودکار (DHCP) برمی‌گرداند.',
    'settings.resetAll': 'بازنشانی همهٔ آداپتورها به DHCP',
    'settings.resetConfirm':
        'بازنشانی DNS به حالت خودکار (DHCP) روی همهٔ آداپتورها؟',
    'settings.reset': 'بازنشانی',
    'settings.about': 'درباره',
    'settings.aboutSuffix':
        ' (سوییچ DNS) — تغییر DNSها با یک کلیک. آزاد و متن‌باز با پروانهٔ MIT.',
    'settings.inspirationBefore':
        'بخش‌هایی از این برنامه (الگوریتم بنچمارک تأخیر DNS و ایدهٔ پیش‌تنظیم‌های سرور) از پروژهٔ متن‌باز ',
    'settings.inspirationAfter': ' الهام گرفته است. سپاسگزاریم!',
    'settings.privacy': 'حریم خصوصی',
    'settings.privacyBody':
        'DNSS کاملاً آفلاین اجرا می‌شود: نه تله‌متری، نه آنالیتیکس، و هیچ درخواست شبکه‌ای جز بنچمارک‌هایی که خودتان اجرا می‌کنید.',
};

export default fa;
