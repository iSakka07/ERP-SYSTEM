"use client";
import { ERPSelect } from "@/components/erp-select";

import { FormEvent, useMemo, useState } from "react";
import { Check, KeyRound, LoaderCircle, Plus, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";

type Role = { id: string; key: string; name: string; permissions: { permissionId: string }[] };
type Permission = { id: string; key: string; name: string; module: string };
type User = { id: string; name: string; email: string; active: boolean; roleId: string | null; role: { id: string; name: string; key: string } | null };

const moduleNames: Record<string, string> = {
  dashboard: "لوحة الإدارة", incoming: "الوارد", expenses: "مستخلصات المقاولين", purchases: "المشتريات",
  pettycash: "Petty Cash", salaries: "المرتبات", treasury: "الخزنة", accounts: "الحسابات والصلاحيات",
};

export function AccountsManager({ users, roles, permissions, currentUserId }: { users: User[]; roles: Role[]; permissions: Permission[]; currentUserId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "permissions">("users");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState(roles.find((role) => role.key === "accountant")?.id ?? roles[0]?.id);
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const adminOnlyPermissionId = permissions.find((permission) => permission.key === "accounts.manage")?.id;
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(selectedRole?.permissions.map((item) => item.permissionId).filter((id) => selectedRole.key === "admin" || id !== adminOnlyPermissionId) ?? []);
  const grouped = useMemo(() => Object.entries(Object.groupBy(permissions, (permission) => permission.module)), [permissions]);

  async function request(method: "POST" | "PATCH", body: object, key: string) {
    setBusy(key); setMessage("");
    const response = await fetch("/api/admin/accounts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(result.error === "EMAIL_EXISTS" ? "البريد الإلكتروني مستخدم بالفعل." : "تعذر حفظ التغيير."); return false; }
    setMessage("تم حفظ التغيير بنجاح."); router.refresh(); return true;
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (await request("POST", data, "create")) form.reset();
  }

  function chooseRole(role: Role) {
    setSelectedRoleId(role.id);
    setSelectedPermissions(role.permissions.map((item) => item.permissionId).filter((id) => role.key === "admin" || id !== adminOnlyPermissionId));
    setMessage("");
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold text-blue-700">إعدادات مدير النظام</p><h1 className="mt-1 text-2xl font-black text-slate-950">إدارة الحسابات والصلاحيات</h1><p className="mt-2 text-sm text-slate-500">تحكم في المستخدمين وما يمكن لكل دور رؤيته أو تعديله.</p></div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={() => setTab("users")} className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold ${tab === "users" ? "bg-blue-600 text-white" : "text-slate-600"}`}><UsersRound className="size-4" />الحسابات</button>
          <button onClick={() => setTab("permissions")} className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold ${tab === "permissions" ? "bg-blue-600 text-white" : "text-slate-600"}`}><ShieldCheck className="size-4" />الصلاحيات</button>
        </div>
      </section>

      {message && <p className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.includes("بنجاح") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}

      {tab === "users" ? <>
        <form onSubmit={createUser} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 ">
          <div><label className="mb-1.5 block text-xs font-bold text-slate-600">اسم المستخدم</label><input name="name" required minLength={2} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" placeholder="الاسم بالكامل" /></div>
          <div><label className="mb-1.5 block text-xs font-bold text-slate-600">البريد الإلكتروني</label><input name="email" required type="email" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" placeholder="name@company.com" /></div>
          <div><label className="mb-1.5 block text-xs font-bold text-slate-600">كلمة المرور</label><input name="password" required minLength={8} type="password" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" placeholder="8 أحرف على الأقل" /></div>
          <div><label className="mb-1.5 block text-xs font-bold text-slate-600">الدور</label><ERPSelect name="roleId" required defaultValue={roles.find((role) => role.key === "accountant")?.id} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</ERPSelect></div>
          <button disabled={busy === "create"} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busy === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}إضافة حساب</button>
        </form>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-extrabold text-slate-900">حسابات النظام</h2><p className="mt-1 text-xs text-slate-500">{users.length} حسابات مسجلة</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">المستخدم</th><th className="px-5 py-3">الدور</th><th className="px-5 py-3">الحالة</th><th className="px-5 py-3">التحكم</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id}><td className="px-5 py-4"><p className="font-bold text-slate-900">{user.name}</p><p className="mt-1 text-xs text-slate-400">{user.email}</p></td><td className="px-5 py-4"><ERPSelect disabled={user.id === currentUserId || busy === user.id} value={user.roleId ?? ""} onValueChange={(event) => request("PATCH", { type: "user-role", userId: user.id, roleId: event }, user.id)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold disabled:bg-slate-50">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</ERPSelect></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.active ? "نشط" : "موقوف"}</span></td><td className="px-5 py-4"><button disabled={user.id === currentUserId || busy === user.id} onClick={() => request("PATCH", { type: "user-active", userId: user.id, active: !user.active }, user.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{user.active ? "إيقاف الحساب" : "تفعيل الحساب"}</button></td></tr>)}</tbody></table></div>
        </div>
      </> : <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><p className="px-3 py-2 text-xs font-bold text-slate-500">اختر الدور</p>{roles.map((role) => <button key={role.id} onClick={() => chooseRole(role)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-bold ${selectedRoleId === role.id ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-600 hover:bg-slate-50"}`}><UserRoundCog className="size-4" />{role.name}{role.key === "admin" && <KeyRound className="mr-auto size-3.5" />}</button>)}</aside>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><div><h2 className="font-extrabold text-slate-900">صلاحيات {selectedRole?.name}</h2><p className="mt-1 text-xs text-slate-500">حدد ما يمكن لهذا الدور رؤيته أو إدارته.</p></div><button disabled={selectedRole?.key === "admin" || busy === "permissions"} onClick={() => request("PATCH", { type: "role-permissions", roleId: selectedRoleId, permissionIds: selectedPermissions }, "permissions")} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white disabled:bg-slate-300">{busy === "permissions" ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}حفظ الصلاحيات</button></div>
          {selectedRole?.key === "admin" && <p className="my-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">صلاحيات مدير النظام كاملة وثابتة لحماية إدارة المنظومة.</p>}
          <div className="mt-5 grid gap-3 md:grid-cols-2">{grouped.map(([module, items]) => <article key={module} className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-extrabold text-slate-800">{moduleNames[module] ?? module}</h3><div className="space-y-2">{items?.map((permission) => { const locked = permission.key === "accounts.manage" && selectedRole?.key !== "admin"; return <label key={permission.id} className={`flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-semibold ${locked ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"}`}><input type="checkbox" disabled={selectedRole?.key === "admin" || locked} checked={selectedRole?.key === "admin" || (!locked && selectedPermissions.includes(permission.id))} onChange={(event) => setSelectedPermissions((current) => event.target.checked ? [...current, permission.id] : current.filter((id) => id !== permission.id))} className="size-4 accent-blue-600" />{permission.name}{locked && <span className="text-[10px]">مدير النظام فقط</span>}<code dir="ltr" className="mr-auto text-[10px] text-slate-400">{permission.key}</code></label>; })}</div></article>)}</div>
        </section>
      </div>}
    </div>
  );
}
