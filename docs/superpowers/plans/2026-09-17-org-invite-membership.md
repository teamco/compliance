# Org Invite / Membership System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a second real user join an existing org via an email-invite-link flow with owner/admin/viewer roles, and make CASL's `checkOrgAccess` actually recognize membership (today it's keyed purely on org creator, which is the real reason every self-approval-guarded workflow this session is unusable in a multi-person org).

**Architecture:** New `organization_invites` table + `AuthStrategy` methods (both Fake and Supabase) for the invite lifecycle; `checkOrgAccess` becomes `async` and role-aware (owner/admin/viewer via `organization_members`, with the existing platform-admin CASL bypass preserved); new gateway routes under `apps/api/src/app/auth/auth.controller.ts` (membership is an auth-domain concept, matching the existing `GET auth/org/members` route, not `notes.controller.ts`); new client "Members" section in org settings plus a public `/accept-invite` page.

**Tech Stack:** NestJS gateway + auth microservice (TCP transport), Vitest, Supabase (service-role key — RLS is not the enforcement layer, confirmed during research), React Query + Zustand + TanStack Router on the client.

**Spec:** `docs/superpowers/specs/2026-09-17-org-invite-membership-design.md`

## Global Constraints

- **Preserve the platform-admin CASL bypass.** `AbilityFactory.forUser` grants `VerifiedToken.role === 'admin'` (a platform-level superadmin, distinct from org-membership role) `can('manage', 'all')`. Every rewritten authorization check must short-circuit `true` for this case before any membership lookup — dropping it silently regresses platform admins.
- **`checkOrgAccess` is duplicated — both copies get the same rewrite.** One in `apps/api/src/app/notes/notes.controller.ts` (126 call sites, all confirmed already inside `async` methods), one in `apps/api/src/app/auth/auth.controller.ts` (1 call site). Missing the second leaves `GET auth/org/members` on the old creator-only check.
- **Role mapping:** owner (org creator) — full access everywhere, including org deletion and member/invite management. admin — full read/update/delete on org resources via `checkOrgAccess`, but NOT org deletion or member/invite management (owner-only, via a separate `checkOrgOwner` helper). viewer — read-only via `checkOrgAccess`, forbidden from member/invite management. Non-member — forbidden everywhere, same as today.
- **`listOrgMembers` gets a real bug fix, not just a new caller.** Widen to `listOrgMembers(orgId: string, ownerId?: string): Promise<OrgMember[]>` in both `FakeAuthStrategy` and `SupabaseAuthStrategy` — today Supabase unions in the creator via a SQL join and Fake doesn't (Fake has no `Organization` awareness, that's `FakeNotesStrategy`'s domain). Both strategies apply the identical trivial "prepend `ownerId` with role `'owner'` if not already present and `ownerId` is set" logic themselves.
- **Invited role is never `'owner'`** — `OrgInviteRole = 'admin' | 'viewer'`. Ownership stays a creator-only concept.
- **Email match is required to accept an invite** — `acceptOrgInvite` compares the authenticated caller's email (case-insensitive) against the invite's email; mismatch is a hard rejection (`invite_email_mismatch`), not a warning. Prevents a leaked/forwarded invite link being redeemed by the wrong account.
- **`OrgSwitcher`'s platform-admin gate must be removed** — `apps/client/src/components/org/OrgSwitcher.tsx:33`'s `if (!isAdmin) return null;` hides the entire component from everyone except platform superadmins today, including every regular org owner. Without removing it, a successfully-invited member still has no UI to switch into the org they joined.
- **No new email vendor.** Reuse the existing, already-working Supabase email delivery (the `signInWithOtp` + `emailRedirectTo` pattern `sendMagicLink` already uses) for delivery; invite-specific content (org name, role, inviter) renders on the app's own `/accept-invite` page, not in the email body, since Supabase Auth only sends its own fixed-template emails.
- **The invite-preview route is `@Public()`.** `GET auth/org-invites/:token` (pre-auth preview) uses the existing `@Public()` decorator (`apps/api/src/app/auth/public.decorator.ts`) rather than depending on undetermined client-side no-token-header behavior.
- **New routes live in `apps/api/src/app/auth/auth.controller.ts`**, mirroring the existing `GET auth/org/members` route (membership/invites are an auth-domain concept, not a notes-domain one) — not in `notes.controller.ts`, where `Organization` CRUD itself lives.
- Post-coding routine before every commit, for every touched project: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green. Also run `yarn format:check` (whole repo) before pushing — a prior phase this session had a Prettier drift slip past per-file checks and only got caught by CI.
- Client UI changes require mandatory Playwright verification per `AGENTS.md`'s UI Work Rules before being considered done — no exceptions.
- i18n additions go in all 4 locale files (en/ru/es/he) — `libs/template-shared/src/lib/i18n/locales/{en,ru,es,he}.ts` — under the existing `org` namespace for member/invite-management strings, and a new top-level `acceptInvite` namespace for the standalone page.

---

## Task 1: Fix `OrgSwitcher`'s platform-admin gate

**Files:**
- Modify: `apps/client/src/components/org/OrgSwitcher.tsx`
- Test: existing tests for this component, if any (check `apps/client/src/components/org/__tests__/` — if none exist, this task doesn't need to add one; it's a one-line deletion with no new logic branch to cover)

**Interfaces:** none — standalone, no dependency on any other task.

- [ ] **Step 1: Remove the gate**

In `apps/client/src/components/org/OrgSwitcher.tsx`, remove this line entirely:
```ts
if (!isAdmin) return null;
```
Also remove the now-unused `isAdmin` variable declaration:
```ts
const isAdmin = useIsAdmin();
```
And remove the now-unused import:
```ts
import { useIsAdmin } from '@icore/template-shared';
```
The component's existing zero-orgs handling (already present, inside the dropdown body) needs no change:
```tsx
{(orgs ?? []).length === 0 && (
  <p className="px-3 py-1.5 text-muted-foreground text-xs">{t('org.noOrgs')}</p>
)}
```

- [ ] **Step 2: Verify no other usage of `isAdmin` remains in this file**

Run: `grep -n "isAdmin\|useIsAdmin" apps/client/src/components/org/OrgSwitcher.tsx`
Expected: no matches.

- [ ] **Step 3: Run existing client tests to confirm no regression**

Run: `yarn nx test client`
Expected: PASS, same count as before this change (no test currently asserts the old admin-only gating, since none was found referencing this behavior — if one IS found and fails, update ONLY that test's expectation to match the new correct behavior, don't revert the fix).

- [ ] **Step 4: Post-coding routine**

```bash
npx prettier --write apps/client/src/components/org/OrgSwitcher.tsx
yarn nx lint client
yarn nx build client
```

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/org/OrgSwitcher.tsx
git commit -m "fix(org): remove platform-admin gate from OrgSwitcher

Every non-superadmin user (i.e. virtually everyone, including every
regular org owner) never saw this component. Gated on the wrong role
entirely -- platform role, not org ownership/membership. The
component already degrades gracefully with zero orgs."
```

---

## Task 2: Fix `listOrgMembers` Fake/Supabase parity

**Files:**
- Modify: `libs/shared/src/strategies/auth.ts` (interface signature)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts` (`listOrgMembers` implementation)
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts` (`listOrgMembers` implementation)
- Modify: `apps/api/src/app/auth/auth.controller.ts` (the one call site, to pass `ownerId`)
- Test: `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts` (extend with a case proving the creator now appears)

**Interfaces:**
- Produces: `listOrgMembers(orgId: string, ownerId?: string): Promise<OrgMember[]>` — consumed by Task 4's `checkOrgAccess` rewrite and Task 3's `checkOrgAccess` rewrite (both call this with `org.userId` as `ownerId`).

- [ ] **Step 1: Write the failing test**

Add to `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts` (near the existing `seedOrgMember`/`listOrgMembers` tests):

```ts
it('unions in the ownerId as an implicit owner when not already a seeded member', async () => {
  const strategy = new FakeAuthStrategy();
  strategy.seedOrgMember('org-1', { userId: 'member-1', role: 'viewer' });

  const members = await strategy.listOrgMembers('org-1', 'creator-1');

  expect(members).toContainEqual(expect.objectContaining({ userId: 'creator-1', role: 'owner' }));
  expect(members).toContainEqual(expect.objectContaining({ userId: 'member-1', role: 'viewer' }));
});

