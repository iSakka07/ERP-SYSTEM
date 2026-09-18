export function AccountingGoLive({ value }: { value: string | null; canManage: boolean }) {
  if (value) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">المحاسبة مفعّلة من {value}. لا تُرحّل المستندات السابقة تلقائيًا؛ تُعالج عند البدء بالأرصدة الافتتاحية.</div>;
  return <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950"><b>التشغيل الحالي:</b> الترحيل الآلي يعمل مباشرة مع الاعتماد والصرف. عند إطلاق النظام رسميًا نحدد تاريخ تشغيل وأرصدة افتتاحية، ثم نستخدم استيرادًا جماعيًا منفصلًا للبيانات التاريخية.</div>;
}
