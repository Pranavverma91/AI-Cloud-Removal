import { redirect } from "next/navigation";
import { backendURL, researchUser } from "@/lib/science/server";
import Shell from "@/components/science/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await researchUser();
  if (!user) redirect("/login?return_to=/dashboard");
  return (
    <Shell name={user.name || "My workspace"} personalMode={!backendURL()}>
      {children}
    </Shell>
  );
}
