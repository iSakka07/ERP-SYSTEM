"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationFeedback() {
  const pathname = usePathname();
  const [pendingTarget, setPendingTarget] = useState("");
  const currentTarget = pathname;
  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.download || anchor.origin !== window.location.origin) return;
      const target = anchor.pathname;
      if (target !== window.location.pathname) setPendingTarget(target);
    };
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, []);

  return pendingTarget && pendingTarget !== currentTarget ? <div className="fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-blue-100" role="status" aria-label="جارٍ فتح الصفحة"><div className="h-full w-1/2 animate-pulse bg-blue-600" /></div> : null;
}
