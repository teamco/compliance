import { createFileRoute } from '@tanstack/react-router';
import { RiskDetailPage } from './-risks-detail.page';

export const Route = createFileRoute('/_dashboard/risks_/$id')({
  component: RiskDetailPage,
});
