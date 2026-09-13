import { createFileRoute } from '@tanstack/react-router';
import { AssessmentsPage } from './-assessments.page';

export const Route = createFileRoute('/_dashboard/assessments')({
  component: AssessmentsPage,
});
