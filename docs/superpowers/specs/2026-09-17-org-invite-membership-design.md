# Org Invite / Membership System (Design)

## Problem

Every signup currently ends up as the sole member of every org they create — there is no path today for a second real user to become a member of an org they didn't personally create. This is not just a missing feature: it's the reason every "second-person-approves" workflow built this session (Issue closure-validation, Exception governance, RiskAcceptance, Assessment approve/request-changes, Policy Lifecycle) is effectively unusable in a real multi-person org — every self-approval guard compares the acting user against the resource's owner, and since `owner === current viewing user` in every real org today, those guards block everyone, not just the actual resource owner.

Two concrete gaps, both confirmed by direct code reading (not assumed):

1. **No membership writer exists anywhere.** `organization_members` (created by `20260607000007_multi_org.sql`) and its TypeScript type `OrgMember` (`libs/shared/src/strategies/auth.ts:45`) already exist. `listOrgMembers` (`libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts:194-244`) already reads it correctly — including unioning in the org's creator as an implicit owner — and was written with a comment anticipating this table would eventually be populated. But nothing ever writes to it: `FakeAuthStrategy.seedOrgMember` (`libs/shared/src/strategies/fakes/fake-auth.ts:166-169`) is test-fixture-only, never called from application code.

2. **CASL's authorization check doesn't recognize membership at all, even conceptually.** `checkOrgAccess` (`apps/api/src/app/notes/notes.controller.ts:~2095`, used by ~130 routes hardened across Notes Gateway Hardening Phases 1-3, PRs #58/#63/#64) calls `ability.can(action, subject('Organization', { id: org.id, userId: org.userId }))`, and the CASL rule underneath is keyed purely on `Organization.userId` (the creator field). This means even after `organization_members` is populated, **every hardened route in this codebase would still reject a real, valid org member who isn't the creator.** Building the invite flow without fixing this accomplishes nothing for the actual motivating problem.

## Scope decisions (made during brainstorming)

- **Invite mechanism: email link with our own token, not Supabase's native `auth.admin.inviteUserByEmail`.** Supabase's native invite API is built for bringing a brand-new person onto the platform (creates their `auth.users` row) and errors on an email that already has an account — the dominant real scenario here, since everyone already has their own org by the time they'd be invited to a second one. A native-only API also has no clean equivalent for `FakeAuthStrategy`, breaking this codebase's established Fake/Supabase strategy-pair pattern (every other feature this session has both).
- **Email delivery: reuse Supabase's existing, already-working email infrastructure** (`sendMagicLink`'s `signInWithOtp` + `emailRedirectTo` pattern, confirmed working in this codebase today) rather than adding a new transactional email vendor. Since Supabase Auth only sends its own fixed-template emails (no generic "send custom content" API), the email itself stays minimal/generic ("you have a pending invite, click here"); all invite-specific content (org name, role, inviter) renders on our own `/accept-invite` page after the click, which has no template restrictions.
- **Role enforcement: full, from day one.** `organization_members.role` already exists in the DB schema (`owner`/`admin`/`viewer`) — this design makes it load-bearing rather than storing it unused. Mapping: **owner** (org creator) — full access, including org deletion and member/invite management. **admin** — full read/update/delete on org resources, but cannot delete the org itself or manage members/invites. **viewer** — read-only everywhere. Non-member — 403, same as today.

## Data model

