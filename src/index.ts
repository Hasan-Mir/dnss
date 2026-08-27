#!/usr/bin/env node
/**
 * DNS Changer CLI for Windows
 *
 * This CLI tool:
 *  - Allows you to add DNS configurations (with a primary and optional alternative)
 *  - Stores these configurations in a file so that they persist across sessions
 *  - Lets you select a saved configuration (or choose "No DNS" to use DHCP) to apply
 *
 * Make sure to run this tool as an administrator (it uses netsh).
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

interface DNSConfig {
    name: string;
    primary: string;
    alternative?: string;
}

// The configuration file path in the user's home directory
const CONFIG_PATH = path.join(os.homedir(), '.dnschanger.json');

function getOS(): 'windows' | 'linux' | 'mac' {
    const platform = os.platform();
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'mac';
    if (platform === 'linux') return 'linux';
    throw new Error('Unsupported OS');
}

/**
 * Load DNS configurations from the config file.
 * If the file doesn't exist, returns an empty array.
 */
function loadConfigs(): DNSConfig[] {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8').trim();
            return data ? JSON.parse(data) : []; // Handle empty file gracefully
        } catch (err) {
            console.error(chalk.red('Error reading configuration file:'), err);
        }
    }
    return [];
}

/**
 * Save the DNS configurations to the config file.
 */
function saveConfigs(configs: DNSConfig[]) {
    try {
        fs.writeFileSync(
            CONFIG_PATH,
            JSON.stringify(configs, null, 2),
            'utf-8'
        );
    } catch (err) {
        console.error(chalk.red('Error saving configuration file:'), err);
    }
}

/**
 * Retrieve available network adapters.
 * For Windows, it uses "netsh interface show interface" and filters out divider lines.
 */
