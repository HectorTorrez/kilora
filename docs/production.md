# VPS deployment

This setup runs on one VPS. No VPS or domain has been provisioned yet; live
certificate issuance, email delivery and customer workflow checks remain pending.

## Server and credentials

Install Docker Engine with the Compose plugin, Git and Python 3. Point the domain
A record at the VPS (add AAAA only if IPv6 works). Allow SSH and TCP 80/443 in the
provider firewall, optionally UDP 443. Only Caddy publishes ports. PostgreSQL, the
API and frontend stay private.

Clone the repository and check out the reviewed release commit. Then:

```bash
cp deploy/production.env.example .env.production
chmod 600 .env.production
openssl rand -hex 32
openssl rand -base64 48
```

Fill DOMAIN (hostname only), POSTGRES_PASSWORD (hex output), SESSION_SECRET (base64
output), RESEND_API_KEY, EMAIL_FROM, optional OPENAI_API_KEY and RELEASE_TAG (the
release commit SHA). Verify the sending domain with Resend before launch. Never
commit this file. Use hex for the database password because it appears in a URL.

The production file is independent of local compose.yaml. Its network is
172.29.77.0/24; if that subnet conflicts with the VPS, change both the subnet and
the trusted Caddy IP. Run one API replica: auth limits are in memory. Multiple
replicas require a shared edge limiter first.

## First deployment

```bash
./scripts/production/compose.sh config --quiet
./scripts/production/compose.sh build
./scripts/production/compose.sh up -d --wait
./scripts/production/compose.sh ps
./scripts/production/smoke.py https://your-domain.example
```

Compose waits for a healthy database, successful migrations and healthy API and
frontend before starting Caddy. Caddy manages certificates and HTTP-to-HTTPS
redirects; its persistent volumes preserve certificates. Routes /api/* and
/healthz go to Go, the rest to the frontend. SSE is streamed and the proxy supplies
trusted client IP headers. Server-rendered requests use the internal API URL.
Review the trust chain before adding a CDN.

Set SMOKE_EMAIL and SMOKE_PASSWORD in the shell environment for a dedicated test
account, then rerun the smoke script to check Secure, HttpOnly and SameSite=Lax
cookies and login/logout. Avoid putting credentials in shell history. The script
does not create customer records or send email.

Before launch, manually test signup and verification, password recovery, workshop
→ vehicle → quote → completed order → owner invitation → owner history, and public
quote/report links. Check mobile use and AI streaming with the real key. Confirm a
second workshop cannot see private prices or notes.

## Backups and restore drills

```bash
./scripts/production/backup.sh /srv/kilora-backups
./scripts/production/verify-backup.sh /srv/kilora-backups/<backup>.dump
```

Backup writes a restricted custom-format dump and checks its archive structure.
Verification restores into a unique disposable database, checks the migration and
history tables, then deletes that database. It never overwrites live data. Leave
enough disk space for a second database.

Schedule daily backup on the VPS and copy encrypted backups to a separate provider
or machine. A backup on the same VPS does not protect against VPS loss. Set retention
and test a downloaded off-server copy before launch, then repeat restore drills.
Keep the encryption key outside the VPS. Arrange alerts for backup failure and an
external monitor for HTTPS /healthz and application errors. Container logs rotate
to bound disk use.

To recover after server loss, prepare a replacement, restore its secrets, start
only db, restore the chosen dump into a new empty database using pg_restore with
--exit-on-error --no-owner --no-acl, and deploy the matching release. Check restored
data, smoke tests and customer workflows before changing DNS. Never restore into
a database that is serving requests.

## Updates and rollback

Record the old RELEASE_TAG, take a backup and verify it before every update. Build
new images before stopping traffic. Keep old images and backups until validation.
After checking out the new release and setting its RELEASE_TAG:

```bash
./scripts/production/compose.sh build
./scripts/production/backup.sh /srv/kilora-backups
./scripts/production/compose.sh stop caddy web api
./scripts/production/compose.sh run --rm migrate
./scripts/production/compose.sh up -d --wait
./scripts/production/smoke.py https://your-domain.example
```

For application rollback, restore the previous RELEASE_TAG and start its images
without building. Review schema compatibility first: old application images do not
undo migrations. Do not automatically run down migrations. If the old app cannot
use the schema, keep traffic stopped and restore the verified pre-release backup
into a new database. This loses writes since the backup; preserve the current
database before recovery.

Official references: [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
and [Compose dependencies](https://docs.docker.com/reference/compose-file/services/#depends_on).
