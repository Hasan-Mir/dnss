mod configs;
mod net;
mod platform;

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};

/// Serializes mutating network operations (`set_dns`, `reset_all_dns`,
/// `flush_dns`). The frontend disables its buttons while busy, but the IPC
/// boundary must not rely on renderer discipline: overlapping OS calls
/// (e.g. from a wedged or malicious renderer) could otherwise interleave
/// and leave an adapter half-configured.
#[derive(Default)]
pub struct NetworkLock(Mutex<()>);

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

#[tauri::command]
fn get_os() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
fn list_adapters() -> Result<Vec<Adapter>, String> {
    platform::list_adapters()
}

/// Validate that the adapter requested from the renderer actually exists.
/// The IPC boundary is a security boundary: never trust a value just because
/// it came from our own <select>.
fn validate_adapter(adapter: &str) -> Result<(), String> {
    let adapters = platform::list_adapters()?;
    if adapters.iter().any(|a| a.name == adapter) {
        Ok(())
    } else {
        Err(format!("Unknown network adapter: {}", adapter))
    }
}

#[tauri::command]
fn get_active_dns(adapter: Option<String>) -> Result<DnsStatus, String> {
    if let Some(name) = &adapter {
        validate_adapter(name)?;
    }
    platform::get_active_dns(adapter.as_deref())
}

/// Empty `servers` resets the adapter to DHCP.
#[tauri::command]
fn set_dns(
    adapter: String,
    servers: Vec<String>,
    lock: tauri::State<'_, NetworkLock>,
) -> Result<(), String> {
    let _guard = acquire_network_lock(&lock)?;
    validate_adapter(&adapter)?;
    // Practical cap: clients never usefully consume more than a couple of
    // resolvers, and every entry becomes an OS command — a wedged renderer
    // must not be able to trigger unbounded sequential admin commands.
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
    platform::set_dns(&adapter, &servers)
}

#[tauri::command]
fn reset_all_dns(lock: tauri::State<'_, NetworkLock>) -> Result<(), String> {
    let _guard = acquire_network_lock(&lock)?;
    platform::reset_all_dns()
}

#[tauri::command]
fn flush_dns(lock: tauri::State<'_, NetworkLock>) -> Result<(), String> {
    let _guard = acquire_network_lock(&lock)?;
    platform::flush_dns()
}

#[tauri::command]
fn detect_default_adapter() -> Result<Option<String>, String> {
    platform::detect_default_adapter()
}

/// Saved custom DNS configurations, shared with the CLI via
/// ~/.dnss/configs.json.
#[tauri::command]
fn get_configs() -> Vec<configs::DnsConfig> {
    configs::load_configs()
}

#[tauri::command]
fn save_configs(configs: Vec<configs::DnsConfig>) -> Result<Vec<configs::DnsConfig>, String> {
    configs::save_configs(configs)
}

/// Measure the latency of one built-in DNS preset.
///
/// The target hostname/port are intentionally hardcoded in the backend so
/// the renderer cannot use this command to probe arbitrary network hosts:
/// the benchmark is resolved through `server` and then TCP-connects to the
/// resolved address (loopback, link-local and private targets are rejected).
#[tauri::command]
async fn benchmark_dns(server: String) -> Result<BenchmarkSample, String> {
    if net::parse_ipv4(&server).is_none() {
        return Err(format!("Invalid DNS server address: {}", server));
    }

    // Run on a blocking thread pool: this performs blocking network I/O and
    // must not stall the Tauri IPC/runtime threads.
    tauri::async_runtime::spawn_blocking(move || {
        const BENCHMARK_HOSTNAME: &str = "cloudflare.com";
        const BENCHMARK_PORT: u16 = 443;

        let (resolve_ms, connect_ms, address) =
            net::benchmark_dns(&server, BENCHMARK_HOSTNAME, BENCHMARK_PORT)?;

        Ok(BenchmarkSample {
            resolve_ms,
            connect_ms,
            address,
        })
    })
    .await
    .map_err(|e| format!("Benchmark task failed: {}", e))?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched.
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(NetworkLock::default())
        .invoke_handler(tauri::generate_handler![
            get_os,
            list_adapters,
            get_active_dns,
            set_dns,
            reset_all_dns,
            flush_dns,
            detect_default_adapter,
            get_configs,
            save_configs,
            benchmark_dns
        ])
        .run(tauri::generate_context!())
        .expect("error while running dnss");
}
