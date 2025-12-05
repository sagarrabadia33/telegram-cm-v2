import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SyncProvider } from "./contexts/SyncContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Telegram CRM",
  description: "Multi-source messaging CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        <SyncProvider>
          {children}
        </SyncProvider>
      </body>
    </html>
  );
}
