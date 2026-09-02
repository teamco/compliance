# Platform Roadmap — Sequenced Phases (Approved)

Strategy: build in strict dependency order. Each phase ships a usable increment. ESPM added only after core GRC is validated.

## Phase 1 — "Wow" Demo (weeks 1–4)

**Modules 1, 2, 3, 4**

| Module | Feature                      | Notes                                                                                     |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| 1      | Framework Library            | Seed SOC 2, ISO 27001, NIST CSF, GDPR — stored in Supabase                                |
| 2      | Universal Control Library    | Control → multi-framework mapping table                                                   |
| 3      | Organization Profile Builder | Multi-step wizard: industry, size, stack, regulations                                     |
| 4      | AI Standards Generator       | `claude-opus-4-8` — org profile + frameworks → generated controls JSON → stored standards |

**Deliverable:** User fills out org profile, clicks Generate, gets a full set of organization-specific standards mapped to selected frameworks.

---

## Phase 2 — Full GRC Loop (weeks 5–8)

**Modules 5, 6, 7, 8**

| Module | Feature                        | Notes                                                    |
| ------ | ------------------------------ | -------------------------------------------------------- |
| 5      | Standards Customization Studio | Rich text editor, dynamic variables, version history     |
| 6      | Compliance Mapping Engine      | Standard → framework control mapping view                |
| 7      | Gap Analysis Engine            | Coverage score per framework, missing standard detection |
| 8      | AI Compliance Copilot          | Uses existing AI MS (`claude-sonnet-4-6`, SSE streaming) |

**Deliverable:** End-to-end loop — generate → customize → map → identify gaps → ask the copilot.

---

## Phase 3 — Enterprise-Ready (weeks 9–12)

**Modules 9, 10, 11, 12**

| Module | Feature                        | Notes                                                   |
| ------ | ------------------------------ | ------------------------------------------------------- |
| 9      | Approval & Governance Workflow | CASL roles: Contributor / Reviewer / Approver / Auditor |
| 10     | Version Management             | Immutable snapshots on approval, side-by-side diff      |
| 11     | Framework Update Intelligence  | Detect framework changes, flag affected standards       |
| 12     | Executive Dashboard            | KPI gauge, coverage breakdown, risk areas               |

**Deliverable:** Multi-user org, workflow-gated publishing, audit-ready traceability.

---

## Phase 4 — Cyber Reality Layer (weeks 13–20)

**Modules 13–20 (ESPM)**

| Module | Feature                                |
| ------ | -------------------------------------- |
| 13     | Digital Footprint Discovery Engine     |
| 14     | External Attack Surface Management     |
| 15     | Security Rating Engine (0–1000)        |
| 16     | Compliance-Aware Security Scoring™     |
| 17     | Compliance Reality Engine™             |
| 18     | Vendor & Third-Party Risk Intelligence |
| 19     | Threat Intelligence Correlation        |
| 20     | Continuous Compliance Validation™      |

**Deliverable:** Closed loop — `Standards → Reality → Gap → Remediation`.
Requires separate `scan` microservice for passive DNS / cert transparency / port scanning.

---

## Key Architectural Decisions (from existing codebase)

| Concern                     | Decision                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| AI — standards generation   | `claude-opus-4-8`, batch, long-poll                                         |
| AI — copilot + gap analysis | `claude-sonnet-4-6`, SSE stream at gateway                                  |
| Data storage                | Supabase (PostgreSQL + RLS per org)                                         |
| Auth                        | Supabase implicit OAuth + JWT roles                                         |
| Transport                   | NestJS TCP microservices                                                    |
| Roles                       | CASL — `admin` / `user` now; `reviewer` / `approver` / `auditor` in Phase 3 |
