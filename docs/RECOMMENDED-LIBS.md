# Recommended Libraries

Libraries evaluated for Mirehub based on actual codebase needs. Each recommendation addresses a concrete gap identified during repository analysis.

## Priority 1 — High Impact

### Zod — IPC Input Validation

**Problem:** 24 IPC handler files validate inputs manually (`if (typeof x !== 'string')`). Repetitive, fragile, no type inference from validation.

**Solution:** Schema-based validation with automatic TypeScript type inference.

```bash
npm install zod
```

**Before:**

```typescript
ipcMain.handle('git:commit', async (_event, cwd: unknown, message: unknown) => {
  if (typeof cwd !== 'string') throw new Error('Invalid cwd')
  if (typeof message !== 'string') throw new Error('Invalid message')
  if (message.length === 0) throw new Error('Empty message')
  // ...
})
```

**After:**

```typescript
import { z } from 'zod'

const commitSchema = z.object({
  cwd: z.string(),
  message: z.string().min(1),
})

ipcMain.handle('git:commit', async (_event, args: unknown) => {
  const { cwd, message } = commitSchema.parse(args)
  // Typed + validated in one line
})
```

**Impact:** All 324 IPC channels benefit. Schemas can be shared between main and renderer for end-to-end type safety.

**Effort:** 2-3 days (progressive refactor, one handler file at a time).

---

### @tanstack/react-virtual — Virtualized Lists

**Problem:** Git log, file explorer, database query results, and TODO scanner render all items in the DOM. On large projects (10,000+ files, 5,000+ commits), this causes noticeable lag.

**Solution:** Only render visible items. ~30 DOM nodes instead of 10,000.

```bash
npm install @tanstack/react-virtual
```

**Usage:**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function GitLog({ entries }: { entries: GitLogEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
  })

  return (
    <div ref={parentRef} style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              height: virtualItem.size,
              width: '100%',
            }}
          >
            <GitLogRow entry={entries[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Candidates for virtualization:**
- `GitPanel.tsx` — commit log
- `FileExplorer.tsx` — file tree
- `DatabaseExplorer.tsx` — query results table
- `TodoScanner.tsx` — TODO list
- `PackagesPanel.tsx` — package list

**Impact:** ~5KB bundle addition, major perceived performance improvement on large projects.

**Effort:** 1 day (apply to the 5 components listed above).

---

### Playwright — E2E Electron Tests

**Problem:** 47 test files (unit + integration) but 0 end-to-end tests. No protection against UI regressions, broken navigation, or IPC round-trip failures in the real app.

**Solution:** Playwright supports Electron natively via `_electron.launch()`.

```bash
npm install -D @playwright/test
```

**Configuration:**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    trace: 'on-first-retry',
  },
})
```

**Example test:**

```typescript
// tests/e2e/app-launch.e2e.ts
import { test, expect, _electron } from '@playwright/test'

test('app launches and shows sidebar', async () => {
  const app = await _electron.launch({ args: ['.'] })
  const window = await app.firstWindow()

  await expect(window.locator('[data-testid="sidebar"]')).toBeVisible()
  await expect(window.locator('[data-testid="terminal-area"]')).toBeVisible()

  await app.close()
})

test('terminal opens and accepts input', async () => {
  const app = await _electron.launch({ args: ['.'] })
  const window = await app.firstWindow()

  await window.click('[data-testid="new-terminal"]')
  await expect(window.locator('.xterm')).toBeVisible()

  await app.close()
})

