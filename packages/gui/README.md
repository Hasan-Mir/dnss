# @seymi/dnss-gui

DNSS desktop app — [Tauri 2](https://v2.tauri.app/) + React.

## Prerequisites

- Node.js 18+
- Rust toolchain (`rustup`): https://www.rust-lang.org/tools/install
- Platform dependencies from the Tauri docs: https://v2.tauri.app/start/prerequisites/

## Commands (run from this folder)

```bash
npm run tauri:dev     # development with hot reload (same as `tauri dev`)
npm run tauri:build   # production bundles (Windows NSIS installer, AppImage/DEB/RPM, DMG...)
npm run build         # frontend only (typecheck + vite build)
```

From the repository root, `npm run dev` launches the desktop app directly.

## Elevation model

- **Windows**: The per-machine NSIS installer (`tauri.windows.conf.json` +
  `windows/hooks.nsh`) requests UAC once during setup to register and start the
  `DnssService` background service (`src-tauri/src/service.rs`). The GUI itself
  runs unprivileged (`asInvoker` in `windows/app.manifest`) and delegates DNS
  changes over a local Named Pipe (`\\.\pipe\dnss-service`) restricted to
  interactive users — no UAC prompts on launch, reboot, or DNS changes.
- **macOS**: privileged commands run through `osascript … with administrator
privileges` (native password dialog).
- **Linux**: privileged commands run through `pkexec`; `nmcli` is used so no
  root is needed when the user is in `netdev`/`wheel` with default polkit rules.
