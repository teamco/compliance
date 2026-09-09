import { createFileRoute } from '@tanstack/react-router';
import { ExceptionsPage } from './-exceptions.page';

export const Route = createFileRoute('/_dashboard/exceptions')({
  component: ExceptionsPage,
});
