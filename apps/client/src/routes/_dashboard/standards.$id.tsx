import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Pencil, ShieldCheck, X } from 'lucide-react';
import {
  useStandardsDocument,
  useUpdateControl,
  type ControlPatch,
  type StandardControlPriority,
} from '@/queries/notes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PRIORITY_COLOR: Record<StandardControlPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const PRIORITIES: StandardControlPriority[] = ['critical', 'high', 'medium', 'low'];

interface EditState {
  code: string;
  field: 'priority' | 'impl';
  value: string;
}

function StandardsDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data: doc, isPending } = useStandardsDocument(id);
  const updateControl = useUpdateControl(id);

  const [editing, setEditing] = useState<EditState | null>(null);

  function startEdit(code: string, field: EditState['field'], current: string) {
    setEditing({ code, field, value: current });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function saveEdit(overridePatch?: ControlPatch) {
    if (!editing) return;
    const patch: ControlPatch =
      overridePatch ??
      (editing.field === 'priority'
        ? { priority: editing.value as StandardControlPriority }
        : { implementation: editing.value });
    updateControl.mutate(
      { code: editing.code, patch },
      { onSuccess: () => setEditing(null), onError: () => setEditing(null) },
    );
  }

  if (isPending) {
    return (
      <div className="p-6 space-y-4 max-w-[1000px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">{t('error.unknown')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div className="flex items-center gap-3">
        <Link
          to="/standards"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          {t('standards.title')}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('standards.viewControls')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('standards.controls', { count: doc.controls.length })} · {t('standards.generatedOn')}{' '}
          {new Date(doc.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-3">
        {doc.controls.map((ctrl) => {
          const isEditingPriority = editing?.code === ctrl.code && editing.field === 'priority';
          const isEditingImpl = editing?.code === ctrl.code && editing.field === 'impl';
          const isSaving = updateControl.isPending && updateControl.variables?.code === ctrl.code;

          return (
            <div
              key={ctrl.code}
              className="bg-surface border border-border rounded-xl p-5 space-y-3 hover:border-muted-foreground/30 transition-colors"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-green-500/10 border border-green-500/20 shrink-0">
                    <ShieldCheck size={13} className="text-green-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">{ctrl.code}</p>
                    <p className="text-sm font-medium text-foreground leading-snug">{ctrl.title}</p>
                  </div>
                </div>

                {/* Priority — inline pills when editing */}
                {isEditingPriority ? (
                  <div className="flex items-center gap-1 shrink-0">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          setEditing((prev) => (prev ? { ...prev, value: p } : null));
                          updateControl.mutate(
                            { code: ctrl.code, patch: { priority: p } },
                            { onSuccess: () => setEditing(null), onError: () => setEditing(null) },
                          );
                        }}
                        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-80 ${PRIORITY_COLOR[p]} ${p === ctrl.priority ? 'ring-1 ring-offset-1 ring-offset-surface ring-current' : ''}`}
                      >
                        {t(`standards.priority.${p}`)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => startEdit(ctrl.code, 'priority', ctrl.priority)}
                    className={`group flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 cursor-pointer transition-all hover:opacity-80 ${PRIORITY_COLOR[ctrl.priority]}`}
                    title={t('standards.editPriority')}
                  >
                    {t(`standards.priority.${ctrl.priority}`)}
                    <Pencil
                      size={9}
                      className="opacity-0 group-hover:opacity-60 transition-opacity"
                    />
                  </button>
                )}
              </div>

              {ctrl.description && (
                <p className="text-xs text-muted-foreground leading-relaxed pl-9">
                  {ctrl.description}
                </p>
              )}

              {/* Implementation — click-to-edit textarea */}
              <div className="pl-9 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t('standards.implementation')}
                </p>

                {isEditingImpl ? (
                  <div className="space-y-2">
                    <Textarea
                      autoFocus
                      rows={4}
                      value={editing.value}
                      onChange={(e) =>
                        setEditing((prev) => (prev ? { ...prev, value: e.target.value } : null))
                      }
                      className="text-xs resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') cancelEdit();
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveEdit()}
                        disabled={isSaving}
                        className="h-6 text-xs px-2 gap-1"
                      >
                        <Check size={11} />
                        {t('common.save')}
                      </Button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => startEdit(ctrl.code, 'impl', ctrl.implementation ?? '')}
                    className="group w-full text-left text-xs text-foreground/80 leading-relaxed hover:text-foreground transition-colors cursor-text"
                  >
                    {ctrl.implementation ? (
                      <span className="flex items-start gap-1.5">
                        <span className="flex-1">{ctrl.implementation}</span>
                        <Pencil
                          size={11}
                          className="opacity-0 group-hover:opacity-40 transition-opacity mt-0.5 shrink-0"
                        />
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 italic">
                        {t('standards.addImplementation')}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/standards/$id')({
  component: StandardsDetailPage,
});
