import type {
    Adapter,
    AppSettings,
    BenchmarkSample,
    DnsConfig,
    DnsStatus,
    NetworkStatus,
    SetDnsOutcome,
} from '@gui/api';
import { validateIPv4 } from '@seymi/dnss-core/validate';

const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_IMPORT_BYTES = 512 * 1024;

interface MockState {
    settings: AppSettings;
    status: DnsStatus;
    adapters: Adapter[];
}

function createInitialState(): MockState {
    return {
        settings: {
            'dnss.schemaVersion': 1,
            'appearance.theme': 'dark',
            'appearance.accent': '#10b981',
            'appearance.fontFamily': 'google-sans',
            'appearance.fontSize': 14,
            'general.language': 'en',
            'benchmark.target': 'https://www.cloudflare.com',
            'presets.hidden': [],
            'dns.servers': [
                {
                    id: 'office-dns',
                    name: 'Office DNS',
                    primary: '10.10.0.53',
                    alternative: '10.10.0.54',
                },
            ],
        },
        status: {
            static_servers: ['10.10.0.53', '10.10.0.54'],
            in_use: ['10.10.0.53', '10.10.0.54'],
        },
        adapters: [
            {
                name: 'Wi-Fi',
                kind: 'Intel(R) Wi-Fi 6 AX200 160MHz',
                is_default: true,
                dns_servers: ['10.10.0.53', '10.10.0.54'],
                dns_static: true,
            },
            {
                name: 'Ethernet',
                kind: 'Realtek PCIe GbE Family Controller',
                is_default: false,
                dns_servers: ['192.168.1.1'],
                dns_static: false,
            },
            {
                name: 'vEthernet (WSL)',
                kind: 'Hyper-V Virtual Ethernet Adapter',
                is_default: false,
                dns_servers: [],
                dns_static: false,
            },
        ],
    };
}

let state: MockState = createInitialState();
let stateEpoch = 0;

export function resetMockTauriState(): void {
    stateEpoch += 1;
    state = createInitialState();
}

function normalizeMockServers(raw: unknown): DnsConfig[] {
    if (!Array.isArray(raw)) {
        throw new Error('"dns.servers" must be an array');
    }
    const used = new Set<string>();
    const out: DnsConfig[] = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) {
            throw new Error('Invalid entry in "dns.servers"');
        }
        const rec = item as Record<string, unknown>;
        const name = typeof rec.name === 'string' ? rec.name.trim() : '';
        const primary =
            typeof rec.primary === 'string' ? rec.primary.trim() : '';
        const alternative =
            typeof rec.alternative === 'string' && rec.alternative.trim()
                ? rec.alternative.trim()
                : undefined;
        if (!name || [...name].length > 64 || !validateIPv4(primary)) {
            throw new Error(
                `Invalid DNS configuration: ${name || '(unnamed)'}`
            );
        }
        if (alternative && !validateIPv4(alternative)) {
            throw new Error(`Invalid alternative IPv4 for "${name}"`);
        }
        const base =
            (typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : name)
                .toLowerCase()
                .replace(/[^a-z0-9_-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 48) || 'server';
        let id = base;
        let suffix = 2;
        while (used.has(id)) {
            id = `${base}-${suffix++}`;
        }
        used.add(id);
        out.push({ id, name, primary, alternative });
    }
    return out;
}

