# Kilora

**A vehicle’s service history should stay with its owner.**

Kilora helps vehicle owners in El Salvador keep their maintenance history, even when their workshop does not use Kilora. Owners can register their own vehicles and add services from receipt photos or by hand. Independent workshops can also manage customers, service orders, and quotes, and share completed services with owners.

AI tools help turn notes into quotes, receipts into service records, and technical work into clear explanations. Parts diagrams help users understand the work, and shareable resale reports make the history useful when selling a vehicle.

The app is in Spanish, with prices in USD. This repository is a portfolio project and working demo built with React, TanStack Start, Go, and PostgreSQL.

## Why Kilora

A vehicle’s history often lives in paper receipts, WhatsApp conversations, and separate workshop records. When an owner visits a different workshop, that context is hard to recover.

Kilora turns completed services into a lasting vehicle history. Owners can understand what was done and what they paid, while a linked workshop can see relevant maintenance details without accessing another workshop’s pricing or private notes.

## For workshops

- **Manage service orders.** Register vehicles, track work from intake to completion, and record jobs, parts, and mileage.
- **Prepare quotes before or during a service.** Create a counter quote without registering a vehicle, convert an accepted quote into an order, or prepare an estimate within an existing order. Share a read-only link through WhatsApp, record the customer’s verbal decision, and compare the quote with the final charge.
- **Reuse common quotes.** Save frequent jobs such as a 5,000 km service as quote templates with their items and prices, then pick *Usar plantilla* in any quote editor to copy them in and adjust. Templates are shared across the workshop; reception and admins manage them, and editing a template never changes quotes already made from it.
- **Keep customers updated.** Share a 30-day tracking link by WhatsApp that shows only the order status, a message from the workshop, and the estimated ready time. A new link replaces the old one, and staff can turn it off at any time.
- **Track the parts installed.** Record part brands alongside quote items and service work, preserving those details in the owner’s history.
- **Start before the owner signs up.** Create a provisional vehicle record, then invite its owner to connect it to their account.
- **Coordinate your team.** Give administrators, reception staff, and mechanics access according to their roles and assigned branches.
- **Publish a useful service record.** Marking an order ready adds a permanent snapshot to the vehicle’s history.

## For vehicle owners

- **Keep your history across workshops.** Find linked workshop services in one vehicle record.
- **Find a past service.** Search descriptions, parts, brands, workshops, and visible corrections, and combine date, workshop, and category filters across the complete vehicle history.
- **Understand your maintenance.** Review service dates, mileage, work performed, parts, and charges.
- **Plan the next service.** See upcoming maintenance dates and mileage based on recorded services, with adjustable intervals for each vehicle.
- **Choose email reminders.** Opt in per vehicle for maintenance digests and prompts to refresh an old mileage reading.
- **Resume unfinished entries.** Keep an unfinished service and its receipt as a draft in the same browser, with resume and discard controls.
- **Review possible duplicates.** Get a warning for an identical receipt or matching service date, workshop, and total before saving another entry.
- **Fill in the gaps.** Add services manually and record new odometer readings.
- **Keep a traceable record.** Corrections are added as dated entries, preserving the original history.
- **Share a resale report.** Create a read-only link valid for 30 days, with service dates, workshops, and mileage, and print it to PDF. Amounts and notes stay out of the report.

## Shared history, with clear boundaries

Kilora gives each person the information relevant to them:

| Who is viewing | What they can see |
| --- | --- |
| Vehicle owner | Their vehicle’s service history, including workshop names, charges, and public service notes. |
| Workshop that performed the service | Its own service records, including internal costs and private notes. |
| Another linked workshop | Maintenance context: work, parts, dates, and mileage. Other workshops’ identities, part brands and models, quantities, prices, and notes stay hidden. |
| Anyone with an owner-shared resale link | Service history with workshop names, work, dates, and mileage, without amounts or notes. Access expires after 30 days or when the owner replaces the link. |

