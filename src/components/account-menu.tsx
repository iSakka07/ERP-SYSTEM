"use client";
/* eslint-disable @next/next/no-img-element -- User images are served from the authenticated profile endpoint. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, LoaderCircle, LogOut, UserRound, X } from "lucide-react";
import { signOut } from "next-auth/react";

type AccountMenuProps = { name: string; email: string; hasAvatar: boolean };

export function AccountMenu({ name, email, hasAvatar }: AccountMenuProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(name);
  const [draftName, setDraftName] = useState(name);
  const [avatarUrl, setAvatarUrl] = useState(hasAvatar ? "/api/profile" : "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initials = displayName.trim().charAt(0) || "م";

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function closeEditor() {
    setEditing(false); setError(""); setDraftName(displayName); setAvatarFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  }
  function chooseAvatar(file: File | null) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("اختر صورة JPG أو PNG أو WebP بحجم لا يزيد عن 2 ميجابايت."); return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAvatarFile(file); setPreviewUrl(URL.createObjectURL(file)); setError("");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("name", draftName); if (avatarFile) body.set("avatar", avatarFile);
      const response = await fetch("/api/profile", { method: "PATCH", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "INVALID_AVATAR" ? "تعذر حفظ الصورة. تأكد من النوع والحجم." : "تعذر حفظ التعديلات.");
      setDisplayName(result.name); if (result.avatarUrl) setAvatarUrl(result.avatarUrl);
      closeEditor(); setOpen(false); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حفظ التعديلات."); }
    finally { setBusy(false); }
  }
  const avatar = previewUrl || avatarUrl;
  return <div ref={rootRef} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex h-10 items-center gap-1 rounded-full px-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="فتح قائمة الحساب" aria-expanded={open} aria-haspopup="menu">
      <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-blue-600 text-xs font-extrabold text-white">{avatar ? <img src={avatar} alt="الصورة الشخصية" className="size-full object-cover" /> : initials}</span>
      <ChevronDown className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div className="absolute left-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-right text-slate-900 shadow-xl" role="menu">
      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3"><span className="grid size-10 place-items-center overflow-hidden rounded-full bg-blue-600 font-black text-white">{avatarUrl ? <img src={avatarUrl} alt="الصورة الشخصية" className="size-full object-cover" /> : initials}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{displayName}</b><small className="block truncate text-xs text-slate-500">{email}</small></div></div>
      <button type="button" role="menuitem" onClick={() => { setEditing(true); setOpen(false); }} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:bg-slate-50"><UserRound className="size-4 text-blue-700" />تعديل الملف الشخصي</button>
      <button type="button" role="menuitem" onClick={() => signOut({ callbackUrl: "/login" })} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-50"><LogOut className="size-4" />تسجيل الخروج</button>
    </div>}
    {editing && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" className="w-full max-w-md rounded-2xl bg-white p-5 text-right shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="profile-dialog-title" className="text-lg font-black text-slate-950">الملف الشخصي</h2><p className="mt-1 text-sm text-slate-500">يمكنك تعديل الاسم والصورة فقط.</p></div><button type="button" onClick={closeEditor} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X className="size-5" /></button></div><form onSubmit={save} className="mt-5 space-y-4"><div className="flex items-center gap-4"><button type="button" onClick={() => fileRef.current?.click()} className="relative grid size-20 place-items-center overflow-hidden rounded-full bg-blue-600 text-xl font-black text-white ring-4 ring-blue-50">{avatar ? <img src={avatar} alt="معاينة الصورة الشخصية" className="size-full object-cover" /> : initials}<span className="absolute bottom-0 right-0 grid size-7 place-items-center rounded-full bg-slate-900 text-white"><Camera className="size-3.5" /></span></button><div><b className="text-sm">الصورة الشخصية</b><p className="mt-1 text-xs text-slate-500">JPG أو PNG أو WebP، بحد أقصى 2 ميجابايت.</p><button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-xs font-bold text-blue-700">اختيار صورة</button></div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseAvatar(event.target.files?.[0] || null)} /></div><label className="grid gap-2 text-sm font-bold">الاسم الظاهر<input required minLength={2} maxLength={80} value={draftName} onChange={(event) => setDraftName(event.target.value)} className="erp-control" /></label>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={closeEditor} className="erp-back-tab">إلغاء</button><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-60">{busy && <LoaderCircle className="size-4 animate-spin" />}{busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}</button></div></form></section></div>}
  </div>;
}
