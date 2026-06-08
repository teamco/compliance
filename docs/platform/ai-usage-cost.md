# AI Usage — Estimated Cost Calculation

## Overview

**Estimated Cost** on the Admin → AI Usage page shows real-time spend in USD.
Calculation runs server-side in `admin-ai-usage.controller.ts` — no external
API calls, pure arithmetic on recorded token counts.

## How it works

### Data flow

```
DB (ai_usage_logs)
  → notes MS aggregates by operation
  → getAiUsageSummary(since, userId?)   ← filtered here
  → AdminAiUsageController.mapSummary()
  → computeCostUsd(by_operation)
  → { total_cost_usd }
  → client StatCard "Estimated Cost"
```

Filtering by user happens at the notes MS / DB level. The controller receives
already-scoped `by_operation` data, so cost is correct for both views:

- **All users** — no `userId` param → aggregates entire org
- **Per user** — `userId` param → aggregates only that user's operations

### Pricing table

| Operation | Model | Input $/1M tokens | Output $/1M tokens |
|---|---|---:|---:|
| `chat` | claude-sonnet-4-6 | $3.00 | $15.00 |
| `gap.analyze` | claude-sonnet-4-6 | $3.00 | $15.00 |
| `standards.generate` | claude-opus-4-8 | $5.00 | $25.00 |

Prices sourced from Anthropic API docs (verified 2026-06).

### Formula

```
cost = Σ over operations:
  (input_tokens  / 1_000_000) × input_price
+ (output_tokens / 1_000_000) × output_price
```

Unknown operations (not in the pricing table) contribute $0 and are skipped.

## Updating prices

Edit `MODEL_PRICING` in:

```
apps/api/src/app/admin/admin-ai-usage.controller.ts
```

When Anthropic changes pricing or a new operation/model is added to the system,
update the relevant entry. Mapping is `operation name → { input, output }` in
dollars per million tokens.

## Limitations

- Cost is approximated from operation-level token aggregates — no per-request
  breakdown
- Cache read tokens (prompt caching) are not separated; they're billed at
  ~10% of input price but recorded as regular `input_tokens` in the current
  schema — so actual cost may be slightly lower than displayed
- Per-user cost in the **By User** table is not shown (requires operation
  breakdown per user at DB level)
