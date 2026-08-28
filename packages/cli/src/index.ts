#!/usr/bin/env node
/**
 * DNSS (DNS Switch) - CLI
 *
 * A cross-platform DNS changer with:
 *  - Saved DNS configurations (persisted in ~/.dnss/configs.json)
 *  - Built-in presets (Cloudflare, Google, AdGuard, Shecan, ...)
 *  - Apply / reset (DHCP) per adapter or for all adapters
 *  - Show current DNS settings
 *
 * Changing DNS is a system-level operation, so the tool automatically
 * relaunches itself with administrator/sudo privileges when needed.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

import {
    benchmarkPresets,
    DNS_PRESETS,
    type DnsConfig,
    type DnsPreset,
    type OsType,
    getOsType,
    loadConfigs,
    removeConfig,
    saveConfigs,
    validateIPv4,
} from '@seymi/dnss-core';

function getOS(): OsType {
    return getOsType();
}

/**
 * Parse a PowerShell `ConvertTo-Json` string list into non-empty strings.
 * A single result is emitted as a bare JSON string rather than a
 * one-element array, so both shapes must be handled.
 */
function parsePowershellStringList(output: string): string[] {
    try {
        const parsed: unknown = JSON.parse(output);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        return items.filter(
            (item): item is string =>
                typeof item === 'string' && item.trim() !== ''
        );
    } catch {
        return [];
    }
}

/**
 * Page size for list prompts: large enough that every option is always
 * rendered at once — no scrollable/circular list, no "page X of Y" hints.
 */
const LIST_PAGE_SIZE = 100;

// Sentinel value marking the "All adapters" bulk-apply choice in the adapter
// selection list (never a real adapter name).
const ALL_ADAPTERS = '__all_adapters__';

/**
 * Normalize a PowerShell JSON value (array, single string, or missing) into
 * a list of unique, non-empty server strings.
 */
function parseServerList(value: unknown): string[] {
    let items: unknown[] = [];
    if (Array.isArray(value)) {
        items = value;
    } else if (typeof value === 'string') {
        items = [value];
    }
    const servers: string[] = [];
    for (const item of items) {
        if (typeof item !== 'string') {
            continue;
        }
        const trimmed = item.trim();
        if (trimmed !== '' && !servers.includes(trimmed)) {
            servers.push(trimmed);
        }
    }
    return servers;
}

/**
 * Query the DNS status of *all* Windows adapters with a single PowerShell
 * invocation. The per-adapter `getCurrentDNS` spawns PowerShell once per
 * adapter, which made flows like "Show currently used DNS configs" take
 * seconds per adapter; batching brings the whole table back to one
 * process startup while staying locale-independent.
 */
function getCurrentDNSWindowsAll(): {
    name: string;
    primary?: string;
    alternative?: string;
}[] {
    const script = [
        '$dns = @{};',
        'Get-DnsClientServerAddress | ForEach-Object { $dns[$_.InterfaceAlias] = @($dns[$_.InterfaceAlias]) + @($_.ServerAddresses) };',
        '$result = @();',
        'Get-NetAdapter | ForEach-Object {',
        '  $p = Get-ItemProperty -Path ("HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\" + $_.InterfaceGuid) -ErrorAction SilentlyContinue;',
        '  $result += [PSCustomObject]@{ name = $_.Name; inUse = @($dns[$_.Name]); static = @(@($p.NameServer) + @($p.ProfileNameServer)) }',
        '};',
        '$result | ConvertTo-Json -Compress -Depth 3',
    ].join(' ');
    const output = execFileSync(
        'powershell',
        ['-NoProfile', '-Command', script],
        {
            encoding: 'utf-8',
        }
    );
    const parsed: unknown = JSON.parse(output);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.flatMap((item) => {
        if (typeof item !== 'object' || item === null) {
            return [];
        }
        const entry = item as {
            name?: unknown;
            inUse?: unknown;
            static?: unknown;
        };
        if (typeof entry.name !== 'string') {
            return [];
        }
        // Statically configured servers first (they are what the user set),
        // then anything in use that is not among them. Dedupe across the two
        // lists: without it a server present in both showed up as the
        // primary *and* the alternative.
        const servers = [
            ...new Set([
                ...parseServerList(entry.static),
                ...parseServerList(entry.inUse),
            ]),
        ].filter((ip) => validateIPv4(ip));
        if (servers.length === 0) {
            return [{ name: entry.name }];
        }
        return [
            {
                name: entry.name,
                primary: servers[0],
                alternative: servers[1],
            },
        ];
    });
}

/**
 * Retrieve available network adapters.
 */
function getNetworkAdapters(): string[] {
    const osType = getOS();
    try {
        if (osType === 'windows') {
            // Locale-independent: netsh output columns are localized and its
            // header can wrap, which corrupts the old "last column" text
            // heuristic (it even produced phantom adapters named like the
            // localized header). Get-NetAdapter gives stable JSON property
            // names instead.
            const output = execFileSync(
                'powershell',
                [
                    '-NoProfile',
                    '-Command',
                    'Get-NetAdapter | Select-Object -ExpandProperty Name | ConvertTo-Json',
                ],
                { encoding: 'utf-8' }
            );
            return parsePowershellStringList(output);
        } else if (osType === 'linux') {
            const output = execSync('nmcli device status', {
                encoding: 'utf-8',
            });

            return output
                .split('\n')
                .slice(1)
                .map((line) => line.split(/\s+/)[0])
                .filter(Boolean);
        } else if (osType === 'mac') {
            const output = execSync('networksetup -listallnetworkservices', {
                encoding: 'utf-8',
            });

            return (
                output
                    .split('\n')
                    .slice(1)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    // Disabled services are prefixed with "*"; passing such a
                    // name to networksetup -setdnsservers fails.
                    .filter((line) => !line.startsWith('*'))
            );
        }
    } catch (error) {
        console.error(chalk.red('Error detecting network adapters:'), error);
        return [];
    }

    return [];
}

