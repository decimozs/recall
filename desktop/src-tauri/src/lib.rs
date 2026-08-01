#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::{Child, Command};
use tauri::Manager;

fn start_backend(app: &tauri::AppHandle) -> Result<Child, Box<dyn std::error::Error>> {
    let executable_dir = std::env::current_exe()?
        .parent()
        .ok_or("Recall executable has no parent directory")?
        .to_path_buf();
    let data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&data_dir)?;
    let backend = executable_dir.join("recall-backend");
    let bridge = executable_dir.join("recall-native-db");
    let database = data_dir.join("recall.sqlite3");
    if !backend.exists() || !bridge.exists() {
        return Err(format!("Recall sidecars are missing: {} and {}", backend.display(), bridge.display()).into());
    }
    let agent_token = std::env::var("AGENT_API_KEY").unwrap_or_else(|_| "dev-agent-key".to_string());
    let manifest = serde_json::json!({
        "api_url": "http://127.0.0.1:3000",
        "agent_key": agent_token,
        "note": "The local Recall API runs on loopback for this installation."
    });
    let manifest_path = data_dir.join("connection.json");
    fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)?;
    #[cfg(unix)]
    fs::set_permissions(&manifest_path, std::os::unix::fs::PermissionsExt::from_mode(0o600))?;
    let child = Command::new(backend)
        .env("HOST", "127.0.0.1")
        .env("PORT", "3000")
        .env("AGENT_API_KEY", agent_token)
        .env("RECALL_DB_PATH", database)
        .env("RECALL_DB_BRIDGE", bridge)
        .spawn()?;
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if !cfg!(debug_assertions) {
                let child = start_backend(app.handle())?;
                app.manage(BackendProcess(std::sync::Mutex::new(Some(child))));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
                    if let Ok(mut child) = state.0.lock() {
                        if let Some(mut process) = child.take() {
                            let _ = process.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Recall");
}

struct BackendProcess(std::sync::Mutex<Option<Child>>);
