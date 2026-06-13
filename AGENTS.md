# sec — Agent Instructions

## Stack snapshot

| Dimension | Choice    |
| --------- | --------- |
| Auth      | supabase  |
| Database  | supabase  |
| Upload    | supabase  |
| AI        | anthropic |
| Payment   | none      |
| Jobs      | none      |
| UI        | shadcn    |
| Transport | tcp       |
| PM        | yarn      |

## 🚀 Mandatory Workflow

- **Branch strategy**: `dev` is default. Cut `feature/<name>` or `bug/<name>` from dev. PRs only target dev. Never push directly to main.
- **Check PR before push**: Run `gh pr list --state open --head $(git branch --show-current)` before every `git push`. If PR is merged/closed — stop, create new branch + PR.
- **No code without approval**: Propose changes first, wait for go-ahead.
- **RULE — no crash on missing .env**: MS factories must catch config errors, print a boxed banner with ALL missing vars, and return a Fake strategy in dev. In prod (`NODE_ENV=production`) throw the same banner. The `formatEnvBanner` + `missingEnv` helpers from `@icore/shared` handle this.
- **Post-coding routine**: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green before committing.
- **Nx generators only**: never hand-write `project.json` / tsconfig stacks. Use `yarn nx g @nx/<plugin>:<schematic>`.

## 🚨 UI Work Rules (non-negotiable)

- **Playwright before "done"**: Any UI change MUST be verified in browser via Playwright MCP before reporting complete. No exceptions. "I read the code and it looks correct" is not verification.
- **Propose architecture first**: For any non-trivial decision (routing, state shape, error flow) — write 2-3 sentence proposal + tradeoffs, wait for approval. Never pick the first idea and implement it silently.
- **No self-report without proof**: Never say "verified", "tested", "checked" without attaching Playwright screenshot or server log as evidence.

## Architecture

```
apps/
├── api/               NestJS gateway — all client traffic enters here (:3001)
├── microservices/
│   ├── auth/
│   ├── upload/
│   └── ai/            AI copilot + standards generation + gap analysis (:4003)
└── client/            Vite + React 19 + shadcn (:4200)
libs/
├── shared/            contracts, CASL, transport helpers, env banner utils
├── auth-strategies/supabase/
├── storage-strategies/supabase/
├── db-strategies/supabase/
├── ai-strategies/anthropic/   AnthropicAiStrategy (@anthropic-ai/sdk)
├── auth-client/       gateway → auth MS (TCP/NATS/…)
├── upload-client/     gateway → upload MS
├── ai-client/         gateway → AI MS
└── template-shared/   browser-safe React foundation (stores, i18n, CASL)
```

## Key patterns

**Strategy swap** — provider is chosen at runtime via env. Never import a concrete strategy in app code; always inject via the factory token (`AuthStrategy`, `StorageStrategy`, `DBStrategy`, `AiStrategy`).

**Transport** — `buildTransport(prefix)` reads `TCP*` vars. Same helper on gateway client-modules and each MS `main.ts`. Supports tcp / nats / mqtt / rmq / kafka — change by flipping `*_TRANSPORT` in `.env`.

**Env layering**:

1. Root `.env` — `DB_PROVIDER`
2. `apps/api/.env` — gateway transport endpoints
3. `apps/microservices/<name>/.env` — each MS provider + transport
4. `apps/client/.env` — `VITE_API_URL`

## Commands

```bash
yarn dev                     # start all services
yarn nx run api:serve           # gateway only
yarn nx run auth:serve          # auth MS only
yarn nx run ai:serve            # AI MS only (:4003 TCP / :9232 inspect)
yarn nx test <project>          # run tests
yarn nx lint <project>          # lint
yarn nx build <project>         # build
yarn nx g @nx/nest:resource     # generate NestJS resource
```

## .env files to configure

| File                             | Key vars                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/microservices/auth/.env`   | `AUTH_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                       |
| `apps/microservices/upload/.env` | `STORAGE_PROVIDER=supabase`, provider creds                                                 |
| `apps/microservices/notes/.env`  | `DB_PROVIDER=supabase`, DB creds                                                            |
| `apps/microservices/ai/.env`     | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_TRANSPORT=tcp`, `AI_HOST`, `AI_PORT=4005` |
| `apps/client/.env`               | `VITE_API_URL=/api` (proxied to :3001 in dev)                                               |

## AI

| Dimension      | Choice                      |
| -------------- | --------------------------- |
| Provider       | Anthropic                   |
| SDK            | `@anthropic-ai/sdk`         |
| Strategy token | `AiStrategy`                |
| MS port        | 4005 (TCP) / 9232 (inspect) |

**Models**:

- `claude-opus-4-8` — `generateStandards` (batch, quality-critical)
- `claude-sonnet-4-6` — `chat` (copilot, low-latency) + `analyzeGap` (with `thinking: {type:'adaptive'}`)

**Streaming pattern**: NestJS TCP transport does not support native SSE. The AI MS accumulates the full Anthropic stream via `messages.stream().finalText()` and returns a `ChatResult` (text + token counts) over TCP. The gateway's `POST /api/ai/chat` endpoint chunks the text word-by-word with 8 ms delay and emits `data: {token}` SSE events — browser gets typewriter UX without modifying the MS transport.

**Operations**:

- `ai.chat` — interactive copilot (`claude-sonnet-4-6`, SSE at gateway)
- `ai.standards.generate` — org profile → controls JSON (`claude-opus-4-8`, long-poll)
- `ai.gap.analyze` — controls + findings → gap report (`claude-sonnet-4-6`, adaptive thinking)

**FakeAiStrategy** in `@icore/shared` — deterministic in-memory test double, no API calls.

## Testing

- Unit tests: Vitest, files named `*.unit.test.ts(x)` in `__tests__/` next to source.
- Test behaviour, not implementation. Fake strategies from `@icore/shared` (FakeAuthStrategy, FakeAiStrategy etc.) serve as test doubles.
- Run: `yarn nx test <project>`

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