/**
 * Retrieve the current DNS settings from the system for a specific adapter.
 * For Windows, it captures both the primary and alternative DNS servers.
 */
function getCurrentDNS(adapter?: string): DnsConfig | null {
    const osType = getOS();
    try {
        if (osType === 'windows') {
            // Locale-independent: netsh output text is localized, and the old
            // English-string parser silently fell back to a greedy IPv4
            // regex that mislabeled DHCP-provided servers as statically
            // configured. Read the same sources the GUI uses instead:
            // in-use servers via Get-DnsClientServerAddress (both families)
            // and statically configured ones via the Tcpip registry values.
            const alias = adapter ? adapter.trim() : '';
            const escaped = alias.replace(/'/g, "''");
            const aliasArg = alias ? ` -InterfaceAlias '${escaped}'` : '';
            const script = [
                `$guids = @((Get-NetAdapter${aliasArg}) | Select-Object -ExpandProperty InterfaceGuid);`,
                `$dns = @(Get-DnsClientServerAddress${aliasArg} | Select-Object -ExpandProperty ServerAddresses);`,
                `$ns = $guids | ForEach-Object { $p = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\$_" -ErrorAction SilentlyContinue; @($p.NameServer, $p.ProfileNameServer) -join ',' } | ForEach-Object { $_ -split ',' };`,
                '[PSCustomObject]@{ inUse = @($dns); static = @($ns) } | ConvertTo-Json -Compress',
            ].join(' ');
            const output = execFileSync(
                'powershell',
                ['-NoProfile', '-Command', script],
                { encoding: 'utf-8' }
            );
            const parsed: unknown = JSON.parse(output);
            const status = parsed as { inUse?: unknown; static?: unknown };
            // The CLI (like the presets) is IPv4-scoped: without the filter a
            // dual-stack adapter's IPv6 resolvers would populate primary and
            // break preset equality checks.
            const servers = [
                ...new Set([
                    ...parseServerList(status.static),
                    ...parseServerList(status.inUse),
                ]),
            ].filter((ip) => validateIPv4(ip));
            if (servers.length > 0) {
                return {
                    name: 'Current DNS',
                    primary: servers[0],
                    alternative: servers[1] || undefined,
                };
            }
        } else if (osType === 'linux') {
            const args = ['dev', 'show'];
            if (adapter) {
                args.push(adapter);
            }
            const output = execFileSync('nmcli', args, { encoding: 'utf-8' });
            const dnsEntries = output
                .split('\n')
                .filter((line) => line.startsWith('IP4.DNS'))
                .map((line) => line.split(':')[1]?.trim())
                .filter(Boolean);
            if (dnsEntries.length > 0) {
                return {
                    name: 'Current DNS',
                    primary: dnsEntries[0],
                    alternative: dnsEntries[1] || undefined,
                };
            }
        } else if (osType === 'mac') {
            if (adapter) {
                const output = execFileSync(
                    'networksetup',
                    ['-getdnsservers', adapter.trim()],
                    { encoding: 'utf-8' }
                );
                if (output.includes("There aren't any DNS Servers set")) {
                    return null;
                }
                const dnsEntries = output
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => validateIPv4(line));
                if (dnsEntries.length > 0) {
                    return {
                        name: 'Current DNS',
                        primary: dnsEntries[0],
                        alternative: dnsEntries[1] || undefined,
                    };
                }
            } else {
                // No shell pipeline: scutil is run directly and filtered
                // here. Only true `nameserver[N]` entries are accepted (this
                // also skips `if_nameserver` lines), every value must
                // validate, and duplicates are removed in order.
                const output = execFileSync('scutil', ['--dns'], {
                    encoding: 'utf-8',
                });
                const dnsEntries = output
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => /^nameserver\[\d+\]/.test(line))
                    .map((line) => line.split(': ')[1]?.trim() ?? '')
                    .filter(
                        (entry, index, all) =>
                            validateIPv4(entry) && all.indexOf(entry) === index
                    );
                if (dnsEntries.length > 0) {
                    return {
                        name: 'Current DNS',
                        primary: dnsEntries[0],
                        alternative: dnsEntries[1] || undefined,
                    };
                }
            }
        }
    } catch {
        // Treated as "no static DNS configured" in most cases.
        return null;
    }
    return null;
}

/**
 * Resolve a NetworkManager *device* (e.g. "wlan0") to its active
 * *connection profile* (e.g. "Home-WiFi"). `nmcli con mod` only accepts
 * connection profiles, and the profile name routinely differs from the
 * device name. Falls back to the device name when the device has no active
 * connection, so the following nmcli call fails with nmcli's own error.
 */
