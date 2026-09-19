export { auth as proxy } from "@/auth";

export const config = {
  // Public brand assets are fetched by Next/Image and the PDF renderer without a user session.
  // Keep them outside the auth proxy; application routes and APIs remain protected.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2)$).*)"],
};
