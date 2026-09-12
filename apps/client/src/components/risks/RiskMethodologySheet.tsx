import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
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
          <div className="flex gap-2 mt-4 mb-4">
            <button
              type="button"
              onClick={() => setTab('methodology')}
              className={`px-3 py-1.5 text-sm rounded cursor-pointer ${tab === 'methodology' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.tabMethodology')}
            </button>
            <button
              type="button"
              onClick={() => setTab('taxonomy')}
              className={`px-3 py-1.5 text-sm rounded cursor-pointer ${tab === 'taxonomy' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.tabTaxonomy')}
            </button>
          </div>

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
                      onClick={() => archiveCategoryMut.mutate(c.id)}
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
        </SheetContent>
      </Sheet>
    </>
  );
}