function getNetworkAdapters(): string[] {
    const osType = getOS();
    try {
        if (osType === 'windows') {
            const output = execSync('netsh interface show interface', {
                encoding: 'utf-8',
            });

            return output
                .split('\n')
                .slice(2)
                .filter((line) => !/^-+/.test(line)) // ignore divider lines
                .map((line) =>
                    line
                        .trim()
                        .split(/\s{2,}/)
                        .pop()
                )
                .filter(Boolean) as string[];
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

            return output
                .split('\n')
                .slice(1)
                .map((line) => line.trim())
                .filter(Boolean);
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
function getCurrentDNS(adapter?: string): DNSConfig | null {
    const osType = getOS();
    try {
        if (osType === 'windows') {
            let command = 'netsh interface ip show dns';
            if (adapter) {
                command += ` name="${adapter.trim()}"`;
            }
            const output = execSync(command, { encoding: 'utf-8' });
            const lines = output.split('\n');
            let dnsServers: string[] = [];
            let capture = false;
            for (let line of lines) {
                if (line.includes('Statically Configured DNS Servers:')) {
                    // Try to extract an IP on the same line
                    const parts = line.split(':');
                    if (parts.length > 1) {
                        const ipCandidate = parts[1].trim();
                        if (validateIP(ipCandidate)) {
                            dnsServers.push(ipCandidate);
                        }
                    }
                    capture = true;
                    continue;
                }
                if (capture) {
                    // Stop if the line is empty or not indented
                    if (line.trim() === '' || !line.startsWith(' ')) break;
                    const ipCandidate = line.trim();
                    if (validateIP(ipCandidate)) {
                        dnsServers.push(ipCandidate);
                    }
                }
            }
            if (dnsServers.length > 0) {
                return {
                    name: 'Current DNS',
                    primary: dnsServers[0],
                    alternative: dnsServers[1] || undefined,
                };
            }
        } else if (osType === 'linux') {
            let command = 'nmcli dev show';
            if (adapter) {
                command += ` ${adapter}`;
            }
            command += " | grep 'IP4.DNS'";
            const output = execSync(command, { encoding: 'utf-8' });
            const dnsEntries = output
                .split('\n')
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
                const output = execSync(
                    `networksetup -getdnsservers "${adapter.trim()}"`,
                    {
                        encoding: 'utf-8',
                    }
                );
                if (output.includes("There aren't any DNS Servers set")) {
                    return null;
                }
                const dnsEntries = output
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => validateIP(line));
                if (dnsEntries.length > 0) {
                    return {
                        name: 'Current DNS',
                        primary: dnsEntries[0],
                        alternative: dnsEntries[1] || undefined,
                    };
                }
            } else {
                const output = execSync('scutil --dns | grep nameserver', {
                    encoding: 'utf-8',
                });
                const dnsEntries = output
                    .split('\n')
                    .map((line) => line.split(': ')[1]?.trim())
                    .filter(Boolean);
                if (dnsEntries.length > 0) {
                    return {
                        name: 'Current DNS',
                        primary: dnsEntries[0],
                        alternative: dnsEntries[1] || undefined,
                    };
                }
            }
        }
    } catch (error) {
        console.error(
            chalk.red('Error detecting current DNS settings:'),
            error
        );
    }
    return null;
}

/**
 * Apply the DNS settings to the given network adapter.
 * If config is undefined, set DNS to automatic (DHCP).
 */
function setDNS(adapter: string, config?: DNSConfig) {
    const osType = getOS();

    const logSettingDnsToAuto = () => {
        console.log(
            chalk.yellow(
                `Setting DNS to automatic (DHCP) on adapter "${adapter}"...`
            )
        );
    };

    const logSettingDns = (config: DNSConfig) => {
        console.log(
            chalk.yellow(
                `Setting DNS to ${config.primary} on adapter "${adapter}"...`
            )
        );
    };

    try {
        if (osType === 'windows') {
            if (!config) {
                logSettingDnsToAuto();
                execSync(`netsh interface ip set dns name="${adapter}" dhcp`, {
                    stdio: 'inherit',
                });
            } else {
                logSettingDns(config);
                execSync(
                    `netsh interface ip set dns name="${adapter}" static ${config.primary} primary`,
                    { stdio: 'inherit' }
                );

                if (config.alternative) {
                    console.log(
                        chalk.yellow(
                            `Adding alternative DNS ${config.alternative} on adapter "${adapter}"...`
                        )
                    );

                    execSync(
                        `netsh interface ip add dns name="${adapter}" ${config.alternative} index=2`,
                        { stdio: 'inherit' }
                    );
                }
            }
        } else if (osType === 'linux') {
            if (!config) {
                logSettingDnsToAuto();
                execSync(
                    `nmcli con mod "${adapter}" ipv4.ignore-auto-dns yes; nmcli con up "${adapter}"`,
                    { stdio: 'inherit' }
                );
            } else {
                logSettingDns(config);

                const dnsList = [config.primary, config.alternative]
                    .filter(Boolean)
                    .join(' ');

                execSync(
                    `nmcli con mod "${adapter}" ipv4.dns "${dnsList}"; nmcli con up "${adapter}"`,
                    { stdio: 'inherit' }
                );
            }
        } else if (osType === 'mac') {
            if (!config) {
                logSettingDnsToAuto();
                execSync(`networksetup -setdnsservers "${adapter}" empty`, {
                    stdio: 'inherit',
                });
            } else {
                logSettingDns(config);

                const dnsList = [config.primary, config.alternative]
                    .filter(Boolean)
                    .join(' ');

                execSync(
                    `networksetup -setdnsservers "${adapter}" ${dnsList}`,
                    { stdio: 'inherit' }
                );
            }
        }

        console.log(chalk.green('DNS settings updated successfully.'));
    } catch (error) {
        console.error(
            chalk.red('Failed to update DNS settings. Run as admin/sudo?'),
            error
        );
    }
}

/**
 * Flow for changing the DNS settings.
 */
async function changeDNSFlow() {
    // Select the network adapter to modify
    const adapters = getNetworkAdapters();
    if (adapters.length === 0) {
        console.error(chalk.red('No network adapters found.'));
        return;
    }
    const adapterChoices = [
        ...adapters.map((adapter) => ({
            name: adapter,
            value: adapter,
        })),
        { name: 'Back to main menu', value: 'escape' },
    ];
    const { adapterChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'adapterChoice',
            message: 'Select the network adapter to change:',
            choices: adapterChoices,
            pageSize: 10,
        },
    ]);
    if (adapterChoice === 'escape') {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
    }
    const adapter = adapterChoice;
    console.log(chalk.blue(`Using adapter: ${adapter}`));

    // Get current DNS for the selected adapter
    const currentDNS = getCurrentDNS(adapter);

    // Load previously saved configurations
    const configs = loadConfigs();

    // Build choices: include "No DNS (Use DHCP)" plus the saved configurations.
    const dnsChoices = [
        {
            name: 'No DNS (Use DHCP)',
            value: null,
        },
        ...configs.map((cfg, index) => {
            const altText = cfg.alternative ? `, alt: ${cfg.alternative}` : '';
            const isCurrent =
                currentDNS &&
                cfg.primary === currentDNS.primary &&
                cfg.alternative === currentDNS.alternative;
            return {
                name: isCurrent
                    ? chalk.green(`${cfg.name}: ${cfg.primary}${altText}  *`)
                    : `${cfg.name}: ${cfg.primary}${altText}`,
                value: index,
            };
        }),
        { name: 'Back to main menu', value: 'escape' },
    ];

    const { dnsChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'dnsChoice',
            message: 'Select a DNS configuration to apply:',
            choices: dnsChoices,
            pageSize: 10,
        },
    ]);
    if (dnsChoice === 'escape') {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
    }
    // Determine which DNS config to use (if any)
    const selectedConfig: DNSConfig | undefined =
        dnsChoice === null ? undefined : configs[dnsChoice];

    // Confirm and apply the settings
    const confirm = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'proceed',
            message: `Apply the selected DNS setting to adapter "${adapter}"?`,
            default: true,
        },
    ]);
    if (confirm.proceed) {
        setDNS(adapter, selectedConfig);
    } else {
        console.log(chalk.yellow('Operation cancelled.'));
    }
}

