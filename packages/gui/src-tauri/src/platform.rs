use std::process::Command;

use super::{Adapter, DnsStatus};

/// Run an external command with an argument vector (no shell involved,
/// so no metacharacter injection is possible) and return its stdout.
fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", cmd, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{} failed: {}", cmd, stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Run a command without failing on non-zero exit (output still returned).
#[cfg(any(target_os = "linux", target_os = "macos"))]
fn run_lenient(cmd: &str, args: &[&str]) -> String {
    Command::new(cmd)
        .args(args)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

/// Quote a value for safe inclusion inside a `sh -c`-style shell string.
/// Wraps in single quotes and escapes embedded single quotes POSIX-style.
#[cfg(any(target_os = "linux", target_os = "macos"))]
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// Run a command with elevation.
/// Windows: the app itself runs elevated (requireAdministrator manifest),
///         so commands run directly.
/// macOS:   `osascript` shows the native admin password dialog; the inner
///          shell string is built exclusively from shell-quoted tokens.
/// Linux:   `pkexec` executes the binary directly with an argument vector
///          (no shell involved).
#[cfg(any(target_os = "linux", target_os = "macos"))]
fn run_privileged(cmd: &str, args: &[&str]) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        // The app is already elevated; run directly.
        run(cmd, args).map(|_| ())
    } else if cfg!(target_os = "macos") {
        // osascript ultimately runs a shell string, so every dynamic token
        // must be shell-quoted. The AppleScript string itself is built with
        // escaped double quotes and backslashes.
        let quoted: Vec<String> = args.iter().map(|a| shell_quote(a)).collect();
        let shell_script = format!("{} {}", cmd, quoted.join(" "));
        let apple_script = shell_script
            .replace('\\', "\\\\")
            .replace('"', "\\\"");
        run(
            "osascript",
            &[
                "-e",
                &format!("do shell script \"{}\" with administrator privileges", apple_script),
            ],
        )
        .map(|_| ())
    } else {
        // pkexec passes the argument vector directly to the binary.
        let mut full: Vec<&str> = vec![cmd];
        full.extend_from_slice(args);
        run("pkexec", &full).map(|_| ())
    }
}

// ===== POSIX helpers shared by the Linux/macOS implementations =====

/// Wrap one per-adapter change result for the bulk API.
#[cfg(any(target_os = "linux", target_os = "macos"))]
fn set_dns_outcome(adapter: &str, servers: &[String]) -> super::SetDnsOutcome {
    match set_dns(adapter, servers) {
        Ok(()) => super::SetDnsOutcome {
            adapter: adapter.to_string(),
            ok: true,
            error: String::new(),
        },
        Err(error) => super::SetDnsOutcome {
            adapter: adapter.to_string(),
            ok: false,
            error,
        },
    }
}

// ===== Windows =====

/// Run a PowerShell snippet and return its stdout. Callers embed dynamic
/// tokens as single-quoted PowerShell strings only (`''` escapes a quote);
/// user data never becomes PowerShell syntax.
#[cfg(target_os = "windows")]
fn run_ps(script: &str) -> Result<String, String> {
    run("powershell", &["-NoProfile", "-Command", script])
}

