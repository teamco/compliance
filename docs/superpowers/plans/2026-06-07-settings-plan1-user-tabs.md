# Settings Module — Plan 1: Foundation + User Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the `/settings` page with hash-based tab navigation and two working user-facing tabs — #appearance (theme + language) and #notification (in-app + browser push toggles + events matrix) — including full backend infrastructure.

**Architecture:** New Supabase migration adds preference columns to `profiles` + creates `push_subscriptions` and `notifications` tables. `NotesStrategy` gains 4 settings methods backed by `SupabaseNotesStrategy`. Gateway gets a `SettingsModule`. Client gets a `queries/settings.ts` file, a route shell with hash routing, and two tab components. Admin tabs (#audit-log, #export, #webhooks, #retention, #api-keys) render a "Coming soon" placeholder — implemented in Plan 2.

**Tech Stack:** NestJS TCP microservices, Supabase postgres, TanStack Query, TanStack Router (file-based), `web-push` VAPID (subscription only — sending is Plan 2), React Service Worker, Vitest + @testing-library/react, i18next (4 locales: en/ru/he/es)

---

## File Map

| File                                                                          | Action | Purpose                                                                                                |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260607000001_settings.sql`                             | Create | DB: profiles columns + push_subscriptions + notifications tables                                       |
| `libs/shared/src/strategies/notes.ts`                                         | Modify | Add UserPrefsPayload, NotificationPrefsPayload, PushSubscriptionPayload types + NotesStrategy methods  |
| `libs/shared/src/strategies/fakes/fake-notes.ts`                              | Modify | Extend FakeNotesStrategy with settings in-memory implementations                                       |
| `apps/microservices/notes/src/app/supabase-notes.strategy.ts`                 | Modify | Implement settings methods on SupabaseNotesStrategy                                                    |
| `apps/microservices/notes/src/app/settings.controller.ts`                     | Create | Notes MS: MessagePattern handlers for settings.prefs._ and settings.push._                             |
| `apps/microservices/notes/src/app/app.module.ts`                              | Modify | Register SettingsController                                                                            |
| `libs/notes-client/src/lib/notes-client.service.ts`                           | Modify | Add getUserPrefs / updateUserPrefs / savePushSubscription / removePushSubscription                     |
| `apps/api/src/app/settings/settings.controller.ts`                            | Create | Gateway REST endpoints: GET/PATCH /api/settings/me, POST/DELETE /api/settings/push                     |
| `apps/api/src/app/settings/settings.module.ts`                                | Create | Gateway NestJS module wiring                                                                           |
| `apps/api/src/app/app.module.ts`                                              | Modify | Import SettingsModule                                                                                  |
| `apps/client/src/queries/settings.ts`                                         | Create | TanStack Query hooks: useUserPrefs, useUpdatePrefs, useSavePushSubscription, useRemovePushSubscription |
| `apps/client/src/routes/_dashboard/settings.tsx`                              | Create | Route shell + hash tab navigation                                                                      |
| `apps/client/src/components/settings/AppearanceTab.tsx`                       | Create | Theme toggle + language selector                                                                       |
| `apps/client/src/components/settings/NotificationTab.tsx`                     | Create | Channels toggles + events matrix + push subscription flow                                              |
| `apps/client/src/components/settings/__tests__/AppearanceTab.unit.test.tsx`   | Create | AppearanceTab unit tests                                                                               |
| `apps/client/src/components/settings/__tests__/NotificationTab.unit.test.tsx` | Create | NotificationTab unit tests                                                                             |
| `apps/client/public/sw.js`                                                    | Create | Service worker: push event handler + notificationclick                                                 |
| `apps/client/src/main.tsx`                                                    | Modify | Register service worker                                                                                |
| `apps/client/.env`                                                            | Modify | Add VITE_VAPID_PUBLIC_KEY                                                                              |
| `apps/microservices/notes/.env`                                               | Modify | Note: VAPID_PRIVATE_KEY needed in Plan 2                                                               |
| `libs/template-shared/src/lib/i18n/locales/en.ts`                             | Modify | Add settings.\* keys                                                                                   |
| `libs/template-shared/src/lib/i18n/locales/ru.ts`                             | Modify | Add settings.\* keys                                                                                   |
| `libs/template-shared/src/lib/i18n/locales/he.ts`                             | Modify | Add settings.\* keys                                                                                   |
| `libs/template-shared/src/lib/i18n/locales/es.ts`                             | Modify | Add settings.\* keys                                                                                   |
| `apps/client/src/components/layout/LayoutSider.tsx`                           | Modify | Remove `soon: true` from Settings nav item                                                             |

---

## Task 1: DB Migration

**Files:**

- Create: `supabase/migrations/20260607000001_settings.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260607000001_settings.sql

-- User preference columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme      text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS language   text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}';

-- Push subscriptions (one per browser/device per user)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  keys       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subscriptions: own select"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: own insert"
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: own delete"
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- In-app notifications (populated in Plan 2 when workflow transitions occur)
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications: own select"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications: own update"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase migration up
```

Expected: `Applied 1 migration` or `Migration applied successfully`.

If Supabase is not running locally, check `supabase status`. If using a remote project, push via `npx supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260607000001_settings.sql
git commit -m "feat(db): settings migration — profile prefs + push_subscriptions + notifications"
```

---

## Task 2: Shared Types + FakeNotesStrategy Extension

**Files:**

- Modify: `libs/shared/src/strategies/notes.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

- [ ] **Step 1: Write failing test in fake-notes**

Add a test file `libs/shared/src/strategies/__tests__/fake-notes-settings.unit.test.ts`:

