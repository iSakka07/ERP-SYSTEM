import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clearLoginFailures, loginIsBlocked, recordLoginFailure } from "@/lib/login-rate-limit";
import { assertSecureRuntimeConfig } from "@/lib/runtime-config";
import { applyPermissionOverrides } from "@/lib/access-control";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required for the explicitly approved HTTPS preview behind Cloudflare.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials, request) {
        assertSecureRuntimeConfig();
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
        if (loginIsBlocked(parsed.data.email, ip)) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { role: { include: { permissions: { include: { permission: true } } } }, permissionOverrides: { include: { permission: true } } },
        });

        if (!user?.active || !user.role) { recordLoginFailure(parsed.data.email, ip); return null; }
        const validPassword = await compare(parsed.data.password, user.passwordHash);
        if (!validPassword) { recordLoginFailure(parsed.data.email, ip); return null; }
        clearLoginFailures(parsed.data.email);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleKey: user.role.key,
          roleName: user.role.name,
          permissions: user.role.key === "admin" ? user.role.permissions.map(({ permission }) => permission.key) : applyPermissionOverrides(user.role.permissions.map(({ permission }) => permission.key), user.permissionOverrides),
          sessionVersion: user.updatedAt.toISOString(),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id!;
        token.roleKey = user.roleKey;
        token.roleName = user.roleName;
        token.permissions = user.permissions;
        token.sessionVersion = user.sessionVersion;
      }
      // Password changes and disabled accounts revoke existing encrypted sessions.
      const current = await prisma.user.findUnique({
        where: { id: String(token.userId ?? "") },
        include: { role: { include: { permissions: { include: { permission: true } } } }, permissionOverrides: { include: { permission: true } } },
      });
      if (!current?.active || !current.role || token.sessionVersion !== current.updatedAt.toISOString()) return null;
      token.roleKey = current.role.key;
      token.roleName = current.role.name;
      token.permissions = current.role.key === "admin" ? current.role.permissions.map(p => p.permission.key) : applyPermissionOverrides(current.role.permissions.map(p => p.permission.key), current.permissionOverrides);
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.userId ?? "");
      session.user.roleKey = String(token.roleKey ?? "");
      session.user.roleName = String(token.roleName ?? "");
      session.user.permissions = Array.isArray(token.permissions) ? token.permissions.map(String) : [];
      return session;
    },
    authorized({ auth: session, request }) {
      const isLoggedIn = Boolean(session?.user);
      const isLoginPage = request.nextUrl.pathname === "/login";

      if (request.nextUrl.pathname.startsWith("/api/") && !isLoggedIn) {
        return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (isLoginPage) {
        return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }

      return isLoggedIn;
    },
  },
});
