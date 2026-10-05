export default function Loading() {
  return <div className="space-y-5" role="status" aria-label="جارٍ تحميل الصفحة">
    <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>
    <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    <span className="sr-only">جارٍ تحميل البيانات</span>
  </div>;
}
