mod configs;
mod net;
mod platform;
mod service;

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

/// Serializes mutating network operations (`set_dns`, `reset_all_dns`,
/// `flush_dns`). The frontend disables its buttons while busy, but the IPC
/// boundary must not rely on renderer discipline: overlapping OS calls
/// (e.g. from a wedged or malicious renderer) could otherwise interleave
/// and leave an adapter half-configured.
#[derive(Default)]
pub struct NetworkLock(Mutex<()>);

/// Tracks `"tray"` popover lifecycle state:
/// - `last_blur`: suppresses the taskbar click race where mouse-down steals focus
///   right before mouse-up fires TrayIconEvent::Click.
/// - `pinned`: when true, clicking outside `"tray"` does not auto-hide it.
/// - `drag_grace_until`: Win32 `start_dragging()` posts the modal move loop
///   asynchronously and triggers `WM_KILLFOCUS` (`WindowEvent::Focused(false)`).
///   `window_start_dragging` sets an initial grace deadline and each
///   `WindowEvent::Moved` refreshes it while the user drags across monitors.
#[derive(Default)]
struct TrayStateInner {
    last_blur: Option<Instant>,
    pinned: bool,
    drag_grace_until: Option<Instant>,
}

#[derive(Default)]
struct TrayState(Mutex<TrayStateInner>);

const TRAY_BLUR_SUPPRESS: Duration = Duration::from_millis(250);
const TRAY_DRAG_START_GRACE: Duration = Duration::from_millis(1500);
const TRAY_DRAG_MOVE_GRACE: Duration = Duration::from_millis(600);

/// Commands run on the blocking pool, so a blocking guard is fine here.
fn acquire_network_lock(lock: &NetworkLock) -> Result<MutexGuard<'_, ()>, String> {
    lock.0.lock()
        .map_err(|_| "Network operation lock poisoned".to_string())
}

#[derive(Serialize)]
pub struct Adapter {
    pub name: String,
    pub kind: String,
    pub is_default: bool,
    /// Servers the adapter currently resolves through (static or
    /// DHCP-provided); empty when none are known.
    pub dns_servers: Vec<String>,
    /// True when the servers were pinned statically (registry NameServer),
    /// false when they come from DHCP.
    pub dns_static: bool,
}

#[derive(Serialize)]
pub struct DnsStatus {
    /// Servers currently configured as static on the interface (empty = DHCP)
    pub static_servers: Vec<String>,
    /// Servers currently in use (from DHCP when no static config)
    pub in_use: Vec<String>,
}

#[derive(Serialize)]
pub struct BenchmarkSample {
    pub resolve_ms: u64,
    pub connect_ms: Option<u64>,
    pub address: String,
}

/// Everything the UI's status refresh needs, answered by a single backend
/// call (and a single OS process on Windows).
#[derive(Serialize)]
pub struct NetworkStatus {
    pub adapters: Vec<Adapter>,
    pub default_adapter: Option<String>,
    pub active_dns: Option<DnsStatus>,
}

/// Per-adapter result of a bulk DNS change: one dead adapter must not hide
/// the success of the others.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SetDnsOutcome {
    pub adapter: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub error: String,
}

/// Event emitted to all windows whenever DNS state or saved configs change
/// so `"main"` and `"tray"` stay synchronized.
const STATE_CHANGED_EVENT: &str = "dnss:state-changed";
const NAVIGATE_EVENT: &str = "dnss:navigate";

/// Pure helper computing a clamped physical position for the `"tray"` popover
/// inside a monitor's work area (`wa_x`, `wa_y`, `wa_w`, `wa_h`).
fn compute_tray_position(
    click_pos: PhysicalPosition<f64>,
    win_size: PhysicalSize<u32>,
    wa_x: i32,
    wa_y: i32,
    wa_w: i32,
    wa_h: i32,
    margin: i32,
) -> PhysicalPosition<i32> {
    let w = win_size.width as i32;
    let h = win_size.height as i32;
    let cx = click_pos.x.round() as i32;
    let cy = click_pos.y.round() as i32;

    // Place above the click on bottom taskbars (Windows default), or
    // below when the tray sits in the upper half of the screen.
    let desired_y = if cy >= wa_y + wa_h / 2 {
        cy - h - margin
    } else {
        cy + margin
    };
    let desired_x = cx - w / 2;

    let min_x = wa_x + margin;
    let max_x = (wa_x + wa_w - w - margin).max(min_x);
    let min_y = wa_y + margin;
    let max_y = (wa_y + wa_h - h - margin).max(min_y);

    PhysicalPosition::new(desired_x.clamp(min_x, max_x), desired_y.clamp(min_y, max_y))
}

