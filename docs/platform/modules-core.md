# Core GRC Modules (1–13)

## Module 1: Framework Library

Central repository of compliance frameworks.

**Supported frameworks:** SOC 2 Type 2, ISO 27001, ISO 27002, NIST CSF, NIST 800-53, NIST 800-171, CIS Controls, GDPR, HIPAA, PCI DSS, CMMC, COBIT, FedRAMP, Custom Frameworks

**Structure:**

```
Framework
  └── Domain
        └── Control Family
              └── Control
                    └── Requirement
                          └── Implementation Guidance
```

---

## Module 2: Universal Control Library

The heart of the platform. One control maps to multiple frameworks.

**Example — "Multi-Factor Authentication":**

- ISO 27001
- SOC 2
- NIST
- CIS
- HIPAA

**Benefit:** Eliminates duplicate work. MFA implemented once satisfies all 5 framework requirements simultaneously.

---

## Module 3: Organization Profile Builder

Collects organization context during onboarding:

**Company Information:** Industry, Geography, Employee count, Cloud providers, Business model, Customer types

**Technology Stack:** Microsoft 365, Google Workspace, AWS, Azure, GCP, Okta, CrowdStrike, Jira, ServiceNow

**Regulatory Scope:** GDPR, HIPAA, SOC 2, ISO, PCI DSS

Platform generates standards based on the actual environment.

---

## Module 4: AI Standards Generator ⭐ Flagship

Input: Organization profile + selected frameworks + maturity level + business model

**Output categories:**

| Category             | Example Standards                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Information Security | Access Control, Password, Asset Management, Vulnerability Mgmt, Logging, Encryption, Secure Dev, Backup |
| IT                   | Endpoint Mgmt, Patch Mgmt, Change Mgmt, Infrastructure                                                  |
| Privacy              | Data Retention, Data Classification, Data Handling                                                      |
| Governance           | Risk Management, Vendor Management, Third-Party Risk                                                    |

---

## Module 5: Standards Customization Studio

Visual editor (like Notion + Confluence + Word combined).

**Features:** Drag-and-drop sections, Rich text editing, Version history, Approval workflow, Comments, Change tracking

**Dynamic Variables:**

```
{{Company_Name}}  {{MFA_Tool}}  {{Password_Length}}  {{Log_Retention}}
```

Standards update automatically when variables change.

---

## Module 6: Compliance Mapping Engine

**Most valuable enterprise feature.**

Example — Access Control Standard maps to:

| Framework | Controls       |
| --------- | -------------- |
| SOC 2     | CC6.1, CC6.2   |
| ISO       | A.5.15, A.5.16 |
| NIST      | AC-2, AC-3     |
| GDPR      | Article 32     |

Auditors can instantly trace: `Requirement → Standard → Procedure → Evidence`

---

## Module 7: Gap Analysis Engine

Continuously identifies gaps between current implementation and compliance requirements.

**UI — two tabs:**

- **New Analysis** — select a completed standards document, set status (compliant / partial / non-compliant) and optional evidence for each control, then run AI gap analysis
- **History** — grid of past runs (container-query responsive, 1→2→3 cols). Each card shows an SVG risk-score gauge and run timestamp. Date-range filter pills: All / Today / 7d / 30d / 90d / 90+

**Detail page (`/gap-analysis/:id`):** risk score gauge, executive summary, critical gaps list, recommendations, full findings breakdown.

After analysis completes the app navigates directly to the detail page.

**Coverage Score example:**

```
SOC 2 Coverage:  86%
ISO Coverage:    72%
GDPR Coverage:   91%
```

---

## Module 8: AI Compliance Copilot

Built into every page.

**Example prompts:**

- Generate an Encryption Standard
- Rewrite for healthcare industry
- Simplify language
- Add NIST mappings
- Create auditor-friendly version
- Create executive summary
- "Show all controls affected if we remove MFA"

---

## Module 9: Approval & Governance Workflow

**Roles:** Contributor → Reviewer → Approver → Auditor (read-only) → Compliance Manager (full)

**Workflow:** `Draft → In Review → Approved → Published`

**Transitions (stored in audit log):**

| Transition | From      | To        | Who      |
| ---------- | --------- | --------- | -------- |
| `submit`   | draft     | in_review | any user |
| `approve`  | in_review | approved  | admin    |
| `reject`   | in_review | draft     | admin    |
| `publish`  | approved  | published | admin    |

The standards detail page (`/standards/:id`) shows a stepper with per-step descriptions and a Submit / Approve / Publish button aligned to the right.

---

## Module 10: Version Management

Every version stored. Side-by-side comparison.

Tracks: What changed / Why / Who approved

---

## Module 11: Framework Update Intelligence

When a framework releases new guidance:

1. Platform detects changes automatically
2. Identifies affected standards
3. Suggests updates

---

## Module 12: Executive Dashboard

| Metric        | Example                                    |
| ------------- | ------------------------------------------ |
| Overall Score | 87%                                        |
| SOC 2         | 92%                                        |
| ISO 27001     | 84%                                        |
| GDPR          | 90%                                        |
| Standards     | Published / Draft / Missing / Under Review |
| Risk Areas    | Highlighted automatically                  |

## Module 13: Report Export

Export gap analysis reports and standards documents as **PDF / CSV / JSON**.
PDF layout is driven by DB-backed, admin-managed **report templates** (branding,
accent color, section toggles) that can be favorited per organization.

See [report-export.md](./report-export.md).