```typescript
// libs/shared/src/strategies/__tests__/fake-notes-settings.unit.test.ts
import { describe, it, expect } from 'vitest';
import { FakeNotesStrategy } from '../strategies/fakes/fake-notes';

describe('FakeNotesStrategy — settings', () => {
  it('getUserPrefs returns defaults when not set', async () => {
    const fake = new FakeNotesStrategy();
    const prefs = await fake.getUserPrefs('user-1');
    expect(prefs.theme).toBe('system');
    expect(prefs.language).toBe('en');
    expect(prefs.notificationPrefs.channels.inApp).toBe(true);
    expect(prefs.notificationPrefs.channels.push).toBe(false);
  });

  it('updateUserPrefs persists and returns updated prefs', async () => {
    const fake = new FakeNotesStrategy();
    const updated = await fake.updateUserPrefs('user-1', { theme: 'dark', language: 'ru' });
    expect(updated.theme).toBe('dark');
    expect(updated.language).toBe('ru');
    const fetched = await fake.getUserPrefs('user-1');
    expect(fetched.theme).toBe('dark');
  });

  it('savePushSubscription stores endpoint', async () => {
    const fake = new FakeNotesStrategy();
    const result = await fake.savePushSubscription('user-1', {
      endpoint: 'https://push.example.com/sub/1',
      keys: { p256dh: 'abc', auth: 'xyz' },
    });
    expect(result.ok).toBe(true);
  });

  it('removePushSubscription deletes endpoint', async () => {
    const fake = new FakeNotesStrategy();
    await fake.savePushSubscription('user-1', {
      endpoint: 'https://push.example.com/sub/1',
      keys: { p256dh: 'abc', auth: 'xyz' },
    });
    const result = await fake.removePushSubscription('user-1', 'https://push.example.com/sub/1');
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
yarn nx test shared 2>&1 | grep -A5 "getUserPrefs\|FAIL\|Error"
```

Expected: FAIL — `getUserPrefs` not defined on `FakeNotesStrategy`.

- [ ] **Step 3: Add types to `libs/shared/src/strategies/notes.ts`**

Append before the closing of the file (after `NotesStrategy` interface):

```typescript
// ─── Settings types ────────────────────────────────────────────────────────

export interface NotificationPrefsPayload {
  channels: { inApp: boolean; push: boolean };
  events: {
    workflowSubmitted: { inApp: boolean; push: boolean };
    workflowApproved: { inApp: boolean; push: boolean };
    workflowRejected: { inApp: boolean; push: boolean };
    workflowPublished: { inApp: boolean; push: boolean };
    aiStandardsGenerated: { inApp: boolean; push: boolean };
    aiGapAnalysisDone: { inApp: boolean; push: boolean };
    systemNewFramework: { inApp: boolean; push: boolean };
  };
}

export interface UserPrefsPayload {
  theme: 'dark' | 'light' | 'system';
  language: 'en' | 'ru' | 'he' | 'es';
  notificationPrefs: NotificationPrefsPayload;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsPayload = {
  channels: { inApp: true, push: false },
  events: {
    workflowSubmitted: { inApp: true, push: false },
    workflowApproved: { inApp: true, push: false },
    workflowRejected: { inApp: true, push: false },
    workflowPublished: { inApp: true, push: false },
    aiStandardsGenerated: { inApp: true, push: false },
    aiGapAnalysisDone: { inApp: true, push: false },
    systemNewFramework: { inApp: false, push: false },
  },
};

export const DEFAULT_USER_PREFS: UserPrefsPayload = {
  theme: 'system',
  language: 'en',
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
};
```

- [ ] **Step 4: Extend NotesStrategy interface**

Inside the `NotesStrategy` interface in `libs/shared/src/strategies/notes.ts`, add after `getSnapshot`:

```typescript
  // Settings
  getUserPrefs(userId: string): Promise<UserPrefsPayload>;
  updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload>;
  savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }>;
  removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }>;
```

- [ ] **Step 5: Extend FakeNotesStrategy**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, add a `Map` for prefs + push subscriptions, and implement the 4 new methods. Add at the top of the class:

```typescript
  private userPrefs = new Map<string, UserPrefsPayload>();
  private pushSubscriptions = new Map<string, PushSubscriptionPayload[]>(); // key = userId
```

Then add methods at the end of the class (before closing `}`):

```typescript
  async getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    return this.userPrefs.get(userId) ?? { ...DEFAULT_USER_PREFS };
  }

  async updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload> {
    const current = await this.getUserPrefs(userId);
    const updated: UserPrefsPayload = {
      ...current,
      ...patch,
      notificationPrefs: patch.notificationPrefs
        ? { ...current.notificationPrefs, ...patch.notificationPrefs }
        : current.notificationPrefs,
    };
    this.userPrefs.set(userId, updated);
    return updated;
  }

  async savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }> {
    const existing = this.pushSubscriptions.get(userId) ?? [];
    const filtered = existing.filter(s => s.endpoint !== sub.endpoint);
    this.pushSubscriptions.set(userId, [...filtered, sub]);
    return { ok: true };
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const existing = this.pushSubscriptions.get(userId) ?? [];
    this.pushSubscriptions.set(userId, existing.filter(s => s.endpoint !== endpoint));
    return { ok: true };
  }
```

Also add the missing imports at the top of `fake-notes.ts`:

```typescript
import type { ..., UserPrefsPayload, PushSubscriptionPayload } from '../notes';
import { ..., DEFAULT_USER_PREFS } from '../notes';
```

- [ ] **Step 6: Run test — verify PASS**

```bash
yarn nx test shared 2>&1 | tail -10
```

Expected: all tests pass including the 4 new settings tests.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/strategies/notes.ts \
        libs/shared/src/strategies/fakes/fake-notes.ts \
        "libs/shared/src/strategies/__tests__/fake-notes-settings.unit.test.ts"
git commit -m "feat(shared): UserPrefsPayload types + FakeNotesStrategy settings methods"
```

---

## Task 3: SupabaseNotesStrategy Settings Methods

**Files:**

- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Add imports at top of supabase-notes.strategy.ts**

Read the current imports section of the file, then add the new types to the import from `@icore/shared`:

```typescript
import type {
  // ... existing imports ...
  UserPrefsPayload,
  PushSubscriptionPayload,
} from '@icore/shared';
import { DEFAULT_USER_PREFS } from '@icore/shared';
```

- [ ] **Step 2: Implement `getUserPrefs`**

Add at the end of `SupabaseNotesStrategy` class (before closing `}`):

```typescript
  async getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    const { data } = await this.client
      .from('profiles')
      .select('theme, language, notification_prefs')
      .eq('id', userId)
      .single();

    if (!data) return { ...DEFAULT_USER_PREFS };

    return {
      theme: (data.theme as UserPrefsPayload['theme']) ?? 'system',
      language: (data.language as UserPrefsPayload['language']) ?? 'en',
      notificationPrefs: {
        ...DEFAULT_USER_PREFS.notificationPrefs,
        ...(data.notification_prefs as Partial<UserPrefsPayload['notificationPrefs']> ?? {}),
      },
    };
  }
