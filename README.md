# Kilora

Historial digital del vehículo. El taller registra sus servicios y el propietario conserva el historial aunque cambie de taller.

Monorepo:

```
apps/web            TanStack Start + React + Tailwind + shadcn/ui
services/api        Go + chi + pgx + sqlc
packages/contracts  Contratos compartidos (OpenAPI, tipos)
db/migrations       Migraciones (goose)
db/seeds            Datos de demo
scripts             Utilidades de desarrollo
```

## Requisitos

- Node 24 y pnpm 11
- Go 1.27
- Docker (la base de datos corre en un contenedor)
- sqlc (solo al regenerar consultas)

```bash
brew install go sqlc
```

PostgreSQL no se instala en la máquina: `compose.yaml` levanta `postgres:17-alpine` con un volumen persistente (`kilora-pgdata`).

## Puesta en marcha

```bash
pnpm install
cp .env.example .env          # completa SESSION_SECRET con: openssl rand -base64 48
pnpm db:setup                 # levanta el contenedor y aplica migraciones
pnpm dev                      # frontend en http://localhost:3300
pnpm api                      # API en http://localhost:8080
```

Comprobar el API:

```bash
curl http://localhost:8080/healthz
```

El frontend usa `VITE_API_URL` vacío para llamar a `/api` en el mismo origen; en desarrollo el proxy de Vite lo envía a `localhost:8080`. En producción, configura el host para redirigir `/api/*` a Go. Si ya tienes un `.env` anterior con `VITE_API_URL=http://localhost:8080`, déjalo vacío para usar el proxy.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm start` | **Levanta todo**: base en Docker, API y frontend |
| `pnpm dev` | Solo el frontend en modo desarrollo |
| `pnpm build` | Build del frontend |
| `pnpm check` | Lint y formato (Biome) |
| `pnpm api` | API en modo desarrollo |
| `pnpm db:setup` | Levanta el contenedor de la base y aplica migraciones |
| `pnpm db:up` | Levanta solo la base en Docker |
| `pnpm db:down` | Apaga el contenedor (conserva los datos) |
| `pnpm db:logs` | Logs de PostgreSQL |
| `pnpm db:reset` | Borra el volumen y reconstruye la base desde cero |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:status` | Estado de las migraciones |

Para entrar a la base sin tener psql instalado:

```bash
docker compose exec db psql -U kilora -d kilora
```

Para regenerar el código de base de datos:

```bash
cd services/api && sqlc generate
```

### Autenticación y talleres

La API usa la cookie `kilora_session` (HttpOnly, SameSite=Lax; Secure en producción). Envía JSON y el origen configurado en `WEB_ORIGIN`; las sesiones duran 30 días y se renuevan como máximo una vez por hora.

- `POST /api/v1/auth/register`: `email`, `password` (mínimo 8 caracteres), `full_name`.
- `POST /api/v1/auth/login`: `email`, `password`; `POST /api/v1/auth/logout` cierra la sesión.
- `GET /api/v1/auth/me` devuelve el usuario y sus membresías por sucursal.
- `POST /api/v1/auth/verify-email`: `token`; `POST /api/v1/auth/forgot-password`: `email`; `POST /api/v1/auth/reset-password`: `token`, `password`.
- `POST /api/v1/workshops`: `name`, `branch_name`, `nit` opcional; `GET /api/v1/workshops/{workshopID}` devuelve el taller y las sucursales accesibles.

En desarrollo el correo se escribe en el log; con `RESEND_API_KEY` y `EMAIL_FROM` se envía mediante Resend. El registro inicia sesión sin esperar la verificación del correo. Los enlaces de verificación y recuperación expiran en 24 horas y una hora, respectivamente.

Las rutas siguientes requieren sesión y membresía en el taller. Los mecánicos tienen acceso de lectura; recepción puede escribir en las sucursales asignadas y administración en cualquiera del taller. Los identificadores ajenos al taller responden 404.

- `POST /api/v1/workshops/{workshopID}/vehicles` crea un vehículo provisional; `GET` en la misma ruta lista vehículos y acepta `plate` (prefijo) e `include_archived` (booleano). `GET /vehicles/{vehicleID}` devuelve el detalle y `GET /vehicles/{vehicleID}/history` su historial proyectado.
- `POST /api/v1/workshops/{workshopID}/work-orders` crea una orden con `vehicle_id`, `branch_id`, `reason` y opcionalmente `odometer_km` e `internal_notes`. `GET` lista órdenes con filtros `status` y `branch_id`; `GET /work-orders/{orderID}` incluye trabajos y piezas.
- `PATCH /api/v1/workshops/{workshopID}/work-orders/{orderID}` edita `reason`, `odometer_km`, `public_notes` e `internal_notes` mientras la orden está abierta. `PATCH /work-orders/{orderID}/status` cambia el estado; para cancelar se requiere `cancel_reason`. Marcar listo exige al menos un trabajo y publica una instantánea inmutable en el historial.
- `PUT /work-orders/{orderID}/quote` guarda o reemplaza los ítems de la cotización pendiente; `GET` la consulta. Cada ítem lleva `kind` (`repuesto` o `mano_de_obra`), `description`, `quantity` y `unit_price`. Los importes por ítem se redondean a centavos antes de sumar.
- `POST /work-orders/{orderID}/quote/share` devuelve un enlace de solo lectura válido por 15 días y un enlace de WhatsApp; compartir de nuevo invalida el anterior. `PATCH /work-orders/{orderID}/quote/outcome` registra el resultado verbal (`acepto`, `rechazo`, `no_respondio`); después no se pueden editar los ítems. El detalle de la orden incluye la comparación entre cotización y cobro publicado.
- `GET /api/v1/public/quotes/{token}` muestra la cotización compartida sin sesión y limita las consultas por IP.
- `POST /work-orders/{orderID}/jobs` y `DELETE /work-orders/{orderID}/jobs/{jobID}` gestionan trabajos. `POST /work-orders/{orderID}/jobs/{jobID}/parts` y `DELETE /work-orders/{orderID}/jobs/{jobID}/parts/{partID}` gestionan piezas. Los importes se reciben como números o cadenas decimales con hasta dos decimales, en USD.

### Invitaciones y propietario

El taller (admin o recepción) crea y consulta invitaciones en `POST/GET /api/v1/workshops/{workshopID}/vehicles/{vehicleID}/invitations`. El enlace público se consulta en `GET /api/v1/public/invitations/{token}` y el usuario destinatario lo acepta con consentimiento explícito en `POST /api/v1/invitations/{token}/accept`.

El propietario usa `GET/POST /api/v1/me/vehicles`, `GET /api/v1/me/vehicles/{vehicleID}`, `GET/POST /api/v1/me/vehicles/{vehicleID}/history`, `POST /api/v1/me/vehicles/{vehicleID}/corrections` y `POST /api/v1/me/vehicles/{vehicleID}/odometer`. Los importes se envían como cadenas decimales en USD. El nombre libre del taller en un servicio manual se guarda en las notas públicas como `Realizado en: …`; no crea un vínculo con ese taller. Las correcciones y lecturas son adiciones, no modifican registros anteriores.
