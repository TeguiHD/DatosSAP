import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/shell/app-shell';
import { auth } from '@/auth';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'datos.nicoholas',
  description: 'Plataforma operacional y gerencial para mantenciones industriales.',
};

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="es">
      <body className={`${plexSans.variable} ${plexMono.variable} font-sans antialiased`}>
        <TooltipProvider delayDuration={180}>
          <AppShell role={session?.user.role ?? null}>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
