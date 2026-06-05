import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import { api } from '@/main';
import { ProfileHeader } from '@/components/profile/profile-header';
import { DisplayNameSection } from '@/components/profile/display-name-section';
import { DangerZone } from '@/components/profile/danger-zone';

interface ProfilePayload {
  uid: string;
  email?: string;
  role?: string;
  displayName?: string;
  avatarUrl?: string;
  lastSignedIn?: string;
}

function ProfilePage() {
  const { t } = useTranslation();
  const authUser = useAuthStore((s) => s.user);

  const { data: profile, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<ProfilePayload>('/profile'),
  });

  if (isPending) {
    return <div className="text-muted-foreground p-6">{t('common.loading')}</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-foreground mb-6 text-2xl font-bold">{t('profile.title')}</h1>
      <div className="space-y-6">
        <ProfileHeader
          avatarUrl={profile?.avatarUrl}
          displayName={profile?.displayName}
          email={profile?.email ?? authUser?.email}
          lastSignedIn={profile?.lastSignedIn}
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DisplayNameSection initialName={profile?.displayName} />
        </div>
        <DangerZone />
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/profile')({
  component: ProfilePage,
});
