import { auth } from "@/auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { assertSecureRuntimeConfig, hasTrustedRequestHost } from "@/lib/runtime-config";

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestId(request: NextRequest) {
  const supplied = request.headers.get("x-request-id");
  return supplied && requestIdPattern.test(supplied) ? supplied : crypto.randomUUID();
}

function continueRequest(request: NextRequest) {
  const id = requestId(request);
  const headers = new Headers(request.headers);
  headers.set("x-request-id", id);
  return NextResponse.next({ request: { headers }, headers: { "x-request-id": id } });
}

const withAuth = auth((request: NextAuthRequest, event: NextFetchEvent) => {
  void event;
  return continueRequest(request as NextRequest);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  assertSecureRuntimeConfig();

  // Railway probes the container over its private network with an internal
  // Host header. The health endpoint exposes no user data and must remain
  // reachable before the public-domain host check can succeed.
  if (request.nextUrl.pathname === "/api/health") {
    return continueRequest(request);
  }

  if (!hasTrustedRequestHost(request.headers)) {
    const id = requestId(request);
    return NextResponse.json(
      { error: "UNTRUSTED_HOST", requestId: id },
      { status: 421, headers: { "x-request-id": id } },
    );
  }
  return withAuth(request, event);
}

export const config = {
  // Public brand assets are fetched by Next/Image and the PDF renderer without a user session.
  // Keep them outside the auth proxy; application routes, APIs, and Auth.js
  // endpoints are checked for a trusted public host.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2)$).*)"],
};
