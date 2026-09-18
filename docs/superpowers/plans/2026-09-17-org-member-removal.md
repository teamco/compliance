# Org Member Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org owner or org-admin deactivate a member (and let any non-owner member leave on their own), soft-deleting the `organization_members` row so the person loses access on their next request without any separate session/token revocation.

**Architecture:** One new column (`is_active`) on the existing `organization_members` table. Both `AuthStrategy` implementations (`FakeAuthStrategy`, `SupabaseAuthStrategy`) filter every membership read to active rows and gain a `deactivateOrgMember` method; `acceptOrgInvite` is extended to reactivate a deactivated row instead of erroring. The gateway exposes this through the same RPC-over-TCP → HTTP path every other org-scoped auth operation already uses (gateway `AuthController` → `AuthClientService` → auth microservice `@MessagePattern` → strategy). The client gets one new mutation hook and a "Remove" button on each member row.

**Tech Stack:** NestJS (gateway + auth microservice), TCP transport (`@nestjs/microservices`), Supabase (Postgres + RLS), React 19 + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-org-member-removal-design.md`

## Global Constraints

- **Soft-deactivate, never hard-delete.** `organization_members` rows persist forever; a boolean flag marks them inactive.
- **The org owner can never be deactivated** — not by an admin, not by themselves. Org deletion is their only way out.
- **Any non-owner member can deactivate themselves** ("leave"), independent of `checkOrgManage`. Deactivating *someone else* requires `checkOrgManage` (owner or org-admin) — the exact same permission tier invite management already uses; an admin can deactivate another admin.
- **`OrgMember.isActive` is optional**, not required — `undefined` and `true` both mean active. This avoids touching every existing `OrgMember` test fixture across the codebase for a field whose default is already what those fixtures mean.
- **`orgId` is always a query param, the resource id is the path param** — matches every existing route in `apps/api/src/app/auth/auth.controller.ts` (`GET org/members`, `POST/GET/DELETE org/invites`, `POST org/invites/:inviteId/resend`).
- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>`, all green.
- Playwright verification is mandatory before this plan is reported done (per `AGENTS.md`) — Task 7 ends with it.

---

### Task 1: Migration — `is_active` column on `organization_members`

**Files:**
- Create: `supabase/migrations/20260917000002_organization_members_is_active.sql`

**Interfaces:**
- Produces: the `is_active boolean not null default true` column every later task's Supabase queries filter on.

- [ ] **Step 1: Write the migration**

```sql
alter table public.organization_members
  add column is_active boolean not null default true;
```

Postgres backfills the `default true` value onto every existing row when adding a `not null` column this way — no separate `update` statement needed, and no behavior change for any currently-active membership. No RLS policy change: `organization_members`'s existing `org_members_own` policy (`20260607000007_multi_org.sql`) already covers `for all` on this table, and this is a column addition, not a new table.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260917000002_organization_members_is_active.sql
git commit -m "feat(db): add is_active column to organization_members"
```

This migration applies to the real Supabase project automatically via this repo's CI "Supabase db push" pipeline step when the branch merges to `dev` — no manual `supabase db push` needed locally (the CLI isn't installed in this worktree, and every prior migration in this codebase, including `20260917000001_organization_invites.sql`, shipped the same way).

---

### Task 2: `AuthStrategy` interface + `FakeAuthStrategy`

**Files:**
- Modify: `libs/shared/src/strategies/auth.ts` (interface + `OrgMember` type)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Test: `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `AuthStrategy.deactivateOrgMember(orgId: string, userId: string): Promise<void>`, `OrgMember.isActive?: boolean`. Task 3 (`SupabaseAuthStrategy`) implements the same interface method; Task 4 (MS controller) calls `this.strategy.deactivateOrgMember(...)`.

- [ ] **Step 1: Add `isActive` to `OrgMember` and `deactivateOrgMember` to `AuthStrategy`**

In `libs/shared/src/strategies/auth.ts`, change:

```ts
export interface OrgMember {
  userId: string;
  displayName?: string;
  email?: string;
  role: string;
}
```

to:

```ts
export interface OrgMember {
  userId: string;
  displayName?: string;
  email?: string;
  role: string;
  isActive?: boolean; // absent or true = active; false = deactivated
}
```