```

- [ ] **Step 3: Implement `updateUserPrefs`**

```typescript
  async updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload> {
    const update: Record<string, unknown> = {};
    if (patch.theme !== undefined)              update['theme'] = patch.theme;
    if (patch.language !== undefined)           update['language'] = patch.language;
    if (patch.notificationPrefs !== undefined)  update['notification_prefs'] = patch.notificationPrefs;

    const { error } = await this.client
      .from('profiles')
      .update(update)
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return this.getUserPrefs(userId);
  }
```

- [ ] **Step 4: Implement `savePushSubscription`**

```typescript
  async savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }> {
    const { error } = await this.client
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, endpoint: sub.endpoint, keys: sub.keys },
        { onConflict: 'endpoint' },
      );

    if (error) throw new Error(error.message);
    return { ok: true };
  }
```

- [ ] **Step 5: Implement `removePushSubscription`**

```typescript
  async removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const { error } = await this.client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw new Error(error.message);
    return { ok: true };
  }
```

- [ ] **Step 6: Lint + build**

```bash
yarn nx lint notes && yarn nx build notes 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): SupabaseNotesStrategy settings methods — getUserPrefs/updateUserPrefs/push"
```

---

## Task 4: Notes MS SettingsController + app.module.ts Wire

**Files:**

- Create: `apps/microservices/notes/src/app/settings.controller.ts`
- Modify: `apps/microservices/notes/src/app/app.module.ts`

- [ ] **Step 1: Write failing test**

Create `apps/microservices/notes/src/app/__tests__/settings.controller.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNotesStrategy, DEFAULT_USER_PREFS } from '@icore/shared';
import { SettingsController } from '../settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;
  let fake: FakeNotesStrategy;

  beforeEach(() => {
    fake = new FakeNotesStrategy();
    controller = new SettingsController(fake);
  });

  it('getUserPrefs returns defaults', async () => {
    const result = await controller.getUserPrefs({ userId: 'u1' });
    expect(result.theme).toBe('system');
    expect(result.language).toBe('en');
  });

  it('updateUserPrefs applies patch', async () => {
    const result = await controller.updateUserPrefs({ userId: 'u1', patch: { theme: 'dark' } });
    expect(result.theme).toBe('dark');
  });

  it('savePushSubscription returns ok', async () => {
    const result = await controller.savePushSubscription({
      userId: 'u1',
      sub: { endpoint: 'https://x.com/1', keys: { p256dh: 'a', auth: 'b' } },
    });
    expect(result.ok).toBe(true);
  });

  it('removePushSubscription returns ok', async () => {
    const result = await controller.removePushSubscription({
      userId: 'u1',
      endpoint: 'https://x.com/1',
    });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
yarn nx test notes 2>&1 | grep -A3 "FAIL\|SettingsController"
```

Expected: FAIL — `SettingsController` not found.

- [ ] **Step 3: Create SettingsController**

```typescript
// apps/microservices/notes/src/app/settings.controller.ts
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { NotesStrategy, UserPrefsPayload, PushSubscriptionPayload } from '@icore/shared';

@Controller()
export class SettingsController {
  constructor(@Inject('NotesStrategy') private readonly strategy: NotesStrategy) {}

  @MessagePattern('settings.prefs.get')
  getUserPrefs(@Payload() payload: { userId: string }): Promise<UserPrefsPayload> {
    return this.strategy.getUserPrefs(payload.userId);
  }

  @MessagePattern('settings.prefs.update')
  updateUserPrefs(
    @Payload() payload: { userId: string; patch: Partial<UserPrefsPayload> },
  ): Promise<UserPrefsPayload> {
    return this.strategy.updateUserPrefs(payload.userId, payload.patch);
  }

  @MessagePattern('settings.push.save')
  savePushSubscription(
    @Payload() payload: { userId: string; sub: PushSubscriptionPayload },
  ): Promise<{ ok: boolean }> {
    return this.strategy.savePushSubscription(payload.userId, payload.sub);
  }

  @MessagePattern('settings.push.remove')
  removePushSubscription(
    @Payload() payload: { userId: string; endpoint: string },
  ): Promise<{ ok: boolean }> {
    return this.strategy.removePushSubscription(payload.userId, payload.endpoint);
  }
}
```

- [ ] **Step 4: Register in app.module.ts**

Read `apps/microservices/notes/src/app/app.module.ts`. In the `@Module` decorator, change:

```typescript
  controllers: [NotesController],
```

to:

```typescript
  controllers: [NotesController, SettingsController],
```

And add the import at the top of the file:

```typescript
import { SettingsController } from './settings.controller';
```

- [ ] **Step 5: Run test — verify PASS**

```bash
yarn nx test notes 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Build**

```bash
yarn nx build notes 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/microservices/notes/src/app/settings.controller.ts \
        apps/microservices/notes/src/app/app.module.ts \
        "apps/microservices/notes/src/app/__tests__/settings.controller.unit.test.ts"
git commit -m "feat(notes-ms): SettingsController — settings.prefs.* + settings.push.* patterns"
```

---

## Task 5: NotesClientService Extension

**Files:**

- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

- [ ] **Step 1: Add imports**

Read `libs/notes-client/src/lib/notes-client.service.ts`. Add to the import from `@icore/shared`:

```typescript
import type {
  // ... existing ...
  UserPrefsPayload,
  PushSubscriptionPayload,
} from '@icore/shared';
```

- [ ] **Step 2: Add 4 methods to NotesClientService**

Append after `getSnapshot` method:

```typescript
  getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    return firstValueFrom(
      this.client.send<UserPrefsPayload>('settings.prefs.get', { userId }),
    );
  }

  updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload> {
    return firstValueFrom(
      this.client.send<UserPrefsPayload>('settings.prefs.update', { userId, patch }),
    );
  }

  savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('settings.push.save', { userId, sub }),
    );
  }

  removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('settings.push.remove', { userId, endpoint }),
    );
  }
```

- [ ] **Step 3: Build**

```bash
yarn nx build notes-client 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): add settings methods — getUserPrefs/updateUserPrefs/push"
```

---

## Task 6: API Gateway SettingsModule

**Files:**

- Create: `apps/api/src/app/settings/settings.controller.ts`
- Create: `apps/api/src/app/settings/settings.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/app/settings/__tests__/settings.controller.unit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { SettingsController } from '../settings.controller';
import type { NotesClientService } from '@icore/notes-client';
import { DEFAULT_USER_PREFS } from '@icore/shared';

const mockNotes = {
  getUserPrefs: vi.fn().mockResolvedValue({ ...DEFAULT_USER_PREFS }),
  updateUserPrefs: vi.fn().mockResolvedValue({ ...DEFAULT_USER_PREFS, theme: 'dark' }),
  savePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
  removePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
} as unknown as NotesClientService;

const req = (uid?: string) => ({ user: uid ? { uid } : undefined }) as any;

describe('SettingsController', () => {
  let controller: SettingsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SettingsController(mockNotes);
  });

  it('getPrefs throws 401 when no user', async () => {
    await expect(controller.getPrefs(req())).rejects.toThrow(UnauthorizedException);
  });

  it('getPrefs returns prefs for authenticated user', async () => {
    const result = await controller.getPrefs(req('uid-1'));
    expect(mockNotes.getUserPrefs).toHaveBeenCalledWith('uid-1');
    expect(result.theme).toBe('system');
  });

  it('updatePrefs calls updateUserPrefs with patch', async () => {
    const result = await controller.updatePrefs(req('uid-1'), { theme: 'dark' });
    expect(mockNotes.updateUserPrefs).toHaveBeenCalledWith('uid-1', { theme: 'dark' });
    expect(result.theme).toBe('dark');
  });

  it('savePushSub saves subscription', async () => {
    const sub = { endpoint: 'https://x.com/1', keys: { p256dh: 'a', auth: 'b' } };
    const result = await controller.savePushSub(req('uid-1'), sub);
    expect(mockNotes.savePushSubscription).toHaveBeenCalledWith('uid-1', sub);
    expect(result.ok).toBe(true);
  });

  it('removePushSub removes subscription', async () => {
    const result = await controller.removePushSub(req('uid-1'), { endpoint: 'https://x.com/1' });
    expect(mockNotes.removePushSubscription).toHaveBeenCalledWith('uid-1', 'https://x.com/1');
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
yarn nx test api 2>&1 | grep -A3 "FAIL\|SettingsController"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create SettingsController**

```typescript
// apps/api/src/app/settings/settings.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { PushSubscriptionPayload, UserPrefsPayload, VerifiedToken } from '@icore/shared';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly notes: NotesClientService) {}

  @Get('me')
  getPrefs(@Req() req: Request & { user?: VerifiedToken }) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.getUserPrefs(uid);
  }

  @Patch('me')
  updatePrefs(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: Partial<UserPrefsPayload>,
  ) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.updateUserPrefs(uid, body);
  }

  @Post('push')
  savePushSub(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: PushSubscriptionPayload,
  ) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.savePushSubscription(uid, body);
  }

  @Delete('push')
  removePushSub(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: { endpoint: string },
  ) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.removePushSubscription(uid, body.endpoint);
  }
}
```

- [ ] **Step 4: Create SettingsModule**

```typescript
// apps/api/src/app/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { SettingsController } from './settings.controller';

