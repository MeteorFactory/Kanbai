---
description: "Tauri command patterns — #[tauri::command], state, error handling"
globs: **/src-tauri/src/**/*.rs
---

# Tauri Commands

## Command Definition

- Annotate with `#[tauri::command]` and register in `tauri::generate_handler![]`
- Use `async` commands for I/O operations
- Return `Result<T, E>` where `E` implements `serde::Serialize`

## GOOD

```rust
#[tauri::command]
async fn read_config(app: tauri::AppHandle) -> Result<Config, AppError> {
    let path = app.path().app_config_dir()?.join("config.json");
    let content = tokio::fs::read_to_string(&path).await?;
    let config: Config = serde_json::from_str(&content)?;
    Ok(config)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_config, save_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## BAD

```rust
// Missing error handling — panics on failure
#[tauri::command]
fn read_config() -> Config {
    let content = std::fs::read_to_string("config.json").unwrap();
    serde_json::from_str(&content).unwrap()
}

// Not registered in generate_handler! — command silently unavailable
```

## State Management

- Use `tauri::State<'_, T>` to inject managed state
- Wrap mutable state in `Mutex<T>` or `RwLock<T>`
- Initialize state with `.manage()` in the builder

## GOOD

```rust
use std::sync::Mutex;

struct AppState {
    counter: Mutex<i32>,
}

#[tauri::command]
fn increment(state: tauri::State<'_, AppState>) -> Result<i32, AppError> {
    let mut counter = state.counter.lock().map_err(|_| AppError::LockFailed)?;
    *counter += 1;
    Ok(*counter)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { counter: Mutex::new(0) })
        .invoke_handler(tauri::generate_handler![increment])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## BAD

```rust
// Using static mut — undefined behavior, not thread-safe
static mut COUNTER: i32 = 0;

#[tauri::command]
fn increment() -> i32 {
    unsafe { COUNTER += 1; COUNTER }
}

// Unwrapping Mutex lock — panics if poisoned
let counter = state.counter.lock().unwrap();
```

## Error Handling

- Define a custom error type with `thiserror`
- Implement `serde::Serialize` so errors propagate to the frontend

## GOOD

```rust
use thiserror::Error;
use serde::Serialize;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("Permission denied")]
    PermissionDenied,
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}
```

## BAD

```rust
// Returning String errors — no structured error handling on frontend
#[tauri::command]
fn do_thing() -> Result<(), String> {
    Err("something went wrong".into())
}
```

## Window Management

- Access windows via `AppHandle` or `WebviewWindow`
- Use labels to target specific windows

## GOOD

```rust
use tauri::Manager;

#[tauri::command]
async fn open_settings(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("settings") {
        window.set_focus()?;
    } else {
        tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("/settings".into()))
            .title("Settings")
            .build()?;
    }
    Ok(())
}
```
