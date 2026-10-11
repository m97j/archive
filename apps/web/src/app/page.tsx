import { LOCALES } from "@archive/contracts";
import { redirect } from "next/navigation";

export default function RootPage() {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  const locale = LOCALES.find((candidate) => candidate === configured) ?? "ko";
  redirect(`/${locale}`);
}
