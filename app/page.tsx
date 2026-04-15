import { redirect } from "next/navigation";
import { convexAuthNextjsToken, isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";

export default async function Home() {
  const authed = await isAuthenticatedNextjs();
  if (authed) {
    redirect("/dashboard");
  }
  redirect("/login");
}
