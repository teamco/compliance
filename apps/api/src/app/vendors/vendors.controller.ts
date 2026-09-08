import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { VendorRiskClientService } from '@icore/vendor-risk-client';
import type { VendorInput, VerifiedToken } from '@icore/shared';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorRisk: VendorRiskClientService) {}

  private uid(req: Request & { user?: VerifiedToken }): string {
    if (!req.user?.uid) throw new UnauthorizedException('missing_user');
    return req.user.uid;
  }

  @Get()
  @ApiOperation({ summary: 'List vendors for org' })
  list(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId?: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.vendorRisk.listVendors(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add vendor (triggers immediate baseline scan)' })
  create(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: VendorInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.vendorRisk.createVendor(orgId, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Vendor details' })
  async get(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const vendor = await this.vendorRisk.getVendor(id);
    if (!vendor) throw new NotFoundException();
    return vendor;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vendor tier / interval / threshold' })
  update(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: Partial<VendorInput>,
  ) {
    this.uid(req);
    return this.vendorRisk.updateVendor(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove vendor' })
  delete(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.vendorRisk.deleteVendor(id);
  }

  @Post(':id/scan')
  @ApiOperation({ summary: 'Manual baseline scan' })
  scan(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.vendorRisk.triggerScan(id, 'baseline');
  }

  @Post(':id/scan/deep')
  @ApiOperation({ summary: 'Deep scan (SecurityScorecard API)' })
  deepScan(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.vendorRisk.triggerScan(id, 'deep');
  }

  @Get(':id/scans')
  @ApiOperation({ summary: 'Scan history' })
  listScans(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.vendorRisk.listScans(id);
  }

  @Get(':id/scans/:scanId')
  @ApiOperation({ summary: 'Scan detail + findings + AI analysis' })
  getScan(@Req() req: Request & { user?: VerifiedToken }, @Param('scanId') scanId: string) {
    this.uid(req);
    return this.vendorRisk.getScan(scanId);
  }
}
