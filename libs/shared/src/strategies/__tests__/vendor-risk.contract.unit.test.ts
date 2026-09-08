import { FakeVendorRiskStrategy } from '@icore/shared';
import { runVendorRiskContract } from '@icore/shared/testing';

runVendorRiskContract('FakeVendorRiskStrategy', () => new FakeVendorRiskStrategy());