/**
 * Flow for adding a new DNS configuration.
 */
async function addDNSConfigFlow() {
    console.log(chalk.blue('\nAdd a New DNS Configuration\n'));

    const isWindows = getOS() === 'windows';

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Configuration name (e.g. "Google", "Cloudflare"):',
            validate: (input: string) =>
                input.trim() !== '' ? true : 'Name cannot be empty.',
        },
        {
            type: 'input',
            name: 'primary',
            message: `${isWindows ? 'Primary ' : ''}DNS server (IPv4):`,
            validate: (input: string) =>
                validateIP(input) ? true : 'Please enter a valid IPv4 address.',
        },
        ...(isWindows
            ? [
                  {
                      type: 'input',
                      name: 'alternative',
                      message: 'Alternative DNS server (IPv4) (optional):',
                      validate: (input: string) => {
                          if (input.trim() === '') return true;
                          return validateIP(input)
                              ? true
                              : 'Please enter a valid IPv4 address or leave blank.';
                      },
                  } as const,
              ]
            : []),
    ]);

    const newConfig = {
        name: answers.name.trim(),
        primary: answers.primary.trim(),
        alternative:
            isWindows && answers.alternative?.trim()
                ? answers.alternative.trim()
                : undefined,
    };

    // Load existing configurations, add the new one, and save
    const configs = loadConfigs();
    configs.push(newConfig);
    saveConfigs(configs);

    console.log(
        chalk.green(`Configuration "${newConfig.name}" added successfully.`)
    );
}

/**
 * Flow for removing an existing DNS configuration.
 */
async function removeDNSConfigFlow() {
    const configs = loadConfigs();
    if (configs.length === 0) {
        console.log(chalk.yellow('No DNS configurations to remove.'));
        return;
    }
    const removalChoices = [
        ...configs.map((cfg, index) => {
            const altText = cfg.alternative ? `, alt: ${cfg.alternative}` : '';
            return {
                name: `${cfg.name}: ${cfg.primary}${altText}`,
                value: index,
            };
        }),
        { name: 'Back to main menu', value: 'escape' },
    ];
    const { removalIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'removalIndex',
            message: 'Select a configuration to remove:',
            choices: removalChoices,
            pageSize: 10,
        },
    ]);
    if (removalIndex === 'escape') {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
    }

    const { confirmRemove } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmRemove',
            message: `Are you sure you want to remove configuration "${configs[removalIndex].name}"?`,
            default: false,
        },
    ]);

    if (confirmRemove) {
        const removed = configs.splice(removalIndex, 1);
        saveConfigs(configs);
        console.log(chalk.green(`Configuration "${removed[0].name}" removed.`));
    } else {
        console.log(chalk.yellow('Removal cancelled.'));
    }
}

