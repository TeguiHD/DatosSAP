import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/shell/app-shell';
import { auth } from '@/auth';

export const metadata: Metadata = {
  title: 'datos.nicoholas',
  description: 'Plataforma operacional y gerencial para mantenciones industriales.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="es">
      <body>
        <AppShell role={session?.user.role ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
