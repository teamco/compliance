# AI Assistant — Capabilities, Limits & Architecture

## Overview

The platform embeds three distinct AI operations, all powered by Anthropic Claude via a dedicated AI microservice. They share one SDK but serve very different use-cases and are routed to different models based on quality vs. latency requirements.

---

## Operations

### 1. Compliance Copilot (`ai.chat`)

**What it is:** A persistent chat panel (bottom-right button) available on every page in the dashboard.

**What it can do:**

- Answer GRC questions in natural language (frameworks, control implementation, audit prep)
- Give context-aware advice — the current page URL is injected as `pageContext`, so it knows whether you're on the standards page, gap analysis, controls, etc.
- Draft and explain compliance controls, policies, procedures
- Rewrite existing text (simplify language, translate for auditors, adapt for an industry)
- Compare frameworks ("how does SOC 2 CC6.1 map to ISO 27001 A.9.1?")
- Suggest evidence artifacts for a given control
- Maintain conversation history across sessions (stored in DB, loaded on first open)

**What it cannot do:**

- Read actual documents or controls from your standards — it has no access to the DB; it only knows the page URL, not the page data
- Execute actions (create standards, approve workflow, etc.) — it's read-only advisory
- Access the internet or retrieve real-time regulatory updates
- Give legally binding compliance advice

**Why these limits:** The chat endpoint only receives `messages[]` + `ChatContext` (`orgId`, `frameworkId`, `pageContext`). It does not receive control content, document text, or org details. Expanding context would require explicit RAG integration (not yet built).

---

### 2. Standards Generator (`ai.standards.generate`)

**What it is:** Generates a full set of tailored compliance controls for an org's selected frameworks. Triggered from the Standards page, runs async via pg-boss queue.

**What it can do:**

- Generate per-framework control sets customized to the org's industry, size, and regions
- Produce controls with `title`, `description`, and `implementationGuidance`
- Handle multiple frameworks in one call (returns one result per framework)
- Supports all frameworks in the library (SOC 2, ISO 27001, NIST, CIS, GDPR, HIPAA, PCI DSS, etc.)

**What it cannot do:**

- Generate evidence templates or acceptance criteria (out of prompt scope)
- Incorporate custom org-specific policies already in the system — it only uses the org profile fields (name, industry, size, regions), not existing documents
- Guarantee exact control IDs matching framework spec — control codes (`id`) are AI-generated labels, not official framework identifiers

**Why these limits:** The prompt sends only the org profile (5 fields). Injecting existing controls or documents would push tokens toward the 16 k output limit and increase cost significantly. Official control ID mapping is a separate framework seed-data concern.

---

### 3. Gap Analyzer (`ai.gap.analyze`)

**What it is:** Given a list of controls and per-control compliance findings (compliant / partial / non-compliant + optional evidence), produces a risk report.

**What it can do:**

- Produce an overall risk score (0–100)
- Identify critical gaps ranked by severity (critical / high / medium / low)
- Generate prioritized remediation recommendations with effort estimate (low / medium / high)
- Write an executive summary paragraph

**What it cannot do:**

- Analyze more than 50 controls in a single call — the prompt truncates at index 50 to stay within token budget
- Access evidence files or linked tickets — only the text field from the finding is used
- Detect false-positive findings (it trusts the status the user entered)

**Why these limits:** Gap analysis uses `thinking: { type: 'adaptive' }` which consumes additional tokens for the reasoning trace. Sending all controls for large frameworks (200+ controls) would exceed practical limits. A chunked / summarized approach is a future improvement.

---

## Model Distribution

| Operation               | Model               | Reason                                                                                                   |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `ai.chat`               | `claude-sonnet-4-6` | Low latency matters for conversational UX; response streams word-by-word                                 |
| `ai.standards.generate` | `claude-opus-4-8`   | Quality-critical batch job; slow is acceptable (async queue), needs deep GRC knowledge                   |
| `ai.gap.analyze`        | `claude-sonnet-4-6` | Uses `thinking: adaptive` for reasoning; Sonnet handles the analytical task well at lower cost than Opus |

---

## Architecture

