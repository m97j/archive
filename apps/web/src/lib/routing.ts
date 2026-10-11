import { LOCALES, SPACES, type Locale, type Space } from "@archive/contracts";
import { notFound } from "next/navigation";

export function requireLocale(value: string): Locale {
  if (!LOCALES.some((locale) => locale === value)) notFound();
  return value as Locale;
}

export function requireSpace(value: string): Space {
  const normalized = value.toUpperCase();
  if (!SPACES.some((space) => space === normalized)) notFound();
  return normalized as Space;
}

export const spaceLabel = (space: Space): string =>
  ({ ABOUT: "About", WORK: "Work", RESEARCH: "Research", DOCS: "Docs", LOGS: "Logs" })[space];
