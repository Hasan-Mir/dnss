<div align="center">
  <img src="docs/src/assets/images/icon-128.png" width="140" alt="DNSS — DNS Switcher logo" />
</div>

# DNSS — DNS Switcher

**DNSS** (short for _DNS Switch_) is a free, open-source **DNS changer** for Windows, macOS and Linux. Switch between popular DNS providers (Cloudflare, Google, AdGuard, Shecan, …) with a modern desktop app or a simple CLI — no manual `netsh` commands, no diggings through settings.

> It ships in two flavors that share the same core:
>
> - **🖥 Desktop app** (`packages/gui`) — modern GUI built with [Tauri 2](https://v2.tauri.app/) + React, dark/light theme, DNS benchmarking. Tiny footprint (~10 MB, no Electron).
> - **⌨ CLI** (`packages/cli`) — published on npm as **`@seymi/dnss-cli`**, usable directly with `npx` (the command is `dnss`).

---

## ✨ Features

|                                                                                                                                | Desktop app | CLI |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------- | --- |
| Built-in DNS presets (Cloudflare, Google, Quad9, AdGuard, OpenDNS, Mullvad, Control D, Shecan, Electro, Radar Game, Begzar, …) | ✅          | ✅  |
| Custom DNS configurations                                                                                                      | ✅          | ✅  |
| Active-adapter auto-detection (default gateway)                                                                                | ✅          | ❌  |
| Reset adapter(s) to DHCP                                                                                                       | ✅          | ✅  |
| Show current DNS per adapter                                                                                                   | ✅          | ✅  |
| Flush the OS DNS cache                                                                                                         | ✅          | ❌  |
| DNS latency benchmark                                                                                                          | ✅          | ✅  |
| Dark / light / system theme                                                                                                    | ✅          | —   |
| Automatic elevation (UAC / sudo)                                                                                               | ✅          | ✅  |

## 📦 Install & usage

### CLI (npm)

```bash
# run once without installing
npx @seymi/dnss-cli

# or install globally (the command is "dnss")
npm install -g @seymi/dnss-cli
dnss
```

On Windows, if the DNSS desktop app (and its `DnssService` background service) is installed, the CLI applies DNS changes through the local service **without any UAC prompt**. Otherwise (standalone npm/npx usage, or macOS/Linux), it relaunches itself with administrator privileges automatically (UAC on Windows, `sudo` on macOS/Linux).

Saved configurations live in `~/.dnss/configs.json` (configs from the old `~/.dnschanger.json` are imported automatically). The file is written atomically with a 0600 temp file and never through planted symlinks; recovery copies are kept next to it when something goes wrong: `.bak` (previous good state), `.corrupt` (unparseable file) and `.invalid` (entries dropped by validation). Both the CLI and the desktop app share this file.

### Desktop app (build from source)

Requirements: [Node.js 18+](https://nodejs.org), the [Rust toolchain](https://www.rust-lang.org/tools/install), and the platform prerequisites listed in the [Tauri docs](https://v2.tauri.app/start/prerequisites/).

```bash
npm install

# development (hot reload) — runs `tauri:dev` in the GUI workspace
npm run dev

# production build (builds @seymi/dnss-core and platform installers: NSIS on Windows, DMG on macOS, DEB/RPM/AppImage on Linux)
npm run build:desktop
```

On Windows, the per-machine NSIS installer asks for UAC **once during installation** to register and start the `DnssService` background service (`SERVICE_AUTO_START`). After installation, the desktop app runs unprivileged (`asInvoker`) — launching DNSS, rebooting Windows, and switching DNS require **no UAC prompts**, even for standard (non-admin) corporate accounts. During development without the service installed, you can either run `dnss.exe --install-service` once from an elevated shell or start `npm run dev` from an administrator terminal.

## 🗂 Project structure

```
packages/
├── core/   # Shared TypeScript: presets, validation, config storage, benchmark
├── cli/    # The "@seymi/dnss-cli" npm package (interactive CLI)
└── gui/    # Tauri 2 + React desktop app
    ├── src/         # React frontend (dark/light theme, server list, settings)
    └── src-tauri/   # Rust backend (adapters, DNS commands, DNS benchmark)
```

## 🔧 How DNS is applied

DNSS sets the resolver of your **active network adapter** (auto-detected via the default route; when none exists — e.g. offline — the adapter list still works and simply marks no default).

- **Windows**: `Set-DnsClientServerAddress`, which replaces the _entire_ address list of the adapter in one call — stale entries left behind by earlier tools cannot survive an apply, and a reset clears static resolvers of both address families.
- **Linux**: `nmcli` connection profiles. Applying custom DNS also disables auto-learned **IPv6** resolvers (RA/RDNSS/DHCPv6) — otherwise dual-stack networks would keep querying the ISP's IPv6 resolver for AAAA records and bypass your choice. Resetting to DHCP restores automatic IPv6 DNS, and a bulk reset skips devices without an active NetworkManager connection (disconnected NICs, unmanaged devices) instead of failing.
- **macOS**: `networksetup` network services. If the default route goes through a VPN tunnel (`utun*`/`ppp*`), which has no networksetup service, DNSS falls back to the first enabled physical service instead of failing.

> ⚠️ On Windows, auto-learned IPv6 resolvers are **not** suppressed when applying a custom IPv4-only preset (the OS offers no clean switch for this; the presets are IPv4). On Linux this is handled automatically as described above.

The desktop backend also serializes mutating operations (apply / reset / flush) behind an internal lock, so overlapping commands — for example from rapid clicks — can never interleave OS calls and leave an adapter half-configured.

## 🔐 Why admin rights?

Changing the DNS servers of a network adapter is a **machine-wide** setting: on Windows it is written under `HKLM\SYSTEM\...\Tcpip\Parameters\Interfaces` (admin-only), on macOS it uses `networksetup`, on Linux `nmcli`. On Windows, DNSS follows the standard service-broker model (similar to WireGuard and Cloudflare WARP): the installer requests UAC once to install `DnssService` (`LocalSystem`), while the UI runs unprivileged (`asInvoker`) and sends strictly validated requests over a local Named Pipe (`\\.\pipe\dnss-service`) restricted to locally logged-in interactive users.

## 🙏 Credits & inspiration

This project is fully independent, but parts of it were **inspired by the excellent open-source [DnsChanger/dnsChanger-desktop](https://github.com/DnsChanger/dnsChanger-desktop)** project (MIT):

- The **DNS latency benchmark** algorithm (resolve a hostname through each candidate DNS server, then measure fetching a page from the resolved IP, with blocked/403 detection) — ported in `packages/core/src/benchmark.ts`
- The idea of **curated DNS server presets** and the general app concept

Thank you to the DnsChanger contributors! ❤️

## 🛡 Privacy

DNSS collects **nothing**. No telemetry, no analytics, no accounts. The only network traffic it generates is the DNS benchmark queries you trigger yourself.

## 🚀 Publishing (maintainers)

npm workspaces automatically link `@seymi/dnss-core` to the local package while its
version satisfies the `^1.0.0` range declared by the CLI and GUI. On the
registry, publish the core first so the CLI never resolves to a dead
dependency:

```bash
# 1. the shared core must exist on the registry first
npm publish --workspace @seymi/dnss-core

# 2. then the CLI (installed/run as "dnss"; published as @seymi/dnss-cli)
npm publish --workspace @seymi/dnss-cli
```

`@seymi/dnss-core` and `@seymi/dnss-cli` are scoped, so they declare
`publishConfig.access: "public"` (required for scoped packages).

## 📄 License

[MIT](LICENSE)