/// Quote a value for embedding inside a PowerShell single-quoted string.
#[cfg(target_os = "windows")]
fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// One PowerShell spawn that answers everything a status refresh needs: the
/// adapter list (with each adapter's effective DNS servers), the default-route
/// adapter and its DNS servers. PowerShell startup costs ~0.5-1.5s per spawn,
/// so batching the process calls this replaces (adapter list, default-route
/// detection, DNS-in-use query, registry static query) is what makes the
/// refresh feel instant.
#[cfg(target_os = "windows")]
const STATUS_SCRIPT: &str = "\
$ErrorActionPreference = 'Stop'
try {
    $adapters = @(Get-NetAdapter | Sort-Object Status -Descending | \
        Select-Object Name, InterfaceDescription, InterfaceGuid)
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
$def = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | \
    Sort-Object { $_.InterfaceMetric + $_.RouteMetric } | \
    Select-Object -First 1 -ExpandProperty InterfaceAlias
$inUseByAdapter = @{}
Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object {
    $inUseByAdapter[$_.InterfaceAlias] = @($_.ServerAddresses)
}
$details = @($adapters | ForEach-Object {
    $props = Get-ItemProperty -Path \
        ('HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $_.InterfaceGuid) \
        -ErrorAction SilentlyContinue
    $regStatic = @(@($props.NameServer, $props.ProfileNameServer) -join ',' -split ',') | \
        ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    [PSCustomObject]@{
        Name = $_.Name
        InterfaceDescription = $_.InterfaceDescription
        Servers = @($inUseByAdapter[$_.Name])
        Static = @($regStatic)
    }
})
$static = @()
$inUse = @()
if ($def) {
    $defDetail = $details | Where-Object { $_.Name -eq $def } | Select-Object -First 1
    if ($defDetail) {
        $static = @($defDetail.Static)
        $inUse = @($defDetail.Servers)
    }
}
$status = [PSCustomObject]@{ default = $def; adapters = $details; static = @($static); inUse = @($inUse) }
ConvertTo-Json -Compress -InputObject $status -Depth 4";

/// Flatten a JSON value (array of strings, single string, or null) into a
/// trimmed, de-emptyied server list.
#[cfg(target_os = "windows")]
fn json_to_servers(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .collect(),
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => {
            vec![s.trim().to_string()]
        }
        _ => vec![],
    }
}

#[cfg(target_os = "windows")]
pub fn network_status() -> Result<super::NetworkStatus, String> {
    let output = run_ps(STATUS_SCRIPT)?;
    let value: serde_json::Value = serde_json::from_str(output.trim())
        .map_err(|e| format!("JSON parse error: {}", e))?;

    let default_adapter = value
        .get("default")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let empty = Vec::new();
    let adapter_items = value
        .get("adapters")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);
    let adapters = adapter_items
        .iter()
        .filter_map(|item| {
            let name = item.get("Name")?.as_str()?.to_string();
            let kind = item
                .get("InterfaceDescription")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let dns_servers = json_to_servers(item.get("Servers"));
            // Registry NameServer present = the servers were pinned on the
            // interface (by us or another tool); otherwise they are
            // DHCP-provided.
            let dns_static = !json_to_servers(item.get("Static")).is_empty();
            Some(Adapter {
                is_default: default_adapter.as_deref() == Some(name.as_str()),
                name,
                kind,
                dns_servers,
                dns_static,
            })
        })
        .collect();

    // With no default route there is no adapter whose DNS could be shown.
    let active_dns = if default_adapter.is_some() {
        Some(DnsStatus {
            static_servers: json_to_servers(value.get("static")),
            in_use: json_to_servers(value.get("inUse")),
        })
    } else {
        None
    };

    Ok(super::NetworkStatus {
        adapters,
        default_adapter,
        active_dns,
    })
}

