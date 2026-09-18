import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateControlAssessment } from '@/queries/controls';
import type {
  InternalControl,
  RequirementAssessment,
  ImplementationStatus,
  EffectivenessStatus,
} from '@icore/shared';

const STATUS_OPTIONS: RequirementAssessment['status'][] = ['scheduled', 'in_progress', 'completed'];
const IMPLEMENTATION_OPTIONS: ImplementationStatus[] = [
  'not_implemented',
  'planned',
  'partially_implemented',
  'implemented',
  'not_applicable',
];
const EFFECTIVENESS_OPTIONS: EffectivenessStatus[] = [
  'not_tested',
  'ineffective',
  'partially_effective',
  'effective',
];

interface CreateAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  controlId?: string;
  controls?: InternalControl[];
}

export function CreateAssessmentDialog({
  open,
  onOpenChange,
  orgId,
  controlId,
  controls = [],
}: CreateAssessmentDialogProps) {
  const { t } = useTranslation();
  const notify = useNotify();

  const [selectedControlId, setSelectedControlId] = useState('');
  const [cycleName, setCycleName] = useState('');
  const [status, setStatus] = useState<RequirementAssessment['status']>('completed');
  const [implementationStatus, setImplementationStatus] =
    useState<ImplementationStatus>('not_implemented');
  const [designEffectiveness, setDesignEffectiveness] = useState<EffectivenessStatus>('not_tested');
  const [operatingEffectiveness, setOperatingEffectiveness] =
    useState<EffectivenessStatus>('not_tested');
  const [assessor, setAssessor] = useState('');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [observation, setObservation] = useState('');

  const effectiveControlId = controlId ?? selectedControlId;
  const createMut = useCreateControlAssessment(orgId, effectiveControlId);

  function close() {
    onOpenChange(false);
    setSelectedControlId('');
    setCycleName('');
    setStatus('completed');
    setImplementationStatus('not_implemented');
    setDesignEffectiveness('not_tested');
    setOperatingEffectiveness('not_tested');
    setAssessor('');
    setAssessmentDate('');
    setObservation('');
  }

  const canSubmit =
    !!effectiveControlId && !!cycleName.trim() && !!assessor.trim() && !!assessmentDate;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('controls.assessmentDialog.title', 'New Assessment')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!controlId && (
            <div>
              <Label>{t('controls.assessmentDialog.selectControl', 'Control')}</Label>
              <Combobox
                options={controls.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))}
                value={selectedControlId}
                onChange={setSelectedControlId}
                placeholder={t(
                  'controls.assessmentDialog.selectControlPlaceholder',
                  'Select a control...',
                )}
              />
            </div>
          )}
          <div>
            <Label htmlFor="cycle-name">
              {t('controls.assessmentDialog.cycleName', 'Cycle Name')}
            </Label>
            <Input
              id="cycle-name"
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
              placeholder={t(
                'controls.assessmentDialog.cycleNamePlaceholder',
                'e.g. 2026 Annual Review',
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('controls.assessmentDialog.status', 'Status')}</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RequirementAssessment['status'])}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('controls.fieldImplementationStatus')}</Label>
              <select
                value={implementationStatus}
                onChange={(e) => setImplementationStatus(e.target.value as ImplementationStatus)}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                {IMPLEMENTATION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('controls.fieldDesignEffectiveness')}</Label>
              <select
                value={designEffectiveness}
                onChange={(e) => setDesignEffectiveness(e.target.value as EffectivenessStatus)}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                {EFFECTIVENESS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('controls.fieldOperatingEffectiveness')}</Label>
              <select
                value={operatingEffectiveness}
                onChange={(e) => setOperatingEffectiveness(e.target.value as EffectivenessStatus)}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                {EFFECTIVENESS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="assessor">
                {t('controls.assessmentDialog.assessor', 'Assessor')}
              </Label>
              <Input
                id="assessor"
                value={assessor}
                onChange={(e) => setAssessor(e.target.value)}
                placeholder="e.g. Jane Doe (Lead Assessor)"
              />
            </div>
            <div>
              <Label htmlFor="assessment-date">
                {t('controls.assessmentDialog.assessmentDate', 'Assessment Date')}
              </Label>
              <Input
                id="assessment-date"
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="observation">
              {t('controls.assessmentDialog.observation', 'Observation')}
            </Label>
            <textarea
              id="observation"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!canSubmit || createMut.isPending}
            onClick={() =>
              createMut.mutate(
                {
                  cycleName: cycleName.trim(),
                  status,
                  implementationStatus,
                  designEffectiveness,
                  operatingEffectiveness,
                  assessor: assessor.trim(),
                  assessmentDate,
                  observation: observation.trim(),
                },
                {
                  onSuccess: () => {
                    notify.success(
                      t(
                        'controls.assessmentDialog.created',
                        'Assessment "{{cycleName}}" recorded',
                        {
                          cycleName: cycleName.trim(),
                        },
                      ),
                    );
                    close();
                  },
                  onError: () => notify.error(t('error.unknown')),
                },
              )
            }
          >
            {t('controls.assessmentDialog.create', 'Create Assessment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
