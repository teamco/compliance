import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardPreview } from '../components/DashboardPreview';
import { LandingBadge } from '../components/LandingBadge';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_32%)]" />
      <div className="mx-auto grid min-h-[760px] max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <div>
          <LandingBadge className="mb-6">
            <ShieldCheck size={14} className="mr-2" />
            AI-powered GRC intelligence platform
          </LandingBadge>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
            Turn compliance work into an intelligent security operating system.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
            Generate standards, analyze gaps, map controls and score security posture across
            enterprise frameworks — from one AI-assisted governance workspace.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/login">
                Request demo
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6">
              <Link to="/dashboard">Open platform</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <span>ISO 27001</span>
            <span>SOC 2</span>
            <span>NIST CSF</span>
            <span>PCI DSS</span>
            <span>Custom frameworks</span>
          </div>
        </div>
        <DashboardPreview />
      </div>
    </section>
  );
}
