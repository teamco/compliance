import { createFileRoute } from '@tanstack/react-router';
import { FrameworksPage } from './-frameworks.page';

export const Route = createFileRoute('/_dashboard/frameworks')({
  component: FrameworksPage,
});
