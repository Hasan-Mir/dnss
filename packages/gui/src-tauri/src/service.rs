#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

//! Windows background service (`DnssService`) and local Named Pipe IPC.
//!
//! Architecture:
//! - Installed once with administrator privileges during setup (`--install-service`),
//!   running as `NT AUTHORITY\SYSTEM` with `SERVICE_AUTO_START`.
//! - Exposes a single local Named Pipe (`\\.\pipe\dnss-service`) restricted via
//!   SDDL DACL to `SYSTEM`, `Administrators`, and locally logged-in `INTERACTIVE`
//!   users, with `PIPE_REJECT_REMOTE_CLIENTS` and `FILE_FLAG_FIRST_PIPE_INSTANCE`.
//! - Accepts only tightly typed, newline-delimited JSON requests (`Ping`,
//!   `SetDnsMany`, `ResetAllDns`, `FlushDns`), re-validating every IPv4 address
//!   and adapter name on the service side before executing OS commands.
//! - The GUI and CLI run unprivileged (`asInvoker`) and forward DNS mutations
//!   over this pipe without triggering UAC prompts on launch or DNS changes.

use serde::{Deserialize, Serialize};

use crate::{net, SetDnsOutcome};

/// Internal Windows Service Control Manager (SCM) name.
pub const SERVICE_NAME: &str = "DnssService";
/// Human-readable name shown in `services.msc`.
pub const SERVICE_DISPLAY_NAME: &str = "DNSS DNS Switcher Service";
/// Service description shown in `services.msc`.
pub const SERVICE_DESCRIPTION: &str =
    "Applies DNS server changes for DNSS (DNS Switcher) without requiring repeated UAC prompts.";
/// Local Named Pipe path shared by the service, desktop GUI, and CLI.
pub const PIPE_NAME: &str = r"\\.\pipe\dnss-service";

/// Hard ceiling on a single IPC request/response frame (64 KiB) to prevent
/// memory exhaustion from a misbehaving or malicious local client.
pub const MAX_IPC_MESSAGE_BYTES: usize = 64 * 1024;
/// Maximum DNS servers accepted per request (mirrors GUI/CLI caps).
pub const MAX_SERVERS: usize = 4;
/// Maximum adapter names accepted in a single explicit list.
pub const MAX_ADAPTERS: usize = 64;
/// Maximum byte length of a single adapter name.
pub const MAX_ADAPTER_NAME_LEN: usize = 256;

/// Tagged IPC request sent by unprivileged GUI/CLI clients to `DnssService`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ServiceRequest {
    /// Lightweight liveness probe used by clients before deciding whether to
    /// fall back to direct elevation.
    Ping,
    /// Apply `servers` to `adapters` (`None` = all adapters; empty `servers` = DHCP).
    SetDnsMany {
        #[serde(default)]
        adapters: Option<Vec<String>>,
        servers: Vec<String>,
    },
    /// Reset all network adapters to automatic (DHCP) DNS.
    ResetAllDns,
    /// Flush the Windows DNS resolver cache (`ipconfig /flushdns`).
    FlushDns,
}

/// JSON response returned by `DnssService` for every IPC request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcomes: Option<Vec<SetDnsOutcome>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

impl ServiceResponse {
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            outcomes: None,
            error: Some(msg.into()),
            version: None,
        }
    }
}

/// Validate and canonicalize DNS server IPv4 addresses on the privileged side.
/// Returns canonical dotted-quad strings so raw client input never reaches OS commands.
pub fn validate_and_normalize_servers(servers: &[String]) -> Result<Vec<String>, String> {
    if servers.len() > MAX_SERVERS {
        return Err(format!(
            "Too many DNS servers (max {}, got {})",
            MAX_SERVERS,
            servers.len()
        ));
    }
    let mut normalized = Vec::with_capacity(servers.len());
    for server in servers {
        if server.len() > 45 {
            return Err("DNS server address too long".to_string());
        }
        let ip = net::parse_ipv4(server)
            .ok_or_else(|| format!("Invalid IPv4 address: {}", server))?;
        normalized.push(ip.to_string());
    }
    Ok(normalized)
}

/// Validate and normalize an optional list of adapter names.
pub fn validate_and_normalize_adapters(
    adapters: Option<&[String]>,
) -> Result<Option<Vec<String>>, String> {
    let Some(list) = adapters else {
        return Ok(None);
    };
    if list.is_empty() {
        return Err("Adapter list cannot be empty".to_string());
    }
    if list.len() > MAX_ADAPTERS {
        return Err(format!(
            "Too many adapters in one request (max {}, got {})",
            MAX_ADAPTERS,
            list.len()
        ));
    }
    let mut normalized = Vec::with_capacity(list.len());
    for raw in list {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err("Adapter name cannot be empty".to_string());
        }
        if trimmed.len() > MAX_ADAPTER_NAME_LEN {
            return Err("Adapter name too long".to_string());
        }
        if trimmed.chars().any(|c| c.is_control()) {
            return Err("Adapter name contains control characters".to_string());
        }
        normalized.push(trimmed.to_string());
    }
    Ok(Some(normalized))
}

/// Parse a single newline-delimited JSON request frame with strict size checks.
pub fn parse_request_frame(frame: &[u8]) -> Result<ServiceRequest, String> {
    if frame.is_empty() {
        return Err("Empty service request".to_string());
    }
    if frame.len() > MAX_IPC_MESSAGE_BYTES {
        return Err(format!(
            "Service request exceeds {} byte limit",
            MAX_IPC_MESSAGE_BYTES
        ));
    }
    let text = std::str::from_utf8(frame)
        .map_err(|_| "Service request must be valid UTF-8".to_string())?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Empty service request".to_string());
    }
    serde_json::from_str::<ServiceRequest>(trimmed)
        .map_err(|e| format!("Invalid service request JSON: {}", e))
}

/// Build a properly quoted Windows service `lpBinaryPathName` to prevent
/// Unquoted Service Path (CWE-428) vulnerabilities.
pub fn quote_service_bin_path(exe_path: &str) -> Result<String, String> {
    let trimmed = exe_path.trim();
    if trimmed.is_empty() {
        return Err("Executable path cannot be empty".to_string());
    }
    if trimmed.contains('\0') || trimmed.contains('"') || trimmed.contains('\r') || trimmed.contains('\n') {
        return Err("Executable path contains forbidden characters".to_string());
    }
    Ok(format!("\"{}\" --service", trimmed))
}

/// Distinction between "service is not installed/running" (eligible for direct
/// elevated fallback) and "service returned a real operational error".
#[cfg(target_os = "windows")]
#[derive(Debug)]
pub enum ServiceClientError {
    Unavailable,
    Failed(String),
}

// ===== Windows SCM & Named Pipe Implementation (zero external crate deps) =====

