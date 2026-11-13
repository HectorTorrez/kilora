# Email verification

Registration creates an unverified account and sends a confirmation email. It does
not create a session. The web app shows a “Revisá tu correo” confirmation instead
of entering the app.

The email points to `/verificar?token=...`. The user confirms with the “Verificar
correo” button, then signs in with their password. Verification links expire after
24 hours, can only be consumed once, and are stored as hashes in the database.
Login returns HTTP 403 for a correct password on an unverified account. Existing
sessions for unverified accounts also lose access. Password reset does not verify
an email address.

Users can open `/verificar` without a token to request another email. The login,
registration and invalid-link screens link to this page. The API endpoint is
`POST /api/v1/auth/resend-verification` with an `email` field. It returns the same
204 response for unknown, already verified and unverified accounts. Delivery is
limited to three requests per email per 15 minutes, and ten requests per IP in
that period. These limits are held in memory per API instance.

If initial delivery fails, registration returns 503 with an explanation that the
account exists and another verification email can be requested. The account stays
unverified. Resend failures are logged and keep the generic response.

## Email configuration

Set `RESEND_API_KEY`, `EMAIL_FROM` on a verified sending domain, and `WEB_ORIGIN`
to the public web origin for real delivery. Production configuration already
requires these values. In development without a Resend key, the API logs the email
and confirmation link instead of delivering it. Demo seed accounts are already
verified.

Existing unverified users must confirm their address through the resend flow.
No migration or automatic verification of existing accounts is performed.

## Validation

The API integration suite covers registration without a session, blocked login
and protected routes, legacy sessions, successful confirmation and login, reused
and expired tokens, token purpose checks, resend limits and email normalization,
password reset before verification, and recovery after email delivery failure.
Run it against a migrated test database:

```sh
cd services/api
TEST_DATABASE_URL=postgres://kilora:kilora@localhost:5432/kilora?sslmode=disable go test ./...
```