Workshop internal costs and private notes remain private to that workshop, including when the owner views the service. These boundaries are enforced by the API through [`history.Project`](services/api/internal/history/history.go), before data reaches the browser or an AI prompt.

## How it works

1. **An owner creates an account and registers their vehicle**, without needing a workshop invitation.
2. **They save a service from any workshop**, using a receipt photo or entering the date and work performed. Mileage, total, workshop name, and item details are optional.
3. **They review the extracted data before saving.** A photo or uploaded JPG, PNG, WebP, or PDF can be attached to the service. Saving the service also saves its private receipt; owners can download it later.
4. **The history identifies who added each service** and stays available when the owner changes workshops.
5. **Participating workshops can contribute through their existing Kilora workflow**: complete an order, publish the service, and invite its owner to connect the vehicle. Owners can share a separate resale report when needed.

## Public pages

- `/` introduces the owner's maintenance history, receipt scanning and private documents, and resale report.
- `/talleres` introduces workshop customers, work orders, quotes, branches, and roles. Registration and sign-in links preserve the workshop setup intent.

Each page renders its own title, description, canonical URL, social metadata, audience-specific application data, and visible FAQs in server-rendered HTML. Both target Spanish-speaking users in El Salvador. The sitemap includes both pages, and robots rules allow `/talleres` while keeping `/taller` and its application routes excluded from crawling.

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

### Optional configuration

The core workflows and seeded demo run without external API keys. See [`.env.example`](.env.example) for the available settings.

| Setting | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enable the assistant and AI drafting tools described below. |
| `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_REASONING_EFFORT` | Configure generation, knowledge embeddings, and reasoning effort. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Send verification, password reset, and invitation emails. Without a Resend key, emails are written to the API logs for local development. |
| `DEMO_MODE` | Show public demo account access. The example environment enables it; disable it for a non-demo deployment. |
| `VITE_SITE_URL` | Set the public canonical URL used by search and social metadata. |

## AI assistant

Signed-in workshop staff and owners get an **Asistente** button. It answers two kinds of questions:

- **How Kilora works**, using retrieval (RAG) over the help articles in [`services/api/internal/assistant/knowledge`](services/api/internal/assistant/knowledge). The API embeds each section with OpenAI, stores the vectors in `assistant_knowledge_chunk`, and recalculates only sections that changed. To teach it something new, add or edit a Markdown file there and restart the API.
- **The user's own data** (orders, vehicles, quotes, customers, history), through read-only tools. Each tool becomes a `GET` on this same API with the user's session, so the assistant applies the same branch permissions and history projection as the app. It cannot see another workshop's prices or notes and cannot change anything.

Set `OPENAI_API_KEY` in `.env` to turn it on. Without it, the assistant replies with a 503 and the rest of the app still works.

### AI inside the workflows

Besides the chat, the same key enables AI helpers inside the forms. They follow one rule: **the AI drafts, a person confirms.** No AI endpoint writes data, and the model only sees what the user could already see.

