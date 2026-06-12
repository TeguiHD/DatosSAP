# Hito 1 - Checkpoint Posiciones ESSC Sur

Fecha: 2026-06-11

## Veredicto

El parser de `Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx`
cumple el contrato de dry-run y queda listo para resolver la homologacion CEMIN.
No se ejecuto `apply` real.

## Resultado reproducible

```text
Plantillas: 283
Ocurrencias: 3.061
Columnas mensuales: 96
Periodo: 2022-01-01 a 2029-12-01
Ocurrencias historicas: 1.722
Ocurrencias futuras: 1.339
Filas omitidas: 0
Errores criticos: 1
```

El unico bloqueo critico es `CEMIN_ALIAS_REQUIRED`.

## Hallazgos del Excel real

- La hoja correcta es `Actividades MP ESSC Sur`.
- El header se detecta dinamicamente en la fila 5 buscando `Elemento PEP`
  en la columna B.
- Las 96 fechas mensuales tambien estan en la fila 5. La indicacion inicial
  que las situaba en la fila anterior no coincide con el archivo real.
- `Frec.` contiene formulas. El parser usa `data_only=True` y valida los
  valores cacheados.
- Frecuencias: `1A=164`, `5A=58`, `6M=49`, `1M=12`.
- No existen frecuencias desconocidas ni diferencias entre `Frec.` y `Meses`.
- 95 filas legacy no incluyen ubicacion tecnica ni equipo. Corresponden a
  actividades con nombre de planta inequivoco y suman 496 ocurrencias.
- Esas 95 filas se conservan para no perder datos. La planta se infiere desde
  la actividad y el activo queda nulo, con dos warnings agregados.
- CEMIN afecta 34 plantillas: 23 con contexto tecnico y 11 del bloque legacy.
  Todas se agrupan en un solo issue critico.

## Decisiones de implementacion

- La plantilla usa una clave de idempotencia independiente:
  `plantCode + technicalObject + activityName + frequency`.
- El hash de contenido se conserva por separado para detectar cambios.
- Las ocurrencias son unicas por `templateId + scheduledFor`.
- `scheduledFor` y `dueDate` se almacenan como PostgreSQL `DATE`.
- `estimatedHours` queda nulo porque este Excel no contiene HH.
- La resolucion de activo en API es:
  1. `equipmentCode`;
  2. `technicalObject`;
  3. activo nulo si no existe contexto.
- No se consulta `kks`, porque ese campo no es unico en el maestro Fiori.
- El importador de Planes solo resuelve activo por equipo; su columna `kks`
  no se reutiliza como objeto tecnico.
- La homologacion `ESZS-A1 -> ESZS-B2` remapea tambien los codigos de equipo
  y objeto tecnico antes de buscar el activo.
- El schema existente usa `ONE_MONTH`, `SIX_MONTHS`, `ONE_YEAR` y
  `FIVE_YEARS`. Son los equivalentes persistidos de `1M`, `6M`, `1A` y `5A`.

## Bloqueo y resolucion CEMIN

El dry-run conserva las 283 plantillas y 3.061 ocurrencias para entregar una
vista completa, pero el job queda `BLOCKED`. No hay importacion parcial.

Al resolver el issue, la API crea:

- `PlantAlias(aliasCode=ESZS-A1, plant=ESZS-B2)`;
- `ImportMapping(sourceType=PLANT_ALIAS, sourceValue=ESZS-A1)`.

El siguiente dry-run elimina el bloqueo solo si la homologacion existe.

## Validaciones ejecutadas

```text
pnpm lint                                      OK
pnpm typecheck                                 OK
pnpm test                                      OK
pnpm build                                     OK
pnpm --filter @datos/web test:e2e              OK (17/17)
pnpm --filter @datos/api prisma validate       OK
pnpm --filter @datos/api prisma migrate deploy OK
pnpm --filter @datos/api prisma migrate status OK
```

Pruebas:

- API: 6 tests.
- Web: 2 tests.
- Importador Python: 13 tests.

La migracion fue validada en PostgreSQL 16 + PostGIS del compose
`datos-local`, usando el puerto aislado `55432`. No se modificaron servicios
ni bases de otros proyectos.

Playwright usa ahora el puerto aislado `3100` y no reutiliza servidores
existentes. Esto evita validar por error otra aplicacion que ocupe el puerto
`3000`.

## Siguiente paso

Resolver formalmente CEMIN contra la planta canonica `ESZS-B2`, repetir el
dry-run y solicitar autorizacion antes de ejecutar el primer `apply` real.