/**
 * Flow for editing a DNS configuration.
 */
async function editDNSConfigFlow() {
    let configs = loadConfigs();
    if (configs.length === 0) {
        console.log(chalk.yellow('No DNS configurations to edit.'));
        return;
    }

    const isWindows = getOS() === 'windows';

    const editChoices = [
        ...configs.map((cfg, index) => ({
            name: `${cfg.name}: ${cfg.primary}, ${
                cfg.alternative || 'No alternative'
            }`,
            value: index,
        })),
        { name: 'Back to main menu', value: 'escape' },
    ];

    const { editIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'editIndex',
            message: 'Select a configuration to edit:',
            choices: editChoices,
        },
    ]);
    if (editIndex === 'escape') {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
    }

    const editedConfig = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'New configuration name:',
            default: configs[editIndex].name,
        },
        {
            type: 'input',
            name: 'primary',
            message: 'New primary DNS server:',
            default: configs[editIndex].primary,
            validate: (input) =>
                validateIP(input) ? true : 'Enter a valid IPv4 address.',
        },
        ...(isWindows
            ? [
                  {
                      type: 'input',
                      name: 'alternative',
                      message: 'New alternative DNS server (optional):',
                      default: configs[editIndex].alternative || '',
                      validate: (input: string) =>
                          input.trim() === '' || validateIP(input)
                              ? true
                              : 'Enter a valid IPv4 address.',
                  } as const,
              ]
            : []),
    ]);

    configs[editIndex] = {
        name: editedConfig.name.trim(),
        primary: editedConfig.primary.trim(),
        alternative:
            isWindows && editedConfig.alternative?.trim()
                ? editedConfig.alternative.trim()
                : undefined,
    };

    saveConfigs(configs);
    console.log(chalk.green('Configuration updated successfully.'));
}

function resetAllDNS() {
    const osType = getOS();
    const adapters = getNetworkAdapters();

    if (adapters.length === 0) {
        console.error(chalk.red('No network adapters found.'));
        return;
    }

    try {
        adapters.forEach((adapter) => {
            console.log(
                chalk.yellow(`Resetting DNS on adapter "${adapter}"...`)
            );

            if (osType === 'windows') {
                execSync(`netsh interface ip set dns name="${adapter}" dhcp`, {
                    stdio: 'inherit',
                });
            } else if (osType === 'linux') {
                execSync(
                    `nmcli con mod "${adapter}" ipv4.ignore-auto-dns no; nmcli con up "${adapter}"`,
                    { stdio: 'inherit' }
                );
            } else if (osType === 'mac') {
                execSync(`networksetup -setdnsservers "${adapter}" empty`, {
                    stdio: 'inherit',
                });
            }
        });

        console.log(chalk.green('All adapters reset to DHCP.'));
    } catch (error) {
        console.error(
            chalk.red('Failed to reset DNS settings. Run as admin/sudo?'),
            error
        );
    }
}

/**
 * Flow for showing currently used DNS configurations.
 */
async function showCurrentDNSConfigsFlow() {
    const adapters = getNetworkAdapters();
    if (adapters.length === 0) {
        console.log(chalk.yellow('No network adapters found.'));
        return;
    }
    // Prepare table header
    console.log(
        chalk.bold(
            'Adapter Name                    Primary DNS         Alternative DNS'
        )
    );
    console.log(
        '--------------------------------------------------------------------------'
    );
    adapters.forEach((adapter) => {
        const currentDNS = getCurrentDNS(adapter);
        const primary = currentDNS ? currentDNS.primary : 'N/A';
        const alternative = currentDNS
            ? currentDNS.alternative || 'N/A'
            : 'N/A';
        // Adjust spacing for a simple table
        console.log(
            adapter.padEnd(30) + primary.padEnd(20) + alternative.padEnd(20)
        );
    });
}