And add one line to the `AuthStrategy` interface, directly after `acceptOrgInvite`:

```ts
  acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember>;
  deactivateOrgMember(orgId: string, userId: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`, after the closing `});` of the `describe('FakeAuthStrategy.listOrgIdsForMember', ...)` block (currently ending at line 89) and before `describe('org invites', ...)`:

```ts
describe('FakeAuthStrategy.deactivateOrgMember', () => {
  it('flips isActive to false on the member row', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'member-1', role: 'viewer' });

    await strategy.deactivateOrgMember('org-1', 'member-1');

    const members = await strategy.listOrgMembers('org-1');
    expect(members).toEqual([]);
  });

  it('is a no-op when the user is not a member', async () => {
    const strategy = new FakeAuthStrategy();
    await expect(strategy.deactivateOrgMember('org-1', 'nobody')).resolves.toBeUndefined();
  });
});
```

Extend the existing `describe('FakeAuthStrategy.listOrgMembers', ...)` block with one more `it`, after `'returns only seeded members when ownerId is not provided (back-compat)'`:

```ts
  it('excludes deactivated members', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'member-1', role: 'viewer', isActive: false });
    strategy.seedOrgMember('org-1', { userId: 'member-2', role: 'admin' });

    const members = await strategy.listOrgMembers('org-1');

    expect(members.map((m) => m.userId)).toEqual(['member-2']);
  });
```

Extend `describe('FakeAuthStrategy.listOrgIdsForMember', ...)` with:

```ts
  it('excludes orgs where the membership is deactivated', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'user-a', role: 'viewer', isActive: false });
    strategy.seedOrgMember('org-2', { userId: 'user-a', role: 'admin' });

    const orgIds = await strategy.listOrgIdsForMember('user-a');

    expect(orgIds).toEqual(['org-2']);
  });
```

Add to the `describe('org invites', ...)` block, after the existing `'rejects accepting when already a member'` test:

