import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { auth } from '@/auth';

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect('/inicio');
  }

  return (
    <main className="min-h-screen bg-muted/35">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 lg:grid lg:grid-cols-[0.9fr_1fr] lg:items-center lg:px-8">
        <section className="max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">datos.nicoholas</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
            Plataforma operacional ESSC Sur
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
            Mantenciones, KKS, ordenes, evidencias y reportes con trazabilidad de acceso.
          </p>
        </section>
        <section className="flex justify-center lg:justify-end">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
