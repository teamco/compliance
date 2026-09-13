import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Combobox } from '@/components/ui/combobox';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import { useOrgMembers } from '@/queries/org-members';
import { useAssessmentTypes } from '@/queries/assessment-types';
import {
  useCreateAssessment,
  useUpdateAssessment,
  useAssessmentItems,
  type Assessment,
  type AssessmentInput,
} from '@/queries/assessments';
import { AssessmentItemsPanel } from '@/components/assessments/AssessmentItemsPanel';

type WizardStep = 'details' | 'items' | 'review';

const EMPTY_FORM: AssessmentInput = {
  title: '',
  assessmentTypeId: '',
  ownerId: '',
};

interface AssessmentWizardProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssessmentWizard({ orgId, open, onOpenChange }: AssessmentWizardProps) {
  const { t } = useTranslation();
  const { data: types = [] } = useAssessmentTypes(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const { data: vendors = [] } = useVendors(orgId);
  const { data: members = [] } = useOrgMembers(orgId);
  const createMut = useCreateAssessment(orgId);

  const [step, setStep] = useState<WizardStep>('details');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [form, setForm] = useState<AssessmentInput>(EMPTY_FORM);
  const updateMut = useUpdateAssessment(orgId, assessment?.id ?? '');

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));

  function reset() {
    setStep('details');
    setAssessment(null);
    setForm(EMPTY_FORM);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleDetailsNext() {
    if (!form.title || !form.assessmentTypeId || !form.ownerId) return;
    if (assessment) {
      updateMut.mutate(form, { onSuccess: () => setStep('items') });
      return;
    }
    createMut.mutate(form, {
      onSuccess: (created) => {
        setAssessment(created);
        setStep('items');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('assessments.newAssessment')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-4 text-xs">
          {(['details', 'items', 'review'] as const).map((s) => (
            <span
              key={s}
              className={`px-2 py-1 rounded ${
                step === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {t(`assessments.wizard.step.${s}`)}
            </span>
          ))}
        </div>

        {step === 'details' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="wizard-title">{t('assessments.title')}</Label>
              <Input
                id="wizard-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('assessments.type')}</Label>
                <select
                  value={form.assessmentTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, assessmentTypeId: e.target.value }))}
                  required
                  disabled={!!assessment}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-50"
                >
                  <option value="">{t('assessments.selectType')}</option>
                  {types
                    .filter((ty) => !ty.archived)
                    .map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <Label htmlFor="wizard-owner">{t('assessments.owner')}</Label>
                <Combobox
                  options={memberOptions}
                  value={form.ownerId}
                  onChange={(ownerId) => setForm((f) => ({ ...f, ownerId }))}
                  placeholder={t('assessments.selectOwner')}
                  disabled={!!assessment}
                />
              </div>
            </div>
            {assessment && (
              <p className="text-xs text-muted-foreground">
                {t('assessments.wizard.detailsLockedNote')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="wizard-bu">{t('assessments.businessUnit')}</Label>
                <Input
                  id="wizard-bu"
                  value={form.businessUnit ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, businessUnit: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="wizard-due">{t('assessments.dueDate')}</Label>
                <Input
                  id="wizard-due"
                  type="date"
                  value={form.dueDate ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="wizard-approver">{t('assessments.approver')}</Label>
              <Combobox
                options={memberOptions}
                value={form.approverId ?? ''}
                onChange={(approverId) => setForm((f) => ({ ...f, approverId }))}
                placeholder={t('assessments.selectApprover')}
                disabled={!!assessment}
              />
            </div>
            <div>
              <Label>{t('assessments.inScopeAssets')}</Label>
              <MultiSelect
                options={assets.map((a) => ({ value: a.id, label: a.name }))}
                selected={form.assetIds ?? []}
                onChange={(assetIds) => setForm((f) => ({ ...f, assetIds }))}
                placeholder={t('assessments.noAssets')}
              />
            </div>
            <div>
              <Label>{t('assessments.inScopeVendors')}</Label>
              <MultiSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                selected={form.vendorIds ?? []}
                onChange={(vendorIds) => setForm((f) => ({ ...f, vendorIds }))}
                placeholder={t('assessments.noVendors')}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleDetailsNext}
                disabled={
                  !form.title ||
                  !form.assessmentTypeId ||
                  !form.ownerId ||
                  createMut.isPending ||
                  updateMut.isPending
                }
              >
                {t('assessments.wizard.next')}
              </Button>
            </div>
          </div>
        )}

        {step === 'items' && assessment && (
          <div className="space-y-4">
            <AssessmentItemsPanel orgId={orgId} assessmentId={assessment.id} />
            <ItemsStepFooter
              assessmentId={assessment.id}
              onBack={() => setStep('details')}
              onNext={() => setStep('review')}
            />
          </div>
        )}

        {step === 'review' && assessment && (
          <ReviewStep
            assessmentId={assessment.id}
            onBack={() => setStep('items')}
            onFinish={() => handleClose(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemsStepFooter({
  assessmentId,
  onBack,
  onNext,
}: {
  assessmentId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { data: items = [] } = useAssessmentItems(assessmentId);
  return (
    <div className="flex items-center justify-between pt-2 border-t border-border">
      <Button variant="outline" onClick={onBack}>
        {t('assessments.wizard.back')}
      </Button>
      <div className="flex items-center gap-2">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t('assessments.wizard.needOneItemHint')}
          </span>
        )}
        <Button onClick={onNext} disabled={items.length === 0}>
          {t('assessments.wizard.next')}
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  assessmentId,
  onBack,
  onFinish,
}: {
  assessmentId: string;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: items = [] } = useAssessmentItems(assessmentId);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('assessments.wizard.reviewIntro')}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="text-sm border border-border rounded-lg p-3">
            <p className="font-medium">{item.subject}</p>
            <p className="text-xs text-muted-foreground">
              {t('assessments.inherent')}: {item.inherentScore} ({item.inherentLabel})
              {item.residualScore != null &&
                ` · ${t('assessments.residual')}: ${item.residualScore} (${item.residualLabel})`}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          {t('assessments.wizard.back')}
        </Button>
        <Button
          onClick={() => {
            onFinish();
            void navigate({ to: '/assessments/$id', params: { id: assessmentId } });
          }}
        >
          {t('assessments.wizard.finish')}
        </Button>
      </div>
    </div>
  );
}