#[cfg(target_os = "windows")]
#[allow(non_camel_case_types)]
mod win {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicPtr, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    use crate::platform;

    type HANDLE = *mut c_void;
    type SC_HANDLE = *mut c_void;
    type SERVICE_STATUS_HANDLE = *mut c_void;
    type BOOL = i32;
    type DWORD = u32;

    const FALSE: BOOL = 0;
    const TRUE: BOOL = 1;
    const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;

    // SCM & Service constants
    const SC_MANAGER_ALL_ACCESS: DWORD = 0x000F_003F;
    const SERVICE_ALL_ACCESS: DWORD = 0x000F_01FF;
    const SERVICE_WIN32_OWN_PROCESS: DWORD = 0x0000_0010;
    const SERVICE_AUTO_START: DWORD = 0x0000_0002;
    const SERVICE_ERROR_NORMAL: DWORD = 0x0000_0001;

    const SERVICE_STOPPED: DWORD = 0x0000_0001;
    const SERVICE_START_PENDING: DWORD = 0x0000_0002;
    const SERVICE_STOP_PENDING: DWORD = 0x0000_0003;
    const SERVICE_RUNNING: DWORD = 0x0000_0004;

    const SERVICE_ACCEPT_STOP: DWORD = 0x0000_0001;
    const SERVICE_ACCEPT_SHUTDOWN: DWORD = 0x0000_0004;

    const SERVICE_CONTROL_STOP: DWORD = 0x0000_0001;
    const SERVICE_CONTROL_INTERROGATE: DWORD = 0x0000_0004;
    const SERVICE_CONTROL_SHUTDOWN: DWORD = 0x0000_0005;

    const SERVICE_CONFIG_DESCRIPTION: DWORD = 1;
    const SERVICE_CONFIG_FAILURE_ACTIONS: DWORD = 2;
    const SERVICE_CONFIG_FAILURE_ACTIONS_FLAG: DWORD = 4;
    const SC_ACTION_RESTART: DWORD = 1;

    const SE_KERNEL_OBJECT: DWORD = 6;
    const OWNER_SECURITY_INFORMATION: DWORD = 0x0000_0001;
    const WIN_LOCAL_SYSTEM_SID: DWORD = 22;
    const WIN_BUILTIN_ADMINISTRATORS_SID: DWORD = 26;

    // Named Pipe & File constants
    const PIPE_ACCESS_DUPLEX: DWORD = 0x0000_0003;
    const FILE_FLAG_OVERLAPPED: DWORD = 0x4000_0000;
    const FILE_FLAG_FIRST_PIPE_INSTANCE: DWORD = 0x0008_0000;
    const PIPE_TYPE_BYTE: DWORD = 0x0000_0000;
    const PIPE_READMODE_BYTE: DWORD = 0x0000_0000;
    const PIPE_WAIT: DWORD = 0x0000_0000;
    const PIPE_REJECT_REMOTE_CLIENTS: DWORD = 0x0000_0008;

    const GENERIC_READ: DWORD = 0x8000_0000;
    const GENERIC_WRITE: DWORD = 0x4000_0000;
    const OPEN_EXISTING: DWORD = 3;
    const SECURITY_SQOS_PRESENT: DWORD = 0x0010_0000;
    const SECURITY_ANONYMOUS: DWORD = 0x0000_0000;

    const SDDL_REVISION_1: DWORD = 1;

    // Wait constants
    const WAIT_OBJECT_0: DWORD = 0x0000_0000;
    const INFINITE: DWORD = 0xFFFF_FFFF;

    // Win32 Error codes
    const NO_ERROR: DWORD = 0;
    const ERROR_FILE_NOT_FOUND: DWORD = 2;
    const ERROR_BROKEN_PIPE: DWORD = 109;
    const ERROR_CALL_NOT_IMPLEMENTED: DWORD = 120;
    const ERROR_PIPE_BUSY: DWORD = 231;
    const ERROR_PIPE_CONNECTED: DWORD = 535;
    const ERROR_IO_PENDING: DWORD = 997;
    const ERROR_SERVICE_ALREADY_RUNNING: DWORD = 1056;
    const ERROR_SERVICE_DOES_NOT_EXIST: DWORD = 1060;
    const ERROR_SERVICE_NOT_ACTIVE: DWORD = 1062;
    const ERROR_SERVICE_EXISTS: DWORD = 1073;

    // SDDL for the Named Pipe:
    // - SY (LocalSystem): Generic All
    // - BA (Built-in Administrators): Generic All
    // - IU (Interactive locally logged-in users, including RDP): Generic Read/Write
    // Network/Anonymous/Guest/unprivileged background services are denied by default.
    const PIPE_SDDL: &str = "O:SYD:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)";

    // Per-connection I/O timeout so a stalled client cannot block the service.
    const IO_TIMEOUT_MS: DWORD = 5_000;
    const CLIENT_WAIT_PIPE_MS: DWORD = 10_000;

    #[repr(C)]
    struct SERVICE_TABLE_ENTRYW {
        lp_service_name: *const u16,
        lp_service_proc: Option<unsafe extern "system" fn(DWORD, *mut *mut u16)>,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct SERVICE_STATUS {
        dw_service_type: DWORD,
        dw_current_state: DWORD,
        dw_controls_accepted: DWORD,
        dw_win32_exit_code: DWORD,
        dw_service_specific_exit_code: DWORD,
        dw_check_point: DWORD,
        dw_wait_hint: DWORD,
    }

    #[repr(C)]
    struct SERVICE_DESCRIPTIONW {
        lp_description: *mut u16,
    }

    #[repr(C)]
    struct SC_ACTION {
        r#type: DWORD,
        delay: DWORD,
    }

    #[repr(C)]
    struct SERVICE_FAILURE_ACTIONSW {
        dw_reset_period: DWORD,
        lp_reboot_msg: *mut u16,
        lp_command: *mut u16,
        c_actions: DWORD,
        lpsa_actions: *mut SC_ACTION,
    }

    #[repr(C)]
    struct SERVICE_FAILURE_ACTIONS_FLAG {
        f_failure_actions_on_non_crash_failures: BOOL,
    }

    #[repr(C)]
    struct SECURITY_ATTRIBUTES {
        n_length: DWORD,
        lp_security_descriptor: *mut c_void,
        b_inherit_handle: BOOL,
    }

