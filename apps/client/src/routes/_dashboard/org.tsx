import { createFileRoute } from '@tanstack/react-router';
import { OrgPage } from './org/-org-page';

export const Route = createFileRoute('/_dashboard/org')({
  component: OrgPage,
});
