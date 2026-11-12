# Kilora

**A vehicle’s service history should stay with its owner.**

Kilora connects automotive workshops and vehicle owners through a shared service history. Workshops manage their day-to-day work, and owners keep a record of their vehicle’s maintenance—even when they change workshops.

Built for independent workshops and drivers in El Salvador, Kilora brings service orders, quotes, and maintenance records into one place.

## Why Kilora

A vehicle’s history often lives in paper receipts, WhatsApp conversations, and separate workshop records. When an owner visits a different workshop, that context is hard to recover.

Kilora turns completed services into a lasting vehicle history. Owners can understand what was done and what they paid, while a linked workshop can see relevant maintenance details without accessing another workshop’s pricing or private notes.

## For workshops

- **Manage service orders.** Register vehicles, track work from intake to completion, and record jobs, parts, and mileage.
- **Keep quotes connected to the work.** Prepare itemized estimates, share a read-only link through WhatsApp, record the customer’s verbal decision, and compare the quote with the final charge.
- **Start before the owner signs up.** Create a provisional vehicle record, then invite its owner to connect it to their account.
- **Coordinate your team.** Give administrators, reception staff, and mechanics access according to their roles and assigned branches.
- **Publish a useful service record.** Marking an order ready adds a permanent snapshot to the vehicle’s history.

## For vehicle owners

- **Keep your history across workshops.** Find linked workshop services in one vehicle record.
- **Understand your maintenance.** Review service dates, mileage, work performed, parts, and charges.
- **Fill in the gaps.** Add services manually and record new odometer readings.
- **Keep a traceable record.** Corrections are added as dated entries, preserving the original history.

## Shared history, with clear boundaries

Kilora gives each person the information relevant to them:

| Who is viewing | What they can see |
| --- | --- |
| Vehicle owner | Their vehicle’s service history, including workshop names, charges, and public service notes. |
| Workshop that performed the service | Its own service records, including internal costs and private notes. |
| Another linked workshop | Maintenance context: work, parts, dates, and mileage. Other workshops’ identities, prices, and notes stay hidden. |

Workshop internal costs and private notes remain private to that workshop, including when the owner views the service.

## How it works

1. **A workshop registers a vehicle** and opens a service order with the reason for the visit and its mileage.
2. **The team prepares a quote** and records the work and parts used.
3. **The workshop marks the order ready**, publishing a permanent service record.
4. **The owner accepts an invitation** to connect the vehicle and access its history.
5. **The history stays available** as the owner adds services or visits another linked workshop.

## Explore the demo locally

The demo includes two workshops, a reception account, and a vehicle owner so you can explore the same history from different perspectives.

After completing the setup below, set `DEMO_MODE=true` in `.env` and run:

```bash
pnpm db:seed
```

