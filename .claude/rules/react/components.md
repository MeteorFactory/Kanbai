---
description: React component patterns and best practices
globs: **/src/components/**/*.tsx, **/src/features/**/components/**/*.tsx
---

# React Components

## Server Components Awareness

- Components are Server Components by default in RSC frameworks
- Add `"use client"` only when using: `useState`, `useEffect`, event handlers, browser APIs
- Keep client boundaries as low as possible in the component tree

## Refs (React 19)

- Pass `ref` as a regular prop — `forwardRef` is no longer needed
- Type with `ref?: React.Ref<HTMLElement>`

## Composition

- Prefer children/slots over config props — use compound components (`Card` + `Card.Header`) for complex UI
- Use `children: ReactNode` for layout wrappers, named `ReactNode` props for multiple slots
- Use render props (`renderItem`) only for generic list/iterator components

## Conditional Rendering

- Use `&&` for simple conditions, early returns for complex branching
- Do NOT nest ternaries — extract to separate components or variables

## Event Handlers

- Extract handlers as named functions (`handleSubmit`) — no inline multi-line logic in JSX
- Type event parameters explicitly (`FormEvent<HTMLFormElement>`)

## Anti-Patterns

- Do NOT pass many config props — use composition instead
- Do NOT use `index` as `key` for dynamic lists — use stable unique identifiers
