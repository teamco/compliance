import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  useAssessmentItemControlMappings,
  useAddAssessmentItemControlMapping,
  useRemoveAssessmentItemControlMapping,
} from '@/queries/assessments';

interface AssessmentItemControlsProps {
  itemId: string;
  availableControls: Array<{ id: string; code: string; title: string }>;
}

export function AssessmentItemControls({ itemId, availableControls }: AssessmentItemControlsProps) {
  const { t } = useTranslation();
  const { data: mappings = [] } = useAssessmentItemControlMappings(itemId);
  const addMut = useAddAssessmentItemControlMapping(itemId);
  const removeMut = useRemoveAssessmentItemControlMapping(itemId);
  const [selectedControlId, setSelectedControlId] = useState('');
  const [effectivenessNote, setEffectivenessNote] = useState('');

  const linkedIds = new Set(mappings.map((m) => m.controlId));
  const options = availableControls.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="space-y-2">
      {mappings.map((m) => (
        <div key={m.id} className="text-xs border border-border rounded px-2 py-1.5">
          <div className="flex items-center justify-between">
            <span>
              <span className="font-mono mr-1.5">{m.controlCode}</span>
              {m.controlTitle}
            </span>
            <button
              type="button"
              onClick={() => removeMut.mutate(m.id)}
              className="text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
          {m.effectivenessNote && (
            <p className="text-muted-foreground/70 mt-1">{m.effectivenessNote}</p>
          )}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <select
          value={selectedControlId}
          onChange={(e) => setSelectedControlId(e.target.value)}
          className="flex-1 h-8 rounded-md border border-border bg-surface px-2 text-xs"
        >
          <option value="">{t('assessments.selectControl')}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const control = availableControls.find((c) => c.id === selectedControlId);
            if (!control) return;
            addMut.mutate(
              {
                controlId: control.id,
                controlCode: control.code,
                controlTitle: control.title,
                ...(effectivenessNote.trim()
                  ? { effectivenessNote: effectivenessNote.trim() }
                  : {}),
              },
              {
                onSuccess: () => {
                  setSelectedControlId('');
                  setEffectivenessNote('');
                },
              },
            );
          }}
          disabled={!selectedControlId}
          className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
        >
          <Plus size={14} />
        </button>
      </div>
      <Input
        value={effectivenessNote}
        onChange={(e) => setEffectivenessNote(e.target.value)}
        placeholder={t('assessments.effectivenessNotePlaceholder')}
        className="h-8 text-xs"
      />
    </div>
  );
}