```ts
  it('reactivates a deactivated member instead of erroring, applying the new role', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'returning-user', role: 'viewer', isActive: false });
    const invite = await strategy.createOrgInvite(
      'org-1',
      'returning@example.com',
      'admin',
      'owner-1',
    );

    const member = await strategy.acceptOrgInvite(
      invite.token,
      'returning-user',
      'returning@example.com',
    );

    expect(member.role).toBe('admin');
    const members = await strategy.listOrgMembers('org-1');
    expect(members).toContainEqual(
      expect.objectContaining({ userId: 'returning-user', role: 'admin', isActive: true }),
    );
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn nx test shared -- src/strategies/fakes/__tests__/fake-auth.unit.test.ts` (run from the repo root; `shared`'s vitest config uses the `src/...` relative path form)
Expected: FAIL — `strategy.deactivateOrgMember is not a function`, and the two new filter tests fail because nothing filters yet.

- [ ] **Step 4: Implement in `FakeAuthStrategy`**

In `libs/shared/src/strategies/fakes/fake-auth.ts`, change `listOrgMembers`:

```ts
  async listOrgMembers(orgId: string, ownerId?: string): Promise<OrgMember[]> {
    const members = (this.orgMembers.get(orgId) ?? []).filter((m) => m.isActive !== false);
    if (!ownerId || members.some((m) => m.userId === ownerId)) return members;
    const owner = [...this.users.values()].find((u) => u.id === ownerId);
    return [{ userId: ownerId, role: 'owner', email: owner?.email }, ...members];
  }
```

Change `listOrgIdsForMember`:

```ts
  async listOrgIdsForMember(userId: string): Promise<string[]> {
    const result: string[] = [];
    for (const [orgId, members] of this.orgMembers.entries()) {
      if (members.some((m) => m.userId === userId && m.isActive !== false)) result.push(orgId);
    }
    return result;
  }
```

Change `acceptOrgInvite`'s membership-creation block (everything from `const existingMembers = ...` down to the `return member;` line) to:

```ts
    const existingMembers = this.orgMembers.get(invite.orgId) ?? [];
    const existing = existingMembers.find((m) => m.userId === userId);
    let member: OrgMember;
    if (existing) {
      if (existing.isActive !== false) throw new Error('invite_already_member');
      existing.isActive = true;
      existing.role = invite.role;
      member = existing;
    } else {
      member = { userId, role: invite.role, isActive: true };
      this.orgMembers.set(invite.orgId, [...existingMembers, member]);
    }
    invite.status = 'accepted';
    invite.acceptedAt = new Date().toISOString();
    return member;
```

Add a new method, directly after `acceptOrgInvite`:

```ts
  async deactivateOrgMember(orgId: string, userId: string): Promise<void> {
    const member = (this.orgMembers.get(orgId) ?? []).find((m) => m.userId === userId);
    if (member) member.isActive = false;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn nx test shared`
Expected: PASS — all `fake-auth.unit.test.ts` tests, including the new ones, plus every pre-existing test in the `shared` project (the `'rejects accepting when already a member'` test at line 174 seeds a member with no `isActive` field, which is `!== false`, so it still hits the `invite_already_member` branch unchanged).

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
git commit -m "feat(auth): add deactivateOrgMember and active-only membership filtering to FakeAuthStrategy"
```

---

### Task 3: `SupabaseAuthStrategy`

**Files:**
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`

**Interfaces:**
- Consumes: `AuthStrategy.deactivateOrgMember` signature from Task 2.
- Produces: same method, implemented against the real `organization_members` table. No new unit tests — this codebase has no existing unit tests for `SupabaseAuthStrategy`'s org-invite/member methods (verified: `libs/auth-strategies/supabase/src/lib/__tests__/` has no test file referencing `acceptOrgInvite` or `listOrgMembers`); correctness here is verified live in Task 7's Playwright pass plus this task's own lint/build.

- [ ] **Step 1: Filter `listOrgMembers` to active rows**

In `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`, change the `organization_members` select inside `listOrgMembers` from:

```ts
    const { data: members, error } = await this.client
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId);
```

to:

```ts
    const { data: members, error } = await this.client
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId)
      .eq('is_active', true);
```

- [ ] **Step 2: Filter `listOrgIdsForMember` to active rows**

Change:

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

to:

```ts
  async listOrgIdsForMember(userId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r['org_id'] as string);
  }
```

- [ ] **Step 3: Reactivate a deactivated member in `acceptOrgInvite`**

Change the membership-creation block inside `acceptOrgInvite` from:

```ts
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
```

to:

```ts
    const { data: existing } = await this.client
      .from('organization_members')
      .select('id, is_active')
      .eq('org_id', invite.orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if (existing['is_active']) throw new Error('invite_already_member');
      const { error: reactivateError } = await this.client
        .from('organization_members')
        .update({ is_active: true, role: invite.role })
        .eq('id', existing['id']);
      if (reactivateError) throw new Error(reactivateError.message);
    } else {
      const { error: insertError } = await this.client
        .from('organization_members')
        .insert({ org_id: invite.orgId, user_id: userId, role: invite.role });
      if (insertError) throw new Error(insertError.message);
    }
```

The rest of `acceptOrgInvite` (the `organization_invites` status update and `return { userId, role: invite.role };`) is unchanged.

- [ ] **Step 4: Add `deactivateOrgMember`**

Add a new method directly after `acceptOrgInvite`'s closing brace:

```ts
  async deactivateOrgMember(orgId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('organization_members')
      .update({ is_active: false })
      .eq('org_id', orgId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
```

- [ ] **Step 5: Build to catch type errors**

Run: `yarn nx build auth-supabase`
Expected: builds clean — `SupabaseAuthStrategy` still satisfies the `AuthStrategy` interface with the new method present.

- [ ] **Step 6: Commit**

```bash
git add libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts
git commit -m "feat(auth): add deactivateOrgMember and active-only membership filtering to SupabaseAuthStrategy"
```

---

### Task 4: Auth microservice handler + gateway RPC client

**Files:**
- Modify: `apps/microservices/auth/src/app/auth.controller.ts`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`

**Interfaces:**
- Consumes: `AuthStrategy.deactivateOrgMember` (Task 2/3).
- Produces: `AuthClientService.deactivateOrgMember(orgId: string, userId: string): Promise<void>`, which Task 5's gateway route calls.

- [ ] **Step 1: Add the `@MessagePattern` handler**

In `apps/microservices/auth/src/app/auth.controller.ts`, add directly after the `acceptOrgInvite` handler (after its closing `}`):

```ts
  @MessagePattern('auth.org.members.deactivate')
  deactivateOrgMember(@Payload() payload: { orgId: string; userId: string }): Promise<void> {
    return this.strategy.deactivateOrgMember(payload.orgId, payload.userId);
  }
