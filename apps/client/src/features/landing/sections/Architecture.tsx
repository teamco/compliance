import { Card, CardContent } from '@/components/ui/card';
import { architectureBlocks } from '../data/landing-data';
import { SectionHeader } from '../components/SectionHeader';

export function Architecture() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader
          eyebrow="Enterprise architecture"
          title="Built on your current Nx, NestJS, Supabase and AI microservice stack."
          description="This landing is aligned with the architecture already documented in your project, so it sells the real platform instead of a generic SaaS promise."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {architectureBlocks.map((block) => (
            <Card key={block.title} className="bg-surface/80">
              <CardContent className="p-5">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/20 bg-green-500/10">
                  <block.icon size={18} className="text-green-400" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{block.title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{block.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
