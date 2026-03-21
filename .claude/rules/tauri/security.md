---
description: Tauri security patterns — capabilities, CSP, filesystem scoping
globs: **/src-tauri/capabilities/**, **/tauri.conf.json
---

# Security

## Capabilities

- Define per-window permissions in `src-tauri/capabilities/`
- Follow least privilege — only grant what each window needs
- Use scoped permissions for filesystem and shell access

## GOOD

```json
{
  "identifier": "main-window",
  "description": "Permissions for the main application window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    {
      "identifier": "fs:allow-read",
      "allow": [{ "path": "$APPDATA/**" }]
    },
    {
      "identifier": "fs:allow-write",
      "allow": [{ "path": "$APPDATA/**" }]
    }
  ]
}
```

## BAD

```json
{
  "identifier": "main-window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "shell:default"
  ]
}
```

```json
{
  "permissions": [
    {
      "identifier": "fs:allow-read",
      "allow": [{ "path": "/**" }]
    }
  ]
}
```

## CSP Configuration

- Set a strict CSP in `tauri.conf.json`
- Never use `unsafe-eval` — breaks Tauri's security model
- Allow only `self` and Tauri-specific schemes

## GOOD

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

## BAD

```json
{
  "app": {
    "security": {
      "csp": "default-src * 'unsafe-eval' 'unsafe-inline'"
    }
  }
}
```

## Filesystem Scoping

- Always scope to app-specific directories
- Use Tauri path variables: `$APPDATA`, `$APPCONFIG`, `$APPLOCAL`, `$DOWNLOAD`
- Never grant access to `$HOME` or root paths

## GOOD

```json
{
  "identifier": "fs:allow-read",
  "allow": [
    { "path": "$APPDATA/**" },
    { "path": "$APPCONFIG/**" }
  ]
}
```

## BAD

```json
{
  "identifier": "fs:allow-read",
  "allow": [
    { "path": "$HOME/**" },
    { "path": "/**" }
  ]
}
```

## Input Validation in Commands

- Validate and sanitize all inputs received from the frontend
- Use Rust's type system to enforce constraints
- Never construct file paths from raw user input

## GOOD

```rust
#[tauri::command]
async fn read_file(app: tauri::AppHandle, name: String) -> Result<String, AppError> {
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(AppError::InvalidInput("Invalid file name".into()));
    }
    let path = app.path().app_data_dir()?.join(&name);
    let content = tokio::fs::read_to_string(&path).await?;
    Ok(content)
}
```

## BAD

```rust
// Path traversal — attacker sends "../../etc/passwd"
#[tauri::command]
async fn read_file(name: String) -> Result<String, AppError> {
    let content = tokio::fs::read_to_string(&name).await?;
    Ok(content)
}
```
