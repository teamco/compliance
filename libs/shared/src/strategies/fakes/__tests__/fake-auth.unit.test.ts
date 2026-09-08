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
});
