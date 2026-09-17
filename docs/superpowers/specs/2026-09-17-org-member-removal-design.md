# Org Member Removal (Design)

## Problem

Org Invite/Membership System (PR #65/#66) built the path *into* membership — invite, accept, list — but there is no path back out. Once `acceptOrgInvite` creates an `organization_members` row, nothing in the codebase ever touches it again: `libs/shared/src/strategies/auth.ts`'s `AuthStrategy` interface has `listOrgMembers`, `createOrgInvite`, `acceptOrgInvite`, `revokeOrgInvite` (revokes a *pending invite*, not a member), and `resendOrgInvite` — no `removeMember`/`deactivateMember` anywhere. A manager who invited the wrong person, or a member who wants to leave, has no way to do either.

## Scope decisions (from brainstorming)

- **Soft-deactivate, not hard-delete.** This is a GRC/compliance tool — keeping a record that someone *was* a member (and when they stopped being one) fits the domain, unlike a throwaway SaaS row. Adds an `is_active` column to `organization_members`.
- **Permissions reuse `checkOrgManage` (owner or org-admin), same tier as invite management.** An org-admin can deactivate another org-admin — no second permission tier introduced. The org owner can never be deactivated, by anyone, including themselves; org deletion is their existing way out.
- **Self-removal ("leave org") is in scope**, for anyone except the owner, independent of `checkOrgManage` — a viewer who lacks manage permission can still remove themselves.

## Data model

Migration adds one column:

```sql
alter table public.organization_members
  add column is_active boolean not null default true;
```

Existing rows default to `true` — no behavior change for anyone currently active. No new table, no RLS policy change (the existing `organization_members` RLS from PR #65's security fix already covers row-level access; this is a column addition on an already-covered table).

`OrgMember` (`libs/shared/src/strategies/auth.ts:45`) gains one **optional** field:

```ts
export interface OrgMember {
  userId: string;
  role: string;
  email?: string;
  displayName?: string;
  isActive?: boolean; // absent or true = active; false = deactivated
}
```

Optional, not required — `organization_members`'s test fixtures across the codebase (`org.unit.test.tsx` and others) construct `OrgMember` literals as `{ userId, role }` without `isActive`. Making it required would force every existing fixture to be touched for a field whose default (active) is already what those fixtures mean. Every read site treats `member.isActive !== false` as "active."

## Strategy changes

**`listOrgMembers`** (both `FakeAuthStrategy` and `SupabaseAuthStrategy`) filters to active members only — `SupabaseAuthStrategy` adds `.eq('is_active', true)` to its `organization_members` select; `FakeAuthStrategy` adds `.filter((m) => m.isActive !== false)` before returning. The synthetic owner-union entry (both strategies prepend the org creator as an implicit `'owner'` member when not already present) is unaffected — the owner can never be deactivated, so there's nothing to filter there.

**`listOrgIdsForMember`** needs the same active-only filter. It backs the gateway's org-listing route (`notes.controller.ts:648`, unioned with orgs the user created) — the org switcher and org list. Without this filter, a deactivated member would still see the org in their list and switcher, only to hit a 403 the moment they tried to actually use it. Same filter, same two strategies.

This is where enforcement actually happens: `checkOrgAccess` and `checkOrgManage` (`apps/api/src/app/auth/auth.controller.ts:334-369`, and the duplicate copy in `notes.controller.ts`) both resolve the caller's membership by calling `listOrgMembers` and searching for the caller's `userId`. Once `listOrgMembers` excludes deactivated rows, a deactivated member fails both checks on their very next request — no separate token revocation or session invalidation needed.

**`acceptOrgInvite`** currently throws `invite_already_member` if any `organization_members` row exists for that `userId`, regardless of `is_active`. This blocks the natural "deactivate → re-invite → accept" recovery path. New behavior:

- No existing row → insert as today.
- Existing row with `is_active: true` → throw `invite_already_member` (unchanged — still guards against double-accepting while already active).
- Existing row with `is_active: false` → **reactivate it**: set `is_active = true` and `role = invite.role` (the newly invited role, which may differ from what they had before), instead of inserting a duplicate row or throwing.

**New method**, added to the `AuthStrategy` interface and both implementations:

```ts
deactivateOrgMember(orgId: string, userId: string): Promise<void>
```

Sets `is_active = false` on that `(orgId, userId)` row. No permission logic inside the strategy — the gateway route resolves who's allowed to call it before invoking this, exactly like every other org-scoped strategy method in this codebase (strategies are dumb data operations; the gateway is the authorization boundary).

## Gateway route

```
DELETE /api/auth/org/members/:userId?orgId=...
```

`orgId` as a query param, `userId` as the path param — matches every existing org-scoped route in `auth.controller.ts` (`GET org/members`, `POST/GET/DELETE org/invites`, `POST org/invites/:inviteId/resend` all follow this exact `orgId`-as-query shape).

```ts
@Delete('org/members/:userId')
@HttpCode(204)
@ApiOperation({ summary: 'Deactivate an org member (or leave, if removing yourself)' })
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

The owner-check (`userId === org.userId`) runs before the self-removal check, so the owner can't deactivate themselves either — `actorUid === userId === org.userId` still hits the `ForbiddenException` first. Platform-admin bypass (`req.user?.role === 'admin'`) is inherited for free through `checkOrgManage`, matching every other manage-tier route.

## Client

New mutation hook in `@/queries/org-members` (alongside the existing `useOrgMembers`, `useOrgInvites`, `useCreateOrgInvite`, `useRevokeOrgInvite`, `useResendOrgInvite`):

```ts
export function useDeactivateOrgMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api(`/auth/org/members/${userId}?orgId=${encodeURIComponent(orgId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      // Covers self-removal: the org list (creator's orgs unioned with
      // listOrgIdsForMember) must drop this org from the switcher too.
      queryClient.invalidateQueries({ queryKey: ['notes', 'orgs'] });
    },
  });
}
```

In `-members-section.tsx`, each member row gets a "Remove" icon button (same icon-button style as the existing per-invite Resend/Revoke buttons), visible when:

```ts
const canRemove = (canManage || member.userId === myUid) && member.userId !== org.userId;
```

(`canManage` and `myUid` already exist in this component from the prior UI role-gating PR.) Clicking it opens an `AlertDialog` confirmation (this repo's convention for destructive actions — never a bare click-to-delete), copy varying slightly by case: "Remove this member?" when acting on someone else, "Leave this organization?" for self-removal. On confirm, calls `useDeactivateOrgMember(orgId).mutateAsync(member.userId)`.

**Self-removal from the active org**: if the member removing themselves is doing so from the org currently selected as `activeOrgId` (`@/stores/active-org`), clear it on success — mirroring the exact handling `-org-page.tsx`'s `handleDelete` already does when deleting the active org (`if (activeOrgId === orgId) setActiveOrgId(null)`).

## Testing

- API: unit tests for `deactivateOrgMember` covering — owner cannot be deactivated (by self or by admin); org-admin can deactivate a viewer; org-admin can deactivate another admin; viewer cannot deactivate another member (403, no `checkOrgManage`); a member can deactivate themselves even as a plain viewer; deactivating a non-member 404s.
- Strategy: `FakeAuthStrategy` unit tests for `deactivateOrgMember` (flips `isActive`), `listOrgMembers` and `listOrgIdsForMember` (both exclude deactivated rows), and `acceptOrgInvite`'s reactivation branch (deactivated row → invite accept → `isActive: true` with the new role, not a duplicate row).
- Client: `-members-section.tsx` role-gating tests extended with the Remove button's visibility matrix (manager on someone else / self on own row / viewer on someone else — hidden / owner's row — always hidden).
- Live Playwright verification (mandatory per `AGENTS.md`): two real users — owner deactivates an admin member, confirm the deactivated user immediately loses org access on their next request; a viewer leaves an org themselves; confirm a deactivated-then-reinvited member can accept and rejoin.

## Out of scope

- Reactivation as a standalone action (i.e. un-deactivating someone *without* going through a fresh invite) — the re-invite path already covers the realistic recovery case; a direct "reactivate" button can be added later if it turns out to matter.
- Any UI surface for viewing *deactivated* members (audit history view) — the data is preserved (that's the whole point of soft-delete), but nothing in this design exposes it yet. `listOrgMembers` stays active-only for every current caller.
- Bulk removal.
