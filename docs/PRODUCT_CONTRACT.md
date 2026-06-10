# Contrato De Producto

`datos.nicoholas` se reconstruye como herramienta operacional y gerencial, no como dashboard decorativo.

Flujo obligatorio:

```text
Excel -> Importacion validada -> Plantas/KKS -> Plantillas -> Ocurrencias
-> Ordenes de Trabajo -> Asignacion -> HH/Evidencia -> Aprobacion -> Reportes
```

Principios:

- Mobile-first real: cards accionables en 375px, tablas densas solo desde desktop.
- Menos secciones visibles: el usuario navega por flujo, no por estructura interna.
- Sheets para detalle contextual; paginas/wizards para tareas largas; dialogs solo confirmaciones criticas.
- Datos reales desde importacion; no hardcodear plantas ni mantenciones en produccion.
- Todo cambio critico genera auditoria.
- `CLIENTE_VIEWER` solo ve plantas y evidencias dentro de su alcance.
