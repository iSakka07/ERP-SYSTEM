import "server-only";
import { NextResponse } from "next/server";

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

export function assertMutation(request: Request): NextResponse | null {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") || "";
  const method = request.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (contentType) {
      const validTypes = ["application/json", "multipart/form-data", "application/x-www-form-urlencoded"];
      const isValid = validTypes.some((type) => contentType.toLowerCase().startsWith(type));
      if (!isValid) {
        return NextResponse.json({ error: "INVALID_CONTENT_TYPE" }, { status: 403 });
      }
    }
  }
  return null;
}