    #[repr(C)]
    struct OVERLAPPED {
        internal: usize,
        internal_high: usize,
        offset: DWORD,
        offset_high: DWORD,
        h_event: HANDLE,
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn StartServiceCtrlDispatcherW(lp_service_start_table: *const SERVICE_TABLE_ENTRYW)
            -> BOOL;
        fn RegisterServiceCtrlHandlerExW(
            lp_service_name: *const u16,
            lp_handler_proc: unsafe extern "system" fn(
                DWORD,
                DWORD,
                *mut c_void,
                *mut c_void,
            ) -> DWORD,
            lp_context: *mut c_void,
        ) -> SERVICE_STATUS_HANDLE;
        fn SetServiceStatus(
            h_service_status: SERVICE_STATUS_HANDLE,
            lp_service_status: *const SERVICE_STATUS,
        ) -> BOOL;
        fn OpenSCManagerW(
            lp_machine_name: *const u16,
            lp_database_name: *const u16,
            dw_desired_access: DWORD,
        ) -> SC_HANDLE;
        fn OpenServiceW(
            h_sc_manager: SC_HANDLE,
            lp_service_name: *const u16,
            dw_desired_access: DWORD,
        ) -> SC_HANDLE;
        fn CreateServiceW(
            h_sc_manager: SC_HANDLE,
            lp_service_name: *const u16,
            lp_display_name: *const u16,
            dw_desired_access: DWORD,
            dw_service_type: DWORD,
            dw_start_type: DWORD,
            dw_error_control: DWORD,
            lp_binary_path_name: *const u16,
            lp_load_order_group: *const u16,
            lpdw_tag_id: *mut DWORD,
            lp_dependencies: *const u16,
            lp_service_start_name: *const u16,
            lp_password: *const u16,
        ) -> SC_HANDLE;
        fn ChangeServiceConfigW(
            h_service: SC_HANDLE,
            dw_service_type: DWORD,
            dw_start_type: DWORD,
            dw_error_control: DWORD,
            lp_binary_path_name: *const u16,
            lp_load_order_group: *const u16,
            lpdw_tag_id: *mut DWORD,
            lp_dependencies: *const u16,
            lp_service_start_name: *const u16,
            lp_password: *const u16,
            lp_display_name: *const u16,
        ) -> BOOL;
        fn ChangeServiceConfig2W(
            h_service: SC_HANDLE,
            dw_info_level: DWORD,
            lp_info: *const c_void,
        ) -> BOOL;
        fn StartServiceW(
            h_service: SC_HANDLE,
            dw_num_service_args: DWORD,
            lp_service_arg_vectors: *const *const u16,
        ) -> BOOL;
        fn ControlService(
            h_service: SC_HANDLE,
            dw_control: DWORD,
            lp_service_status: *mut SERVICE_STATUS,
        ) -> BOOL;
        fn QueryServiceStatus(
            h_service: SC_HANDLE,
            lp_service_status: *mut SERVICE_STATUS,
        ) -> BOOL;
        fn DeleteService(h_service: SC_HANDLE) -> BOOL;
        fn CloseServiceHandle(h_sc_object: SC_HANDLE) -> BOOL;
        fn ConvertStringSecurityDescriptorToSecurityDescriptorW(
            string_security_descriptor: *const u16,
            string_sd_revision: DWORD,
            security_descriptor: *mut *mut c_void,
            security_descriptor_size: *mut DWORD,
        ) -> BOOL;
        fn GetSecurityInfo(
            handle: HANDLE,
            object_type: DWORD,
            security_info: DWORD,
            ppsid_owner: *mut *mut c_void,
            ppsid_group: *mut *mut c_void,
            pp_dacl: *mut *mut c_void,
            pp_sacl: *mut *mut c_void,
            pp_security_descriptor: *mut *mut c_void,
        ) -> DWORD;
        fn IsWellKnownSid(p_sid: *mut c_void, well_known_sid_type: DWORD) -> BOOL;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetLastError() -> DWORD;
        fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
        fn CloseHandle(h_object: HANDLE) -> BOOL;
        fn CreateEventW(
            lp_event_attributes: *const SECURITY_ATTRIBUTES,
            b_manual_reset: BOOL,
            b_initial_state: BOOL,
            lp_name: *const u16,
        ) -> HANDLE;
        fn SetEvent(h_event: HANDLE) -> BOOL;
        fn ResetEvent(h_event: HANDLE) -> BOOL;
        fn WaitForMultipleObjects(
            n_count: DWORD,
            lp_handles: *const HANDLE,
            b_wait_all: BOOL,
            dw_milliseconds: DWORD,
        ) -> DWORD;
        fn CreateNamedPipeW(
            lp_name: *const u16,
            dw_open_mode: DWORD,
            dw_pipe_mode: DWORD,
            n_max_instances: DWORD,
            n_out_buffer_size: DWORD,
            n_in_buffer_size: DWORD,
            n_default_time_out: DWORD,
            lp_security_attributes: *const SECURITY_ATTRIBUTES,
        ) -> HANDLE;
        fn ConnectNamedPipe(h_named_pipe: HANDLE, lp_overlapped: *mut OVERLAPPED) -> BOOL;
        fn DisconnectNamedPipe(h_named_pipe: HANDLE) -> BOOL;
        fn WaitNamedPipeW(lp_named_pipe_name: *const u16, n_time_out: DWORD) -> BOOL;
        fn CreateFileW(
            lp_file_name: *const u16,
            dw_desired_access: DWORD,
            dw_share_mode: DWORD,
            lp_security_attributes: *const SECURITY_ATTRIBUTES,
            dw_creation_disposition: DWORD,
            dw_flags_and_attributes: DWORD,
            h_template_file: HANDLE,
        ) -> HANDLE;
        fn ReadFile(
            h_file: HANDLE,
            lp_buffer: *mut u8,
            n_number_of_bytes_to_read: DWORD,
            lp_number_of_bytes_read: *mut DWORD,
            lp_overlapped: *mut OVERLAPPED,
        ) -> BOOL;
        fn WriteFile(
            h_file: HANDLE,
            lp_buffer: *const u8,
            n_number_of_bytes_to_write: DWORD,
            lp_number_of_bytes_written: *mut DWORD,
            lp_overlapped: *mut OVERLAPPED,
        ) -> BOOL;
        fn GetOverlappedResult(
            h_file: HANDLE,
            lp_overlapped: *const OVERLAPPED,
            lp_number_of_bytes_transferred: *mut DWORD,
            b_wait: BOOL,
        ) -> BOOL;
        fn CancelIoEx(h_file: HANDLE, lp_overlapped: *const OVERLAPPED) -> BOOL;
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Global handles shared between `service_main` and the SCM control handler.
    static STATUS_HANDLE: AtomicPtr<c_void> = AtomicPtr::new(null_mut());
    static STOP_EVENT: AtomicPtr<c_void> = AtomicPtr::new(null_mut());
    static MUTATION_LOCK: Mutex<()> = Mutex::new(());

    fn set_service_state(
        status_handle: SERVICE_STATUS_HANDLE,
        state: DWORD,
        controls_accepted: DWORD,
        exit_code: DWORD,
        wait_hint: DWORD,
    ) {
        if status_handle.is_null() {
            return;
        }
        let status = SERVICE_STATUS {
            dw_service_type: SERVICE_WIN32_OWN_PROCESS,
            dw_current_state: state,
            dw_controls_accepted: controls_accepted,
            dw_win32_exit_code: exit_code,
            dw_service_specific_exit_code: 0,
            dw_check_point: 0,
            dw_wait_hint: wait_hint,
        };
        unsafe {
            SetServiceStatus(status_handle, &status);
        }
    }

