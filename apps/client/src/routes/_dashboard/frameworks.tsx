import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Shield, Lock, Cloud, AlertTriangle, ChevronRight } from 'lucide-react';
import { useFrameworks, type Framework } from '@/queries/notes';

const CATEGORY_COLORS: Record<string, string> = {
  security: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  privacy: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cloud: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  risk: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  security: Shield,
  privacy: Lock,
  cloud: Cloud,
  risk: AlertTriangle,
};

function FrameworkCard({ fw }: { fw: Framework }) {
  const { t } = useTranslation();
  const Icon = CATEGORY_ICONS[fw.category] ?? BookOpen;
  const colorClass = CATEGORY_COLORS[fw.category] ?? 'bg-muted text-muted-foreground border-border';

  return (
    <div className="group relative bg-surface border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-muted-foreground/40 transition-colors cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
          <Icon size={18} className="text-green-500" />
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border ${colorClass}`}
        >
          {t(`frameworks.category.${fw.category}`)}
        </span>
      </div>

      <div className="flex-1 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground leading-snug">{fw.name}</h3>
          <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
            {fw.version}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {fw.description}
        </p>
      </div>

      <div className="flex items-center justify-end pt-1 border-t border-border">
        <ChevronRight
          size={14}
          className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
        />
      </div>
    </div>
  );
}

function FrameworksPage() {
  const { t } = useTranslation();
  const { data: frameworks, isPending } = useFrameworks();
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = ['all', 'security', 'privacy', 'cloud', 'risk'] as const;

  const filtered =
    activeCategory === 'all'
      ? (frameworks ?? [])
      : (frameworks ?? []).filter((f) => f.category === activeCategory);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('frameworks.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('frameworks.subtitle')}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              activeCategory === cat
                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                : 'bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
            ].join(' ')}
          >
            {cat === 'all' ? t('frameworks.all') : t(`frameworks.category.${cat}`)}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-5 h-44 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={36} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('frameworks.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((fw) => (
            <FrameworkCard key={fw.id} fw={fw} />
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/frameworks')({
  component: FrameworksPage,
});
