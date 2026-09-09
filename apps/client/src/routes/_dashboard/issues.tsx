import { createFileRoute } from '@tanstack/react-router';
import { IssuesPage } from './-issues.page';

export const Route = createFileRoute('/_dashboard/issues')({
  component: IssuesPage,
});
