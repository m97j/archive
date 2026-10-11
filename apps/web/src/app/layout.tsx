import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: { default: "Archive", template: "%s · Archive" },
  description: "A multilingual archive of research, projects, documents, and working notes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
