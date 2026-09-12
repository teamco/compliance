import { createFileRoute } from '@tanstack/react-router';
import { ControlDetailPage } from './-controls-detail.page';

export const Route = createFileRoute('/_dashboard/controls_/$id')({
  component: ControlDetailPage,
});
