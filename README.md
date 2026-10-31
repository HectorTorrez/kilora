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
