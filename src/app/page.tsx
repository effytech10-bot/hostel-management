import { redirect } from "next/navigation";
import { homePathFor } from "@/server/auth/roles";
import { getSessionUser } from "@/server/auth/session";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homePathFor(user.role) : "/login");
}