- **Quote from a note.** In any quote editor, *Describir con IA* turns a typed or dictated note ("cambio de aceite 5W-30 con filtro, pastillas delanteras…") into quote items matched to the part catalog. Prices are filled only when the note states them.
- **Receipt to history.** Owners saving a service can take a photo or upload a JPG, PNG, WebP, or PDF (up to 4 MB). The model drafts the date, mileage, workshop, items, and total. The selected original stays attached even if AI reading fails, so owners can enter the details manually. The original is saved in PostgreSQL in the same transaction as the service, and can only be downloaded by its owner. Reading alone never creates a service or stores a permanent receipt on the server. The unfinished form and selected original can be kept in a local browser draft. For image extraction, the browser sends a smaller re-encoded copy without EXIF metadata to the model; PDFs are sent as files. Receipts are excluded from workshop views and public resale reports.
- **Plain-language explanations.** Owners can tap *¿Qué me hicieron?* on any service to get a short, jargon-free explanation. Workshops get *Mensaje con IA*, an editable WhatsApp message that explains each quote line before sharing the link. The model only receives the projection the viewer already sees (`history.Project` for owners, without internal IDs), so internal costs and private notes never reach a prompt.
- **Suggested recommendations.** *Sugerir* on a vehicle's recommendations card proposes due maintenance. Deterministic rules in [`services/api/internal/maintenance`](services/api/internal/maintenance) decide what is due using reference intervals, the history the workshop can see, and the latest odometer reading. The model only writes the wording. Without a key, the suggestions still work with template text.
- **Resale report.** Owners can share *Reporte para venta*: a 30-day, read-only link (`/r/<token>`, printable to PDF) with the full history under a dedicated `history.ViewerReport` projection, which shows work, dates, mileage and workshops but no amounts or notes. When the link is created, the model writes a short summary of how complete and regular the history is. Creating a new link revokes the previous one, and only the token's hash is stored.

## Service drafts and duplicate warnings

Owners entering a service get an automatic browser draft after a short pause,
including the selected original receipt. **Cerrar y conservar** flushes the latest
changes before closing. Reopening the form offers **Retomar borrador** and
**Descartar borrador**. Each draft belongs to one account and vehicle, and stays
in that browser; drafts do not sync between devices or appear in workshop or
public report views. They are removed after a successful save, explicit discard,
sign-out, password change through account settings, or account deletion. If browser
storage is unavailable or full, the form explains that a draft cannot be retained;
normal service saving remains available. Browser storage can also be cleared by
the user or browser. The draft does not become a service history record until the
owner chooses **Guardar servicio**.

The manual-service API checks for duplicates before writing: either the exact
receipt bytes already belong to a service for this vehicle, or its original date,
normalized workshop name, and total all match an existing owner-visible service.
Missing workshop or amount does not produce a details-only warning. Re-scanning
a paper receipt into different bytes can still match by its entered details, but
file recognition is not an image-similarity check. A warning returns up to five
matches and creates no service, odometer reading, receipt, or audit event.
**Volver y revisar** preserves the form; **Guardar de todos modos** explicitly
confirms the submitted entry. Concurrent normal saves are serialized by a vehicle
lock so they cannot silently bypass this check.

