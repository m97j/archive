import { redirect } from "next/navigation";

import { defaultLocale } from "@/lib/routing";

export default function LoginEntryPage() {
  redirect(`/${defaultLocale()}/admin/login`);
}
