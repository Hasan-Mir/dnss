fn main() {
    let mut attrs = tauri_build::Attributes::new();

    // Embed a Windows application manifest that requests administrator
    // privileges, so the UAC consent dialog appears automatically when the
    // app starts (same behavior as tools like CCleaner). Only applied on
    // Windows targets.
    #[cfg(target_os = "windows")]
    {
        let windows = tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("windows/app.manifest"));
        attrs = attrs.windows_attributes(windows);
    }

    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
