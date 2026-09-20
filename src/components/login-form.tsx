"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LogIn, Mail, LockKeyhole } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      email: data.get("email"),
      password: data.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-bold text-slate-700">البريد الإلكتروني</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input id="email" name="email" type="email" autoComplete="email" required className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pr-11 pl-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-bold text-slate-700">كلمة المرور</label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pr-11 pl-11 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute left-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">{error}</p>}
      <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-extrabold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70">
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
      </button>
    </form>
  );
}
