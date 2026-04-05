#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")]

#[tauri::command]
fn spawn_server() -> Result<String, String> {
  std::process::Command::new(\"bun\")
    .current_dir(\"../../\")
    .arg(\"run\")
    .arg(\"packages/server/src/index.ts\")
    .stdout(std::process::Stdio::null())
    .spawn()
    .map_err(|e| e.to_string())
    .map(|child| child.id().to_string())
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![spawn_server])
    .run(tauri::generate_context!())
    .expect(\"error while running tauri application\");
}