/// Position and toggle the `"tray"` popover window near the tray icon click
/// point, clamped inside the clicked monitor's work area.
fn toggle_tray_window(app: &tauri::AppHandle, click_pos: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window("tray") else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    // Suppress the classic taskbar click race where mouse-down steals focus
    // (hiding `"tray"` via Focused(false)) right before mouse-up fires Click.
    if let Ok(mut state) = app.state::<TrayState>().0.lock() {
        if let Some(t) = state.last_blur.take() {
            if t.elapsed() < TRAY_BLUR_SUPPRESS {
                return;
            }
        }
    }

    let monitor = app
        .monitor_from_point(click_pos.x, click_pos.y)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let win_size = window.outer_size().unwrap_or_else(|_| {
        PhysicalSize::new(
            (360.0 * scale).round() as u32,
            (520.0 * scale).round() as u32,
        )
    });
    let margin = (8.0 * scale).round() as i32;

    let pos = if let Some(mon) = monitor {
        let wa = mon.work_area();
        compute_tray_position(
            click_pos,
            win_size,
            wa.position.x,
            wa.position.y,
            wa.size.width as i32,
            wa.size.height as i32,
            margin,
        )
    } else {
        let cx = click_pos.x.round() as i32;
        let cy = click_pos.y.round() as i32;
        PhysicalPosition::new(
            (cx - (win_size.width as i32) / 2).max(0),
            (cy - (win_size.height as i32) - margin).max(0),
        )
    };

    let _ = window.set_position(pos);
    let _ = window.show();
    let _ = window.set_focus();
}

/// Adapters + default-route adapter + its DNS status, in one backend call.
///
/// Every command here is `async` and runs its blocking OS work on
/// `spawn_blocking`: a synchronous command would execute on the main thread
/// and freeze the whole window while the (slow, process-spawning) platform
/// call runs — the cause of the "app not responding" reports.
#[tauri::command]
async fn get_network_status() -> Result<NetworkStatus, String> {
    tauri::async_runtime::spawn_blocking(platform::network_status)
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

/// Apply `servers` to every adapter in `adapters` (`None` = all adapters).
/// An empty `servers` resets the adapters to DHCP. The adapter names are
/// validated against the OS inside the platform call, and per-adapter
/// results are returned so partial failures stay visible.
#[tauri::command]
async fn set_dns_many(
    app: tauri::AppHandle,
    adapters: Option<Vec<String>>,
    servers: Vec<String>,
) -> Result<Vec<SetDnsOutcome>, String> {
    // Practical cap: clients never usefully consume more than a couple of
    // resolvers, and every entry becomes part of an OS command — a wedged
    // renderer must not be able to trigger unbounded admin commands.
    if servers.len() > 4 {
        return Err(format!(
            "Too many DNS servers (max 4, got {})",
            servers.len()
        ));
    }
    for server in &servers {
        if server.len() > 45 {
            return Err("DNS server address too long".to_string());
        }
        if net::parse_ipv4(server).is_none() {
            return Err(format!("Invalid IPv4 address: {}", server));
        }
    }
    let app_for_task = app.clone();
    let outcomes = tauri::async_runtime::spawn_blocking(move || {
        let lock = app_for_task.state::<NetworkLock>();
        let _guard = acquire_network_lock(&lock)?;
        platform::set_dns_many(adapters.as_deref(), &servers)
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))??;

    let _ = app.emit(STATE_CHANGED_EVENT, ());
    Ok(outcomes)
}

/// Reset every adapter to DHCP (per-adapter outcomes, same as set_dns_many).
#[tauri::command]
async fn reset_all_dns(app: tauri::AppHandle) -> Result<Vec<SetDnsOutcome>, String> {
    let app_for_task = app.clone();
    let outcomes = tauri::async_runtime::spawn_blocking(move || {
        let lock = app_for_task.state::<NetworkLock>();
        let _guard = acquire_network_lock(&lock)?;
        platform::reset_all_dns()
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))??;

    let _ = app.emit(STATE_CHANGED_EVENT, ());
    Ok(outcomes)
}

#[tauri::command]
async fn flush_dns(app: tauri::AppHandle) -> Result<(), String> {
    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let lock = app_for_task.state::<NetworkLock>();
        let _guard = acquire_network_lock(&lock)?;
        platform::flush_dns()
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))??;

    let _ = app.emit(STATE_CHANGED_EVENT, ());
    Ok(())
}

