# Temporary remote preview

The user approved a public, temporary Cloudflare Quick Tunnel for mobile testing.
The local origin runs `next start` (production build), not the development server,
on `127.0.0.1:3090`. Cloudflared is a portable executable at
`D:/NEW/erp-preview-tools/cloudflared.exe`; it is not installed as a service.

The tunnel and server must both remain running. Closing them, shutting down the
computer or losing Internet access stops the preview. A restarted quick tunnel
usually has a different URL; update ignored `.env.production.local` AUTH_URL to
that exact new HTTPS origin and rebuild/restart before handing out the URL.

Admin's password was changed at the user's request. Other three default seeded
demo accounts were disabled for the public preview. Password/account changes now
revoke old sessions, and active session permissions are refreshed from the DB.
No plaintext password is stored in source or this document.

**Do not run `db:seed` while the public tunnel is open**: it resets demo passwords
and re-enables demo users. The API integration tests use the original seed login
and are intended only for the local demo before remote-preview hardening.

Verification passed through the actual HTTPS tunnel: unauthenticated redirect,
CSRF/login, current admin password, correct public callback origin, authenticated
incoming page and same-origin API validation. This is a temporary demo, not a
production hosting/security deployment.

To stop: identify the exact cloudflared process for this project's tunnel and the
Next start process for this project's port, and terminate only those processes.
Keep the new admin password; do not restore default passwords. Re-enable demo
accounts only with the user's direction and new passwords if the tunnel is open.
