import { createFileRoute, redirect } from '@tanstack/react-router';
import { Can } from '@icore/template-shared';
import { useAuthStore } from '@icore/template-shared';
import { AdminAiUsageContent } from '@/components/admin/ai-usage/admin-ai-usage-content';
import { PageLayout } from '@/components/PageLayout';
import { AccessDeniedPage } from '@/components/AccessDeniedPage';

export const Route = createFileRoute('/_dashboard/admin/ai-usage')({
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user || user.role !== 'admin') {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: AdminAiUsagePage,
});

function AdminAiUsagePage() {
  return (
    <Can I="read" a="AiUsage" passThrough>
      {(allowed) =>
        allowed ? (
          <PageLayout title="AI Usage" description="Admin — Anthropic API consumption">
            <AdminAiUsageContent />
          </PageLayout>
        ) : (
          <AccessDeniedPage />
        )
      }
    </Can>
  );
}
