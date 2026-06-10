import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      { source: '/plants', destination: '/plantas', permanent: false },
      { source: '/plants/:path*', destination: '/plantas/:path*', permanent: false },
      { source: '/planning', destination: '/planificacion', permanent: false },
      { source: '/planning/:path*', destination: '/planificacion/:path*', permanent: false },
      { source: '/work-orders', destination: '/ordenes', permanent: false },
      { source: '/work-orders/:path*', destination: '/ordenes/:path*', permanent: false },
      { source: '/assignments', destination: '/asignaciones', permanent: false },
      { source: '/assignments/:path*', destination: '/asignaciones/:path*', permanent: false },
      { source: '/import', destination: '/importacion', permanent: false },
      { source: '/import/:path*', destination: '/importacion/:path*', permanent: false },
      { source: '/reports', destination: '/reportes', permanent: false },
      { source: '/reports/:path*', destination: '/reportes/:path*', permanent: false },
      { source: '/recertifications', destination: '/recertificaciones', permanent: false },
      { source: '/recertifications/:path*', destination: '/recertificaciones/:path*', permanent: false },
      { source: '/users', destination: '/usuarios', permanent: false },
      { source: '/users/:path*', destination: '/usuarios/:path*', permanent: false },
      { source: '/audit', destination: '/auditoria', permanent: false },
      { source: '/audit/:path*', destination: '/auditoria/:path*', permanent: false },
      { source: '/settings', destination: '/configuracion', permanent: false },
      { source: '/settings/:path*', destination: '/configuracion/:path*', permanent: false },
      { source: '/kks', destination: '/activos', permanent: false },
      { source: '/kks/:path*', destination: '/activos/:path*', permanent: false },
      { source: '/bi', destination: '/analisis', permanent: false },
      { source: '/bi/:path*', destination: '/analisis/:path*', permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
