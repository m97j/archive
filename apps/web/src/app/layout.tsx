import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { displaySerif, koreanSans, sans } from "@/lib/fonts";

import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: { default: "Marchivej", template: "%s · Marchivej" },
  description: "A multilingual archive of research, projects, documents, and working notes.",
  icons: { icon: [{ url: "/favicon.png", type: "image/png", sizes: "474x474" }] },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${sans.variable} ${koreanSans.variable} ${displaySerif.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
