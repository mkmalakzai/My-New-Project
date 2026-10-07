import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFGlion",
  description: "AFGlion Telegram Mini App",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
