import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Link2, Eye } from 'lucide-react';
import { useDraft } from '@icore/template-shared';
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
  useUpdatePolicy,
  useDeletePolicy,
  useAddPolicyControl,
  useRemovePolicyControl,
  type PolicyControlInput,
} from '@/queries/policies';
import { useActiveOrgStore } from '@/stores/active-org';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/policies_/$id')({
  component: PolicyDetailPage,
});

const EMPTY_LINK_FORM: PolicyControlInput = { controlCode: '', frameworkId: '' };

function PolicyDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: policy, isPending } = usePolicy(id);
  const { data: controls = [] } = usePolicyControls(id);
  const { data: frameworks = [] } = useFrameworks();
  const updateMut = useUpdatePolicy(orgId, id);
  const deleteMut = useDeletePolicy(orgId);
  const addControlMut = useAddPolicyControl(id);
  const removeControlMut = useRemovePolicyControl(id);

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
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void navigate({ to: '/policies' })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {t('policies.backToList')}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {frameworks.find((f) => f.id === policy.frameworkId)?.slug.toUpperCase() ?? ''} · v
            {policy.version}
          </span>
          <select
            value={policy.status}
            onChange={(e) => updateMut.mutate({ status: e.target.value as 'draft' | 'approved' })}
            className="text-xs h-7 rounded border border-border bg-surface px-2 text-foreground focus:outline-none"
          >
            <option value="draft">{t('policies.status.draft')}</option>
            <option value="approved">{t('policies.status.approved')}</option>
          </select>
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
            className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
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
                  className="text-muted-foreground/30 hover:text-destructive transition-colors ml-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
