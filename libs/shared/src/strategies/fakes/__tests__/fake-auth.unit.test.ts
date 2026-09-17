import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAuthStrategy } from '../fake-auth';

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
});
