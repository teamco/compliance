import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';

interface ProfileHeaderProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string | null;
  lastSignedIn?: string | null;
}

export function ProfileHeader({ avatarUrl, displayName, email, lastSignedIn }: ProfileHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface border-border flex items-center gap-5 rounded-xl border p-5">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName ?? ''}
          referrerPolicy="no-referrer"
          className="ring-border h-20 w-20 shrink-0 rounded-full object-cover ring-2"
        />
      ) : (
        <div className="bg-muted ring-border flex h-20 w-20 shrink-0 items-center justify-center rounded-full ring-2">
          <User className="text-muted-foreground h-8 w-8" />
        </div>
      )}
      <div className="min-w-0">
        {displayName ? (
          <p className="text-foreground truncate text-lg font-semibold">{displayName}</p>
        ) : (
          <p className="text-muted-foreground truncate text-lg">
            {t('profile.displayNamePlaceholder')}
          </p>
        )}
        {email && <p className="text-muted-foreground mt-0.5 text-sm">{email}</p>}
        {lastSignedIn && (
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t('profile.lastLogin')}: {new Date(lastSignedIn).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