function normalizeMockSettings(raw: Record<string, unknown>): AppSettings {
    const base = createInitialState().settings;
    const theme = raw['appearance.theme'];
    const accent = raw['appearance.accent'];
    const fontFamily = raw['appearance.fontFamily'];
    const fontSize = raw['appearance.fontSize'];
    const language = raw['general.language'];
    const benchTarget = raw['benchmark.target'];
    const hidden = raw['presets.hidden'];

    if (hidden !== undefined && !Array.isArray(hidden)) {
        throw new Error('"presets.hidden" must be an array');
    }
    const cleanHidden = Array.isArray(hidden)
        ? Array.from(
              new Set(
                  hidden
                      .filter((v): v is string => typeof v === 'string')
                      .map((v) => v.trim())
                      .filter(Boolean)
              )
          )
        : [];

    const servers =
        raw['dns.servers'] !== undefined
            ? normalizeMockServers(raw['dns.servers'])
            : [];

    return {
        'dnss.schemaVersion': 1,
        'appearance.theme':
            theme === 'light' || theme === 'dark' || theme === 'system'
                ? theme
                : base['appearance.theme'],
        'appearance.accent':
            typeof accent === 'string' && HEX_RE.test(accent.trim())
                ? accent.trim().toLowerCase()
                : base['appearance.accent'],
        'appearance.fontFamily':
            fontFamily === 'google-sans' ||
            fontFamily === 'inter' ||
            fontFamily === 'dm-sans' ||
            fontFamily === 'manrope' ||
            fontFamily === 'roboto'
                ? fontFamily
                : base['appearance.fontFamily'],
        'appearance.fontSize':
            fontSize === 12 || fontSize === 14 || fontSize === 16
                ? fontSize
                : base['appearance.fontSize'],
        'general.language':
            language === 'en' || language === 'fa'
                ? language
                : base['general.language'],
        'benchmark.target':
            typeof benchTarget === 'string' && benchTarget.trim()
                ? benchTarget.trim()
                : base['benchmark.target'],
        'presets.hidden': cleanHidden,
        'dns.servers': servers,
    };
}

