import { auth } from "@/auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { assertSecureRuntimeConfig, hasTrustedRequestHost } from "@/lib/runtime-config";

const withAuth = auth((request: NextAuthRequest, event: NextFetchEvent) => {
  void request;
  void event;
  return NextResponse.next();
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  assertSecureRuntimeConfig();
  if (!hasTrustedRequestHost(request.headers)) {
    return NextResponse.json({ error: "UNTRUSTED_HOST" }, { status: 421 });
  }
  return withAuth(request, event);
}

export const config = {
  // Public brand assets are fetched by Next/Image and the PDF renderer without a user session.
  // Keep them outside the auth proxy; application routes, APIs, and Auth.js
  // endpoints are checked for a trusted public host.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2)$).*)"],
};
