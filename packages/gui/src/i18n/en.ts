/**
 * English messages — the source of truth for the app's message keys.
 *
 * To add or change a message: edit this file, then the TypeScript compiler
 * points at every other language dictionary (`fa.ts`, …) that needs the same
 * key. To add a whole language, see `index.ts`.
 */
const en = {
    // Header / dock
    'app.tagline': 'DNS Switcher',
    'app.toggleTheme': 'Toggle theme',
    'app.working': 'Working…',
    'dock.home': 'Home',
    'dock.servers': 'Servers',
    'dock.settings': 'Settings',

    // "Open in a browser" fallback card
    'nodesktop.title': 'DNSS desktop app',
    'nodesktop.body':
        "This interface must run inside the DNSS desktop window — the browser cannot talk to the system's network settings.",
    'nodesktop.devPrefix': 'Close this browser tab and start the app with ',
    'nodesktop.devSuffix':
        ' (development) or launch the installed DNSS application.',

    // Shared words
    'common.cancel': 'Cancel',
    'common.apply': 'Apply',
    'common.delete': 'Delete',
    'common.save': 'Save',
    'common.update': 'Update',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.default': 'default',
    'common.na': 'N/A',

    // Toasts (error/details values come from the OS and may stay English)
    'toast.loadSavedFailed': 'Failed to load saved servers: {error}',
    'toast.noAdaptersToConfigure': 'No adapter found to configure',
    'toast.failed': 'Failed: {details}',
    'toast.appliedOne': 'DNS applied to "{adapter}"',
    'toast.appliedMany': 'DNS applied to {count} adapters',
    'toast.dhcpOne': 'Reset to DHCP on "{adapter}"',
    'toast.dhcpMany': 'Reset to DHCP on {count} adapters',
    'toast.noActiveAdapter': 'No active adapter detected',
    'toast.noRememberedDns': 'No previous DNS remembered for this adapter',
    'toast.flushed': 'DNS cache flushed',
    'toast.flushFailed': 'Flush failed: {error}',
    'toast.noAdaptersToReset': 'No adapter found to reset',
    'toast.allReset': 'All adapters reset to DHCP',
    'toast.resetFailed': 'Reset failed: {error}',
    'toast.saveFailed': 'Failed to save: {error}',
    'toast.nameRequired': 'Name and primary DNS are required',
    'toast.badPrimary': 'Primary DNS must be a valid IPv4 address',
    'toast.badAlt': 'Alternative DNS must be a valid IPv4 address',
    'toast.duplicate': 'A server named "{name}" already exists',
    'toast.updated': 'Updated "{name}"',
    'toast.added': 'Added "{name}"',

    // Home
    'home.customActive': 'Custom DNS active',
    'home.dhcpDefault': 'DHCP (default)',
    'home.hintReset': 'Click to reset to DHCP — this DNS will be remembered',
    'home.hintRestore': 'Click to restore “{name}”',
    'home.hintApplyFirst': 'Apply a DNS server from the Servers tab first',
    'home.hintNoAdapter': 'No active network adapter detected',
    'home.noActiveAdapter': 'No active adapter',
    'home.automatic': 'Automatic (no custom resolver)',
    'home.refreshStatus': 'Refresh status',
    'home.inUse': 'DNS servers in use',
    'home.noAdapters': 'No adapters detected',
    'home.flush': 'Flush DNS cache',
    'home.activeAdapterTitle': 'Active adapter (default route)',
    'home.staticTitle': 'Servers pinned statically (not from DHCP)',
    'home.staticBadge': 'static',

    // Servers
    'servers.title': 'Servers',
    'servers.search': 'Search servers by name or address…',
    'servers.sortTitle': 'Sort servers',
    'servers.sortDefault': 'Default order',
    'servers.sortName': 'Name',
    'servers.sortPing': 'Ping',
    'servers.benchmark': 'Benchmark all',
    'servers.benchmarking': 'Benchmarking…',
    'servers.benchTarget': 'Benchmark target URL',
    'servers.benchTargetHint':
        "The hostname each DNS server is asked to resolve — the same knob as the CLI's benchmark target.",
    'servers.saved': 'Saved configurations',
    'servers.presets': 'Built-in presets',
    'servers.noSavedMatch': 'No saved servers match "{query}"',
    'servers.noSavedYet':
        'No saved servers yet — add your own with the button above',
    'servers.noPresetMatch': 'No presets match “{query}”',
    'servers.pingBadge': 'ping',
    'servers.timeoutBadge': 'timeout',
    'servers.errorBadge': 'error',
    'servers.measuring': 'Measuring latency…',
    'servers.pingTitle': 'Ping this server',
    'servers.ms': '{n} ms',
    'servers.applyTo': 'Apply to adapters',
    'servers.allAdapters': 'All adapters',
    'servers.deleteConfirm': 'Delete “{name}”?',
    'form.new': 'New server',
    'form.edit': 'Edit “{name}”',
    'form.namePh': 'Name (e.g. My provider)',
    'form.primaryPh': 'Primary DNS (IPv4)',
    'form.altPh': 'Alternative DNS (optional)',

    // Settings
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.system': 'System',
    'settings.language': 'Language',
    'settings.languageHint': 'Applies immediately — no restart needed.',
    'settings.maintenance': 'Maintenance',
    'settings.maintenanceDesc':
        'Removes static DNS servers from every adapter and switches them back to automatic (DHCP) configuration.',
    'settings.resetAll': 'Reset all adapters to DHCP',
    'settings.resetConfirm': 'Reset DNS to automatic (DHCP) on ALL adapters?',
    'settings.reset': 'Reset',
    'settings.about': 'About',
    'settings.aboutSuffix':
        ' (DNS Switcher) — change your DNS servers in one click. Free and open source, MIT licensed.',
    'settings.inspirationBefore':
        'Parts of this app (the DNS latency benchmark algorithm and the curated server preset ideas) are inspired by the open-source ',
    'settings.inspirationAfter': ' project. Thank you!',
    'settings.privacy': 'Privacy',
    'settings.privacyBody':
        'DNSS runs completely offline. No telemetry, no analytics, no network requests other than the DNS benchmarks you trigger yourself.',
};

export type Dict = typeof en;
export default en;
