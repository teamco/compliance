import React, { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  History,
  Pencil,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useIsAdmin } from '@icore/template-shared';
import {
  useSnapshot,
  useSnapshots,
  useStandardsDocument,
  useTransitionWorkflow,
  useUpdateControl,
  type ControlPatch,
  type StandardControlPriority,
  type StandardsSnapshot,
  type WorkflowStatus,
  type WorkflowTransition,
} from '@/queries/notes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const WORKFLOW_STEPS: WorkflowStatus[] = ['draft', 'in_review', 'approved', 'published'];

const WORKFLOW_STEP_COLOR: Record<WorkflowStatus, string> = {
  draft: 'text-muted-foreground',
  in_review: 'text-amber-400',
  approved: 'text-blue-400',
  published: 'text-green-500',
};

const TRANSITION_FOR_STATUS: Record<WorkflowStatus, WorkflowTransition | null> = {
  draft: 'submit',
  in_review: 'approve',
  approved: 'publish',
  published: null,
};

const ADMIN_TRANSITIONS: WorkflowTransition[] = ['approve', 'reject', 'publish'];

function WorkflowBar({
  status,
  docId,
  isAdmin,
  extra,
}: {
  status: WorkflowStatus;
  docId: string;
  isAdmin: boolean;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const transition = useTransitionWorkflow(docId);

  const primaryTransition = TRANSITION_FOR_STATUS[status];
  const canPrimary =
    primaryTransition !== null && (isAdmin || !ADMIN_TRANSITIONS.includes(primaryTransition));

  function doTransition(tr: WorkflowTransition) {
    transition.mutate(tr);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      {/* Stepper */}
      <div className="flex items-start">
        {WORKFLOW_STEPS.map((step, i) => {
          const stepIdx = WORKFLOW_STEPS.indexOf(step);
          const currentIdx = WORKFLOW_STEPS.indexOf(status);
          const done = stepIdx < currentIdx;
          const active = stepIdx === currentIdx;

          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors ${
                    done
                      ? 'bg-green-500/20 border-green-500 text-green-500'
                      : active
                        ? `bg-transparent border-current ${WORKFLOW_STEP_COLOR[step]}`
                        : 'bg-transparent border-border text-border'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <Circle size={12} className={active ? WORKFLOW_STEP_COLOR[step] : ''} />
                  )}
                </div>
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                    active ? WORKFLOW_STEP_COLOR[step] : done ? 'text-green-500' : 'text-border'
                  }`}
                >
                  {t(`standards.workflow.${step}`)}
                </span>
                <span
                  className={`text-[9px] text-center w-20 leading-tight ${
                    active
                      ? 'text-muted-foreground'
                      : done
                        ? 'text-muted-foreground/60'
                        : 'text-border'
                  }`}
                >
                  {t(`standards.workflow.desc.${step}`)}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mt-3 mx-2 transition-colors ${
                    done ? 'bg-green-500/40' : 'bg-border'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Action buttons */}
      {(status !== 'published' || extra) && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {canPrimary && primaryTransition && (
            <Button
              size="sm"
              onClick={() => doTransition(primaryTransition)}
              disabled={transition.isPending}
              className="gap-1.5 h-7 text-xs"
            >
              <Send size={11} />
              {transition.isPending
                ? t(`standards.workflow.${primaryTransition}ing`)
                : t(`standards.workflow.${primaryTransition}`)}
            </Button>
          )}
          {status === 'in_review' && isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => doTransition('reject')}
              disabled={transition.isPending}
              className="gap-1.5 h-7 text-xs"
            >
              {t('standards.workflow.reject')}
            </Button>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}

const SNAPSHOT_WORKFLOW_COLOR: Record<WorkflowStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
};

function SnapshotRow({ snap }: { snap: StandardsSnapshot }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: full } = useSnapshot(open ? snap.id : '');
  const controls = full?.controls ?? snap.controls;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">v{snap.version}</span>
          <span
            className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${SNAPSHOT_WORKFLOW_COLOR[snap.workflowStatus]}`}
          >
            {t(`standards.workflow.${snap.workflowStatus}`)}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(snap.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="text-xs text-muted-foreground/60">
            {t('standards.controls', { count: snap.controls.length })}
          </span>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {controls.map((ctrl) => (
            <div key={ctrl.code} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xs font-mono text-muted-foreground shrink-0 w-20 truncate">
                {ctrl.code}
              </span>
              <span className="text-xs text-foreground flex-1">{ctrl.title}</span>
              <span
                className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                  {
                    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
                    high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                    low: 'bg-muted text-muted-foreground border-border',
                  }[ctrl.priority]
                }`}
              >
                {t(`standards.priority.${ctrl.priority}`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VersionHistory({ docId }: { docId: string }) {
  const { t } = useTranslation();
  const { data: snapshots, isPending } = useSnapshots(docId);
  const [collapsed, setCollapsed] = useState(false);

  if (!snapshots?.length && !isPending) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <History size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            {t('standards.versionHistory')}
          </span>
          {snapshots?.length ? (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
              {snapshots.length}
            </span>
          ) : null}
        </div>
        {collapsed ? (
          <ChevronRight size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {isPending
            ? Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-surface border border-border rounded-lg animate-pulse"
                />
              ))
            : (snapshots ?? []).map((snap) => <SnapshotRow key={snap.id} snap={snap} />)}
        </div>
      )}
    </div>
  );
}

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
  const isAdmin = useIsAdmin();

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
      <div className="p-6 space-y-4">
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
    <div className="p-6 space-y-6">
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

      <WorkflowBar
        status={doc.workflowStatus ?? 'draft'}
        docId={id}
        isAdmin={isAdmin}
        extra={
          doc.status === 'completed' ? (
            <Link
              to="/controls"
              search={{ docId: id }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-green-500 transition-colors"
            >
              {t('controls.viewMapping')}
            </Link>
          ) : undefined
        }
      />

      <VersionHistory docId={id} />

      <div className="@container">
        <div className="grid grid-cols-1 @[650px]:grid-cols-2 gap-3">
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
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {ctrl.title}
                      </p>
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
                              {
                                onSuccess: () => setEditing(null),
                                onError: () => setEditing(null),
                              },
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                        <Button
                          size="sm"
                          onClick={() => saveEdit()}
                          disabled={isSaving}
                          className="h-6 text-xs px-2 gap-1"
                        >
                          <Check size={11} />
                          {t('common.save')}
                        </Button>
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
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/standards/$id')({
  component: StandardsDetailPage,
});
