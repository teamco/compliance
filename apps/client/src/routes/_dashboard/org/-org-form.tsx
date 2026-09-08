import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import type { OrganizationInput } from '@/queries/notes';
import { Button } from '@/components/ui/button';
import { OrgFormFields } from './-org-form-fields';

interface OrgFormProps {
  initial: OrganizationInput;
  onSave: (data: OrganizationInput) => void;
  isPending: boolean;
  submitLabel: string;
}

export function OrgForm({ initial, onSave, isPending, submitLabel }: OrgFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<OrganizationInput>(initial);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    setForm(initial);
    setErrors({});
  }, [initial]);

  function validate(data: OrganizationInput) {
    const nextErrors: { name?: string } = {};
    if (!data.name.trim()) {
      nextErrors.name = t('org.validation.nameRequired');
    } else if (data.name.trim().length < 2) {
      nextErrors.name = t('org.validation.nameMin');
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = { ...form, name: form.name.trim() };
        if (!validate(data)) return;
        onSave(data);
      }}
      noValidate
    >
      <div className="space-y-6 p-4">
        <OrgFormFields form={form} setForm={setForm} errors={errors} setErrors={setErrors} />
      </div>
      <footer className="border-t border-border p-4">
        <Button type="submit" disabled={isPending || !form.name.trim()} className="w-full">
          <Save size={14} className="mr-2" />
          {isPending ? t('org.saving') : submitLabel}
        </Button>
      </footer>
    </form>
  );
}
