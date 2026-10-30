import Landing from "@/components/science/landing";
import { redirect } from "next/navigation";
import { workspaceReturnTo, workspaceViews } from "@/lib/workspace-navigation";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (
    typeof params.view === "string" &&
    params.view !== "overview" &&
    workspaceViews.some((view) => view === params.view)
  )
    redirect(workspaceReturnTo(`/workspace?view=${params.view}`));
  return <Landing />;
}
