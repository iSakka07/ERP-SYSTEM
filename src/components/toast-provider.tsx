"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPToast, type ERPToastTone } from "@/components/erp-toast";

type ToastInput = { message: string; tone?: ERPToastTone; duration?: number };
type ToastContextValue = { notify: (message: string, tone?: ERPToastTone, duration?: number) => void };
const ToastContext = createContext<ToastContextValue | null>(null);
const toastEvent = "erp:toast";

export function notifyToast(message: string, tone: ERPToastTone = "info", duration = 6000) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ToastInput>(toastEvent, { detail: { message, tone, duration } }));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(ToastInput & { id: number })[]>([]);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const notify = useCallback((message: string, tone: ERPToastTone = "info", duration = 6000) => {
    setToasts((current) => {
      if (current.some((toast) => toast.message === message && toast.tone === tone)) return current;
      return [...current.slice(-2), { id: Date.now() + Math.random(), message, tone, duration }];
    });
  }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const toast = (event as CustomEvent<ToastInput>).detail;
      if (toast?.message) notify(toast.message, toast.tone, toast.duration);
    };
    window.addEventListener(toastEvent, listener);
    return () => window.removeEventListener(toastEvent, listener);
  }, [notify]);
  const value = useMemo(() => ({ notify }), [notify]);
  return <ToastContext.Provider value={value}>
    {children}
    <div className="pointer-events-none fixed left-4 top-20 z-[100] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => <ERPToast key={toast.id} message={toast.message} tone={toast.tone} duration={toast.duration} onClose={() => dismiss(toast.id)} />)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
