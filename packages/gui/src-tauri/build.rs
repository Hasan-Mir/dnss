fn main() {
    let mut attrs = tauri_build::Attributes::new();

    // Windows application manifest:
    // Both release and debug builds run as the invoking user (`asInvoker`) so
    // launching DNSS never triggers a UAC prompt. Privileged DNS updates are
    // handled by the `DnssService` Windows background service installed once
    // during per-machine setup (see `src/service.rs` and `windows/hooks.nsh`).
    #[cfg(target_os = "windows")]
    {
        let manifest = include_str!("windows/app.manifest");
        let windows = tauri_build::WindowsAttributes::new().app_manifest(manifest);
        attrs = attrs.windows_attributes(windows);
    }

    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