function resolveLinuxConnection(device: string): string | null {
    try {
        const output = execFileSync(
            'nmcli',
            ['-t', '-f', 'GENERAL.CONNECTION', 'dev', 'show', device],
            { encoding: 'utf-8' }
        );
        const line = output
            .split('\n')
            .find((l) => l.startsWith('GENERAL.CONNECTION:'));
        if (line) {
            // Terse mode escapes ":" inside the value as "\:"; undo it.
            const value = line
                .slice('GENERAL.CONNECTION:'.length)
                .trim()
                .replace(/\\:/g, ':');
            // Verified against real outputs and the man page: for a device
            // with no active connection, `nmcli dev show` renders the value
            // as the "--" placeholder; some terse output paths (e.g. the
            // device *status* table) render it empty instead, so both are
            // treated as "no active connection".
            if (value !== '' && value !== '--') {
                return value;
            }
        }
    } catch {
        // Fall through: unmanaged device or nmcli failure.
    }
    return null;
}

/**
 * Apply the DNS settings to the given network adapter.
 * If config is undefined, set DNS to automatic (DHCP).
 */
function setDNS(adapter: string, config?: DnsConfig) {
    const osType = getOS();
    // Normalized values: the validators accept surrounding whitespace (they
    // trim before matching), so the command line must receive the trimmed
    // form — validate what you execute, execute what you validated.
    const adapterName = adapter.trim();

    // Validate at the point of use: saved configs come from disk and must
    // never be trusted just because they were once entered through the UI.
    if (!isSafeAdapterName(adapter)) {
        console.error(chalk.red(`Refusing unsafe adapter name: "${adapter}"`));
        return;
    }
    if (config) {
        if (!isSafeDnsAddress(config.primary)) {
            console.error(
                chalk.red(
                    `Refusing invalid primary DNS address: "${config.primary}"`
                )
            );
            return;
        }
        if (config.alternative && !isSafeDnsAddress(config.alternative)) {
            console.error(
                chalk.red(
                    `Refusing invalid alternative DNS address: "${config.alternative}"`
                )
            );
            return;
        }
    }

    const logSettingDnsToAuto = () => {
        console.log(
            chalk.yellow(
                `Setting DNS to automatic (DHCP) on adapter "${adapter}"...`
            )
        );
    };

    const logSettingDns = (config: DnsConfig) => {
        console.log(
            chalk.yellow(
                `Setting DNS to ${config.primary} on adapter "${adapter}"...`
            )
        );
    };

    try {
        if (osType === 'windows') {
            // Set-DnsClientServerAddress replaces the *entire* address list
            // in one call: the previous netsh `set dns` + `add dns index=2`
            // pattern left stale entries at index >= 3 active whenever the
            // adapter already had more servers than the new list contains.
            // It also covers both address families, so a stale IPv6 static
            // resolver no longer survives a reset. The adapter name is
            // embedded in a PowerShell single-quoted string ('' escapes).
            const alias = adapterName.replace(/'/g, "''");
            if (!config) {
                logSettingDnsToAuto();
                execFileSync(
                    'powershell',
                    [
                        '-NoProfile',
                        '-Command',
                        `Set-DnsClientServerAddress -InterfaceAlias '${alias}' -ResetServerAddresses`,
                    ],
                    { stdio: 'inherit' }
                );
            } else {
                logSettingDns(config);

                const servers = [config.primary, config.alternative]
                    .filter((s): s is string => Boolean(s))
                    .map((s) => s.trim())
                    .map((s) => `'${s.replace(/'/g, "''")}'`)
                    .join(',');

                execFileSync(
                    'powershell',
                    [
                        '-NoProfile',
                        '-Command',
                        `Set-DnsClientServerAddress -InterfaceAlias '${alias}' -ServerAddresses @(${servers})`,
                    ],
                    { stdio: 'inherit' }
                );
            }
        } else if (osType === 'linux') {
            // nmcli modifies connection profiles, not devices; resolve the
            // device to its active profile first (they often differ).
            const connection = resolveLinuxConnection(adapterName);
            if (!connection) {
                console.error(
                    chalk.red(
                        `Adapter "${adapterName}" has no active NetworkManager connection to modify.`
                    )
                );
                return;
            }
            if (!config) {
                logSettingDnsToAuto();
                // Both steps are required: clearing ipv4.dns removes the
                // static servers, ignore-auto-dns=no lets the DHCP-provided
                // resolvers take over again. Without the first step a former
                // static config silently stayed active ("reset" was a no-op).
                // ipv6 is reset symmetrically so a former IPv6 resolver does
                // not keep answering after the reset.
                execFileSync(
                    'nmcli',
                    [
                        'con',
                        'mod',
                        connection,
                        'ipv4.dns',
                        '',
                        'ipv4.ignore-auto-dns',
                        'no',
                        'ipv6.dns',
                        '',
                        'ipv6.ignore-auto-dns',
                        'no',
                    ],
                    { stdio: 'inherit' }
                );
                execFileSync('nmcli', ['con', 'up', connection], {
                    stdio: 'inherit',
                });
            } else {
                logSettingDns(config);

                const dnsList = [config.primary, config.alternative]
                    .filter((s): s is string => Boolean(s))
                    .map((s) => s.trim())
                    .join(' ');

                // ignore-auto-dns=yes is what actually removes the
                // DHCP-provided resolvers from the chain; without it the
                // selected DNS is only consulted *in addition* to the ISP's.
                // The same is applied to IPv6: auto-learned IPv6 resolvers
                // (RA/RDNSS) would otherwise keep serving AAAA queries and
                // bypass the chosen provider on dual-stack networks.
                execFileSync(
                    'nmcli',
                    [
                        'con',
                        'mod',
                        connection,
                        'ipv4.dns',
                        dnsList,
                        'ipv4.ignore-auto-dns',
                        'yes',
                        'ipv6.dns',
                        '',
                        'ipv6.ignore-auto-dns',
                        'yes',
                    ],
                    {
                        stdio: 'inherit',
                    }
                );
                execFileSync('nmcli', ['con', 'up', connection], {
                    stdio: 'inherit',
                });
            }
        } else if (osType === 'mac') {
            if (!config) {
                logSettingDnsToAuto();
                execFileSync(
                    'networksetup',
                    ['-setdnsservers', adapterName, 'empty'],
                    {
                        stdio: 'inherit',
                    }
                );
            } else {
                logSettingDns(config);

                const dnsList = [config.primary, config.alternative]
                    .filter((s): s is string => Boolean(s))
                    .map((s) => s.trim());

                execFileSync(
                    'networksetup',
                    ['-setdnsservers', adapterName, ...dnsList],
                    { stdio: 'inherit' }
                );
            }
        }

        console.log(chalk.green('✔ DNS settings updated successfully.'));
    } catch (error) {
        console.error(
            chalk.red('Failed to update DNS settings. Run as admin/sudo?'),
            error
        );
    }
}

function isAdmin(): boolean {
    if (getOS() === 'windows') {
        // `net session` fails even for elevated shells when the "Server"
        // (LanmanServer) service is stopped or disabled, which used to make
        // the CLI believe it was not elevated and re-spawn itself forever.
        // `fltmc` requires an elevated token, so its exit status reflects
        // elevation regardless of any optional service.
        try {
            execFileSync('fltmc', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    // POSIX: a process is elevated only when running as root (uid 0).
    // "id -u" alone succeeds for every user, so it proves nothing.
    if (typeof process.getuid === 'function') {
        return process.getuid() === 0;
    }
    try {
        return execSync('id -u', { encoding: 'utf-8' }).trim() === '0';
    } catch {
        return false;
    }
}

/**
 * Defense-in-depth for values that end up in OS commands:
 * - DNS addresses must be valid IPv4 (validated at the point of use, not
 *   only at input time, because saved configs may come from disk).
 * - Adapter names must not contain control characters (newlines, NUL, ...):
 *   those could smuggle extra arguments or corrupt output parsing. Shell
 *   metacharacters stay harmless because every command is spawned with an
 *   argument vector (execFileSync), never through a shell — and an
 *   allowlist would break legitimate non-ASCII adapter names.
 */
function isSafeDnsAddress(value: string): boolean {
    return validateIPv4(value);
}

function isSafeAdapterName(value: string): boolean {
    const name = value.trim();
    return name.length > 0 && !/[\u0000-\u001f\u007f]/.test(name);
}

/**
 * Marker argument passed to the elevated child process. If that child still
 * fails the elevation check, it must abort instead of spawning yet another
 * elevated copy (which would create an endless UAC/sudo loop).
 */
const ELEVATED_FLAG = '--dnss-elevated';

/**
 * POSIX single-quote escaping for paths passed to `sudo` via execSync.
 */
function quoteShell(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function elevatePrivileges() {
    // process.argv[1] can be relative (e.g. "index.js"). The elevated process
    // starts in C:\Windows\System32, so a relative path makes node fail
    // instantly ("Cannot find module") and the window closes before anything
    // is visible. Always resolve to an absolute path.
    const scriptPath = path.resolve(process.argv[1]);
    const osType = getOS();

    try {
        if (osType === 'windows') {
            // Security: launch this exact node binary directly.
            //  - No intermediate cmd.exe: cmd resolves bare "node" from PATH
            //    in the elevated context (a planted node.exe would run as
            //    admin) and expands %VAR% even inside double quotes.
            //  - No intermediate .cmd/.bat file in %TEMP% (classic TOCTOU
            //    elevation trampoline).
            //  - "node" is resolved from PATH in the *elevated* context;
            //    process.execPath pins the interpreter to the exact binary
            //    the user actually ran.
            //
            // The PowerShell snippet is passed base64-encoded (-EncodedCommand,
            // UTF-16LE) because nesting quoting through execSync -> cmd.exe ->
            // powershell -> Start-Process is otherwise unmanageable. The
            // script path is double-quoted inside its PowerShell single-quote
            // token so spaced paths survive Start-Process' argument joining.
            // The script's own directory is used as working directory: the
            // current one may already be deleted or be a UNC path, which
            // makes Start-Process fail.
            const nodeExe = process.execPath;
            const workDir = path.dirname(scriptPath);
            // The elevated run happens in a *new* console window while this
            // terminal blocks: without a notice the user assumes the CLI
            // has hung.
            console.log(
                chalk.cyan(
                    'Administrator privileges are required. A UAC prompt will open; the CLI continues in the new administrator window...'
                )
            );
            const psScript =
                `Start-Process -FilePath '${nodeExe.replace(/'/g, "''")}' ` +
                `-ArgumentList '"${scriptPath.replace(/'/g, "''")}"','${ELEVATED_FLAG}' ` +
                `-WorkingDirectory '${workDir.replace(/'/g, "''")}' ` +
                `-Verb RunAs -Wait -PassThru | ` +
                `ForEach-Object { exit $_.ExitCode }`;
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
            execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
                stdio: 'ignore',
            });
        } else {
            // macOS/Linux: sudo runs the app in this same terminal, so
            // interactive prompts must stay attached (stdio inherit). The
            // absolute node binary path is passed explicitly: sudo's
            // secure_path typically excludes version-manager shims
            // (nvm/fnm/volta), so a bare "node" would fail with
            // "command not found" right after the password prompt.
            execSync(
                `sudo ${quoteShell(process.execPath)} ${quoteShell(scriptPath)} ${ELEVATED_FLAG}`,
                { stdio: 'inherit' }
            );
        }
        process.exit(0);
    } catch (error) {
        // Propagate the elevated child's exit status instead of always
        // reporting success so wrapper scripts can detect failure.
        const status =
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof (error as { status: unknown }).status === 'number'
                ? (error as { status: number }).status
                : 1;
        console.error(chalk.red('Failed to start with admin privileges.'));
        process.exit(status === 0 ? 1 : status);
    }
}

/**
 * Flow for changing the DNS settings.
 */
async function changeDNSFlow(): Promise<boolean> {
    // Select the network adapter to modify
    const adapters = getNetworkAdapters();
    if (adapters.length === 0) {
        console.error(chalk.red('No network adapters found.'));
        return true;
    }
    const adapterChoices = [
        ...adapters.map((adapter) => ({
            name: adapter,
            value: adapter,
        })),
        { name: 'All adapters', value: ALL_ADAPTERS },
        { name: 'Back to main menu', value: 'escape' },
    ];
    const { adapterChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'adapterChoice',
            message: 'Select the network adapter to change:',
            choices: adapterChoices,
            pageSize: LIST_PAGE_SIZE,
        },
    ]);
    if (adapterChoice === 'escape') {
        // Explicit "back": return straight to the menu, no pause needed.
        return false;
    }
    const adapter = adapterChoice;
    const applyToAll = adapter === ALL_ADAPTERS;
    // The "active" marker is per-adapter, so it is meaningless for a bulk
    // apply; leaving currentDNS undefined simply hides those markers.
    const currentDNS = applyToAll ? undefined : getCurrentDNS(adapter);
    console.log(
        applyToAll
            ? chalk.greenBright('Using adapters: all')
            : chalk.greenBright(`Using adapter: ${adapter}`)
    );

    // Load previously saved configurations
    const configs = loadConfigs();

    type DnsChoice =
        | { kind: 'dhcp' }
        | { kind: 'saved'; index: number }
        | { kind: 'preset'; preset: DnsPreset }
        | { kind: 'escape' };

    // Build choices: DHCP, saved configs, built-in presets.
    // Blank separators create the visual gaps between groups; keeping each
    // header in its own single-line separator row preserves inquirer's row
    // indenting (a literal "\n" inside the text would break out of it).
    const dnsChoices = [
        { name: 'No DNS (Use DHCP)', value: { kind: 'dhcp' } },
        new inquirer.Separator(' '),
        new inquirer.Separator(chalk.cyan.bold('── Saved configurations ──')),
        ...configs.map((cfg, index) => {
            const altText = cfg.alternative ? `, alt: ${cfg.alternative}` : '';
            const isCurrent =
                currentDNS &&
                cfg.primary === currentDNS.primary &&
                cfg.alternative === currentDNS.alternative;
            return {
                name: isCurrent
                    ? chalk.green(
                          `${cfg.name}: ${cfg.primary}${altText}  ● active`
                      )
                    : `${cfg.name}: ${cfg.primary}${altText}`,
                value: { kind: 'saved', index } as DnsChoice,
            };
        }),

        // Leading blank row = a visual gap between the two groups.
        new inquirer.Separator(' '),
        new inquirer.Separator(chalk.cyan.bold('── Built-in presets ──')),
        ...DNS_PRESETS.map((preset) => {
            const altText = preset.alternative
                ? `, alt: ${preset.alternative}`
                : '';
            const isCurrent =
                currentDNS && preset.primary === currentDNS.primary;
            return {
                name: isCurrent
                    ? chalk.green(
                          `${preset.name}: ${preset.primary}${altText}  ● active`
                      )
                    : `${preset.name}: ${preset.primary}${altText}`,
                value: { kind: 'preset', preset } as DnsChoice,
            };
        }),
        new inquirer.Separator(),
        { name: 'Back to main menu', value: { kind: 'escape' } },
    ];

    const { dnsChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'dnsChoice',
            message: 'Select a DNS configuration to apply:',
            choices: dnsChoices,
            pageSize: LIST_PAGE_SIZE,
        },
    ]);
    let selectedConfig: DnsConfig | undefined;
    if (dnsChoice.kind === 'escape') {
        // Explicit "back": return straight to the menu, no pause needed.
        return false;
    } else if (dnsChoice.kind === 'preset') {
        selectedConfig = {
            name: dnsChoice.preset.name,
            primary: dnsChoice.preset.primary,
            alternative: dnsChoice.preset.alternative,
        };
    } else if (dnsChoice.kind === 'saved') {
        selectedConfig = configs[dnsChoice.index];
    }

    // Confirm and apply the settings
    const confirm = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'proceed',
            message: applyToAll
                ? 'Apply the selected DNS setting to ALL adapters?'
                : `Apply the selected DNS setting to adapter "${adapter}"?`,
            default: true,
        },
    ]);
    if (confirm.proceed) {
        if (!applyToAll) {
            setDNS(adapter, selectedConfig);
            return true;
        }
        // Bulk apply: mirror resetAllDNS semantics — collect failures so a
        // single problematic adapter (e.g. a disconnected virtual NIC) does
        // not abort the remaining ones.
        const failures: string[] = [];
        for (const name of adapters) {
            try {
                setDNS(name, selectedConfig);
            } catch (error) {
                failures.push(
                    `${name}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
        if (failures.length > 0) {
            console.error(
                chalk.red(
                    `Failed on ${failures.length} adapter(s). Run as admin/sudo?`
                )
            );
            for (const failure of failures) {
                console.error(chalk.red(`  - ${failure}`));
            }
        } else {
            console.log(chalk.green('✔ DNS settings applied to all adapters.'));
        }
        return true;
    }
    console.log(chalk.yellow('Operation cancelled.'));
    return false;
}

/**
 * Flow for adding a new DNS configuration.
 */
async function addDNSConfigFlow(): Promise<boolean> {
    console.log(chalk.greenBright.bold('\nAdd a New DNS Configuration'));
    console.log(
        chalk.gray('(Leave the name empty and press Enter to cancel.)\n')
    );

    const { name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Configuration name (e.g. "Google", "Cloudflare"):',
        },
    ]);
    if (name.trim() === '') {
        // Empty name is the explicit cancel: straight back to the menu.
        return false;
    }

    const { primary, alternative } = await inquirer.prompt([
        {
            type: 'input',
            name: 'primary',
            message: 'Primary DNS server (IPv4):',
            validate: (input: string) =>
                validateIPv4(input)
                    ? true
                    : 'Please enter a valid IPv4 address.',
        },
        {
            type: 'input',
            name: 'alternative',
            message: 'Alternative DNS server (IPv4) (optional):',
            validate: (input: string) => {
                if (input.trim() === '') return true;
                return validateIPv4(input)
                    ? true
                    : 'Please enter a valid IPv4 address or leave blank.';
            },
        },
    ]);

    const newConfig: DnsConfig = {
        name: name.trim(),
        primary: primary.trim(),
        alternative: alternative?.trim() || undefined,
    };

    const configs = loadConfigs();
    if (
        configs.some(
            (c) => c.name.toLowerCase() === newConfig.name.toLowerCase()
        )
    ) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: `A configuration named "${newConfig.name}" already exists. Overwrite it?`,
                default: false,
            },
        ]);
        if (!overwrite) {
            console.log(chalk.yellow('Operation cancelled.'));
            return false;
        }
    }

    saveConfigs([
        ...configs.filter(
            (c) => c.name.toLowerCase() !== newConfig.name.toLowerCase()
        ),
        newConfig,
    ]);
    console.log(chalk.green('✔ Configuration saved successfully.'));
    return true;
}

/**
 * Flow for removing a saved DNS configuration.
 */
async function removeDNSConfigFlow(): Promise<boolean> {
    const configs = loadConfigs();
    if (configs.length === 0) {
        console.log(chalk.yellow('No saved DNS configurations found.'));
        return true;
    }

    const { name } = await inquirer.prompt([
        {
            type: 'list',
            name: 'name',
            message: 'Select the configuration to remove:',
            choices: [
                ...configs.map((cfg) => ({
                    name: `${cfg.name}: ${cfg.primary}${cfg.alternative ? `, alt: ${cfg.alternative}` : ''}`,
                    value: cfg.name,
                })),
                new inquirer.Separator(),
                { name: 'Back to main menu', value: null },
            ],
            pageSize: LIST_PAGE_SIZE,
        },
    ]);

    if (!name) {
        // Explicit "back": return straight to the menu, no pause needed.
        return false;
    }

    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to remove "${name}"?`,
            default: false,
        },
    ]);

    if (confirm) {
        removeConfig(name);
        console.log(chalk.green('✔ Configuration removed successfully.'));
        return true;
    }
    console.log(chalk.yellow('Operation cancelled.'));
    return false;
}

