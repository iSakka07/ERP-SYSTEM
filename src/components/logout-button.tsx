"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
    >
      <LogOut className="size-4" />
      تسجيل الخروج
    </button>
  );
}
