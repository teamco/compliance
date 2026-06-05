import { Body, Controller, Get, Patch, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthClientService } from '@icore/auth-client';
import type { VerifiedToken } from '@icore/shared';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly authClient: AuthClientService) {}

  @Get()
  @ApiOperation({ summary: 'Return profile data from the profiles table' })
  async me(@Req() req: Request & { user?: VerifiedToken }): Promise<{
    uid: string;
    email?: string;
    role?: string;
    displayName?: string;
    avatarUrl?: string;
    lastSignedIn?: string;
  }> {
    const user = req.user;
    if (!user?.uid) throw new UnauthorizedException('missing_user');
    const profile = await this.authClient.getProfile(user.uid);
    return {
      uid: user.uid,
      email: profile?.email ?? user.email,
      role: profile?.role ?? user.role,
      displayName: profile?.displayName ?? user.displayName,
      avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
      lastSignedIn: profile?.lastSignedIn,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update display name' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['displayName'],
      properties: { displayName: { type: 'string' } },
    },
  })
  async update(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: { displayName: string },
  ): Promise<void> {
    const user = req.user;
    if (!user?.uid) throw new UnauthorizedException('missing_user');
    await this.authClient.updateProfile(user.uid, body.displayName);
  }
}
