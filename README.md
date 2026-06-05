# sec

> Scaffolded with [iCore](https://github.com/iDEVconn/create-icore) — Nx + NestJS + React full-stack template.

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx + yarn |
| Gateway | NestJS 11 + Swagger |
| Auth | supabase |
| Database | supabase |
| Upload | supabase |
| UI | shadcn/ui + Tailwind + TanStack Router + Query |
| i18n | i18next (en / ru / he) |

## Quick start

```bash
# 1. Fill in provider credentials
#    apps/microservices/auth/.env
#    apps/microservices/upload/.env  (if upload is enabled)
#    apps/client/.env               (VITE_API_URL — already defaults to /api)

# 2. Start everything
yarn dev
# → http://localhost:4200        client
# → http://localhost:3001/api/docs  Swagger
```

## Commands

```bash
yarn nx run <project>:serve   # start a single service
yarn nx test <project>         # unit tests
yarn nx lint <project>         # lint
yarn nx build <project>        # production build
yarn remove-notes                  # strip the notes sample feature
```

## Scaffolded by

[iCore](https://github.com/iDEVconn/create-icore) — [@idevconn/create-icore](https://www.npmjs.com/package/@idevconn/create-icore)

## License

Apache-2.0
