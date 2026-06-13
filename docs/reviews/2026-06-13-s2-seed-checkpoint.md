# S-2 Seed - Checkpoint

Fecha: 2026-06-13

## Estado

Seed implementado y compilado. No se ejecuto contra la BD local porque faltan
dos condiciones operativas:

- Docker/PostgreSQL local no esta disponible en `localhost:55432`.
- `.env` local no contiene `SEED_ADMIN_EMAIL` ni `SEED_ADMIN_PASSWORD`.

No se avanzo a S-3.

## Cambios implementados

- `apps/api/prisma/seed.ts` con 8 bloques idempotentes:
  1. Organization
  2. MaintenanceFrequency
  3. MilestoneConfig
  4. Clients
  5. Plants
  6. RecertificationCycles
  7. PlantAlias
  8. SUPERADMIN
- `apps/api/package.json` configura:
  `ts-node --project tsconfig.json prisma/seed.ts`.
- `ts-node` agregado como dependencia de desarrollo.
- `.env.example` documenta `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`.
- ImportService ahora resuelve `PlantAlias` por `aliasCode`, no por un
  `source` fijo. Esto permite que el alias sembrado con
  `EXCEL_POSICIONES_ESSC_SUR` desbloquee CEMIN en el dry-run API.

## Datos cargados por el seed

- 9 clientes.
- 9 plantas.
- 6 plantas con coordenadas verificadas.
- 4 frecuencias.
- 9 hitos de OT con peso total 100.
- 27 ciclos de recertificacion.
- 1 alias CEMIN: `ESZS-A1 -> ESZS-B2`.

`centerCode` queda `null` para todas las plantas; se completara despues del
KKS apply desde el centro dominante real del arbol Fiori.

## Verificacion Eden S.A.

El Excel de Posiciones confirma el nombre operativo `Eden S.A.`, pero no
contiene fechas de recertificacion. La fecha `CERT_5Y = 2025-06-11` fue
confirmada contra la documentacion de planificacion y el seed historico de la
version antigua.

El seed deja `ESZS-A0 / CERT_5Y` como:

- `dueAt = 2025-06-11`
- `isIrregular = true`
- `status = HISTORICAL`

Con esto el total esperado de ciclos historicos es 9.

## Validaciones ejecutadas

```text
pnpm --filter @datos/api prisma validate OK
pnpm --filter @datos/api lint            OK
pnpm --filter @datos/api typecheck       OK
pnpm --filter @datos/api test            OK
pnpm --filter @datos/api build           OK
```

Tambien se ejecuto `prisma db seed` con credenciales desechables para validar
que `ts-node` compila `prisma/seed.ts`. La ejecucion llego hasta Prisma y fallo
solo al intentar conectar con PostgreSQL:

```text
Can't reach database server at localhost:55432
```

## Validacion pendiente

Cuando PostgreSQL local este disponible y `.env` tenga las variables de seed,
ejecutar:

```bash
pnpm --filter @datos/api prisma db seed
```

Y reportar:

```text
Plant: 9
Plant con latitude: 6
MilestoneConfig: 9
SUM(MilestoneConfig.weight): 100
RecertificationCycle: 27
RecertificationCycle HISTORICAL: 9
PlantAlias: 1 fila ESZS-A1
MaintenanceFrequency: 4
```