    unsafe extern "system" fn service_ctrl_handler(
        dw_control: DWORD,
        _dw_event_type: DWORD,
        _lp_event_data: *mut c_void,
        _lp_context: *mut c_void,
    ) -> DWORD {
        match dw_control {
            SERVICE_CONTROL_STOP | SERVICE_CONTROL_SHUTDOWN => {
                let status_handle = STATUS_HANDLE.load(Ordering::Acquire);
                set_service_state(status_handle, SERVICE_STOP_PENDING, 0, NO_ERROR, 5_000);
                let ev = STOP_EVENT.load(Ordering::Acquire);
                if !ev.is_null() {
                    SetEvent(ev);
                }
                NO_ERROR
            }
            SERVICE_CONTROL_INTERROGATE => NO_ERROR,
            _ => ERROR_CALL_NOT_IMPLEMENTED,
        }
    }

    /// Execute one validated IPC request inside the `LocalSystem` service.
    fn dispatch_request(req: ServiceRequest) -> ServiceResponse {
        match req {
            ServiceRequest::Ping => ServiceResponse {
                ok: true,
                outcomes: None,
                error: None,
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            },
            ServiceRequest::SetDnsMany { adapters, servers } => {
                let normalized_servers = match validate_and_normalize_servers(&servers) {
                    Ok(s) => s,
                    Err(e) => return ServiceResponse::err(e),
                };
                let normalized_adapters =
                    match validate_and_normalize_adapters(adapters.as_deref()) {
                        Ok(a) => a,
                        Err(e) => return ServiceResponse::err(e),
                    };
                let _guard = match MUTATION_LOCK.lock() {
                    Ok(g) => g,
                    Err(_) => return ServiceResponse::err("Service network lock poisoned"),
                };
                match platform::set_dns_many_direct(
                    normalized_adapters.as_deref(),
                    &normalized_servers,
                ) {
                    Ok(outcomes) => ServiceResponse {
                        ok: true,
                        outcomes: Some(outcomes),
                        error: None,
                        version: None,
                    },
                    Err(e) => ServiceResponse::err(e),
                }
            }
            ServiceRequest::ResetAllDns => {
                let _guard = match MUTATION_LOCK.lock() {
                    Ok(g) => g,
                    Err(_) => return ServiceResponse::err("Service network lock poisoned"),
                };
                match platform::set_dns_many_direct(None, &[]) {
                    Ok(outcomes) => ServiceResponse {
                        ok: true,
                        outcomes: Some(outcomes),
                        error: None,
                        version: None,
                    },
                    Err(e) => ServiceResponse::err(e),
                }
            }
            ServiceRequest::FlushDns => {
                let _guard = match MUTATION_LOCK.lock() {
                    Ok(g) => g,
                    Err(_) => return ServiceResponse::err("Service network lock poisoned"),
                };
                match platform::flush_dns_direct() {
                    Ok(()) => ServiceResponse {
                        ok: true,
                        outcomes: None,
                        error: None,
                        version: None,
                    },
                    Err(e) => ServiceResponse::err(e),
                }
            }
        }
    }

    /// Overlapped read of one newline-delimited request with timeout and stop-event support.
    unsafe fn read_request_overlapped(
        pipe: HANDLE,
        io_event: HANDLE,
        stop_event: HANDLE,
    ) -> Result<Vec<u8>, ()> {
        let mut acc = Vec::with_capacity(512);
        let mut chunk = [0u8; 4096];
        let deadline = Instant::now() + Duration::from_millis(IO_TIMEOUT_MS as u64);

        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(());
            }
            ResetEvent(io_event);
            let mut ov = OVERLAPPED {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: io_event,
            };
            let mut bytes_read: DWORD = 0;
            let ok = ReadFile(
                pipe,
                chunk.as_mut_ptr(),
                chunk.len() as DWORD,
                &mut bytes_read,
                &mut ov,
            );
            if ok == FALSE {
                let err = GetLastError();
                if err == ERROR_IO_PENDING {
                    let handles = [stop_event, io_event];
                    let wait = WaitForMultipleObjects(
                        2,
                        handles.as_ptr(),
                        FALSE,
                        remaining.as_millis().min(IO_TIMEOUT_MS as u128).max(1) as DWORD,
                    );
                    if wait != WAIT_OBJECT_0 + 1 {
                        CancelIoEx(pipe, &ov);
                        // Wait for the kernel to finish the cancelled IRP before
                        // stack-allocated `ov` and `chunk` go out of scope.
                        let mut dummy: DWORD = 0;
                        GetOverlappedResult(pipe, &ov, &mut dummy, TRUE);
                        return Err(());
                    }
                    if GetOverlappedResult(pipe, &ov, &mut bytes_read, FALSE) == FALSE {
                        return Err(());
                    }
                } else if err == ERROR_BROKEN_PIPE {
                    break;
                } else {
                    return Err(());
                }
            }

            if bytes_read == 0 {
                break;
            }
            let slice = &chunk[..bytes_read as usize];
            if let Some(pos) = slice.iter().position(|&b| b == b'\n') {
                if acc.len() + pos > MAX_IPC_MESSAGE_BYTES {
                    return Err(());
                }
                acc.extend_from_slice(&slice[..pos]);
                return Ok(acc);
            }
            if acc.len() + slice.len() > MAX_IPC_MESSAGE_BYTES {
                return Err(());
            }
            acc.extend_from_slice(slice);
        }

        if acc.is_empty() {
            Err(())
        } else {
            Ok(acc)
        }
    }

