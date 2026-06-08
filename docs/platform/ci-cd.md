# CI / CD Pipeline

GitHub Actions pipeline adapted from the team's `warranty` repo, trimmed to what
this repo needs today (no VPS deploy, no Docker/GHCR push yet).

## Workflows

| File                                     | Trigger                         | Purpose                                          |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `.github/workflows/pipeline.yml`         | push/PR to `main`,`dev`; manual | CI + (main only) Supabase migrate + release      |
| `.github/workflows/sync-main-to-dev.yml` | push to `main`; manual          | open a PR syncing the release bump back to `dev` |

Composite actions: `.github/actions/setup` (Node 22 + Corepack/Yarn 4 + cached
immutable install), `.github/actions/bump` (semver bump from conventional
commits → commit + tag + changelog).

## Pipeline jobs

```
detect-affected ─┬─ check  (matrix: lint · test · format:check)  ← all projects incl. client
                 └─ build  (matrix: api · auth · upload · notes · ai)  ← client has no build target
                        └─ required-checks   (aggregate signal for branch protection)

main only (push):
  build → db-migrate   (supabase db push)
  build → release      (bump + tag + GH Release → dispatch sync-main-to-dev)
```

- **check** runs `yarn lint` / `yarn test` / `yarn format:check` (Nx run-many,
  covers the client too).
- **build** is per-app and gated on Nx affected — unaffected apps skip.
- **client** intentionally only goes through lint/test/format — it has no Nx
  `build` target.
- **required-checks** is the single status to mark required in branch rulesets;
  it stays green when affected jobs skip.

## Required secrets

Set under repo → Settings → Secrets and variables → Actions.

| Secret                  | Used by    | Notes                                                                                                       |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | db-migrate | Supabase personal access token                                                                              |
| `SUPABASE_DB_PASSWORD`  | db-migrate | database password                                                                                           |
| `SUPABASE_PROJECT_REF`  | db-migrate | project ref (`yfnzcydahthhrdxnqjpk`)                                                                        |
| `REPO_ACCESS_TOKEN`     | release    | optional PAT; falls back to `GITHUB_TOKEN`. Needed if `main` branch protection blocks `GITHUB_TOKEN` pushes |

CI jobs (check/build) need no secrets.

## Release flow

On push to `main`, `release` bumps the root `package.json` version (major/minor/
patch inferred from conventional commits since the last tag), commits with
`[skip ci]`, tags `vX.Y.Z`, publishes a GitHub Release, then dispatches
`sync-main-to-dev` to open a PR carrying the bump back into `dev`.

## Not yet included

Docker image build/push (GHCR) and VPS deploy from the reference pipeline are
omitted — no deploy target exists yet. Dockerfiles (`Dockerfile.gateway`,
`Dockerfile.ms-*`) and `docker-compose.yml` are present for local use and a
future deploy stage.
