---
description: React state management patterns
globs: **/src/**/*.tsx
---

# React State Management

## Decision Matrix

| Scope | Solution | When |
|-------|----------|------|
| Component-local | `useState` / `useReducer` | Simple values, toggle, form inputs |
| Derived | Compute during render | Filtering, sorting, formatting existing state |
| Shared (small) | Context + `useReducer` | Auth, theme, locale — low-frequency updates |
| Shared (complex) | Zustand | Cross-feature state, frequent updates, middleware needed |
| Atomic/fine-grained | Jotai | Many independent pieces, derived atoms, minimal re-renders |
| Server state | TanStack Query | API data — caching, background refresh, pagination |
| Optimistic UI | `useOptimistic` | Immediate feedback during async mutations |

## Core Rules

- **Colocate state**: Keep state in the lowest common ancestor — lift only when siblings need it
- **Derive, don't sync**: If a value can be computed from existing state/props, compute it during render — never `useState` + `useEffect` to sync
- **`useReducer` over `useState`**: When state transitions depend on previous state or involve multiple related values
- **Context splitting**: One context per domain (auth, theme, locale) — never one mega-context for everything

## Context Guidelines

- Always provide a custom hook (`useAuth`, `useTheme`) that throws if used outside the provider
- Use `use(Context)` (React 19) instead of `useContext` — supports conditional reads
- `<Context.Provider>` is legacy — prefer `<Context value={...}>` directly (React 19). `Context.Provider` will be deprecated in a future release.

## Anti-Patterns

- Do NOT sync props to state with `useEffect` — derive the value or use a key to reset
- Do NOT put everything in global state — most state is local or server-owned
- Do NOT use `useRef` for render-affecting values — refs do not trigger re-renders
- Do NOT lift state higher than necessary — causes unnecessary re-renders in parent trees
