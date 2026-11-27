//! Persistent storage for user-saved DNS configurations.
//!
//! Storage layout (shared with the CLI's `@seymi/dnss-core` config store):
//!   ~/.dnss/configs.json
//!
//! Sharing one file keeps custom servers in sync between the CLI and the
//! desktop app; webview localStorage is never used for persistence.

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

pub const SETTINGS_SCHEMA_VERSION: u32 = 1;
const DEFAULT_ACCENT_HEX: &str = "#10b981";
const DEFAULT_BENCHMARK_TARGET: &str = "https://www.cloudflare.com";
const MAX_SETTINGS_IMPORT_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DnsConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub primary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alternative: Option<String>,
}

/// Unified VS Code-style settings schema persisted in `~/.dnss/settings.json`
/// and shared with `@seymi/dnss-core` / CLI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "dnss.schemaVersion", default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(rename = "appearance.theme", default = "default_theme")]
    pub theme: String,
    #[serde(rename = "appearance.accent", default = "default_accent")]
    pub accent: String,
    #[serde(rename = "appearance.fontFamily", default = "default_font_family")]
    pub font_family: String,
    #[serde(rename = "appearance.fontSize", default = "default_font_size")]
    pub font_size: u8,
    #[serde(rename = "general.language", default = "default_language")]
    pub language: String,
    #[serde(rename = "benchmark.target", default = "default_benchmark_target")]
    pub benchmark_target: String,
    #[serde(rename = "presets.hidden", default)]
    pub hidden_presets: Vec<String>,
    #[serde(rename = "dns.servers", default)]
    pub servers: Vec<DnsConfig>,
}

fn default_schema_version() -> u32 {
    SETTINGS_SCHEMA_VERSION
}
fn default_theme() -> String {
    "system".to_string()
}
fn default_accent() -> String {
    DEFAULT_ACCENT_HEX.to_string()
}
fn default_font_family() -> String {
    "google-sans".to_string()
}
fn default_font_size() -> u8 {
    14
}
fn default_language() -> String {
    "en".to_string()
}
fn default_benchmark_target() -> String {
    DEFAULT_BENCHMARK_TARGET.to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            theme: default_theme(),
            accent: default_accent(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            language: default_language(),
            benchmark_target: default_benchmark_target(),
            hidden_presets: Vec::new(),
            servers: Vec::new(),
        }
    }
}

fn slugify_server_id(name: &str, used: &mut HashSet<String>) -> String {
    let mut base = String::new();
    let mut prev_dash = false;
    for ch in name.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            base.push(ch);
            prev_dash = false;
        } else if !prev_dash && !base.is_empty() {
            base.push('-');
            prev_dash = true;
        }
        if base.len() >= 48 {
            break;
        }
    }
    let trimmed = base.trim_matches('-');
    let root = if trimmed.is_empty() { "server" } else { trimmed };
    let mut candidate = root.to_string();
    let mut suffix: u32 = 2;
    while used.contains(&candidate) {
        candidate = format!("{}-{}", root, suffix);
        suffix += 1;
    }
    used.insert(candidate.clone());
    candidate
}

fn normalize_server_configs(configs: Vec<DnsConfig>) -> Vec<DnsConfig> {
    let mut used = HashSet::new();
    configs
        .into_iter()
        .map(|mut config| {
            config.name = config.name.trim().to_string();
            config.primary = config.primary.trim().to_string();
            if let Some(alternative) = config.alternative.as_deref() {
                let trimmed = alternative.trim();
                config.alternative = if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                };
            }
            let cleaned_id = config.id.as_deref().map(|raw| {
                let mut out = String::new();
                let mut prev_dash = false;
                for ch in raw.trim().to_lowercase().chars() {
                    if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                        out.push(ch);
                        prev_dash = false;
                    } else if !prev_dash && !out.is_empty() {
                        out.push('-');
                        prev_dash = true;
                    }
                    if out.len() >= 64 {
                        break;
                    }
                }
                out.trim_matches('-').to_string()
            });
            let id = match cleaned_id {
                Some(id) if !id.is_empty() && !used.contains(&id) => {
                    used.insert(id.clone());
                    id
                }
                _ => slugify_server_id(&config.name, &mut used),
            };
            config.id = Some(id);
            config
        })
        .collect()
}

