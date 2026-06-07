import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface LandingBadgeProps {
  children: ReactNode;
  className?: string;
}

export function LandingBadge({ children, className }: LandingBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400',
        className,
      )}
    >
      {children}
    </span>
  );
}
