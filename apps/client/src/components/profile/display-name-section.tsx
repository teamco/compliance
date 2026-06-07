import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { User } from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

interface DisplayNameSectionProps {
  initialName?: string | null;
}

export function DisplayNameSection({ initialName }: DisplayNameSectionProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const qc = useQueryClient();
  const [name, setName] = useState(initialName ?? '');

  const update = useMutation({
    mutationFn: (displayName: string) =>
      api('/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      }),
    onSuccess: () => {
      notify.success(t('profile.saved'));
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => notify.error(err instanceof Error ? err.message : 'save_failed'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          {t('profile.displayName')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(name);
          }}
        >
          <Input
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('profile.displayNamePlaceholder')}
          />
          <Button type="submit" disabled={update.isPending}>
            {update.isPending
              ? t('profile.saving')
              : initialName
                ? t('common.update')
                : t('common.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
