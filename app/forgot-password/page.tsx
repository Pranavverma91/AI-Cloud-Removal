import AuthForm from "@/components/science/auth-form";
import { backendURL, researchUser } from "@/lib/science/server";
import { personalReturnTo } from "@/lib/workspace-navigation";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const returnTo = typeof p.return_to === "string" ? p.return_to : undefined;
  if (!backendURL() || (await researchUser())) redirect(personalReturnTo(returnTo));
  return (
    <AuthForm
      mode="forgot"
      token={typeof p.token === "string" ? p.token : undefined}
      returnTo={returnTo}
    />
  );
}
