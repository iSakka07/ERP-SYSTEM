import "server-only";
import type { NextResponse } from "next/server";
import { getConfiguredPublicOrigin } from "@/lib/runtime-config";
import { apiError } from "@/lib/api-error";

/**
 * Browser mutations must come from the configured public origin. We do not
 * compare Origin with Host because Host is supplied by the requester and may
 * be spoofed before the reverse proxy. A missing Origin remains supported for
 * non-browser server-to-server clients.
 */
export function isTrustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const configuredOrigin = getConfiguredPublicOrigin();
    return Boolean(configuredOrigin && new URL(origin).origin === configuredOrigin.origin);
  } catch {
    return false;
  }
}

export function assertMutation(request: Request): NextResponse | null {
  if (!isTrustedMutationOrigin(request)) {
    return apiError("INVALID_ORIGIN", 403);
  }
  const contentType = request.headers.get("content-type") || "";
  const method = request.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (contentType) {
      const validTypes = ["application/json", "multipart/form-data", "application/x-www-form-urlencoded"];
      const isValid = validTypes.some((type) => contentType.toLowerCase().startsWith(type));
      if (!isValid) {
        return apiError("INVALID_CONTENT_TYPE", 403);
      }
    }
  }
  return null;
}
