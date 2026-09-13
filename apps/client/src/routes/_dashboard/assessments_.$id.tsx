import { createFileRoute } from '@tanstack/react-router';
import { AssessmentDetailPage } from './-assessment-detail.page';

export const Route = createFileRoute('/_dashboard/assessments_/$id')({
  component: AssessmentDetailPage,
});
