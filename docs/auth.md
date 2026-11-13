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

## Account settings

Owners can open **Mi cuenta** from the user menu at
`/mis-vehiculos/cuenta`. Workshop users can reach the same page from their user
menu. `PATCH /api/v1/auth/me` updates the full name and optional phone; the
verified email remains read-only. Names and phones use the same validation as
registration and customer profiles. Profile changes refresh the account menu.

`POST /api/v1/auth/change-password` requires `current_password` and a new
`password` of at least eight characters. It revokes all sessions and outstanding
auth tokens, including password recovery links, and returns the user to login.
Credential operations are limited to ten attempts per account per 15 minutes.
Demo accounts cannot update their profile, change passwords, or delete themselves.

`DELETE /api/v1/auth/me` requires `current_password`, with a separate confirmation
screen in the UI. Accounts with workshop memberships must resolve those
memberships before deletion. Deletion anonymizes the user row (name, email,
phone, password and verification), revokes sessions and auth tokens, and unlinks
owned vehicles. Archived vehicles remain archived. Shared reports stop resolving
because their creator no longer owns the vehicle. The user's old email can be
registered again, without restoring the old account or its vehicles.

The anonymous user ID and existing service history, corrections and audit
records remain to preserve the append-only service record and foreign keys.
This does not erase workshop customer records or personal information previously
entered into service descriptions. All account mutations create an audit event
in the same database transaction.