/**
 * Flow for editing a saved DNS configuration.
 */
async function editDNSConfigFlow(): Promise<boolean> {
    const configs = loadConfigs();
    if (configs.length === 0) {
        console.log(chalk.yellow('No saved DNS configurations found.'));
        return true;
    }

    const { editIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'editIndex',
            message: 'Select the configuration to edit:',
            choices: [
                ...configs.map((cfg, index) => ({
                    name: `${cfg.name}: ${cfg.primary}${cfg.alternative ? `, alt: ${cfg.alternative}` : ''}`,
                    value: index,
                })),
                new inquirer.Separator(),
                { name: 'Back to main menu', value: -1 },
            ],
            pageSize: LIST_PAGE_SIZE,
        },
    ]);

    if (editIndex === -1) {
        // Explicit "back": return straight to the menu, no pause needed.
        return false;
    }

    const editedConfig = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'New configuration name:',
            default: configs[editIndex].name,
            validate: (input: string) =>
                input.trim() !== '' ? true : 'Name cannot be empty.',
        },
        {
            type: 'input',
            name: 'primary',
            message: 'New primary DNS server:',
            default: configs[editIndex].primary,
            validate: (input: string) =>
                validateIPv4(input) ? true : 'Enter a valid IPv4 address.',
        },
        {
            type: 'input',
            name: 'alternative',
            message: 'New alternative DNS server (optional):',
            default: configs[editIndex].alternative || '',
            validate: (input: string) =>
                input.trim() === '' || validateIPv4(input)
                    ? true
                    : 'Enter a valid IPv4 address.',
        },
    ]);

    configs[editIndex] = {
        name: editedConfig.name.trim(),
        primary: editedConfig.primary.trim(),
        alternative: editedConfig.alternative?.trim() || undefined,
    };

    saveConfigs(configs);
    console.log(chalk.green('✔ Configuration updated successfully.'));
    return true;
}

