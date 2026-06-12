# Checkpoint Hito 1: KKS Fiori

Fecha: 2026-06-11

Archivo validado:

`Arbol Jerarquico ESSC 2026 (Fiori).xlsx`

Comando:

```bash
python3 apps/importer/parsers/kks_parser.py \
  --file "../archivo-versiones-antiguas/26MayoPRUEBAPOWERBI/Arbol Jerarquico ESSC 2026 (Fiori).xlsx" \
  --dry-run
```

Resultado:

- 4.837 filas validas.
- 4.837 nodos a crear.
- 0 filas omitidas.
- 0 errores criticos.
- 668 ubicaciones tecnicas.
- 4.169 equipos.
- 27 nodos raiz autorreferenciados por SAP.
- 4.810 referencias padre resueltas.
- 0 referencias padre perdidas.

## Decision De Identidad

La columna `KKS` no puede usarse como clave unica:

- 605 valores KKS unicos.
- 4.232 repeticiones sobre 4.837 filas.

Las columnas `Objeto tecnico` y `Equipo` contienen 4.837 valores unicos.
Por lo tanto:

- El upsert usa `technicalObject`.
- La jerarquia padre-hijo se resuelve mediante `equipmentCode`.
- Una autorreferencia SAP se interpreta como nodo raiz y nunca como `parentId = id`.

Esta decision evita sobrescribir activos distintos que comparten una misma
ubicacion KKS y evita ciclos en el arbol.
