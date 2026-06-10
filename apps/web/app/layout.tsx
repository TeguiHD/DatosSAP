import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/app-shell';

export const metadata: Metadata = {
  title: 'datos.nicoholas',
  description: 'Plataforma operacional y gerencial para mantenciones industriales.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