/**
 * The main menu loop.
 */
async function mainMenu() {
    console.clear();
    console.log(chalk.bold.blue('=========================='));
    console.log(chalk.bold.blue('   DNS Changer CLI'));
    console.log(chalk.bold.blue('==========================\n'));

    let exit = false;

    while (!exit) {
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
                    { name: 'Exit', value: 'exit' },
                ],
            },
        ]);
        switch (choice) {
            case 'change':
                await changeDNSFlow();
                break;
            case 'add':
                await addDNSConfigFlow();
                break;
            case 'remove':
                await removeDNSConfigFlow();
                break;
            case 'edit':
                await editDNSConfigFlow();
                break;
            case 'resetAll':
                resetAllDNS();
                break;
            case 'showDNS':
                await showCurrentDNSConfigsFlow();
                break;
            case 'exit':
                exit = true;
                console.log(chalk.blue('Goodbye!'));
                break;
        }

        if (!exit) {
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
            console.clear();
        }
    }
}

function isAdmin(): boolean {
    try {
        if (getOS() === 'windows') {
            execSync('net session', { stdio: 'ignore' });
        } else {
            execSync('id -u', { stdio: 'ignore' });
        }

        return true;
    } catch {
        return false;
    }
}

function elevatePrivileges() {
    // process.argv[1] can be relative (e.g. "index.js"). The elevated process
    // starts in C:\Windows\System32, so a relative path makes node fail
    // instantly ("Cannot find module") and the window closes before anything
    // is visible. Always resolve to an absolute path.
    const scriptPath = path.resolve(process.argv[1]).replace(/'/g, "''");
    const osType = getOS();
    // Write a tiny launcher batch file so the UAC-elevated console runs the
    // script from this same working directory, with paths/quotes handled by
    // cmd itself. "pause" only triggers on a non-zero exit, so if node crashes
    // at startup the error stays visible instead of the window flashing shut.
    const launcher = path.join(os.tmpdir(), 'dns-changer-admin.cmd');
    fs.writeFileSync(
        launcher,
        '@echo off\r\n' +
            `cd /d "${process.cwd().replace(/"/g, '')}"\r\n` +
            `node "${scriptPath}"\r\n` +
            'if errorlevel 1 pause\r\n'
    );
    let command = '';

    if (osType === 'windows') {
        command = `powershell -Command "Start-Process '${launcher}' -Verb RunAs"`;
    } else {
        command = `sudo node "${scriptPath}"`;
    }

    try {
        // 'ignore' on Windows: the elevated process opens its own console
        // window. 'inherit' on mac/Linux: sudo runs the app in this same
        // terminal, so the interactive prompts must stay attached.
        execSync(command, {
            stdio: osType === 'windows' ? 'ignore' : 'inherit',
        });
        process.exit(0);
    } catch (error) {
        console.error(chalk.red('Failed to start with admin privileges.'));
        process.exit(1);
    }
}

// Validate an IPv4 address.
function validateIP(ip: string): boolean {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
        const num = Number(part);
        return !isNaN(num) && num >= 0 && num <= 255;
    });
}

// Start the CLI tool.
(async () => {
    if (!isAdmin()) {
        console.log(chalk.yellow('Starting with administrator privileges...'));
        elevatePrivileges();
        process.exit(1);
    }
    // Iterate over all available adapters to get the current DNS settings
    const adapters = getNetworkAdapters();
    if (adapters.length > 0) {
        let configs = loadConfigs();
        adapters.forEach((adapter, index) => {
            const currentDNS = getCurrentDNS(adapter);
            if (currentDNS) {
                if (
                    !configs.some(
                        (cfg) =>
                            cfg.primary === currentDNS.primary &&
                            cfg.alternative === currentDNS.alternative
                    )
                ) {
                    currentDNS.name = `default_dns-${index + 1}`;
                    configs.unshift(currentDNS); // Add to the beginning of the list
                }
            }
        });
        saveConfigs(configs);
    }
    await mainMenu();
})();
