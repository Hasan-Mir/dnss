// TEMPORARY dev-only mock of the Tauri IPC bridge for browser verification.
(function () {
    'use strict';
    var adapters = [
        { name: 'Wi-Fi', kind: 'Wireless', is_default: true, dns_servers: ['1.1.1.1', '1.0.0.1'], dns_static: true },
        { name: 'Ethernet', kind: 'Ethernet', is_default: false, dns_servers: ['192.168.1.1'], dns_static: false },
    ];
    var configs = [
        { name: 'Home filtering', primary: '94.140.14.14', alternative: '94.140.15.15' },
    ];
    window.__TAURI_INTERNALS__ = {
        transformCallback: function (cb) { return cb; },
        invoke: function (cmd, args) {
            switch (cmd) {
                case 'get_network_status':
                    return Promise.resolve({
                        adapters: adapters,
                        default_adapter: 'Wi-Fi',
                        active_dns: { static_servers: ['1.1.1.1', '1.0.0.1'], in_use: ['1.1.1.1', '1.0.0.1'] },
                    });
                case 'get_configs':
                    return Promise.resolve(configs);
                case 'save_configs':
                    configs = args.configs;
                    return Promise.resolve(configs);
                case 'set_dns_many':
                    return Promise.resolve([{ adapter: 'Wi-Fi', ok: true, error: '' }]);
                case 'reset_all_dns':
                    return Promise.resolve([{ adapter: 'Wi-Fi', ok: true, error: '' }]);
                case 'flush_dns':
                    return Promise.resolve();
                default:
                    return Promise.reject(new Error('mock: no handler for ' + cmd));
            }
        },
    };
})();
