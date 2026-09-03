import type {
    Adapter,
    DnsConfig,
    DnsStatus,
    NetworkStatus,
    SetDnsOutcome,
    BenchmarkSample,
} from '@gui/api';

const delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

interface MockState {
    configs: DnsConfig[];
    status: DnsStatus;
    adapters: Adapter[];
}

export function installMockTauriIpc(): void {
    const state: MockState = {
        configs: [
            {
                name: 'Home DNS',
                primary: '1.1.1.1',
                alternative: '1.0.0.1',
            },
        ],
        status: {
            static_servers: ['1.1.1.1', '1.0.0.1'],
            in_use: ['1.1.1.1', '1.0.0.1'],
        },
        adapters: [
            {
                name: 'Wi-Fi',
                kind: 'Wireless LAN',
                is_default: true,
                dns_servers: ['1.1.1.1', '1.0.0.1'],
                dns_static: true,
            },
            {
                name: 'Ethernet',
                kind: 'Realtek PCIe GbE',
                is_default: false,
                dns_servers: ['192.168.1.1'],
                dns_static: false,
            },
            {
                name: 'vEthernet (WSL)',
                kind: 'Hyper-V Virtual',
                is_default: false,
                dns_servers: [],
                dns_static: false,
            },
        ],
    };

    const invoke = async (
        cmd: string,
        args?: Record<string, unknown>
    ): Promise<unknown> => {
        switch (cmd) {
            case 'get_network_status': {
                await delay(250);
                const result: NetworkStatus = {
                    adapters: JSON.parse(JSON.stringify(state.adapters)),
                    default_adapter: 'Wi-Fi',
                    active_dns: JSON.parse(JSON.stringify(state.status)),
                };
                return result;
            }

            case 'set_dns_many': {
                await delay(500);
                const rawAdapters = args?.adapters as string[] | undefined;
                const servers = (args?.servers as string[] | undefined) ?? [];
                const targetNames =
                    rawAdapters ?? state.adapters.map((a) => a.name);

                for (const targetName of targetNames) {
                    const adapter = state.adapters.find(
                        (a) => a.name === targetName
                    );
                    if (adapter) {
                        adapter.dns_servers =
                            servers.length > 0 ? [...servers] : ['192.168.1.1'];
                        adapter.dns_static = servers.length > 0;
                    }
                }

                const firstAdapter = state.adapters.find(
                    (a) => a.name === targetNames[0]
                );
                state.status =
                    servers.length > 0
                        ? { static_servers: [...servers], in_use: [...servers] }
                        : {
                              static_servers: [],
                              in_use: firstAdapter
                                  ? [...firstAdapter.dns_servers]
                                  : ['192.168.1.1'],
                          };

                const outcomes: SetDnsOutcome[] = targetNames.map((name) => ({
                    adapter: name,
                    ok: true,
                    error: '',
                }));
                return outcomes;
            }

            case 'reset_all_dns': {
                await delay(600);
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
                const outcomes: SetDnsOutcome[] = state.adapters.map((a) => ({
                    adapter: a.name,
                    ok: true,
                    error: '',
                }));
                return outcomes;
            }

            case 'flush_dns': {
                await delay(350);
                return null;
            }

            case 'get_configs': {
                return JSON.parse(JSON.stringify(state.configs));
            }

            case 'save_configs': {
                state.configs = JSON.parse(JSON.stringify(args?.configs ?? []));
                return JSON.parse(JSON.stringify(state.configs));
            }

            case 'benchmark_dns': {
                await delay(150 + Math.random() * 350);
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

            default: {
                throw new Error(`Unknown command: ${cmd}`);
            }
        }
    };

    (
        window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invoke } }
    ).__TAURI_INTERNALS__ = {
        invoke,
    };
}