```

- [ ] **Step 2: Add the gateway-side RPC client method**

In `libs/auth-client/src/lib/auth-client.service.ts`, add directly after `acceptOrgInvite`:

```ts
  deactivateOrgMember(orgId: string, userId: string): Promise<void> {
    return signedSend<void>(this.client, 'auth.org.members.deactivate', { orgId, userId });
  }
```

- [ ] **Step 3: Build both projects**

Run: `yarn nx build auth` (the microservice project) and `yarn nx build auth-client`
Expected: both build clean.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/auth/src/app/auth.controller.ts libs/auth-client/src/lib/auth-client.service.ts
git commit -m "feat(auth): wire deactivateOrgMember through the auth microservice and gateway RPC client"
```

---

### Task 5: Gateway HTTP route

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `AuthClientService.deactivateOrgMember` (Task 4), `checkOrgManage` (existing private method, `auth.controller.ts:363-369`).
- Produces: `DELETE /api/auth/org/members/:userId?orgId=...`, `204` on success. Task 6's client hook calls this exact path and method.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, as a new `describe` block placed after the closing of `describe('resendOrgInvite', ...)` (before the final closing `});` of `describe('AuthController (gateway) — org invite management routes', ...)` — i.e. as a sibling of `createOrgInvite`/`listOrgInvites`/`revokeOrgInvite`/`resendOrgInvite`):

```ts
  describe('deactivateOrgMember', () => {
    it('rejects a missing orgId', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(reqAs('owner-1'), '', 'member-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('owner-1'),
          'org-1',
          'member-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids deactivating the org owner, even by the owner themselves', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'owner' }]),
      });
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('owner-1'),
          'org-1',
          'owner-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.deactivateOrgMember).not.toHaveBeenCalled();
    });

    it('allows the org owner to deactivate an admin', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([
          { userId: 'owner-1', role: 'owner' },
          { userId: 'admin-1', role: 'admin' },
        ]),
      });
      await makeInviteController(notes, auth).deactivateOrgMember(
        reqAs('owner-1'),
        'org-1',
        'admin-1',
      );
      expect(auth.deactivateOrgMember).toHaveBeenCalledWith('org-1', 'admin-1');
    });

    it('allows an org-admin to deactivate another admin', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([
          { userId: 'admin-1', role: 'admin' },
          { userId: 'admin-2', role: 'admin' },
        ]),
      });
      await makeInviteController(notes, auth).deactivateOrgMember(
        reqAs('admin-1'),
        'org-1',
        'admin-2',
      );
      expect(auth.deactivateOrgMember).toHaveBeenCalledWith('org-1', 'admin-2');
    });

    it('rejects a viewer deactivating someone else', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([
          { userId: 'viewer-1', role: 'viewer' },
          { userId: 'viewer-2', role: 'viewer' },
        ]),
      });
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('viewer-1'),
          'org-1',
          'viewer-2',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.deactivateOrgMember).not.toHaveBeenCalled();
    });

    it('allows a viewer to deactivate themselves (leave)', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
      });
      await makeInviteController(notes, auth).deactivateOrgMember(
        reqAs('viewer-1'),
        'org-1',
        'viewer-1',
      );
      expect(auth.deactivateOrgMember).toHaveBeenCalledWith('org-1', 'viewer-1');
    });

    it('404s when the target is not a member of the org', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'owner' }]),
      });
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('owner-1'),
          'org-1',
          'not-a-member',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(auth.deactivateOrgMember).not.toHaveBeenCalled();
    });
  });
```