    /// Overlapped write of the complete JSON response line with timeout and stop-event support.
    unsafe fn write_all_overlapped(
        pipe: HANDLE,
        io_event: HANDLE,
        stop_event: HANDLE,
        data: &[u8],
    ) {
        let mut offset = 0usize;
        let deadline = Instant::now() + Duration::from_millis(IO_TIMEOUT_MS as u64);

        while offset < data.len() {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return;
            }
            ResetEvent(io_event);
            let mut ov = OVERLAPPED {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: io_event,
            };
            let mut written: DWORD = 0;
            let ok = WriteFile(
                pipe,
                data[offset..].as_ptr(),
                (data.len() - offset) as DWORD,
                &mut written,
                &mut ov,
            );
            if ok == FALSE {
                let err = GetLastError();
                if err == ERROR_IO_PENDING {
                    let handles = [stop_event, io_event];
                    let wait = WaitForMultipleObjects(
                        2,
                        handles.as_ptr(),
                        FALSE,
                        remaining.as_millis().min(IO_TIMEOUT_MS as u128).max(1) as DWORD,
                    );
                    if wait != WAIT_OBJECT_0 + 1 {
                        CancelIoEx(pipe, &ov);
                        // Wait for the kernel to finish the cancelled IRP before
                        // stack-allocated `ov` goes out of scope.
                        let mut dummy: DWORD = 0;
                        GetOverlappedResult(pipe, &ov, &mut dummy, TRUE);
                        return;
                    }
                    if GetOverlappedResult(pipe, &ov, &mut written, FALSE) == FALSE {
                        return;
                    }
                } else {
                    return;
                }
            }
            if written == 0 {
                return;
            }
            offset += written as usize;
        }
        // Do NOT call synchronous FlushFileBuffers(pipe): it blocks indefinitely
        // until the client reads all buffered bytes and ignores timeouts and
        // stop_event (allowing a single stalled client to DoS DnssService and
        // hang SCM stops/upgrades). Instead, wait up to 2s (interruptible by
        // stop_event) for the client to finish reading and close its handle.
        let remaining = deadline
            .saturating_duration_since(Instant::now())
            .min(Duration::from_millis(2_000));
        if !remaining.is_zero() {
            ResetEvent(io_event);
            let mut drain_buf = [0u8; 1];
            let mut drain_read: DWORD = 0;
            let mut ov = OVERLAPPED {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: io_event,
            };
            let ok = ReadFile(
                pipe,
                drain_buf.as_mut_ptr(),
                1,
                &mut drain_read,
                &mut ov,
            );
            if ok == FALSE && GetLastError() == ERROR_IO_PENDING {
                let handles = [stop_event, io_event];
                let wait = WaitForMultipleObjects(
                    2,
                    handles.as_ptr(),
                    FALSE,
                    remaining.as_millis().max(1) as DWORD,
                );
                if wait != WAIT_OBJECT_0 + 1 {
                    CancelIoEx(pipe, &ov);
                    let mut dummy: DWORD = 0;
                    GetOverlappedResult(pipe, &ov, &mut dummy, TRUE);
                } else {
                    let mut dummy: DWORD = 0;
                    GetOverlappedResult(pipe, &ov, &mut dummy, FALSE);
                }
            }
        }
    }

    unsafe extern "system" fn service_main(_argc: DWORD, _argv: *mut *mut u16) {
        let svc_name_w = to_wide(SERVICE_NAME);
        let status_handle =
            RegisterServiceCtrlHandlerExW(svc_name_w.as_ptr(), service_ctrl_handler, null_mut());
        if status_handle.is_null() {
            return;
        }
        STATUS_HANDLE.store(status_handle, Ordering::Release);
        set_service_state(status_handle, SERVICE_START_PENDING, 0, NO_ERROR, 5_000);

        let stop_event = CreateEventW(null(), TRUE, FALSE, null());
        let io_event = CreateEventW(null(), TRUE, FALSE, null());
        if stop_event.is_null() || io_event.is_null() {
            if !stop_event.is_null() {
                CloseHandle(stop_event);
            }
            if !io_event.is_null() {
                CloseHandle(io_event);
            }
            set_service_state(status_handle, SERVICE_STOPPED, 0, GetLastError(), 0);
            return;
        }
        STOP_EVENT.store(stop_event, Ordering::Release);

        // Build restrictive DACL from SDDL string.
        let sddl_w = to_wide(PIPE_SDDL);
        let mut sd_ptr: *mut c_void = null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl_w.as_ptr(),
            SDDL_REVISION_1,
            &mut sd_ptr,
            null_mut(),
        ) == FALSE
            || sd_ptr.is_null()
        {
            let err = GetLastError();
            CloseHandle(io_event);
            CloseHandle(stop_event);
            STOP_EVENT.store(null_mut(), Ordering::Release);
            set_service_state(status_handle, SERVICE_STOPPED, 0, err, 0);
            return;
        }

        let sa = SECURITY_ATTRIBUTES {
            n_length: std::mem::size_of::<SECURITY_ATTRIBUTES>() as DWORD,
            lp_security_descriptor: sd_ptr,
            b_inherit_handle: FALSE,
        };

        // Keep a single pipe instance alive for the entire service lifetime with
        // FILE_FLAG_FIRST_PIPE_INSTANCE so an unprivileged user can never squat
        // the pipe name before startup or between requests.
        let pipe_w = to_wide(PIPE_NAME);
        let pipe = CreateNamedPipeW(
            pipe_w.as_ptr(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            MAX_IPC_MESSAGE_BYTES as DWORD,
            MAX_IPC_MESSAGE_BYTES as DWORD,
            IO_TIMEOUT_MS,
            &sa,
        );
        LocalFree(sd_ptr);

        if pipe == INVALID_HANDLE_VALUE {
            let err = GetLastError();
            CloseHandle(io_event);
            CloseHandle(stop_event);
            STOP_EVENT.store(null_mut(), Ordering::Release);
            set_service_state(status_handle, SERVICE_STOPPED, 0, err, 0);
            return;
        }

        set_service_state(
            status_handle,
            SERVICE_RUNNING,
            SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN,
            NO_ERROR,
            0,
        );

        loop {
            ResetEvent(io_event);
            let mut ov = OVERLAPPED {
                internal: 0,
                internal_high: 0,
                offset: 0,
                offset_high: 0,
                h_event: io_event,
            };

            let connected = ConnectNamedPipe(pipe, &mut ov);
            if connected == FALSE {
                let err = GetLastError();
                if err == ERROR_IO_PENDING {
                    let handles = [stop_event, io_event];
                    let wait = WaitForMultipleObjects(2, handles.as_ptr(), FALSE, INFINITE);
                    if wait != WAIT_OBJECT_0 + 1 {
                        // Service stop/shutdown requested or wait failed.
                        CancelIoEx(pipe, &ov);
                        let mut dummy: DWORD = 0;
                        GetOverlappedResult(pipe, &ov, &mut dummy, TRUE);
                        break;
                    }
                    let mut dummy: DWORD = 0;
                    if GetOverlappedResult(pipe, &ov, &mut dummy, FALSE) == FALSE {
                        DisconnectNamedPipe(pipe);
                        continue;
                    }
                } else if err != ERROR_PIPE_CONNECTED {
                    // Brief pause before retrying on unexpected transient error.
                    let handles = [stop_event];
                    if WaitForMultipleObjects(1, handles.as_ptr(), FALSE, 200) == WAIT_OBJECT_0 {
                        break;
                    }
                    continue;
                }
            }

            if let Ok(frame) = read_request_overlapped(pipe, io_event, stop_event) {
                let response = match parse_request_frame(&frame) {
                    Ok(req) => dispatch_request(req),
                    Err(e) => ServiceResponse::err(e),
                };
                if let Ok(mut payload) = serde_json::to_vec(&response) {
                    payload.push(b'\n');
                    write_all_overlapped(pipe, io_event, stop_event, &payload);
                }
            }

            DisconnectNamedPipe(pipe);

            // Check if stop was signaled while handling the request.
            let handles = [stop_event];
            if WaitForMultipleObjects(1, handles.as_ptr(), FALSE, 0) == WAIT_OBJECT_0 {
                break;
            }
        }

        CloseHandle(pipe);
        CloseHandle(io_event);
        CloseHandle(stop_event);
        STOP_EVENT.store(null_mut(), Ordering::Release);
        STATUS_HANDLE.store(null_mut(), Ordering::Release);
        set_service_state(status_handle, SERVICE_STOPPED, 0, NO_ERROR, 0);
    }

    /// Entry point for `dnss.exe --service` invoked by Windows SCM.
    pub fn run_service() -> Result<(), String> {
        let svc_name_w = to_wide(SERVICE_NAME);
        let table = [
            SERVICE_TABLE_ENTRYW {
                lp_service_name: svc_name_w.as_ptr(),
                lp_service_proc: Some(service_main),
            },
            SERVICE_TABLE_ENTRYW {
                lp_service_name: null(),
                lp_service_proc: None,
            },
        ];
        let ok = unsafe { StartServiceCtrlDispatcherW(table.as_ptr()) };
        if ok == FALSE {
            let err = unsafe { GetLastError() };
            return Err(format!(
                "StartServiceCtrlDispatcherW failed (Win32 error {}). Run '{}' as a Windows service via SCM.",
                err, SERVICE_NAME
            ));
        }
        Ok(())
    }

    unsafe fn wait_for_service_state(
        svc: SC_HANDLE,
        desired_state: DWORD,
        timeout: Duration,
    ) -> bool {
        let deadline = Instant::now() + timeout;
        let mut status = SERVICE_STATUS {
            dw_service_type: 0,
            dw_current_state: 0,
            dw_controls_accepted: 0,
            dw_win32_exit_code: 0,
            dw_service_specific_exit_code: 0,
            dw_check_point: 0,
            dw_wait_hint: 0,
        };
        loop {
            if QueryServiceStatus(svc, &mut status) != FALSE
                && status.dw_current_state == desired_state
            {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(150));
        }
    }

    unsafe fn stop_service_if_running(svc: SC_HANDLE) {
        let mut status = SERVICE_STATUS {
            dw_service_type: 0,
            dw_current_state: 0,
            dw_controls_accepted: 0,
            dw_win32_exit_code: 0,
            dw_service_specific_exit_code: 0,
            dw_check_point: 0,
            dw_wait_hint: 0,
        };
        if ControlService(svc, SERVICE_CONTROL_STOP, &mut status) != FALSE {
            wait_for_service_state(svc, SERVICE_STOPPED, Duration::from_secs(10));
        } else {
            let err = GetLastError();
            if err != ERROR_SERVICE_NOT_ACTIVE {
                wait_for_service_state(svc, SERVICE_STOPPED, Duration::from_secs(5));
            }
        }
    }

    /// Install (or update) and start `DnssService`. Must be run elevated
    /// (called automatically by the per-machine installer with a single UAC prompt).
    pub fn install_service() -> Result<(), String> {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Cannot resolve current executable path: {}", e))?;
        let exe_str = exe
            .to_str()
            .ok_or_else(|| "Executable path is not valid UTF-8".to_string())?;
        let bin_path = quote_service_bin_path(exe_str)?;

        let svc_name_w = to_wide(SERVICE_NAME);
        let display_name_w = to_wide(SERVICE_DISPLAY_NAME);
        let bin_path_w = to_wide(&bin_path);
        let mut desc_w = to_wide(SERVICE_DESCRIPTION);

        unsafe {
            let scm = OpenSCManagerW(null(), null(), SC_MANAGER_ALL_ACCESS);
            if scm.is_null() {
                return Err(format!(
                    "OpenSCManagerW failed (Win32 error {}). Run as administrator.",
                    GetLastError()
                ));
            }

            let mut svc = CreateServiceW(
                scm,
                svc_name_w.as_ptr(),
                display_name_w.as_ptr(),
                SERVICE_ALL_ACCESS,
                SERVICE_WIN32_OWN_PROCESS,
                SERVICE_AUTO_START,
                SERVICE_ERROR_NORMAL,
                bin_path_w.as_ptr(),
                null(),
                null_mut(),
                null(),
                null(), // NT AUTHORITY\LocalSystem
                null(),
            );

            if svc.is_null() {
                let err = GetLastError();
                if err != ERROR_SERVICE_EXISTS {
                    CloseServiceHandle(scm);
                    return Err(format!("CreateServiceW failed (Win32 error {})", err));
                }
                svc = OpenServiceW(scm, svc_name_w.as_ptr(), SERVICE_ALL_ACCESS);
                if svc.is_null() {
                    let open_err = GetLastError();
                    CloseServiceHandle(scm);
                    return Err(format!("OpenServiceW failed (Win32 error {})", open_err));
                }
                stop_service_if_running(svc);
                if ChangeServiceConfigW(
                    svc,
                    SERVICE_WIN32_OWN_PROCESS,
                    SERVICE_AUTO_START,
                    SERVICE_ERROR_NORMAL,
                    bin_path_w.as_ptr(),
                    null(),
                    null_mut(),
                    null(),
                    null(),
                    null(),
                    display_name_w.as_ptr(),
                ) == FALSE
                {
                    let cfg_err = GetLastError();
                    CloseServiceHandle(svc);
                    CloseServiceHandle(scm);
                    return Err(format!(
                        "ChangeServiceConfigW failed (Win32 error {})",
                        cfg_err
                    ));
                }
            }

            // Best-effort description & automatic restart on unexpected crash.
            let desc = SERVICE_DESCRIPTIONW {
                lp_description: desc_w.as_mut_ptr(),
            };
            ChangeServiceConfig2W(
                svc,
                SERVICE_CONFIG_DESCRIPTION,
                &desc as *const SERVICE_DESCRIPTIONW as *const c_void,
            );

            let mut actions = [
                SC_ACTION {
                    r#type: SC_ACTION_RESTART,
                    delay: 5_000,
                },
                SC_ACTION {
                    r#type: SC_ACTION_RESTART,
                    delay: 5_000,
                },
                SC_ACTION {
                    r#type: SC_ACTION_RESTART,
                    delay: 15_000,
                },
            ];
            let failure_actions = SERVICE_FAILURE_ACTIONSW {
                dw_reset_period: 86_400,
                lp_reboot_msg: null_mut(),
                lp_command: null_mut(),
                c_actions: actions.len() as DWORD,
                lpsa_actions: actions.as_mut_ptr(),
            };
            ChangeServiceConfig2W(
                svc,
                SERVICE_CONFIG_FAILURE_ACTIONS,
                &failure_actions as *const SERVICE_FAILURE_ACTIONSW as *const c_void,
            );
            let failure_flag = SERVICE_FAILURE_ACTIONS_FLAG {
                f_failure_actions_on_non_crash_failures: TRUE,
            };
            ChangeServiceConfig2W(
                svc,
                SERVICE_CONFIG_FAILURE_ACTIONS_FLAG,
                &failure_flag as *const SERVICE_FAILURE_ACTIONS_FLAG as *const c_void,
            );

            if StartServiceW(svc, 0, null()) == FALSE {
                let start_err = GetLastError();
                if start_err != ERROR_SERVICE_ALREADY_RUNNING {
                    CloseServiceHandle(svc);
                    CloseServiceHandle(scm);
                    return Err(format!("StartServiceW failed (Win32 error {})", start_err));
                }
            }
            let running = wait_for_service_state(svc, SERVICE_RUNNING, Duration::from_secs(10));
            CloseServiceHandle(svc);
            CloseServiceHandle(scm);

            if !running {
                return Err(
                    "DnssService did not reach SERVICE_RUNNING within 10 seconds".to_string(),
                );
            }
            Ok(())
        }
    }

    /// Stop and delete `DnssService`. Must be run elevated (called automatically
    /// during uninstall). Succeeds cleanly if the service is already absent.
    pub fn uninstall_service() -> Result<(), String> {
        let svc_name_w = to_wide(SERVICE_NAME);
        unsafe {
            let scm = OpenSCManagerW(null(), null(), SC_MANAGER_ALL_ACCESS);
            if scm.is_null() {
                return Err(format!(
                    "OpenSCManagerW failed (Win32 error {}). Run as administrator.",
                    GetLastError()
                ));
            }
            let svc = OpenServiceW(scm, svc_name_w.as_ptr(), SERVICE_ALL_ACCESS);
            if svc.is_null() {
                let err = GetLastError();
                CloseServiceHandle(scm);
                if err == ERROR_SERVICE_DOES_NOT_EXIST {
                    return Ok(());
                }
                return Err(format!("OpenServiceW failed (Win32 error {})", err));
            }
            stop_service_if_running(svc);
            let deleted = DeleteService(svc);
            let del_err = GetLastError();
            CloseServiceHandle(svc);
            CloseServiceHandle(scm);

            if deleted == FALSE {
                return Err(format!("DeleteService failed (Win32 error {})", del_err));
            }
            Ok(())
        }
    }

    /// Verify the Named Pipe server is owned by `NT AUTHORITY\SYSTEM` (S-1-5-18)
    /// to prevent local pipe squatting when `DnssService` is stopped or absent.
    unsafe fn is_pipe_owned_by_system(pipe: HANDLE) -> bool {
        let mut owner_sid: *mut c_void = null_mut();
        let mut sd: *mut c_void = null_mut();
        let status = GetSecurityInfo(
            pipe,
            SE_KERNEL_OBJECT,
            OWNER_SECURITY_INFORMATION,
            &mut owner_sid,
            null_mut(),
            null_mut(),
            null_mut(),
            &mut sd,
        );
        if status != NO_ERROR || owner_sid.is_null() {
            if !sd.is_null() {
                LocalFree(sd);
            }
            return false;
        }
        // LocalSystem tokens default to BuiltinAdministrators as object owner
        // unless overridden by O:SY; accept either SYSTEM or Administrators
        // (neither can be stamped by an unprivileged local squatter).
        let is_system = IsWellKnownSid(owner_sid, WIN_LOCAL_SYSTEM_SID) != FALSE
            || IsWellKnownSid(owner_sid, WIN_BUILTIN_ADMINISTRATORS_SID) != FALSE;
        if !sd.is_null() {
            LocalFree(sd);
        }
        is_system
    }

    /// Send a single request to `DnssService` over the local Named Pipe.
    pub fn send_request(req: &ServiceRequest) -> Result<ServiceResponse, ServiceClientError> {
        let mut payload = serde_json::to_vec(req)
            .map_err(|e| ServiceClientError::Failed(format!("Serialize request failed: {}", e)))?;
        payload.push(b'\n');
        if payload.len() > MAX_IPC_MESSAGE_BYTES {
            return Err(ServiceClientError::Failed(
                "Service request exceeds size limit".to_string(),
            ));
        }

        let pipe_w = to_wide(PIPE_NAME);
        let pipe = unsafe {
            let mut handle = INVALID_HANDLE_VALUE;
            for _attempt in 0..3 {
                // SECURITY_ANONYMOUS prevents the server from impersonating the
                // calling client token (least-privilege defense-in-depth).
                handle = CreateFileW(
                    pipe_w.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    null(),
                    OPEN_EXISTING,
                    SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS,
                    null_mut(),
                );
                if handle != INVALID_HANDLE_VALUE {
                    break;
                }
                let err = GetLastError();
                if err == ERROR_FILE_NOT_FOUND {
                    return Err(ServiceClientError::Unavailable);
                }
                if err == ERROR_PIPE_BUSY {
                    if WaitNamedPipeW(pipe_w.as_ptr(), CLIENT_WAIT_PIPE_MS) == FALSE {
                        return Err(ServiceClientError::Failed(
                            "DNSS Windows service is busy; please retry.".to_string(),
                        ));
                    }
                    continue;
                }
                return Err(ServiceClientError::Failed(format!(
                    "Failed to connect to DNSS service (Win32 error {})",
                    err
                )));
            }
            if handle == INVALID_HANDLE_VALUE {
                return Err(ServiceClientError::Failed(
                    "Timed out waiting for DNSS Windows service".to_string(),
                ));
            }
            if !is_pipe_owned_by_system(handle) {
                CloseHandle(handle);
                return Err(ServiceClientError::Unavailable);
            }
            handle
        };

        let result = unsafe {
            let mut offset = 0usize;
            let mut write_ok = true;
            while offset < payload.len() {
                let mut written: DWORD = 0;
                if WriteFile(
                    pipe,
                    payload[offset..].as_ptr(),
                    (payload.len() - offset) as DWORD,
                    &mut written,
                    null_mut(),
                ) == FALSE
                    || written == 0
                {
                    write_ok = false;
                    break;
                }
                offset += written as usize;
            }
            if !write_ok {
                let err = GetLastError();
                CloseHandle(pipe);
                return Err(ServiceClientError::Failed(format!(
                    "Failed to send request to DNSS service (Win32 error {})",
                    err
                )));
            }

            let mut response_bytes = Vec::with_capacity(512);
            let mut buf = [0u8; 4096];
            loop {
                let mut read_n: DWORD = 0;
                let ok = ReadFile(
                    pipe,
                    buf.as_mut_ptr(),
                    buf.len() as DWORD,
                    &mut read_n,
                    null_mut(),
                );
                if ok == FALSE {
                    let err = GetLastError();
                    if err == ERROR_BROKEN_PIPE {
                        break;
                    }
                    CloseHandle(pipe);
                    return Err(ServiceClientError::Failed(format!(
                        "Failed to read response from DNSS service (Win32 error {})",
                        err
                    )));
                }
                if read_n == 0 {
                    break;
                }
                let slice = &buf[..read_n as usize];
                if let Some(pos) = slice.iter().position(|&b| b == b'\n') {
                    if response_bytes.len() + pos > MAX_IPC_MESSAGE_BYTES {
                        CloseHandle(pipe);
                        return Err(ServiceClientError::Failed(
                            "DNSS service response exceeded size limit".to_string(),
                        ));
                    }
                    response_bytes.extend_from_slice(&slice[..pos]);
                    break;
                }
                if response_bytes.len() + slice.len() > MAX_IPC_MESSAGE_BYTES {
                    CloseHandle(pipe);
                    return Err(ServiceClientError::Failed(
                        "DNSS service response exceeded size limit".to_string(),
                    ));
                }
                response_bytes.extend_from_slice(slice);
            }

            CloseHandle(pipe);
            serde_json::from_slice::<ServiceResponse>(&response_bytes).map_err(|e| {
                ServiceClientError::Failed(format!("Invalid response from DNSS service: {}", e))
            })
        };

        result
    }
}

