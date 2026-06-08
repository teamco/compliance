import generatedLanding from '../assets/generated-enterprise-landing.png';
import { productWorkflow } from '../data/landing-data';
import { SectionHeader } from '../components/SectionHeader';

export function AIEngine() {
  return (
    <section className="border-y border-border bg-surface/35 py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHeader
            align="left"
            eyebrow="AI governance engine"
            title="From framework selection to remediation-ready findings."
            description="The platform uses a dedicated AI service for standards generation, control interpretation and gap analysis while keeping the interface familiar for security teams."
          />
          <div className="mt-8 space-y-4">
            {productWorkflow.map((step, index) => (
              <div
                key={step.title}
                className="flex gap-4 rounded-2xl border border-border bg-background/50 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10 text-sm font-semibold text-green-400">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-green-500/10 blur-3xl" />
          <img
            src={generatedLanding}
            alt="AI compliance platform interface concept"
            className="relative rounded-3xl border border-border bg-surface shadow-2xl shadow-green-950/30"
          />
        </div>
      </div>
    </section>
  );
}