test('workspace creation works', async () => {
  const app = await _electron.launch({ args: ['.'] })
  const window = await app.firstWindow()

  await window.click('[data-testid="create-workspace"]')
  await window.fill('[data-testid="workspace-name"]', 'Test Workspace')
  await window.click('[data-testid="workspace-submit"]')

  await expect(window.locator('text=Test Workspace')).toBeVisible()

  await app.close()
})
```

**Add to package.json:**

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

**Impact:** Catches UI regressions, broken IPC, and navigation bugs that unit tests miss.

**Effort:** 2 days (setup + 10-15 core scenario tests).

---

## Priority 2 — Medium Impact

### electron-log — Structured Logging

**Problem:** `console.log` in the main process. In production builds, these logs are lost or unstructured. Users cannot easily share debug information.

**Solution:** File-based structured logging with automatic rotation.

```bash
npm install electron-log
```

**Setup:**

```typescript
// src/main/index.ts
import log from 'electron-log/main'

log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// Logs written to ~/Library/Logs/Mirehub/main.log (macOS)
// Logs written to %USERPROFILE%\AppData\Roaming\Mirehub\logs\main.log (Windows)
```

**Usage in IPC handlers:**

```typescript
// src/main/ipc/database.ts
import log from 'electron-log/main'

ipcMain.handle('database:connect', async (_event, config) => {
  log.info('Database connection attempt', { driver: config.type, host: config.host })
  try {
    const client = await connect(config)
    log.info('Database connected', { driver: config.type })
    return client
  } catch (error) {
    log.error('Database connection failed', { driver: config.type, error: error.message })
    throw error
  }
})
```

**Features:**
- Automatic log rotation (default 1MB max)
- Timestamps, log levels, stack traces
- File + console transports
- Users can send `~/Library/Logs/Mirehub/main.log` for debugging

**Impact:** Essential for debugging production issues.

**Effort:** 0.5 day (initialize + replace `console.log` in critical handlers).

---

### cmdk — Command Palette

**Problem:** `CommandPalette.tsx` is a custom implementation. Custom command palettes tend to lack fuzzy search quality, accessibility, and keyboard navigation edge cases.

**Solution:** `cmdk` is the reference implementation (used by Vercel, Linear, Raycast).

```bash
npm install cmdk
```

**Usage:**

```typescript
import { Command } from 'cmdk'

function CommandPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Group heading="Navigation">
          <Command.Item onSelect={() => setView('terminal')}>Terminal</Command.Item>
          <Command.Item onSelect={() => setView('git')}>Git</Command.Item>
          <Command.Item onSelect={() => setView('kanban')}>Kanban</Command.Item>
        </Command.Group>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => createWorkspace()}>New Workspace</Command.Item>
          <Command.Item onSelect={() => openSettings()}>Settings</Command.Item>
        </Command.Group>
      </Command.List>
      <Command.Empty>No results found.</Command.Empty>
    </Command>
  )
}
```

**Advantages over custom:**
- Built-in fuzzy search (Fuse.js quality)
- Composable groups, nested pages, loading states
- Full ARIA compliance and keyboard navigation
- ~4KB gzipped

**Impact:** Better UX, less custom code to maintain.

**Effort:** 0.5 day (replace existing CommandPalette.tsx).

---

### date-fns — Date Formatting

**Problem:** Kanban due dates, health check timestamps, git log dates, and session timestamps likely use manual `Date` formatting or `toLocaleString()`.

**Solution:** Tree-shakable date utilities with locale support.

```bash
npm install date-fns
```

**Usage:**

```typescript
import { formatRelative, formatDistance, isPast } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'

// Kanban due dates
formatRelative(task.dueDate, new Date(), { locale: fr })
// → "hier à 14:30" / "vendredi prochain"

// Health check last run
formatDistance(check.lastRun, new Date(), { addSuffix: true, locale: fr })
// → "il y a 5 minutes"