New table, `organization_invites`:

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
```

`role` excludes `'owner'` — a new member is never invited as owner; ownership is the creator-only concept `organization_members` already reserves implicitly (the "union in the creator" logic in `listOrgMembers` stays as-is). The partial unique index prevents two simultaneous pending invites to the same email for the same org (a resend reuses/updates the existing row rather than creating a duplicate).

New TypeScript interface, alongside `OrgMember` in `libs/shared/src/strategies/auth.ts`:

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

## Backend: `AuthStrategy` additions (both `FakeAuthStrategy` and `SupabaseAuthStrategy`)

```ts
createOrgInvite(orgId: string, email: string, role: OrgInviteRole, invitedBy: string): Promise<OrgInvite>;
listOrgInvites(orgId: string): Promise<OrgInvite[]>; // pending only
revokeOrgInvite(inviteId: string): Promise<void>;
resendOrgInvite(inviteId: string): Promise<OrgInvite>; // regenerates token + expires_at on the same row
getOrgInviteByToken(token: string): Promise<OrgInvite | null>; // for the accept-invite preview, pre-auth
acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember>;
```

`acceptOrgInvite` validation order (mirroring this session's established "not-found → state-check → identity-check" convention from every self-approval guard built earlier): invite not found → `invite_not_found`; `status !== 'pending'` → `invite_not_pending`; `expires_at < now()` → `invite_expired`; `userEmail.toLowerCase() !== invite.email.toLowerCase()` → `invite_email_mismatch` (the anti-token-forwarding check — a token is only redeemable by the account whose email it was sent to); caller already has a membership row (or is the org's creator) for `invite.orgId` → `invite_already_member` (covers the case where someone was invited, already joined some other way, or double-clicks an old invite link after already accepting a newer one to the same org). On success: insert into `organization_members` (`org_id`, `user_id: userId`, `role: invite.role`), update the invite row to `status: 'accepted'`, `accepted_at: now()`.

`createOrgInvite` triggers the email send using the same delivery path as `sendMagicLink` (`signInWithOtp`-style call), with `emailRedirectTo` pointing at `/accept-invite?token=<token>`.

## Authorization: widening `checkOrgAccess`

Current (`apps/api/src/app/notes/notes.controller.ts`):
```ts
private checkOrgAccess(req, org: Organization, action: 'read' | 'update' | 'delete'): void {
  const ability = this.abilityFactory.forUser(req.user);
  if (!ability.can(action, subject('Organization', { id: org.id, userId: org.userId }))) {
    throw new ForbiddenException();
  }
}
```

New (becomes `async`, does its own membership lookup rather than routing role information through CASL's declarative rule engine — CASL's `AbilityFactory.forUser` stays user-scoped/platform-role-only as today, unrelated to any specific org):

```ts
private async checkOrgAccess(
  req: Request & { user?: VerifiedToken },
  org: Organization,
  action: 'read' | 'update' | 'delete',
): Promise<void> {
  if (req.user?.role === 'admin') return; // platform admin: existing bypass, must be preserved

  const uid = req.user?.uid;
  if (org.userId === uid) return; // owner: full access, no lookup needed

  const members = await this.auth.listOrgMembers(org.id);
  const membership = members.find((m) => m.userId === uid);
  if (!membership) throw new ForbiddenException();

  if (membership.role === 'viewer' && action !== 'read') throw new ForbiddenException();
  // admin: read/update/delete all allowed on org resources (not scoped here — org-level
  // deletion and member/invite management routes get their own owner-only check, separate
  // from this general-purpose resource guard)
}
```

This reuses `listOrgMembers` (already correct, already unions in the creator) rather than adding a new single-membership-lookup method — avoids a second, potentially-inconsistent read path.

**Blast radius, confirmed exactly, not estimated:** 126 existing `this.checkOrgAccess(...)` call sites across `notes.controller.ts` (2300 lines total) need `await` added, since the method itself becomes `async`. Independently verified that all 126 are already inside a method declared `async` (zero exceptions), so this is a mechanical, uniform, low-risk change — add one keyword per call site, not a structural rewrite. Same shape of work as the Notes Gateway Hardening phases themselves, just simpler (one repeated edit, not per-route judgment).

**Platform-admin bypass must be preserved.** `AbilityFactory.forUser` (`apps/api/src/app/abilities/ability.factory.ts`) currently grants a platform-role admin (`VerifiedToken.role === 'admin'`) `can('manage', 'all')` via CASL, meaning today's `checkOrgAccess` already lets a platform admin act on any org regardless of creator/membership. The rewrite must check `req.user?.role === 'admin'` and short-circuit before any membership lookup (shown in the code above) — dropping this silently regresses platform admins' existing access, a real behavior change nobody asked for.

**Org-level owner-only actions** (deleting the org itself, managing members, managing invites) get a separate, stricter check — not `checkOrgAccess`, since that method's `'delete'` action now means "admin-or-owner can delete a resource in this org," not "can delete the org." A new small private helper, `checkOrgOwner(req, org)`, throws unless `org.userId === req.user.uid`, used only by the org-deletion route and the new member/invite-management routes.

## Backend: gateway routes (new)

All under `apps/api/src/app/notes/notes.controller.ts` (or a new `org-members.controller.ts` if the existing file's size warrants a split — decided at plan-writing time by checking the file's current line count):

- `POST orgs/:id/invites` (owner/admin, via `checkOrgOwner`-or-admin-check — see note below) — body `{ email, role }`, calls `createOrgInvite`.
- `GET orgs/:id/invites` (owner/admin) — calls `listOrgInvites`.
- `DELETE orgs/:id/invites/:inviteId` (owner/admin) — calls `revokeOrgInvite`.
- `POST orgs/:id/invites/:inviteId/resend` (owner/admin) — calls `resendOrgInvite`.
- `GET org-invites/:token` (no org-membership check possible yet — this is the pre-auth preview; only returns non-sensitive fields: org name, role, inviter display name, expiry) — calls `getOrgInviteByToken`.
- `POST org-invites/:token/accept` (requires authentication, no org-membership check yet since accepting IS what grants membership) — calls `acceptOrgInvite(token, uid(req), req.user's email)`.

Note on "owner/admin" for invite management: per the role mapping above, admins should be able to invite/manage members too (a reasonable SaaS convention — owner delegates day-to-day team management to admins), so these routes use a mapping equivalent to "owner OR admin," not the stricter owner-only `checkOrgOwner`. This is worth flagging as its own small helper (`checkOrgManage`) distinct from both `checkOrgAccess` (read/update/delete on resources) and `checkOrgOwner` (org deletion only) — three tiers, not two.

## Backend: `listOrganizations` widening

`listOrganizations` (`apps/microservices/notes/src/app/supabase-notes.strategy.ts:1013-1020`, `libs/shared/src/strategies/fakes/fake-notes.ts:3060-3062`) currently filters strictly `org_profiles.user_id = userId`. Widens to `creator OR member`:

```ts
// Supabase: union query (owned orgs UNION member orgs via organization_members join)
// Fake: this.organizations.filter(o => o.userId === userId || this.orgMembers.get(o.id)?.some(m => m.userId === userId))
```

The client's `OrgSwitcher` component (`apps/client/src/components/org/OrgSwitcher.tsx`) needs no changes — it already renders whatever `useOrganizations()` returns, and already handles the multi-org case correctly (confirmed by direct code reading during brainstorming).

## Client UI

1. **Org Settings → new "Members" section.** List current members (`useOrgMembers`, wraps the already-correct `listOrgMembers`) with email, role, joined date; owner/admin can change a member's role (`<Select>`) or remove a member (`AlertDialog`, since removal is destructive per this repo's overlay convention); an "Invite member" button opens a `Dialog` (email input + role `<Select>`, footer Cancel/Send per this repo's Dialog convention).
2. **Same section, pending-invites list.** Email, role, invited date, expiry, with Resend and Revoke actions (owner/admin only, same as invite creation).
3. **New route `/accept-invite`**, reads `?token=` from the URL. Fetches the preview (`GET org-invites/:token`) before requiring auth, rendering "You've been invited to join {orgName} as {role} by {inviterName}." If not authenticated, prompts sign-up/login (existing flow), carrying the token through (query param survives the redirect). Once authenticated, an "Accept" button calls `POST org-invites/:token/accept`, then navigates into the newly-joined org's dashboard (sets it as the active org via the existing `useActiveOrgStore`).
4. i18n additions across all 4 locales (en/ru/es/he) for: the Members section labels, the invite dialog, the accept-invite page copy, and error states (expired/already-accepted/email-mismatch).

## Testing

- Contract tests (`FakeAuthStrategy`) for `createOrgInvite`/`listOrgInvites`/`revokeOrgInvite`/`resendOrgInvite`/`getOrgInviteByToken`/`acceptOrgInvite`, covering the full validation order (not-found, not-pending, expired, email-mismatch, success) and the partial-unique-index-equivalent behavior in the Fake (resending replaces rather than duplicates the pending row).
- Gateway tests for all 6 new routes: owner/admin allowed, viewer forbidden (for the management routes), non-member forbidden, not-found cases.
- `checkOrgAccess` role-matrix tests: owner (full), admin (full resource access, forbidden on org-deletion/member-management routes), viewer (read-only, forbidden on writes), non-member (forbidden everywhere) — this is the highest-value test surface in the whole feature, since it's what actually unblocks every previously-built self-approval workflow.
- Mandatory Playwright verification (`AGENTS.md` UI Work Rule, no exceptions): create an org as User A, invite User B as viewer, sign up/log in as User B in a separate browser context, accept the invite, confirm User B sees the org in their `OrgSwitcher`, confirm read access works and a write attempt is blocked (both UI-level, e.g. disabled/hidden buttons, and API-level via direct network request if the UI doesn't fully hide every write affordance yet).

## Out of scope

- Bulk invites (one email at a time).
- Transferring org ownership (the creator stays owner permanently in this design; a future feature).
- Deleting or reassigning a removed member's created content.
- SSO / email-domain-based auto-join.
- Real-time invite notifications (in-app toast/websocket when an invite is accepted) — polling/refetch on the Members page is sufficient for v1.
- Rate-limiting invite creation — noted as a real security follow-up (an owner/admin could otherwise spam-generate invite tokens), tracked for a future hardening pass rather than blocking this feature, consistent with how this session has scoped every prior phase.
- Configuring a custom Supabase email template for invites specifically (the generic magic-link-style email is accepted for v1, per brainstorming decision) — a manual dashboard task, not app code, if ever revisited.
