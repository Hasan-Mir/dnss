//! Persistent storage for user-saved DNS configurations.
//!
//! Storage layout (shared with the CLI's `@seymi/dnss-core` config store):
//!   ~/.dnss/configs.json
//!
//! Sharing one file keeps custom servers in sync between the CLI and the
//! desktop app; webview localStorage is never used for persistence.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsConfig {
    pub name: String,
    pub primary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alternative: Option<String>,
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
    let name_ok = !config.name.trim().is_empty()
        && config.name.chars().count() <= MAX_NAME_LEN;
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

/// Read the saved configurations, silently skipping malformed entries
/// (mirrors the CLI's behavior).
pub fn load_configs() -> Vec<DnsConfig> {
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

/// Validate, normalize and persist the configurations, returning the stored
/// list.
pub fn save_configs(configs: Vec<DnsConfig>) -> Result<Vec<DnsConfig>, String> {
    // Persist trimmed values: validation accepts surrounding whitespace,
    // but the stored form must equal what later gets handed to OS commands.
    let normalized: Vec<DnsConfig> = configs
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
            config
        })
        .collect();
    for config in &normalized {
        if !is_valid_config(config) {
            return Err(format!("Invalid DNS configuration: {}", config.name));
        }
    }

    let dir = config_dir().ok_or_else(|| "Cannot resolve home directory".to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let path = dir.join("configs.json");
    let data = serde_json::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize configs: {}", e))?;

    // Atomic replace: write a sibling temp file first, then rename it over
    // the target, so a crash mid-write can never leave a truncated
    // configs.json behind (which would parse as "no configs at all").
    // Keep a backup of the previous known-good state (parity with the CLI's
    // config store): a bad write must never destroy the last good config.
    let bak_path = dir.join("configs.json.bak");
    if path.exists() {
        safe_backup_copy(&path, &bak_path);
    }

    // Unpredictable temp name plus exclusive creation (create_new): a
    // pre-planted file or symlink at the guessable pid-only temp path made
    // fs::write follow it. Now such a plant makes the save fail instead.
    // Mode 0600 keeps the file private on POSIX systems.
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp_path = dir.join(format!(
        "configs.json.{}.{}.tmp",
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
        .map_err(|e| format!("Failed to write configs: {}", e))?;
    file.write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write configs: {}", e))?;
    // Flush to stable storage before the rename so a crash right after it
    // can never leave a truncated configs.json behind.
    file.sync_all()
        .map_err(|e| format!("Failed to write configs: {}", e))?;
    drop(file);

    // rename() replaces an existing destination atomically on both Unix and
    // Windows, so the target must NOT be removed first — that would open a
    // loss window where configs.json does not exist.
    if let Err(error) = fs::rename(&tmp_path, &path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to write configs: {}", error));
    }
    Ok(normalized)
}
