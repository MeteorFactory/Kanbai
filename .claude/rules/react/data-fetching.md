---
description: TanStack Query v5 data fetching and mutations
globs: **/src/api/**, **/src/hooks/use*Query*, **/src/hooks/use*Mutation*, **/src/features/**/api/**
---

# Data Fetching

## Stack

- **TanStack Query v5** as default for all client-side data fetching
- **Suspense boundaries** as default loading pattern
- **`use()` hook** to unwrap server data (promises) in client components

## Queries

- Always use object syntax: `useQuery({ queryKey, queryFn })` — no positional args (v4 syntax)
- Use `isPending` (not `isLoading`) for initial load state in v5
- Use `placeholderData: keepPreviousData` for pagination — not the old `keepPreviousData: true`

## Query Keys

- Structure hierarchically for selective invalidation: `['users', 'list', filters]`, `['users', 'detail', id]`
- Create a key factory per entity: `userKeys.all`, `userKeys.list(filters)`, `userKeys.detail(id)`
- Include all variables the query depends on in the key

## Mutations

- Invalidate related queries in `onSuccess` — do NOT manually update local state after mutation
- Use optimistic updates via `onMutate` / `onError` / `onSettled` for instant feedback
- Always cancel in-flight queries before optimistic cache writes (`queryClient.cancelQueries`)

## `use()` Hook (React 19)

- See hooks rules for `use()` API details — use inside Suspense boundaries to unwrap server data

## Suspense Integration

- Wrap data-dependent components in `<Suspense fallback={...}>` for streaming UX
- Use `useSuspenseQuery` when the component should suspend rather than handle loading state
- Nest Suspense boundaries to avoid full-page loading states

## Anti-Patterns

- Do NOT fetch in `useEffect` + `useState` — use TanStack Query or router loaders
- Do NOT use flat string keys (`'users-list-admin'`) — use hierarchical arrays for cache control
- Do NOT manually sync server data into `useState` — let the query cache be the source of truth
- Do NOT forget `enabled: false` for dependent queries — prevents premature fetching
