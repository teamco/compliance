import { createFileRoute } from '@tanstack/react-router';
import { IssuesPage } from './-issues.page';

interface IssuesSearch {
  open?: string;
}

export const Route = createFileRoute('/_dashboard/issues')({
  validateSearch: (search: Record<string, unknown>): IssuesSearch => ({
    open: typeof search['open'] === 'string' ? search['open'] : undefined,
  }),
  component: IssuesPage,
});