#[cfg(target_os = "windows")]
pub use win::{install_service, run_service, send_request, uninstall_service};

#[cfg(target_os = "windows")]
pub fn client_set_dns_many(
    adapters: Option<&[String]>,
    servers: &[String],
) -> Result<Vec<SetDnsOutcome>, ServiceClientError> {
    let resp = send_request(&ServiceRequest::SetDnsMany {
        adapters: adapters.map(|a| a.to_vec()),
        servers: servers.to_vec(),
    })?;
    if resp.ok {
        Ok(resp.outcomes.unwrap_or_default())
    } else {
        Err(ServiceClientError::Failed(
            resp.error
                .unwrap_or_else(|| "DNSS service failed to apply DNS settings".to_string()),
        ))
    }
}

#[cfg(target_os = "windows")]
pub fn client_reset_all_dns() -> Result<Vec<SetDnsOutcome>, ServiceClientError> {
    let resp = send_request(&ServiceRequest::ResetAllDns)?;
    if resp.ok {
        Ok(resp.outcomes.unwrap_or_default())
    } else {
        Err(ServiceClientError::Failed(
            resp.error
                .unwrap_or_else(|| "DNSS service failed to reset DNS settings".to_string()),
        ))
    }
}

#[cfg(target_os = "windows")]
pub fn client_flush_dns() -> Result<(), ServiceClientError> {
    let resp = send_request(&ServiceRequest::FlushDns)?;
    if resp.ok {
        Ok(())
    } else {
        Err(ServiceClientError::Failed(
            resp.error
                .unwrap_or_else(|| "DNSS service failed to flush DNS cache".to_string()),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_service_requests() {
        assert_eq!(
            parse_request_frame(br#"{"op":"ping"}"#).unwrap(),
            ServiceRequest::Ping
        );
        assert_eq!(
            parse_request_frame(br#"{"op":"reset_all_dns"}"#).unwrap(),
            ServiceRequest::ResetAllDns
        );
        assert_eq!(
            parse_request_frame(br#"{"op":"flush_dns"}"#).unwrap(),
            ServiceRequest::FlushDns
        );
        assert_eq!(
            parse_request_frame(
                br#"{"op":"set_dns_many","adapters":["Wi-Fi"],"servers":["1.1.1.1","1.0.0.1"]}"#
            )
            .unwrap(),
            ServiceRequest::SetDnsMany {
                adapters: Some(vec!["Wi-Fi".to_string()]),
                servers: vec!["1.1.1.1".to_string(), "1.0.0.1".to_string()],
            }
        );
    }

    #[test]
    fn rejects_oversized_or_malformed_frames() {
        assert!(parse_request_frame(b"").is_err());
        assert!(parse_request_frame(b"   ").is_err());
        assert!(parse_request_frame(br#"{"op":"exec","cmd":"whoami"}"#).is_err());
        let oversized = vec![b'a'; MAX_IPC_MESSAGE_BYTES + 1];
        assert!(parse_request_frame(&oversized).is_err());
    }

    #[test]
    fn validates_and_normalizes_servers() {
        assert_eq!(
            validate_and_normalize_servers(&[" 1.1.1.1 ".to_string(), "8.8.8.8".to_string()])
                .unwrap(),
            vec!["1.1.1.1".to_string(), "8.8.8.8".to_string()]
        );
        // Empty list is valid (resets to DHCP).
        assert!(validate_and_normalize_servers(&[]).unwrap().is_empty());
        // Injection attempts and non-IPv4 values must be rejected.
        assert!(validate_and_normalize_servers(&["1.1.1.1; calc.exe".to_string()]).is_err());
        assert!(validate_and_normalize_servers(&["not-an-ip".to_string()]).is_err());
        // Cap at MAX_SERVERS.
        let five: Vec<String> = (1..=5).map(|i| format!("1.1.1.{}", i)).collect();
        assert!(validate_and_normalize_servers(&five).is_err());
    }

    #[test]
    fn validates_adapters() {
        assert_eq!(
            validate_and_normalize_adapters(None).unwrap(),
            None
        );
        assert_eq!(
            validate_and_normalize_adapters(Some(&[" Wi-Fi ".to_string()])).unwrap(),
            Some(vec!["Wi-Fi".to_string()])
        );
        assert!(validate_and_normalize_adapters(Some(&[])).is_err());
        assert!(validate_and_normalize_adapters(Some(&["   ".to_string()])).is_err());
        assert!(validate_and_normalize_adapters(Some(&["Wi-Fi\nInject".to_string()])).is_err());
        assert!(validate_and_normalize_adapters(Some(&["Wi-Fi\0".to_string()])).is_err());
        let too_long = "a".repeat(MAX_ADAPTER_NAME_LEN + 1);
        assert!(validate_and_normalize_adapters(Some(&[too_long])).is_err());
        let too_many: Vec<String> = (0..=MAX_ADAPTERS).map(|i| format!("eth{}", i)).collect();
        assert!(validate_and_normalize_adapters(Some(&too_many)).is_err());
    }

    #[test]
    fn quotes_service_bin_path_safely() {
        assert_eq!(
            quote_service_bin_path(r"C:\Program Files\DNSS\dnss.exe").unwrap(),
            r#""C:\Program Files\DNSS\dnss.exe" --service"#
        );
        assert!(quote_service_bin_path("").is_err());
        assert!(quote_service_bin_path(r#"C:\bad"path\dnss.exe"#).is_err());
        assert!(quote_service_bin_path("C:\\bad\npath\\dnss.exe").is_err());
    }
}
