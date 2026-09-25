"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex h-8.5 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
    >
      <LogOut className="size-4" />
      تسجيل الخروج
    </button>
  );
}
