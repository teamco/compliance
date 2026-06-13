import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { LandingPage } from '@/features/landing/LandingPage';

function IndexPage() {
  useEffect(() => {
    // Supabase email-confirmation redirect lands here with tokens in the hash.
    if (window.location.hash.includes('access_token=')) {
      window.location.replace('/auth/oauth/callback' + window.location.hash);
    }
  }, []);

  return <LandingPage />;
}

export const Route = createFileRoute('/')({
  component: IndexPage,
});
