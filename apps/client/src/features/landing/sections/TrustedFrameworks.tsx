import { trustedFrameworks } from '../data/landing-data';

export function TrustedFrameworks() {
  return (
    <section className="border-b border-border bg-surface/35 py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
          Built for security and compliance teams working across major frameworks
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-6">
          {trustedFrameworks.map((framework) => (
            <div
              key={framework}
              className="rounded-xl border border-border bg-background/50 px-4 py-3 text-center text-sm font-medium text-foreground/80"
            >
              {framework}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
