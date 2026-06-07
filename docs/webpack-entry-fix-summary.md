# Webpack Entry Fix Summary

Date: 2026-06-07

## Context

Several backend services failed during `webpack-cli build` with messages like:

```text
Field 'browser' doesn't contain a valid alias configuration
Can't resolve './src'
```

This was not caused by a webpack upgrade. The build command was running without an explicit webpack config or entry point, so webpack used its default entry resolution and tried to find `./src` / `./src/index`.

The Nest services use `src/main.ts` as their entry point, so the default webpack lookup failed.

## Fix

Added Nx-generated webpack configs for:

- `apps/api`
- `apps/microservices/auth`
- `apps/microservices/upload`
- `apps/microservices/notes`
- `apps/microservices/ai`

Each config uses `NxAppWebpackPlugin` with:

- `target: 'node'`
- `compiler: 'tsc'`
- `main: '<projectRoot>/src/main.ts'`
- `tsConfig: '<projectRoot>/tsconfig.app.json'`
- `outputHashing: 'none'`

This lets the existing `webpack-cli build` command load a local config and compile the correct Nest entry file instead of falling back to webpack's default `./src/index` lookup.

## Verification

Run:

```bash
yarn nx run-many -t build -p api,auth,upload,notes,ai --skip-nx-cache
```

The fix should remove the `Can't resolve './src'` failures for all affected services.
