import { createFileRoute } from '@tanstack/react-router';
import { ControlsPage } from './-controls.page';

export const Route = createFileRoute('/_dashboard/controls')({
  component: ControlsPage,
});