fn is_valid_hex_color(value: &str) -> bool {
    let bytes = value.trim().as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(|b| b.is_ascii_hexdigit())
}

/// Locate `~/.dnss` (`%USERPROFILE%` on Windows, `$HOME` elsewhere).
fn config_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .filter(|value| !value.is_empty())
        .or_else(|| std::env::var_os("HOME").filter(|value| !value.is_empty()))
        .map(PathBuf::from)
        .map(|home| home.join(".dnss"))
}

fn is_valid_ipv4(value: &str) -> bool {
    value.trim().parse::<std::net::Ipv4Addr>().is_ok()
}

const MAX_NAME_LEN: usize = 64;
const MAX_SERVER_LEN: usize = 45;

/// Persisted data is user-controlled: never trust it without validation,
/// since these values are later handed to OS commands. Length caps keep a
/// hostile entry from the shared file from blowing up the UI or command
/// lines.
fn is_valid_config(config: &DnsConfig) -> bool {
    let trimmed_name = config.name.trim();
    let name_ok = !trimmed_name.is_empty()
        && trimmed_name.chars().count() <= MAX_NAME_LEN;
    let servers_ok = config.primary.len() <= MAX_SERVER_LEN
        && config
            .alternative
            .as_deref()
            .map_or(true, |a| a.len() <= MAX_SERVER_LEN);
    name_ok
        && servers_ok
        && is_valid_ipv4(&config.primary)
        && config
            .alternative
            .as_deref()
            .map(is_valid_ipv4)
            .unwrap_or(true)
}

/// Read the saved configurations from `settings.json` (preferring the unified
/// store when `"dns.servers"` is present) with fallback to `configs.json`.
pub fn load_configs() -> Vec<DnsConfig> {
    if let Some(dir) = config_dir() {
        let settings_path = dir.join("settings.json");
        if let Ok(data) = fs::read_to_string(&settings_path) {
            if let Ok(serde_json::Value::Object(map)) =
                serde_json::from_str::<serde_json::Value>(data.trim())
            {
                if map.get("dns.servers").and_then(|v| v.as_array()).is_some() {
                    if let Ok(settings) = normalize_settings_value(&map, false) {
                        return settings.servers;
                    }
                }
            }
        }
    }
    load_configs_from_legacy_file()
}

fn load_configs_from_legacy_file() -> Vec<DnsConfig> {
    let path = match config_dir() {
        Some(dir) => dir.join("configs.json"),
        None => return vec![],
    };
    let data = match fs::read_to_string(&path) {
        Ok(data) => data,
        Err(_) => return vec![],
    };
    if data.trim().is_empty() {
        return vec![];
    }
    // Per-entry tolerant parse: one malformed/legacy entry must not discard
    // every saved configuration. The previous whole-array parse returned an
    // empty list for the entire file, and the next save() persisted that
    // wipe. Also matches the CLI's per-entry filtering behavior.
    let items = match serde_json::from_str::<serde_json::Value>(data.trim()) {
        Ok(serde_json::Value::Array(items)) => items,
        _ => {
            quarantine_corrupt_file(&path);
            return vec![];
        }
    };
    let mut valid: Vec<DnsConfig> = Vec::new();
    let mut dropped: Vec<serde_json::Value> = Vec::new();
    for item in items {
        let mut config = match serde_json::from_value::<DnsConfig>(item.clone())
        {
            Ok(config) => config,
            Err(_) => {
                dropped.push(item);
                continue;
            }
        };
        // Treat an empty alternative like an absent one.
        if config.alternative.as_deref().map(str::trim) == Some("") {
            config.alternative = None;
        }
        if is_valid_config(&config) {
            valid.push(config);
        } else {
            dropped.push(item);
        }
    }
    if !dropped.is_empty() {
        quarantine_dropped(&path, &dropped);
    }
    valid
}