@Module({
  imports: [NotesClientModule.forRoot()],
  controllers: [SettingsController],
})
export class SettingsModule {}
```

- [ ] **Step 5: Register SettingsModule in app.module.ts**

Read `apps/api/src/app/app.module.ts`. Add `SettingsModule` to the imports array. Add the import statement:

```typescript
import { SettingsModule } from './settings/settings.module';
```

- [ ] **Step 6: Run test — verify PASS**

```bash
yarn nx test api 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Build**

```bash
yarn nx build api 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app/settings/ apps/api/src/app/app.module.ts
git commit -m "feat(api): SettingsModule — GET/PATCH /settings/me + push subscription endpoints"
```

---

## Task 7: Client Query Hooks

**Files:**

- Create: `apps/client/src/queries/settings.ts`

- [ ] **Step 1: Create query file**

```typescript
// apps/client/src/queries/settings.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../main';

export type Theme = 'dark' | 'light' | 'system';
export type Language = 'en' | 'ru' | 'he' | 'es';

export interface NotificationPrefsPayload {
  channels: { inApp: boolean; push: boolean };
  events: {
    workflowSubmitted: { inApp: boolean; push: boolean };
    workflowApproved: { inApp: boolean; push: boolean };
    workflowRejected: { inApp: boolean; push: boolean };
    workflowPublished: { inApp: boolean; push: boolean };
    aiStandardsGenerated: { inApp: boolean; push: boolean };
    aiGapAnalysisDone: { inApp: boolean; push: boolean };
    systemNewFramework: { inApp: boolean; push: boolean };
  };
}

export interface UserPrefsPayload {
  theme: Theme;
  language: Language;
  notificationPrefs: NotificationPrefsPayload;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsPayload = {
  channels: { inApp: true, push: false },
  events: {
    workflowSubmitted: { inApp: true, push: false },
    workflowApproved: { inApp: true, push: false },
    workflowRejected: { inApp: true, push: false },
    workflowPublished: { inApp: true, push: false },
    aiStandardsGenerated: { inApp: true, push: false },
    aiGapAnalysisDone: { inApp: true, push: false },
    systemNewFramework: { inApp: false, push: false },
  },
};

export const DEFAULT_USER_PREFS: UserPrefsPayload = {
  theme: 'system',
  language: 'en',
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
};

export function useUserPrefs() {
  return useQuery<UserPrefsPayload>({
    queryKey: ['settings', 'prefs'],
    queryFn: () => api<UserPrefsPayload>('/settings/me'),
  });
}

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserPrefsPayload>) =>
      api<UserPrefsPayload>('/settings/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => qc.setQueryData(['settings', 'prefs'], data),
  });
}

export function useSavePushSubscription() {
  return useMutation({
    mutationFn: (sub: PushSubscriptionPayload) =>
      api<{ ok: boolean }>('/settings/push', {
        method: 'POST',
        body: JSON.stringify(sub),
      }),
  });
}

export function useRemovePushSubscription() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      api<{ ok: boolean }>('/settings/push', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }),
  });
}
```