it('does not duplicate the owner if already seeded as a member', async () => {
  const strategy = new FakeAuthStrategy();
  strategy.seedOrgMember('org-1', { userId: 'creator-1', role: 'owner' });

  const members = await strategy.listOrgMembers('org-1', 'creator-1');

  expect(members.filter((m) => m.userId === 'creator-1')).toHaveLength(1);
});

it('returns only seeded members when ownerId is not provided (back-compat)', async () => {
  const strategy = new FakeAuthStrategy();
  strategy.seedOrgMember('org-1', { userId: 'member-1', role: 'viewer' });

  const members = await strategy.listOrgMembers('org-1');

  expect(members).toEqual([{ userId: 'member-1', role: 'viewer' }]);
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: FAIL — `listOrgMembers` doesn't accept a 2nd argument yet (TypeScript compile error on the call), and the union logic doesn't exist.

- [ ] **Step 3: Widen the interface**

In `libs/shared/src/strategies/auth.ts`, change:
```ts
listOrgMembers(orgId: string): Promise<OrgMember[]>;
```
to:
```ts
listOrgMembers(orgId: string, ownerId?: string): Promise<OrgMember[]>;
```

- [ ] **Step 4: Implement in `FakeAuthStrategy`**

In `libs/shared/src/strategies/fakes/fake-auth.ts`, replace:
```ts
async listOrgMembers(orgId: string): Promise<OrgMember[]> {
  return this.orgMembers.get(orgId) ?? [];
}
```
with:
```ts
async listOrgMembers(orgId: string, ownerId?: string): Promise<OrgMember[]> {
  const members = this.orgMembers.get(orgId) ?? [];
  if (!ownerId || members.some((m) => m.userId === ownerId)) return members;
  return [{ userId: ownerId, role: 'owner' }, ...members];
}
```

- [ ] **Step 5: Implement in `SupabaseAuthStrategy`**

In `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`, replace the existing SQL-join-based union logic (lines 196-244, read the current implementation first to preserve its `profiles` join for email/displayName enrichment — only the creator-union sub-logic changes, not the whole method) so that after fetching the raw `organization_members` rows (enriched with `profiles` data as it does today), it applies the same simple union as the Fake:
```ts
async listOrgMembers(orgId: string, ownerId?: string): Promise<OrgMember[]> {
  // ... existing query against organization_members joined with profiles, unchanged ...
  const members = /* existing mapped result */;
  if (!ownerId || members.some((m) => m.userId === ownerId)) return members;
  // Fetch the owner's own profile info the same way existing members are enriched,
  // to keep displayName/email populated for the owner row too (read the existing
  // profiles-join code above to match its exact shape for a single extra row).
  const ownerProfile = await this.getProfile(ownerId); // or equivalent existing helper — confirm exact method name in this file before use
  return [{ userId: ownerId, role: 'owner', displayName: ownerProfile?.displayName, email: ownerProfile?.email }, ...members];
}
```

- [ ] **Step 6: Update the one call site**

In `apps/api/src/app/auth/auth.controller.ts`, find the `GET auth/org/members`-equivalent route (around the area handling org member listing — confirm exact route decorator and current org-resolution code before editing) and change its `listOrgMembers(orgId)` call to `listOrgMembers(orgId, org.userId)`, where `org` is whatever `Organization` object that handler already resolves (it must already fetch the org to know `orgId` is valid — read the surrounding code to find the exact variable name).

- [ ] **Step 7: Run tests, confirm they pass**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: PASS, all 3 new tests plus all pre-existing tests in the file.

- [ ] **Step 8: Post-coding routine**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts apps/api/src/app/auth/auth.controller.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
yarn nx lint shared
yarn nx lint auth-supabase
yarn nx lint api
yarn nx build shared
yarn nx build auth-supabase
yarn nx build api
```

- [ ] **Step 9: Commit**

```bash
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts apps/api/src/app/auth/auth.controller.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
git commit -m "fix(auth): fix Fake/Supabase parity bug in listOrgMembers

Supabase unioned in the org creator as an implicit owner via a SQL
join; Fake returned only seeded members, since it has no Organization
awareness (a different strategy's domain). Widened the signature to
listOrgMembers(orgId, ownerId?) so both strategies apply the identical
trivial union themselves."
```

---

## Task 3: Widen `checkOrgAccess` (both copies) to be role-aware and async

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (126 call sites + the method itself)
- Modify: `apps/api/src/app/auth/auth.controller.ts` (1 call site + its own duplicate copy of the method)
- Test: extend `apps/api/src/app/notes/__tests__/route-coverage.unit.test.ts`'s sibling test file style — actually, this task needs NEW role-matrix tests in a dedicated file, since `route-coverage.unit.test.ts` tests coverage, not role behavior. Create `apps/api/src/app/notes/__tests__/check-org-access.unit.test.ts`.

**Interfaces:**
- Consumes: `this.auth.listOrgMembers(orgId, ownerId)` from Task 2.
- Produces: `checkOrgAccess` becomes `async`, and a new `checkOrgOwner(req, org)` helper (owner-or-platform-admin-only) is added alongside it in both files — consumed by Task 7's invite/member-management routes.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/app/notes/__tests__/check-org-access.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { AuthClientService } from '@icore/auth-client';
import type { Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'owner-1',
  name: 'Acme',
} as unknown as Organization;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getPolicy: vi.fn(),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> },
): NotesController {
  // NotesController gains a 5th constructor parameter, `auth: AuthClientService`, in
  // this task's Step 3 -- pass the mock there directly, matching the exact parameter
  // order Step 3 adds it in.
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
    auth as unknown as AuthClientService,
  );
}

function reqAs(uid: string, role?: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('checkOrgAccess role matrix', () => {
  it('allows the owner full access without a membership lookup', async () => {
    const auth = { listOrgMembers: vi.fn() };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(
      controller.getPolicy(reqAs('owner-1'), 'p1'),
    ).resolves.toBeDefined();
    expect(auth.listOrgMembers).not.toHaveBeenCalled();
  });

  it('allows a platform admin full access without a membership lookup', async () => {
    const auth = { listOrgMembers: vi.fn() };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(
      controller.getPolicy(reqAs('platform-admin-1', 'admin'), 'p1'),
    ).resolves.toBeDefined();
    expect(auth.listOrgMembers).not.toHaveBeenCalled();
  });

  it('allows an org-admin member read access', async () => {
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'admin' }]) };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('member-1'), 'p1')).resolves.toBeDefined();
  });

  it('allows a viewer read access', async () => {
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'viewer' }]) };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('member-1'), 'p1')).resolves.toBeDefined();
  });

  it('rejects a viewer attempting a write', async () => {
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'viewer' }]) };
    const notes = makeNotes({
      getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }),
      updatePolicy: vi.fn(),
    });
    const controller = makeController(notes, auth);
    await expect(
      controller.updatePolicy(reqAs('member-1'), 'p1', {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a non-member entirely', async () => {
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('outsider'), 'p1')).rejects.toThrow(ForbiddenException);
  });
});
```

(This test uses `getPolicy`/`updatePolicy` as representative already-hardened routes from Notes Gateway Hardening Phase 2 — any hardened route works identically since they all funnel through the same `checkOrgAccess`.)

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test api -- check-org-access.unit.test.ts`
Expected: FAIL to even compile — `checkOrgAccess` doesn't yet consult membership, `NotesController` doesn't yet have an injected auth client to mock.

- [ ] **Step 3: Add an injected auth-client dependency to `NotesController`**

`checkOrgAccess` needs `this.auth.listOrgMembers(...)`. Check `NotesController`'s current constructor (top of `apps/api/src/app/notes/notes.controller.ts`) — it currently takes `(notes: NotesClientService, ai: AiClientService, abilityFactory: AbilityFactory, standardsQueue: StandardsQueueService)`. Add a 5th constructor parameter, `private readonly auth: AuthClientService` (import from `@icore/auth-client`, the existing package used by `auth.controller.ts` — confirm the exact import path by checking `apps/api/src/app/auth/auth.controller.ts`'s own import of `AuthClientService`), and register `AuthClientService`'s module as an import in whatever NestJS module declares `NotesController` (check `apps/api/src/app/notes/notes.module.ts` or equivalent — mirror how `auth.module.ts` or wherever `AuthClientService` is currently provided does it, likely already exported from a shared client module importable here).

- [ ] **Step 4: Rewrite `checkOrgAccess` in `notes.controller.ts`**

Replace:
```ts
private checkOrgAccess(
  req: Request & { user?: VerifiedToken },
  org: Organization,
  action: 'read' | 'update' | 'delete',
): void {
  const ability = this.abilityFactory.forUser(req.user);
  if (!ability.can(action, subject('Organization', { id: org.id, userId: org.userId }))) {
    throw new ForbiddenException();
  }
}
```
with:
```ts
private async checkOrgAccess(
  req: Request & { user?: VerifiedToken },
  org: Organization,
  action: 'read' | 'update' | 'delete',
): Promise<void> {
  if (req.user?.role === 'admin') return;

  const uid = req.user?.uid;
  if (org.userId === uid) return;

  const members = await this.auth.listOrgMembers(org.id, org.userId);
  const membership = members.find((m) => m.userId === uid);
  if (!membership) throw new ForbiddenException();

  if (membership.role === 'viewer' && action !== 'read') throw new ForbiddenException();
}

private async checkOrgOwner(
  req: Request & { user?: VerifiedToken },
  org: Organization,
): Promise<void> {
  if (req.user?.role === 'admin') return;
  if (org.userId !== req.user?.uid) throw new ForbiddenException();
}
```

Note: the `ability`/`subject`/`AbilityFactory` usage is removed from `checkOrgAccess` entirely — `this.abilityFactory` may still be used elsewhere in this file for non-org CASL checks (e.g. `Note`/`Profile`/`StandardsDocument` subjects per `defineAbilitiesFor`) — do NOT remove the `abilityFactory` field or its constructor injection, only this one method's usage of it.

- [ ] **Step 5: Sweep all 126 call sites for `await`**

Every call of the form `this.checkOrgAccess(req, org, 'read'|'update'|'delete');` in this file becomes `await this.checkOrgAccess(req, org, 'read'|'update'|'delete');`. All 126 are already inside `async` methods (confirmed during plan research — zero exceptions), so this is a pure mechanical find-and-replace across the file: search for the literal substring `this.checkOrgAccess(` and prepend `await ` at every occurrence that doesn't already have it, then verify with `yarn nx build api` that TypeScript raises no "floating promise"/unhandled-promise warnings anywhere in this file (if the repo's lint config includes `@typescript-eslint/no-floating-promises`, a missed call site fails lint — use that as a second independent verification pass beyond a manual `grep -c "this.checkOrgAccess(" | grep -v "await"`).

- [ ] **Step 6: Apply the identical rewrite to `auth.controller.ts`'s duplicate copy**

`apps/api/src/app/auth/auth.controller.ts` has a byte-for-byte-identical private `checkOrgAccess` method with 1 call site (the `GET auth/org/members` route). Apply the exact same rewrite from Step 4 (both `checkOrgAccess` becoming async and `checkOrgOwner` being added — `checkOrgOwner` is needed here too, for this task's own new member/invite-management routes built in Task 7), and add `await` to its 1 call site. This controller already has direct access to its own `AuthStrategy`/`AuthClientService` (it's the auth controller) — use whatever field name it already uses for that, do not add a redundant second one.

- [ ] **Step 7: Run tests, confirm they pass**

Run: `yarn nx test api -- check-org-access.unit.test.ts`
Expected: PASS, all 6 tests.

Run: `yarn nx test api` (full suite)
Expected: PASS, no regressions — every previously-hardened route's existing tests (Phase 1/2/3, ~200+ tests) still pass, since owner-only and platform-admin-only behavior is unchanged; only non-owner/non-creator behavior changes (was always-forbidden, now depends on membership, but every existing test's "outsider" fixture has no seeded membership, so `listOrgMembers` returns `[]` and the outsider is still correctly forbidden).

- [ ] **Step 8: Post-coding routine**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/auth/auth.controller.ts apps/api/src/app/notes/__tests__/check-org-access.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/auth/auth.controller.ts apps/api/src/app/notes/__tests__/check-org-access.unit.test.ts
git commit -m "feat(auth): make checkOrgAccess role-aware and async (both copies)

Was keyed purely on Organization.userId (creator) via a static CASL
rule -- the actual reason every self-approval-guarded workflow this
session is unusable in a real multi-person org. Now consults
organization_members via the newly-fixed listOrgMembers: owner and
platform-admin get full access without a lookup; a member's role
(admin/viewer) gates read-vs-write; a non-member is still forbidden.
126 call sites in notes.controller.ts plus 1 in auth.controller.ts
updated to await the now-async method. New checkOrgOwner helper
(owner-or-platform-admin only) added to both files for org-deletion
and member/invite-management routes, built in a later task."
```

---

## Task 4: Widen `listOrganizations` to include member orgs

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts` (no signature change needed — same `listOrganizations(userId)` signature, just widened query logic)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`
- Test: extend `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: this task needs to know which orgs a user is a MEMBER of, which lives in the AUTH strategy's `organization_members`, not the NOTES strategy's `org_profiles` — a cross-strategy read. Confirm at implementation time whether `FakeNotesStrategy`/`SupabaseNotesStrategy` already has any existing cross-strategy dependency pattern to copy (check how any existing Notes-strategy method reads Auth-strategy data, if any does) — if none exists, the pragmatic fix is: `listOrganizations` stays creator-only in the NOTES strategy (unchanged), and the GATEWAY route (`GET orgs` in `notes.controller.ts`) becomes the layer that merges creator-owned orgs (from `this.notes.listOrganizations(uid)`) with member orgs (by calling `this.auth.listOrgMembers`-adjacent logic — specifically, this requires a new AuthStrategy method returning "org IDs this user is a member of", not full `OrgMember` objects, since we need ORG data merged with membership data across two different strategies/microservices). Add `listOrgIdsForMember(userId: string): Promise<string[]>` to `AuthStrategy` (both implementations, querying `organization_members` for `user_id = userId`), then the gateway route does: `const ownedOrgs = await this.notes.listOrganizations(uid); const memberOrgIds = await this.auth.listOrgIdsForMember(uid); const memberOrgs = await Promise.all(memberOrgIds.filter(id => !ownedOrgs.some(o => o.id === id)).map(id => this.notes.getOrganizationById(id))); return [...ownedOrgs, ...memberOrgs.filter((o): o is Organization => o !== null)];`
- Produces: `listOrgIdsForMember(userId)` on `AuthStrategy`, consumed only by this task's own gateway route change.

- [ ] **Step 1: Write the failing test**

Add to `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`:

```ts
it('lists org ids a user is a member of', async () => {
  const strategy = new FakeAuthStrategy();
  strategy.seedOrgMember('org-1', { userId: 'user-a', role: 'viewer' });
  strategy.seedOrgMember('org-2', { userId: 'user-a', role: 'admin' });
  strategy.seedOrgMember('org-3', { userId: 'user-b', role: 'viewer' });

  const orgIds = await strategy.listOrgIdsForMember('user-a');

  expect(orgIds.sort()).toEqual(['org-1', 'org-2']);
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: FAIL — method doesn't exist.

- [ ] **Step 3: Add `listOrgIdsForMember` to the interface**

In `libs/shared/src/strategies/auth.ts`, add to the `AuthStrategy` interface:
```ts
listOrgIdsForMember(userId: string): Promise<string[]>;
```

- [ ] **Step 4: Implement in `FakeAuthStrategy`**

In `libs/shared/src/strategies/fakes/fake-auth.ts`:
```ts
async listOrgIdsForMember(userId: string): Promise<string[]> {
  const result: string[] = [];
  for (const [orgId, members] of this.orgMembers.entries()) {
    if (members.some((m) => m.userId === userId)) result.push(orgId);
  }
  return result;
}
```

- [ ] **Step 5: Implement in `SupabaseAuthStrategy`**

```ts
async listOrgIdsForMember(userId: string): Promise<string[]> {
  const { data, error } = await this.client
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r['org_id'] as string);
}
```
(Confirm the exact Supabase client field name used elsewhere in this file, e.g. `this.client` vs `this.db` — match whatever `listOrgMembers` already uses in the same file.)

- [ ] **Step 6: Update the `GET orgs` gateway route**

In `apps/api/src/app/notes/notes.controller.ts`, find `listOrgs`/`GET orgs` (around line 642 per prior research) and widen it:
```ts
@Get('orgs')
async listOrgs(@Req() req: Request & { user?: VerifiedToken }) {
  const uid = this.uid(req);
  const ownedOrgs = await this.notes.listOrganizations(uid);
  const memberOrgIds = await this.auth.listOrgIdsForMember(uid);
  const missingIds = memberOrgIds.filter((id) => !ownedOrgs.some((o) => o.id === id));
  const memberOrgs = await Promise.all(missingIds.map((id) => this.notes.getOrganizationById(id)));
  return [...ownedOrgs, ...memberOrgs.filter((o): o is Organization => o !== null)];
}
```
(This reuses the `this.auth` field added to `NotesController` in Task 3 Step 3.)

- [ ] **Step 7: Run tests, confirm they pass**

Run: `yarn nx test shared -- fake-auth.unit.test.ts` and `yarn nx test api`
Expected: PASS, no regressions.

- [ ] **Step 8: Post-coding routine**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts apps/api/src/app/notes/notes.controller.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
yarn nx lint shared
yarn nx lint auth-supabase
yarn nx lint api
yarn nx build shared
yarn nx build auth-supabase
yarn nx build api
```

- [ ] **Step 9: Commit**

```bash
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts apps/api/src/app/notes/notes.controller.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
git commit -m "feat(org): widen GET orgs to include orgs the user is a member of, not just owns"
```

---

## Task 5: Data model — `organization_invites` table and `OrgInvite` type

**Files:**
- Create: `supabase/migrations/20260917000001_organization_invites.sql`
- Modify: `libs/shared/src/strategies/auth.ts` (add `OrgInvite`, `OrgInviteStatus`, `OrgInviteRole` types)

**Interfaces:**
- Produces: `OrgInvite` type, consumed by Task 6's 6 new `AuthStrategy` methods.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260917000001_organization_invites.sql`:
```sql
create table public.organization_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org_profiles(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'viewer')),
  token       text not null unique,
  invited_by  uuid not null references auth.users(id),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index organization_invites_pending_unique
  on public.organization_invites (org_id, lower(email))
  where status = 'pending';

create index organization_invites_token_idx on public.organization_invites (token);
```
(Do NOT apply this migration to the real Supabase DB yet — per this session's established pattern, migrations are applied via `psql` after the branch merges, not during development. `FakeAuthStrategy`'s in-memory implementation needs no migration.)

- [ ] **Step 2: Add the TypeScript types**

In `libs/shared/src/strategies/auth.ts`, add near the existing `OrgMember` interface:
```ts
export type OrgInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type OrgInviteRole = 'admin' | 'viewer';

export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  role: OrgInviteRole;
  token: string;
  invitedBy: string;
  status: OrgInviteStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}
```

- [ ] **Step 3: Verify the file still compiles**

Run: `yarn nx build shared`
Expected: SUCCESS (no consumers of these new types yet, so this is purely additive).

- [ ] **Step 4: Post-coding routine**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts supabase/migrations/20260917000001_organization_invites.sql
yarn nx lint shared
yarn nx build shared
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260917000001_organization_invites.sql libs/shared/src/strategies/auth.ts
git commit -m "feat(org-invite): add organization_invites table and OrgInvite type"
```

---

## Task 6: `AuthStrategy` invite methods (Fake + Supabase)

**Files:**
- Modify: `libs/shared/src/strategies/auth.ts` (interface)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- Test: `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`

**Interfaces:**
- Consumes: `OrgInvite`/`OrgInviteRole` from Task 5, `sendMagicLink`'s email-sending pattern (for the invite email).
- Produces: `createOrgInvite`, `listOrgInvites`, `revokeOrgInvite`, `resendOrgInvite`, `getOrgInviteByToken`, `acceptOrgInvite` — consumed by Task 7's gateway routes.

- [ ] **Step 1: Write the failing tests**

Add to `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`:

```ts
describe('org invites', () => {
  it('creates a pending invite', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    expect(invite.status).toBe('pending');
    expect(invite.role).toBe('viewer');
    expect(invite.token).toBeTruthy();
  });

  it('lists only pending invites for an org', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    await strategy.revokeOrgInvite(invite.id);
    const another = await strategy.createOrgInvite('org-1', 'other@example.com', 'admin', 'owner-1');
    const pending = await strategy.listOrgInvites('org-1');
    expect(pending.map((i) => i.id)).toEqual([another.id]);
  });

  it('revokes an invite', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    await strategy.revokeOrgInvite(invite.id);
    const found = await strategy.getOrgInviteByToken(invite.token);
    expect(found?.status).toBe('revoked');
  });

  it('resend regenerates the token and expiry on the same invite', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    const resent = await strategy.resendOrgInvite(invite.id);
    expect(resent.id).toBe(invite.id);
    expect(resent.token).not.toBe(invite.token);
    const oldTokenLookup = await strategy.getOrgInviteByToken(invite.token);
    expect(oldTokenLookup).toBeNull();
  });

  it('accepts a valid invite and creates a membership', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    const member = await strategy.acceptOrgInvite(invite.token, 'new-user-1', 'new@example.com');
    expect(member.role).toBe('viewer');
    const members = await strategy.listOrgMembers('org-1');
    expect(members).toContainEqual(expect.objectContaining({ userId: 'new-user-1', role: 'viewer' }));
    const accepted = await strategy.getOrgInviteByToken(invite.token);
    expect(accepted?.status).toBe('accepted');
  });

  it('rejects accepting with a mismatched email', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    await expect(
      strategy.acceptOrgInvite(invite.token, 'new-user-1', 'someone-else@example.com'),
    ).rejects.toThrow('invite_email_mismatch');
  });

  it('rejects accepting an already-accepted invite', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    await strategy.acceptOrgInvite(invite.token, 'new-user-1', 'new@example.com');
    await expect(
      strategy.acceptOrgInvite(invite.token, 'new-user-1', 'new@example.com'),
    ).rejects.toThrow('invite_not_pending');
  });

  it('rejects accepting an expired invite', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'viewer', 'owner-1');
    // Force expiry for the test — mutate the fake's internal store directly.
    // Confirm the exact internal field name (likely this.orgInvites, a Map<string, OrgInvite>)
    // during implementation and adjust this line to match.
    (strategy as unknown as { orgInvites: Map<string, OrgInvite> }).orgInvites.get(invite.id)!.expiresAt =
      new Date(Date.now() - 1000).toISOString();
    await expect(
      strategy.acceptOrgInvite(invite.token, 'new-user-1', 'new@example.com'),
    ).rejects.toThrow('invite_expired');
  });

  it('rejects accepting when already a member', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'new-user-1', role: 'viewer' });
    const invite = await strategy.createOrgInvite('org-1', 'new@example.com', 'admin', 'owner-1');
    await expect(
      strategy.acceptOrgInvite(invite.token, 'new-user-1', 'new@example.com'),
    ).rejects.toThrow('invite_already_member');
  });

  it('rejects accepting when the caller is the org owner', async () => {
    const strategy = new FakeAuthStrategy();
    const invite = await strategy.createOrgInvite('org-1', 'owner@example.com', 'admin', 'owner-1');
    await expect(
      strategy.acceptOrgInvite(invite.token, 'owner-1', 'owner@example.com'),
    ).rejects.toThrow('invite_already_member');
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: FAIL — none of these methods exist yet.

- [ ] **Step 3: Widen the `AuthStrategy` interface**

In `libs/shared/src/strategies/auth.ts`, add:
```ts
createOrgInvite(orgId: string, email: string, role: OrgInviteRole, invitedBy: string): Promise<OrgInvite>;
listOrgInvites(orgId: string): Promise<OrgInvite[]>;
revokeOrgInvite(inviteId: string): Promise<void>;
resendOrgInvite(inviteId: string): Promise<OrgInvite>;
getOrgInviteByToken(token: string): Promise<OrgInvite | null>;
acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember>;
listOrgIdsForMember(userId: string): Promise<string[]>; // already added in Task 4 -- listed here only for interface completeness, do not re-add if already present
```

- [ ] **Step 4: Implement in `FakeAuthStrategy`**

In `libs/shared/src/strategies/fakes/fake-auth.ts`, add a new private field `private orgInvites = new Map<string, OrgInvite>();` alongside the existing `orgMembers` field, and:

```ts
async createOrgInvite(
  orgId: string,
  email: string,
  role: OrgInviteRole,
  invitedBy: string,
): Promise<OrgInvite> {
  const invite: OrgInvite = {
    id: `invite-${this.orgInvites.size + 1}`,
    orgId,
    email,
    role,
    token: `token-${Math.random().toString(36).slice(2)}`,
    invitedBy,
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  };
  this.orgInvites.set(invite.id, invite);
  return invite;
}

async listOrgInvites(orgId: string): Promise<OrgInvite[]> {
  return [...this.orgInvites.values()].filter((i) => i.orgId === orgId && i.status === 'pending');
}

async revokeOrgInvite(inviteId: string): Promise<void> {
  const invite = this.orgInvites.get(inviteId);
  if (invite) invite.status = 'revoked';
}

async resendOrgInvite(inviteId: string): Promise<OrgInvite> {
  const invite = this.orgInvites.get(inviteId);
  if (!invite) throw new Error('invite_not_found');
  invite.token = `token-${Math.random().toString(36).slice(2)}`;
  invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return invite;
}

async getOrgInviteByToken(token: string): Promise<OrgInvite | null> {
  return [...this.orgInvites.values()].find((i) => i.token === token) ?? null;
}

async acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember> {
  const invite = await this.getOrgInviteByToken(token);
  if (!invite) throw new Error('invite_not_found');
  if (invite.status !== 'pending') throw new Error('invite_not_pending');
  if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('invite_expired');
  if (userEmail.toLowerCase() !== invite.email.toLowerCase()) throw new Error('invite_email_mismatch');

  const existingMembers = this.orgMembers.get(invite.orgId) ?? [];
  if (existingMembers.some((m) => m.userId === userId)) throw new Error('invite_already_member');

  const member: OrgMember = { userId, role: invite.role };
  this.orgMembers.set(invite.orgId, [...existingMembers, member]);
  invite.status = 'accepted';
  invite.acceptedAt = new Date().toISOString();
  return member;
}
```

Note: `acceptOrgInvite`'s "already a member" check must also cover the org OWNER, per the test in Step 1 ("rejects accepting when the caller is the org owner") — but `FakeAuthStrategy` has no knowledge of who the owner is (that's `FakeNotesStrategy`'s domain, `Organization.userId`). This means the owner-check CANNOT happen inside `AuthStrategy.acceptOrgInvite` itself — it must happen at the GATEWAY layer (Task 7), which has access to both `this.notes.getOrganizationById(invite.orgId)` (for `org.userId`) and `this.auth.acceptOrgInvite(...)`. Adjust the Step 1 test "rejects accepting when the caller is the org owner" to instead be a gateway-level test in Task 7, not a strategy-level test here — remove it from this file's test list, or mark it `.skip` with a comment pointing to where it's actually covered, since the strategy method genuinely cannot know this.

- [ ] **Step 5: Implement in `SupabaseAuthStrategy`**

```ts
async createOrgInvite(
  orgId: string,
  email: string,
  role: OrgInviteRole,
  invitedBy: string,
): Promise<OrgInvite> {
  const token = randomBytes(32).toString('hex'); // import { randomBytes } from 'crypto' at top of file
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await this.client
    .from('organization_invites')
    .insert({ org_id: orgId, email, role, token, invited_by: invitedBy, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw new Error(error.message);
  // Send the invite email, reusing the same delivery mechanism as sendMagicLink.
  // Confirm the exact signInWithOtp call shape from sendMagicLink in this same file
  // and copy it, substituting emailRedirectTo with `${callbackBaseUrl}/accept-invite?token=${token}`
  // -- confirm where callbackBaseUrl / the equivalent base-URL config value comes from
  // in sendMagicLink's existing implementation (likely an env var or config service
  // already injected into this class) and reuse the same source, don't hardcode a new one.
  await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${this.appBaseUrl}/accept-invite?token=${token}` } });
  return this.toOrgInvite(data);
}

