import { auth } from '@/auth';
import type { ApiResult } from '@/lib/api';

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const session = await auth();
    const headers = new Headers();
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }

    const response = await fetch(backendUrl(path), { cache: 'no-store', headers });
    if (!response.ok) {
      return { data: null, error: `${response.status} ${response.statusText}` };
    }
    return { data: (await response.json()) as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'API no disponible' };
  }
}

function backendUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return new URL(path.startsWith('/') ? path : `/${path}`, base).toString();
}
