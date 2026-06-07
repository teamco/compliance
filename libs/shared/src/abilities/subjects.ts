import type { InferSubjects } from '@casl/ability';

export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
}

export enum Subject {
  All = 'all',
  User = 'User',
  Profile = 'Profile',
  Note = 'Note',
  AiUsage = 'AiUsage',
  Framework = 'Framework',
  Control = 'Control',
  GapAnalysis = 'GapAnalysis',
  Organization = 'Organization',
}

export type AbilityAction = `${Action}`;

// NoteSubject is the shaped object passed to subject('Note', { ... }) in tests
// and on the frontend <Can>. Included in AbilitySubject so ability.can() accepts
// tagged instances, not just the string name.
export interface NoteSubject {
  id: string;
  ownerId: string;
}

export interface OrganizationSubject {
  id: string;
  userId: string;
}

export type AbilitySubject = InferSubjects<NoteSubject | OrganizationSubject> | `${Subject}`;
