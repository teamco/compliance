import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CTA() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-green-500/20 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,1))] p-8 text-center md:p-16">
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Replace spreadsheet compliance with AI-assisted governance intelligence.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            Launch with a landing that reflects the real product: standards generation, gap analysis, control mapping and posture scoring.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/login">
                Start now
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
