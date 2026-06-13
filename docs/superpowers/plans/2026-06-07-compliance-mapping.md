# Module 6 — Compliance Mapping Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/controls` page showing a matrix of which generated standard controls map to which compliance framework controls, plus a "View Mapping" link from the standards detail page.

**Architecture:** Pure client-side — all data is already fetched via `useFrameworks()`, `useStandardsDocuments()`, and `useStandardsDocument(id)`. No new API endpoints. New route `/_dashboard/controls` reads `?docId` from URL search params. `ControlsTable` is a pure presentational component that accepts controls + frameworks as props.

**Tech Stack:** React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS, Vitest + @testing-library/react, TypeScript.

---

## File Map

| Action       | Path                                                                        | Responsibility                                                     |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Create       | `apps/client/src/components/controls/ControlsTable.tsx`                     | Pure matrix table: controls × frameworks                           |
| Create       | `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx` | Unit tests for table rendering logic                               |
| Create       | `apps/client/src/routes/_dashboard/controls.tsx`                            | Page: doc selector, framework toggles, gaps filter, coverage badge |
| Modify       | `apps/client/src/components/layout/LayoutSider.tsx`                         | Remove `soon: true` from Controls nav item                         |
| Modify       | `apps/client/src/routes/_dashboard/standards.$id.tsx`                       | Add "View Mapping →" link next to WorkflowBar                      |
| Auto-updated | `apps/client/src/routeTree.gen.ts`                                          | TanStack Router regenerates on `yarn nx run client:serve`          |

---

## Task 1: ControlsTable component + unit tests

**Files:**

- Create: `apps/client/src/components/controls/ControlsTable.tsx`
- Create: `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx`

- [ ] **Step 1.1: Write the failing tests**

Create `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ControlsTable } from '../ControlsTable';
import type { Framework, StandardControl } from '../../../queries/notes';

const fw1: Framework = {
  id: 'fw-1',
  slug: 'soc2',
  name: 'SOC 2',
  description: '',
  version: '2017',
  category: 'security',
};
const fw2: Framework = {
  id: 'fw-2',
  slug: 'iso27001',
  name: 'ISO 27001',
  description: '',
  version: '2022',
  category: 'security',
};

const mapped: StandardControl = {
  code: 'AC-01',
  title: 'Access Control Policy',
  description: '',
  implementation: '',
  evidence: [],
  priority: 'critical',
  category: 'Access Control',
  frameworkMappings: [{ frameworkId: 'fw-1', controlCode: 'CC6.1' }],
};
const unmapped: StandardControl = {
  code: 'AC-02',
  title: 'Account Management',
  description: '',
  implementation: '',
  evidence: [],
  priority: 'high',
  category: 'Access Control',
  frameworkMappings: [],
};

describe('ControlsTable', () => {
  it('renders framework columns as headers', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1, fw2]} showGapsOnly={false} />);
    expect(screen.getByText('SOC 2')).toBeTruthy();
    expect(screen.getByText('ISO 27001')).toBeTruthy();
  });

  it('renders a check cell with controlCode title for mapped framework', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1]} showGapsOnly={false} />);
    expect(screen.getByTitle('CC6.1')).toBeTruthy();
  });

  it('renders a dash cell for unmapped framework', () => {
    const { container } = render(
      <ControlsTable controls={[mapped]} frameworks={[fw2]} showGapsOnly={false} />,
    );
    expect(container.querySelector('[data-unmapped]')).toBeTruthy();
  });

  it('hides fully-covered rows when showGapsOnly=true', () => {
    // mapped covers fw-1 only; with showGapsOnly and frameworks=[fw1,fw2], AC-01 is NOT fully covered → shown
    // unmapped covers nothing → shown
    render(
      <ControlsTable controls={[mapped, unmapped]} frameworks={[fw1, fw2]} showGapsOnly={true} />,
    );
    expect(screen.getByText('AC-01')).toBeTruthy();
    expect(screen.getByText('AC-02')).toBeTruthy();
  });

  it('hides fully-covered rows — control covered by all selected frameworks is hidden', () => {
    // mapped covers fw-1; if only fw-1 is selected, AC-01 is fully covered → hidden
    render(<ControlsTable controls={[mapped, unmapped]} frameworks={[fw1]} showGapsOnly={true} />);
    expect(screen.queryByText('AC-01')).toBeNull();
    expect(screen.getByText('AC-02')).toBeTruthy();
  });

  it('renders priority badge text', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1]} showGapsOnly={false} />);
    expect(screen.getByText('critical')).toBeTruthy();
  });

  it('renders empty state when no controls match gaps filter', () => {
    render(<ControlsTable controls={[mapped]} frameworks={[fw1]} showGapsOnly={true} />);
    expect(screen.getByText(/no gaps/i)).toBeTruthy();
  });
});
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
yarn nx test client --testFile=apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx
```

