import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAssessmentItemEvidence, useCreateAssessmentItemEvidence } from '@/queries/assessments';

interface AssessmentItemEvidenceProps {
  orgId: string;
  itemId: string;
}

const EMPTY_EVIDENCE_FORM = {
  title: '',
  owner: '',
  evidenceType: '',
  source: '',
  collectionDate: '',
  periodCovered: '',
  expirationDate: '',
  verificationStatus: 'pending_review' as const,
  url: '',
};

export function AssessmentItemEvidence({ orgId, itemId }: AssessmentItemEvidenceProps) {
  const { t } = useTranslation();
  const { data: evidence = [] } = useAssessmentItemEvidence(itemId);
  const createMut = useCreateAssessmentItemEvidence(orgId, itemId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_EVIDENCE_FORM);

  function handleAdd() {
    if (!form.title.trim()) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setForm(EMPTY_EVIDENCE_FORM);
        setOpen(false);
      },
    });
  }

  return (
    <div className="space-y-2">
      {evidence.map((e) => (
        <div key={e.id} className="text-xs border border-border rounded px-2 py-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium">{e.title}</span>
            <span className="text-muted-foreground/70">{e.verificationStatus}</span>
          </div>
          {e.url && (
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground/70 underline"
            >
              {e.url}
            </a>
          )}
        </div>
      ))}
      {open ? (
        <div className="space-y-1.5 border border-border rounded p-2">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('assessments.evidenceTitlePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder={t('assessments.evidenceUrlPlaceholder')}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!form.title.trim() || createMut.isPending}
              className="h-7 px-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
            >
              {t('assessments.addEvidence')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setForm(EMPTY_EVIDENCE_FORM);
              }}
              className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-8 px-2 flex items-center gap-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Plus size={12} />
          {t('assessments.addEvidence')}
        </button>
      )}
    </div>
  );
}
