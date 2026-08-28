# @seymi/dnss-gui

DNSS desktop app — [Tauri 2](https://v2.tauri.app/) + React.

## Prerequisites

- Node.js 18+
- Rust toolchain (`rustup`): https://www.rust-lang.org/tools/install
- Platform dependencies from the Tauri docs: https://v2.tauri.app/start/prerequisites/

## Commands (run from this folder)

```bash
npm run tauri dev     # development with hot reload
npm run tauri build   # production bundles (NSIS installer, MSI, AppImage, DMG...)
npm run build         # frontend only (typecheck + vite build)
```

## Elevation model

- **Windows**: `src-tauri/windows/app.manifest` sets `requireAdministrator`, so the
  UAC dialog appears once at launch and the whole app runs elevated.
- **macOS**: privileged commands run through `osascript … with administrator
privileges` (native password dialog).
- **Linux**: privileged commands run through `pkexec`; `nmcli` is used so no
  root is needed when the user is in `netdev`/`wheel` with default polkit rules.