/// Saved custom DNS configurations, shared with the CLI via
/// ~/.dnss/configs.json.
#[tauri::command]
fn get_configs() -> Vec<configs::DnsConfig> {
    configs::load_configs()
}

#[tauri::command]
fn save_configs(
    app: tauri::AppHandle,
    configs: Vec<configs::DnsConfig>,
) -> Result<Vec<configs::DnsConfig>, String> {
    let saved = configs::save_configs(configs)?;
    let _ = app.emit(STATE_CHANGED_EVENT, ());
    Ok(saved)
}

#[tauri::command]
fn get_settings() -> configs::AppSettings {
    configs::load_settings()
}

#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    settings: configs::AppSettings,
) -> Result<configs::AppSettings, String> {
    let saved = configs::save_settings(settings)?;
    let _ = app.emit(STATE_CHANGED_EVENT, ());
    Ok(saved)
}

#[tauri::command]
fn export_settings_json() -> Result<String, String> {
    configs::export_settings_json()
}

#[tauri::command]
fn import_settings_json(
    app: tauri::AppHandle,
    json: String,
) -> Result<configs::AppSettings, String> {
    let imported = configs::import_settings_json(&json)?;
    let _ = app.emit(STATE_CHANGED_EVENT, ());
    Ok(imported)
}

/// Show and focus the main window, optionally navigating it to a specific tab
/// (`"home"`, `"servers"`, or `"settings"`), and hide the tray popover.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle, tab: Option<String>) {
    if let Some(tray) = app.get_webview_window("tray") {
        let _ = tray.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(target_tab) = tab {
        if matches!(target_tab.as_str(), "home" | "servers" | "settings") {
            let _ = app.emit(NAVIGATE_EVENT, target_tab);
        }
    }
}

/// Explicitly hide the compact tray popover window.
#[tauri::command]
fn hide_tray_window(app: tauri::AppHandle) {
    if let Some(tray) = app.get_webview_window("tray") {
        let _ = tray.hide();
    }
}

/// Exit the entire DNSS application (used by the Quit button in the tray).
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn window_minimize(app: tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    main.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
async fn window_toggle_maximize(app: tauri::AppHandle) -> Result<bool, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let currently_max = main.is_maximized().unwrap_or(false);
    if currently_max {
        main.unmaximize().map_err(|e| e.to_string())?;
    } else {
        main.maximize().map_err(|e| e.to_string())?;
    }
    Ok(main.is_maximized().unwrap_or(!currently_max))
}

#[tauri::command]
async fn window_is_maximized(app: tauri::AppHandle) -> Result<bool, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    main.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
async fn window_close(app: tauri::AppHandle) -> Result<(), String> {
    // Keep DNSS alive in the System Tray rather than destroying the window.
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    main.hide().map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_tray_pinned(app: tauri::AppHandle, pinned: bool) -> Result<bool, String> {
    let tray_state = app.state::<TrayState>();
    let mut state = tray_state
        .0
        .lock()
        .map_err(|_| "Tray state lock poisoned".to_string())?;
    state.pinned = pinned;
    Ok(state.pinned)
}

#[tauri::command]
async fn get_tray_pinned(app: tauri::AppHandle) -> Result<bool, String> {
    let tray_state = app.state::<TrayState>();
    let state = tray_state
        .0
        .lock()
        .map_err(|_| "Tray state lock poisoned".to_string())?;
    Ok(state.pinned)
}

#[tauri::command]
fn notify_tray_drag_start(app: tauri::AppHandle) {
    if let Ok(mut state) = app.state::<TrayState>().0.lock() {
        state.drag_grace_until = Some(Instant::now() + TRAY_DRAG_START_GRACE);
    }
}

#[tauri::command]
async fn window_start_dragging(app: tauri::AppHandle, label: Option<String>) -> Result<(), String> {
    let target = match label.as_deref() {
        Some("tray") => "tray",
        _ => "main",
    };
    let win = app
        .get_webview_window(target)
        .ok_or_else(|| format!("Window '{}' not found", target))?;

    if target == "tray" {
        if let Ok(mut state) = app.state::<TrayState>().0.lock() {
            state.drag_grace_until = Some(Instant::now() + TRAY_DRAG_START_GRACE);
        }
    }

    win.start_dragging().map_err(|e| e.to_string())
}

/// Parse a benchmark target URL the same way the CLI does: an optional
/// `http://`/`https://` scheme (https is assumed when missing), then the
/// hostname. Only the default port of the scheme is ever dialed — parity
/// with the CLI, which ignores custom ports in target URLs.
fn parse_benchmark_target(target: &str) -> Result<(String, u16), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Benchmark target URL cannot be empty".to_string());
    }
    if trimmed.len() > 2000 {
        return Err("Benchmark target URL too long".to_string());
    }

    let (scheme, rest) = if let Some(rest) = trimmed.strip_prefix("http://") {
        ("http", rest)
    } else if let Some(rest) = trimmed.strip_prefix("https://") {
        ("https", rest)
    } else {
        ("https", trimmed)
    };

    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .trim_end_matches('.');

    let host_is_valid = !host.is_empty()
        && host.len() <= 253
        && host
            .split('.')
            .all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && !label.starts_with('-')
                    && !label.ends_with('-')
                    && label
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-')
            });
    if !host_is_valid {
        return Err(format!("Invalid benchmark target URL: {}", target));
    }

    let port: u16 = if scheme == "http" { 80 } else { 443 };
    Ok((host.to_string(), port))
}

