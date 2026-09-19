import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
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
import {
  useRiskMethodology,
  useUpsertRiskMethodology,
  useRiskTaxonomy,
  useCreateRiskTaxonomyCategory,
  useArchiveRiskTaxonomyCategory,
} from '@/queries/risks';

export function RiskMethodologySheet({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'methodology' | 'taxonomy'>('methodology');
  const [newCategory, setNewCategory] = useState('');
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const { data: methodology } = useRiskMethodology(orgId);
  const upsertMut = useUpsertRiskMethodology(orgId);
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const createCategoryMut = useCreateRiskTaxonomyCategory(orgId);
  const archiveCategoryMut = useArchiveRiskTaxonomyCategory(orgId);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings size={14} className="mr-1.5" />
        {t('risks.methodologySettings')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('risks.methodologySettings')}</SheetTitle>
          </SheetHeader>
          <div className="border-b border-border flex gap-1 px-4">
            <button
              type="button"
              onClick={() => setTab('methodology')}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${tab === 'methodology' ? 'border-green-500 text-foreground font-medium' : 'border-transparent text-muted-foreground'}`}
            >
              {t('risks.tabMethodology')}
            </button>
            <button
              type="button"
              onClick={() => setTab('taxonomy')}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${tab === 'taxonomy' ? 'border-green-500 text-foreground font-medium' : 'border-transparent text-muted-foreground'}`}
            >
              {t('risks.tabTaxonomy')}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'methodology' && methodology && (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {t('risks.scaleSize')}: {methodology.scaleSize}×{methodology.scaleSize}
                </p>
                <p className="text-muted-foreground">
                  {t('risks.appetiteThreshold')}: {methodology.appetiteThreshold}
                </p>
                <Button
                  size="sm"
                  onClick={() =>
                    upsertMut.mutate({
                      scaleSize: methodology.scaleSize,
                      likelihoodLabels: methodology.likelihoodLabels,
                      impactLabels: methodology.impactLabels,
                      thresholds: methodology.thresholds,
                      appetiteThreshold: methodology.appetiteThreshold,
                    })
                  }
                >
                  {t('risks.saveNewVersion')}
                </Button>
              </div>
            )}

            {tab === 'taxonomy' && (
              <div className="space-y-2">
                {taxonomy.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm py-1">
                    <span className={c.archived ? 'line-through text-muted-foreground' : ''}>
                      {c.name}
                    </span>
                    {!c.archived && (
                      <button
                        type="button"
                        onClick={() => setConfirmArchiveId(c.id)}
                        className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder={t('risks.newCategoryPlaceholder')}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newCategory.trim()) return;
                      createCategoryMut.mutate({ name: newCategory.trim() });
                      setNewCategory('');
                    }}
                  >
                    {t('common.create')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmArchiveId}
        onOpenChange={(open) => !open && setConfirmArchiveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('risks.archiveCategoryConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('risks.archiveCategoryConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmArchiveId) archiveCategoryMut.mutate(confirmArchiveId);
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
