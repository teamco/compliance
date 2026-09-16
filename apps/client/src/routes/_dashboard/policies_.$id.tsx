import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Link2, Eye } from 'lucide-react';
import { useDraft, useIsAdmin } from '@icore/template-shared';
import type { WorkflowStatus, WorkflowTransition } from '@icore/shared';
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
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { PageLayout } from '@/components/PageLayout';
import { MarkdownViewer } from '@/components/markdown-viewer';
import {
  usePolicy,
  usePolicyControls,
  usePolicyActivity,
  useUpdatePolicy,
  useDeletePolicy,
  useAddPolicyControl,
  useRemovePolicyControl,
  useTransitionPolicyWorkflow,
  type PolicyControlInput,
} from '@/queries/policies';
import { useActiveOrgStore } from '@/stores/active-org';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/policies_/$id')({
  component: PolicyDetailPage,
});

const EMPTY_LINK_FORM: PolicyControlInput = { controlCode: '', frameworkId: '' };

const WORKFLOW_STEPS: WorkflowStatus[] = [
  'draft',
  'in_review',
  'approved',
  'published',
  'superseded',
];

const WORKFLOW_STEP_COLOR: Record<WorkflowStatus, string> = {
  draft: 'text-muted-foreground',
  in_review: 'text-amber-400',
  approved: 'text-blue-400',
  published: 'text-green-500',
  superseded: 'text-slate-400',
};

const TRANSITION_FOR_STATUS: Record<WorkflowStatus, WorkflowTransition | null> = {
  draft: 'submit',
  in_review: 'approve',
  approved: 'publish',
  published: 'supersede',
  superseded: null,
};

const ADMIN_TRANSITIONS: WorkflowTransition[] = ['approve', 'reject', 'publish', 'supersede'];

