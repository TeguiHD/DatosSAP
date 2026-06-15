'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const GENERIC_ERROR = 'Credenciales incorrectas. Intentalo de nuevo.';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError(GENERIC_ERROR);
      return;
    }

    router.push('/inicio');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LockKeyhole aria-hidden="true" />
        </div>
        <CardTitle>Ingreso operacional</CardTitle>
        <CardDescription>Accede con tu cuenta autorizada para ESSC Sur.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>

          {error ? (
            <Alert className="border-red-200 bg-red-50 text-red-950">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>No pudimos iniciar sesion</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {loading ? 'Verificando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
