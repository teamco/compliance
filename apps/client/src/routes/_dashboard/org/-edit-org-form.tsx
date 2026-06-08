import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { useUpdateOrganization, type Organization, type OrganizationInput } from '@/queries/notes';
import { OrgForm } from './-org-form';

interface EditOrgFormProps {
  org: Organization;
  onSaved: () => void;
}

export function EditOrgForm({ org, onSaved }: EditOrgFormProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const update = useUpdateOrganization(org.id);

  const initial: OrganizationInput = {
    name: org.name,
    industry: org.industry,
    size: org.size,
    regions: org.regions,
    techStack: org.techStack,
    regulations: org.regulations,
  };

  async function handleSave(data: OrganizationInput) {
    try {
      await update.mutateAsync(data);
      onSaved();
      notify.success(t('org.updated'));
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  return (
    <OrgForm
      initial={initial}
      onSave={(data) => void handleSave(data)}
      isPending={update.isPending}
      submitLabel={t('org.save')}
    />
  );
}
