import { NextResponse } from 'next/server';
import { auth } from './auth';

const viewerBlockedPrefixes = ['/dashboard/importacion', '/importacion'];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    if (pathname === '/login' && request.auth) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (!request.auth) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (
    request.auth.user.role === 'CLIENTE_VIEWER' &&
    viewerBlockedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return new NextResponse('No autorizado', { status: 403 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

function isPublicPath(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/api/');
}
