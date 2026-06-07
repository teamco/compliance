import { useState, useEffect, useMemo, useRef } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
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

  const [selectedFwIds, setSelectedFwIds] = useState<Set<string>>(new Set());
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const fwInitialized = useRef(false);

  const navigate = useNavigate();

  const docId = searchDocId ?? '';

  // Pre-select all frameworks on first load only
  useEffect(() => {
    if (!fwInitialized.current && frameworks.length > 0) {
      fwInitialized.current = true;
      setSelectedFwIds(new Set(frameworks.map((f) => f.id)));
    }
  }, [frameworks]);

  // Auto-navigate to first completed doc if none selected
  useEffect(() => {
    if (!searchDocId && completedDocs.length > 0) {
      const first = completedDocs[0];
      if (first) void navigate({ to: '/controls', search: { docId: first.id }, replace: true });
    }
  }, [completedDocs, searchDocId, navigate]);

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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
          onChange={(e) => void navigate({ to: '/controls', search: { docId: e.target.value } })}
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
