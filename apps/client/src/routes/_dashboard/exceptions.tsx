import { createFileRoute } from '@tanstack/react-router';
import { ExceptionsPage } from './-exceptions.page';

interface ExceptionsSearch {
  open?: string;
}

export const Route = createFileRoute('/_dashboard/exceptions')({
  validateSearch: (search: Record<string, unknown>): ExceptionsSearch => ({
    open: typeof search['open'] === 'string' ? search['open'] : undefined,
  }),
  component: ExceptionsPage,
});
