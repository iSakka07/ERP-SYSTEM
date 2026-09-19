import "server-only";

/**
 * Mutation requests may originate from the current host or the configured
 * public host behind a trusted reverse proxy. A missing Origin is allowed for
 * server-side clients and the isolated acceptance suite.
 */
export function isTrustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get("host");
    const configuredHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).host : null;
    return originHost === requestHost || originHost === configuredHost;
  } catch {
    return false;
  }
}
