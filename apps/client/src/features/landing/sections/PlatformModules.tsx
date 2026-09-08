import { Card, CardContent } from '@/components/ui/card';
import { platformModules } from '../data/landing-data';
import { SectionHeader } from '../components/SectionHeader';

export function PlatformModules() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader
          eyebrow="Platform modules"
          title="Everything a GRC team needs to move faster than audits."
          description="The landing page mirrors your actual product areas: standards, gap analysis, controls, frameworks and AI assistant workflows."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {platformModules.map((module) => (
            <Card
              key={module.title}
              className="group overflow-hidden transition-colors hover:border-green-500/30"
            >
              <CardContent className="p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-green-500/20 bg-green-500/10">
                    <module.icon size={20} className="text-green-400" />
                  </div>
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {module.eyebrow}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-foreground">{module.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{module.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
