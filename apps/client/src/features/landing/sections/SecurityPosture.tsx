import { Card, CardContent } from '@/components/ui/card';
import { securitySignals } from '../data/landing-data';
import { SectionHeader } from '../components/SectionHeader';

export function SecurityPosture() {
  return (
    <section className="border-y border-border bg-surface/35 py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader
          eyebrow="Security posture"
          title="Executive visibility without losing control-level detail."
          description="Show leadership the score, show practitioners the mapped controls, and show auditors the evidence trail."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {securitySignals.map((signal) => (
            <Card key={signal.title}>
              <CardContent className="p-5">
                <signal.icon className="text-green-400" size={22} />
                <h3 className="mt-5 text-sm font-semibold text-foreground">{signal.title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{signal.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
