---
description: Tauri frontend IPC patterns — invoke wrappers, events, type safety
globs: **/src/**/*.ts, **/src/**/*.tsx
---

# Frontend IPC

## Command Invocation

- Create typed wrapper functions — never call `invoke()` with inline string literals
- Place all wrappers in a dedicated `api/` or `commands/` directory
- Use generics for return types: `invoke<T>()`

## GOOD

```typescript
// src/api/config.ts
import { invoke } from '@tauri-apps/api/core';

export interface Config {
  theme: 'light' | 'dark';
  language: string;
}

export async function readConfig(): Promise<Config> {
  return invoke<Config>('read_config');
}

export async function saveConfig(config: Config): Promise<void> {
  return invoke('save_config', { config });
}
```

```typescript
// Usage in component
import { readConfig, saveConfig } from '../api/config';

const config = await readConfig();
```

## BAD

```typescript
// Inline invoke with magic string — no type safety, no refactoring
const config = await invoke('read_config');

// Untyped return — `any` propagates through the codebase
const data = await invoke('get_data', { id: 123 });
```

## Event System

- Use `listen()` for main-to-frontend events
- Use `emit()` for frontend-to-main events
- Always call the unlisten function on component unmount

## GOOD

```typescript
import { listen, emit } from '@tauri-apps/api/event';
import { useEffect } from 'react';

function ProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const unlisten = listen<number>('download:progress', (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return <progress value={progress} max={100} />;
}
```

## BAD

```typescript
// Missing unlisten — memory leak, stale handler after unmount
useEffect(() => {
  listen('download:progress', (event) => {
    setProgress(event.payload);
  });
}, []);

// Using invoke for streaming updates — use events instead
const poll = setInterval(async () => {
  const progress = await invoke('get_progress');
  setProgress(progress);
}, 100);
```

## Type Mirroring

- Keep Rust structs and TypeScript interfaces in sync
- Name TypeScript types to match Rust struct names
- Document which Rust command each wrapper calls

## GOOD

```typescript
// Mirrors Rust: pub struct FileEntry { name: String, size: u64, is_dir: bool }
export interface FileEntry {
  name: string;
  size: number;
  is_dir: boolean;
}
```

## BAD

```typescript
// Mismatched field names — will fail at runtime with no compile error
export interface FileEntry {
  fileName: string;  // Rust has `name`, not `fileName`
  fileSize: number;  // Rust has `size`, not `fileSize`
}
```
