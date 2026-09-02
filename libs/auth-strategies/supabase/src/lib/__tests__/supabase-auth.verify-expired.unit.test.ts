import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TokenExpiredError } from '@icore/shared';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy';

function clientWithGetUserError(message: string): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message } }),
    },
  } as unknown as SupabaseClient;
}

describe('SupabaseAuthStrategy.verifyToken error mapping', () => {
  it('throws TokenExpiredError when GoTrue reports an expired token', async () => {
    const strategy = new SupabaseAuthStrategy({
      client: clientWithGetUserError(
        'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired',
      ),
    });
    await expect(strategy.verifyToken('stale')).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('throws plain Error for non-expiry failures', async () => {
    const strategy = new SupabaseAuthStrategy({
      client: clientWithGetUserError('invalid JWT: token is malformed'),
    });
    const err = await strategy.verifyToken('garbage').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TokenExpiredError);
  });
});
