import type { DnsPreset } from './types';

/**
 * Built-in, well-known public DNS servers.
 *
 * Some entries (Shecan, Electro, Radar Game, Begzar) are popular with users
 * in Iran; the rest are global providers. All addresses are the officially
 * documented IPv4 addresses of each provider.
 */
export type { DnsPreset };

export const DNS_PRESETS: DnsPreset[] = [
    {
        id: 'cloudflare',
        name: 'Cloudflare',
        primary: '1.1.1.1',
        alternative: '1.0.0.1',
        description: 'Fast, privacy-first resolver',
        tags: ['global'],
    },
    {
        id: 'cloudflare-family',
        name: 'Cloudflare Family',
        primary: '1.1.1.3',
        alternative: '1.0.0.3',
        description: 'Blocks malware and adult content',
        tags: ['global', 'filtering'],
    },
    {
        id: 'google',
        name: 'Google',
        primary: '8.8.8.8',
        alternative: '8.8.4.4',
        description: 'Google Public DNS',
        tags: ['global'],
    },
    {
        id: 'quad9',
        name: 'Quad9',
        primary: '9.9.9.9',
        alternative: '149.112.112.112',
        description: 'Blocks malicious domains',
        tags: ['global', 'filtering'],
    },
    {
        id: 'adguard',
        name: 'AdGuard DNS',
        primary: '94.140.14.14',
        alternative: '94.140.15.15',
        description: 'Removes ads and trackers',
        tags: ['global', 'filtering'],
    },
    {
        id: 'adguard-family',
        name: 'AdGuard Family',
        primary: '94.140.14.15',
        alternative: '94.140.15.16',
        description: 'Ads + adult content blocking',
        tags: ['global', 'filtering'],
    },
    {
        id: 'opendns',
        name: 'OpenDNS',
        primary: '208.67.222.222',
        alternative: '208.67.220.220',
        description: 'Cisco OpenDNS',
        tags: ['global'],
    },
    {
        id: 'opendns-family',
        name: 'OpenDNS FamilyShield',
        primary: '208.67.222.123',
        alternative: '208.67.220.123',
        description: 'OpenDNS with adult site blocking',
        tags: ['global', 'filtering'],
    },
    {
        id: 'mullvad',
        name: 'Mullvad',
        primary: '194.242.2.2',
        description: 'No logging, no filtering',
        tags: ['global', 'privacy'],
    },
    {
        id: 'controld',
        name: 'Control D',
        primary: '76.76.2.0',
        alternative: '76.76.10.0',
        description: 'Control D unfiltered resolver',
        tags: ['global', 'privacy'],
    },
    {
        id: 'yandex',
        name: 'Yandex',
        primary: '77.88.8.8',
        alternative: '77.88.8.1',
        description: 'Yandex DNS',
        tags: ['global'],
    },
    {
        id: 'comodo',
        name: 'Comodo Secure',
        primary: '8.26.56.26',
        alternative: '8.20.247.20',
        description: 'Blocks malicious sites',
        tags: ['global', 'filtering'],
    },
    {
        id: 'dnswatch',
        name: 'DNS.WATCH',
        primary: '84.200.69.80',
        alternative: '84.200.70.40',
        description: 'German, censorship-free resolver',
        tags: ['global', 'privacy'],
    },
    {
        id: 'shecan',
        name: 'Shecan',
        primary: '178.22.122.100',
        alternative: '185.51.200.2',
        description: 'Sanction bypass for Iranian users',
        tags: ['iran'],
    },
    {
        id: 'electro',
        name: 'Electro',
        primary: '78.157.42.100',
        alternative: '78.157.42.101',
        description: 'Sanction bypass for Iranian users',
        tags: ['iran'],
    },
    {
        id: 'radar-game',
        name: 'Radar Game',
        primary: '10.202.10.10',
        alternative: '10.202.10.11',
        description: 'Gaming-focused resolver for Iranian users',
        tags: ['iran'],
    },
    {
        id: 'begzar',
        name: 'Begzar',
        primary: '185.55.226.26',
        alternative: '185.55.225.25',
        description: 'Sanction bypass for Iranian users',
        tags: ['iran'],
    },
];