// Overdue detection
if (isPast(task.dueDate)) {
  // Show warning
}
```

**Impact:** Consistent date formatting across the app, proper i18n (fr/en already supported).

**Effort:** 0.5 day.

---

## Priority 3 — Design System

### Tailwind CSS + shadcn/ui

**Problem:** 8 custom CSS files, no design system. Component styling is ad-hoc, making visual consistency hard to maintain as the component count grows (100+ .tsx files).

**Solution:** Tailwind for utility-first styling, shadcn/ui for pre-built accessible components.

```bash
npm install tailwindcss @tailwindcss/vite
npx shadcn@latest init
```

**Then add components as needed:**

```bash
npx shadcn@latest add button dialog dropdown-menu tabs input
npx shadcn@latest add command    # Alternative to cmdk (shadcn wraps cmdk)
npx shadcn@latest add table      # For database query results
npx shadcn@latest add toast      # Replace custom ToastContainer
```

**Migration strategy:**

| Approach | When |
|----------|------|
| Progressive — shadcn on new components, existing CSS stays | Shipping new features fast |
| Full migration — convert all components to Tailwind | Want unified design system |

**Note:** shadcn's `command` component wraps `cmdk`, so choosing shadcn covers the command palette need too.

**Impact:** Unified design language, accessible components, less CSS maintenance.

**Effort:** 2-3 days for progressive adoption, 5-7 days for full migration.

---

### react-hotkeys-hook — Keyboard Shortcuts

**Problem:** If keyboard shortcuts are managed with manual `addEventListener('keydown', ...)`, they lack scope management (e.g., shortcuts should be disabled when a modal is open) and cross-platform key mapping.

```bash
npm install react-hotkeys-hook
```

**Usage:**

```typescript
import { useHotkeys } from 'react-hotkeys-hook'

function App() {
  useHotkeys('mod+k', () => openCommandPalette())
  useHotkeys('mod+1', () => setView('terminal'))
  useHotkeys('mod+2', () => setView('git'))
  useHotkeys('mod+shift+n', () => createWorkspace())

  // Scoped — only active when terminal is focused
  useHotkeys('mod+t', () => newTerminalTab(), { scopes: ['terminal'] })
}
```

**Features:**
- `mod` maps to Cmd (macOS) / Ctrl (Windows) automatically
- Scopes prevent shortcut conflicts (modal open, terminal focused)
- Works with the existing `KEYBOARD-SHORTCUTS.md` documentation

**Impact:** Cleaner shortcut management, proper cross-platform support.

**Effort:** 0.5 day.

---

## Not Recommended

Libraries evaluated and rejected for Mirehub:

| Library | Reason |
|---------|--------|
| TanStack Query | Zustand stores already handle IPC async state. No HTTP cache layer needed. |
| Redux / Redux Toolkit | Zustand is simpler and already in place. No reason to migrate. |
| React Router | App uses tab-based navigation, not URL routing. Adding a router adds complexity with no benefit. |
| Prisma / Drizzle | Database drivers connect to user databases, not an app-owned DB. ORM is not applicable. |
| Winston / Pino | Server-side Node.js loggers. `electron-log` is purpose-built for Electron (file paths, rotation, renderer support). |
| i18next | Custom i18n system already works (fr/en). Migration cost outweighs marginal benefit. |
| Framer Motion | Animation library. Desktop apps should feel snappy, not animated. Respect `prefers-reduced-motion`. |
| Axios | `fetch` is available in both main (Node 20+) and renderer. No need for a wrapper. |

---

## Summary

| Priority | Library | Effort | Gain |
|----------|---------|--------|------|
| 1 | **Zod** | 2-3 days | Type-safe IPC validation on 324 channels |
| 1 | **@tanstack/react-virtual** | 1 day | Smooth scrolling on large datasets |
| 1 | **Playwright** | 2 days | E2E test coverage (currently 0) |
| 2 | **electron-log** | 0.5 day | Production debugging |
| 2 | **cmdk** | 0.5 day | Battle-tested command palette |
| 2 | **date-fns** | 0.5 day | Consistent date formatting with i18n |
| 3 | **Tailwind + shadcn/ui** | 2-7 days | Unified design system |
| 3 | **react-hotkeys-hook** | 0.5 day | Cross-platform keyboard shortcuts |

**Total estimated effort:** 9-15 days for all libraries, but they can be adopted incrementally in any order.
