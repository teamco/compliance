import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@icore/template-shared';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const token = useAuthStore.getState().accessToken;
    throw redirect({ to: token ? '/dashboard' : '/login' });
  },
});