Also add `deactivateOrgMember: vi.fn().mockResolvedValue(undefined),` to the `makeInviteAuthClient` fixture function (around line 241-252), alongside the existing `acceptOrgInvite: vi.fn()...` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn nx test api -- src/app/auth/__tests__/auth.controller.unit.test.ts`
Expected: FAIL — `makeInviteController(...).deactivateOrgMember is not a function`.

- [ ] **Step 3: Implement the route**

In `apps/api/src/app/auth/auth.controller.ts`, add directly after the `resendOrgInvite` handler (after its closing `}`, before the `@Public()` decorator that starts the next section):

```ts
  @Delete('org/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deactivate an org member, or leave an org by removing yourself' })
  async deactivateOrgMember(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    if (userId === org.userId) throw new ForbiddenException('cannot_deactivate_owner');

    const actorUid = this.uid(req);
    if (actorUid !== userId) {
      await this.checkOrgManage(req, org);
    }

    const members = await this.authClient.listOrgMembers(orgId, org.userId);
    if (!members.some((m) => m.userId === userId)) throw new NotFoundException();

    return this.authClient.deactivateOrgMember(orgId, userId);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn nx test api`
Expected: PASS — all tests in the `api` project, including the 8 new `deactivateOrgMember` tests and every pre-existing test (no other route's behavior changed).

- [ ] **Step 5: Lint and build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(api): add DELETE /auth/org/members/:userId route for deactivating a member"
```

---

### Task 6: Client mutation hook + i18n keys

**Files:**
- Modify: `apps/client/src/queries/org-members.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`

**Interfaces:**
- Consumes: `DELETE /auth/org/members/:userId?orgId=...` (Task 5).
- Produces: `useDeactivateOrgMember(orgId: string)` returning a `useMutation` object whose `mutateAsync` takes a `userId: string` — Task 7's UI calls this exact hook.

- [ ] **Step 1: Add the mutation hook**

In `apps/client/src/queries/org-members.ts`, add at the end of the file, after `useResendOrgInvite`:

```ts
export function useDeactivateOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (userId) =>
      api<void>(`/auth/org/members/${userId}?orgId=${encodeURIComponent(orgId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      // Covers self-removal: the org list (creator's orgs unioned with
      // listOrgIdsForMember) must drop this org from the switcher too.
      qc.invalidateQueries({ queryKey: ['notes', 'orgs'] });
    },
  });
}
```

- [ ] **Step 2: Add the i18n keys**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, in the `org.members` block, add these five lines directly after the existing `removed: 'Member removed',` line (line 308):

```ts
      remove: 'Remove',
      leave: 'Leave',
      leaveTitle: 'Leave Organization',
      leaveDescription: "You'll lose access to this organization immediately.",
      left: 'You left the organization',
```

In `libs/template-shared/src/lib/i18n/locales/ru.ts`, directly after `removed: 'Участник удалён',` (line 299):

```ts
      remove: 'Удалить',
      leave: 'Покинуть',
      leaveTitle: 'Покинуть организацию',
      leaveDescription: 'Вы немедленно потеряете доступ к этой организации.',
      left: 'Вы покинули организацию',
```

In `libs/template-shared/src/lib/i18n/locales/he.ts`, directly after `removed: 'החבר הוסר',` (line 294):

```ts
      remove: 'הסר',
      leave: 'עזוב',
      leaveTitle: 'עזיבת הארגון',
      leaveDescription: 'תאבד גישה לארגון זה באופן מיידי.',
      left: 'עזבת את הארגון',
```

In `libs/template-shared/src/lib/i18n/locales/es.ts`, directly after `removed: 'Miembro eliminado',` (line 307):

```ts
      remove: 'Eliminar',
      leave: 'Salir',
      leaveTitle: 'Salir de la organización',
      leaveDescription: 'Perderás el acceso a esta organización de inmediato.',
      left: 'Has salido de la organización',
```

(`removeTitle`, `removeDescription`, and `removed` already exist in all four locale files from the original org-invite feature — they were added ahead of a UI that never got built, and this task is the first to actually use them, for the "manager removes someone else" case. This step adds the parallel "leave" set for self-removal.)

- [ ] **Step 3: Build to verify no missing-import or type errors**

Run: `yarn nx build client` and `yarn nx build template-shared`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/queries/org-members.ts libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): add useDeactivateOrgMember hook and leave-org i18n copy"
```

---

### Task 7: UI — Remove/Leave button and confirmation dialog

