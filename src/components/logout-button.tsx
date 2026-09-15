"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
    >
      <LogOut className="size-4" />
      تسجيل الخروج
    </button>
  );
}