const MAX_QUARANTINE_ENTRIES: usize = 50;

/// Keep entries dropped by validation in `configs.json.invalid` instead of
/// discarding them silently: the next save() would otherwise erase them
/// permanently (mirrors the CLI's quarantine behavior).
fn quarantine_dropped(path: &std::path::Path, dropped: &[serde_json::Value]) {
    let quarantine_path = path.with_extension("json.invalid");
    // Never write through a planted symlink (see remove_symlink).
    remove_symlink(&quarantine_path);
    let mut existing: Vec<serde_json::Value> =
        fs::read_to_string(&quarantine_path)
            .ok()
            .and_then(|data| serde_json::from_str(&data).ok())
            .unwrap_or_default();
    for entry in dropped {
        if !existing.contains(entry) {
            existing.push(entry.clone());
        }
    }
    let keep_from = existing.len().saturating_sub(MAX_QUARANTINE_ENTRIES);
    let trimmed = existing.split_off(keep_from);
    // Best effort only: a failed quarantine write must never break loading.
    let _ = fs::write(
        &quarantine_path,
        serde_json::to_string(&trimmed).unwrap_or_default(),
    );
}

/// Defense-in-depth against symlink planting in `~/.dnss` (parity with the
/// CLI's config store): auxiliary files must never be written *through* a
/// symlink, or a pre-planted link would clobber an arbitrary target.
/// If the destination is a symlink it is removed so the following write
/// recreates a real file.
fn remove_symlink(path: &Path) {
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            let _ = fs::remove_file(path);
        }
    }
}

/// Copy `src` to `dest` for backup purposes, symlink-safe.
fn safe_backup_copy(src: &Path, dest: &Path) {
    remove_symlink(dest);
    let _ = fs::copy(src, dest);
}

/// Keep a readable-but-unparseable config file for manual recovery instead
/// of letting the next save() overwrite it (which would destroy every
/// saved configuration permanently).
fn quarantine_corrupt_file(path: &std::path::Path) {
    let corrupt_path = path.with_extension("json.corrupt");
    safe_backup_copy(path, &corrupt_path);
}

/// Atomically write `data` to `dir/filename` via an exclusive (`create_new`)
/// sibling temp file + `sync_all` + `rename`, keeping a symlink-safe `.bak`.
fn atomic_write_json(dir: &Path, filename: &str, data: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let path = dir.join(filename);
    let bak_path = dir.join(format!("{}.bak", filename));
    if path.exists() {
        safe_backup_copy(&path, &bak_path);
    }

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp_path = dir.join(format!(
        "{}.{}.{}.tmp",
        filename,
        std::process::id(),
        nonce
    ));
    remove_symlink(&tmp_path);

    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&tmp_path)
        .map_err(|e| format!("Failed to write {}: {}", filename, e))?;
    let write_res = file
        .write_all(data.as_bytes())
        .and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to write {}: {}", filename, error));
    }

    if let Err(error) = fs::rename(&tmp_path, &path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to write {}: {}", filename, error));
    }
    Ok(())
}

