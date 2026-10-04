import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clearLoginFailures, loginIsBlocked, recordLoginFailure } from "@/lib/login-rate-limit";
import { assertSecureRuntimeConfig, getConfiguredPublicOrigin } from "@/lib/runtime-config";
import { applyPermissionOverrides } from "@/lib/access-control";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js requires this behind a reverse proxy. proxy.ts verifies Host and
  // X-Forwarded-Host against AUTH_URL before any request reaches Auth.js.
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

        const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
        const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
        let user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { role: { include: { permissions: { include: { permission: true } } } }, permissionOverrides: { include: { permission: true } } },
        });

        if (!user && parsed.data.email === bootstrapEmail && bootstrapPassword && parsed.data.password === bootstrapPassword && bootstrapPassword.length >= 12) {
          let role = await prisma.role.findUnique({ where: { key: "admin" } });
          if (!role) {
            role = await prisma.role.create({ data: { key: "admin", name: "مدير النظام" } });
            const permissions = await prisma.permission.findMany({ select: { id: true } });
            if (permissions.length) await prisma.rolePermission.createMany({ data: permissions.map(({ id }) => ({ roleId: role!.id, permissionId: id })) });
          }
          if (role) {
            const passwordHash = await hash(bootstrapPassword, 12);
            const created = await prisma.user.create({ data: { name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "مدير النظام", email: parsed.data.email, passwordHash, roleId: role.id, active: true } });
            user = await prisma.user.findUnique({ where: { id: created.id }, include: { role: { include: { permissions: { include: { permission: true } } } }, permissionOverrides: { include: { permission: true } } } });
          }
        }
        if (user && (!user.role || !user.active) && parsed.data.email === bootstrapEmail && bootstrapPassword && parsed.data.password === bootstrapPassword && bootstrapPassword.length >= 12) {
          let role = await prisma.role.findUnique({ where: { key: "admin" } });
          if (!role) role = await prisma.role.create({ data: { key: "admin", name: "مدير النظام" } });
          const passwordHash = await hash(bootstrapPassword, 12);
          await prisma.user.update({ where: { id: user.id }, data: { roleId: role.id, passwordHash, active: true } });
          user = await prisma.user.findUnique({ where: { id: user.id }, include: { role: { include: { permissions: { include: { permission: true } } } }, permissionOverrides: { include: { permission: true } } } });
        }
        if (!user?.active || !user.role) { recordLoginFailure(parsed.data.email, ip); return null; }
        let validPassword = await compare(parsed.data.password, user.passwordHash);
        // Allow a one-time production bootstrap password to repair an existing
        // administrator account whose hash predates the current deployment.
        if (!validPassword && parsed.data.email === bootstrapEmail && bootstrapPassword && parsed.data.password === bootstrapPassword && bootstrapPassword.length >= 12) {
          const passwordHash = await hash(bootstrapPassword, 12);
          await prisma.user.update({ where: { id: user.id }, data: { passwordHash, active: true } });
          validPassword = true;
        }
        if (!validPassword) { recordLoginFailure(parsed.data.email, ip); return null; }
        clearLoginFailures(parsed.data.email);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleKey: user.role.key,
          roleName: user.role.name,
          permissions: user.role.key === "admin" ? user.role.permissions.map(({ permission }) => permission.key) : applyPermissionOverrides(user.role.permissions.map(({ permission }) => permission.key), user.permissionOverrides),
          sessionVersion: String(user.sessionVersion),
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
      // Password changes, role changes, and disabled accounts revoke existing encrypted sessions.
      const current = await prisma.user.findUnique({
        where: { id: String(token.userId ?? "") },
        select: {
          name: true,
          email: true,
          active: true,
          sessionVersion: true,
          role: { include: { permissions: { include: { permission: true } } } },
          permissionOverrides: { include: { permission: true } },
        },
      });
      if (!current?.active || !current.role || token.sessionVersion !== String(current.sessionVersion)) return null;
      token.name = current.name;
      token.email = current.email;
      token.roleKey = current.role.key;
      token.roleName = current.role.name;
      token.permissions = current.role.key === "admin" ? current.role.permissions.map(p => p.permission.key) : applyPermissionOverrides(current.role.permissions.map(p => p.permission.key), current.permissionOverrides);
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.userId ?? "");
      session.user.name = token.name;
      session.user.email = token.email ?? "";
      session.user.roleKey = String(token.roleKey ?? "");
      session.user.roleName = String(token.roleName ?? "");
      session.user.permissions = Array.isArray(token.permissions) ? token.permissions.map(String) : [];
      return session;
    },
    authorized({ auth: session, request }) {
      const isLoggedIn = Boolean(session?.user);
      const isLoginPage = request.nextUrl.pathname === "/login";

      if (request.nextUrl.pathname === "/api/health") return true;
      if (request.nextUrl.pathname.startsWith("/api/auth")) return true;

      if (request.nextUrl.pathname.startsWith("/api/") && !isLoggedIn) {
        return new Response(JSON.stringify({ error: "يجب تسجيل الدخول أولًا.", code: "UNAUTHORIZED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (isLoginPage) {
        const publicOrigin = getConfiguredPublicOrigin();
        return isLoggedIn ? Response.redirect(new URL("/", publicOrigin ?? request.nextUrl)) : true;
      }

      return isLoggedIn;
    },
  },
});