function resetAllDNS() {
    const osType = getOS();
    const adapters = getNetworkAdapters();

    if (adapters.length === 0) {
        console.error(chalk.red('No network adapters found.'));
        return;
    }

    // Collect failures per adapter instead of aborting at the first one: a
    // single disconnected virtual adapter must not prevent resetting every
    // other adapter, and the summary must not claim success when adapters
    // were skipped.
    const failures: string[] = [];

    adapters.forEach((adapter) => {
        console.log(chalk.yellow(`Resetting DNS on adapter "${adapter}"...`));

        if (!isSafeAdapterName(adapter)) {
            console.error(
                chalk.red(`Refusing unsafe adapter name: "${adapter}"`)
            );
            failures.push(`${adapter}: unsafe adapter name`);
            return;
        }

        try {
            if (osType === 'windows') {
                // Set-DnsClientServerAddress -ResetServerAddresses clears
                // static servers for both address families (netsh
                // `interface ip` reset only IPv4).
                execFileSync(
                    'powershell',
                    [
                        '-NoProfile',
                        '-Command',
                        `Set-DnsClientServerAddress -InterfaceAlias '${adapter
                            .trim()
                            .replace(/'/g, "''")}' -ResetServerAddresses`,
                    ],
                    { stdio: 'inherit' }
                );
            } else if (osType === 'linux') {
                const connection = resolveLinuxConnection(adapter);
                if (!connection) {
                    // Disconnected or unmanaged device: there is no active
                    // connection to reset, and it must not fail the bulk
                    // reset for the adapters that actually have one.
                    return;
                }
                // Clear the static servers too — flipping
                // ipv4.ignore-auto-dns alone leaves former static entries
                // active, which made "reset to DHCP" a functional no-op.
                execFileSync(
                    'nmcli',
                    [
                        'con',
                        'mod',
                        connection,
                        'ipv4.dns',
                        '',
                        'ipv4.ignore-auto-dns',
                        'no',
                        'ipv6.dns',
                        '',
                        'ipv6.ignore-auto-dns',
                        'no',
                    ],
                    { stdio: 'inherit' }
                );
                execFileSync('nmcli', ['con', 'up', connection], {
                    stdio: 'inherit',
                });
            } else if (osType === 'mac') {
                execFileSync(
                    'networksetup',
                    ['-setdnsservers', adapter.trim(), 'empty'],
                    { stdio: 'inherit' }
                );
            }
        } catch (error) {
            failures.push(`${adapter}: ${String(error)}`);
        }
    });

    if (failures.length > 0) {
        console.error(
            chalk.red(
                `✖ Failed to reset ${failures.length} adapter(s). Run as admin/sudo?`
            )
        );
        for (const failure of failures) {
            console.error(chalk.red(`  - ${failure}`));
        }
        process.exitCode = 1;
        return;
    }

    console.log(chalk.green('✔ All adapters reset to DHCP.'));
}

