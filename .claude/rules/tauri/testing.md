---
description: Tauri testing patterns — Vitest mocks, cargo test, test organization
globs: **/*.test.ts, **/*.spec.ts, **/*.test.rs
---

# Testing

## Frontend Tests (Vitest)

- Mock IPC calls with `@tauri-apps/api/mocks`
- Test command wrappers and event handlers in isolation
- Use `mockIPC` to simulate backend responses

## GOOD

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';
import { readConfig } from '../api/config';

beforeEach(() => {
  mockWindows('main');
});

afterEach(() => {
  clearMocks();
});

describe('readConfig', () => {
  it('returns parsed config', async () => {
    mockIPC((cmd, args) => {
      if (cmd === 'read_config') {
        return { theme: 'dark', language: 'en' };
      }
    });

    const config = await readConfig();
    expect(config.theme).toBe('dark');
  });

  it('handles errors', async () => {
    mockIPC((cmd) => {
      if (cmd === 'read_config') {
        throw new Error('File not found');
      }
    });

    await expect(readConfig()).rejects.toThrow('File not found');
  });
});
```

## BAD

```typescript
// Not clearing mocks — state leaks between tests
// Not mocking windows — Tauri API calls fail
describe('config', () => {
  it('reads config', async () => {
    const config = await readConfig(); // No mock — hits real backend
  });
});

// Testing implementation details instead of behavior
it('calls invoke with correct command name', async () => {
  const spy = vi.spyOn(core, 'invoke');
  await readConfig();
  expect(spy).toHaveBeenCalledWith('read_config');
});
```

## Rust Tests

- Use `#[cfg(test)]` modules for unit tests
- Use `#[tokio::test]` for async command tests
- Test command logic independently from Tauri runtime

## GOOD

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_file_name() {
        assert!(is_valid_name("config.json"));
        assert!(!is_valid_name("../etc/passwd"));
        assert!(!is_valid_name("foo/bar.txt"));
    }

    #[tokio::test]
    async fn parses_config_from_string() {
        let json = r#"{"theme": "dark", "language": "en"}"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.theme, "dark");
    }
}
```

## BAD

```rust
// Testing with real filesystem — flaky, environment-dependent
#[test]
fn reads_real_file() {
    let content = std::fs::read_to_string("/tmp/test.json").unwrap();
    assert!(!content.is_empty());
}

// Not using #[tokio::test] for async — test won't compile
#[test]
async fn async_test() {
    let result = some_async_fn().await;
}
```

## Test Organization

- `src/**/*.test.ts` — frontend unit tests (Vitest)
- `src-tauri/src/**` — Rust tests inline with `#[cfg(test)]` modules
- Test IPC wrappers at the `api/` layer, not in components
