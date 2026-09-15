import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        });

        if (!user?.active || !user.role) return null;
        const validPassword = await compare(parsed.data.password, user.passwordHash);
        if (!validPassword) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleKey: user.role.key,
          roleName: user.role.name,
          permissions: user.role.permissions.map(({ permission }) => permission.key),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id!;
        token.roleKey = user.roleKey;
        token.roleName = user.roleName;
        token.permissions = user.permissions;
      }
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