export function installMockTauriIpc(): void {
    stateEpoch += 1;
    state = createInitialState();

    const invoke = async (
        cmd: string,
        args?: Record<string, unknown>
    ): Promise<unknown> => {
        switch (cmd) {
            case 'get_network_status': {
                await delay(180);
                const result: NetworkStatus = {
                    adapters: JSON.parse(JSON.stringify(state.adapters)),
                    default_adapter: 'Wi-Fi',
                    active_dns: JSON.parse(JSON.stringify(state.status)),
                };
                return result;
            }

            case 'set_dns_many': {
                const epoch = stateEpoch;
                await delay(360);
                const rawAdapters = args?.adapters as
                    string[] | null | undefined;
                const servers = (args?.servers as string[] | undefined) ?? [];
                const targetNames =
                    rawAdapters ?? state.adapters.map((a) => a.name);

                if (epoch === stateEpoch) {
                    for (const targetName of targetNames) {
                        const adapter = state.adapters.find(
                            (a) => a.name === targetName
                        );
                        if (adapter) {
                            adapter.dns_servers =
                                servers.length > 0
                                    ? [...servers]
                                    : ['192.168.1.1'];
                            adapter.dns_static = servers.length > 0;
                        }
                    }

                    const defaultAdapter = state.adapters.find(
                        (a) => a.is_default
                    );
                    if (defaultAdapter) {
                        state.status = defaultAdapter.dns_static
                            ? {
                                  static_servers: [
                                      ...defaultAdapter.dns_servers,
                                  ],
                                  in_use: [...defaultAdapter.dns_servers],
                              }
                            : {
                                  static_servers: [],
                                  in_use: [...defaultAdapter.dns_servers],
                              };
                    }
                }

                const outcomes: SetDnsOutcome[] = targetNames.map((name) => ({
                    adapter: name,
                    ok: true,
                    error: '',
                }));
                return outcomes;
            }

            case 'reset_all_dns': {
                const epoch = stateEpoch;
                await delay(420);
                if (epoch === stateEpoch) {
                    for (const adapter of state.adapters) {
                        adapter.dns_servers = adapter.is_default
                            ? ['192.168.1.1']
                            : [];
                        adapter.dns_static = false;
                    }
                    state.status = {
                        static_servers: [],
                        in_use: ['192.168.1.1'],
                    };
                }
                const outcomes: SetDnsOutcome[] = state.adapters.map((a) => ({
                    adapter: a.name,
                    ok: true,
                    error: '',
                }));
                return outcomes;
            }

            case 'flush_dns': {
                await delay(280);
                return null;
            }

            case 'get_configs': {
                return JSON.parse(
                    JSON.stringify(state.settings['dns.servers'])
                );
            }

            case 'save_configs': {
                state.settings['dns.servers'] = normalizeMockServers(
                    args?.configs ?? []
                );
                return JSON.parse(
                    JSON.stringify(state.settings['dns.servers'])
                );
            }

            case 'get_settings': {
                return JSON.parse(JSON.stringify(state.settings));
            }

            case 'save_settings': {
                const incoming = args?.settings as
                    Record<string, unknown> | undefined;
                if (!incoming || typeof incoming !== 'object') {
                    throw new Error('Invalid settings payload');
                }
                state.settings = normalizeMockSettings(incoming);
                return JSON.parse(JSON.stringify(state.settings));
            }

            case 'export_settings_json': {
                return JSON.stringify(state.settings, null, 2);
            }

            case 'import_settings_json': {
                const rawJson = String(args?.json ?? '');
                if (
                    new TextEncoder().encode(rawJson).length > MAX_IMPORT_BYTES
                ) {
                    throw new Error('Settings file exceeds 512 KiB size limit');
                }
                let parsed: unknown;
                try {
                    parsed = JSON.parse(rawJson);
                } catch (err) {
                    throw new Error(`Invalid JSON: ${String(err)}`);
                }
                if (
                    typeof parsed !== 'object' ||
                    parsed === null ||
                    Array.isArray(parsed)
                ) {
                    throw new Error('Settings JSON must be an object');
                }
                state.settings = normalizeMockSettings(
                    parsed as Record<string, unknown>
                );
                return JSON.parse(JSON.stringify(state.settings));
            }

            case 'benchmark_dns': {
                await delay(120 + Math.random() * 260);
                const sample: BenchmarkSample = {
                    resolve_ms: Math.round(14 + Math.random() * 45),
                    connect_ms: Math.round(8 + Math.random() * 25),
                    address: '104.16.123.96',
                };
                return sample;
            }

            case 'plugin:opener|open_url': {
                const url = args?.url as string;
                if (url) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
                return null;
            }

            case 'plugin:event|listen': {
                return ++nextListenerId;
            }

            case 'plugin:event|unlisten': {
                return null;
            }

            case 'set_tray_pinned':
            case 'get_tray_pinned':
            case 'window_is_maximized':
            case 'window_toggle_maximize':
            case 'plugin:window|is_maximized': {
                return false;
            }

            case 'plugin:window|minimize':
            case 'plugin:window|toggle_maximize':
            case 'plugin:window|close':
            case 'plugin:window|hide':
            case 'window_minimize':
            case 'window_close':
            case 'notify_tray_drag_start':
            case 'window_start_dragging':
            case 'plugin:window|start_dragging': {
                return null;
            }

            default: {
                throw new Error(`Unknown command: ${cmd}`);
            }
        }
    };

    let nextListenerId = 0;
    const callbacks = new Map<number, (payload: unknown) => void>();
    let nextCallbackId = 1;

    (
        window as unknown as {
            __TAURI_EVENT_PLUGIN_INTERNALS__?: {
                unregisterListener: (event: string, eventId: number) => void;
            };
            __TAURI_INTERNALS__: {
                invoke: typeof invoke;
                transformCallback: (
                    cb?: (payload: unknown) => void,
                    once?: boolean
                ) => number;
                unregisterCallback: (id: number) => void;
            };
        }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => {},
    };

    (
        window as unknown as {
            __TAURI_INTERNALS__: {
                invoke: typeof invoke;
                transformCallback: (
                    cb?: (payload: unknown) => void,
                    once?: boolean
                ) => number;
                unregisterCallback: (id: number) => void;
            };
        }
    ).__TAURI_INTERNALS__ = {
        invoke,
        transformCallback: (cb) => {
            const id = nextCallbackId++;
            if (cb) callbacks.set(id, cb);
            return id;
        },
        unregisterCallback: (id) => {
            callbacks.delete(id);
        },
    };
}
