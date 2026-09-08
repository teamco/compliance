# Dialog/Sheet Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align create/edit UI pattern across all pages: `create = Dialog`, `edit = Sheet`, `delete = AlertDialog`.

**Architecture:** Only `org/-org-page.tsx` needs changing — it's the sole page with both create and edit, both currently rendered inside a single `Sheet`. Split that Sheet into a `Dialog` (create) + `Sheet` (edit). All other 9 pages already use `Dialog` for create and have no edit operations.

**Tech Stack:** React 19, shadcn/ui (`Dialog`, `Sheet`), TanStack Query, i18next, Vitest

---

### Task 1: Refactor `org-page.tsx` — Dialog for create, Sheet for edit

**Files:**
- Modify: `apps/client/src/routes/_dashboard/org/-org-page.tsx`

**Context:** Currently uses one `Sheet` controlled by `modalMode: 'create' | 'edit' | null`. Replace with:
- `createOpen: boolean` → controls `Dialog`
- `editingId: string | null` → already exists, controls `Sheet`

- [ ] **Step 1: Replace imports**

Replace line 14 (Sheet-only import) with both Dialog and Sheet imports:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
```

- [ ] **Step 2: Replace state**

Replace lines 28–29:
```tsx
// Before
const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
const [editingId, setEditingId] = useState<string | null>(null);

// After
const [createOpen, setCreateOpen] = useState(false);
const [editingId, setEditingId] = useState<string | null>(null);
```

- [ ] **Step 3: Remove `closeModal`, update `handleCreate`**

Remove the `closeModal()` function (lines 38–41).

Update `handleCreate` to close the dialog directly:
```tsx
async function handleCreate(data: OrganizationInput) {
  try {
    const org = await create.mutateAsync(data);
    setActiveOrgId(org.id);
    setCreateOpen(false);
    notify.success(t('org.created'));
  } catch {
    notify.error(t('error.unknown'));
  }
}
```

- [ ] **Step 4: Update the create Button trigger**

Line 99 — change `setModalMode('create')` to `setCreateOpen(true)`:
```tsx
<Button
  variant="outline"
  onClick={() => setCreateOpen(true)}
  className="gap-2 sm:ms-auto"
>
```

- [ ] **Step 5: Replace the single Sheet with Dialog (create) + Sheet (edit)**

Replace lines 107–132 with:
```tsx
{/* Create — Dialog */}
<Dialog open={createOpen} onOpenChange={setCreateOpen}>
  <DialogContent
    onPointerDownOutside={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
  >
    <DialogHeader>
      <DialogTitle>{t('org.createTitle')}</DialogTitle>
    </DialogHeader>
    <OrgForm
      initial={EMPTY_FORM}
      onSave={(data) => void handleCreate(data)}
      isPending={create.isPending}
      submitLabel={t('org.createOrganization')}
    />
  </DialogContent>
</Dialog>

{/* Edit — Sheet */}
<Sheet open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
  <SheetContent
    className="w-full max-w-110"
    onPointerDownOutside={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
  >
    <SheetHeader>
      <SheetTitle>{t('org.editTitle')}</SheetTitle>
    </SheetHeader>
    <div className="min-h-0 flex-1">
      {editingOrg && (
        <EditOrgForm org={editingOrg} onSaved={() => setEditingId(null)} />
      )}
    </div>
  </SheetContent>
</Sheet>
```

- [ ] **Step 6: Simplify OrgList callback and EditOrgForm onSaved**

Lines 137–140 — `onEdit` no longer needs to set `modalMode`, just `setEditingId`:
```tsx
<OrgList
  orgs={filteredOrgs}
  activeOrgId={activeOrgId}
  onEdit={setEditingId}
  onDelete={setConfirmDeleteId}
/>
```

- [ ] **Step 7: Run prettier + lint + build**

```bash
npx prettier --write apps/client/src/routes/_dashboard/org/-org-page.tsx
yarn nx lint client
yarn nx build client
```

Expected: no errors.

- [ ] **Step 8: Verify in browser via Playwright**

Launch dev server (`yarn dev`), navigate to `/org`. Check:
1. "New Organization" button opens a **centered Dialog** (not a right panel)
2. Edit icon on any org row opens a **right Sheet**
3. Delete icon opens **AlertDialog** (unchanged)
4. Both create and edit submit correctly

- [ ] **Step 9: Commit**

```bash
git add apps/client/src/routes/_dashboard/org/-org-page.tsx
git commit -m "refactor(client): split org Sheet into Dialog (create) + Sheet (edit)"
```