/**
 * Flow for showing currently used DNS configurations.
 */
/**
 * Map every known DNS server address (saved configurations + built-in
 * presets) to its display name, so tables can annotate raw addresses like
 * `193.186.32.32` with the configured name (`Bertina`).
 */
function buildDnsNameLookup(): Map<string, string> {
    const lookup = new Map<string, string>();
    const add = (address: string | undefined, name: string) => {
        if (address && !lookup.has(address)) {
            lookup.set(address, name);
        }
    };
    for (const config of loadConfigs()) {
        add(config.primary, config.name);
        add(config.alternative, config.name);
    }
    for (const preset of DNS_PRESETS) {
        add(preset.primary, preset.name);
        add(preset.alternative, preset.name);
    }
    return lookup;
}

/**
 * Format one table cell: the raw address plus its known name, if any.
 */
function formatDnsCell(
    address: string | undefined,
    lookup: Map<string, string>
): string {
    if (!address) {
        return 'N/A';
    }
    const name = lookup.get(address);
    return name ? `${address} (${name})` : address;
}

async function showCurrentDNSConfigsFlow(): Promise<boolean> {
    let rows: {
        name: string;
        primary?: string;
        alternative?: string;
    }[];
    if (getOS() === 'windows') {
        // One PowerShell call for every adapter (the per-adapter
        // getCurrentDNS would spawn one PowerShell process per row).
        rows = getCurrentDNSWindowsAll();
    } else {
        const adapters = getNetworkAdapters();
        rows = adapters.map((adapter) => ({
            name: adapter,
            ...getCurrentDNS(adapter),
        }));
    }
    if (rows.length === 0) {
        console.log(chalk.yellow('No network adapters found.'));
        return true;
    }
    // Annotate raw addresses with their configured name (saved configs and
    // presets), e.g. `193.186.32.32 (Bertina)`.
    const lookup = buildDnsNameLookup();
    console.table(
        rows.map((row) => ({
            Adapter: row.name,
            'Primary DNS': formatDnsCell(row.primary, lookup),
            'Alternative DNS': formatDnsCell(row.alternative, lookup),
        }))
    );
    // The table is the output the user asked for; the main menu loop pauses
    // so it stays readable.
    return true;
}

