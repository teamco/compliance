import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function DangerZone() {
  const { t } = useTranslation();
  const notify = useNotify();

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2 text-base">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          {t('profile.dangerZone.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{t('profile.dangerZone.description')}</p>
        <Button variant="destructive" onClick={() => notify.error(t('common.soon'))}>
          {t('profile.dangerZone.deleteAccount')}
        </Button>
      </CardContent>
    </Card>
  );
}