```
Browser
  │
  │  POST /api/ai/chat          SSE stream
  │  POST /api/notes/standards/generate  → { docId }  (async)
  │  POST /api/ai/gap/analyze   JSON response
  ▼
Gateway (NestJS :3001)
  ├── AiController          → TCP → AI MS
  │     chat()              SSE chunking loop (8 ms / word)
  │     analyzeGap()        long-poll, returns when AI MS responds
  │
  ├── NotesController
  │     generateStandards() → enqueues pg-boss job → returns { docId }
  │
  └── StandardsQueueService  (pg-boss worker, runs inside gateway process)
        process()           → TCP → AI MS (generateStandards)
                            → TCP → Notes MS (saveStandardsDocument / failStandardsDocument)
  │
  │  TCP (configurable: tcp / nats / mqtt / rmq / kafka)
  ▼
AI MS (NestJS :4005 TCP)
  AiController
    ai.chat               → AnthropicAiStrategy.chat()
    ai.standards.generate → AnthropicAiStrategy.generateStandards()
    ai.gap.analyze        → AnthropicAiStrategy.analyzeGap()
  │
  ▼
Anthropic API (claude-sonnet-4-6 / claude-opus-4-8)
```

### Chat SSE flow

NestJS TCP transport cannot stream natively. The AI MS accumulates the full Anthropic stream via `messages.stream().finalText()` and returns one `ChatResult` object over TCP. The gateway splits the text by spaces and re-emits each word as `data: {"token": "…"}\n\n` with an 8 ms delay. The browser reads the SSE stream and appends tokens in real time, creating the typewriter effect.

```
AI MS → TCP → Gateway → SSE → Browser
  (one bulk response)    (word-by-word, 8 ms gap)
```

### Standards generation async flow

```
Browser          Gateway              pg-boss (PostgreSQL)     Notes MS       AI MS
   │  POST /generate  │                      │                    │              │
   │ ─────────────►  │  enqueue job          │                    │              │
   │                  │ ──────────────────►  │                    │              │
   │  { docId }       │                      │                    │              │
   │ ◄─────────────  │                      │                    │              │
   │                  │                      │                    │              │
   │  poll GET /standards?orgId=…           │                    │              │
   │  (every 5 s while any doc is pending)  │                    │              │
   │                  │  pick up job         │                    │              │
   │                  │ ◄──────────────────  │                    │              │
   │                  │  ai.standards.generate                    │              │
   │                  │ ──────────────────────────────────────────────────────► │
   │                  │                      │                    │  result       │
   │                  │ ◄─────────────────────────────────────────────────────  │
   │                  │  notes.standards.save                     │              │
   │                  │ ──────────────────────────────────────►  │              │
   │  poll returns status=completed         │                    │              │
```

If the AI call fails, the worker calls `notes.standards.fail` which sets `status: 'failed'` on the document. The browser poll shows a failed state card.

---

## Token Budget & Cost

| Operation                         | Input tokens (approx) | Output tokens (approx) | Model  | Cost tier |
| --------------------------------- | --------------------- | ---------------------- | ------ | --------- |
| chat (single turn)                | 500–2 000             | 200–4 096              | Sonnet | low       |
| standards.generate (3 frameworks) | 1 000–2 000           | 4 000–16 000           | Opus   | high      |
| gap.analyze (50 controls)         | 3 000–6 000           | 1 000–8 192            | Sonnet | medium    |

All usage is logged to `ai_usage_log` and visible in Admin → AI Usage. Per-user, per-operation, and per-day breakdowns are available.

---

## Strategy Pattern

The AI MS never imports Anthropic directly in app code. It injects `AiStrategy` via the `AiStrategy` DI token. The factory reads `AI_PROVIDER` from env and instantiates `AnthropicAiStrategy`. In tests and dev without an API key, `FakeAiStrategy` (from `@icore/shared`) is used — deterministic, no API calls.

```
AI_PROVIDER=anthropic  →  AnthropicAiStrategy  →  @anthropic-ai/sdk
AI_PROVIDER=fake       →  FakeAiStrategy        →  in-memory deterministic
```

To swap providers (e.g. OpenAI, Azure OpenAI), implement `AiStrategy` interface, register in the factory, set `AI_PROVIDER`.

---

## Limitations Summary

| Limit                         | Root cause                          | Future fix                                               |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------- |
| Copilot can't read page data  | No RAG / context injection          | Vector embeddings + retrieval                            |
| Copilot can't execute actions | Read-only design intent             | Tool-calling / function-calling mode                     |
| Standards: org profile only   | Prompt keeps tokens low             | Inject existing controls as context                      |
| Gap: max 50 controls          | Token budget with adaptive thinking | Chunked analysis + merge                                 |
| No streaming from AI MS       | NestJS TCP is request/response only | Switch AI MS transport to HTTP/gRPC for native streaming |
