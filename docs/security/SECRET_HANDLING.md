# Manejo De Secretos Locales

Este proyecto puede convivir con credenciales de VPS, Cloudflare, base de datos y servicios externos durante el desarrollo. Esas credenciales no deben copiarse a la UI, prompts, tests, fixtures, README publico ni commits.

Reglas obligatorias:

- Usar `.env`, `.env.local`, `SECRET.LOCAL` o un gestor de secretos para credenciales reales.
- Mantener ejemplos sin secretos reales en `.env.example`.
- No imprimir tokens, passwords ni claves privadas en logs de pruebas o scripts.
- No documentar passwords de VPS, tokens de Cloudflare, claves VAPID, credenciales PostgreSQL ni llaves SSH.
- Rotar cualquier secreto que haya sido pegado fuera de un canal seguro.

Archivos protegidos por `.gitignore`:

- `SECRET.LOCAL`
- `*.secret`
- `.env`
- `.env.*`

Excepcion permitida:

- `.env.example`, siempre que contenga valores ficticios.