**Files:**
- Create: `apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx`
- Modify: `apps/client/src/routes/_dashboard/org/-members-section.tsx`
- Test: `apps/client/src/routes/_dashboard/__tests__/org.unit.test.tsx`

**Interfaces:**
- Consumes: `useDeactivateOrgMember` (Task 6), `useActiveOrgStore` (`@/stores/active-org`, existing), `canManage`/`myUid` (existing local state in `-members-section.tsx`).
- Produces: nothing further consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the confirmation dialog component**

Create `apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RemoveMemberDialogProps {
  open: boolean;
  isPending: boolean;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RemoveMemberDialog({
  open,
  isPending,
  isSelf,
  onOpenChange,
  onConfirm,
}: RemoveMemberDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSelf ? t('org.members.leaveTitle') : t('org.members.removeTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSelf ? t('org.members.leaveDescription') : t('org.members.removeDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
              {isSelf ? t('org.members.leave') : t('org.members.remove')}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/client/src/routes/_dashboard/__tests__/org.unit.test.tsx`, add `useDeactivateOrgMember: () => ({ mutateAsync: deactivateMutateAsync, isPending: false }),` to the existing `vi.mock('@/queries/org-members', ...)` block, and declare `const deactivateMutateAsync = vi.fn();` alongside the file's existing top-level `const createMutateAsync = vi.fn();` / `updateMutateAsync` / `deleteMutateAsync` declarations.

Add a new `describe` block at the end of the file, after the closing of `describe('MembersSection role gating', ...)`:

```ts
describe('MembersSection remove/leave button', () => {
  beforeEach(() => {
    mockOrgs = [ORG_1];
    mockIsPending = false;
    mockActiveOrgId = 'org-1';
    deactivateMutateAsync.mockClear();
  });

  it('shows Remove on another member for the owner', () => {
    mockAuthUserId = 'u-1'; // ORG_1.userId
    mockMembers = [{ userId: 'viewer-1', role: 'viewer' }];
    render(wrap(<OrgPage />));
    expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy();
  });

  it('shows Leave on the current user\'s own row when they are not the owner', () => {
    mockAuthUserId = 'viewer-1';
    mockMembers = [{ userId: 'viewer-1', role: 'viewer' }];
    render(wrap(<OrgPage />));
    expect(screen.getByRole('button', { name: /leave/i })).toBeTruthy();
  });

  it('hides any remove/leave control on the owner\'s own row', () => {
    mockAuthUserId = 'u-1'; // ORG_1.userId
    // The mocked useOrgMembers returns exactly mockMembers with no implicit
    // owner union (that union only happens server-side) — the owner's own
    // row must be included explicitly for it to render at all here.
    mockMembers = [{ userId: 'u-1', role: 'owner' }];
    render(wrap(<OrgPage />));
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /leave/i })).toBeNull();
  });

  it('hides Remove for a viewer looking at another member', () => {
    mockAuthUserId = 'viewer-1';
    mockMembers = [
      { userId: 'viewer-1', role: 'viewer' },
      { userId: 'viewer-2', role: 'viewer' },
    ];
    render(wrap(<OrgPage />));
    expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull();
  });

  it('confirms and calls deactivate with the target userId', async () => {
    mockAuthUserId = 'u-1';
    mockMembers = [{ userId: 'viewer-1', role: 'viewer' }];
    render(wrap(<OrgPage />));
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    // The row's own trigger button is also named "Remove" and stays mounted
    // behind the (mocked) dialog, so disambiguate by scoping to the dialog —
    // same pattern the existing delete-org confirm test already uses above.
    const confirmBtn = screen
      .getAllByRole('button', { name: /remove/i })
      .find((btn) => btn.closest('[data-testid="alert-dialog"]'));
    if (!confirmBtn) throw new Error('Expected a remove confirmation button to be rendered');
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deactivateMutateAsync).toHaveBeenCalledWith('viewer-1'));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn nx test client -- src/routes/_dashboard/__tests__/org.unit.test.tsx`
Expected: FAIL — no Remove/Leave button exists yet.

- [ ] **Step 4: Wire the button into `-members-section.tsx`**

In `apps/client/src/routes/_dashboard/org/-members-section.tsx`:

Change the imports at the top from:

