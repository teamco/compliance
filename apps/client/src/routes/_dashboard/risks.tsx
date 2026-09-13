import { createFileRoute } from '@tanstack/react-router';
import { RisksPage } from './-risks.page';

export const Route = createFileRoute('/_dashboard/risks')({
  component: RisksPage,
});
