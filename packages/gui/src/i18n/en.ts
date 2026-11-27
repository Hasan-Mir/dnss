/**
 * English messages — the source of truth for the app's message keys.
 *
 * To add or change a message: edit this file, then the TypeScript compiler
 * points at every other language dictionary (`fa.ts`, …) that needs the same
 * key. To add a whole language, see `index.ts`.
 */
const en = {
    // Window chrome
    'window.minimize': 'Minimize',
    'window.maximize': 'Maximize',
    'window.restore': 'Restore',
    'window.close': 'Close to tray',

    // Header / navigation
    'app.tagline': 'DNS Switcher',
    'app.toggleTheme': 'Toggle theme',
    'app.toggleLang': 'Switch language',
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
    'common.applied': 'Applied',
    'common.delete': 'Delete',
    'common.remove': 'Remove',
    'common.save': 'Save',
    'common.update': 'Update',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.default': 'default',
    'common.active': 'Active',
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
    'toast.nameTooLong': 'Name must be 64 characters or fewer',
    'toast.badPrimary': 'Primary DNS must be a valid IPv4 address',
    'toast.badAlt': 'Alternative DNS must be a valid IPv4 address',
    'toast.duplicate': 'A server named "{name}" already exists',
    'toast.updated': 'Updated "{name}"',
    'toast.added': 'Added "{name}"',
    'toast.presetRemoved': 'Removed "{name}" from the presets',
    'toast.settingsExported': 'Exported settings.json',
    'toast.settingsCopied': 'Copied settings.json to clipboard',
    'toast.settingsImported': 'Imported settings ({count} saved server(s))',
    'toast.settingsImportFailed': 'Import failed: {error}',
    'toast.settingsExportFailed': 'Export failed: {error}',
    'toast.settingsCopyFailed': 'Could not copy to clipboard',

    // Home
    'home.customActive': 'Custom DNS active',
    'home.dhcpDefault': 'Automatic (DHCP)',
    'home.protectAction': 'Restore DNS',
    'home.disconnectAction': 'Disconnect to DHCP',
    'home.disconnectTooltip':
        'Switches the active adapter back to automatic DHCP DNS while remembering your current custom DNS. Same action as turning off the power switch above.',
    'home.restoreTooltip':
        'Reapplies your last remembered custom DNS on the active adapter. Same action as turning on the power switch above.',
    'home.chooseServer': 'Choose a server',
    'home.hintReset': 'Switch back to automatic DHCP — current DNS is saved',
    'home.hintRestore': 'Restore “{name}” on this adapter',
    'home.hintApplyFirst': 'Pick a DNS server from Servers to get started',
    'home.hintNoAdapter': 'No active network adapter detected',
    'home.noActiveAdapter': 'No active adapter',
    'home.automatic': 'Automatic (DHCP resolver)',
    'home.refreshStatus': 'Refresh',
    'home.inUse': 'Network adapters',
    'home.noAdapters': 'No adapters detected',
    'home.flush': 'Flush DNS cache',
    'home.activeAdapterTitle': 'Active adapter (default route)',
    'home.staticTitle': 'Servers pinned statically (not from DHCP)',
    'home.staticBadge': 'Static',
    'home.dhcpBadge': 'DHCP',

    // Servers
    'servers.title': 'Servers',
    'servers.search': 'Search by name or IPv4…',
    'servers.filterAll': 'All',
    'servers.filterCustom': 'Custom',
    'servers.filterBuiltin': 'Built-in',
    'servers.sortTitle': 'Sort servers',
    'servers.sortDefault': 'Default',
    'servers.sortName': 'Name',
    'servers.sortPing': 'Latency',
    'servers.benchmark': 'Benchmark all',
    'servers.benchmarking': 'Benchmarking…',
    'servers.benchTarget': 'Benchmark target',
    'servers.benchTargetHint':
        'Hostname resolved during latency checks (shared with CLI behavior).',
    'servers.vpnFakeIpWarning':
        'VPN FakeIP (198.18.x.x) intercepted the DNS benchmark. Pause VPN/TUN FakeIP mode to measure real DNS latency.',
    'servers.vpnHijackWarning':
        'Multiple resolvers returned sub-5 ms responses from the same IP. Your active VPN/TUN adapter ({adapter}) is likely intercepting UDP/53 and TCP locally — pause TUN mode for accurate results.',
    'servers.benchFailedSummary': 'Benchmark failed: {reason}',
    'servers.breakdownTooltip':
        '{address} · DNS {resolve} ms + TCP {connect} ms',
    'servers.noSavedMatch': 'No custom servers match "{query}"',
    'servers.noSavedYet': 'No custom servers yet — add one to save it locally',
    'servers.noPresetMatch': 'No presets match “{query}”',
    'servers.pingBadge': '—',
    'servers.timeoutBadge': 'Timeout',
    'servers.errorBadge': 'Error',
    'servers.measuring': 'Measuring latency…',
    'servers.pingTitle': 'Ping this server',
    'servers.ms': '{n} ms',
    'servers.applyTo': 'Target adapters',
    'servers.applyChooseAdapters': 'Choose target adapters',
    'servers.allAdapters': 'All adapters',
    'servers.deleteConfirm': 'Delete “{name}”?',
    'servers.removePresetConfirm': 'Hide “{name}” from presets?',
    'servers.removePresetHint': 'You can restore hidden presets in Settings.',
    'form.new': 'Add custom server',
    'form.edit': 'Edit “{name}”',
    'form.nameLabel': 'Name',
    'form.primaryLabel': 'Primary IPv4',
    'form.altLabel': 'Alternative IPv4 (optional)',
    'form.namePh': 'e.g. Office DNS',
    'form.primaryPh': '1.1.1.1',
    'form.altPh': '1.0.0.1',

    // Settings
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.appearanceDesc': 'Choose how DNSS looks on your desktop.',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.system': 'System',
    'settings.accent': 'Accent color',
    'settings.accentDesc':
        'Pick a curated preset or dial in any custom color from the spectrum.',
    'settings.accentHue': 'Hue',
    'settings.accentSat': 'Saturation',
    'settings.accentReset': 'Reset',
    'settings.font': 'Font family',
    'settings.fontDesc':
        'Choose your preferred UI typeface (Persian text always uses Vazirmatn).',
    'settings.fontSize': 'Font size',
    'settings.fontSizeDesc':
        'Adjust text size across the desktop app and tray popover.',
    'settings.language': 'Language',
    'settings.languageHint': 'Applies immediately without restarting.',
    'settings.backup': 'Settings & backup (settings.json)',
    'settings.backupDesc':
        'Export, import, or edit your unified VS Code-style settings.json — synced with the CLI (~/.dnss/settings.json) including saved DNS servers.',
    'settings.exportJson': 'Export JSON',
    'settings.importJson': 'Import JSON',
    'settings.editJson': 'Open settings.json',
    'settings.jsonModalTitle': 'settings.json',
    'settings.jsonModalHint':
        'Edit or paste a DNSS settings.json file. Changes apply immediately and sync with the CLI.',
    'settings.copyJson': 'Copy',
    'settings.applyJson': 'Apply & Save',
    'settings.maintenance': 'Network maintenance',
    'settings.maintenanceDesc':
        'Remove static DNS servers from every adapter and return to automatic DHCP.',
    'settings.resetAll': 'Reset all to DHCP',
    'settings.resetConfirm': 'Reset DNS to automatic (DHCP) on ALL adapters?',
    'settings.reset': 'Reset all',
    'settings.hiddenPresets': 'Hidden presets',
    'settings.hiddenPresetsDesc':
        'These built-in presets are currently hidden from the Servers list:',
    'settings.restorePresets': 'Restore presets',
    'settings.about': 'About',
    'settings.repoLabel': 'Repository',
    'settings.aboutSuffix':
        ' (DNS Switcher) — switch DNS resolvers in one click. Free and open source, MIT licensed.',
    'settings.inspirationBefore':
        'Latency benchmarking and preset curation were inspired by the open-source ',
    'settings.inspirationAfter': ' project.',
    'settings.privacy': 'Privacy',
    'settings.privacyBody':
        'DNSS runs offline. No telemetry, no analytics, and no network requests other than DNS benchmarks you trigger.',

    // System Tray Popover
    'tray.pin': 'Pin window (stay open when clicking outside)',
    'tray.unpin': 'Unpin window (auto-hide when clicking outside)',
    'tray.openApp': 'Open full app',
    'tray.quit': 'Quit DNSS',
    'tray.protected': 'Protected',
    'tray.dhcp': 'DHCP',
    'tray.targetActive': 'Active ({name})',
    'tray.targetAll': 'All adapters ({count})',
    'tray.targetTooltip':
        'Target network adapter(s) updated when you click Apply',
    'tray.addCustom': 'Custom',
    'tray.benchmark': 'Benchmark all',
    'tray.benchmarking': 'Benchmarking…',
    'tray.customTitle': 'Add custom server',
    'tray.resetDhcp': 'Reset DHCP',
    'tray.restore': 'Restore',
    'tray.flush': 'Flush',
    'tray.noMatches': 'No servers match "{query}"',
};

export type Dict = typeof en;
export default en;
