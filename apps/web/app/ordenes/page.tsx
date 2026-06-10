import { WorkOrdersView } from '@/components/work-orders-view';
import { apiGet, type WorkOrderRow } from '@/lib/api';

export default async function WorkOrdersPage() {
  const workOrders = await apiGet<WorkOrderRow[]>('/work-orders');
  return <WorkOrdersView initialRows={workOrders.data ?? []} initialError={workOrders.error} />;
}
