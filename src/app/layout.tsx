import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SES案件管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