Apply migration `00018_receipt_content_hash.sql` using `pnpm db:migrate` before
running the updated API. It indexes a stored receipt fingerprint using
[PostgreSQL's built-in SHA-256 function](https://www.postgresql.org/docs/17/functions-binarystring.html).
The browser draft implementation waits for [IndexedDB transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
before reporting a draft as saved. Run `pnpm --filter web test:drafts` for storage,
restore, discard, account isolation, and queued-write regression checks; these
also run in CI.

## Owner history search

On each vehicle page, the service history has a **Buscar** field plus **Fecha**,
**Taller**, and **Categoría** filters. Search ignores case and accents, matches
all entered words across visible service details, and includes visible correction
text. Date ranges are inclusive and use the original service date. Workshop names
include services the owner entered manually from an external workshop. Categories
use recorded item categories when present and text inference for uncategorized
services. **Limpiar** resets all filters and returns to the first page.

The API applies the owner history projection before matching, then filters the
complete history before pagination. Internal workshop fields cannot influence a
match or its count. Workshop choices come from the complete visible history and
remain available when a filter returns no matches. The current implementation
reads that vehicle's complete history on the server; it does not download the full
history to the browser for filtering. No database migration is required.

## Owner maintenance plan and reminders

Each owner's vehicle page includes **Próximo mantenimiento**. The API computes it
from the complete owner-visible history, applying dated corrections before
selecting the latest service in each category. Categories without recorded work
show no invented due date. General reference intervals can be replaced per
vehicle with the owner's manufacturer or workshop interval, or restored later.
A zero or empty interval disables that limit; at least one of mileage or months
must remain enabled. When both are enabled, whichever comes first applies.
These are maintenance estimates, not diagnoses or manufacturer-specific schedules.

Email reminders are **off by default** and can be enabled or disabled on the same
card for each vehicle. **Mi cuenta → Correos y notificaciones** also includes a
saved account-wide switch: disabling it pauses all maintenance emails while
preserving each vehicle's selections. Re-enabling it permits only the previously
selected vehicles; verification and password recovery emails remain available.
Demo accounts always show this switch off and cannot opt in. Seeding and migration
`00017_disable_demo_email.sql` disable existing demo preferences. Both mail adapters
also discard every message addressed to `@demo.kilora.app`, including invitations
and authentication messages, regardless of any saved preference.
The API checks at startup and hourly while running. Only
verified owners of linked, active vehicles receive messages; seeded demo accounts
are excluded. Maintenance approaching 80% of its interval or overdue can trigger
a digest, at most once every seven days per vehicle. If only the mileage needs
updating (no reading, or a reading at least 30 days old), the limit is 30 days.
The email links back to the vehicle page to update mileage or disable reminders.
New services and interval changes are used on the next check.

The worker uses the existing Resend configuration (or the development log mailer),
PostgreSQL row locks to serialize delivery across replicas, and persisted delivery
timestamps. Failed sends remain eligible for the next hourly check. Resend retries
also use an [idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys),
which the provider retains for 24 hours; this does not promise exactly-once
email delivery across an arbitrarily long outage after a successful send but
before its database commit.

Apply migrations through `00018_receipt_content_hash.sql` with `pnpm db:migrate` before starting
the updated API. No additional cron service or AI API key is required.

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
| `pnpm check` | Check frontend lint, formatting, and TypeScript types. |
| `pnpm --filter web test:drafts` | Test browser service draft storage and lifecycle. |
| `pnpm api:vet` | Run Go static analysis. |
| `pnpm api:test` | Run API tests. |
| `pnpm api:test:db` | Run API tests with the local database, including integration tests. |
| `pnpm contracts:check` | Regenerate API types and check that the committed contract types are current. |
| `pnpm db:migrate` | Apply pending database migrations. |
| `pnpm db:seed` | Populate demo data. |
| `pnpm sqlc` | Regenerate database query code; requires sqlc. |

## Production configuration

Set `APP_ENV=production`, a generated `SESSION_SECRET` of at least 32 characters,
`DEMO_MODE=false`, `WEB_ORIGIN` to the exact public HTTPS origin (without a trailing
slash), and `RESEND_API_KEY` with a valid `EMAIL_FROM` on a verified sending domain.
The API refuses to start with missing mail credentials or unsafe production settings.
Development can still use the log mailer without credentials.

For a public demo with fictional data, set `DEMO_MODE=true` in the deployment
environment (Dokploy's Environment tab for `deploy/compose.prod.yaml`). Production
demo mode keeps HTTPS cookies and the other production checks. On API startup,
the container runs the existing seed before serving requests, creating the four
accounts listed above and their sample data. Repeated starts preserve existing
demo data; they do not reset it. The login displays three demo shortcuts; reception
can sign in using its email and password. Keep demo deployments separate from real
customer data. To restore the fictional dataset manually in Dokploy, run `seed --reset`
inside the API container; this deletes and recreates demo data. Automatic resets
and disabling external services are not configured by demo mode. Validate a public
demo with `SMOKE_DEMO=true ./scripts/production/smoke.py https://kilora.dev`.

Set `TRUSTED_PROXY_CIDRS` to the comma-separated networks of the reverse proxies
that connect directly to the API. Keep the API private behind those proxies and
ensure the ingress appends or overwrites `X-Forwarded-For`. With no trusted proxies,
forwarded headers are ignored. Authentication rate limits are per API process;
use shared edge limits when running multiple replicas.

For single-VPS Docker deployment, HTTPS routing, backup/restore and release checks,
see [the production runbook](docs/production.md).
