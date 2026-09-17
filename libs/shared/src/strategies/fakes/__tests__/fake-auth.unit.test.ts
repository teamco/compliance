import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAuthStrategy } from '../fake-auth';
import type { OrgInvite } from '../../auth';

describe('FakeAuthStrategy.listOrgMembers', () => {
  let strategy: FakeAuthStrategy;

  beforeEach(() => {
    strategy = new FakeAuthStrategy();
  });

  it('returns an empty array when no members are seeded', async () => {
    expect(await strategy.listOrgMembers('org1')).toEqual([]);
  });

  it('returns seeded members for the given org only', async () => {
    strategy.seedOrgMember('org1', {
      userId: 'u1',
      displayName: 'Alice',
      email: 'alice@x.com',
      role: 'owner',
    });
    strategy.seedOrgMember('org2', {
      userId: 'u2',
      displayName: 'Bob',
      email: 'bob@x.com',
      role: 'viewer',
    });

    const members = await strategy.listOrgMembers('org1');
    expect(members).toEqual([
      { userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' },
    ]);
  });

  it('unions in the ownerId as an implicit owner when not already a seeded member', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'member-1', role: 'viewer' });

    const members = await strategy.listOrgMembers('org-1', 'creator-1');

    expect(members).toContainEqual(expect.objectContaining({ userId: 'creator-1', role: 'owner' }));
    expect(members).toContainEqual(expect.objectContaining({ userId: 'member-1', role: 'viewer' }));
  });

  it('enriches the synthesized owner row with email when the user exists', async () => {
    const strategy = new FakeAuthStrategy();
    const session = await strategy.signUp('owner@example.com', 'password123');
    const members = await strategy.listOrgMembers('org-1', session.user.id);
    expect(members).toContainEqual(
      expect.objectContaining({
        userId: session.user.id,
        role: 'owner',
        email: 'owner@example.com',
      }),
    );
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

  it('excludes deactivated members', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'member-1', role: 'viewer', isActive: false });
    strategy.seedOrgMember('org-1', { userId: 'member-2', role: 'admin' });

    const members = await strategy.listOrgMembers('org-1');

    expect(members.map((m) => m.userId)).toEqual(['member-2']);
  });
});

describe('FakeAuthStrategy.listOrgIdsForMember', () => {
  it('lists org ids a user is a member of', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'user-a', role: 'viewer' });
    strategy.seedOrgMember('org-2', { userId: 'user-a', role: 'admin' });
    strategy.seedOrgMember('org-3', { userId: 'user-b', role: 'viewer' });

    const orgIds = await strategy.listOrgIdsForMember('user-a');

    expect(orgIds.sort()).toEqual(['org-1', 'org-2']);
  });

  it('excludes orgs where the membership is deactivated', async () => {
    const strategy = new FakeAuthStrategy();
    strategy.seedOrgMember('org-1', { userId: 'user-a', role: 'viewer', isActive: false });
    strategy.seedOrgMember('org-2', { userId: 'user-a', role: 'admin' });

    const orgIds = await strategy.listOrgIdsForMember('user-a');

    expect(orgIds).toEqual(['org-2']);
  });
});

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
    const another = await strategy.createOrgInvite(
      'org-1',
      'other@example.com',
      'admin',
      'owner-1',
    );
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
    expect(members).toContainEqual(
      expect.objectContaining({ userId: 'new-user-1', role: 'viewer' }),
    );
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
    (strategy as unknown as { orgInvites: Map<string, OrgInvite> }).orgInvites.get(
      invite.id,
    )!.expiresAt = new Date(Date.now() - 1000).toISOString();
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

  // The "caller is the org owner" case cannot be tested at this strategy layer:
  // FakeAuthStrategy has no knowledge of Organization.userId (that's FakeNotesStrategy's
  // domain). That check belongs in the gateway route and is covered by a Task 7 test.
});
