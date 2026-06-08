import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  FileJson,
  Loader2,
  Star,
} from 'lucide-react';
import {
  useReportTemplates,
  useSetTemplateFavorite,
  type ReportTemplate,
} from '@/queries/report-templates';

type Scope = 'gap' | 'standards';

export function ExportMenu({
  scope,
  orgId,
  onPdf,
  onCsv,
  onJson,
}: {
  scope: Scope;
  orgId?: string;
  onPdf: (template: ReportTemplate) => void | Promise<void>;
  onCsv: () => void;
  onJson: () => void;
}) {
  const { t } = useTranslation();
  const { data: templates } = useReportTemplates();
  const setFavorite = useSetTemplateFavorite();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const isFavorite = (tpl: ReportTemplate) => !!orgId && tpl.favoriteOrgIds.includes(orgId);

  const pdfTemplates = (templates ?? [])
    .filter((tpl) => tpl.scope === scope || tpl.scope === 'all')
    // Favorites for this org bubble to the top so they're picked without scanning.
    .sort((a, b) => Number(isFavorite(b)) - Number(isFavorite(a)));

  async function handlePdf(tpl: ReportTemplate) {
    setBusy(true);
    try {
      await onPdf(tpl);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors cursor-pointer"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {t('export.export')}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-lg border border-border bg-surface shadow-lg z-30 p-1.5 space-y-0.5">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
            <FileText size={11} /> {t('export.pdfTemplate')}
          </p>
          {pdfTemplates.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">{t('export.noTemplates')}</p>
          ) : (
            pdfTemplates.map((tpl) => {
              const fav = isFavorite(tpl);
              return (
                <div key={tpl.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handlePdf(tpl)}
                    className="flex-1 min-w-0 text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: tpl.accentColor || '#16a34a' }}
                    />
                    <span className="truncate">{tpl.name}</span>
                  </button>
                  {orgId && (
                    <button
                      type="button"
                      title={fav ? t('export.unfavorite') : t('export.favorite')}
                      disabled={setFavorite.isPending}
                      onClick={() => setFavorite.mutate({ id: tpl.id, orgId, favorite: !fav })}
                      className="shrink-0 rounded p-1 hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Star
                        size={12}
                        className={
                          fav
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/50 hover:text-amber-400'
                        }
                      />
                    </button>
                  )}
                </div>
              );
            })
          )}

          <div className="h-px bg-border my-1" />

          <button
            type="button"
            onClick={() => {
              onCsv();
              setOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-2"
          >
            <FileSpreadsheet size={13} className="text-muted-foreground" /> {t('export.csv')}
          </button>
          <button
            type="button"
            onClick={() => {
              onJson();
              setOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 rounded text-xs text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-2"
          >
            <FileJson size={13} className="text-muted-foreground" /> {t('export.json')}
          </button>
        </div>
      )}
    </div>
  );
}