/// Measure the latency of one built-in DNS preset.
///
/// The DNS question and the TCP probe port come from `target` (the same
/// knob the CLI exposes), but the renderer never gets to probe internal
/// networks: the benchmark resolves through `server` and then TCP-connects
/// to the *resolved* address only — loopback, link-local, private and other
/// sensitive ranges are rejected in `net::benchmark_dns`.
#[tauri::command]
async fn benchmark_dns(
    server: String,
    target: Option<String>,
) -> Result<BenchmarkSample, String> {
    if net::parse_ipv4(&server).is_none() {
        return Err(format!("Invalid DNS server address: {}", server));
    }
    let effective_target = target
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("https://www.cloudflare.com");
    let (hostname, port) = parse_benchmark_target(effective_target)?;

    // Run on a blocking thread pool: this performs blocking network I/O and
    // must not stall the Tauri IPC/runtime threads.
    tauri::async_runtime::spawn_blocking(move || {
        let (resolve_ms, connect_ms, address) =
            net::benchmark_dns(&server, &hostname, port)?;

        Ok(BenchmarkSample {
            resolve_ms,
            connect_ms,
            address,
        })
    })
    .await
    .map_err(|e| format!("Benchmark task failed: {}", e))?
}

/// Windows SCM entry point invoked via `dnss.exe --service`.
#[cfg(target_os = "windows")]
pub fn run_windows_service() -> Result<(), String> {
    service::run_service()
}

/// Install (or update) and start `DnssService` (elevated, run once by installer).
#[cfg(target_os = "windows")]
pub fn install_windows_service() -> Result<(), String> {
    service::install_service()
}

/// Stop and remove `DnssService` (elevated, run by uninstaller).
#[cfg(target_os = "windows")]
pub fn uninstall_windows_service() -> Result<(), String> {
    service::uninstall_service()
}

