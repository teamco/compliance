# Vendors — New Vendor Form Rework — Design Spec

**Branch:** `feature/vendors-form-fields`
**Date:** 2026-08-03

---

## Problem

The "Add Vendor" dialog (`apps/client/src/routes/_dashboard/vendors.tsx`) has no way to record which internal person owns the relationship/contract with a vendor — a standard field for vendor-risk tracking.

---

## Scope

- Add "Vendor Contract Owner" field to the Add Vendor dialog: searchable dropdown of org members.
- Reorder existing fields: Vendor Name, Web Domain, Vendor Contract Owner (new), Vendor Criticality (existing `tier` field, moved from 3rd to 4th position — no change to its values/behavior otherwise).
- Extend `Vendor`/`VendorInput` with `contractOwnerId`.
- New migration: `contract_owner_id` column on `vendors`.
- Reuse existing infrastructure: `useOrgMembers` hook and `Combobox` component (built for Exceptions, reused for Issues) — no new backend capability.

Out of scope: any change to vendor scanning, scoring, or the vendor detail page.

---

## Field order (final)

| # | Field | Widget | Source |
|---|---|---|---|
| 1 | Vendor Name | `Input` | manual (existing) |
| 2 | Web Domain | `Input` | manual (existing, unchanged) |
| 3 | Vendor Contract Owner | searchable `Combobox` | **new**, `useOrgMembers(orgId)`, required |
| 4 | Vendor Criticality | shadcn `Select` | manual (existing `tier` field, moved from position 3 to 4) |

---

## Data model (`libs/shared/src/strategies/vendor-risk.ts`)

```typescript
export interface Vendor {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  tags: string[];
  tier: VendorTier;
  contractOwnerId: string | null;   // new — nullable DB column, no backfill for existing rows
  rescanIntervalDays: number;
  alertThreshold: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VendorInput = Omit<
  Vendor,
  'id' | 'orgId' | 'lastScannedAt' | 'createdAt' | 'updatedAt' | 'contractOwnerId'
> & {
  contractOwnerId: string; // required on create/update input
};
```

(`VendorInput` is derived via `Omit` in the current code, not written out field-by-field — the new type keeps that shape but overrides `contractOwnerId` back to required, since `Omit` would otherwise inherit the nullable type from `Vendor`.)

No new `NotesStrategy`/`AuthStrategy`/`VendorRiskStrategy` methods — this reuses the `useOrgMembers(orgId)` → `listOrgMembers` chain already built and hardened for Exceptions/Issues. `VendorRiskStrategy` itself is unrelated (it only covers the `scan()` operation) — vendor CRUD lives directly in `VendorRiskService` (`apps/microservices/vendor-risk/src/app/vendor-risk.service.ts`), a plain Supabase-backed service with no Fake/strategy-swap layer.

---

## Backend

- **Migration**: `alter table public.vendors add column contract_owner_id uuid references auth.users(id);` — nullable, same pattern as `issues.reporter_id`/`owner_id`.
- **`VendorRiskService`**: `createVendor`'s `.insert({...})` gets `contract_owner_id: input.contractOwnerId`; `updateVendor`'s guarded-update object gets `if (patch.contractOwnerId !== undefined) update['contract_owner_id'] = patch.contractOwnerId;`; `mapVendor` gets `contractOwnerId: row['contract_owner_id'] as string | null`.
- **Gateway/MS**: no changes — `createVendor`/`updateVendor` are already generic `VendorInput`/`Partial<VendorInput>` pass-throughs at the controller, client-service, and message-pattern layers (verified: no per-field destructuring exists at any of those layers today, same as Issues).

---

## Client

- `apps/client/src/routes/_dashboard/vendors.tsx`: `AddVendorDialog` gains `useOrgMembers(orgId)` + one `Combobox`, inserted between the Domain `Input` and the existing Criticality `Select`. Submit validation (`validate()`) adds a `contractOwnerId` required check alongside the existing name/domain checks.
- i18n: new keys `vendors.contractOwner`, `vendors.selectContractOwner`, `vendors.searchMembers`, `vendors.contractOwnerRequired` across `en/ru/he/es`.

---

## Testing

- Unit test (Vitest): extend or add a component test for `AddVendorDialog` verifying the 4 fields render in order and submit is blocked without a Contract Owner selected (mirrors the Issues/Exceptions form test pattern).
- No Supabase-strategy or MS-layer test needed (integration-only, no new capability — same reasoning as Issues).

---

## Risks / open items

- None significant — same infrastructure already reviewed twice. The `Vendor.contractOwnerId: string | null` vs `VendorInput.contractOwnerId: string` split is applied from the start this time (learned from the Issues final review, which had to fix this after the fact for `Issue.reporterId`/`ownerId`).