function PolicyWorkflowBar({
  status,
  policyId,
  orgId,
  isAdmin,
}: {
  status: WorkflowStatus;
  policyId: string;
  orgId: string;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const transition = useTransitionPolicyWorkflow(orgId, policyId);

  const primaryTransition = TRANSITION_FOR_STATUS[status];
  const canPrimary =
    primaryTransition !== null && (isAdmin || !ADMIN_TRANSITIONS.includes(primaryTransition));

  function doTransition(tr: WorkflowTransition) {
    transition.mutate(tr);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start">
        {WORKFLOW_STEPS.map((step, i) => {
          const stepIdx = WORKFLOW_STEPS.indexOf(step);
          const currentIdx = WORKFLOW_STEPS.indexOf(status);
          const done = stepIdx < currentIdx;
          const active = stepIdx === currentIdx;
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
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
                  {done ? '✓' : i + 1}
                </div>
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                    active ? WORKFLOW_STEP_COLOR[step] : done ? 'text-green-500' : 'text-border'
                  }`}
                >
                  {t(`policies.workflow.${step}`)}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mt-3 mx-2 transition-colors ${
                    done ? 'bg-green-500/40' : 'bg-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        {canPrimary && primaryTransition && (
          <Button
            size="sm"
            onClick={() => doTransition(primaryTransition)}
            disabled={transition.isPending}
            className="gap-1.5 h-7 text-xs"
          >
            {transition.isPending
              ? t(`policies.workflow.${primaryTransition}ing`)
              : t(`policies.workflow.${primaryTransition}`)}
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
            {t('policies.workflow.reject')}
          </Button>
        )}
      </div>
    </div>
  );
}

function PolicyDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: policy, isPending } = usePolicy(id);
  const { data: controls = [] } = usePolicyControls(id);
  const { data: activity = [] } = usePolicyActivity(id);
  const { data: frameworks = [] } = useFrameworks();
  const updateMut = useUpdatePolicy(orgId, id);
  const deleteMut = useDeletePolicy(orgId);
  const addControlMut = useAddPolicyControl(id);
  const removeControlMut = useRemovePolicyControl(id);
  const isAdmin = useIsAdmin();

  const [editing, setEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [content, setContent] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<PolicyControlInput>(EMPTY_LINK_FORM);
  const isLinkDirty = linkOpen && JSON.stringify(linkForm) !== JSON.stringify(EMPTY_LINK_FORM);
  const { showDialog, confirmLeave, cancelLeave } = useDraft(isLinkDirty);

  function startEdit() {
    setContent(policy?.content ?? '');
    setEditing(true);
  }

  function saveContent() {
    updateMut.mutate({ content }, { onSuccess: () => setEditing(false) });
  }

  function handleDelete() {
    deleteMut.mutate(id, { onSuccess: () => void navigate({ to: '/policies' }) });
  }

  if (isPending) {
    return (
      <PageLayout title="…">
        <div className="h-64 bg-surface border border-border rounded-xl animate-pulse" />
      </PageLayout>
    );
  }

  if (!policy) {
    return (
      <PageLayout title={t('common.notFound')}>
        <p className="text-sm text-muted-foreground">{t('policies.notFound')}</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={policy.title}>
      <PolicyWorkflowBar
        status={policy.workflowStatus}
        policyId={policy.id}
        orgId={orgId}
        isAdmin={isAdmin}
      />
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void navigate({ to: '/policies' })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          {t('policies.backToList')}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {frameworks.find((f) => f.id === policy.frameworkId)?.slug.toUpperCase() ?? ''} · v
            {policy.version}
          </span>
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye size={14} className="mr-1.5" />
            {t('common.preview')}
          </Button>
          <Button size="sm" variant="outline" onClick={startEdit}>
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            <Link2 size={14} className="mr-1.5" />
            {t('policies.linkControl')}
          </Button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors cursor-pointer"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveContent} disabled={updateMut.isPending}>
              {updateMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-6">
          <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {policy.content}
          </pre>
        </div>
      )}

      {controls.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            {t('policies.linkedControls')}
          </p>
          <div className="flex flex-wrap gap-2">
            {controls.map((pc) => (
              <div
                key={pc.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-surface text-xs"
              >
                <span className="text-foreground">{pc.controlCode}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground/60">
                  {frameworks.find((f) => f.id === pc.frameworkId)?.slug.toUpperCase() ?? ''}
                </span>
                <button
                  type="button"
                  onClick={() => removeControlMut.mutate(pc.id)}
                  className="text-muted-foreground/30 hover:text-destructive transition-colors ml-1 cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
          {t('policies.history')}
        </p>
        {activity.length === 0 ? (
          <div className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
            {t('policies.noActivity')}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {activity.map((a) => (
              <div key={a.id} className="p-3 rounded-lg border bg-card/40 space-y-0.5">
                <div className="font-medium text-foreground">{a.action}</div>
                <div className="text-muted-foreground">{a.details}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(a.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={18} className="text-primary" />
              {policy.title}
            </DialogTitle>
          </DialogHeader>
          <MarkdownViewer content={policy.content} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 size={18} className="text-primary" />
              {t('policies.linkControl')}
            </DialogTitle>
            <DialogDescription>{t('policies.linkControlDescription')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkForm.controlCode || !linkForm.frameworkId) return;
              addControlMut.mutate(linkForm, {
                onSuccess: () => {
                  setLinkOpen(false);
                  setLinkForm(EMPTY_LINK_FORM);
                },
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('exceptions.controlCode')}</Label>
              <Input
                value={linkForm.controlCode}
                onChange={(e) => setLinkForm((f) => ({ ...f, controlCode: e.target.value }))}
                placeholder="AC-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.framework')}</Label>
              <select
                value={linkForm.frameworkId}
                onChange={(e) => setLinkForm((f) => ({ ...f, frameworkId: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                required
              >
                <option value="" disabled>
                  {t('exceptions.selectFramework')}
                </option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.slug.toUpperCase()} — {fw.name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={addControlMut.isPending}>
                {addControlMut.isPending ? t('common.saving') : t('policies.link')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </PageLayout>
  );
}