Open [localhost:3300](http://localhost:3300) and use the demo accounts on the home page, or sign in with one of these accounts. All use the password `demo1234`.

| Account | Experience |
| --- | --- |
| `taller@demo.kilora.app` | Administrator at Taller Los Volcanes. |
| `recepcion@demo.kilora.app` | Reception staff at the Santa Tecla branch. |
| `propietario@demo.kilora.app` | María Hernández’s vehicle history. |
| `ceiba@demo.kilora.app` | AutoServicio La Ceiba’s restricted view of another workshop’s services. |

## Run locally

Requires Node.js 24+, pnpm 11, Go 1.27.3+, and Docker. PostgreSQL runs in Docker; no local PostgreSQL installation is needed.

```bash
pnpm install
cp .env.example .env
```

Generate a session secret with `openssl rand -base64 48` and set it as `SESSION_SECRET` in `.env`. Then initialize the database and start the app:

```bash
pnpm db:setup
pnpm start
```

The web app runs at [localhost:3300](http://localhost:3300), and the API at [localhost:8080](http://localhost:8080). During development, the frontend proxies `/api` requests to the API; leave `VITE_API_URL` empty to use this setup.

## AI assistant

Signed-in workshop staff and owners get an **Asistente** button. It answers two kinds of questions:

- **How Kilora works**, using retrieval (RAG) over the help articles in [`services/api/internal/assistant/knowledge`](services/api/internal/assistant/knowledge). The API embeds each section with OpenAI, stores the vectors in `assistant_knowledge_chunk`, and recalculates only sections that changed. To teach it something new, add or edit a Markdown file there and restart the API.
- **The user's own data** (orders, vehicles, quotes, customers, history), through read-only tools. Each tool becomes a `GET` on this same API with the user's session, so the assistant applies the same branch permissions and history projection as the app. It cannot see another workshop's prices or notes and cannot change anything.

Set `OPENAI_API_KEY` in `.env` to turn it on. Without it, the assistant replies with a 503 and the rest of the app still works.

### AI inside the workflows

Besides the chat, the same key enables AI helpers inside the forms. They follow one rule: **the AI drafts, a person confirms.** No AI endpoint writes data, and the model only sees what the user could already see.

- **Quote from a note.** In any quote editor, *Describir con IA* turns a typed or dictated note ("cambio de aceite 5W-30 con filtro, pastillas delanteras…") into quote items matched to the part catalog. Prices are filled only when the note states them.
- **Receipt to history.** Owners adding a manual service can tap *Escanear recibo* and photograph an old receipt or invoice. A vision model reads the date, mileage, workshop, line items and total into the form. The browser downsizes the photo, which also strips EXIF metadata, and the API never stores it.
- **Plain-language explanations.** Owners can tap *¿Qué me hicieron?* on any service to get a short, jargon-free explanation. Workshops get *Mensaje con IA*, an editable WhatsApp message that explains each quote line before sharing the link. The model only receives the projection the viewer already sees (`history.Project` for owners, without internal IDs), so internal costs and private notes never reach a prompt.
- **Suggested recommendations.** *Sugerir* on a vehicle's recommendations card proposes due maintenance. Deterministic rules in [`services/api/internal/maintenance`](services/api/internal/maintenance) decide what is due: the same reference intervals as the 3D parts map, applied to the history the workshop can see and the latest odometer reading. The model only writes the wording. Without a key, the suggestions still work with template text.
- **Resale report.** Owners can share *Reporte para venta*: a 30-day, read-only link (`/r/<token>`, printable to PDF) with the full history under a dedicated `history.ViewerReport` projection, which shows work, dates, mileage and workshops but no amounts or notes. When the link is created, the model writes a short summary of how complete and regular the history is. Creating a new link revokes the previous one, and only the token's hash is stored.

## Development reference

Kilora uses React and TanStack Start for the web app, Go for the API, and PostgreSQL for storage.

| Location | Contents |
| --- | --- |
| [`apps/web`](apps/web) | Web application. |
| [`services/api`](services/api) | API and business rules. |
| [`packages/contracts/openapi.yaml`](packages/contracts/openapi.yaml) | API contract. |
| [`db/migrations`](db/migrations) | Database migrations. |
| [`DECISIONS.md`](DECISIONS.md) | Product decisions and scope, in Spanish. |

| Command | Purpose |
| --- | --- |
| `pnpm start` | Start the database, API, and web app. |
| `pnpm build` | Build the web app. |
| `pnpm check` | Check frontend lint and formatting. |
| `pnpm api:test` | Run API tests. |
| `pnpm db:migrate` | Apply pending database migrations. |
| `pnpm db:seed` | Populate demo data. |
| `pnpm sqlc` | Regenerate database query code; requires sqlc. |

## Production configuration

Set `APP_ENV=production`, a generated `SESSION_SECRET` of at least 32 characters,
`DEMO_MODE=false`, `WEB_ORIGIN` to the exact public HTTPS origin (without a trailing
slash), and `RESEND_API_KEY` with a valid `EMAIL_FROM` on a verified sending domain.
The API refuses to start with missing mail credentials or unsafe production settings.
Development can still use the log mailer without credentials.

Set `TRUSTED_PROXY_CIDRS` to the comma-separated networks of the reverse proxies
that connect directly to the API. Keep the API private behind those proxies and
ensure the ingress appends or overwrites `X-Forwarded-For`. With no trusted proxies,
forwarded headers are ignored. Authentication rate limits are per API process;
use shared edge limits when running multiple replicas.
