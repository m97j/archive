import type { Metadata } from "next";
import { sans, koreanSans } from "@/lib/fonts";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "marchivej. Studio", template: "%s · marchivej. Studio" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.png" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${sans.variable} ${koreanSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