```tsx
import { useState } from 'react';
import { Users, UserPlus, RotateCw, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import {
  useOrgMembers,
  useOrgInvites,
  useRevokeOrgInvite,
  useResendOrgInvite,
  type OrgMemberRole,
} from '@/queries/org-members';
import type { Organization } from '@/queries/notes';
import { Button } from '@/components/ui/button';
import { InviteMemberDialog } from './-invite-member-dialog';
```

to:

```tsx
import { useState } from 'react';
import { Users, UserPlus, RotateCw, XCircle, UserMinus, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import {
  useOrgMembers,
  useOrgInvites,
  useRevokeOrgInvite,
  useResendOrgInvite,
  useDeactivateOrgMember,
  type OrgMemberRole,
} from '@/queries/org-members';
import type { Organization } from '@/queries/notes';
import { useActiveOrgStore } from '@/stores/active-org';
import { Button } from '@/components/ui/button';
import { InviteMemberDialog } from './-invite-member-dialog';
import { RemoveMemberDialog } from './-remove-member-dialog';
```

Change the top of the component body from:

```tsx
export function MembersSection({ org }: MembersSectionProps) {
  const orgId = org.id;
  const { t } = useTranslation();
  const notify = useNotify();
  const myUid = useAuthStore((s) => s.user?.id);
  const { data: members, isPending: membersPending } = useOrgMembers(orgId);
  const { data: invites, isPending: invitesPending } = useOrgInvites(orgId);
  const revokeInvite = useRevokeOrgInvite(orgId);
  const resendInvite = useResendOrgInvite(orgId);
  const [inviteOpen, setInviteOpen] = useState(false);

  const memberList = members ?? [];
  const inviteList = invites ?? [];
  const myMembership = memberList.find((m) => m.userId === myUid);
  const canManage = org.userId === myUid || myMembership?.role === 'admin';
```

to:

```tsx
export function MembersSection({ org }: MembersSectionProps) {
  const orgId = org.id;
  const { t } = useTranslation();
  const notify = useNotify();
  const myUid = useAuthStore((s) => s.user?.id);
  const { activeOrgId, setActiveOrgId } = useActiveOrgStore();
  const { data: members, isPending: membersPending } = useOrgMembers(orgId);
  const { data: invites, isPending: invitesPending } = useOrgInvites(orgId);
  const revokeInvite = useRevokeOrgInvite(orgId);
  const resendInvite = useResendOrgInvite(orgId);
  const deactivateMember = useDeactivateOrgMember(orgId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  const memberList = members ?? [];
  const inviteList = invites ?? [];
  const myMembership = memberList.find((m) => m.userId === myUid);
  const canManage = org.userId === myUid || myMembership?.role === 'admin';
```

Add a new handler function, directly after `handleResend`:

```tsx
  async function handleRemove(userId: string) {
    try {
      await deactivateMember.mutateAsync(userId);
      const isSelf = userId === myUid;
      notify.success(t(isSelf ? 'org.members.left' : 'org.members.removed'));
      if (isSelf && activeOrgId === orgId) setActiveOrgId(null);
    } catch {
      notify.error(t('error.unknown'));
    } finally {
      setRemoveTargetId(null);
    }
  }
```

Change the member row rendering from:

```tsx
          memberList.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {member.displayName || member.email || member.userId}
                </p>
                {member.email && member.displayName && (
                  <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                )}
              </div>
              <span
                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                  ROLE_STYLES[member.role] || ROLE_STYLES.viewer
                }`}
              >
                {t(`org.members.role${capitalize(member.role)}` as never, {
                  defaultValue: member.role,
                })}
              </span>
            </div>
          ))