fn normalize_settings_value(
    obj: &serde_json::Map<String, serde_json::Value>,
    strict: bool,
) -> Result<AppSettings, String> {
    let mut out = AppSettings::default();

    if let Some(theme) = obj.get("appearance.theme").and_then(|v| v.as_str()) {
        if matches!(theme, "light" | "dark" | "system") {
            out.theme = theme.to_string();
        }
    }
    if let Some(accent) = obj.get("appearance.accent").and_then(|v| v.as_str()) {
        if is_valid_hex_color(accent) {
            out.accent = accent.trim().to_lowercase();
        }
    }
    if let Some(font) = obj.get("appearance.fontFamily").and_then(|v| v.as_str()) {
        if matches!(font, "google-sans" | "inter" | "dm-sans" | "manrope" | "roboto") {
            out.font_family = font.to_string();
        }
    }
    if let Some(size) = obj.get("appearance.fontSize").and_then(|v| v.as_u64()) {
        if matches!(size, 12 | 14 | 16) {
            out.font_size = size as u8;
        }
    }
    if let Some(lang) = obj.get("general.language").and_then(|v| v.as_str()) {
        if matches!(lang, "en" | "fa") {
            out.language = lang.to_string();
        }
    }
    if let Some(target) = obj.get("benchmark.target").and_then(|v| v.as_str()) {
        let trimmed = target.trim();
        if !trimmed.is_empty() && trimmed.len() <= 2000 {
            out.benchmark_target = trimmed.to_string();
        }
    }
    if let Some(hidden_val) = obj.get("presets.hidden") {
        match hidden_val.as_array() {
            Some(items) => {
                let mut seen = HashSet::new();
                for item in items {
                    if let Some(s) = item.as_str() {
                        let trimmed = s.trim();
                        if !trimmed.is_empty()
                            && trimmed.len() <= 64
                            && seen.insert(trimmed.to_string())
                        {
                            out.hidden_presets.push(trimmed.to_string());
                        }
                    }
                }
            }
            None if strict => return Err("\"presets.hidden\" must be an array".to_string()),
            None => {}
        }
    }
    if let Some(servers_val) = obj.get("dns.servers") {
        match servers_val.as_array() {
            Some(items) => {
                let mut valid = Vec::new();
                for item in items {
                    match serde_json::from_value::<DnsConfig>(item.clone()) {
                        Ok(mut cfg) => {
                            if cfg.alternative.as_deref().map(str::trim) == Some("") {
                                cfg.alternative = None;
                            }
                            if is_valid_config(&cfg) {
                                valid.push(cfg);
                            } else if strict {
                                return Err(format!("Invalid DNS configuration: {}", cfg.name));
                            }
                        }
                        Err(_) if strict => {
                            return Err("Invalid entry in \"dns.servers\"".to_string());
                        }
                        Err(_) => {}
                    }
                }
                out.servers = normalize_server_configs(valid);
            }
            None if strict => return Err("\"dns.servers\" must be an array".to_string()),
            None => {}
        }
    }
    Ok(out)
}

/// Read the unified `~/.dnss/settings.json` (migrating `configs.json` on first run).
pub fn load_settings() -> AppSettings {
    let dir = match config_dir() {
        Some(dir) => dir,
        None => return AppSettings::default(),
    };
    let path = dir.join("settings.json");
    let data = match fs::read_to_string(&path) {
        Ok(data) if !data.trim().is_empty() => data,
        _ => {
            let mut defaults = AppSettings::default();
            defaults.servers = normalize_server_configs(load_configs_from_legacy_file());
            return defaults;
        }
    };
    match serde_json::from_str::<serde_json::Value>(data.trim()) {
        Ok(serde_json::Value::Object(map)) => {
            let mut normalized = normalize_settings_value(&map, false).unwrap_or_else(|_| {
                let mut defaults = AppSettings::default();
                defaults.servers = normalize_server_configs(load_configs_from_legacy_file());
                defaults
            });
            if map.get("dns.servers").and_then(|v| v.as_array()).is_none() {
                normalized.servers = normalize_server_configs(load_configs_from_legacy_file());
            }
            normalized
        }
        _ => {
            quarantine_corrupt_file(&path);
            let mut defaults = AppSettings::default();
            defaults.servers = normalize_server_configs(load_configs_from_legacy_file());
            defaults
        }
    }
}

