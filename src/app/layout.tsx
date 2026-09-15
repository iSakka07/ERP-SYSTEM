import type { Metadata } from "next";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP-SYSTEM V1",
  description: "منظومة متكاملة لإدارة شركة المقاولات",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        {children}
      </body>
    </html>
  );
}