/**
 * Flow for benchmarking the built-in DNS presets.
 */
async function benchmarkDNSFlow(): Promise<boolean> {
    const { target } = await inquirer.prompt([
        {
            type: 'input',
            name: 'target',
            message: 'Target URL used for the benchmark:',
            default: 'https://www.cloudflare.com',
            validate: (input: string) =>
                input.trim() !== '' ? true : 'Target URL cannot be empty.',
        },
    ]);
    console.log(
        chalk.greenBright(
            'Benchmarking saved configurations and DNS presets (this can take a while)...'
        )
    );
    // Saved configurations are benchmarked alongside the built-in presets:
    // users mostly care about *their* servers (e.g. a local ISP resolver).
    const saved: DnsPreset[] = loadConfigs().map((config) => ({
        id: `saved:${config.name}`,
        name: config.name,
        primary: config.primary,
        alternative: config.alternative,
    }));
    const results = await benchmarkPresets(
        [...saved, ...DNS_PRESETS],
        target.trim()
    );
    console.table(
        results.map((result) => ({
            Name: result.name,
            Server: result.primary,
            'Latency (ms)': result.status === 'ok' ? result.latencyMs : '-',
            Status:
                result.status === 'ok' ? 'ok' : (result.error ?? result.status),
        }))
    );
    // The table is the output; the menu loop pauses so it stays readable.
    return true;
}

