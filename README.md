# Cyber Governance & Compliance Intelligence Platform

Enterprise GRC platform — AI-driven compliance standards generation, gap analysis, and security posture scoring.

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx + yarn |
| Gateway | NestJS 11 + Swagger |
| Auth | Supabase |
| Database | Supabase |
| Upload | Supabase |
| AI | Anthropic (claude-opus-4-8 / claude-sonnet-4-6) |
| UI | shadcn/ui + Tailwind + TanStack Router + Query |
| Transport | TCP (swappable: NATS / RMQ / Kafka) |
| i18n | i18next (en / ru / he) |

## Architecture

```
apps/
├── api/                  NestJS gateway (:3001)
├── microservices/
│   ├── auth/             Auth MS (:4001)
│   ├── upload/           Upload MS (:4002)
│   └── ai/               AI MS — chat, standards, gap analysis (:4005)
└── client/               Vite + React 19 + shadcn (:4200)
libs/
├── shared/               Contracts, CASL, transport helpers
├── ai-strategies/anthropic/
├── auth-strategies/supabase/
├── storage-strategies/supabase/
├── ai-client/
├── auth-client/
├── upload-client/
└── template-shared/      Browser-safe React foundation
```

## Quick start

```bash
# 1. Fill in credentials
#    apps/microservices/auth/.env    — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#    apps/microservices/upload/.env  — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#    apps/microservices/ai/.env      — ANTHROPIC_API_KEY

# 2. Start everything
yarn dev
# → http://localhost:4200            client
# → http://localhost:3001/api/docs   Swagger
```

## Commands

```bash
yarn nx run api:serve           # gateway only
yarn nx run ai:serve            # AI MS only
yarn nx test <project>          # unit tests
yarn nx lint <project>          # lint
yarn nx build <project>         # production build
```

## License

Apache-2.0
