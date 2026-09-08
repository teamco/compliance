import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface EditSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  defaultWidth?: number;
  children: React.ReactNode;
}

export function EditSheet({
  open,
  onClose,
  title,
  onSubmit,
  isPending,
  saveDisabled,
  saveLabel,
  defaultWidth = 440,
  children,
}: EditSheetProps) {
  const { t } = useTranslation();
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const dragging = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPanelWidth(Math.min(Math.max(window.innerWidth - ev.clientX, 280), 900));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="flex flex-col p-0 !w-[var(--panel-w)]"
        style={{ '--panel-w': `${panelWidth}px` } as React.CSSProperties}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* resize handle */}
        <div
          onMouseDown={onResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 group"
        >
          <div className="absolute inset-y-0 left-0 w-px bg-border group-hover:bg-green-500/50 group-active:bg-green-500 transition-colors" />
        </div>

        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">{children}</div>
          <footer className="border-t border-border p-4 flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending || saveDisabled} className="flex-1">
              {isPending ? t('common.saving') : (saveLabel ?? t('common.save'))}
            </Button>
          </footer>
        </form>
      </SheetContent>
    </Sheet>
  );
}
