import { ImportWizard } from '@/components/import-wizard';
import { PageHeader } from '@/components/shell/page-header';

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Migracion"
        title="Importacion industrial"
        description="Carga controlada con dry-run, resolución de issues críticos y apply hacia modelos operacionales."
      />
      <ImportWizard />
    </div>
  );
}
