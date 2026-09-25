import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  const profile = await prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarMime: true } });

  return (
    <AppShell
      user={{
        name: session.user.name ?? "مستخدم النظام",
        email: session.user.email ?? "",
        roleKey: session.user.roleKey,
        roleName: session.user.roleName,
        permissions: session.user.permissions,
        hasAvatar: Boolean(profile?.avatarMime),
      }}
    >
      {children}
    </AppShell>
  );
}
