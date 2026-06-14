# Assets Edit Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit functionality to the Assets page using the project's established pattern: `create = Dialog`, `edit = Sheet`, `delete = AlertDialog`.

**Architecture:** All changes stay in `assets.tsx` (YAGNI — no new files needed, form fields are simple). Add `editingId` + `editSnapshotAsset` + `editForm` state. Wire `useUpdateAsset` hook. Add Pencil edit button to each asset card. Add Sheet overlay with pre-populated form fields.

**Tech Stack:** React 19, shadcn/ui (`Sheet`), TanStack Query (`useUpdateAsset`), i18next, Vitest

---

### Task 1: Add i18n keys for edit

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`

- [ ] **Step 1: Add two keys inside the `assets` object** (after `addDescription`, before `empty`):

```ts
// in libs/template-shared/src/lib/i18n/locales/en.ts
// find the assets block (around line 524), add these two keys:
editTitle: 'Edit Asset',
updated: 'Asset updated',
```

Result — the `assets` block top should look like:
```ts
assets: {
  subtitle: 'Inventory of organizational IT assets',
  addAsset: 'New Asset',
  addDescription: 'Register an IT asset — service, application, infrastructure, or device',
  editTitle: 'Edit Asset',
  updated: 'Asset updated',
  empty: 'No assets registered',
  // ...rest unchanged
```

- [ ] **Step 2: Run prettier**

```bash
npx prettier --write libs/template-shared/src/lib/i18n/locales/en.ts
```

- [ ] **Step 3: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/en.ts
git commit -m "feat(i18n): add assets editTitle and updated keys"
```

---

### Task 2: Add edit Sheet to assets.tsx

**Files:**
- Modify: `apps/client/src/routes/_dashboard/assets.tsx`

The current file is 215 lines. These changes add ~65 lines.

- [ ] **Step 1: Update imports**

Replace the current import block (lines 1–24) with:

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Server } from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useAssets,
  useCreateAsset,
  useDeleteAsset,
  useUpdateAsset,
  type Asset,
  type AssetInput,
  type AssetPatch,
} from '@/queries/assets';
```

- [ ] **Step 2: Add hooks and edit state inside `AssetsPage`**

After the existing `const deleteMut = useDeleteAsset(orgId);` line, add:

```tsx
const updateMut = useUpdateAsset(orgId);
const notify = useNotify();

const [editingId, setEditingId] = useState<string | null>(null);
const [editSnapshotAsset, setEditSnapshotAsset] = useState<Asset | null>(null);
const [editForm, setEditForm] = useState<AssetPatch>({});
```

- [ ] **Step 3: Add `handleEditSubmit` handler**

After `handleSubmit`, add:

```tsx
function handleEditSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!editingId) return;
  updateMut.mutate(
    { id: editingId, patch: editForm },
    {
      onSuccess: () => {
        setEditingId(null);
        notify.success(t('assets.updated'));
      },
    },
  );
}
```

- [ ] **Step 4: Add edit button to each asset card**

Replace the delete `<button>` at the bottom of each card (currently the only action) with a two-button row:

```tsx
<div className="flex items-center justify-end gap-2 mt-auto pt-1">
  <button
    type="button"
    onClick={() => {
      setEditSnapshotAsset(asset);
      setEditForm({
        name: asset.name,
        type: asset.type,
        criticality: asset.criticality,
        owner: asset.owner,
        description: asset.description,
      });
      setEditingId(asset.id);
    }}
    className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
  >
    <Pencil size={11} />
    {t('common.edit')}
  </button>
  <button
    type="button"
    onClick={() => deleteMut.mutate(asset.id)}
    className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
  >
    {t('common.delete')}
  </button>
</div>
```

- [ ] **Step 5: Add edit Sheet before the closing `</PageLayout>`**

Add this block after the existing `</Dialog>` (before `</PageLayout>`):

```tsx
{/* Edit — Sheet */}
<Sheet open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
  <SheetContent
    onPointerDownOutside={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
  >
    <SheetHeader>
      <SheetTitle>{t('assets.editTitle')}</SheetTitle>
    </SheetHeader>
    {editSnapshotAsset && (
      <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label>{t('assets.name')}</Label>
          <Input
            value={editForm.name ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('assets.namePlaceholder')}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('assets.typeLabel')}</Label>
            <select
              value={editForm.type ?? 'service'}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, type: e.target.value as Asset['type'] }))
              }
              className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
            >
              {ASSET_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`assets.type.${tp}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('assets.criticality.label')}</Label>
            <select
              value={editForm.criticality ?? 'medium'}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  criticality: e.target.value as Asset['criticality'],
                }))
              }
              className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
            >
              {CRITICALITY_LEVELS.map((c) => (
                <option key={c} value={c}>
                  {t(`assets.criticality.${c}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('assets.owner')}</Label>
          <Input
            value={editForm.owner ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
            placeholder={t('assets.ownerPlaceholder')}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>{t('assets.description')}</Label>
          <textarea
            value={editForm.description ?? ''}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={updateMut.isPending}>
            {updateMut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    )}
  </SheetContent>
</Sheet>
```

- [ ] **Step 6: Check `common.edit` and `common.save` keys exist**

```bash
grep -n "edit:\|save:" libs/template-shared/src/lib/i18n/locales/en.ts | head -10
```

If `common.edit` or `common.save` are missing, add them to the `common` block. `common.cancel`, `common.saving`, `common.create`, `common.delete` already exist — check if `edit` and `save` do too.

- [ ] **Step 7: Run prettier + lint + build**

```bash
npx prettier --write apps/client/src/routes/_dashboard/assets.tsx
yarn nx lint client
yarn nx build client
```

All must pass.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/routes/_dashboard/assets.tsx
git commit -m "feat(client): add edit Sheet to Assets page"
```
