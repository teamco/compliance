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
import { useIsAdmin, useNotify } from '@icore/template-shared';
import {
  useFrameworks,
  useOrganizations,
  useSnapshot,
  useSnapshots,
  useStandardsDocument,
  useTransitionWorkflow,
  useUpdateStandard,
  type StandardPatch,
  type StandardsSnapshot,
  type WorkflowStatus,
  type WorkflowTransition,
} from '@/queries/notes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ExportMenu } from '@/components/export/ExportMenu';
import { exportStandardsPdf, exportStandardsCsv, exportStandardsJson } from '@/lib/export';

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
  const standards = full?.standards ?? snap.standards;

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
            {t('standards.count', { count: snap.standards?.length ?? 0 })}
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
          {standards.map((std) => (
            <div key={std.code} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xs font-mono text-muted-foreground shrink-0 w-20 truncate">
                {std.code}
              </span>
              <span className="text-xs text-foreground flex-1">{std.title}</span>
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

interface EditState {
  code: string;
  field: 'objective' | 'scope';
  value: string;
}

function StandardsDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data: doc, isPending } = useStandardsDocument(id);
  const { data: frameworks } = useFrameworks();
  const { data: orgs } = useOrganizations();
  const updateStandard = useUpdateStandard(id);
  const isAdmin = useIsAdmin();
  const notify = useNotify();

  const [editing, setEditing] = useState<EditState | null>(null);

  function startEdit(code: string, field: EditState['field'], current: string) {
    setEditing({ code, field, value: current });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function saveEdit() {
    if (!editing) return;
    const patch: StandardPatch =
      editing.field === 'objective' ? { objective: editing.value } : { scope: editing.value };
    updateStandard.mutate(
      { code: editing.code, patch },
      { onSuccess: () => setEditing(null), onError: () => notify.error(t('common.saveFailed')) },
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

  const orgName = orgs?.find((o) => o.id === doc.orgId)?.name ?? '';
  const fwList = (frameworks ?? []).map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/standards"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          {t('standards.title')}
        </Link>
        <ExportMenu
          scope="standards"
          orgId={doc.orgId}
          onPdf={(tpl) => exportStandardsPdf(doc, fwList, tpl, orgName)}
          onCsv={() => exportStandardsCsv(doc, fwList)}
          onJson={() => exportStandardsJson(doc)}
        />
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {t('gapAnalysis.assessmentTitle')}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('gapAnalysis.assessmentSubtitle', { count: doc.standards?.length ?? 0 })} ·{' '}
          {t('standards.generatedOn')} {new Date(doc.createdAt).toLocaleDateString()}
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
          {(doc.standards ?? []).map((std) => {
            const isEditingObjective = editing?.code === std.code && editing.field === 'objective';
            const isEditingScope = editing?.code === std.code && editing.field === 'scope';
            const isSaving =
              updateStandard.isPending && updateStandard.variables?.code === std.code;

            return (
              <div
                key={std.code}
                className="bg-surface border border-border rounded-xl p-5 space-y-3 hover:border-muted-foreground/30 transition-colors"
              >
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-green-500/10 border border-green-500/20 shrink-0">
                    <ShieldCheck size={13} className="text-green-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">{std.code}</p>
                    <p className="text-sm font-medium text-foreground leading-snug">{std.title}</p>
                  </div>
                </div>

                {/* Objective — click-to-edit */}
                <div className="pl-9 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {t('standards.objective')}
                  </p>
                  {isEditingObjective ? (
                    <div className="space-y-2">
                      <Textarea
                        autoFocus
                        rows={3}
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
                          <X size={13} />
                        </button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
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
                      onClick={() => startEdit(std.code, 'objective', std.objective)}
                      className="group w-full text-left text-xs text-foreground/80 leading-relaxed hover:text-foreground transition-colors cursor-text"
                    >
                      <span className="flex items-start gap-1.5">
                        <span className="flex-1">{std.objective}</span>
                        <Pencil
                          size={11}
                          className="opacity-0 group-hover:opacity-40 transition-opacity mt-0.5 shrink-0"
                        />
                      </span>
                    </button>
                  )}
                </div>

                {/* Scope — click-to-edit */}
                <div className="pl-9 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {t('standards.scope')}
                  </p>
                  {isEditingScope ? (
                    <div className="space-y-2">
                      <Textarea
                        autoFocus
                        rows={3}
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
                          <X size={13} />
                        </button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
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
                      onClick={() => startEdit(std.code, 'scope', std.scope)}
                      className="group w-full text-left text-xs text-foreground/80 leading-relaxed hover:text-foreground transition-colors cursor-text"
                    >
                      <span className="flex items-start gap-1.5">
                        <span className="flex-1">{std.scope}</span>
                        <Pencil
                          size={11}
                          className="opacity-0 group-hover:opacity-40 transition-opacity mt-0.5 shrink-0"
                        />
                      </span>
                    </button>
                  )}
                </div>

                {/* Requirements */}
                {(std.requirements?.length ?? 0) > 0 && (
                  <div className="pl-9 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {t('standards.requirements')}
                    </p>
                    <ul className="space-y-1">
                      {(std.requirements ?? []).map((req, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                          <span className="text-muted-foreground/40 shrink-0 mt-0.5">•</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
