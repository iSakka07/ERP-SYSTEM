import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        name: session.user.name ?? "مستخدم النظام",
        email: session.user.email ?? "",
        roleName: session.user.roleName,
        permissions: session.user.permissions,
      }}
    >
      {children}
    </AppShell>
  );
}