```

to:

```tsx
          memberList.map((member) => {
            const isSelf = member.userId === myUid;
            const canRemove = (canManage || isSelf) && member.userId !== org.userId;
            return (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {member.displayName || member.email || member.userId}
                  </p>
                  {member.email && member.displayName && (
                    <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                      ROLE_STYLES[member.role] || ROLE_STYLES.viewer
                    }`}
                  >
                    {t(`org.members.role${capitalize(member.role)}` as never, {
                      defaultValue: member.role,
                    })}
                  </span>
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t(isSelf ? 'org.members.leave' : 'org.members.remove')}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTargetId(member.userId)}
                    >
                      {isSelf ? <LogOut size={13} /> : <UserMinus size={13} />}
                      <span className="sr-only">
                        {t(isSelf ? 'org.members.leave' : 'org.members.remove')}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })
```

Add the dialog mount at the end of the component's returned JSX, directly after `<InviteMemberDialog ... />`:

```tsx
      <RemoveMemberDialog
        open={removeTargetId !== null}
        isPending={deactivateMember.isPending}
        isSelf={removeTargetId === myUid}
        onOpenChange={(open) => {
          if (!open) setRemoveTargetId(null);
        }}
        onConfirm={() => {
          if (removeTargetId) void handleRemove(removeTargetId);
        }}
      />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn nx test client`
Expected: PASS — every test in the `client` project, including the 5 new ones from Step 2 and the pre-existing `MembersSection role gating` tests (unaffected — they only assert on the Invite Member button).

- [ ] **Step 6: Lint and build**

```bash
npx prettier --write apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx apps/client/src/routes/_dashboard/org/-members-section.tsx apps/client/src/routes/_dashboard/__tests__/org.unit.test.tsx
yarn nx lint client
yarn nx build client
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/routes/_dashboard/org/-remove-member-dialog.tsx apps/client/src/routes/_dashboard/org/-members-section.tsx apps/client/src/routes/_dashboard/__tests__/org.unit.test.tsx
git commit -m "feat(client): add Remove/Leave button and confirmation dialog to org members section"
```

- [ ] **Step 8: Mandatory live Playwright verification**

Per `AGENTS.md`, this is not optional and cannot be skipped or replaced with "the code looks correct."

Start the full stack (`yarn dev`, with the same transport-only `.env` files this session has used for every prior worktree — gateway + auth/upload/notes/ai microservices, `*_PROVIDER` vars left unset so `FakeAuthStrategy`/`FakeNotesStrategy` are used). Using the Playwright MCP tools:

1. Sign up as user A. Create an org. Invite user B as `admin` via the UI; capture the invite token from the `POST .../org/invites` network response body (same technique used in this session's prior org-invite verifications).
2. Sign up as user B in a fresh (localStorage-cleared) session, navigate to `/accept-invite?token=<token>`, accept it.
3. As user A (owner), open the org's Members section. Confirm user B (admin) now shows a "Remove" control. Click it, confirm the dialog reads the manager copy ("Remove Member" / "This person will lose access..."), confirm. Verify user B disappears from the members list.
4. As user B, refresh any page under `/org` or attempt any org-scoped API call. Confirm they no longer have access to that org (the org no longer appears in their org switcher, and directly hitting a route scoped to that org's data is rejected) — this is the "no separate token revocation needed" claim from the spec, verified live, not assumed.
5. Re-invite user B to the same org (same email). Confirm the invite email/UI doesn't error, accept it as user B, and confirm they're a member again — this is the reactivation path.
6. As user B, this time acting on themselves: open Members, confirm their own row shows "Leave" (not "Remove"), confirm the dialog reads the leave copy, confirm, and verify they're removed from the org and it disappears from their own org switcher.
7. Confirm the org owner's own row never shows a Remove or Leave control, in any of the above screens.

Capture a screenshot at step 3 (removed) and step 6 (left) as evidence, per this repo's "no self-report without proof" rule.

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-09-17-org-member-removal-design.md` maps to a task — data model → Task 1, strategy changes (`listOrgMembers`, `listOrgIdsForMember`, `acceptOrgInvite` reactivation, `deactivateOrgMember`) → Tasks 2-3, gateway route → Tasks 4-5, client → Tasks 6-7, testing section → each task's own Step 2/3, live verification → Task 7 Step 8.
- **Type consistency checked:** `deactivateOrgMember(orgId: string, userId: string): Promise<void>` is identical across the `AuthStrategy` interface (Task 2), both implementations (Tasks 2-3), the MS `@MessagePattern` payload shape (Task 4), `AuthClientService` (Task 4), and the gateway route's call site (Task 5). The client hook's `mutationFn` parameter (Task 6) is `userId: string`, matching what Task 7's `handleRemove(userId: string)` passes in.
- **No placeholders:** every step above contains complete, exact code — no "add appropriate handling" language anywhere in this plan.