/// Validate, normalize, and persist unified settings to `~/.dnss/settings.json`
/// while keeping `~/.dnss/configs.json` synchronized.
pub fn save_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let val = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    let map = val
        .as_object()
        .ok_or_else(|| "Settings must serialize to an object".to_string())?;
    let normalized = normalize_settings_value(map, true)?;
    let dir = config_dir().ok_or_else(|| "Cannot resolve home directory".to_string())?;
    let settings_json = serde_json::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    let configs_json = serde_json::to_string_pretty(&normalized.servers)
        .map_err(|e| format!("Failed to serialize configs: {}", e))?;
    atomic_write_json(&dir, "settings.json", &settings_json)?;
    atomic_write_json(&dir, "configs.json", &configs_json)?;
    Ok(normalized)
}

pub fn export_settings_json() -> Result<String, String> {
    serde_json::to_string_pretty(&load_settings())
        .map_err(|e| format!("Failed to serialize settings: {}", e))
}

pub fn import_settings_json(raw_json: &str) -> Result<AppSettings, String> {
    if raw_json.len() > MAX_SETTINGS_IMPORT_BYTES {
        return Err("Settings file exceeds 512 KiB size limit".to_string());
    }
    let parsed: serde_json::Value = serde_json::from_str(raw_json.trim())
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    let map = parsed
        .as_object()
        .ok_or_else(|| "Settings JSON must be an object".to_string())?;
    let normalized = normalize_settings_value(map, true)?;
    save_settings(normalized)
}

/// Validate, normalize and persist the configurations, returning the stored
/// list and mirroring them into `~/.dnss/settings.json`.
pub fn save_configs(configs: Vec<DnsConfig>) -> Result<Vec<DnsConfig>, String> {
    let normalized = normalize_server_configs(configs);
    for config in &normalized {
        if !is_valid_config(config) {
            return Err(format!("Invalid DNS configuration: {}", config.name));
        }
    }

    let dir = config_dir().ok_or_else(|| "Cannot resolve home directory".to_string())?;
    let data = serde_json::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize configs: {}", e))?;
    atomic_write_json(&dir, "configs.json", &data)?;

    // Mirror into settings.json so CLI and GUI stay completely in sync.
    let mut current = load_settings();
    current.servers = normalized.clone();
    if let Ok(settings_data) = serde_json::to_string_pretty(&current) {
        let _ = atomic_write_json(&dir, "settings.json", &settings_data);
    }

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_settings_assigns_unique_ids_and_validates_fields() {
        let raw = serde_json::json!({
            "dnss.schemaVersion": 1,
            "appearance.theme": "dark",
            "appearance.accent": "#3B82F6",
            "appearance.fontFamily": "inter",
            "appearance.fontSize": 16,
            "general.language": "fa",
            "benchmark.target": "https://example.com",
            "presets.hidden": ["google", "google"],
            "dns.servers": [
                { "name": "Office DNS", "primary": "10.0.0.1", "alternative": "10.0.0.2" },
                { "name": "Office DNS", "primary": "10.0.0.3" }
            ]
        });
        let parsed = normalize_settings_value(raw.as_object().unwrap(), true).unwrap();
        assert_eq!(parsed.theme, "dark");
        assert_eq!(parsed.accent, "#3b82f6");
        assert_eq!(parsed.font_size, 16);
        assert_eq!(parsed.language, "fa");
        assert_eq!(parsed.hidden_presets, vec!["google"]);
        assert_eq!(parsed.servers.len(), 2);
        assert_eq!(parsed.servers[0].id.as_deref(), Some("office-dns"));
        assert_eq!(parsed.servers[1].id.as_deref(), Some("office-dns-2"));
    }

    #[test]
    fn strict_import_rejects_invalid_ipv4_server() {
        let raw = serde_json::json!({
            "dns.servers": [{ "name": "Broken", "primary": "999.0.0.1" }]
        });
        assert!(normalize_settings_value(raw.as_object().unwrap(), true).is_err());
    }
}
