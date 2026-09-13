import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  useAssessmentTypes,
  useCreateAssessmentType,
  useArchiveAssessmentType,
} from '@/queries/assessment-types';

export function AssessmentTypesSheet({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [singular, setSingular] = useState('');
  const [plural, setPlural] = useState('');

  const { data: types = [] } = useAssessmentTypes(orgId);
  const createMut = useCreateAssessmentType(orgId);
  const archiveMut = useArchiveAssessmentType(orgId);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings size={14} className="mr-1.5" />
        {t('assessments.manageTypes')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('assessments.manageTypes')}</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 mt-4">
            {types.map((ty) => (
              <div key={ty.id} className="flex items-center justify-between text-sm py-1">
                <div className={ty.archived ? 'line-through text-muted-foreground' : ''}>
                  <span>{ty.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({ty.itemNounSingular}/{ty.itemNounPlural})
                  </span>
                </div>
                {!ty.archived && (
                  <button
                    type="button"
                    onClick={() => setConfirmArchiveId(ty.id)}
                    className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 pt-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('assessments.typeNamePlaceholder')}
              />
              <Input
                value={singular}
                onChange={(e) => setSingular(e.target.value)}
                placeholder={t('assessments.itemNounSingularPlaceholder')}
              />
              <Input
                value={plural}
                onChange={(e) => setPlural(e.target.value)}
                placeholder={t('assessments.itemNounPluralPlaceholder')}
              />
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                if (!name.trim() || !singular.trim() || !plural.trim()) return;
                createMut.mutate(
                  {
                    name: name.trim(),
                    itemNounSingular: singular.trim(),
                    itemNounPlural: plural.trim(),
                  },
                  {
                    onSuccess: () => {
                      setName('');
                      setSingular('');
                      setPlural('');
                    },
                  },
                );
              }}
            >
              {t('common.create')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmArchiveId} onOpenChange={(o) => !o && setConfirmArchiveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assessments.archiveTypeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('assessments.archiveTypeConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmArchiveId(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmArchiveId) archiveMut.mutate(confirmArchiveId);
                setConfirmArchiveId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