async listOrgInvites(orgId: string): Promise<OrgInvite[]> {
  const { data, error } = await this.client
    .from('organization_invites')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => this.toOrgInvite(r));
}

async revokeOrgInvite(inviteId: string): Promise<void> {
  const { error } = await this.client
    .from('organization_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId);
  if (error) throw new Error(error.message);
}

async resendOrgInvite(inviteId: string): Promise<OrgInvite> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await this.client
    .from('organization_invites')
    .update({ token, expires_at: expiresAt })
    .eq('id', inviteId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const invite = this.toOrgInvite(data);
  await this.client.auth.signInWithOtp({ email: invite.email, options: { emailRedirectTo: `${this.appBaseUrl}/accept-invite?token=${token}` } });
  return invite;
}

async getOrgInviteByToken(token: string): Promise<OrgInvite | null> {
  const { data, error } = await this.client
    .from('organization_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? this.toOrgInvite(data) : null;
}

async acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember> {
  const invite = await this.getOrgInviteByToken(token);
  if (!invite) throw new Error('invite_not_found');
  if (invite.status !== 'pending') throw new Error('invite_not_pending');
  if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('invite_expired');
  if (userEmail.toLowerCase() !== invite.email.toLowerCase()) throw new Error('invite_email_mismatch');

  const { data: existing } = await this.client
    .from('organization_members')
    .select('id')
    .eq('org_id', invite.orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) throw new Error('invite_already_member');

  const { error: insertError } = await this.client
    .from('organization_members')
    .insert({ org_id: invite.orgId, user_id: userId, role: invite.role });
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await this.client
    .from('organization_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id);
  if (updateError) throw new Error(updateError.message);

  return { userId, role: invite.role };
}

private toOrgInvite(row: Record<string, unknown>): OrgInvite {
  return {
    id: row['id'] as string,
    orgId: row['org_id'] as string,
    email: row['email'] as string,
    role: row['role'] as OrgInviteRole,
    token: row['token'] as string,
    invitedBy: row['invited_by'] as string,
    status: row['status'] as OrgInviteStatus,
    expiresAt: row['expires_at'] as string,
    createdAt: row['created_at'] as string,
    acceptedAt: row['accepted_at'] as string | null,
  };
}
```
(Confirm the exact `this.client` field name, whether `randomBytes` is already imported elsewhere in this file or needs a new import, and the exact name/source of a base-URL config value — mirror `sendMagicLink`'s existing pattern for all three rather than inventing new conventions.)

- [ ] **Step 6: Run tests, confirm they pass**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: PASS, all tests (adjusted per the Step 4 note about the owner-check test moving to Task 7).

- [ ] **Step 7: Post-coding routine**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
yarn nx lint shared
yarn nx lint auth-supabase
yarn nx build shared
yarn nx build auth-supabase
```

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
git commit -m "feat(org-invite): add invite lifecycle methods to AuthStrategy (Fake + Supabase)

createOrgInvite/listOrgInvites/revokeOrgInvite/resendOrgInvite/
getOrgInviteByToken/acceptOrgInvite. Validation order matches this
session's established self-approval-guard convention: not-found ->
not-pending -> expired -> email-mismatch -> already-member. Email
delivery reuses the same signInWithOtp + emailRedirectTo pattern as
sendMagicLink -- no new email vendor."
```

---

## Task 7: Full-stack wiring — MS handlers, `AuthClientService`, gateway routes

**Files:**
- Modify: `apps/microservices/auth/src/app/auth.controller.ts` (6 new `@MessagePattern` handlers)
- Modify: `libs/auth-client/src/lib/auth-client.service.ts` (6 new proxy methods)
- Modify: `apps/api/src/app/auth/auth.controller.ts` (6 new gateway routes + `checkOrgManage` helper)
- Modify: `apps/api/src/app/notes/notes.controller.ts` (`GET orgs` already updated in Task 4 — no further change here)
- Test: `apps/api/src/app/auth/__tests__/` — extend or create the gateway test file for this controller (check if one already exists at this path; if not, create `auth.controller.unit.test.ts` following the `policies.controller.unit.test.ts` convention from Notes Gateway Hardening)

**Interfaces:**
- Consumes: all 6 `AuthStrategy` methods from Task 6, `checkOrgOwner` from Task 3.
- Produces: `checkOrgManage(req, org)` helper (owner-or-org-admin, distinct from `checkOrgOwner`'s owner-only) — used only by this task's own invite/member-management routes, not consumed elsewhere.

- [ ] **Step 1: Confirm the exact existing `GET auth/org/members` route signature before adding siblings**

Read `apps/api/src/app/auth/auth.controller.ts` in full around its org-members route (found during research at "lines 154-165" — line numbers may have shifted since other tasks in this plan touch this same file first). Confirm: does it take `orgId` as a query param (`@Query('orgId')`) or is there a route param pattern (`:id`)? Match whatever convention it already uses exactly for all 6 new routes below — do not introduce a different param style in the same controller.

- [ ] **Step 2: Add the `checkOrgManage` helper**

Alongside `checkOrgAccess`/`checkOrgOwner` in `apps/api/src/app/auth/auth.controller.ts` (both already added to this file in Task 3):
```ts
private async checkOrgManage(
  req: Request & { user?: VerifiedToken },
  org: Organization,
): Promise<void> {
  if (req.user?.role === 'admin') return;
  if (org.userId === req.user?.uid) return;

  const members = await this.auth.listOrgMembers(org.id, org.userId);
  const membership = members.find((m) => m.userId === req.user?.uid);
  if (!membership || membership.role !== 'admin') throw new ForbiddenException();
}
```
(Owner and platform-admin pass; an org-admin member passes; a viewer or non-member does not.)

- [ ] **Step 3: Add the 6 gateway routes**

In `apps/api/src/app/auth/auth.controller.ts`, following the exact param-style confirmed in Step 1 (shown here using a query-param style — adjust to match if the existing route uses a different convention):

```ts
@Post('org/invites')
@ApiOperation({ summary: 'Invite a user to an org by email' })
async createOrgInvite(
  @Req() req: Request & { user?: VerifiedToken },
  @Query('orgId') orgId: string,
  @Body() body: { email: string; role: OrgInviteRole },
) {
  const uid = this.uid(req);
  if (!orgId) throw new BadRequestException('orgId required');
  const org = await this.notes.getOrganizationById(orgId);
  if (!org) throw new NotFoundException();
  await this.checkOrgManage(req, org);
  return this.auth.createOrgInvite(orgId, body.email, body.role, uid);
}

@Get('org/invites')
@ApiOperation({ summary: 'List pending invites for an org' })
async listOrgInvites(
  @Req() req: Request & { user?: VerifiedToken },
  @Query('orgId') orgId: string,
) {
  if (!orgId) throw new BadRequestException('orgId required');
  const org = await this.notes.getOrganizationById(orgId);
  if (!org) throw new NotFoundException();
  await this.checkOrgManage(req, org);
  return this.auth.listOrgInvites(orgId);
}

@Delete('org/invites/:inviteId')
@HttpCode(204)
@ApiOperation({ summary: 'Revoke a pending invite' })
async revokeOrgInvite(
  @Req() req: Request & { user?: VerifiedToken },
  @Query('orgId') orgId: string,
  @Param('inviteId') inviteId: string,
) {
  if (!orgId) throw new BadRequestException('orgId required');
  const org = await this.notes.getOrganizationById(orgId);
  if (!org) throw new NotFoundException();
  await this.checkOrgManage(req, org);
  return this.auth.revokeOrgInvite(inviteId);
}

@Post('org/invites/:inviteId/resend')
@ApiOperation({ summary: 'Resend a pending invite with a fresh token' })
async resendOrgInvite(
  @Req() req: Request & { user?: VerifiedToken },
  @Query('orgId') orgId: string,
  @Param('inviteId') inviteId: string,
) {
  if (!orgId) throw new BadRequestException('orgId required');
  const org = await this.notes.getOrganizationById(orgId);
  if (!org) throw new NotFoundException();
  await this.checkOrgManage(req, org);
  return this.auth.resendOrgInvite(inviteId);
}

@Public()
@Get('org-invites/:token')
@ApiOperation({ summary: 'Preview an invite before authenticating' })
async previewOrgInvite(@Param('token') token: string) {
  const invite = await this.auth.getOrgInviteByToken(token);
  if (!invite || invite.status !== 'pending') throw new NotFoundException('invite_not_found');
  const org = await this.notes.getOrganizationById(invite.orgId);
  if (!org) throw new NotFoundException('invite_not_found');
  return { orgName: org.name, role: invite.role, email: invite.email, expiresAt: invite.expiresAt };
}

@Post('org-invites/:token/accept')
@ApiOperation({ summary: 'Accept a pending invite, creating org membership' })
async acceptOrgInvite(
  @Req() req: Request & { user?: VerifiedToken },
  @Param('token') token: string,
) {
  const uid = this.uid(req);
  const email = req.user?.email;
  if (!email) throw new BadRequestException('email required on session');
  const invite = await this.auth.getOrgInviteByToken(token);
  if (!invite) throw new NotFoundException('invite_not_found');
  const org = await this.notes.getOrganizationById(invite.orgId);
  if (org && org.userId === uid) throw new BadRequestException('invite_already_member');
  return this.auth.acceptOrgInvite(token, uid, email);
}
```

Note: `previewOrgInvite` deliberately does NOT reveal the inviter's identity or full org details beyond name/role/email/expiry — matches the spec's stated minimal pre-auth surface. `acceptOrgInvite`'s owner-check (`org.userId === uid`) is the gateway-layer piece of the "already a member" validation that `AuthStrategy.acceptOrgInvite` itself cannot perform (per Task 6 Step 4's note, since the strategy has no `Organization` awareness) — this is where the test moved from Task 6 belongs:

```ts
it('rejects accepting when the caller is the org owner', async () => {
  const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue({ id: 'org-1', userId: 'owner-1' }) });
  const auth = { getOrgInviteByToken: vi.fn().mockResolvedValue({ id: 'i1', orgId: 'org-1', email: 'owner@x.com', status: 'pending' }), acceptOrgInvite: vi.fn() };
  const controller = makeController(notes, auth);
  await expect(
    controller.acceptOrgInvite(reqAs('owner-1', undefined, 'owner@x.com'), 'tok'),
  ).rejects.toThrow(BadRequestException);
  expect(auth.acceptOrgInvite).not.toHaveBeenCalled();
});
```
(Adjust `reqAs` in this test file to accept a 3rd `email` parameter if the existing `auth.controller.unit.test.ts` helper doesn't already support it — check the file's current `reqAs` signature before assuming.)

- [ ] **Step 4: Add MS `@MessagePattern` handlers**

In `apps/microservices/auth/src/app/auth.controller.ts`, add 6 handlers mirroring the existing `@MessagePattern('auth.org.members.list')` pattern exactly (confirm exact naming convention prefix from that existing handler — likely `auth.org.invites.*`):

```ts
@MessagePattern('auth.org.invites.create')
createOrgInvite(@Payload() p: { orgId: string; email: string; role: OrgInviteRole; invitedBy: string }) {
  return this.strategy.createOrgInvite(p.orgId, p.email, p.role, p.invitedBy);
}

@MessagePattern('auth.org.invites.list')
listOrgInvites(@Payload() p: { orgId: string }) {
  return this.strategy.listOrgInvites(p.orgId);
}

@MessagePattern('auth.org.invites.revoke')
revokeOrgInvite(@Payload() p: { inviteId: string }) {
  return this.strategy.revokeOrgInvite(p.inviteId);
}

@MessagePattern('auth.org.invites.resend')
resendOrgInvite(@Payload() p: { inviteId: string }) {
  return this.strategy.resendOrgInvite(p.inviteId);
}

@MessagePattern('auth.org.invites.get-by-token')
getOrgInviteByToken(@Payload() p: { token: string }) {
  return this.strategy.getOrgInviteByToken(p.token);
}

@MessagePattern('auth.org.invites.accept')
acceptOrgInvite(@Payload() p: { token: string; userId: string; userEmail: string }) {
  return this.strategy.acceptOrgInvite(p.token, p.userId, p.userEmail);
}

@MessagePattern('auth.org.members.list-org-ids')
listOrgIdsForMember(@Payload() p: { userId: string }) {
  return this.strategy.listOrgIdsForMember(p.userId);
}
```

- [ ] **Step 5: Add `AuthClientService` proxy methods**

In `libs/auth-client/src/lib/auth-client.service.ts`, mirroring the existing `listOrgMembers` method's `signedSend` pattern exactly:

```ts
createOrgInvite(orgId: string, email: string, role: OrgInviteRole, invitedBy: string): Promise<OrgInvite> {
  return signedSend<OrgInvite>(this.client, 'auth.org.invites.create', { orgId, email, role, invitedBy });
}

listOrgInvites(orgId: string): Promise<OrgInvite[]> {
  return signedSend<OrgInvite[]>(this.client, 'auth.org.invites.list', { orgId });
}

revokeOrgInvite(inviteId: string): Promise<void> {
  return signedSend<void>(this.client, 'auth.org.invites.revoke', { inviteId });
}

resendOrgInvite(inviteId: string): Promise<OrgInvite> {
  return signedSend<OrgInvite>(this.client, 'auth.org.invites.resend', { inviteId });
}

getOrgInviteByToken(token: string): Promise<OrgInvite | null> {
  return signedSend<OrgInvite | null>(this.client, 'auth.org.invites.get-by-token', { token });
}

acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember> {
  return signedSend<OrgMember>(this.client, 'auth.org.invites.accept', { token, userId, userEmail });
}

listOrgIdsForMember(userId: string): Promise<string[]> {
  return signedSend<string[]>(this.client, 'auth.org.members.list-org-ids', { userId });
}
```

- [ ] **Step 6: Write/extend gateway tests**

Follow the `policies.controller.unit.test.ts` convention (from Notes Gateway Hardening) for the 6 new routes: owner allowed, org-admin-member allowed (management routes), viewer forbidden (management routes), non-member forbidden, not-found cases, plus the accept-invite validation-order cases (not-found, not-pending, expired, email-mismatch, already-member-as-owner per Step 3's test).

- [ ] **Step 7: Run tests, confirm they pass**

Run: `yarn nx test notes`, `yarn nx test auth-client`, `yarn nx test api`
Expected: PASS, no regressions.

- [ ] **Step 8: Post-coding routine**

```bash
npx prettier --write apps/microservices/auth/src/app/auth.controller.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/auth/auth.controller.ts
yarn nx lint auth
yarn nx lint auth-client
yarn nx lint api
yarn nx build auth
yarn nx build auth-client
yarn nx build api
```

- [ ] **Step 9: Commit**

```bash
git add apps/microservices/auth/src/app/auth.controller.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/
git commit -m "feat(org-invite): wire invite lifecycle through MS handler, auth-client, gateway routes

6 new routes under apps/api/src/app/auth/auth.controller.ts (invite
create/list/revoke/resend, public preview, accept), matching the
existing GET auth/org/members convention rather than living in
notes.controller.ts. New checkOrgManage helper (owner-or-org-admin)
gates the management routes; checkOrgOwner-equivalent inline check in
acceptOrgInvite covers the one case AuthStrategy itself cannot (the
org owner accepting their own org's invite -- AuthStrategy has no
Organization awareness)."
```

---

## Task 8: Client UI — org settings "Members" section

**Files:**
- Create: `apps/client/src/queries/org-members.ts` (new query/mutation hooks)
- Create: `apps/client/src/routes/_dashboard/org/-members-section.tsx`
- Create: `apps/client/src/routes/_dashboard/org/-invite-member-dialog.tsx`
- Create: `apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx`
- Modify: `apps/client/src/routes/_dashboard/org/-org-page.tsx` (mount the new section)
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,ru,es,he}.ts` (new `org.members.*`/`org.invite.*` keys)

**Interfaces:**
- Consumes: the 6 gateway routes from Task 7.

- [ ] **Step 1: Add query hooks**

Create `apps/client/src/queries/org-members.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type OrgMemberRole = 'owner' | 'admin' | 'viewer';
export type OrgInviteRole = 'admin' | 'viewer';

export interface OrgMember {
  userId: string;
  role: OrgMemberRole;
  displayName?: string;
  email?: string;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  role: OrgInviteRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export function useOrgMembers(orgId: string) {
  return useQuery<OrgMember[]>({
    queryKey: ['org-members', orgId],
    queryFn: () => api<OrgMember[]>(`/auth/org/members?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useOrgInvites(orgId: string) {
  return useQuery<OrgInvite[]>({
    queryKey: ['org-invites', orgId],
    queryFn: () => api<OrgInvite[]>(`/auth/org/invites?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateOrgInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation<OrgInvite, Error, { email: string; role: OrgInviteRole }>({
    mutationFn: (body) =>
      api<OrgInvite>(`/auth/org/invites?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });
}

export function useRevokeOrgInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (inviteId) =>
      api<void>(`/auth/org/invites/${inviteId}?orgId=${encodeURIComponent(orgId)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });
}

export function useResendOrgInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation<OrgInvite, Error, string>({
    mutationFn: (inviteId) =>
      api<OrgInvite>(`/auth/org/invites/${inviteId}/resend?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });
}
```
(Confirm the exact route path style — query-param `?orgId=` vs `:id` — matches whatever Task 7 Step 1 actually confirmed and implemented; adjust these URLs to match if different.)

- [ ] **Step 2: Build the Members section component**

Create `apps/client/src/routes/_dashboard/org/-members-section.tsx`, following `-org-page.tsx`'s existing structure/state-shape convention (`useState` per overlay, Dialog for invite, AlertDialog for remove — see Steps 4-5 for those two files). List members (email/displayName, role badge, joined date placeholder — `OrgMember` has no `joinedAt` field per the current type; note it in the row only if present) and pending invites (email, role, expiry, Resend/Revoke buttons) in two sub-lists within one card/section, with an "Invite member" button.

- [ ] **Step 3: Build the Invite dialog**

Create `apps/client/src/routes/_dashboard/org/-invite-member-dialog.tsx`, following the Dialog+Select template from `-assets.page.tsx` (email `Input`, role `Select` with `admin`/`viewer` options, `DialogFooter` with Cancel/Send per this repo's convention).

- [ ] **Step 4: Build the Remove-member confirmation**

Create `apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx`, copying `-delete-org-dialog.tsx`'s exact structure (`AlertDialog`/`AlertDialogAction` destructive-variant `Button`), swapping `org.deleteTitle`/`org.deleteDescription` for `org.members.removeTitle`/`org.members.removeDescription`.

- [ ] **Step 5: Mount the Members section in the org page**

In `apps/client/src/routes/_dashboard/org/-org-page.tsx`, add the new `<MembersSection orgId={activeOrgId} />` (or per-org-row, depending on whether members are shown per-selected-org or per-row in the existing `OrgList` — since `OrgList` renders every org the user has, and members only make sense for a specific org, render the Members section only for the currently-`activeOrgId`, likely as an expandable row or a separate area below the list; use judgment consistent with this file's existing layout, this is a UI-layout decision the implementer makes directly, not a fixed prescription).

- [ ] **Step 6: i18n additions**

Add to `libs/template-shared/src/lib/i18n/locales/en.ts`, nested under the existing `org` key:
```ts
members: {
  title: 'Members',
  inviteButton: 'Invite Member',
  inviteTitle: 'Invite a Member',
  emailLabel: 'Email',
  roleLabel: 'Role',
  roleAdmin: 'Admin',
  roleViewer: 'Viewer',
  send: 'Send Invite',
  invited: 'Invitation sent',
  removeTitle: 'Remove Member',
  removeDescription: 'This person will lose access to this organization immediately.',
  removed: 'Member removed',
  pendingInvites: 'Pending Invites',
  resend: 'Resend',
  revoke: 'Revoke',
  revoked: 'Invite revoked',
  resent: 'Invite resent',
  noMembers: 'No members yet',
  noInvites: 'No pending invites',
},
```
Add equivalent translated blocks (same key structure) to `ru.ts`, `es.ts`, `he.ts` — translate the values, keep every key name identical across all 4 files (matching this repo's established i18n convention).

- [ ] **Step 7: Playwright verification (see Task 10 — deferred to end)**

This task's UI cannot be considered done until Task 10's end-to-end Playwright pass covers it, per `AGENTS.md`. Do not mark this task complete independently of Task 10.

- [ ] **Step 8: Post-coding routine**

```bash
npx prettier --write apps/client/src/queries/org-members.ts apps/client/src/routes/_dashboard/org/-members-section.tsx apps/client/src/routes/_dashboard/org/-invite-member-dialog.tsx apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx apps/client/src/routes/_dashboard/org/-org-page.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
```

- [ ] **Step 9: Commit**

```bash
git add apps/client/src/queries/org-members.ts apps/client/src/routes/_dashboard/org/-members-section.tsx apps/client/src/routes/_dashboard/org/-invite-member-dialog.tsx apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx apps/client/src/routes/_dashboard/org/-org-page.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts
git commit -m "feat(org-invite): add Members section to org settings (invite/list/remove)"
```

---

## Task 9: Client UI — `/accept-invite` public page

**Files:**
- Create: `apps/client/src/routes/accept-invite.tsx`
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,ru,es,he}.ts` (new top-level `acceptInvite` namespace)

