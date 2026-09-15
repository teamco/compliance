import { createFileRoute } from '@tanstack/react-router';
import { MyWorkPage } from './-my-work.page';

export const Route = createFileRoute('/_dashboard/my-work')({
  component: MyWorkPage,
});
