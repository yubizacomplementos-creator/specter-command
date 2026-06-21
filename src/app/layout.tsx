import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Specter Command",
  description: "Centro de comando SaaS multiempresa, modular y configurable."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
