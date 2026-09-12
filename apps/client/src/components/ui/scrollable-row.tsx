import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollableRowProps {
  children: ReactNode;
  className?: string;
}

const SCROLL_AMOUNT = 160;

const ARROW_BUTTON_CLASS =
  'shrink-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer';

export function ScrollableRow({ children, className }: ScrollableRowProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showArrows, setShowArrows] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateOverflow() {
      setShowArrows(el.scrollWidth > el.clientWidth + 1);
      setAtStart(el.scrollLeft <= 0);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    }

    updateOverflow();

    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(el);
    if (contentRef.current) resizeObserver.observe(contentRef.current);

    el.addEventListener('scroll', updateOverflow);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('scroll', updateOverflow);
    };
    // ResizeObserver reacts to actual size changes of the observed elements;
    // it does not need to be re-created just because `children` is a fresh
    // set of React elements on every parent re-render.
  }, []);

  function scrollByAmount(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      {showArrows && (
        <button
          type="button"
          onClick={() => scrollByAmount(-SCROLL_AMOUNT)}
          disabled={atStart}
          aria-label={t('common.scrollLeft')}
          className={ARROW_BUTTON_CLASS}
        >
          <ChevronLeft size={14} />
        </button>
      )}
      <div ref={scrollRef} className="overflow-x-auto scrollbar-none min-w-0">
        <div ref={contentRef} className={cn('flex', className)}>
          {children}
        </div>
      </div>
      {showArrows && (
        <button
          type="button"
          onClick={() => scrollByAmount(SCROLL_AMOUNT)}
          disabled={atEnd}
          aria-label={t('common.scrollRight')}
          className={ARROW_BUTTON_CLASS}
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
