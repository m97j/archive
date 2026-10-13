import { redirect } from "next/navigation";
import { defaultLocale } from "@/lib/routing";
export default function Home() {
  redirect(`/${defaultLocale()}/admin`);
}
