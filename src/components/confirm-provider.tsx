"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ConfirmOptions = { title?: string; description: string; confirmLabel?: string; tone?: "danger" | "warning" | "primary" };
type ConfirmContextValue = { confirm: (options: ConfirmOptions) => Promise<boolean> };
const ConfirmContext = createContext<ConfirmContextValue | null>(null);
const confirmEvent = "erp:confirm";

export function confirmAction(options: ConfirmOptions) {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => window.dispatchEvent(new CustomEvent(confirmEvent, { detail: { options, resolve } })));
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setDialog(options);
  }), []);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ options: ConfirmOptions; resolve: (value: boolean) => void }>).detail;
      confirm(detail.options).then(detail.resolve);
    };
    window.addEventListener(confirmEvent, listener);
    return () => window.removeEventListener(confirmEvent, listener);
  }, [confirm]);
  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  };
  return <ConfirmContext.Provider value={{ confirm }}>
    {children}
    {dialog && <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="erp-confirm-title" aria-describedby="erp-confirm-description" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 id="erp-confirm-title" className="text-lg font-black text-slate-950">{dialog.title ?? "تأكيد الإجراء"}</h2>
        <p id="erp-confirm-description" className="mt-3 text-sm leading-7 text-slate-600">{dialog.description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button autoFocus type="button" onClick={() => finish(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">إلغاء</button>
          <button type="button" onClick={() => finish(true)} className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${dialog.tone === "danger" ? "bg-red-600 hover:bg-red-700" : dialog.tone === "warning" ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-700 hover:bg-blue-800"}`}>{dialog.confirmLabel ?? "متابعة"}</button>
        </div>
      </section>
    </div>}
  </ConfirmContext.Provider>;
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside ConfirmProvider");
  return context.confirm;
}
