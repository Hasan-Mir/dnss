fn main() {
    let mut attrs = tauri_build::Attributes::new();

    // Windows application manifests:
    //  - Release: request administrator privileges, so the UAC consent dialog
    //    appears automatically when the app starts (same behavior as tools
    //    like CCleaner).
    //  - Debug: start as the invoking user, because `cargo run` (and therefore
    //    `tauri dev`) cannot launch a requireAdministrator executable from a
    //    non-elevated shell — Windows refuses with error 740 before main()
    //    ever runs. Dev builds self-relaunch elevated instead (see lib.rs).
    // Only applied on Windows targets.
    #[cfg(target_os = "windows")]
    {
        let manifest = if std::env::var("PROFILE").as_deref() == Ok("release") {
            include_str!("windows/app.manifest")
        } else {
            include_str!("windows/app.manifest.dev")
        };
        let windows = tauri_build::WindowsAttributes::new().app_manifest(manifest);
        attrs = attrs.windows_attributes(windows);
    }

    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
