import type { Metadata } from "next";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { ConfirmProvider } from "@/components/confirm-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "ASGC ERP | السلامة جروب",
  description: "منظومة السلامة جروب لإدارة المشروعات والمقاولات",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <ToastProvider><ConfirmProvider><NavigationFeedback />{children}</ConfirmProvider></ToastProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
