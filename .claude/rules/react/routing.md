---
description: React Router v6.4+ / v7 routing and code splitting
globs: **/src/router.*, **/src/routes/**, **/src/pages/**, **/src/app/routes/**
---

# Routing

## Router Choice

| Router | When |
|--------|------|
| React Router v6.4+ | Standard SPAs, data-driven routing with loaders/actions |
| TanStack Router | Type-safe routes, file-based routing, advanced search params |

## Route Definition

- Use `createBrowserRouter` with object syntax — not `<BrowserRouter>` + JSX `<Route>` elements
- Lazy-load all route components via `lazy` property for automatic code splitting
- Colocate loaders and actions with their route files (`users.loader.ts`, `users.action.ts`)

## Data Loading

- Fetch data in **loaders**, not in `useEffect` — loaders run before render and enable parallel fetching
- Type loader data with `useLoaderData<typeof loader>()` for end-to-end type safety
- Use `redirect()` in loaders/actions for auth guards and post-mutation redirects

## Mutations

- Use React Router `<Form>` component (not `<form>`) to trigger route actions
- Handle different methods (`POST`, `DELETE`) in the action function
- Access `useNavigation().state` for `submitting`/`loading` feedback

## Error Handling

- Add `errorElement` to every route — at minimum on the root route
- Use `isRouteErrorResponse(error)` to distinguish 404s from unexpected errors
- Nest error boundaries: route-level for granularity, root-level as fallback

## Navigation

- Use `<Link>` / `<NavLink>` for declarative navigation
- Use `useNavigate()` only for programmatic navigation after user actions (logout, etc.)
- Use `NavLink` with `className={({ isActive }) => ...}` for active states

## Anti-Patterns

- Do NOT use `window.location.href` for SPA navigation — breaks client-side routing
- Do NOT fetch data in `useEffect` when loaders are available — causes waterfalls
- Do NOT redirect in `useEffect` — use `redirect()` in loaders/actions instead
- Do NOT use the old `<BrowserRouter>` + `<Routes>` API for data-driven apps
- DO consider React Router v7 framework mode with file-based `route.ts` for new projects
