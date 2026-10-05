"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
    <h1 className="text-xl font-black text-slate-950">تعذر تحميل الصفحة</h1>
    <p className="mt-2 text-sm text-slate-600">حدث خطأ مؤقت. بياناتك لم تُحذف، ويمكنك إعادة المحاولة.</p>
    <button type="button" onClick={reset} className="mt-5 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">إعادة المحاولة</button>
  </section>;
}
