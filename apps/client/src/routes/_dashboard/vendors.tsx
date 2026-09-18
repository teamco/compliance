import { createFileRoute } from '@tanstack/react-router';
import { VendorsPage } from './-vendors.page';

export const Route = createFileRoute('/_dashboard/vendors')({
  component: VendorsPage,
});
