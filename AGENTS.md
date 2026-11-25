# AI Agent Guidelines & Repository Directives

This document defines core instructions and operational guidelines for autonomous AI agents (Antigravity, Claude Code, Cursor, etc.) working in this repository.

---

## ⚡ 1. TypeScript Verification: Use `typecheck:bun`

When verifying code changes, adding features, or applying bug fixes, **DO NOT run `npm run typecheck` or raw `tsc`**.

Instead, always run:

```bash
bun run typecheck:bun
```

### Why:

- **Speed**: Executes in **~100–200ms** total across the root and all monorepo packages (`packages/core` and `packages/cli`).
- **Command Used**: Uses `concurrently` with labels (`[root]`, `[core]`, `[cli]`) to run `bun check --skipLibCheck` across all workspaces in parallel.
- **Efficiency**: Avoids re-parsing deep library declarations while rigorously validating project TypeScript types.

If checking an individual package directly:

- `packages/core`: `bun --cwd packages/core run typecheck:bun`
- `packages/cli`: `bun --cwd packages/cli run typecheck:bun`

---

## 📦 2. Exporting Context for External AI Review

To generate a curated archive of the repository for external code review or second-opinion analysis:

```bash
bun run bundle:context
# or run the root script:
.\bundle-context.cmd
```

This creates `<project>-context.zip` (e.g. `dnss-context.zip`) containing all required files and an injected `prompt.txt` with review instructions.

---

## 🧪 3. Verification & Testing Workflow

Before and after applying modifications:

1. **Type Checking**:
    ```bash
    bun run typecheck:bun
    ```
2. **Rust Tests**:
    ```bash
    cargo test --manifest-path packages/gui/src-tauri/Cargo.toml
    ```
3. **Core & Node Tests**:
    ```bash
    npm run build:core && npm test
    ```
4. **Formatting**:
    ```bash
    npm run prettier:check
    # or to apply formatting:
    npm run prettier
    ```

---

## 📝 4. Mandatory Detailed Git Commit Standard

Every Git commit created in this repository (by AI agents or human contributors) **MUST** be comprehensive, detailed, and structured. Single-line, terse, or vague commit messages (such as `"fix bugs"`, `"update styles"`, or `"refactor code"`) are **strictly prohibited**.

### Core Requirements for Every Commit Message:

1. **Header (Subject Line)**:
    - Format: `<type>(<optional-scope>): <imperative summary>` (e.g. `fix: resolve clipboard overflow and CLI path resolution`).
    - Limit: Under 72 characters.
    - Mood: Imperative active present tense (`apply`, `fix`, `resolve`, `harden`).
2. **Context & Root Cause (What was the problem?)**:
    - Explicitly describe what was broken, the defect/limitation, why it happened, and what conditions triggered it.
3. **Resolution & Mechanism (How was it solved?)**:
    - Detail the architectural and code-level changes made to eliminate the root cause and guarantee safety.
4. **Key Changes by Component (Subsystem Breakdown)**:
    - Partition changes by architectural layer with exact symbols, files, and functions in backticks:
        - **Core & Storage**: SQLite tables, queries, migrations, Rust db/search/ipc invariants.
        - **CLI & Client Tooling**: TypeScript CLI options, argument parsers, exit codes, IPC transports.
        - **Tauri Backend & Platform**: OS APIs, Windows COM, Win32 calls, process management.
        - **Frontend & Security**: React components, CSS sanitization, event listeners, keyboard traps.
        - **CI & Build Pipeline**: GitHub Actions workflows, portable bundlers, release scripts.
5. **Regression Tests & Verification**:
    - Explicitly list all new or updated tests and edge cases verified (unit tests, integration tests, E2E tests).

### Canonical Commit Template:

