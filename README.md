# datos.nicoholas

Reconstruccion limpia de la plataforma operacional y gerencial para mantenciones industriales ESSC Sur.

## Estructura

- `apps/web`: experiencia Next.js mobile-first.
- `apps/api`: API NestJS con Prisma/PostgreSQL.
- `apps/importer`: importador Python para Excel con `openpyxl data_only=True`.
- `packages/shared`: contratos publicos y enums compartidos.
- `infra`: servicios locales PostgreSQL, Redis y MinIO.

## Inicio local

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis minio
pnpm --filter @datos/api prisma migrate dev
pnpm dev
```

## Fuentes Excel

- `../Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx`
- `../26MayoPRUEBAPOWERBI/Arbol Jerarquico ESSC 2026 (Fiori).xlsx`
- `../26MayoPRUEBAPOWERBI/Planes_Mantencion_ESSC.xlsx`

El importador debe tratar los Excel como fuentes de migracion inicial, no como base operacional permanente.