**Interfaces:**
- Consumes: `GET auth/org-invites/:token` (public preview) and `POST auth/org-invites/:token/accept` from Task 7.

- [ ] **Step 1: Build the route**

Create `apps/client/src/routes/accept-invite.tsx`, structured like `login.tsx` (component-level auth-state branching, no `beforeLoad` redirect, since this page must render for both logged-out and logged-in users):

```tsx
import { useEffect, useState } from 'react';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import { useNotify } from '@icore/template-shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface InvitePreview {
  orgName: string;
  role: string;
  email: string;
  expiresAt: string;
}

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>) => ({ token: String(search['token'] ?? '') }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { token } = useSearch({ from: '/accept-invite' });
  const accessToken = useAuthStore((s) => s.accessToken);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InvitePreview>(`/auth/org-invites/${token}`)
      .then(setPreview)
      .catch(() => setError(t('acceptInvite.notFound')));
  }, [token, t]);

  async function handleAccept() {
    setAccepting(true);
    try {
      await api(`/auth/org-invites/${token}/accept`, { method: 'POST' });
      setAccepted(true);
      notify.success(t('acceptInvite.success'));
    } catch {
      notify.error(t('acceptInvite.failed'));
    } finally {
      setAccepting(false);
    }
  }

  if (error) return <div className="p-6">{error}</div>;
  if (!preview) return <div className="p-6">{t('common.loading')}</div>;

  if (!accessToken) {
    return (
      <div className="p-6 space-y-4">
        <p>{t('acceptInvite.preview', { orgName: preview.orgName, role: preview.role })}</p>
        <p className="text-sm text-muted-foreground">{t('acceptInvite.loginPrompt')}</p>
        {/* Reuse existing login/register navigation, carrying ?token= through via the
            same query-param-preserving pattern login.tsx already uses for its own
            redirect-after-auth flow -- confirm the exact mechanism in login.tsx before
            writing this link/redirect. */}
      </div>
    );
  }

  if (accepted) return <div className="p-6">{t('acceptInvite.doneRedirect')}</div>;

  return (
    <div className="p-6 space-y-4">
      <p>{t('acceptInvite.preview', { orgName: preview.orgName, role: preview.role })}</p>
      <Button onClick={() => void handleAccept()} disabled={accepting}>
        {t('acceptInvite.acceptButton')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: i18n additions**

Add a new top-level namespace to all 4 locale files:
```ts
acceptInvite: {
  notFound: 'This invite link is invalid or has expired.',
  preview: 'You\'ve been invited to join {{orgName}} as {{role}}.',
  loginPrompt: 'Log in or create an account to accept this invite.',
  acceptButton: 'Accept Invite',
  success: 'You\'ve joined the organization',
  failed: 'Could not accept this invite',
  doneRedirect: 'You\'re in! Redirecting…',
},
```
Translate values for `ru.ts`/`es.ts`/`he.ts`, identical keys.

- [ ] **Step 3: Post-coding routine**

```bash
npx prettier --write apps/client/src/routes/accept-invite.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/accept-invite.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts
git commit -m "feat(org-invite): add public /accept-invite page"
```

---

## Task 10: Mandatory Playwright verification and final integration check

Per `AGENTS.md`'s UI Work Rules ("Playwright before 'done'... No exceptions"), this feature is not complete until verified live in a browser. Using the Fake strategies (dev server default):

- [ ] **Step 1: Start dev servers** (client + api gateway + auth MS + notes MS) using Fake strategies.
- [ ] **Step 2: Sign up as User A**, create an org.
- [ ] **Step 3: From the org's Members section, invite User B's email as `viewer`.** Confirm the invite appears in the Pending Invites list.
- [ ] **Step 4: In a separate browser context (or after logging out), navigate to the `/accept-invite?token=...` link** (retrieve the token from the Fake strategy's in-memory state or a captured log, since no real email is sent in dev — confirm how this session's prior features surfaced Fake-strategy tokens for manual testing, e.g. a console log, and use the same convention).
- [ ] **Step 5: Confirm the pre-auth preview renders** ("You've been invited to join {org} as viewer").
- [ ] **Step 6: Sign up/log in as User B**, return to the accept-invite page, click Accept.
- [ ] **Step 7: Confirm User B now sees the org in `OrgSwitcher`** (proves Task 1's fix works) and can switch into it.
- [ ] **Step 8: Confirm User B has read access** (can view a resource in the org, e.g. a policy or risk) **and a write attempt is blocked** — both at the UI level (if any write affordance is visible) and by direct API call if needed (e.g. attempt `PATCH` on a policy as User B, confirm 403).
- [ ] **Step 9: As User A, revoke a different pending invite**, confirm it disappears from the Pending list and the (unused) token no longer resolves via the preview route.
- [ ] **Step 10: Take screenshots at each major step as evidence**, per this repo's "no self-report without proof" rule.
- [ ] **Step 11: Run the full workspace test suite**: `yarn nx run-many -t test` — expect all projects green.
- [ ] **Step 12: Run `yarn format:check`** (whole repo) before considering the branch ready — a prior phase this session had a Prettier drift slip past per-file checks and only got caught by CI.

## Final Integration Check

This branch touches a migration (not yet applied — deferred until after merge, per this session's established pattern) and client UI (Playwright-verified above, mandatory before completion). Run the full test suite one more time after all 10 tasks land, confirm `yarn format:check` is clean, then proceed to the final whole-branch review.