```text
<type>(<scope>): <concise imperative summary under 72 chars>

<Detailed explanation of the problem / defect / requirement: what triggered it,
why it occurred, and the operational impact on users or the runtime.>

<Detailed explanation of the solution: how the issue was resolved, the architectural
strategy chosen, and what safety guarantees or invariants were established.>

Key changes by component:
- <Subsystem / Layer 1>:
  - <Imperative action> in `<symbol_or_path>` to prevent <issue> (<DIRECTIVE_OR_ISSUE_ID>).
  - <Imperative action> to ensure <invariant>.

- <Subsystem / Layer 2>:
  - <Imperative action> in `<symbol_or_path>`: <details>.

Regression tests added / verified:
- `<exact::test::path_or_identifier>`
- `<test-file.test.ts>`: <description of attack-vectors or edge-cases tested>
```

---

## 🔍 5. Applying External AI Reviews: Mandatory Divergence & History Reporting

Whenever implementing, applying, or adapting directives, patches, or code reviews originating from an external AI or second-opinion agent (e.g. `REVIEW_REPORT.md`, `AGENT_DIRECTIVES.md`, external code review outputs, second-opinion prompt artifacts):

1. **Do NOT blindly apply external code**:
    - Thoroughly validate proposed changes against the live codebase, type invariants, and runtime behavior.
    - Actively identify flawed assumptions, shadowing conflicts, missing/invalid imports, non-existent database columns/schemas, or broken logic in external AI recommendations.

2. **Mandatory Divergence & Adaptation Section in Chat Report**:
   In the completion report presented to the user in chat, the agent **MUST** include a prominent, dedicated section titled **"Divergences & Adaptations from External AI Directives"**. This section must explicitly specify:
    - **Corrections made to external suggestions**: Any syntax errors, TypeScript shadowing collisions, or invalid database schemas present in the external AI's snippets that were corrected before applying.
    - **Architectural or logic adjustments**: Where and why the agent deviated from the external AI's proposed solution to prevent regressions or invariant violations.
    - **Rejected suggestions / False positives**: Any recommendation from the external review that was rejected or altered, along with the concrete technical reasoning.
    - **Tests adjusted or added**: Any test proposed by the external AI that had incorrect assertions or broken assumptions, and how it was made compliant with the actual codebase.

3. **Mandatory Review History Persistence (`docs/reviews/`)**:
   Before finishing or committing a review round, the agent **MUST**:
    - Create `docs/reviews/round-XX-YYYY-MM-DD.md` using `docs/reviews/TEMPLATE.md`, documenting the exact applied fixes, divergences/rejected items, pre-apply check outcomes, regression tests, and verification results.
    - Update `docs/reviews/INDEX.md` with the new round entry, any new **Intentional Decisions / Do-Not-Reopen** items, and updated **Pending Manual Verification** items.
    - Because `docs/reviews/` is automatically included by `scripts/bundle-context.ts`, this gives future external AI reviewers full continuity across rounds.

---

## 🛡️ 6. Critical Tauri v2, Vite & Windows Invariants (Do Not Break)

The following invariants were discovered and verified through live Windows debugging. **Do not revert, simplify, or bypass them:**

1. **Vite IPv4 Binding & Tauri `devUrl` (`packages/gui/vite.config.mts`, `packages/gui/src-tauri/tauri.conf.json`)**:
    - On Windows, Node.js resolves `localhost` to IPv6 `::1` first, while `tauri dev` polls IPv4 `127.0.0.1:1420` (`Warn Waiting for your frontend dev server...`).
    - **Invariant**: Keep `server.host: '127.0.0.1'`, `port: 1420`, `strictPort: true`, `hmr: { protocol: 'ws', host: '127.0.0.1', port: 1420 }` in `vite.config.mts` AND `"devUrl": "http://127.0.0.1:1420"` in `tauri.conf.json`.

