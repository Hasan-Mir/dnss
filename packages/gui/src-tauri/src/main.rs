// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    {
        // Service lifecycle entry points (handled before Tauri/WebView2 or
        // single-instance initialization so the background service never loads
        // GUI state).
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.iter().any(|a| a == "--service") {
            if let Err(err) = dnss_lib::run_windows_service() {
                eprintln!("{}", err);
                std::process::exit(1);
            }
            return;
        }
        if args.iter().any(|a| a == "--install-service") {
            if let Err(err) = dnss_lib::install_windows_service() {
                eprintln!("{}", err);
                std::process::exit(1);
            }
            return;
        }
        if args.iter().any(|a| a == "--uninstall-service") {
            if let Err(err) = dnss_lib::uninstall_windows_service() {
                eprintln!("{}", err);
                std::process::exit(1);
            }
            return;
        }
    }

    dnss_lib::run();
}
