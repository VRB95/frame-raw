use serde::{Deserialize, Serialize};
use std::{collections::hash_map::DefaultHasher, hash::{Hash, Hasher}};
use tauri::{Emitter, Manager, Runtime};
use tauri_plugin_shell::{process::Output, ShellExt};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewResult {
    path: String,
    width: u32,
    height: u32,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrintFormat {
    width_mm: f64,
    height_mm: f64,
    orientation: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Placement {
    mode: String,
    scale: f64,
    offset_x: f64,
    offset_y: f64,
    rotation_deg: f64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    source_path: String,
    output_path: String,
    format: PrintFormat,
    placement: Placement,
    border_mm: f64,
    dpi: u32,
}

#[derive(Deserialize)]
struct BackendEnvelope<T> {
    ok: bool,
    result: Option<T>,
    error: Option<String>,
}

async fn run_sidecar<R: Runtime>(app: &tauri::AppHandle<R>, args: Vec<String>) -> Result<Output, String> {
    let output = app.shell()
        .sidecar("frameraw-backend")
        .map_err(|error| error.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|error| error.to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stderr.lines().filter(|line| !line.trim().is_empty()) {
        eprintln!("{line}");
        let _ = app.emit("backend-log", line.to_string());
    }
    Ok(output)
}

fn decode_response<T: for<'de> Deserialize<'de>>(output: Output) -> Result<T, String> {
    let stdout = String::from_utf8(output.stdout).map_err(|error| error.to_string())?;
    let envelope: BackendEnvelope<T> = serde_json::from_str(stdout.trim()).map_err(|error| format!("Invalid backend response: {error}"))?;
    if output.status.success() && envelope.ok {
        envelope.result.ok_or_else(|| "The backend returned no result".into())
    } else {
        Err(envelope.error.unwrap_or_else(|| String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

#[tauri::command]
async fn generate_preview(app: tauri::AppHandle, source_path: String) -> Result<PreviewResult, String> {
    let mut hasher = DefaultHasher::new();
    source_path.hash(&mut hasher);
    if let Ok(metadata) = std::fs::metadata(&source_path) {
        metadata.len().hash(&mut hasher);
        metadata.modified().ok().hash(&mut hasher);
    }
    let cache = app.path().app_cache_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    let destination = cache.join(format!("preview-{:x}.jpg", hasher.finish()));
    let output = run_sidecar(&app, vec![
        "preview".into(), "--input".into(), source_path, "--output".into(), destination.to_string_lossy().into_owned()
    ]).await?;
    decode_response(output)
}

#[tauri::command]
async fn export_image(app: tauri::AppHandle, request: ExportRequest) -> Result<serde_json::Value, String> {
    let request_json = serde_json::to_string(&request).map_err(|error| error.to_string())?;
    let output = run_sidecar(&app, vec!["export".into(), "--request".into(), request_json]).await?;
    decode_response(output)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![generate_preview, export_image])
        .run(tauri::generate_context!())
        .expect("error while running FrameRaw");
}
