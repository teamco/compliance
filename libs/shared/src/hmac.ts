import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  signHmac,
  verifyHmac,
  composeResilience,
  type ComposeResilienceOpts,
} from '@idevconn/nestjs-resilience';
import { formatEnvBanner } from './env';

export { signHmac, verifyHmac };

function getHmacSecret(): string | undefined {
  return process.env['MS_HMAC_SECRET']?.trim() || undefined;
}

export interface SignedEnvelope<T = unknown> {
  payload: T;
  signature: string;
}

function isSignedEnvelope(value: unknown): value is SignedEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    'payload' in value &&
    'signature' in value &&
    typeof (value as SignedEnvelope).signature === 'string'
  );
}

/**
 * Gateway → microservice RPC call, signed with MS_HMAC_SECRET when
 * configured. Closes the gap where inter-service trust relied solely on
 * network-level transport with no signature on the payload itself.
 *
 * Dev without MS_HMAC_SECRET set: sends unsigned, same as before HMAC
 * existed (HmacGuard on the receiving MS also passes unsigned calls
 * through in dev). Prod without the secret: refuses to send rather than
 * silently going unsigned.
 */
export async function signedSend<T>(
  client: ClientProxy,
  pattern: string,
  data: unknown,
  opts: ComposeResilienceOpts = {},
): Promise<T> {
  const secret = getHmacSecret();
  if (!secret && process.env['NODE_ENV'] === 'production') {
    throw new Error(
      formatEnvBanner({
        service: 'gateway→MS HMAC signing',
        provider: undefined,
        missing: ['MS_HMAC_SECRET'],
        envPath: 'the root .env',
        headline:
          '⚠  MS_HMAC_SECRET not set — refusing to send unsigned inter-service requests in production',
      }),
    );
  }

  const body: unknown = secret
    ? ({ payload: data, signature: signHmac(data, secret) } satisfies SignedEnvelope)
    : data;

  return composeResilience(
    () => firstValueFrom(client.send<T>(pattern, body), { defaultValue: undefined as T }),
    opts,
  );
}

/**
 * Verifies the HMAC signature on an incoming RPC call and unwraps the
 * envelope in place, so `@Payload()` in the handler sees the original body
 * exactly as if it had been sent unsigned. Apply as a global guard in each
 * microservice's bootstrap. Manually instantiated (`new HmacGuard()`) —
 * no NestJS DI needed since it has no constructor dependencies.
 */
export class HmacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'rpc') return true;

    const secret = getHmacSecret();
    if (!secret) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new RpcException(
          'MS_HMAC_SECRET not configured — refusing unsigned inter-service call',
        );
      }
      return true;
    }

    const data: unknown = context.switchToRpc().getData();
    if (!isSignedEnvelope(data)) {
      throw new RpcException('Missing HMAC signature');
    }
    if (!verifyHmac(data.payload, data.signature, secret)) {
      throw new RpcException('Invalid HMAC signature');
    }

    const mutable = data as unknown as Record<string, unknown>;
    const payload = data.payload;
    for (const key of Object.keys(mutable)) {
      delete mutable[key];
    }
    if (payload && typeof payload === 'object') {
      Object.assign(mutable, payload);
    }
    return true;
  }
}