/// Apply one server list to several adapters in a single PowerShell spawn.
/// `None` targets every adapter the OS knows. Each adapter is validated and
/// applied inside the script with per-adapter error capture, so one dead
/// adapter cannot hide the others' results — and N adapters cost one
/// process instead of 3N (the old per-adapter path spawned separate
/// PowerShell processes for validation and for the change itself, which is
/// what made applying DNS feel glacial).
#[cfg(target_os = "windows")]
const SET_MANY_SCRIPT: &str = "\
$ErrorActionPreference = 'Stop'
try {
    $known = @{}
    Get-NetAdapter | ForEach-Object { $known[$_.Name] = $true }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
$results = @()
foreach ($n in __NAMES__) {
    if (-not $known.ContainsKey($n)) {
        $results += [PSCustomObject]@{ adapter = $n; ok = $false; error = ('Unknown network adapter: ' + $n) }
        continue
    }
    try {
        __CMD__
        $results += [PSCustomObject]@{ adapter = $n; ok = $true; error = '' }
    } catch {
        $results += [PSCustomObject]@{ adapter = $n; ok = $false; error = $_.Exception.Message }
    }
}
ConvertTo-Json -Compress -InputObject @($results)";

#[cfg(target_os = "windows")]
pub fn set_dns_many(
    names: Option<&[String]>,
    servers: &[String],
) -> Result<Vec<super::SetDnsOutcome>, String> {
    let names_expr = match names {
        Some(names) => {
            let quoted: Vec<String> = names.iter().map(|n| ps_quote(n)).collect();
            format!("@({})", quoted.join(","))
        }
        // The adapter list comes from the OS itself; nothing to quote.
        None => "@(Get-NetAdapter | Select-Object -ExpandProperty Name)".to_string(),
    };
    // Set-DnsClientServerAddress replaces the *entire* address list in a
    // single call. The previous netsh `set dns` + `add dns index=N` pattern
    // left stale entries at index >= 3 behind and did not cover IPv6; this
    // cmdlet covers both address families, so an IPv6 static resolver set
    // by another tool no longer survives a reset.
    let cmd = if servers.is_empty() {
        "Set-DnsClientServerAddress -InterfaceAlias $n -ResetServerAddresses -ErrorAction Stop"
            .to_string()
    } else {
        let quoted: Vec<String> = servers.iter().map(|s| ps_quote(s)).collect();
        format!(
            "Set-DnsClientServerAddress -InterfaceAlias $n -ServerAddresses @({}) -ErrorAction Stop",
            quoted.join(",")
        )
    };
    let script = SET_MANY_SCRIPT
        .replace("__NAMES__", &names_expr)
        .replace("__CMD__", &cmd);

    let output = run_ps(&script)?;
    let trimmed = output.trim();
    if trimmed.is_empty() {
        // No adapters at all: nothing was changed.
        return Ok(vec![]);
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("JSON parse error: {}", e))?;
    let items = match value {
        serde_json::Value::Array(items) => items,
        item @ serde_json::Value::Object(_) => vec![item],
        _ => vec![],
    };
    let outcomes = items
        .iter()
        .filter_map(|item| {
            Some(super::SetDnsOutcome {
                adapter: item.get("adapter")?.as_str()?.to_string(),
                ok: item.get("ok")?.as_bool()?,
                error: item
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect();
    Ok(outcomes)
}

#[cfg(target_os = "windows")]
pub fn reset_all_dns() -> Result<Vec<super::SetDnsOutcome>, String> {
    set_dns_many(None, &[])
}

#[cfg(target_os = "windows")]
pub fn flush_dns() -> Result<(), String> {
    run("ipconfig", &["/flushdns"]).map(|_| ())
}

// ===== Linux =====

#[cfg(target_os = "linux")]
pub fn list_adapters() -> Result<Vec<Adapter>, String> {
    let output = run("nmcli", &["-t", "-f", "DEVICE,TYPE,STATE", "device", "status"])?;
    let default_name = detect_default_adapter()?;

    let adapters = output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.trim().split(':').collect();
            if parts.len() < 3 || parts[0].is_empty() || parts[0].starts_with("lo") {
                return None;
            }
            let name = parts[0].to_string();
            let kind = parts[1].to_string();
            let connected = parts[2] == "connected";
            Some(Adapter {
                is_default: default_name.as_deref() == Some(name.as_str()),
                name,
                kind: if connected {
                    kind.clone()
                } else {
                    format!("{} (disconnected)", kind)
                },
                // Filled in per device by network_status from one nmcli query.
                dns_servers: Vec::new(),
                dns_static: false,
            })
        })
        .collect();
    Ok(adapters)
}

#[cfg(target_os = "linux")]
fn get_connection_name(device: &str) -> Result<String, String> {
    let output = run(
        "nmcli",
        &["-t", "-f", "GENERAL.CONNECTION", "dev", "show", device],
    )?;
    // Output format: GENERAL.CONNECTION:<name>
    let name = output
        .lines()
        .next()
        .and_then(|line| line.split_once(':'))
        .map(|(_, value)| unescape_nmcli(value.trim()))
        .unwrap_or_default();
    // Verified against real outputs and the man page: for a device without
    // an active connection, `nmcli dev show` renders the value as the "--"
    // placeholder (unmanaged and disconnected states alike); some terse
    // output paths render it empty instead, so both mean "no connection".
    if name.is_empty() || name == "--" {
        return Err(format!(
            "Device \"{}\" has no active connection to modify",
            device
        ));
    }
    Ok(name)
}

/// Undo `nmcli -t` value escaping. Terse mode escapes ":" inside values as
/// "\:" and a literal backslash as "\\", so a connection named "Home:Wifi"
/// must be unescaped before the name is handed back to nmcli (the CLI
/// unescapes too; without it `nmcli con mod "Home\:Wifi"` fails).
#[cfg(target_os = "linux")]
fn unescape_nmcli(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(current) = chars.next() {
        if current == '\\' {
            match chars.next() {
                Some(escaped) => out.push(escaped),
                None => out.push('\\'),
            }
        } else {
            out.push(current);
        }
    }
    out
}

#[cfg(target_os = "linux")]
pub fn get_active_dns(adapter: Option<&str>) -> Result<super::DnsStatus, String> {
    let device = match adapter {
        Some(name) => name.to_string(),
        None => detect_default_adapter()?
            .ok_or_else(|| "No active network adapter found".to_string())?,
    };

    let output = run("nmcli", &["dev", "show", &device])?;
    // Report both families: an IPv6 resolver in use is invisible otherwise,
    // and the status would claim "DHCP" while a custom resolver is active.
    let in_use: Vec<String> = output
        .lines()
        .filter(|line| line.starts_with("IP4.DNS") || line.starts_with("IP6.DNS"))
        .filter_map(|line| line.split_whitespace().nth(1).map(|s| s.to_string()))
        .collect();

    // Reading /etc/resolv.conf via nmcli only shows in-use servers; there is
    // no cheap "static" concept with NetworkManager, so report them as static
    // when a connection has explicit ipv4.dns/ipv6.dns values.
    let connection = get_connection_name(&device).unwrap_or_default();
    let static_servers = if connection.is_empty() {
        vec![]
    } else {
        let dns4 = run_lenient(
            "nmcli",
            &["-g", "ipv4.dns", "con", "show", &connection],
        );
        let dns6 = run_lenient(
            "nmcli",
            &["-g", "ipv6.dns", "con", "show", &connection],
        );
        dns4
            .lines()
            .chain(dns6.lines())
            .flat_map(|line| line.split_whitespace())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    };

    Ok(super::DnsStatus {
        static_servers,
        in_use,
    })
}

#[cfg(target_os = "linux")]
pub fn set_dns(adapter: &str, servers: &[String]) -> Result<(), String> {
    let connection = get_connection_name(adapter)?;
    let dns_value = servers.join(" ");
    let ignore_auto = if servers.is_empty() { "no" } else { "yes" };

    // Build the "modify" arguments. The reset case also clears a former
    // *IPv6* static config: without it, "reset to DHCP" left IPv6 resolvers
    // active while the status reported plain DHCP. The apply case disables
    // auto-learned IPv6 resolvers (RA/RDNSS/DHCPv6): on dual-stack networks
    // they would otherwise keep serving AAAA queries and bypass the chosen
    // provider entirely.
    let mut mod_args: Vec<String> = vec![
        "con".to_string(),
        "mod".to_string(),
        connection.clone(),
        "ipv4.dns".to_string(),
        dns_value.clone(),
        "ipv4.ignore-auto-dns".to_string(),
        ignore_auto.to_string(),
        "ipv6.dns".to_string(),
        String::new(),
        "ipv6.ignore-auto-dns".to_string(),
        ignore_auto.to_string(),
    ];
    let mod_refs: Vec<&str> = mod_args.iter().map(String::as_str).collect();

    // First try without elevation (NetworkManager often allows the active
    // user to modify their own connections); fall back to a single
    // privileged shell — one authorization prompt for both steps instead of
    // two separate pkexec calls — with every dynamic token shell-quoted.
    let direct = run("nmcli", &mod_refs)
        .and_then(|_| run("nmcli", &["con", "up", &connection]));

    match direct {
        Ok(_) => Ok(()),
        Err(_) => {
            let mut script = format!(
                "nmcli con mod {} ipv4.dns {} ipv4.ignore-auto-dns {}",
                shell_quote(&connection),
                shell_quote(&dns_value),
                shell_quote(ignore_auto)
            );
            // Same IPv6 handling as the direct path above.
            script.push_str(&format!(
                " ipv6.dns {} ipv6.ignore-auto-dns {}",
                shell_quote(""),
                shell_quote(ignore_auto)
            ));
            script.push_str(&format!(
                " && nmcli con up {}",
                shell_quote(&connection)
            ));
            run_privileged("sh", &["-c", &script])
        }
    }
}

#[cfg(target_os = "linux")]
pub fn network_status() -> Result<super::NetworkStatus, String> {
    let mut adapters = list_adapters()?;
    // One terse `nmcli dev show` for every device: GENERAL.DEVICE lines name
    // the device, the IP4.DNS[n] lines that follow list its resolvers. A
    // device that fails to report simply stays with an empty server list.
    let show = run_lenient("nmcli", &["-t", "dev", "show"]);
    let mut servers_by_device: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    let mut current_device: Option<String> = None;
    for line in show.lines() {
        if let Some(name) = line.strip_prefix("GENERAL.DEVICE:") {
            current_device = Some(name.trim().to_string());
        } else if line.starts_with("IP4.DNS[") {
            if let (Some(device), Some((_, server))) =
                (current_device.as_ref(), line.split_once(':'))
            {
                let server = server.trim();
                if !server.is_empty() {
                    servers_by_device
                        .entry(device.clone())
                        .or_default()
                        .push(server.to_string());
                }
            }
        }
    }
    for adapter in &mut adapters {
        if let Some(servers) = servers_by_device.get(&adapter.name) {
            adapter.dns_servers = servers.clone();
        }
    }

    let default_adapter = adapters
        .iter()
        .find(|a| a.is_default)
        .map(|a| a.name.clone());
    let active_dns = match &default_adapter {
        Some(name) => Some(get_active_dns(Some(name))?),
        None => None,
    };
    Ok(super::NetworkStatus {
        adapters,
        default_adapter,
        active_dns,
    })
}

#[cfg(target_os = "linux")]
pub fn set_dns_many(
    names: Option<&[String]>,
    servers: &[String],
) -> Result<Vec<super::SetDnsOutcome>, String> {
    let resolved: Vec<String> = match names {
        Some(names) => names.to_vec(),
        None => list_adapters()?.into_iter().map(|a| a.name).collect(),
    };
    Ok(resolved
        .iter()
        .map(|name| set_dns_outcome(name, servers))
        .collect())
}

#[cfg(target_os = "linux")]
pub fn reset_all_dns() -> Result<Vec<super::SetDnsOutcome>, String> {
    let adapters = list_adapters()?;
    let mut outcomes: Vec<super::SetDnsOutcome> = Vec::new();
    for adapter in &adapters {
        // Devices without an active NetworkManager connection (disconnected
        // NICs, unmanaged devices) have nothing to reset and must not fail
        // the whole bulk reset; skip them and only report real failures.
        if get_connection_name(&adapter.name).is_err() {
            continue;
        }
        outcomes.push(set_dns_outcome(&adapter.name, &[]));
    }
    Ok(outcomes)
}

#[cfg(target_os = "linux")]
pub fn flush_dns() -> Result<(), String> {
    // Decide based on the exit status, not on stdout (a successful command
    // commonly produces no output at all).
    if run("resolvectl", &["flush-caches"]).is_ok() {
        return Ok(());
    }
    run("systemd-resolve", &["--flush-caches"]).map(|_| ())
}

#[cfg(target_os = "linux")]
pub fn detect_default_adapter() -> Result<Option<String>, String> {
    // -o keeps one route per line so multi-default tables parse safely (the
    // previous version computed the "dev" position on one line but indexed
    // into the token stream of the whole output). The route with the lowest
    // metric wins — the kernel uses it when several defaults exist, and
    // `ip route show default` is NOT metric-ordered.
    let output = run("ip", &["-o", "route", "show", "default"])?;
    let mut best: Option<(u32, String)> = None;
    for line in output.lines() {
        let words: Vec<&str> = line.split_whitespace().collect();
        let dev_pos = match words.iter().position(|&word| word == "dev") {
            Some(pos) => pos,
            None => continue,
        };
        let dev = match words.get(dev_pos + 1) {
            Some(dev) => dev.to_string(),
            None => continue,
        };
        // A missing metric means the kernel's implicit default of 0.
        let metric: u32 = words
            .iter()
            .position(|&word| word == "metric")
            .and_then(|pos| words.get(pos + 1))
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        if best
            .as_ref()
            .map_or(true, |(best_metric, _)| metric < *best_metric)
        {
            best = Some((metric, dev));
        }
    }
    Ok(best.map(|(_, dev)| dev))
}

// ===== macOS =====

/// Enabled network service names, without default-route detection (safe to
/// call from `detect_default_adapter`; calling `list_adapters` there would
/// recurse infinitely).
#[cfg(target_os = "macos")]
fn list_mac_services() -> Result<Vec<String>, String> {
    let output = run("networksetup", &["-listallnetworkservices"])?;
    Ok(output
        .lines()
        .skip(1) // first line is "An asterisk (*) denotes that a network service is disabled."
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() && !line.starts_with('*'))
        .map(|line| line.to_string())
        .collect())
}

#[cfg(target_os = "macos")]
pub fn list_adapters() -> Result<Vec<Adapter>, String> {
    let services = list_mac_services()?;
    let default_name = detect_default_adapter()?;

    let adapters = services
        .into_iter()
        .map(|name| Adapter {
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
            kind: "Service".to_string(),
            // Per-service resolvers would need one `networksetup
            // -getdnsservers` spawn per service; the active adapter's
            // servers are still shown via active_dns.
            dns_servers: Vec::new(),
            dns_static: false,
        })
        .collect();
    Ok(adapters)
}

#[cfg(target_os = "macos")]
pub fn get_active_dns(adapter: Option<&str>) -> Result<super::DnsStatus, String> {
    let service = match adapter {
        Some(name) => name.to_string(),
        None => detect_default_adapter()?
            .ok_or_else(|| "No active network service found".to_string())?,
    };

    let output = run("networksetup", &["-getdnsservers", &service])?;
    let static_servers: Vec<String> = if output.contains("There aren't any DNS Servers set") {
        vec![]
    } else {
        output
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect()
    };

    let scutil = run("scutil", &["--dns"])?;
    // Only true `nameserver[N]` entries are accepted — `if_nameserver` and
    // scoped-resolver lines must not match. scutil repeats the same
    // nameserver per resolver, so de-duplicate while preserving order (a
    // HashSet would randomize primary/secondary order on every render).
    let mut in_use: Vec<String> = Vec::new();
    for line in scutil.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("nameserver[") {
            continue;
        }
        if let Some(server) = trimmed.split_whitespace().nth(2) {
            let server = server.trim().to_string();
            if !server.is_empty() && !in_use.contains(&server) {
                in_use.push(server);
            }
        }
    }

    Ok(super::DnsStatus {
        static_servers,
        in_use,
    })
}

#[cfg(target_os = "macos")]
pub fn set_dns(adapter: &str, servers: &[String]) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["-setdnsservers", adapter];
    if servers.is_empty() {
        args.push("empty");
    } else {
        for server in servers {
            args.push(server);
        }
    }
    run_privileged("networksetup", &args)
}

