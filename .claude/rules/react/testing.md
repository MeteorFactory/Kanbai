---
description: React testing patterns with Vitest and Testing Library
globs: **/src/**/*.test.tsx, **/src/**/*.test.ts, **/src/**/*.spec.tsx, **/src/**/*.spec.ts
---

# Testing

## Stack

- **Vitest** as test runner (not Jest)
- **React Testing Library** for component tests
- **MSW (Mock Service Worker)** for API mocking at the network level
- **`userEvent`** (not `fireEvent`) for user interaction simulation

## Query Priority

Use queries in this order — prefer accessible selectors:

| Priority | Query | When |
|----------|-------|------|
| 1 | `getByRole` | Buttons, links, headings, form elements |
| 2 | `getByLabelText` | Form inputs with labels |
| 3 | `getByText` | Non-interactive text content |
| 4 | `getByTestId` | Last resort — no accessible selector available |

## Patterns

- Always call `userEvent.setup()` before rendering — use the returned `user` instance for interactions
- Use `screen.findByX` (async) for elements that appear after state changes or data fetching
- Use `screen.queryByX` to assert absence (`expect(...).not.toBeInTheDocument()`)
- Mock API calls with MSW (`http.get`, `HttpResponse.json`) — not `vi.mock` on API modules

## Hook Testing

- Use `renderHook` + `act` from `@testing-library/react` for custom hook tests
- Test through component behavior when possible — only use `renderHook` for shared hooks

## Anti-Patterns

- Do NOT use `fireEvent` — use `userEvent` for realistic browser behavior
- Do NOT mock components — mock the network layer (MSW) instead
- Do NOT use `container.querySelector` — use Testing Library queries
- Do NOT overuse snapshots — they break on every change and reviewers skip them
- Do NOT test implementation details (internal state, private methods, hook internals)
