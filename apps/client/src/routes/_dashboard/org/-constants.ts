import type { OrganizationInput, OrgSize } from '@/queries/notes';

export const INDUSTRIES = [
  'technology',
  'finance',
  'healthcare',
  'retail',
  'manufacturing',
  'education',
  'government',
  'other',
] as const;

export const SIZES: OrgSize[] = ['startup', 'smb', 'enterprise'];

export const EMPTY_FORM: OrganizationInput = {
  name: '',
  industry: 'technology',
  size: 'startup',
  regions: [],
  techStack: [],
  regulations: [],
};
