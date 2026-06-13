import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, FileText } from 'lucide-react';
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
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  usePolicies,
  useCreatePolicy,
  useCloneTemplate,
  useDeletePolicy,
  usePolicyTemplates,
  type Policy,
  type PolicyInput,
} from '@/queries/policies';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/policies')({
  component: PoliciesPage,
});

const STATUS_COLORS: Record<Policy['status'], string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
};

function PoliciesPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: policies = [], isPending } = usePolicies(orgId);
  const { data: frameworks = [] } = useFrameworks();
  const { data: templates = [] } = usePolicyTemplates();
  const createMut = useCreatePolicy(orgId);
  const cloneMut = useCloneTemplate(orgId);
  const deleteMut = useDeletePolicy(orgId);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'scratch' | 'template'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [form, setForm] = useState<PolicyInput>({ frameworkId: '', title: '', content: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'template') {
      if (!selectedTemplate) return;
      cloneMut.mutate(selectedTemplate, { onSuccess: () => setOpen(false) });
    } else {
      if (!form.frameworkId || !form.title) return;
      createMut.mutate(form, {
        onSuccess: () => {
          setOpen(false);
          setForm({ frameworkId: '', title: '', content: '' });
        },
      });
    }
  }

  return (
    <PageLayout title={t('nav.policies')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('policies.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('policies.newPolicy')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-surface border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <FileText size={32} className="opacity-30" />
          <p className="text-sm">{t('policies.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <Link
                to="/policies/$id"
                params={{ id: policy.id }}
                className="flex-1 min-w-0 hover:text-green-400 transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground truncate">
                    {policy.title}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[policy.status]}`}
                  >
                    {t(`policies.status.${policy.status}`)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">v{policy.version}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  {frameworks.find((f) => f.id === policy.frameworkId)?.name ?? policy.frameworkId}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => deleteMut.mutate(policy.id)}
                className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('policies.newPolicy')}</DialogTitle>
            <DialogDescription>{t('policies.newDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              {(['template', 'scratch'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 rounded border text-xs font-medium transition-colors ${
                    mode === m
                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(`policies.mode.${m}`)}
                </button>
              ))}
            </div>

            {mode === 'template' ? (
              <div className="space-y-2">
                <Label>{t('policies.selectTemplate')}</Label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                  required
                >
                  <option value="" disabled>
                    {t('policies.chooseTemplate')}
                  </option>
                  {templates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.title} —{' '}
                      {frameworks.find((f) => f.id === tmpl.frameworkId)?.slug.toUpperCase() ?? ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('policies.framework')}</Label>
                  <select
                    value={form.frameworkId}
                    onChange={(e) => setForm((f) => ({ ...f, frameworkId: e.target.value }))}
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
                <div className="space-y-2">
                  <Label>{t('policies.title')}</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={t('policies.titlePlaceholder')}
                    required
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMut.isPending || cloneMut.isPending}>
                {createMut.isPending || cloneMut.isPending
                  ? t('common.saving')
                  : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
