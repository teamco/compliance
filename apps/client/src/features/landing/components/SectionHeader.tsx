import { LandingBadge } from './LandingBadge';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  align?: 'left' | 'center';
}

export function SectionHeader({ eyebrow, title, description, align = 'center' }: SectionHeaderProps) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <LandingBadge>{eyebrow}</LandingBadge>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">{description}</p>
    </div>
  );
}
