mod configs;
mod net;
mod platform;

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;

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
#[derive(Serialize)]
pub struct SetDnsOutcome {
    pub adapter: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
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
    tauri::async_runtime::spawn_blocking(move || {
        let lock = app.state::<NetworkLock>();
        let _guard = acquire_network_lock(&lock)?;
        platform::set_dns_many(adapters.as_deref(), &servers)
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))?
}

/// Reset every adapter to DHCP (per-adapter outcomes, same as set_dns_many).
#[tauri::command]
async fn reset_all_dns(app: tauri::AppHandle) -> Result<Vec<SetDnsOutcome>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let lock = app.state::<NetworkLock>();
        let _guard = acquire_network_lock(&lock)?;
        platform::reset_all_dns()
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))?
}

#[tauri::command]
async fn flush_dns(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let lock = app.state::<NetworkLock>();
        let _guard = acquire_network_lock(&lock)?;
        platform::flush_dns()
    })
    .await
    .map_err(|e| format!("Background task failed: {}", e))?
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
    let (hostname, port) =
        parse_benchmark_target(target.as_deref().unwrap_or("https://www.cloudflare.com"))?;

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

/// Base64-encode UTF-16LE bytes, the format PowerShell's `-EncodedCommand`
/// expects. Keeps the elevation relaunch free of quoting pitfalls with the
/// spaced paths a dev checkout tends to live in.
#[cfg(all(target_os = "windows", debug_assertions))]
fn utf16le_base64(text: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = text
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let word = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | chunk.get(2).copied().unwrap_or(0) as u32;
        out.push(TABLE[(word >> 18) as usize & 63] as char);
        out.push(TABLE[(word >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(word >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[word as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// Dev-only Windows bootstrap: make sure the app actually runs elevated.
///
/// Debug builds carry an `asInvoker` manifest (a requireAdministrator
/// manifest makes `cargo run` fail with error 740 from a normal shell), so
/// the process may start unelevated. Changing DNS needs admin, so this
/// relaunches itself through UAC and blocks until the elevated instance
/// exits — the parked parent is what keeps `tauri dev` (and the vite dev
/// server the elevated window loads its UI from) alive.
///
/// Release builds keep `requireAdministrator` in the manifest, so Windows
/// elevates on launch and this whole path never compiles in.
#[cfg(all(target_os = "windows", debug_assertions))]
fn ensure_elevation_for_dev() {
    use std::process::Command;

    // `fltmc` only succeeds from an elevated token — the same probe the CLI
    // uses (`net session` is unreliable when the Server service is stopped).
    let elevated = Command::new("fltmc")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    if elevated {
        return;
    }

    eprintln!(
        "DNSS needs administrator privileges to change DNS settings; accept the UAC prompt..."
    );

    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(_) => {
            eprintln!(
                "Cannot locate the DNSS executable. Restart the terminal as administrator and run `npm run tauri dev` again."
            );
            std::process::exit(1);
        }
    };

    // `-Verb RunAs -Wait` shows the UAC dialog, starts the elevated instance
    // and blocks until it exits; the exit code is propagated so `tauri dev`
    // reports failures honestly. A declined UAC prompt throws -> exit 1, with
    // the reason written to stderr for the dev console.
    let script = format!(
        "$ProgressPreference='SilentlyContinue'; try {{ Start-Process -FilePath '{}' -Verb RunAs -Wait -PassThru -ErrorAction Stop | ForEach-Object {{ exit $_.ExitCode }} }} catch {{ [Console]::Error.WriteLine($_.Exception.Message); exit 1 }}",
        exe.display().to_string().replace('\'', "''")
    );
    let status = Command::new("powershell")
        .args(["-NoProfile", "-EncodedCommand", &utf16le_base64(&script)])
        .status();

    match status {
        Ok(status) if status.success() => std::process::exit(0),
        _ => {
            eprintln!(
                "Elevation was declined or failed. Restart the terminal as administrator and run `npm run tauri dev` again."
            );
            std::process::exit(1);
        }
    }
}

pub fn run() {
    // Dev builds may start unelevated (asInvoker manifest); elevate before
    // any UI or state is initialized.
    #[cfg(all(target_os = "windows", debug_assertions))]
    ensure_elevation_for_dev();

    tauri::Builder::default()
        // Opens external links (the About credit) in the user's real browser;
        // the webview itself must never navigate away from the app UI.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(NetworkLock::default())
        .invoke_handler(tauri::generate_handler![
            get_network_status,
            set_dns_many,
            reset_all_dns,
            flush_dns,
            get_configs,
            save_configs,
            benchmark_dns
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
    }
}