function printBanner() {
    console.log(
        chalk.blue.bold(`
  ██████╗ ███╗   ██╗███████╗███████╗
  ██╔══██╗████╗  ██║██╔════╝██╔════╝
  ██║  ██║██╔██╗ ██║███████╗███████╗
  ██║  ██║██║╚██╗██║╚════██║╚════██║
  ██████╔╝██║ ╚████║███████║███████║
  ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚══════╝
`)
    );
    console.log(chalk.blueBright('                 DNS SWITCHER'));
}

/**
 * The main menu loop.
 */
async function mainMenu() {
    console.clear();
    // Printed once per session: the loop must not re-print it on every
    // iteration, otherwise terminals where ANSI clear-screen is unavailable
    // (e.g. classic conhost with VT processing off) stack one banner per
    // menu round-trip.
    printBanner();

    let exit = false;

    while (!exit) {
        let shouldPause = true;
        const { choice } = await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'What would you like to do?',
                choices: [
                    { name: 'Change DNS settings', value: 'change' },
                    { name: 'Add a DNS configuration', value: 'add' },
                    { name: 'Remove a DNS configuration', value: 'remove' },
                    { name: 'Edit a DNS configuration', value: 'edit' },
                    {
                        name: 'Reset all adapters to DHCP (No DNS)',
                        value: 'resetAll',
                    },
                    {
                        name: 'Show currently used DNS configs',
                        value: 'showDNS',
                    },
                    {
                        name: 'Benchmark DNS servers',
                        value: 'benchmark',
                    },
                    { name: 'Exit', value: 'exit' },
                ],
                // Every option stays visible at once (no scrolling).
                pageSize: LIST_PAGE_SIZE,
            },
        ]);
        switch (choice) {
            case 'change':
                shouldPause = await changeDNSFlow();
                break;
            case 'add':
                shouldPause = await addDNSConfigFlow();
                break;
            case 'remove':
                shouldPause = await removeDNSConfigFlow();
                break;
            case 'edit':
                shouldPause = await editDNSConfigFlow();
                break;
            case 'resetAll':
                resetAllDNS();
                shouldPause = true;
                break;
            case 'showDNS':
                shouldPause = await showCurrentDNSConfigsFlow();
                break;
            case 'benchmark':
                shouldPause = await benchmarkDNSFlow();
                break;
            case 'exit':
                exit = true;
                console.log(chalk.greenBright('Goodbye!'));
                break;
        }

        // Flows return false when the user explicitly went back or declined:
        // there is no new output to read, so return straight to the menu
        // instead of demanding another ENTER press.
        if (!exit) {
            if (shouldPause) {
                // Pause before showing the menu again
                await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'continue',
                        message: chalk.gray(
                            'Press ENTER to return to the main menu...'
                        ),
                    },
                ]);
            }
            console.clear();
            printBanner();
            // Re-printed on every menu return: after clear() the screen is
            // empty, and the menu should appear under the banner again.
        }
    }
}

// Start the CLI tool.
(async () => {
    if (!isAdmin()) {
        if (process.argv.includes(ELEVATED_FLAG)) {
            // The elevated child still fails the elevation check (broken
            // detection, blocked fltmc, ...): abort instead of spawning
            // another elevated copy forever.
            console.error(
                chalk.red(
                    'The elevated process is still not recognized as admin; aborting to avoid an elevation loop.'
                )
            );
            process.exit(1);
        }
        console.log(chalk.yellow('Starting with administrator privileges...'));
        elevatePrivileges();
        process.exit(1);
    }
    await mainMenu();
})();
