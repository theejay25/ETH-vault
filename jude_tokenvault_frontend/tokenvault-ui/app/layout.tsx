import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = { title: "TokenVault", description: "Time-locked ETH vault" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers(); // opts into dynamic rendering so the CSP nonce is applied per request
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
