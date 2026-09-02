import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthClientService } from '@icore/auth-client';
import { AUTH_TOKEN_EXPIRED } from '@icore/shared';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthClientService) private readonly authClient: AuthClientService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('missing_bearer');
    }

    try {
      const verified = await this.authClient.verify(token);
      req.user = verified;
      return true;
    } catch (err) {
      // RpcException payloads arrive as plain objects; surface the expiry code
      // so clients can distinguish "refresh and retry" from "re-login".
      if ((err as { code?: string } | null)?.code === AUTH_TOKEN_EXPIRED) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'token_expired',
          code: AUTH_TOKEN_EXPIRED,
        });
      }
      throw new UnauthorizedException('invalid_token');
    }
  }
}
