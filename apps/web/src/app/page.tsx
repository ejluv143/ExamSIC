import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/roles";

// No public landing page yet; send people to their home, or to sign in.
export default async function Home() {
  redirect(homeFor((await getCurrentUser()).role));
}
