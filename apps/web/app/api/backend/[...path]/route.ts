import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyBackend(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyBackend(request, context);
}

async function proxyBackend(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ message: 'No autenticado' }, { status: 401 });
  }

  const { path } = await context.params;
  const backendUrl = new URL(`/${path.join('/')}`, process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');
  backendUrl.search = request.nextUrl.search;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const requestInit: RequestInit = {
    method,
    headers,
  };
  if (hasBody) {
    requestInit.body = await request.arrayBuffer();
  }

  const response = await fetch(backendUrl, requestInit);

  const responseHeaders = new Headers();
  for (const header of ['content-type', 'content-disposition']) {
    const value = response.headers.get(header);
    if (value) {
      responseHeaders.set(header, value);
    }
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