#[cfg(target_os = "macos")]
pub fn network_status() -> Result<super::NetworkStatus, String> {
    let adapters = list_adapters()?;
    let default_adapter = adapters
        .iter()
        .find(|a| a.is_default)
        .map(|a| a.name.clone());
    let active_dns = match &default_adapter {
        Some(name) => Some(get_active_dns(Some(name))?),
        None => None,
    };
    Ok(super::NetworkStatus {
        adapters,
        default_adapter,
        active_dns,
    })
}

#[cfg(target_os = "macos")]
pub fn set_dns_many(
    names: Option<&[String]>,
    servers: &[String],
) -> Result<Vec<super::SetDnsOutcome>, String> {
    let resolved: Vec<String> = match names {
        Some(names) => names.to_vec(),
        None => list_adapters()?.into_iter().map(|a| a.name).collect(),
    };
    Ok(resolved
        .iter()
        .map(|name| set_dns_outcome(name, servers))
        .collect())
}

#[cfg(target_os = "macos")]
pub fn reset_all_dns() -> Result<Vec<super::SetDnsOutcome>, String> {
    let adapters = list_adapters()?;
    if adapters.is_empty() {
        return Ok(vec![]);
    }
    // One privileged shell (and therefore one authorization prompt) instead
    // of one per adapter. Every service name is shell-quoted here, and
    // run_privileged quotes the whole script again for AppleScript/sh
    // transport, so metacharacters in service names stay harmless.
    let script = adapters
        .iter()
        .map(|adapter| {
            format!(
                "networksetup -setdnsservers {} empty",
                shell_quote(&adapter.name)
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    run_privileged("sh", &["-c", &script]).map(|_| {
        adapters
            .iter()
            .map(|a| super::SetDnsOutcome {
                adapter: a.name.clone(),
                ok: true,
                error: String::new(),
            })
            .collect()
    })
}

#[cfg(target_os = "macos")]
pub fn flush_dns() -> Result<(), String> {
    run_privileged("killall", &["-HUP", "mDNSResponder"])
}

/// Resolve the hardware device (e.g. "en0") of the default route to the
/// network *service* name (e.g. "Wi-Fi") that `networksetup` expects.
#[cfg(target_os = "macos")]
fn device_to_service(device: &str) -> Option<String> {
    let output = run("networksetup", &["-listallhardwareports"]).ok()?;
    let mut current_device: Option<&str> = None;
    let mut service_for_device: Option<String> = None;

    for line in output.lines() {
        if let Some(service) = line.strip_prefix("Hardware Port:") {
            // Remember the service name of the current block.
            service_for_device = Some(service.trim().to_string());
        } else if let Some(dev) = line.strip_prefix("Device:") {
            current_device = Some(dev.trim());
            if dev.trim() == device {
                return service_for_device;
            }
        }
    }
    let _ = current_device;
    None
}

#[cfg(target_os = "macos")]
pub fn detect_default_adapter() -> Result<Option<String>, String> {
    // Lenient: with no default route (offline) `route` exits non-zero, which
    // must degrade to None rather than fail the adapter listing.
    let output = run_lenient("route", &["-n", "get", "default"]);
    // "   interface: en0" -> hardware device; map it to a network service.
    let device = output
        .lines()
        .find(|line| line.trim().starts_with("interface:"))
        .and_then(|line| line.split_whitespace().nth(1).map(|s| s.to_string()));

    Ok(match device {
        Some(dev) => match device_to_service(&dev) {
            Some(service) => Some(service),
            None => {
                // Virtual interfaces (utun*/ppp* — VPNs) have no
                // networksetup service; handing the raw device name to
                // networksetup fails with "not a recognized network
                // service". Fall back to the first enabled physical service.
                list_mac_services().ok().and_then(|s| s.into_iter().next())
            }
        },
        None => None,
    })
}



