# SEC: Auth.js trusted-host and reverse-proxy closure

## Decision

`AUTH_URL` is the sole canonical public origin. In production it is mandatory,
must be an HTTPS origin, and may not contain a path, query, hash, or embedded
credentials. The application no longer derives a trusted public origin from a
request's `Host` or `X-Forwarded-Host` headers.

`trustHost: true` remains necessary for Auth.js behind the HTTPS reverse proxy,
but it is no longer an unconditional trust boundary: `src/proxy.ts` runs before
Auth.js and returns HTTP 421 unless both `Host` and any supplied
`X-Forwarded-Host` values exactly equal the host in `AUTH_URL`.

## Required reverse-proxy configuration

The proxy must preserve the canonical external host and overwrite forwarded
headers; it must not pass client-provided values through to Next.js.

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Terminate TLS at the proxy and do not expose the internal Next.js listener to
the public internet. Requests reaching the application must use the public
domain configured in `AUTH_URL`.

## Acceptance evidence

`pnpm test:isolated-api` with `ERP_TEST_ONLY=test:host-origin-acceptance`
starts Next.js over internal HTTP while declaring a separate HTTPS public
origin. It proves that:

1. Auth.js emits Secure cookies and retains a valid session behind HTTPS proxy
   headers.
2. Auth.js redirects remain within the configured public origin.
3. forged `Host`, forged `X-Forwarded-Host`, and mismatched combinations are
   rejected with HTTP 421 before Auth.js.
4. a foreign browser `Origin` remains rejected for a state-changing API call,
   even when the canonical host headers are present.
