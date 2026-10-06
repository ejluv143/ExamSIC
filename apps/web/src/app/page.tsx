import { redirect } from "next/navigation";

// No public landing page yet; send everyone to the teacher dashboard.
export default function Home() {
  redirect("/teacher");
}
