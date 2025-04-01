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
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

interface DNSConfig {
    name: string;
    primary: string;
    alternative?: string;
}

// The configuration file path in the user's home directory
const CONFIG_PATH = path.join(os.homedir(), '.dnschanger.json');

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
 * Retrieve available network adapters using netsh.
 */
function getNetworkAdapters(): string[] {
    try {
        const output = execSync('netsh interface show interface', {
            encoding: 'utf-8',
        });
        const lines = output.split('\n').map((line) => line.trim());

        return lines
            .slice(2) // Skip headers
            .map((line) => line.match(/\s{2,}(.+)$/)?.[1]?.trim()) // Extract adapter name
            .filter(
                (name) => name && !name.toLowerCase().includes('loopback')
            ) as string[];
    } catch (error) {
        console.error(
            chalk.red('Error detecting network adapters. Are you on Windows?')
        );
        return [];
    }
}

/**
 * Apply the DNS settings to the given network adapter.
 * If config is undefined, set DNS to automatic (DHCP).
 */
function setDNS(adapter: string, config?: DNSConfig) {
    try {
        if (!config) {
            console.log(
                chalk.yellow(
                    `Setting DNS to automatic (DHCP) on adapter "${adapter}"...`
                )
            );
            execSync(`netsh interface ip set dns name="${adapter}" dhcp`, {
                stdio: 'inherit',
            });
        } else {
            console.log(
                chalk.yellow(
                    `Setting primary DNS to ${config.primary} on adapter "${adapter}"...`
                )
            );
            execSync(
                `netsh interface ip set dns name="${adapter}" static ${config.primary} primary`,
                {
                    stdio: 'inherit',
                }
            );
            if (config.alternative) {
                console.log(
                    chalk.yellow(
                        `Adding alternative DNS ${config.alternative} on adapter "${adapter}"...`
                    )
                );
                execSync(
                    `netsh interface ip add dns name="${adapter}" ${config.alternative} index=2`,
                    {
                        stdio: 'inherit',
                    }
                );
            }
        }
        console.log(chalk.green('DNS settings updated successfully.'));
    } catch (error) {
        console.error(
            chalk.red(
                'Failed to update DNS settings. Are you running this program as an administrator?'
            )
        );
    }
}

/**
 * Flow for changing the DNS settings.
 */
async function changeDNSFlow() {
    // Load previously saved configurations
    const configs = loadConfigs();

    // Build choices: include "No DNS (DHCP)" plus the saved configurations.
    const choices = [
        { name: chalk.bold('No DNS (Use DHCP)'), value: null },
        ...configs.map((cfg, index) => {
            const altText = cfg.alternative ? `, alt: ${cfg.alternative}` : '';
            return {
                name: `${cfg.name}: ${cfg.primary}${altText}`,
                value: index,
            };
        }),
    ];

    const { dnsChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'dnsChoice',
            message: 'Select a DNS configuration to apply:',
            choices,
            pageSize: 10,
        },
    ]);

    // Determine which DNS config to use (if any)
    const selectedConfig: DNSConfig | undefined =
        dnsChoice === null ? undefined : configs[dnsChoice];

    // Select the network adapter to modify
    const adapters = getNetworkAdapters();
    if (adapters.length === 0) {
        console.error(chalk.red('No network adapters found.'));
        return;
    }

    let adapter: string;
    if (adapters.length === 1) {
        adapter = adapters[0];
        console.log(chalk.blue(`Using the only available adapter: ${adapter}`));
    } else {
        const { adapterChoice } = await inquirer.prompt([
            {
                type: 'list',
                name: 'adapterChoice',
                message: 'Select the network adapter to change:',
                choices: adapters,
                pageSize: 10,
            },
        ]);
        adapter = adapterChoice;
    }

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
 * Validate an IPv4 address.
 */
function validateIP(ip: string): boolean {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
        const num = Number(part);
        return !isNaN(num) && num >= 0 && num <= 255;
    });
}

/**
 * Flow for adding a new DNS configuration.
 */
async function addDNSConfigFlow() {
    console.log(chalk.blue('\nAdd a New DNS Configuration\n'));
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
            message: 'Primary DNS server (IPv4):',
            validate: (input: string) =>
                validateIP(input) ? true : 'Please enter a valid IPv4 address.',
        },
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
        },
    ]);

    const newConfig: DNSConfig = {
        name: answers.name.trim(),
        primary: answers.primary.trim(),
        alternative: answers.alternative.trim() || undefined,
    };

    // Load existing configurations, add the new one, and then save them
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
    const { removalIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'removalIndex',
            message: 'Select a configuration to remove:',
            choices: configs.map((cfg, index) => {
                const altText = cfg.alternative
                    ? `, alt: ${cfg.alternative}`
                    : '';
                return {
                    name: `${cfg.name}: ${cfg.primary}${altText}`,
                    value: index,
                };
            }),
            pageSize: 10,
        },
    ]);

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

async function editDNSConfigFlow() {
    let configs = loadConfigs();
    if (configs.length === 0) {
        console.log(chalk.yellow('No DNS configurations to edit.'));
        return;
    }

    const { editIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'editIndex',
            message: 'Select a configuration to edit:',
            choices: configs.map((cfg, index) => ({
                name: `${cfg.name}: ${cfg.primary}, ${
                    cfg.alternative || 'No alternative'
                }`,
                value: index,
            })),
        },
    ]);

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
            validate: (input: string) =>
                validateIP(input) ? true : 'Enter a valid IPv4 address.',
        },
        {
            type: 'input',
            name: 'alternative',
            message: 'New alternative DNS server (optional):',
            default: configs[editIndex].alternative || '',
            validate: (input: string) =>
                input.trim() === '' || validateIP(input)
                    ? true
                    : 'Enter a valid IPv4 address.',
        },
    ]);

    configs[editIndex] = {
        name: editedConfig.name.trim(),
        primary: editedConfig.primary.trim(),
        alternative: editedConfig.alternative.trim() || undefined,
    };

    saveConfigs(configs);
    console.log(chalk.green('Configuration updated successfully.'));
}

function resetAllDNS() {
    const adapters = getNetworkAdapters();
    if (adapters.length === 0) {
        console.error(chalk.red('No network adapters found.'));
        return;
    }
    adapters.forEach((adapter) => {
        console.log(chalk.yellow(`Resetting DNS on adapter "${adapter}"...`));
        execSync(`netsh interface ip set dns name="${adapter}" dhcp`, {
            stdio: 'inherit',
        });
    });
    console.log(chalk.green('All adapters reset to DHCP.'));
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
                    {
                        name: 'Edit a DNS configuration',
                        value: 'edit',
                    },
                    {
                        name: 'Reset all adapters to DHCP (No DNS)',
                        value: 'resetAll',
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
                await resetAllDNS();
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
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function elevatePrivileges() {
    const scriptPath = process.argv[1]; // Get current script path
    const command = `powershell -Command "Start-Process 'node' -ArgumentList '${scriptPath}' -Verb RunAs"`;

    try {
        execSync(command, { stdio: 'ignore' });
        process.exit(0); // Exit the original process after relaunching
    } catch (error) {
        console.error(chalk.red('Failed to restart with admin privileges.'));
        process.exit(1);
    }
}

// Start the CLI tool.
(async () => {
    if (!isAdmin()) {
        console.log(chalk.yellow('Starting with administrator privileges...'));
        elevatePrivileges();
        process.exit(1);
    }

    await mainMenu();
})();
