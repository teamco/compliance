import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { useUpdateOrganization, type Organization, type OrganizationInput } from '@/queries/notes';
import { EditSheet } from '@/components/EditSheet';
import { OrgFormFields } from './-org-form-fields';

interface EditOrgFormProps {
  open: boolean;
  org: Organization | null;
  onClose: () => void;
}

export function EditOrgForm({ open, org, onClose }: EditOrgFormProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const update = useUpdateOrganization(org?.id ?? '');
  const [form, setForm] = useState<OrganizationInput>(() => toInput(org));
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (org) {
      setForm(toInput(org));
      setErrors({});
    }
  }, [org]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    const nextErrors: { name?: string } = {};
    const name = form.name.trim();
    if (!name) nextErrors.name = t('org.validation.nameRequired');
    else if (name.length < 2) nextErrors.name = t('org.validation.nameMin');
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    try {
      await update.mutateAsync({ ...form, name });
      onClose();
      notify.success(t('org.updated'));
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  return (
    <EditSheet
      open={open}
      onClose={onClose}
      title={t('org.editTitle')}
      onSubmit={(e) => void handleSubmit(e)}
      isPending={update.isPending}
      saveDisabled={!form.name.trim()}
      saveLabel={t('org.updateOrganization')}
    >
      {org && <OrgFormFields form={form} setForm={setForm} errors={errors} setErrors={setErrors} />}
    </EditSheet>
  );
}

function toInput(org: Organization | null): OrganizationInput {
  return {
    name: org?.name ?? '',
    industry: org?.industry ?? '',
    size: org?.size ?? '',
    regions: org?.regions ?? [],
    techStack: org?.techStack ?? [],
    regulations: org?.regulations ?? [],
  };
}
