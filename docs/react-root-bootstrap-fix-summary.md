# React Root Bootstrap Fix Summary

Date: 2026-06-07

## Context

Navigating from AI Usage to Profile produced this React warning:

```text
You are calling ReactDOMClient.createRoot() on a container that has already been passed to createRoot() before.
```

The Profile page loaded `DisplayNameSection`, which imported `api` from `@/main`. Several query modules also imported `api` from `../main`.

`main.tsx` is the browser bootstrap entry point and calls `createRoot(...).render(...)`. Importing it from route, query, or component code can re-execute the bootstrap module during navigation and attempt to mount React on the same `#root` container again.

## Fix

Moved the shared API client into a side-effect-free module:

- `apps/client/src/lib/api.ts`

That module now exports:

- `api`
- `setApiUnauthorizedHandler`

`main.tsx` now only wires the unauthorized handler to TanStack Router and keeps the single React bootstrap call.

All route, query, and component imports were changed from `@/main` / `../main` to `@/lib/api`.

## Why this works

Routes and components can safely import `@/lib/api` because it does not call `createRoot`.

`main.tsx` remains an application entry point only. It should not be imported by normal application modules.

## Verification

Run:

```bash
yarn nx vite:build client --skip-nx-cache
```

Also manually verify navigation:

1. Open AI Usage.
2. Navigate to Profile.
3. Confirm the `createRoot()` warning no longer appears.
