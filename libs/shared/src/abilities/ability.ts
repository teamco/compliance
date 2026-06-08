import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { AbilityAction, AbilitySubject } from './subjects';

export type AppAbility = MongoAbility<[AbilityAction, AbilitySubject]>;

export interface AbilityUser {
  id: string;
  role: 'admin' | 'user';
}

export function defineAbilitiesFor(user: AbilityUser | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  if (user?.role === 'admin') {
    can('manage', 'all');
    can('read', 'AiUsage');
  } else if (user) {
    can('read', 'Profile');
    can('update', 'Profile');
    can('read', 'Note', { ownerId: user.id } as never);
    can('create', 'Note');
    can(['update', 'delete'], 'Note', { ownerId: user.id } as never);
    can('read', 'Organization', { userId: user.id } as never);
    can('create', 'Organization');
    can(['update', 'delete'], 'Organization', { userId: user.id } as never);
    can('read', 'StandardsDocument', { userId: user.id } as never);
    can('create', 'StandardsDocument');
    can(['update', 'delete'], 'StandardsDocument', { userId: user.id } as never);
  }
  return build();
}

export function emptyAbility(): AppAbility {
  return createMongoAbility<[AbilityAction, AbilitySubject]>([]);
}
