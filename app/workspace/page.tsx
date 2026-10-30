import type { Metadata } from "next";
import { backendURL, researchUser } from "@/lib/science/server";
import {redirect} from "next/navigation";
import ObservatoryWorkspace from "@/components/observatory-workspace";
import { workspaceReturnTo } from "@/lib/workspace-navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Workspace — AI-Based Cloud Removal and Reconstruction", robots: {index: false, follow: false} };

async function SignedInWorkspace({ returnTo }: { returnTo: string }) {
  const user = await researchUser();
  if(!user)redirect("/login?return_to="+encodeURIComponent(returnTo));
  return <ObservatoryWorkspace profile={{name: user.name, email: user.email}} personalMode={!backendURL()}/>;
}

export default async function Workspace({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = workspaceReturnTo(`/workspace?view=${typeof params.view === "string" ? encodeURIComponent(params.view) : "overview"}`);
  return <SignedInWorkspace returnTo={returnTo}/>;
}