Expected: FAIL — `Cannot find module '../ControlsTable'`

- [ ] **Step 1.3: Implement ControlsTable**

Create `apps/client/src/components/controls/ControlsTable.tsx`:

```tsx
import type { Framework, StandardControl } from '../../queries/notes';

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

interface ControlsTableProps {
  controls: StandardControl[];
  frameworks: Framework[];
  showGapsOnly: boolean;
}

export function ControlsTable({ controls, frameworks, showGapsOnly }: ControlsTableProps) {
  const visible = showGapsOnly
    ? controls.filter(
        (c) => !frameworks.every((fw) => c.frameworkMappings.some((m) => m.frameworkId === fw.id)),
      )
    : controls;

  if (visible.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {showGapsOnly ? 'No gaps — all controls are fully mapped.' : 'No controls to display.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">
              Code
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">
              Title
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">
              Priority
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">
              Category
            </th>
            {frameworks.map((fw) => (
              <th
                key={fw.id}
                className="px-3 py-2.5 text-center font-medium text-muted-foreground text-xs whitespace-nowrap"
              >
                {fw.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((control, i) => (
            <tr
              key={control.code}
              className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
            >
              <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">
                {control.code}
              </td>
              <td className="px-3 py-2.5 text-foreground max-w-[260px] truncate">
                {control.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITY_CLASS[control.priority]}`}
                >
                  {control.priority}
                </span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                {control.category}
              </td>
              {frameworks.map((fw) => {
                const mapping = control.frameworkMappings.find((m) => m.frameworkId === fw.id);
                return (
                  <td key={fw.id} className="px-3 py-2.5 text-center">
                    {mapping ? (
                      <span
                        title={mapping.controlCode}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-bold cursor-default"
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        data-unmapped="true"
                        className="inline-block w-4 h-px bg-muted-foreground/20"
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 1.4: Run tests — verify they pass**

```bash
yarn nx test client --testFile=apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx
```

Expected: all 6 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add apps/client/src/components/controls/
git commit -m "feat(client): ControlsTable component — compliance matrix"
```

---

## Task 2: ControlsPage route

**Files:**

- Create: `apps/client/src/routes/_dashboard/controls.tsx`

- [ ] **Step 2.1: Create the page**

Create `apps/client/src/routes/_dashboard/controls.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useFrameworks, useStandardsDocuments, useStandardsDocument } from '../../queries/notes';
import { ControlsTable } from '../../components/controls/ControlsTable';
import { PageLayout } from '../../components/PageLayout';

export const Route = createFileRoute('/_dashboard/controls')({
  validateSearch: (s: Record<string, unknown>) => ({
    docId: typeof s['docId'] === 'string' ? s['docId'] : undefined,
  }),
  component: ControlsPage,
});

function ControlsPage() {
  const { t } = useTranslation();
  const { docId: searchDocId } = Route.useSearch();

  const { data: frameworks = [], isPending: fwLoading } = useFrameworks();
  const { data: documents = [], isPending: docsLoading } = useStandardsDocuments();

  const completedDocs = useMemo(
    () => documents.filter((d) => d.status === 'completed'),
    [documents],
  );

  const [docId, setDocId] = useState(searchDocId ?? '');
  const [selectedFwIds, setSelectedFwIds] = useState<Set<string>>(new Set());
  const [showGapsOnly, setShowGapsOnly] = useState(false);

  // Pre-select all frameworks once loaded
  useEffect(() => {
    if (frameworks.length > 0 && selectedFwIds.size === 0) {
      setSelectedFwIds(new Set(frameworks.map((f) => f.id)));
    }
  }, [frameworks, selectedFwIds.size]);

  // Auto-select first completed doc if none selected
  useEffect(() => {
    if (!docId && completedDocs.length > 0) {
      setDocId(completedDocs[0].id);
    }
  }, [completedDocs, docId]);

  const { data: doc, isPending: docLoading } = useStandardsDocument(docId);

  const selectedFrameworks = useMemo(
    () => frameworks.filter((f) => selectedFwIds.has(f.id)),
    [frameworks, selectedFwIds],
  );

  const coverageCount = useMemo(() => {
    if (!doc) return 0;
    return doc.controls.filter((c) =>
      selectedFrameworks.some((fw) => c.frameworkMappings.some((m) => m.frameworkId === fw.id)),
    ).length;
  }, [doc, selectedFrameworks]);

  function toggleFramework(id: string) {
    setSelectedFwIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isLoading = fwLoading || docsLoading || (!!docId && docLoading);

  return (
    <PageLayout title={t('nav.controls')}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Document selector */}
        <select
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40"
        >
          {completedDocs.length === 0 && (
            <option value="" disabled>
              {t('controls.noDocuments')}
            </option>
          )}
          {completedDocs.map((d) => (
            <option key={d.id} value={d.id}>
              {new Date(d.createdAt).toLocaleDateString()} — {d.frameworkIds.length}{' '}
              {t('controls.frameworks')}
            </option>
          ))}
        </select>

        {/* Framework toggles */}
        <div className="flex items-center gap-1.5">
          {frameworks.map((fw) => (
            <button
              key={fw.id}
              type="button"
              onClick={() => toggleFramework(fw.id)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                selectedFwIds.has(fw.id)
                  ? 'bg-green-500/10 border-green-500/20 text-green-500'
                  : 'bg-surface border-border text-muted-foreground/50'
              }`}
            >
              {fw.slug.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Show gaps only */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showGapsOnly}
            onChange={(e) => setShowGapsOnly(e.target.checked)}
            className="accent-green-500"
          />
          <span className="text-xs text-muted-foreground">{t('controls.showGapsOnly')}</span>
        </label>

        {/* Coverage badge */}
        {doc && (
          <span className="ml-auto text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{coverageCount}</span>
            {' / '}
            <span className="font-semibold text-foreground">{doc.controls.length}</span>{' '}
            {t('controls.controlsMapped')}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : !docId || !doc ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {completedDocs.length === 0 ? t('controls.generateFirst') : t('controls.selectDocument')}
        </div>
      ) : (
        <ControlsTable
          controls={doc.controls}
          frameworks={selectedFrameworks}
          showGapsOnly={showGapsOnly}
        />
      )}
    </PageLayout>
  );
}
```

- [ ] **Step 2.2: Add i18n keys**

Add to `libs/template-shared/src/lib/i18n/locales/en.ts` under a new `controls:` section at the end (before closing `}`):

```ts
  controls: {
    noDocuments: 'No completed documents',
    frameworks: 'frameworks',
    showGapsOnly: 'Show gaps only',
    controlsMapped: 'controls mapped',
    generateFirst: 'Generate a standards document first to view compliance mapping.',
    selectDocument: 'Select a document above to view the compliance matrix.',
  },
```

Add to `libs/template-shared/src/lib/i18n/locales/ru.ts`:

```ts
  controls: {
    noDocuments: 'Нет завершённых документов',
    frameworks: 'фреймворков',
    showGapsOnly: 'Только пробелы',
    controlsMapped: 'контролов покрыто',
    generateFirst: 'Сначала создайте документ стандартов для просмотра маппинга.',
    selectDocument: 'Выберите документ выше для просмотра матрицы соответствия.',
  },
```

Add to `libs/template-shared/src/lib/i18n/locales/he.ts`:

```ts
  controls: {
    noDocuments: 'אין מסמכים מושלמים',
    frameworks: 'מסגרות',
    showGapsOnly: 'הצג פערים בלבד',
    controlsMapped: 'פקדים ממופים',
    generateFirst: 'צור מסמך תקנים תחילה לצפייה במיפוי התאימות.',
    selectDocument: 'בחר מסמך למעלה לצפייה במטריצת התאימות.',
  },
```

Add to `libs/template-shared/src/lib/i18n/locales/es.ts`:

```ts
  controls: {
    noDocuments: 'Sin documentos completados',
    frameworks: 'marcos',
    showGapsOnly: 'Mostrar solo brechas',
    controlsMapped: 'controles mapeados',
    generateFirst: 'Genera un documento de estándares primero para ver el mapeo.',
    selectDocument: 'Selecciona un documento arriba para ver la matriz de cumplimiento.',
  },
```

- [ ] **Step 2.3: Regenerate route tree**

```bash
yarn nx run client:serve
```

Wait for the dev server to start. TanStack Router auto-detects the new `controls.tsx` file and rewrites `apps/client/src/routeTree.gen.ts`. Stop the server (Ctrl+C) once you see "Route tree generated".

Alternatively run just the codegen:

```bash
cd apps/client && npx @tanstack/router-cli generate
```

- [ ] **Step 2.4: Commit**

```bash
git add apps/client/src/routes/_dashboard/controls.tsx \
        libs/template-shared/src/lib/i18n/locales/ \
        apps/client/src/routeTree.gen.ts
git commit -m "feat(client): Module 6 — Controls compliance mapping page"
```

---

## Task 3: Sidebar activation + "View Mapping" link from standards detail

**Files:**

- Modify: `apps/client/src/components/layout/LayoutSider.tsx`
- Modify: `apps/client/src/routes/_dashboard/standards.$id.tsx`

- [ ] **Step 3.1: Enable Controls in sidebar**

In `apps/client/src/components/layout/LayoutSider.tsx`, find:

```ts
{ labelKey: 'nav.controls', to: '/controls', icon: Shield, soon: true },
```

Change to:

```ts
{ labelKey: 'nav.controls', to: '/controls', icon: Shield },
```

- [ ] **Step 3.2: Add "View Mapping →" link in standards.$id**

In `apps/client/src/routes/_dashboard/standards.$id.tsx`, `Link` is already imported. Find the `<WorkflowBar ... />` render line (search for `WorkflowBar status=`). It's inside the main return block. Wrap it and the new link in a flex container:

Replace:

```tsx
<WorkflowBar status={doc.workflowStatus ?? 'draft'} docId={id} isAdmin={isAdmin} />
```

With:

```tsx
<div className="flex items-center justify-between gap-3">
  <WorkflowBar status={doc.workflowStatus ?? 'draft'} docId={id} isAdmin={isAdmin} />
  {doc.status === 'completed' && (
    <Link
      to="/controls"
      search={{ docId: id }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-green-500 transition-colors whitespace-nowrap"
    >
      View Mapping →
    </Link>
  )}
</div>
```

- [ ] **Step 3.3: Verify nav.controls i18n key exists**

```bash
grep -n "controls" libs/template-shared/src/lib/i18n/locales/en.ts
```

Expected output includes `nav: { ... controls: 'Controls' ... }`. If missing add it to the `nav` section:

```ts
    controls: 'Controls',
```

(Check the nav section; other nav keys like `nav.frameworks` etc. are already there.)

- [ ] **Step 3.4: Commit**

```bash
git add apps/client/src/components/layout/LayoutSider.tsx \
        apps/client/src/routes/_dashboard/standards.\$id.tsx
git commit -m "feat(client): wire Controls nav + View Mapping link from standards detail"
```

---

## Task 4: Lint + build verification

- [ ] **Step 4.1: Run prettier**

```bash
npx prettier --write \
  apps/client/src/routes/_dashboard/controls.tsx \
  apps/client/src/components/controls/ControlsTable.tsx \
  apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx \
  apps/client/src/routes/_dashboard/standards.\$id.tsx \
  apps/client/src/components/layout/LayoutSider.tsx \
  libs/template-shared/src/lib/i18n/locales/en.ts \
  libs/template-shared/src/lib/i18n/locales/ru.ts \
  libs/template-shared/src/lib/i18n/locales/he.ts \
  libs/template-shared/src/lib/i18n/locales/es.ts
```

- [ ] **Step 4.2: Lint client**

```bash
yarn nx lint client
```

Expected: no errors

- [ ] **Step 4.3: Lint template-shared**

```bash
yarn nx lint template-shared
```

Expected: no errors

- [ ] **Step 4.4: Build client**

```bash
yarn nx build client
```

Expected: compiled with 0 errors

- [ ] **Step 4.5: Run all client tests**

```bash
yarn nx test client
```

Expected: all tests pass including the new ControlsTable tests

- [ ] **Step 4.6: Final commit**

```bash
git add -u
git commit -m "chore(client): lint + build pass — Module 6 compliance mapping"
```
