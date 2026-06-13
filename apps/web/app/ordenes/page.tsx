import { WorkOrdersView } from '@/components/work-orders-view';
import { apiGet } from '@/lib/api-server';
import { type WorkOrderRow } from '@/lib/api';

export default async function WorkOrdersPage() {
  const workOrders = await apiGet<WorkOrderRow[]>('/work-orders');
  return <WorkOrdersView initialRows={workOrders.data ?? []} initialError={workOrders.error} />;
}