2. **Dev vs. Production CSP (`packages/gui/src-tauri/tauri.conf.json`)**:
    - The production `"csp"` (`script-src 'self'`, `connect-src ipc: http://ipc.localhost`) blocks Vite's HMR WebSocket and React Fast Refresh inline preamble scripts during `tauri:dev`.
    - **Invariant**: Keep `"devCsp": null` in `app.security` so HMR works seamlessly in development while release builds continue enforcing the strict production `"csp"`. Never bundle external CDN fonts (`font-src 'self' data:`); always use self-hosted `@fontsource/*` imports in `packages/gui/src/main.tsx`.

3. **Custom TitleBar & Window Commands (`packages/gui/src-tauri/src/lib.rs`, `packages/gui/src/components/TitleBar.tsx`)**:
    - Synchronous (`fn`) Tauri commands calling `window.minimize()`, `maximize()`, `hide()`, or `start_dragging()` inside WebView2's IPC callback deadlock or silently no-op on Windows.
    - **Invariant**: All window manipulation commands (`window_minimize`, `window_toggle_maximize`, `window_is_maximized`, `window_close`, `window_start_dragging`, `set_tray_pinned`) MUST remain **`async fn`** taking `app: tauri::AppHandle` and returning `Result<..., String>`.
    - **Invariant**: `<TitleBar />` MUST stay `dir="ltr"` with fixed title `"DNSS - DNS Switcher"` so switching UI language to Persian (`fa`) never flips window buttons or translates the brand title.

4. **System Tray Drag, Pin & Close Lifecycle (`packages/gui/src-tauri/src/lib.rs`, `packages/gui/src/TrayApp.tsx`)**:
    - On Windows, calling `tray.start_dragging()` immediately triggers `WM_KILLFOCUS` (`WindowEvent::Focused(false)`) when the Win32 modal move loop begins.
    - **Invariant**: `WindowEvent::Focused(false)` on `"tray"` MUST check `TrayState` (`state.pinned`, `state.dragging`, and `TRAY_DRAG_BLUR_GRACE`) before calling `window.hide()`.
    - **Invariant**: `WindowEvent::CloseRequested` MUST guard **both** `"main"` and `"tray"` (`matches!(window.label(), "main" | "tray")`) so pressing `Alt+F4` on the tray popover hides it instead of permanently destroying `"tray"`.

5. **Production-Only Browser Lockdown (`packages/gui/src/main.tsx`)**:
    - Native WebView2 context menu and browser shortcuts (`Ctrl+P/F/S/U/O/J/H`, zoom, `Alt+Left/Right`) are blocked using physical `e.code` (so they stay blocked under Persian `FA` keyboard layouts).
    - **Invariant**: Keep `Ctrl+R`, `F5`, `F12`, and `Ctrl+Shift+I` enabled when `import.meta.env.DEV` is true so developers can reload/inspect during `tauri:dev`, while blocking them in production builds.

6. **DNS Benchmark Reliability & Smooth UI (`packages/gui/src-tauri/src/net.rs`, `Servers.tsx`, `TrayApp.tsx`)**:
    - Active VPN/TUN adapters (e.g. `singbox_tun`) often intercept UDP/53 with FakeIP (`198.18.0.0/15`) or local TCP `SYN-ACK`. Keep the 1232-byte UDP buffer, preserved OS `io::Error` kinds, explicit FakeIP detection, empty `benchmarkTarget` normalization, and VPN diagnostic warnings.
    - Keep deferred latency sorting (`sortPings` updated once after benchmark completion) so `@formkit/auto-animate` performs a single smooth sort rather than jittering rows mid-benchmark, and keep `.dnss-scroll-stable` (`scrollbar-gutter: stable`) on scrollable lists to prevent horizontal layout shift during filtering.

7. **Docs Live Demo Isolation (`docs/src/LandingPage.tsx`, `docs/src/styles.css`, `docs/src/mock-ipc.ts`)**:
    - Whenever adding new Tauri commands or GUI CSS tokens, always add matching stubs in `docs/src/mock-ipc.ts` and tokens in `docs/src/styles.css`. Never override `#mockup-app-container *` with `!important` `font-family` (it breaks the Settings font-family preview).