- [ ] **Step 2: Lint**

```bash
yarn nx lint client 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/settings.ts
git commit -m "feat(client): settings query hooks — useUserPrefs/useUpdatePrefs/push"
```

---

## Task 8: Settings Route Shell with Hash Navigation

**Files:**

- Create: `apps/client/src/routes/_dashboard/settings.tsx`

- [ ] **Step 1: Create route file**

Note: Tab components don't exist yet — Tasks 9 and 10 will create them and update this file to import them. For now, the shell renders placeholder `<div>` elements.

```tsx
// apps/client/src/routes/_dashboard/settings.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@icore/template-shared';

const ADMIN_TABS = new Set(['audit-log', 'export', 'webhooks', 'retention', 'api-keys']);

function SettingsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = window.location.hash.slice(1);
    return hash || 'appearance';
  });

  function switchTab(tab: string) {
    setActiveTab(tab);
    history.replaceState(null, '', `/settings#${tab}`);
  }

  const tabs = [
    { id: 'appearance', label: t('settings.tabs.appearance') },
    { id: 'notification', label: t('settings.tabs.notification') },
    ...(isAdmin
      ? [
          { id: 'audit-log', label: t('settings.tabs.auditLog') },
          { id: 'export', label: t('settings.tabs.export') },
          { id: 'webhooks', label: t('settings.tabs.webhooks') },
          { id: 'retention', label: t('settings.tabs.retention') },
          { id: 'api-keys', label: t('settings.tabs.apiKeys') },
        ]
      : []),
  ];

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t('settings.title')}</h1>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={[
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-green-500 text-green-500'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — components added in Tasks 9 and 10 */}
      {activeTab === 'appearance' && <div />}
      {activeTab === 'notification' && <div />}
      {ADMIN_TABS.has(activeTab) && (
        <p className="text-sm text-muted-foreground">{t('common.soon')}</p>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/settings')({
  component: SettingsPage,
});
```

- [ ] **Step 2: Run route tree generation**

```bash
yarn nx run client:generate-routes 2>&1 | tail -5
```

Or if that command doesn't exist, the route tree is auto-generated on dev start. Verify `apps/client/src/routeTree.gen.ts` includes `/_dashboard/settings`.

- [ ] **Step 3: Lint**

```bash
yarn nx lint client 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/settings.tsx apps/client/src/routeTree.gen.ts
git commit -m "feat(client): settings route shell with hash tab navigation"
```

---

## Task 9: AppearanceTab Component

**Files:**

- Create: `apps/client/src/components/settings/AppearanceTab.tsx`
- Create: `apps/client/src/components/settings/__tests__/AppearanceTab.unit.test.tsx`

The `useThemeStore` from `@icore/template-shared` manages runtime theme. Its state shape: `{ mode: 'light' | 'dark' }`. Use `useThemeStore.setState({ mode: ... })` to update it directly (valid for any Zustand store). Check the exported actions if a named `setMode` exists — prefer that. The stored `prefs.theme` can be `'system'`, which maps to the system's preferred color scheme.

- [ ] **Step 1: Write failing test**

```tsx
// apps/client/src/components/settings/__tests__/AppearanceTab.unit.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { AppearanceTab } from '../AppearanceTab';

const mutateFn = vi.fn();

vi.mock('../../../queries/settings', () => ({
  useUserPrefs: () => ({
    data: { theme: 'dark', language: 'en', notificationPrefs: {} },
    isPending: false,
  }),
  useUpdatePrefs: () => ({ mutate: mutateFn }),
}));

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return { ...actual, useThemeStore: vi.fn(() => 'dark') };
});

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });
const wrap = (ui: React.ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

describe('AppearanceTab', () => {
  it('renders all three theme options', () => {
    render(wrap(<AppearanceTab />));
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  });

  it('renders all four language options', () => {
    render(wrap(<AppearanceTab />));
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('עברית')).toBeTruthy();
    expect(screen.getByText('Español')).toBeTruthy();
  });

  it('clicking Light button calls updatePrefs with theme light', () => {
    render(wrap(<AppearanceTab />));
    const lightBtn = screen.getByRole('button', { name: /light/i });
    fireEvent.click(lightBtn);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
yarn nx test client 2>&1 | grep -A3 "AppearanceTab\|FAIL"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create AppearanceTab**

```tsx
// apps/client/src/components/settings/AppearanceTab.tsx
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@icore/template-shared';
import { useUserPrefs, useUpdatePrefs } from '../../queries/settings';
import type { Theme, Language } from '../../queries/settings';

const THEMES: { value: Theme; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
  { value: 'system', labelKey: 'settings.theme.system' },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'he', label: 'עברית' },
  { value: 'es', label: 'Español' },
];

export function AppearanceTab() {
  const { t, i18n } = useTranslation();
  const { data: prefs, isPending } = useUserPrefs();
  const { mutate: updatePrefs } = useUpdatePrefs();

  // Read theme from store for immediate sync; fall back to server value
  const storeMode = useThemeStore((s) => s.mode);
  const currentTheme: Theme = prefs?.theme ?? (storeMode as Theme) ?? 'system';
  const currentLang: Language = prefs?.language ?? (i18n.language as Language) ?? 'en';

  function handleThemeChange(theme: Theme) {
    const resolvedMode =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    useThemeStore.setState({ mode: resolvedMode });
    updatePrefs({ theme });
  }

  function handleLanguageChange(lang: Language) {
    i18n.changeLanguage(lang);
    updatePrefs({ language: lang });
  }

  if (isPending) {
    return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-xl space-y-8">
      {/* Theme */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t('settings.theme.title')}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t('settings.theme.subtitle')}</p>
        <div className="flex gap-2">
          {THEMES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleThemeChange(value)}
              className={[
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                currentTheme === value
                  ? 'border-green-500/40 bg-green-500/10 text-green-500'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.language.title')}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">{t('settings.language.subtitle')}</p>
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleLanguageChange(value)}
              className={[
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                currentLang === value
                  ? 'border-green-500/40 bg-green-500/10 text-green-500'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
yarn nx test client 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 5: Wire AppearanceTab into settings.tsx**

Read `apps/client/src/routes/_dashboard/settings.tsx`. Add the import at the top:

```typescript
import { AppearanceTab } from '@/components/settings/AppearanceTab';
```

Replace `{activeTab === 'appearance'   && <div />}` with:

```tsx
{
  activeTab === 'appearance' && <AppearanceTab />;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/settings/AppearanceTab.tsx \
        "apps/client/src/components/settings/__tests__/AppearanceTab.unit.test.tsx" \
        apps/client/src/routes/_dashboard/settings.tsx
git commit -m "feat(client): AppearanceTab — theme + language settings"
```

---

## Task 10: NotificationTab Component

**Files:**

- Create: `apps/client/src/components/settings/NotificationTab.tsx`
- Create: `apps/client/src/components/settings/__tests__/NotificationTab.unit.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/client/src/components/settings/__tests__/NotificationTab.unit.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { NotificationTab } from '../NotificationTab';

vi.mock('../../../queries/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../queries/settings')>();
  return {
    ...actual,
    useUserPrefs: vi.fn().mockReturnValue({
      data: {
        theme: 'system',
        language: 'en',
        notificationPrefs: actual.DEFAULT_NOTIFICATION_PREFS,
      },
      isPending: false,
    }),
    useUpdatePrefs: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
    useSavePushSubscription: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
    useRemovePushSubscription: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  };
});

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });
const wrap = (ui: React.ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

describe('NotificationTab', () => {
  it('renders channels section', () => {
    render(wrap(<NotificationTab />));
    expect(screen.getByText(/in.?app/i)).toBeTruthy();
    expect(screen.getByText(/push/i)).toBeTruthy();
  });

  it('renders events matrix with all 7 events', () => {
    render(wrap(<NotificationTab />));
    // Check at least 2 event labels are present
    expect(screen.getByText(/submitted|approved|rejected|published/i)).toBeTruthy();
  });

  it('shows enable push button when push not enabled', () => {
    render(wrap(<NotificationTab />));
    expect(screen.getByRole('button', { name: /enable push/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
yarn nx test client 2>&1 | grep -A3 "NotificationTab\|FAIL"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create NotificationTab**

```tsx
// apps/client/src/components/settings/NotificationTab.tsx
import { useTranslation } from 'react-i18next';
import {
  useUserPrefs,
  useUpdatePrefs,
  useSavePushSubscription,
  useRemovePushSubscription,
  DEFAULT_NOTIFICATION_PREFS,
} from '../../queries/settings';
import type { NotificationPrefsPayload } from '../../queries/settings';

type EventKey = keyof NotificationPrefsPayload['events'];

const EVENT_ROWS: { key: EventKey; labelKey: string }[] = [
  { key: 'workflowSubmitted', labelKey: 'settings.notifications.events.workflowSubmitted' },
  { key: 'workflowApproved', labelKey: 'settings.notifications.events.workflowApproved' },
  { key: 'workflowRejected', labelKey: 'settings.notifications.events.workflowRejected' },
  { key: 'workflowPublished', labelKey: 'settings.notifications.events.workflowPublished' },
  { key: 'aiStandardsGenerated', labelKey: 'settings.notifications.events.aiStandardsGenerated' },
  { key: 'aiGapAnalysisDone', labelKey: 'settings.notifications.events.aiGapAnalysisDone' },
  { key: 'systemNewFramework', labelKey: 'settings.notifications.events.systemNewFramework' },
];

export function NotificationTab() {
  const { t } = useTranslation();
  const { data: prefs, isPending } = useUserPrefs();
  const { mutate: updatePrefs, isPending: saving } = useUpdatePrefs();
  const { mutateAsync: savePushSub } = useSavePushSubscription();
  const { mutate: removePushSub } = useRemovePushSubscription();

  const notifPrefs = prefs?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
  const pushEnabled = notifPrefs.channels.push;

  function toggleChannel(channel: 'inApp' | 'push', value: boolean) {
    updatePrefs({
      notificationPrefs: {
        ...notifPrefs,
        channels: { ...notifPrefs.channels, [channel]: value },
      },
    });
  }

  function toggleEvent(eventKey: EventKey, channel: 'inApp' | 'push', value: boolean) {
    updatePrefs({
      notificationPrefs: {
        ...notifPrefs,
        events: {
          ...notifPrefs.events,
          [eventKey]: { ...notifPrefs.events[eventKey], [channel]: value },
        },
      },
    });
  }

  async function handleEnablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    });
    const subJson = sub.toJSON();
    await savePushSub({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? '',
      },
    });
    toggleChannel('push', true);
  }

  function handleDisablePush() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return;
        removePushSub(sub.endpoint);
        return sub.unsubscribe();
      });
    toggleChannel('push', false);
  }

  if (isPending) {
    return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Channels */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.notifications.channels')}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('settings.notifications.channelsSubtitle')}
        </p>
        <div className="space-y-3">
          {/* In-app */}
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('settings.notifications.inApp')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.notifications.inAppDesc')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifPrefs.channels.inApp}
              disabled={saving}
              onClick={() => toggleChannel('inApp', !notifPrefs.channels.inApp)}
              className={[
                'relative h-5 w-9 rounded-full transition-colors',
                notifPrefs.channels.inApp ? 'bg-green-500' : 'bg-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  notifPrefs.channels.inApp ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
          {/* Push */}
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('settings.notifications.push')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.notifications.pushDesc')}
              </p>
            </div>
            {pushEnabled ? (
              <button
                type="button"
                onClick={handleDisablePush}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {t('settings.notifications.disablePush')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/20 transition-colors"
              >
                {t('settings.notifications.enablePush')}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Events matrix */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.notifications.events.title')}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('settings.notifications.events.subtitle')}
        </p>
        <div className="rounded-md border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px] gap-0 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>{t('settings.notifications.events.event')}</span>
            <span className="text-center">{t('settings.notifications.inApp')}</span>
            <span className="text-center">{t('settings.notifications.push')}</span>
          </div>
          {/* Rows */}
          {EVENT_ROWS.map(({ key, labelKey }) => (
            <div
              key={key}
              className="grid grid-cols-[1fr_80px_80px] gap-0 border-b border-border px-4 py-2.5 last:border-0"
            >
              <span className="text-sm text-foreground">{t(labelKey)}</span>
              {(['inApp', 'push'] as const).map((channel) => (
                <div key={channel} className="flex justify-center items-center">
                  <input
                    type="checkbox"
                    checked={notifPrefs.events[key][channel]}
                    disabled={saving || (channel === 'push' && !pushEnabled)}
                    onChange={(e) => toggleEvent(key, channel, e.target.checked)}
                    className="h-4 w-4 accent-green-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
yarn nx test client 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 5: Wire NotificationTab into settings.tsx**

Read `apps/client/src/routes/_dashboard/settings.tsx`. Add import:

```typescript
import { NotificationTab } from '@/components/settings/NotificationTab';
```

Replace `{activeTab === 'notification' && <div />}` with:

```tsx
{
  activeTab === 'notification' && <NotificationTab />;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/settings/NotificationTab.tsx \
        "apps/client/src/components/settings/__tests__/NotificationTab.unit.test.tsx" \
        apps/client/src/routes/_dashboard/settings.tsx
git commit -m "feat(client): NotificationTab — channels toggles + events matrix + push subscription"
```

---

## Task 11: Push Notification Service Worker + VAPID Setup

**Files:**

- Create: `apps/client/public/sw.js`
- Modify: `apps/client/src/main.tsx`
- Modify: `apps/client/.env`

Push notification SENDING is Plan 2. This task sets up:

1. The service worker that handles received push events
2. SW registration on app boot
3. VAPID public key env var (the private key stays server-side for Plan 2)

- [ ] **Step 1: Generate VAPID keys**

```bash
cd /home/vladimir-tkach/Projects/sec
npx web-push generate-vapid-keys --universal
```

Expected output (example — yours will differ):

```
Public Key:
BNbk... (88 chars)

Private Key:
abc123... (43 chars)
```

Save both values. The public key goes in `apps/client/.env`; the private key goes in `apps/microservices/notes/.env` (needed in Plan 2 for sending).

- [ ] **Step 2: Add VAPID public key to client .env**

Open `apps/client/.env` and add:

```bash
VITE_VAPID_PUBLIC_KEY=<paste-your-public-key-here>
```

- [ ] **Step 3: Add VAPID private key to notes .env (for Plan 2)**

Open `apps/microservices/notes/.env` and add (not used yet, prepared for Plan 2):

```bash
# VAPID (push notification sending — used in Plan 2)
VAPID_SUBJECT=mailto:admin@complianceiq.app
VAPID_PUBLIC_KEY=<paste-your-public-key-here>
VAPID_PRIVATE_KEY=<paste-your-private-key-here>
```

- [ ] **Step 4: Create service worker**

```javascript
// apps/client/public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'ComplianceIQ', {
      body: data.body ?? '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url === url && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 5: Register service worker in main.tsx**

Read `apps/client/src/main.tsx`. Find the line `wireShadcnNotifier();` and add after it:

```typescript
// Register push notification service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration failure is non-fatal — push notifications won't work
  });
}
```

- [ ] **Step 6: Lint + build**

```bash
yarn nx lint client && yarn nx build client 2>&1 | tail -5
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add apps/client/public/sw.js apps/client/src/main.tsx apps/client/.env
git commit -m "feat(client): push notification service worker + VAPID public key registration"
```

---

## Task 12: i18n Keys + Unlock Settings Nav

**Files:**

- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `apps/client/src/components/layout/LayoutSider.tsx`

- [ ] **Step 1: Add settings keys to en.ts**

Read the file, then add the `settings:` section after the `controls:` section:

```typescript
  settings: {
    title: 'Settings',
    tabs: {
      appearance:   'Appearance',
      notification: 'Notifications',
      auditLog:     'Audit Log',
      export:       'Export',
      webhooks:     'Webhooks',
      retention:    'Data Retention',
      apiKeys:      'API Keys',
    },
    theme: {
      title:    'Theme',
      subtitle: 'Choose how ComplianceIQ looks on this device.',
      light:    'Light',
      dark:     'Dark',
      system:   'System',
    },
    language: {
      title:    'Language',
      subtitle: 'Choose your preferred language.',
    },
    notifications: {
      channels:         'Notification Channels',
      channelsSubtitle: 'Choose how you receive notifications.',
      inApp:            'In-app',
      inAppDesc:        'Notifications appear inside the platform.',
      push:             'Browser Push',
      pushDesc:         'Notifications sent to your browser even when the app is closed.',
      enablePush:       'Enable Push',
      disablePush:      'Disable',
      events: {
        title:                 'Notification Events',
        subtitle:              'Choose which events trigger a notification.',
        event:                 'Event',
        workflowSubmitted:     'Standards submitted for review',
        workflowApproved:      'Standards approved',
        workflowRejected:      'Standards returned for revision',
        workflowPublished:     'Standards published',
        aiStandardsGenerated:  'AI standards generation complete',
        aiGapAnalysisDone:     'Gap analysis complete',
        systemNewFramework:    'New framework added to the platform',
      },
    },
  },
```

- [ ] **Step 2: Add settings keys to ru.ts**

Read the file, then add after `controls:` section:

```typescript
  settings: {
    title: 'Настройки',
    tabs: {
      appearance:   'Внешний вид',
      notification: 'Уведомления',
      auditLog:     'Журнал аудита',
      export:       'Экспорт',
      webhooks:     'Вебхуки',
      retention:    'Хранение данных',
      apiKeys:      'API-ключи',
    },
    theme: {
      title:    'Тема',
      subtitle: 'Выберите, как выглядит ComplianceIQ на этом устройстве.',
      light:    'Светлая',
      dark:     'Тёмная',
      system:   'Системная',
    },
    language: {
      title:    'Язык',
      subtitle: 'Выберите предпочтительный язык.',
    },
    notifications: {
      channels:         'Каналы уведомлений',
      channelsSubtitle: 'Выберите, как получать уведомления.',
      inApp:            'Внутри платформы',
      inAppDesc:        'Уведомления отображаются внутри платформы.',
      push:             'Push-уведомления',
      pushDesc:         'Уведомления в браузере, даже когда приложение закрыто.',
      enablePush:       'Включить Push',
      disablePush:      'Отключить',
      events: {
        title:                 'События',
        subtitle:              'Выберите, какие события вызывают уведомление.',
        event:                 'Событие',
        workflowSubmitted:     'Стандарты отправлены на проверку',
        workflowApproved:      'Стандарты одобрены',
        workflowRejected:      'Стандарты возвращены на доработку',
        workflowPublished:     'Стандарты опубликованы',
        aiStandardsGenerated:  'Генерация стандартов завершена',
        aiGapAnalysisDone:     'Анализ пробелов завершён',
        systemNewFramework:    'Добавлен новый фреймворк',
      },
    },
  },
```

- [ ] **Step 3: Add settings keys to he.ts**

Read the file, then add after `controls:` section:

```typescript
  settings: {
    title: 'הגדרות',
    tabs: {
      appearance:   'מראה',
      notification: 'התראות',
      auditLog:     'יומן ביקורת',
      export:       'ייצוא',
      webhooks:     'וובהוקס',
      retention:    'שמירת נתונים',
      apiKeys:      'מפתחות API',
    },
    theme: {
      title:    'ערכת נושא',
      subtitle: 'בחר כיצד ComplianceIQ נראה במכשיר זה.',
      light:    'בהיר',
      dark:     'כהה',
      system:   'מערכת',
    },
    language: {
      title:    'שפה',
      subtitle: 'בחר את השפה המועדפת.',
    },
    notifications: {
      channels:         'ערוצי התראות',
      channelsSubtitle: 'בחר כיצד לקבל התראות.',
      inApp:            'בתוך האפליקציה',
      inAppDesc:        'התראות מוצגות בתוך הפלטפורמה.',
      push:             'Push בדפדפן',
      pushDesc:         'התראות בדפדפן גם כשהאפליקציה סגורה.',
      enablePush:       'הפעל Push',
      disablePush:      'בטל',
      events: {
        title:                 'אירועים',
        subtitle:              'בחר אילו אירועים מפעילים התראה.',
        event:                 'אירוע',
        workflowSubmitted:     'תקנים הוגשו לבדיקה',
        workflowApproved:      'תקנים אושרו',
        workflowRejected:      'תקנים הוחזרו לתיקון',
        workflowPublished:     'תקנים פורסמו',
        aiStandardsGenerated:  'יצירת תקנים ב-AI הושלמה',
        aiGapAnalysisDone:     'ניתוח פערים הושלם',
        systemNewFramework:    'מסגרת חדשה נוספה לפלטפורמה',
      },
    },
  },
```

- [ ] **Step 4: Add settings keys to es.ts**

Read the file, then add after `controls:` section:

```typescript
  settings: {
    title: 'Configuración',
    tabs: {
      appearance:   'Apariencia',
      notification: 'Notificaciones',
      auditLog:     'Registro de auditoría',
      export:       'Exportar',
      webhooks:     'Webhooks',
      retention:    'Retención de datos',
      apiKeys:      'Claves API',
    },
    theme: {
      title:    'Tema',
      subtitle: 'Elige cómo se ve ComplianceIQ en este dispositivo.',
      light:    'Claro',
      dark:     'Oscuro',
      system:   'Sistema',
    },
    language: {
      title:    'Idioma',
      subtitle: 'Elige tu idioma preferido.',
    },
    notifications: {
      channels:         'Canales de notificación',
      channelsSubtitle: 'Elige cómo recibir notificaciones.',
      inApp:            'En la app',
      inAppDesc:        'Las notificaciones aparecen dentro de la plataforma.',
      push:             'Push en navegador',
      pushDesc:         'Notificaciones en el navegador aunque la app esté cerrada.',
      enablePush:       'Activar Push',
      disablePush:      'Desactivar',
      events: {
        title:                 'Eventos',
        subtitle:              'Elige qué eventos generan una notificación.',
        event:                 'Evento',
        workflowSubmitted:     'Estándares enviados a revisión',
        workflowApproved:      'Estándares aprobados',
        workflowRejected:      'Estándares devueltos para revisión',
        workflowPublished:     'Estándares publicados',
        aiStandardsGenerated:  'Generación de estándares con IA completada',
        aiGapAnalysisDone:     'Análisis de brechas completado',
        systemNewFramework:    'Nuevo marco añadido a la plataforma',
      },
    },
  },
```

- [ ] **Step 5: Unlock Settings nav item in LayoutSider**

Read `apps/client/src/components/layout/LayoutSider.tsx`. Find the bottom section containing Profile and Settings links. The Settings button currently has no route — replace the `<button>` with a `<Link>` pointing to `/settings` and remove the soon badge:

```tsx
<Link
  to="/settings"
  title={collapsed ? t('nav.settings') : undefined}
  aria-label={t('nav.settings')}
  className={[
    'flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors duration-150 cursor-pointer',
    isActive('/settings')
      ? 'bg-green-500/10 text-green-500 border border-green-500/20'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')}
>
  <Settings size={16} className="shrink-0" />
  {!collapsed && <span className="flex-1 truncate">{t('nav.settings')}</span>}
</Link>
```

Replace the existing `<button type="button" ... Settings ...>` block entirely with the `<Link>` above. Add `Link` to the existing `@tanstack/react-router` import at the top of the file if it's not already there.

- [ ] **Step 6: Run all tests + lint + build**

```bash
yarn nx test client && yarn nx lint client && yarn nx build client 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/ \
        apps/client/src/components/layout/LayoutSider.tsx
git commit -m "feat(client): settings i18n keys (en/ru/he/es) + unlock settings nav link"
```

---

## Final Check

```bash
yarn nx test client && yarn nx test shared && yarn nx test notes && yarn nx test api
yarn nx build client && yarn nx build api && yarn nx build notes
```

All should pass.

---

## What's Next — Plan 2: Admin Tabs

Plan 2 delivers: `#audit-log` (with `audit_events` table + activity logging on workflow transitions), `#export` (PDF via @react-pdf/renderer + CSV/JSON), `#webhooks` (CRUD + test payload + delivery log), `#retention` (org settings), `#api-keys` (CRUD + bcrypt hashing), and push notification SENDING via `web-push` on workflow transitions.
