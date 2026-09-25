"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, UserRound } from "lucide-react";

export function ProfileEditor({ name, email, hasAvatar }: { name: string; email: string; hasAvatar: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef("");
  const [displayName, setDisplayName] = useState(name);
  const [avatar, setAvatar] = useState(hasAvatar ? "/api/profile" : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function chooseFile(selected: File | null) {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 2 * 1024 * 1024) {
      setError("اختر صورة JPG أو PNG أو WebP بحجم لا يزيد عن 2 ميجابايت.");
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(selected);
    setPreview(previewRef.current);
    setFile(selected);
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.set("name", displayName);
      if (file) body.set("avatar", file);
      const response = await fetch("/api/profile", { method: "PATCH", body });
      const result = await response.json().catch(() => null) as { name?: string; avatarUrl?: string } | null;
      if (!response.ok || !result?.name) throw new Error("تعذر حفظ التعديلات. راجع الاسم والصورة ثم حاول مرة أخرى.");
      setDisplayName(result.name);
      if (result.avatarUrl) setAvatar(result.avatarUrl);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = "";
      setPreview("");
      setFile(null);
      setMessage("تم حفظ الملف الشخصي.");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حفظ التعديلات."); }
    finally { setBusy(false); }
  }

  return <section dir="rtl" className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h1 className="text-xl font-black text-slate-950">تعديل الملف الشخصي</h1>
    <p className="mt-1 text-sm text-slate-500">يمكنك تغيير الاسم الظاهر والصورة. البريد الإلكتروني واسم الدخول لا يتغيران من هنا.</p>
    <form onSubmit={save} className="mt-6 space-y-5">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="اختيار الصورة الشخصية" className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-white ring-4 ring-blue-50">
          {preview || avatar ? <Image src={preview || avatar} alt="الصورة الشخصية" fill unoptimized className="object-cover" /> : <UserRound className="size-8" />}
          <Camera className="absolute bottom-0 right-0 size-6 rounded-full bg-slate-900 p-1" />
        </button>
        <div><p className="text-sm font-bold">الصورة الشخصية</p><p className="mt-1 text-xs text-slate-500">JPG أو PNG أو WebP، بحد أقصى 2 ميجابايت.</p><button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-xs font-bold text-blue-700">اختيار صورة</button></div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
      </div>
      <label className="grid gap-2 text-sm font-bold text-slate-700">الاسم الظاهر<input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="erp-control" /></label>
      <label className="grid gap-2 text-sm font-bold text-slate-700">البريد الإلكتروني<input value={email} readOnly disabled className="erp-control opacity-70" /></label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white disabled:opacity-60">{busy && <LoaderCircle className="size-4 animate-spin" />}{busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}</button>
    </form>
  </section>;
}
