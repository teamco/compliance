import { Hero } from './sections/Hero';
import { TrustedFrameworks } from './sections/TrustedFrameworks';
import { PlatformModules } from './sections/PlatformModules';
import { AIEngine } from './sections/AIEngine';
import { Architecture } from './sections/Architecture';
import { SecurityPosture } from './sections/SecurityPosture';
import { Pricing } from './sections/Pricing';
import { CTA } from './sections/CTA';

export function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Hero />
      <TrustedFrameworks />
      <PlatformModules />
      <AIEngine />
      <Architecture />
      <SecurityPosture />
      <Pricing />
      <CTA />
    </main>
  );
}
