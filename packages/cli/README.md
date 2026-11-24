# DNSS — DNS Switcher CLI

**@seymi/dnss-cli** is the command-line flavor of [DNSS](https://github.com/Hasan-Mir/dnss), a free, open-source **DNS changer** for Windows, macOS and Linux. Switch between popular DNS providers (Cloudflare, Google, AdGuard, Shecan, …) with an interactive menu — no manual `netsh` commands, no digging through settings.

## ✨ Features

- 🗂 Built-in DNS presets (Cloudflare, Google, Quad9, AdGuard, OpenDNS, Mullvad, Control D, Shecan, Electro, Radar Game, Begzar, …)
- ⚙️ Custom saved DNS configurations
- 🖧 Per-adapter and all-adapter DNS switching
- 🔄 Apply / reset (DHCP) per adapter or for all adapters
- 📋 Show the currently used DNS per adapter
- ⏱ DNS latency benchmark
- 🔐 Automatic elevation (UAC on Windows, `sudo` on macOS/Linux)

## 📦 Install

```bash
# run once without installing
npx @seymi/dnss-cli

# or install globally (the command is "dnss")
npm install -g @seymi/dnss-cli
dnss
```

Requires **Node.js 18+**.

## 🚀 Usage

Just run it — `dnss` (or `npx @seymi/dnss-cli`) opens an interactive menu:

```text
? What would you like to do?
> Change DNS settings
  Add a DNS configuration
  Remove a DNS configuration
  Edit a DNS configuration
  Reset all adapters to DHCP (No DNS)
  Show currently used DNS configs
  Benchmark DNS servers
  Exit
```

On Windows, if the DNSS desktop app's `DnssService` background service is installed and running, the CLI delegates DNS changes to it over the local Named Pipe **without triggering UAC**. Otherwise (standalone `npx` usage, or macOS/Linux), the CLI relaunches itself with administrator privileges automatically (UAC on Windows, `sudo` on macOS/Linux).

## 🗄 Storage

Saved configurations live in `~/.dnss/configs.json` (configs from the old `~/.dnschanger.json` are imported automatically). The file is written atomically with a 0600 temp file and never through planted symlinks; recovery copies are kept next to it when something goes wrong: `.bak` (previous good state), `.corrupt` (unparseable file) and `.invalid` (entries dropped by validation). The CLI and the [desktop app](https://github.com/Hasan-Mir/dnss) share this file.

## 🛡 Privacy

DNSS collects **nothing**. No telemetry, no analytics, no accounts. The only network traffic it generates is the DNS benchmark queries you trigger yourself.

## 📄 License

[MIT](https://github.com/Hasan-Mir/dnss/blob/main/LICENSE)