pub fn run() {
    tauri::Builder::default()
        // Opens external links (the About credit) in the user's real browser;
        // the webview itself must never navigate away from the app UI.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let mut tray_builder = TrayIconBuilder::with_id("dnss-tray")
                .tooltip("DNSS — DNS Switcher")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left | MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        toggle_tray_window(tray.app_handle(), position);
                    }
                });

            // Linux AppIndicator does not emit TrayIconEvent::Click; attach a
            // native fallback menu so users can always reopen or quit DNSS.
            #[cfg(target_os = "linux")]
            {
                use tauri::menu::{Menu, MenuItem};
                let open_item = MenuItem::with_id(app, "open", "Open DNSS", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit DNSS", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
                tray_builder = tray_builder
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => show_main_window(app.clone(), None),
                        "quit" => app.exit(0),
                        _ => {}
                    });
            }

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }

            let _tray = tray_builder.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Moved(_) if window.label() == "tray" => {
                if let Ok(mut state) = window.app_handle().state::<TrayState>().0.lock() {
                    if let Some(until) = state.drag_grace_until {
                        if Instant::now() < until {
                            state.drag_grace_until = Some(Instant::now() + TRAY_DRAG_MOVE_GRACE);
                        } else {
                            state.drag_grace_until = None;
                        }
                    }
                }
            }
            WindowEvent::Focused(false) if window.label() == "tray" => {
                if window.is_visible().unwrap_or(false) {
                    if let Ok(mut state) = window.app_handle().state::<TrayState>().0.lock() {
                        if state.pinned {
                            return;
                        }
                        if let Some(until) = state.drag_grace_until {
                            if Instant::now() < until {
                                return;
                            }
                            state.drag_grace_until = None;
                        }
                        state.last_blur = Some(Instant::now());
                    }
                    let _ = window.hide();
                }
            }
            WindowEvent::CloseRequested { api, .. } if matches!(window.label(), "main" | "tray") => {
                // Keep DNSS running in the System Tray instead of exiting.
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .manage(NetworkLock::default())
        .manage(TrayState::default())
        .invoke_handler(tauri::generate_handler![
            get_network_status,
            set_dns_many,
            reset_all_dns,
            flush_dns,
            get_configs,
            save_configs,
            get_settings,
            save_settings,
            export_settings_json,
            import_settings_json,
            benchmark_dns,
            show_main_window,
            hide_tray_window,
            quit_app,
            window_minimize,
            window_toggle_maximize,
            window_is_maximized,
            window_close,
            window_start_dragging,
            set_tray_pinned,
            get_tray_pinned,
            notify_tray_drag_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running dnss");
}

#[cfg(test)]
mod tests {
    use super::parse_benchmark_target;

    #[test]
    fn parses_defaults_and_schemes() {
        // No scheme -> https is assumed (same as the CLI).
        assert_eq!(
            parse_benchmark_target("example.com").unwrap(),
            ("example.com".to_string(), 443)
        );
        assert_eq!(
            parse_benchmark_target("https://www.cloudflare.com").unwrap(),
            ("www.cloudflare.com".to_string(), 443)
        );
        assert_eq!(
            parse_benchmark_target("http://example.com/path?x=1").unwrap(),
            ("example.com".to_string(), 80)
        );
    }

    #[test]
    fn strips_path_query_and_trailing_dot() {
        assert_eq!(
            parse_benchmark_target("https://example.com/a/b#c").unwrap(),
            ("example.com".to_string(), 443)
        );
        assert_eq!(
            parse_benchmark_target("example.com.").unwrap(),
            ("example.com".to_string(), 443)
        );
    }

    #[test]
    fn rejects_invalid_targets() {
        assert!(parse_benchmark_target("").is_err());
        assert!(parse_benchmark_target("   ").is_err());
        assert!(parse_benchmark_target("https://").is_err());
        // Spaces would corrupt the wire-format DNS question.
        assert!(parse_benchmark_target("bad host.com").is_err());
        assert!(parse_benchmark_target("https://bad host.com").is_err());
        // Underscores are not valid hostname labels.
        assert!(parse_benchmark_target("bad_host.example.com").is_err());
        // Leading/trailing hyphens are not valid in a label.
        assert!(parse_benchmark_target("-example.com").is_err());
        assert!(parse_benchmark_target("example-.com").is_err());
        // Custom ports are out of scope (the CLI ignores them too).
        assert!(parse_benchmark_target("example.com:8080").is_err());
        // RFC 1035: each DNS label must be at most 63 bytes.
        let max_label = format!("{}.com", "a".repeat(63));
        assert!(parse_benchmark_target(&max_label).is_ok());
        let too_long_label = format!("{}.com", "a".repeat(64));
        assert!(parse_benchmark_target(&too_long_label).is_err());
    }

    #[test]
    fn clamps_tray_position_across_taskbars_and_monitors() {
        use super::{compute_tray_position, PhysicalPosition, PhysicalSize};

        let size = PhysicalSize::new(360, 520);
        // Bottom taskbar on 1920x1040 work area -> sits above click and clamped inside right edge.
        let bottom = compute_tray_position(PhysicalPosition::new(1860.0, 1060.0), size, 0, 0, 1920, 1040, 8);
        assert_eq!(bottom.x, 1920 - 360 - 8);
        assert_eq!(bottom.y, 1040 - 520 - 8);

        // Top menu bar / taskbar -> sits below click.
        let top = compute_tray_position(PhysicalPosition::new(1700.0, 20.0), size, 0, 40, 1920, 1040, 8);
        assert_eq!(top.x, 1520);
        assert_eq!(top.y, 48);

        // Secondary monitor left of primary (negative X).
        let left_mon = compute_tray_position(PhysicalPosition::new(-80.0, 1050.0), size, -1920, 0, 1920, 1040, 8);
        assert_eq!(left_mon.x, -360 - 8);
        assert_eq!(left_mon.y, 1040 - 520 - 8);
    }
}
