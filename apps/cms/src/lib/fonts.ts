import localFont from "next/font/local";

export const sans = localFont({
  src: "../fonts/Manrope-Variable.ttf",
  variable: "--font-sans",
  weight: "200 800",
  display: "swap",
  fallback: ["Arial"],
});

export const koreanSans = localFont({
  src: "../fonts/PretendardVariable.woff2",
  variable: "--font-korean",
  weight: "45 920",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const displaySerif = localFont({
  src: "../fonts/InstrumentSerif-Italic.ttf",
  variable: "--font-display",
  weight: "400",
  style: "italic",
  display: "swap",
  preload: false,
  fallback: ["Georgia"],
});
