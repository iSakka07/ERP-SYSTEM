"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ERPToastTone = "success" | "error" | "warning" | "info";

export function ERPToast({ message, tone = "info", onClose, duration = 6000 }: {
  message: string;
  tone?: ERPToastTone;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onClose]);

  const styles = {
    success: "border-emerald-200 bg-emerald-600 text-white",
    error: "border-red-200 bg-red-600 text-white",
    warning: "border-amber-200 bg-amber-500 text-slate-950",
    info: "border-blue-200 bg-blue-700 text-white",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;

  return (
    <div role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <div className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl ${styles}`}>
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-bold leading-6">{message}</p>
        <button type="button" onClick={onClose} className="rounded-lg p-1 opacity-80 transition hover:bg-white/15 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="إغلاق الرسالة">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
