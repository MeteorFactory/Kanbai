---
description: React hooks patterns and best practices
globs: **/src/hooks/**/*.ts, **/src/features/**/hooks/**/*.ts
---

# React Hooks

## React 19 Hooks

### useActionState (replaces deprecated useFormState)

- Returns `[state, formAction, isPending]` — use for form submissions with pending/error state
- Action signature: `async (prevState, formData) => newState`
- Wire to `<form action={formAction}>` for progressive enhancement

### useOptimistic

- Immediately reflect expected state while async action completes
- Signature: `useOptimistic(state, updateFn)` — returns `[optimisticState, addOptimistic]`
- Always pair with a server action that resolves to the real state

### use()

- Unwrap promises in render — must be inside a Suspense boundary
- Unwrap context conditionally — unlike `useContext`, can be called inside `if` blocks
- Do NOT create promises inside render — pass them from a parent/loader/server component

## Custom Hooks

- Prefix with `use` — no exceptions
- Single responsibility: one hook = one concern
- Return object for 3+ values (`{ data, isLoading, error }`), tuple for 1-2
- Always clean up subscriptions, timers, and AbortControllers in `useEffect` return

## useEffect Rules

- Always provide a cleanup function for subscriptions, listeners, and fetch calls
- Use `AbortController` for fetch cleanup — not boolean flags
- Do NOT use `useEffect` for event handling — use event handlers directly

## Anti-Patterns

- Do NOT use `useFormState` — it is deprecated, use `useActionState`
- Do NOT omit dependencies from `useEffect` — let the linter enforce correctness
- Do NOT create promises inside components passed to `use()` — causes infinite re-renders
